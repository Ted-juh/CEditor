// panelRuntime.js — the M1 JS/WebView script runtime.
//
// Runs scripts in the WebView, where the controls actually live, and binds the panel API
// (set/get/log/helpers/self) directly to the control stores — so `set("cutoff.value", 8000)`
// moves the real control immediately, no C++ round-trip.
//
// Scope: JavaScript / TypeScript / Lua (wasmoon) / Python (Pyodide) / the C++, C# and Java preview
// interpreters, control set/get, the full helper set, log → trace console, live dispatch of every
// event panelApi.js declares, real MIDI out (sendCC/sendNRPN/sendSysex → the device bridge;
// requestDump → the device-sync path), cross-script flow (on/emit/run), host timers, and the
// panel-component verbs. The C++ runtime remains the engine for window-closed logic in shipped
// panels; this one covers everything while the window is open.
//
// This runtime implements the contract in panelApi.js, and CE/web/test/panelApiParity.test.js
// fails if it drifts from it in either direction. It used to: on/emit/run were `() => {}`, eight
// declared events were absent from the handler probe list, fourteen encoding helpers were missing
// and a fifteenth was spelled differently, and forty-seven panel verbs existed here and nowhere
// else. Bind nothing panelApi.js doesn't declare, and declare nothing you don't bind.

import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, updatePanel } from '../stores/panels.js';
import { updateControlProperty, removeControlNode } from '../stores/controls.js';
import { valueAtPath, probeNestedWrite } from '../stores/controlTreeUtils.js';
import { addScriptTrace } from '../stores/scriptConsole.js';
import { availableFonts, storedIcons } from '../stores/appSettings.js';
// ce.image (§50). The file cache is how a path source becomes something renderable, which is also
// what makes embed() possible.
import { fileCache, loadFile } from '../stores/fileCache.js';
import {
  IMAGE_LAYER_IDS, assetCatalogue, findAsset, imageLayer, isPortableSource, planClear, planImage,
  sourceKind,
} from '../utils/imageLayers.js';
// Shared with the device profile engine, so the two cannot disagree about what "roland" means.
import { checksumNames, computeChecksum } from '../utils/checksums.js';
// ce.text measures through the renderer's own layout rather than a second implementation of it.
import { buildBlockTextLayout } from '../editor/canvasControlTextLayout.js';
import {
  findFont, fontCatalogue, planAxis, planStyle, resolvedWeight,
} from './textStyle.js';
import {
  isJuceAvailable, triggerRawMidiAction, parseDumpMessage, onDumpMessageParsed,
  listMidiInputs, listMidiDestinations,
} from '../bridge/bridge.js';
import {
  startDeviceSync, startBulkDumpSend, commitDeviceParameter,
  latestMidiInputMessage, latestSysexInputMessage, deviceSessionState, deviceRuntimeState,
  deviceProfiles, deviceRoleMappings, profileParameters, refreshProfileParameters,
  midiInputs, midiDestinations,
} from '../stores/deviceProfiles.js';
import {
  defineParameter as defineRuntimeParameter, defineDump as defineRuntimeDump,
  definedParameters, definedParameter, encodeParameter as encodeRuntimeParameter,
  dumpRequestBytes, decodeDump as decodeRuntimeDump, clearDeviceDefinitions,
  hasDefinedParameter, hasDefinedDump,
} from './deviceDefinitions.js';
import {
  handlerNamesForRuntime, RUNTIME_WEBVIEW, VALUE_ACCESSOR_IDS,
  PANEL_TARGET, PANEL_READONLY_PROPERTIES,
  MODULES, MODULE_BY_ID, moduleMemberMap, MEMBER_MODULE, isValueMember, MEMBER_BY_ID,
  CE_API_VERSION, RUNTIME_ANY, panelModules, moduleGateMessage, modulesUsedBy, resolveModules,
  allModules, moduleById, memberMapFor, registeredExtensions, EVENT_BY_ID,
} from './panelApi.js';
import { extensionSource } from './extensionModules.js';
import { panelPreviewSessions, previewModeEnabled } from '../stores/interactionPreview.js';
import { syncDeviceRuntimeStateToPanelPreview } from '../utils/deviceBindingSync.js';
import { scriptDocuments } from '../stores/scriptWorkspace.js';
import { isSourceScript } from './scriptModel.js';
import { compileCpp, invokeCpp } from './cppPreview.js';
import { compileCsharp, invokeCsharp } from './csharpPreview.js';
import { compileJava, invokeJava } from './javaPreview.js';
import { ensureTs, transpileTs } from './tsService.js';
// The wasm binary URL — resolved by Vite so wasmoon finds its runtime in dev and in the bundle.
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { applySplitScriptAction } from '../utils/splitZoneLayout.js';
import { phraseScriptPatch } from '../utils/phraseLayout.js';
import { recorderScriptPatch } from '../utils/noteRecorderLayout.js';
import { harmoniserScriptPatch } from '../utils/harmoniserLayout.js';
import { setlistScriptPatch } from '../utils/setlistLayout.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
import { transport as transportStore } from '../stores/transport.js';
// The arrangement maths — pure, and the SAME functions the canvas context menu runs. Two
// implementations of "distribute six things evenly" would drift the first time one was touched.
import {
  boundsOf, alignPatch, distributePatches, matchPatch, gridPatches, circlePatches, flipPatches,
} from '../stores/alignment.js';
import { pushSnapshot } from '../stores/history.js';
import { createControl, COMPONENT_TYPES } from '../models/componentTypes.js';
import { setDrawing, clearDrawing } from '../stores/scriptDraw.js';
import {
  setInboundMidiFilter, setOutboundMidiFilter, clearMidiFilters, filterInboundMidi,
} from './midiFilters.js';
import {
  COMPONENT_VERBS, componentScriptPatch, componentRequestLegal, LIST_KINDS,
} from './componentVerbs.js';
import {
  componentListWithElement, componentListWithoutElement,
} from '../utils/componentElements.js';
import { patchOf, isUnchanged } from '../utils/scriptPatchOutcome.js';
import { typeOfControl, familiesForType } from './componentSchema.js';
import {
  SCALES, CHORDS, NOTE_SHARP, NOTE_FLAT, FLAT_KEY_PCS, MINOR_SCALE_NAMES,
  QUALITY_SUFFIX, ROMAN, MINOR_QUALITY_NAMES,
} from './musicTheory.js';
import { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, PPQN } from './timeTables.js';
import { FONT_ADVANCE as PIXEL_ADVANCE, FONT_H as PIXEL_FONT_H } from '../utils/pixelFont.js';
import { EASING_BEZIERS, ANIM_CURVE_NAMES } from './easingTables.js';
// ce.time's arithmetic IS the transport's, called rather than restated: a script asking where a
// beat falls and the Transport drawing that beat have to agree, and one implementation is the only
// way to promise it. The C++ preludes cannot import, so they transliterate — and
// scriptPreludeAgreement.test.js runs the same fixtures through all four.
import {
  barBeat as panelBarBeat, formatBarBeat as panelFormatBarBeat, stepAtBeat as panelStepAtBeat,
  crossedSteps as panelCrossedSteps, swungBeatOffset as panelSwungBeatOffset,
  cyclePhaseAt as panelCyclePhaseAt, cycleCountAt as panelCycleCountAt,
  cycleBeats as panelCycleBeats, loopedBeats as panelLoopedBeats,
  loopCycleIndex as panelLoopCycleIndex, tapTempo as panelTapTempo,
  estimateTempoFromPulses as panelClockTempo,
} from '../utils/transportLayout.js';
import {
  notify as uiNotifyStore, setStatus as uiStatusStore, openDialog as uiDialogStore, clearScriptUi,
  dismissNotification as uiDismissStore, updateNotification as uiUpdateStore,
  uiSnapshot as uiSnapshotStore,
} from '../stores/scriptUi.js';
import {
  flatControls, findControlById, findParentOfControl, isContainerControl,
  insertControlIntoTree, removeControlFromTree, remintControlIds, controlPanelOffset,
} from '../utils/containment.js';

/* --------------------------------------------------------------- path resolution */

// Runtime host override. When set (by the exported player), the runtime resolves the active panel,
// its scripts, and control value I/O from here instead of the editor stores — so the SAME runtime
// runs scripts in the shipped plugin. null = editor mode (resolve from panels / scriptDocuments).
let host = null;

/**
 * Install a host (exported player) or clear it (null = editor). See scripting/playerScriptHost.js.
 * Seeds value/session snapshots so the first change after install is measured against current state.
 */
export function setRuntimeHost(h) {
  host = h ?? null;
  if (host) {
    live.activePanelId = host.panel?.id ?? 'player';
    snapshotValues();
    seedSessionSnapshot();
  }
}

function activePanel() {
  if (host) return host.panel ?? null;
  return get(panels).find((p) => p.id === get(resolvedActivePanelId)) ?? null;
}

/** Find a control in the active panel by its friendly name (case-insensitive), id fallback. */
function findControlByName(name) {
  const panel = activePanel();
  if (!panel) return null;
  const target = String(name ?? '').toLowerCase();
  // flatControls, NOT panel.controls: a control inside a Group or Container was unreachable by
  // name — get("Osc1Cutoff.value") returned nothing for a knob that was plainly there, in both
  // runtimes, and most real panels group their controls. ce.panel.snapshot found it, because a
  // snapshot that stopped at the top level would have silently missed most of a panel.
  // A name that resolved before still resolves; this only adds the ones that never could.
  return flatControls(panel.controls ?? []).find((c) => {
    const core = c?._children?.Core;
    return String(core?.name ?? '').toLowerCase() === target || String(core?.id ?? '').toLowerCase() === target;
  }) ?? null;
}

// Common shorthands → their canonical section path (visible lives under Core, x under Transform, …).
const SHORTHANDS = {
  visible: 'Core.visible', enabled: 'Core.enabled', locked: 'Core.locked', name: 'Core.name', zindex: 'Core.zIndex',
  x: 'Transform.x', y: 'Transform.y', width: 'Transform.width', height: 'Transform.height',
  opacity: 'Transform.opacity', rotation: 'Transform.rotation', scale: 'Transform.scale',
  value: 'Value.value',
};

/** Walk a node case-insensitively; returns the real-case path or null if any segment is missing. */
function walkCaseInsensitive(node, segments) {
  const out = [];
  for (const seg of segments) {
    const low = String(seg).toLowerCase();
    let key = null;
    if (node && node._children) key = Object.keys(node._children).find((k) => k.toLowerCase() === low);
    if (key != null) { out.push(key); node = node._children[key]; continue; }
    if (node && typeof node === 'object') key = Object.keys(node).filter((k) => k !== '_children' && k !== '_type').find((k) => k.toLowerCase() === low);
    if (key != null) { out.push(key); node = node[key]; continue; }
    return null;
  }
  return out.join('.');
}

// If a resolved path lands on a custom-component ValueChannel object, address its live value.
// Lets a script write the channel by its friendly name: set("dial.cutoff", 5000).
function channelizePath(control, path) {
  if (!path) return path;
  const node = valueAtPath(control, path);
  if (node && typeof node === 'object' && !Array.isArray(node) && 'currentValue' in node) {
    return `${path}.currentValue`;
  }
  return path;
}

/** Map a script path's segments to the model's real-case section path. */
function resolveModelPath(control, segments) {
  // A bare control name means its value — `.value` is documented as the default representation, so
  // get("cutoff") and get("cutoff.value") are the same question. This is also what lets the
  // second-argument form, get("cutoff", "normalizedValue"), find something to normalise.
  if (segments.length === 0) return channelizePath(control, SHORTHANDS.value);
  const first = String(segments[0]).toLowerCase();
  let path;
  // Single-segment shorthand (e.g. "visible", "x", "value") — canonical, wins over any stray key.
  if (segments.length === 1 && SHORTHANDS[first]) {
    path = SHORTHANDS[first];
  // Explicit section path (e.g. "background.fill.colour") — walk from the control.
  } else if (control?._children && Object.keys(control._children).some((k) => k.toLowerCase() === first)) {
    path = walkCaseInsensitive(control, segments) ?? segments.join('.');
  } else {
    // Otherwise search each section for the property (e.g. a bare "fill.colour" or a channel name).
    path = null;
    if (control?._children) {
      for (const secKey of Object.keys(control._children)) {
        const sub = walkCaseInsensitive(control._children[secKey], segments);
        if (sub) { path = `${secKey}.${sub}`; break; }
      }
    }
    if (path == null) path = SHORTHANDS[first] ?? segments.join('.');
  }
  return channelizePath(control, path);
}

/** "cutoff.background.fill.colour" -> { name:'cutoff', segs:['background','fill','colour'] } */
function splitScriptPath(path) {
  const parts = String(path).split('.');
  return { name: parts[0], segs: parts.slice(1) };
}

/* ------------------------------------------------------------------ the panel itself */
// `panel` is a reserved first segment addressing the panel DOCUMENT rather than a control, so a
// script can read and write the thing it lives inside: size, name, background, the panic key.
// Until this existed the first segment was always a control name, so asking for the panel's width
// searched for a control called "panel" and reported it missing — a misleading answer.

function isPanelTarget(name) {
  return String(name ?? '').toLowerCase() === PANEL_TARGET;
}

// A control genuinely named "panel" loses to the document. Behaviour that depends on whether
// somebody happened to name a knob "panel" would be worse than a reserved word — but the author
// needs to know that control is no longer reachable by name, so it is reported once.
let warnedPanelNameClash = false;
function warnIfControlNamedPanel() {
  if (warnedPanelNameClash) return;
  const clash = activePanel()?.controls?.some((c) => isPanelTarget(c?._children?.Core?.name));
  if (!clash) return;
  warnedPanelNameClash = true;
  addScriptTrace('error', '',
    'A control on this panel is named "panel", which is a reserved word addressing the panel document. '
    + 'That control cannot be reached by name — rename it.');
}

/** Walk a plain dotted path on the panel object (no _children sections; it is a flat document). */
function panelValueAt(panel, segs) {
  let node = panel;
  for (const seg of segs) {
    if (node == null || typeof node !== 'object') return undefined;
    const key = Object.keys(node).find((k) => k.toLowerCase() === String(seg).toLowerCase());
    if (key == null) return undefined;
    node = node[key];
  }
  return node;
}

function getPanelValue(segs) {
  const panel = activePanel();
  if (!panel) return undefined;
  warnIfControlNamedPanel();
  if (segs.length === 0) {
    // A bare `panel` gives the summary a script usually wants, rather than the whole document.
    return {
      id: panel.id, name: panel.name, width: panel.width, height: panel.height,
      controlCount: Array.isArray(panel.controls) ? panel.controls.length : 0,
    };
  }
  if (segs.length === 1 && String(segs[0]).toLowerCase() === 'controlcount') {
    return Array.isArray(panel.controls) ? panel.controls.length : 0;
  }
  return panelValueAt(panel, segs);
}

function setPanelValue(segs, value) {
  const panel = activePanel();
  if (!panel) return;
  warnIfControlNamedPanel();
  if (segs.length === 0) { addScriptTrace('error', '', 'set("panel", …): name a property, e.g. set("panel.width", 800)'); return; }

  const root = String(segs[0]);
  if (PANEL_READONLY_PROPERTIES.some((p) => p.toLowerCase() === root.toLowerCase())) {
    addScriptTrace('error', '',
      `set("panel.${root}", …) is read-only — it is the panel's identity or its structure, and writing it `
      + 'would detach the document from itself. Use the panel/structure verbs for controls.');
    return;
  }

  // Walk to the leaf's parent, then assign with the document's real-case key.
  let node = panel;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node == null || typeof node !== 'object') return;
    const key = Object.keys(node).find((k) => k.toLowerCase() === String(segs[i]).toLowerCase());
    if (key == null) { addScriptTrace('error', '', `set("panel.${segs.join('.')}", …): no such property`); return; }
    node = node[key];
  }
  if (node == null || typeof node !== 'object') return;
  const last = Object.keys(node).find((k) => k.toLowerCase() === String(segs[segs.length - 1]).toLowerCase())
    ?? segs[segs.length - 1];
  node[last] = value;

  // The editor holds panels in a store; the player holds one object. Poke the store so the canvas
  // repaints, exactly as a control write does.
  if (!host) panels.update((list) => list.map((p) => (p.id === panel.id ? { ...p, [last]: node === panel ? value : p[last] } : p)));
}

/* ---------------------------------------------------------------- value representations (Q8) */
// A control value can be asked for three ways: the real value, the 0–1 position, or what the DPD
// would put on the wire. The accessor is a path SUFFIX — get("cutoff.normalizedValue") — or a
// second ARGUMENT — get("cutoff", "normalizedValue"). Both spellings work; the suffix is what the
// picker inserts, the argument is what the engines' host bindings pass. An explicit argument wins.
//
// `.value` is left in the path: it is the shorthand that already resolves to Value.value. The other
// two are stripped, because underneath them the thing being read or written is still the real value
// — the representation is arithmetic applied on the way past.

const DERIVED_ACCESSORS = new Set(VALUE_ACCESSOR_IDS.filter((id) => id !== 'value'));

function splitAccessor(path, explicitForm) {
  const text = String(path ?? '');
  const form = VALUE_ACCESSOR_IDS.includes(explicitForm) ? explicitForm : '';
  const dot = text.lastIndexOf('.');
  if (dot > 0) {
    const tail = text.slice(dot + 1);
    if (DERIVED_ACCESSORS.has(tail)) return { path: text.slice(0, dot), form: form || tail };
  }
  return { path: text, form: form || 'value' };
}

/** The control's own 0–1 range, from Behavior.min/max. null when it has no numeric range. */
function rangeOf(control) {
  const behavior = control?._children?.Behavior;
  const min = Number(behavior?.min);
  const max = Number(behavior?.max);
  return Number.isFinite(min) && Number.isFinite(max) && max !== min ? { min, max } : null;
}

// `.midiValue` is what the DPD codec would encode, and the codec lives in the device host — there
// is no way to answer it from the panel document alone. Say so once, clearly, rather than returning
// undefined and leaving the author to work out which of several things went wrong.
function reportNeedsDeviceHost(member, path) {
  addScriptTrace('error', '',
    `${member} on "${path}" needs the device host — the MIDI encoding is the device profile's, not the panel's. `
    + 'Use .value or .normalizedValue, or run this where the device host is attached.');
}

/* ------------------------------------------------------------- transmit origin (Q2) */
// Mirrors ScriptRuntime's origin tracking exactly, because the two runtimes have to agree on
// whether a given set() reaches the synth. A write is LOUD by default, SILENT while we're
// reacting to something the device just sent us (otherwise filling the panel from a dump echoes
// the whole dump straight back), and an explicit noTransmit()/transmit() block wins over both.
//
// Scope note, deliberately matching the C++ side: these blocks gate set(), NOT the explicit
// senders. sendCC() inside noTransmit() still sends — you asked for a CC, you get a CC.
const origin = {
  inboundDepth: 0,   // >0 while handling inbound MIDI / a dump
  override: -1,      // -1 none, 0 forced silent (noTransmit), 1 forced loud (transmit)
  stack: [],
};

function defaultTransmit() {
  if (origin.override === 0) return false;
  if (origin.override === 1) return true;
  return origin.inboundDepth === 0;
}

function pushTransmit(on) { origin.stack.push(origin.override); origin.override = on ? 1 : 0; }
function popTransmit() { origin.override = origin.stack.length ? origin.stack.pop() : -1; }

// A control's device-parameter binding on its value port, if it has one. Same shape
// deviceBindingSync reads going the other way (device → panel).
function valueBindingFor(control) {
  const bindings = control?._children?.DeviceBindings;
  if (bindings?.enabled === false) return null;
  const list = Array.isArray(bindings?.bindings) ? bindings.bindings : [];
  return list.find((b) => b?.kind === 'deviceParameter' && b?.parameterId
    && String(b.port ?? 'value') === 'value') ?? null;
}

// The third argument carries two different things, as the contract's own signature does:
// set(path, value, opts) with { transmit }, and the second-argument spelling of the value form.
// A string is a form, an object is opts.
function setValue(path, value, formOrOpts = '') {
  const form = typeof formOrOpts === 'string' ? formOrOpts : '';
  const opts = formOrOpts && typeof formOrOpts === 'object' ? formOrOpts : null;
  const addressed = splitAccessor(path, form);
  const { name, segs } = splitScriptPath(addressed.path);
  if (isPanelTarget(name)) { setPanelValue(segs, value); return; }
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `set: control "${name}" not found on the active panel`); return; }

  if (addressed.form === 'midiValue') { reportNeedsDeviceHost('set(.midiValue)', addressed.path); return; }
  if (addressed.form === 'normalizedValue') {
    const range = rangeOf(control);
    if (!range) {
      addScriptTrace('error', '', `set: "${name}" has no numeric range (Behavior.min/max), so .normalizedValue means nothing here`);
      return;
    }
    // Clamp: a 0–1 position outside 0–1 is a bug in the caller's maths, and letting it through
    // would drive the control past its own limits.
    const t = Math.max(0, Math.min(1, Number(value)));
    value = range.min + t * (range.max - range.min);
  }

  const modelPath = resolveModelPath(control, segs);

  // intercept(): the script's filters get the value before the model does, so a rule like "this
  // knob only takes even numbers" holds for every write rather than being re-checked at each
  // call site. Skipped while a filter is already running — an interceptor that writes to its own
  // path would otherwise re-enter itself forever.
  if (filters.length && !interceptDepth) {
    const key = `${String(control._children.Core.name ?? control._children.Core.id)}.${modelPath}`.toLowerCase();
    interceptDepth += 1;
    let decided;
    try { decided = applyIntercepts(key, value, valueAtPath(control, modelPath)); }
    finally { interceptDepth -= 1; }
    if (decided === REJECTED) return;
    value = decided;
  }

  // A write that goes nowhere used to VANISH. The contract's own headline (Q1) is that coverage is
  // total and you can never pick wrong, so a path that resolves to nothing has to say so — without
  // it every structural gap behind it is invisible.
  //
  // Who answers depends on who owns the document. The player host has its own write semantics (a
  // live value goes through the preview session, which needs no Value section at all), so it is
  // asked rather than second-guessed; a host that returns nothing is not making a claim, and is
  // taken at its word rather than reported on.
  // Landing but CREATING a key on a typed section node is almost always a typo: Font has a fixed
  // shape of 41 fields, so `Text.Font.sze` writes a property nothing reads. Free-form maps (a
  // state's `when`, a patch map) are untyped and take new keys by design, so they stay quiet.
  //
  // Asked BEFORE the write, and asked regardless of who performs it. Two things were wrong before:
  //
  //  * It was written as an `else if` beside the landing branch, which made it unreachable —
  //    probeNestedWrite reports writes:true for any target it can resolve, a fresh key included,
  //    and reports fresh:false whenever writes is false, so the state it tested for could never
  //    coincide with the branch it was on. The wording already described a write that HAD happened
  //    ("It was written, but nothing reads it"), which is the tell.
  //  * It only ran on the no-host path. But whether a key is new on a fixed-shape section is a
  //    question about the control tree, not about the host's write semantics — a typo is a typo in
  //    the player too. `wrote` still comes from the host, which is the part only the host knows.
  const shape = probeNestedWrite(control, modelPath, value);

  let wrote = true;
  if (host) {
    wrote = host.writeValue(control, modelPath, value) !== false;
  } else {
    wrote = shape.writes;
    if (wrote) updateControlProperty(control?._children?.Core?.id, modelPath, value);
  }

  if (wrote && shape.fresh && shape.typed) {
    addScriptTrace('warn', '',
      `set("${path}"): "${modelPath}" is a new property on a section with a fixed shape. `
      + 'It was written, but nothing reads it — check the spelling.');
  }

  if (!wrote) {
    const section = String(modelPath).split('.')[0];
    const hasSection = control?._children?.[section] !== undefined;
    addScriptTrace('error', '',
      `set("${path}"): nothing was written — "${modelPath}" does not lead anywhere on "${name}". `
      + (hasSection
        ? 'A child in the middle of the path is missing. A state patch key like '
          + '"Background.Fill.colour" is ONE map key rather than three path steps, and is reached '
          + 'with ce.panel.patch() instead.'
        : `"${section}" is not a section this control has. Add it in the Properties panel, or `
          + 'address a section it does have — ce.panel.info() lists them.'));
  }

  // Transmit-by-default: a bound control's value write also goes to the synth, which is what the
  // C++ runtime does. Without this the same script moved the knob window-closed and only moved
  // the picture window-open. An explicit opts.transmit beats the origin rule, as it does there —
  // this runtime used to accept the option and drop it.
  const transmit = opts && 'transmit' in opts ? opts.transmit !== false : defaultTransmit();
  if (!transmit) return;
  if (String(modelPath).toLowerCase() !== 'value' && !String(modelPath).toLowerCase().endsWith('.value')) return;
  const binding = valueBindingFor(control);
  if (!binding) return;
  const bindingRole = binding.deviceRole ?? DEFAULT_ROLE;
  // A binding made by bind() onto a parameter the script declared has no profile behind it, so it
  // is compiled from the declaration and sent raw. Without this the control moved and nothing left
  // the machine, which is exactly the "self-building panel builds dead controls" this pair exists
  // to fix — half-fixed would have been worse than not fixed, because the wiring would look done.
  if (hasDefinedParameter(bindingRole, binding.parameterId)) {
    const encoded = encodeRuntimeParameter(bindingRole, binding.parameterId, value);
    if (encoded.ok) sendRawMidi(encoded.bytes, `param_${binding.parameterId}`);
    else addScriptTrace('error', '', `set("${path}"): ${encoded.error}`);
    return;
  }
  commitDeviceParameter({
    deviceRole: bindingRole,
    parameterId: binding.parameterId,
    value,
    interactionPhase: 'commit',
    dryRun: false,
  });
}

function getValue(path, form = '') {
  const addressed = splitAccessor(path, form);
  const { name, segs } = splitScriptPath(addressed.path);
  if (isPanelTarget(name)) return getPanelValue(segs);
  const control = findControlByName(name);
  if (!control) return undefined;

  if (addressed.form === 'midiValue') { reportNeedsDeviceHost('get(.midiValue)', addressed.path); return undefined; }

  const modelPath = resolveModelPath(control, segs);
  const raw = host ? host.readValue(control, modelPath) : valueAtPath(control, modelPath);
  if (addressed.form !== 'normalizedValue') return raw;

  const range = rangeOf(control);
  if (!range) {
    addScriptTrace('error', '', `get: "${name}" has no numeric range (Behavior.min/max), so .normalizedValue means nothing here`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, (n - range.min) / (range.max - range.min)));
}

/** Read a control value at a path, for the debugger's watch panel. Never throws. */
export function readWatch(path) {
  try { return getValue(path); } catch { return undefined; }
}

/* ------------------------------------------------------------------ helpers (pure) */

// @module ce.math
/* ------------------------------------------------------------------------ colour arithmetic */
// The app's own, ported rather than restated for the reason every table in this file is: a script
// lightening a colour and the border renderer lightening the same colour have to agree, or a
// script-drawn highlight sits a shade off the one beside it.
//
// One accepted input, three forms out, and the difference matters. The app STORES colours as
// AARRGGBB (JUCE's order — '66FFFFFF' is a 40%-opaque white in every panel document). CSS and SVG
// want #RRGGBB or #RRGGBBAA — the SAME four bytes in a DIFFERENT order, which is the trap this
// pair of formats sets. So: everything takes "RRGGBB", "AARRGGBB" or "#RRGGBB" (the app's own
// parser, which reads the last six characters), everything returns "#RRGGBB" which both CSS and a
// panel property accept, and ONE verb — alpha() — returns the panel's AARRGGBB, because that is
// the only form a stored colour can carry an alpha in. Making a DRAWING translucent is
// ce.draw.opacity(), which is a different question with a different answer.

const colourClampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** "RRGGBB" | "AARRGGBB" | "#RRGGBB" -> [r, g, b]. The app's parseHexRGB: the last six characters
 *  are the colour, whatever came before them. Nothing readable gives black rather than NaN. */
function colourChannels(hex) {
  const h = String(hex ?? '').replace(/#/g, '').slice(-6);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colourFromRgb(r, g, b) {
  const c = (v) => colourClampByte(Number(v) || 0).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function colourToRgb(hex) {
  const rgb = colourChannels(hex);
  return rgb ? { r: rgb[0], g: rgb[1], b: rgb[2] } : undefined;
}

/** Scale each channel toward 255. The border renderer's `lighten`, default and all. */
function colourLighten(hex, amount) {
  const rgb = colourChannels(hex);
  if (!rgb) return undefined;
  const f = Number.isFinite(Number(amount)) ? Number(amount) : 0.4;
  return colourFromRgb(rgb[0] + (255 - rgb[0]) * f, rgb[1] + (255 - rgb[1]) * f, rgb[2] + (255 - rgb[2]) * f);
}

/** Scale each channel toward 0. The border renderer's `darken`, whose 0.55 default is the groove
 *  shading — so a script drawing a bevel matches the one the panel draws. */
function colourDarken(hex, amount) {
  const rgb = colourChannels(hex);
  if (!rgb) return undefined;
  const f = Number.isFinite(Number(amount)) ? Number(amount) : 0.55;
  return colourFromRgb(rgb[0] * f, rgb[1] * f, rgb[2] * f);
}

/** Blend two colours. NOT an app algorithm and said so: it is lerp() per channel, in plain RGB,
 *  which is the blend a meter fading from green to red actually wants. */
function colourMix(a, b, t) {
  const x = colourChannels(a);
  const y = colourChannels(b);
  if (!x || !y) return undefined;
  const f = Math.min(1, Math.max(0, Number(t) || 0));
  return colourFromRgb(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f);
}

/** The PANEL's form: AARRGGBB, which is what a stored colour property holds. See the note above —
 *  CSS's #RRGGBBAA is the same bytes the other way round, and mixing them up is silent. */
function colourWithAlpha(hex, a) {
  const rgb = colourChannels(hex);
  if (!rgb) return undefined;
  const f = Math.min(1, Math.max(0, Number.isFinite(Number(a)) ? Number(a) : 1));
  const aa = Math.round(f * 255).toString(16).padStart(2, '0');
  return (aa + colourFromRgb(rgb[0], rgb[1], rgb[2]).slice(1)).toUpperCase();
}

/** Hue 0-360, saturation and lightness 0-100 — the colour editor's own ranges. */
function colourToHsl(hex) {
  const rgb = colourChannels(hex);
  if (!rgb) return undefined;
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, sat = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s: sat * 100, l: l * 100 };
}

function colourFromHsl(hue, sat, light) {
  const h = Number(hue) || 0;
  const s = (Number(sat) || 0) / 100;
  const l = (Number(light) || 0) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return colourFromRgb(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

// @module ce.music
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const musicMod12 = (n) => ((Math.floor(n) % 12) + 12) % 12;
// The panel writes accidentals as ♯ and ♭; a script types # and b. Both are the same note, so both
// spellings are folded to the ASCII pair before anything tries to read a name.
const musicAscii = (s) => String(s).replace(/♯/g, '#').replace(/♭/g, 'b');
const FLAT_LETTER = { C: 11, D: 1, E: 3, F: 4, G: 6, A: 8, B: 10 };

// A pitch argument is a MIDI number or a name ("C4"), the way sendNote's already is. An unreadable
// name is 0 HERE — musicPitch feeds scaleNotes and friends, and a nil root would turn one bad
// string into an unexplained nil list. noteNumber itself is honest about it.
const musicPitch = (v) => (typeof v === 'string'
  ? (helpers.noteNumber(v) ?? 0)
  : Math.floor(Number(v) || 0));
const musicSteps = (table, name) => table[name == null ? 'major' : String(name)];
const musicNotes = (table, root, name) => {
  const steps = musicSteps(table, name);
  if (!steps) return undefined;
  const base = musicPitch(root);
  return steps.map((x) => base + x);
};
// Sorted ascending, which is what every voicing rule below assumes.
const musicSorted = (list) => (Array.isArray(list) ? list.slice() : []).map(Number)
  .filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
// A count argument that is not a finite number falls back to its default. Written out rather than
// leaning on falsiness, because `0 || 3` is 3 in JavaScript and Python and 0 in Lua — and a degree
// or a size differing by one between runtimes is a chord differing by a third.
const musicCount = (v, fallback) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback);

// Stack scale thirds from a 0-based degree — the Chord Pad's `stackedChord`, offsets from the
// TONIC. Wrapping past the top of the scale adds an octave, so degree 8 of a seven-note scale is
// the I chord one octave up rather than an error.
const musicStack = (steps, degree, size) => {
  const n = steps.length;
  const out = [];
  for (let k = 0; k < Math.max(2, musicCount(size, 3)); k += 1) {
    const idx = degree + k * 2;
    out.push(steps[((idx % n) + n) % n] + Math.floor(idx / n) * 12);
  }
  return out;
};
// Every octave-rotation of a chord, up and down — the candidates a voice-leading rule picks from.
const musicInversions = (notes, spread = 2) => {
  const base = notes.slice();
  const out = [base];
  const span = Math.max(1, base.length - 1) * spread;
  let cur = base;
  for (let i = 0; i < span; i += 1) { cur = [...cur.slice(1), cur[0] + 12].sort((a, b) => a - b); out.push(cur); }
  cur = base;
  for (let i = 0; i < span; i += 1) { cur = [cur[cur.length - 1] - 12, ...cur.slice(0, -1)].sort((a, b) => a - b); out.push(cur); }
  return out;
};
// Each voice to its NEAREST note in the other chord — voice counts differ (a triad following a
// seventh), so pairing by index would compare nonsense.
const musicMotion = (a, b) => a.reduce((sum, n) => sum + Math.min(...b.map((m) => Math.abs(n - m))), 0);

// A roman numeral for a chord root, spelled against the MAJOR scale so borrowed degrees read as
// ♭III / ♭VI / ♭VII the way the Chord Pad's wheel labels them. Minor-ish qualities go lowercase.
const musicRoman = (rootSemitone, quality) => {
  const semi = musicMod12(rootSemitone);
  let best = 0;
  let acc = '';
  for (let d = 0; d < 7; d += 1) {
    const diff = musicMod12(semi - SCALES.major[d]);
    if (diff === 0) { best = d; acc = ''; break; }
    if (diff === 11) { best = d; acc = '♭'; }              // a semitone below degree d
    else if (diff === 1 && acc === '') { best = d; acc = '♯'; }
  }
  let r = ROMAN[best];
  if (MINOR_QUALITY_NAMES.includes(quality)) r = r.toLowerCase();
  if (quality === 'dim' || quality === 'dim7' || quality === 'm7b5') r += '°';
  if (quality === 'aug') r += '+';
  return acc + r;
};
// @module ce.time
// A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and
// only DIFFERENCES mean anything. That is deliberate — a wall clock jumps when the machine syncs
// its time, and a script measuring an interval across that jump measures the jump.
//
// This is a Q10 exception, and a sharp one. The Lua engine opens base, math, string and table and
// NOT os, so a Lua script has no clock at all; QuickJS has Date and Python has time, and the three
// disagree about epoch and unit. So "use the language's own" was never available here.
const NOW_EPOCH = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? null : Date.now();
const nowMsRead = () => (NOW_EPOCH === null ? performance.now() : Date.now() - NOW_EPOCH);

// A division is the panel's own vocabulary — "1/16", "1/8T", "1/4D" — and every sequencer property
// speaks it. An unknown name returns nothing rather than the component's 1/16 fallback: a component
// must keep running, a script that mistyped one should find out.
const timeDivision = (name) => DIVISIONS[String(name)];

// @module ce.math
// A seeded xorshift32, written the same way in every prelude and masked to 32 bits at every step.
// Seeded is the whole point: the language's own math.random cannot promise the same sequence in
// five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
// different in the editor and in the export.
const DEFAULT_SEED = 0x9E3779B9;

// ONE GENERATOR PER (SCRIPT, STREAM), not one for the whole runtime.
//
// It used to be a single module-level state, and that was wrong in two directions at once. Across
// scripts it was a cross-runtime DIVERGENCE: the C++ JavaScript and Python engines give each script
// its own engine or namespace, so the generator was already per script there, while Lua's prelude
// runs once into shared globals and this runtime kept one variable — so a panel with two generative
// scripts produced different output in the editor than in the export, and different again depending
// on which language the scripts were written in. That breaks the one rule Model 2 exists for.
//
// Within a script it was coupling: shuffle() advanced the same state gaussian() read, so two
// generative elements interfered and reseeding one reset the other.
//
// Keyed by script AND stream fixes both. A fresh key starts from the same default seed, so an
// untouched stream is still deterministic.
const randomStates = new Map();

// The stream in force, set by randomStream(name, fn) for the duration of the block. Module-level
// rather than threaded through nine signatures, for the reason routeMidi is a block: the stream is
// a decision about a RUN of draws, not about one of them.
let streamOverride = null;

function randomKey(scriptId) {
  return `${scriptId ?? ''}\u0000${streamOverride ?? ''}`;
}

function randomNext(scriptId) {
  const key = randomKey(scriptId);
  let x = randomStates.get(key) ?? DEFAULT_SEED;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  randomStates.set(key, x);
  return x / 4294967296;      // [0, 1)
}

function randomSeedImpl(scriptId, n) {
  const v = Math.floor(Number(n) || 0) >>> 0;
  // 0 is a dead state for xorshift — it would return zero forever — so it means "the default"
  // rather than "a generator that never moves".
  randomStates.set(randomKey(scriptId), v === 0 ? DEFAULT_SEED : v);
}

/**
 * randomStream(name, fn) — draws inside the block come from a generator of their own.
 *
 * A block rather than a name argument on nine verbs, which is the shape routeMidi already uses and
 * for the same stated reason. Restored in a `finally`, so a throw inside cannot leave every later
 * draw in the session pointed at the wrong stream.
 */
function randomStreamImpl(scriptId, name, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'stream(name, fn) needs a block to run — nothing was drawn');
    return;
  }
  const previous = streamOverride;
  streamOverride = String(name ?? '');
  try { fn(); } finally { streamOverride = previous; }
}

/** Drop every generator. Used when a panel is torn down, so a reload starts from the seed again. */
export function resetRandomStreams() { randomStates.clear(); streamOverride = null; }

function randomImpl(scriptId, lo, hi) {
  const r = randomNext(scriptId);
  if (lo === undefined || lo === null || hi === undefined || hi === null) return r;
  const a = Math.floor(Number(lo)), b = Math.floor(Number(hi));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return r;
  // Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
  const low = Math.min(a, b), high = Math.max(a, b);
  return low + Math.floor(r * (high - low + 1));
}

/**
 * wrap(v, lo, hi) — bring a value round into a HALF-OPEN range, so wrap(12, 0, 12) is 0.
 *
 * This exists because the five runtimes disagree about `%`. (-1) % 12 is 11 in Lua and Python and
 * -1 in JavaScript, C++, C# and Java — so the ordinary way to write a pitch class already gives two
 * different answers depending on which engine the panel is running in. The floored form below is
 * written identically in every prelude, which is the only way that stops being true.
 */
function wrapImpl(v, lo, hi) {
  const a = Number(lo), b = Number(hi), n = Number(v);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(n)) return Number.isFinite(a) ? a : 0;
  const span = b - a;
  // An empty or inverted range has exactly one answer, and it is not NaN.
  if (!(span > 0)) return a;
  return a + ((((n - a) % span) + span) % span);
}

/** {{x, y}, …} however the language spelled it, sorted by x. Accepts pairs and {x=, y=} tables. */
function toBreakpoints(points) {
  const raw = Array.isArray(points) ? points
    : points && typeof points === 'object' ? Object.values(points)
    : [];
  const out = [];
  for (const p of raw) {
    let x, y;
    if (Array.isArray(p)) { [x, y] = p; }
    else if (p && typeof p === 'object') {
      // A wasmoon array-of-pairs arrives as an object of objects, so try {x,y} then 1/2 then 0/1.
      x = p.x ?? p[1] ?? p[0];
      y = p.y ?? p[2] ?? p[1];
    }
    const nx = Number(x), ny = Number(y);
    // A point may also carry the CURVE of the segment ending at it, the way an Envelope point and
    // a Router breakpoint do. Straight lines are still the default, so a plain pair list is
    // unchanged.
    const shape = Array.isArray(p) ? p[2] : p?.curve;
    const tension = Array.isArray(p) ? p[3] : p?.tension;
    if (Number.isFinite(nx) && Number.isFinite(ny)) out.push([nx, ny, shape, tension]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/**
 * map(v, points) — straight lines through breakpoints: a response curve of the panel's own shape,
 * which is the thing curve()'s closed set of four names cannot express and a property cannot hold.
 *
 * Outside the outermost points the value is HELD rather than extrapolated: a curve drawn between
 * 0 and 1 that suddenly runs away past 1 is never what the author drew.
 */
function mapCurveImpl(v, points) {
  const list = toBreakpoints(points);
  if (!list.length) return Number(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return list[0][1];
  // An exact hit on a breakpoint takes the LAST point with that x. That is what makes two points
  // sharing an x a STEP rather than a divide by zero, and it settles which side of the step the
  // breakpoint itself belongs to — the value it steps TO.
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i][0] === n) return list[i][1];
  if (n < list[0][0]) return list[0][1];
  const last = list[list.length - 1];
  if (n > last[0]) return last[1];
  for (let i = 1; i < list.length; i += 1) {
    const [x0, y0] = list[i - 1];
    const [x1, y1] = list[i];
    if (n < x1 && x1 !== x0) {
      const t = (n - x0) / (x1 - x0);
      // The segment's own shape, taken from the point it ENDS at — the envelope's convention, so a
      // curve list read out of a control evaluates here exactly as the app draws it.
      const eased = list[i][2] === undefined || list[i][2] === null
        ? t : shapeImpl(t, list[i][2], list[i][3]);
      return y0 + eased * (y1 - y0);
    }
  }
  return last[1];
}

function toNumberList(values) {
  const raw = Array.isArray(values) ? values
    : values && typeof values === 'object' ? Object.values(values)
    : [];
  return raw.map(Number).filter(Number.isFinite);
}

/** quantizeTo(v, values) — nearest entry in a LIST. A tie goes to the LOWER value, so the answer
    never depends on how the two distances happened to round. */
function quantizeToImpl(v, values) {
  const list = toNumberList(values);
  if (!list.length) return Number(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return list[0];
  let best = list[0];
  let bestDistance = Math.abs(n - best);
  for (const candidate of list) {
    const d = Math.abs(n - candidate);
    if (d < bestDistance || (d === bestDistance && candidate < best)) { best = candidate; bestDistance = d; }
  }
  return best;
}

/**
 * random.choice(values [, weights]) — a pick from the SEEDED generator, so a randomised patch
 * replays. Exactly one number is drawn in every branch, weighted or not: a weighted pick that
 * consumed a different amount of the sequence would change what everything after it picked, and
 * "the same seed replays the same sequence" would quietly stop being true.
 */
function randomChoiceImpl(scriptId, values, weights) {
  const raw = Array.isArray(values) ? values
    : values && typeof values === 'object' ? Object.values(values)
    : [];
  if (!raw.length) return undefined;
  const r = randomNext(scriptId);
  const w = toNumberList(weights).map((n) => (n > 0 ? n : 0));
  let total = 0;
  for (let i = 0; i < raw.length; i += 1) total += w[i] ?? 0;
  if (!(total > 0)) return raw[Math.floor(r * raw.length)];
  let ticket = r * total;
  for (let i = 0; i < raw.length; i += 1) {
    ticket -= w[i] ?? 0;
    if (ticket < 0) return raw[i];
  }
  return raw[raw.length - 1];
}

// A gain of zero or less is -144 dB, the 24-bit noise floor, rather than negative infinity: -inf is
// a number half the runtimes cannot carry through a value and none of them can put on a label.
const MIN_DB = -144;

/* ------------------------------------------------------- ce.math: the rest of the arithmetic */
// Everything below is what a synth panel actually computes and had to hand-roll. The rule from Q10
// still holds and is what keeps the list finite: nothing here duplicates the language's own scalar
// maths (min/max/abs/floor/ceil/sin all already exist in every runtime). What IS here is either
// domain-specific, list-shaped (where Lua's varargs make the language version unusable), or must
// be identical in five runtimes to be worth anything at all.

const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

/** A list however the language spelled it — a JS array, or a Lua table over the wasmoon bridge. */
function toList(values) {
  if (Array.isArray(values)) return values;
  if (values && typeof values === 'object') return Object.values(values);
  return [];
}

// --- range and normalisation -------------------------------------------------------------
// The value model already has three faces (.value / .normalizedValue / .midiValue). A script
// converting between them by hand was writing scale() with the same two arguments every time —
// and scale() does NOT clamp, so a value past the end came out past 0..1 and stayed wrong.

function normImpl(v, lo, hi) {
  const a = num(lo), b = num(hi);
  if (a === b) return 0;
  const t = (num(v) - a) / (b - a);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function denormImpl(t, lo, hi) {
  const a = num(lo), b = num(hi);
  const x = num(t);
  return a + (x < 0 ? 0 : x > 1 ? 1 : x) * (b - a);
}
/** 0..1 -> -1..1 and back: the two shapes a modulation source is ever in. */
const bipolarImpl = (t) => num(t) * 2 - 1;
const unipolarImpl = (v) => (num(v) + 1) / 2;

/**
 * fold(v, lo, hi) — come back off the end instead of round it.
 *
 * wrap() jumps from the top to the bottom, which is right for a pitch class and wrong for a
 * modulation depth: a fold reflects, so the movement stays continuous. Wave folding is the audible
 * version of the same idea, and neither is expressible with the language's %.
 */
function foldImpl(v, lo, hi) {
  const a = num(lo), b = num(hi);
  const span = b - a;
  if (!(span > 0)) return a;
  const t = Math.abs(num(v) - a) % (span * 2);
  return a + (t > span ? span * 2 - t : t);
}

/**
 * index(t, count) — 0..1 to one of `count`, zero-based.
 *
 * The hand-rolled floor(t * count) returns `count` itself at exactly 1.0, which is one past the
 * end of every list it is used to address. That off-by-one only shows up when a knob is turned
 * fully up, which is exactly when somebody is watching.
 */
function indexImpl(t, count) {
  const n = Math.floor(num(count));
  if (n <= 0) return 0;
  const i = Math.floor(normImpl(t, 0, 1) * n);
  return i >= n ? n - 1 : i;
}

// --- shaping -------------------------------------------------------------------------------

/**
 * crossfade(a, b, t [, law]) — the laws the Crossfader component already has, which a script
 * could not compute. "equalPower" is the one that matters: a linear fade between two sounds dips
 * in the middle, which is audible and is why the component defaults away from it.
 */
function crossfadeImpl(a, b, t, law) {
  const x = normImpl(t, 0, 1);
  const from = num(a), to = num(b);
  const kind = String(law ?? 'linear').toLowerCase();
  if (kind === 'equalpower') {
    const angle = (x * Math.PI) / 2;
    return from * Math.cos(angle) + to * Math.sin(angle);
  }
  if (kind === 'sharp') {
    // The component's steep law: constant power squared, so the middle passes quickly.
    const g = x * x * (3 - 2 * x);
    return from * (1 - g) + to * g;
  }
  return from + (to - from) * x;
}

/**
 * approach(current, target, maxStep) — move, but no further than this in one go.
 *
 * A rate limit with no state of its own, so it works from any handler without the script keeping
 * a timer. ce.anim owns motion the RUNTIME drives; this is the one a script drives itself, per
 * incoming message — which is how you smooth a jumpy expression pedal.
 */
function approachImpl(current, target, maxStep) {
  const from = num(current), to = num(target);
  const step = Math.abs(num(maxStep));
  if (!(step > 0)) return to;
  const delta = to - from;
  if (Math.abs(delta) <= step) return to;
  return from + (delta > 0 ? step : -step);
}

// --- rounding and comparison ---------------------------------------------------------------

/** roundTo(v, decimals) — for a readout. JS's toFixed returns a STRING and Lua has no equivalent. */
function roundToImpl(v, decimals) {
  const d = Math.floor(num(decimals));
  const f = 10 ** (d < 0 ? 0 : d);
  return Math.round(num(v) * f) / f;
}

/**
 * almost(a, b [, epsilon]) — float comparison that means what == is assumed to mean.
 *
 * A panel compares values constantly (has this reached its target, is this at the detent) and
 * every one of those comparisons is on a float that arrived through a scale() or a curve().
 */
function almostImpl(a, b, epsilon) {
  const tol = Math.abs(num(epsilon, 1e-9));
  return Math.abs(num(a) - num(b)) <= (tol || 1e-9);
}

// --- lists ---------------------------------------------------------------------------------
// Lua's math.min/max take VARARGS, so over a table they need table.unpack and fall over on a long
// one; JavaScript needs a spread with the same limit. Over a list these are genuinely missing in
// both, and a panel deals in lists constantly — macro slots, matrix rows, envelope points, the
// values out of a dump.

function minOfImpl(values) {
  const list = toNumberList(values);
  if (!list.length) return undefined;
  let best = list[0];
  for (const n of list) if (n < best) best = n;
  return best;
}
function maxOfImpl(values) {
  const list = toNumberList(values);
  if (!list.length) return undefined;
  let best = list[0];
  for (const n of list) if (n > best) best = n;
  return best;
}
function sumImpl(values) {
  let total = 0;
  for (const n of toNumberList(values)) total += n;
  return total;
}
function meanImpl(values) {
  const list = toNumberList(values);
  return list.length ? sumImpl(list) / list.length : undefined;
}

/**
 * blend(a, b, t) — morph one set of values into another, element by element.
 *
 * This is what a snapshot morph IS, and a script could only do it a value at a time. The shorter
 * list decides the length: padding with zeros would silently drag the missing entries to nothing,
 * which on a patch is a set of parameters slammed to their minimum.
 */
function blendImpl(a, b, t) {
  const from = toNumberList(a);
  const to = toNumberList(b);
  const x = num(t);
  const n = Math.min(from.length, to.length);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(from[i] + (to[i] - from[i]) * x);
  return out;
}

// --- randomness ----------------------------------------------------------------------------
// All of these draw from the SEEDED generator, and each one draws a FIXED number of times, so a
// seed replays the whole sequence regardless of which of them a panel used. That rule is why
// randomGaussian does not cache Box-Muller's second value the way the textbook version does.

/** The seeded float in a range — random(lo, hi) returns whole numbers, so this did not exist. */
function randomFloatImpl(scriptId, lo, hi) {
  const a = num(lo), b = num(hi, 1);
  return a + randomNext(scriptId) * (b - a);
}

/**
 * randomGaussian([mean, sd]) — a bell rather than a slab. Humanising velocity or timing with a
 * uniform random is the thing that sounds mechanical; most of the values should be near the middle.
 * Box-Muller, always consuming exactly two draws.
 */
function randomGaussianImpl(scriptId, mean, sd) {
  const u1 = Math.max(randomNext(scriptId), 1e-12);   // ln(0) is not a number anyone wants downstream
  const u2 = randomNext(scriptId);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return num(mean) + z * num(sd, 1);
}

/** randomWalk(current, step, lo, hi) — drift, not jump. A generative line that stays musical. */
function randomWalkImpl(scriptId, current, step, lo, hi) {
  const move = (randomNext(scriptId) * 2 - 1) * Math.abs(num(step));
  const next = num(current) + move;
  if (lo === undefined || lo === null || hi === undefined || hi === null) return next;
  // Folded rather than clamped: a walk that clamps sticks to the end it hit and stops moving.
  return foldImpl(next, num(lo), num(hi));
}

/** randomBool([chance]) — a weighted coin. The probability gate every step sequencer wants. */
function randomBoolImpl(scriptId, chance) {
  return randomNext(scriptId) < num(chance, 0.5);
}

/** shuffle(values) — seeded Fisher-Yates, returning a NEW list. Draws exactly n-1 times. */
function shuffleImpl(scriptId, values) {
  const out = [...toList(values)];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomNext(scriptId) * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

// --- geometry ------------------------------------------------------------------------------
// For XY pads, joysticks, the Orbit and Ribbon, and above all ce.draw — whose arcs are DEGREES
// with 0 at twelve o'clock, clockwise. A script drawing a knob ring had to know that convention
// and rebuild atan2 against it; getting the quadrant wrong is a pointer that runs backwards.

const degImpl = (radians) => (num(radians) * 180) / Math.PI;
const radImpl = (degrees) => (num(degrees) * Math.PI) / 180;

function distanceImpl(x1, y1, x2, y2) {
  const dx = num(x2) - num(x1);
  const dy = num(y2) - num(y1);
  return Math.sqrt(dx * dx + dy * dy);
}

/** The angle from (x1,y1) to (x2,y2), in ce.draw's convention: degrees, 0 up, clockwise, 0..360. */
function angleOfImpl(x1, y1, x2, y2) {
  const dx = num(x2) - num(x1);
  const dy = num(y2) - num(y1);
  const a = degImpl(Math.atan2(dx, -dy));
  return a < 0 ? a + 360 : a;
}

/** polar(angle, radius) — the inverse, in the same convention. { x, y } offsets from the centre. */
function polarImpl(angle, radius) {
  const a = radImpl(num(angle));
  const r = num(radius);
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}

/* ------------------------------------------ ce.math: the transforms the Properties panel applies */
// The panel is not only a place to store constants — it CONFIGURES value transforms. A Macro slot
// has a curve, a Router has a dead zone and a transfer curve, an Envelope segment has a curve and a
// tension, a Timbre pad blends anchors by a power, a slider generates tick stops, a Meter reads in
// dB. Every one of those is arithmetic the app performs and a script could not reproduce — so a
// script could not compute what its own panel was about to display, and anything it worked out
// alongside a bound control came out subtly different.
//
// These are the app's own functions, matched exactly rather than approximated. Where a formula
// looks odd (the tension default below), it is odd IN THE APP, and matching it is the point.

/**
 * shape(v, curve [, tension]) — the panel's own curve warp: the one an Envelope segment and a
 * Router breakpoint use (utils/envelopeLayout.js `envWarp`).
 *
 * This is NOT curve(). curve() is the older, simpler family — `exp` is v², `log` is √v, and the
 * s-curve is spelled `s`. The panel spells it `scurve`, has a `hold`, and computes `exp`/`log`
 * from a tension exponent. So a script that read a curve name straight out of a control and passed
 * it to curve() got either "unknown shape" or a different number. Both verbs stay: curve() is what
 * existing panels are written against, shape() is what the app itself does.
 *
 * The tension default is 1.6 rather than 0 — `tension || 1.6` in the app, so an unset tension is
 * not a straight line. Matched deliberately: a shape() that disagreed with the envelope it is
 * named after would be worse than not having one.
 */
function shapeImpl(v, curve, tension) {
  const t = normImpl(v, 0, 1);
  const k = 1 + Math.max(0, num(tension, 0) || 1.6);
  switch (String(curve)) {
    case 'exp': return t ** k;
    case 'log': return 1 - (1 - t) ** k;
    // Both spellings, because the panel says "scurve" and the script API has always said "s".
    case 'scurve': case 's': return t * t * (3 - 2 * t);
    case 'hold': return t >= 1 ? 1 : 0;
    default: return t;
  }
}

/**
 * deadzone(v, amount [, invert]) — the Router's input shaping (utils/routerLayout.js `shapeInput`).
 *
 * Below the threshold the value is zero, and the REMAINING range rescales to fill 0–1, so response
 * starts right at the edge of the dead zone rather than stepping up from it. That rescale is the
 * part a hand-rolled version leaves out, and leaving it out loses the top of the range.
 */
function deadzoneImpl(v, amount, invert) {
  let x = normImpl(v, 0, 1);
  if (invert === true) x = 1 - x;
  const dz = normImpl(amount, 0, 1);
  if (dz > 0) x = x <= dz ? 0 : (x - dz) / (1 - dz);
  return normImpl(x, 0, 1);
}

/**
 * weights(points, x, y [, power]) — the inverse-distance blend a Timbre Space and a Preset
 * Constellation use (utils/timbreLayout.js, utils/constellationLayout.js).
 *
 * Normalised, so they sum to 1. `power` is the blend sharpness: higher means the nearest anchor
 * dominates sooner. Pair it with blendBy() to morph a set of values the way the pad does.
 */
function weightsImpl(points, x, y, power) {
  const list = toList(points).map((p) => ({ x: num(p?.x), y: num(p?.y) }));
  if (!list.length) return [];
  const px = normImpl(x, 0, 1);
  const py = normImpl(y, 0, 1);
  const p = Math.max(0.5, num(power, 2));
  const eps = 1e-6;                               // the app's own guard against a zero distance
  const raw = list.map((pt) => {
    const d2 = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    return 1 / (d2 ** (p / 2) + eps);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return total > 0 ? raw.map((w) => w / total) : raw.map(() => 1 / raw.length);
}

/** blendBy(values, weights) — a weighted sum. What weights() is for, and what a morph pad IS. */
function blendByImpl(values, weights) {
  const v = toNumberList(values);
  const w = toNumberList(weights);
  const n = Math.min(v.length, w.length);
  let total = 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) { sum += v[i] * w[i]; total += w[i]; }
  return total > 0 ? sum / total : 0;
}

/**
 * ticks(major [, minor]) — the stop positions a slider's scale is drawn from
 * (utils/sliderGeometry.js `buildSliderTickStops`), as 0–1 positions.
 *
 * A script drawing its own scale with ce.draw had to reinvent the minor-tick spacing, and getting
 * it wrong puts the minors visibly out of step with the ones the app draws beside them.
 */
function ticksImpl(major, minor) {
  const majorCount = Math.max(2, Math.round(num(major, 11)));
  const minorCount = Math.max(0, Math.round(num(minor, 0)));
  const out = { major: [], minor: [] };
  for (let index = 0; index < majorCount; index += 1) {
    const normalized = index / (majorCount - 1);
    out.major.push(normalized);
    if (index >= majorCount - 1 || minorCount <= 0) continue;
    for (let m = 1; m <= minorCount; m += 1) {
      out.minor.push(normalized + ((m / (minorCount + 1)) * (1 / (majorCount - 1))));
    }
  }
  return out;
}

/**
 * dbPosition(fraction [, floorDb, ceilDb]) — where a level sits on a dB meter
 * (utils/meterLayout.js `meterPosition`), 0–1.
 *
 * gainToDb answers "how many dB is this"; this answers "how far up the meter does it go", which is
 * a different question and the one a script drawing a meter is asking. The 1e-4 clamp is the app's:
 * without it silence is -inf and the fill position stops being a number.
 */
function dbPositionImpl(fraction, floorDb, ceilDb) {
  const frac = normImpl(fraction, 0, 1);
  const floor = num(floorDb, -60);
  const ceil = num(ceilDb, 6);
  if (ceil === floor) return 0;
  const db = 20 * Math.log10(Math.max(frac, 1e-4));
  return normImpl((db - floor) / (ceil - floor), 0, 1);
}

/* --------------------------------------------------- ce.math: taming what arrives on the wire */

/**
 * smooth(current, target, coefficient [, epsilon]) — one-pole exponential smoothing.
 *
 * Not the same job as approach(). approach moves a FIXED step, which is a rate limit; this moves a
 * PROPORTION of the remaining distance, which settles fast and then creeps — the response a jittery
 * expression pedal or a noisy CC wants.
 *
 * It is `lerp` underneath and says so, but two things are the reason it is a member rather than a
 * line: the coefficient is clamped to 0–1, and it ARRIVES. A one-pole is asymptotic — left alone it
 * sits at 0.9999 forever and a control smoothed with it transmits forever. Snapping inside epsilon
 * is what a hand-rolled version leaves out, and the symptom is a panel that never stops sending.
 */
function smoothImpl(current, target, coefficient, epsilon) {
  const from = num(current);
  const to = num(target);
  const k = normImpl(coefficient, 0, 1);
  const tol = Math.abs(num(epsilon, 1e-4)) || 1e-4;
  if (Math.abs(to - from) <= tol) return to;
  return from + (to - from) * k;
}

/**
 * hysteresis(value, on, low, high) — a Schmitt trigger: turns on at `high`, off at `low`, and
 * HOLDS in between. `on` is the state it is currently in, and the return is the state it should be.
 *
 * A plain threshold chatters: a CC hovering on the line flips a switch dozens of times a second,
 * which on a bound control is dozens of messages a second. Two thresholds and the current state is
 * the fix, and nothing else in the module composes to it.
 */
function hysteresisImpl(value, on, low, high) {
  const v = num(value);
  let lo = num(low);
  let hi = num(high);
  // A caller who passes them the other way round means the same thing; refusing would be pedantry.
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return on === true ? v > lo : v >= hi;
}

/**
 * median(values) — the middle value, or the mean of the two middle ones.
 *
 * Distinct from mean() and the reason is the whole point: a mean SMEARS a spike across the result,
 * a median rejects it. For a noisy controller reading, that is the difference between a glitch you
 * can hear and one you cannot.
 */
function medianImpl(values) {
  const list = toNumberList(values).slice().sort((a, b) => a - b);
  if (!list.length) return undefined;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/**
 * unshape(y, curve [, tension]) — the inverse of shape().
 *
 * Going device → panel THROUGH a taper needs it: a value that was shaped on the way out has to be
 * un-shaped on the way back, or the control lands somewhere else than it started. Only map() is
 * invertible by hand (swap x and y); a named curve is not.
 *
 * `hold` is a step, so many inputs give the same output and there is no true inverse. It returns
 * the EARLIEST input that produces the output, which is the only answer that is a function.
 */
/**
 * euclid(steps, pulses [, rotation]) — `pulses` hits spread as evenly as possible over `steps`,
 * as a list of booleans. The Bjorklund rhythm, and the app's own (utils/arpLayout.js `euclid`).
 *
 * The Arpeggiator has used this for its rest pattern since it shipped, and a script could set
 * arpEuclidSteps/Pulses/Rotate but never COMPUTE a pattern — so a sequencer, a gate, an LFO mask or
 * anything else that wanted one had to reinvent it, and the hand-rolled version is almost never the
 * stable spread.
 *
 * Bresenham rather than the recursive Bjorklund: the same output, and no recursion to port five
 * times. `rotation` turns the pattern without changing which steps fire relative to each other.
 */
function euclidImpl(steps, pulses, rotation) {
  const n = Math.max(1, Math.min(64, Math.round(num(steps, 1))));
  const k = Math.max(0, Math.min(n, Math.round(num(pulses, 0))));
  if (k <= 0) return new Array(n).fill(false);
  if (k >= n) return new Array(n).fill(true);
  const out = new Array(n).fill(false);
  let bucket = 0;
  for (let i = 0; i < n; i += 1) {
    bucket += k;
    if (bucket >= n) { bucket -= n; out[i] = true; }
  }
  const rot = ((Math.round(num(rotation, 0)) % n) + n) % n;
  return out.slice(rot).concat(out.slice(0, rot));
}

function unshapeImpl(y, curve, tension) {
  const v = normImpl(y, 0, 1);
  // The same k as shape(), including the 1.6 default — an inverse computed against a different
  // exponent would be an inverse of nothing.
  const k = 1 + Math.max(0, num(tension, 0) || 1.6);
  switch (String(curve)) {
    case 'exp': return v ** (1 / k);
    case 'log': return 1 - (1 - v) ** (1 / k);
    // The closed-form inverse of smoothstep. Solving the cubic numerically would be slower and
    // would not agree to the last bit across five runtimes.
    case 'scurve': case 's': return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
    case 'hold': return v >= 1 ? 1 : 0;
    default: return v;
  }
}

const helpers = {
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  round: (v) => Math.round(v),
  scale: (v, inLo, inHi, outLo, outHi) => (inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)),
  snap: (v, step) => (step === 0 ? v : Math.round(v / step) * step),
  lerp: (a, b, t) => a + (b - a) * t,
  // A shape the list does not have used to return v in silence, which reads as a curve that does
  // nothing rather than as a name that was never applied.
  curve: (v, shape) => {
    if (shape === 'exp') return v * v;
    if (shape === 'log') return Math.sqrt(Math.max(0, v));
    if (shape === 's') return v * v * (3 - 2 * v);
    if (shape !== undefined && shape !== null && shape !== '' && shape !== 'linear') {
      addScriptTrace('log', '',
        `curve(v, ${JSON.stringify(String(shape))}): unknown shape — using linear. `
        + 'The names are "linear", "exp", "log" and "s"; for any other shape use map(v, points).');
    }
    return v;
  },
  wrap: (v, lo, hi) => wrapImpl(v, lo, hi),
  mapCurve: (v, points) => mapCurveImpl(v, points),
  // The transforms the Properties panel itself applies, matched exactly rather than approximated.
  shapeCurve: (v, curve, tension) => shapeImpl(v, curve, tension),
  deadzone: (v, amount, invert) => deadzoneImpl(v, amount, invert),
  weightsFor: (points, x, y, power) => weightsImpl(points, x, y, power),
  blendBy: (values, weights) => blendByImpl(values, weights),
  tickStops: (major, minor) => ticksImpl(major, minor),
  dbPosition: (fraction, floorDb, ceilDb) => dbPositionImpl(fraction, floorDb, ceilDb),
  // taming what arrives on the wire
  smooth: (current, target, coefficient, epsilon) => smoothImpl(current, target, coefficient, epsilon),
  hysteresis: (value, on, low, high) => hysteresisImpl(value, on, low, high),
  median: (values) => medianImpl(values),
  unshape: (y, curve, tension) => unshapeImpl(y, curve, tension),
  euclid: (steps, pulses, rotation) => euclidImpl(steps, pulses, rotation),
  // Colour arithmetic. Here rather than in ce.draw because it is PURE and cross-runtime: setting a
  // control's colour from a value works with the panel shut, and the exported plugin does it.
  //
  // §36's sweep swept utils/*Layout.js and declared ce.math complete. colorMath.js and
  // colorHelpers.js do not match that glob — the sweep had a blind spot exactly the shape of its
  // own search pattern, which is the failure mode of any sweep and worth writing down.
  lighten: (hex, amount) => colourLighten(hex, amount),
  darken: (hex, amount) => colourDarken(hex, amount),
  mixColour: (a, b, t) => colourMix(a, b, t),
  colourAlpha: (hex, a) => colourWithAlpha(hex, a),
  hexToRgb: (hex) => colourToRgb(hex),
  rgbToHex: (r, g, b) => colourFromRgb(r, g, b),
  hexToHsl: (hex) => colourToHsl(hex),
  hslToHex: (h, sat, l) => colourFromHsl(h, sat, l),
  quantizeTo: (v, values) => quantizeToImpl(v, values),
  // range and normalisation
  norm: (v, lo, hi) => normImpl(v, lo, hi),
  denorm: (t, lo, hi) => denormImpl(t, lo, hi),
  bipolar: (t) => bipolarImpl(t),
  unipolar: (v) => unipolarImpl(v),
  fold: (v, lo, hi) => foldImpl(v, lo, hi),
  indexOfRange: (t, count) => indexImpl(t, count),
  // shaping
  crossfade: (a, b, t, law) => crossfadeImpl(a, b, t, law),
  approach: (current, target, maxStep) => approachImpl(current, target, maxStep),
  // rounding and comparison
  roundTo: (v, decimals) => roundToImpl(v, decimals),
  almost: (a, b, epsilon) => almostImpl(a, b, epsilon),
  // lists
  minOf: (values) => minOfImpl(values),
  maxOf: (values) => maxOfImpl(values),
  sumOf: (values) => sumImpl(values),
  meanOf: (values) => meanImpl(values),
  blend: (a, b, t) => blendImpl(a, b, t),
  // randomness — every one draws a FIXED number of times, so a seed replays whatever was used
  // geometry
  toDegrees: (radians) => degImpl(radians),
  toRadians: (degrees) => radImpl(degrees),
  distance: (x1, y1, x2, y2) => distanceImpl(x1, y1, x2, y2),
  angleOf: (x1, y1, x2, y2) => angleOfImpl(x1, y1, x2, y2),
  polar: (angle, radius) => polarImpl(angle, radius),
  dbToGain: (db) => (Number.isFinite(Number(db)) ? 10 ** (Number(db) / 20) : 0),
  gainToDb: (gain) => {
    const g = Number(gain);
    if (!Number.isFinite(g) || g <= 0) return MIN_DB;
    const db = 20 * Math.log10(g);
    return db < MIN_DB ? MIN_DB : db;
  },
  // @module ce.music
  // Two spellings, chosen by whether the second argument is there at all. Omitted, you get this
  // module's own plain-ASCII names (C#4) — what every script written so far compares against, and
  // what noteNumber has always round-tripped. Given, you get the PANEL's names (C♯4 / E♭4): the
  // same table the Chord Pad, the Harmoniser and the Arpeggiator print from, so a script can label
  // a control with the spelling the component beside it is using.
  noteName: (n, flats) => {
    n = Math.floor(n);
    const table = flats === undefined || flats === null ? NOTE_NAMES : (flats ? NOTE_FLAT : NOTE_SHARP);
    return table[musicMod12(n)] + (Math.floor(n / 12) - 1);
  },
  // Reads all four spellings: C4, C#4, C♯4, Db4, D♭4. An unreadable name is NIL, not 0 — 0 is a
  // perfectly good MIDI note (C-1), so returning it for "Eb4" meant a typo played a wrong note in
  // silence rather than showing up.
  noteNumber: (name) => {
    const m = /^([A-G])([#b]?)(-?\d+)$/.exec(musicAscii(name));
    if (!m) return undefined;
    const pc = m[2] === 'b' ? FLAT_LETTER[m[1]] : NOTE_NAMES.indexOf(m[1] + m[2]);
    if (pc < 0) return undefined;
    // A flat lowers below the letter, so Cb3 is the B under C3 — one octave down, not up.
    const oct = parseInt(m[3], 10) + (m[2] === 'b' && m[1] === 'C' ? 0 : 1);
    return oct * 12 + pc;
  },
  // Does this key write its accidentals as flats? The Chord Pad's rule, exactly: judged by the
  // RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯. Pass the answer straight to
  // noteName and a script's labels match the panel's without deciding anything itself.
  noteSpelling: (root, scale) => {
    const steps = musicSteps(SCALES, scale);
    if (!steps) return undefined;
    const name = scale == null ? 'major' : String(scale);
    const pc = musicMod12(musicPitch(root));
    return FLAT_KEY_PCS.includes(MINOR_SCALE_NAMES.includes(name) ? musicMod12(pc + 3) : pc);
  },
  inScale: (note, root, scale) => {
    const steps = musicSteps(SCALES, scale);
    if (!steps) return undefined;
    const base = musicMod12(musicPitch(root));
    return steps.some((x) => musicMod12(base + x) === musicMod12(musicPitch(note)));
  },
  // Which degree of the key a note is — 1 for the tonic, 5 for the dominant. A note OUTSIDE the key
  // has NO degree and gets nil rather than the nearest one: rounding here is what turns a wrong
  // note into a plausible chord, and quantizeNote is the verb that rounds on purpose.
  scaleDegree: (note, root, scale) => {
    const steps = musicSteps(SCALES, scale);
    if (!steps) return undefined;
    const base = musicMod12(musicPitch(root));
    const pc = musicMod12(musicPitch(note));
    const i = steps.findIndex((x) => musicMod12(base + x) === pc);
    return i < 0 ? undefined : i + 1;
  },
  // The chord the key builds on a degree — the Chord Pad's own answer, named and numbered. Degrees
  // are 1-based, like scaleDegree's, so degreeChord(60, 'major', 5) is the V. `size` is how many
  // thirds to stack: 3 a triad, 4 a seventh. Past the top of the scale it keeps going an octave up.
  degreeChord: (root, scale, degree, size) => {
    const steps = musicSteps(SCALES, scale);
    if (!steps || !steps.length) return undefined;
    const name = scale == null ? 'major' : String(scale);
    const d = musicCount(degree, 1) - 1;
    const offsets = musicStack(steps, d, size);
    const base = musicPitch(root);
    const quality = helpers.chordQuality(offsets);
    const flats = helpers.noteSpelling(root, name);
    const spell = (n) => (flats ? NOTE_FLAT : NOTE_SHARP)[musicMod12(n)];
    return {
      degree: d + 1,
      rootNote: base + offsets[0],
      quality,
      name: spell(base + offsets[0]) + (QUALITY_SUFFIX[quality] ?? ''),
      roman: musicRoman(offsets[0], quality),
      offsets,
      notes: offsets.map((o) => base + o),
      names: offsets.map((o) => spell(base + o)),
    };
  },
  // Name a chord from the notes in it: [60,63,70] -> "min7". Reads intervals above the LOWEST
  // given note, so it takes a chord from chordNotes, from degreeChord or from whatever a script
  // built by hand. The vocabulary is the panel's, so a chord this names and a chord the Chord Pad
  // labels agree.
  chordQuality: (notes) => {
    const list = musicSorted(notes);
    if (!list.length) return undefined;
    const iv = list.map((x) => musicMod12(x - list[0]));
    const has = (a) => iv.includes(a);
    const third = has(3) ? 'min' : has(4) ? 'maj' : has(2) ? 'sus2' : has(5) ? 'sus4' : '';
    const fifth = has(7) ? 'p5' : has(6) ? 'd5' : has(8) ? 'a5' : '';
    const seventh = has(10) ? 'm7' : has(11) ? 'M7' : (has(9) && fifth === 'd5') ? 'd7' : '';
    if (third === 'min' && fifth === 'd5') return seventh === 'm7' ? 'm7b5' : seventh === 'd7' ? 'dim7' : 'dim';
    if (third === 'maj' && fifth === 'a5') return 'aug';
    if (third === 'min') return seventh === 'm7' ? 'min7' : seventh === 'M7' ? 'minMaj7' : 'min';
    if (third === 'maj') return seventh === 'm7' ? 'dom7' : seventh === 'M7' ? 'maj7' : 'maj';
    if (third === 'sus2') return 'sus2';
    if (third === 'sus4') return 'sus4';
    return 'maj';
  },
  // Re-voice a chord so it moves as little as possible from the one before it — the Harmoniser's
  // voice leading, available to any script that sends chords. 'closest' minimises the total
  // movement of all voices; 'smooth' minimises the TOP voice only, which holds a melody still and
  // lets the inner voices jump; 'off' returns the chord in root position. With no previous chord
  // there is nothing to lead from, so the chord comes back untouched.
  voiceLead: (notes, previous, mode) => {
    const chord = musicSorted(notes);
    const prev = musicSorted(previous);
    const how = mode == null ? 'closest' : String(mode);
    if (!chord.length || !prev.length || how === 'off') return chord;
    let best = chord;
    let bestScore = Infinity;
    for (const cand of musicInversions(chord)) {
      if (cand.some((n) => n < 0 || n > 127)) continue;
      const score = how === 'smooth'
        ? Math.abs(cand[cand.length - 1] - prev[prev.length - 1])
        : musicMotion(cand, prev);
      // Strictly less, so a tie keeps the earlier (lower) candidate and the same input always
      // gives the same answer in every runtime.
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    return best;
  },
  // The same note set spread up over `octaves` octaves, the Arpeggiator's own expansion. Sorted
  // ascending and clamped into MIDI range; anything that would land above 127 is DROPPED rather
  // than clamped, because clamping stacks strays on one pitch and that sounds like a stuck key.
  expandOctaves: (notes, octaves) => {
    const base = musicSorted(notes).map((n) => Math.min(127, Math.max(0, Math.floor(n))));
    const oc = Math.min(4, Math.max(1, musicCount(octaves, 1)));
    const out = [];
    for (let o = 0; o < oc; o += 1) for (const n of base) { const v = n + o * 12; if (v <= 127) out.push(v); }
    return out;
  },
  // The walk an arpeggiator pattern describes, as a list of STEPS — each step a list of notes, so
  // 'chord' (one step, everything at once) has the same shape as the rest. The notes are taken in
  // the order given, which is what makes 'asPlayed' mean anything; sort or expandOctaves first if
  // you want a rising walk. 'updown' and 'downup' do not repeat the endpoints.
  //
  // 'random' returns the input order, exactly as the panel's own arpeggiator does — it draws its
  // step at play time rather than shuffling the walk. A script that wants a shuffled WALK has
  // ce.math.shuffle, which is seeded and therefore repeatable.
  arpOrder: (notes, pattern) => {
    const asc = (Array.isArray(notes) ? notes : []).slice();
    if (!asc.length) return [];
    switch (String(pattern)) {
      case 'down': return asc.slice().reverse().map((n) => [n]);
      case 'updown': return [...asc, ...asc.slice(1, -1).reverse()].map((n) => [n]);
      case 'downup': {
        const desc = asc.slice().reverse();
        return [...desc, ...desc.slice(1, -1).reverse()].map((n) => [n]);
      }
      case 'chord': return [asc.slice()];
      default: return asc.map((n) => [n]);
    }
  },
  // Scales, chords and snap-to-key. Same tables the C++ preludes are generated from, so a script
  // that quantises to dorian gets the same note whether the window is open or shut. An unknown
  // name returns undefined rather than guessing "major" — asking for something this build does not
  // know should be findable, not silently corrected.
  scaleNotes: (root, scale) => musicNotes(SCALES, root, scale),
  chordNotes: (root, type) => musicNotes(CHORDS, root, type),
  quantizeNote: (note, root, scale) => {
    const steps = musicSteps(SCALES, scale);
    if (!steps) return undefined;
    const n = musicPitch(note), base = musicPitch(root);
    const inKey = new Set(steps.map((x) => (((base + x) % 12) + 12) % 12));
    // Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested
    // before the -d one, so a note exactly between two scale tones lands on the same one in every
    // runtime. Without a stated rule the five engines would each pick their own.
    for (let d = 0; d <= 6; d += 1) {
      if (inKey.has((((n + d) % 12) + 12) % 12)) return n + d;
      if (inKey.has((((n - d) % 12) + 12) % 12)) return n - d;
    }
    return n;
  },

// @module ce.time
  // The clock. See NOW_EPOCH: monotonic, arbitrary origin, differences only.
  nowMs: () => nowMsRead(),
  // The panel's division vocabulary, in both directions. Every sequencer property in the app is
  // one of these strings, and a script could set one and never convert it.
  beatsPerDivision: (name) => timeDivision(name),
  divisionNames: () => DIVISION_NAMES.map((id) => ({ id, label: DIVISION_LABELS[id], beats: DIVISIONS[id] })),
  // Where a beat position falls, musically — for ANY position, not only the one the transport is
  // at. `text` is the Transport's own readout ("3.2.00"), so a script's label and the component's
  // agree character for character. Ticks are 24 PPQN, the MIDI clock resolution.
  barBeatAt: (beats, beatsPerBar) => {
    const signature = { beats: beatsPerBar == null ? 4 : beatsPerBar, unit: 4 };
    return { ...panelBarBeat(beats, signature), text: panelFormatBarBeat(beats, signature) };
  },
  // Which step of the grid a position is on, counting from 0 at the transport origin.
  stepAt: (beats, division) => (timeDivision(division) === undefined
    ? undefined
    : panelStepAtBeat(beats, division)),
  // The step boundaries crossed between two readings — the never-lose-an-event rule every synced
  // follower in the panel runs on. A stalled frame must FIRE the steps it slept through rather than
  // drop them: that is the difference between a stutter and a hole in the bar. `max` caps the
  // catch-up (default 16) and what was dropped is REPORTED rather than swallowed, so a script can
  // say it happened. On an overrun the most RECENT steps are kept — catching up to now matters
  // more than replaying where you were.
  stepsBetween: (fromBeats, toBeats, division, max) => (timeDivision(division) === undefined
    ? undefined
    : panelCrossedSteps(fromBeats, toBeats, division, max == null ? 16 : max)),
  // The panel's shuffle: every odd step pushed later by up to half a step. In BEATS, to add to a
  // step's position. Two sequencers at "the same" swing really are the same swing only if they
  // compute it the same way, which is why this is the transport's function and not a second one.
  swingOffset: (step, amount, division) => (timeDivision(division) === undefined
    ? undefined
    : panelSwungBeatOffset(step, amount, division)),
  // For anything whose rate is a LOOP LENGTH in bars rather than a step — a take, a slow sweep.
  // Derived from the position, never accumulated, so a cycle running for an hour is still exactly
  // on the bar line. `length` is the cycle in beats; `count` is how many have completed.
  cycleAt: (beats, bars, beatsPerBar) => {
    const perBar = beatsPerBar == null ? 4 : beatsPerBar;
    return {
      phase: panelCyclePhaseAt(beats, bars, perBar),
      count: panelCycleCountAt(beats, bars, perBar),
      length: panelCycleBeats(bars, perBar),
    };
  },
  // Fold a timeline position into a loop. Before the loop start the position is untouched — you can
  // run IN to a loop from earlier in the song, which is what every DAW does and what a count-in
  // needs. `pass` is which time round you are, and -1 before the loop has been reached; a script
  // watching it for CHANGES knows a wrap happened without a wrap handler that can miss one.
  loopedBeats: (beats, startBeats, lengthBeats) => ({
    beats: panelLoopedBeats(beats, startBeats, lengthBeats),
    pass: panelLoopCycleIndex(beats, startBeats, lengthBeats),
  }),
  // Tempo from tap times, in the milliseconds nowMs() reports. Taps more than `resetMs` apart start
  // a NEW measurement rather than averaging across the pause — otherwise the first tap after a
  // break poisons it, which is what every hand-rolled tap tempo gets wrong. Nothing comes back from
  // fewer than two usable taps.
  tapTempo: (times, resetMs) => panelTapTempo(times, resetMs == null ? 2000 : resetMs) ?? undefined,
  // Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note). The MEDIAN, not
  // the mean: one late pulse from a USB hiccup drags an average around, and a wobbling BPM readout
  // is worse than a slightly stale one.
  clockTempo: (intervalsMs) => panelClockTempo(intervalsMs) ?? undefined,

// @module ce.midi
  // MIDI data encoding — the escape hatch for hand-built SysEx, for the parameters the DPD
  // doesn't model. Ported byte-for-byte from the Lua/JS/Python preludes in CE/src/Scripting so a
  // script packs a value identically whether it runs here or in the shipped plugin.
  to14bit: (v) => { v = Math.floor(v); return { msb: Math.floor(v / 128) % 128, lsb: v % 128 }; },
  from14bit: (msb, lsb) => msb * 128 + lsb,
  to7bit: (v, count = 2, order = 'msb') => {
    v = Math.floor(v);
    const out = [];
    for (let i = 0; i < count; i++) { out.push(v % 128); v = Math.floor(v / 128); }
    return order === 'msb' ? out.reverse() : out;
  },
  from7bit: (bytes, order = 'msb') => {
    const b = order === 'msb' ? bytes : [...bytes].reverse();
    let v = 0;
    for (const x of b) v = v * 128 + x;
    return v;
  },
  toNibbles: (b) => { b = Math.floor(b); return { hi: Math.floor(b / 16) % 16, lo: b % 16 }; },
  fromNibbles: (hi, lo) => hi * 16 + lo,
  nibblize: (bytes) => {
    const o = [];
    for (const x of bytes) { const n = { hi: Math.floor(x / 16) % 16, lo: x % 16 }; o.push(n.hi, n.lo); }
    return o;
  },
  denibblize: (bytes) => {
    const o = [];
    for (let i = 0; i < bytes.length; i += 2) o.push(bytes[i] * 16 + (bytes[i + 1] ?? 0));
    return o;
  },
  toAscii: (str, length) => {
    const o = [];
    for (let i = 0; i < String(str).length; i++) o.push(String(str).charCodeAt(i));
    if (length) while (o.length < length) o.push(32);
    return o;
  },
  fromAscii: (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; },
  toOffset: (v, center) => v + center,
  fromOffset: (b, center) => b - center,
  toSigned: (v, bits) => { const m = 2 ** bits; return v < 0 ? v + m : v; },
  fromSigned: (b, bits) => { const m = 2 ** bits; return b >= m / 2 ? b - m : b; },
};
// The spelling this runtime shipped with before the contract was enforced. panelApi.js declares
// it as an alias of to14bit, so panels written against it keep working.
helpers.to14Bit = helpers.to14bit;

// @module ce.midi
/* ------------------------------------------------------------------- MIDI out (real) */
// Scripts emit MIDI through the same device bridge the player/DPD use: raw bytes go via
// triggerRawMidiAction (needs a hardware output selected on the 'mainSynth' role). With no JUCE
// host (e.g. a plain browser tab) the call is a no-op and we trace what *would* have gone out.
// Origin/transmit gating for shipped panels is owned by the C++ runtime (Model 2).

const DEFAULT_ROLE = DEFAULT_DEVICE_ROLE;

function midiInt(v, lo, hi) { v = Math.round(Number(v) || 0); return v < lo ? lo : v > hi ? hi : v; }
function toByteArray(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') return Object.values(input); // wasmoon Lua table → object
  if (typeof input === 'string') return input.trim().split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16));
  return [];
}
function toHexMessage(bytes) {
  return bytes.map((v) => (midiInt(v, 0, 255) & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
// checksum(kind, bytes). "roland"/"yamaha" are the same two's-complement 7-bit sum — Roland
// documents it as (128 - sum) & 0x7F and Yamaha as (0 - sum) & 0x7F, which are the same number —
// so both spellings are accepted rather than pretending to tell them apart. "sum" is the plain
// 7-bit sum and "xor" the running XOR, for the devices that use those instead.
//
// The one-argument form checksum(bytes) defaults to roland: that is what this runtime accepted
// when it ignored the type argument entirely, so panels written against it keep working.
/**
 * One checksum, from the shared table (design doc §48).
 *
 * This used to hold its own three-branch implementation and fall through to Roland for anything it
 * did not recognise — so checksum("crc16", bytes) came back as a plausible Roland checksum and a
 * typo was indistinguishable from a working call. Every other vocabulary in this API returns nothing
 * for a name it does not know; this one now does too, and says what it would have accepted.
 *
 * The table is shared with the device profile engine, which understood a DIFFERENT two algorithms
 * under different names. Two implementations of the same arithmetic is how they drifted apart.
 */
function checksumOf(kind, bytes, opts) {
  // Sanitised before the table sees them, so an out-of-range value clamps the way every other
  // byte-taking verb in ce.midi clamps rather than wrapping.
  const clean = bytes.map((v) => midiInt(v, 0, 255) & 0xff);
  const value = computeChecksum(kind, clean, opts);
  if (value === undefined) {
    addScriptTrace('error', '',
      `ce.midi.checksum("${kind}"): no such algorithm. One of: ${checksumNames().join(', ')}.`);
    return undefined;
  }
  return value;
}

// routeMidi(role, fn) — the destination for sends made inside the block. A block rather than a
// per-call argument, the same shape noTransmit() uses: it keeps thirteen signatures unchanged and
// reads as what it is, a decision that applies to a run of sends rather than to one of them.
let routedRole = null;

function sendRawMidi(bytes, actionId) {
  const message = toHexMessage(bytes);
  const role = routedRole ?? DEFAULT_ROLE;
  if (isJuceAvailable()) {
    // The outbound filters run inside triggerRawMidiAction, not here — a control's own binding
    // sends through that door too, and interceptOut has to see those as well.
    triggerRawMidiAction({ deviceRole: role, actionId, message, dryRun: false });
    addScriptTrace('midi', '', `→ ${actionId}: ${message}${role === DEFAULT_ROLE ? '' : `  [${role}]`}`);
  } else {
    addScriptTrace('midi', '', `→ ${actionId}: ${message}  (no JUCE host — not sent)`);
  }
}

// MIDI channel messages — arithmetic over one raw-byte send, the way panic() is over sendCC, which
// is what makes them identical in every runtime and every exported language. `note` accepts a MIDI
// number or a name ("C3"), because a script that reads musically should be allowed to say so.
const midiCh = (c) => midiInt(c, 1, 16) - 1;
// noteNumber returns nil for a name it cannot read; sendNote still has to put a BYTE on the wire,
// so an unreadable name becomes 0 here rather than an undefined slipping into a MIDI message.
const midiNote = (n) => (typeof n === 'string' ? (helpers.noteNumber(n) ?? 0) : midiInt(n, 0, 127));

/* --- the wire filters: interceptIn / interceptOut / feed --------------------------------------
 * ce.core.intercept filters a MODEL PATH. These filter the WIRE, and they are a different thing:
 * inbound reaches the panel's bindings, the note input and the transport long before any script
 * sees it, and outbound leaves from a control's own binding as often as from a sendCC. So they are
 * installed at the app's two choke points via midiFilters.js rather than applied here — see the
 * note in that module for why the seam exists at all.
 *
 * Filters are per script and replace that script's previous one, the same rule the ce.core rules
 * follow. Order across scripts is registration order, and each sees what the last one produced. */
const midiIn = [];    // { scriptId, fn }
const midiOut = [];   // { scriptId, fn }

function putMidiFilter(list, scriptId, fn) {
  if (typeof fn !== 'function') return;
  const at = list.findIndex((f) => f.scriptId === scriptId);
  if (at >= 0) list[at] = { scriptId, fn }; else list.push({ scriptId, fn });
  installMidiFilters();
}

function clearMidiFiltersFor(scriptId) {
  for (const list of [midiIn, midiOut]) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].scriptId === scriptId) list.splice(i, 1);
  }
  installMidiFilters();
}

/** Run a chain over a message payload. Returns the payload, or null if a filter swallowed it. */
function runMidiChain(list, payload, label) {
  let bytes = hexToBytes(payload?.hex);
  for (const f of list) {
    let out;
    try { out = f.fn(bytes.slice()); } catch (e) { reportScriptError(f.scriptId, e); continue; }
    if (out === false) {
      addScriptTrace('midi', f.scriptId, `${label}: swallowed ${toHexMessage(bytes)}`);
      return null;
    }
    if (out === undefined || out === null) continue;    // no opinion — pass it on unchanged
    const next = toByteArray(out).map((v) => midiInt(v, 0, 255) & 0xff);
    if (!next.length) continue;                          // an empty array is not a decision
    bytes = next;
  }
  return { ...payload, hex: toHexMessage(bytes) };
}

/** Put the current chains behind the app's two choke points, or take them away when empty. */
function installMidiFilters() {
  setInboundMidiFilter(midiIn.length ? (p) => runMidiChain(midiIn, p, 'in') : null);
  setOutboundMidiFilter(midiOut.length ? (p) => runMidiChain(midiOut, p, 'out') : null);
}

const midiApi = {
  sendMidi: (bytes) => {
    const b = toByteArray(bytes).map((v) => midiInt(v, 0, 255) & 0xff);
    if (!b.length) { addScriptTrace('error', '', 'sendMidi: no bytes given'); return; }
    sendRawMidi(b, 'raw');
  },
  sendNote: (ch, note, velocity, ms) => {
    const n = midiNote(note);
    sendRawMidi([0x90 | midiCh(ch), n, midiInt(velocity, 0, 127)], `note_${n}`);
    // A duration schedules the note off. Not doing this was making every script that plays a note
    // hand-roll a timer, and getting it wrong meant a hung voice — the one MIDI mistake you hear
    // rather than read. The role is captured now, so a note started inside routeMidi() ends where
    // it began even though the block has long since closed.
    if (ms === undefined || ms === null) return;
    const delay = Number(ms);
    if (!Number.isFinite(delay) || delay <= 0) return;
    const role = routedRole;
    scheduleOneShot(delay, () => {
      const previous = routedRole;
      routedRole = role;
      try { sendRawMidi([0x80 | midiCh(ch), n, 0], `noteoff_${n}`); }
      finally { routedRole = previous; }
    });
  },
  sendNoteOff: (ch, note, velocity) =>
    sendRawMidi([0x80 | midiCh(ch), midiNote(note), midiInt(velocity ?? 0, 0, 127)], `noteoff_${midiNote(note)}`),
  sendProgramChange: (ch, program, bankMsb, bankLsb) => {
    // Bank select first: a device applies the bank that was in force when the program change lands.
    const s = 0xB0 | midiCh(ch);
    if (bankMsb !== undefined && bankMsb !== null) sendRawMidi([s, 0, midiInt(bankMsb, 0, 127)], 'cc_0');
    if (bankLsb !== undefined && bankLsb !== null) sendRawMidi([s, 32, midiInt(bankLsb, 0, 127)], 'cc_32');
    sendRawMidi([0xC0 | midiCh(ch), midiInt(program, 0, 127)], `pc_${midiInt(program, 0, 127)}`);
  },
  sendPitchBend: (ch, value) => {
    const v = midiInt(value ?? 8192, 0, 16383);
    sendRawMidi([0xE0 | midiCh(ch), v % 128, Math.floor(v / 128) % 128], 'bend');
  },
  sendAftertouch: (ch, pressure, note) => (note === undefined || note === null
    ? sendRawMidi([0xD0 | midiCh(ch), midiInt(pressure, 0, 127)], 'aftertouch')
    : sendRawMidi([0xA0 | midiCh(ch), midiNote(note), midiInt(pressure, 0, 127)], 'polyaftertouch')),
  // feed(bytes) — inject as if the hardware had sent it, so the panel's OWN bindings, note input
  // and transport all act on it. set() moves a control directly and bypasses every binding, which
  // is a different thing: this is how a script-built arpeggiator drives the panel rather than
  // fighting it. Inbound filters run on it, so a fed message obeys the same rules as a real one —
  // a velocity curve that applies to the keyboard has to apply to the sequencer too.
  feedMidi: (bytes) => {
    const b = toByteArray(bytes).map((v) => midiInt(v, 0, 255) & 0xff);
    if (!b.length) { addScriptTrace('error', '', 'feedMidi: no bytes given'); return; }
    const status = b[0] ?? 0;
    const kind = (status & 0xf0) === 0xb0 ? 'cc' : (status & 0xf0) === 0x90 || (status & 0xf0) === 0x80 ? 'note' : 'raw';
    const payload = filterInboundMidi({ hex: toHexMessage(b), messageType: kind, fed: true });
    if (!payload) return;                       // a filter swallowed what we fed it
    addScriptTrace('midi', '', `← fed ${payload.hex}`);
    latestMidiInputMessage.set(payload);
  },
  interceptMidiIn: null,      // bound per script in the api factory — it needs the caller's id
  interceptMidiOut: null,
  routeMidi: null,
  sendClock: () => sendRawMidi([0xF8], 'clock'),
  sendTransport: (action) => {
    const a = String(action ?? 'start').toLowerCase();
    sendRawMidi([a === 'stop' ? 0xFC : a === 'continue' ? 0xFB : 0xFA], `transport_${a}`);
  },

  sendCC: (ch, cc, v) =>
    sendRawMidi([0xB0 | (midiInt(ch, 1, 16) - 1), midiInt(cc, 0, 127), midiInt(v, 0, 127)], `cc_${midiInt(cc, 0, 127)}`),
  // RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range,
  // fine tuning and coarse tuning, which is what a panel sets once at load.
  sendRPN: (ch, msb, lsb, v) => {
    const s = 0xB0 | (midiInt(ch, 1, 16) - 1);
    const val = midiInt(v, 0, 16383);
    sendRawMidi([s, 0x65, midiInt(msb, 0, 127), s, 0x64, midiInt(lsb, 0, 127),
      s, 0x06, (val >> 7) & 0x7f, s, 0x26, val & 0x7f], `rpn_${midiInt(msb, 0, 127)}_${midiInt(lsb, 0, 127)}`);
  },
  // Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
  sendSongPosition: (beats) => {
    const b = midiInt(beats, 0, 16383);
    sendRawMidi([0xF2, b & 0x7f, (b >> 7) & 0x7f], 'songPosition');
  },
  sendNRPN: (ch, msb, lsb, v) => {
    const s = 0xB0 | (midiInt(ch, 1, 16) - 1);
    const val = midiInt(v, 0, 16383);
    sendRawMidi([s, 0x63, midiInt(msb, 0, 127), s, 0x62, midiInt(lsb, 0, 127),
      s, 0x06, (val >> 7) & 0x7f, s, 0x26, val & 0x7f], `nrpn_${midiInt(msb, 0, 127)}_${midiInt(lsb, 0, 127)}`);
  },
  sendSysex: (bytes) => {
    let b = toByteArray(bytes).map((v) => midiInt(v, 0, 255) & 0xff);
    if (b.length === 0) { addScriptTrace('error', '', 'sendSysex: no bytes given'); return; }
    if (b[0] !== 0xF0) b = [0xF0, ...b];
    if (b[b.length - 1] !== 0xF7) b = [...b, 0xF7];
    sendRawMidi(b, 'sysex');
  },
  // Read the synth: routes through the app's device-sync path (resolves the profile on the role).
  // The parameter is `kind`, the name the contract and every other runtime use for it.
  // requestDump is bound in buildApi, not here: its optional callback belongs to a script, and a
  // throw inside it has to be reported against that script. Same reason the wire filters are.
  checksum: (type, bytes, opts) =>
    (bytes === undefined || bytes === null
      ? checksumOf('roland', toByteArray(type))     // one-arg form: checksum(bytes)
      : checksumOf(type, toByteArray(bytes), opts)),

  // panic([opts]) — All Sound Off (120) FIRST, then All Notes Off (123), then Reset All
  // Controllers (121). The order matters: 120 cuts a note that is already ringing, 123 only stops
  // one the device still thinks is held. Expands to plain CC sends, which is why it is portable
  // to every runtime and every exported language rather than needing a host primitive.
  panic: (opts) => {
    const o = opts ?? {};
    const reset = o.resetControllers !== false;
    const channels = o.channel === undefined || o.channel === null
      ? Array.from({ length: 16 }, (_, i) => i + 1)
      : [midiInt(o.channel, 1, 16)];
    for (const ch of channels) {
      const s = 0xB0 | (ch - 1);
      sendRawMidi([s, 120, 0], 'cc_120');
      sendRawMidi([s, 123, 0], 'cc_123');
      if (reset) sendRawMidi([s, 121, 0], 'cc_121');
    }
  },

  // Bulk dump ↔ panel.
  // applyDump fills the panel from a dump: pass a DECODED { parameterId: value } map and it lands
  // on the bound controls right away (no host needed); pass raw bytes and the device host (C++ DPD
  // codec) decodes them, then onDumpMessageParsed fills the panel + fires onDumpReceived.
  // applyDump(bytes) — the contract's signature. It also accepts an already-decoded
  // { parameter: value } map, which is how a panel fills with no device host attached; that is
  // documented on the member rather than left as a surprise. There is no role parameter: every
  // runtime addresses the main synth, and an undocumented extra argument here is exactly the kind
  // of divergence that put the five runtimes out of step in the first place.
  applyDump: (bytes) => {
    const data = bytes;
    const role = DEFAULT_ROLE;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const n = syncDeviceRuntimeStateToPanelPreview({ [role]: data });
      addScriptTrace('midi', '', `applyDump: filled ${n} control(s) from ${Object.keys(data).length} value(s)`);
      return n;
    }
    if (isJuceAvailable()) {
      parseDumpMessage({ deviceRole: role, message: toHexMessage(toByteArray(data)) });
      addScriptTrace('midi', '', 'applyDump: decoding bulk dump via the device host…');
    } else {
      addScriptTrace('midi', '', 'applyDump(bytes): decoding raw dumps needs the device host — pass a decoded { parameter: value } map to fill now');
    }
    return 0;
  },
  // sendDump builds the dump from the device profile and sends it (host-side bulk send).
  sendDump: (kind) => {
    const role = DEFAULT_ROLE;
    if (isJuceAvailable()) {
      startBulkDumpSend({ deviceRole: role, expectedDumpId: String(kind ?? ''), dryRun: false });
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) → bulk send requested`);
    } else {
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) — no device host`);
    }
  },
  // buildDump (panel → bytes) is encoded by the device profile's codec, which lives in the device
  // host. This runtime cannot produce the bytes, so it reports at ERROR level and returns null —
  // it used to report at 'midi' level, which reads as ordinary chatter, so a script that built a
  // dump here got a quiet null and no indication that anything was wrong. Declared
  // requiresDeviceHost in panelApi.js so the docs and the picker say it too.
  buildDump: (kind) => {
    addScriptTrace('error', '',
      `buildDump(${JSON.stringify(kind ?? '')}) needs the device host — panel→bytes encoding is the device profile's codec, `
      + 'which runs in the host, not the panel view. It returns bytes in the exported plugin; use sendDump to transmit from here.');
    return null;
  },
};

/** One printer for log/warn/error, so the three cannot format differently. */
function scriptPrint(kind, scriptId, message, value) {
  addScriptTrace(kind, scriptId ?? '',
    value !== undefined ? `${message} ${JSON.stringify(value)}` : String(message));
}

/* ------------------------------------------------------------------ API + executor */

// --- Zone Splitter -----------------------------------------------------------
// `set()` can already reach SplitZone.zones, but nobody is going to hand-write a
// zone array in a script. This reads the current zones, hands them to the same
// pure reducer the editor's own buttons use, and writes the result back — so a
// footswitch changing the split mid-set is one line.
// @module ce.components
/**
 * The message for a component verb pointed at the wrong control.
 *
 * It used to name only what was missing — `"cutoffslider" is not an Arpeggiator (no Arp section)`.
 * True, and no help: the person reading it already believed it WAS one, and the reply tells them
 * nothing about what they have actually got. So say what it is, and what it can do instead.
 *
 * It also separates two failures the old text ran together. A name with no control behind it and a
 * control of the wrong kind read identically before ("is not an Arpeggiator" for a typo), and they
 * want opposite fixes — one is a spelling mistake, the other is a misunderstanding.
 */
function wrongTargetMessage(path, section, label) {
  const article = /^[AEIOU]/i.test(label) ? 'an' : 'a';
  const control = findControlByName(path);
  if (!control) return `"${path}" — this panel has no control by that name.`;

  const type = typeOfControl(control);
  // No type at all is not a case the model produces, but a message is the wrong place to throw.
  if (!type) return `"${path}" is not ${article} ${label} (no ${section} section).`;

  const families = familiesForType(type);
  const instead = families.length
    ? `Its own verbs are ${families.join(', ')}.`
    : `${/^[AEIOU]/i.test(type) ? 'An' : 'A'} ${type} has no component verbs of its own — `
      + 'ce.midi, ce.draw and ce.anim all work on it.';
  return `"${path}" is ${/^[AEIOU]/i.test(type) ? 'an' : 'a'} ${type}, not ${article} ${label}. ${instead}`;
}

function splitAction(path, action, args) {
  const target = String(path ?? '');
  const zonesPath = `${target}.SplitZone.zones`;
  const current = getValue(zonesPath);
  if (!Array.isArray(current)) {
    addScriptTrace('error', '', `split: ${wrongTargetMessage(target, 'SplitZone', 'Zone Splitter')}`);
    return;
  }
  const next = applySplitScriptAction(current, action, args ?? {});
  setValue(zonesPath, next);
  addScriptTrace('log', '', `split ${target}: ${action} ${JSON.stringify(args ?? {})}`);
}
const splitApi = {
  splitPreset: (target, preset, lowNote, highNote) =>
    splitAction(target, 'preset', { preset, lowNote, highNote }),
  splitMute: (target, zone, enabled) => splitAction(target, 'mute', { zone, enabled: enabled !== false }),
  splitChannel: (target, zone, channel) => splitAction(target, 'channel', { zone, channel }),
  splitTranspose: (target, zone, semitones) => splitAction(target, 'transpose', { zone, transpose: semitones }),
  splitPoint: (target, zone, note) => splitAction(target, 'splitPoint', { zone, note }),
  splitRead: (target, field) => sectionRead(target, 'SplitZone', 'split', field),
};

// --- Phrase Sequencer --------------------------------------------------------
// Same idea, one level up: the reducer patches the whole config rather than one
// array, because a seed needs to know the grid size and a key change needs to
// leave the pattern alone. Only the changed fields are written, so an undo step
// says "direction" rather than "the sequencer".
function phraseAction(path, action, args) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.Phrase`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `phrase: ${wrongTargetMessage(target, 'Phrase', 'Phrase Sequencer')}`);
    return;
  }
  const patch = phraseScriptPatch(cfg, action, args ?? {}, () => Math.random());
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    // Not an error — an unknown seed or an out-of-grid cell is a no-op by
    // design. But silence would look like the footswitch was dead.
    addScriptTrace('log', '', `phrase ${target}: ${action} ${JSON.stringify(args ?? {})} — nothing to change`);
    return;
  }
  for (const key of keys) setValue(`${target}.Phrase.${key}`, patch[key]);
  addScriptTrace('log', '', `phrase ${target}: ${action} → ${keys.join(', ')}`);
}
const phraseApi = {
  phraseSeed: (target, seed) => phraseAction(target, 'seed', { seed }),
  phraseClear: (target) => phraseAction(target, 'clear', {}),
  phraseKey: (target, key) => phraseAction(target, 'key', { key }),
  phraseScale: (target, scale) => phraseAction(target, 'scale', { scale }),
  phraseTranspose: (target, semitones) => phraseAction(target, 'transpose', { transpose: semitones }),
  phraseDirection: (target, direction) => phraseAction(target, 'direction', { direction }),
  phraseRun: (target, running) => phraseAction(target, 'run', { running: running !== false }),
  phraseCell: (target, step, row, on) => phraseAction(target, 'cell', { step, row, on }),
  phraseRead: (target, field) => sectionRead(target, 'Phrase', 'phrase', field),
};

// --- Recorder / Harmoniser / Setlist -----------------------------------------
// All three follow the Phrase Sequencer's shape exactly: read the section, hand
// it to a pure reducer, write back only the fields that changed. One helper,
// because three near-identical copies is how they drift apart.
/**
 * Returns whether the component now holds what the call asked for.
 *
 * True covers both "written" and "already that way" — the second is what UNCHANGED marks, and the
 * distinction matters: a script writing `if not setlistEnable(s, 3, true) then warn() end` must
 * not warn because scene 3 was already enabled. False means the call was REFUSED, which for these
 * five reducers is the only other way a patch comes back empty: they build a patch from the
 * request without consulting the current value, so nothing back means nothing accepted.
 *
 * Every one of these used to return undefined for all three outcomes.
 */
function sectionAction(path, section, reducer, action, args) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.${section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${section.toLowerCase()}: ${wrongTargetMessage(target, section, section)}`);
    return false;
  }
  const result = reducer(cfg, action, args ?? {});
  const patch = patchOf(result);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    if (isUnchanged(result)) {
      addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} — already that way`);
      return true;
    }
    // Refused, and said so at error level: it reads exactly like a dead footswitch otherwise, and
    // a scene name that does not exist is a typo somebody needs to see.
    addScriptTrace('error', '',
      `${section.toLowerCase()} ${target}: ${action} ${JSON.stringify(args ?? {})} — refused, nothing changed`);
    return false;
  }
  for (const key of keys) setValue(`${target}.${section}.${key}`, patch[key]);
  addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} → ${keys.join(', ')}`);
  return true;
}
const recAction = (t, a, g) => sectionAction(t, 'Recorder', recorderScriptPatch, a, g);
const recorderApi = {
  recorderRecord: (target, on) => recAction(target, 'record', on === undefined ? {} : { on: on !== false }),
  recorderStop: (target) => recAction(target, 'stop', {}),
  recorderPlay: (target, playing) => recAction(target, 'play', playing === undefined ? {} : { playing: playing !== false }),
  recorderClear: (target) => recAction(target, 'clear', {}),
  recorderUndo: (target) => recAction(target, 'undo', {}),
  recorderQuantize: (target, grid, strength, scale, key) =>
    recAction(target, 'quantize', { grid, strength, scale, key }),
  recorderTranspose: (target, semitones) => recAction(target, 'transpose', { transpose: semitones }),
  recorderBars: (target, bars) => recAction(target, 'bars', { bars }),
  recorderSource: (target, source) => recAction(target, 'source', { source }),
  recorderNudge: (target, by) => recAction(target, 'nudge', { by }),
  recorderShift: (target, semitones) => recAction(target, 'shift', { semitones }),
  recorderStore: (target, slot, name) => recAction(target, 'store', { slot, name }),
  recorderLoad: (target, slot) => recAction(target, 'load', { slot }),
  recorderCountIn: (target, bars) => recAction(target, 'countIn', { bars }),
  recorderRead: (target, field) => sectionRead(target, 'Recorder', 'recorder', field),
};

const harmAction = (t, a, g) => sectionAction(t, 'Harmoniser', harmoniserScriptPatch, a, g);
const harmoniserApi = {
  harmonyMode: (target, mode) => harmAction(target, 'mode', { mode }),
  harmonyKey: (target, key) => harmAction(target, 'key', { key }),
  harmonyScale: (target, scale) => harmAction(target, 'scale', { scale }),
  harmonySize: (target, size) => harmAction(target, 'size', { size }),
  harmonyShape: (target, shape) => harmAction(target, 'shape', { shape, preset: shape }),
  harmonyVoicing: (target, voicing) => harmAction(target, 'voicing', { voicing }),
  harmonyInversion: (target, inversion) => harmAction(target, 'inversion', { inversion }),
  harmonyOctave: (target, octave) => harmAction(target, 'octave', { octave }),
  harmonyOutOfKey: (target, mode) => harmAction(target, 'outOfKey', { outOfKey: mode }),
  harmonyKeepPlayed: (target, keep) => harmAction(target, 'keepPlayed', keep === undefined ? {} : { keepPlayed: keep !== false }),
  harmonyChannel: (target, channel) => harmAction(target, 'channel', { channel }),
  harmonyVoiceLeading: (target, mode) => harmAction(target, 'voiceLeading', { voiceLeading: mode }),
  harmonyStrum: (target, ms) => harmAction(target, 'strum', { ms }),
  harmonyDegree: (target, degree, chord) => harmAction(target, 'degree', { degree, chord }),
  harmonyRead: (target, field) => sectionRead(target, 'Harmoniser', 'harmony', field),
};

// --- The other twenty-three families (phase 7) -------------------------------
// Same shape as everything above — read the section, reduce, write back only what changed — but
// built in one loop from componentVerbs.js rather than typed out 182 times. `sectionAction` cannot
// be reused verbatim because these verbs take POSITIONAL arguments rather than a named action, so
// this is its sibling: identical error text, identical no-op reporting, one extra hop to the spec.
// @module ce.components
function componentVerbAction(verb, target, args) {
  const path = String(target ?? '');
  const cfg = getValue(`${path}.${verb.section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${verb.family}: ${wrongTargetMessage(path, verb.section, verb.label)}`);
    return false;
  }
  const patch = componentScriptPatch(verb, cfg, args);
  const keys = Object.keys(patch);
  const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
  if (keys.length === 0) {
    // An empty patch is two different things here, and this reducer DOES compare against the
    // current value — so ask the spec whether the request was one the component could have
    // honoured at all. "Already that way" is a success; an unknown enum or an index past the end
    // of the list is not, and used to be indistinguishable from both success and silence.
    if (componentRequestLegal(verb, cfg, args)) {
      addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v}(${shown}) — already that way`);
      return true;
    }
    addScriptTrace('error', '',
      `${verb.family} ${path}: ${verb.v}(${shown}) — refused, nothing changed`
      + (verb.values ? `. One of: ${verb.values.join(', ')}.` : ''));
    return false;
  }
  for (const key of keys) setValue(`${path}.${verb.section}.${key}`, patch[key]);
  addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v} → ${keys.join(', ')}`);
  return true;
}


/* --------------------------------------------------------- reading a component (design doc §44)
 *
 * Every one of the 229 component members was a WRITE. A script could set the arpeggiator's pattern
 * and could not ask what it was — so "next pattern", "if it is synced then…", and reading back a
 * generated sequence were all impossible, and a shadow copy in `state` desyncs the moment somebody
 * touches the control.
 *
 * ce.core.get() technically reached these — get("MyArp.Arp.syncToTransport") works — but it needs
 * the section name and the INTERNAL field name, which is exactly the vocabulary the verbs exist to
 * hide, and it hands back raw 0-based arrays against verbs that are 1-based. So the read is by verb
 * name, in the verbs' own units, and 1-based throughout.
 */

/** verb name -> spec, per family. Built once from the same list the writers come from. */
const COMPONENT_VERB_BY_NAME = COMPONENT_VERBS.reduce((acc, verb) => {
  (acc[verb.family] ??= {})[verb.v] = verb;
  return acc;
}, {});

/** The kinds `read` answers with one value rather than a list. */
const SCALAR_KINDS = ['num', 'int', 'bool', 'str', 'enum'];

/** The section config for a component verb's target, or nothing (having said why). */
function componentConfig(verb, path, forWhat) {
  const cfg = getValue(`${path}.${verb.section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${verb.family}.${forWhat}: ${wrongTargetMessage(path, verb.section, verb.label)}`);
    return null;
  }
  return cfg;
}

/** The list an indexed verb addresses, in document order. */
function componentList(cfg, verb) {
  return Array.isArray(cfg[verb.f]) ? cfg[verb.f] : null;
}

/** One scalar verb's current value, in the verb's own units. */
function componentScalarValue(cfg, verb) {
  if (verb.k === 'xy') {
    // The two axes as a table under the names the verb takes them by, so `move` reads back the way
    // it is written rather than as the model's field names.
    const [nameX, nameY] = verb.args ?? ['x', 'y'];
    const base = verb.flat ? cfg : (cfg[verb.f] && typeof cfg[verb.f] === 'object' ? cfg[verb.f] : {});
    const un = (n) => (verb.oneBased && Number.isFinite(Number(n)) ? Number(n) + 1 : n);
    return { [nameX]: un(base[verb.fx]), [nameY]: un(base[verb.fy]) };
  }
  const raw = cfg[verb.f];
  // oneBased verbs are stored one lower than they are written, so they read back one higher.
  if (verb.oneBased && Number.isFinite(Number(raw))) return Number(raw) + 1;
  return raw;
}

/** The whole list an indexed verb addresses, in verb vocabulary. */
function componentListValue(cfg, verb) {
  const list = componentList(cfg, verb);
  if (!list) return null;
  if (verb.k === 'item') return list.map((row) => (row && typeof row === 'object' ? row[verb.item] : undefined));
  if (verb.k === 'cell' && verb.grid) {
    // A grid reads back as rows of columns, matching how `cell(target, row, col, amount)` addresses
    // it. A flat list of sixty-four numbers would be technically the same data and unusable.
    const cols = Array.isArray(cfg.cols) ? cfg.cols.length : 0;
    const rows = Array.isArray(cfg.rows) ? cfg.rows.length : 0;
    if (!cols || !rows) return [];
    return Array.from({ length: rows }, (_, r) => list.slice(r * cols, r * cols + cols));
  }
  return [...list];
}

function componentReadAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'read');
  if (!cfg) return undefined;
  const [name, index, index2] = args;
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};

  // read(target) — every scalar verb of this component, keyed by the name it is written by.
  if (name === undefined || name === null || name === '') {
    const out = {};
    for (const [verbName, spec] of Object.entries(specs)) {
      if (SCALAR_KINDS.includes(spec.k) || spec.k === 'xy') out[verbName] = componentScalarValue(cfg, spec);
    }
    return out;
  }

  const spec = specs[String(name)];
  if (!spec) {
    addScriptTrace('error', '',
      `${verb.family}.read: "${name}" is not a verb of this component. One of: `
      + `${Object.keys(specs).filter((k) => k !== 'read').sort().join(', ')}.`);
    return undefined;
  }
  if (SCALAR_KINDS.includes(spec.k) || spec.k === 'xy') return componentScalarValue(cfg, spec);

  const list = componentListValue(cfg, spec);
  if (!list) return undefined;
  if (index === undefined || index === null) return list;

  // 1-based, as everywhere else in this module — and for a grid the second index is the column.
  const at = Math.round(Number(index)) - 1;
  if (!Number.isFinite(at) || at < 0 || at >= list.length) return undefined;
  const row = list[at];
  if (spec.k === 'cell' && spec.grid && index2 !== undefined && index2 !== null) {
    const col = Math.round(Number(index2)) - 1;
    return Array.isArray(row) && col >= 0 && col < row.length ? row[col] : undefined;
  }
  return row;
}

/** Which indexed verbs a family has, and how long each one's list is. */
function componentSizeAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'size');
  if (!cfg) return undefined;
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};
  const lists = Object.entries(specs).filter(([, s]) => LIST_KINDS.includes(s.k) && !s.clear);

  const sizeOf = (spec) => {
    const list = componentList(cfg, spec);
    if (!list) return undefined;
    if (spec.k === 'cell' && spec.grid) {
      // A crosspoint is addressed by two indices, so one number would not be an answer.
      return { rows: Array.isArray(cfg.rows) ? cfg.rows.length : 0,
               cols: Array.isArray(cfg.cols) ? cfg.cols.length : 0 };
    }
    return list.length;
  };

  const [name] = args;
  if (name === undefined || name === null || name === '') {
    return Object.fromEntries(lists.map(([verbName, spec]) => [verbName, sizeOf(spec)]));
  }
  const spec = specs[String(name)];
  if (!spec || !LIST_KINDS.includes(spec.k)) {
    addScriptTrace('error', '',
      `${verb.family}.size: "${name}" does not address a list. One of: `
      + `${lists.map(([k]) => k).sort().join(', ')}.`);
    return undefined;
  }
  return sizeOf(spec);
}

/** Write a whole list in one call — one document change instead of one per element. */
function componentFillAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'fill');
  if (!cfg) return false;
  const [name, values] = args;
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};
  const spec = specs[String(name ?? '')];
  const lists = Object.entries(specs).filter(([, s]) => LIST_KINDS.includes(s.k) && !s.clear);
  if (!spec || !LIST_KINDS.includes(spec.k) || spec.clear) {
    addScriptTrace('error', '',
      `${verb.family}.fill: "${name}" does not address a list. One of: `
      + `${lists.map(([k]) => k).sort().join(', ')}.`);
    return false;
  }
  if (!Array.isArray(values)) {
    addScriptTrace('error', '', `${verb.family}.fill("${name}"): needs a list of values.`);
    return false;
  }
  const list = componentList(cfg, spec);
  if (!list) return false;

  // A grid takes ROWS of columns — the shape read() gives back — and each row is placed at its own
  // row index. Flattening first would put a short second row inside the first one, which is how a
  // 2x2 fill silently landed as four cells along the top.
  const grid = spec.k === 'cell' && spec.grid;
  const calls = [];
  if (grid) {
    const cols = Array.isArray(cfg.cols) ? cfg.cols.length : 0;
    const rows = Array.isArray(cfg.rows) ? cfg.rows.length : 0;
    if (values.length > rows || values.some((row) => Array.isArray(row) && row.length > cols)) {
      addScriptTrace('error', '',
        `${verb.family}.fill("${name}"): does not fit a ${rows}x${cols} grid — refused. `
        + `${verb.family}.size("${name}") gives its shape.`);
      return false;
    }
    values.forEach((row, r) => {
      (Array.isArray(row) ? row : [row]).forEach((value, c) => calls.push([r + 1, c + 1, value]));
    });
  } else {
    if (values.length > list.length) {
      // Refused rather than truncated: silently dropping half a pattern is worse than not writing
      // it, and the caller can ask size() first.
      addScriptTrace('error', '',
        `${verb.family}.fill("${name}"): ${values.length} values for a list of ${list.length} — `
        + `refused. ${verb.family}.size("${name}") says how many there are.`);
      return false;
    }
    values.forEach((value, i) => calls.push([i + 1, value]));
  }

  // Each element goes through the SAME reducer one call would use, so a value written in bulk is
  // clamped, coerced and refused exactly as a value written singly. Then ONE write at the end,
  // which is the whole point: sixteen steps used to be sixteen document changes.
  let next = list;
  let wrote = false;
  for (const args of calls) {
    const patch = componentScriptPatch(spec, { ...cfg, [spec.f]: next }, args);
    if (patch[spec.f]) { next = patch[spec.f]; wrote = true; }
  }
  if (!wrote) {
    addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") — already that way`);
    return true;
  }
  setValue(`${path}.${verb.section}.${spec.f}`, next);
  addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") → ${calls.length} value(s)`);
  return true;
}

/** Add one element to a component's list, using the template the canvas uses. */
function componentInsertAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'insert');
  if (!cfg) return false;
  const spec = componentListSpec(verb, 'insert', args[0]);
  if (!spec) return false;
  const list = componentList(cfg, spec) ?? [];
  const at = args[1] === undefined || args[1] === null ? null : Math.round(Number(args[1])) - 1;
  const next = componentListWithElement(verb.section, spec.f, list, cfg, at);
  if (!next) {
    addScriptTrace('error', '',
      `${verb.family}.insert("${spec.v}"): this component's ${spec.f} cannot be grown from a script.`);
    return false;
  }
  setValue(`${path}.${verb.section}.${spec.f}`, next);
  addScriptTrace('log', '', `${verb.family} ${path}: insert("${spec.v}") → ${next.length}`);
  return true;
}

/** …and take one away, when the component does not need it. */
function componentRemoveAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'remove');
  if (!cfg) return false;
  const spec = componentListSpec(verb, 'remove', args[0]);
  if (!spec) return false;
  const list = componentList(cfg, spec) ?? [];
  // No index removes the last, which is what "one fewer" means without saying which.
  const at = args[1] === undefined || args[1] === null
    ? list.length - 1
    : Math.round(Number(args[1])) - 1;
  const next = componentListWithoutElement(verb.section, spec.f, list, at);
  if (!next) {
    addScriptTrace('error', '',
      `${verb.family}.remove("${spec.v}", ${args[1] ?? 'last'}): refused — either there is no such `
      + 'element, or this component needs it.');
    return false;
  }
  setValue(`${path}.${verb.section}.${spec.f}`, next);
  addScriptTrace('log', '', `${verb.family} ${path}: remove("${spec.v}") → ${next.length}`);
  return true;
}

/** The list-addressing verb a name refers to, having complained if it is not one. */
function componentListSpec(verb, forWhat, name) {
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};
  const lists = Object.entries(specs).filter(([, x]) => LIST_KINDS.includes(x.k) && !x.clear);
  const spec = specs[String(name ?? '')];
  if (spec && LIST_KINDS.includes(spec.k) && !spec.clear) return spec;
  addScriptTrace('error', '',
    `${verb.family}.${forWhat}: "${name}" does not address a list. One of: `
    + `${lists.map(([k]) => k).sort().join(', ')}.`);
  return null;
}

/** The five kinds every family gets are not writes of a field, so they dispatch elsewhere. */
const COMPONENT_KIND_ACTION = {
  read: componentReadAction,
  size: componentSizeAction,
  fill: componentFillAction,
  insert: componentInsertAction,
  remove: componentRemoveAction,
};

const componentVerbApi = Object.fromEntries(COMPONENT_VERBS.map((verb) => [
  verb.id,
  // Rest args rather than a fixed arity: the verbs take one, two or three, and a wrapper that
  // named them would have to be generated per kind for no gain. `target` is always first.
  (target, ...rest) => {
    const special = COMPONENT_KIND_ACTION[verb.k];
    return special
      ? special(verb, String(target ?? ''), rest)
      : componentVerbAction(verb, target, rest);
  },
]));

/**
 * The read for the five hand-written families, by MODEL field name.
 *
 * The twenty-three spec-driven families read by verb name because their spec says which field each
 * verb writes. These five have no such map — they are five hand-written reducers that predate it —
 * so rather than hand-type a forty-seven entry verb→field table (the exact thing §44 spent its
 * first half deleting), they read by the field name their own summaries already use. `read(target)`
 * with no field is the whole section, which is the same answer the other twenty-three give.
 */
function sectionRead(path, section, label, field) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.${section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${label}.read: ${wrongTargetMessage(target, section, label)}`);
    return undefined;
  }
  if (field === undefined || field === null || field === '') {
    // Without the private live-state keys the renderer parks here: `__phase` is where the preview
    // surface is in a sequence this frame, not something a script set or can set.
    return Object.fromEntries(Object.entries(cfg).filter(([k]) => !k.startsWith('_')));
  }
  const name = String(field);
  const key = Object.keys(cfg).find((k) => k.toLowerCase() === name.toLowerCase());
  if (key === undefined || key.startsWith('_')) {
    addScriptTrace('error', '',
      `${label}.read: "${field}" is not a field of this component. One of: `
      + `${Object.keys(cfg).filter((k) => !k.startsWith('_')).sort().join(', ')}.`);
    return undefined;
  }
  return cfg[key];
}

const setAction = (t, a, g) => sectionAction(t, 'Setlist', setlistScriptPatch, a, g);
const setlistApi = {
  // These move the INDEX. The recall follows from the index changing, so a
  // scripted step and a footswitch step are the same event downstream.
  setlistNext: (target) => setAction(target, 'next', {}),
  setlistPrev: (target) => setAction(target, 'prev', {}),
  setlistGoto: (target, scene) => setAction(target, 'goto', { scene }),
  setlistEnable: (target, scene, enabled) => setAction(target, 'enable', { scene, enabled: enabled !== false }),
  setlistWrap: (target, wrap) => setAction(target, 'wrap', wrap === undefined ? {} : { wrap: wrap !== false }),
  setlistCrossfade: (target, ms) => setAction(target, 'crossfade', { ms }),
  setlistRead: (target, field) => sectionRead(target, 'Setlist', 'setlist', field),
};

/* -------------------------------------------------------------- flow: on / emit / run */
// These three were `() => {}` until the API audit: a script could register a listener, announce an
// event, or call another script's action, and nothing happened — silently, and only in the
// WebView, so the same panel behaved differently with the window open and closed.
//
// `on` listeners belong to the script that registered them, so re-running a script (an edit in the
// designer, a source change) replaces its listeners instead of stacking a second copy.

// @module -
const listeners = [];   // { scriptId, target, event, fn }

function clearListeners(scriptId) {
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].scriptId === scriptId) listeners.splice(i, 1);
}

/** The name a listener is stored under: the HANDLER name, which is what every producer dispatches.
 *
 *  Both spellings are accepted. Every event in the contract has two — an id (`timer`, `step`) and a
 *  handler name (`onTimer`, `onStep`) — and `on()` only ever matched the second, because that is
 *  what dispatchEvents carries. So a script author reading the events list, seeing `step`, and
 *  writing on("*", "step", …) got a listener that could never fire, silently. The list is the
 *  vocabulary the API teaches; it should work. */
function listenerEventName(event) {
  const name = String(event ?? '');
  return EVENT_BY_ID[name]?.fn ?? name;
}

function addListener(scriptId, target, event, fn) {
  if (typeof fn !== 'function') return;
  listeners.push({ scriptId, target: String(target ?? '*'), event: listenerEventName(event), fn });
}

/** off(target, event) — drop THIS script's listeners for that pair. Scoped to the caller so one
    script cannot silently unsubscribe another's handlers. An unknown pair is a no-op. */
function removeListener(scriptId, target, event) {
  const t = String(target ?? '*');
  const e = listenerEventName(event);   // either spelling, matching what on() stored
  for (let i = listeners.length - 1; i >= 0; i--) {
    const l = listeners[i];
    if (l.scriptId === scriptId && l.target === t && l.event === e) listeners.splice(i, 1);
  }
}

/* --------------------------------------------------------------- the reactive core
 * watch / compute / intercept / defineAction — the four verbs that do what setting a property
 * cannot. A properties panel stores a CONSTANT decided at design time; each of these stores a RULE
 * the runtime keeps applying.
 *
 * They belong to the script that registered them, exactly as `on` listeners do, so re-running a
 * script replaces its rules instead of stacking a second copy.
 */

const watchers = [];        // { scriptId, key, path, fn, last }   — observe any model path
const computeds = [];       // { scriptId, key, path, fn, failed } — a property that is a formula
const filters = [];         // { scriptId, key, path, fn }         — middleware in front of a write
const actions = new Map();  // name(lower) -> { scriptId, name, fn }

/** The one spelling every rule is keyed by.
 *  `set("cutoff.value")` and `set("cutoff.Value.value")` address the same field, so an interceptor
 *  registered against either has to catch both — matching the text as typed would make the rule
 *  depend on which shorthand the OTHER script happened to use. */
function reactiveKey(path) {
  const { name, segs } = splitScriptPath(splitAccessor(String(path ?? ''), '').path);
  if (isPanelTarget(name)) return `panel.${segs.join('.')}`.toLowerCase();
  const control = findControlByName(name);
  if (!control) return String(path ?? '').toLowerCase();     // unresolvable: key on the raw text
  const core = control._children.Core;
  return `${String(core.name ?? core.id)}.${resolveModelPath(control, segs)}`.toLowerCase();
}

function clearReactive(scriptId) {
  for (const list of [watchers, computeds, filters]) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].scriptId === scriptId) list.splice(i, 1);
  }
  for (const [key, a] of [...actions]) if (a.scriptId === scriptId) actions.delete(key);
}

/** A rule replaces the same script's rule for the same path, rather than stacking beside it.
 *  Two interceptors on one path would make the result depend on registration order, which is the
 *  kind of thing that works until the script is reloaded in a different order. */
function putRule(list, rule) {
  const at = list.findIndex((r) => r.scriptId === rule.scriptId && r.key === rule.key);
  if (at >= 0) list[at] = rule; else list.push(rule);
}

function addWatch(scriptId, path, fn) {
  if (typeof fn !== 'function') return;
  // Seeded with the CURRENT value, not undefined: a watcher must not fire once on registration
  // just because it has never seen the value before. It reports changes, not existence.
  putRule(watchers, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn, last: signatureOf(readWatch(path)) });
}

function addCompute(scriptId, path, fn) {
  if (typeof fn !== 'function') return;
  putRule(computeds, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn, failed: false });
}

function addIntercept(scriptId, path, fn) {
  if (typeof fn !== 'function') return;
  putRule(filters, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn });
}

function defineActionImpl(scriptId, name, fn) {
  const id = String(name ?? '').trim();
  if (!id || typeof fn !== 'function') return;
  const existing = actions.get(id.toLowerCase());
  if (existing && existing.scriptId !== scriptId) {
    // Reported, not silently overwritten: two scripts claiming one name is a real conflict, and
    // whichever loaded last winning by accident is the worst way to resolve it.
    addScriptTrace('error', scriptId,
      `defineAction("${id}") — already defined by another script. The later definition is ignored.`);
    return;
  }
  actions.set(id.toLowerCase(), { scriptId, name: id, fn });
}

/** A stable comparison signature — objects and arrays compare by content, not identity. */
function signatureOf(value) {
  if (value === undefined) return '\u0000undefined';
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

/** Sentinel: an interceptor said no. Distinct from `undefined`, which means "accept unchanged". */
const REJECTED = Symbol('rejected');

// >0 while a filter is running. An interceptor that writes to the path it guards (a snap-to-grid
// rule calling set() itself) would otherwise re-enter its own filter without end.
let interceptDepth = 0;

/**
 * Run every interceptor registered for this path. Returns the value to write, or REJECTED.
 * Called from setValue, so it covers script writes; the settle pass below catches changes that
 * arrive from anywhere else (the user dragging a control, inbound MIDI) by correcting them after
 * the fact — a snap rather than a veto, which is the best a diff-based observer can do honestly.
 */
function applyIntercepts(key, value, previous) {
  let next = value;
  for (const f of filters) {
    if (f.key !== key) continue;
    let out;
    try { out = f.fn(next, previous); } catch (e) { reportScriptError(f.scriptId, e); continue; }
    if (out === false) return REJECTED;
    if (out === undefined || out === null) continue;     // no opinion — accept what we had
    next = out;
  }
  return next;
}

// A compute that writes a value which makes another compute write again can ping-pong. The loop is
// contained INSIDE one settle pass and cut off here rather than being allowed to bounce through the
// store subscription, where it would look like the editor had hung.
const MAX_SETTLE_PASSES = 8;

/**
 * Re-evaluate the formulas, then report the changes. Called after every source of value change.
 *
 * Computes run to a fixpoint first so watchers see a settled model: a watcher that fired on the
 * intermediate state would report a value the user never actually had.
 */
function runReactive() {
  if (!computeds.length && !watchers.length && !filters.length) return;
  if (live.dispatching) return;
  live.dispatching = true;
  try {
    for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
      let wrote = false;
      for (const c of computeds) {
        if (c.failed) continue;
        let next;
        try { next = c.fn(); } catch (e) { reportScriptError(c.scriptId, e); c.failed = true; continue; }
        if (next === undefined) continue;
        if (signatureOf(next) === signatureOf(readWatch(c.path))) continue;
        setValue(c.path, next);
        wrote = true;
      }
      if (!wrote) break;
      if (pass === MAX_SETTLE_PASSES - 1) {
        addScriptTrace('error', '',
          `compute(): still changing after ${MAX_SETTLE_PASSES} passes — two formulas are feeding each other. `
          + 'They are left at the last value rather than looped on.');
      }
    }

    // Interceptors, for changes that did NOT come through set(): the user dragging the control,
    // inbound MIDI, a dump landing. Those never touch our write path, so the filter is applied
    // after the fact and the value is corrected — the knob snaps rather than refusing to move.
    // A filter has to be idempotent for this to settle (f(f(x)) == f(x)), which snapping, clamping
    // and quantising all are; one that is not simply keeps correcting and is cut off with the
    // computes below.
    for (const f of filters) {
      const current = readWatch(f.path);
      if (current === undefined) continue;
      const decided = applyIntercepts(f.key, current, current);
      if (decided === REJECTED) continue;      // nothing to revert to — a veto needs a write to stop
      if (signatureOf(decided) !== signatureOf(current)) setValue(f.path, decided);
    }

    for (const w of watchers) {
      const value = readWatch(w.path);
      const sig = signatureOf(value);
      if (sig === w.last) continue;
      const previous = w.lastValue;
      w.last = sig;
      w.lastValue = value;
      try { w.fn(value, previous); } catch (e) { reportScriptError(w.scriptId, e); }
    }
  } finally {
    live.dispatching = false;
  }
}

// Same backstop as ScriptRuntime::dispatchEvent: emit → handler → emit → … is cut off at a fixed
// depth and reported, rather than recursing until the tab dies.
const MAX_EMIT_DEPTH = 16;
let emitDepth = 0;

function listenerMatches(l, target) {
  return l.target === '*' || l.target === 'self' || target == null
    || l.target.toLowerCase() === String(target).toLowerCase();
}

/** Deliver `event` to on(…) listeners and to any already-loaded handler named for it. Synchronous,
    matching the C++ side — everything it calls has been loaded and cached by dispatchEvents. */
function deliverEmit(name, target, data) {
  if (emitDepth >= MAX_EMIT_DEPTH) {
    addScriptTrace('error', '', `emit("${name}") dropped: nesting exceeded ${MAX_EMIT_DEPTH} (emit/dispatch feedback loop?)`);
    return;
  }
  emitDepth += 1;
  try {
    for (const l of [...listeners]) {
      if (l.event !== name || !listenerMatches(l, target)) continue;
      try { l.fn(data); } catch (e) { reportScriptError(l.scriptId, e); }
    }
    for (const s of activeScripts()) {
      if (s.enabled === false || s.event !== name) continue;
      const fn = handlerCache.get(s.id)?.handlers?.[name];
      if (typeof fn !== 'function') continue;
      try { fn(data); } catch (e) { reportScriptError(s.id, e); }
    }
  } finally {
    emitDepth -= 1;
  }
}

/** run("owner.action" [, args]) — call a function defined by another script, in any language.
    Resolved against the loaded handler cache, so it is synchronous and can return a value. */
function runAction(ref, args) {
  const text = String(ref ?? '');
  const dot = text.lastIndexOf('.');
  const owner = dot > 0 ? text.slice(0, dot) : '';
  const action = dot > 0 ? text.slice(dot + 1) : text;
  if (!action) return undefined;

  // A registered action wins over a same-named handler. defineAction() is an explicit declaration
  // of intent; a function that happens to share the name is a coincidence, and the deliberate one
  // should not lose to it. An owner-qualified ref still goes to the script scan, because that
  // spelling is asking for a particular script's function by name.
  if (!owner) {
    const registered = actions.get(action.toLowerCase());
    if (registered) {
      try { return registered.fn(args); }
      catch (e) { reportScriptError(registered.scriptId, e); return undefined; }
    }
  }

  for (const s of activeScripts()) {
    if (s.enabled === false) continue;
    if (owner && String(s.target ?? '').toLowerCase() !== owner.toLowerCase()) continue;
    const fn = handlerCache.get(s.id)?.handlers?.[action];
    if (typeof fn !== 'function') continue;
    try { return fn(args); } catch (e) { reportScriptError(s.id, e); return undefined; }
  }
  const defined = [...actions.values()].map((a) => a.name);
  addScriptTrace('error', '', `run("${text}") found no loaded script defining ${action}()`
    + (defined.length ? `. Registered actions: ${defined.join(', ')}` : ''));
  return undefined;
}

/** The actions scripts have registered, for the editor's binding UI. Names as declared. */
export function registeredActions() {
  return [...actions.values()].map((a) => a.name);
}

/** Drive one settle pass by hand. The live runtime does this off the store subscriptions; a test
    has no store, so it needs the same entry point rather than a reimplementation of it. */
export function runReactiveForTesting() { runReactive(); }

/** Drop every loaded handler, listener, rule and timer — what a panel switch does. Exposed so a
    test can start clean: rules outlive a single `set`, which is the whole point of them, and two
    tests sharing this module would otherwise share each other's formulas and filters. */
export function resetScriptStateForTesting() { resetScriptState(); }

/* ------------------------------------------------------------------------- timers */
// A repeating timer owned by the runtime, not the language: Lua can't hold a coroutine open across
// handler calls and QuickJS has no setTimeout, so both need the host to keep time. Starting an id
// that is already running re-times it rather than stacking a second interval.

// @module ce.anim
/* --------------------------------------------------------------------------------- ce.anim */
// Values that move over time. CROSS-RUNTIME: a sweep triggered by a note has to work in a DAW with
// the panel shut, so the C++ ScriptRuntime carries the same engine — and the two must agree.
//
// They agree because the position is a PURE FUNCTION OF ELAPSED TIME, never an accumulated step.
// Two integrators ticking independently drift apart within a second; two evaluations of the same
// formula at the same elapsed time cannot. These two functions are the formula, and
// ScriptRuntime::animationEase / animationSpring are the identical C++ pair.

/**
 * A CSS cubic-bezier, evaluated numerically — P0 (0,0), P3 (1,1), the two control points given.
 *
 * This exists because the Properties panel's Animations section stores its easings as bezier
 * CONTROL POINTS (a CSS transition needs no evaluator) and ce.anim writes values rather than
 * stylesheets. Adopting the panel's names with lookalike formulas — 1-(1-t)² for outQuad, which is
 * NOT what cubic-bezier(0.25, 0.46, 0.45, 0.94) traces — would be a second curve wearing the same
 * name, and an author who set outCubic in the panel and wrote curve = "outCubic" beside it would
 * get two different motions with nothing to tell them apart.
 *
 * The iteration counts are FIXED rather than "until it converges". Four runtimes have to produce
 * the same double from the same input, and a loop that stops on a tolerance stops after a different
 * number of steps the moment one of them rounds differently.
 */
const bezierAt = (s, a, b) => (((1 - 3 * b + 3 * a) * s + (3 * b - 6 * a)) * s + (3 * a)) * s;
const bezierSlope = (s, a, b) => 3 * (1 - 3 * b + 3 * a) * s * s + 2 * (3 * b - 6 * a) * s + 3 * a;

export function cubicBezierEase(t, x1, y1, x2, y2) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  if (x1 === y1 && x2 === y2) return x;            // the identity curve is a straight line
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Newton-Raphson on the x polynomial: eight steps, then bisection to finish. Newton alone can
  // wander when the slope is near zero (an ease-out's tail), and bisection alone is slow.
  let s = x;
  for (let i = 0; i < 8; i += 1) {
    const slope = bezierSlope(s, x1, x2);
    if (slope === 0) break;
    s -= (bezierAt(s, x1, x2) - x) / slope;
  }
  if (!(s >= 0) || !(s <= 1)) {
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 24; i += 1) {
      if (bezierAt(s, x1, x2) < x) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
  }
  return bezierAt(s, y1, y2);
}

/**
 * Every curve ce.anim animates along.
 *
 * Two vocabularies, kept apart on purpose. `linear|exp|log|s` are ce.math.curve()'s, computed the
 * same way so knowing one is knowing both. `inQuad|outQuad|inOutQuad|outCubic` are the Properties
 * panel's, evaluated as the beziers the panel stores. They are close relatives — exp is t², inQuad
 * is a bezier that LOOKS like t² — and deliberately not merged, because calling them the same thing
 * would be a claim about the numbers that is not true.
 *
 * An unknown name returns undefined rather than silently going linear. Before this, curve =
 * "outCubic" — a name the Properties panel offers three feet away — was linear in every runtime and
 * said nothing. startAnimationImpl reports it, the way ce.math.curve() has since §30.
 */
export function animationEase(progress, curve) {
  const v = Math.min(1, Math.max(0, Number(progress) || 0));
  if (curve === undefined || curve === null || curve === 'linear') return v;
  if (curve === 'exp') return v * v;
  if (curve === 'log') return Math.sqrt(v);
  if (curve === 's') return v * v * (3 - 2 * v);
  const b = EASING_BEZIERS[String(curve)];
  if (b) return cubicBezierEase(v, b[0], b[1], b[2], b[3]);
  return undefined;
}

/** A damped oscillation, pinned to exactly 1 at the end so a spring always lands on its target. */
export function animationSpring(progress, damping, frequency) {
  const x = Math.min(1, Math.max(0, Number(progress) || 0));
  if (x >= 1) return 1;
  return 1 - Math.exp(-damping * x) * Math.cos(frequency * x);
}

const animations = new Map();   // path -> descriptor
let animationTimer = null;
const ANIMATION_TICK_MS = 16;   // ~60Hz in the panel view; the player ticks at its own 30Hz

// The clock an animation starts from is the LAST TICK, not the wall clock — exactly what
// ScriptRuntime does, so the two runtimes measure elapsed time against the same origin. Reading
// the wall clock here instead would work in production and diverge the moment a caller drives time
// itself, which is how the C++ and JS engines end up disagreeing without anyone noticing.
let animationNowMs = 0;
// Whether a tick has EVER happened — not `animationNowMs === 0`, because zero is a perfectly good
// tick time when the caller drives the clock (which the tests do, and which is the only way to
// test an animation without waiting on a real one).
let animationTicked = false;

function animationNow() { return Date.now(); }

// Groups exist so a call with SEVERAL paths gets ONE completion. `done` on a six-path sweep means
// "when the sweep is over", not six times; the group counts down and the last one out fires it.
let animationGroupSeq = 0;
const animationGroups = new Map();   // group id -> { remaining, done, scriptId, completed, paths }

/** Run a script's callback and report a throw against THAT script — the same contract after()
 *  keeps, so a broken completion handler is attributed rather than swallowed. */
function runScriptCallback(scriptId, label, fn) {
  try { fn(); } catch (e) { reportScriptError(scriptId, e); }
}

// An envelope is sampled into this many SEGMENTS (so ANIM_SAMPLES + 1 values, the last landing
// exactly on t = 1). This IS an approximation of the drawn shape, and worth stating plainly: at a
// sharp corner the sampled peak can sit ~0.1% below the drawn one. It is far finer than the tick
// rate the value is written at, so nothing reads the difference — and it is the same number in
// every runtime, which is the property that actually matters.
export const ANIM_SAMPLES = 1024;

/** Sample a { x, y, curve } point list into a flat table of y values, using ce.math.map — which IS
 *  the Envelope component's envValueAt, so the sampled shape is the shape the panel draws. */
function sampleEnvelope(points) {
  const out = [];
  for (let i = 0; i <= ANIM_SAMPLES; i += 1) {
    const y = Number(mapCurveImpl(i / ANIM_SAMPLES, points));
    out.push(Number.isFinite(y) ? y : 0);
  }
  return out;
}

/** Read a sampled shape at 0..1, linearly between samples. */
function sampleAt(samples, t) {
  if (!samples || !samples.length) return 0;
  const x = Math.min(1, Math.max(0, Number(t) || 0)) * (samples.length - 1);
  const i = Math.floor(x);
  if (i >= samples.length - 1) return samples[samples.length - 1];
  return samples[i] + (samples[i + 1] - samples[i]) * (x - i);
}

const animNumber = (opts, name, fallback) => {
  const v = Number(opts?.[name]);
  return Number.isFinite(v) ? v : fallback;
};

/** The transport position an animation with `sync` measures against. */
function animationBeats() {
  const t = transportSnapshot();
  return t.valid ? t.beats : 0;
}

/** How far through its current cycle an animation is, 0..1. Delay is BEFORE the move, so a delayed
 *  animation reads 0 and holds its `from` value rather than jumping. */
function animationProgress(a, nowMs, beats) {
  if (a.paused) return a.heldProgress;
  if (a.sync) {
    const span = a.syncBeats > 0 ? a.syncBeats : 1;
    return Math.min(1, Math.max(0, (beats - a.startBeats) / span));
  }
  return Math.min(1, Math.max(0, (nowMs - a.startMs) / a.duration));
}

/** The value an animation is at, at a given progress. */
function animationValueOf(a, progress) {
  if (a.kind === 'envelope') {
    // The shape was SAMPLED at start (see ANIM_SAMPLES); between samples the read is linear.
    // Sampling rather than evaluating map() on every tick is what lets the C++ engine run the same
    // envelope: map()'s per-point curves live in the preludes, and the alternative was a fifth
    // implementation of them in ScriptRuntime.cpp. One table, interpolated identically everywhere.
    const shaped = sampleAt(a.samples, progress);
    return a.from + (a.to - a.from) * (Number.isFinite(shaped) ? shaped : 0);
  }
  const eased = a.kind === 'spring'
    ? animationSpring(progress, a.damping, a.frequency)
    : animationEase(progress, a.curve);
  return a.from + (a.to - a.from) * (Number.isFinite(eased) ? eased : progress);
}

/** Run (and forget) the completion callback for one animation. `completed` says whether it got
 *  there: a stopped animation reports false, so "then do X" can tell finishing from cancelling. */
function fireAnimationDone(a, completed) {
  if (a.groupId != null) {
    const group = animationGroups.get(a.groupId);
    if (!group) return;
    group.remaining -= 1;
    if (!completed) group.completed = false;
    if (group.remaining > 0) return;
    animationGroups.delete(a.groupId);
    if (typeof group.done !== 'function') return;
    runScriptCallback(group.scriptId, 'done', () => group.done({ paths: group.paths, completed: group.completed }));
    return;
  }
  if (typeof a.done !== 'function') return;
  const fn = a.done;
  a.done = null;                          // once, whatever happens next
  runScriptCallback(a.scriptId, 'done', () => fn({ path: a.path, completed }));
}

/** Drop an animation without firing anything — panel teardown, and the internal half of stop(). */
function dropAnimation(key) {
  animations.delete(key);
  if (!animations.size && animationTimer != null) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

function startAnimationImpl(scriptId, kind, path, target, opts = {}, group = null) {
  // A LIST of paths is one call, one shape, one completion. Six paths with six hand-computed
  // delays was the alternative, and `stagger` is why the list is worth having at all.
  if (Array.isArray(path)) {
    const paths = path.map((p) => String(p ?? '')).filter(Boolean);
    if (!paths.length) return false;
    const stagger = animNumber(opts, 'stagger', 0);
    const done = typeof opts?.done === 'function' ? opts.done : null;
    let groupId = null;
    if (done) {
      animationGroupSeq += 1;
      groupId = animationGroupSeq;
      animationGroups.set(groupId, {
        remaining: paths.length, done, completed: true, paths,
        scriptId: scriptId,
      });
    }
    let ok = true;
    paths.forEach((p, i) => {
      const each = { ...opts, delay: animNumber(opts, 'delay', 0) + stagger * i, done: undefined };
      if (!startAnimationImpl(scriptId, kind, p, target, each, groupId)) ok = false;
    });
    return ok;
  }

  const key = String(path ?? '');
  if (!key) return false;

  const groupId = group;
  const spring = kind === 'spring';
  const envelope = kind === 'envelope';

  // An unknown curve REPORTS rather than silently animating linear. "outCubic" is a name the
  // Properties panel offers three feet away, and it was linear here in every runtime.
  let curve = typeof opts?.curve === 'string' ? opts.curve : 'linear';
  if (!spring && !envelope && animationEase(0.5, curve) === undefined) {
    addScriptTrace('log', scriptId,
      `ce.anim: "${curve}" is not a curve this build knows — animating linear. `
      + `Try one of: ${ANIM_CURVE_NAMES.join(', ')}.`);
    curve = 'linear';
  }

  // `from` defaults to where the value IS, so an animation starts from the truth rather than from
  // wherever the previous one happened to stop.
  const fromRaw = opts?.from != null ? Number(opts.from) : Number(getValue(key, 'value'));
  const from = Number.isFinite(fromRaw) ? fromRaw : 0;

  // Nothing has ticked yet on a fresh panel, so seed the origin from the clock the interval below
  // will use — otherwise the first animation measures against zero and finishes instantly.
  if (!animationTicked) { animationNowMs = animationNow(); animationTicked = true; }

  // A duration in BEATS is resolved once, here. `sync` is the stronger thing: the position is
  // derived from the transport's beat count, so the animation FREEZES when the transport stops and
  // stretches when the tempo drops — which is what every synced component in the panel does and no
  // script could ask for.
  const sync = opts?.sync === true;
  const beatsOpt = opts?.beats != null ? Number(opts.beats) : null;
  const defaultMs = spring ? 600 : 300;
  let duration = Math.max(1, animNumber(opts, 'duration', defaultMs));
  let syncBeats = 0;
  if (Number.isFinite(beatsOpt) && beatsOpt > 0) {
    syncBeats = beatsOpt;
    const ms = beatsToMsRead(beatsOpt);
    if (ms != null) duration = Math.max(1, ms);
    else if (sync === false) {
      addScriptTrace('log', scriptId,
        'ce.anim: no tempo is being reported, so `beats` has no length — using `duration` instead.');
    }
  } else if (sync) {
    syncBeats = msToBeatsRead(duration) ?? 1;
  }

  const delay = Math.max(0, animNumber(opts, 'delay', 0));
  // repeat: 0 runs once, n runs n more times, -1 runs until stopped. Anything a script can start
  // forever it must be able to stop, which is what list()/value() and panel teardown are for.
  const repeatRaw = Math.round(animNumber(opts, 'repeat', 0));
  const repeat = repeatRaw < 0 ? -1 : repeatRaw;

  const previous = animations.get(key);
  if (previous) fireAnimationDone(previous, false);   // replaced is not finished

  animations.set(key, {                       // …replacing any animation already on this path:
    kind: envelope ? 'envelope' : (spring ? 'spring' : 'to'),   // a value has one destination
    path: key,
    from,
    to: Number(target) || 0,
    samples: envelope ? opts.samples : null,
    startMs: animationNowMs + delay,
    startBeats: animationBeats() + (sync ? (msToBeatsRead(delay) ?? 0) : 0),
    delay,
    duration,
    sync,
    syncBeats,
    curve,
    damping: animNumber(opts, 'damping', 6),
    frequency: animNumber(opts, 'frequency', 12),
    repeat,
    cycle: 0,
    pingpong: opts?.pingpong === true,
    paused: false,
    heldProgress: 0,
    done: typeof opts?.done === 'function' ? opts.done : null,
    scriptId: scriptId,
    groupId,
  });

  if (animationTimer == null && typeof setInterval === 'function') {
    animationTimer = setInterval(() => tickAnimations(animationNow()), ANIMATION_TICK_MS);
  }
  return true;
}

/** envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
 *
 *  `to` and `spring` both go from A to B; an ADSR does not, and it is the single most obvious thing
 *  a synth panel animates. The points are the Envelope component's own — { x, y, curve } in 0..1 —
 *  and the lookup is ce.math.map, which IS envValueAt, so a script's sweep and the Envelope drawn
 *  beside it trace the same line. */
function startEnvelopeImpl(scriptId, path, points, opts = {}) {
  const list = Array.isArray(points) ? points : null;
  if (!list || list.length < 2) {
    addScriptTrace('log', scriptId,
      'ce.anim.envelope(path, points): needs at least two points, each { x, y } in 0..1 — nothing was started.');
    return false;
  }
  const lo = opts?.from != null ? Number(opts.from) : 0;
  const hi = opts?.to != null ? Number(opts.to) : 1;
  return startAnimationImpl(scriptId, 'envelope', path, hi, {
    ...opts,
    samples: sampleEnvelope(list),
    from: Number.isFinite(lo) ? lo : 0,
  });
}

function stopAnimationImpl(path) {
  if (path == null || String(path) === '') {
    for (const a of [...animations.values()]) fireAnimationDone(a, false);
    animations.clear();
    if (animationTimer != null) { clearInterval(animationTimer); animationTimer = null; }
    return true;
  }
  const key = String(path);
  const a = animations.get(key);
  if (a) fireAnimationDone(a, false);
  dropAnimation(key);
  return true;
}

function animationRunningImpl(path) {
  if (path == null || String(path) === '') return animations.size > 0;
  return animations.has(String(path));
}

/** Where an animation IS — running() says whether, this says how far. Nil when nothing is running
 *  on the path, which is what tells "finished" from "half way". */
function animationValueImpl(path) {
  const a = animations.get(String(path ?? ''));
  if (!a) return undefined;
  const progress = animationProgress(a, animationNowMs, animationBeats());
  const remaining = a.sync ? null : Math.max(0, a.duration * (1 - progress));
  return {
    path: a.path,
    kind: a.kind,
    value: animationValueOf(a, progress),
    progress,
    from: a.from,
    to: a.to,
    elapsed: a.sync ? null : a.duration * progress,
    remaining,
    paused: a.paused,
    cycle: a.cycle,
    sync: a.sync,
  };
}

/** Every animation running, in path order. The read `ce.time.timers()` and `ce.panel.entries()`
 *  both got, and the one that makes `repeat = -1` safe to offer: a script can always find what it
 *  started and stop it. */
function animationListImpl() {
  return [...animations.keys()].sort().map((k) => animationValueImpl(k));
}

/** Hold an animation where it is. stop() is destructive and there was no non-destructive hold, so
 *  "pause the sweep while the user drags" meant stopping it and rebuilding the rest by hand. */
function animationPauseImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a || a.paused) return false;
  a.heldProgress = animationProgress(a, animationNowMs, animationBeats());
  a.paused = true;
  return true;
}

function animationResumeImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a || !a.paused) return false;
  // Re-anchor so the held progress reads the same at the moment of resuming: the animation carries
  // on rather than restarting, which is the whole difference from stop-and-start-again.
  a.startMs = animationNowMs - a.heldProgress * a.duration;
  a.startBeats = animationBeats() - a.heldProgress * (a.syncBeats || 1);
  a.paused = false;
  return true;
}

/** Turn a running animation around from where it is, travelling back at the SAME RATE — a move
 *  that was 80% done takes 80% of its duration to get home. `to(path, from)` would restart it at
 *  the full duration, so an almost-finished move would take as long to come back as the whole
 *  journey took: a bounce rather than a snap back. */
function animationReverseImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a) return false;
  const progress = animationProgress(a, animationNowMs, animationBeats());
  const target = a.from;
  a.from = a.to;
  a.to = target;
  // An envelope reverses its SHAPE as well as its direction — running the samples backwards,
  // which is what "play that envelope in reverse" means and what mirroring the points would only
  // approximate once a per-point curve is involved.
  if (a.kind === 'envelope') a.samples = [...a.samples].reverse();
  a.heldProgress = 1 - progress;
  a.startMs = animationNowMs - (1 - progress) * a.duration;
  a.startBeats = animationBeats() - (1 - progress) * (a.syncBeats || 1);
  return true;
}

/** Jump to the target and complete — done() fires with completed = true. stop() leaves the value
 *  stranded halfway, which is right for a cancel and wrong for "skip the animation". */
function animationFinishImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a) return false;
  setValue(a.path, animationValueOf(a, 1));
  fireAnimationDone(a, true);
  dropAnimation(key);
  return true;
}

/** Advance every animation to `nowMs` and write the values. Exported so tests drive time directly
 *  rather than sleeping — an animation test that waits on a real clock is a flaky test. */
export function tickAnimations(nowMs) {
  animationNowMs = Number(nowMs) || 0;
  animationTicked = true;
  if (!animations.size) return;
  const beats = animationBeats();
  // Iterate a copy: a set() can run a script that starts or stops an animation.
  for (const a of [...animations.values()]) {
    if (a.paused) continue;
    if (animations.get(a.path) !== a) continue;      // replaced mid-walk
    const progress = animationProgress(a, animationNowMs, beats);
    setValue(a.path, animationValueOf(a, progress));
    if (progress < 1) continue;

    // A cycle finished. Repeat if there is one left, else complete.
    if (a.repeat !== 0) {
      if (a.repeat > 0) a.repeat -= 1;
      a.cycle += 1;
      // ping-pong swaps the ends so the NEXT cycle comes back, which is the only way to express a
      // continuous modulator without a second verb that means the same thing.
      if (a.pingpong) { const t = a.from; a.from = a.to; a.to = t; }
      a.startMs = animationNowMs;
      a.startBeats = beats;
      continue;
    }
    fireAnimationDone(a, true);
    dropAnimation(a.path);
  }
}

/** Panel teardown: an animation writing into a panel that is gone is just noise — and neither is a
 *  completion callback into a script set that no longer exists, so nothing is fired here. */
export function stopAllAnimations() {
  animations.clear();
  animationGroups.clear();
  if (animationTimer != null) { clearInterval(animationTimer); animationTimer = null; }
  animationNowMs = 0;      // the next panel starts its own clock
  animationTicked = false;
}
// @module ce.ui
/* ----------------------------------------------------------------------------------- ce.ui */
// Telling the person using the panel something. Panel view only — there is nobody to tell with the
// window shut, which is why these are stubbed in the C++ engines rather than made cross-runtime.

// notify() returns its ID, not merely true. The id was always computed and then thrown away, and
// without it nothing else here is addressable: a message you cannot name is a message you cannot
// take back or replace, which is why "Sending dump… 40%" used to mean ten stacked toasts.
function uiNotifyImpl(message, opts) {
  const text = String(message ?? '').trim();
  if (!text) return undefined;
  return uiNotifyStore(text, {
    kind: opts?.kind,
    duration: opts?.duration != null ? Number(opts.duration) : undefined,
  }) ?? undefined;
}

/** Take a message back. No id clears every one — "stop saying things" is a real request, and making
 *  a script remember six ids to make it would be busywork. Returns how many went. */
function uiDismissImpl(id) {
  return uiDismissStore(id == null ? null : Number(id));
}

/** Replace a live message in place. Returns false when it has already gone, which is how a script
 *  learns its progress message was dismissed by hand and it should stop updating one. */
function uiUpdateImpl(id, message, opts) {
  if (id == null) return false;
  return uiUpdateStore(Number(id), message, {
    kind: opts?.kind,
    duration: opts?.duration != null ? Number(opts.duration) : undefined,
  });
}

function uiStatusImpl(message, opts) {
  uiStatusStore(message ?? '', { kind: opts?.kind });
  return true;
}

/** What is on screen. One read rather than three, and the only way a script can tell dialog()'s
 *  false apart: "nobody to ask" and "one already open" want different handling. */
function uiStateImpl() {
  return uiSnapshotStore();
}

/**
 * Put text on the clipboard — the thing the app itself does in six places (a colour, a console
 * dump, a parameter table) and a script could not do at all.
 *
 * The write is ASYNCHRONOUS and the browser may refuse it outright when the page has no user
 * gesture behind it, so the return says the copy was ATTEMPTED, not that it landed. Saying so is
 * better than a `true` that means less than it looks — the same rule ce.device.write follows.
 */
function uiCopyImpl(scriptId, text) {
  const value = text == null ? '' : String(text);
  if (!value) return false;
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
  if (!clip || typeof clip.writeText !== 'function') {
    addScriptTrace('log', scriptId ?? '',
      'ce.ui.copy(): this build has no clipboard to write to — nothing was copied.');
    return false;
  }
  try {
    const p = clip.writeText(value);
    // A rejected promise here is the browser declining, not a script error: reported, never thrown
    // into a handler that has long since returned.
    if (p && typeof p.catch === 'function') {
      p.catch(() => addScriptTrace('log', scriptId ?? '',
        'ce.ui.copy(): the browser refused the clipboard write (it usually wants a click behind it).'));
    }
  } catch {
    return false;
  }
  return true;
}

// dialog() asks a question, so it cannot answer it: the return value says whether anything was put
// on screen, and the ANSWER arrives through the callback. Returning false always means the callback
// has ALREADY run with no answer — a script never has to wonder whether it is still waiting.
function uiDialogImpl(scriptId, opts, onChoice) {
  const answer = (choice) => {
    // A dialog's answer arrives long after the handler that asked has returned, so the callback is
    // the one place a script's error can escape the dispatch path that would have reported it.
    try { if (typeof onChoice === 'function') onChoice(choice); }
    catch (e) { reportScriptError(scriptId, e); }
  };
  const id = uiDialogStore(opts, answer);
  if (id == null) { answer(undefined); return false; }
  return true;
}

// @module ce.draw
/* -------------------------------------------------------------------------------- ce.draw */
// Oscilloscopes, envelope editors, XY pads, readouts. Immediate mode: each verb appends a command
// carrying the style in force when it was issued, and the panel renders the list on top of the
// target control. Coordinates are the CONTROL's own — (0,0) at its top-left — so a drawing scales
// with whatever it is drawn on.
//
// Nothing repaints on its own. onDraw runs when something asks for it, and a script animates by
// calling ce.draw.redraw() from onTimer. A per-frame callback nobody asked for is a performance
// trap, and one that fires whether or not the panel is visible is a worse one.
//
// The command list is held in a store, never in the panel document: a drawing is a product of the
// script, not part of the document, and a scope trace persisted to disk would be meaningless.

// The style in force, and which control is being drawn on. Draws are not re-entrant — dispatch is
// already guarded by live.dispatching — so one set of style state is enough.
const drawState = {
  target: null, fill: null, stroke: null, strokeWidth: 1,
  dash: null, dashOffset: null, cap: null, join: null,
  opacity: null, transform: null, clip: null, blend: null,
};

// save()/restore() — the style was flat, so setting a stroke for one shape meant remembering what it
// had been and putting it back by hand, and getting that wrong changes every shape after it. The
// stack holds copies rather than references: a restore has to be unaffected by what was drawn in
// between (§49).
const drawStateStack = [];
const DRAW_STYLE_KEYS = [
  'fill', 'stroke', 'strokeWidth', 'dash', 'dashOffset', 'cap', 'join',
  'opacity', 'transform', 'clip', 'blend',
];

// Gradients get an id because SVG paints them by reference: the overlay defines each one once in
// <defs> and every shape using it points at that. Per panel rather than per draw pass, so a
// gradient reused across a redraw does not churn the defs list.
let gradientSeq = 0;

/** A gradient value, for fill() or stroke(). Stops are { at 0..1, colour, opacity }.
 *
 *  The ANGLE is the panel's own convention — 0 up, 90 right, the same one the Background section's
 *  gradients use — and the overlay resolves it with the app's gradientCoords(), which exists for
 *  exactly this and is documented as being for SVG userSpaceOnUse. A gradient built here and a
 *  gradient set in the Properties panel run in the same direction, which two conventions would not.
 */
function drawGradientImpl(stops, angle) {
  const raw = Array.isArray(stops) ? stops : Object.values(stops ?? {});
  const list = [];
  for (const stop of raw) {
    // Two spellings, because two shapes are natural: { at, colour } for a positioned stop, and a
    // bare colour string for "space these evenly", which is what a two-colour fade actually is.
    const colour = typeof stop === 'string' ? stop : String(stop?.colour ?? stop?.color ?? '');
    if (!colour) continue;
    const at = typeof stop === 'string' ? null : Number(stop?.at);
    list.push({
      colour,
      at: Number.isFinite(at) ? Math.min(1, Math.max(0, at)) : null,
      opacity: Number.isFinite(Number(stop?.opacity)) ? Math.min(1, Math.max(0, Number(stop.opacity))) : 1,
    });
  }
  if (list.length < 2) return undefined;   // a gradient between one colour and nothing is a colour
  // Unpositioned stops spread evenly across whatever room the positioned ones left them.
  list.forEach((st, i) => { if (st.at == null) st.at = list.length === 1 ? 0 : i / (list.length - 1); });
  gradientSeq += 1;
  return {
    gradient: true,
    id: `ce-draw-grad-${gradientSeq}`,
    angle: Number.isFinite(Number(angle)) ? Number(angle) : 180,
    stops: list,
  };
}

// controlId -> the commands drawn on it so far. Commands are appended and published as they
// arrive rather than buffered and published at the end of a draw pass: dispatchEvents is async
// (Lua and Python run through a WASM engine), so "the end of the pass" is not a moment this code
// can hold style state across without a second redraw clobbering it. Svelte batches store updates
// within a tick, so a half-drawn frame is not observable in practice.
const drawCommands = new Map();

/** Which control a draw verb applies to: the explicit target, else the one being drawn, else the
 *  control the script is attached to. */
function drawTarget(explicit, ownerName) {
  const name = explicit != null && String(explicit) !== '' ? String(explicit)
             : (drawState.target ?? ownerName);
  if (!name || name === PANEL_TARGET) return null;
  return controlNamed(name);
}

/** Append a command for `target`, with the style in force at this moment baked into it. */
function pushCommand(explicit, ownerName, command) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    addScriptTrace('error', '',
      'ce.draw: no control to draw on. Attach the script to a control, or pass a target name.');
    return false;
  }
  const id = control._children.Core.id;
  const list = drawCommands.get(id) ?? [];
  list.push({
    ...command,
    fill: drawState.fill, stroke: drawState.stroke, strokeWidth: drawState.strokeWidth,
    dash: drawState.dash, dashOffset: drawState.dashOffset,
    cap: drawState.cap, join: drawState.join,
    opacity: drawState.opacity, transform: drawState.transform,
    clip: drawState.clip, blend: drawState.blend,
  });
  drawCommands.set(id, list);
  // `list`, not `[...list]` (§49). Copying on every command made an append O(n) and a drawing O(n²):
  // 256 segments cost 21ms of array copying alone, more than a 60fps frame, before any rendering.
  // The overlay depends on `revision` rather than the array's identity so that this is safe.
  //
  // The remaining per-command cost is the store notification itself, and that is what batch()
  // removes — it cannot be removed implicitly, because dispatchEvents is async and "the end of the
  // draw pass" is not a moment this code can hold.
  if (drawBatchDepth > 0) drawBatchDirty.add(id);
  else setDrawing(id, list);
  return true;
}

// batch() suspends publishing, not recording: the commands still land in drawCommands as they are
// issued, so a script inside a batch sees exactly what a script outside one sees. Only the store
// notification is deferred, and only to the end of the block.
let drawBatchDepth = 0;
const drawBatchDirty = new Set();

function runDrawBatch(fn) {
  if (typeof fn !== 'function') return false;
  drawBatchDepth += 1;
  try {
    fn();
  } catch (e) {
    addScriptTrace('error', '', String(e?.message ?? e));
  } finally {
    // finally, not catch-and-continue: a throwing block must not leave publishing suspended, or
    // every later draw in the panel silently stops appearing. Same rule noTransmit follows.
    drawBatchDepth -= 1;
    if (drawBatchDepth === 0) {
      for (const id of drawBatchDirty) setDrawing(id, drawCommands.get(id) ?? []);
      drawBatchDirty.clear();
    }
  }
  return true;
}

/* --- the bulk primitives (design doc §49) ------------------------------------------------------
 *
 * A grid was a loop of drawLine, and a loop was the expensive thing: n commands, n store
 * notifications, n SVG elements. These are ONE command and one element for the whole lot, which is
 * the difference between a step grid being affordable and being the reason a panel drops frames.
 *
 * `segments` carries disjoint line pairs and renders as a single <path> of M/L moves — grid() is
 * just the special case that computes a lattice, so both share one op and one renderer branch.
 */

/** A flat list of [x1, y1, x2, y2] segments from whatever shape the script passed. */
function toSegmentList(value) {
  const out = [];
  if (!value) return out;
  const list = Array.isArray(value) ? value : Object.values(value);
  for (const item of list) {
    const seg = Array.isArray(item) ? item : (item && typeof item === 'object'
      ? [item.x1 ?? item[0], item.y1 ?? item[1], item.x2 ?? item[2], item.y2 ?? item[3]]
      : null);
    if (!seg) continue;
    const [a, b, c, d] = seg.map((n) => Number(n));
    if ([a, b, c, d].every((n) => Number.isFinite(n))) out.push([a, b, c, d]);
  }
  return out;
}

function drawGridImpl(explicit, ownerName, opts) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    addScriptTrace('error', '', 'ce.draw.grid: no control to draw on.');
    return false;
  }
  const transform = control._children?.Transform ?? {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const x = Number(o.x ?? 0);
  const y = Number(o.y ?? 0);
  const w = Number(o.width ?? (Number(transform.width) || 0) - x);
  const h = Number(o.height ?? (Number(transform.height) || 0) - y);

  // Spacing OR counts, because both are the natural way to ask depending on what you know: a step
  // sequencer knows it has 16 columns, a ruler knows it wants a line every 10 pixels.
  const cols = Number(o.columns ?? 0);
  const rows = Number(o.rows ?? 0);
  const stepX = cols > 0 ? w / cols : Number(o.stepX ?? o.step ?? 0);
  const stepY = rows > 0 ? h / rows : Number(o.stepY ?? o.step ?? 0);

  if (!(stepX > 0) && !(stepY > 0)) {
    addScriptTrace('error', '',
      'ce.draw.grid: needs a spacing or a count — { step }, { stepX, stepY } or { columns, rows }.');
    return false;
  }

  const segments = [];
  // <= so the closing line is drawn: a 4-column grid over 100px has lines at 0, 25, 50, 75 AND 100,
  // and a grid missing its right edge looks like a bug in the panel rather than in the call.
  if (stepX > 0) for (let gx = x; gx <= x + w + 0.0001; gx += stepX) segments.push([gx, y, gx, y + h]);
  if (stepY > 0) for (let gy = y; gy <= y + h + 0.0001; gy += stepY) segments.push([x, gy, x + w, gy]);
  return pushCommand(explicit, ownerName, { op: 'segments', segments });
}

function drawLinesImpl(explicit, ownerName, value) {
  const segments = toSegmentList(value);
  if (!segments.length) {
    addScriptTrace('error', '',
      'ce.draw.lines: no segments. Pass a list of [x1, y1, x2, y2] — one command for all of them, '
      + 'which is the point of this over a loop of line().');
    return false;
  }
  return pushCommand(explicit, ownerName, { op: 'segments', segments });
}

function drawPointsImpl(explicit, ownerName, value, radius) {
  const list = value ? (Array.isArray(value) ? value : Object.values(value)) : [];
  const points = [];
  for (const item of list) {
    const pair = Array.isArray(item) ? item : (item && typeof item === 'object' ? [item.x, item.y] : null);
    if (!pair) continue;
    const [px, py] = pair.map((n) => Number(n));
    if (Number.isFinite(px) && Number.isFinite(py)) points.push([px, py]);
  }
  if (!points.length) {
    addScriptTrace('error', '', 'ce.draw.points: no points. Pass a list of [x, y].');
    return false;
  }
  const r = Number(radius) > 0 ? Number(radius) : 1.5;
  return pushCommand(explicit, ownerName, { op: 'dots', points, r });
}

function drawCurveImpl(explicit, ownerName, value, opts) {
  const list = value ? (Array.isArray(value) ? value : Object.values(value)) : [];
  const points = [];
  for (const item of list) {
    const pair = Array.isArray(item) ? item : (item && typeof item === 'object' ? [item.x, item.y] : null);
    if (!pair) continue;
    const [px, py] = pair.map((n) => Number(n));
    if (Number.isFinite(px) && Number.isFinite(py)) points.push([px, py]);
  }
  if (points.length < 2) {
    addScriptTrace('error', '', 'ce.draw.curve: needs at least two points.');
    return false;
  }
  // A curve was inexpressible before: you approximated it with straight segments, which meant a
  // loop, which was the expensive thing. `tension` 0 is a polyline and 1 is fully round.
  const tension = Math.max(0, Math.min(1, Number(opts?.tension ?? 0.5)));
  return pushCommand(explicit, ownerName, {
    op: 'curve', points, tension, closed: opts?.closed === true,
  });
}

function drawPolygonImpl(explicit, ownerName, cx, cy, r, sides, opts) {
  const n = Math.max(3, Math.round(Number(sides) || 3));
  const radius = Number(r) || 0;
  const x = Number(cx) || 0;
  const y = Number(cy) || 0;
  // Rotation in the panel's drawing convention: degrees, 0 at twelve o'clock, clockwise — the same
  // one drawArc uses, so a polygon and an arc drawn at the same angle line up.
  const from = ((Number(opts?.rotation) || 0) - 90) * (Math.PI / 180);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const a = from + (i * 2 * Math.PI) / n;
    points.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
  }
  // Emitted as an ordinary closed path — no new renderer branch needed for a shape that IS one.
  return pushCommand(explicit, ownerName, { op: 'path', points, closed: true });
}

/**
 * How wide a string will be, which nothing could ask before — so a box behind a label, a column of
 * right-aligned numbers or a truncation had no way to be worked out.
 *
 * Two fonts, two answers, and only one of them is exact. The PIXEL font is a grid: the width is
 * arithmetic and the answer is exact everywhere. A proportional font has to be MEASURED, which
 * means a canvas and therefore a browser — so with no measuring surface this reports and falls back
 * to an estimate rather than pretending. Panel view only either way, like everything in ce.draw.
 */
function drawMeasureImpl(text, opts) {
  const str = String(text ?? '');
  const size = Number(opts?.size) > 0 ? Number(opts.size) : 12;
  if (opts?.pixel === true) {
    const scale = Math.max(1, Math.round(Number(opts?.scale) || 1));
    // FONT_ADVANCE per character, minus the trailing gap: a string ends at its last lit column.
    return { width: str.length ? str.length * PIXEL_ADVANCE * scale - scale : 0,
             height: PIXEL_FONT_H * scale, exact: true };
  }
  const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
    ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) {
    // 0.6em per character is the usual rule of thumb for a proportional face. Said to be an
    // estimate rather than returned as though it were a measurement.
    return { width: str.length * size * 0.6, height: size, exact: false };
  }
  ctx.font = `${size}px ${opts?.family || 'sans-serif'}`;
  return { width: ctx.measureText(str).width, height: size, exact: true };
}

/* --- ce.text: typography a script can reason about (design doc §46) ----------------------------
 *
 * Text.Font has 41 fields, Text.Multiline 11 and Text.Position around 40, and set() could already
 * write every one of them by path. So this module adds no reach — it adds the three things a bare
 * path write cannot do:
 *
 *  1. KNOW WHAT EXISTS. The font catalogue is a store the Properties panel reads and scripting
 *     could not. set("…Font.family", "Helvetca") stored the typo and fell back silently.
 *  2. KEEP THE INVARIANTS. weight/weightValue are a pair and the two halves are read by different
 *     consumers, so writing one desynchronises the editor from the render. See textStyle.js.
 *  3. MEASURE ITSELF. drawMeasure has to be handed a size and family; nothing could ask what a
 *     control's own text occupies in its own font, which is what any fit-to-box needs.
 *
 * Every write goes back out through setValue(), so intercepts, the transmit rule and the host all
 * apply exactly as they do to a hand-written set() — this is a better-behaved caller, not a back
 * door. And every write verb reports by READING BACK, the §44 rule: the answer is whether the
 * control now holds what was asked, not whether a store call was made.
 */

/** The font catalogue as descriptors, from the app's own availableFonts store. */
function textCatalogue() {
  return fontCatalogue(get(availableFonts));
}

/** The Font node of a control, or nothing when it has no Text section (a Knob has none). */
function textFontNode(name) {
  const font = getValue(`${name}.Text.Font`);
  return font && typeof font === 'object' ? font : null;
}

/** Report the same way for every ce.text verb that needs a Text section and did not find one. */
function textNeedsTextSection(verb, name) {
  addScriptTrace('error', '',
    `ce.text.${verb}("${name}"): this control has no Text section, so it has no typography. `
    + 'ce.panel.info() reports the type; a Knob or a Meter draws its own labels.');
  return undefined;
}

/** Apply one planned write. `variationAxes` carries { tag, value } and lands on the sub-key. */
function textApplyWrite(name, write) {
  const base = `${name}.Text.${write.section}`;
  if (write.field === 'variationAxes') {
    const path = `${base}.variationAxes.${write.value.tag}`;
    setValue(path, write.value.value);
    return Number(getValue(path)) === Number(write.value.value);
  }
  const path = `${base}.${write.field}`;
  setValue(path, write.value);
  const now = getValue(path);
  // Numbers cross the boundary as numbers but may have been clamped by the model; comparing
  // loosely would call a clamp a success. Comparing the READ-BACK is the point of doing it.
  return typeof write.value === 'number' ? Number(now) === write.value : now === write.value;
}

/* --- ce.image: the layers, and which of them will survive an export (design doc §50) ------------
 *
 * The fields were always writable by path — a Label has 102 of them, a Knob 864 — and nothing in the
 * API named one. What this adds is the same three things ce.text added for fonts: knowing what
 * exists, keeping the invariants, and being honest about portability. See imageLayers.js for why
 * each of those is more than a wrapper here.
 */

function imageCatalogue() {
  return assetCatalogue(get(storedIcons));
}

/** The layer for a name, reporting rather than guessing when the name is not one. */
function resolveImageLayer(verb, target, id) {
  const layer = imageLayer(id);
  if (layer) return layer;
  addScriptTrace('error', '',
    `ce.image.${verb}("${target}", "${id}"): no such layer. One of: ${IMAGE_LAYER_IDS.join(', ')}.`);
  return null;
}

/** The layer's node on a control, or nothing when the control has no such section. */
function imageNode(name, layer) {
  const node = getValue(`${name}.${layer.node}`);
  return node && typeof node === 'object' ? node : null;
}

function imageNeedsNode(verb, name, layer) {
  addScriptTrace('error', '',
    `ce.image.${verb}("${name}"): this control has no ${layer.node}, so it has no ${layer.label}. `
    + 'ce.panel.info() reports the type.');
  return undefined;
}

/** Apply one planned write and report whether the node now holds it. */
function imageApplyWrite(name, layer, write) {
  const path = write.raw
    ? `${name}.${layer.node}.${write.raw}`
    : `${name}.${layer.node}.${write.field}`;
  setValue(path, write.value);
  const now = getValue(path);
  return typeof write.value === 'number' ? Number(now) === write.value : now === write.value;
}

/** Background layers composite in `layerOrder`, so a layer that is enabled but absent from the order
 *  is set up and invisible. Adding it is part of turning it on. */
function ensureLayerOrder(name, layer) {
  if (layer.activation !== 'layer') return;
  const path = `${name}.${layer.node}.layerOrder`;
  const order = getValue(path);
  if (!Array.isArray(order)) return;
  if (order.includes(layer.prefix)) return;
  setValue(path, [...order, layer.prefix]);
}

function imageSetImpl(target, src, opts) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('set', name, opts?.layer);
  if (!layer) return false;
  if (!imageNode(name, layer)) return imageNeedsNode('set', name, layer) ?? false;

  const { writes, refused } = planImage(layer, src, opts);
  for (const problem of refused) {
    addScriptTrace('error', '',
      `ce.image.set("${name}"): ${problem.option} refused — ${problem.reason}.`);
  }
  if (!writes.length) return false;

  let all = true;
  for (const write of writes) if (!imageApplyWrite(name, layer, write)) all = false;
  if (src) ensureLayerOrder(name, layer);

  // A file path renders nothing until the host has read it, so ask — otherwise a script setting a
  // path source sees a blank layer and no reason for it.
  if (src && sourceKind(src) === 'file') loadFile(String(src));

  return all && refused.length === 0;
}

function imageClearImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('clear', name, layerId);
  if (!layer) return false;
  if (!imageNode(name, layer)) return imageNeedsNode('clear', name, layer) ?? false;

  let all = true;
  for (const write of planClear(layer)) if (!imageApplyWrite(name, layer, write)) all = false;
  return all;
}

function imageReadImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('read', name, layerId);
  if (!layer) return undefined;
  const node = imageNode(name, layer);
  if (!node) return imageNeedsNode('read', name, layer);

  const out = {};
  for (const field of layer.fields) {
    const key = `${layer.prefix}${field}`;
    // Lower-cased first letter, so a script reads { src, fit, opacity } rather than { Src, Fit }.
    out[field.charAt(0).toLowerCase() + field.slice(1)] = node[key];
  }
  const src = String(node[`${layer.prefix}Src`] ?? '');
  return {
    ...out,
    layer: layer.id,
    // The honest part, and the reason this verb reports more than the fields: `active` is whether the
    // layer will actually paint, which for an exclusive Text layer depends on `mode` and not on
    // `Enabled` at all.
    active: layer.activation === 'mode'
      ? String(node.mode ?? 'solid') === layer.mode
      : (node[`${layer.prefix}Enabled`] === true && node[`${layer.prefix}Muted`] !== true),
    source: sourceKind(src),
    portable: isPortableSource(src),
  };
}

function imageEmbedImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('embed', name, layerId);
  if (!layer) return false;
  const node = imageNode(name, layer);
  if (!node) return imageNeedsNode('embed', name, layer) ?? false;

  const src = String(node[`${layer.prefix}Src`] ?? '');
  if (!src) {
    addScriptTrace('error', '', `ce.image.embed("${name}"): the ${layer.label} has no source.`);
    return false;
  }
  if (isPortableSource(src)) return true;      // already a data URL; embedding is a no-op, not a failure

  // A file path only has a data URL once the host has read it. Nothing here can wait — the read is
  // asynchronous — so this reports what it did rather than pretending: it asks for the file and says
  // it is not ready yet, and the same call succeeds once the cache holds it.
  const cached = get(fileCache)[src];
  if (!cached || !String(cached).startsWith('data:')) {
    loadFile(src);
    addScriptTrace('error', '',
      `ce.image.embed("${name}"): "${src}" is not loaded yet. The host reads files asynchronously — `
      + 'the read has been requested, so calling this again once it lands will embed it.');
    return false;
  }
  return imageApplyWrite(name, layer, { field: `${layer.prefix}Src`, value: cached });
}

/** Icon section — a different shape from the fill layers: a reference into the icon library rather
 *  than a source, with its own size/fit/tint fields. */
function imageIconImpl(target, idOrName, opts) {
  const name = String(target ?? '');
  const icon = getValue(`${name}.Icon`);
  if (!icon || typeof icon !== 'object') {
    addScriptTrace('error', '',
      `ce.image.icon("${name}"): this control has no Icon section.`);
    return false;
  }
  const asset = findAsset(imageCatalogue(), idOrName);
  if (!asset) {
    addScriptTrace('error', '',
      `ce.image.icon("${name}", "${idOrName}"): no such asset in the icon library. `
      + 'ce.image.assets() lists them.');
    return false;
  }

  // Both id AND name, because the renderer resolves by id first and falls back to matching the name —
  // writing only one leaves the fallback deciding, and a coincidental name match looks like success.
  let all = true;
  for (const [field, value] of [['assetId', asset.id], ['name', asset.name], ['source', 'library']]) {
    setValue(`${name}.Icon.${field}`, value);
    if (getValue(`${name}.Icon.${field}`) !== value) all = false;
  }
  for (const [key, field] of [['size', 'size'], ['fit', 'fit'], ['tint', 'tint'],
    ['opacity', 'opacity'], ['rotation', 'rotation']]) {
    if (opts?.[key] === undefined) continue;
    const value = key === 'tint' ? String(opts[key]).replace(/^#/, '') : opts[key];
    setValue(`${name}.Icon.${field}`, value);
  }
  return all;
}

function textStyleImpl(target, opts) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('style', name) ?? false;

  const catalogue = textCatalogue();
  const { writes, refused } = planStyle(opts, {
    descriptor: findFont(catalogue, font.family), catalogue,
  });

  for (const problem of refused) {
    addScriptTrace('error', '',
      `ce.text.style("${name}"): ${problem.option} refused — ${problem.reason}.`);
  }
  if (!writes.length) return false;

  let all = true;
  for (const write of writes) if (!textApplyWrite(name, write)) all = false;
  // Refusing one option and honouring another is a partial success, and partial is not true. A
  // script that checks the return gets "the control does not hold everything you asked for".
  return all && refused.length === 0;
}

function textAxisImpl(target, tag, value) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('axis', name) ?? false;

  const descriptor = findFont(textCatalogue(), font.family);
  const { writes, refused } = planAxis(descriptor, tag, value);
  for (const problem of refused) {
    addScriptTrace('error', '',
      `ce.text.axis("${name}", "${problem.option}"): refused — ${problem.reason}. `
      + `ce.text.font("${font.family}") reports the axes it has.`);
  }
  if (!writes.length) return false;
  let all = true;
  for (const write of writes) if (!textApplyWrite(name, write)) all = false;
  return all;
}

/** Which Text child a read name belongs to, so read("L", "lineHeight") works without the script
 *  having to know that line height is Multiline's and size is Font's. */
const TEXT_READ_SECTIONS = ['Font', 'Multiline', 'Position'];

function textReadImpl(target, field) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('read', name);

  const clean = (node) => (node && typeof node === 'object'
    ? Object.fromEntries(Object.entries(node).filter(([k]) => !k.startsWith('_')))
    : {});

  if (field === undefined || field === null || field === '') {
    // The whole resolved state in one call, which is what makes typography snapshot/restore-able
    // without naming ninety fields. `content` and the resolved weight ride along because both are
    // things a script asks for immediately and neither is a Font field.
    return {
      content: String(getValue(`${name}.Text.content`) ?? ''),
      resolvedWeight: resolvedWeight(font),
      font: clean(font),
      multiline: clean(getValue(`${name}.Text.Multiline`)),
      position: clean(getValue(`${name}.Text.Position`)),
    };
  }

  const wanted = String(field);
  for (const section of TEXT_READ_SECTIONS) {
    const node = section === 'Font' ? font : getValue(`${name}.Text.${section}`);
    if (!node || typeof node !== 'object') continue;
    const key = Object.keys(node).find((k) => k.toLowerCase() === wanted.toLowerCase());
    if (key !== undefined && !key.startsWith('_')) return node[key];
  }
  if (wanted.toLowerCase() === 'content') return String(getValue(`${name}.Text.content`) ?? '');

  addScriptTrace('error', '',
    `ce.text.read("${name}", "${field}"): no such text field. ce.text.read("${name}") returns `
    + 'everything, grouped as font / multiline / position.');
  return undefined;
}

/**
 * Measure a control's own text, in its own font, through the renderer's own layout.
 *
 * This calls buildBlockTextLayout — the same function CanvasControl lays text out with — so the
 * answer is the layout that will actually be painted rather than a second implementation that
 * agrees with it until one of them changes. `exact` is honest for the same reason drawMeasure's is:
 * the layout measures on an offscreen canvas, and with no document to make one it falls back to a
 * per-glyph estimate.
 */
function textMeasureImpl(target, text) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('measure', name);

  const multiline = getValue(`${name}.Text.Multiline`) ?? {};
  const info = getValue(`${name}.Transform`) ?? {};
  const position = getValue(`${name}.Text.Position`) ?? {};
  const content = text === undefined || text === null
    ? String(getValue(`${name}.Text.content`) ?? '')
    : String(text);

  const padX = Number(position.paddingLeft ?? 0) + Number(position.paddingRight ?? 0);
  const width = Math.max(0, Number(info.width ?? 0) - padX);

  const layout = buildBlockTextLayout(content, {
    fontSection: font,
    family: font.family || 'Arial',
    maxWidth: width,
    wrapMode: String(multiline.wrapMode ?? 'word'),
    paragraphMode: String(multiline.paragraphMode ?? 'normal'),
    overflowMode: String(multiline.overflowMode ?? 'clip'),
    maxLines: Number(multiline.maxLines ?? 0),
    lineHeightMultiplier: Number(multiline.lineHeight ?? 1.2),
  });

  return {
    width: layout.width,
    height: layout.height,
    lines: Array.isArray(layout.lines) ? layout.lines.length : 0,
    truncated: layout.truncated === true,
    exact: typeof document !== 'undefined' && typeof document.createElement === 'function',
  };
}

/**
 * Shrink Font.size until the text fits the control's box, and report what it settled on.
 *
 * Text.Multiline.fitMode = "shrink" already scales text down at PAINT time — but it is a paint-time
 * scale: the stored size never changes, so nothing can ask what size it ended up at and nothing
 * else can be aligned to the result. This writes the size, which is the difference between "it
 * looks right" and "it is a number other layout can use".
 *
 * A descending search over integer sizes rather than a binary one: the sizes are integers, the
 * range is small, and measuring is cheap next to being subtly off by a pixel at the boundary.
 */
function textFitImpl(target, opts) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('fit', name);

  const min = Math.max(1, Number(opts?.min ?? 6));
  const max = Math.max(min, Number(opts?.max ?? Number(font.size ?? 12)));
  const info = getValue(`${name}.Transform`) ?? {};
  const position = getValue(`${name}.Text.Position`) ?? {};
  const boxW = Math.max(0, Number(info.width ?? 0)
    - Number(position.paddingLeft ?? 0) - Number(position.paddingRight ?? 0));
  const boxH = Math.max(0, Number(info.height ?? 0)
    - Number(position.paddingTop ?? 0) - Number(position.paddingBottom ?? 0));

  if (boxW <= 0 || boxH <= 0) {
    addScriptTrace('error', '',
      `ce.text.fit("${name}"): the control has no box to fit into (width ${info.width ?? 0} x `
      + `height ${info.height ?? 0} less padding), so there is no size to choose.`);
    return undefined;
  }

  const multiline = getValue(`${name}.Text.Multiline`) ?? {};
  const content = opts?.text === undefined || opts?.text === null
    ? String(getValue(`${name}.Text.content`) ?? '')
    : String(opts.text);
  const started = Number(font.size ?? 12);

  // Measure at each candidate by handing the layout the REAL Font node with only the size swapped:
  // letter spacing, word spacing and script mode all change the answer, and re-deriving them here
  // would be the second implementation this verb exists to avoid.
  const fitsAt = (size) => {
    const probe = buildBlockTextLayout(content, {
      fontSection: { ...font, size },
      family: font.family || 'Arial',
      maxWidth: boxW,
      wrapMode: String(multiline.wrapMode ?? 'word'),
      overflowMode: String(multiline.overflowMode ?? 'clip'),
      maxLines: Number(multiline.maxLines ?? 0),
      lineHeightMultiplier: Number(multiline.lineHeight ?? 1.2),
    });
    return probe.width <= boxW + 0.5 && probe.height <= boxH + 0.5;
  };

  let chosen = Math.round(min);
  let fitted = false;
  for (let size = Math.round(max); size >= Math.round(min); size -= 1) {
    if (fitsAt(size)) { chosen = size; fitted = true; break; }
  }

  setValue(`${name}.Text.Font.size`, chosen);
  return {
    size: Number(getValue(`${name}.Text.Font.size`)),
    fits: fitted,
    changed: Number(getValue(`${name}.Text.Font.size`)) !== started,
    exact: typeof document !== 'undefined' && typeof document.createElement === 'function',
  };
}

function drawClearImpl(explicit, ownerName) {
  const control = drawTarget(explicit, ownerName);
  if (!control) return false;
  const id = control._children.Core.id;
  drawCommands.delete(id);
  clearDrawing(id);
  return true;
}

function toPointList(points) {
  // A flat { x1, y1, x2, y2, ... } list — the one shape every language expresses the same way: a
  // Lua table, a JS array, a Python list. An odd trailing value is dropped rather than silently
  // pairing with a zero.
  const flat = Array.isArray(points) ? points : Object.values(points ?? {});
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = Number(flat[i]);
    const y = Number(flat[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

/**
 * Run one control's onDraw. The style resets first — a draw must not inherit the colours the last
 * one happened to leave set, or a drawing changes depending on what ran before it.
 */
function runDrawPass(control) {
  const core = control?._children?.Core;
  if (!core?.id) return false;

  const transform = control._children?.Transform ?? {};
  drawState.target = core.name;
  drawState.fill = null;
  drawState.stroke = null;
  drawState.strokeWidth = 1;
  // …and everything the style grew in §41. A draw that inherited the dash or the transform the last
  // one happened to leave set would look different depending on what ran before it, which is the
  // whole reason this reset exists.
  drawState.dash = null;
  drawState.dashOffset = null;
  drawState.cap = null;
  drawState.join = null;
  drawState.opacity = null;
  drawState.transform = null;
  drawState.clip = null;
  drawState.blend = null;
  // …and the save() stack, which is style state too: a pass that saved and never restored would
  // otherwise leak a growing stack into every later pass, and a stray restore() in the next frame
  // would pop something from the last one.
  drawStateStack.length = 0;

  dispatchEvents([{
    event: 'onDraw',
    controlName: core.name,
    payload: { target: core.name, width: Number(transform.width) || 0, height: Number(transform.height) || 0 },
  }]);
  return true;
}

function drawRedrawImpl(explicit, ownerName) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    addScriptTrace('error', '',
      'ce.draw.redraw(): no control to redraw. Attach the script to a control, or pass a target name.');
    return false;
  }
  return runDrawPass(control);
}

/** What a control currently has drawn on it. Exported for the renderer and the tests. */
export function drawCommandsFor(controlName) {
  const control = controlNamed(controlName);
  return control ? (drawCommands.get(control._children.Core.id) ?? []) : [];
}

/** Forget every drawing — panel teardown, or a switch to another panel. */
export function clearAllDrawings() {
  drawCommands.clear();
  clearDrawing(null);
  // Reset the style too. It is module-level (draws are not re-entrant), so without this a colour
  // set on one panel is still in force on the next — a drawing that changes depending on what ran
  // before it is exactly the kind of order-dependence immediate mode is supposed to remove.
  drawState.target = null;
  drawState.fill = null;
  drawState.stroke = null;
  drawState.strokeWidth = 1;
  // …and everything the style grew in §41. A draw that inherited the dash or the transform the last
  // one happened to leave set would look different depending on what ran before it, which is the
  // whole reason this reset exists.
  drawState.dash = null;
  drawState.cap = null;
  drawState.join = null;
  drawState.opacity = null;
  drawState.transform = null;
}

// @module ce.panel
/* ------------------------------------------------------------------- ce.panel structure */
// Panels that build themselves: ask the device what it has, then generate a control per thing you
// found. The one capability the options UI structurally cannot provide.
//
// PANEL VIEW ONLY, and not by choice — creating a control needs a renderer, and there is none with
// the window shut. The C++ engines stub these with the same explaining stubs every webview-only
// verb gets, and `onPanelBuild` is declared webview-only so they are never reached there.
//
// THE IDEMPOTENCE RULE, which is what makes this safe to ship: everything a script creates carries
// `Core.generatedBy`, and every generated control is removed before onPanelBuild runs. So a build
// always starts from the authored panel, running it twice cannot double the layout, and the panel
// the author saves is still the panel the author drew. `serializePanel` strips them for the same
// reason — a generated control is a product of the script, not a part of the document.
//
// The cost of that rule, stated rather than discovered: a generated control is NOT in the exported
// parameter list and cannot be DAW-automated. It is driven from a script, or not at all.

const GENERATED_KEY = 'generatedBy';

/** Mutate the active panel's control tree through the same store update the editor uses. */
function updateControls(fn) {
  const panel = activePanel();
  if (!panel) { addScriptTrace('error', '', 'ce.panel: no active panel to build.'); return false; }
  const next = fn(panel.controls ?? []);
  if (next == null) return false;
  if (host) { panel.controls = next; return true; }        // player: the host owns the document
  updatePanel(panel.id, { controls: next });
  return true;
}

function allControls() {
  return flatControls(activePanel()?.controls ?? []);
}

function controlNamed(name) {
  const wanted = String(name ?? '').toLowerCase();
  if (!wanted) return null;
  return allControls().find((c) => String(c?._children?.Core?.name ?? '').toLowerCase() === wanted)
    ?? allControls().find((c) => String(c?._children?.Core?.id ?? '') === String(name))
    ?? null;
}

/** A name nothing else is using, so a generated control never collides with an authored one. */
function uniqueControlName(base) {
  const taken = new Set(allControls().map((c) => String(c?._children?.Core?.name ?? '').toLowerCase()));
  const root = String(base ?? 'control');
  if (!taken.has(root.toLowerCase())) return root;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${root}${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${root}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Apply the flat convenience props (name/x/y/width/height) plus any section overrides. */
function applyControlProps(control, props = {}, scriptId = '') {
  const core = control._children.Core;
  const transform = control._children.Transform;
  if (props.name != null) core.name = String(props.name);
  for (const [prop, key] of [['x', 'x'], ['y', 'y'], ['width', 'width'], ['height', 'height']]) {
    if (props[prop] != null && Number.isFinite(Number(props[prop]))) transform[key] = Number(props[prop]);
  }
  // Section overrides: { Behavior: { min: 0, max: 127 } } and friends, merged not replaced, so a
  // script setting one field does not wipe the rest of the section.
  for (const [section, values] of Object.entries(props)) {
    if (!control._children[section] || typeof values !== 'object' || values == null) continue;
    control._children[section] = { ...control._children[section], ...values };
  }
  core[GENERATED_KEY] = scriptId || 'script';
  return control;
}

function panelCreateImpl(type, props, scriptId) {
  const typeName = String(type ?? '');
  if (!COMPONENT_TYPES[typeName]) {
    addScriptTrace('error', '',
      `ce.panel.create("${typeName}"): no such component type. ce.panel.types() lists them.`);
    return null;
  }
  let control;
  try { control = createControl(typeName); }
  catch (e) { addScriptTrace('error', '', `ce.panel.create("${typeName}"): ${e?.message ?? e}`); return null; }

  applyControlProps(control, props ?? {}, scriptId);
  control._children.Core.name = uniqueControlName(control._children.Core.name);

  const parentName = props?.parent ? String(props.parent) : null;
  const parent = parentName ? controlNamed(parentName) : null;
  if (parentName && !parent) {
    addScriptTrace('error', '', `ce.panel.create: no control named "${parentName}" to parent into.`);
  }
  const parentId = parent && isContainerControl(parent) ? parent._children.Core.id : null;
  if (parent && !parentId) {
    addScriptTrace('error', '',
      `ce.panel.create: "${parentName}" is not a container (it has no Children section), so the new control went to the top level.`);
  }

  return updateControls((controls) => insertControlIntoTree(controls, parentId, control))
    ? control._children.Core.name
    : null;
}

function panelCloneImpl(name, props, scriptId) {
  const source = controlNamed(name);
  if (!source) { addScriptTrace('error', '', `ce.panel.clone: no control named "${name}".`); return null; }

  const copy = remintControlIds(source);
  applyControlProps(copy, props ?? {}, scriptId);
  if (props?.name == null) copy._children.Core.name = `${source._children.Core.name}_copy`;
  copy._children.Core.name = uniqueControlName(copy._children.Core.name);
  // A clone lands beside its source by default: in the same container, not at the top level.
  const parentName = props?.parent != null ? String(props.parent) : null;
  const parent = parentName ? controlNamed(parentName)
                            : findParentOfControl(activePanel()?.controls ?? [], source._children.Core.id);
  const parentId = parent && isContainerControl(parent) ? parent._children.Core.id : null;

  return updateControls((controls) => insertControlIntoTree(controls, parentId, copy))
    ? copy._children.Core.name
    : null;
}

function panelDestroyImpl(name) {
  const control = controlNamed(name);
  if (!control) return false;
  const id = control._children.Core.id;
  // removeControlFromTree returns { controls, removed } — the node comes back so a caller that is
  // MOVING rather than deleting can re-insert the real subtree instead of a copy of it.
  return updateControls((controls) => removeControlFromTree(controls, id).controls);
}

function panelParentImpl(name, containerName) {
  const control = controlNamed(name);
  if (!control) { addScriptTrace('error', '', `ce.panel.parent: no control named "${name}".`); return false; }

  let parentId = null;
  if (containerName != null && String(containerName) !== '') {
    const parent = controlNamed(containerName);
    if (!parent) { addScriptTrace('error', '', `ce.panel.parent: no control named "${containerName}".`); return false; }
    if (!isContainerControl(parent)) {
      addScriptTrace('error', '',
        `ce.panel.parent: "${containerName}" is not a container — only a control with a Children section can hold one.`);
      return false;
    }
    if (parent._children.Core.id === control._children.Core.id) {
      addScriptTrace('error', '', 'ce.panel.parent: a control cannot contain itself.');
      return false;
    }
    // …nor can it be moved inside its own subtree, which would detach both from the panel.
    if (flatControls([control]).some((c) => c._children.Core.id === parent._children.Core.id)) {
      addScriptTrace('error', '',
        `ce.panel.parent: "${containerName}" is inside "${name}", so moving one into the other would detach both.`);
      return false;
    }
    parentId = parent._children.Core.id;
  }

  const id = control._children.Core.id;
  return updateControls((controls) => {
    const { controls: without, removed } = removeControlFromTree(controls, id);
    // Re-insert the node that came OUT, not a copy of the one we looked up: the subtree keeps its
    // ids, so anything already addressing a child by name still resolves after the move.
    return removed ? insertControlIntoTree(without, parentId, removed) : null;
  });
}

function controlSummary(control, controls) {
  const core = control?._children?.Core ?? {};
  const transform = control?._children?.Transform ?? {};
  const parent = findParentOfControl(controls, core.id);
  return {
    name: core.name ?? '', id: core.id ?? '', type: core.controlType ?? '',
    x: Number(transform.x) || 0, y: Number(transform.y) || 0,
    width: Number(transform.width) || 0, height: Number(transform.height) || 0,
    parent: parent?._children?.Core?.name ?? null,
    generated: core[GENERATED_KEY] != null,
  };
}

function panelFindImpl(query) {
  const controls = activePanel()?.controls ?? [];
  const q = typeof query === 'string' ? { name: query } : (query ?? {});
  return flatControls(controls)
    .map((c) => ({ control: c, info: controlSummary(c, controls) }))
    .filter(({ info }) => {
      if (q.name != null && !info.name.toLowerCase().includes(String(q.name).toLowerCase())) return false;
      if (q.type != null && info.type !== String(q.type)) return false;
      if (q.generated != null && info.generated !== (q.generated === true)) return false;
      if (q.parent != null && info.parent !== String(q.parent)) return false;
      return true;
    })
    .map(({ info }) => info.name);
}

function panelInfoImpl(name) {
  const control = controlNamed(name);
  if (!control) return null;
  return controlSummary(control, activePanel()?.controls ?? []);
}

/* ------------------------------------------------------ ce.panel: arranging what is there (§42)
 * stores/alignment.js is twenty-seven operations — align, distribute, match size, order, flip,
 * tidy into a grid, arrange in a circle — every one of them on the canvas context menu and not one
 * of them reachable from a script. A script that built sixteen pads computed every coordinate by
 * hand, and got tidy's reading-order sort or circle's bounding-box centring subtly different.
 *
 * They were all written against the editor's SELECTION, which is not a thing a script should touch.
 * So the maths moved into pure functions there, and these verbs take a list of NAMES and call the
 * same ones. Six collapsed verbs rather than twenty-seven members: align(names, "left") beats
 * alignLeft(names), and it is the shape ce.time.division and ce.music.degreeChord already use.
 *
 * Transforms are gathered in PANEL space — Transform.x inside a container is container-relative,
 * and aligning two controls in different containers by their local x is aligning nothing — and
 * written back through the same offset, which is exactly what the editor does.
 */

/** Transforms for a list of names, in PANEL space, skipping names that are not controls. */
function panelTransforms(names, verb) {
  const list = Array.isArray(names) ? names : (names == null ? [] : Object.values(names));
  const controls = activePanel()?.controls ?? [];
  const out = [];
  for (const raw of list) {
    const control = controlNamed(raw);
    if (!control) {
      addScriptTrace('error', '', `ce.panel.${verb}: no control named "${raw}".`);
      continue;
    }
    const id = control._children?.Core?.id;
    const t = control._children?.Transform ?? {};
    const offset = controlPanelOffset(controls, id);
    out.push({
      id,
      name: control._children?.Core?.name ?? '',
      x: (Number(t.x) || 0) + offset.x,
      y: (Number(t.y) || 0) + offset.y,
      width: Number(t.width) || 0,
      height: Number(t.height) || 0,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }
  return out;
}

/**
 * Write a { id: patch } map back, converting panel-space coordinates to each control's own frame —
 * which is the step that makes aligning two controls in different containers mean anything.
 *
 * One tree rewrite rather than a property write per control, and deliberately: an arrangement is
 * ONE change to the document. Writing forty properties one at a time would be forty store updates,
 * forty re-renders, and — with the history debounce running underneath — an unpredictable number of
 * undo steps for a single "tidy these".
 *
 * Returns how many controls moved, the same "say what you did" contract set() follows.
 */
function panelApplyPatches(transforms, patches) {
  const byId = new Map(transforms.map((t) => [t.id, t]));
  const resolved = new Map();
  for (const [id, patch] of patches) {
    const t = byId.get(id);
    if (!t || !patch) continue;
    const local = {};
    for (const [path, value] of Object.entries(patch)) {
      const field = path.replace(/^Transform\./, '');
      local[field] = (field === 'x' || field === 'y')
        ? Math.round(value - (field === 'x' ? (t.offsetX ?? 0) : (t.offsetY ?? 0)))
        : value;
    }
    resolved.set(id, local);
  }
  if (!resolved.size) return 0;

  const apply = (list) => list.map((c) => {
    const id = c?._children?.Core?.id;
    const patch = resolved.get(id);
    const kids = c?._children?.Children?._children;
    let next = c;
    if (patch) {
      next = { ...next, _children: { ...next._children,
        Transform: { ...(next._children?.Transform ?? {}), ...patch } } };
    }
    if (kids && typeof kids === 'object') {
      const ordered = apply(Object.values(kids));
      const rebuilt = {};
      for (const child of ordered) rebuilt[child._children.Core.name] = child;
      next = { ...next, _children: { ...next._children,
        Children: { ...next._children.Children, _children: rebuilt } } };
    }
    return next;
  });

  return updateControls((controls) => apply(controls)) ? resolved.size : 0;
}

const ALIGN_EDGES = ['left', 'hCenter', 'right', 'top', 'vCenter', 'bottom'];

function panelAlignImpl(names, edge, opts) {
  const which = String(edge ?? '');
  if (!ALIGN_EDGES.includes(which)) {
    addScriptTrace('error', '',
      `ce.panel.align: "${edge}" is not an edge. One of: ${ALIGN_EDGES.join(', ')}.`);
    return 0;
  }
  const transforms = panelTransforms(names, 'align');
  if (!transforms.length) return 0;
  // The reference is the group's own bounds, or one named control — "align these to that one",
  // which is what the canvas calls a key object.
  const keyName = opts?.to != null ? String(opts.to) : null;
  const key = keyName ? transforms.find((t) => t.name === keyName || t.id === keyName) : null;
  if (keyName && !key) addScriptTrace('error', '', `ce.panel.align: "${keyName}" is not one of the names given.`);
  const ref = key ? { x: key.x, y: key.y, width: key.width, height: key.height } : boundsOf(transforms);
  const patches = new Map();
  for (const t of transforms) {
    const patch = alignPatch(t, which, ref);
    if (patch) patches.set(t.id, patch);
  }
  return panelApplyPatches(transforms, patches);
}

const DISTRIBUTE_WHAT = ['leftEdges', 'hCenters', 'rightEdges', 'topEdges', 'vCenters',
                         'bottomEdges', 'hSpacing', 'vSpacing'];

function panelDistributeImpl(names, what, opts) {
  const which = String(what ?? '');
  if (!DISTRIBUTE_WHAT.includes(which)) {
    addScriptTrace('error', '',
      `ce.panel.distribute: "${what}" is not something to spread. One of: ${DISTRIBUTE_WHAT.join(', ')}.`);
    return 0;
  }
  const transforms = panelTransforms(names, 'distribute');
  if (transforms.length < 2) return 0;
  const gap = Number(opts?.gap);
  return panelApplyPatches(transforms, distributePatches(
    transforms, which, Number.isFinite(gap) ? gap : null, opts?.align === true));
}

function panelMatchImpl(names, what, opts) {
  const which = String(what ?? 'both');
  if (!['width', 'height', 'both'].includes(which)) {
    addScriptTrace('error', '', `ce.panel.match: "${what}" is not width, height or both.`);
    return 0;
  }
  const transforms = panelTransforms(names, 'match');
  if (transforms.length < 2) return 0;
  // The first name is the reference unless one is named, which is the canvas's rule too.
  const keyName = opts?.to != null ? String(opts.to) : null;
  const key = (keyName ? transforms.find((t) => t.name === keyName || t.id === keyName) : null) ?? transforms[0];
  const patches = new Map();
  for (const t of transforms) {
    if (t.id === key.id) continue;                       // the reference does not resize itself
    patches.set(t.id, matchPatch(key, which));
  }
  return panelApplyPatches(transforms, patches);
}

function panelGridImpl(names, opts) {
  const transforms = panelTransforms(names, 'grid');
  if (transforms.length < 2) return 0;
  return panelApplyPatches(transforms, gridPatches(
    transforms,
    Number.isFinite(Number(opts?.columns)) ? Number(opts.columns) : 3,
    Number.isFinite(Number(opts?.gapX)) ? Number(opts.gapX) : 10,
    Number.isFinite(Number(opts?.gapY)) ? Number(opts.gapY) : 10));
}

function panelCircleImpl(names, opts) {
  const transforms = panelTransforms(names, 'circle');
  if (transforms.length < 2) return 0;
  return panelApplyPatches(transforms, circlePatches(
    transforms,
    Number.isFinite(Number(opts?.radius)) ? Number(opts.radius) : 100,
    Number.isFinite(Number(opts?.startAngle)) ? Number(opts.startAngle) : 0));
}

function panelFlipImpl(names, axis) {
  const which = String(axis ?? 'horizontal');
  if (!['horizontal', 'vertical'].includes(which)) {
    addScriptTrace('error', '', `ce.panel.flip: "${axis}" is not horizontal or vertical.`);
    return 0;
  }
  const transforms = panelTransforms(names, 'flip');
  if (transforms.length < 2) return 0;
  return panelApplyPatches(transforms, flipPatches(transforms, which));
}

/**
 * Where a control IS, in PANEL coordinates — which Transform.x is not, once anything is inside a
 * container. With several names it is the bounding box of the lot, which is what "how big is this
 * group" means.
 */
function panelRectImpl(names) {
  const list = Array.isArray(names) ? names : [names];
  const transforms = panelTransforms(list, 'rect');
  if (!transforms.length) return undefined;
  if (transforms.length === 1) {
    const t = transforms[0];
    return { x: t.x, y: t.y, width: t.width, height: t.height,
             right: t.x + t.width, bottom: t.y + t.height };
  }
  const b = boundsOf(transforms);
  return { ...b, right: b.x + b.width, bottom: b.y + b.height };
}

/**
 * Z-order. `where` is front | forward | backward | back.
 *
 * Order is DOCUMENT order, not a property, so this rewrites the sibling list rather than setting a
 * value — which is why set() could never do it. Controls are reordered within their own parent:
 * moving something to the front of a container it is not in is not a thing.
 */
function panelOrderImpl(names, where) {
  const which = String(where ?? '');
  if (!['front', 'forward', 'backward', 'back'].includes(which)) {
    addScriptTrace('error', '', `ce.panel.order: "${where}" is not front, forward, backward or back.`);
    return 0;
  }
  const wanted = new Set(panelTransforms(names, 'order').map((t) => t.id));
  if (!wanted.size) return 0;

  const reorder = (siblings) => {
    const mine = siblings.filter((c) => wanted.has(c?._children?.Core?.id));
    if (!mine.length) return siblings;
    const rest = siblings.filter((c) => !wanted.has(c?._children?.Core?.id));
    // Later in the list paints later, so "front" is the END. Getting this backwards is the classic
    // way a bring-to-front sends something behind everything.
    if (which === 'front') return [...rest, ...mine];
    if (which === 'back') return [...mine, ...rest];
    const arr = [...siblings];
    if (which === 'forward') {
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (wanted.has(arr[i]?._children?.Core?.id) && !wanted.has(arr[i + 1]?._children?.Core?.id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
    } else {
      for (let i = 1; i < arr.length; i += 1) {
        if (wanted.has(arr[i]?._children?.Core?.id) && !wanted.has(arr[i - 1]?._children?.Core?.id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
    }
    return arr;
  };

  // Every level of the tree, because a selection can span containers and each one's siblings are
  // its own list.
  const walk = (list) => reorder(list).map((c) => {
    const kids = c?._children?.Children?._children;
    if (!kids || typeof kids !== 'object') return c;
    const ordered = walk(Object.values(kids));
    const rebuilt = {};
    for (const child of ordered) rebuilt[child._children.Core.name] = child;
    return { ...c, _children: { ...c._children, Children: { ...c._children.Children, _children: rebuilt } } };
  });

  return updateControls((controls) => walk(controls)) ? wanted.size : 0;
}

/**
 * batch(fn) — everything `fn` does is ONE undo step.
 *
 * The history store debounces its snapshots, which groups a drag nicely and leaves a script that
 * creates forty controls landing as an unpredictable number of steps. pushSnapshot() flushes on
 * demand, so bracketing the work gives exactly one — and a script that builds a page deserves to be
 * undone as "build the page", not forty times.
 *
 * The flush happens whatever the callback does, including throwing: a half-built panel that cannot
 * be undone is worse than a half-built panel.
 */
function panelBatchImpl(scriptId, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'ce.panel.batch(fn) needs a function to run — nothing was done.');
    return false;
  }
  if (host) { fn(); return true; }        // the player has no history to group
  pushSnapshot();                          // close whatever came before
  try { fn(); } finally { pushSnapshot(); }
  return true;
}

/* ------------------------------------------------- ce.panel: the collections inside a control */
// The Properties panel can ADD TO and REMOVE FROM eleven sections of a control. `Children` is one
// of them and ce.panel.create/destroy already covers it; these four cover the other ten, which
// until now a script could only reach by writing a whole node as one value and could not remove
// from at all — removeControlNode has existed the whole time and nothing script-facing called it.
//
// One verb family rather than ten, for the reason deviceQuery is one primitive rather than four:
// the sections differ in what an entry MEANS, not in how it is added, listed or dropped.
const COLLECTION_SECTIONS = [
  'States', 'Bindings', 'Animations', 'Parts',
  'ValueChannels', 'Behaviors', 'HitZones', 'Generators', 'Links', 'Variants',
];

// A partial spec is completed from these, so declaring a state is one line rather than a
// hand-written node. Only shapes the app itself defines are here; a section without one takes the
// spec as given, with `_type` filled in.
const COLLECTION_TEMPLATES = {
  States: (name) => ({
    _type: 'State', name, group: 'interaction', description: '', enabled: true,
    when: {}, patches: { component: {}, parts: {} },
  }),
};

/** Resolve (control, section) with the section name matched case-insensitively, as paths are. */
function collectionNode(controlName, section, verb) {
  const control = controlNamed(controlName);
  if (!control) { addScriptTrace('error', '', `ce.panel.${verb}: no control named "${controlName}".`); return null; }
  const wanted = String(section ?? '').toLowerCase();
  const key = COLLECTION_SECTIONS.find((s) => s.toLowerCase() === wanted);
  if (!key) {
    addScriptTrace('error', '',
      `ce.panel.${verb}: "${section}" is not a collection section. The ones a script can add to are `
      + `${COLLECTION_SECTIONS.join(', ')} — a control is added with ce.panel.create instead.`);
    return null;
  }
  return { control, key, node: control._children?.[key] ?? null };
}

/** entries(control, section) — the names in a collection, in document order. */
function panelEntriesImpl(controlName, section) {
  const found = collectionNode(controlName, section, 'entries');
  if (!found) return [];
  return Object.keys(found.node?._children ?? {});
}

/** entry(control, section, name) — one entry, or nil. Matched case-insensitively, as paths are. */
function panelEntryImpl(controlName, section, name) {
  const found = collectionNode(controlName, section, 'entry');
  if (!found) return null;
  const kids = found.node?._children ?? {};
  const wanted = String(name ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  return key == null ? null : kids[key];
}

/**
 * define(control, section, name, spec) — create an entry, or replace one that is there.
 *
 * The spec is MERGED over the section's template rather than used as-is, so
 * `define("k", "States", "Warn", { when = { valueGreaterThan = 0.9 } })` produces a state that
 * actually works. Hand-writing `_type`, `patches.component` and `patches.parts` every time is how
 * a verb like this ends up unused.
 */
function panelDefineImpl(controlName, section, name, spec) {
  const found = collectionNode(controlName, section, 'define');
  if (!found) return false;
  const key = String(name ?? '').trim();
  if (!key) { addScriptTrace('error', '', 'ce.panel.define(control, section, name, spec): a name is required'); return false; }
  if (!found.node) {
    addScriptTrace('error', '', `ce.panel.define: "${controlName}" has no ${found.key} section.`);
    return false;
  }

  const template = COLLECTION_TEMPLATES[found.key]?.(key) ?? { _type: found.key.replace(/s$/, '') };
  const given = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
  const entry = { ...template, ...given, name: given.name ?? key };
  // One level of merge for the nested shapes a template carries, so a spec that names only
  // `patches.component` does not drop `patches.parts`.
  for (const field of Object.keys(template)) {
    const t = template[field];
    const g = given[field];
    if (t && typeof t === 'object' && !Array.isArray(t) && g && typeof g === 'object' && !Array.isArray(g)) {
      entry[field] = { ...t, ...g };
    }
  }

  writeControlProperty(found.control, `${found.key}.${key}`, entry);
  addScriptTrace('log', '', `ce.panel.define ${controlName}.${found.key}.${key}`);
  return true;
}

/** undefine(control, section, name) — returns whether there was one, so "already gone" reads
    differently from "removed". */
function panelUndefineImpl(controlName, section, name) {
  const found = collectionNode(controlName, section, 'undefine');
  if (!found) return false;
  const kids = found.node?._children ?? {};
  const wanted = String(name ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  if (key == null) return false;

  if (host) delete kids[key];                                        // player: the host owns the document
  else removeControlNode(found.control._children.Core.id, `${found.key}.${key}`);
  addScriptTrace('log', '', `ce.panel.undefine ${controlName}.${found.key}.${key}`);
  return true;
}

/**
 * patch(control, state, patch [, part]) — merge entries into a state's patch map.
 *
 * This verb exists because the addressing model cannot express what it addresses. A patch map's
 * KEYS are themselves dotted paths — `{ "Background.Fill.colour": "FFFF0000" }` — so
 * `set("k.States.Hover.patches.component.Background.Fill.colour", …)` walks off the end of the
 * model looking for three sections that are one key. `set` can only replace the whole map, which
 * means "make this one thing red when hovered" requires knowing everything else the state already
 * changes.
 *
 * MERGE, never replace, and no way to spell "remove this key": a nil-valued key is simply absent
 * from a Lua table, so a delete-by-nil convention would be unwritable in one of the five languages.
 * Dropping keys is `set()` on the whole map, which already works.
 */
function panelPatchImpl(controlName, stateName, patch, part) {
  const found = collectionNode(controlName, 'States', 'patch');
  if (!found) return 0;
  const kids = found.node?._children ?? {};
  const wanted = String(stateName ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  if (key == null) {
    addScriptTrace('error', '',
      `ce.panel.patch: "${controlName}" has no state called "${stateName}". `
      + `It has ${Object.keys(kids).join(', ') || 'none'} — ce.panel.define creates one.`);
    return 0;
  }
  const entries = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : null;
  if (!entries) { addScriptTrace('error', '', 'ce.panel.patch(control, state, patch): patch must be a table of path -> value'); return 0; }

  const state = kids[key];
  const target = String(part ?? '');
  const base = state.patches ?? (state.patches = { component: {}, parts: {} });
  let map;
  if (target) {
    base.parts ??= {};
    base.parts[target] ??= {};
    map = base.parts[target];
  } else {
    base.component ??= {};
    map = base.component;
  }

  let n = 0;
  for (const [path, value] of Object.entries(entries)) {
    map[String(path)] = value;
    n += 1;
  }
  // Written back through the same door every structure write uses, so the editor store and the
  // player host both see it — mutating the node in place would move the object and not the panel.
  writeControlProperty(found.control, `States.${key}.patches`, base);
  addScriptTrace('log', '',
    `ce.panel.patch ${controlName}.${key}${target ? `.parts.${target}` : ''}: ${n} key(s)`);
  return n;
}

/**
 * snapshot() / restore() — every control's value, captured and put back.
 *
 * A control with no value of its own is LEFT OUT rather than recorded as nothing: restoring must
 * not be able to blank a Label by writing undefined over it. And restore SKIPS a name the panel no
 * longer has rather than failing the whole call — a snapshot taken before an edit is still worth
 * most of what it holds, and an all-or-nothing restore would throw the rest away.
 */
/** each(fn) — fn(name) for every control, containers included, in document order. */
function panelEachImpl(scriptId, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'each(fn) needs a function to call — nothing was walked');
    return 0;
  }
  const panel = activePanel();
  if (!panel) return 0;
  let n = 0;
  // The names are collected BEFORE any is handed over: a callback that creates or destroys a
  // control would otherwise be mutating the list it is being walked through.
  const names = flatControls(panel.controls ?? [])
    .map((c) => c?._children?.Core?.name).filter(Boolean);
  for (const name of names) {
    try { fn(name); n += 1; } catch (e) { reportScriptError(scriptId ?? '', e); return n; }
  }
  return n;
}

function panelSnapshotImpl() {
  const panel = activePanel();
  const out = {};
  if (!panel) return out;
  for (const control of flatControls(panel.controls ?? [])) {
    const name = control?._children?.Core?.name;
    if (!name) continue;
    const v = getValue(`${name}.value`);
    if (v !== undefined && v !== null) out[name] = v;
  }
  return out;
}

function panelRestoreImpl(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return 0;
  let n = 0;
  for (const [name, value] of Object.entries(snap)) {
    if (getValue(`${name}.value`) === undefined) continue;
    setValue(`${name}.value`, value);
    n += 1;
  }
  addScriptTrace('log', '', `panel restore: ${n} of ${Object.keys(snap).length} value(s)`);
  return n;
}

/**
 * Remove every control a script generated. Called before onPanelBuild, which is what makes a build
 * idempotent — and called on panel teardown, so a session never leaves generated controls behind.
 */
export function clearGeneratedControls() {
  const panel = activePanel();
  if (!panel) return 0;
  const ids = flatControls(panel.controls ?? [])
    .filter((c) => c?._children?.Core?.[GENERATED_KEY] != null)
    .map((c) => c._children.Core.id);
  if (!ids.length) return 0;
  updateControls((controls) => ids.reduce((acc, id) => removeControlFromTree(acc, id).controls, controls));
  return ids.length;
}

/** Is this control one a script made? Used by the save path, which strips them. */
export function isGeneratedControl(control) {
  return control?._children?.Core?.[GENERATED_KEY] != null;
}

// @module ce.time
const timers = new Map();   // id -> interval handle

// Sync timers that FOLLOW the tempo: id -> beats. See syncTimerRead — a verb called sync that
// silently desyncs on the first tempo change was the wrong default, so following is the default and
// the freeze is the opt-in.
const syncFollowers = new Map();

/** Drop the interval without touching what the id means. startTimer and stopTimer differ in exactly
    that: stopping a timer forgets it was ever a sync timer, re-timing it does not. */
function clearTimerHandle(key) {
  const handle = timers.get(key);
  if (handle === undefined) return;
  clearInterval(handle);
  timers.delete(key);
}

function startTimer(id, ms) {
  const key = String(id ?? '');
  if (!key) return;
  const period = Math.max(1, Math.round(Number(ms) || 0));
  clearTimerHandle(key);
  // An explicit millisecond interval REPLACES a musical one — startTimer over a sync timer is a
  // script saying it wants this many milliseconds, not this many beats.
  syncFollowers.delete(key);
  timers.set(key, setInterval(() => {
    // A one-shot is not a timer the panel declared, so it must NOT surface as onTimer — every
    // script with an onTimer handler would have to learn to filter ids it never created.
    if (runAfterCallback(key)) return;
    dispatchEvents([{ event: 'onTimer', controlName: null, payload: { id: key } }]);
  }, period));
}

function stopTimer(id) {
  const key = String(id ?? '');
  syncFollowers.delete(key);
  clearTimerHandle(key);
}

/**
 * after(ms, fn) — run `fn` once, then forget it.
 *
 * Built on the same timer map rather than on setTimeout, so it behaves identically to the C++
 * preludes (which have no setTimeout and build it on startTimer) and so `stopTimer(id)` cancels it
 * the way it cancels anything else. One map, one cancel verb, one set of semantics.
 *
 * The order inside the tick is the whole point of having this instead of a self-cancelling timer:
 * the entry is removed and the timer stopped BEFORE the callback runs, so a callback that throws
 * cannot leave a one-shot repeating forever — which is exactly what hand-rolled versions do.
 */
let afterSeq = 0;
const afterCallbacks = new Map();   // timer id -> the function to run once

function afterFor(scriptId, ms, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'after(ms, fn) needs a function to run — nothing was scheduled');
    return undefined;
  }
  afterSeq += 1;
  const id = `__after:${afterSeq}`;
  // The owner is stored with the callback so a throw inside it is reported against the script that
  // scheduled it. By the time it fires there is no dispatch in progress to infer that from.
  afterCallbacks.set(id, { fn, scriptId: scriptId ?? '' });
  startTimer(id, ms);
  return id;
}

/** Schedule a one-shot the runtime owns, rather than one a script asked for. Used by sendNote's
    duration, where the note off is the runtime's promise to keep and no script should be able to
    cancel it by id. */
function scheduleOneShot(ms, fn) { return afterFor('', ms, fn); }

/** Fire a one-shot if this tick belongs to one. Returns true when it handled the tick. */
function runAfterCallback(id) {
  const entry = afterCallbacks.get(id);
  if (!entry) return false;
  afterCallbacks.delete(id);
  stopTimer(id);
  try { entry.fn(); } catch (e) { reportScriptError(entry.scriptId, e); }
  return true;
}

function stopAllTimers() {
  afterCallbacks.clear();   // a one-shot outliving its panel would fire into nothing
  for (const handle of timers.values()) clearInterval(handle);
  timers.clear();
}

// @module ce.time
/* -------------------------------------------------------------------------- ce.time reads */
// The editor follows its own master clock (stores/transport.js), which follows the DAW when the
// panel's transport source is "host" and an incoming MIDI clock when it is "external". The player
// follows the DAW playhead directly. Both answer the same questions, which is what makes ce.time
// cross-runtime rather than player-only.
//
// Nothing here starts or stops the transport. A panel does not own the clock, and a script that
// could start it would be fighting whatever else is driving the panel.

function transportSnapshot() {
  const t = get(transportStore) ?? {};
  const bpm = Number(t.bpm);
  return {
    playing: t.running === true,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
    beats: Number(t.beats) || 0,
    beatsPerBar: Number(t.beatsPerBar) > 0 ? Number(t.beatsPerBar) : 4,
    source: String(t.source ?? 'internal'),
    // The editor's clock always exists, so a position is always available — unlike a DAW that may
    // report no playhead at all. Saying valid:true here is a measurement, not a guess.
    valid: true,
  };
}

function transportInfoRead() {
  const t = transportSnapshot();
  return {
    ...t,
    bar: Math.floor(t.beats / t.beatsPerBar) + 1,
    beat: Math.floor(t.beats % t.beatsPerBar) + 1,
  };
}

const tempoRead = () => transportSnapshot().bpm;
const isPlayingRead = () => transportSnapshot().playing;

function beatsToMsRead(beats, bpm) {
  const rate = Number(bpm) > 0 ? Number(bpm) : tempoRead();
  if (!rate || rate <= 0) return null;
  return (Number(beats) || 0) * 60000 / rate;
}

function msToBeatsRead(ms, bpm) {
  const rate = Number(bpm) > 0 ? Number(bpm) : tempoRead();
  if (!rate || rate <= 0) return null;
  return (Number(ms) || 0) * rate / 60000;
}

/**
 * syncTimer(id, beats [, opts]) — a timer whose interval is MUSICAL.
 *
 * It follows the tempo. That is a change from the first version, which computed the interval once
 * and then kept firing at the old rate for the rest of the session: a verb called sync that
 * silently desyncs is the wrong default, and nobody deliberately relies on a sixteenth that stops
 * being a sixteenth. `{ follow = false }` keeps the old behaviour for anyone who wants it.
 *
 * Re-arming RESETS THE PHASE — the timer restarts from the moment the tempo changed rather than
 * continuing on the old grid. Said out loud rather than hidden: a one-off hiccup at the moment of a
 * tempo change beats a timer that is permanently at the wrong rate, but it is a hiccup.
 */
function syncTimerRead(id, beats, opts) {
  const key = String(id ?? '');
  const ms = beatsToMsRead(beats);
  if (ms == null) {
    addScriptTrace('log', '',
      `syncTimer("${id}"): no tempo is being reported, so there is no interval to compute. `
      + 'Use startTimer with a millisecond interval, or wait for onTransport.');
    return;
  }
  startTimer(key, Math.round(ms));            // clears any previous follow…
  const follow = !(opts && opts.follow === false);
  if (!follow) return;
  syncFollowers.set(key, Number(beats) || 0);  // …and this puts it back on purpose
  watchTempoForSyncTimers();
}

/** Re-time every following sync timer at the new tempo. Only when the tempo ACTUALLY changes, not
    on every transport publish — the store ticks at ~30Hz and re-arming that often would mean a
    timer that never fires.

    This rides its own subscription rather than the live event dispatch, and deliberately: the timer
    is already running, and it should stay in time whether or not the editor's Live toggle is on and
    whether or not any script is listening. Armed lazily, so a panel with no sync timers subscribes
    to nothing. */
let syncTempoUnsub = null;
let syncLastBpm = null;

function reArmSyncTimers() {
  for (const [key, beats] of [...syncFollowers]) {
    const ms = beatsToMsRead(beats);
    if (ms == null) continue;                 // no tempo any more: leave it running at the last one
    startTimer(key, Math.round(ms));
    syncFollowers.set(key, beats);
  }
}

function watchTempoForSyncTimers() {
  if (syncTempoUnsub) return;
  syncLastBpm = transportSnapshot().bpm;
  syncTempoUnsub = transportStore.subscribe((state) => {
    const raw = Number(state?.bpm);
    const bpm = Number.isFinite(raw) && raw > 0 ? raw : null;
    if (bpm === syncLastBpm) return;
    syncLastBpm = bpm;
    if (bpm !== null) reArmSyncTimers();
  });
}

/**
 * afterBeats(beats, fn) — after() with a MUSICAL delay. The pair syncTimer/startTimer already had;
 * the one-shot did not, so "play this in half a bar" meant computing the milliseconds by hand.
 *
 * A one-shot fires once, so it does not follow the tempo: the delay is computed when you call it,
 * the same as beatsToMs would. Nothing is scheduled when there is no tempo to work from, and it
 * says so rather than firing immediately.
 */
function afterBeatsFor(scriptId, beats, fn) {
  const ms = beatsToMsRead(beats);
  if (ms == null) {
    addScriptTrace('log', scriptId ?? '',
      'afterBeats(): no tempo is being reported, so there is no delay to compute. '
      + 'Use after() with milliseconds, or wait for onTransport.');
    return undefined;
  }
  return afterFor(scriptId, Math.round(ms), fn);
}

/** The timer ids currently running, sorted — the ones a script started BY NAME.
 *
 * One-shots are left out, all of them. They are anonymous machinery: after() hands back its id, so
 * listing it adds nothing, and the runtime's own (sendNote's note-off) must not be cancellable by a
 * script at all. Excluding the whole class rather than only the runtime's is also what keeps the
 * answer the same in every runtime — the C++ preludes build sendNote's note-off on after(), so a
 * rule that depended on who owned a one-shot would report differently there. */
function runningTimersRead() {
  return [...timers.keys()].filter((id) => !id.startsWith('__after:')).sort();
}

// @module ce.device
/* ------------------------------------------------------------------------ ce.device reads */
// What the synth actually IS, rather than what the panel author remembered. Four reads, backed in
// the C++ engines by one host primitive; here they answer from the editor's device stores, which
// are the same data the device host would report.
//
// ONE HONEST ASYMMETRY, stated rather than hidden. In the player, listProfileParameters is a
// synchronous call into DeviceProfileService and deviceParameters() is complete on the first call.
// In the EDITOR the parameter table arrives over the async bridge and is cached per profile, so the
// first call on a cold cache has nothing to return. It says so, requests the load, and the next
// call is complete — which is the best a synchronous verb can do over an asynchronous source, and
// far better than returning an empty list that looks like "this synth has no parameters".

const parameterRequests = new Set();   // profileIds we have already asked for, to not spam the bridge

function roleMapping(role) {
  const mappings = get(deviceRoleMappings) ?? {};
  return mappings[role] ?? mappings[DEFAULT_ROLE] ?? null;
}

function deviceProfileRead(role = DEFAULT_ROLE) {
  const mapping = roleMapping(role);
  const profileId = mapping?.profileId;
  if (!profileId) return null;
  const listed = (get(deviceProfiles) ?? []).find((p) => String(p?.id) === String(profileId)) ?? null;
  const session = (get(deviceSessionState) ?? {})[role] ?? null;
  return {
    id: profileId,
    name: listed?.name ?? profileId,
    role,
    connected: String(session?.state ?? '') === 'ready',
    state: String(session?.state ?? 'unknown'),
    midiDestination: mapping?.midiDestination?.name ?? mapping?.midiDestination?.id ?? '',
    midiInput: mapping?.midiInput?.name ?? mapping?.midiInput?.id ?? '',
  };
}

function deviceConnectedRead(role = DEFAULT_ROLE) {
  return String((get(deviceSessionState) ?? {})[role]?.state ?? '') === 'ready';
}

/**
 * read / write — the half of phase 2 that was missing. parameters() said WHAT the synth has and
 * there was then no way to touch one unless a control happened to be bound to it.
 *
 * `read` is the LAST KNOWN value: what the synth most recently told us, from a dump or a parameter
 * message, mirrored in deviceRuntimeState. It is NOT a live query — asking the synth is
 * asynchronous and this verb is not — and nothing comes back when the device has never reported it,
 * which a script must be able to tell apart from zero.
 */
function deviceValueRead(id, role) {
  const key = String(id ?? '');
  if (!key) return undefined;
  const forRole = (get(deviceRuntimeState) ?? {})[role];
  if (!forRole || typeof forRole !== 'object') return undefined;
  const v = forRole[key];
  return v === null ? undefined : v;
}

/**
 * `write` encodes through the device profile and sends. The return says the message was DISPATCHED,
 * not that the synth accepted it — the send crosses the bridge asynchronously and nothing here can
 * know the answer synchronously. Saying so is better than a `true` that means less than it looks.
 */
function deviceValueWrite(id, value, role) {
  const key = String(id ?? '');
  if (!key) {
    addScriptTrace('error', '', 'deviceWrite(id, value): a parameter id is required');
    return false;
  }
  // A parameter the SCRIPT declared carries its own wire format, so it is compiled here and sent
  // as raw bytes. That is the whole reason defineParameter exists: this path needs no profile, and
  // so it works on a synth the app has never heard of.
  if (hasDefinedParameter(role, key)) {
    const encoded = encodeRuntimeParameter(role, key, value);
    if (!encoded.ok) { addScriptTrace('error', '', `deviceWrite(${JSON.stringify(key)}): ${encoded.error}`); return false; }
    sendRawMidi(encoded.bytes, `param_${key}`);
    return true;
  }
  if (!isJuceAvailable()) {
    addScriptTrace('error', '',
      `deviceWrite(${JSON.stringify(key)}) needs the device host — encoding a parameter is the device `
      + 'profile\'s codec, which runs in the host. It works in the exported plugin.');
    return false;
  }
  // dryRun false: actually send it. The same path a control bound to this parameter takes, so a
  // scripted change and a knob turn are indistinguishable downstream.
  commitDeviceParameter({ deviceRole: role, parameterId: key, value, dryRun: false });
  addScriptTrace('midi', '', `deviceWrite ${key} = ${JSON.stringify(value)}`);
  return true;
}

/**
 * The parameters this role has, from BOTH sources: the shipped profile, and whatever the script
 * declared with defineParameter. Declared ones come last, so a declaration that reuses a profile
 * id overrides it — which is what lets a script correct one wrong parameter in an otherwise good
 * profile without having to redeclare the rest.
 */
function deviceParametersRead(opts = {}) {
  const role = opts.role || DEFAULT_ROLE;
  const declared = definedParameters(role);
  const profileId = roleMapping(role)?.profileId;

  let fromProfile = [];
  if (profileId) {
    const cached = (get(profileParameters) ?? {})[profileId];
    if (Array.isArray(cached) && cached.length) {
      fromProfile = cached;
    } else {
      // Cold cache. Ask for it, and SAY so — an empty list here means "not loaded", which is a very
      // different thing from "this synth has no parameters", and a script that cannot tell them
      // apart will draw the wrong conclusion silently.
      if (!parameterRequests.has(profileId)) {
        parameterRequests.add(profileId);
        try { refreshProfileParameters({ profileId, deviceRole: role }); } catch { /* no bridge */ }
      }
      addScriptTrace('log', '',
        `deviceParameters(): the parameter table for "${profileId}" has not been loaded yet — `
        + 'requesting it now. Call again from a later handler (onTimer is the usual place). '
        + 'In the exported plugin this read is synchronous and complete on the first call.');
    }
  } else if (!declared.length) {
    // No profile AND nothing declared is the only case that is genuinely an error now. With
    // declarations in hand there is nothing wrong with having no profile — that is the case
    // defineParameter was built for.
    addScriptTrace('error', '',
      `deviceParameters(): no device profile is mapped to the "${role}" role, and this panel has `
      + 'declared no parameters. Map a profile, or declare what the synth has with defineParameter().');
    return [];
  }

  const byId = new Map();
  for (const p of [...fromProfile, ...declared]) byId.set(String(p?.id ?? ''), p);

  const wanted = (field, value) => !value || String(field ?? '').toLowerCase().includes(String(value).toLowerCase());
  let out = [...byId.values()].filter((p) => wanted(p?.group, opts.group)
    && wanted(p?.type, opts.type)
    && wanted(p?.access, opts.access)
    && (!opts.query
      || String(p?.id ?? '').toLowerCase().includes(String(opts.query).toLowerCase())
      || String(p?.name ?? '').toLowerCase().includes(String(opts.query).toLowerCase())));
  const limit = Number(opts.limit);
  if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
  return out;
}

function deviceParameterRead(id, role = DEFAULT_ROLE) {
  const wanted = String(id ?? '');
  if (!wanted) return null;
  // A declared parameter answers without touching the profile cache, so `parameter()` on a synth
  // with no profile is a plain lookup rather than a cold-cache notice about a table that will
  // never arrive.
  const own = definedParameter(role, wanted);
  if (own) return own;
  const all = deviceParametersRead({ role });
  return all.find((p) => String(p?.id) === wanted) ?? null;
}

/** Forget which profiles we have asked for — used when the device session is torn down. */
export function resetDeviceReadCache() { parameterRequests.clear(); }

/* ------------------------------------------------- ce.device: declaring what the app does not know */
// Everything above READS a device profile the app was shipped with. That is a hard ceiling: a panel
// can only address a synth somebody already wrote a profile for, which excludes most of what is
// actually in people's racks. These four verbs write the structure instead of reading it.
//
// The codec lives in deviceDefinitions.js; what is here is the script-facing shape and the
// reporting. Declarations are script-lifetime and are dropped when the panel is rebuilt, which is
// what keeps a build idempotent (§13) and what stops a declaration half-saving into the author's
// document.

function deviceDefineParameterImpl(id, spec, role) {
  const result = defineRuntimeParameter(role, id, spec ?? {});
  if (!result.ok) { addScriptTrace('error', '', result.error); return false; }
  const p = result.parameter;
  addScriptTrace('log', '', `defineParameter ${p.id} — ${p.name} (${p.type}, ${p.min}..${p.max})`);
  return true;
}

function deviceDefineDumpImpl(kind, spec, role) {
  const result = defineRuntimeDump(role, kind, spec ?? {});
  if (!result.ok) { addScriptTrace('error', '', result.error); return false; }
  const d = result.dump;
  addScriptTrace('log', '',
    `defineDump ${d.kind} — ${d.fields} field(s)`
    + (d.requestBytes ? '' : ', no request declared (nothing to send when requestDump asks for it)'));
  return true;
}

/**
 * bind(control, parameterId) — connect a control to a parameter at RUNTIME.
 *
 * ce.panel.create could already make a control and there was then no way to connect it to
 * anything: DeviceBindings is declared at design time and nothing wrote it, so a self-building
 * panel built dead controls. This is the other half of that pair.
 *
 * Panel view only, for the same reason ce.panel.create is: the binding lives on the control model,
 * and there is no control model with the window shut.
 */
/**
 * Write a control property through whichever door owns the document: the editor's control store, or
 * the player host. The same split updateControls makes, and for the same reason — the exported
 * plugin runs this runtime in its OPEN window, so a panel-view-only verb still has a host.
 */
function writeControlProperty(control, path, value) {
  if (host) { host.writeValue(control, path, value); return; }
  updateControlProperty(control?._children?.Core?.id, path, value);
}

function deviceBindImpl(controlName, parameterId, opts = {}) {
  const name = String(controlName ?? '');
  const key = String(parameterId ?? '');
  if (!name || !key) {
    addScriptTrace('error', '', 'bind(control, parameterId): both a control and a parameter id are required');
    return false;
  }
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `bind: control "${name}" not found on the active panel`); return false; }

  const role = String(opts?.role ?? '') || DEFAULT_ROLE;
  // Say so rather than refusing: a script may bind before it declares, and a profile-backed
  // parameter table can still be loading. A binding to a parameter that turns up later works;
  // one to a parameter that never turns up is silent, and silence is what the notice buys back.
  //
  // The profile is only consulted when there IS one. Asking otherwise would emit "no profile is
  // mapped" from the read — true, and completely beside the point when the panel is deliberately
  // driving a synth that has none.
  const known = hasDefinedParameter(role, key)
    || (roleMapping(role)?.profileId ? deviceParameterRead(key, role) != null : false);
  if (!known) {
    addScriptTrace('log', '',
      `bind("${name}", "${key}"): neither the profile nor this panel's declarations know "${key}" yet. `
      + 'The binding is made anyway — it works if the parameter arrives — but check the id if the control stays dead.');
  }

  const port = String(opts?.port ?? 'value');
  const existing = Array.isArray(control?._children?.DeviceBindings?.bindings)
    ? control._children.DeviceBindings.bindings : [];
  // Replace the binding on this port rather than appending: two bindings on one port is a control
  // that sends two different parameters from one gesture, which is never what bind() was asked for.
  const kept = existing.filter((b) => !(b?.kind === 'deviceParameter' && String(b?.port ?? 'value') === port));
  const next = [...kept, { kind: 'deviceParameter', port, parameterId: key, deviceRole: role }];

  writeControlProperty(control, 'DeviceBindings.bindings', next);
  // A control whose DeviceBindings section was switched off would take the binding and ignore it.
  if (control?._children?.DeviceBindings?.enabled === false) writeControlProperty(control, 'DeviceBindings.enabled', true);
  addScriptTrace('log', '', `bind ${name}.${port} → ${key}${role === DEFAULT_ROLE ? '' : ` [${role}]`}`);
  return true;
}

/** unbind(control [, port]) — returns whether there was a binding to remove, so "already clean"
    reads differently from "cleaned up". */
function deviceUnbindImpl(controlName, port = 'value') {
  const name = String(controlName ?? '');
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `unbind: control "${name}" not found on the active panel`); return false; }
  const wanted = String(port ?? 'value') || 'value';
  const existing = Array.isArray(control?._children?.DeviceBindings?.bindings)
    ? control._children.DeviceBindings.bindings : [];
  const next = existing.filter((b) => !(b?.kind === 'deviceParameter' && String(b?.port ?? 'value') === wanted));
  if (next.length === existing.length) return false;
  writeControlProperty(control, 'DeviceBindings.bindings', next);
  addScriptTrace('log', '', `unbind ${name}.${wanted}`);
  return true;
}

/**
 * ports() — what is actually plugged in.
 *
 * connected(role) answers yes/no for a role somebody configured in advance. Nothing enumerated the
 * real ports, so a panel could not offer the user a choice or notice a device that showed up.
 *
 * `role` on a port is the role currently using it, or "" — which is what makes "is anything using
 * this?" a field rather than a cross-reference the script has to build itself.
 */
function devicePortsRead(opts = {}) {
  const direction = String(opts?.direction ?? '').toLowerCase();
  const mappings = get(deviceRoleMappings) ?? {};

  const roleUsing = (portId, which) => {
    for (const [role, mapping] of Object.entries(mappings)) {
      if (String(mapping?.[which]?.id ?? '') === String(portId)) return role;
    }
    return '';
  };

  const inputs = get(midiInputs) ?? [];
  const outputs = get(midiDestinations) ?? [];
  // Nothing but the placeholder rows means the host has never been asked. Request the enumeration
  // and say so — the same asymmetry deviceParameters() states, for the same reason: an empty list
  // from a cold cache and an empty list from a machine with no MIDI interface look identical.
  if (isJuceAvailable() && !portsRequested && inputs.length + outputs.length <= 2) {
    portsRequested = true;
    try { listMidiInputs(); listMidiDestinations(); } catch { /* no bridge */ }
    addScriptTrace('log', '',
      'ports(): the port list has not been enumerated yet — requesting it now. Call again from a '
      + 'later handler. In the exported plugin this read is synchronous and complete on the first call.');
  }

  const out = [];
  const add = (port, dir, which) => {
    const type = String(port?.type ?? '');
    out.push({
      id: String(port?.id ?? ''),
      name: String(port?.name ?? port?.id ?? ''),
      direction: dir,
      type,
      // The two placeholder rows the app always lists are choices, not hardware. Both are reported
      // — they are what a mapping can be set to — but a script asking "did a device show up" wants
      // this flag, not a list of magic type strings to compare against.
      hardware: type !== 'none' && type !== 'previewOnly',
      role: roleUsing(port?.id, which),
    });
  };
  if (direction !== 'out' && direction !== 'output') for (const p of inputs) add(p, 'in', 'midiInput');
  if (direction !== 'in' && direction !== 'input') for (const p of outputs) add(p, 'out', 'midiDestination');
  return out;
}

let portsRequested = false;

/**
 * requestDump(kind [, fn [, opts]]) — closing the loop.
 *
 * Fire-and-forget was the odd one out: deviceRead already answers where it is called, and a dump's
 * answer turned up at onDumpReceived with nothing tying it to the request. A panel that asked for
 * two dumps in a row could not tell which reply was which.
 *
 * Three rules, and each of them is protecting against a specific way this shape goes wrong:
 *   1. The waiter is removed BEFORE the callback runs, so a throw inside it cannot leave a waiter
 *      that fires again on the next dump — the same rule after() follows for the same reason.
 *   2. A waiter that never hears back is resolved with `ok = false` rather than left hanging. A
 *      synth that is off, or does not answer this request, is the common case, not the exotic one.
 *   3. The callback is OPTIONAL and the old spelling is untouched: requestDump("patch") still
 *      means what it always meant, and still reaches onDumpReceived.
 */
// Matched on KIND alone, never on role. requestDump's host primitive is requestDump(kind) in every
// C++ engine, so a role argument here would be an option the panel view honoured and the shipped
// plugin quietly ignored — the exact asymmetry this API spent two rounds removing. A script that
// needs another device sends inside routeMidi(role, fn).
const dumpWaiters = [];        // { kind, fn, scriptId, timerId, done }

function resolveDumpWaiters(kind, role, values, error = '') {
  if (!dumpWaiters.length) return;
  const matched = dumpWaiters.filter((w) => !w.done && (w.kind === '' || w.kind === String(kind ?? '')));
  for (const waiter of matched) {
    // Removed first: a throw inside the callback must not leave it armed for the next dump.
    waiter.done = true;
    const at = dumpWaiters.indexOf(waiter);
    if (at >= 0) dumpWaiters.splice(at, 1);
    if (waiter.timerId) stopTimer(waiter.timerId);
    try {
      waiter.fn(error ? undefined : values, { ok: !error, kind: String(kind ?? ''), role: String(role ?? ''), error });
    } catch (e) {
      reportScriptError(waiter.scriptId, e);
    }
  }
}

function requestDumpImpl(kind, fn, opts, scriptId = '') {
  const key = String(kind ?? '');
  const role = DEFAULT_ROLE;

  if (typeof fn === 'function') {
    const ms = Number(opts?.timeout) > 0 ? Math.round(Number(opts.timeout)) : 3000;
    const waiter = { kind: key, fn, scriptId, timerId: null, done: false };
    dumpWaiters.push(waiter);
    // A one-shot the RUNTIME owns rather than one the script asked for, so a script cannot cancel
    // somebody else's timeout by id, and stopAllTimers on panel close takes it with the panel.
    waiter.timerId = scheduleOneShot(ms, () => {
      if (waiter.done) return;
      resolveDumpWaiters(key, role, undefined, `no dump arrived within ${ms}ms`);
    });
  }

  // A layout the SCRIPT declared carries its own request bytes, so asking for it is a raw send and
  // needs no profile at all — which is the case defineDump exists for.
  if (hasDefinedDump(role, key)) {
    const bytes = dumpRequestBytes(role, key);
    if (!bytes.length) {
      addScriptTrace('error', '',
        `requestDump(${JSON.stringify(key)}): the declared layout has no request bytes, so there is `
        + 'nothing to send. Add `request` to defineDump, or wait for the synth to send it unasked.');
      return false;
    }
    sendRawMidi(bytes, `dump_${key}`);
    return true;
  }

  if (isJuceAvailable()) {
    startDeviceSync({ deviceRole: role, request: key });
    addScriptTrace('midi', '', `requestDump(${JSON.stringify(key)}) → device sync requested`);
    return true;
  }
  addScriptTrace('midi', '', `requestDump(${JSON.stringify(key)}) — no device host`);
  return false;
}

/** Drop every runtime declaration. Called wherever generated controls are cleared, for the same
    reason: a build starts from what the author drew, plus what this run of the script declares. */
export function clearDeviceRuntimeDefinitions() {
  clearDeviceDefinitions();
  portsRequested = false;
  // A waiter outliving its panel would call back into a script that is gone, so it is dropped
  // rather than resolved — the timeout notice is worth having while the panel is live and is
  // noise once it is not.
  for (const waiter of dumpWaiters.splice(0, dumpWaiters.length)) {
    waiter.done = true;
    if (waiter.timerId) stopTimer(waiter.timerId);
  }
}

// @module ce.storage
/* ------------------------------------------------------------------------------ ce.storage */
// Two lifetimes, deliberately kept apart. `state` lives as long as the script is loaded — in the
// C++ engines that falls out of the per-script environment for free, and here it falls out of the
// handler cache, so both behave the same. Settings outlive the session: they go into the panel
// document under scripting.settings, which is what makes them travel with the panel and survive an
// export. In the player the document is in memory, so they last the session and ride along in the
// DAW state the plugin already saves.

const scriptState = new Map();   // scriptId -> the script's own scratch table

function stateFor(scriptId) {
  if (!scriptState.has(scriptId)) scriptState.set(scriptId, {});
  return scriptState.get(scriptId);
}

/* ------------------------------------------------------------------- storage scopes (§43)
 * `state` is per-script and says so. Settings were panel-wide and said nothing, so two scripts both
 * saving "count" clobbered each other in silence — an asymmetry nobody had written down.
 *
 * Three scopes now, and they differ in WHO SEES the value and WHERE it lives:
 *
 *   panel  — the default, and what settings have always been. Shared by every script on the panel,
 *            stored in the document, travels with it.
 *   script — private to the calling script, the way `state` already is. Same store, a key nobody
 *            else can spell, so nothing about persistence changes.
 *   local  — THIS MACHINE only, never written into the document. A panel you send somebody should
 *            not carry your MIDI port choice with it.
 *
 * script scope is a key prefix rather than a second store on purpose: a private setting should
 * persist and travel exactly like a shared one, and only its visibility differs.
 */
const STORAGE_SCOPES = ['panel', 'script', 'local'];
const LOCAL_STORAGE_PREFIX = 'ce.storage:';

/** The scope asked for, or NOTHING when it is not one this build knows.
 *
 *  Refusing rather than falling back to "panel": storing a value in a scope the caller did not ask
 *  for is how a private setting quietly becomes a shared one, and a typo in a scope name would be
 *  the way it happened. Every verb below bails on nothing.
 */
function storageScopeOf(opts, scriptId) {
  const raw = typeof opts === 'string' ? opts : opts?.scope;
  if (raw == null || raw === '') return 'panel';
  const scope = String(raw);
  if (STORAGE_SCOPES.includes(scope)) return scope;
  addScriptTrace('error', scriptId ?? '',
    `ce.storage: "${scope}" is not a scope. One of: ${STORAGE_SCOPES.join(', ')}.`);
  return undefined;
}

/** The key a scope actually stores under. Script scope carries the owner in the key; the prefix is
 *  chosen to be one a hand-written key could not collide with by accident.
 *
 *  U+0001 rather than U+0000, and the same in all four runtimes: the C++ engines pass a key through
 *  juce::String, which is NUL-terminated, so a NUL in a key would truncate it there and the editor
 *  and the export would disagree about what a private key is even called.
 */
const SCRIPT_KEY_PREFIX = '\u0001script:';

function storageKeyFor(scope, key, scriptId) {
  const k = String(key ?? '');
  return scope === 'script' ? `${SCRIPT_KEY_PREFIX}${scriptId ?? ''}:${k}` : k;
}

/** …and back, for listing: nil when the stored key does not belong to this scope. */
function storageKeyFrom(scope, stored, scriptId) {
  const prefix = `${SCRIPT_KEY_PREFIX}${scriptId ?? ''}:`;
  if (scope === 'script') return stored.startsWith(prefix) ? stored.slice(prefix.length) : undefined;
  // A panel listing hides other scripts' private keys rather than showing an unusable spelling.
  return stored.startsWith(SCRIPT_KEY_PREFIX) ? undefined : stored;
}

function settingsStore() {
  const panel = activePanel();
  if (!panel) return null;
  panel.scripting ??= {};
  panel.scripting.settings ??= {};
  return panel.scripting.settings;
}

/** The machine-local store. Absent in a test run and in any host without one, which `info()`
 *  reports rather than leaving a script to guess why nothing persisted. */
function localStore() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null;
  } catch { return null; }        // a browser with storage disabled throws on access, not on use
}

function localRead() {
  const store = localStore();
  if (!store) return null;
  const panel = activePanel();
  const key = LOCAL_STORAGE_PREFIX + String(panel?.id ?? '');
  try { return JSON.parse(store.getItem(key) ?? '{}') ?? {}; } catch { return {}; }
}

function localWrite(map) {
  const store = localStore();
  if (!store) return false;
  const panel = activePanel();
  try { store.setItem(LOCAL_STORAGE_PREFIX + String(panel?.id ?? ''), JSON.stringify(map)); return true; }
  catch { return false; }         // quota, private browsing — reported by the caller, never thrown
}

function saveSetting(key, value, opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return false;
  const stored = storageKeyFor(scope, key, scriptId);
  if (scope === 'local') {
    const map = localRead();
    if (!map) {
      addScriptTrace('error', scriptId ?? '',
        `saveSetting("${key}"): this build has no machine-local store, so nothing was saved. `
        + 'ce.storage.info() says which stores are available.');
      return false;
    }
    map[stored] = value;
    if (localWrite(map)) return true;
    addScriptTrace('error', scriptId ?? '', `saveSetting("${key}"): the local store refused the write.`);
    return false;
  }
  const store = settingsStore();
  if (!store) {
    addScriptTrace('error', scriptId ?? '', `saveSetting("${key}"): no active panel to store it on`);
    return false;
  }
  store[stored] = value;
  return true;
}

function loadSetting(key, fallback, opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return fallback;
  const stored = storageKeyFor(scope, key, scriptId);
  const source = scope === 'local' ? localRead() : settingsStore();
  const v = source?.[stored];
  return v === undefined ? fallback : v;
}

/** Every key this panel has saved IN THIS SCOPE. Empty means nothing written — not "settings
 *  unavailable", which is what info() is for. */
function listSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return [];
  const source = (scope === 'local' ? localRead() : settingsStore()) ?? {};
  return Object.keys(source)
    .map((k) => storageKeyFrom(scope, k, scriptId))
    .filter((k) => k !== undefined);
}

/** Every setting as a table — the read every other module got, instead of listing keys and looping
 *  to fetch each one. */
function allSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return {};
  const source = (scope === 'local' ? localRead() : settingsStore()) ?? {};
  const out = {};
  for (const [stored, value] of Object.entries(source)) {
    const key = storageKeyFrom(scope, stored, scriptId);
    if (key !== undefined) out[key] = value;
  }
  return out;
}

/** Delete one. Returns whether there was one, so "cleaned up" reads differently from "nothing
 *  there" — the distinction the whole module keeps. */
function forgetSetting(key, opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return false;
  const stored = storageKeyFor(scope, key, scriptId);
  if (scope === 'local') {
    const map = localRead();
    if (!map || !(stored in map)) return false;
    delete map[stored];
    return localWrite(map);
  }
  const store = settingsStore();
  if (!store || !(stored in store)) return false;
  delete store[stored];
  return true;
}

/** Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
 *  keys alone: "clear my settings" must not mean "clear everybody's". */
function clearSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return 0;
  const keys = listSettings(opts, scriptId);
  let gone = 0;
  for (const key of keys) if (forgetSetting(key, opts, scriptId)) gone += 1;
  return gone;
}

/**
 * Which store a scope is talking to, and what is in it.
 *
 * The three scopes have genuinely different backing — the panel document, this machine, the DAW
 * project — and a script that has just failed to persist something deserves to know which one it
 * was talking to rather than guessing. `available` is the honest field: false means writes in this
 * scope will not stick, which is a thing to say once rather than discover per key.
 */
function storageInfo(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId);
  if (!scope) return undefined;
  const source = scope === 'local' ? localRead() : settingsStore();
  const contents = allSettings(opts, scriptId);
  let bytes = 0;
  try { bytes = JSON.stringify(contents).length; } catch { bytes = -1; }
  return {
    scope,
    // What the store IS, rather than what it is called: the editor keeps panel-scope settings in
    // the document, and the exported plugin keeps them in the DAW project state.
    backing: scope === 'local' ? 'machine' : (host ? 'project' : 'panel'),
    available: source != null,
    count: Object.keys(contents).length,
    bytes,
  };
}

/* --------------------------------------------------------------------------- JSON (§43)
 * A Q10 exception, and the same one now() was. The Lua engine opens base, math, string and table —
 * there is no json module, and no way to write one that is not a parser. JavaScript and Python each
 * have their own, with different names and different edge cases. So "use the language's own" was
 * never available to a cross-runtime script.
 *
 * Here rather than in ce.core because encoding is what you do to put a structure somewhere: into a
 * setting, into a SysEx payload, into a text control somebody typed a config into.
 */
/** Every object key anywhere in a value, so the four runtimes can sort them into one order.
 *
 *  Keys come out SORTED, everywhere. Not a stylistic choice: a Lua table has no insertion order to
 *  preserve, so sorted is the only ordering all four runtimes are able to produce — and it is the
 *  ordering that makes two encodings of the same structure comparable, which is half of what encode
 *  is for. (Sort order is the language's own string order. Those agree over ASCII, which panel keys
 *  are; above the BMP JavaScript orders by UTF-16 unit where the others order by code point.)
 */
function jsonKeysOf(value, out, seen) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;              // a cycle: stop here, stringify will refuse below
  seen.add(value);
  if (Array.isArray(value)) for (const v of value) jsonKeysOf(v, out, seen);
  else for (const k of Object.keys(value)) { out.add(k); jsonKeysOf(value[k], out, seen); }
  return out;
}

function encodeJson(value, opts) {
  try {
    const indent = Number(opts?.indent);
    const keys = [...jsonKeysOf(value, new Set(), new Set())].sort();
    return JSON.stringify(value, keys.length ? keys : undefined,
      Number.isFinite(indent) && indent > 0 ? indent : undefined);
  } catch {
    // A cycle, or a value with no JSON form. Nothing back rather than a string that is not the
    // value — which is the same rule every "cannot read that" in this API follows.
    return undefined;
  }
}

/** JSON null read as NOTHING: an absent member, a skipped element.
 *
 *  Not a preference — a Lua table cannot hold a null, and a value the four runtimes cannot all hold
 *  is not a value this API has. So `{"a":1,"b":null}` reads as one key everywhere, and
 *  `[1,null,2]` as a two-element list everywhere, rather than as three shapes in three engines.
 */
function stripJsonNulls(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== null).map(stripJsonNulls);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripJsonNulls(x);
    return out;
  }
  return v;
}

function decodeJson(text) {
  try {
    const v = JSON.parse(String(text ?? ''));
    return v === null ? undefined : stripJsonNulls(v);
  } catch { return undefined; }
}

// @module -
function buildApi(ownerName, scriptId = '') {
  const self = {
    set: (p, v, form) => setValue(ownerName ? `${ownerName}.${p}` : p, v, typeof form === 'string' ? form : ''),
    get: (p, form) => getValue(ownerName ? `${ownerName}.${p}` : p, form),
  };
  const api = {
    // The third argument is the value form for the second-argument spelling. `set` also takes an
    // opts object in that position in the contract; only a string is read as a form, so
    // set(path, v, { transmit: false }) is unaffected.
    set: (path, value, form) => setValue(path, value, typeof form === 'string' ? form : ''),
    get: (path, form) => getValue(path, form),
    log: (msg, val) => scriptPrint('log', scriptId, msg, val),
    // Levels the console already renders differently — the runtime uses the distinction constantly
    // and a script could not, so a real failure read exactly like a debug print.
    //
    // logWarn / logError, NOT warn / error: a global `error` would SHADOW Lua's builtin in the
    // sibling engine, turning the standard way to raise into a print. ce.core.warn/.error are the
    // spellings anybody writes; the flat aliases are defensive, like isPlaying beside .playing.
    logWarn: (msg, val) => scriptPrint('warn', scriptId, msg, val),
    // Prints. Does NOT throw — a script wanting to stop uses its own language's error/throw.
    logError: (msg, val) => scriptPrint('error', scriptId, msg, val),
    // MIDI/device — real raw send via the device bridge; bulk codec is a fast-follow.
    ...midiApi,
    // Zone Splitter — change the split from a footswitch.
    ...splitApi,
    // Phrase Sequencer — swap the riff, transpose it, run it backwards.
    ...phraseApi,
    // Phrase Recorder — arm it, undo a pass, quantise the take.
    ...recorderApi,
    // Harmoniser — re-key it mid-song.
    ...harmoniserApi,
    // Setlist — next song, from a button or a script.
    ...setlistApi,
    // …and the other twenty-three families, expanded from componentVerbs.js.
    ...componentVerbApi,
    // flow
    emit: (name, data) => deliverEmit(String(name ?? ''), null, data),
    run: (ref, args) => runAction(ref, args),
    on: (target, event, fn) => addListener(scriptId, target, event, fn),
    off: (target, event) => removeListener(scriptId, target, event),
    // the reactive core — rules the runtime keeps applying, not values it writes once
    // the wire filters need the caller's id, so they are bound here rather than in midiApi
    interceptMidiIn: (fn) => putMidiFilter(midiIn, scriptId, fn),
    interceptMidiOut: (fn) => putMidiFilter(midiOut, scriptId, fn),
    routeMidi: (role, fn) => {
      if (typeof fn !== 'function') { addScriptTrace('error', scriptId, 'routeMidi(role, fn) needs a block to run'); return; }
      const previous = routedRole;
      routedRole = String(role ?? '') || null;
      // finally, not a trailing restore: a throw inside the block must not leave every later send
      // in the session pointed at the wrong synth.
      try { fn(); } finally { routedRole = previous; }
    },
    watch: (path, fn) => addWatch(scriptId, path, fn),
    compute: (path, fn) => addCompute(scriptId, path, fn),
    intercept: (path, fn) => addIntercept(scriptId, path, fn),
    defineAction: (name, fn) => defineActionImpl(scriptId, name, fn),
    startTimer: (id, ms) => startTimer(id, ms),
    stopTimer: (id) => stopTimer(id),
    after: (ms, fn) => afterFor(scriptId, ms, fn),
    // ce.anim — values that move over time
    animateTo: (path, target, opts) => startAnimationImpl(scriptId, 'to', path, target, opts ?? {}),
    animateSpring: (path, target, opts) => startAnimationImpl(scriptId, 'spring', path, target, opts ?? {}),
    animateEnvelope: (path, points, opts) => startEnvelopeImpl(scriptId, path, points, opts ?? {}),
    animateStop: (path) => stopAnimationImpl(path),
    animateRunning: (path) => animationRunningImpl(path),
    animateValue: (path) => animationValueImpl(path),
    animateList: () => animationListImpl(),
    animatePause: (path) => animationPauseImpl(path),
    animateResume: (path) => animationResumeImpl(path),
    animateReverse: (path) => animationReverseImpl(path),
    animateFinish: (path) => animationFinishImpl(path),
    // ce.ui — a message for whoever is using the panel
    uiNotify: (message, opts) => uiNotifyImpl(message, opts),
    uiDismiss: (id) => uiDismissImpl(id),
    uiUpdate: (id, message, opts) => uiUpdateImpl(id, message, opts),
    uiStatus: (message, opts) => uiStatusImpl(message, opts),
    uiState: () => uiStateImpl(),
    uiCopy: (text) => uiCopyImpl(scriptId, text),
    uiDialog: (opts, onChoice) => uiDialogImpl(scriptId, opts, onChoice),
    // prompt and choose are dialog() with a different SHAPE of question — one modal at a time,
    // one callback contract, one teardown, whatever is being asked.
    uiPrompt: (opts, onAnswer) => uiDialogImpl(scriptId, { ...(opts ?? {}), ask: 'text' }, onAnswer),
    uiChoose: (opts, onAnswer) => uiDialogImpl(scriptId, { ...(opts ?? {}), ask: 'list' }, onAnswer),
    // ce.draw — immediate-mode drawing on top of a control
    drawClear: (target) => drawClearImpl(target, ownerName),
    // A gradient is an OBJECT, so fill/stroke pass it through rather than stringifying it — the
    // overlay turns it into the url(#…) reference SVG needs.
    drawFill: (colour) => {
      drawState.fill = colour == null ? null : (typeof colour === 'object' ? colour : String(colour));
    },
    drawStroke: (colour, width, opts) => {
      drawState.stroke = colour == null ? null : (typeof colour === 'object' ? colour : String(colour));
      drawState.strokeWidth = Number(width) > 0 ? Number(width) : 1;
      // A dash is a list of on/off lengths, the way SVG and every drawing API since PostScript
      // spells it. The panel's own dashed lines (the Transport's beat marks, the Constellation's
      // probe link) are "3 3" and "2 3".
      const dash = opts?.dash;
      const dashList = Array.isArray(dash) ? dash : (dash == null ? null : Object.values(dash));
      drawState.dash = dashList && dashList.length
        ? dashList.map((n) => Math.max(0, Number(n) || 0)).join(' ')
        : (typeof dash === 'string' && dash ? dash : null);
      drawState.cap = ['butt', 'round', 'square'].includes(opts?.cap) ? opts.cap : null;
      drawState.join = ['miter', 'round', 'bevel'].includes(opts?.join) ? opts.join : null;
      // dashOffset is what makes a dash MOVE: advance it on a timer and you have marching ants,
      // which is how a panel shows "this is recording" without redrawing the shape (§49).
      drawState.dashOffset = Number.isFinite(Number(opts?.dashOffset)) ? Number(opts.dashOffset) : null;
    },
    drawGradient: (stops, angle) => drawGradientImpl(stops, angle),
    // Applies to everything drawn after it, like fill and stroke — not to one shape, because the
    // whole style model here is "what is in force when the command is issued".
    drawOpacity: (a) => {
      const v = Number(a);
      drawState.opacity = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
    },
    // rotate/move/scale for what follows. Without it a knob pointer means computing every corner
    // with sin and cos by hand — and getting the centre of rotation wrong is the classic way a
    // pointer ends up orbiting the wrong point.
    drawTransform: (opts) => {
      if (opts == null) { drawState.transform = null; return; }
      const parts = [];
      const x = Number(opts.x) || 0;
      const y = Number(opts.y) || 0;
      if (x || y) parts.push(`translate(${x} ${y})`);
      const rotate = Number(opts.rotate);
      if (Number.isFinite(rotate) && rotate !== 0) {
        // Around a named centre, or the origin. A rotation with no centre is almost never what a
        // pointer wants, so the centre is the argument people reach for first.
        const cx = Number(opts.cx);
        const cy = Number(opts.cy);
        parts.push(Number.isFinite(cx) && Number.isFinite(cy)
          ? `rotate(${rotate} ${cx} ${cy})` : `rotate(${rotate})`);
      }
      const scale = Number(opts.scale);
      if (Number.isFinite(scale) && scale !== 1) parts.push(`scale(${scale})`);
      drawState.transform = parts.length ? parts.join(' ') : null;
    },
    drawEllipse: (cx, cy, rx, ry) => pushCommand(null, ownerName,
      { op: 'ellipse', cx: Number(cx) || 0, cy: Number(cy) || 0,
        rx: Number(rx) || 0, ry: Number(ry) || 0 }),
    // The app's own 5x7 LCD font, one rect per lit pixel. An LCD readout a script draws and one an
    // LCD component prints are then the same letters, which a second font would not be.
    drawPixelText: (text, x, y, scale) => pushCommand(null, ownerName,
      { op: 'pixelText', text: String(text ?? ''), x: Number(x) || 0, y: Number(y) || 0,
        scale: Math.max(1, Math.round(Number(scale) || 1)) }),
    drawMeasure: (text, opts) => drawMeasureImpl(text, opts),

    /* ce.draw, phase §49 — the bulk primitives, a style stack, clipping and images. */
    drawBatch: (fn) => runDrawBatch(fn),
    drawGrid: (opts) => drawGridImpl(null, ownerName, opts),
    drawLines: (segments) => drawLinesImpl(null, ownerName, segments),
    drawPoints: (points, r) => drawPointsImpl(null, ownerName, points, r),
    drawCurve: (points, opts) => drawCurveImpl(null, ownerName, points, opts),
    drawPolygon: (cx, cy, r, sides, opts) => drawPolygonImpl(null, ownerName, cx, cy, r, sides, opts),
    // An image needs a source the renderer can actually load: a data URL, or an icon from the
    // library resolved through ce.image. A bare name would be a string that silently draws nothing.
    drawImage: (src, x, y, w, h, opts) => {
      const source = String(src ?? '');
      if (!source) {
        addScriptTrace('error', '',
          'ce.draw.image: no source. Pass a data URL, or ce.image.asset(name).dataUrl for a library icon.');
        return false;
      }
      return pushCommand(null, ownerName, {
        op: 'image', src: source,
        x: Number(x) || 0, y: Number(y) || 0, w: Number(w) || 0, h: Number(h) || 0,
        fit: ['fill', 'contain', 'cover'].includes(opts?.fit) ? opts.fit : 'fill',
      });
    },
    // Clip and blend are STYLE, not shapes: they apply to every command issued after them, the way
    // fill and stroke do, and save()/restore() put them back.
    drawClip: (x, y, w, h) => {
      if (x === undefined || x === null) { drawState.clip = null; return true; }
      drawState.clip = {
        x: Number(x) || 0, y: Number(y) || 0,
        w: Math.max(0, Number(w) || 0), h: Math.max(0, Number(h) || 0),
      };
      return true;
    },
    drawBlend: (mode) => {
      const legal = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
        'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];
      const wanted = String(mode ?? 'normal');
      if (!legal.includes(wanted)) {
        addScriptTrace('error', '',
          `ce.draw.blend("${wanted}"): not a blend mode. One of: ${legal.join(', ')}.`);
        return false;
      }
      drawState.blend = wanted === 'normal' ? null : wanted;
      return true;
    },
    drawSave: () => {
      drawStateStack.push(Object.fromEntries(DRAW_STYLE_KEYS.map((k) => [k, drawState[k]])));
      return true;
    },
    drawRestore: () => {
      const saved = drawStateStack.pop();
      if (!saved) {
        addScriptTrace('error', '', 'ce.draw.restore: nothing was saved. Every restore needs a save.');
        return false;
      }
      for (const k of DRAW_STYLE_KEYS) drawState[k] = saved[k];
      return true;
    },

    /* ce.image (§50). assets/asset answer from the icon library; the rest work on one control. */
    imageAssets: (opts) => {
      const all = imageCatalogue();
      if (opts?.embeddable === true) return all.filter((a) => a.embeddable);
      if (opts?.vector === true) return all.filter((a) => a.vector);
      return all;
    },
    imageAsset: (idOrName) => findAsset(imageCatalogue(), idOrName) ?? undefined,
    imageSet: (target, src, opts) => imageSetImpl(target, src, opts),
    imageClear: (target, layer) => imageClearImpl(target, layer),
    imageRead: (target, layer) => imageReadImpl(target, layer),
    imageIcon: (target, idOrName, opts) => imageIconImpl(target, idOrName, opts),
    imageEmbed: (target, layer) => imageEmbedImpl(target, layer),
    imageLoad: (path) => {
      const p = String(path ?? '');
      if (!p) return false;
      if (sourceKind(p) !== 'file') return true;    // a data URL needs no loading
      loadFile(p);
      return String(get(fileCache)[p] ?? '').startsWith('data:');
    },

    // ce.text (§46). fonts/font answer from the catalogue; the rest work on one control's Text.
    textFonts: (opts) => {
      const all = textCatalogue();
      if (opts?.portable === true) return all.filter((f) => f.portable);
      if (opts?.variable === true) return all.filter((f) => f.variable);
      return all;
    },
    textFont: (family) => findFont(textCatalogue(), family) ?? undefined,
    textStyle: (target, opts) => textStyleImpl(target, opts),
    textAxis: (target, tag, value) => textAxisImpl(target, tag, value),
    textRead: (target, field) => textReadImpl(target, field),
    textMeasure: (target, text) => textMeasureImpl(target, text),
    textFit: (target, opts) => textFitImpl(target, opts),
    drawRect: (x, y, w, h, radius) => pushCommand(null, ownerName,
      { op: 'rect', x: Number(x) || 0, y: Number(y) || 0, w: Number(w) || 0, h: Number(h) || 0,
        radius: Number(radius) > 0 ? Number(radius) : 0 }),
    drawCircle: (cx, cy, r) => pushCommand(null, ownerName,
      { op: 'circle', cx: Number(cx) || 0, cy: Number(cy) || 0, r: Number(r) || 0 }),
    // Angles in DEGREES, 0 at twelve o'clock, clockwise — the way a knob's arc is described, and
    // the convention the Meter's arcStart/arcSweep already use. The renderer converts.
    drawArc: (cx, cy, r, from, to) => pushCommand(null, ownerName,
      { op: 'arc', cx: Number(cx) || 0, cy: Number(cy) || 0, r: Number(r) || 0,
        from: Number(from) || 0, to: Number(to) || 0 }),
    drawLine: (x1, y1, x2, y2) => pushCommand(null, ownerName,
      { op: 'line', x1: Number(x1) || 0, y1: Number(y1) || 0, x2: Number(x2) || 0, y2: Number(y2) || 0 }),
    drawPath: (points, closed) => pushCommand(null, ownerName,
      { op: 'path', points: toPointList(points), closed: closed === true }),
    drawText: (x, y, text, opts) => pushCommand(null, ownerName,
      { op: 'text', x: Number(x) || 0, y: Number(y) || 0, text: String(text ?? ''),
        size: Number(opts?.size) > 0 ? Number(opts.size) : 12,
        align: ['left', 'middle', 'right'].includes(opts?.align) ? opts.align : 'left',
        family: opts?.family ? String(opts.family) : null }),
    drawRedraw: (target) => drawRedrawImpl(target, ownerName),
    // ce.panel — structure
    panelCreate: (type, props) => panelCreateImpl(type, props, scriptId),
    panelClone: (name, props) => panelCloneImpl(name, props, scriptId),
    panelDestroy: (name) => panelDestroyImpl(name),
    panelParent: (name, container) => panelParentImpl(name, container),
    panelFind: (query) => panelFindImpl(query),
    panelInfo: (name) => panelInfoImpl(name),
    panelTypes: () => Object.keys(COMPONENT_TYPES),
    // ce.panel — the collections inside a control, which the Properties panel can add to and
    // remove from and a script could only overwrite whole.
    panelEntries: (control, section) => panelEntriesImpl(control, section),
    panelEntry: (control, section, name) => panelEntryImpl(control, section, name),
    panelDefine: (control, section, name, spec) => panelDefineImpl(control, section, name, spec),
    panelUndefine: (control, section, name) => panelUndefineImpl(control, section, name),
    panelPatch: (control, stateName, patch, part) => panelPatchImpl(control, stateName, patch, part),
    // The two ce.panel verbs that are NOT panel-view only. The C++ preludes build these on a host
    // query for the control names plus get/set; here the panel object is in hand, so the same walk
    // is direct. Same rules either way — see panelSnapshotImpl.
    // ce.panel — arranging what is there
    panelAlign: (names, edge, opts) => panelAlignImpl(names, edge, opts),
    panelDistribute: (names, what, opts) => panelDistributeImpl(names, what, opts),
    panelMatch: (names, what, opts) => panelMatchImpl(names, what, opts),
    panelGrid: (names, opts) => panelGridImpl(names, opts),
    panelCircle: (names, opts) => panelCircleImpl(names, opts),
    panelFlip: (names, axis) => panelFlipImpl(names, axis),
    panelRect: (names) => panelRectImpl(names),
    panelOrder: (names, where) => panelOrderImpl(names, where),
    panelBatch: (fn) => panelBatchImpl(scriptId, fn),
    panelEach: (fn) => panelEachImpl(scriptId, fn),
    panelSnapshot: () => panelSnapshotImpl(),
    panelRestore: (snap) => panelRestoreImpl(snap),
    // ce.time — reads and musical timers
    tempo: () => tempoRead(),
    isPlaying: () => isPlayingRead(),
    transportInfo: () => transportInfoRead(),
    beatsToMs: (beats, bpm) => beatsToMsRead(beats, bpm),
    msToBeats: (ms, bpm) => msToBeatsRead(ms, bpm),
    syncTimer: (id, beats, opts) => syncTimerRead(id, beats, opts),
    afterBeats: (beats, fn) => afterBeatsFor(scriptId, beats, fn),
    runningTimers: () => runningTimersRead(),
    // ce.device — reads
    deviceProfile: (role) => deviceProfileRead(role || DEFAULT_ROLE),
    deviceParameters: (opts) => deviceParametersRead(opts ?? {}),
    deviceParameter: (id, role) => deviceParameterRead(id, role || DEFAULT_ROLE),
    deviceConnected: (role) => deviceConnectedRead(role || DEFAULT_ROLE),
    deviceRead: (id, role) => deviceValueRead(id, role || DEFAULT_ROLE),
    deviceWrite: (id, value, role) => deviceValueWrite(id, value, role || DEFAULT_ROLE),
    // ce.device — declaring what the app was not shipped knowing
    deviceDefineParameter: (id, spec, role) => deviceDefineParameterImpl(id, spec, role || DEFAULT_ROLE),
    deviceDefineDump: (kind, spec, role) => deviceDefineDumpImpl(kind, spec, role || DEFAULT_ROLE),
    deviceBind: (control, parameterId, opts) => deviceBindImpl(control, parameterId, opts ?? {}),
    deviceUnbind: (control, port) => deviceUnbindImpl(control, port),
    devicePorts: (opts) => devicePortsRead(opts ?? {}),
    // The callback belongs to the calling script, so this is bound here rather than in midiApi —
    // a throw inside it is reported against the script that scheduled it.
    requestDump: (kind, fn, opts) => requestDumpImpl(kind, fn, opts, scriptId),
    // ce.math — the seeded generator. Bound here rather than in the shared helpers object because
    // it is the only place that knows WHICH SCRIPT is drawing, and the generator is per script.
    random: (lo, hi) => randomImpl(scriptId, lo, hi),
    randomSeed: (n) => randomSeedImpl(scriptId, n),
    randomChoice: (values, weights) => randomChoiceImpl(scriptId, values, weights),
    randomFloat: (lo, hi) => randomFloatImpl(scriptId, lo, hi),
    randomGaussian: (mean, sd) => randomGaussianImpl(scriptId, mean, sd),
    randomWalk: (current, step, lo, hi) => randomWalkImpl(scriptId, current, step, lo, hi),
    randomBool: (chance) => randomBoolImpl(scriptId, chance),
    shuffle: (values) => shuffleImpl(scriptId, values),
    randomStream: (name, fn) => randomStreamImpl(scriptId, name, fn),
    // ce.storage
    state: stateFor(scriptId),
    saveSetting: (key, value, opts) => saveSetting(key, value, opts, scriptId),
    loadSetting: (key, fallback, opts) => loadSetting(key, fallback, opts, scriptId),
    listSettings: (opts) => listSettings(opts, scriptId),
    forgetSetting: (key, opts) => forgetSetting(key, opts, scriptId),
    allSettings: (opts) => allSettings(opts, scriptId),
    clearSettings: (opts) => clearSettings(opts, scriptId),
    storageInfo: (opts) => storageInfo(opts, scriptId),
    encodeJson: (value, opts) => encodeJson(value, opts),
    decodeJson: (text) => decodeJson(text),
    // The blocks gate set()'s transmission, not the explicit senders — same rule as the C++ host.
    // finally, not catch-and-continue: an exception inside the block must not leave the override
    // stuck on, or every later write in the panel inherits it.
    noTransmit: (fn) => {
      pushTransmit(false);
      try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } finally { popTransmit(); }
    },
    transmit: (fn) => {
      pushTransmit(true);
      try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } finally { popTransmit(); }
    },
    self,
    ...helpers,
  };

  // Installed third-party modules (ce.ext.*) contribute their members to the SAME flat surface a
  // built-in module does, before anything is gated — so they are gated, namespaced and discovered
  // by exactly the same code, with no separate path to keep in step.
  installExtensionMembers(api);

  // Modules the panel has not enabled become explaining stubs, before `ce` is assembled from the
  // flat surface — so the namespaced spelling and the flat alias are gated identically.
  const enabled = enabledModules();
  applyModuleGates(api, enabled);

  // ce.<module>.<name> on top of the flat names, which stay as aliases. Built here from the
  // contract rather than from a copy of it, so the WebView's namespace cannot drift from
  // panelApi.js — the C++ engines get the same layout from a generated block, since a prelude
  // embedded as a string literal cannot import anything.
  api.ce = buildModuleNamespace(api, enabled);
  return api;
}

/**
 * The modules this panel has turned on, or null for "do not gate".
 *
 * Absent declaration means AUTO — derived from what the scripts actually reference — so a panel
 * written before modules existed keeps every verb it used. With no panel at all there is nothing
 * to derive from and nothing to protect, so gating is off: an empty set there would mean the API
 * disappears whenever a script runs outside a document, which is a worse answer than not gating.
 */
function enabledModules() {
  const panel = activePanel();
  if (!panel) return null;
  // AUTO means "derived from what the scripts reference" — so it has to derive from the scripts
  // that will actually RUN. activeScripts() is the Behavior Designer's live override, then the
  // script documents, then the saved panel; panelModules() only ever saw the last of those. A
  // script written in the designer therefore ran with every namespaced verb stubbed out, built
  // nothing, and reported a gate that pointed at a list the panel does not even have. Gate from
  // the same list you execute. A MANUAL list is authored intent and is still obeyed verbatim.
  if (!Array.isArray(panel?.scripting?.modules)) {
    const sources = scriptsForPanel(panel)
      .map((script) => String(script?.source ?? ''))
      .filter(Boolean);
    if (sources.length) {
      const used = [...new Set(sources.flatMap((src) => modulesUsedBy(src)))];
      return new Set(resolveModules(used).enabled);
    }
  }
  return new Set(panelModules(panel).enabled);
}

/**
 * Replace the members of disabled modules with a stub that names the module. Not deletion:
 * `sendCC is not a function` says nothing about why, which is the whole failure mode this
 * codebase spent two rounds removing. Value members (`state`) are left alone — swapping a table
 * for a function would break `state.x = 1` with a type error instead of an explanation.
 */
function applyModuleGates(flat, enabled) {
  if (enabled == null) return;
  for (const module of allModules()) {
    if (module.global || enabled.has(module.id)) continue;
    for (const memberId of Object.values(memberMapFor(module.id))) {
      if (isValueMember(MEMBER_BY_ID[memberId])) continue;
      const message = moduleGateMessage(memberId, module.id);
      flat[memberId] = () => addScriptTrace('log', '', message);
    }
  }
  // Declared aliases follow their member: to14Bit is to14bit, gated or not.
  for (const member of Object.values(MEMBER_BY_ID)) {
    for (const alias of member.aliases ?? []) {
      if (flat[member.id] !== undefined) flat[alias] = flat[member.id];
    }
  }
}

/**
 * Assemble `ce` from the module manifest: ce.midi.sendCC, ce.components.setlist.next, and so on.
 * ce.core is `global: true` — its members are never namespaced — but they are mirrored under
 * ce.core anyway so the namespace is a complete picture of what a script can reach.
 */
function buildModuleNamespace(flat, enabled = null) {
  const ce = {};
  for (const module of allModules()) {
    const segments = module.id.split('.').slice(1);   // drop the "ce" root
    let node = ce;
    for (const segment of segments) {
      node[segment] ??= {};
      node = node[segment];
    }
    for (const [shortName, memberId] of Object.entries(memberMapFor(module.id))) {
      const bound = flat[memberId];
      if (typeof bound === 'function' || bound !== undefined) node[shortName] = bound;
    }
  }
  // Tier 1: the system namespace. Not a module — it describes the runtime rather than extending it.
  ce.version = CE_API_VERSION;
  ce.runtime = RUNTIME_WEBVIEW;
  ce.language = 'javascript';
  ce.modules = allModules()
    .filter((m) => enabled == null || enabled.has(m.id))
    .map((m) => ({ id: m.id, version: m.version, runtime: m.runtime }));
  // Enabled AND reachable from here. A module the panel turned on that only runs in the player
  // still answers false, because the question ce.has() is asked to settle is "can I call this".
  ce.has = (moduleId) => {
    const module = moduleById(moduleId);
    if (module == null) return false;
    if (enabled != null && !enabled.has(moduleId)) return false;
    return module.runtime === RUNTIME_ANY || module.runtime === RUNTIME_WEBVIEW;
  };
  return ce;
}

/* ------------------------------------------------------- installed third-party modules */
// An installed ce.ext.* module ships JavaScript for this runtime. It is evaluated exactly the way
// a user's JS script is — `new Function` with the panel API bound as arguments — because it IS the
// same trust level: both are code the person using the editor chose to run. Nothing here is a
// sandbox and nothing here pretends to be one.
//
// The compiled factory is cached per id@version, so a module is parsed once and only re-invoked to
// re-bind the API (which differs per script: `self`, the script's own `state`).

const extensionFactories = new Map();   // "id@version" -> { factory, keys } | null

function extensionFactory(ext, apiKeys) {
  const cacheKey = `${ext.id}@${ext.version}`;
  const cached = extensionFactories.get(cacheKey);
  if (cached !== undefined && cached?.keys === apiKeys) return cached;

  const source = extensionSource(ext, 'webview');
  const names = (ext.members ?? []).map((m) => m.id);
  if (!source || !names.length) { extensionFactories.set(cacheKey, null); return null; }

  // Collect exactly the members the manifest declares. A module that promises a member and does
  // not define it hands back undefined, which is reported below rather than silently skipped.
  const probe = names
    .map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`)
    .join(',');
  try {
    const entry = { factory: new Function(...apiKeys.split(','), `${source}\n;return {${probe}};`), keys: apiKeys };
    extensionFactories.set(cacheKey, entry);
    return entry;
  } catch (e) {
    addScriptTrace('error', '', `[module ${ext.id}] will not parse: ${e?.message ?? e}`);
    extensionFactories.set(cacheKey, null);
    return null;
  }
}

/** Drop the compiled cache — after an install, an uninstall, or an upgrade. */
export function resetExtensionCache() { extensionFactories.clear(); }

/**
 * Run every installed module's JavaScript and merge what it defines into the flat surface.
 * A module that throws, will not parse, or does not define what it promised is REPORTED and
 * skipped — never half-installed, and never fatal to the rest of the panel.
 */
function installExtensionMembers(flat) {
  const extensions = registeredExtensions();
  if (!extensions.length) return;

  const apiKeys = Object.keys(flat).join(',');
  for (const ext of extensions) {
    const entry = extensionFactory(ext, apiKeys);
    if (!entry) continue;
    let produced = null;
    try {
      produced = entry.factory(...Object.keys(flat).map((k) => flat[k]));
    } catch (e) {
      addScriptTrace('error', '', `[module ${ext.id}] load error: ${e?.message ?? e}`);
      continue;
    }
    for (const member of ext.members ?? []) {
      const fn = produced?.[member.id];
      if (typeof fn !== 'function') {
        addScriptTrace('error', '', `[module ${ext.id}] declares ${member.id} but does not define it`);
        continue;
      }
      flat[member.id] = fn;
    }
  }
}

// Driven from panelApi.js, never from a local copy. This list is what the executors probe for, so
// a name missing from it is a handler that can never fire — which is exactly what happened to
// onControlChanged, onTimer, onMidiIn, onCcIn, onSysexIn and the two device-connection events
// while this was hand-maintained.
// The onDaw* hooks are declared runtime:'player' — there is no DAW behind the editor to save a
// project, so they are not in this runtime's list and never probed for here.
const HANDLER_NAMES = handlerNamesForRuntime(RUNTIME_WEBVIEW);

/**
 * Every global this runtime binds into a script, as the runtime itself builds it — `self` and the
 * helpers included. Exported for CE/web/test/panelApiParity.test.js, which checks it against
 * panelApi.js in both directions: nothing declared and unimplemented, nothing bound and
 * undeclared. Reading the real object rather than scanning the source is the point — a surface
 * that drifts from what scripts actually receive is the bug being guarded against.
 */
export function scriptApiForTesting(owner = '', scriptId = 'parity-probe') {
  return buildApi(owner, scriptId);
}

/** Just the names — what the parity check compares against panelApi.js. */
export function apiSurfaceNames() {
  return Object.keys(scriptApiForTesting());
}

// run("owner.action") targets a function the author named themselves, so probing the handler list
// alone can't find it. Scan the source for the shapes a top-level function takes in the languages
// this runtime executes, and probe those too. A regex is enough: over-guessing costs one undefined
// lookup, and anything it misses was never callable before this existed.
const DECLARATION_RES = [
  /\bfunction\s+([A-Za-z_]\w*)\s*\(/g,          // Lua / JS / C-family
  /\bdef\s+([A-Za-z_]\w*)\s*\(/g,               // Python
  /\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_]\w*\s*=>)/g, // JS arrow/expr
  /^\s*([A-Za-z_]\w*)\s*=\s*function\s*\(/gm,   // Lua `foo = function(...)`
];

function declaredNames(source) {
  const out = new Set();
  const text = String(source ?? '');
  for (const re of DECLARATION_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
  }
  return [...out];
}

/** Everything worth probing for in one script: the contract's handler names plus what it declares. */
function probeNames(script) {
  return [...new Set([...HANDLER_NAMES, ...declaredNames(script?.source)])];
}

/** A sensible sample payload for manually running a handler from the editor. */
function samplePayload(event) {
  if (event === 'onPanelReady') return { firstTime: true };
  if (event === 'onValueChange' || event === 'onValueChanged') return 64;
  if (event && event.startsWith('on') && (event.includes('Pointer') || event.includes('Click'))) return { x: 0, y: 0 };
  return undefined;
}

/**
 * The owner a script's `self`/relative paths resolve against: a concrete control name, or — for a
 * panel-scope script — the panel itself. SELF has always been documented as "the element this
 * script is attached to (control, panel, …)"; the panel half of that never resolved, because there
 * was no way to address the panel at all. self.set("width", 800) landed on a control called
 * "width" and reported it missing.
 */
function ownerOf(script) {
  if (script?.target && script.target !== '*' && script.target !== 'self') return script.target;
  return script?.scope === 'panel' ? PANEL_TARGET : '';
}

/* -------------------------------------------------------------- JavaScript executor */

/** Run JS source with the panel API bound and collect its declared handlers (sync). */
function runJsSource(source, scriptId, api, names) {
  const probe = names.map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',');
  const body = `${source}\n;return {${probe}};`;
  try {
    const factory = new Function(...Object.keys(api), body);
    return factory(...Object.values(api)) || {};
  } catch (e) {
    reportScriptLoadError(scriptId, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/** Execute a JS script's source and return its declared handlers (sync). */
function loadHandlersJs(script) {
  return runJsSource(script.source, script.id, buildApi(ownerOf(script), script.id), probeNames(script));
}

/** TypeScript: prefer the JS the editor already transpiled (what the C++ host ships), else
    transpile on the fly via the lazy compiler. Both run through the JS path. */
async function loadHandlersTs(script) {
  const api = buildApi(ownerOf(script), script.id);
  if (typeof script.compiledJs === 'string' && script.compiledJs.length)
    return runJsSource(script.compiledJs, script.id, api, probeNames(script));
  const ts = await ensureTs();
  if (!ts) { reportScriptLoadError(script.id, 'TypeScript compiler unavailable (offline?)'); return null; }
  const js = transpileTs(script.source);
  if (js == null) { reportScriptLoadError(script.id, 'TypeScript transpile failed'); return null; }
  // Probe the transpiled JS as well: TypeScript's own declaration shapes are a superset.
  return runJsSource(js, script.id, api, [...new Set([...probeNames(script), ...declaredNames(js)])]);
}

/* --------------------------------------------------------------------- Lua executor */
// One shared wasmoon engine (Lua 5.4 in WASM), created lazily on first Lua run. Each run
// re-binds the API globals (owner/`self` can differ per script) and re-evaluates the source in
// the shared globals — fine for M1; per-script sandboxing is a later refinement.

let luaEnginePromise = null;
async function getLuaEngine() {
  if (!luaEnginePromise) {
    luaEnginePromise = (async () => {
      const { LuaFactory } = await import('wasmoon');
      return new LuaFactory(luaWasmUrl).createEngine();
    })();
  }
  return luaEnginePromise;
}

/**
 * `null` -> `undefined` on the way back into Lua.
 *
 * wasmoon pushes a host function's return value through its promise extension, which reaches for
 * `value.then` with no null check — so a verb that answers `null` raises "Cannot read properties
 * of null" INSIDE the Lua chunk and kills the handler where it stands. Plenty of verbs answer
 * "there is no such thing" with null (panelInfo, panelEntry, panelCreate, deviceParameter, …), and
 * the guard the manual teaches — `local f = ce.text.font(x) ; if not f then` — is precisely what
 * triggers it: the script asks about something absent and the engine dies instead of returning nil.
 *
 * `undefined` already pushes as nil, so the two spellings of "nothing" are normalised here rather
 * than by auditing 39 existing call sites and remembering the rule for every verb added later.
 * Only the top-level return is affected — a null NESTED in a returned table pushes fine.
 */
const nilSafe = (fn) => (...args) => {
  const out = fn(...args);
  if (out === null) return undefined;
  if (out && typeof out.then === 'function') return out.then((v) => (v === null ? undefined : v));
  return out;
};

/**
 * The same treatment for the `ce.*` namespace, which is pushed as a table of tables — wrapping only
 * the flat aliases would leave `ce.panel.info()` crashing while `panelInfo()` was fine, and the
 * namespaced spelling is the one the manual teaches. A COPY, not a mutation: `api` is handed to the
 * other engines unchanged, and the flat alias must stay identical to what it aliases.
 */
const nilSafeNamespace = (node, depth = 0) => {
  if (typeof node === 'function') return nilSafe(node);
  if (depth > 3 || !node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) out[key] = nilSafeNamespace(value, depth + 1);
  return out;
};

/** Execute a Lua script's source and return its declared handlers (async). */
async function loadHandlersLua(script) {
  let lua;
  try {
    lua = await getLuaEngine();
  } catch (e) {
    reportScriptLoadError(script.id, `Lua engine failed to start: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), script.id);
  try {
    for (const [k, v] of Object.entries(api)) {
      if (typeof v === 'function') lua.global.set(k, nilSafe(v));
      else if (k === 'ce') lua.global.set(k, nilSafeNamespace(v));
      else lua.global.set(k, v);          // `state` and friends keep their identity
    }
    // Clear any handlers left in globals by a previous run, eval the source, then collect this
    // run's handlers into a table the JS side can call.
    const names = probeNames(script);
    const clear = names.map((n) => `${n}=nil`).join(';');
    const collect = names.map((n) => `${n}=${n}`).join(',');
    const handlers = await lua.doString(`${clear}\n${script.source}\nreturn {${collect}}`);
    return handlers || {};
  } catch (e) {
    reportScriptLoadError(script.id, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/* ------------------------------------------------------------------ Python executor */
// Python via Pyodide (CPython in WASM), loaded lazily from the jsDelivr CDN on the first Python
// script. Tier-2 language: in the WebView (editor preview + the OPEN plugin window) it runs via
// Pyodide. Window-closed / offline native execution is delivered by embedding REAL CPython at export
// (Scripting Runtime -> Python; CMake CEDITOR_PYTHON -> PythonScriptEngine.cpp), NOT Pyodide. The
// always-on native core is Lua+JS; embedded CPython is the optional third window-closed engine.

let pyodidePromise = null;
async function getPyodideEngine() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
      if (!globalThis.loadPyodide) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = CDN + 'pyodide.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('could not load pyodide.js (offline?)'));
          document.head.appendChild(s);
        });
      }
      return globalThis.loadPyodide({ indexURL: CDN });
    })();
  }
  return pyodidePromise;
}

/** Execute a Python script's source and return its declared handlers (async). */
async function loadHandlersPython(script) {
  let py;
  try {
    py = await getPyodideEngine();
  } catch (e) {
    reportScriptLoadError(script.id, `Pyodide failed to load: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), script.id);
  try {
    // Fresh namespace per run, seeded with the panel API + helpers as Python globals, so the source
    // can call set()/get()/sendCC()/log()/clamp()/scale()/… directly. Each defined handler is read
    // back out as a callable; JS payloads auto-convert (numbers → int/float, objects → attr access).
    const ns = py.toPy(api);
    py.runPython(script.source, { globals: ns });
    const handlers = {};
    for (const name of probeNames(script)) {
      const fn = ns.get(name);
      if (fn) handlers[name] = (payload) => fn(payload);
    }
    return handlers;
  } catch (e) {
    reportScriptLoadError(script.id, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/* ----------------------------------------------------------------------- C++ executor */
// Interpreted preview of the C++ behavior-handler subset (cppPreview.js). The real C++ is
// compiled into the exported plugin; this lets a C++ script move live controls in the editor.
// `ctx.*` maps onto the same panel API as Lua/JS; `event` is the handler payload.
function loadHandlersCpp(script) {
  const api = buildApi(ownerOf(script), script.id);
  const ctx = { ...api, setValue: api.set, getValue: api.get };
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileCpp(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `C++ preview: ${d}`);
  const out = {};
  for (const [name, fnNode] of parsed) {
    out[name] = (payload) => {
      const event = payload && typeof payload === 'object' ? payload : { value: payload };
      try { return invokeCpp(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `C++ preview runtime error: ${e?.message ?? e}`); }
    };
  }
  return out;
}

/* ----------------------------------------------------------------------- C# executor */
// Interpreted preview of the C# behavior-handler subset (csharpPreview.js). `ctx` exposes the
// panel API in both C# (PascalCase) and lower-case spellings; handler names match camelCase
// (the skeleton) or PascalCase (idiomatic C#).
function loadHandlersCsharp(script) {
  const api = buildApi(ownerOf(script), script.id);
  const ctx = {
    ...api, setValue: api.set, getValue: api.get,
    SetValue: api.set, GetValue: api.get, Log: api.log,
    SendCC: api.sendCC, SendNRPN: api.sendNRPN, SendSysex: api.sendSysex,
    Clamp: api.clamp, Scale: api.scale, Round: api.round, Snap: api.snap, Lerp: api.lerp, Curve: api.curve,
  };
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileCsharp(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `C# preview: ${d}`);
  const out = {};
  for (const [name, fnNode] of parsed) {
    const fire = (payload) => {
      const event = payload && typeof payload === 'object'
        ? { ...payload, Value: payload.value, FirstTime: payload.firstTime }
        : { value: payload, Value: payload };
      try { return invokeCsharp(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `C# preview runtime error: ${e?.message ?? e}`); }
    };
    out[name] = fire;
    const lower = name.charAt(0).toLowerCase() + name.slice(1); // OnValueChanged → onValueChanged
    if (lower !== name && !out[lower]) out[lower] = fire;
  }
  return out;
}

/* ----------------------------------------------------------------------- Java executor */
// Interpreted preview of the Java behavior-handler subset (javaPreview.js).
function loadHandlersJava(script) {
  const api = buildApi(ownerOf(script), script.id);
  const ctx = { ...api, setValue: api.set, getValue: api.get };
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileJava(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `Java preview: ${d}`);
  const out = {};
  for (const [name, fnNode] of parsed) {
    out[name] = (payload) => {
      const event = payload && typeof payload === 'object' ? payload : { value: payload };
      try { return invokeJava(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `Java preview runtime error: ${e?.message ?? e}`); }
    };
  }
  return out;
}

/* ---------------------------------------------------------------- unified run / load */

/** Execute a script's source and return its declared handlers (JS/C++/C#/Java sync; Lua/Python async). */
async function getHandlers(script) {
  const lang = script?.language ?? 'lua';
  if (lang === 'javascript' || lang === 'js') return loadHandlersJs(script);
  if (lang === 'typescript' || lang === 'ts') return loadHandlersTs(script);
  if (lang === 'lua') return loadHandlersLua(script);
  if (lang === 'python' || lang === 'py') return loadHandlersPython(script);
  if (lang === 'cpp' || lang === 'c++') return loadHandlersCpp(script);
  if (lang === 'csharp' || lang === 'cs' || lang === 'c#') return loadHandlersCsharp(script);
  if (lang === 'java') return loadHandlersJava(script);
  addScriptTrace('error', script?.id ?? '',
    `Language "${lang}" isn't supported in the web runtime (Lua, JavaScript, TypeScript, Python, C++, C#, and Java run here).`);
  return null;
}

/* -------------------------------------------------------------------------- onError */
// A panel reporting its own failures. The LOG always happens; onError is in addition to it, never
// instead of it, or a panel whose error handler is itself broken goes silent.
//
// Two guards, mirroring ScriptRuntime exactly:
//   • inErrorHook — an error raised while reporting an error is logged and stops there, so a
//     broken reporter cannot loop.
//   • deferErrors — load-time errors are held until every script is loaded, because a script that
//     fails to compile FIRST would otherwise be reported to an onError that does not exist yet,
//     which is precisely when a panel most wants to be told.
//
// The hook is looked up by NAME rather than by property access, the way every other event is
// raised — the handler is a script's export, and naming it here keeps it findable.
const ERROR_HOOK = 'onError';
const errorHook = { inHook: false, defer: false, pending: [] };

async function dispatchErrorHook(scriptId, message, phase) {
  if (errorHook.inHook) return;
  const scripts = activeScripts();
  const failing = scripts.find((s) => String(s.id) === String(scriptId));
  const info = {
    scriptId: String(scriptId ?? ''),
    script: failing?.name || String(scriptId ?? ''),
    event: failing?.event ?? '',
    phase,
    message: String(message ?? ''),
  };

  errorHook.inHook = true;
  try {
    for (const s of scripts) {
      if (s.enabled === false) continue;
      // The cache entry is { key, handlers } — the hook is read from the LOADED handlers, never
      // loaded on demand: loading a script from inside the error path is how a reporter that
      // itself fails to compile turns one error into two.
      const fn = handlerCache.get(s.id)?.handlers?.[ERROR_HOOK];
      if (typeof fn !== 'function') continue;
      // Reported, never re-dispatched: this IS the error path.
      try { fn(info); } catch (e) { addScriptTrace('error', s.id, `(in ${ERROR_HOOK}) ${e?.message ?? e}`); }
    }
  } finally {
    errorHook.inHook = false;
  }
}

/** Log a LOAD failure and, once everything is loaded, tell any onError handler about it. */
function reportScriptLoadError(scriptId, message) {
  addScriptTrace('error', scriptId, message);
  if (errorHook.defer) errorHook.pending.push([scriptId, message]);
  else dispatchErrorHook(scriptId, message, 'load');
}

// Report a thrown error as an error line plus a few call-stack frames (when available),
// so the console shows the exception AND where it came from.
function reportScriptError(scriptId, e) {
  const msg = e?.message ?? String(e);
  addScriptTrace('error', scriptId, msg);
  dispatchErrorHook(scriptId, msg, 'dispatch');
  const stack = e && typeof e.stack === 'string' ? e.stack : '';
  if (stack) {
    const frames = stack.split('\n').map((s) => s.trim())
      .filter((l) => /^at\s|:\d+:\d+\)?$|^\[string/.test(l)) // JS "at …" frames / Lua "[string ...]:n"
      .slice(0, 5);
    for (const f of frames) addScriptTrace('trace', scriptId, `  ${f}`);
  }
}

/* ----------------------------------------------------------------- handler cache */
// Scripts load ONCE and are dispatched many times, the way ScriptRuntime::loadScripts does it —
// not re-executed from source on every event. Two reasons beyond the obvious cost:
//   • on(…) listeners registered by top-level code have to outlive the run that registered them,
//     or emit() can never reach them;
//   • run("other.action") needs another script's functions to already exist.
// The key includes the source, so editing a script in the designer invalidates its entry and the
// next dispatch picks up the edit.

const handlerCache = new Map();   // scriptId -> { key, handlers }

function cacheKey(script) {
  return [script?.language ?? '', ownerOf(script), script?.compiledJs ?? '', script?.source ?? ''].join('\u0000');
}

/** Load (or reuse) a script's handlers. Re-loading replaces the script's on(…) listeners and its
    watch/compute/intercept rules and actions — an edit must not leave the previous version's rules
    running beside the new ones. */
async function handlersFor(script) {
  const key = cacheKey(script);
  const hit = handlerCache.get(script.id);
  if (hit && hit.key === key) return hit.handlers;
  clearListeners(script.id);
  clearReactive(script.id);
  clearMidiFiltersFor(script.id);
  const handlers = await getHandlers(script);
  // The script record is kept alongside its handlers because the cache IS the loaded set: at
  // teardown the panel it belonged to may already have been switched away from, so the declared
  // event has to come from here rather than from whatever is active by then.
  handlerCache.set(script.id, { key, handlers, script });
  return handlers;
}

/** Load every active script, so listeners exist and run() can resolve before anything dispatches. */
async function primeHandlers() {
  // Errors raised WHILE loading are held: onError may be declared by a script that has not been
  // loaded yet, and telling nobody is the one outcome this hook exists to prevent.
  errorHook.defer = true;
  errorHook.pending.length = 0;
  try {
    for (const s of activeScripts()) {
      if (s.enabled === false) continue;
      try { await handlersFor(s); } catch (e) { reportScriptLoadError(s.id, e?.message ?? String(e)); }
    }
  } finally {
    errorHook.defer = false;
  }
  const pending = errorHook.pending.splice(0);
  for (const [id, message] of pending) await dispatchErrorHook(id, message, 'load');
}

/* ------------------------------------------------------------------- onPanelDestroy */
// Phase 5, and NOT the same moment as onPanelClose. Closing is the VIEW going away — preview
// stopped, plugin window shut — while the scripts keep running; a plugin with its window closed is
// still playing. Destroying is the SCRIPTS going away.
//
// The handler cache is the loaded set, so it is what gets told and what gets emptied. That makes
// "exactly once per set" fall out of the code rather than needing a flag: a second call finds an
// empty cache and does nothing.
//
// Two moments raise it in the editor, and one that looks like a third deliberately does not:
//   • the active panel changed        → the outgoing panel's scripts are done;
//   • the page is going away          → the app is closing;
//   • an in-editor edit does NOT      → setLiveScripts runs on every keystroke, and a hook whose
//     whole job is "restore the synth, send a final dump" must not fire once per character typed.
//     Editing a script is a RELOAD of the set, not the destruction of it.
export function destroyLoadedScripts() {
  const loaded = [...handlerCache.values()];
  if (!loaded.length) return;
  handlerCache.clear();   // cleared FIRST: a handler that somehow re-enters must not be told twice

  for (const entry of loaded) {
    const s = entry?.script;
    if (!s || s.enabled === false || s.event !== 'onPanelDestroy') continue;
    const fn = entry.handlers?.onPanelDestroy;
    if (typeof fn !== 'function') continue;
    // Synchronous on purpose: a page unload will not wait for a promise, and a teardown hook that
    // only half-runs depending on how it was triggered would be worse than one that never does.
    // Everything a handler needs is still alive here — timers, state, the host — because this runs
    // before resetScriptState.
    try {
      fn(undefined);
      addScriptTrace('log', s.id, `ran onPanelDestroy() in "${s.name}"`);
    } catch (e) {
      // Reported the normal way, and teardown carries on: a failing teardown handler must not be
      // able to keep the old script set alive.
      reportScriptError(s.id, e);
    }
  }
}

/** Drop all cached handlers, listeners and timers — the script set or the panel changed. */
function resetScriptState() {
  handlerCache.clear();
  listeners.length = 0;
  watchers.length = 0;
  computeds.length = 0;
  filters.length = 0;
  actions.clear();
  midiIn.length = 0;
  midiOut.length = 0;
  clearMidiFilters();
  routedRole = null;
  stopAllTimers();
  scriptState.clear();   // `state` lives exactly as long as the loaded script does
}

/** Call a loaded script's handler. Used by dispatch — reuses the cached load. */
async function invokeHandler(script, hook = null, payload = undefined) {
  const handlers = await handlersFor(script);
  if (!handlers) return;
  const fnName = hook || script.event;
  const fn = handlers[fnName];
  if (typeof fn !== 'function') {
    addScriptTrace('log', script.id, `ran "${script.name}" (no ${fnName}() to call — top-level code executed)`);
    return;
  }
  try {
    const result = fn(payload !== undefined ? payload : samplePayload(fnName));
    if (result && typeof result.then === 'function') await result;
    addScriptTrace('log', script.id, `ran ${fnName}() in "${script.name}"`);
  } catch (e) {
    reportScriptError(script.id, e);
  }
}

/**
 * Run a script now — the editor's ▶ Run. Always re-executes the source rather than reusing the
 * cached load: pressing Run is a request to run the code as written, and top-level statements are
 * usually the thing being debugged. Event dispatch takes the cached path instead.
 */
export async function runScript(script, hook = null, payload = undefined) {
  handlerCache.delete(script.id);
  return invokeHandler(script, hook, payload);
}

/* ------------------------------------------------------------- live event dispatch */
// Scripts fire on their own — no ▶ Run — from three sources, all guarded by `dispatching` so a
// script's own set() can't re-enter the watchers (no infinite loop):
//   1. panels store      → onValueChange/onValueChanged when a *script* moves a control's value;
//   2. preview overlay   → onValueChange/onValueChanged + onClick/onPointer*/onHover* when the
//                          *user* interacts with a control in preview (writes panelPreviewSessions,
//                          NOT the panels store);
//   3. preview mode flag → onPanelLoad/onPanelReady/onPanelClose lifecycle as the panel goes live.
//   4. direct dispatch  → onWheel/onDoubleClick/onPointerMove (transient, with pointer coords) from
//                          the preview surface via dispatchInteraction(); press events carry coords too.

// Dispatch is GLOBAL and always-on (set up once via initPanelRuntime) — it follows the ACTIVE
// panel, so scripts react during preview on the canvas tab even when the script editor isn't open.
// Scripts come from the active panel's persisted script document, or from an in-editor live
// override (instant feedback while editing, before the debounced save).
const live = {
  enabledGlobal: true,     // master switch (the editor's "Live" toggle)
  inited: false,
  activePanelId: null,     // follows resolvedActivePanelId
  editOverride: null,      // { panelId, scripts } pushed by an open BehaviorDesigner
  last: new Map(),         // panels store: controlId -> value signature
  sessionLast: new Map(),  // preview overlay: controlId -> { value, pressed, hover }
  readyFired: new Set(),   // panelIds that already saw onPanelReady (firstTime tracking)
  prevPreviewOn: false,
  dispatching: false,
  unsubs: [],
};

function livePanel() {
  if (host) return host.panel ?? null;
  return get(panels).find((p) => String(p.id) === String(live.activePanelId)) ?? null;
}

/**
 * The source scripts a GIVEN panel would run, newest authority first: the Behavior Designer's live
 * override, then its script document, then whatever the panel document itself has saved.
 *
 * Taking the panel as an argument rather than reading `live.activePanelId` is what lets the module
 * gate ask about the same panel it resolved — `activePanel()` follows the store while
 * `live.activePanelId` is only set once initPanelRuntime has run, and gating from a panel whose
 * scripts you could not see is what stubbed the whole API in the designer.
 */
function scriptsForPanel(panel) {
  if (host) return host.scripts ?? [];
  const pid = panel?.id;
  if (pid == null) return [];
  if (live.editOverride && String(live.editOverride.panelId) === String(pid)) return live.editOverride.scripts;
  const doc = get(scriptDocuments).find((d) => String(d.panelId) === String(pid));
  if (doc) return (doc.scripts ?? []).filter(isSourceScript);
  return (panel.scripts ?? []).filter(isSourceScript);
}

/** The source scripts that should react for the active panel (live editor override, else the doc). */
function activeScripts() {
  if (host) return host.scripts ?? [];
  const pid = live.activePanelId;
  if (live.editOverride && String(live.editOverride.panelId) === String(pid)) return live.editOverride.scripts;
  const doc = get(scriptDocuments).find((d) => String(d.panelId) === String(pid));
  return (doc?.scripts ?? []).filter(isSourceScript);
}

/**
 * A control's current "value", wherever it lives:
 *  - standard controls keep it at Value.value,
 *  - custom components keep it in ValueChannels.<name>.currentValue (often several channels).
 * Returns a change-signature (to detect movement) + a representative value (the onValueChanged payload).
 */
function controlValueState(control) {
  const v = valueAtPath(control, 'Value.value');
  if (v !== undefined) return { sig: JSON.stringify(v), value: v };
  const channels = control?._children?.ValueChannels?._children;
  if (channels && typeof channels === 'object') {
    const parts = [];
    let rep;
    for (const key of Object.keys(channels)) {
      const cv = channels[key]?.currentValue;
      parts.push(`${key}=${JSON.stringify(cv)}`);
      if (rep === undefined) rep = cv;
    }
    if (parts.length) return { sig: parts.join('&'), value: rep };
  }
  return { sig: undefined, value: undefined };
}

/** Snapshot every control's current value so the next change is measured against it. */
function snapshotValues() {
  const panel = livePanel();
  const next = new Map();
  if (panel) {
    for (const c of panel.controls) {
      const id = c?._children?.Core?.id;
      if (id != null) next.set(id, controlValueState(c).sig);
    }
  }
  live.last = next;
}

// A doc-level script isn't attached to a specific control yet, so '*' and 'self' match any
// control (coarse). A concrete control name matches just that control (case-insensitive).
function scriptMatchesControl(script, controlName) {
  const t = String(script?.target ?? '*');
  if (t === '*' || t === 'self') return true;
  return t.toLowerCase() === String(controlName ?? '').toLowerCase();
}

// Run a batch of { event, controlName, payload } against the matching live scripts. A null
// controlName means panel-wide (lifecycle). Guarded so a script's own set() can't re-enter.
// `inbound: true` marks the whole batch as a reaction to something the device sent us, so set()
// inside these handlers is silent by default. The depth has to be held across the AWAIT — an RAII
// wrapper around the call would pop it the moment dispatchEvents returned its promise, i.e. before
// a single handler had run, and every write would go out loud.
async function dispatchEvents(events, { inbound = false } = {}) {
  if (!events.length) return;
  const scripts = activeScripts();
  live.dispatching = true;
  if (inbound) origin.inboundDepth += 1;
  try {
    // Load everything first: a script that only registers on(…) listeners has no `event` of its
    // own, so it would never be loaded by the match loop below and its listeners would never fire.
    await primeHandlers();
    for (const ev of events) {
      const matches = scripts.filter((s) =>
        s.enabled !== false && s.event === ev.event &&
        (ev.controlName == null || scriptMatchesControl(s, ev.controlName)));
      for (const s of matches) await invokeHandler(s, s.event, ev.payload);
      // …then the explicit on(target, event, fn) listeners for the same event.
      for (const l of [...listeners]) {
        if (l.event !== ev.event || !listenerMatches(l, ev.controlName)) continue;
        try { l.fn(ev.payload); } catch (e) { reportScriptError(l.scriptId, e); }
      }
    }
  } finally {
    if (inbound) origin.inboundDepth -= 1;
    snapshotValues();          // absorb panels writes our scripts just made
    seedSessionSnapshot();     // and any preview-overlay writes
    live.dispatching = false;
  }
}

/* --- source 1: panels store (script-driven value changes) --- */

function onPanelsChanged() {
  if (live.dispatching) return;            // re-entry from our own set() — ignore
  const panel = livePanel();
  if (!panel) return;
  if (!live.enabledGlobal) { snapshotValues(); return; }   // keep snapshot fresh while paused
  const events = [];
  const next = new Map();
  for (const c of panel.controls) {
    const id = c?._children?.Core?.id;
    if (id == null) continue;
    const name = c?._children?.Core?.name ?? id;
    const { sig, value } = controlValueState(c);
    next.set(id, sig);
    if (live.last.has(id) && live.last.get(id) !== sig) {
      events.push({ event: 'onValueChange', controlName: name, payload: value });
      events.push({ event: 'onValueChanged', controlName: name, payload: value });
      // Panel-wide mirror of the same change, for a script that watches everything at once
      // rather than attaching to each control.
      events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value } });
    }
  }
  live.last = next;
  if (events.length) dispatchEvents(events);
  // The reactive rules settle AFTER the declared events, and run even when there were no
  // events at all: a nested field moving (a colour, a section property) produces no
  // control event, and watching exactly those is the point of watch().
  runReactive();
}

/* --- source 2: preview overlay (user interaction) --- */

// The user's value in preview: a custom component's first channel, else the value override, else
// the checked state.
function sessionValue(session) {
  if (!session) return undefined;
  const cv = session.customValues;
  if (cv && typeof cv === 'object') { const vals = Object.values(cv); if (vals.length) return vals[0]; }
  if (session.valueOverrideEnabled === true) return session.valueOverride;
  if (typeof session.checked === 'boolean') return session.checked;
  return undefined;
}

function controlNameById(id) {
  const c = livePanel()?.controls?.find((x) => x?._children?.Core?.id === id);
  return c?._children?.Core?.name ?? id;
}

function seedSessionSnapshot() {
  const sessions = get(panelPreviewSessions) ?? {};
  const next = new Map();
  for (const [id, s] of Object.entries(sessions)) {
    next.set(id, { value: sessionValue(s), pressed: s.pressed === true, hover: s.hover === true, disabled: s.disabled === true });
  }
  live.sessionLast = next;
}

function onPreviewSessionsChanged(sessions) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  const next = new Map();
  for (const [id, s] of Object.entries(sessions ?? {})) {
    const cur = { value: sessionValue(s), pressed: s.pressed === true, hover: s.hover === true, disabled: s.disabled === true };
    next.set(id, cur);
    const prev = live.sessionLast.get(id);
    if (!prev) continue;
    const name = controlNameById(id);
    if (!Object.is(prev.value, cur.value) && cur.value !== undefined) {
      events.push({ event: 'onValueChange', controlName: name, payload: cur.value });
      if (s.dragging !== true) events.push({ event: 'onValueChanged', controlName: name, payload: cur.value });
      events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value: cur.value } });
    }
    if (prev.pressed !== cur.pressed) {
      const mouse = { x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0 };
      events.push({ event: cur.pressed ? 'onPointerDown' : 'onPointerUp', controlName: name, payload: mouse });
      if (!cur.pressed) events.push({ event: 'onClick', controlName: name, payload: mouse }); // release = click
    }
    if (prev.hover !== cur.hover) {
      events.push({ event: cur.hover ? 'onHoverStart' : 'onHoverEnd', controlName: name, payload: undefined });
    }
    // onStateChanged — the control's interaction state, as one word. Reported after the specific
    // pointer/hover events above, so a handler that only cares "which state now?" has one place
    // to look instead of reconstructing it from four events.
    if (prev.pressed !== cur.pressed || prev.hover !== cur.hover || prev.disabled !== cur.disabled) {
      const stateName = cur.disabled ? 'disabled' : cur.pressed ? 'pressed' : cur.hover ? 'hover' : 'normal';
      events.push({ event: 'onStateChanged', controlName: name, payload: stateName });
    }
  }
  live.sessionLast = next;
  if (events.length) dispatchEvents(events);
  // The reactive rules settle AFTER the declared events, and run even when there were no
  // events at all: a nested field moving (a colour, a section property) produces no
  // control event, and watching exactly those is the point of watch().
  runReactive();
}

/* --- source 3: preview mode flag (lifecycle) --- */

function onPreviewModeChanged(on) {
  if (live.enabledGlobal && on && !live.prevPreviewOn) {
    seedSessionSnapshot();                 // don't fire interaction events for the live snapshot
    const key = String(live.activePanelId ?? '');
    const firstTime = !live.readyFired.has(key);
    live.readyFired.add(key);
    // Phase 1b sits between load and ready, and the clear is what makes it idempotent: a build
    // always starts from the authored panel, so running it twice cannot double the layout. Runtime
    // device declarations go with it, for the same reason and with the same effect — a build
    // declares what it declares, rather than accumulating a second copy on every run.
    clearGeneratedControls();
    clearDeviceRuntimeDefinitions();
    dispatchEvents([
      { event: 'onPanelLoad', controlName: null, payload: undefined },
      { event: 'onPanelBuild', controlName: null, payload: undefined },
      { event: 'onPanelReady', controlName: null, payload: { firstTime } },
    ]);
  } else if (live.enabledGlobal && !on && live.prevPreviewOn) {
    dispatchEvents([{ event: 'onPanelClose', controlName: null, payload: undefined }]);
    live.sessionLast.clear();
    stopAllTimers();   // a timer outliving the panel it belongs to keeps firing into nothing
    clearGeneratedControls();   // …and a generated control outliving its build is just litter
    clearDeviceRuntimeDefinitions();  // …and a declared parameter outliving its panel binds nothing
    clearAllDrawings();         // …and a drawing outliving its panel is painted onto nothing
    stopAllAnimations();        // …and an animation writing into a panel that is gone is noise
    clearScriptUi();            // …and a message about a panel nobody is looking at is worse
  }
  live.prevPreviewOn = on;
}

/* --- source 4: incoming bulk dumps (device host) --- */

// A bulk dump arrived and the device host (C++ DPD codec) decoded it. Fill the bound controls and
// fire onDumpReceived so scripts can run post-load logic. No-op in a plain browser (no host).
function onDumpParsed(payload) {
  const values = payload?.values ?? payload?.parsed?.values ?? null;
  const role = payload?.deviceRole ?? DEFAULT_ROLE;
  if (values && typeof values === 'object') syncDeviceRuntimeStateToPanelPreview({ [role]: values });

  const events = [{ event: 'onDumpReceived', controlName: null,
    payload: { values: values ?? {}, kind: payload?.dumpId ?? payload?.dumpName ?? '', role } }];
  // One onParameterReceived per decoded parameter — the DPD payoff, and the same fan-out the C++
  // player does (PluginProcessor::installScriptDeviceCallback).
  if (values && typeof values === 'object') {
    for (const [parameter, value] of Object.entries(values)) {
      events.push({ event: 'onParameterReceived', controlName: null, payload: { parameter, value, role } });
      // Record what we just announced. The decoded values also land in deviceRuntimeState, whose
      // subscriber raises onParameterReceived for anything that CHANGED — so without this the whole
      // dump would be announced a second time, one event per parameter.
      runtimeParams.set(`${role}\u0000${parameter}`, value);
    }
  }
  // Inbound origin: set()s inside these handlers are silent by default, or filling the panel from a
  // dump echoes the entire dump straight back at the synth.
  dispatchEvents(events, { inbound: true });
  // …and only then the callbacks requestDump(kind, fn) registered. AFTER the declared events, so
  // "the dump arrived" and "the dump I asked for arrived" cannot observe the panel in two different
  // states — the same ordering rule after() follows inside a timer tick.
  resolveDumpWaiters(payload?.dumpId ?? payload?.dumpName ?? '', role, values ?? {});
}

/** The two inbound doors, exposed so tests can knock on them directly. Both are wired to bridge
    listeners in initPanelRuntime, which a test has no host to stand up. */
export function onDumpParsedForTesting(payload) { onDumpParsed(payload); }
export function deliverSysexForTesting(payload) { onSysexInputMessage(payload); }

/* --- source 5: raw MIDI in (device host) --- */
// Payload shapes are copied from the C++ player's own dispatch so a handler reads identically
// whether the window is open or closed. onMidiIn for every message; onCcIn/onSysexIn refine it.

function hexToBytes(hex) {
  const h = String(hex ?? '').replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

/**
 * Classify a note message. Derived from the STATUS BYTE, not from the host's `messageType`, for two
 * reasons: the C++ player does the same arithmetic so the two runtimes cannot disagree, and only
 * the status byte can settle the case below.
 *
 * A note-on with velocity 0 IS a note-off — devices using running status send them constantly, and
 * a panel that treated one as a note-on would hang a voice on every key release. Getting that wrong
 * is precisely the decoding this event exists to save every panel author from doing by hand.
 *
 * `channel` is 1-16, matching sendNote, so `onNoteIn` → `sendNote` echoes correctly. (onCcIn
 * reports 0-based; that is older than this and cannot be changed without breaking panels that
 * already compensate — hence the note in its summary.)
 */
export function noteEventForTesting(bytes) { return noteEventFor(bytes); }

function noteEventFor(bytes) {
  if (bytes.length < 3) return null;
  const kind = bytes[0] & 0xf0;
  if (kind !== 0x90 && kind !== 0x80) return null;
  const payload = { channel: (bytes[0] & 0x0f) + 1, note: bytes[1], velocity: bytes[2] };
  const off = kind === 0x80 || bytes[2] === 0;
  return { event: off ? 'onNoteOffIn' : 'onNoteIn', payload };
}

function onMidiInputMessage(payload) {
  if (live.dispatching || !live.enabledGlobal) return;
  if (!payload) return;
  const bytes = hexToBytes(payload.hex);
  if (!bytes.length) return;
  const status = bytes[0] ?? 0;
  const events = [{
    event: 'onMidiIn',
    controlName: null,
    payload: { bytes, status, channel: status !== 0 ? (status & 0x0f) : 0 },
  }];
  if (String(payload.messageType ?? '') === 'cc' && bytes.length >= 3) {
    events.push({ event: 'onCcIn', controlName: null,
      payload: { channel: bytes[0] & 0x0f, cc: bytes[1], value: bytes[2] } });
  }
  const note = noteEventFor(bytes);
  if (note) events.push({ event: note.event, controlName: null, payload: note.payload });
  dispatchEvents(events, { inbound: true });
}

function onSysexInputMessage(payload) {
  if (live.dispatching || !live.enabledGlobal) return;
  if (!payload) return;
  const bytes = hexToBytes(payload.hex);
  if (!bytes.length) return;
  dispatchEvents([{ event: 'onSysexIn', controlName: null, payload: bytes }], { inbound: true });  // bare byte array

  // …and then the layouts the SCRIPT declared. onSysexIn fires either way: a declared layout adds
  // a decoded reading of the message, it does not take the raw one away, and a panel that handles
  // both must see both. Nothing happens at all when nothing is declared, which is what keeps every
  // existing panel behaving exactly as it did.
  const role = String(payload.deviceRole ?? '') || DEFAULT_ROLE;
  const decoded = decodeRuntimeDump(role, payload.hex);
  if (decoded == null) return;
  if (!decoded.ok) {
    // Reported, not silent: a sysex message arriving while layouts are declared and matching none
    // of them is the single most likely thing to be wrong with a hand-written layout, and it is
    // invisible otherwise. Traced rather than raised — a synth is entitled to send other messages.
    addScriptTrace('log', '', `dump: ${decoded.error}`);
    return;
  }
  onDumpParsed({ deviceRole: role, dumpId: decoded.kind, dumpName: decoded.name, values: decoded.values });
}

/* --- source 6: device connection state --- */
// deviceSessionState carries a per-role record; 'ready' is connected and anything else is not.
// Only the transitions raise an event, so a state refresh that says the same thing stays quiet.

const deviceConnected = new Map();   // role -> boolean

function onDeviceSessionStateChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  for (const [role, record] of Object.entries(state ?? {})) {
    const now = String(record?.state ?? '') === 'ready';
    const before = deviceConnected.get(role);
    deviceConnected.set(role, now);
    if (before === undefined || before === now) continue;
    events.push({
      event: now ? 'onDeviceConnected' : 'onDeviceDisconnected',
      controlName: null,
      payload: { role, profileId: record?.profileId ?? '', message: record?.message ?? '' },
    });
  }
  if (events.length) dispatchEvents(events);
}

/* --- source 8: musical time --- */
// onBeat / onBar / onTransport, from the master clock. The store publishes at ~30Hz (PUBLISH_MS in
// stores/transport.js), which is the honest accuracy limit and is stated on every one of these
// members: a beat at 120bpm is 500ms, so the event lands within a frame of it. Right for an LED or
// a setlist advance; never for timing audio.
//
// Only TRANSITIONS are raised. A stopped transport is silent rather than repeating itself, and
// stopping forgets the position so restarting raises the first beat again instead of swallowing it
// as "no change" — the same rule the player's timer follows, for the same reason.

const clock = { beat: -1, bar: -1, playing: false, bpm: 0 };

function onTransportChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;

  const playing = state?.running === true;
  const bpmRaw = Number(state?.bpm);
  const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : 0;
  const beatsPerBar = Number(state?.beatsPerBar) > 0 ? Number(state.beatsPerBar) : 4;
  const beats = Number(state?.beats) || 0;

  const payload = (bar, beat) => ({
    playing, bpm: bpm || null, beats, bar, beat, beatsPerBar,
    source: String(state?.source ?? 'internal'), valid: true,
  });

  const events = [];
  if (playing !== clock.playing || Math.abs(bpm - clock.bpm) > 0.001) {
    clock.playing = playing;
    clock.bpm = bpm;
    events.push({ event: 'onTransport', controlName: null, payload: payload(0, 0) });
  }

  if (!playing) {
    clock.beat = -1;
    clock.bar = -1;
  } else {
    const absoluteBeat = Math.floor(beats);
    if (absoluteBeat !== clock.beat) {
      clock.beat = absoluteBeat;
      const bar = Math.floor(absoluteBeat / beatsPerBar) + 1;
      const beat = (absoluteBeat % beatsPerBar) + 1;
      events.push({ event: 'onBeat', controlName: null, payload: payload(bar, beat) });
      if (bar !== clock.bar) {
        clock.bar = bar;
        events.push({ event: 'onBar', controlName: null, payload: payload(bar, beat) });
      }
    }
  }

  if (events.length) dispatchEvents(events);
}

/* --- source 7: decoded parameters arriving outside a dump --- */
// deviceRuntimeState is the decoded { role: { parameterId: value } } mirror. A dump updates it in
// one go (already covered by onDumpParsed); a single parameter echoed back by the synth updates
// one key, and that is what this turns into onParameterReceived.

const runtimeParams = new Map();   // "role\0parameter" -> value

function onDeviceRuntimeStateChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  const seeding = runtimeParams.size === 0;
  for (const [role, params] of Object.entries(state ?? {})) {
    if (!params || typeof params !== 'object') continue;
    for (const [parameter, value] of Object.entries(params)) {
      const key = `${role}\u0000${parameter}`;
      const before = runtimeParams.get(key);
      runtimeParams.set(key, value);
      if (seeding || Object.is(before, value)) continue;
      events.push({ event: 'onParameterReceived', controlName: null, payload: { parameter, value, role } });
    }
  }
  if (events.length) dispatchEvents(events, { inbound: true });
}

/**
 * Wire the always-on dispatcher to the stores. Call once at app start. Idempotent. The dispatcher
 * follows the active panel and runs that panel's source scripts on value changes, preview
 * interaction, lifecycle, and incoming device dumps — independent of whether the script editor is open.
 */
export function initPanelRuntime() {
  if (live.inited) return;
  live.inited = true;
  live.activePanelId = get(resolvedActivePanelId);
  live.prevPreviewOn = get(previewModeEnabled) === true;
  snapshotValues();
  seedSessionSnapshot();
  live.unsubs.push(resolvedActivePanelId.subscribe((id) => {
    // Destroy BEFORE the id moves. A handler restoring the synth reads and writes through the
    // ACTIVE panel, so telling it goodbye after the switch would have it writing into the panel
    // that just arrived. The guard also makes the subscriber's immediate first call a no-op.
    if (String(id) !== String(live.activePanelId)) destroyLoadedScripts();
    live.activePanelId = id;
    resetScriptState();        // another panel's scripts, listeners and timers are not ours
    snapshotValues();          // switching panels shouldn't fire spurious changes
    seedSessionSnapshot();
  }));
  live.unsubs.push(panels.subscribe(() => onPanelsChanged()));
  live.unsubs.push(panelPreviewSessions.subscribe((s) => onPreviewSessionsChanged(s)));
  live.unsubs.push(previewModeEnabled.subscribe((on) => onPreviewModeChanged(on === true)));
  live.unsubs.push(onDumpMessageParsed((payload) => onDumpParsed(payload)));
  live.unsubs.push(latestMidiInputMessage.subscribe((p) => onMidiInputMessage(p)));
  live.unsubs.push(latestSysexInputMessage.subscribe((p) => onSysexInputMessage(p)));
  live.unsubs.push(deviceSessionState.subscribe((s) => onDeviceSessionStateChanged(s)));
  live.unsubs.push(deviceRuntimeState.subscribe((s) => onDeviceRuntimeStateChanged(s)));
  live.unsubs.push(transportStore.subscribe((s) => onTransportChanged(s)));

  // The app is closing. `pagehide` rather than `beforeunload`: it is the one that also fires when
  // the page is discarded rather than navigated away from, which is what closing a WebView does.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onPageHide = () => destroyLoadedScripts();
    window.addEventListener('pagehide', onPageHide);
    live.unsubs.push(() => window.removeEventListener('pagehide', onPageHide));
  }
}

/** Pause/resume all live dispatch (the editor's "Live" toggle). */
export function setLiveEnabled(on) {
  live.enabledGlobal = !!on;
  if (on) { snapshotValues(); seedSessionSnapshot(); }   // ignore changes made while paused
}

/**
 * Push the in-editor scripts as a live override for a panel (instant feedback before the debounced
 * save). Pass null to clear the override (the runtime falls back to the panel's saved document).
 */
export function setLiveScripts(scripts, panelId = null) {
  live.editOverride = scripts == null ? null : { panelId, scripts: Array.isArray(scripts) ? scripts : [] };
  // Swapping the script set retires the old set's listeners and timers. Edits to a script that
  // survives the swap are caught by the cache key; a script that disappears is not, and its
  // listeners would go on firing for a script the panel no longer has.
  resetScriptState();
}

/**
 * Fire a transient interaction event (onWheel / onDoubleClick / onPointerMove) for a control, with a
 * coordinate payload. Used by the preview surface for events that aren't persistent session state
 * (so they can't be detected from a panelPreviewSessions diff). Works in the editor and the player.
 */
export function dispatchInteraction(controlId, eventName, payload) {
  if (!live.enabledGlobal || live.dispatching) return undefined;
  // The promise is returned rather than dropped. Callers in the UI ignore it — an interaction is
  // fire-and-forget — but returning it is what lets anything else wait for the handlers to finish.
  return dispatchEvents([{ event: eventName, controlName: controlNameById(controlId), payload }]);
}
