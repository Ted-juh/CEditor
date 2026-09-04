/**
 * instrumentHost.js — UI state for the Hostage workspace.
 *
 * The native side is authoritative: every command answers with a full `instrumentHostState`
 * push and this store just renders the latest one. The pure pieces — payload normalization,
 * the instrument search filter, and the mock reducer that stands in for the backend when the
 * app runs in a plain browser — are exported for the node tests.
 *
 * Mock mode matters here the same way it does everywhere else in this app: `localhost:5173`
 * without the JUCE backend must still show a working workspace, so the mock reducer applies
 * the same commands to a local state instead of dropping them on the floor.
 */
import { writable, derived, get } from 'svelte/store';
import {
  isJuceAvailable,
  sendInstrumentHostCommand,
  onInstrumentHostState,
  onInstrumentHostScanProgress,
  onInstrumentHostError,
  onInstrumentHostAudioDevices,
  onInstrumentHostProject,
  onInstrumentHostBuildProgress,
  onInstrumentHostParameters,
  onInstrumentHostParamValues,
  onInstrumentHostLibrary,
  onInstrumentHostSupportBundle,
  onInstrumentHostLicenceReceipt,
  onInstrumentHostMidiActivity,
  onInstrumentHostSurface,
  onInstrumentHostSurfaceLayout,
  onInstrumentHostMidiLearn,
  onInstrumentHostParamLearn,
  onInstrumentHostArpStep,
  onInstrumentHostLfoActivity,
  onInstrumentHostEnvelopeActivity,
  onInstrumentHostMsegActivity,
  onInstrumentHostRandomModulatorActivity,
  onInstrumentHostChordLearn,
  onInstrumentHostHardwarePatchCapture,
  onInstrumentHostHardwarePatchSend,
  onInstrumentHostHardwarePatchPrompt,
  onInstrumentHostPatchCompare,
} from '../bridge/bridge.js';
import { stageCommandAllowed } from '../utils/stageLock.js';
import {
  RESPONSE_CURVES, normalizeResponseCurvePoints,
} from '../utils/responseCurve.js';

// Browser-preview entities must be just as addressable as native UUID-backed entities. The
// clock alone is not an identity source: two button presses, test commands, or linked actions
// can land in the same millisecond. Keep the readable timestamp, then disambiguate every mint
// with one session-wide monotonic serial.
let mockEntitySerial = 0;
const nextMockSuffix = () => `${Date.now()}-${++mockEntitySerial}`;
const nextMockId = (prefix) => `${prefix}-${nextMockSuffix()}`;

export const hostState = writable(emptyHostState());
export const hostScanLog = writable([]);
export const hostLastError = writable('');
export const hostAudioDevices = writable(emptyAudioDevices());
export const hostProject = writable(emptyHostProject());
export const hostBuild = writable(emptyHostBuild());
export const hostParameters = writable(emptyHostParameters());
export const hostLibrary = writable(emptyHostLibrary());
export const hostSupportBundle = writable(emptySupportBundle());
export const hostLicenceReceipt = writable('');
/** The latest MIDI message seen on any enabled input, with a monotonically increasing `seq`
 *  so the view can flash on every arrival even when two identical notes repeat. */
export const hostMidiActivity = writable({ device: '', text: '', cc: -1, note: -1, channel: 0, value: 0, seq: 0 });
// The CTRL49 hardware surface as the broker reports it: searching (no device), connecting,
// connected, heldElsewhere (another instance owns it), failed. Fail-safe like every other
// host store — a malformed payload lands on 'searching', never a crash.
export const hostSurface = writable({
  state: 'searching', detail: '', device: '', pageIndex: 0, activeSlot: 0, padBank: 0,
  movementSeq: 0, movingSlot: -1,
});

// MIDI learn: which slot is armed and listening right now. The bind itself lands in the
// state (each slot's midiCc/midiChannel); this store only tracks the transient arming.
export const hostMidiLearn = writable({ armed: false, pageId: '', slotId: '' });
/** Parameter learn: which slot is waiting for you to move something in the plug-in. */
export const hostParamLearn = writable({ armed: false, pageId: '', slotId: '', parameterId: '' });

// The arp playhead per part: partId -> live pattern step (-1 while idle). Fed by tiny
// change-driven events from the engine; the grid only lights the column it names.
export const hostArpStep = writable({});

// The chorder's capture: which part is listening and what it wants next (the target key,
// then the chord). Driven by instrumentHostChordLearn events; the map itself lands in the
// part's midiFx via the state.
export const hostChordLearn = writable({ armed: false, partId: '', stage: '', key: -1 });

// The one keyboard on screen has two jobs. `play`: a selectable span to audition with. `range`: all
// 128 keys with every part's key range drawn beneath, for setting a split by dragging — the
// same picture, grown, rather than a second keyboard somewhere else that never quite lined up
// with the first. Session state, not document state: which mode you are in is not a setting.
export const hostKeyboardMode = writable({ mode: 'play', partId: '' });
/** A part's colour on the keyboard and on its own row, by rack position — the same six the
    split lanes used, so a colour seen on a key is findable in the rack without a legend. */
export const partColor = (index) =>
  ['#3d81c4', '#4aa88c', '#b4854a', '#9a6bbf', '#c46a6a', '#6a94c4'][((index % 6) + 6) % 6];
export function showPartRange(partId) {
  hostKeyboardMode.set({ mode: 'range', partId: String(partId ?? '') });
  if (partId) focusRackPart(partId);
}
export function showKeyboardPlay() {
  hostKeyboardMode.set({ mode: 'play', partId: '' });
}

// Hardware total recall, in its three moments.
//
// Capturing: which part is listening and how much has arrived. The byte counter is the only
// evidence a person gets that the synth answered at all — a dump that never came looks
// exactly like a dump still coming.
export const hostPatchCapture = writable({ armed: false, partId: '', messages: 0, bytes: 0 });
// Sending: progress on the paced transmission, per part. Cleared as each one finishes, so
// an empty map means nothing is going out.
export const hostPatchSends = writable({});
// The question a session asks when it opens holding patches whose policy is "ask". Nothing
// has been transmitted at this point, and nothing will be until somebody says so.
export const hostPatchPrompt = writable([]);
// The last compare: where the part's patch and a library patch differ. null until asked.
export const hostPatchCompare = writable(null);

export function normalizePatchCompare(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const int = (v, d = 0) => (Number.isInteger(v) ? v : d);
  return {
    partId: String(payload.partId ?? ''),
    recordId: String(payload.recordId ?? ''),
    nameA: String(payload.nameA ?? ''),
    nameB: String(payload.nameB ?? ''),
    identical: payload.identical === true,
    messagesA: int(payload.messagesA), messagesB: int(payload.messagesB),
    bytesA: int(payload.bytesA), bytesB: int(payload.bytesB),
    totalDifferences: int(payload.totalDifferences),
    truncated: payload.truncated === true,
    differences: (Array.isArray(payload.differences) ? payload.differences : []).map((d) => ({
      message: int(d?.message), offset: int(d?.offset),
      before: int(d?.before, -1), after: int(d?.after, -1),
    })),
  };
}

/** What is currently being dragged, so the canvas can light up the legal targets. It has to be
    a store rather than the drag event's own payload: dataTransfer is deliberately unreadable
    during dragover — the moment when the answer is needed. Cleared on dragend, always. */
export const hostCanvasDrag = writable({ kind: '', id: '', label: '' });

/** The parameter being dragged onto the controller drawing, if any.

    A store rather than a dataTransfer payload for the same reason the canvas drag is one: a
    dragover handler cannot READ dataTransfer's data (the browser withholds it until the drop),
    so the only way to decide whether a target should light up is to have put the answer
    somewhere both ends can see. */
export const hostParamDrag = writable({ partId: '', parameterId: '', name: '' });

export function normalizeMidiLearn(payload) {
  return {
    armed: payload?.armed === true,
    pageId: String(payload?.pageId ?? ''),
    slotId: String(payload?.slotId ?? ''),
    // What bound, when something did: a controller, or a pad's note. -1 for the other.
    cc: Number.isInteger(payload?.cc) ? payload.cc : -1,
    note: Number.isInteger(payload?.note) ? payload.note : -1,
  };
}

export function normalizeHostSurface(payload) {
  const known = ['searching', 'heldElsewhere', 'connecting', 'connected', 'failed'];
  const state = String(payload?.state ?? '');
  return {
    state: known.includes(state) ? state : 'searching',
    detail: String(payload?.detail ?? ''),
    device: String(payload?.device ?? ''),
    pageIndex: Math.max(0, Math.min(3, Number(payload?.pageIndex ?? 0) || 0)),
    activeSlot: Math.max(0, Math.min(7, Number(payload?.activeSlot ?? 0) || 0)),
    padBank: Math.max(0, Math.min(3, Number(payload?.padBank ?? 0) || 0)),
    movementSeq: Math.max(0, Math.trunc(Number(payload?.movementSeq ?? 0) || 0)),
    movingSlot: Math.max(-1, Math.min(7, Math.trunc(Number(payload?.movingSlot ?? -1) || 0))),
  };
}

// --- the surface as a picture --------------------------------------------------------------------

export function emptySurfaceLayout() {
  return { displayName: '', vendor: '', aspect: 0, controls: [], regions: [],
           // The owner's own controller, when they described one: what to prefill the form
           // with, and whether a count is running.
           profileId: '', own: false, profiles: [], userSurface: '', userEncoders: 0, userFaders: 0, userPads: 0,
           learning: false, heard: 0 };
}

// The regions a person actually thinks in — "the encoders", "the pads", "the keys" — rather
// than sixty individual controls. Clicking one zooms the drawing to it; the back button
// returns to the whole instrument.
const SURFACE_REGIONS = [
  { id: 'encoders',  label: 'Encoders',  kinds: ['encoder'] },
  { id: 'pads',      label: 'Pads',      kinds: ['pad'] },
  { id: 'faders',    label: 'Faders',    kinds: ['fader'] },
  { id: 'buttons',   label: 'Buttons',   kinds: ['button'] },
  { id: 'keys',      label: 'Keys',      kinds: ['keys', 'wheel'] },
];

export function normalizeSurfaceLayout(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const controls = (Array.isArray(p.controls) ? p.controls : []).map((c) => ({
    controlId: String(c?.controlId ?? ''),
    kind: String(c?.kind ?? ''),
    label: String(c?.label ?? ''),
    x: Number(c?.x ?? 0),
    y: Number(c?.y ?? 0),
    w: Number(c?.w ?? 0),
    h: Number(c?.h ?? 0),
    // -1 is the honest answer for a control CEditor cannot reach, and the drawing has to keep
    // saying so rather than rounding it to 0 and implying "the first one".
    index: Number.isFinite(Number(c?.index)) ? Number(c.index) : -1,
  }));

  const regions = SURFACE_REGIONS
    .map((region) => {
      const members = controls.filter((c) => region.kinds.includes(c.kind));
      if (members.length === 0) return null;
      // The box that holds them, with a little air so a zoomed region does not sit against
      // the edges of its own frame.
      const pad = 0.015;
      const x = Math.max(0, Math.min(...members.map((c) => c.x)) - pad);
      const y = Math.max(0, Math.min(...members.map((c) => c.y)) - pad);
      const right = Math.min(1, Math.max(...members.map((c) => c.x + c.w)) + pad);
      const bottom = Math.min(1, Math.max(...members.map((c) => c.y + c.h)) + pad);
      return {
        id: region.id,
        label: region.label,
        count: members.length,
        addressable: members.filter((c) => c.index >= 0).length,
        x, y, w: right - x, h: bottom - y,
      };
    })
    .filter(Boolean);

  return {
    profileId: String(p.profileId ?? ''),
    displayName: String(p.displayName ?? ''),
    vendor: String(p.vendor ?? ''),
    aspect: Number(p.aspect ?? 0) || 0,
    controls,
    regions,
    // The owner's own controller, when they described one: enough to prefill the form and to
    // show a running count, without a second round trip for either.
    // Which drawing this is, and which others exist: the described one stands in for the
    // authored ones by default, and the picker in the panel is how you get the CTRL49's own
    // picture back without forgetting what you described.
    profileId: String(p?.profileId ?? ''),
    own: p?.own === true,
    profiles: (Array.isArray(p?.profiles) ? p.profiles : []).map((r) => ({
      profileId: String(r?.profileId ?? ''),
      displayName: String(r?.displayName ?? ''),
      vendor: String(r?.vendor ?? ''),
    })).filter((r) => r.profileId),
    userSurface: String(p.userSurface ?? ''),
    userEncoders: Number(p.userEncoders ?? 0),
    userFaders: Number(p.userFaders ?? 0),
    userPads: Number(p.userPads ?? 0),
    learning: p.learning === true,
    heard: Number(p.heard ?? 0),
  };
}

/** The control-page slot a physical control drives, or null for one the runtime cannot reach.

    One number joins the drawing to the assignments. A control page has eight slots; the
    profile gives its encoders index 0..7 (SurfaceProfile.cpp, "Ctrl49Reducer: encoderSlot
    0..7"), and the runtime addresses slot N with encoder N. Only encoders address slots
    today: a fader or a pad is drawn, labelled and inert, which is the truth about them rather
    than a gap in this function. */
export function surfaceControlSlot(page, control) {
  if (!page || !control) return null;
  const kind = String(control.kind ?? '');
  if (kind !== 'encoder' && kind !== 'fader' && kind !== 'pad') return null;
  const index = Number(control.index);
  if (!Number.isInteger(index) || index < 0) return null;
  // A slot says which physical control it rides. One that says nothing is from before slots
  // could — an encoder, at its place among the encoders — which is the join the drawing has
  // always used and must keep using for every page saved before faders and pads had slots.
  let legacyEncoders = 0;
  for (const slot of (Array.isArray(page.slots) ? page.slots : [])) {
    const slotKind = slot?.kind ?? 'encoder';
    const slotIndex = Number.isInteger(slot?.index) && slot.index >= 0
      ? slot.index : (slotKind === 'encoder' ? legacyEncoders++ : -1);
    if (slotKind === kind && slotIndex === index) return slot;
  }
  return null;
}

export const hostSurfaceLayout = writable(emptySurfaceLayout());

// The browser preview has no hardware and no native profile registry, so it gets a stand-in
// with the same SHAPE — a couple of controls of each kind, including one nobody can address —
// so the drawing, the regions and the "not mapped" wording are all exercisable off Windows.
export function mockSurfaceLayout() {
  const controls = [
    { controlId: 'display', kind: 'display', label: 'Screen', x: 0.46, y: 0.06, w: 0.13, h: 0.2, index: -1 },
    { controlId: 'fader-master', kind: 'fader', label: 'Master volume', x: 0.12, y: 0.09, w: 0.02, h: 0.18, index: -1 },
    { controlId: 'keys', kind: 'keys', label: '49 keys', x: 0.11, y: 0.51, w: 0.88, h: 0.46, index: -1 },
    { controlId: 'wheel-pitch', kind: 'wheel', label: 'Pitch', x: 0.02, y: 0.63, w: 0.03, h: 0.18, index: -1 },
  ];
  for (let i = 0; i < 8; i += 1) {
    controls.push({ controlId: `fader-${i + 1}`, kind: 'fader', label: `F${i + 1}`,
                    x: 0.174 + i * 0.0345, y: 0.09, w: 0.024, h: 0.18, index: -1 });
    controls.push({ controlId: `encoder-${i + 1}`, kind: 'encoder', label: `${i + 1}`,
                    x: 0.788 + (i % 4) * 0.044, y: 0.062 + Math.floor(i / 4) * 0.089,
                    w: 0.035, h: 0.08, index: i });
    controls.push({ controlId: `pad-${i + 1}`, kind: 'pad', label: `${i + 1}`,
                    x: 0.787 + (i % 4) * 0.044, y: i >= 4 ? 0.289 : 0.38,
                    w: 0.037, h: 0.08, index: i + 1 });
    controls.push({ controlId: `button-b${i + 1}`, kind: 'button', label: `B${i + 1}`,
                    x: 0.174 + i * 0.0345, y: 0.384, w: 0.024, h: 0.04, index: -1 });
  }
  return { profileId: 'akai-ctrl49', displayName: 'M-Audio CTRL49', vendor: 'M-Audio',
           aspect: 2.31, controls };
}

// --- §17.7: the support bundle ------------------------------------------------------------------

export function emptySupportBundle() {
  return { entries: [], includeStateBlobs: false, includeWorkerDumps: false,
           written: false, path: '' };
}

export function normalizeSupportBundle(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    entries: (Array.isArray(p.entries) ? p.entries : []).map((e) => ({
      name: String(e?.name ?? ''),
      description: String(e?.description ?? ''),
      sizeBytes: Number(e?.sizeBytes ?? 0),
      included: e?.included === true,
      note: String(e?.note ?? ''),
    })),
    includeStateBlobs: p.includeStateBlobs === true,
    includeWorkerDumps: p.includeWorkerDumps === true,
    // Absent means "this was a preview", which is not the same as a failed export — the panel
    // has to be able to tell them apart or it will report a file that does not exist.
    written: p.written === true,
    path: String(p.path ?? ''),
  };
}

// --- the Stage 4 library ------------------------------------------------------------------------

export function emptyHostLibrary() {
  return {
    records: [],
    counts: { total: 0, presets: 0, racks: 0, chains: 0, missing: 0 },
    paths: [],
    query: '',
    type: '',
  };
}

export function normalizeHostLibrary(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    records: (Array.isArray(p.records) ? p.records : []).map((r) => ({
      recordId: String(r?.recordId ?? ''),
      type: String(r?.type ?? ''),
      sourceType: String(r?.sourceType ?? ''),
      targetCeId: String(r?.targetCeId ?? ''),
      name: String(r?.name ?? ''),
      manufacturer: String(r?.manufacturer ?? ''),
      instrument: String(r?.instrument ?? ''),
      category: String(r?.category ?? ''),
      factory: r?.factory === true,
      missing: r?.missing === true,
      available: r?.available === true,
      reason: String(r?.reason ?? ''),
      favourite: r?.favourite === true,
      rating: Number(r?.rating ?? 0),
      notes: String(r?.notes ?? ''),
      tags: (Array.isArray(r?.tags) ? r.tags : []).map(String),
    })),
    counts: {
      total: Number(p.counts?.total ?? 0),
      presets: Number(p.counts?.presets ?? 0),
      racks: Number(p.counts?.racks ?? 0),
      chains: Number(p.counts?.chains ?? 0),
      missing: Number(p.counts?.missing ?? 0),
    },
    paths: (Array.isArray(p.paths) ? p.paths : []).map(String),
    query: String(p.query ?? ''),
    type: String(p.type ?? ''),
  };
}

export function mockHostLibrary(query = '', type = '') {
  const all = [
    { recordId: 'lib-1', type: 'preset', sourceType: 'vstpreset', name: 'Warm Pad',
      manufacturer: 'Mock Audio', instrument: 'Stage Keys', targetCeId: 'mock-keys',
      factory: true, available: true, favourite: true },
    { recordId: 'lib-2', type: 'preset', sourceType: 'userState', name: 'My Growl',
      manufacturer: 'Mock Audio', instrument: 'Stage Keys', targetCeId: 'mock-keys',
      available: true, tags: ['bass'] },
    { recordId: 'lib-3', type: 'preset', sourceType: 'vstpreset', name: 'Lost Lead',
      manufacturer: 'Someone', instrument: 'Uninstalled Synth', factory: true,
      available: false, reason: 'Requires Uninstalled Synth, which is not in the catalogue.' },
    { recordId: 'lib-4', type: 'rack', sourceType: 'rackCapture', name: 'Live Rig', available: true },
    { recordId: 'lib-5', type: 'chain', sourceType: 'chainCapture', name: 'Big Lead',
      manufacturer: 'Mock Audio', instrument: 'Analog One', available: true },
  ];
  const q = query.trim().toLowerCase();
  const records = all.filter((r) =>
    (!type || r.type === type)
    && (!q || r.name.toLowerCase().includes(q) || (r.instrument ?? '').toLowerCase().includes(q)
        || (r.manufacturer ?? '').toLowerCase().includes(q)));
  return normalizeHostLibrary({
    records,
    counts: { total: all.length, presets: 3, racks: 1, chains: 1, missing: 0 },
    paths: [],
    query,
    type,
  });
}

export function emptyHostProject() {
  return {
    productName: '',
    version: '',
    publisher: '',
    appId: '',
    includeStandalone: true,
    includeVst3: true,
  };
}

export function normalizeHostProject(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    productName: String(p.productName ?? ''),
    version: String(p.version ?? ''),
    publisher: String(p.publisher ?? ''),
    appId: String(p.appId ?? ''),
    includeStandalone: p.includeStandalone !== false,
    includeVst3: p.includeVst3 !== false,
  };
}

export function mockHostProject() {
  return normalizeHostProject({
    productName: 'My Instrument Rack',
    version: '1.0.0',
    publisher: '',
    appId: 'M0CK0000-0000-4000-8000-000000000000',
  });
}

export function emptyHostBuild() {
  return { running: false, done: false, ok: false, lines: [] };
}

// --- the Stage 2 parameter view -----------------------------------------------------------------

export function emptyHostParameters() {
  // `touched` is the parameter ids the user last reached for in the plug-in's OWN window,
  // newest first — the answer to a plug-in with five hundred parameters and a search box.
  return { partId: '', parameters: [], warnings: [], touched: [], favourites: [] };
}

export function normalizeHostParameters(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    partId: String(p.partId ?? ''),
    touched: (Array.isArray(p.touched) ? p.touched : []).map(String),
    favourites: (Array.isArray(p.favourites) ? p.favourites : []).map(String),
    parameters: (Array.isArray(p.parameters) ? p.parameters : []).map((d) => ({
      id: String(d?.id ?? ''),
      index: Number(d?.index ?? 0),
      name: String(d?.name ?? ''),
      label: String(d?.label ?? ''),
      group: String(d?.group ?? ''),
      value: Number(d?.value ?? 0),
      text: String(d?.text ?? ''),
      defaultValue: Number(d?.defaultValue ?? 0),
      numSteps: Number(d?.numSteps ?? 0),
      discrete: d?.discrete === true,
      valueTexts: (Array.isArray(d?.valueTexts) ? d.valueTexts : []).map(String),
      boolean: d?.boolean === true,
      automatable: d?.automatable !== false,
      meta: d?.meta === true,
    })),
    warnings: (Array.isArray(p.warnings) ? p.warnings : []).map(String),
  };
}

/** Which control a parameter deserves. The registry already classifies every parameter —
 *  rendering them all as one continuous slider is what made a three-value switch mostly
 *  dead travel. Booleans toggle; a labelled handful gets segments; a countable set gets a
 *  stepper that snaps exactly; only the genuinely continuous get the slider. */
export function parameterControlKind(parameter) {
  if (parameter?.boolean) return 'toggle';
  const steps = Number(parameter?.numSteps ?? 0);
  if (parameter?.discrete && steps >= 2) {
    if (steps <= 6 && (parameter.valueTexts?.length ?? 0) === steps) return 'segments';
    if (steps <= 64) return 'stepper';
  }
  return 'slider';
}

/** Registry rows folded into their plug-in-declared groups, order preserved. Ungrouped
 *  rows share one 'General' bucket so a collapsed list never hides orphans invisibly. */
/** The two short lists that go above the groups: the ones you pinned, and the ones you last
    reached for in the plug-in's own window.

    Both answer the same question — "the handful I actually use on this synth" — from opposite
    directions. Pinned is deliberate and permanent; recent is automatic and disposable. A
    parameter in both appears once, under Pinned, because a pin is the stronger statement and
    two copies of one row in a list about finding things is a joke.

    Order is the caller's, not this function's: favourites keep the order they were marked in,
    recents keep newest-first. Both are already meaningful and re-sorting would destroy them. */
export function parameterShortlist(parameters, favourites, touched) {
  const byId = new Map((Array.isArray(parameters) ? parameters : []).map((d) => [d.id, d]));
  const pinnedIds = (Array.isArray(favourites) ? favourites : []).filter((id) => byId.has(id));
  const pinned = pinnedIds.map((id) => byId.get(id));
  const seen = new Set(pinnedIds);
  const recent = (Array.isArray(touched) ? touched : [])
    .filter((id) => byId.has(id) && !seen.has(id))
    .map((id) => byId.get(id));
  return { pinned, recent };
}

export function groupParameters(parameters) {
  const groups = [];
  for (const parameter of Array.isArray(parameters) ? parameters : []) {
    const name = parameter.group || 'General';
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push((group = { name, parameters: [] }));
    group.parameters.push(parameter);
  }
  return groups;
}

/** Every parameterId of this target that some control slot, macro or modulation route drives — the
 *  "assigned" filter's ground truth, read from the same state the panels render. */
export function assignedParameterIds(state, targetId) {
  const ids = new Set();
  for (const page of state?.rack?.pages ?? [])
    for (const slot of page.slots)
      if (slot.assigned && slot.partId === targetId) ids.add(slot.parameterId);
  for (const macro of state?.rack?.macros ?? [])
    for (const target of macro.targets)
      if (target.targetId === targetId) ids.add(target.parameterId);
  for (const route of state?.rack?.modulationRoutes ?? [])
    if (route.targetId === targetId) ids.add(route.parameterId);
  return ids;
}

/** Applies one instrumentHostParamValues delta to the registry snapshot the view renders.
 *  A delta for a different part leaves the snapshot untouched — the native side speaks per
 *  part, and the view holds the focused part's registry only. */
export function applyParamValues(registry, payload) {
  if (!payload || String(payload.partId ?? '') !== registry.partId) return registry;
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const touched = Array.isArray(payload.touched) ? payload.touched.map(String) : registry.touched;
  // Favourites never travel on a value change; keeping the old list is the difference between
  // a shortlist that survives a knob move and one that empties every time you turn something.
  if (changes.length === 0) return { ...registry, touched };
  const byId = new Map(changes.map((c) => [String(c?.id ?? ''), c]));
  return {
    ...registry,
    touched,
    parameters: registry.parameters.map((d) => {
      const change = byId.get(d.id);
      return change
        ? { ...d, value: Number(change.value ?? d.value), text: String(change.text ?? d.text) }
        : d;
    }),
  };
}

/** How well `query` matches `text`, or -1 for no match at all.

    Subsequence rather than substring, because the names in a five-hundred-parameter plug-in
    are long and compound: "Filter 1 Cutoff" answers to "cut" under either rule, but only this
    one answers to "f1cut" or "fcut", which is what somebody actually types when they know
    what they want and not what the vendor called it.

    The score exists so the ranking is defensible rather than incidental. A match that starts
    at a word beats one buried mid-word ("Cutoff" over "Sub Cutoff Trim"), a tight run of
    characters beats a scattered one, and a shorter name beats a longer one when all else is
    equal — which is how a person reads a list of candidates. */
export function fuzzyScore(text, query) {
  const haystack = String(text ?? '').toLowerCase();
  const needle = String(query ?? '').toLowerCase();
  if (!needle) return 0;
  if (!haystack) return -1;

  let score = 0;
  let at = 0;
  let previous = -2;

  for (const character of needle) {
    const found = haystack.indexOf(character, at);
    if (found < 0) return -1;

    // A word start is what the eye looks for, so it is worth the most.
    const isWordStart = found === 0 || /[\s\-_/.()]/.test(haystack[found - 1]);
    if (isWordStart) score += 8;
    // Consecutive characters mean the query is really a fragment of this name.
    if (found === previous + 1) score += 5;
    else score += 1;

    previous = found;
    at = found + 1;
  }

  // Shorter names win ties: "Cutoff" before "Cutoff Modulation Depth" for the query "cut".
  return score - Math.min(haystack.length, 40) / 40;
}

/** The parameters matching `query`, best first. An empty query keeps the plug-in's own
    order, which is the order its groups were authored in and the only one that means
    anything before somebody has typed. */
export function filterParameters(parameters, query) {
  const list = Array.isArray(parameters) ? parameters : [];
  const q = String(query ?? '').trim();
  if (!q) return list;

  return list
    .map((d) => {
      // The name is what people search; the group and the id are fallbacks for when they
      // remember where it lived or what the plug-in calls it, and they score lower so a name
      // match is never buried under them.
      const best = Math.max(fuzzyScore(d.name, q),
                            fuzzyScore(d.group, q) - 4,
                            fuzzyScore(d.id, q) - 6);
      return { d, best };
    })
    .filter((entry) => entry.best >= 0)
    .sort((a, b) => b.best - a.best)
    .map((entry) => entry.d);
}

const MOCK_WAVES = ['Saw', 'Square', 'Sine'];
const mockParamText = (d, value) => {
  if (d.id === 'wave') return MOCK_WAVES[Math.min(2, Math.round(value * 2))];
  if (d.boolean) return value >= 0.5 ? 'On' : 'Off';
  return value.toFixed(2);
};

export function mockHostParameters(partId) {
  return normalizeHostParameters({
    partId,
    parameters: [
      { id: 'cutoff', index: 0, name: 'Cutoff', group: 'Filter', value: 0.5, text: '0.50', defaultValue: 0.5 },
      { id: 'wave', index: 1, name: 'Wave', group: 'Oscillator', value: 0, text: 'Saw', defaultValue: 0, numSteps: 3, discrete: true, valueTexts: ['Saw', 'Square', 'Sine'] },
      { id: 'drive', index: 2, name: 'Drive', value: 0, text: 'Off', defaultValue: 0, numSteps: 2, discrete: true, boolean: true },
    ],
  });
}

/** Folds one instrumentHostBuildProgress event into the build store's value. */
export function applyBuildProgress(build, payload) {
  const line = String(payload?.line ?? '');
  const lines = line ? [...build.lines.slice(-199), line] : build.lines;
  if (payload?.done === true)
    return { running: false, done: true, ok: payload?.ok === true, lines };
  return { running: true, done: false, ok: false, lines };
}

export function emptyAudioDevices() {
  return { outputs: [], current: '', midiInputs: [], midiOutputs: [], inputChannels: 0 };
}

export function normalizeAudioDevices(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    outputs: (Array.isArray(p.outputs) ? p.outputs : []).map(String),
    current: String(p.current ?? ''),
    midiInputs: (Array.isArray(p.midiInputs) ? p.midiInputs : []).map((m) => ({
      id: String(m?.id ?? ''),
      name: String(m?.name ?? ''),
      enabled: m?.enabled === true,
    })),
    midiOutputs: (Array.isArray(p.midiOutputs) ? p.midiOutputs : []).map((m) => ({
      id: String(m?.id ?? ''),
      name: String(m?.name ?? ''),
    })),
    inputChannels: Number(p.inputChannels ?? 0),
  };
}

export function mockAudioDevices() {
  return normalizeAudioDevices({
    outputs: ['Speakers (Mock Audio Device)', 'Headphones (Mock Audio Device)'],
    current: 'Speakers (Mock Audio Device)',
    midiInputs: [
      { id: 'mock-in-1', name: 'CTRL49 USB', enabled: true },
      { id: 'mock-in-2', name: 'Mock MIDI Keyboard', enabled: false },
    ],
    midiOutputs: [
      { id: 'mock-out-1', name: 'AN1x MIDI Out' },
      { id: 'mock-out-2', name: 'USB MIDI Interface' },
    ],
    inputChannels: 4,
  });
}

export function emptyHostState() {
  return {
    instruments: [],
    effectClasses: [],
    modules: [],
    scanPaths: [],
    scanning: false,
    stageLocked: false,
    editorOpenPartId: '',
    floatingEditorPartIds: [],
    audio: { enabled: false, running: false, deviceName: '', sampleRate: 0, bufferSize: 0,
             inputChannels: 0, cpu: 0, xruns: 0 },
    rack: { performanceId: '', focusedPartId: '', parts: [], masterEffects: [], returns: [], buses: [],
            macros: [], midiLfos: [], envelopes: [], msegs: [], randomModulators: [],
            layerGroups: [],
            modulationRoutes: [], pages: [], canvasPositions: [], masterLatencyMs: 0,
            microtuning: normalizeMicrotuning(),
            presetAudition: { enabled: false, phrase: 'chord', rootNote: 60,
                              velocity: 100, noteLengthMs: 360, gapMs: 90, playing: false },
            soundComparison: { active: false, partId: '', index: -1, count: 0,
                               recordId: '', name: '', originalRecordId: '',
                               originalName: 'Original sound', recordIds: [] } },
    performance: emptyPerformance(),
    product: emptyProduct(),
    reliability: emptyReliability(),
    licence: emptyLicence(),
  };
}

export function normalizeMicrotuning(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const degrees = (Array.isArray(source.degreesCents) ? source.degreesCents :
    Array.from({ length: 13 }, (_, degree) => degree * 100))
    .map(Number).filter(Number.isFinite);
  const validDegrees = degrees.length >= 2 && degrees.length <= 129 && degrees[0] === 0
    && degrees.every((degree, index) => degree >= 0 && degree <= 19200
      && (index === 0 || degree > degrees[index - 1]));
  const safeDegrees = validDegrees ? degrees : Array.from({ length: 13 }, (_, degree) => degree * 100);
  return {
    enabled: source.enabled === true && (!Array.isArray(source.degreesCents) || validDegrees),
    name: String(source.name ?? '12-tone equal temperament').slice(0, 80) || 'Untitled tuning',
    sourceName: String(source.sourceName ?? '').slice(0, 260),
    rootMidiNote: Math.max(0, Math.min(127, Math.round(Number(source.rootMidiNote ?? 60) || 0))),
    referenceMidiNote: Math.max(0, Math.min(127, Math.round(Number(source.referenceMidiNote ?? 69) || 0))),
    referenceFrequency: Math.max(1, Math.min(40000, Number(source.referenceFrequency ?? 440) || 440)),
    mtsDeviceId: Math.max(0, Math.min(127, Math.round(Number(source.mtsDeviceId ?? 127) || 0))),
    mtsProgram: Math.max(0, Math.min(127, Math.round(Number(source.mtsProgram ?? 0) || 0))),
    degreeCount: safeDegrees.length - 1,
    periodCents: safeDegrees[safeDegrees.length - 1],
    degreesCents: safeDegrees,
  };
}

/** Parse the exchange portion of Scala's .scl format for browser preview/tests. The native
 * parser remains authoritative in the app; this mirror makes the file workflow real in the
 * standalone browser rather than accepting any text and inventing a result. */
export function parseScalaTuning(text, sourceName = '') {
  const meaningful = String(text ?? '').split(/\r?\n/)
    .map((line) => line.split('!')[0].trim()).filter(Boolean);
  if (meaningful.length < 2) throw new Error('That Scala file has no description and degree count.');
  if (!/^\d+$/.test(meaningful[1]))
    throw new Error('The Scala degree count must be a whole number from 1 to 128.');
  const count = Number(meaningful[1]);
  if (count < 1 || count > 128)
    throw new Error('The Scala degree count must be a whole number from 1 to 128.');
  if (meaningful.length < count + 2)
    throw new Error('The Scala file ends before all of its declared degrees are present.');

  const degreesCents = [0];
  for (let index = 0; index < count; index += 1) {
    const token = meaningful[index + 2].replace(/\s/g, '');
    let cents;
    if (token.includes('/')) {
      const parts = token.split('/');
      const numerator = Number(parts[0]);
      const denominator = Number(parts[1]);
      if (parts.length !== 2 || !Number.isFinite(numerator) || numerator <= 0
          || !Number.isFinite(denominator) || denominator <= 0)
        throw new Error(`Scala degree ${index + 1} has an invalid ratio.`);
      cents = 1200 * Math.log2(numerator / denominator);
    } else if (token.includes('.')) {
      cents = Number(token);
    } else {
      const ratio = Number(token);
      cents = 1200 * Math.log2(ratio);
    }
    if (!Number.isFinite(cents) || cents <= degreesCents[degreesCents.length - 1] || cents > 19200)
      throw new Error('Scala degrees must rise strictly and remain within sixteen octaves.');
    degreesCents.push(cents);
  }

  return normalizeMicrotuning({
    enabled: true, name: meaningful[0], sourceName, degreesCents,
  });
}

/** The §19 "Trust" block: which edition is in force, the licence behind it, its seats, and —
 *  said out loud rather than inferred — that the application runs whatever the entitlement
 *  date says (§27). */
export function emptyLicence() {
  return {
    edition: 'free',
    editionLabel: 'Free',
    state: 'unlicensed',
    detail: '',
    licensee: '',
    orderId: '',
    updatesUntil: '',
    updatesIncluded: true,
    runnable: true,
    maxLoadedParts: 1,
    loadedParts: 0,
    seatsAllowed: 0,
    seatsUsed: 0,
    activatedHere: false,
    seats: [],
    features: [],
    neverGated: [],
  };
}

export function normalizeLicence(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};

  // An edition or state this build does not recognise reads as the safe one, exactly as the
  // native side reads it: a licence from a future build must leave the product usable rather
  // than showing a word the panel cannot explain.
  const editions = ['free', 'founder', 'core', 'pro'];
  const states = ['unlicensed', 'licensed', 'updatesExpired', 'sunsetUnlocked',
                  'wrongProduct', 'tampered'];

  return {
    edition: editions.includes(p.edition) ? p.edition : 'free',
    editionLabel: String(p.editionLabel ?? 'Free'),
    state: states.includes(p.state) ? p.state : 'unlicensed',
    detail: String(p.detail ?? ''),
    licensee: String(p.licensee ?? ''),
    orderId: String(p.orderId ?? ''),
    updatesUntil: String(p.updatesUntil ?? ''),
    updatesIncluded: p.updatesIncluded !== false,
    // Never read from the payload as a maybe: §27 forbids an entitlement from disabling the
    // application, so the panel treats anything but an explicit false as "it runs".
    runnable: p.runnable !== false,
    maxLoadedParts: Number(p.maxLoadedParts ?? 1),
    loadedParts: Number(p.loadedParts ?? 0),
    seatsAllowed: Number(p.seatsAllowed ?? 0),
    seatsUsed: Number(p.seatsUsed ?? 0),
    activatedHere: p.activatedHere === true,
    seats: (Array.isArray(p.seats) ? p.seats : []).map((s) => ({
      fingerprint: String(s?.fingerprint ?? ''),
      machineName: String(s?.machineName ?? ''),
      firstSeen: String(s?.firstSeen ?? ''),
      lastSeen: String(s?.lastSeen ?? ''),
      isThisMachine: s?.isThisMachine === true,
    })),
    features: (Array.isArray(p.features) ? p.features : []).map((f) => ({
      feature: String(f?.feature ?? ''),
      allowed: f?.allowed === true,
    })),
    neverGated: (Array.isArray(p.neverGated) ? p.neverGated : []).map(String),
  };
}

/** The §17 block: whether this install is healthy and, when it is not, what the product did
 *  about it rather than what it merely noticed. */
export function emptyReliability() {
  return {
    safeMode: { level: 'normal', suspects: [] },
    refusedThisRun: [],
    recovery: {
      interrupted: false, lastOperation: '', lastOperationDetail: '',
      preservedStateFile: '', hasLastKnownGood: false, lastKnownGoodAt: '',
    },
    damagedState: [],
    automaticFailover: {
      isolationAvailable: false, enabled: true, maxAttempts: 3, retryDelayMs: 500, events: [],
    },
  };
}

export function normalizeReliability(payload) {
  const r = payload && typeof payload === 'object' ? payload : {};
  const safe = r.safeMode && typeof r.safeMode === 'object' ? r.safeMode : {};
  const recovery = r.recovery && typeof r.recovery === 'object' ? r.recovery : {};
  const failover = r.automaticFailover && typeof r.automaticFailover === 'object'
    ? r.automaticFailover : {};

  // Anything unrecognised reads as normal, exactly as the native side reads it: a state file
  // from a future build must not leave the panel claiming a safe mode it cannot explain.
  const level = ['normal', 'skipSuspects', 'noThirdParty'].includes(safe.level)
    ? safe.level
    : 'normal';

  return {
    safeMode: {
      level,
      suspects: (Array.isArray(safe.suspects) ? safe.suspects : []).map((s) => ({
        modulePath: String(s?.modulePath ?? ''),
        name: String(s?.name ?? ''),
        reason: String(s?.reason ?? ''),
        incidents: Number(s?.incidents ?? 0),
      })),
    },
    refusedThisRun: (Array.isArray(r.refusedThisRun) ? r.refusedThisRun : []).map((f) => ({
      modulePath: String(f?.modulePath ?? ''),
      name: String(f?.name ?? ''),
      reason: String(f?.reason ?? ''),
    })),
    recovery: {
      interrupted: recovery.interrupted === true,
      lastOperation: String(recovery.lastOperation ?? ''),
      lastOperationDetail: String(recovery.lastOperationDetail ?? ''),
      preservedStateFile: String(recovery.preservedStateFile ?? ''),
      hasLastKnownGood: recovery.hasLastKnownGood === true,
      lastKnownGoodAt: String(recovery.lastKnownGoodAt ?? ''),
    },
    damagedState: (Array.isArray(r.damagedState) ? r.damagedState : []).map(String),
    automaticFailover: {
      isolationAvailable: failover.isolationAvailable === true,
      enabled: failover.enabled !== false,
      maxAttempts: Math.max(1, Math.min(5, Math.round(Number(failover.maxAttempts ?? 3) || 3))),
      retryDelayMs: Math.max(100, Math.min(10000,
        Math.round(Number(failover.retryDelayMs ?? 500) || 500))),
      events: (Array.isArray(failover.events) ? failover.events : []).map((event) => ({
        targetId: String(event?.targetId ?? ''),
        name: String(event?.name ?? ''),
        effect: event?.effect === true,
        state: ['waiting', 'loading', 'recovered', 'failed', 'bypassed'].includes(event?.state)
          ? event.state : 'failed',
        attempts: Math.max(0, Math.round(Number(event?.attempts ?? 0) || 0)),
        error: String(event?.error ?? ''),
        nextAttemptMs: Math.max(0, Number(event?.nextAttemptMs ?? 0) || 0),
      })).filter((event) => event.targetId),
    },
  };
}

/** The Stage 7 block: what the DAW sees of this instance, what a restore could not resolve,
 *  whether this platform is actually supported, who owns the hardware, and the crash evidence
 *  §18.9.8 asks for before anyone builds active isolation. */
export function emptyProduct() {
  return {
    daw: {
      hostSync: false, followingHost: false, offlineRender: false,
      latencySamples: 0, tailSeconds: 0, outputPairs: 1, masterLevel: 1,
      exposedMacros: [],
    },
    restore: { degraded: false, missingInstruments: [], missingEffects: [], notes: [] },
    platform: { name: '', supported: true, rows: [] },
    hardware: { owner: 'nobody', owned: false },
    activeHostingIncidents: [],
    surfaceProfiles: [],
  };
}

export function normalizeProduct(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const daw = p.daw && typeof p.daw === 'object' ? p.daw : {};
  const restore = p.restore && typeof p.restore === 'object' ? p.restore : {};
  const platform = p.platform && typeof p.platform === 'object' ? p.platform : {};
  const hardware = p.hardware && typeof p.hardware === 'object' ? p.hardware : {};

  return {
    daw: {
      hostSync: daw.hostSync === true,
      followingHost: daw.followingHost === true,
      offlineRender: daw.offlineRender === true,
      latencySamples: Number(daw.latencySamples ?? 0),
      tailSeconds: Number(daw.tailSeconds ?? 0),
      outputPairs: Number(daw.outputPairs ?? 1),
      masterLevel: Number(daw.masterLevel ?? 1),
      exposedMacros: (Array.isArray(daw.exposedMacros) ? daw.exposedMacros : []).map((m) => ({
        index: Number(m?.index ?? 0),
        name: String(m?.name ?? ''),
        value: Number(m?.value ?? 0),
        bound: m?.bound === true,
      })),
    },
    restore: {
      degraded: restore.degraded === true,
      missingInstruments: (Array.isArray(restore.missingInstruments) ? restore.missingInstruments : []).map(String),
      missingEffects: (Array.isArray(restore.missingEffects) ? restore.missingEffects : []).map(String),
      notes: (Array.isArray(restore.notes) ? restore.notes : []).map(String),
    },
    platform: {
      name: String(platform.name ?? ''),
      supported: platform.supported !== false,
      rows: (Array.isArray(platform.rows) ? platform.rows : []).map((r) => ({
        id: String(r?.id ?? ''),
        description: String(r?.description ?? ''),
        required: r?.required === true,
        present: r?.present === true,
        detail: String(r?.detail ?? ''),
      })),
    },
    hardware: {
      owner: String(hardware.owner ?? 'nobody'),
      owned: hardware.owned === true,
    },
    activeHostingIncidents: (Array.isArray(p.activeHostingIncidents) ? p.activeHostingIncidents : [])
      .map((i) => ({
        modulePath: String(i?.modulePath ?? ''),
        name: String(i?.name ?? ''),
        count: Number(i?.count ?? 0),
      })),
    surfaceProfiles: (Array.isArray(p.surfaceProfiles) ? p.surfaceProfiles : []).map(String),
  };
}

/** The Stage 6 half of the state: one transport, the patterns and clips over it, the scenes
 *  that recall whole rigs, the compact arranger that chains them, and the setlist that walks them. */
export function emptyPerformance() {
  return {
    transport: {
      playing: false, tempo: 120, numerator: 4, denominator: 4, positionPpq: 0,
      bar: 1, beat: 1, beatFraction: 0, externalClock: false, clockLost: false,
      defaultQuantize: 'bar',
    },
    grooves: [],
    patterns: [],
    clips: [],
    scenes: [],
    snapshotMorph: {
      active: false, sceneId: '', name: '', durationBeats: 0, progress: 0, targetCount: 0,
    },
    setlist: { items: [], currentIndex: -1, preloadAhead: 1, loadingIndex: -1, preloads: [] },
    arrangement: {
      items: [], loop: false, playing: false, currentIndex: -1, queuedIndex: -1,
      ending: false, progress: 0, bar: 0,
    },
    capture: {
      armed: false, clipId: '', laneId: '',
      historySeconds: 0, historyEvents: 0, historyHasNotes: false,
      historyCapacitySeconds: 120,
      lastPatternId: '', lastClipId: '', lastNoteCount: 0, lastStepCount: 0,
      lastSeconds: 0, lastTrimmed: false,
    },
    looper: {
      recording: false, overdubbing: false, targetClipId: '',
      elapsedSeconds: 0, maxLengthBeats: 128,
    },
    gestures: {
      recording: false, mode: 'new', targetClipId: '', pointCount: 0, targetCount: 0,
      elapsedSeconds: 0, truncated: false, maxPoints: 8192, lastClipId: '',
    },
    performanceTakes: [],
    performanceRecorder: {
      recording: false, name: '', elapsedSeconds: 0, midiEventCount: 0,
      actionCount: 0, truncated: false,
    },
    performanceReplay: {
      state: 'idle', takeId: '', name: '', progress: 0, degraded: false,
    },
    scales: [],
  };
}

const normalizeStep = (s) => ({
  active: s?.active === true,
  note: Number(s?.note ?? 60),
  velocity: Number(s?.velocity ?? 100),
  value: Number(s?.value ?? 0),
  gate: Number(s?.gate ?? 0.5),
  microtiming: Number(s?.microtiming ?? 0),
  probability: Number(s?.probability ?? 100),
  ratchets: Number(s?.ratchets ?? 1),
  tie: s?.tie === true,
  every: Number(s?.every ?? 1),
  offset: Number(s?.offset ?? 0),
  chordNotes: (Array.isArray(s?.chordNotes) ? s.chordNotes : []).map(Number),
});

export const factoryGrooveTemplates = [
  {
    grooveId: '@hostage-mpc54', name: 'MPC-style 54%', source: 'factory', stepsPerBeat: 4,
    timingOffsets: [0, .08, 0, .08, 0, .08, 0, .08, 0, .08, 0, .08, 0, .08, 0, .08],
    velocityMultipliers: [1.08, .94, 1, .92, 1.05, .94, .99, .92, 1.08, .94, 1, .92, 1.05, .94, .99, .92],
  },
  {
    grooveId: '@hostage-mpc62', name: 'MPC-style 62%', source: 'factory', stepsPerBeat: 4,
    timingOffsets: [0, .24, 0, .24, 0, .24, 0, .24, 0, .24, 0, .24, 0, .24, 0, .24],
    velocityMultipliers: [1.10, .90, 1.01, .88, 1.07, .91, .98, .88, 1.10, .90, 1.01, .88, 1.07, .91, .98, .88],
  },
  {
    grooveId: '@hostage-laidback', name: 'Laid-back pocket', source: 'factory', stepsPerBeat: 4,
    timingOffsets: [0, .05, -.02, .12, .01, .07, -.01, .10, 0, .06, -.03, .13, .02, .08, -.01, .11],
    velocityMultipliers: [1.12, .91, .98, .87, 1.07, .92, 1, .88, 1.10, .90, .97, .86, 1.06, .91, .99, .87],
  },
];

export const normalizeGrooveTemplate = (groove) => ({
  grooveId: String(groove?.grooveId ?? ''),
  name: String(groove?.name ?? 'Imported groove').trim().slice(0, 80) || 'Imported groove',
  source: groove?.source === 'factory' ? 'factory' : 'imported',
  stepsPerBeat: clampInt(groove?.stepsPerBeat, 1, 16, 4),
  timingOffsets: (Array.isArray(groove?.timingOffsets) ? groove.timingOffsets : [])
    .slice(0, 64).map((value) => clampNumber(value, -.5, .5, 0)),
  velocityMultipliers: (Array.isArray(groove?.velocityMultipliers)
    ? groove.velocityMultipliers : []).slice(0, 64)
    .map((value) => clampNumber(value, .25, 2, 1)),
});

/** Browser mirror of the native destructive apply: the resulting real step fields are the
 * playback truth and can be edited immediately after the groove is committed. */
export function applyGrooveToPattern(pattern, template, amount = 1, applyVelocity = true) {
  const target = pattern;
  const groove = normalizeGrooveTemplate(template);
  if (!target || groove.timingOffsets.length < 2) return target;
  const strength = clampNumber(amount, 0, 1, 1);
  for (const lane of target.lanes ?? []) {
    const laneRate = Math.max(1, Number(lane.stepsPerBeat) || 1);
    for (let index = 0; index < (lane.steps ?? []).length; index += 1) {
      const step = lane.steps[index];
      const grooveIndex = Math.round(index * groove.stepsPerBeat / laneRate)
        % groove.timingOffsets.length;
      step.microtiming = Math.max(-.5, Math.min(.5,
        groove.timingOffsets[grooveIndex] * laneRate / groove.stepsPerBeat * strength));
      const noteLane = ['note', 'chord', 'drum'].includes(lane.type);
      if (applyVelocity && noteLane && step.active && groove.velocityMultipliers.length) {
        const multiplier = groove.velocityMultipliers[grooveIndex % groove.velocityMultipliers.length];
        step.velocity = Math.max(1, Math.min(127,
          Math.round(step.velocity * (1 + (multiplier - 1) * strength))));
      }
    }
  }
  target.appliedGrooveId = groove.grooveId;
  target.appliedGrooveAmount = strength;
  return target;
}

const normalizeFollowAction = (clip) => {
  const action = String(clip?.followAction ?? '');
  if (['none', 'clip', 'next', 'random', 'stop'].includes(action)) return action;
  if (clip?.followClipId) return 'clip';
  return Number(clip?.followAfterLoops ?? 0) > 0 ? 'stop' : 'none';
};

const normalizeArp = (a) => ({
  enabled: a?.enabled === true,
  mode: String(a?.mode ?? 'up'),
  stepsPerBeat: Number(a?.stepsPerBeat ?? 4),
  gate: Number(a?.gate ?? 0.5),
  swing: Number(a?.swing ?? 0),
  octaves: Number(a?.octaves ?? 1),
  latch: a?.latch === true,
  constrainToScale: a?.constrainToScale === true,
  velocityPattern: (Array.isArray(a?.velocityPattern) ? a.velocityPattern : []).map(Number),
  degreePattern: (Array.isArray(a?.degreePattern) ? a.degreePattern : []).map(Number),
  patternSemitones: a?.patternSemitones === true,
});

// One MIDI insert. A slot carries both settings blocks and shows the one its type needs —
// the same shape the native side keeps, so the UI never has to guess which half is live.
export const midiSlotTypes = ['arp', 'transpose', 'scale', 'chord', 'velocity', 'fx',
                              'echo', 'strum', 'humanize', 'chance', 'length', 'latch', 'mpe',
                              'articulation'];

export const midiSlotLabels = {
  arp: 'Arpeggiator', transpose: 'Transpose', scale: 'Scale', chord: 'Chorder',
  velocity: 'Velocity / Expression', fx: 'Note shaping',
  echo: 'Echo', strum: 'Strum', humanize: 'Humanize', chance: 'Chance',
  length: 'Note length', latch: 'Latch', mpe: 'MPE Transformer',
  articulation: 'Articulation Manager',
};

export function normalizeMidiSlot(slot) {
  const type = String(slot?.type ?? '');
  return {
    slotId: String(slot?.slotId ?? ''),
    type: midiSlotTypes.includes(type) ? type : 'arp',
    bypassed: slot?.bypassed === true,
    arp: normalizeArp(slot?.arp),
    fx: normalizeMidiFx(slot?.fx),
    mod: normalizeNoteModule(slot?.mod),
  };
}

/** The later note modules' settings. Every default is transparent, which is the same rule the
    native side keeps: an inserted module must not change the sound by existing. */
const STRUM_PATTERNS = ['ascending', 'descending', 'alternate', 'outside in', 'inside out', 'random'];
const MPE_FORMATS = ['mpe', 'poly aftertouch', 'channel pressure', 'cc'];
const MPE_AXES = ['pressure', 'timbre', 'pitch bend'];
const MPE_COLLAPSE = ['latest', 'highest', 'average'];
const ARTICULATION_TYPES = ['keyswitch', 'program change', 'cc'];
const normalizeArticulations = (entries) => (Array.isArray(entries) ? entries : [])
  .slice(0, 32)
  .map((entry, index) => {
    const type = String(entry?.type ?? 'keyswitch');
    const triggerNote = clampInt(entry?.triggerNote, 0, 127, 24);
    return {
      articulationId: String(entry?.articulationId ?? '') || `articulation-${index + 1}`,
      name: (String(entry?.name ?? 'Articulation').trim() || 'Articulation').slice(0, 80),
      triggerNote,
      triggerChannel: clampInt(entry?.triggerChannel, 0, 16, 0),
      type: ARTICULATION_TYPES.includes(type) ? type : 'keyswitch',
      outputChannel: clampInt(entry?.outputChannel, 0, 16, 0),
      keyswitchNote: clampInt(entry?.keyswitchNote, 0, 127, triggerNote),
      keyswitchVelocity: clampInt(entry?.keyswitchVelocity, 1, 127, 100),
      program: clampInt(entry?.program, 0, 127, 0),
      bankMsb: clampInt(entry?.bankMsb, -1, 127, -1),
      bankLsb: clampInt(entry?.bankLsb, -1, 127, -1),
      controller: clampInt(entry?.controller, 0, 127, 0),
      controllerValue: clampInt(entry?.controllerValue, 0, 127, 127),
    };
  });
const normalizeNoteModule = (m) => {
  const legacyPattern = m?.strumDown === true ? 'descending' : 'ascending';
  const strumPattern = STRUM_PATTERNS.includes(String(m?.strumPattern ?? ''))
    ? String(m.strumPattern) : legacyPattern;
  return {
    echoRepeats: clampInt(m?.echoRepeats, 0, 8, 0),
    echoStepBeats: clampNumber(m?.echoStepBeats, 0.03125, 4, 0.5),
    echoFeedback: clampNumber(m?.echoFeedback, 0.1, 1, 0.7),
    echoTranspose: clampInt(m?.echoTranspose, -12, 12, 0),
    strumBeats: clampNumber(m?.strumBeats, 0, 1, 0),
    strumDown: strumPattern === 'descending',
    strumPattern,
    strumCurve: clampNumber(m?.strumCurve, -1, 1, 0),
    strumVelocityRamp: clampInt(m?.strumVelocityRamp, -64, 64, 0),
    humanizeTimingBeats: clampNumber(m?.humanizeTimingBeats, 0, 0.25, 0),
    humanizeVelocity: clampInt(m?.humanizeVelocity, 0, 64, 0),
    humanizeGatePercent: clampInt(m?.humanizeGatePercent, 0, 100, 0),
    humanizePreserveChords: m?.humanizePreserveChords === true,
    humanizeProtectBeats: m?.humanizeProtectBeats === true,
    chance: clampNumber(m?.chance, 0, 1, 1),
    lengthBeats: clampNumber(m?.lengthBeats, 0, 8, 0),
    legato: m?.legato === true,
    latchOn: m?.latchOn === true,
    mpeEnabled: m?.mpeEnabled === true,
    mpeInput: MPE_FORMATS.includes(String(m?.mpeInput)) ? String(m.mpeInput) : 'mpe',
    mpeOutput: MPE_FORMATS.includes(String(m?.mpeOutput)) ? String(m.mpeOutput) : 'poly aftertouch',
    mpeInputAxis: MPE_AXES.includes(String(m?.mpeInputAxis)) ? String(m.mpeInputAxis) : 'pressure',
    mpeOutputAxis: MPE_AXES.includes(String(m?.mpeOutputAxis)) ? String(m.mpeOutputAxis) : 'pressure',
    mpeInputCc: clampInt(m?.mpeInputCc, 0, 127, 74),
    mpeOutputCc: clampInt(m?.mpeOutputCc, 0, 127, 74),
    mpeOutputChannel: clampInt(m?.mpeOutputChannel, 1, 16, 1),
    mpeMemberFirst: Math.min(clampInt(m?.mpeMemberFirst, 1, 16, 2),
                             clampInt(m?.mpeMemberLast, 1, 16, 16)),
    mpeMemberLast: Math.max(clampInt(m?.mpeMemberFirst, 1, 16, 2),
                            clampInt(m?.mpeMemberLast, 1, 16, 16)),
    mpeCollapse: MPE_COLLAPSE.includes(String(m?.mpeCollapse)) ? String(m.mpeCollapse) : 'latest',
    articulationEnabled: m?.articulationEnabled === true,
    articulationMapName: String(m?.articulationMapName ?? '').trim().slice(0, 80),
    articulations: normalizeArticulations(m?.articulations),
  };
};

const clampInt = (value, low, high, fallback) =>
  (Number.isFinite(Number(value)) ? Math.min(high, Math.max(low, Math.round(Number(value)))) : fallback);
const clampNumber = (value, low, high, fallback) =>
  (Number.isFinite(Number(value)) ? Math.min(high, Math.max(low, Number(value))) : fallback);

/** Browser mirror of one articulation action. This is the preview/test vocabulary rather than
 *  raw MIDI bytes; order is significant, especially bank select before program change. */
export function buildArticulationMessages(entry, incomingChannel = 1) {
  const articulation = normalizeArticulations([entry])[0];
  if (!articulation) return [];
  const channel = articulation.outputChannel || clampInt(incomingChannel, 1, 16, 1);
  if (articulation.type === 'program change') {
    const messages = [];
    if (articulation.bankMsb >= 0)
      messages.push({ type: 'cc', channel, controller: 0, value: articulation.bankMsb });
    if (articulation.bankLsb >= 0)
      messages.push({ type: 'cc', channel, controller: 32, value: articulation.bankLsb });
    messages.push({ type: 'program change', channel, program: articulation.program });
    return messages;
  }
  if (articulation.type === 'cc')
    return [{ type: 'cc', channel, controller: articulation.controller,
              value: articulation.controllerValue }];
  return [
    { type: 'note on', channel, note: articulation.keyswitchNote,
      velocity: articulation.keyswitchVelocity },
    { type: 'note off', channel, note: articulation.keyswitchNote, velocity: 0 },
  ];
}

/** Pure browser mirror of a Strummer stroke. It returns notes in play order with their
    relative delay and velocity, so localhost and tests can exercise the same musical rules
    without pretending to run the native MIDI scheduler. */
export function buildStrumPlan(inputNotes, options = {}) {
  const notes = (Array.isArray(inputNotes) ? inputNotes : [])
    .slice(0, 16)
    .map((entry) => typeof entry === 'object'
      ? { note: clampInt(entry.note, 0, 127, 60), velocity: clampInt(entry.velocity, 1, 127, 100) }
      : { note: clampInt(entry, 0, 127, 60), velocity: 100 })
    .sort((a, b) => a.note - b.note);
  if (notes.length === 0) return [];

  let pattern = STRUM_PATTERNS.includes(options.pattern) ? options.pattern : 'ascending';
  if (pattern === 'alternate') pattern = options.alternateDown === true ? 'descending' : 'ascending';
  let order = Array.from({ length: notes.length }, (_, i) => i);
  if (pattern === 'descending') order.reverse();
  else if (pattern === 'outside in') {
    let low = 0;
    let high = notes.length - 1;
    order = order.map((_, i) => (i % 2 === 0 ? low++ : high--));
  } else if (pattern === 'inside out') {
    order = [];
    let low = Math.floor((notes.length - 1) / 2);
    let high = Math.floor(notes.length / 2);
    if (low === high) { order.push(low); low -= 1; high += 1; }
    while (order.length < notes.length) {
      if (low >= 0) order.push(low--);
      if (order.length < notes.length && high < notes.length) order.push(high++);
    }
  } else if (pattern === 'random') {
    let state = (clampInt(options.seed, 1, 0x7fffffff, 0x51f15e1d) >>> 0);
    const next = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return state >>> 0;
    };
    for (let i = order.length - 1; i > 0; i -= 1) {
      const other = next() % (i + 1);
      [order[i], order[other]] = [order[other], order[i]];
    }
  }

  const spread = clampNumber(options.spread, 0, 1, 0);
  const curve = clampNumber(options.curve, -1, 1, 0);
  const velocityRamp = clampInt(options.velocityRamp, -64, 64, 0);
  const exponent = curve >= 0 ? 1 + 3 * curve : 1 / (1 + 3 * -curve);
  return order.map((noteIndex, rank) => {
    const t = notes.length > 1 ? rank / (notes.length - 1) : 0;
    const position = Math.pow(t, exponent);
    return {
      note: notes[noteIndex].note,
      delayBeats: spread * position,
      velocity: clampInt(notes[noteIndex].velocity + Math.round(velocityRamp * position), 1, 127, 100),
    };
  });
}

const CHORD_VOICINGS = ['close', 'open', 'drop 2', 'wide'];

/** Browser-side mirror of the native Smart Chorder register rules. Besides making localhost
    previews truthful, keeping this pure lets the UI explain/test a voicing without running an
    audio graph. Defaults deliberately preserve the old note order. */
export function applySmartChordVoicing(inputNotes, options = {}) {
  const original = (Array.isArray(inputNotes) ? inputNotes : [])
    .slice(0, 6)
    .map((note) => clampInt(note, 0, 127, 60));
  if (original.length < 2) return original;

  const inversion = clampInt(options.inversion, 0, 3, 0);
  const voicing = CHORD_VOICINGS.includes(options.voicing) ? options.voicing : 'close';
  const voiceLeading = options.voiceLeading === true;
  const previous = (Array.isArray(options.previous) ? options.previous : [])
    .slice(0, 6)
    .map((note) => clampInt(note, 0, 127, 60))
    .sort((a, b) => a - b);

  if (inversion === 0 && voicing === 'close' && !voiceLeading)
    return original;

  let notes = [...original].sort((a, b) => a - b);
  for (let turn = 0; turn < inversion % notes.length; turn += 1)
    notes.push(notes.shift() + 12);

  if (voicing === 'open' && notes.length >= 3) notes[1] += 12;
  else if (voicing === 'drop 2' && notes.length >= 3) notes[notes.length - 2] -= 12;
  else if (voicing === 'wide') {
    notes[0] -= 12;
    notes[notes.length - 1] += 12;
  }
  notes.sort((a, b) => a - b);
  while (notes[0] < 0) notes = notes.map((note) => note + 12);
  while (notes.at(-1) > 127) notes = notes.map((note) => note - 12);
  notes = notes.map((note) => Math.min(127, Math.max(0, note)));

  if (!voiceLeading || previous.length === 0) return notes;

  let best = notes;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let rotation = 0; rotation < notes.length; rotation += 1) {
    const base = [];
    for (let i = 0; i < notes.length; i += 1) {
      let note = notes[(rotation + i) % notes.length];
      while (i > 0 && note <= base[i - 1]) note += 12;
      base.push(note);
    }
    for (let octave = -10; octave <= 10; octave += 1) {
      const candidate = base.map((note) => note + octave * 12);
      if (candidate[0] < 0 || candidate.at(-1) > 127) continue;
      const cost = candidate.reduce((sum, note, i) => {
        const previousIndex = candidate.length === 1 || previous.length === 1 ? 0
          : Math.round(i * (previous.length - 1) / (candidate.length - 1));
        return sum + Math.abs(note - previous[previousIndex]);
      }, 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
  }
  return best;
}

const orderedResponsePair = (a, b, low, high, fallbackA, fallbackB) => {
  const first = clampInt(a, low, high, fallbackA);
  const last = clampInt(b, low, high, fallbackB);
  return [Math.min(first, last), Math.max(first, last)];
};

const normalizeMidiFx = (f) => {
  const velocityInput = orderedResponsePair(
    f?.velocityInputMin, f?.velocityInputMax, 1, 127, 1, 127);
  const velocityOutput = orderedResponsePair(
    f?.velocityOutputMin, f?.velocityOutputMax, 1, 127, 1, 127);
  const expressionInput = orderedResponsePair(
    f?.expressionInputMin, f?.expressionInputMax, 0, 127, 0, 127);
  const expressionOutput = orderedResponsePair(
    f?.expressionOutputMin, f?.expressionOutputMax, 0, 127, 0, 127);
  const velocityCurve = RESPONSE_CURVES.includes(String(f?.velocityCurve))
    ? String(f.velocityCurve) : 'linear';
  const expressionCurve = RESPONSE_CURVES.includes(String(f?.expressionCurve))
    ? String(f.expressionCurve) : 'linear';
  const expressionSources = ['cc', 'channel pressure', 'poly aftertouch'];
  return {
    transpose: Number(f?.transpose ?? 0),
    transposeMode: f?.transposeMode === 'diatonic' ? 'diatonic' : 'chromatic',
    constrainToScale: f?.constrainToScale === true,
    scaleRoot: Number(f?.scaleRoot ?? 0),
    scaleType: String(f?.scaleType ?? 'major'),
    chord: String(f?.chord ?? 'off'),
    chordInversion: clampInt(f?.chordInversion, 0, 3, 0),
    chordVoicing: CHORD_VOICINGS.includes(String(f?.chordVoicing ?? 'close'))
      ? String(f?.chordVoicing ?? 'close') : 'close',
    chordVoiceLeading: f?.chordVoiceLeading === true,
    velocityFixed: clampInt(f?.velocityFixed, 0, 127, 0),
    velocityScale: clampNumber(f?.velocityScale, 0.1, 2, 1),
    responseProfileName: String(f?.responseProfileName ?? '').trim().slice(0, 80),
    velocityCurve,
    velocityInputMin: velocityInput[0],
    velocityInputMax: velocityInput[1],
    velocityOutputMin: velocityOutput[0],
    velocityOutputMax: velocityOutput[1],
    velocityCurveValues: normalizeResponseCurvePoints(f?.velocityCurveValues),
    expressionEnabled: f?.expressionEnabled === true,
    expressionSource: expressionSources.includes(String(f?.expressionSource))
      ? String(f.expressionSource) : 'cc',
    expressionCc: clampInt(f?.expressionCc, 0, 127, 11),
    expressionCurve,
    expressionInputMin: expressionInput[0],
    expressionInputMax: expressionInput[1],
    expressionOutputMin: expressionOutput[0],
    expressionOutputMax: expressionOutput[1],
    expressionCurveValues: normalizeResponseCurvePoints(f?.expressionCurveValues),
    keyChords: (Array.isArray(f?.keyChords) ? f.keyChords : []).map((kc) => ({
      key: Number(kc?.key ?? 60),
      offsets: (Array.isArray(kc?.offsets) ? kc.offsets : []).map(Number),
    })),
  };
};

export function normalizePerformance(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const t = p.transport && typeof p.transport === 'object' ? p.transport : {};
  const setlist = p.setlist && typeof p.setlist === 'object' ? p.setlist : {};
  const arrangement = p.arrangement && typeof p.arrangement === 'object' ? p.arrangement : {};
  const capture = p.capture && typeof p.capture === 'object' ? p.capture : {};
  const looper = p.looper && typeof p.looper === 'object' ? p.looper : {};
  const gestures = p.gestures && typeof p.gestures === 'object' ? p.gestures : {};
  const performanceRecorder = p.performanceRecorder
    && typeof p.performanceRecorder === 'object' ? p.performanceRecorder : {};
  const performanceReplay = p.performanceReplay
    && typeof p.performanceReplay === 'object' ? p.performanceReplay : {};
  const snapshotMorph = p.snapshotMorph && typeof p.snapshotMorph === 'object'
    ? p.snapshotMorph : {};

  return {
    transport: {
      playing: t.playing === true,
      tempo: Number(t.tempo ?? 120),
      numerator: Number(t.numerator ?? 4),
      denominator: Number(t.denominator ?? 4),
      positionPpq: Number(t.positionPpq ?? 0),
      bar: Number(t.bar ?? 1),
      beat: Number(t.beat ?? 1),
      beatFraction: Number(t.beatFraction ?? 0),
      externalClock: t.externalClock === true,
      clockLost: t.clockLost === true,
      defaultQuantize: String(t.defaultQuantize ?? 'bar'),
    },
    grooves: (Array.isArray(p.grooves) ? p.grooves : [])
      .map(normalizeGrooveTemplate).filter((groove) => groove.grooveId && groove.timingOffsets.length >= 2),
    patterns: (Array.isArray(p.patterns) ? p.patterns : []).map((pattern) => ({
      patternId: String(pattern?.patternId ?? ''),
      name: String(pattern?.name ?? ''),
      swing: Number(pattern?.swing ?? 0),
      seed: Math.max(1, Number(pattern?.seed ?? 1) || 1),
      lengthPpq: Number(pattern?.lengthPpq ?? 4),
      variationGroupId: String(pattern?.variationGroupId ?? ''),
      variationLabel: ['A', 'B', 'C', 'D'].includes(String(pattern?.variationLabel))
        ? String(pattern.variationLabel) : '',
      variationSourcePatternId: String(pattern?.variationSourcePatternId ?? ''),
      variationAmount: Math.max(0, Math.min(1, Number(pattern?.variationAmount ?? 0.55))),
      appliedGrooveId: String(pattern?.appliedGrooveId ?? ''),
      appliedGrooveAmount: Math.max(0, Math.min(1, Number(pattern?.appliedGrooveAmount ?? 0))),
      lanes: (Array.isArray(pattern?.lanes) ? pattern.lanes : []).map((lane) => ({
        laneId: String(lane?.laneId ?? ''),
        type: String(lane?.type ?? 'note'),
        name: String(lane?.name ?? ''),
        targetPartId: String(lane?.targetPartId ?? ''),
        targetId: String(lane?.targetId ?? ''),
        parameterId: String(lane?.parameterId ?? ''),
        targetName: String(lane?.targetName ?? ''),
        resolved: lane?.resolved === true,
        channel: Number(lane?.channel ?? 1),
        ccNumber: Number(lane?.ccNumber ?? 74),
        drumNote: Number(lane?.drumNote ?? 36),
        stepCount: Number(lane?.stepCount ?? 16),
        stepsPerBeat: Number(lane?.stepsPerBeat ?? 4),
        muted: lane?.muted === true,
        glide: lane?.glide === true,
        lockSourceLaneId: String(lane?.lockSourceLaneId ?? ''),
        euclidPulses: Number(lane?.euclidPulses ?? 0),
        steps: (Array.isArray(lane?.steps) ? lane.steps : []).map(normalizeStep),
      })),
    })),
    clips: (Array.isArray(p.clips) ? p.clips : []).map((c) => ({
      clipId: String(c?.clipId ?? ''),
      name: String(c?.name ?? ''),
      patternId: String(c?.patternId ?? ''),
      launchQuantize: String(c?.launchQuantize ?? 'bar'),
      loop: c?.loop !== false,
      followClipId: String(c?.followClipId ?? ''),
      followAfterLoops: Number(c?.followAfterLoops ?? 0),
      followAction: normalizeFollowAction(c),
      looperLayer: c?.looperLayer === true,
      overdubPasses: Number(c?.overdubPasses ?? 0),
      gestureClip: c?.gestureClip === true,
      gesturePasses: Number(c?.gesturePasses ?? 0),
      frozenMidi: c?.frozenMidi === true,
      frozenFromClipId: String(c?.frozenFromClipId ?? ''),
      frozenCycles: Math.max(1, Math.min(8, Number(c?.frozenCycles ?? 1))),
      frozenNoteCount: Math.max(0, Number(c?.frozenNoteCount ?? 0)),
      fillPatternId: String(c?.fillPatternId ?? ''),
      fillQuantize: String(c?.fillQuantize ?? 'beat'),
      fillCc: Math.max(-1, Math.min(127, Number(c?.fillCc ?? -1))),
      fillChannel: Math.max(0, Math.min(16, Number(c?.fillChannel ?? 0))),
      fillActive: c?.fillActive === true,
      fillPending: c?.fillPending === true,
      active: c?.active === true,
      pending: c?.pending === true,
      phase: Number(c?.phase ?? 0),
    })),
    scenes: (Array.isArray(p.scenes) ? p.scenes : []).map((s) => ({
      sceneId: String(s?.sceneId ?? ''),
      name: String(s?.name ?? ''),
      clipIds: (Array.isArray(s?.clipIds) ? s.clipIds : []).map(String),
      slots: (Array.isArray(s?.slots) ? s.slots : []).map((slot) => ({
        partId: String(slot?.partId ?? ''),
        enabled: slot?.enabled !== false,
        mute: slot?.mute === true,
        volume: Math.max(0, Math.min(2, Number(slot?.volume ?? 1))),
        applyVolume: slot?.applyVolume === true,
        pan: Math.max(-1, Math.min(1, Number(slot?.pan ?? 0))),
        applyPan: slot?.applyPan === true,
      })),
      macros: (Array.isArray(s?.macros) ? s.macros : []).map((macro) => ({
        macroId: String(macro?.macroId ?? ''),
        value: Math.max(0, Math.min(1, Number(macro?.value ?? 0))),
      })),
      parameters: (Array.isArray(s?.parameters) ? s.parameters : []).map((parameter) => ({
        targetId: String(parameter?.targetId ?? ''),
        targetCeId: String(parameter?.targetCeId ?? ''),
        parameterId: String(parameter?.parameterId ?? ''),
        value: Math.max(0, Math.min(1, Number(parameter?.value ?? 0))),
      })),
      focusPartId: String(s?.focusPartId ?? ''),
      pageId: String(s?.pageId ?? ''),
      launchQuantize: String(s?.launchQuantize ?? 'bar'),
      stopOtherClips: s?.stopOtherClips !== false,
      tempo: Number(s?.tempo ?? 0),
      morphBeats: Math.max(0, Math.min(32, Number(s?.morphBeats ?? 0))),
      numSlots: Number(s?.numSlots ?? (Array.isArray(s?.slots) ? s.slots.length : 0)),
      numMacros: Number(s?.numMacros ?? (Array.isArray(s?.macros) ? s.macros.length : 0)),
      numParameters: Number(s?.numParameters
        ?? (Array.isArray(s?.parameters) ? s.parameters.length : 0)),
    })),
    snapshotMorph: {
      active: snapshotMorph.active === true,
      sceneId: String(snapshotMorph.sceneId ?? ''),
      name: String(snapshotMorph.name ?? ''),
      durationBeats: Math.max(0, Math.min(32, Number(snapshotMorph.durationBeats ?? 0))),
      progress: Math.max(0, Math.min(1, Number(snapshotMorph.progress ?? 0))),
      targetCount: Math.max(0, Number(snapshotMorph.targetCount ?? 0)),
    },
    setlist: {
      items: (Array.isArray(setlist.items) ? setlist.items : []).map((i) => ({
        itemId: String(i?.itemId ?? ''),
        name: String(i?.name ?? ''),
        sceneId: String(i?.sceneId ?? ''),
        rackRecordId: String(i?.rackRecordId ?? ''),
        pageId: String(i?.pageId ?? ''),
        sceneName: String(i?.sceneName ?? ''),
        missing: i?.missing === true,
        notes: String(i?.notes ?? ''),
        tempo: Number(i?.tempo ?? 0),
      })),
      currentIndex: Number(setlist.currentIndex ?? -1),
      preloadAhead: Math.max(0, Math.min(2, Number(setlist.preloadAhead ?? 1))),
      loadingIndex: Number(setlist.loadingIndex ?? -1),
      preloads: (Array.isArray(setlist.preloads) ? setlist.preloads : []).map((preload) => ({
        recordId: String(preload?.recordId ?? ''),
        name: String(preload?.name ?? ''),
        state: String(preload?.state ?? 'loading'),
        total: Math.max(0, Number(preload?.total ?? 0)),
        ready: Math.max(0, Number(preload?.ready ?? 0)),
        failed: Math.max(0, Number(preload?.failed ?? 0)),
        error: String(preload?.error ?? ''),
      })),
    },
    arrangement: {
      items: (Array.isArray(arrangement.items) ? arrangement.items : []).map((i) => ({
        itemId: String(i?.itemId ?? ''),
        name: String(i?.name ?? ''),
        sceneId: String(i?.sceneId ?? ''),
        sceneName: String(i?.sceneName ?? ''),
        missing: i?.missing === true,
        bars: Math.max(1, Math.min(128, Number(i?.bars ?? 4))),
      })),
      loop: arrangement.loop === true,
      playing: arrangement.playing === true,
      currentIndex: Number(arrangement.currentIndex ?? -1),
      queuedIndex: Number(arrangement.queuedIndex ?? -1),
      ending: arrangement.ending === true,
      progress: Math.max(0, Math.min(1, Number(arrangement.progress ?? 0))),
      bar: Math.max(0, Number(arrangement.bar ?? 0)),
    },
    capture: {
      armed: capture.armed === true,
      clipId: String(capture.clipId ?? ''),
      laneId: String(capture.laneId ?? ''),
      historySeconds: Number(capture.historySeconds ?? 0),
      historyEvents: Number(capture.historyEvents ?? 0),
      historyHasNotes: capture.historyHasNotes === true,
      historyCapacitySeconds: Number(capture.historyCapacitySeconds ?? 120),
      lastPatternId: String(capture.lastPatternId ?? ''),
      lastClipId: String(capture.lastClipId ?? ''),
      lastNoteCount: Number(capture.lastNoteCount ?? 0),
      lastStepCount: Number(capture.lastStepCount ?? 0),
      lastSeconds: Number(capture.lastSeconds ?? 0),
      lastTrimmed: capture.lastTrimmed === true,
    },
    looper: {
      recording: looper.recording === true,
      overdubbing: looper.overdubbing === true,
      targetClipId: String(looper.targetClipId ?? ''),
      elapsedSeconds: Number(looper.elapsedSeconds ?? 0),
      maxLengthBeats: Number(looper.maxLengthBeats ?? 128),
    },
    gestures: {
      recording: gestures.recording === true,
      mode: ['new', 'overdub', 'replace'].includes(String(gestures.mode))
        ? String(gestures.mode) : 'new',
      targetClipId: String(gestures.targetClipId ?? ''),
      pointCount: Number(gestures.pointCount ?? 0),
      targetCount: Number(gestures.targetCount ?? 0),
      elapsedSeconds: Number(gestures.elapsedSeconds ?? 0),
      truncated: gestures.truncated === true,
      maxPoints: Number(gestures.maxPoints ?? 8192),
      lastClipId: String(gestures.lastClipId ?? ''),
    },
    performanceTakes: (Array.isArray(p.performanceTakes) ? p.performanceTakes : []).map((take) => ({
      takeId: String(take?.takeId ?? ''),
      name: String(take?.name ?? ''),
      createdAt: String(take?.createdAt ?? ''),
      durationSeconds: Math.max(0, Number(take?.durationSeconds ?? 0)),
      midiEventCount: Math.max(0, Number(take?.midiEventCount ?? 0)),
      actionCount: Math.max(0, Number(take?.actionCount ?? 0)),
      truncated: take?.truncated === true,
    })),
    performanceRecorder: {
      recording: performanceRecorder.recording === true,
      name: String(performanceRecorder.name ?? ''),
      elapsedSeconds: Math.max(0, Number(performanceRecorder.elapsedSeconds ?? 0)),
      midiEventCount: Math.max(0, Number(performanceRecorder.midiEventCount ?? 0)),
      actionCount: Math.max(0, Number(performanceRecorder.actionCount ?? 0)),
      truncated: performanceRecorder.truncated === true,
    },
    performanceReplay: {
      state: ['idle', 'restoring', 'playing'].includes(String(performanceReplay.state))
        ? String(performanceReplay.state) : 'idle',
      takeId: String(performanceReplay.takeId ?? ''),
      name: String(performanceReplay.name ?? ''),
      progress: Math.max(0, Math.min(1, Number(performanceReplay.progress ?? 0))),
      degraded: performanceReplay.degraded === true,
    },
    scales: (Array.isArray(p.scales) ? p.scales : []).map(String),
  };
}

const variationPatternSeed = (pattern) => {
  if (Number(pattern?.seed) > 0) return Number(pattern.seed) >>> 0;
  let hash = 0x811c9dc5;
  for (const character of String(pattern?.patternId ?? 'pattern')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
};

const variationRandom = (seed, laneIndex, stepIndex, salt) =>
  deterministicRandomUnit((seed ^ Math.imul(laneIndex + 1, 0x85ebca6b)) >>> 0,
    stepIndex + 1, salt);

const isNoteVariationLane = (type) => ['note', 'chord', 'drum'].includes(type);

/** Builds one browser-preview B/C/D variation with the same musical contract as native:
    B changes feel, C thins/revoices, and D adds an ending fill. Generated lanes receive
    independent ids and lock lanes are remapped to their generated visible lanes. */
export function makePatternVariation(sourcePattern, requestedLabel, requestedAmount = 0.55,
  requestedPatternId = '') {
  const source = sourcePattern && typeof sourcePattern === 'object' ? sourcePattern : {};
  const label = ['B', 'C', 'D'].includes(String(requestedLabel)) ? String(requestedLabel) : 'B';
  const amount = Math.max(0, Math.min(1, Number(requestedAmount) || 0));
  const sourceId = String(source.variationSourcePatternId || source.patternId || 'pattern');
  const groupId = String(source.variationGroupId || source.patternId || sourceId);
  const patternId = String(requestedPatternId
    || nextMockId(`variation-${sourceId}-${label}`));
  const seed = variationPatternSeed(source);
  const oldToNewLaneId = new Map();

  const lanes = (Array.isArray(source.lanes) ? source.lanes : []).map((sourceLane, laneIndex) => {
    const lane = {
      ...sourceLane,
      laneId: `${patternId}-lane-${laneIndex + 1}`,
      steps: (Array.isArray(sourceLane.steps) ? sourceLane.steps : []).map(normalizeStep),
    };
    oldToNewLaneId.set(String(sourceLane.laneId ?? ''), lane.laneId);
    if (lane.lockSourceLaneId) return lane;

    if (label === 'B') {
      lane.steps.forEach((step, stepIndex) => {
        if (!step.active) return;
        const random = variationRandom(seed, laneIndex, stepIndex, 0x42b1d5a7);
        if (isNoteVariationLane(lane.type)) {
          step.velocity = Math.max(1, Math.min(127,
            step.velocity + Math.round((random - 0.42) * 28 * amount)));
          step.gate = Math.max(0.05, Math.min(4,
            step.gate + (random - 0.5) * 0.22 * amount));
          step.microtiming = Math.max(-0.5, Math.min(0.5,
            step.microtiming + (stepIndex % 2 ? 0.045 : -0.018) * amount));
        } else {
          step.value = Math.max(0, Math.min(1, step.value + (random - 0.5) * 0.24 * amount));
        }
      });
    }

    if (label === 'C') {
      const firstActive = lane.steps.findIndex((step) => step.active);
      lane.steps.forEach((step, stepIndex) => {
        if (!step.active) return;
        if (variationRandom(seed, laneIndex, stepIndex, 0xc2b2ae35) < 0.18 + amount * 0.42) {
          step.active = false;
          step.tie = false;
          return;
        }
        if (isNoteVariationLane(lane.type)
          && variationRandom(seed, laneIndex, stepIndex, 0x27d4eb2f) < amount * 0.24) {
          const octave = variationRandom(seed, laneIndex, stepIndex, 0x165667b1) < 0.5 ? -12 : 12;
          step.note = Math.max(0, Math.min(127, step.note + octave));
          step.chordNotes = step.chordNotes.map((note) => Math.max(0, Math.min(127, note + octave)));
        }
      });
      if (firstActive >= 0 && !lane.steps.some((step) => step.active))
        lane.steps[firstActive].active = true;
    }

    if (label === 'D') {
      const fillStart = Math.max(0, Math.floor(lane.steps.length * 3 / 4));
      if (!isNoteVariationLane(lane.type)) {
        lane.steps.forEach((step, stepIndex) => {
          if (step.active && stepIndex >= fillStart) {
            const progress = (stepIndex - fillStart + 1) / Math.max(1, lane.steps.length - fillStart);
            step.value = Math.max(0, Math.min(1, step.value + progress * amount * 0.18));
          }
        });
      } else {
        const lastActive = lane.steps.findLastIndex((step) => step.active);
        const stride = amount < 0.34 ? 4 : (amount < 0.67 ? 2 : 1);
        if (lastActive >= 0) {
          for (let stepIndex = fillStart; stepIndex < lane.steps.length; stepIndex += 1) {
            const step = lane.steps[stepIndex];
            if (!step.active && (stepIndex - fillStart) % stride === stride - 1) {
              let templateIndex = stepIndex - 1;
              while (templateIndex >= 0 && !lane.steps[templateIndex].active) templateIndex -= 1;
              const template = lane.steps[templateIndex >= 0 ? templateIndex : lastActive];
              lane.steps[stepIndex] = {
                ...template,
                chordNotes: [...template.chordNotes],
                active: true, tie: false,
                probability: Math.max(template.probability, 85),
                ratchets: amount > 0.8 ? 3 : 2,
              };
            } else if (step.active && stepIndex > fillStart
              && variationRandom(seed, laneIndex, stepIndex, 0xd3a2646c) < amount * 0.55) {
              step.ratchets = Math.max(step.ratchets, amount > 0.8 ? 3 : 2);
            }
          }
        }
      }
    }
    return lane;
  });

  for (const lane of lanes) {
    if (!lane.lockSourceLaneId) continue;
    const sourceLaneId = oldToNewLaneId.get(String(lane.lockSourceLaneId));
    lane.lockSourceLaneId = sourceLaneId ?? '';
    const triggerLane = lanes.find((candidate) => candidate.laneId === sourceLaneId);
    if (!triggerLane) continue;
    lane.steps.forEach((lock, stepIndex) => {
      const trigger = triggerLane.steps[stepIndex];
      lock.active = lock.active && trigger?.active === true;
      if (lock.active) {
        lock.microtiming = trigger.microtiming;
        lock.probability = trigger.probability;
        lock.every = trigger.every;
        lock.offset = trigger.offset;
      }
    });
  }

  return {
    ...source,
    patternId,
    name: `${String(source.name || 'Pattern')} ${label}`,
    seed: seed || 1,
    variationGroupId: groupId,
    variationLabel: label,
    variationSourcePatternId: sourceId,
    variationAmount: amount,
    lanes,
  };
}

const normalizeEffectSlot = (e) => ({
  effectId: String(e?.effectId ?? ''),
  pluginCeId: String(e?.pluginCeId ?? ''),
  pluginName: String(e?.pluginName ?? ''),
  pluginVendor: String(e?.pluginVendor ?? ''),
  bypassed: e?.bypassed === true,
  hasProcessor: e?.hasProcessor === true,
  unresolved: e?.unresolved === true,
});

/** Shapes whatever arrived into the exact structure the view renders — absent fields become
 *  defaults rather than undefined holes. */
// --- the rack canvas ----------------------------------------------------------------------------

// Signal flow as geometry. Pure on purpose: the picture is a second view of the graph the
// document already holds, so the arithmetic that places it belongs where it can be tested
// without a browser, and the component only draws what comes back.
//
// Columns are depth from a source: parts are sources, a bus sits one past the furthest thing
// feeding it, and the master sits past everything. That is why two instruments joining a bus
// line up, and why a sub-bus lands between its bus and the master instead of beside it.
export const CANVAS_NODE_W = 176;
export const CANVAS_NODE_H = 54;
const CANVAS_GAP_X = 64;
const CANVAS_GAP_Y = 14;
const CANVAS_PAD = 12;
const CANVAS_BAND_GAP = 26;
const CANVAS_LANE_H = 7;

// --- plug-in tiles ------------------------------------------------------------------------------

// Most plug-ins ship no artwork, so a tile is DERIVED from the one thing that is stable about
// a plug-in: the catalogue's class identity. Same ceId, same tile, on every machine and after
// every rescan — which is what makes it usable as recognition rather than decoration.
//
// Colour alone would fail anyone who cannot separate two hues, so the hash also picks a
// pattern. Two channels, one hash, no images.
//
// The ones that DO ship artwork get it instead: VST3 defines Contents/Resources/Snapshots and
// the scan reads that folder, so those classes arrive with a snapshotUrl. The generated tile
// stays as the fallback for everything else and for an image that fails to load.
export const TILE_PATTERNS = ['plain', 'stripe', 'dots', 'corner'];

function tileHash(text) {
  // FNV-1a, 32-bit. Chosen over anything cleverer because it has to give the same answer in
  // this file for ever: a tile that changes when the hash changes is a tile nobody learns.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Two letters that stand for a plug-in: initials of its first two words, or the first two
    letters of a single-word name. Falls back to the vendor, then to a dash — never empty, so
    a tile never renders as a blank square. */
export function pluginInitials(name, vendor = '') {
  const words = String(name ?? '').trim().split(/[\s\-_/]+/).filter(Boolean)
    // "The", "A" and a bare number tell you nothing; the next word does.
    .filter((word) => !/^(the|a|an|vst|vsti)$/i.test(word));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const fallback = String(vendor ?? '').trim();
  return fallback ? fallback.slice(0, 2).toUpperCase() : '–';
}

/** ceId -> artwork URL, for the catalogue classes that shipped a snapshot.

    Derived once and read by the tile itself rather than passed in, because the places that
    draw a tile mostly do not have the catalogue record: a rack part and a canvas node know
    their ceId and their name and nothing else. Threading a URL through each of those call
    sites would mean every one somebody forgot silently falls back to a generated tile, which
    is the failure you cannot see. */
/** The classes showing a picture the user chose. Read by the browser rows to offer "use its
    own picture again" only where there is something to go back to. */
export const customArtworkIds = derived(hostState, ($state) => {
  const ids = new Set();
  for (const list of [$state?.instruments, $state?.effectClasses])
    for (const record of Array.isArray(list) ? list : [])
      if (record?.artworkSource === 'custom') ids.add(record.ceId);
  return ids;
});

export const pluginSnapshots = derived(hostState, ($state) => {
  const byCeId = {};
  for (const list of [$state?.instruments, $state?.effectClasses])
    for (const record of Array.isArray(list) ? list : [])
      if (record?.ceId && record?.snapshotUrl)
        byCeId[record.ceId] = record.snapshotUrl;
  return byCeId;
});

/** The tile for a plug-in class: a hue, a pattern and its initials, all derived from ceId. */
export function pluginTile(ceId, name = '', vendor = '') {
  const key = String(ceId || name || vendor || '');
  const hash = tileHash(key);
  // 360 degrees in 24 steps: far enough apart to tell two neighbours in a list apart, and
  // quantised so the palette reads as a set rather than as noise.
  const hue = (hash % 24) * 15;
  return {
    hue,
    pattern: TILE_PATTERNS[(hash >>> 5) % TILE_PATTERNS.length],
    initials: pluginInitials(name, vendor),
    // Fixed saturation and lightness, so every tile carries the same weight on a dark panel
    // and the ink on top is legible whatever the hue turns out to be.
    background: `hsl(${hue} 42% 30%)`,
    edge: `hsl(${hue} 46% 46%)`,
    ink: `hsl(${hue} 60% 88%)`,
  };
}

// Which destinations a bus may actually take. The model refuses a routing that would close a
// loop, and a UI that offers one anyway is just a refusal waiting to happen — so the same rule
// lives here, in front of the drop targets AND the mixer's dropdowns.
/** Would sourcing `partId` from `sourcePartId` close a loop — itself, or a part that already
    takes its MIDI, however indirectly, from it? Mirrors Performance::midiRoutingWouldLoop, so
    the picker can refuse the option before the native side has to. */
export function midiSourceWouldLoop(rack, partId, sourcePartId) {
  if (!partId || !sourcePartId) return false;              // the keyboard ends every chain
  if (partId === sourcePartId) return true;
  const byId = new Map((rack?.parts ?? []).map((p) => [p.partId, p]));
  let at = sourcePartId;
  for (let hops = 0; hops <= byId.size; hops += 1) {
    const part = byId.get(at);
    if (!part) return false;
    if (part.midiSourcePartId === partId) return true;
    at = part.midiSourcePartId ?? '';
    if (!at) return false;
  }
  return true;
}

export function busDestinationWouldLoop(rack, busId, destinationBusId) {
  if (!busId || !destinationBusId) return false;          // the master ends every chain
  if (busId === destinationBusId) return true;
  const buses = Array.isArray(rack?.buses) ? rack.buses : [];
  const byId = new Map(buses.map((b) => [b.busId, b]));
  const seen = new Set();
  let at = destinationBusId;
  while (at && !seen.has(at)) {
    if (at === busId) return true;
    seen.add(at);
    at = byId.get(at)?.destinationBusId ?? '';
  }
  return false;
}

// What a thing being dragged may be dropped onto. Legal targets light up and illegal ones do
// not accept the drop at all, so the canvas can never be drawn into a shape the engine would
// refuse — the whole reason the picture is constrained rather than a free patchbay.
// --- dragging a row to reorder a chain -----------------------------------------------------

/** The index a chain command should be given when the row at `fromIndex` is dropped against
    the row at `overIndex`, on its lower half (`dropAfter`) or its upper half.

    Both the service and the mock take "move to this position in the list AFTER the row has
    been lifted out", which is the same semantics as juce::Array::move and Array#splice — and
    it is exactly one off from what the pointer is saying whenever the row is travelling
    DOWNWARDS, because lifting it out shifts everything below it up by one. Getting that
    wrong lands the row one place short of where it was dropped, every time, in one direction
    only: the kind of bug that survives a demo and a screenshot.

    Returns -1 when the drop would change nothing, so the caller can send no command at all
    rather than a no-op that still costs a state push and a save. */
export function reorderIndexForDrop(fromIndex, overIndex, dropAfter) {
  const from = Number(fromIndex);
  const over = Number(overIndex);
  if (!Number.isInteger(from) || !Number.isInteger(over) || from < 0 || over < 0) return -1;

  let target = dropAfter ? over + 1 : over;
  if (from < target) target -= 1;
  return target === from ? -1 : target;
}

export function canvasDropTargets(rack, drag) {
  const buses = Array.isArray(rack?.buses) ? rack.buses : [];
  const parts = Array.isArray(rack?.parts) ? rack.parts : [];
  if (!drag?.kind) return [];

  // An instrument from the browser lands on a part: that part loads it. Dropping it where you
  // want it is the fix for a Load button that silently targeted whatever was focused.
  if (drag.kind === 'instrument') return parts.map((part) => part.partId);

  // An effect lands on anything that HAS a chain, which is everything with a box on the
  // canvas: a part's inserts, a bus's, a return's, and the master. The service takes exactly
  // these four as a chain id, so the drawing offers exactly these four.
  if (drag.kind === 'effect')
    return [
      ...parts.map((part) => part.partId),
      ...buses.map((bus) => bus.busId),
      ...(Array.isArray(rack?.returns) ? rack.returns : []).map((ret) => ret.returnId),
      '@master',
    ];

  // A part goes to one destination: a bus, or the master. Its current one is not offered
  // again — a drop that changes nothing reads as a drop that failed.
  if (drag.kind === 'part') {
    const part = parts.find((p) => p.partId === drag.id);
    if (!part) return [];
    return [...buses.map((b) => b.busId), '@master']
      .filter((id) => id !== (part.destinationBusId || '@master'));
  }

  if (drag.kind === 'bus') {
    const bus = buses.find((b) => b.busId === drag.id);
    if (!bus) return [];
    return [...buses.map((b) => b.busId), '@master']
      .filter((id) => id !== (bus.destinationBusId || '@master'))
      .filter((id) => id !== drag.id)
      .filter((id) => id === '@master' || !busDestinationWouldLoop(rack, drag.id, id));
  }
  return [];
}

export function rackCanvasLayout(rack) {
  const parts = Array.isArray(rack?.parts) ? rack.parts : [];
  const buses = Array.isArray(rack?.buses) ? rack.buses : [];
  const returns = Array.isArray(rack?.returns) ? rack.returns : [];
  const busById = new Map(buses.map((b) => [b.busId, b]));

  // Depth of a bus = one past the deepest thing that feeds it. The `seen` set is not
  // decoration: the model refuses routing cycles, but a hand-edited manifest can still carry
  // one, and a picture must not hang trying to draw it.
  const busDepth = new Map();
  const depthOfBus = (busId, seen = new Set()) => {
    if (busDepth.has(busId)) return busDepth.get(busId);
    if (seen.has(busId)) return 1;
    seen.add(busId);
    let deepest = 0;
    for (const part of parts) if (part.destinationBusId === busId) deepest = Math.max(deepest, 1);
    for (const other of buses)
      if (other.destinationBusId === busId && other.busId !== busId)
        deepest = Math.max(deepest, depthOfBus(other.busId, seen) + 1);
    const depth = Math.max(1, deepest);
    busDepth.set(busId, depth);
    return depth;
  };
  for (const bus of buses) depthOfBus(bus.busId);

  let masterColumn = 1;
  for (const depth of busDepth.values()) masterColumn = Math.max(masterColumn, depth + 1);

  const columnOf = (node) => (node.kind === 'part' ? 0
                              : node.kind === 'master' ? masterColumn
                              : node.kind === 'return' ? Math.max(1, masterColumn - 1)
                              : busDepth.get(node.id) ?? 1);
  const columnX = (column) => CANVAS_PAD + column * (CANVAS_NODE_W + CANVAS_GAP_X);

  const effectCount = (chain) => (Array.isArray(chain) ? chain.length : 0);
  const nodes = [
    ...parts.map((part) => ({
      id: part.partId,
      kind: 'part',
      ceId: part.pluginCeId,
      hasInstrument: part.hasInstrument === true,
      title: part.pluginName || (part.hardware ? 'External' : 'Empty part'),
      // An unresolved part HAS an instrument named in the manifest — the machine just cannot
      // find it. Saying "no instrument" there would send you looking for the wrong problem.
      subtitle: part.unresolved ? 'missing'
                : part.pluginVendor || (part.hasInstrument ? '' : 'no instrument'),
      midi: effectCount(part.midiChain),
      inserts: effectCount(part.effects),
      unresolved: part.unresolved === true,
      muted: part.mute === true || part.enabled === false,
      focused: part.partId === rack?.focusedPartId,
    })),
    ...buses.map((bus) => ({
      id: bus.busId, kind: 'bus', title: bus.name || 'Bus', subtitle: 'group',
      midi: 0, inserts: effectCount(bus.effects), unresolved: false, muted: false, focused: false,
    })),
    ...returns.map((ret) => ({
      id: ret.returnId, kind: 'return', title: ret.name || 'Return', subtitle: 'send return',
      midi: 0, inserts: effectCount(ret.effects), unresolved: false, muted: false, focused: false,
    })),
    { id: '@master', kind: 'master', title: 'Master', subtitle: 'output 1/2',
      midi: 0, inserts: effectCount(rack?.masterEffects), unresolved: false, muted: false,
      focused: false },
  ];

  // A box the user placed by hand keeps the place they put it; everything else is laid out.
  // Mixing the two on purpose: auto-layout stays useful for the boxes you never touched, and
  // a partly-arranged canvas is the normal state rather than an unsupported one.
  const placed = new Map((Array.isArray(rack?.canvasPositions) ? rack.canvasPositions : [])
    .filter((c) => c && c.nodeId)
    .map((c) => [c.nodeId, { x: Number(c.x) || 0, y: Number(c.y) || 0 }]));

  // Returns sit in a band of their own under the main flow: they take a COPY of a part rather
  // than carrying it, and drawing them in line would say the signal goes through them.
  const columnFill = new Map();
  const mainRows = [];
  for (const node of nodes) {
    if (node.kind === 'return') continue;
    const column = columnOf(node);
    const row = columnFill.get(column) ?? 0;
    columnFill.set(column, row + 1);
    node.column = column;
    // The COLUMN stays computed even for a placed node. It is what decides a wire's shape and
    // whether a run counts as skipping — those are facts about the signal, not about where
    // the box was dragged, and taking them from a hand position would redraw the cabling
    // every time somebody nudged a box.
    const hand = placed.get(node.id);
    node.placed = hand !== undefined;
    node.x = hand ? hand.x : columnX(column);
    node.y = hand ? hand.y : CANVAS_PAD + row * (CANVAS_NODE_H + CANVAS_GAP_Y);
    mainRows.push(row);
  }
  const mainBottom = CANVAS_PAD + (Math.max(0, ...mainRows, 0) + 1) * (CANVAS_NODE_H + CANVAS_GAP_Y);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // A wire that skips a column would otherwise be drawn straight THROUGH whatever sits in the
  // column it skips, which reads as "the signal goes in there" — the one thing the picture
  // exists to answer, answered wrongly. Long runs drop into a channel under the nodes, one
  // lane each, the way a schematic routes around a part rather than over it.
  const channelOf = new Map();
  const longRun = (from, to) => from.kind !== 'return' && to.column - from.column > 1;
  const laneY = (key) => mainBottom + 6 + (channelOf.get(key) ?? 0) * CANVAS_LANE_H;
  const path = (from, to, key) => {
    const x1 = from.x + CANVAS_NODE_W;
    const y1 = from.y + CANVAS_NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + CANVAS_NODE_H / 2;
    if (longRun(from, to)) {
      const out = x1 + CANVAS_GAP_X / 2;
      const back = x2 - CANVAS_GAP_X / 2;
      const lane = laneY(key);
      return `M ${x1} ${y1} H ${out} V ${lane} H ${back} V ${y2} H ${x2}`;
    }
    // Horizontal out, vertical across, horizontal in — the shape the eye follows without
    // having to trace a curve, and the one a rack's cabling actually looks like.
    const mid = x2 > x1 ? x1 + (x2 - x1) / 2 : x1 + CANVAS_GAP_X / 2;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
  };

  // Two passes, because a wire's shape depends on how many long runs there are: collect what
  // connects to what, give every long run its own lane, then draw.
  const links = [];
  const destinationFor = (busId) => (busId && busById.has(busId) ? busId : '@master');
  for (const part of parts) {
    const to = destinationFor(part.destinationBusId);
    if (nodeById.has(part.partId) && nodeById.has(to))
      links.push({ from: part.partId, to, kind: 'audio' });
    for (const send of Array.isArray(part.sends) ? part.sends : [])
      if (nodeById.has(send.returnId) && send.level > 0)
        links.push({ from: part.partId, to: send.returnId, kind: 'send' });
  }
  for (const bus of buses) {
    const to = destinationFor(bus.destinationBusId === bus.busId ? '' : bus.destinationBusId);
    if (nodeById.has(bus.busId) && nodeById.has(to) && to !== bus.busId)
      links.push({ from: bus.busId, to, kind: 'audio' });
  }
  for (const ret of returns)
    if (nodeById.has(ret.returnId)) links.push({ from: ret.returnId, to: '@master', kind: 'send' });

  // Returns have no column yet — they are placed under the channel band, so a lane can never
  // be drawn across one.
  for (const ret of returns) {
    const node = nodeById.get(ret.returnId);
    node.column = columnOf(node);
  }

  let lanes = 0;
  for (const link of links) {
    const from = nodeById.get(link.from);
    const to = nodeById.get(link.to);
    if (from.kind !== 'return' && to.column - from.column > 1) {
      channelOf.set(link.from + '>' + link.to, lanes);
      lanes += 1;
    }
  }

  const channelBottom = mainBottom + (lanes > 0 ? 6 + lanes * CANVAS_LANE_H : 0);
  returns.forEach((ret, index) => {
    const node = nodeById.get(ret.returnId);
    const hand = placed.get(node.id);
    node.placed = hand !== undefined;
    node.x = hand ? hand.x : columnX(node.column);
    node.y = hand ? hand.y : channelBottom + CANVAS_BAND_GAP + index * (CANVAS_NODE_H + CANVAS_GAP_Y);
  });

  const wires = links.map((link) => ({
    ...link,
    d: path(nodeById.get(link.from), nodeById.get(link.to), link.from + '>' + link.to),
  }));

  // Where a part added right now would land: the instrument column, one row past the last
  // part. Returned by the layout rather than worked out in the view, because the row height,
  // the padding and the column position are all this function's business and a second copy of
  // them drifts the first time one changes.
  const newPartSlot = {
    x: columnX(0),
    y: CANVAS_PAD + parts.length * (CANVAS_NODE_H + CANVAS_GAP_Y),
  };

  const width = Math.max(...nodes.map((n) => n.x + CANVAS_NODE_W), 0) + CANVAS_PAD;
  // The empty slot counts towards the height even when nothing is being dragged. It reads as
  // room for another instrument, which is what it is — and more importantly the canvas then
  // does not grow the moment a drag starts, which would slide the target out from under the
  // pointer that was aiming at it.
  const height = Math.max(...nodes.map((n) => n.y + CANVAS_NODE_H),
                          newPartSlot.y + CANVAS_NODE_H, channelBottom, 0) + CANVAS_PAD;
  return { nodes, wires, width, height, newPartSlot };
}

/** One catalogue class as the browser reads it. `snapshotUrl` is a route the native side
    serves, never a filesystem path — the WebView is handed a token and can fetch nothing the
    catalogue did not publish (PluginCatalog.h documents why). Empty for the majority of
    plug-ins, which ship no artwork at all. */
function normalizePluginClass(i) {
  return {
    ceId: String(i?.ceId ?? ''),
    name: String(i?.name ?? ''),
    vendor: String(i?.vendor ?? ''),
    version: String(i?.version ?? ''),
    snapshotUrl: String(i?.snapshotUrl ?? ''),
    // Which picture is showing: "custom" (one the user chose), "vendor" (shipped with the
    // plug-in), "capture" (its editor, photographed) or empty for the generated tile.
    artworkSource: String(i?.artworkSource ?? ''),
  };
}

export function normalizeHostState(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const rack = p.rack && typeof p.rack === 'object' ? p.rack : {};

  return {
    instruments: (Array.isArray(p.instruments) ? p.instruments : []).map(normalizePluginClass),
    effectClasses: (Array.isArray(p.effectClasses) ? p.effectClasses : []).map(normalizePluginClass),
    modules: (Array.isArray(p.modules) ? p.modules : []).map((m) => ({
      path: String(m?.path ?? ''),
      quarantined: m?.quarantined === true,
      missing: m?.missing === true,
      failureCount: Number(m?.failureCount ?? 0),
      lastFailureReason: String(m?.lastFailureReason ?? ''),
      architectures: (Array.isArray(m?.architectures) ? m.architectures : []).map(String),
      unavailableReason: String(m?.unavailableReason ?? ''),
      numClasses: Number(m?.numClasses ?? 0),
      numInstruments: Number(m?.numInstruments ?? 0),
    })),
    scanPaths: (Array.isArray(p.scanPaths) ? p.scanPaths : []).map(String),
    scanning: p.scanning === true,
    stageLocked: p.stageLocked === true,
    editorOpenPartId: String(p.editorOpenPartId ?? ''),
    floatingEditorPartIds: (Array.isArray(p.floatingEditorPartIds) ? p.floatingEditorPartIds : []).map(String),
    audio: {
      enabled: p.audio?.enabled === true,
      running: p.audio?.running === true,
      deviceName: String(p.audio?.deviceName ?? ''),
      sampleRate: Number(p.audio?.sampleRate ?? 0),
      bufferSize: Number(p.audio?.bufferSize ?? 0),
      inputChannels: Number(p.audio?.inputChannels ?? 0),
      cpu: Number(p.audio?.cpu ?? 0),
      xruns: Number(p.audio?.xruns ?? 0),
    },
    performance: normalizePerformance(p.performance),
    product: normalizeProduct(p.product),
    reliability: normalizeReliability(p.reliability),
    licence: normalizeLicence(p.licence),
    rack: {
      performanceId: String(rack.performanceId ?? ''),
      // Hand-placed canvas boxes. Anything absent is laid out automatically, so a session
      // from before this existed opens exactly as it did.
      canvasPositions: (Array.isArray(rack.canvasPositions) ? rack.canvasPositions : []).map((c) => ({
        nodeId: String(c?.nodeId ?? ''),
        x: Number(c?.x ?? 0),
        y: Number(c?.y ?? 0),
      })).filter((c) => c.nodeId && Number.isFinite(c.x) && Number.isFinite(c.y)),
      focusedPartId: String(rack.focusedPartId ?? ''),
      masterLatencyMs: Number(rack.masterLatencyMs ?? 0),
      microtuning: normalizeMicrotuning(rack.microtuning),
      presetAudition: {
        enabled: rack.presetAudition?.enabled === true,
        phrase: ['single', 'chord', 'scale', 'riff'].includes(rack.presetAudition?.phrase)
          ? rack.presetAudition.phrase : 'chord',
        rootNote: clampInt(rack.presetAudition?.rootNote, 0, 127, 60),
        velocity: clampInt(rack.presetAudition?.velocity, 1, 127, 100),
        noteLengthMs: clampInt(rack.presetAudition?.noteLengthMs, 40, 4000, 360),
        gapMs: clampInt(rack.presetAudition?.gapMs, 0, 2000, 90),
        playing: rack.presetAudition?.playing === true,
      },
      soundComparison: {
        active: rack.soundComparison?.active === true,
        partId: String(rack.soundComparison?.partId ?? ''),
        index: clampInt(rack.soundComparison?.index, -1, 19, -1),
        count: clampInt(rack.soundComparison?.count, 0, 20, 0),
        recordId: String(rack.soundComparison?.recordId ?? ''),
        name: String(rack.soundComparison?.name ?? ''),
        originalRecordId: String(rack.soundComparison?.originalRecordId ?? ''),
        originalName: String(rack.soundComparison?.originalName ?? 'Original sound')
          || 'Original sound',
        recordIds: (Array.isArray(rack.soundComparison?.recordIds)
          ? rack.soundComparison.recordIds : []).map(String).filter(Boolean).slice(0, 20),
      },
      masterEffects: (Array.isArray(rack.masterEffects) ? rack.masterEffects : []).map(normalizeEffectSlot),
      buses: (Array.isArray(rack.buses) ? rack.buses : []).map((b) => ({
        busId: String(b?.busId ?? ''),
        name: String(b?.name ?? ''),
        level: Number(b?.level ?? 1),
        destinationBusId: String(b?.destinationBusId ?? ''),
        latencyMs: Number(b?.latencyMs ?? 0),
        effects: (Array.isArray(b?.effects) ? b.effects : []).map(normalizeEffectSlot),
      })),
      returns: (Array.isArray(rack.returns) ? rack.returns : []).map((r) => ({
        returnId: String(r?.returnId ?? ''),
        name: String(r?.name ?? ''),
        level: Number(r?.level ?? 1),
        effects: (Array.isArray(r?.effects) ? r.effects : []).map(normalizeEffectSlot),
      })),
      macros: (Array.isArray(rack.macros) ? rack.macros : []).map((m) => ({
        macroId: String(m?.macroId ?? ''),
        name: String(m?.name ?? ''),
        value: Number(m?.value ?? 0),
        targets: (Array.isArray(m?.targets) ? m.targets : []).map((t) => {
          const a = clampNumber(t?.rangeMin, 0, 1, 0);
          const b = clampNumber(t?.rangeMax, 0, 1, 1);
          return {
            targetId: String(t?.targetId ?? ''),
            parameterId: String(t?.parameterId ?? ''),
            targetName: String(t?.targetName ?? ''),
            displayName: String(t?.displayName ?? ''),
            rangeMin: Math.min(a, b),
            rangeMax: Math.max(a, b),
            inverted: t?.inverted === true,
            resolved: t?.resolved === true,
          };
        }),
      })),
      midiLfos: (Array.isArray(rack.midiLfos) ? rack.midiLfos : []).map((lfo, index) => ({
        lfoId: String(lfo?.lfoId ?? ''),
        name: String(lfo?.name ?? '') || `LFO ${index + 1}`,
        shape: ['sine', 'triangle', 'sawUp', 'sawDown', 'square', 'sampleHold'].includes(lfo?.shape)
          ? lfo.shape : 'sine',
        enabled: lfo?.enabled !== false,
        sync: lfo?.sync !== false,
        rateHz: Math.max(0.01, Math.min(40, Number(lfo?.rateHz ?? 1) || 1)),
        syncBeats: Math.max(0.03125, Math.min(64, Number(lfo?.syncBeats ?? 1) || 1)),
        phaseOffset: Math.max(0, Math.min(1, Number(lfo?.phaseOffset ?? 0) || 0)),
        minimum: Math.max(0, Math.min(1, Number(lfo?.minimum ?? 0) || 0)),
        maximum: Math.max(0, Math.min(1, Number(lfo?.maximum ?? 1) || 0)),
        phase: Math.max(0, Math.min(1, Number(lfo?.phase ?? 0) || 0)),
        value: Math.max(0, Math.min(1, Number(lfo?.value ?? 0) || 0)),
        _cycles: Number.isFinite(Number(lfo?._cycles)) ? Number(lfo._cycles) : 0,
        outputs: (Array.isArray(lfo?.outputs) ? lfo.outputs : []).map((output) => ({
          outputId: String(output?.outputId ?? ''),
          type: ['cc', 'nrpn', 'sysex'].includes(output?.type) ? output.type : 'cc',
          targetPartId: String(output?.targetPartId ?? ''),
          targetName: String(output?.targetName ?? ''),
          channel: Math.max(1, Math.min(16, Number(output?.channel ?? 1) || 1)),
          number: Math.max(0, Math.min(output?.type === 'nrpn' ? 16383 : 127,
                                      Number(output?.number ?? 1) || 0)),
          sysexTemplate: String(output?.sysexTemplate ?? 'F0 7D {value7} F7'),
          enabled: output?.enabled === true,
          resolved: output?.resolved !== false,
        })).filter((output) => output.outputId),
      })).filter((lfo) => lfo.lfoId).map((lfo) => lfo.minimum <= lfo.maximum
        ? lfo : { ...lfo, minimum: lfo.maximum, maximum: lfo.minimum }),
      envelopes: (Array.isArray(rack.envelopes) ? rack.envelopes : []).map((envelope, index) => {
        const noteLow = Math.max(0, Math.min(127, Number(envelope?.noteLow ?? 0) || 0));
        const noteHigh = Math.max(0, Math.min(127, Number(envelope?.noteHigh ?? 127) || 0));
        return {
          envelopeId: String(envelope?.envelopeId ?? ''),
          name: String(envelope?.name ?? '') || `Envelope ${index + 1}`,
          enabled: envelope?.enabled !== false,
          channel: Math.max(0, Math.min(16, Number(envelope?.channel ?? 0) || 0)),
          noteLow: Math.min(noteLow, noteHigh),
          noteHigh: Math.max(noteLow, noteHigh),
          retrigger: envelope?.retrigger !== false,
          attackMs: Math.max(0, Math.min(60000, Number(envelope?.attackMs ?? 20) || 0)),
          decayMs: Math.max(0, Math.min(60000, Number(envelope?.decayMs ?? 180) || 0)),
          sustain: Math.max(0, Math.min(1, Number(envelope?.sustain ?? 0.65) || 0)),
          releaseMs: Math.max(0, Math.min(60000, Number(envelope?.releaseMs ?? 350) || 0)),
          curve: Math.max(-1, Math.min(1, Number(envelope?.curve ?? 0) || 0)),
          velocityAmount: Math.max(0, Math.min(1, Number(envelope?.velocityAmount ?? 0) || 0)),
          stage: ['idle', 'attack', 'decay', 'sustain', 'release'].includes(envelope?.stage)
            ? envelope.stage : 'idle',
          stageProgress: Math.max(0, Math.min(1, Number(envelope?.stageProgress ?? 0) || 0)),
          value: Math.max(0, Math.min(1, Number(envelope?.value ?? 0) || 0)),
          gate: envelope?.gate === true,
          _stageElapsed: Math.max(0, Number(envelope?._stageElapsed ?? 0) || 0),
          _stageStartValue: Math.max(0, Math.min(1, Number(envelope?._stageStartValue ?? 0) || 0)),
          _peak: Math.max(0, Math.min(1, Number(envelope?._peak ?? 1) || 0)),
        };
      }).filter((envelope) => envelope.envelopeId),
      msegs: (Array.isArray(rack.msegs) ? rack.msegs : []).map((mseg, index) => {
        const rawRateHz = Number(mseg?.rateHz ?? 0.5);
        const rawSyncBeats = Number(mseg?.syncBeats ?? 4);
        const seenPointIds = new Set();
        const points = (Array.isArray(mseg?.points) ? mseg.points : []).map((point) => ({
          pointId: String(point?.pointId ?? ''),
          position: Math.max(0, Math.min(1, Number(point?.position ?? 0) || 0)),
          value: Math.max(0, Math.min(1, Number(point?.value ?? 0) || 0)),
          curve: Math.max(-1, Math.min(1, Number(point?.curve ?? 0) || 0)),
        })).filter((point) => {
          if (!point.pointId || seenPointIds.has(point.pointId)) return false;
          seenPointIds.add(point.pointId);
          return true;
        }).sort((a, b) => a.position - b.position).slice(0, 64);
        if (points.length >= 2) {
          points[0].position = 0;
          points[points.length - 1].position = 1;
        }
        return {
          msegId: String(mseg?.msegId ?? ''),
          name: String(mseg?.name ?? '') || `MSEG ${index + 1}`,
          enabled: mseg?.enabled !== false,
          sync: mseg?.sync !== false,
          rateHz: Number.isFinite(rawRateHz) ? Math.max(0.01, Math.min(40, rawRateHz)) : 0.5,
          syncBeats: Number.isFinite(rawSyncBeats)
            ? Math.max(0.03125, Math.min(64, rawSyncBeats)) : 4,
          phaseOffset: Math.max(0, Math.min(1, Number(mseg?.phaseOffset ?? 0) || 0)),
          phase: Math.max(0, Math.min(1, Number(mseg?.phase ?? 0) || 0)),
          value: Math.max(0, Math.min(1, Number(mseg?.value ?? 0) || 0)),
          _cycles: Number.isFinite(Number(mseg?._cycles)) ? Number(mseg._cycles) : 0,
          points,
        };
      }).filter((mseg) => mseg.msegId && mseg.points.length >= 2),
      randomModulators: (Array.isArray(rack.randomModulators)
        ? rack.randomModulators : []).map((random, index) => {
          const finite = (value, fallback) => Number.isFinite(Number(value))
            ? Number(value) : fallback;
          const minimum = Math.max(0, Math.min(1, finite(random?.minimum, 0)));
          const maximum = Math.max(0, Math.min(1, finite(random?.maximum, 1)));
          return {
            randomId: String(random?.randomId ?? ''),
            name: String(random?.name ?? '') || `Random ${index + 1}`,
            mode: ['sampleHold', 'smoothRandom', 'chaos', 'randomWalk'].includes(random?.mode)
              ? random.mode : 'sampleHold',
            enabled: random?.enabled !== false,
            sync: random?.sync !== false,
            rateHz: Math.max(0.01, Math.min(40, finite(random?.rateHz, 2))),
            syncBeats: Math.max(0.03125, Math.min(64, finite(random?.syncBeats, 0.5))),
            seed: Math.max(1, Math.min(0x7fffffff,
              Math.floor(finite(random?.seed, 1)))),
            probability: Math.max(0, Math.min(1, finite(random?.probability, 1))),
            smoothing: Math.max(0, Math.min(1, finite(random?.smoothing, 1))),
            stepSize: Math.max(0, Math.min(1, finite(random?.stepSize, 0.2))),
            chaos: Math.max(0, Math.min(1, finite(random?.chaos, 0.85))),
            minimum: Math.min(minimum, maximum),
            maximum: Math.max(minimum, maximum),
            phase: Math.max(0, Math.min(1, finite(random?.phase, 0))),
            value: Math.max(0, Math.min(1, finite(random?.value, 0))),
            step: Math.floor(finite(random?.step, -1)),
            _cycles: Math.max(0, finite(random?._cycles, 0)),
            _previous: Math.max(0, Math.min(1, finite(random?._previous, 0.5))),
            _target: Math.max(0, Math.min(1, finite(random?._target, 0.5))),
            _chaosValue: Math.max(0.0001, Math.min(0.9999,
              finite(random?._chaosValue, 0.5))),
            _walkValue: Math.max(0, Math.min(1, finite(random?._walkValue, 0.5))),
            _initialized: random?._initialized === true,
          };
        }).filter((random) => random.randomId),
      layerGroups: (Array.isArray(rack.layerGroups) ? rack.layerGroups : []).map((group, index) => ({
        layerGroupId: String(group?.layerGroupId ?? ''),
        name: String(group?.name ?? '') || `Layer ${index + 1}`,
        enabled: group?.enabled !== false,
        allocation: ['all', 'roundRobin', 'leastBusy'].includes(group?.allocation)
          ? group.allocation : 'all',
        source: ['velocity', 'key', 'cc', 'expression', 'macro'].includes(group?.source)
          ? group.source : 'velocity',
        controller: Math.max(0, Math.min(127, Math.round(Number(group?.controller ?? 11) || 0))),
        macroId: String(group?.macroId ?? ''),
        members: (Array.isArray(group?.members) ? group.members : []).map((member) => {
          const rawMinimum = Math.max(0, Math.min(1, Number(member?.minimum ?? 0) || 0));
          const rawMaximum = Math.max(0, Math.min(1, Number(member?.maximum ?? 1) || 0));
          return {
            partId: String(member?.partId ?? ''),
            partName: String(member?.partName ?? ''),
            minimum: Math.min(rawMinimum, rawMaximum),
            maximum: Math.max(rawMinimum, rawMaximum),
            crossfade: Math.max(0, Math.min(0.5, Number(member?.crossfade ?? 0) || 0)),
            resolved: member?.resolved !== false,
          };
        }).filter((member) => member.partId).slice(0, 8),
      })).filter((group) => group.layerGroupId).slice(0, 32),
      modulationRoutes: (Array.isArray(rack.modulationRoutes) ? rack.modulationRoutes : []).map((r) => ({
        routeId: String(r?.routeId ?? ''),
        sourceType: String(r?.sourceType ?? ''),
        sourceId: String(r?.sourceId ?? ''),
        sourceChannel: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(r?.sourceType) ? 0
          : Math.max(0, Math.min(16, Number(r?.sourceChannel ?? 0) || 0)),
        sourceNumber: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(r?.sourceType) ? 0
          : Math.max(0, Math.min(127, Number(r?.sourceNumber ?? 0) || 0)),
        sourceValue: Math.max(0, Math.min(1, Number(r?.sourceValue ?? (r?.sourceType === 'pitchBend' ? 0.5 : 0)) || 0)),
        targetId: String(r?.targetId ?? ''),
        parameterId: String(r?.parameterId ?? ''),
        targetName: String(r?.targetName ?? ''),
        displayName: String(r?.displayName ?? ''),
        amount: Math.max(-1, Math.min(1, Number(r?.amount ?? 0.25) || 0)),
        baseValue: Math.max(0, Math.min(1, Number(r?.baseValue ?? 0) || 0)),
        enabled: r?.enabled !== false,
        resolved: r?.resolved !== false,
      })).filter((r) => r.routeId),
      pages: (Array.isArray(rack.pages) ? rack.pages : []).map((page) => ({
        pageId: String(page?.pageId ?? ''),
        name: String(page?.name ?? ''),
        generated: page?.generated === true,
        generatedForPartId: String(page?.generatedForPartId ?? ''),
        slots: (Array.isArray(page?.slots) ? page.slots : []).map((slot, position, all) => ({
          slotId: String(slot?.slotId ?? ''),
          // Which control on the surface: kind and index in the layout's own terms. Absent
          // means an encoder at its place among the encoders, which is what every page
          // saved before faders and pads had slots of their own means by "slot N".
          kind: ['encoder', 'fader', 'pad'].includes(slot?.kind) ? slot.kind : 'encoder',
          index: Number.isInteger(slot?.index) && slot.index >= 0 ? slot.index
            : (['fader', 'pad'].includes(slot?.kind) ? -1
               : all.slice(0, position).filter((s) => !['fader', 'pad'].includes(s?.kind)).length),
          assigned: slot?.assigned === true,
          partId: String(slot?.partId ?? ''),
          parameterId: String(slot?.parameterId ?? ''),
          label: String(slot?.label ?? ''),
          displayName: String(slot?.displayName ?? ''),
          partName: String(slot?.partName ?? ''),
          rangeMin: Number(slot?.rangeMin ?? 0),
          rangeMax: Number(slot?.rangeMax ?? 1),
          inverted: slot?.inverted === true,
          bipolar: slot?.bipolar === true,
          resolved: slot?.resolved === true,
          midiCc: Number.isInteger(slot?.midiCc) ? Math.max(-1, Math.min(127, slot.midiCc)) : -1,
          midiChannel: Number.isInteger(slot?.midiChannel) ? Math.max(0, Math.min(16, slot.midiChannel)) : 0,
          midiNote: Number.isInteger(slot?.midiNote) ? Math.max(-1, Math.min(127, slot.midiNote)) : -1,
          toggle: slot?.toggle === true,
          latched: slot?.latched === true,
          value: Math.max(0, Math.min(1, Number(slot?.value ?? 0) || 0)),
          valueText: String(slot?.valueText ?? ''),
        })),
      })),
      parts: (Array.isArray(rack.parts) ? rack.parts : []).map((part) => ({
        partId: String(part?.partId ?? ''),
        pluginCeId: String(part?.pluginCeId ?? ''),
        pluginName: String(part?.pluginName ?? ''),
        pluginVendor: String(part?.pluginVendor ?? ''),
        destinationBusId: String(part?.destinationBusId ?? ''),
        presetRecordId: String(part?.presetRecordId ?? ''),
        presetName: String(part?.presetName ?? ''),
        hasInstrument: part?.hasInstrument === true,
        unresolved: part?.unresolved === true,
        channel: Number(part?.channel ?? 0),
        keyLow: Number(part?.keyLow ?? 0),
        keyHigh: Number(part?.keyHigh ?? 127),
        velocityLow: Number(part?.velocityLow ?? 1),
        velocityHigh: Number(part?.velocityHigh ?? 127),
        transpose: Number(part?.transpose ?? 0),
        effects: (Array.isArray(part?.effects) ? part.effects : []).map(normalizeEffectSlot),
        sends: (Array.isArray(part?.sends) ? part.sends : []).map((s) => ({
          returnId: String(s?.returnId ?? ''),
          level: Number(s?.level ?? 0),
        })),
        extraOuts: (Array.isArray(part?.extraOuts) ? part.extraOuts : []).map((o) => ({
          pairIndex: Number(o?.pairIndex ?? 1),
          gain: Number(o?.gain ?? 1),
        })),
        outputChannels: Number(part?.outputChannels ?? 0),
        outputPair: Number(part?.outputPair ?? 0),
        latencyMs: Number(part?.latencyMs ?? 0),
        hardware: part?.hardware === true,
        midiOutputId: String(part?.midiOutputId ?? ''),
        midiOutputName: String(part?.midiOutputName ?? ''),
        midiOutChannel: Number(part?.midiOutChannel ?? 1),
        audioReturnChannel: Number(part?.audioReturnChannel ?? -1),
        audioReturnStereo: part?.audioReturnStereo !== false,
        programBank: Number(part?.programBank ?? -1),
        programNumber: Number(part?.programNumber ?? -1),
        midiOutError: String(part?.midiOutError ?? ''),
        microtuningEnabled: part?.microtuningEnabled === true,
        microtuningError: String(part?.microtuningError ?? ''),
        // Where the part's MIDI comes from: '' is the keyboard, else another part's chain.
        midiSourcePartId: String(part?.midiSourcePartId ?? ''),
        deviceProfileId: String(part?.deviceProfileId ?? ''),
        // Total recall: the name and size of the captured patch, never the patch. The bytes
        // are opaque manufacturer data of unbounded length — nothing here can read them, and
        // carrying a bank dump on every state push would be a cost for no reader.
        hardwarePatchName: String(part?.hardwarePatchName ?? ''),
        hardwarePatchBytes: Number(part?.hardwarePatchBytes ?? 0),
        hardwareRestore: ['ask', 'always', 'never'].includes(part?.hardwareRestore)
          ? part.hardwareRestore : 'ask',
        // Where this synth's patches are filed in the library (hw:<profile or port>).
        hardwarePatchTarget: String(part?.hardwarePatchTarget
          ?? (part?.hardware === true ? `hw:${String(part?.midiOutputName ?? '').trim().toLowerCase()}` : '')),
        arp: normalizeArp(part?.arp),
        midiFx: normalizeMidiFx(part?.midiFx),
        midiChain: (Array.isArray(part?.midiChain) ? part.midiChain : []).map(normalizeMidiSlot),
        enabled: part?.enabled !== false,
        mute: part?.mute === true,
        solo: part?.solo === true,
        volume: Number(part?.volume ?? 1),
        pan: Number(part?.pan ?? 0),
      })),
    },
  };
}

/** Case-insensitive name/vendor filter for the browser column. */
// Instruments and effects are the same shape — a catalogue class with a name and a vendor —
// so they filter the same way. Two names for one rule, because "filterInstruments(effects)"
// would read as a mistake at every call site.
function filterPluginClasses(classes, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return classes;
  return classes.filter(
    (i) => i.name.toLowerCase().includes(q) || i.vendor.toLowerCase().includes(q)
  );
}

export function filterInstruments(instruments, query) {
  return filterPluginClasses(instruments, query);
}

export function filterEffects(effects, query) {
  return filterPluginClasses(effects, query);
}

/** The browser-only demo catalogue and rack. */
export function mockHostState() {
  return normalizeHostState({
    instruments: [
      { ceId: 'mock-analog', name: 'Analog One', vendor: 'Mock Audio', version: '1.4' },
      { ceId: 'mock-keys', name: 'Stage Keys', vendor: 'Mock Audio', version: '2.0' },
      { ceId: 'mock-strings', name: 'String Machine', vendor: 'Tape Labs', version: '1.1' },
    ],
    effectClasses: [
      { ceId: 'mock-reverb', name: 'Sweet Reverb', vendor: 'Mock Audio', version: '1.0' },
      { ceId: 'mock-comp', name: 'Big Comp', vendor: 'Tape Labs', version: '2.2' },
    ],
    modules: [
      { path: 'C:\\Program Files\\Common Files\\VST3\\MockAudio.vst3', numClasses: 2, numInstruments: 2 },
      { path: 'C:\\Program Files\\Common Files\\VST3\\TapeLabs.vst3', numClasses: 3, numInstruments: 1 },
      { path: 'C:\\Program Files\\Common Files\\VST3\\Rusty.vst3', quarantined: true, failureCount: 2, lastFailureReason: 'scanner exited with code 3', numClasses: 0, unavailableReason: 'quarantined (scanner exited with code 3)' },
      { path: 'C:\\Program Files (x86)\\Common Files\\VST3\\Vintage.vst3', numClasses: 1, architectures: ['x86'], unavailableReason: 'built for x86, this host is x86_64' },
    ],
    scanPaths: [],
    rack: {
      performanceId: 'mock-performance',
      focusedPartId: 'mock-part-1',
      presetAudition: { enabled: false, phrase: 'chord', rootNote: 60,
                        velocity: 100, noteLengthMs: 360, gapMs: 90 },
      soundComparison: { active: false, index: -1, count: 0 },
      parts: [
        { partId: 'mock-part-1', pluginCeId: 'mock-keys', pluginName: 'Stage Keys', pluginVendor: 'Mock Audio', hasInstrument: true,
          // The two modules a migrated part carries, so the demo shows a real chain.
          midiChain: [{ slotId: 'mock-slot-fx', type: 'fx' }, { slotId: 'mock-slot-arp', type: 'arp' }] },
        { partId: 'mock-part-2', pluginCeId: '', pluginName: '' },
      ],
    },
    product: {
      daw: {
        hostSync: false, followingHost: false, latencySamples: 0, tailSeconds: 0,
        outputPairs: 1, masterLevel: 1,
        exposedMacros: Array.from({ length: 16 }, (_, i) => ({
          index: i, name: `Macro ${i + 1}`, value: 0, bound: false,
        })),
      },
      restore: { degraded: false, missingInstruments: [], missingEffects: [], notes: [] },
      platform: {
        name: 'Browser preview',
        supported: true,
        rows: [
          { id: 'data-directory', description: 'A writable per-user data directory', required: true, present: true, detail: '(mock)' },
          { id: 'midi', description: 'A MIDI stack that enumerates', required: true, present: true, detail: '(mock)' },
          { id: 'format-vst3', description: 'VST3 hosting', required: true, present: true, detail: '(mock)' },
        ],
      },
      hardware: { owner: 'nobody', owned: false },
      activeHostingIncidents: [],
      surfaceProfiles: ['akai-ctrl49'],
    },
    licence: {
      edition: 'free',
      editionLabel: 'Free',
      state: 'unlicensed',
      detail: 'No licence installed. Everything the keyboard does works; one plug-in can be '
            + 'loaded at a time.',
      maxLoadedParts: 1,
      loadedParts: 1,
      runnable: true,
      updatesIncluded: true,
      features: [
        { feature: 'patternEngine', allowed: false },
        { feature: 'scenesAndSetlists', allowed: false },
        { feature: 'advancedRouting', allowed: false },
        { feature: 'advancedScripting', allowed: false },
      ],
      neverGated: [
        'Full supported-hardware display communication',
        'Normal control pages',
        'VST3 hosting',
        'Preset browsing',
        'Editable mappings',
        'Basic splits, layers and multis',
        'Saving and recalling complete setups',
        'Running the application at all, whatever the update entitlement says',
      ],
    },
    reliability: {
      safeMode: { level: 'normal', suspects: [] },
      refusedThisRun: [],
      recovery: {
        interrupted: false, lastOperation: '', lastOperationDetail: '',
        preservedStateFile: '', hasLastKnownGood: false, lastKnownGoodAt: '',
      },
      damagedState: [],
      automaticFailover: {
        isolationAvailable: false, enabled: true, maxAttempts: 3, retryDelayMs: 500, events: [],
      },
    },
    performance: {
      transport: { tempo: 120, numerator: 4, denominator: 4, defaultQuantize: 'bar' },
      grooves: factoryGrooveTemplates,
      patterns: [{
        patternId: 'mock-pattern-1',
        name: 'Riff',
        lanes: [{
          laneId: 'mock-lane-1',
          type: 'note',
          name: 'Notes',
          targetPartId: 'mock-part-1',
          targetName: 'Stage Keys',
          resolved: true,
          stepCount: 16,
          stepsPerBeat: 4,
          steps: Array.from({ length: 16 }, (_, i) => ({
            active: i % 4 === 0, note: 60 + (i % 4) * 3, velocity: 100, gate: 0.5,
          })),
        }],
      }],
      clips: [{ clipId: 'mock-clip-1', name: 'Riff', patternId: 'mock-pattern-1',
                 launchQuantize: 'bar', loop: true }],
      scenes: [],
      setlist: { items: [], currentIndex: -1 },
      arrangement: {
        items: [], loop: false, playing: false, currentIndex: -1, queuedIndex: -1,
        ending: false, progress: 0, bar: 0,
      },
      scales: ['chromatic', 'major', 'minor', 'dorian', 'pentatonic minor'],
    },
  });
}

/** The native virtualParameterName rule, mirrored for the mock's bindings and chips. */
function mockBindingName(parameterId, rack) {
  const id = String(parameterId ?? '');
  if (id === '@gain') return 'Level';
  if (id === '@pan') return 'Pan';
  if (id.startsWith('@send:'))
    return `Send — ${rack.returns.find((r) => r.returnId === id.slice(6))?.name ?? 'gone'}`;
  return id.replace(/^./, (c) => c.toUpperCase());
}

function writeMockVirtualTarget(rack, targetId, parameterId, value) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  if (parameterId === '@macro') {
    const macro = rack.macros.find((candidate) => candidate.macroId === targetId);
    if (!macro) return;
    macro.value = normalized;
    const destinations = new Set();
    for (const route of rack.modulationRoutes)
      if (route.sourceType === 'macro' && route.sourceId === targetId) {
        route.sourceValue = normalized;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [nextTargetId, nextParameterId] = destination.split('\n');
      applyMockModulationTarget(rack, nextTargetId, nextParameterId);
    }
    return;
  }
  const part = rack.parts.find((candidate) => candidate.partId === targetId);
  if (!part) return;
  if (parameterId === '@gain') part.volume = normalized * 2;
  else if (parameterId === '@pan') part.pan = normalized * 2 - 1;
  else if (parameterId.startsWith('@send:')) {
    const returnId = parameterId.slice(6);
    let send = part.sends.find((candidate) => candidate.returnId === returnId);
    if (!send) part.sends.push((send = { returnId, level: 0 }));
    send.level = normalized * 2;
  }
}

function applyMockModulationTarget(rack, targetId, parameterId) {
  const routes = rack.modulationRoutes.filter(
    (route) => route.targetId === targetId && route.parameterId === parameterId);
  if (routes.length === 0 || !parameterId.startsWith('@')) return;
  const contribution = routes.filter((route) => route.enabled && route.resolved)
    .reduce((sum, route) => sum + route.amount
      * (route.sourceType === 'pitchBend' ? route.sourceValue * 2 - 1 : route.sourceValue), 0);
  writeMockVirtualTarget(rack, targetId, parameterId, routes[0].baseValue + contribution);
}

function mockMidiLfoShape(lfo, phase, cycle) {
  if (lfo.shape === 'triangle') return 1 - Math.abs(phase * 2 - 1);
  if (lfo.shape === 'sawUp') return phase;
  if (lfo.shape === 'sawDown') return 1 - phase;
  if (lfo.shape === 'square') return phase < 0.5 ? 0 : 1;
  if (lfo.shape === 'sampleHold') {
    let hash = 2166136261;
    for (const ch of `${lfo.lfoId}:${cycle}`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 8) / 0xffffff;
  }
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * phase);
}

/** Advances browser-preview LFOs without pretending to transmit hardware MIDI. Native uses
 *  the shared transport; this pure mirror lets tests and localhost exercise the same shapes,
 *  ranges and matrix destinations. */
export function advanceMockMidiLfos(state, elapsedSeconds) {
  const next = normalizeHostState(state);
  const elapsed = Math.max(0, Math.min(1, Number(elapsedSeconds) || 0));
  const tempo = Math.max(20, Math.min(300, Number(next.performance?.transport?.tempo ?? 120) || 120));
  const destinations = new Set();
  for (const lfo of next.rack.midiLfos) {
    if (lfo.enabled) {
      const cyclesPerSecond = lfo.sync ? tempo / (60 * lfo.syncBeats) : lfo.rateHz;
      lfo._cycles += elapsed * cyclesPerSecond;
      const withOffset = lfo._cycles + lfo.phaseOffset;
      lfo.phase = ((withOffset % 1) + 1) % 1;
      const shaped = mockMidiLfoShape(lfo, lfo.phase, Math.floor(withOffset));
      lfo.value = Math.max(0, Math.min(1, lfo.minimum + shaped * (lfo.maximum - lfo.minimum)));
    } else {
      lfo.value = 0;
    }
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'lfo' && route.sourceId === lfo.lfoId) {
        route.sourceValue = lfo.value;
        route.resolved = true;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
  }
  for (const destination of destinations) {
    const [targetId, parameterId] = destination.split('\n');
    applyMockModulationTarget(next.rack, targetId, parameterId);
  }
  return next;
}

function mockEnvelopeShape(progress, curve, falling) {
  const p = Math.max(0, Math.min(1, progress));
  const exponent = 4 ** Math.max(-1, Math.min(1, curve));
  return falling ? 1 - ((1 - p) ** exponent) : p ** exponent;
}

/** Pure browser mirror of the native ADSR control-rate engine. */
export function advanceMockEnvelopes(state, elapsedSeconds) {
  const next = normalizeHostState(state);
  const elapsed = Math.max(0, Math.min(1, Number(elapsedSeconds) || 0));
  const destinations = new Set();
  for (const envelope of next.rack.envelopes) {
    if (!envelope.enabled) {
      envelope.stage = 'idle';
      envelope.stageProgress = 0;
      envelope._stageElapsed = 0;
      envelope.value = 0;
      envelope.gate = false;
    } else {
      let remaining = elapsed;
      for (let transitions = 0; transitions < 5; transitions += 1) {
        if (envelope.stage === 'idle') {
          envelope.value = 0;
          envelope.stageProgress = 0;
          break;
        }
        if (envelope.stage === 'sustain') {
          envelope.value = envelope._peak * envelope.sustain;
          envelope.stageProgress = 1;
          break;
        }
        const duration = 0.001 * (envelope.stage === 'attack' ? envelope.attackMs
          : envelope.stage === 'decay' ? envelope.decayMs : envelope.releaseMs);
        if (duration <= 0) envelope.stageProgress = 1;
        else {
          const consumed = Math.min(remaining, Math.max(0, duration - envelope._stageElapsed));
          envelope._stageElapsed += consumed;
          remaining -= consumed;
          envelope.stageProgress = Math.max(0, Math.min(1, envelope._stageElapsed / duration));
        }
        if (envelope.stage === 'attack') {
          const shaped = mockEnvelopeShape(envelope.stageProgress, envelope.curve, false);
          envelope.value = envelope._stageStartValue
            + (envelope._peak - envelope._stageStartValue) * shaped;
          if (envelope.stageProgress >= 1) {
            envelope.value = envelope._peak;
            envelope.stage = 'decay';
            envelope._stageElapsed = 0;
            envelope._stageStartValue = envelope._peak;
            envelope.stageProgress = 0;
            continue;
          }
        } else if (envelope.stage === 'decay') {
          const target = envelope._peak * envelope.sustain;
          const shaped = mockEnvelopeShape(envelope.stageProgress, envelope.curve, true);
          envelope.value = envelope._stageStartValue + (target - envelope._stageStartValue) * shaped;
          if (envelope.stageProgress >= 1) {
            envelope.value = target;
            envelope.stage = envelope.gate ? 'sustain' : 'release';
            envelope._stageElapsed = 0;
            envelope._stageStartValue = envelope.value;
            envelope.stageProgress = 0;
            continue;
          }
        } else {
          const shaped = mockEnvelopeShape(envelope.stageProgress, envelope.curve, true);
          envelope.value = envelope._stageStartValue * (1 - shaped);
          if (envelope.stageProgress >= 1) {
            envelope.value = 0;
            envelope.stage = 'idle';
            envelope._stageElapsed = 0;
            envelope.stageProgress = 0;
            continue;
          }
        }
        break;
      }
    }
    envelope.value = Math.max(0, Math.min(1, envelope.value));
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'envelope' && route.sourceId === envelope.envelopeId) {
        route.sourceValue = envelope.value;
        route.resolved = true;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
  }
  for (const destination of destinations) {
    const [targetId, parameterId] = destination.split('\n');
    applyMockModulationTarget(next.rack, targetId, parameterId);
  }
  return next;
}

function mockMsegValue(mseg, phase) {
  if (mseg.points.length === 0) return 0;
  let value = mseg.points[0].value;
  for (let index = 1; index < mseg.points.length; index += 1) {
    const left = mseg.points[index - 1];
    const right = mseg.points[index];
    if (phase > right.position) {
      value = right.value;
      continue;
    }
    const span = right.position - left.position;
    if (span <= 0.000001) return right.value;
    const progress = Math.max(0, Math.min(1, (phase - left.position) / span));
    const shaped = progress ** (4 ** right.curve);
    return Math.max(0, Math.min(1, left.value + (right.value - left.value) * shaped));
  }
  return Math.max(0, Math.min(1, value));
}

/** Advances browser-preview MSEGs using the same curved-segment interpolation as native. */
export function advanceMockMsegs(state, elapsedSeconds) {
  const next = normalizeHostState(state);
  const elapsed = Math.max(0, Math.min(1, Number(elapsedSeconds) || 0));
  const tempo = Math.max(20, Math.min(300, Number(next.performance?.transport?.tempo ?? 120) || 120));
  const destinations = new Set();
  for (const mseg of next.rack.msegs) {
    if (mseg.enabled) {
      const cyclesPerSecond = mseg.sync ? tempo / (60 * mseg.syncBeats) : mseg.rateHz;
      mseg._cycles += elapsed * cyclesPerSecond;
      mseg.phase = ((mseg._cycles + mseg.phaseOffset) % 1 + 1) % 1;
      mseg.value = mockMsegValue(mseg, mseg.phase);
    } else {
      mseg.value = 0;
    }
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'mseg' && route.sourceId === mseg.msegId) {
        route.sourceValue = mseg.value;
        route.resolved = true;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
  }
  for (const destination of destinations) {
    const [targetId, parameterId] = destination.split('\n');
    applyMockModulationTarget(next.rack, targetId, parameterId);
  }
  return next;
}

/** Stable 24-bit unit random matching the native xorshift hash. */
export function deterministicRandomUnit(seed, step, salt = 0) {
  let x = ((Number(seed) >>> 0) ^ (Number(salt) >>> 0)
    ^ Math.imul(Number(step) >>> 0, 0x9e3779b9)) >>> 0;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  return (x & 0x00ffffff) / 16777215;
}

function resetMockRandomRuntime(random, keepCycles = false) {
  if (!keepCycles) random._cycles = 0;
  random.step = -1;
  random.phase = 0;
  random._previous = 0.5;
  random._target = 0.5;
  random._chaosValue = 0.5;
  random._walkValue = 0.5;
  random._initialized = false;
  random.value = 0;
}

/** Advances seeded browser-preview random modulators with native-equivalent decisions. */
export function advanceMockRandomModulators(state, elapsedSeconds) {
  const next = normalizeHostState(state);
  const elapsed = Math.max(0, Math.min(1, Number(elapsedSeconds) || 0));
  const tempo = Math.max(20, Math.min(300,
    Number(next.performance?.transport?.tempo ?? 120) || 120));
  const destinations = new Set();
  for (const random of next.rack.randomModulators) {
    if (random.enabled) {
      if (!random._initialized) {
        random._initialized = true;
        random._chaosValue = 0.05
          + 0.9 * deterministicRandomUnit(random.seed, 0, 0x68bc21eb);
      }
      const decisionsPerSecond = random.sync
        ? tempo / (60 * random.syncBeats) : random.rateHz;
      random._cycles += elapsed * decisionsPerSecond;
      const stepIndex = Math.floor(Math.max(0, random._cycles));
      random.phase = Math.max(0, random._cycles) - stepIndex;

      if (stepIndex < random.step || random.step < stepIndex - 4096) {
        random.step = Math.max(-1, stepIndex - 4096);
        random._previous = random._target = 0.5;
        random._walkValue = 0.5;
        random._chaosValue = 0.05 + 0.9 * deterministicRandomUnit(
          random.seed, random.step + 1, 0x68bc21eb);
      }
      while (random.step < stepIndex) {
        const nextStep = random.step + 1;
        const decision = deterministicRandomUnit(random.seed, nextStep, 0xa341316c);
        const changes = random.probability >= 1 || decision < random.probability;
        if (random.mode === 'smoothRandom') {
          random._previous = random._target;
          if (changes)
            random._target = deterministicRandomUnit(random.seed, nextStep, 0xc8013ea4);
        } else if (random.mode === 'chaos') {
          if (changes) {
            const intensity = 3.57 + 0.43 * random.chaos;
            random._chaosValue = Math.max(0.0001, Math.min(0.9999,
              intensity * random._chaosValue * (1 - random._chaosValue)));
            random._target = random._chaosValue;
          }
          random._previous = random._target;
        } else if (random.mode === 'randomWalk') {
          if (changes) {
            const direction = deterministicRandomUnit(
              random.seed, nextStep, 0xad90777d) * 2 - 1;
            let walked = random._walkValue + direction * random.stepSize;
            if (walked < 0) walked = -walked;
            if (walked > 1) walked = 2 - walked;
            random._walkValue = Math.max(0, Math.min(1, walked));
            random._target = random._walkValue;
          }
          random._previous = random._target;
        } else {
          if (changes)
            random._target = deterministicRandomUnit(random.seed, nextStep, 0xc8013ea4);
          random._previous = random._target;
        }
        random.step = nextStep;
      }

      let normalized = random._target;
      if (random.mode === 'smoothRandom') {
        let progress = random.smoothing <= 0 ? 1
          : Math.max(0, Math.min(1, random.phase / Math.max(0.0001, random.smoothing)));
        progress = progress * progress * (3 - 2 * progress);
        normalized = random._previous + (random._target - random._previous) * progress;
      }
      random.value = random.minimum + Math.max(0, Math.min(1, normalized))
        * (random.maximum - random.minimum);
    } else {
      random.value = 0;
    }
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'random' && route.sourceId === random.randomId) {
        route.sourceValue = random.value;
        route.resolved = true;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
  }
  for (const destination of destinations) {
    const [targetId, parameterId] = destination.split('\n');
    applyMockModulationTarget(next.rack, targetId, parameterId);
  }
  return next;
}

/** Linear snapshot interpolation is deliberately boring and predictable: all destinations
 * share one progress value, so a multi-control move arrives as one performance gesture. */
export function snapshotMorphValue(startValue, endValue, progress) {
  const start = Math.max(0, Math.min(1, Number(startValue) || 0));
  const end = Math.max(0, Math.min(1, Number(endValue) || 0));
  const position = Math.max(0, Math.min(1, Number(progress) || 0));
  return start + (end - start) * position;
}

function captureMockSnapshot(scene, state) {
  scene.slots = state.rack.parts.map((part) => ({
    partId: part.partId, enabled: part.enabled, mute: part.mute,
    volume: part.volume, applyVolume: true, pan: part.pan, applyPan: true,
  }));
  scene.macros = state.rack.macros.map((macro) => ({
    macroId: macro.macroId, value: macro.value,
  }));
  const seen = new Set();
  scene.parameters = state.rack.pages.flatMap((page) => page.slots).flatMap((slot) => {
    const address = `${slot.partId}\n${slot.parameterId}`;
    if (!slot.assigned || !slot.resolved || seen.has(address)
        || ['@gain', '@pan', '@macro'].includes(slot.parameterId)) return [];
    seen.add(address);
    return [{
      targetId: slot.partId,
      targetCeId: state.rack.parts.find((part) => part.partId === slot.partId)?.pluginCeId ?? '',
      parameterId: slot.parameterId,
      value: slot.value,
    }];
  });
  scene.numSlots = scene.slots.length;
  scene.numMacros = scene.macros.length;
  scene.numParameters = scene.parameters.length;
}

function applyMockSnapshot(scene, state) {
  for (const slot of scene.slots) {
    const target = state.rack.parts.find((part) => part.partId === slot.partId);
    if (!target) continue;
    target.enabled = slot.enabled;
    target.mute = slot.mute;
    if (slot.applyVolume) target.volume = slot.volume;
    if (slot.applyPan) target.pan = slot.pan;
  }
  for (const macro of scene.macros)
    writeMockVirtualTarget(state.rack, macro.macroId, '@macro', macro.value);
  for (const parameter of scene.parameters) {
    if (parameter.parameterId.startsWith('@')) {
      writeMockVirtualTarget(state.rack, parameter.targetId, parameter.parameterId, parameter.value);
      continue;
    }
    const target = state.rack.parts.find((part) => part.partId === parameter.targetId);
    if (!target || target.pluginCeId !== parameter.targetCeId) continue;
    for (const page of state.rack.pages)
      for (const slot of page.slots)
        if (slot.partId === parameter.targetId && slot.parameterId === parameter.parameterId)
          slot.value = parameter.value;
  }
}

/** The mock reducer: applies one command to a normalized state, so the browser-only app
 *  behaves instead of stalling. Deliberately mirrors the native semantics the tests pin. */
export function applyMockCommand(state, payload) {
  const cmd = payload?.cmd;
  const next = normalizeHostState(state);
  const part = (id) => next.rack.parts.find((p) => p.partId === id);

  if (cmd === 'setStageLock') {
    if (payload?.enabled === true) next.stageLocked = true;
    else if (payload?._unlockAuthorized === true) next.stageLocked = false;
    return next;
  }
  if (cmd === 'beginStageUnlock' || cmd === 'cancelStageUnlock') return next;
  if (!stageCommandAllowed(next.stageLocked, cmd)) return next;

  if (cmd === 'startPerformanceRecording') {
    if (next.performance.performanceReplay.state !== 'idle') return next;
    next.performance.performanceRecorder = {
      recording: true,
      name: String(payload.name || `Performance ${next.performance.performanceTakes.length + 1}`),
      elapsedSeconds: 0, midiEventCount: 0, actionCount: 0, truncated: false,
    };
    return next;
  }
  if (cmd === 'cancelPerformanceRecording') {
    next.performance.performanceRecorder = {
      recording: false, name: '', elapsedSeconds: 0, midiEventCount: 0,
      actionCount: 0, truncated: false,
    };
    return next;
  }
  if (cmd === 'finishPerformanceRecording') {
    const recorder = next.performance.performanceRecorder;
    if (!recorder.recording) return next;
    next.performance.performanceTakes.push({
      takeId: nextMockId('mock-performance-take'),
      name: recorder.name,
      createdAt: new Date().toISOString(),
      durationSeconds: Math.max(0.1, recorder.elapsedSeconds),
      midiEventCount: recorder.midiEventCount,
      actionCount: recorder.actionCount,
      truncated: recorder.truncated,
    });
    next.performance.performanceRecorder = {
      recording: false, name: '', elapsedSeconds: 0, midiEventCount: 0,
      actionCount: 0, truncated: false,
    };
    return next;
  }
  if (cmd === 'removePerformanceTake') {
    next.performance.performanceTakes = next.performance.performanceTakes
      .filter((take) => take.takeId !== payload.takeId);
    if (next.performance.performanceReplay.takeId === payload.takeId)
      next.performance.performanceReplay = {
        state: 'idle', takeId: '', name: '', progress: 0, degraded: false,
      };
    return next;
  }
  if (cmd === 'replayPerformanceTake') {
    const take = next.performance.performanceTakes.find(
      (candidate) => candidate.takeId === payload.takeId);
    if (!take || next.performance.performanceRecorder.recording) return next;
    next.performance.performanceReplay = {
      state: 'playing', takeId: take.takeId, name: take.name, progress: 0, degraded: false,
    };
    return next;
  }
  if (cmd === 'stopPerformanceReplay') {
    next.performance.performanceReplay = {
      state: 'idle', takeId: '', name: '', progress: 0, degraded: false,
    };
    return next;
  }

  if (cmd === 'setPluginArtwork' || cmd === 'clearPluginArtwork') {
    // The mock cannot read a file off disk, so it models the one thing the UI reacts to: who
    // is showing a picture of their own. Enough for the buttons to be exercised in a browser.
    const custom = cmd === 'setPluginArtwork';
    for (const list of [next.instruments, next.effectClasses])
      for (const record of list)
        if (record.ceId === payload.ceId) {
          record.artworkSource = custom ? 'custom' : '';
          record.snapshotUrl = custom ? `/plugin-snapshot/mock-${record.ceId}` : '';
        }
    return next;
  }
  if (cmd === 'setCanvasPosition') {
    const positions = next.rack.canvasPositions.filter((c) => c.nodeId !== payload.nodeId);
    positions.push({ nodeId: String(payload.nodeId), x: Number(payload.x) || 0, y: Number(payload.y) || 0 });
    next.rack.canvasPositions = positions;
    return next;
  }
  if (cmd === 'clearCanvasPositions') {
    next.rack.canvasPositions = [];
    return next;
  }
  if (cmd === 'addPart') {
    const partId = nextMockId('mock-part');
    // A new part starts with the same two modules the native side mints, both idle.
    next.rack.parts.push(normalizeHostState({ rack: { parts: [{ partId, midiChain: [
      { slotId: `${partId}-fx`, type: 'fx' }, { slotId: `${partId}-arp`, type: 'arp' },
    ] }] } }).rack.parts[0]);
    if (!next.rack.focusedPartId) next.rack.focusedPartId = partId;
    return next;
  }
  if (cmd === 'movePart') {
    const from = next.rack.parts.findIndex((p) => p.partId === payload.partId);
    if (from < 0) return next;
    const to = Math.max(0, Math.min(next.rack.parts.length - 1,
      Math.round(Number(payload.index) || 0)));
    const [moved] = next.rack.parts.splice(from, 1);
    next.rack.parts.splice(to, 0, moved);
    return next;
  }
  if (cmd === 'removePart') {
    next.rack.parts = next.rack.parts.filter((p) => p.partId !== payload.partId);
    // Dependents go back to the keyboard rather than staying wired to nothing.
    for (const p of next.rack.parts)
      if (p.midiSourcePartId === payload.partId) p.midiSourcePartId = '';
    next.rack.layerGroups = next.rack.layerGroups.map((group) => ({
      ...group, members: group.members.filter((member) => member.partId !== payload.partId),
    })).filter((group) => group.members.length >= 2);
    if (next.rack.focusedPartId === payload.partId)
      next.rack.focusedPartId = next.rack.parts[0]?.partId ?? '';
    if (next.editorOpenPartId === payload.partId) next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'focusPart') {
    if (part(payload.partId)) {
      next.rack.focusedPartId = payload.partId;
      // The editor follows focus, hiding over an empty part — the native rule, mirrored.
      if (next.editorOpenPartId && next.editorOpenPartId !== payload.partId)
        next.editorOpenPartId = part(payload.partId)?.hasInstrument ? payload.partId : '';
    }
    return next;
  }
  if (cmd === 'openEditor') {
    if (part(payload.partId)?.hasInstrument) {
      next.editorOpenPartId = payload.partId;
      // One editor per processor: docking pulls a floating part back in.
      next.floatingEditorPartIds = next.floatingEditorPartIds.filter((id) => id !== payload.partId);
    }
    return next;
  }
  if (cmd === 'floatEditor') {
    const effectTargets = [...next.rack.masterEffects,
                           ...next.rack.parts.flatMap((p) => p.effects),
                           ...next.rack.returns.flatMap((r) => r.effects)];
    const isLiveEffect = effectTargets.some((e) => e.effectId === payload.partId && e.hasProcessor);
    if (part(payload.partId)?.hasInstrument || isLiveEffect) {
      if (next.editorOpenPartId === payload.partId) next.editorOpenPartId = '';
      if (!next.floatingEditorPartIds.includes(payload.partId))
        next.floatingEditorPartIds = [...next.floatingEditorPartIds, payload.partId];
    }
    return next;
  }
  if (cmd === 'closeEditorWindow') {
    next.floatingEditorPartIds = next.floatingEditorPartIds.filter((id) => id !== payload.partId);
    return next;
  }
  if (cmd === 'closeEditor') {
    next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'loadInstrument') {
    let target = part(payload.partId);
    // The native rule, mirrored: no part named means "into a new part", so the first click an
    // empty rack sees actually does something. An explicit unknown id is still a stale UI.
    if (!target && !payload.partId) {
      target = {
        partId: `mock-part-${next.rack.parts.length + 1}`,
        pluginCeId: '', pluginName: '', pluginVendor: '', hasInstrument: false,
        unresolved: false, outputPair: 0,
        enabled: true, mute: false, solo: false, volume: 1, pan: 0,
        midi: { channel: 0, lowNote: 0, highNote: 127, lowVelocity: 1, highVelocity: 127, transpose: 0 },
        midiFx: { transpose: 0, constrainToScale: false, scaleType: 'major', scaleRoot: 0,
                  chordMode: 'off', velocityScale: 1, fixedVelocity: 0 },
        arp: { enabled: false, mode: 'up', rate: 4, gate: 0.8, octaves: 1, swing: 0, latch: false },
        effects: [], sends: [], extraOuts: [],
      };
      next.rack.parts.push(target);
      next.rack.focusedPartId = target.partId;
    }
    const instrument = next.instruments.find((i) => i.ceId === payload.ceId);
    if (target && instrument) {
      target.pluginCeId = instrument.ceId;
      target.pluginName = instrument.name;
      target.pluginVendor = instrument.vendor;
      target.hasInstrument = true;
      target.unresolved = false;
    }
    return next;
  }
  if (cmd === 'unloadInstrument') {
    const target = part(payload.partId);
    if (target) { target.hasInstrument = false; target.unresolved = target.pluginCeId !== ''; }
    if (next.editorOpenPartId === payload.partId) next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'setPartMixer') {
    const target = part(payload.partId);
    if (target)
      for (const key of ['enabled', 'mute', 'solo', 'volume', 'pan'])
        if (payload[key] !== undefined) target[key] = payload[key];
    return next;
  }
  if (cmd === 'setPartMidiRules') {
    const target = part(payload.partId);
    if (target)
      for (const key of ['channel', 'keyLow', 'keyHigh', 'velocityLow', 'velocityHigh', 'transpose'])
        if (payload[key] !== undefined) target[key] = Number(payload[key]);
    return next;
  }
  if (cmd === 'importScalaTuning') {
    try {
      const imported = parseScalaTuning(payload.text, payload.sourceName);
      const current = next.rack.microtuning;
      next.rack.microtuning = normalizeMicrotuning({ ...imported,
        rootMidiNote: current.rootMidiNote,
        referenceMidiNote: current.referenceMidiNote,
        referenceFrequency: current.referenceFrequency,
        mtsDeviceId: current.mtsDeviceId,
        mtsProgram: current.mtsProgram,
      });
      for (const target of next.rack.parts) target.microtuningError = '';
    } catch { /* The native app reports the parser error; browser preview keeps the old table. */ }
    return next;
  }
  if (cmd === 'resetMicrotuning') {
    const { mtsDeviceId, mtsProgram } = next.rack.microtuning;
    next.rack.microtuning = normalizeMicrotuning({ mtsDeviceId, mtsProgram });
    for (const target of next.rack.parts) target.microtuningError = '';
    return next;
  }
  if (cmd === 'setMicrotuning') {
    next.rack.microtuning = normalizeMicrotuning({ ...next.rack.microtuning, ...payload,
      degreesCents: next.rack.microtuning.degreesCents,
    });
    for (const target of next.rack.parts) target.microtuningError = '';
    return next;
  }
  if (cmd === 'setPartMicrotuning') {
    const target = part(payload.partId);
    if (target) {
      target.microtuningEnabled = payload.enabled === true;
      target.microtuningError = target.microtuningEnabled && next.rack.microtuning.enabled
        && ((!target.hardware && !target.hasInstrument)
          || (target.hardware && !target.midiOutputId))
        ? (target.hardware ? 'Choose a MIDI output before sending this tuning.'
                           : 'Load an instrument before sending this tuning.') : '';
    }
    return next;
  }
  if (cmd === 'sendMicrotuning') {
    const targets = payload.partId ? [part(payload.partId)].filter(Boolean)
      : next.rack.parts.filter((target) => target.microtuningEnabled);
    for (const target of targets) {
      target.microtuningError = !target.microtuningEnabled
        ? 'Microtuning is not enabled for that part.'
        : target.hardware && !target.midiOutputId
        ? 'Choose a MIDI output before sending this tuning.'
        : !target.hardware && !target.hasInstrument
        ? 'Load an instrument before sending this tuning.' : '';
    }
    return next;
  }
  if (cmd === 'clearQuarantine') {
    const module = next.modules.find((m) => m.path === payload.modulePath);
    if (module) { module.quarantined = false; module.failureCount = 0; module.lastFailureReason = ''; }
    return next;
  }
  if (cmd === 'addScanPath') {
    if (payload.path && !next.scanPaths.includes(payload.path)) next.scanPaths.push(payload.path);
    return next;
  }
  if (cmd === 'browseScanPath') {
    // No native dialog in a plain browser; stand in with a fixed choice so the flow demos.
    if (!next.scanPaths.includes('D:\\Browsed VST3s')) next.scanPaths.push('D:\\Browsed VST3s');
    return next;
  }
  if (cmd === 'addEffect') {
    const effectClass = next.effectClasses.find((c) => c.ceId === payload.ceId);
    if (!effectClass) return next;
    const slot = normalizeHostState({ rack: { masterEffects: [{
      effectId: nextMockId('mock-fx'),
      pluginCeId: effectClass.ceId, pluginName: effectClass.name, pluginVendor: effectClass.vendor,
      hasProcessor: true,
    }] } }).rack.masterEffects[0];
    if (payload.chainId === 'master') next.rack.masterEffects.push(slot);
    else if (part(payload.chainId)) part(payload.chainId).effects.push(slot);
    else next.rack.returns.find((r) => r.returnId === payload.chainId)?.effects.push(slot);
    return next;
  }
  if (cmd === 'removeEffect' || cmd === 'setEffectBypassed' || cmd === 'moveEffect') {
    const chains = [next.rack.masterEffects, ...next.rack.parts.map((p) => p.effects),
                    ...next.rack.returns.map((r) => r.effects)];
    for (const chain of chains) {
      const index = chain.findIndex((e) => e.effectId === payload.effectId);
      if (index < 0) continue;
      if (cmd === 'removeEffect') chain.splice(index, 1);
      else if (cmd === 'setEffectBypassed') chain[index].bypassed = payload.bypassed === true;
      else chain.splice(Math.max(0, Math.min(chain.length - 1, Number(payload.index ?? 0))), 0,
                        ...chain.splice(index, 1));
      break;
    }
    return next;
  }
  if (cmd === 'addReturn') {
    next.rack.returns.push(normalizeHostState({ rack: { returns: [{
      returnId: nextMockId('mock-return'),
      name: payload.name || `Return ${next.rack.returns.length + 1}`,
    }] } }).rack.returns[0]);
    return next;
  }
  if (cmd === 'removeReturn') {
    next.rack.returns = next.rack.returns.filter((r) => r.returnId !== payload.returnId);
    // The native rule, mirrored: stranded sends are dropped, never kept dangling.
    for (const p of next.rack.parts)
      p.sends = p.sends.filter((s) => s.returnId !== payload.returnId);
    return next;
  }
  if (cmd === 'renameReturn') {
    const ret = next.rack.returns.find((r) => r.returnId === payload.returnId);
    if (ret) ret.name = String(payload.name ?? ret.name);
    return next;
  }
  if (cmd === 'setReturnLevel') {
    const ret = next.rack.returns.find((r) => r.returnId === payload.returnId);
    if (ret) ret.level = Math.min(2, Math.max(0, Number(payload.level ?? 1)));
    return next;
  }
  if (cmd === 'setSendLevel') {
    const target = part(payload.partId);
    if (!target || !next.rack.returns.some((r) => r.returnId === payload.returnId)) return next;
    const level = Math.min(2, Math.max(0, Number(payload.level ?? 0)));
    const send = target.sends.find((s) => s.returnId === payload.returnId);
    if (send) send.level = level;
    else target.sends.push({ returnId: payload.returnId, level });
    return next;
  }
  if (cmd === 'setExtraOut') {
    const target = part(payload.partId);
    const pairIndex = Number(payload.pairIndex ?? 0);
    if (!target || pairIndex < 1) return next;
    const gain = Math.min(2, Math.max(0, Number(payload.gain ?? 1)));
    const extra = target.extraOuts.find((o) => o.pairIndex === pairIndex);
    if (extra) extra.gain = gain;
    else target.extraOuts.push({ pairIndex, gain });
    return next;
  }
  if (cmd === 'removeExtraOut') {
    const target = part(payload.partId);
    if (target) target.extraOuts = target.extraOuts.filter((o) => o.pairIndex !== Number(payload.pairIndex));
    return next;
  }
  if (cmd === 'setHardwareConfig') {
    const target = part(payload.partId);
    if (!target) return next;
    target.hardware = true;
    target.hasInstrument = false;
    for (const key of ['midiOutputId', 'midiOutputName', 'deviceProfileId'])
      if (payload[key] !== undefined) target[key] = String(payload[key]);
    for (const key of ['midiOutChannel', 'audioReturnChannel', 'programBank', 'programNumber'])
      if (payload[key] !== undefined) target[key] = Number(payload[key]);
    if (payload.audioReturnStereo !== undefined) target.audioReturnStereo = payload.audioReturnStereo === true;
    // Where this synth's patches are filed, as native derives it: the profile, else the port.
    target.hardwarePatchTarget = `hw:${String(target.deviceProfileId || target.midiOutputName || '').trim().toLowerCase()}`;
    // The port-gone diagnostic, mirrored against the mock device list.
    target.midiOutError = target.midiOutputId
      && !['mock-out-1', 'mock-out-2'].includes(target.midiOutputId)
      ? 'No such MIDI output.' : '';
    return next;
  }
  if (cmd === 'clearHardware') {
    const target = part(payload.partId);
    if (target) { target.hardware = false; target.midiOutError = ''; target.hardwarePatchTarget = ''; }
    return next;
  }
  if (cmd === 'sendHardwareProgram') {
    return next; // nothing observable in the browser — the port lives with the native side
  }
  if (cmd === 'finishHardwarePatchCapture') {
    const target = part(payload.partId);
    if (target && mockPatchBytes > 0) {
      target.hardwarePatchName = String(payload.name || 'Captured patch');
      target.hardwarePatchBytes = mockPatchBytes;
    }
    return next;
  }
  if (cmd === 'clearHardwarePatch') {
    const target = part(payload.partId);
    if (target) { target.hardwarePatchName = ''; target.hardwarePatchBytes = 0; }
    return next;
  }
  if (cmd === 'setHardwareRestorePolicy') {
    const target = part(payload.partId);
    if (target && ['ask', 'always', 'never'].includes(payload.policy))
      target.hardwareRestore = payload.policy;
    return next;
  }
  if (cmd === 'captureHardwarePatch' || cmd === 'cancelHardwarePatchCapture'
      || cmd === 'sendHardwarePatch') {
    return next; // the sysex itself only exists natively; the arming lives in the store
  }
  if (cmd === 'addLayerGroup') {
    if (next.rack.layerGroups.length >= 32) return next;
    const claimed = new Set(next.rack.layerGroups.flatMap(
      (group) => group.members.map((member) => member.partId)));
    const requested = Array.isArray(payload.partIds) ? payload.partIds.map(String) : [];
    const eligible = (requested.length > 0 ? requested
      : next.rack.parts.map((candidate) => candidate.partId))
      .filter((partId, index, all) => all.indexOf(partId) === index && !claimed.has(partId)
        && !part(partId)?.midiSourcePartId).slice(0, 8);
    if (eligible.length < 2) return next;
    next.rack.layerGroups.push(normalizeHostState({ rack: { layerGroups: [{
      layerGroupId: nextMockId('mock-layer'),
      name: payload.name || `Layer ${next.rack.layerGroups.length + 1}`,
      members: eligible.slice(0, requested.length > 0 ? 8 : 2).map((partId) => ({
        partId, partName: part(partId)?.pluginName || 'Empty part', minimum: 0, maximum: 1,
      })),
    }] } }).rack.layerGroups[0]);
    return next;
  }
  if (cmd === 'removeLayerGroup') {
    next.rack.layerGroups = next.rack.layerGroups.filter(
      (group) => group.layerGroupId !== payload.layerGroupId);
    return next;
  }
  if (cmd === 'setLayerGroup') {
    const group = next.rack.layerGroups.find(
      (candidate) => candidate.layerGroupId === payload.layerGroupId);
    if (!group) return next;
    if (payload.name !== undefined) group.name = String(payload.name).slice(0, 80);
    if (payload.enabled !== undefined) group.enabled = payload.enabled === true;
    if (['all', 'roundRobin', 'leastBusy'].includes(payload.allocation))
      group.allocation = payload.allocation;
    if (['velocity', 'key', 'cc', 'expression', 'macro'].includes(payload.source))
      group.source = payload.source;
    if (payload.controller !== undefined)
      group.controller = Math.max(0, Math.min(127, Math.round(Number(payload.controller) || 0)));
    if (payload.macroId !== undefined) group.macroId = String(payload.macroId);
    if (group.source !== 'macro') group.macroId = '';
    return next;
  }
  if (cmd === 'addLayerMember') {
    const group = next.rack.layerGroups.find(
      (candidate) => candidate.layerGroupId === payload.layerGroupId);
    const target = part(payload.partId);
    const claimedElsewhere = next.rack.layerGroups.some((candidate) => candidate !== group
      && candidate.members.some((member) => member.partId === payload.partId));
    if (!group || !target || target.midiSourcePartId || claimedElsewhere
        || group.members.some((member) => member.partId === payload.partId)
        || group.members.length >= 8) return next;
    group.members.push({ partId: target.partId, partName: target.pluginName || 'Empty part',
                         minimum: 0, maximum: 1, crossfade: 0, resolved: true });
    return next;
  }
  if (cmd === 'removeLayerMember' || cmd === 'setLayerMember') {
    const group = next.rack.layerGroups.find(
      (candidate) => candidate.layerGroupId === payload.layerGroupId);
    const member = group?.members.find((candidate) => candidate.partId === payload.partId);
    if (!group || !member) return next;
    if (cmd === 'removeLayerMember') {
      group.members = group.members.filter((candidate) => candidate.partId !== payload.partId);
      if (group.members.length < 2)
        next.rack.layerGroups = next.rack.layerGroups.filter((candidate) => candidate !== group);
      return next;
    }
    if (payload.minimum !== undefined)
      member.minimum = Math.max(0, Math.min(1, Number(payload.minimum) || 0));
    if (payload.maximum !== undefined)
      member.maximum = Math.max(0, Math.min(1, Number(payload.maximum) || 0));
    if (member.minimum > member.maximum)
      [member.minimum, member.maximum] = [member.maximum, member.minimum];
    if (payload.crossfade !== undefined)
      member.crossfade = Math.max(0, Math.min(0.5, Number(payload.crossfade) || 0));
    return next;
  }
  if (cmd === 'addMacro') {
    next.rack.macros.push(normalizeHostState({ rack: { macros: [{
      macroId: nextMockId('mock-macro'),
      name: payload.name || `Macro ${next.rack.macros.length + 1}`,
    }] } }).rack.macros[0]);
    return next;
  }
  if (cmd === 'removeMacro') {
    next.rack.macros = next.rack.macros.filter((m) => m.macroId !== payload.macroId);
    for (const group of next.rack.layerGroups)
      if (group.source === 'macro' && group.macroId === payload.macroId)
        Object.assign(group, { source: 'velocity', macroId: '' });
    const destinations = new Set();
    for (const route of next.rack.modulationRoutes)
      if ((route.sourceType === 'macro' && route.sourceId === payload.macroId)
          || (route.targetId === payload.macroId && route.parameterId === '@macro')) {
        route.sourceValue = 0;
        route.resolved = false;
        if (route.sourceType === 'macro')
          destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [targetId, parameterId] = destination.split('\n');
      applyMockModulationTarget(next.rack, targetId, parameterId);
    }
    return next;
  }
  if (cmd === 'renameMacro') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) macro.name = String(payload.name ?? macro.name);
    return next;
  }
  if (cmd === 'setMacroValue') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) {
      const value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
      const incoming = next.rack.modulationRoutes.filter(
        (route) => route.targetId === macro.macroId && route.parameterId === '@macro');
      for (const route of incoming) route.baseValue = value;
      if (incoming.length > 0) applyMockModulationTarget(next.rack, macro.macroId, '@macro');
      else writeMockVirtualTarget(next.rack, macro.macroId, '@macro', value);
    }
    return next;
  }
  if (cmd === 'addMacroTarget' || cmd === 'removeMacroTarget' || cmd === 'setMacroTargetOptions') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (!macro) return next;
    if (cmd === 'removeMacroTarget') {
      macro.targets = macro.targets.filter(
        (t) => !(t.targetId === payload.targetId && t.parameterId === payload.parameterId));
    } else if (cmd === 'setMacroTargetOptions') {
      const target = macro.targets.find(
        (t) => t.targetId === payload.targetId && t.parameterId === payload.parameterId);
      if (target) {
        if (payload.rangeMin !== undefined)
          target.rangeMin = Math.max(0, Math.min(1, Number(payload.rangeMin) || 0));
        if (payload.rangeMax !== undefined)
          target.rangeMax = Math.max(0, Math.min(1, Number(payload.rangeMax) || 0));
        if (payload.inverted !== undefined) target.inverted = payload.inverted === true;
        if (target.rangeMin > target.rangeMax)
          [target.rangeMin, target.rangeMax] = [target.rangeMax, target.rangeMin];
      }
    } else if (!macro.targets.some((t) => t.targetId === payload.targetId && t.parameterId === payload.parameterId)) {
      macro.targets.push({
        targetId: String(payload.targetId ?? ''),
        parameterId: String(payload.parameterId ?? ''),
        targetName: part(payload.targetId)?.pluginName
          ?? [...next.rack.masterEffects, ...next.rack.parts.flatMap((p) => p.effects),
              ...next.rack.returns.flatMap((r) => r.effects)]
               .find((e) => e.effectId === payload.targetId)?.pluginName
          ?? '',
        displayName: mockBindingName(payload.parameterId, next.rack),
        rangeMin: 0, rangeMax: 1, inverted: false, resolved: true,
      });
    }
    return next;
  }
  if (cmd === 'addMidiLfo') {
    if (next.rack.midiLfos.length >= 32) return next;
    next.rack.midiLfos.push(normalizeHostState({ rack: { midiLfos: [{
      lfoId: nextMockId('mock-lfo'),
      name: String(payload.name ?? '') || `LFO ${next.rack.midiLfos.length + 1}`,
    }] } }).rack.midiLfos[0]);
    return advanceMockMidiLfos(next, 0);
  }
  if (cmd === 'setMidiLfo' || cmd === 'resetMidiLfo') {
    const lfo = next.rack.midiLfos.find((candidate) => candidate.lfoId === payload.lfoId);
    if (!lfo) return next;
    if (cmd === 'resetMidiLfo') {
      lfo._cycles = 0;
      lfo.phase = lfo.phaseOffset;
      return advanceMockMidiLfos(next, 0);
    }
    if (payload.name !== undefined && String(payload.name).trim()) lfo.name = String(payload.name).trim();
    if (payload.shape !== undefined
        && ['sine', 'triangle', 'sawUp', 'sawDown', 'square', 'sampleHold'].includes(payload.shape))
      lfo.shape = payload.shape;
    if (payload.enabled !== undefined) lfo.enabled = payload.enabled === true;
    if (payload.sync !== undefined) lfo.sync = payload.sync === true;
    if (payload.rateHz !== undefined) lfo.rateHz = Math.max(0.01, Math.min(40, Number(payload.rateHz) || 1));
    if (payload.syncBeats !== undefined) lfo.syncBeats = Math.max(0.03125, Math.min(64, Number(payload.syncBeats) || 1));
    if (payload.phaseOffset !== undefined) lfo.phaseOffset = Math.max(0, Math.min(1, Number(payload.phaseOffset) || 0));
    if (payload.minimum !== undefined) lfo.minimum = Math.max(0, Math.min(1, Number(payload.minimum) || 0));
    if (payload.maximum !== undefined) lfo.maximum = Math.max(0, Math.min(1, Number(payload.maximum) || 0));
    if (lfo.minimum > lfo.maximum) [lfo.minimum, lfo.maximum] = [lfo.maximum, lfo.minimum];
    return advanceMockMidiLfos(next, 0);
  }
  if (cmd === 'removeMidiLfo') {
    next.rack.midiLfos = next.rack.midiLfos.filter((lfo) => lfo.lfoId !== payload.lfoId);
    const destinations = new Set();
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'lfo' && route.sourceId === payload.lfoId) {
        route.sourceValue = 0;
        route.resolved = false;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [targetId, parameterId] = destination.split('\n');
      applyMockModulationTarget(next.rack, targetId, parameterId);
    }
    return next;
  }
  if (cmd === 'addMidiLfoOutput') {
    const lfo = next.rack.midiLfos.find((candidate) => candidate.lfoId === payload.lfoId);
    const target = part(payload.targetPartId);
    if (!lfo || !target?.hardware || lfo.outputs.length >= 32) return next;
    const type = ['cc', 'nrpn', 'sysex'].includes(payload.type) ? payload.type : 'cc';
    lfo.outputs.push({
      outputId: nextMockId('mock-lfo-out'),
      type,
      targetPartId: String(payload.targetPartId),
      targetName: target.midiOutputName || target.pluginName || 'Hardware part',
      channel: Math.max(1, Math.min(16, Number(payload.channel ?? 1) || 1)),
      number: Math.max(0, Math.min(type === 'nrpn' ? 16383 : 127,
                                  Number(payload.number ?? 1) || 0)),
      sysexTemplate: String(payload.sysexTemplate ?? 'F0 7D {value7} F7'),
      enabled: false,
      resolved: true,
    });
    return next;
  }
  if (cmd === 'setMidiLfoOutput' || cmd === 'removeMidiLfoOutput') {
    const lfo = next.rack.midiLfos.find((candidate) => candidate.lfoId === payload.lfoId);
    if (!lfo) return next;
    if (cmd === 'removeMidiLfoOutput') {
      lfo.outputs = lfo.outputs.filter((output) => output.outputId !== payload.outputId);
      return next;
    }
    const output = lfo.outputs.find((candidate) => candidate.outputId === payload.outputId);
    if (!output) return next;
    if (payload.type !== undefined && ['cc', 'nrpn', 'sysex'].includes(payload.type)) output.type = payload.type;
    if (payload.targetPartId !== undefined) output.targetPartId = String(payload.targetPartId);
    if (payload.channel !== undefined) output.channel = Math.max(1, Math.min(16, Number(payload.channel) || 1));
    if (payload.number !== undefined) output.number = Math.max(0, Math.min(output.type === 'nrpn' ? 16383 : 127,
                                                                          Number(payload.number) || 0));
    if (payload.sysexTemplate !== undefined) output.sysexTemplate = String(payload.sysexTemplate);
    if (payload.enabled !== undefined) output.enabled = payload.enabled === true;
    const target = part(output.targetPartId);
    output.resolved = target?.hardware === true;
    output.targetName = target?.midiOutputName || target?.pluginName || '';
    return next;
  }
  if (cmd === 'addEnvelope') {
    if (next.rack.envelopes.length >= 32) return next;
    next.rack.envelopes.push(normalizeHostState({ rack: { envelopes: [{
      envelopeId: nextMockId('mock-envelope'),
      name: String(payload.name ?? '') || `Envelope ${next.rack.envelopes.length + 1}`,
    }] } }).rack.envelopes[0]);
    return next;
  }
  if (cmd === 'setEnvelope') {
    const envelope = next.rack.envelopes.find((candidate) => candidate.envelopeId === payload.envelopeId);
    if (!envelope) return next;
    if (payload.name !== undefined && String(payload.name).trim()) envelope.name = String(payload.name).trim();
    if (payload.enabled !== undefined) envelope.enabled = payload.enabled === true;
    if (payload.channel !== undefined) envelope.channel = Math.max(0, Math.min(16, Number(payload.channel) || 0));
    if (payload.noteLow !== undefined) envelope.noteLow = Math.max(0, Math.min(127, Number(payload.noteLow) || 0));
    if (payload.noteHigh !== undefined) envelope.noteHigh = Math.max(0, Math.min(127, Number(payload.noteHigh) || 0));
    if (envelope.noteLow > envelope.noteHigh)
      [envelope.noteLow, envelope.noteHigh] = [envelope.noteHigh, envelope.noteLow];
    if (payload.retrigger !== undefined) envelope.retrigger = payload.retrigger === true;
    if (payload.attackMs !== undefined) envelope.attackMs = Math.max(0, Math.min(60000, Number(payload.attackMs) || 0));
    if (payload.decayMs !== undefined) envelope.decayMs = Math.max(0, Math.min(60000, Number(payload.decayMs) || 0));
    if (payload.sustain !== undefined) envelope.sustain = Math.max(0, Math.min(1, Number(payload.sustain) || 0));
    if (payload.releaseMs !== undefined) envelope.releaseMs = Math.max(0, Math.min(60000, Number(payload.releaseMs) || 0));
    if (payload.curve !== undefined) envelope.curve = Math.max(-1, Math.min(1, Number(payload.curve) || 0));
    if (payload.velocityAmount !== undefined)
      envelope.velocityAmount = Math.max(0, Math.min(1, Number(payload.velocityAmount) || 0));
    if (!envelope.enabled) {
      envelope.stage = 'idle'; envelope.value = 0; envelope.gate = false;
      envelope.stageProgress = 0; envelope._stageElapsed = 0;
    }
    return advanceMockEnvelopes(next, 0);
  }
  if (cmd === 'triggerEnvelope') {
    const envelope = next.rack.envelopes.find((candidate) => candidate.envelopeId === payload.envelopeId);
    if (!envelope || !envelope.enabled) return next;
    const gate = payload.gate !== false;
    if (gate) {
      const wasGated = envelope.gate;
      envelope.gate = true;
      if (envelope.retrigger || !wasGated) {
        envelope.stage = 'attack';
        envelope.stageProgress = 0;
        envelope._stageElapsed = 0;
        envelope._stageStartValue = envelope.value;
        const velocity = Math.max(0, Math.min(1, Number(payload.velocity ?? 1) || 0));
        envelope._peak = 1 - envelope.velocityAmount + envelope.velocityAmount * velocity;
      }
    } else {
      envelope.gate = false;
      if (!['idle', 'release'].includes(envelope.stage)) {
        envelope.stage = 'release';
        envelope.stageProgress = 0;
        envelope._stageElapsed = 0;
        envelope._stageStartValue = envelope.value;
      }
    }
    return advanceMockEnvelopes(next, 0);
  }
  if (cmd === 'resetEnvelope') {
    const envelope = next.rack.envelopes.find((candidate) => candidate.envelopeId === payload.envelopeId);
    if (!envelope) return next;
    envelope.stage = 'idle'; envelope.value = 0; envelope.gate = false;
    envelope.stageProgress = 0; envelope._stageElapsed = 0; envelope._stageStartValue = 0;
    return advanceMockEnvelopes(next, 0);
  }
  if (cmd === 'removeEnvelope') {
    next.rack.envelopes = next.rack.envelopes.filter(
      (envelope) => envelope.envelopeId !== payload.envelopeId);
    const destinations = new Set();
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'envelope' && route.sourceId === payload.envelopeId) {
        route.sourceValue = 0;
        route.resolved = false;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [targetId, parameterId] = destination.split('\n');
      applyMockModulationTarget(next.rack, targetId, parameterId);
    }
    return next;
  }
  if (cmd === 'addMseg') {
    if (next.rack.msegs.length >= 32) return next;
    const suffix = nextMockSuffix();
    next.rack.msegs.push({
      msegId: `mock-mseg-${suffix}`,
      name: String(payload.name ?? '').trim() || `MSEG ${next.rack.msegs.length + 1}`,
      enabled: true, sync: true, rateHz: 0.5, syncBeats: 4, phaseOffset: 0,
      phase: 0, value: 0, _cycles: 0,
      points: [[0, 0], [0.25, 1], [0.5, 0.2], [0.75, 0.8], [1, 0]].map(
        ([position, value], index) => ({
          pointId: `mock-mseg-point-${suffix}-${index + 1}`, position, value, curve: 0,
        })),
    });
    return advanceMockMsegs(next, 0);
  }
  if (cmd === 'setMseg') {
    const mseg = next.rack.msegs.find((candidate) => candidate.msegId === payload.msegId);
    if (!mseg) return next;
    if (payload.name !== undefined && String(payload.name).trim()) mseg.name = String(payload.name).trim();
    if (payload.enabled !== undefined) mseg.enabled = payload.enabled === true;
    if (payload.sync !== undefined) mseg.sync = payload.sync === true;
    if (payload.rateHz !== undefined) mseg.rateHz = Math.max(0.01, Math.min(40, Number(payload.rateHz) || 0.01));
    if (payload.syncBeats !== undefined)
      mseg.syncBeats = Math.max(0.03125, Math.min(64, Number(payload.syncBeats) || 0.03125));
    if (payload.phaseOffset !== undefined)
      mseg.phaseOffset = Math.max(0, Math.min(1, Number(payload.phaseOffset) || 0));
    if (payload.points !== undefined && Array.isArray(payload.points)
        && payload.points.length >= 2 && payload.points.length <= 64) {
      const seen = new Set();
      const points = payload.points.map((point, index) => {
        let pointId = String(point?.pointId ?? '');
        if (!pointId) pointId = nextMockId('mock-mseg-point');
        if (seen.has(pointId)) return null;
        seen.add(pointId);
        return {
          pointId,
          position: Math.max(0, Math.min(1, Number(point?.position ?? 0) || 0)),
          value: Math.max(0, Math.min(1, Number(point?.value ?? 0) || 0)),
          curve: Math.max(-1, Math.min(1, Number(point?.curve ?? 0) || 0)),
        };
      }).filter(Boolean).sort((a, b) => a.position - b.position);
      if (points.length >= 2) {
        points[0].position = 0;
        points[points.length - 1].position = 1;
        mseg.points = points;
      }
    }
    if (!mseg.enabled) mseg.value = 0;
    return advanceMockMsegs(next, 0);
  }
  if (cmd === 'resetMseg') {
    const mseg = next.rack.msegs.find((candidate) => candidate.msegId === payload.msegId);
    if (!mseg) return next;
    mseg._cycles = 0;
    return advanceMockMsegs(next, 0);
  }
  if (cmd === 'removeMseg') {
    next.rack.msegs = next.rack.msegs.filter((mseg) => mseg.msegId !== payload.msegId);
    const destinations = new Set();
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'mseg' && route.sourceId === payload.msegId) {
        route.sourceValue = 0;
        route.resolved = false;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [targetId, parameterId] = destination.split('\n');
      applyMockModulationTarget(next.rack, targetId, parameterId);
    }
    return next;
  }
  if (cmd === 'addRandomModulator') {
    if (next.rack.randomModulators.length >= 32) return next;
    const ordinal = next.rack.randomModulators.length + 1;
    const mode = ['sampleHold', 'smoothRandom', 'chaos', 'randomWalk'].includes(payload.mode)
      ? payload.mode : 'sampleHold';
    const seed = (Math.floor(Date.now() + ordinal * 2654435761) % 0x7ffffffe) + 1;
    next.rack.randomModulators.push(normalizeHostState({ rack: { randomModulators: [{
      randomId: nextMockId('mock-random'),
      name: String(payload.name ?? '').trim() || `Random ${ordinal}`,
      mode, seed,
    }] } }).rack.randomModulators[0]);
    return advanceMockRandomModulators(next, 0);
  }
  if (cmd === 'setRandomModulator') {
    const random = next.rack.randomModulators.find(
      (candidate) => candidate.randomId === payload.randomId);
    if (!random) return next;
    if (payload.name !== undefined && String(payload.name).trim())
      random.name = String(payload.name).trim();
    if (payload.mode !== undefined
        && ['sampleHold', 'smoothRandom', 'chaos', 'randomWalk'].includes(payload.mode))
      random.mode = payload.mode;
    if (payload.enabled !== undefined) random.enabled = payload.enabled === true;
    if (payload.sync !== undefined) random.sync = payload.sync === true;
    if (payload.rateHz !== undefined)
      random.rateHz = Math.max(0.01, Math.min(40, Number(payload.rateHz) || 0.01));
    if (payload.syncBeats !== undefined)
      random.syncBeats = Math.max(0.03125,
        Math.min(64, Number(payload.syncBeats) || 0.03125));
    if (payload.seed !== undefined)
      random.seed = Math.max(1, Math.min(0x7fffffff,
        Math.floor(Number(payload.seed) || 1)));
    for (const field of ['probability', 'smoothing', 'stepSize', 'chaos', 'minimum', 'maximum'])
      if (payload[field] !== undefined)
        random[field] = Math.max(0, Math.min(1, Number(payload[field]) || 0));
    if (random.minimum > random.maximum)
      [random.minimum, random.maximum] = [random.maximum, random.minimum];
    resetMockRandomRuntime(random);
    return advanceMockRandomModulators(next, 0);
  }
  if (cmd === 'resetRandomModulator') {
    const random = next.rack.randomModulators.find(
      (candidate) => candidate.randomId === payload.randomId);
    if (!random) return next;
    resetMockRandomRuntime(random);
    return advanceMockRandomModulators(next, 0);
  }
  if (cmd === 'removeRandomModulator') {
    next.rack.randomModulators = next.rack.randomModulators.filter(
      (random) => random.randomId !== payload.randomId);
    const destinations = new Set();
    for (const route of next.rack.modulationRoutes)
      if (route.sourceType === 'random' && route.sourceId === payload.randomId) {
        route.sourceValue = 0;
        route.resolved = false;
        destinations.add(`${route.targetId}\n${route.parameterId}`);
      }
    for (const destination of destinations) {
      const [targetId, parameterId] = destination.split('\n');
      applyMockModulationTarget(next.rack, targetId, parameterId);
    }
    return next;
  }
  if (cmd === 'addModulationRoute') {
    const target = part(payload.targetId);
    const effects = [...next.rack.masterEffects, ...next.rack.parts.flatMap((p) => p.effects),
                     ...next.rack.returns.flatMap((r) => r.effects),
                     ...next.rack.buses.flatMap((b) => b.effects)];
    const effect = effects.find((e) => e.effectId === payload.targetId);
    const sourceType = String(payload.sourceType ?? 'velocity');
    const macro = next.rack.macros.find((m) => m.macroId === payload.sourceId);
    const lfo = next.rack.midiLfos.find((candidate) => candidate.lfoId === payload.sourceId);
    const envelope = next.rack.envelopes.find((candidate) => candidate.envelopeId === payload.sourceId);
    const mseg = next.rack.msegs.find((candidate) => candidate.msegId === payload.sourceId);
    const random = next.rack.randomModulators.find(
      (candidate) => candidate.randomId === payload.sourceId);
    const targetMacro = next.rack.macros.find((candidate) => candidate.macroId === payload.targetId);
    const existing = next.rack.modulationRoutes.find(
      (r) => r.targetId === payload.targetId && r.parameterId === payload.parameterId);
    const baseValue = existing?.baseValue
      ?? (payload.parameterId === '@macro' ? (targetMacro?.value ?? 0)
        : payload.parameterId === '@gain' ? (target?.volume ?? 1) / 2
        : payload.parameterId === '@pan' ? ((target?.pan ?? 0) + 1) / 2 : 0.5);
    next.rack.modulationRoutes.push({
      routeId: nextMockId('mock-mod'),
      sourceType,
      sourceId: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(sourceType) ? String(payload.sourceId ?? '') : '',
      sourceChannel: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(sourceType) ? 0
        : Math.max(0, Math.min(16, Number(payload.sourceChannel ?? 0) || 0)),
      sourceNumber: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(sourceType) ? 0
        : Math.max(0, Math.min(127, Number(payload.sourceNumber ?? 0) || 0)),
      sourceValue: sourceType === 'macro' ? (macro?.value ?? 0)
        : sourceType === 'lfo' ? (lfo?.value ?? 0)
        : sourceType === 'envelope' ? (envelope?.value ?? 0)
        : sourceType === 'mseg' ? (mseg?.value ?? 0)
        : sourceType === 'random' ? (random?.value ?? 0)
        : sourceType === 'pitchBend' ? 0.5 : 0,
      targetId: String(payload.targetId ?? ''),
      parameterId: String(payload.parameterId ?? ''),
      targetName: target?.pluginName || effect?.pluginName || '',
      displayName: mockBindingName(payload.parameterId, next.rack),
      amount: Math.max(-1, Math.min(1, Number(payload.amount ?? 0.25) || 0)),
      baseValue,
      enabled: true,
      resolved: Boolean((target || effect
          || (['lfo', 'envelope', 'mseg', 'random'].includes(sourceType) && targetMacro))
        && (sourceType !== 'macro' || macro) && (sourceType !== 'lfo' || lfo)
        && (sourceType !== 'envelope' || envelope) && (sourceType !== 'mseg' || mseg)
        && (sourceType !== 'random' || random)),
    });
    applyMockModulationTarget(next.rack, String(payload.targetId ?? ''),
                              String(payload.parameterId ?? ''));
    return next;
  }
  if (cmd === 'setModulationRoute') {
    const route = next.rack.modulationRoutes.find((r) => r.routeId === payload.routeId);
    if (!route) return next;
    if (payload.amount !== undefined)
      route.amount = Math.max(-1, Math.min(1, Number(payload.amount) || 0));
    if (payload.enabled !== undefined) route.enabled = payload.enabled === true;
    if (payload.sourceChannel !== undefined)
      route.sourceChannel = Math.max(0, Math.min(16, Number(payload.sourceChannel) || 0));
    if (payload.sourceNumber !== undefined)
      route.sourceNumber = Math.max(0, Math.min(127, Number(payload.sourceNumber) || 0));
    if (payload.sourceType !== undefined) {
      route.sourceType = String(payload.sourceType);
      if (!['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(route.sourceType)) route.sourceId = '';
    }
    if (payload.sourceId !== undefined) route.sourceId = String(payload.sourceId);
    if (['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(route.sourceType)) {
      route.sourceChannel = 0;
      route.sourceNumber = 0;
    }
    const macro = next.rack.macros.find((m) => m.macroId === route.sourceId);
    const lfo = next.rack.midiLfos.find((candidate) => candidate.lfoId === route.sourceId);
    const envelope = next.rack.envelopes.find((candidate) => candidate.envelopeId === route.sourceId);
    const mseg = next.rack.msegs.find((candidate) => candidate.msegId === route.sourceId);
    const random = next.rack.randomModulators.find(
      (candidate) => candidate.randomId === route.sourceId);
    route.sourceValue = route.sourceType === 'macro' ? (macro?.value ?? 0)
      : route.sourceType === 'lfo' ? (lfo?.value ?? 0)
      : route.sourceType === 'envelope' ? (envelope?.value ?? 0)
      : route.sourceType === 'mseg' ? (mseg?.value ?? 0)
      : route.sourceType === 'random' ? (random?.value ?? 0)
      : route.sourceType === 'pitchBend' ? 0.5 : route.sourceValue;
    applyMockModulationTarget(next.rack, route.targetId, route.parameterId);
    return next;
  }
  if (cmd === 'removeModulationRoute') {
    const removed = next.rack.modulationRoutes.find((r) => r.routeId === payload.routeId);
    next.rack.modulationRoutes = next.rack.modulationRoutes.filter((r) => r.routeId !== payload.routeId);
    if (removed) {
      if (next.rack.modulationRoutes.some(
        (r) => r.targetId === removed.targetId && r.parameterId === removed.parameterId))
        applyMockModulationTarget(next.rack, removed.targetId, removed.parameterId);
      else
        writeMockVirtualTarget(next.rack, removed.targetId, removed.parameterId, removed.baseValue);
    }
    return next;
  }
  if (cmd === 'clearModulationRoutes') {
    const firstByTarget = new Map();
    for (const route of next.rack.modulationRoutes) {
      const key = `${route.targetId}\n${route.parameterId}`;
      if (!firstByTarget.has(key)) firstByTarget.set(key, route);
    }
    next.rack.modulationRoutes = [];
    for (const route of firstByTarget.values())
      writeMockVirtualTarget(next.rack, route.targetId, route.parameterId, route.baseValue);
    return next;
  }
  if (cmd === 'addControlPage') {
    const pageId = nextMockId('mock-page');
    next.rack.pages.push(normalizeHostState({ rack: { pages: [{
      pageId,
      name: payload.name || `Page ${next.rack.pages.length + 1}`,
      slots: Array.from({ length: 8 }, (_, i) => ({ slotId: `s${i + 1}` })),
    }] } }).rack.pages[0]);
    return next;
  }
  if (cmd === 'removeControlPage') {
    next.rack.pages = next.rack.pages.filter((p) => p.pageId !== payload.pageId);
    return next;
  }
  if (cmd === 'generateControlPages') {
    const target = part(payload.partId);
    if (!target?.hasInstrument) return next;
    // Mirrors the native rule: replace this part's generated pages, keep everything else.
    next.rack.pages = next.rack.pages.filter((p) => !(p.generated && p.generatedForPartId === payload.partId));
    const page = normalizeHostState({ rack: { pages: [{
      pageId: `mock-auto-${payload.partId}`,
      name: target.pluginName || 'Auto',
      generated: true,
      slots: Array.from({ length: 8 }, (_, i) => {
        const params = ['cutoff', 'wave', 'drive'];
        return i < params.length
          ? { slotId: `s${i + 1}`, assigned: true, partId: payload.partId, parameterId: params[i],
              displayName: params[i].replace(/^./, (c) => c.toUpperCase()),
              partName: target.pluginName, resolved: true }
          : { slotId: `s${i + 1}` };
      }),
    }] } }).rack.pages[0];
    page.generatedForPartId = payload.partId;
    next.rack.pages.push(page);
    return next;
  }
  if (cmd === 'renameControlPage') {
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    if (page) page.name = String(payload.name ?? page.name);
    return next;
  }
  if (cmd === 'assignControlSlot' || cmd === 'clearControlSlot' || cmd === 'setControlSlotOptions') {
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    const slot = page?.slots.find((s) => s.slotId === payload.slotId);
    if (!slot) return next;
    if (cmd === 'clearControlSlot') {
      Object.assign(slot, { assigned: false, partId: '', parameterId: '', label: '',
                            displayName: '', partName: '', rangeMin: 0, rangeMax: 1,
                            inverted: false, bipolar: false, resolved: false });
    } else if (cmd === 'assignControlSlot') {
      const target = part(payload.partId);
      const virtual = String(payload.parameterId ?? '').startsWith('@');
      // Mirrors the native rule: a plug-in address needs the live instrument; a mixer
      // address needs only its part.
      if (!target || (!virtual && !target.hasInstrument)) return next;
      Object.assign(slot, {
        assigned: true,
        partId: payload.partId,
        parameterId: String(payload.parameterId ?? ''),
        displayName: mockBindingName(payload.parameterId, next.rack),
        partName: target.pluginName || (target.hardware ? target.midiOutputName : ''),
        resolved: true,
      });
    } else {
      for (const key of ['rangeMin', 'rangeMax', 'inverted', 'bipolar', 'toggle', 'label'])
        if (payload[key] !== undefined) slot[key] = payload[key];
      if (payload.label !== undefined && payload.label) slot.displayName = String(payload.label);
    }
    return next;
  }
  if (cmd === 'quickLearnParameter') {
    const target = part(payload.partId);
    if (!target) return next;
    // Find the first empty slot anywhere; mint a MIDI page when there is none — then the
    // mock 'hears' a knob at once, like its slot-row learn does. The page-add returns a
    // NEW state, so everything after works on whichever state actually holds the page.
    let working = next;
    let page = working.rack.pages.find((p) => p.slots.some((s) => !s.assigned));
    if (!page) {
      working = applyMockCommand(working, { cmd: 'addControlPage', name: 'MIDI' });
      page = working.rack.pages.at(-1);
    }
    const slot = page.slots.find((s) => !s.assigned);
    const index = page.slots.indexOf(slot);
    Object.assign(slot, {
      assigned: true, partId: payload.partId,
      parameterId: String(payload.parameterId ?? ''),
      displayName: mockBindingName(payload.parameterId, working.rack),
      partName: target.pluginName || '', resolved: true,
      midiCc: 20 + index, midiChannel: 1,
    });
    return working;
  }
  if (cmd === 'assignSurfaceControl' || cmd === 'learnSurfaceControl') {
    // The drawing names the control; the slot is minted here the first time, then the
    // ordinary slot command does the rest — exactly the native shape.
    const kind = String(payload.kind ?? '');
    const index = Number(payload.index);
    if (!['encoder', 'fader', 'pad'].includes(kind) || !Number.isInteger(index) || index < 0)
      return next;
    // No page named and none to land on: the first drop mints one, as native does. The
    // page-add returns a NEW state, so everything after works on whichever holds the page.
    let working = next;
    if (!payload.pageId && working.rack.pages.length === 0)
      working = applyMockCommand(working, { cmd: 'addControlPage', name: 'Surface' });
    const page = working.rack.pages.find((p) => p.pageId === payload.pageId)
      ?? (payload.pageId ? null : working.rack.pages[0]);
    if (!page) return working;
    let slot = surfaceControlSlot(page, { kind, index });
    if (!slot) {
      slot = normalizeHostState({ rack: { pages: [{ pageId: 'x', slots: [
        { slotId: `${kind}-${index + 1}`, kind, index },
      ] }] } }).rack.pages[0].slots[0];
      page.slots.push(slot);
    }
    return applyMockCommand(working, {
      ...payload,
      pageId: page.pageId,
      cmd: cmd === 'assignSurfaceControl' ? 'assignControlSlot' : 'learnControlSlotMidi',
      slotId: slot.slotId,
    });
  }
  if (cmd === 'learnControlSlotMidi' || cmd === 'clearControlSlotMidi') {
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    const slot = page?.slots.find((s) => s.slotId === payload.slotId);
    if (!slot) return next;
    if (cmd === 'clearControlSlotMidi') {
      Object.assign(slot, { midiCc: -1, midiChannel: 0 });
    } else {
      // No hardware in the browser, so the mock 'hears' a knob at once: CC 20+slot on
      // channel 1, stealing it from any slot that already had it — the native rule.
      const index = page.slots.indexOf(slot);
      const cc = 20 + index;
      for (const p of next.rack.pages)
        for (const other of p.slots)
          if (other.midiCc === cc && other.midiChannel === 1) Object.assign(other, { midiCc: -1, midiChannel: 0 });
      Object.assign(slot, { midiCc: cc, midiChannel: 1 });
    }
    return next;
  }
  if (cmd === 'learnControlSlotParameter' || cmd === 'cancelLearnControlSlotParameter') {
    // No plug-in window to wiggle in the browser, so the mock 'hears' the first parameter of
    // the focused part at once — enough to exercise the arming, the assignment and the badge.
    if (cmd === 'cancelLearnControlSlotParameter') return next;
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    const slot = page?.slots.find((s) => s.slotId === payload.slotId);
    const part = next.rack.parts.find((p) => p.partId === next.rack.focusedPartId);
    if (!slot || !part?.hasInstrument) return next;
    const first = mockHostParameters(part.partId).parameters[0];
    if (!first) return next;
    Object.assign(slot, { assigned: true, partId: part.partId, parameterId: first.id,
                          displayName: first.name, partName: part.pluginName, resolved: true });
    return next;
  }
  if (cmd === 'learnKeyChord') {
    // No keys to hear in the browser: the mock captures a C-major triad onto middle C at
    // once, enough to demo the map, the badge, and the clear.
    const target = part(payload.partId);
    if (!target) return next;
    target.midiFx.keyChords = [
      ...target.midiFx.keyChords.filter((kc) => kc.key !== 60),
      { key: 60, offsets: [0, 4, 7] },
    ];
    return next;
  }
  if (cmd === 'clearKeyChord') {
    const target = part(payload.partId);
    if (!target) return next;
    target.midiFx.keyChords = target.midiFx.keyChords.filter((kc) => kc.key !== Number(payload.key));
    return next;
  }
  if (cmd === 'walkPartPreset') {
    const target = part(payload.partId || next.rack.focusedPartId);
    if (!target?.hasInstrument) return next;
    // The browser has no real library to walk, so the mock cycles a fixed factory list —
    // enough to demo the cursor, the wrap, and the name in the part header.
    const sounds = ['Init', 'Bright', 'Dark'];
    const position = sounds.indexOf(target.presetName);
    const delta = Number(payload.delta) < 0 ? -1 : 1;
    const nextIndex = position < 0 ? (delta > 0 ? 0 : sounds.length - 1)
                                   : (position + delta + sounds.length) % sounds.length;
    target.presetName = sounds[nextIndex];
    target.presetRecordId = `mock-preset-${nextIndex}`;
    return next;
  }
  if (cmd === 'addBus') {
    next.rack.buses.push(normalizeHostState({ rack: { buses: [{
      busId: nextMockId('mock-bus'),
      name: payload.name || `Bus ${next.rack.buses.length + 1}`,
    }] } }).rack.buses[0]);
    return next;
  }
  if (cmd === 'removeBus') {
    next.rack.buses = next.rack.buses.filter((b) => b.busId !== payload.busId);
    // A removed group puts its instruments back on the master, never into silence.
    for (const p of next.rack.parts)
      if (p.destinationBusId === payload.busId) p.destinationBusId = '';
    for (const b of next.rack.buses)
      if (b.destinationBusId === payload.busId) b.destinationBusId = '';
    return next;
  }
  if (cmd === 'renameBus' || cmd === 'setBusLevel' || cmd === 'setBusDestination') {
    const bus = next.rack.buses.find((b) => b.busId === payload.busId);
    if (!bus) return next;
    if (cmd === 'renameBus') bus.name = String(payload.name ?? bus.name);
    else if (cmd === 'setBusLevel') bus.level = Math.min(2, Math.max(0, Number(payload.level ?? 1)));
    else {
      // Mirrors the native refusal: a loop is rejected where it is made.
      const destination = String(payload.destinationBusId ?? '');
      if (destination === bus.busId) return next;
      let at = destination;
      for (let hops = 0; at && hops <= next.rack.buses.length; hops++) {
        const hop = next.rack.buses.find((b) => b.busId === at);
        if (!hop) break;
        if (hop.destinationBusId === bus.busId) return next;
        at = hop.destinationBusId;
      }
      bus.destinationBusId = destination;
    }
    return next;
  }
  if (cmd === 'setPartMidiSource') {
    const target = part(payload.partId);
    const sourceId = String(payload.sourcePartId ?? '');
    if (!target || (sourceId && !part(sourceId))) return next;
    if (midiSourceWouldLoop(next.rack, payload.partId, sourceId)) {
      hostLastError.set(sourceId === payload.partId
        ? 'A part cannot take its MIDI from itself.'
        : 'That would loop — the source already takes its MIDI from this part.');
      return next;
    }
    if (sourceId && next.rack.layerGroups.some(
      (group) => group.members.some((member) => member.partId === payload.partId))) {
      hostLastError.set('Remove that part from its layer before giving it another MIDI source.');
      return next;
    }
    target.midiSourcePartId = sourceId;
    return next;
  }
  if (cmd === 'setPartDestination') {
    const target = part(payload.partId);
    const busId = String(payload.busId ?? '');
    if (!target || (busId && !next.rack.buses.some((b) => b.busId === busId))) return next;
    target.destinationBusId = busId;
    return next;
  }
  if (cmd === 'removeScanPath') {
    next.scanPaths = next.scanPaths.filter((p) => p !== payload.path);
    return next;
  }

  // --- Stage 6: the performance system ----------------------------------------------------
  const perf = next.performance;
  const pattern = (id) => perf.patterns.find((p) => p.patternId === id);
  const lane = (patternId, laneId) => pattern(patternId)?.lanes.find((l) => l.laneId === laneId);
  const effect = (id) => [...next.rack.masterEffects,
    ...next.rack.parts.flatMap((candidate) => candidate.effects),
    ...next.rack.returns.flatMap((candidate) => candidate.effects),
    ...next.rack.buses.flatMap((candidate) => candidate.effects)]
    .find((candidate) => candidate.effectId === id);

  if (cmd === 'transportPlay' || cmd === 'transportStop' || cmd === 'transportContinue') {
    perf.transport.playing = cmd !== 'transportStop';
    if (cmd === 'transportPlay') { perf.transport.positionPpq = 0; perf.transport.bar = 1; perf.transport.beat = 1; }
    return next;
  }
  if (cmd === 'setTempo') {
    perf.transport.tempo = Math.min(300, Math.max(20, Number(payload.tempo ?? 120)));
    return next;
  }
  if (cmd === 'setTimeSignature') {
    perf.transport.numerator = Math.min(32, Math.max(1, Number(payload.numerator ?? 4)));
    perf.transport.denominator = Math.min(16, Math.max(2, Number(payload.denominator ?? 4)));
    return next;
  }
  if (cmd === 'setTransportPosition') {
    perf.transport.positionPpq = Math.max(0, Number(payload.ppq ?? 0));
    return next;
  }
  if (cmd === 'setExternalClock') {
    perf.transport.externalClock = payload.enabled === true;
    return next;
  }
  if (cmd === 'importGrooveTemplate') {
    if (perf.grooves.length >= 32) return next;
    const imported = normalizeGrooveTemplate({
      grooveId: nextMockId('mock-groove'),
      name: payload.name,
      source: 'imported',
      stepsPerBeat: payload.stepsPerBeat,
      timingOffsets: payload.timingOffsets,
      velocityMultipliers: payload.velocityMultipliers,
    });
    if (imported.timingOffsets.length >= 2) perf.grooves.push(imported);
    return next;
  }
  if (cmd === 'removeGrooveTemplate') {
    perf.grooves = perf.grooves.filter((groove) =>
      groove.grooveId !== payload.grooveId || groove.source === 'factory');
    return next;
  }
  if (cmd === 'applyGrooveTemplate') {
    const target = pattern(payload.patternId);
    const groove = perf.grooves.find((candidate) => candidate.grooveId === payload.grooveId);
    if (target && groove)
      applyGrooveToPattern(target, groove, payload.amount, payload.applyVelocity !== false);
    return next;
  }
  if (cmd === 'addPattern') {
    const patternId = nextMockId('mock-pattern');
    perf.patterns.push(normalizePerformance({ patterns: [{
      patternId,
      name: payload.name || `Pattern ${perf.patterns.length + 1}`,
      lanes: [{ laneId: `${patternId}-lane-1`, type: 'note', name: 'Notes',
                targetPartId: next.rack.focusedPartId, resolved: true,
                targetName: part(next.rack.focusedPartId)?.pluginName ?? '',
                stepCount: 16, stepsPerBeat: 4,
                steps: Array.from({ length: 16 }, () => ({})) }],
    }] }).patterns[0]);
    return next;
  }
  if (cmd === 'createPatternVariations') {
    const selected = pattern(payload.patternId);
    if (!selected) return next;
    let source = selected;
    if (selected.variationSourcePatternId && selected.variationSourcePatternId !== selected.patternId)
      source = pattern(selected.variationSourcePatternId) ?? selected;

    const amount = Math.max(0, Math.min(1, Number(payload.amount ?? 0.55)));
    const groupId = source.variationGroupId
      || nextMockId(`mock-variation-group-${source.patternId}`);
    source.variationGroupId = groupId;
    source.variationLabel = 'A';
    source.variationSourcePatternId = source.patternId;
    source.variationAmount = amount;

    for (const label of ['B', 'C', 'D']) {
      const existingIndex = perf.patterns.findIndex((candidate) =>
        candidate.variationGroupId === groupId && candidate.variationLabel === label);
      const existingId = existingIndex >= 0 ? perf.patterns[existingIndex].patternId : '';
      const variation = makePatternVariation(source, label, amount,
        existingId || nextMockId(`mock-variation-${source.patternId}-${label}`));
      variation.variationGroupId = groupId;
      if (existingIndex >= 0) perf.patterns[existingIndex] = variation;
      else perf.patterns.push(variation);
    }
    const defaultFill = perf.patterns.find((candidate) =>
      candidate.variationGroupId === groupId && candidate.variationLabel === 'D');
    for (const clip of perf.clips)
      if (clip.patternId === source.patternId && !clip.fillPatternId)
        clip.fillPatternId = defaultFill?.patternId ?? '';
    return next;
  }
  if (cmd === 'removePattern') {
    perf.patterns = perf.patterns.filter((p) => p.patternId !== payload.patternId);
    perf.clips = perf.clips.filter((c) => c.patternId !== payload.patternId);
    for (const clip of perf.clips)
      if (clip.fillPatternId === payload.patternId) {
        clip.fillPatternId = '';
        clip.fillActive = false;
      }
    return next;
  }
  if (cmd === 'renamePattern') {
    const target = pattern(payload.patternId);
    if (target) target.name = String(payload.name ?? target.name);
    return next;
  }
  if (cmd === 'setPatternOptions') {
    const target = pattern(payload.patternId);
    if (target && payload.swing !== undefined)
      target.swing = Math.min(0.75, Math.max(0, Number(payload.swing)));
    return next;
  }
  if (cmd === 'addLane') {
    const target = pattern(payload.patternId);
    if (!target) return next;
    const type = String(payload.type ?? 'note');
    target.lanes.push(normalizePerformance({ patterns: [{ patternId: 'x', lanes: [{
      laneId: nextMockId('mock-lane'),
      type,
      name: payload.name || type.charAt(0).toUpperCase() + type.slice(1),
      targetPartId: payload.targetPartId ?? next.rack.focusedPartId,
      targetName: part(payload.targetPartId ?? next.rack.focusedPartId)?.pluginName ?? '',
      resolved: type !== 'parameter',
      stepCount: 16, stepsPerBeat: 4,
      steps: Array.from({ length: 16 }, () => ({})),
    }] }] }).patterns[0].lanes[0]);
    return next;
  }
  if (cmd === 'removeLane') {
    const target = pattern(payload.patternId);
    if (target) target.lanes = target.lanes.filter((l) =>
      l.laneId !== payload.laneId && l.lockSourceLaneId !== payload.laneId);
    return next;
  }
  if (cmd === 'setLaneOptions') {
    const target = lane(payload.patternId, payload.laneId);
    if (!target) return next;
    for (const key of ['name', 'targetPartId', 'targetId', 'parameterId'])
      if (payload[key] !== undefined) target[key] = String(payload[key]);
    for (const key of ['channel', 'ccNumber', 'drumNote', 'stepsPerBeat'])
      if (payload[key] !== undefined) target[key] = Number(payload[key]);
    for (const key of ['muted', 'glide'])
      if (payload[key] !== undefined) target[key] = payload[key] === true;
    if (payload.targetPartId !== undefined)
      target.targetName = part(payload.targetPartId)?.pluginName ?? '';
    if (payload.stepCount !== undefined) {
      target.stepCount = Math.min(128, Math.max(1, Number(payload.stepCount)));
      while (target.steps.length < target.stepCount) target.steps.push(normalizeStep({}));
      target.steps.length = target.stepCount;
    }
    const owner = pattern(payload.patternId);
    for (const lockLane of owner?.lanes.filter((l) => l.lockSourceLaneId === target.laneId) ?? []) {
      lockLane.stepCount = target.stepCount;
      lockLane.stepsPerBeat = target.stepsPerBeat;
      lockLane.muted = target.muted;
      while (lockLane.steps.length < lockLane.stepCount) lockLane.steps.push(normalizeStep({}));
      lockLane.steps.length = lockLane.stepCount;
    }
    if (owner) owner.lanes = owner.lanes.filter((candidate) =>
      candidate.lockSourceLaneId !== target.laneId
      || candidate.steps.some((step) => step.active));
    return next;
  }
  if (cmd === 'clearLane') {
    const target = lane(payload.patternId, payload.laneId);
    if (target) {
      target.steps = target.steps.map(() => normalizeStep({}));
      target.euclidPulses = 0;
      const owner = pattern(payload.patternId);
      owner.lanes = owner.lanes.filter((l) => l.lockSourceLaneId !== target.laneId);
    }
    return next;
  }
  if (cmd === 'euclidFill') {
    const target = lane(payload.patternId, payload.laneId);
    if (!target) return next;
    const steps = target.stepCount;
    const pulses = Math.min(steps, Math.max(0, Number(payload.pulses ?? 0)));
    const rotation = Number(payload.rotation ?? 0);
    target.euclidPulses = pulses;
    let bucket = 0;
    const hits = [];
    for (let i = 0; i < steps; i += 1) {
      bucket += pulses;
      const hit = bucket >= steps;
      if (hit) bucket -= steps;
      hits.push(hit);
    }
    target.steps = target.steps.map((step, i) => ({
      ...step,
      active: hits[((i + rotation) % steps + steps) % steps],
      note: step.note || 60,
    }));
    return next;
  }
  if (cmd === 'setStep' || cmd === 'toggleStep') {
    const target = lane(payload.patternId, payload.laneId);
    const step = target?.steps[Number(payload.index ?? -1)];
    if (!step) return next;
    if (cmd === 'toggleStep') {
      step.active = !step.active;
      if (step.active && !step.note) step.note = 60;
      return next;
    }
    for (const key of ['note', 'velocity', 'value', 'gate', 'microtiming', 'probability',
                       'ratchets', 'every', 'offset'])
      if (payload[key] !== undefined) step[key] = Number(payload[key]);
    for (const key of ['active', 'tie'])
      if (payload[key] !== undefined) step[key] = payload[key] === true;
    if (Array.isArray(payload.chord)) step.chordNotes = payload.chord.map(Number);
    for (const lockLane of pattern(payload.patternId)?.lanes
      .filter((l) => l.lockSourceLaneId === target.laneId) ?? []) {
      const lockStep = lockLane.steps[Number(payload.index ?? -1)];
      if (lockStep?.active) {
        lockStep.microtiming = step.microtiming;
        lockStep.probability = step.probability;
        lockStep.every = step.every;
        lockStep.offset = step.offset;
      }
    }
    return next;
  }
  if (cmd === 'setStepParameterLock' || cmd === 'setStepCcLock'
      || cmd === 'removeStepLock' || cmd === 'clearStepLocks') {
    const owner = pattern(payload.patternId);
    const source = lane(payload.patternId, payload.laneId);
    const index = Number(payload.index ?? -1);
    const sourceStep = source?.steps[index];
    if (!owner || !source || source.lockSourceLaneId) return next;

    const pruneEmpty = () => {
      owner.lanes = owner.lanes.filter((candidate) => !candidate.lockSourceLaneId
        || candidate.steps.some((candidateStep) => candidateStep.active));
    };
    if (cmd === 'clearStepLocks') {
      if (payload.index === undefined) {
        owner.lanes = owner.lanes.filter((candidate) => candidate.lockSourceLaneId !== source.laneId);
      } else if (sourceStep) {
        for (const lockLane of owner.lanes.filter((candidate) =>
          candidate.lockSourceLaneId === source.laneId))
          lockLane.steps[index] = normalizeStep({});
        pruneEmpty();
      }
      return next;
    }
    if (!sourceStep) return next;
    if (cmd === 'removeStepLock') {
      const lockLane = owner.lanes.find((candidate) => candidate.laneId === payload.lockLaneId
        && candidate.lockSourceLaneId === source.laneId);
      if (lockLane) lockLane.steps[index] = normalizeStep({});
      pruneEmpty();
      return next;
    }

    let lockLane;
    if (cmd === 'setStepParameterLock') {
      lockLane = owner.lanes.find((candidate) => candidate.type === 'parameter'
        && candidate.lockSourceLaneId === source.laneId
        && candidate.targetId === String(payload.targetId ?? '')
        && candidate.parameterId === String(payload.parameterId ?? ''));
      if (!lockLane) {
        lockLane = normalizePerformance({ patterns: [{ patternId: 'lock', lanes: [{
          laneId: nextMockId('mock-lock'),
          type: 'parameter',
          name: `Lock — ${mockBindingName(payload.parameterId, next.rack)}`,
          targetId: String(payload.targetId ?? ''),
          parameterId: String(payload.parameterId ?? ''),
          targetName: part(payload.targetId)?.pluginName ?? effect(payload.targetId)?.pluginName
            ?? next.rack.macros.find((macro) => macro.macroId === payload.targetId)?.name ?? '',
          resolved: true,
          lockSourceLaneId: source.laneId,
          stepCount: source.stepCount,
          stepsPerBeat: source.stepsPerBeat,
          muted: source.muted,
          glide: false,
          steps: Array.from({ length: source.stepCount }, () => ({})),
        }] }] }).patterns[0].lanes[0];
        owner.lanes.push(lockLane);
      }
    } else {
      const targetPartId = String(payload.targetPartId ?? source.targetPartId);
      const channel = Number(payload.channel ?? source.channel ?? 1);
      const ccNumber = Number(payload.ccNumber ?? 74);
      lockLane = owner.lanes.find((candidate) => candidate.type === 'cc'
        && candidate.lockSourceLaneId === source.laneId
        && candidate.targetPartId === targetPartId
        && candidate.channel === channel && candidate.ccNumber === ccNumber);
      if (!lockLane) {
        lockLane = normalizePerformance({ patterns: [{ patternId: 'lock', lanes: [{
          laneId: nextMockId('mock-lock'),
          type: 'cc',
          name: `Lock — CC${ccNumber}`,
          targetPartId,
          targetName: part(targetPartId)?.pluginName ?? '',
          resolved: true,
          channel,
          ccNumber,
          lockSourceLaneId: source.laneId,
          stepCount: source.stepCount,
          stepsPerBeat: source.stepsPerBeat,
          muted: source.muted,
          glide: false,
          steps: Array.from({ length: source.stepCount }, () => ({})),
        }] }] }).patterns[0].lanes[0];
        owner.lanes.push(lockLane);
      }
    }
    lockLane.steps[index] = normalizeStep({
      active: true,
      value: Math.min(1, Math.max(0, Number(payload.value ?? 0))),
      microtiming: sourceStep.microtiming,
      probability: sourceStep.probability,
      every: sourceStep.every,
      offset: sourceStep.offset,
    });
    return next;
  }
  if (cmd === 'addClip') {
    const source = pattern(payload.patternId);
    if (!source) return next;
    perf.clips.push(normalizePerformance({ clips: [{
      clipId: nextMockId('mock-clip'),
      name: payload.name || source.name,
      patternId: source.patternId,
      launchQuantize: perf.transport.defaultQuantize,
      fillPatternId: perf.patterns.find((candidate) =>
        candidate.variationGroupId && candidate.variationGroupId === source.variationGroupId
        && candidate.variationLabel === 'D' && candidate.patternId !== source.patternId)?.patternId ?? '',
    }] }).clips[0]);
    return next;
  }
  if (cmd === 'removeClip') {
    const removed = perf.clips.find((c) => c.clipId === payload.clipId);
    perf.clips = perf.clips.filter((c) => c.clipId !== payload.clipId);
    if ((removed?.looperLayer || removed?.gestureClip || removed?.frozenMidi)
        && !perf.clips.some((c) => c.patternId === removed.patternId))
      perf.patterns = perf.patterns.filter((p) => p.patternId !== removed.patternId);
    for (const scene of perf.scenes)
      scene.clipIds = scene.clipIds.filter((id) => id !== payload.clipId);
    for (const clip of perf.clips)
      if (clip.followClipId === payload.clipId) {
        clip.followClipId = '';
        if (clip.followAction === 'clip') {
          clip.followAction = 'none';
          clip.followAfterLoops = 0;
        }
      }
    return next;
  }
  if (cmd === 'setClipOptions') {
    const clip = perf.clips.find((c) => c.clipId === payload.clipId);
    if (!clip) return next;
    for (const key of ['name', 'launchQuantize', 'followClipId', 'followAction',
      'fillPatternId', 'fillQuantize'])
      if (payload[key] !== undefined) clip[key] = String(payload[key]);
    if (payload.followClipId !== undefined && payload.followAction === undefined)
      clip.followAction = String(payload.followClipId) ? 'clip' : 'none';
    if (payload.loop !== undefined) clip.loop = payload.loop === true;
    if (payload.followAfterLoops !== undefined) clip.followAfterLoops = Number(payload.followAfterLoops);
    if (payload.fillCc !== undefined)
      clip.fillCc = Math.max(-1, Math.min(127, Number(payload.fillCc)));
    if (payload.fillChannel !== undefined)
      clip.fillChannel = Math.max(0, Math.min(16, Number(payload.fillChannel)));
    return next;
  }
  if (cmd === 'launchClip' || cmd === 'stopClip' || cmd === 'stopAllClips') {
    // The mock has no clock, so a launch takes effect at once — the native side waits for the
    // quantization boundary and the UI shows `pending` until it lands.
    for (const clip of perf.clips) {
      if (cmd === 'stopAllClips') {
        clip.active = false;
        clip.fillActive = false;
      } else if (clip.clipId === payload.clipId) {
        clip.active = cmd === 'launchClip';
        if (!clip.active) clip.fillActive = false;
      }
    }
    return next;
  }
  if (cmd === 'setPerformanceFill') {
    const clip = perf.clips.find((candidate) => candidate.clipId === payload.clipId);
    if (!clip) return next;
    if (payload.active === true && (!clip.active || !clip.fillPatternId)) return next;
    clip.fillActive = payload.active === true;
    clip.fillPending = false;
    return next;
  }
  if (cmd === 'armCapture') {
    perf.capture = { ...perf.capture, armed: true,
      clipId: String(payload.clipId ?? ''), laneId: String(payload.laneId ?? '') };
    return next;
  }
  if (cmd === 'disarmCapture') {
    perf.capture = { ...perf.capture, armed: false, clipId: '', laneId: '' };
    return next;
  }
  if (cmd === 'captureRecentMidi') {
    // The browser mock has no MIDI device, so give the control a small, visible phrase. The
    // native host replaces this with the actual rolling journal and preserves its timing.
    const suffix = nextMockSuffix();
    const patternId = `mock-retro-pattern-${suffix}`;
    const laneId = `mock-retro-lane-${suffix}`;
    const clipId = `mock-retro-clip-${suffix}`;
    const notes = [60, 64, 67, 72];
    const steps = Array.from({ length: 16 }, (_, index) => normalizeStep(
      index % 4 === 0
        ? { active: true, note: notes[index / 4], velocity: 104, gate: 0.72,
            microtiming: index === 4 ? 0.08 : 0 }
        : {}));
    const captured = normalizePerformance({ patterns: [{
      patternId, name: 'Retrospective preview',
      lanes: [{ laneId, type: 'chord', name: 'Captured notes',
                targetPartId: next.rack.parts[0]?.partId ?? '', channel: 1,
                stepCount: 16, stepsPerBeat: 4, steps }],
    }], clips: [{
      clipId, patternId, name: 'Retrospective preview', launchQuantize: 'bar',
    }] });
    perf.patterns.push(captured.patterns[0]);
    perf.clips.push(captured.clips[0]);
    perf.capture = {
      ...perf.capture,
      historySeconds: Math.min(120, Number(payload.seconds ?? 30)),
      historyEvents: 8,
      historyHasNotes: true,
      historyCapacitySeconds: 120,
      lastPatternId: patternId,
      lastClipId: clipId,
      lastNoteCount: 4,
      lastStepCount: 16,
      lastSeconds: 4,
      lastTrimmed: false,
    };
    return next;
  }
  if (cmd === 'freezeMidiClip') {
    const sourceClip = perf.clips.find((clip) => clip.clipId === payload.clipId);
    const sourcePattern = sourceClip
      && perf.patterns.find((pattern) => pattern.patternId === sourceClip.patternId);
    if (!sourceClip || !sourcePattern || sourceClip.frozenMidi) return next;
    const cycles = Math.max(1, Math.min(8, Number(payload.cycles ?? 1)));
    const resultPpq = sourcePattern.lengthPpq * cycles;
    const suffix = nextMockSuffix();
    let noteCount = 0;
    const lanes = sourcePattern.lanes.filter((lane) => lane.type !== 'parameter').map((lane, laneIndex) => {
      const stepCount = Math.min(128, Math.max(1, Math.round(resultPpq * lane.stepsPerBeat)));
      const steps = Array.from({ length: stepCount }, (_, index) => {
        const source = lane.steps[index % Math.max(1, lane.steps.length)] ?? {};
        if (source.active) noteCount += Math.max(1, source.chordNotes?.length || 1);
        return normalizeStep({ ...source, probability: 100, every: 1, offset: 0, ratchets: 1 });
      });
      return { ...lane, laneId: `mock-frozen-lane-${suffix}-${laneIndex}`,
        name: `Frozen — ${lane.name || `Lane ${laneIndex + 1}`}`, stepCount, steps };
    });
    if (!noteCount || !lanes.length) return next;
    const patternId = `mock-frozen-pattern-${suffix}`;
    const clipId = `mock-frozen-clip-${suffix}`;
    const frozen = normalizePerformance({ patterns: [{
      patternId, name: `${sourceClip.name} (Frozen MIDI)`, lengthPpq: resultPpq, lanes,
    }], clips: [{
      clipId, patternId, name: `${sourceClip.name} (Frozen MIDI)`,
      launchQuantize: sourceClip.launchQuantize, loop: true, frozenMidi: true,
      frozenFromClipId: sourceClip.clipId, frozenCycles: cycles, frozenNoteCount: noteCount,
    }] });
    perf.patterns.push(frozen.patterns[0]);
    perf.clips.push(frozen.clips[0]);
    return next;
  }
  if (cmd === 'startMidiLoop') {
    perf.looper = {
      ...perf.looper,
      recording: true,
      overdubbing: Boolean(payload.clipId),
      targetClipId: String(payload.clipId ?? ''),
      elapsedSeconds: 0,
    };
    perf.transport.playing = true;
    return next;
  }
  if (cmd === 'cancelMidiLoop') {
    perf.looper = { ...perf.looper, recording: false, overdubbing: false,
                    targetClipId: '', elapsedSeconds: 0 };
    return next;
  }
  if (cmd === 'finishMidiLoop') {
    if (!perf.looper.recording) return next;
    if (perf.looper.overdubbing) {
      const target = perf.clips.find((clip) => clip.clipId === perf.looper.targetClipId);
      if (target?.looperLayer) target.overdubPasses += 1;
    } else {
      const suffix = nextMockSuffix();
      const layerNumber = perf.clips.filter((clip) => clip.looperLayer).length + 1;
      const patternId = `mock-loop-pattern-${suffix}`;
      const laneId = `mock-loop-lane-${suffix}`;
      const clipId = `mock-loop-clip-${suffix}`;
      const steps = Array.from({ length: 16 }, (_, index) => normalizeStep(
        [0, 3, 8, 11].includes(index)
          ? { active: true, note: [60, 67, 64, 72][[0, 3, 8, 11].indexOf(index)],
              velocity: 106, gate: 0.7 }
          : {}));
      const layer = normalizePerformance({ patterns: [{
        patternId, name: `Loop layer ${layerNumber}`,
        lanes: [{ laneId, type: 'chord', name: 'Captured notes',
                  targetPartId: next.rack.parts[0]?.partId ?? '', channel: 1,
                  stepCount: 16, stepsPerBeat: 4, steps }],
      }], clips: [{
        clipId, patternId, name: `Loop layer ${layerNumber}`, launchQuantize: 'immediate',
        loop: true, looperLayer: true, overdubPasses: 0, active: true,
      }] });
      perf.patterns.push(layer.patterns[0]);
      perf.clips.push(layer.clips[0]);
    }
    perf.looper = { ...perf.looper, recording: false, overdubbing: false,
                    targetClipId: '', elapsedSeconds: 0 };
    return next;
  }
  if (cmd === 'removeMidiLoop') {
    const target = perf.clips.find((clip) => clip.clipId === payload.clipId && clip.looperLayer);
    if (!target) return next;
    perf.clips = perf.clips.filter((clip) => clip.clipId !== target.clipId);
    if (!perf.clips.some((clip) => clip.patternId === target.patternId))
      perf.patterns = perf.patterns.filter((pattern) => pattern.patternId !== target.patternId);
    for (const scene of perf.scenes)
      scene.clipIds = scene.clipIds.filter((id) => id !== target.clipId);
    return next;
  }
  if (cmd === 'startGestureRecording') {
    perf.gestures = {
      ...perf.gestures,
      recording: true,
      mode: payload.clipId ? (payload.mode === 'replace' ? 'replace' : 'overdub') : 'new',
      targetClipId: String(payload.clipId ?? ''),
      pointCount: 0,
      targetCount: 0,
      elapsedSeconds: 0,
      truncated: false,
    };
    perf.transport.playing = true;
    return next;
  }
  if (cmd === 'cancelGestureRecording') {
    perf.gestures = { ...perf.gestures, recording: false, mode: 'new', targetClipId: '',
                      pointCount: 0, targetCount: 0, elapsedSeconds: 0, truncated: false };
    return next;
  }
  if (cmd === 'finishGestureRecording') {
    if (!perf.gestures.recording) return next;
    const suffix = nextMockSuffix();
    const makePreviewLane = (stepCount = 16, stepsPerBeat = 4) => ({
      laneId: `mock-gesture-lane-${suffix}`,
      type: 'parameter',
      name: 'Level',
      targetId: next.rack.parts[0]?.partId ?? '',
      parameterId: '@gain',
      targetName: next.rack.parts[0]?.name ?? 'Part',
      resolved: true,
      stepCount,
      stepsPerBeat,
      glide: true,
      steps: Array.from({ length: stepCount }, (_, index) => normalizeStep(
        [0, 4, 8, 12].includes(index)
          ? { active: true, value: [0.3, 0.82, 0.48, 0.7][index / 4] }
          : {})),
    });

    if (perf.gestures.targetClipId) {
      const target = perf.clips.find((clip) => clip.clipId === perf.gestures.targetClipId);
      const targetPattern = target && perf.patterns.find((p) => p.patternId === target.patternId);
      if (target && targetPattern) {
        const existing = targetPattern.lanes.find((lane) => lane.type === 'parameter'
          && !lane.lockSourceLaneId
          && lane.targetId === (next.rack.parts[0]?.partId ?? '') && lane.parameterId === '@gain');
        if (existing && perf.gestures.mode === 'replace') {
          const replacement = makePreviewLane(existing.stepCount, existing.stepsPerBeat);
          existing.steps = replacement.steps;
          existing.glide = true;
        } else if (!existing) {
          const source = targetPattern.lanes[0];
          targetPattern.lanes.push(makePreviewLane(source?.stepCount ?? 16,
                                                    source?.stepsPerBeat ?? 4));
        }
        target.gesturePasses += 1;
        perf.gestures.lastClipId = target.clipId;
      }
    } else {
      const gestureNumber = perf.clips.filter((clip) => clip.gestureClip).length + 1;
      const patternId = `mock-gesture-pattern-${suffix}`;
      const clipId = `mock-gesture-clip-${suffix}`;
      const recorded = normalizePerformance({ patterns: [{
        patternId, name: `Gesture ${gestureNumber}`, lanes: [makePreviewLane()],
      }], clips: [{
        clipId, patternId, name: `Gesture ${gestureNumber}`, launchQuantize: 'immediate',
        loop: true, gestureClip: true, gesturePasses: 1, active: true,
      }] });
      perf.patterns.push(recorded.patterns[0]);
      perf.clips.push(recorded.clips[0]);
      perf.gestures.lastClipId = clipId;
    }
    perf.gestures = { ...perf.gestures, recording: false, mode: 'new', targetClipId: '',
                      pointCount: 0, targetCount: 0, elapsedSeconds: 0 };
    return next;
  }
  if (cmd === 'clearGestureLanes') {
    const target = perf.clips.find((clip) => clip.clipId === payload.clipId);
    const targetPattern = target && perf.patterns.find((p) => p.patternId === target.patternId);
    if (!target || !targetPattern) return next;
    const sourceIds = new Set(targetPattern.lanes
      .filter((lane) => lane.type === 'parameter' && !lane.lockSourceLaneId)
      .map((lane) => lane.laneId));
    targetPattern.lanes = targetPattern.lanes.filter((lane) =>
      !sourceIds.has(lane.laneId) && !sourceIds.has(lane.lockSourceLaneId));
    target.gesturePasses = 0;
    return next;
  }
  if (cmd === 'addScene') {
    const scene = normalizePerformance({ scenes: [{
      sceneId: nextMockId('mock-scene'),
      name: payload.name || `Scene ${perf.scenes.length + 1}`,
      clipIds: perf.clips.filter((c) => c.active).map((c) => c.clipId),
      launchQuantize: perf.transport.defaultQuantize,
    }] }).scenes[0];
    captureMockSnapshot(scene, next);
    perf.scenes.push(scene);
    return next;
  }
  if (cmd === 'removeScene') {
    perf.scenes = perf.scenes.filter((s) => s.sceneId !== payload.sceneId);
    perf.setlist.items = perf.setlist.items.filter((i) => i.sceneId !== payload.sceneId);
    perf.arrangement.items = perf.arrangement.items.filter((i) => i.sceneId !== payload.sceneId);
    return next;
  }
  if (cmd === 'renameScene' || cmd === 'captureScene' || cmd === 'setSceneOptions'
      || cmd === 'setSceneClip') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    if (!scene) return next;
    if (cmd === 'renameScene') scene.name = String(payload.name ?? scene.name);
    else if (cmd === 'captureScene') {
      scene.clipIds = perf.clips.filter((c) => c.active).map((c) => c.clipId);
      captureMockSnapshot(scene, next);
    } else if (cmd === 'setSceneClip') {
      const included = payload.included === true;
      scene.clipIds = scene.clipIds.filter((id) => id !== payload.clipId);
      if (included) scene.clipIds.push(String(payload.clipId));
    } else {
      if (payload.launchQuantize !== undefined) scene.launchQuantize = String(payload.launchQuantize);
      if (payload.stopOtherClips !== undefined) scene.stopOtherClips = payload.stopOtherClips === true;
      if (payload.tempo !== undefined) scene.tempo = Number(payload.tempo);
      if (payload.pageId !== undefined) scene.pageId = String(payload.pageId);
      if (payload.morphBeats !== undefined)
        scene.morphBeats = Math.max(0, Math.min(32, Number(payload.morphBeats) || 0));
    }
    return next;
  }
  if (cmd === 'launchScene') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    if (!scene) return next;
    for (const clip of perf.clips) {
      const inScene = scene.clipIds.includes(clip.clipId);
      if (inScene) clip.active = true;
      else if (scene.stopOtherClips) clip.active = false;
    }
    if (scene.tempo > 0) perf.transport.tempo = scene.tempo;
    applyMockSnapshot(scene, next);
    perf.snapshotMorph = {
      active: false, sceneId: scene.sceneId, name: scene.name,
      durationBeats: scene.morphBeats, progress: 1,
      targetCount: scene.slots.reduce((count, slot) => count
        + (slot.applyVolume ? 1 : 0) + (slot.applyPan ? 1 : 0), 0)
        + scene.macros.length + scene.parameters.length,
    };
    return next;
  }
  if (cmd === 'addSetlistItem') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    perf.setlist.items.push({
      itemId: nextMockId('mock-item'),
      name: payload.name || scene?.name || `Item ${perf.setlist.items.length + 1}`,
      sceneId: String(payload.sceneId ?? ''),
      rackRecordId: String(payload.rackRecordId ?? ''),
      pageId: String(payload.pageId ?? scene?.pageId ?? ''),
      sceneName: scene?.name ?? '',
      missing: !!payload.sceneId && !scene,
      notes: '',
      tempo: 0,
    });
    return next;
  }
  if (cmd === 'setSetlistOptions') {
    if (payload.preloadAhead !== undefined)
      perf.setlist.preloadAhead = Math.max(0, Math.min(2, Number(payload.preloadAhead ?? 0)));
    return next;
  }
  if (cmd === 'removeSetlistItem' || cmd === 'setSetlistItem' || cmd === 'moveSetlistItem') {
    const index = perf.setlist.items.findIndex((i) => i.itemId === payload.itemId);
    if (index < 0) return next;
    if (cmd === 'removeSetlistItem') {
      perf.setlist.items.splice(index, 1);
      perf.setlist.currentIndex = Math.min(perf.setlist.currentIndex, perf.setlist.items.length - 1);
    } else if (cmd === 'moveSetlistItem') {
      const [item] = perf.setlist.items.splice(index, 1);
      perf.setlist.items.splice(Math.min(perf.setlist.items.length,
                                         Math.max(0, Number(payload.index ?? index))), 0, item);
    } else {
      const item = perf.setlist.items[index];
      for (const key of ['name', 'notes', 'rackRecordId', 'pageId'])
        if (payload[key] !== undefined) item[key] = String(payload[key]);
      if (payload.tempo !== undefined) item.tempo = Number(payload.tempo);
      if (payload.sceneId !== undefined) {
        item.sceneId = String(payload.sceneId);
        const scene = perf.scenes.find((s) => s.sceneId === item.sceneId);
        item.sceneName = scene?.name ?? '';
        item.missing = !!item.sceneId && !scene;
      }
    }
    return next;
  }
  if (cmd === 'setlistGo' || cmd === 'setlistNext' || cmd === 'setlistPrev') {
    const target = cmd === 'setlistGo' ? Number(payload.index ?? 0)
      : cmd === 'setlistNext' ? perf.setlist.currentIndex + 1 : perf.setlist.currentIndex - 1;
    const item = perf.setlist.items[target];
    // The native rule, mirrored: an item whose scene is gone leaves the rig where it was.
    if (!item || item.missing) return next;
    perf.setlist.currentIndex = target;
    perf.setlist.loadingIndex = -1;
    if (item.sceneId) return applyMockCommand(next, { cmd: 'launchScene', sceneId: item.sceneId });
    return next;
  }
  if (cmd === 'addArrangementItem') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    if (!scene || perf.arrangement.playing) return next;
    perf.arrangement.items.push({
      itemId: nextMockId('mock-arrangement'),
      name: String(payload.name || scene.name),
      sceneId: scene.sceneId,
      sceneName: scene.name,
      missing: false,
      bars: Math.max(1, Math.min(128, Number(payload.bars ?? 4))),
    });
    return next;
  }
  if (cmd === 'removeArrangementItem' || cmd === 'setArrangementItem'
      || cmd === 'moveArrangementItem') {
    if (perf.arrangement.playing) return next;
    const index = perf.arrangement.items.findIndex((i) => i.itemId === payload.itemId);
    if (index < 0) return next;
    if (cmd === 'removeArrangementItem') {
      perf.arrangement.items.splice(index, 1);
    } else if (cmd === 'moveArrangementItem') {
      const [item] = perf.arrangement.items.splice(index, 1);
      perf.arrangement.items.splice(Math.min(perf.arrangement.items.length,
        Math.max(0, Number(payload.index ?? index))), 0, item);
    } else {
      const item = perf.arrangement.items[index];
      if (payload.name !== undefined) item.name = String(payload.name);
      if (payload.bars !== undefined)
        item.bars = Math.max(1, Math.min(128, Number(payload.bars)));
      if (payload.sceneId !== undefined) {
        const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
        if (!scene) return next;
        item.sceneId = scene.sceneId;
        item.sceneName = scene.name;
        item.missing = false;
      }
    }
    return next;
  }
  if (cmd === 'setArrangementOptions') {
    if (payload.loop !== undefined) perf.arrangement.loop = payload.loop === true;
    return next;
  }
  if (cmd === 'startArrangement') {
    const index = Math.max(0, Number(payload.index ?? 0));
    const item = perf.arrangement.items[index];
    if (!item || item.missing) return next;
    perf.arrangement.playing = true;
    perf.arrangement.currentIndex = index;
    perf.arrangement.queuedIndex = -1;
    perf.arrangement.ending = false;
    perf.arrangement.progress = 0;
    perf.arrangement.bar = 1;
    perf.transport.playing = true;
    return applyMockCommand(next, { cmd: 'launchScene', sceneId: item.sceneId });
  }
  if (cmd === 'stopArrangement') {
    perf.arrangement.playing = false;
    perf.arrangement.currentIndex = -1;
    perf.arrangement.queuedIndex = -1;
    perf.arrangement.ending = false;
    perf.arrangement.progress = 0;
    perf.arrangement.bar = 0;
    for (const clip of perf.clips) clip.active = false;
    return next;
  }
  if (cmd === 'hostNote') {
    // Nothing to hear in a browser — the mock accepts the note so the keys still light.
    return next;
  }
  if (cmd === 'setMasterLevel') {
    next.product.daw.masterLevel = Math.min(2, Math.max(0, Number(payload.level ?? 1)));
    return next;
  }
  if (cmd === 'setOutputPairs') {
    next.product.daw.outputPairs = Math.min(8, Math.max(1, Number(payload.pairs ?? 1)));
    // The native rule, mirrored: a part routed past the new end falls back to the main pair.
    for (const p of next.rack.parts)
      p.outputPair = Math.min(next.product.daw.outputPairs - 1, p.outputPair);
    return next;
  }
  if (cmd === 'setPartOutputPair') {
    const target = part(payload.partId);
    if (target)
      target.outputPair = Math.min(next.product.daw.outputPairs - 1,
                                   Math.max(0, Number(payload.pair ?? 0)));
    return next;
  }
  if (cmd === 'claimHardwareSurface' || cmd === 'releaseHardwareSurface') {
    const owned = cmd === 'claimHardwareSurface';
    next.product.hardware = { owner: owned ? 'this instance' : 'nobody', owned };
    return next;
  }
  if (cmd === 'clearActiveHostingIncidents') {
    next.product.activeHostingIncidents = [];
    return next;
  }
  if (cmd === 'setSafeMode') {
    const level = ['normal', 'skipSuspects', 'noThirdParty'].includes(payload.level)
      ? payload.level
      : 'normal';
    next.reliability.safeMode.level = level;
    return next;
  }
  if (cmd === 'clearSafeModeSuspect') {
    const safe = next.reliability.safeMode;
    safe.suspects = safe.suspects.filter((s) => s.modulePath !== payload.modulePath);
    // The native rule, mirrored: skipSuspects with nothing to skip is a warning light nobody
    // can turn off, so it drops back. A safe mode the user chose is left alone.
    if (safe.suspects.length === 0 && safe.level === 'skipSuspects') safe.level = 'normal';
    return next;
  }
  if (cmd === 'clearAllSafeModeSuspects') {
    const safe = next.reliability.safeMode;
    safe.suspects = [];
    if (safe.level === 'skipSuspects') safe.level = 'normal';
    return next;
  }
  if (cmd === 'installLicence' || cmd === 'removeLicence'
      || cmd === 'activateLicenceHere' || cmd === 'deactivateLicenceHere') {
    // The browser preview has no public key and no crypto, so it cannot verify a licence and
    // does not pretend to. Reporting "installed" here would make the mock the one place in the
    // product where an unsigned file is accepted, which is exactly the wrong thing to mock.
    if (cmd === 'removeLicence') {
      next.licence = { ...emptyLicence(), loadedParts: next.licence.loadedParts };
      return next;
    }
    next.licence = {
      ...next.licence,
      detail: 'Licences are verified by the native side. This browser preview has no key to '
            + 'check one against, so nothing was installed.',
    };
    return next;
  }
  if (cmd === 'acknowledgeRecovery') {
    // Clears the notice, never the standing offer — the known-good is a state, not a message.
    Object.assign(next.reliability.recovery, {
      interrupted: false, lastOperation: '', lastOperationDetail: '', preservedStateFile: '',
    });
    return next;
  }
  if (cmd === 'restoreLastKnownGood') {
    if (!next.reliability.recovery.hasLastKnownGood) return next;
    Object.assign(next.reliability.recovery, {
      interrupted: false, lastOperation: '', lastOperationDetail: '', preservedStateFile: '',
    });
    next.reliability.damagedState = [];
    return next;
  }
  if (cmd === 'setAutomaticFailover') {
    const failover = next.reliability.automaticFailover;
    if (Object.hasOwn(payload, 'enabled')) failover.enabled = payload.enabled === true;
    if (Object.hasOwn(payload, 'maxAttempts'))
      failover.maxAttempts = Math.max(1, Math.min(5, Math.round(Number(payload.maxAttempts) || 3)));
    if (Object.hasOwn(payload, 'retryDelayMs'))
      failover.retryDelayMs = Math.max(100, Math.min(10000,
        Math.round(Number(payload.retryDelayMs) || 500)));
    if (failover.enabled) {
      for (const event of failover.events) {
        if (event.state === 'failed' || event.state === 'bypassed') {
          event.state = 'waiting';
          event.attempts = 0;
        }
      }
    } else {
      for (const event of failover.events) {
        if (event.state === 'waiting') {
          event.state = 'bypassed';
          event.nextAttemptMs = 0;
        }
      }
    }
    return next;
  }
  if (cmd === 'retryFailedProcessor') {
    const event = next.reliability.automaticFailover.events
      .find((candidate) => candidate.targetId === payload.targetId);
    if (event) {
      event.state = 'recovered';
      event.attempts = 1;
      event.error = '';
      event.nextAttemptMs = 0;
    }
    return next;
  }
  if (cmd === 'dismissFailoverEvent') {
    next.reliability.automaticFailover.events = next.reliability.automaticFailover.events
      .filter((event) => event.targetId !== payload.targetId);
    return next;
  }
  if (cmd === 'addMidiSlot' || cmd === 'removeMidiSlot' || cmd === 'moveMidiSlot'
      || cmd === 'setMidiSlotBypassed' || cmd === 'setMidiSlotOptions') {
    const target = part(payload.partId);
    if (!target) return next;
    const chain = target.midiChain;
    const index = chain.findIndex((s) => s.slotId === payload.slotId);

    if (cmd === 'addMidiSlot') {
      if (!midiSlotTypes.includes(payload.type) || chain.length >= 8) return next;
      chain.push(normalizeMidiSlot({ slotId: nextMockId('mock-slot'),
                                     type: payload.type }));
      return next;
    }
    if (index < 0) return next;
    if (cmd === 'removeMidiSlot') {
      chain.splice(index, 1);
    } else if (cmd === 'moveMidiSlot') {
      const to = Math.max(0, Math.min(chain.length - 1, Number(payload.index ?? index)));
      chain.splice(to, 0, ...chain.splice(index, 1));
    } else if (cmd === 'setMidiSlotBypassed') {
      chain[index].bypassed = payload.bypassed === true;
    } else {
      // Which settings block a module edits follows its type, exactly as the native side
      // decides it: the arp has its own, the later note modules share `mod`, everything else is
      // a note shaper.
      const laterModules = ['echo', 'strum', 'humanize', 'chance', 'length', 'latch', 'mpe',
                            'articulation'];
      const block = chain[index].type === 'arp' ? chain[index].arp
        : laterModules.includes(chain[index].type) ? chain[index].mod
        : chain[index].fx;
      for (const [key, value] of Object.entries(payload)) {
        if (['cmd', 'partId', 'slotId'].includes(key) || !(key in block)) continue;
        block[key] = key === 'articulations'
          ? (Array.isArray(value) ? value.map((entry) => ({ ...entry })) : block[key])
          : typeof block[key] === 'boolean' ? value === true
          : typeof block[key] === 'number' ? Number(value)
          : Array.isArray(block[key]) ? (Array.isArray(value) ? value.map(Number) : block[key])
          : String(value);
      }
      if (chain[index].type === 'strum') {
        if ('strumDown' in payload && !('strumPattern' in payload))
          block.strumPattern = payload.strumDown === true ? 'descending' : 'ascending';
        if ('strumPattern' in payload)
          block.strumDown = payload.strumPattern === 'descending';
      }
      // Native commands clamp and order calibration ranges immediately. Re-normalize the
      // edited slot here too, so localhost never previews an impossible device profile.
      chain[index] = normalizeMidiSlot(chain[index]);
    }
    return next;
  }
  if (cmd === 'setPartArp' || cmd === 'setPartMidiFx') {
    const target = part(payload.partId);
    if (!target) return next;
    const block = cmd === 'setPartArp' ? target.arp : target.midiFx;
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'cmd' || key === 'partId' || !(key in block)) continue;
      block[key] = typeof block[key] === 'boolean' ? value === true
        : typeof block[key] === 'number' ? Number(value)
        : Array.isArray(block[key]) ? (Array.isArray(value) ? value.map(Number) : block[key])
        : String(value);
    }
    // The part-level setters are doors onto the chain's first slot of that family, exactly
    // as the native side treats them — mirroring here keeps one truth on screen.
    const wantsArp = cmd === 'setPartArp';
    let slot = target.midiChain.find((s) => (s.type === 'arp') === wantsArp);
    if (!slot) {
      slot = normalizeMidiSlot({ slotId: nextMockId('mock-slot'), type: wantsArp ? 'arp' : 'fx' });
      target.midiChain[wantsArp ? 'push' : 'unshift'](slot);
    }
    if (wantsArp) slot.arp = { ...block };
    else slot.fx = { ...block };
    return next;
  }

  return next; // getState / scan / panic mutate nothing mockable
}

let initialized = false;
let mockLfoTimer = 0;

/** Wires the bridge listeners (or seeds mock state) and asks for the first snapshot.
 *  Idempotent; the workspace calls it on mount. */
export function initInstrumentHostBridge() {
  if (initialized) return;
  initialized = true;

  if (!isJuceAvailable()) {
    hostState.set(mockHostState());
    hostAudioDevices.set(mockAudioDevices());
    hostProject.set(mockHostProject());
    let lastLfoTick = globalThis.performance?.now?.() ?? Date.now();
    mockLfoTimer = window.setInterval(() => {
      const now = globalThis.performance?.now?.() ?? Date.now();
      const elapsed = (now - lastLfoTick) / 1000;
      lastLfoTick = now;
      hostState.update((state) => {
        let next = state;
        if (next.rack.midiLfos.length > 0) next = advanceMockMidiLfos(next, elapsed);
        if (next.rack.envelopes.length > 0) next = advanceMockEnvelopes(next, elapsed);
        if (next.rack.msegs.length > 0) next = advanceMockMsegs(next, elapsed);
        if (next.rack.randomModulators.length > 0)
          next = advanceMockRandomModulators(next, elapsed);
        return next;
      });
    }, 50);
    return;
  }

  onInstrumentHostAudioDevices((payload) => hostAudioDevices.set(normalizeAudioDevices(payload)));
  onInstrumentHostProject((payload) => hostProject.set(normalizeHostProject(payload)));
  onInstrumentHostBuildProgress((payload) => hostBuild.update((b) => applyBuildProgress(b, payload)));
  onInstrumentHostParameters((payload) => hostParameters.set(normalizeHostParameters(payload)));
  onInstrumentHostParamValues((payload) => hostParameters.update((r) => applyParamValues(r, payload)));
  onInstrumentHostLibrary((payload) => hostLibrary.set(normalizeHostLibrary(payload)));
  onInstrumentHostSupportBundle((payload) => hostSupportBundle.set(normalizeSupportBundle(payload)));
  onInstrumentHostLicenceReceipt((payload) => hostLicenceReceipt.set(String(payload?.receipt ?? '')));
  onInstrumentHostMidiActivity((payload) => hostMidiActivity.update((a) => ({
    device: String(payload?.device ?? ''),
    text: String(payload?.text ?? ''),
    // -1 for anything that was not a controller, so the surface drawing cannot light a knob
    // because a note-on happened to arrive.
    cc: Number.isInteger(payload?.cc) ? payload.cc : -1,
    // -1 unless a note: the drawing lights a pad the same way it lights a knob.
    note: Number.isInteger(payload?.note) ? payload.note : -1,
    channel: Number(payload?.channel ?? 0),
    value: Number(payload?.value ?? 0),
    seq: a.seq + 1,
  })));
  onInstrumentHostSurface((payload) => hostSurface.set(normalizeHostSurface(payload)));
  onInstrumentHostSurfaceLayout((payload) => hostSurfaceLayout.set(normalizeSurfaceLayout(payload)));
  onInstrumentHostMidiLearn((payload) => hostMidiLearn.set(normalizeMidiLearn(payload)));
  onInstrumentHostParamLearn((payload) => hostParamLearn.set({
    armed: payload?.armed === true,
    pageId: String(payload?.pageId ?? ''),
    slotId: String(payload?.slotId ?? ''),
    parameterId: String(payload?.parameterId ?? ''),
  }));
  onInstrumentHostArpStep((payload) => hostArpStep.update((steps) => ({
    ...steps,
    [String(payload?.partId ?? '')]: Number.isInteger(payload?.step) ? payload.step : -1,
  })));
  onInstrumentHostLfoActivity((payload) => hostState.update((state) => {
    const values = new Map((Array.isArray(payload?.lfos) ? payload.lfos : []).map((lfo) => [
      String(lfo?.lfoId ?? ''),
      {
        phase: Math.max(0, Math.min(1, Number(lfo?.phase ?? 0) || 0)),
        value: Math.max(0, Math.min(1, Number(lfo?.value ?? 0) || 0)),
      },
    ]));
    const macroValues = new Map((Array.isArray(payload?.macros) ? payload.macros : []).map((macro) => [
      String(macro?.macroId ?? ''),
      Math.max(0, Math.min(1, Number(macro?.value ?? 0) || 0)),
    ]));
    if (values.size === 0) return state;
    return {
      ...state,
      rack: {
        ...state.rack,
        midiLfos: state.rack.midiLfos.map((lfo) => ({ ...lfo, ...(values.get(lfo.lfoId) ?? {}) })),
        macros: state.rack.macros.map((macro) => macroValues.has(macro.macroId)
          ? { ...macro, value: macroValues.get(macro.macroId) } : macro),
        modulationRoutes: state.rack.modulationRoutes.map((route) => route.sourceType === 'lfo'
          && values.has(route.sourceId)
          ? { ...route, sourceValue: values.get(route.sourceId).value }
          : route),
      },
    };
  }));
  onInstrumentHostEnvelopeActivity((payload) => hostState.update((state) => {
    const values = new Map((Array.isArray(payload?.envelopes) ? payload.envelopes : []).map((envelope) => [
      String(envelope?.envelopeId ?? ''),
      {
        stage: ['idle', 'attack', 'decay', 'sustain', 'release'].includes(envelope?.stage)
          ? envelope.stage : 'idle',
        stageProgress: Math.max(0, Math.min(1, Number(envelope?.progress ?? 0) || 0)),
        value: Math.max(0, Math.min(1, Number(envelope?.value ?? 0) || 0)),
        gate: envelope?.gate === true,
      },
    ]));
    const macroValues = new Map((Array.isArray(payload?.macros) ? payload.macros : []).map((macro) => [
      String(macro?.macroId ?? ''),
      Math.max(0, Math.min(1, Number(macro?.value ?? 0) || 0)),
    ]));
    if (values.size === 0) return state;
    return {
      ...state,
      rack: {
        ...state.rack,
        envelopes: state.rack.envelopes.map((envelope) => ({
          ...envelope, ...(values.get(envelope.envelopeId) ?? {}),
        })),
        macros: state.rack.macros.map((macro) => macroValues.has(macro.macroId)
          ? { ...macro, value: macroValues.get(macro.macroId) } : macro),
        modulationRoutes: state.rack.modulationRoutes.map((route) => route.sourceType === 'envelope'
          && values.has(route.sourceId)
          ? { ...route, sourceValue: values.get(route.sourceId).value }
          : route),
      },
    };
  }));
  onInstrumentHostMsegActivity((payload) => hostState.update((state) => {
    const values = new Map((Array.isArray(payload?.msegs) ? payload.msegs : []).map((mseg) => [
      String(mseg?.msegId ?? ''),
      {
        phase: Math.max(0, Math.min(1, Number(mseg?.phase ?? 0) || 0)),
        value: Math.max(0, Math.min(1, Number(mseg?.value ?? 0) || 0)),
      },
    ]));
    const macroValues = new Map((Array.isArray(payload?.macros) ? payload.macros : []).map((macro) => [
      String(macro?.macroId ?? ''),
      Math.max(0, Math.min(1, Number(macro?.value ?? 0) || 0)),
    ]));
    if (values.size === 0) return state;
    return {
      ...state,
      rack: {
        ...state.rack,
        msegs: state.rack.msegs.map((mseg) => ({ ...mseg, ...(values.get(mseg.msegId) ?? {}) })),
        macros: state.rack.macros.map((macro) => macroValues.has(macro.macroId)
          ? { ...macro, value: macroValues.get(macro.macroId) } : macro),
        modulationRoutes: state.rack.modulationRoutes.map((route) => route.sourceType === 'mseg'
          && values.has(route.sourceId)
          ? { ...route, sourceValue: values.get(route.sourceId).value }
          : route),
      },
    };
  }));
  onInstrumentHostRandomModulatorActivity((payload) => hostState.update((state) => {
    const values = new Map((Array.isArray(payload?.randomModulators)
      ? payload.randomModulators : []).map((random) => [
        String(random?.randomId ?? ''),
        {
          phase: Math.max(0, Math.min(1, Number(random?.phase ?? 0) || 0)),
          value: Math.max(0, Math.min(1, Number(random?.value ?? 0) || 0)),
          step: Math.floor(Number(random?.step ?? -1) || 0),
        },
      ]));
    const macroValues = new Map((Array.isArray(payload?.macros) ? payload.macros : []).map((macro) => [
      String(macro?.macroId ?? ''),
      Math.max(0, Math.min(1, Number(macro?.value ?? 0) || 0)),
    ]));
    if (values.size === 0) return state;
    return {
      ...state,
      rack: {
        ...state.rack,
        randomModulators: state.rack.randomModulators.map((random) => ({
          ...random, ...(values.get(random.randomId) ?? {}),
        })),
        macros: state.rack.macros.map((macro) => macroValues.has(macro.macroId)
          ? { ...macro, value: macroValues.get(macro.macroId) } : macro),
        modulationRoutes: state.rack.modulationRoutes.map((route) => route.sourceType === 'random'
          && values.has(route.sourceId)
          ? { ...route, sourceValue: values.get(route.sourceId).value }
          : route),
      },
    };
  }));
  onInstrumentHostChordLearn((payload) => hostChordLearn.set({
    armed: payload?.armed === true,
    partId: String(payload?.partId ?? ''),
    stage: String(payload?.stage ?? ''),
    key: Number.isInteger(payload?.key) ? payload.key : -1,
  }));
  onInstrumentHostHardwarePatchCapture((payload) => hostPatchCapture.set({
    armed: payload?.armed === true,
    partId: String(payload?.partId ?? ''),
    messages: Number(payload?.messages ?? 0),
    bytes: Number(payload?.bytes ?? 0),
  }));
  onInstrumentHostHardwarePatchSend((payload) => hostPatchSends.update((sends) => {
    const partId = String(payload?.partId ?? '');
    if (!partId) return sends;
    const rest = { ...sends };
    // A finished send leaves the map rather than sitting in it at 100%: "nothing here" is
    // how the UI knows nothing is going out.
    if (payload?.done === true) { delete rest[partId]; return rest; }
    return { ...rest, [partId]: { sent: Number(payload?.sent ?? 0), total: Number(payload?.total ?? 0) } };
  }));
  onInstrumentHostPatchCompare((payload) => hostPatchCompare.set(normalizePatchCompare(payload)));
  onInstrumentHostHardwarePatchPrompt((payload) => hostPatchPrompt.set(
    (Array.isArray(payload?.parts) ? payload.parts : []).map((p) => ({
      partId: String(p?.partId ?? ''),
      patchName: String(p?.patchName ?? ''),
    })).filter((p) => p.partId),
  ));
  onInstrumentHostState((payload) => hostState.set(normalizeHostState(payload)));
  onInstrumentHostScanProgress((payload) => {
    hostScanLog.update((lines) => [...lines.slice(-49), String(payload?.line ?? '')]);
    // done means the catalogue changed on the scan thread; the fresh snapshot has to come
    // through the normal command path (see InstrumentHostService.cpp, runScanNow).
    if (payload?.done === true) send({ cmd: 'getState' });
  });
  onInstrumentHostError((payload) => hostLastError.set(String(payload?.message ?? '')));
  send({ cmd: 'getState' });
}

// Favourites live in the host's own folder natively, keyed by plug-in class. The browser
// preview has neither, so it keeps them here for the session — enough to exercise the star,
// the pinning and the ordering without pretending to persist anything.
const mockFavourites = new Set();

// Replaces one part with a changed copy, new array and all. The mock used to mutate parts in
// place and return `{ ...state }`, which the store accepted and Svelte's keyed each ignored:
// same part reference, no re-render — the preset name showed up only after refocusing the
// part. A new object per changed part is what the reactivity is keyed on.
function withPart(state, partId, change) {
  return {
    ...state,
    rack: {
      ...state.rack,
      parts: state.rack.parts.map((p) => (p.partId === partId ? { ...p, ...change(p) } : p)),
    },
  };
}

// The browser preview has no MIDI in, so a capture has nothing to hear. Rather than leave the
// counter at zero — which is what a synth that never answered looks like, and would make the
// preview indistinguishable from a broken cable — it stands in a plausible dump the moment
// capture is armed. Nothing about the real path is faked: the bytes never exist here.
const mockPatchBytes = 296;

// The controller the owner described, in the browser preview only. Native keeps it in the
// data directory; here it lasts the session, which is all a preview needs.
let mockOwnSurface = null;
let mockSurfaceLearning = false;
let mockSurfaceHeard = 0;
let mockStageUnlockStartedAt = 0;

const mockOwnSurfaceFields = () => ({
  userSurface: mockOwnSurface?.name ?? '',
  userEncoders: mockOwnSurface?.encoders ?? 0,
  userFaders: mockOwnSurface?.faders ?? 0,
  userPads: mockOwnSurface?.pads ?? 0,
  learning: mockSurfaceLearning,
  heard: mockSurfaceHeard,
});

/** The same schematic buildGenericLayout draws natively: families in their own bands, sized
    from the count so a row always fits and nothing can overlap. */
function mockGenericLayout(own) {
  const controls = [];
  const place = (kind, prefix, count, perRow, left, right, top, bottom, addressable) => {
    if (count <= 0) return;
    const columns = Math.max(1, Math.min(perRow, count));
    const rows = Math.ceil(count / columns);
    const cellW = (right - left) / columns;
    const cellH = (bottom - top) / rows;
    const w = cellW * 0.7;
    const h = cellH * 0.7;
    for (let i = 0; i < count; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      controls.push({ controlId: `${prefix}${i + 1}`, kind, label: String(i + 1),
                      x: left + column * cellW + (cellW - w) / 2,
                      y: top + row * cellH + (cellH - h) / 2,
                      w, h, index: addressable ? i : -1 });
    }
  };
  place('fader', 'fader-', own.faders, 9, 0.03, 0.34, 0.07, 0.31, true);
  place('encoder', 'encoder-', own.encoders, 8, 0.40, 0.97, 0.07, 0.31, true);
  place('pad', 'pad-', own.pads, 8, 0.40, 0.97, 0.35, 0.53, true);
  controls.push({ controlId: 'keys', kind: 'keys', label: 'Keys',
                  x: 0.02, y: 0.57, w: 0.96, h: 0.40, index: -1 });
  return { profileId: 'user', displayName: own.name, vendor: 'Described by you',
           aspect: 2.3, controls };
}

function send(payload) {
  if (!isJuceAvailable()) {
    if (payload?.cmd === 'beginStageUnlock') {
      if (get(hostState).stageLocked && mockStageUnlockStartedAt <= 0)
        mockStageUnlockStartedAt = Date.now();
      return;
    }
    if (payload?.cmd === 'cancelStageUnlock') {
      mockStageUnlockStartedAt = 0;
      return;
    }
    if (payload?.cmd === 'setStageLock') {
      const requested = payload.enabled === true;
      const unlockAuthorized = !requested && get(hostState).stageLocked
        && mockStageUnlockStartedAt > 0 && Date.now() - mockStageUnlockStartedAt >= 900;
      mockStageUnlockStartedAt = 0;
      if (!requested && get(hostState).stageLocked && !unlockAuthorized) {
        hostLastError.set('Hold Build for one second to leave Stage Lock.');
        return;
      }
      hostState.set(applyMockCommand(get(hostState), {
        ...payload, _unlockAuthorized: unlockAuthorized,
      }));
      return;
    }
    if (!stageCommandAllowed(get(hostState).stageLocked, payload?.cmd)) {
      hostLastError.set(`Stage Lock blocked '${String(payload?.cmd ?? '')}'. Hold Build for one second before changing the rig.`);
      return;
    }

    // Device commands mutate the device store, everything else the host state.
    if (payload?.cmd === 'setAudioDevice') {
      hostAudioDevices.update((d) => ({ ...d, current: String(payload.name ?? d.current) }));
      return;
    }
    if (payload?.cmd === 'setMidiInputEnabled') {
      hostAudioDevices.update((d) => ({
        ...d,
        midiInputs: d.midiInputs.map((m) =>
          m.id === payload.id ? { ...m, enabled: payload.enabled === true } : m
        ),
      }));
      return;
    }
    if (payload?.cmd === 'getAudioDevices') return;
    if (payload?.cmd === 'getHostProject') return; // seeded by init
    if (payload?.cmd === 'setHostProject') {
      // The native rule, mirrored: authored fields merge, the appId never does.
      hostProject.update((project) => {
        const next = { ...project };
        for (const key of ['productName', 'version', 'publisher'])
          if (payload[key] !== undefined) next[key] = String(payload[key]).trim();
        for (const key of ['includeStandalone', 'includeVst3'])
          if (payload[key] !== undefined) next[key] = payload[key] === true;
        return next;
      });
      return;
    }
    if (payload?.cmd === 'buildHostProduct') {
      const project = get(hostProject);
      hostBuild.set(applyBuildProgress(emptyHostBuild(), { line: `Building "${project.productName}" ${project.version} (mock)` }));
      hostBuild.update((b) => applyBuildProgress(b, { line: 'Staged mock product folder.', done: true, ok: true }));
      return;
    }
    if (payload?.cmd === 'toggleParameterFavourite') {
      if (mockFavourites.has(payload.parameterId)) mockFavourites.delete(payload.parameterId);
      else mockFavourites.add(payload.parameterId);
      send({ cmd: 'getParameters', partId: payload.partId });
      return;
    }
    if (payload?.cmd === 'getParameters') {
      const state = get(hostState);
      const part = state.rack.parts.find((p) => p.partId === payload.partId);
      if (part) {
        // A part answers with its plug-in rows (when loaded) plus its mixer addresses —
        // the native Stage 5 registry, mirrored.
        const base = part.hasInstrument ? mockHostParameters(payload.partId).parameters : [];
        const mixer = [
          { id: '@gain', name: 'Level', group: 'Mixer', value: part.volume / 2,
            text: part.volume.toFixed(2), defaultValue: 0.5 },
          { id: '@pan', name: 'Pan', group: 'Mixer', value: (part.pan + 1) / 2,
            text: part.pan.toFixed(2), defaultValue: 0.5 },
          ...state.rack.returns.map((r) => ({
            id: `@send:${r.returnId}`, name: `Send — ${r.name}`, group: 'Mixer',
            value: (part.sends.find((s) => s.returnId === r.returnId)?.level ?? 0) / 2,
            text: (part.sends.find((s) => s.returnId === r.returnId)?.level ?? 0).toFixed(2),
            defaultValue: 0,
          })),
        ];
        hostParameters.set(normalizeHostParameters({
          partId: payload.partId,
          parameters: [...base, ...mixer],
          favourites: [...mockFavourites],
        }));
        return;
      }
      const effect = [...state.rack.masterEffects, ...state.rack.parts.flatMap((p) => p.effects),
                      ...state.rack.returns.flatMap((r) => r.effects),
                      ...state.rack.buses.flatMap((b) => b.effects)]
        .find((e) => e.effectId === payload.partId);
      hostParameters.set(effect?.hasProcessor
        ? normalizeHostParameters({ partId: payload.partId, parameters: [
            { id: 'wet', index: 0, name: 'Wet', value: 1, text: '1.00', defaultValue: 1 }] })
        : emptyHostParameters());
      return;
    }
    if (payload?.cmd === 'setParameterText') {
      hostParameters.update((registry) => {
        if (registry.partId !== payload.partId) return registry;
        return {
          ...registry,
          parameters: registry.parameters.map((d) => {
            if (d.id !== payload.id) return d;
            // The native side lets the plug-in parse; the mock does the two obvious reads —
            // a value-text by name, else a plain number over the normalized range.
            const byName = d.valueTexts.findIndex(
              (t) => t.toLowerCase() === String(payload.text ?? '').trim().toLowerCase());
            const value = byName >= 0 && d.numSteps > 1
              ? byName / (d.numSteps - 1)
              : Math.min(1, Math.max(0, Number.parseFloat(payload.text) || 0));
            return { ...d, value, text: mockParamText(d, value) };
          }),
        };
      });
      return;
    }
    if (payload?.cmd === 'setParameter' || payload?.cmd === 'resetParameter') {
      hostParameters.update((registry) => {
        if (registry.partId !== payload.partId) return registry;
        return {
          ...registry,
          parameters: registry.parameters.map((d) => {
            if (d.id !== payload.id) return d;
            const value = payload.cmd === 'resetParameter'
              ? d.defaultValue
              : Math.min(1, Math.max(0, Number(payload.value ?? 0)));
            return { ...d, value, text: mockParamText(d, value) };
          }),
        };
      });
      // Virtual addresses write the rack itself; the demo mirrors the visible half.
      const id = String(payload.id ?? '');
      if (id === '@gain' || id === '@pan') {
        const value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
        hostState.set(applyMockCommand(get(hostState), {
          cmd: 'setPartMixer', partId: payload.partId,
          ...(id === '@gain' ? { volume: value * 2 } : { pan: value * 2 - 1 }),
        }));
      } else if (id.startsWith('@send:')) {
        const value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
        hostState.set(applyMockCommand(get(hostState), {
          cmd: 'setSendLevel', partId: payload.partId,
          returnId: id.slice(6), level: value * 2,
        }));
      }
      return;
    }
    if (payload?.cmd === 'beginParameterGesture' || payload?.cmd === 'endParameterGesture') return;
    if (payload?.cmd === 'getSurfaceLayout') {
      const authored = { ...mockSurfaceLayout(), profileId: 'mock-ctrl49' };
      const useOwn = mockOwnSurface && !payload.profileId;
      hostSurfaceLayout.set(normalizeSurfaceLayout({
        ...(useOwn ? { ...mockGenericLayout(mockOwnSurface), profileId: 'user' } : authored),
        ...mockOwnSurfaceFields(),
        own: !!useOwn,
        profiles: [{ profileId: 'mock-ctrl49', displayName: authored.displayName, vendor: authored.vendor }],
      }));
      return;
    }
    // Describing a controller: the browser preview has no hardware and no data directory, so
    // it keeps the description for the session and builds the same generic drawing the native
    // side does — enough to exercise the form, the counts and the picture.
    if (payload?.cmd === 'setUserSurface') {
      mockOwnSurface = { name: String(payload.name ?? '').trim(),
                         encoders: Number(payload.encoders) || 0,
                         faders: Number(payload.faders) || 0,
                         pads: Number(payload.pads) || 0 };
      if (!mockOwnSurface.name
          || mockOwnSurface.encoders + mockOwnSurface.faders + mockOwnSurface.pads === 0) {
        mockOwnSurface = null;
        hostLastError.set('Describe a controller with a name and at least one control.');
        return;
      }
      mockSurfaceLearning = false;
      send({ cmd: 'getSurfaceLayout' });
      return;
    }
    if (payload?.cmd === 'clearUserSurface') {
      mockOwnSurface = null;
      mockSurfaceLearning = false;
      send({ cmd: 'getSurfaceLayout' });
      return;
    }
    if (payload?.cmd === 'learnUserSurface') {
      // Nothing to sweep in a browser, so the mock 'hears' eight at once.
      mockSurfaceLearning = true;
      mockSurfaceHeard = 8;
      send({ cmd: 'getSurfaceLayout' });
      return;
    }
    if (payload?.cmd === 'finishUserSurfaceLearn') {
      mockSurfaceLearning = false;
      mockOwnSurface = { name: String(payload.name ?? '').trim() || 'My controller',
                         encoders: mockSurfaceHeard, faders: 0, pads: 0 };
      send({ cmd: 'getSurfaceLayout' });
      return;
    }
    if (payload?.cmd === 'getLibrary' || payload?.cmd === 'scanLibrary') {
      hostLibrary.set(mockHostLibrary(payload.query ?? '', payload.type ?? ''));
      return;
    }
    if (payload?.cmd === 'saveUserPreset' || payload?.cmd === 'saveRackToLibrary'
        || payload?.cmd === 'saveChainToLibrary') {
      const kind = payload.cmd === 'saveRackToLibrary' ? 'rack'
                 : payload.cmd === 'saveChainToLibrary' ? 'chain' : 'preset';
      const part = get(hostState).rack.parts.find((p) => p.partId === payload.partId);
      // A hardware part saves the patch it captured; with nothing captured there is nothing
      // to save, and the native side refuses aloud — so does this.
      const hardwarePatch = kind === 'preset' && part?.hardware === true;
      if (hardwarePatch && !(part.hardwarePatchBytes > 0)) {
        hostLastError.set('Capture a patch from the synth first — there is nothing to save yet.');
        return;
      }
      const hardwareName = part?.midiOutputName || 'External hardware';
      const fallbackName = { rack: 'Rack capture', chain: `${part?.pluginName ?? 'Chain'} chain`,
                             preset: hardwarePatch
                               ? (part.hardwarePatchName || `${hardwareName} patch`)
                               : `${part?.pluginName ?? 'Instrument'} preset` }[kind];
      const recordId = nextMockId('lib-user');
      hostLibrary.update((lib) => normalizeHostLibrary({
        ...lib,
        records: [...lib.records, {
          recordId,
          type: kind,
          sourceType: hardwarePatch ? 'hardwarePatch'
            : { rack: 'rackCapture', chain: 'chainCapture', preset: 'userState' }[kind],
          name: payload.name || fallbackName,
          instrument: hardwarePatch ? hardwareName : (part?.pluginName ?? ''),
          targetCeId: hardwarePatch ? `hw:${hardwareName.trim().toLowerCase()}` : (part?.pluginCeId ?? ''),
          available: true,
        }],
        counts: {
          ...lib.counts,
          total: lib.counts.total + 1,
          [kind === 'preset' ? 'presets' : kind === 'chain' ? 'chains' : 'racks']:
            Number(lib.counts[kind === 'preset' ? 'presets' : kind === 'chain' ? 'chains' : 'racks'] ?? 0) + 1,
        },
      }));
      if (kind === 'preset' && part)
        hostState.update((st) => withPart(st, part.partId,
          () => ({ presetRecordId: recordId, presetName: payload.name || fallbackName })));
      return;
    }
    if (payload?.cmd === 'setLibraryUserMetadata') {
      hostLibrary.update((lib) => ({
        ...lib,
        records: lib.records.map((r) => r.recordId === payload.recordId
          ? { ...r,
              favourite: payload.favourite !== undefined ? payload.favourite === true : r.favourite,
              rating: payload.rating !== undefined ? Number(payload.rating) : r.rating,
              notes: payload.notes !== undefined ? String(payload.notes) : r.notes }
          : r),
      }));
      return;
    }
    if (payload?.cmd === 'removeLibraryRecord') {
      hostLibrary.update((lib) => ({
        ...lib,
        records: lib.records.filter((r) => r.recordId !== payload.recordId || r.factory),
      }));
      return;
    }
    if (payload?.cmd === 'setPresetAudition') {
      hostState.update((st) => normalizeHostState({
        ...st,
        rack: {
          ...st.rack,
          presetAudition: { ...st.rack.presetAudition, ...payload, playing: false },
        },
      }));
      return;
    }
    if (payload?.cmd === 'startSoundComparison') {
      const library = get(hostLibrary);
      hostState.update((state) => {
        const next = normalizeHostState(state);
        const target = next.rack.parts.find((p) => p.partId
          === (payload.partId || next.rack.focusedPartId));
        if (!target?.hasInstrument || target.hardware) {
          hostLastError.set('Focus a software instrument before starting Sound Comparison Mode.');
          return next;
        }
        const requested = Array.isArray(payload.recordIds) ? payload.recordIds.map(String) : [];
        const candidates = library.records.filter((record) => record.type === 'preset'
          && record.available && record.sourceType !== 'hardwarePatch'
          && record.targetCeId === target.pluginCeId
          && (requested.length === 0 || requested.includes(record.recordId))).slice(0, 20);
        if (candidates.length < 2) {
          hostLastError.set(`Sound Comparison Mode needs at least two available presets for ${target.pluginName}.`);
          return next;
        }
        const originalRecordId = target.presetRecordId;
        const originalName = target.presetName || 'Original sound';
        let index = candidates.findIndex((record) => record.recordId === target.presetRecordId);
        if (index < 0) index = 0;
        const current = candidates[index];
        Object.assign(target, { presetRecordId: current.recordId, presetName: current.name });
        next.rack.soundComparison = {
          active: true, partId: target.partId, index, count: candidates.length,
          recordId: current.recordId, name: current.name,
          originalRecordId, originalName, recordIds: candidates.map((record) => record.recordId),
        };
        return next;
      });
      return;
    }
    if (payload?.cmd === 'stepSoundComparison') {
      hostState.update((state) => {
        const next = normalizeHostState(state);
        const comparison = next.rack.soundComparison;
        if (!comparison.active || comparison.recordIds.length === 0) return next;
        const delta = Number(payload.delta) < 0 ? -1 : 1;
        const index = (comparison.index + delta + comparison.recordIds.length)
          % comparison.recordIds.length;
        const record = get(hostLibrary).records.find((r) => r.recordId
          === comparison.recordIds[index]);
        const target = next.rack.parts.find((p) => p.partId === comparison.partId);
        if (!record || !target) return next;
        Object.assign(target, { presetRecordId: record.recordId, presetName: record.name });
        Object.assign(comparison, { index, recordId: record.recordId, name: record.name });
        return next;
      });
      return;
    }
    if (payload?.cmd === 'keepSoundComparison' || payload?.cmd === 'cancelSoundComparison') {
      hostState.update((state) => {
        const next = normalizeHostState(state);
        const comparison = next.rack.soundComparison;
        if (!comparison.active) return next;
        const target = next.rack.parts.find((p) => p.partId === comparison.partId);
        if (target && payload.cmd === 'cancelSoundComparison')
          Object.assign(target, { presetRecordId: comparison.originalRecordId,
                                  presetName: comparison.originalName === 'Original sound'
                                    ? '' : comparison.originalName });
        next.rack.soundComparison = normalizeHostState({}).rack.soundComparison;
        return next;
      });
      return;
    }
    if (payload?.cmd === 'loadLibraryRecord' || payload?.cmd === 'auditionLibraryRecord') {
      // Mirrors the visible half: an added part appears; a focused load leaves structure alone.
      const record = get(hostLibrary).records.find((r) => r.recordId === payload.recordId);
      if (!record?.available) return;
      if ((record.type === 'preset' || record.type === 'chain') && payload.action === 'add') {
        const next = applyMockCommand(get(hostState), { cmd: 'addPart' });
        const added = next.rack.parts.at(-1);
        if (record.sourceType === 'hardwarePatch') {
          // The new part becomes a hardware part with the patch on it and no port yet — the
          // port picker is one click away, exactly as native leaves it.
          added.hardware = true;
          added.hasInstrument = false;
          added.hardwarePatchName = record.name;
          added.hardwarePatchBytes = mockPatchBytes;
          added.presetRecordId = record.recordId;
          added.presetName = record.name;
          hostState.set(next);
          return;
        }
        added.pluginName = record.type === 'chain' ? (record.instrument || record.name) : record.name;
        added.pluginVendor = record.manufacturer;
        added.hasInstrument = true;
        if (record.type === 'chain') {
          added.presetRecordId = record.recordId;
          added.presetName = record.name;
        }
        hostState.set(next);
        return;
      }
      if (record.type === 'chain') {
        // A chain replaces the voice: the instrument the record names, and the cursor moves
        // to the chain — the mock shows the visible half, as the preset path does.
        hostState.update((st) => withPart(st, payload.partId || st.rack.focusedPartId, () => ({
          pluginName: record.instrument || record.name,
          pluginVendor: record.manufacturer,
          hasInstrument: true,
          presetRecordId: record.recordId,
          presetName: record.name,
        })));
        return;
      }
      if (record.type === 'preset') {
        // The focused load's visible half is the preset cursor moving on the part.
        hostState.update((st) => {
          const targetId = payload.partId || st.rack.focusedPartId;
          const target = st.rack.parts.find((p) => p.partId === targetId);
          if (!target) return st;
          if (record.sourceType === 'hardwarePatch') {
            if (target.hasInstrument) {
              hostLastError.set(`${record.name} is a hardware patch — load it onto a hardware part.`);
              return st;
            }
            return withPart(st, targetId, () => ({
              hardware: true,
              hardwarePatchName: record.name,
              hardwarePatchBytes: mockPatchBytes,
              presetRecordId: record.recordId,
              presetName: record.name,
            }));
          }
          if (!target.hasInstrument) return st;
          return withPart(st, targetId,
            () => ({ presetRecordId: record.recordId, presetName: record.name }));
        });
      }
      return;
    }
    if (payload?.cmd === 'addLibraryPath' || payload?.cmd === 'removeLibraryPath'
        || payload?.cmd === 'browseLibraryPath') return;
    if (payload?.cmd === 'setControlSlotValue') {
      // Mirror the native mapping far enough for the demo: drive the parameter view when the
      // bound part's registry is on screen.
      const page = get(hostState).rack.pages.find((p) => p.pageId === payload.pageId);
      const slot = page?.slots.find((s) => s.slotId === payload.slotId);
      if (!slot?.resolved) return;
      const raw = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
      const positioned = slot.inverted ? 1 - raw : raw;
      const mapped = slot.rangeMin + positioned * (slot.rangeMax - slot.rangeMin);
      hostParameters.update((registry) => {
        if (registry.partId !== slot.partId) return registry;
        return {
          ...registry,
          parameters: registry.parameters.map((d) =>
            d.id === slot.parameterId ? { ...d, value: mapped, text: mockParamText(d, mapped) } : d),
        };
      });
      return;
    }
    hostState.set(applyMockCommand(get(hostState), payload));
    return;
  }
  sendInstrumentHostCommand(payload);
}

export const requestHostState = () => send({ cmd: 'getState' });
export const setStageLock = (enabled) => send({ cmd: 'setStageLock', enabled: enabled === true });
export const beginStageUnlock = () => send({ cmd: 'beginStageUnlock' });
export const cancelStageUnlock = () => send({ cmd: 'cancelStageUnlock' });
export const scanForInstruments = () => send({ cmd: 'scan' });
export const addScanPath = (path) => send({ cmd: 'addScanPath', path });
export const browseScanPath = () => send({ cmd: 'browseScanPath' });
export const removeScanPath = (path) => send({ cmd: 'removeScanPath', path });
export const clearQuarantine = (modulePath) => send({ cmd: 'clearQuarantine', modulePath });
export const addRackPart = () => send({ cmd: 'addPart' });
export const removeRackPart = (partId) => send({ cmd: 'removePart', partId });
export const focusRackPart = (partId) => send({ cmd: 'focusPart', partId });
export const moveRackPart = (partId, index) => send({ cmd: 'movePart', partId, index });
export const loadInstrument = (partId, ceId) => send({ cmd: 'loadInstrument', partId, ceId });
export const unloadInstrument = (partId) => send({ cmd: 'unloadInstrument', partId });
export const setPartMixer = (partId, fields) => send({ cmd: 'setPartMixer', partId, ...fields });
export const setPartMidiRules = (partId, fields) => send({ cmd: 'setPartMidiRules', partId, ...fields });
export const importScalaTuning = (text, sourceName = '') =>
  send({ cmd: 'importScalaTuning', text: String(text ?? ''), sourceName });
export const resetMicrotuning = () => send({ cmd: 'resetMicrotuning' });
export const setMicrotuning = (fields) => send({ cmd: 'setMicrotuning', ...fields });
export const setPartMicrotuning = (partId, enabled) =>
  send({ cmd: 'setPartMicrotuning', partId, enabled: enabled === true });
export const sendMicrotuning = (partId = '') =>
  send(partId ? { cmd: 'sendMicrotuning', partId } : { cmd: 'sendMicrotuning' });
export const hostPanic = (partId) => send(partId ? { cmd: 'panic', partId } : { cmd: 'panic' });
export const openEditor = (partId) => send({ cmd: 'openEditor', partId });
export const closeEditor = () => send({ cmd: 'closeEditor' });
export const floatEditor = (partId) => send({ cmd: 'floatEditor', partId });
export const closeEditorWindow = (partId) => send({ cmd: 'closeEditorWindow', partId });
export const requestAudioDevices = () => send({ cmd: 'getAudioDevices' });
export const setAudioDevice = (name) => send({ cmd: 'setAudioDevice', name });
export const setMidiInputEnabled = (id, enabled) => send({ cmd: 'setMidiInputEnabled', id, enabled });
export const requestParameters = (partId) => send({ cmd: 'getParameters', partId });
export const setParameter = (partId, id, value) => send({ cmd: 'setParameter', partId, id, value });
export const setParameterText = (partId, id, text) => send({ cmd: 'setParameterText', partId, id, text });
export const quickLearnParameter = (partId, parameterId) =>
  send({ cmd: 'quickLearnParameter', partId, parameterId });
export const resetParameter = (partId, id) => send({ cmd: 'resetParameter', partId, id });
export const beginParameterGesture = (partId, id) => send({ cmd: 'beginParameterGesture', partId, id });
export const endParameterGesture = (partId, id) => send({ cmd: 'endParameterGesture', partId, id });
export const addEffect = (chainId, ceId) => send({ cmd: 'addEffect', chainId, ceId });
export const removeEffect = (effectId) => send({ cmd: 'removeEffect', effectId });
export const moveEffect = (effectId, index) => send({ cmd: 'moveEffect', effectId, index });
export const setCanvasPosition = (nodeId, x, y) =>
  send({ cmd: 'setCanvasPosition', nodeId, x: Math.round(x), y: Math.round(y) });
export const clearCanvasPositions = () => send({ cmd: 'clearCanvasPositions' });
/** Opens the native picker; `file` is for tests and scripts, never the UI. */
export const setPluginArtwork = (ceId, file) => send({ cmd: 'setPluginArtwork', ceId, file });
export const clearPluginArtwork = (ceId) => send({ cmd: 'clearPluginArtwork', ceId });
export const setEffectBypassed = (effectId, bypassed) => send({ cmd: 'setEffectBypassed', effectId, bypassed });
export const openEffectEditor = (effectId) => send({ cmd: 'openEffectEditor', effectId });
export const addReturn = (name) => send(name ? { cmd: 'addReturn', name } : { cmd: 'addReturn' });
export const removeReturn = (returnId) => send({ cmd: 'removeReturn', returnId });
export const renameReturn = (returnId, name) => send({ cmd: 'renameReturn', returnId, name });
export const setReturnLevel = (returnId, level) => send({ cmd: 'setReturnLevel', returnId, level });
export const addBus = (name) => send(name ? { cmd: 'addBus', name } : { cmd: 'addBus' });
export const removeBus = (busId) => send({ cmd: 'removeBus', busId });
export const renameBus = (busId, name) => send({ cmd: 'renameBus', busId, name });
export const setBusLevel = (busId, level) => send({ cmd: 'setBusLevel', busId, level });
export const setBusDestination = (busId, destinationBusId) =>
  send({ cmd: 'setBusDestination', busId, destinationBusId });
/** One part driving another: '' hands the part back to the keyboard. */
export const setPartMidiSource = (partId, sourcePartId) =>
  send({ cmd: 'setPartMidiSource', partId, sourcePartId: sourcePartId ?? '' });
export const addLayerGroup = (name = '', partIds = []) => send({
  cmd: 'addLayerGroup', ...(name ? { name } : {}), ...(partIds.length ? { partIds } : {}),
});
export const removeLayerGroup = (layerGroupId) =>
  send({ cmd: 'removeLayerGroup', layerGroupId });
export const setLayerGroup = (layerGroupId, fields) =>
  send({ cmd: 'setLayerGroup', layerGroupId, ...fields });
export const addLayerMember = (layerGroupId, partId) =>
  send({ cmd: 'addLayerMember', layerGroupId, partId });
export const removeLayerMember = (layerGroupId, partId) =>
  send({ cmd: 'removeLayerMember', layerGroupId, partId });
export const setLayerMember = (layerGroupId, partId, fields) =>
  send({ cmd: 'setLayerMember', layerGroupId, partId, ...fields });
export const setPartDestination = (partId, busId) =>
  send({ cmd: 'setPartDestination', partId, busId });
export const setSendLevel = (partId, returnId, level) =>
  send({ cmd: 'setSendLevel', partId, returnId, level });
export const setExtraOut = (partId, pairIndex, gain) =>
  send({ cmd: 'setExtraOut', partId, pairIndex, gain });
export const removeExtraOut = (partId, pairIndex) => send({ cmd: 'removeExtraOut', partId, pairIndex });
export const setHardwareConfig = (partId, fields) => send({ cmd: 'setHardwareConfig', partId, ...fields });
export const clearHardware = (partId) => send({ cmd: 'clearHardware', partId });
export const sendHardwareProgram = (partId) => send({ cmd: 'sendHardwareProgram', partId });

// -- hardware total recall ----------------------------------------------------------------
// Capture is armed, never automatic: system-exclusive traffic is indistinguishable from any
// other, so the window is the only thing that says "this dump is the patch".
export const captureHardwarePatch = (partId) => {
  if (!isJuceAvailable())
    hostPatchCapture.set({ armed: true, partId, messages: 2, bytes: mockPatchBytes });
  send({ cmd: 'captureHardwarePatch', partId });
};
export const cancelHardwarePatchCapture = () => {
  hostPatchCapture.set({ armed: false, partId: '', messages: 0, bytes: 0 });
  send({ cmd: 'cancelHardwarePatchCapture' });
};
export const finishHardwarePatchCapture = (partId, name) => {
  if (!isJuceAvailable())
    hostPatchCapture.set({ armed: false, partId: '', messages: 0, bytes: 0 });
  send({ cmd: 'finishHardwarePatchCapture', partId, name: name ?? '' });
};
export const clearHardwarePatch = (partId) => send({ cmd: 'clearHardwarePatch', partId });
export const sendHardwarePatch = (partId) => send({ cmd: 'sendHardwarePatch', partId });
export const setHardwareRestorePolicy = (partId, policy) =>
  send({ cmd: 'setHardwareRestorePolicy', partId, policy });
/** Where the part's captured patch and a library patch differ. */
export const compareHardwarePatch = (partId, recordId) => {
  if (!isJuceAvailable()) {
    // No bytes in the browser, so the preview stands in a small, plausible answer: the
    // panel, the counts and the offset list are what is being exercised.
    const part = get(hostState).rack.parts.find((p) => p.partId === partId);
    const record = get(hostLibrary).records.find((r) => r.recordId === recordId);
    if (!part?.hardwarePatchBytes) { hostLastError.set('That part has no captured patch to compare.'); return; }
    if (!record || record.sourceType !== 'hardwarePatch') { hostLastError.set('That library record is not a hardware patch.'); return; }
    const identical = record.name === part.hardwarePatchName;
    hostPatchCompare.set(normalizePatchCompare({
      partId, recordId, nameA: part.hardwarePatchName, nameB: record.name, identical,
      messagesA: 2, messagesB: 2, bytesA: mockPatchBytes, bytesB: mockPatchBytes,
      totalDifferences: identical ? 0 : 3, truncated: false,
      differences: identical ? [] : [
        { message: 0, offset: 7, before: 0x40, after: 0x52 },
        { message: 0, offset: 12, before: 0x00, after: 0x7f },
        { message: 1, offset: 9, before: 0x23, after: 0x21 },
      ],
    }));
    return;
  }
  send({ cmd: 'compareHardwarePatches', partId, recordId });
};
export const clearPatchCompare = () => hostPatchCompare.set(null);
export const addMacro = (name) => send(name ? { cmd: 'addMacro', name } : { cmd: 'addMacro' });
export const removeMacro = (macroId) => send({ cmd: 'removeMacro', macroId });
export const renameMacro = (macroId, name) => send({ cmd: 'renameMacro', macroId, name });
export const setMacroValue = (macroId, value, final = false) =>
  send({ cmd: 'setMacroValue', macroId, value, final });
export const addMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'addMacroTarget', macroId, targetId, parameterId });
export const removeMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'removeMacroTarget', macroId, targetId, parameterId });
export const setMacroTargetOptions = (macroId, targetId, parameterId, fields) =>
  send({ cmd: 'setMacroTargetOptions', macroId, targetId, parameterId, ...fields });
export const addModulationRoute = (source, targetId, parameterId, amount = 0.25) =>
  send({ cmd: 'addModulationRoute', ...source, targetId, parameterId, amount });
export const setModulationRoute = (routeId, fields) =>
  send({ cmd: 'setModulationRoute', routeId, ...fields });
export const removeModulationRoute = (routeId) =>
  send({ cmd: 'removeModulationRoute', routeId });
export const clearModulationRoutes = () => send({ cmd: 'clearModulationRoutes' });
export const addMidiLfo = (name = '') => send(name ? { cmd: 'addMidiLfo', name } : { cmd: 'addMidiLfo' });
export const setMidiLfo = (lfoId, fields) => send({ cmd: 'setMidiLfo', lfoId, ...fields });
export const resetMidiLfo = (lfoId) => send({ cmd: 'resetMidiLfo', lfoId });
export const removeMidiLfo = (lfoId) => send({ cmd: 'removeMidiLfo', lfoId });
export const addMidiLfoOutput = (lfoId, fields) => send({ cmd: 'addMidiLfoOutput', lfoId, ...fields });
export const setMidiLfoOutput = (lfoId, outputId, fields) =>
  send({ cmd: 'setMidiLfoOutput', lfoId, outputId, ...fields });
export const removeMidiLfoOutput = (lfoId, outputId) =>
  send({ cmd: 'removeMidiLfoOutput', lfoId, outputId });
export const addEnvelope = (name = '') =>
  send(name ? { cmd: 'addEnvelope', name } : { cmd: 'addEnvelope' });
export const setEnvelope = (envelopeId, fields) =>
  send({ cmd: 'setEnvelope', envelopeId, ...fields });
export const triggerEnvelope = (envelopeId, gate, velocity = 1) =>
  send({ cmd: 'triggerEnvelope', envelopeId, gate, velocity });
export const resetEnvelope = (envelopeId) => send({ cmd: 'resetEnvelope', envelopeId });
export const removeEnvelope = (envelopeId) => send({ cmd: 'removeEnvelope', envelopeId });
export const addMseg = (name = '') => send(name ? { cmd: 'addMseg', name } : { cmd: 'addMseg' });
export const setMseg = (msegId, fields) => send({ cmd: 'setMseg', msegId, ...fields });
export const resetMseg = (msegId) => send({ cmd: 'resetMseg', msegId });
export const removeMseg = (msegId) => send({ cmd: 'removeMseg', msegId });
export const addRandomModulator = (name = '', mode = '') => send({
  cmd: 'addRandomModulator', ...(name ? { name } : {}), ...(mode ? { mode } : {}),
});
export const setRandomModulator = (randomId, fields) =>
  send({ cmd: 'setRandomModulator', randomId, ...fields });
export const resetRandomModulator = (randomId) =>
  send({ cmd: 'resetRandomModulator', randomId });
export const removeRandomModulator = (randomId) =>
  send({ cmd: 'removeRandomModulator', randomId });
export const addControlPage = (name) => send(name ? { cmd: 'addControlPage', name } : { cmd: 'addControlPage' });
export const generateControlPages = (partId) => send({ cmd: 'generateControlPages', partId });
export const removeControlPage = (pageId) => send({ cmd: 'removeControlPage', pageId });
export const renameControlPage = (pageId, name) => send({ cmd: 'renameControlPage', pageId, name });
export const assignControlSlot = (pageId, slotId, partId, parameterId) =>
  send({ cmd: 'assignControlSlot', pageId, slotId, partId, parameterId });
/** Assign straight onto a physical control — a fader or a pad gets a slot minted for it the
    first time something is dropped there; an encoder's slot already exists. */
export const assignSurfaceControl = (pageId, kind, index, partId, parameterId) =>
  send({ cmd: 'assignSurfaceControl', pageId, kind, index, partId, parameterId });
/** Arm MIDI learn on a physical control's slot, minting the slot if it has none yet. */
export const learnSurfaceControl = (pageId, kind, index) => {
  if (!isJuceAvailable()) hostMidiLearn.set({ armed: false, pageId: '', slotId: '' });
  else hostMidiLearn.set({ armed: true, pageId, slotId: `${kind}-${index + 1}` });
  send({ cmd: 'learnSurfaceControl', pageId, kind, index });
};
export const clearControlSlot = (pageId, slotId) => send({ cmd: 'clearControlSlot', pageId, slotId });
export const setControlSlotOptions = (pageId, slotId, fields) =>
  send({ cmd: 'setControlSlotOptions', pageId, slotId, ...fields });
export const setControlSlotValue = (pageId, slotId, value) =>
  send({ cmd: 'setControlSlotValue', pageId, slotId, value });
export const learnControlSlotMidi = (pageId, slotId) => {
  if (!isJuceAvailable()) {
    // The mock binds instantly (no hardware to wait for), so arming never sticks.
    hostMidiLearn.set({ armed: false, pageId: '', slotId: '' });
  } else {
    hostMidiLearn.set({ armed: true, pageId, slotId });
  }
  send({ cmd: 'learnControlSlotMidi', pageId, slotId });
};
export const cancelMidiLearn = () => {
  hostMidiLearn.set({ armed: false, pageId: '', slotId: '' });
  send({ cmd: 'cancelMidiLearn' });
};
export const clearControlSlotMidi = (pageId, slotId) => send({ cmd: 'clearControlSlotMidi', pageId, slotId });
/** Arm a slot, then move the control in the plug-in's own window. */
export const learnControlSlotParameter = (pageId, slotId) =>
  send({ cmd: 'learnControlSlotParameter', pageId, slotId });
export const cancelLearnControlSlotParameter = () => send({ cmd: 'cancelLearnControlSlotParameter' });
export const toggleParameterFavourite = (partId, parameterId) =>
  send({ cmd: 'toggleParameterFavourite', partId, parameterId });
export const walkPartPreset = (partId, delta = 1) => send({ cmd: 'walkPartPreset', partId, delta });
export const setPresetAudition = (fields) => send({ cmd: 'setPresetAudition', ...fields });
export const auditionLibraryRecord = (recordId, action = 'focused', partId) =>
  send(partId ? { cmd: 'auditionLibraryRecord', recordId, action, partId }
              : { cmd: 'auditionLibraryRecord', recordId, action });
export const startSoundComparison = (partId, recordIds = []) =>
  send({ cmd: 'startSoundComparison', partId, recordIds });
export const stepSoundComparison = (delta = 1) => send({ cmd: 'stepSoundComparison', delta });
export const keepSoundComparison = () => send({ cmd: 'keepSoundComparison' });
export const cancelSoundComparison = () => send({ cmd: 'cancelSoundComparison' });
export const learnKeyChord = (partId) => send({ cmd: 'learnKeyChord', partId });
export const cancelKeyChordLearn = () => send({ cmd: 'cancelKeyChordLearn' });
export const clearKeyChord = (partId, key) => send({ cmd: 'clearKeyChord', partId, key });
export const requestLibrary = (query = '', type = '') => send({ cmd: 'getLibrary', query, type });
export const scanLibrary = () => send({ cmd: 'scanLibrary' });
export const browseLibraryPath = () => send({ cmd: 'browseLibraryPath' });
export const removeLibraryPath = (path) => send({ cmd: 'removeLibraryPath', path });
export const saveUserPreset = (partId, name) => send({ cmd: 'saveUserPreset', partId, name });
export const saveRackToLibrary = (name) => send({ cmd: 'saveRackToLibrary', name });
export const requestSurfaceLayout = (profileId) =>
  send(profileId ? { cmd: 'getSurfaceLayout', profileId } : { cmd: 'getSurfaceLayout' });
/** Describe the controller on your desk — three numbers and a name. Any controller already
    WORKS; this is only so the drawing knows what is on yours. */
export const setUserSurface = (name, encoders, faders, pads) =>
  send({ cmd: 'setUserSurface', name, encoders, faders, pads });
export const clearUserSurface = () => send({ cmd: 'clearUserSurface' });
/** Or sweep everything you want to use and let it count. */
export const learnUserSurface = () => send({ cmd: 'learnUserSurface' });
export const finishUserSurfaceLearn = (name) => send({ cmd: 'finishUserSurfaceLearn', name });
export const saveChainToLibrary = (partId, name) =>
  send({ cmd: 'saveChainToLibrary', partId, name });
export const setLibraryUserMetadata = (recordId, fields) =>
  send({ cmd: 'setLibraryUserMetadata', recordId, ...fields });
export const removeLibraryRecord = (recordId) => send({ cmd: 'removeLibraryRecord', recordId });
export const loadLibraryRecord = (recordId, action = 'focused', partId) =>
  send(partId ? { cmd: 'loadLibraryRecord', recordId, action, partId }
              : { cmd: 'loadLibraryRecord', recordId, action });
// --- Stage 6: the performance system -------------------------------------------------------
export const transportPlay = () => send({ cmd: 'transportPlay' });
export const transportStop = () => send({ cmd: 'transportStop' });
export const transportContinue = () => send({ cmd: 'transportContinue' });
export const setTempo = (tempo) => send({ cmd: 'setTempo', tempo });
export const setTimeSignature = (numerator, denominator) =>
  send({ cmd: 'setTimeSignature', numerator, denominator });
export const setTransportPosition = (ppq) => send({ cmd: 'setTransportPosition', ppq });
export const setExternalClock = (enabled) => send({ cmd: 'setExternalClock', enabled });
export const addPattern = (name) => send(name ? { cmd: 'addPattern', name } : { cmd: 'addPattern' });
export const removePattern = (patternId) => send({ cmd: 'removePattern', patternId });
export const renamePattern = (patternId, name) => send({ cmd: 'renamePattern', patternId, name });
export const setPatternOptions = (patternId, fields) =>
  send({ cmd: 'setPatternOptions', patternId, ...fields });
export const createPatternVariations = (patternId, amount = 0.55) =>
  send({ cmd: 'createPatternVariations', patternId, amount });
export const importGrooveTemplate = (fields) => send({ cmd: 'importGrooveTemplate', ...fields });
export const removeGrooveTemplate = (grooveId) => send({ cmd: 'removeGrooveTemplate', grooveId });
export const applyGrooveTemplate = (patternId, grooveId, amount = 1, applyVelocity = true) =>
  send({ cmd: 'applyGrooveTemplate', patternId, grooveId, amount, applyVelocity });
export const addLane = (patternId, fields = {}) => send({ cmd: 'addLane', patternId, ...fields });
export const removeLane = (patternId, laneId) => send({ cmd: 'removeLane', patternId, laneId });
export const setLaneOptions = (patternId, laneId, fields) =>
  send({ cmd: 'setLaneOptions', patternId, laneId, ...fields });
export const clearLane = (patternId, laneId) => send({ cmd: 'clearLane', patternId, laneId });
export const euclidFill = (patternId, laneId, pulses, rotation = 0) =>
  send({ cmd: 'euclidFill', patternId, laneId, pulses, rotation });
export const setStep = (patternId, laneId, index, fields) =>
  send({ cmd: 'setStep', patternId, laneId, index, ...fields });
export const toggleStep = (patternId, laneId, index) =>
  send({ cmd: 'toggleStep', patternId, laneId, index });
export const setStepParameterLock = (patternId, laneId, index, targetId, parameterId, value) =>
  send({ cmd: 'setStepParameterLock', patternId, laneId, index, targetId, parameterId, value });
export const setStepCcLock = (patternId, laneId, index, targetPartId, channel, ccNumber, value) =>
  send({ cmd: 'setStepCcLock', patternId, laneId, index, targetPartId, channel, ccNumber, value });
export const removeStepLock = (patternId, laneId, index, lockLaneId) =>
  send({ cmd: 'removeStepLock', patternId, laneId, index, lockLaneId });
export const clearStepLocks = (patternId, laneId, index) =>
  send(index === undefined ? { cmd: 'clearStepLocks', patternId, laneId }
                           : { cmd: 'clearStepLocks', patternId, laneId, index });
export const addClip = (patternId, name) =>
  send(name ? { cmd: 'addClip', patternId, name } : { cmd: 'addClip', patternId });
export const removeClip = (clipId) => send({ cmd: 'removeClip', clipId });
export const setClipOptions = (clipId, fields) => send({ cmd: 'setClipOptions', clipId, ...fields });
export const launchClip = (clipId) => send({ cmd: 'launchClip', clipId });
export const stopClip = (clipId) => send({ cmd: 'stopClip', clipId });
export const stopAllClips = () => send({ cmd: 'stopAllClips' });
export const setPerformanceFill = (clipId, active) =>
  send({ cmd: 'setPerformanceFill', clipId, active });
export const armCapture = (clipId, laneId) => send({ cmd: 'armCapture', clipId, laneId });
export const disarmCapture = () => send({ cmd: 'disarmCapture' });
export const captureRecentMidi = (seconds = 30) => send({ cmd: 'captureRecentMidi', seconds });
export const freezeMidiClip = (clipId, cycles = 1) => send({ cmd: 'freezeMidiClip', clipId, cycles });
export const startMidiLoop = (clipId = '') =>
  send(clipId ? { cmd: 'startMidiLoop', clipId } : { cmd: 'startMidiLoop' });
export const finishMidiLoop = () => send({ cmd: 'finishMidiLoop' });
export const cancelMidiLoop = () => send({ cmd: 'cancelMidiLoop' });
export const removeMidiLoop = (clipId) => send({ cmd: 'removeMidiLoop', clipId });
export const startGestureRecording = (clipId = '', mode = 'overdub') =>
  send(clipId ? { cmd: 'startGestureRecording', clipId, mode } : { cmd: 'startGestureRecording' });
export const finishGestureRecording = () => send({ cmd: 'finishGestureRecording' });
export const cancelGestureRecording = () => send({ cmd: 'cancelGestureRecording' });
export const clearGestureLanes = (clipId) => send({ cmd: 'clearGestureLanes', clipId });
export const startPerformanceRecording = (name = '') =>
  send(name ? { cmd: 'startPerformanceRecording', name } : { cmd: 'startPerformanceRecording' });
export const finishPerformanceRecording = () => send({ cmd: 'finishPerformanceRecording' });
export const cancelPerformanceRecording = () => send({ cmd: 'cancelPerformanceRecording' });
export const removePerformanceTake = (takeId) => send({ cmd: 'removePerformanceTake', takeId });
export const replayPerformanceTake = (takeId) => send({ cmd: 'replayPerformanceTake', takeId });
export const stopPerformanceReplay = () => send({ cmd: 'stopPerformanceReplay' });
export const addScene = (name) => send(name ? { cmd: 'addScene', name } : { cmd: 'addScene' });
export const removeScene = (sceneId) => send({ cmd: 'removeScene', sceneId });
export const renameScene = (sceneId, name) => send({ cmd: 'renameScene', sceneId, name });
export const captureScene = (sceneId) => send({ cmd: 'captureScene', sceneId });
export const setSceneOptions = (sceneId, fields) => send({ cmd: 'setSceneOptions', sceneId, ...fields });
export const setSceneClip = (sceneId, clipId, included) =>
  send({ cmd: 'setSceneClip', sceneId, clipId, included });
export const launchScene = (sceneId) => send({ cmd: 'launchScene', sceneId });
export const addSetlistItem = (sceneId, name) => send({ cmd: 'addSetlistItem', sceneId, name });
export const removeSetlistItem = (itemId) => send({ cmd: 'removeSetlistItem', itemId });
export const setSetlistItem = (itemId, fields) => send({ cmd: 'setSetlistItem', itemId, ...fields });
export const moveSetlistItem = (itemId, index) => send({ cmd: 'moveSetlistItem', itemId, index });
export const setSetlistOptions = (fields) => send({ cmd: 'setSetlistOptions', ...fields });
export const setlistGo = (index) => send({ cmd: 'setlistGo', index });
export const setlistNext = () => send({ cmd: 'setlistNext' });
export const setlistPrev = () => send({ cmd: 'setlistPrev' });
export const addArrangementItem = (sceneId, name) =>
  send(name ? { cmd: 'addArrangementItem', sceneId, name }
            : { cmd: 'addArrangementItem', sceneId });
export const removeArrangementItem = (itemId) => send({ cmd: 'removeArrangementItem', itemId });
export const setArrangementItem = (itemId, fields) =>
  send({ cmd: 'setArrangementItem', itemId, ...fields });
export const moveArrangementItem = (itemId, index) =>
  send({ cmd: 'moveArrangementItem', itemId, index });
export const setArrangementOptions = (fields) => send({ cmd: 'setArrangementOptions', ...fields });
export const startArrangement = (index = 0) => send({ cmd: 'startArrangement', index });
export const stopArrangement = () => send({ cmd: 'stopArrangement' });
export const setPartArp = (partId, fields) => send({ cmd: 'setPartArp', partId, ...fields });
export const addMidiSlot = (partId, type) => send({ cmd: 'addMidiSlot', partId, type });
export const removeMidiSlot = (partId, slotId) => send({ cmd: 'removeMidiSlot', partId, slotId });
export const moveMidiSlot = (partId, slotId, index) =>
  send({ cmd: 'moveMidiSlot', partId, slotId, index });
export const setMidiSlotBypassed = (partId, slotId, bypassed) =>
  send({ cmd: 'setMidiSlotBypassed', partId, slotId, bypassed });
export const setMidiSlotOptions = (partId, slotId, fields) =>
  send({ cmd: 'setMidiSlotOptions', partId, slotId, ...fields });
export const setPartMidiFx = (partId, fields) => send({ cmd: 'setPartMidiFx', partId, ...fields });

// --- Stage 7: the mature generated product --------------------------------------------------
export const setMasterLevel = (level) => send({ cmd: 'setMasterLevel', level });
export const setOutputPairs = (pairs) => send({ cmd: 'setOutputPairs', pairs });
export const setPartOutputPair = (partId, pair) => send({ cmd: 'setPartOutputPair', partId, pair });
export const claimHardwareSurface = () => send({ cmd: 'claimHardwareSurface' });
export const releaseHardwareSurface = () => send({ cmd: 'releaseHardwareSurface' });
export const clearActiveHostingIncidents = () => send({ cmd: 'clearActiveHostingIncidents' });

// --- §17: safe startup, recovery and the support bundle --------------------------------------
export const setSafeMode = (level) => send({ cmd: 'setSafeMode', level });
export const clearSafeModeSuspect = (modulePath) => send({ cmd: 'clearSafeModeSuspect', modulePath });
export const clearAllSafeModeSuspects = () => send({ cmd: 'clearAllSafeModeSuspects' });
export const acknowledgeRecovery = () => send({ cmd: 'acknowledgeRecovery' });
export const restoreLastKnownGood = () => send({ cmd: 'restoreLastKnownGood' });
export const setAutomaticFailover = (fields) => send({ cmd: 'setAutomaticFailover', ...fields });
export const retryFailedProcessor = (targetId) => send({ cmd: 'retryFailedProcessor', targetId });
export const dismissFailoverEvent = (targetId) => send({ cmd: 'dismissFailoverEvent', targetId });
export const installLicence = (text) => send({ cmd: 'installLicence', text });
export const removeLicence = () => send({ cmd: 'removeLicence' });
export const activateLicenceHere = () => send({ cmd: 'activateLicenceHere' });
export const deactivateLicenceHere = () => send({ cmd: 'deactivateLicenceHere' });

export const previewSupportBundle = (options = {}) =>
  send({ cmd: 'previewSupportBundle', ...options });
export const exportSupportBundle = (options = {}) =>
  send({ cmd: 'exportSupportBundle', ...options });

/** The on-screen keyboard. One command both ways: on=true is note-on with the velocity the
 *  key position gave, on=false is the release. Goes through the same native path as hardware
 *  MIDI, so the browser preview can only acknowledge it. */
export const hostNote = (note, velocity, on, channel = 1) =>
  send({ cmd: 'hostNote', note, velocity, on, channel });

export const requestHostProject = () => send({ cmd: 'getHostProject' });
export const setHostProject = (fields) => send({ cmd: 'setHostProject', ...fields });
export const buildHostProduct = () => {
  hostBuild.set({ ...emptyHostBuild(), running: true });
  send({ cmd: 'buildHostProduct' });
};
