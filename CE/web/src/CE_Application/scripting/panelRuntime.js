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
import { updateControlProperty } from '../stores/controls.js';
import { valueAtPath } from '../stores/controlTreeUtils.js';
import { addScriptTrace } from '../stores/scriptConsole.js';
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
  CE_API_VERSION, RUNTIME_ANY, panelModules, moduleGateMessage,
  allModules, moduleById, memberMapFor, registeredExtensions,
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
import { createControl, COMPONENT_TYPES } from '../models/componentTypes.js';
import { setDrawing, clearDrawing } from '../stores/scriptDraw.js';
import {
  setInboundMidiFilter, setOutboundMidiFilter, clearMidiFilters, filterInboundMidi,
} from './midiFilters.js';
import { COMPONENT_VERBS, componentScriptPatch } from './componentVerbs.js';
import { typeOfControl, familiesForType } from './componentSchema.js';
import { SCALES, CHORDS } from './musicTheory.js';
import {
  notify as uiNotifyStore, setStatus as uiStatusStore, openDialog as uiDialogStore, clearScriptUi,
} from '../stores/scriptUi.js';
import {
  flatControls, findControlById, findParentOfControl, isContainerControl,
  insertControlIntoTree, removeControlFromTree, remintControlIds,
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

  if (host) host.writeValue(control, modelPath, value);
  else updateControlProperty(control?._children?.Core?.id, modelPath, value);

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

// @module ce.music
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// A pitch argument is a MIDI number or a name ("C4"), the way sendNote's already is.
const musicPitch = (v) => (typeof v === 'string'
  ? helpers.noteNumber(v)
  : Math.floor(Number(v) || 0));
const musicSteps = (table, name) => table[name == null ? 'major' : String(name)];
const musicNotes = (table, root, name) => {
  const steps = musicSteps(table, name);
  if (!steps) return undefined;
  const base = musicPitch(root);
  return steps.map((x) => base + x);
};
// @module ce.math
// A seeded xorshift32, written the same way in every prelude and masked to 32 bits at every step.
// Seeded is the whole point: the language's own math.random cannot promise the same sequence in
// five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
// different in the editor and in the export.
const DEFAULT_SEED = 0x9E3779B9;
let randomState = DEFAULT_SEED;

function randomNext() {
  let x = randomState;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  randomState = x;
  return x / 4294967296;      // [0, 1)
}

function randomSeedImpl(n) {
  const v = Math.floor(Number(n) || 0) >>> 0;
  // 0 is a dead state for xorshift — it would return zero forever — so it means "the default"
  // rather than "a generator that never moves".
  randomState = v === 0 ? DEFAULT_SEED : v;
}

function randomImpl(lo, hi) {
  const r = randomNext();
  if (lo === undefined || lo === null || hi === undefined || hi === null) return r;
  const a = Math.floor(Number(lo)), b = Math.floor(Number(hi));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return r;
  // Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step.
  const low = Math.min(a, b), high = Math.max(a, b);
  return low + Math.floor(r * (high - low + 1));
}

const helpers = {
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  round: (v) => Math.round(v),
  scale: (v, inLo, inHi, outLo, outHi) => (inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)),
  snap: (v, step) => (step === 0 ? v : Math.round(v / step) * step),
  lerp: (a, b, t) => a + (b - a) * t,
  curve: (v, shape) => (shape === 'exp' ? v * v : shape === 'log' ? Math.sqrt(Math.max(0, v)) : shape === 's' ? v * v * (3 - 2 * v) : v),
  // @module ce.music
  random: (lo, hi) => randomImpl(lo, hi),
  randomSeed: (n) => randomSeedImpl(n),
  noteName: (n) => { n = Math.floor(n); return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); },
  noteNumber: (name) => { const m = /^([A-G]#?)(-?\d+)$/.exec(name); if (!m) return 0; const i = NOTE_NAMES.indexOf(m[1]); return i < 0 ? 0 : (parseInt(m[2], 10) + 1) * 12 + i; },
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
function checksumOf(kind, bytes) {
  let sum = 0;
  let x = 0;
  for (const v of bytes) {
    const b = midiInt(v, 0, 255) & 0xff;
    sum = (sum + b) % 128;
    x = (x ^ b) & 0x7f;
  }
  const k = String(kind ?? 'roland').toLowerCase();
  if (k === 'xor') return x;
  if (k === 'sum') return sum;
  return (128 - sum) % 128;
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
const midiNote = (n) => (typeof n === 'string' ? helpers.noteNumber(n) : midiInt(n, 0, 127));

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
  checksum: (type, bytes) =>
    (bytes === undefined || bytes === null
      ? checksumOf('roland', toByteArray(type))     // one-arg form: checksum(bytes)
      : checksumOf(type, toByteArray(bytes))),

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
};

// --- Recorder / Harmoniser / Setlist -----------------------------------------
// All three follow the Phrase Sequencer's shape exactly: read the section, hand
// it to a pure reducer, write back only the fields that changed. One helper,
// because three near-identical copies is how they drift apart.
function sectionAction(path, section, reducer, action, args) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.${section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${section.toLowerCase()}: ${wrongTargetMessage(target, section, section)}`);
    return;
  }
  const patch = reducer(cfg, action, args ?? {});
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    // Not an error: an unknown argument or a move that changes nothing is a
    // no-op by design. Silence would look like a dead footswitch, though.
    addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} ${JSON.stringify(args ?? {})} — nothing to change`);
    return;
  }
  for (const key of keys) setValue(`${target}.${section}.${key}`, patch[key]);
  addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} → ${keys.join(', ')}`);
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
    return;
  }
  const patch = componentScriptPatch(verb, cfg, args);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    // A no-op is by design: an out-of-range index, an unrecognised enum, or a value that clamps to
    // what it already was. Reported anyway — silence looks exactly like a dead footswitch.
    addScriptTrace('log', '',
      `${verb.family} ${path}: ${verb.v}(${args.map((x) => JSON.stringify(x) ?? 'nil').join(', ')}) — nothing to change`);
    return;
  }
  for (const key of keys) setValue(`${path}.${verb.section}.${key}`, patch[key]);
  addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v} → ${keys.join(', ')}`);
}

