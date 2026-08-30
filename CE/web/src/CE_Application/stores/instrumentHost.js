/**
 * instrumentHost.js — UI state for the Instrument Host workspace (VIP-successor Stage 1).
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
import { writable, get } from 'svelte/store';
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
  onInstrumentHostMidiLearn,
  onInstrumentHostArpStep,
} from '../bridge/bridge.js';

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
export const hostMidiActivity = writable({ device: '', text: '', seq: 0 });
// The CTRL49 hardware surface as the broker reports it: searching (no device), connecting,
// connected, heldElsewhere (another instance owns it), failed. Fail-safe like every other
// host store — a malformed payload lands on 'searching', never a crash.
export const hostSurface = writable({ state: 'searching', detail: '', device: '' });

// MIDI learn: which slot is armed and listening right now. The bind itself lands in the
// state (each slot's midiCc/midiChannel); this store only tracks the transient arming.
export const hostMidiLearn = writable({ armed: false, pageId: '', slotId: '' });

// The arp playhead per part: partId -> live pattern step (-1 while idle). Fed by tiny
// change-driven events from the engine; the grid only lights the column it names.
export const hostArpStep = writable({});

export function normalizeMidiLearn(payload) {
  return {
    armed: payload?.armed === true,
    pageId: String(payload?.pageId ?? ''),
    slotId: String(payload?.slotId ?? ''),
  };
}

export function normalizeHostSurface(payload) {
  const known = ['searching', 'heldElsewhere', 'connecting', 'connected', 'failed'];
  const state = String(payload?.state ?? '');
  return {
    state: known.includes(state) ? state : 'searching',
    detail: String(payload?.detail ?? ''),
    device: String(payload?.device ?? ''),
  };
}

// --- §17.7: the support bundle ------------------------------------------------------------------

export function emptySupportBundle() {
  return { entries: [], includeStateBlobs: false, written: false, path: '' };
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
    counts: { total: 0, presets: 0, racks: 0, missing: 0 },
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
      manufacturer: 'Mock Audio', instrument: 'Stage Keys', factory: true, available: true, favourite: true },
    { recordId: 'lib-2', type: 'preset', sourceType: 'userState', name: 'My Growl',
      manufacturer: 'Mock Audio', instrument: 'Analog One', available: true, tags: ['bass'] },
    { recordId: 'lib-3', type: 'preset', sourceType: 'vstpreset', name: 'Lost Lead',
      manufacturer: 'Someone', instrument: 'Uninstalled Synth', factory: true,
      available: false, reason: 'Requires Uninstalled Synth, which is not in the catalogue.' },
    { recordId: 'lib-4', type: 'rack', sourceType: 'rackCapture', name: 'Live Rig', available: true },
  ];
  const q = query.trim().toLowerCase();
  const records = all.filter((r) =>
    (!type || r.type === type)
    && (!q || r.name.toLowerCase().includes(q) || (r.instrument ?? '').toLowerCase().includes(q)
        || (r.manufacturer ?? '').toLowerCase().includes(q)));
  return normalizeHostLibrary({
    records,
    counts: { total: all.length, presets: 3, racks: 1, missing: 0 },
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
  return { partId: '', parameters: [], warnings: [] };
}

export function normalizeHostParameters(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    partId: String(p.partId ?? ''),
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

/** Every parameterId of this target that some control slot or macro drives — the
 *  "assigned" filter's ground truth, read from the same state the panels render. */
export function assignedParameterIds(state, targetId) {
  const ids = new Set();
  for (const page of state?.rack?.pages ?? [])
    for (const slot of page.slots)
      if (slot.assigned && slot.partId === targetId) ids.add(slot.parameterId);
  for (const macro of state?.rack?.macros ?? [])
    for (const target of macro.targets)
      if (target.targetId === targetId) ids.add(target.parameterId);
  return ids;
}

/** Applies one instrumentHostParamValues delta to the registry snapshot the view renders.
 *  A delta for a different part leaves the snapshot untouched — the native side speaks per
 *  part, and the view holds the focused part's registry only. */