const componentVerbApi = Object.fromEntries(COMPONENT_VERBS.map((verb) => [
  verb.id,
  // Rest args rather than a fixed arity: the verbs take one, two or three, and a wrapper that
  // named them would have to be generated per kind for no gain. `target` is always first.
  (target, ...rest) => componentVerbAction(verb, target, rest),
]));

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

function addListener(scriptId, target, event, fn) {
  if (typeof fn !== 'function') return;
  listeners.push({ scriptId, target: String(target ?? '*'), event: String(event ?? ''), fn });
}

/** off(target, event) — drop THIS script's listeners for that pair. Scoped to the caller so one
    script cannot silently unsubscribe another's handlers. An unknown pair is a no-op. */
function removeListener(scriptId, target, event) {
  const t = String(target ?? '*');
  const e = String(event ?? '');
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

/** The four shapes ce.math.curve() offers, computed the same way, so knowing one is knowing both. */
export function animationEase(progress, curve) {
  const v = Math.min(1, Math.max(0, Number(progress) || 0));
  if (curve === 'exp') return v * v;
  if (curve === 'log') return Math.sqrt(v);
  if (curve === 's') return v * v * (3 - 2 * v);
  return v;
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

function startAnimationImpl(kind, path, target, opts = {}) {
  const key = String(path ?? '');
  if (!key) return false;

  const number = (name, fallback) => {
    const v = Number(opts?.[name]);
    return Number.isFinite(v) ? v : fallback;
  };
  const spring = kind === 'spring';
  // `from` defaults to where the value IS, so an animation starts from the truth rather than from
  // wherever the previous one happened to stop.
  const fromRaw = opts?.from != null ? Number(opts.from) : Number(getValue(key, 'value'));
  const from = Number.isFinite(fromRaw) ? fromRaw : 0;

  // Nothing has ticked yet on a fresh panel, so seed the origin from the clock the interval below
  // will use — otherwise the first animation measures against zero and finishes instantly.
  if (!animationTicked) { animationNowMs = animationNow(); animationTicked = true; }

  animations.set(key, {                       // …replacing any animation already on this path:
    kind: spring ? 'spring' : 'to',            // a value has one destination
    path: key,
    from,
    to: Number(target) || 0,
    startMs: animationNowMs,
    duration: Math.max(1, number('duration', spring ? 600 : 300)),
    curve: typeof opts?.curve === 'string' ? opts.curve : 'linear',
    damping: number('damping', 6),
    frequency: number('frequency', 12),
  });

  if (animationTimer == null && typeof setInterval === 'function') {
    animationTimer = setInterval(() => tickAnimations(animationNow()), ANIMATION_TICK_MS);
  }
  return true;
}

function stopAnimationImpl(path) {
  if (path == null || String(path) === '') animations.clear();
  else animations.delete(String(path));
  if (!animations.size && animationTimer != null) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  return true;
}

function animationRunningImpl(path) {
  if (path == null || String(path) === '') return animations.size > 0;
  return animations.has(String(path));
}

/** Advance every animation to `nowMs` and write the values. Exported so tests drive time directly
 *  rather than sleeping — an animation test that waits on a real clock is a flaky test. */
export function tickAnimations(nowMs) {
  animationNowMs = Number(nowMs) || 0;
  animationTicked = true;
  if (!animations.size) return;
  // Iterate a copy: a set() can run a script that starts or stops an animation.
  for (const a of [...animations.values()]) {
    const progress = Math.min(1, Math.max(0, (nowMs - a.startMs) / a.duration));
    const eased = a.kind === 'spring'
      ? animationSpring(progress, a.damping, a.frequency)
      : animationEase(progress, a.curve);
    setValue(a.path, a.from + (a.to - a.from) * eased);
    if (progress >= 1) stopAnimationImpl(a.path);
  }
}

/** Panel teardown: an animation writing into a panel that is gone is just noise. */
export function stopAllAnimations() {
  stopAnimationImpl('');
  animationNowMs = 0;      // the next panel starts its own clock
  animationTicked = false;
}

// @module ce.ui
/* ----------------------------------------------------------------------------------- ce.ui */
// Telling the person using the panel something. Panel view only — there is nobody to tell with the
// window shut, which is why these are stubbed in the C++ engines rather than made cross-runtime.

function uiNotifyImpl(message, opts) {
  const text = String(message ?? '').trim();
  if (!text) return false;
  uiNotifyStore(text, {
    kind: opts?.kind,
    duration: opts?.duration != null ? Number(opts.duration) : undefined,
  });
  return true;
}

function uiStatusImpl(message) {
  uiStatusStore(message ?? '');
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
const drawState = { target: null, fill: null, stroke: null, strokeWidth: 1 };

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
  list.push({ ...command, fill: drawState.fill, stroke: drawState.stroke, strokeWidth: drawState.strokeWidth });
  drawCommands.set(id, list);
  setDrawing(id, [...list]);
  return true;
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

function startTimer(id, ms) {
  const key = String(id ?? '');
  if (!key) return;
  const period = Math.max(1, Math.round(Number(ms) || 0));
  stopTimer(key);
  timers.set(key, setInterval(() => {
    // A one-shot is not a timer the panel declared, so it must NOT surface as onTimer — every
    // script with an onTimer handler would have to learn to filter ids it never created.
    if (runAfterCallback(key)) return;
    dispatchEvents([{ event: 'onTimer', controlName: null, payload: { id: key } }]);
  }, period));
}

function stopTimer(id) {
  const key = String(id ?? '');
  const handle = timers.get(key);
  if (handle === undefined) return;
  clearInterval(handle);
  timers.delete(key);
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

function syncTimerRead(id, beats) {
  const ms = beatsToMsRead(beats);
  if (ms == null) {
    addScriptTrace('log', '',
      `syncTimer("${id}"): no tempo is being reported, so there is no interval to compute. `
      + 'Use startTimer with a millisecond interval, or wait for onTransport.');
    return;
  }
  startTimer(id, Math.round(ms));
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

function settingsStore() {
  const panel = activePanel();
  if (!panel) return null;
  panel.scripting ??= {};
  panel.scripting.settings ??= {};
  return panel.scripting.settings;
}

function saveSetting(key, value) {
  const store = settingsStore();
  if (!store) { addScriptTrace('error', '', `saveSetting("${key}"): no active panel to store it on`); return; }
  store[String(key)] = value;
}

function loadSetting(key, fallback) {
  const store = settingsStore();
  const v = store?.[String(key)];
  return v === undefined ? fallback : v;
}

/** Every key this panel has saved. Empty means nothing written — not "settings unavailable". */
function listSettings() {
  return Object.keys(settingsStore() ?? {});
}

/** Delete one. Returns whether there was one, so "cleaned up" reads differently from "nothing there". */
function forgetSetting(key) {
  const store = settingsStore();
  const k = String(key);
  if (!store || !(k in store)) return false;
  delete store[k];
  return true;
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
    animateTo: (path, target, opts) => startAnimationImpl('to', path, target, opts ?? {}),
    animateSpring: (path, target, opts) => startAnimationImpl('spring', path, target, opts ?? {}),
    animateStop: (path) => stopAnimationImpl(path),
    animateRunning: (path) => animationRunningImpl(path),
    // ce.ui — a message for whoever is using the panel
    uiNotify: (message, opts) => uiNotifyImpl(message, opts),
    uiStatus: (message) => uiStatusImpl(message),
    uiDialog: (opts, onChoice) => uiDialogImpl(scriptId, opts, onChoice),
    // ce.draw — immediate-mode drawing on top of a control
    drawClear: (target) => drawClearImpl(target, ownerName),
    drawFill: (colour) => { drawState.fill = colour == null ? null : String(colour); },
    drawStroke: (colour, width) => {
      drawState.stroke = colour == null ? null : String(colour);
      drawState.strokeWidth = Number(width) > 0 ? Number(width) : 1;
    },
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
    // The two ce.panel verbs that are NOT panel-view only. The C++ preludes build these on a host
    // query for the control names plus get/set; here the panel object is in hand, so the same walk
    // is direct. Same rules either way — see panelSnapshotImpl.
    panelEach: (fn) => panelEachImpl(scriptId, fn),
    panelSnapshot: () => panelSnapshotImpl(),
    panelRestore: (snap) => panelRestoreImpl(snap),
    // ce.time — reads and musical timers
    tempo: () => tempoRead(),
    isPlaying: () => isPlayingRead(),
    transportInfo: () => transportInfoRead(),
    beatsToMs: (beats, bpm) => beatsToMsRead(beats, bpm),
    msToBeats: (ms, bpm) => msToBeatsRead(ms, bpm),
    syncTimer: (id, beats) => syncTimerRead(id, beats),
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
    // ce.storage
    state: stateFor(scriptId),
    saveSetting: (key, value) => saveSetting(key, value),
    loadSetting: (key, fallback) => loadSetting(key, fallback),
    listSettings: () => listSettings(),
    forgetSetting: (key) => forgetSetting(key),
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
    for (const [k, v] of Object.entries(api)) lua.global.set(k, v);
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