export function applyParamValues(registry, payload) {
  if (!payload || String(payload.partId ?? '') !== registry.partId) return registry;
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return registry;
  const byId = new Map(changes.map((c) => [String(c?.id ?? ''), c]));
  return {
    ...registry,
    parameters: registry.parameters.map((d) => {
      const change = byId.get(d.id);
      return change
        ? { ...d, value: Number(change.value ?? d.value), text: String(change.text ?? d.text) }
        : d;
    }),
  };
}

/** Case-insensitive name/group/id filter for the parameter list. */
export function filterParameters(parameters, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return parameters;
  return parameters.filter(
    (d) => d.name.toLowerCase().includes(q) || d.group.toLowerCase().includes(q)
        || d.id.toLowerCase().includes(q)
  );
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
    editorOpenPartId: '',
    audio: { enabled: false, running: false, deviceName: '', sampleRate: 0, bufferSize: 0,
             inputChannels: 0, cpu: 0, xruns: 0 },
    rack: { performanceId: '', focusedPartId: '', parts: [], masterEffects: [], returns: [],
            macros: [], pages: [], masterLatencyMs: 0 },
    performance: emptyPerformance(),
    product: emptyProduct(),
    reliability: emptyReliability(),
    licence: emptyLicence(),
  };
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
  };
}

export function normalizeReliability(payload) {
  const r = payload && typeof payload === 'object' ? payload : {};
  const safe = r.safeMode && typeof r.safeMode === 'object' ? r.safeMode : {};
  const recovery = r.recovery && typeof r.recovery === 'object' ? r.recovery : {};

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
 *  that recall whole rigs and the setlist that walks them. */
export function emptyPerformance() {
  return {
    transport: {
      playing: false, tempo: 120, numerator: 4, denominator: 4, positionPpq: 0,
      bar: 1, beat: 1, beatFraction: 0, externalClock: false, clockLost: false,
      defaultQuantize: 'bar',
    },
    patterns: [],
    clips: [],
    scenes: [],
    setlist: { items: [], currentIndex: -1 },
    capture: { armed: false, clipId: '', laneId: '' },
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
});

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

const normalizeMidiFx = (f) => ({
  transpose: Number(f?.transpose ?? 0),
  constrainToScale: f?.constrainToScale === true,
  scaleRoot: Number(f?.scaleRoot ?? 0),
  scaleType: String(f?.scaleType ?? 'major'),
  chord: String(f?.chord ?? 'off'),
  velocityFixed: Number(f?.velocityFixed ?? 0),
  velocityScale: Number(f?.velocityScale ?? 1),
});

export function normalizePerformance(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const t = p.transport && typeof p.transport === 'object' ? p.transport : {};
  const setlist = p.setlist && typeof p.setlist === 'object' ? p.setlist : {};
  const capture = p.capture && typeof p.capture === 'object' ? p.capture : {};

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
    patterns: (Array.isArray(p.patterns) ? p.patterns : []).map((pattern) => ({
      patternId: String(pattern?.patternId ?? ''),
      name: String(pattern?.name ?? ''),
      swing: Number(pattern?.swing ?? 0),
      lengthPpq: Number(pattern?.lengthPpq ?? 4),
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
      active: c?.active === true,
      pending: c?.pending === true,
      phase: Number(c?.phase ?? 0),
    })),
    scenes: (Array.isArray(p.scenes) ? p.scenes : []).map((s) => ({
      sceneId: String(s?.sceneId ?? ''),
      name: String(s?.name ?? ''),
      clipIds: (Array.isArray(s?.clipIds) ? s.clipIds : []).map(String),
      launchQuantize: String(s?.launchQuantize ?? 'bar'),
      stopOtherClips: s?.stopOtherClips !== false,
      tempo: Number(s?.tempo ?? 0),
      numSlots: Number(s?.numSlots ?? 0),
      numMacros: Number(s?.numMacros ?? 0),
    })),
    setlist: {
      items: (Array.isArray(setlist.items) ? setlist.items : []).map((i) => ({
        itemId: String(i?.itemId ?? ''),
        name: String(i?.name ?? ''),
        sceneId: String(i?.sceneId ?? ''),
        sceneName: String(i?.sceneName ?? ''),
        missing: i?.missing === true,
        notes: String(i?.notes ?? ''),
        tempo: Number(i?.tempo ?? 0),
      })),
      currentIndex: Number(setlist.currentIndex ?? -1),
    },
    capture: {
      armed: capture.armed === true,
      clipId: String(capture.clipId ?? ''),
      laneId: String(capture.laneId ?? ''),
    },
    scales: (Array.isArray(p.scales) ? p.scales : []).map(String),
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
export function normalizeHostState(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const rack = p.rack && typeof p.rack === 'object' ? p.rack : {};

  return {
    instruments: (Array.isArray(p.instruments) ? p.instruments : []).map((i) => ({
      ceId: String(i?.ceId ?? ''),
      name: String(i?.name ?? ''),
      vendor: String(i?.vendor ?? ''),
      version: String(i?.version ?? ''),
    })),
    effectClasses: (Array.isArray(p.effectClasses) ? p.effectClasses : []).map((i) => ({
      ceId: String(i?.ceId ?? ''),
      name: String(i?.name ?? ''),
      vendor: String(i?.vendor ?? ''),
      version: String(i?.version ?? ''),
    })),
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
    editorOpenPartId: String(p.editorOpenPartId ?? ''),
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
      focusedPartId: String(rack.focusedPartId ?? ''),
      masterLatencyMs: Number(rack.masterLatencyMs ?? 0),
      masterEffects: (Array.isArray(rack.masterEffects) ? rack.masterEffects : []).map(normalizeEffectSlot),
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
        targets: (Array.isArray(m?.targets) ? m.targets : []).map((t) => ({
          targetId: String(t?.targetId ?? ''),
          parameterId: String(t?.parameterId ?? ''),
          targetName: String(t?.targetName ?? ''),
          displayName: String(t?.displayName ?? ''),
          rangeMin: Number(t?.rangeMin ?? 0),
          rangeMax: Number(t?.rangeMax ?? 1),
          inverted: t?.inverted === true,
          resolved: t?.resolved === true,
        })),
      })),
      pages: (Array.isArray(rack.pages) ? rack.pages : []).map((page) => ({
        pageId: String(page?.pageId ?? ''),
        name: String(page?.name ?? ''),
        generated: page?.generated === true,
        generatedForPartId: String(page?.generatedForPartId ?? ''),
        slots: (Array.isArray(page?.slots) ? page.slots : []).map((slot) => ({
          slotId: String(slot?.slotId ?? ''),
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
        })),
      })),
      parts: (Array.isArray(rack.parts) ? rack.parts : []).map((part) => ({
        partId: String(part?.partId ?? ''),
        pluginCeId: String(part?.pluginCeId ?? ''),
        pluginName: String(part?.pluginName ?? ''),
        pluginVendor: String(part?.pluginVendor ?? ''),
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
        arp: normalizeArp(part?.arp),
        midiFx: normalizeMidiFx(part?.midiFx),
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
export function filterInstruments(instruments, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return instruments;
  return instruments.filter(
    (i) => i.name.toLowerCase().includes(q) || i.vendor.toLowerCase().includes(q)
  );
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
      parts: [
        { partId: 'mock-part-1', pluginCeId: 'mock-keys', pluginName: 'Stage Keys', pluginVendor: 'Mock Audio', hasInstrument: true },
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
    },
    performance: {
      transport: { tempo: 120, numerator: 4, denominator: 4, defaultQuantize: 'bar' },
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

/** The mock reducer: applies one command to a normalized state, so the browser-only app
 *  behaves instead of stalling. Deliberately mirrors the native semantics the tests pin. */
export function applyMockCommand(state, payload) {
  const cmd = payload?.cmd;
  const next = normalizeHostState(state);
  const part = (id) => next.rack.parts.find((p) => p.partId === id);

  if (cmd === 'addPart') {
    const partId = `mock-part-${Date.now()}-${next.rack.parts.length + 1}`;
    next.rack.parts.push(normalizeHostState({ rack: { parts: [{ partId }] } }).rack.parts[0]);
    if (!next.rack.focusedPartId) next.rack.focusedPartId = partId;
    return next;
  }
  if (cmd === 'removePart') {
    next.rack.parts = next.rack.parts.filter((p) => p.partId !== payload.partId);
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
    if (part(payload.partId)?.hasInstrument) next.editorOpenPartId = payload.partId;
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
      effectId: `mock-fx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
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
      returnId: `mock-return-${Date.now()}-${next.rack.returns.length + 1}`,
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
    // The port-gone diagnostic, mirrored against the mock device list.
    target.midiOutError = target.midiOutputId
      && !['mock-out-1', 'mock-out-2'].includes(target.midiOutputId)
      ? 'No such MIDI output.' : '';
    return next;
  }
  if (cmd === 'clearHardware') {
    const target = part(payload.partId);
    if (target) { target.hardware = false; target.midiOutError = ''; }
    return next;
  }
  if (cmd === 'sendHardwareProgram') {
    return next; // nothing observable in the browser — the port lives with the native side
  }
  if (cmd === 'addMacro') {
    next.rack.macros.push(normalizeHostState({ rack: { macros: [{
      macroId: `mock-macro-${Date.now()}-${next.rack.macros.length + 1}`,
      name: payload.name || `Macro ${next.rack.macros.length + 1}`,
    }] } }).rack.macros[0]);
    return next;
  }
  if (cmd === 'removeMacro') {
    next.rack.macros = next.rack.macros.filter((m) => m.macroId !== payload.macroId);
    return next;
  }
  if (cmd === 'renameMacro') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) macro.name = String(payload.name ?? macro.name);
    return next;
  }
  if (cmd === 'setMacroValue') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) macro.value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
    return next;
  }
  if (cmd === 'addMacroTarget' || cmd === 'removeMacroTarget') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (!macro) return next;
    if (cmd === 'removeMacroTarget') {
      macro.targets = macro.targets.filter(
        (t) => !(t.targetId === payload.targetId && t.parameterId === payload.parameterId));
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
  if (cmd === 'addControlPage') {
    const pageId = `mock-page-${Date.now()}-${next.rack.pages.length + 1}`;
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
      for (const key of ['rangeMin', 'rangeMax', 'inverted', 'bipolar', 'label'])
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
  if (cmd === 'removeScanPath') {
    next.scanPaths = next.scanPaths.filter((p) => p !== payload.path);
    return next;
  }

  // --- Stage 6: the performance system ----------------------------------------------------
  const perf = next.performance;
  const pattern = (id) => perf.patterns.find((p) => p.patternId === id);
  const lane = (patternId, laneId) => pattern(patternId)?.lanes.find((l) => l.laneId === laneId);

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
  if (cmd === 'addPattern') {
    const patternId = `mock-pattern-${Date.now()}`;
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
  if (cmd === 'removePattern') {
    perf.patterns = perf.patterns.filter((p) => p.patternId !== payload.patternId);
    perf.clips = perf.clips.filter((c) => c.patternId !== payload.patternId);
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
      laneId: `mock-lane-${Date.now()}`,
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
    if (target) target.lanes = target.lanes.filter((l) => l.laneId !== payload.laneId);
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
    return next;
  }
  if (cmd === 'clearLane') {
    const target = lane(payload.patternId, payload.laneId);
    if (target) { target.steps = target.steps.map(() => normalizeStep({})); target.euclidPulses = 0; }
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
    return next;
  }
  if (cmd === 'addClip') {
    const source = pattern(payload.patternId);
    if (!source) return next;
    perf.clips.push(normalizePerformance({ clips: [{
      clipId: `mock-clip-${Date.now()}`,
      name: payload.name || source.name,
      patternId: source.patternId,
      launchQuantize: perf.transport.defaultQuantize,
    }] }).clips[0]);
    return next;
  }
  if (cmd === 'removeClip') {
    perf.clips = perf.clips.filter((c) => c.clipId !== payload.clipId);
    for (const scene of perf.scenes)
      scene.clipIds = scene.clipIds.filter((id) => id !== payload.clipId);
    return next;
  }
  if (cmd === 'setClipOptions') {
    const clip = perf.clips.find((c) => c.clipId === payload.clipId);
    if (!clip) return next;
    for (const key of ['name', 'launchQuantize', 'followClipId'])
      if (payload[key] !== undefined) clip[key] = String(payload[key]);
    if (payload.loop !== undefined) clip.loop = payload.loop === true;
    if (payload.followAfterLoops !== undefined) clip.followAfterLoops = Number(payload.followAfterLoops);
    return next;
  }
  if (cmd === 'launchClip' || cmd === 'stopClip' || cmd === 'stopAllClips') {
    // The mock has no clock, so a launch takes effect at once — the native side waits for the
    // quantization boundary and the UI shows `pending` until it lands.
    for (const clip of perf.clips) {
      if (cmd === 'stopAllClips') clip.active = false;
      else if (clip.clipId === payload.clipId) clip.active = cmd === 'launchClip';
    }
    return next;
  }
  if (cmd === 'armCapture') {
    perf.capture = { armed: true, clipId: String(payload.clipId ?? ''), laneId: String(payload.laneId ?? '') };
    return next;
  }
  if (cmd === 'disarmCapture') {
    perf.capture = { armed: false, clipId: '', laneId: '' };
    return next;
  }
  if (cmd === 'addScene') {
    perf.scenes.push(normalizePerformance({ scenes: [{
      sceneId: `mock-scene-${Date.now()}`,
      name: payload.name || `Scene ${perf.scenes.length + 1}`,
      clipIds: perf.clips.filter((c) => c.active).map((c) => c.clipId),
      launchQuantize: perf.transport.defaultQuantize,
      numSlots: next.rack.parts.length,
      numMacros: next.rack.macros.length,
    }] }).scenes[0]);
    return next;
  }
  if (cmd === 'removeScene') {
    perf.scenes = perf.scenes.filter((s) => s.sceneId !== payload.sceneId);
    perf.setlist.items = perf.setlist.items.filter((i) => i.sceneId !== payload.sceneId);
    return next;
  }
  if (cmd === 'renameScene' || cmd === 'captureScene' || cmd === 'setSceneOptions'
      || cmd === 'setSceneClip') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    if (!scene) return next;
    if (cmd === 'renameScene') scene.name = String(payload.name ?? scene.name);
    else if (cmd === 'captureScene') {
      scene.clipIds = perf.clips.filter((c) => c.active).map((c) => c.clipId);
      scene.numSlots = next.rack.parts.length;
      scene.numMacros = next.rack.macros.length;
    } else if (cmd === 'setSceneClip') {
      const included = payload.included === true;
      scene.clipIds = scene.clipIds.filter((id) => id !== payload.clipId);
      if (included) scene.clipIds.push(String(payload.clipId));
    } else {
      if (payload.launchQuantize !== undefined) scene.launchQuantize = String(payload.launchQuantize);
      if (payload.stopOtherClips !== undefined) scene.stopOtherClips = payload.stopOtherClips === true;
      if (payload.tempo !== undefined) scene.tempo = Number(payload.tempo);
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
    return next;
  }
  if (cmd === 'addSetlistItem') {
    const scene = perf.scenes.find((s) => s.sceneId === payload.sceneId);
    perf.setlist.items.push({
      itemId: `mock-item-${Date.now()}`,
      name: payload.name || scene?.name || `Item ${perf.setlist.items.length + 1}`,
      sceneId: String(payload.sceneId ?? ''),
      sceneName: scene?.name ?? '',
      missing: !!payload.sceneId && !scene,
      notes: '',
      tempo: 0,
    });
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
      for (const key of ['name', 'notes'])
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
    if (item.sceneId) return applyMockCommand(next, { cmd: 'launchScene', sceneId: item.sceneId });
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
    return next;
  }

  return next; // getState / scan / panic mutate nothing mockable
}

let initialized = false;

/** Wires the bridge listeners (or seeds mock state) and asks for the first snapshot.
 *  Idempotent; the workspace calls it on mount. */
export function initInstrumentHostBridge() {
  if (initialized) return;
  initialized = true;

  if (!isJuceAvailable()) {
    hostState.set(mockHostState());
    hostAudioDevices.set(mockAudioDevices());
    hostProject.set(mockHostProject());
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
    seq: a.seq + 1,
  })));
  onInstrumentHostSurface((payload) => hostSurface.set(normalizeHostSurface(payload)));
  onInstrumentHostMidiLearn((payload) => hostMidiLearn.set(normalizeMidiLearn(payload)));
  onInstrumentHostArpStep((payload) => hostArpStep.update((steps) => ({
    ...steps,
    [String(payload?.partId ?? '')]: Number.isInteger(payload?.step) ? payload.step : -1,
  })));
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

function send(payload) {
  if (!isJuceAvailable()) {
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
        hostParameters.set(normalizeHostParameters({ partId: payload.partId,
                                                     parameters: [...base, ...mixer] }));
        return;
      }
      const effect = [...state.rack.masterEffects, ...state.rack.parts.flatMap((p) => p.effects),
                      ...state.rack.returns.flatMap((r) => r.effects)]
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
    if (payload?.cmd === 'getLibrary' || payload?.cmd === 'scanLibrary') {
      hostLibrary.set(mockHostLibrary(payload.query ?? '', payload.type ?? ''));
      return;
    }
    if (payload?.cmd === 'saveUserPreset' || payload?.cmd === 'saveRackToLibrary') {
      const isRack = payload.cmd === 'saveRackToLibrary';
      const part = get(hostState).rack.parts.find((p) => p.partId === payload.partId);
      hostLibrary.update((lib) => normalizeHostLibrary({
        ...lib,
        records: [...lib.records, {
          recordId: `lib-user-${Date.now()}`,
          type: isRack ? 'rack' : 'preset',
          sourceType: isRack ? 'rackCapture' : 'userState',
          name: payload.name || (isRack ? 'Rack capture' : `${part?.pluginName ?? 'Instrument'} preset`),
          instrument: part?.pluginName ?? '',
          available: true,
        }],
        counts: { ...lib.counts, total: lib.counts.total + 1 },
      }));
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
    if (payload?.cmd === 'loadLibraryRecord') {
      // Mirrors the visible half: an added part appears; a focused load leaves structure alone.
      const record = get(hostLibrary).records.find((r) => r.recordId === payload.recordId);
      if (!record?.available) return;
      if (record.type === 'preset' && payload.action === 'add') {
        const next = applyMockCommand(get(hostState), { cmd: 'addPart' });
        const added = next.rack.parts.at(-1);
        added.pluginName = record.name;
        added.pluginVendor = record.manufacturer;
        added.hasInstrument = true;
        hostState.set(next);
        return;
      }
      if (record.type === 'preset') {
        // The focused load's visible half is the preset cursor moving on the part.
        hostState.update((st) => {
          const target = st.rack.parts.find(
            (p) => p.partId === (payload.partId || st.rack.focusedPartId));
          if (target?.hasInstrument) {
            target.presetRecordId = record.recordId;
            target.presetName = record.name;
          }
          return { ...st };
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
export const hostPanic = (partId) => send(partId ? { cmd: 'panic', partId } : { cmd: 'panic' });
export const openEditor = (partId) => send({ cmd: 'openEditor', partId });
export const closeEditor = () => send({ cmd: 'closeEditor' });
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
export const setEffectBypassed = (effectId, bypassed) => send({ cmd: 'setEffectBypassed', effectId, bypassed });
export const openEffectEditor = (effectId) => send({ cmd: 'openEffectEditor', effectId });
export const addReturn = (name) => send(name ? { cmd: 'addReturn', name } : { cmd: 'addReturn' });
export const removeReturn = (returnId) => send({ cmd: 'removeReturn', returnId });
export const renameReturn = (returnId, name) => send({ cmd: 'renameReturn', returnId, name });
export const setReturnLevel = (returnId, level) => send({ cmd: 'setReturnLevel', returnId, level });
export const setSendLevel = (partId, returnId, level) =>
  send({ cmd: 'setSendLevel', partId, returnId, level });
export const setExtraOut = (partId, pairIndex, gain) =>
  send({ cmd: 'setExtraOut', partId, pairIndex, gain });
export const removeExtraOut = (partId, pairIndex) => send({ cmd: 'removeExtraOut', partId, pairIndex });
export const setHardwareConfig = (partId, fields) => send({ cmd: 'setHardwareConfig', partId, ...fields });
export const clearHardware = (partId) => send({ cmd: 'clearHardware', partId });
export const sendHardwareProgram = (partId) => send({ cmd: 'sendHardwareProgram', partId });
export const addMacro = (name) => send(name ? { cmd: 'addMacro', name } : { cmd: 'addMacro' });
export const removeMacro = (macroId) => send({ cmd: 'removeMacro', macroId });
export const renameMacro = (macroId, name) => send({ cmd: 'renameMacro', macroId, name });
export const setMacroValue = (macroId, value, final = false) =>
  send({ cmd: 'setMacroValue', macroId, value, final });
export const addMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'addMacroTarget', macroId, targetId, parameterId });
export const removeMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'removeMacroTarget', macroId, targetId, parameterId });
export const addControlPage = (name) => send(name ? { cmd: 'addControlPage', name } : { cmd: 'addControlPage' });
export const generateControlPages = (partId) => send({ cmd: 'generateControlPages', partId });
export const removeControlPage = (pageId) => send({ cmd: 'removeControlPage', pageId });
export const renameControlPage = (pageId, name) => send({ cmd: 'renameControlPage', pageId, name });
export const assignControlSlot = (pageId, slotId, partId, parameterId) =>
  send({ cmd: 'assignControlSlot', pageId, slotId, partId, parameterId });
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
export const walkPartPreset = (partId, delta = 1) => send({ cmd: 'walkPartPreset', partId, delta });
export const requestLibrary = (query = '', type = '') => send({ cmd: 'getLibrary', query, type });
export const scanLibrary = () => send({ cmd: 'scanLibrary' });
export const browseLibraryPath = () => send({ cmd: 'browseLibraryPath' });
export const removeLibraryPath = (path) => send({ cmd: 'removeLibraryPath', path });
export const saveUserPreset = (partId, name) => send({ cmd: 'saveUserPreset', partId, name });
export const saveRackToLibrary = (name) => send({ cmd: 'saveRackToLibrary', name });
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
export const addClip = (patternId, name) =>
  send(name ? { cmd: 'addClip', patternId, name } : { cmd: 'addClip', patternId });
export const removeClip = (clipId) => send({ cmd: 'removeClip', clipId });
export const setClipOptions = (clipId, fields) => send({ cmd: 'setClipOptions', clipId, ...fields });
export const launchClip = (clipId) => send({ cmd: 'launchClip', clipId });
export const stopClip = (clipId) => send({ cmd: 'stopClip', clipId });
export const stopAllClips = () => send({ cmd: 'stopAllClips' });
export const armCapture = (clipId, laneId) => send({ cmd: 'armCapture', clipId, laneId });
export const disarmCapture = () => send({ cmd: 'disarmCapture' });
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
export const setlistGo = (index) => send({ cmd: 'setlistGo', index });
export const setlistNext = () => send({ cmd: 'setlistNext' });
export const setlistPrev = () => send({ cmd: 'setlistPrev' });
export const setPartArp = (partId, fields) => send({ cmd: 'setPartArp', partId, ...fields });
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
export const hostNote = (note, velocity, on) => send({ cmd: 'hostNote', note, velocity, on });

export const requestHostProject = () => send({ cmd: 'getHostProject' });
export const setHostProject = (fields) => send({ cmd: 'setHostProject', ...fields });
export const buildHostProduct = () => {
  hostBuild.set({ ...emptyHostBuild(), running: true });
  send({ cmd: 'buildHostProduct' });
};
