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
import { panels, resolvedActivePanelId } from '../stores/panels.js';
import { updateControlProperty } from '../stores/controls.js';
import { valueAtPath } from '../stores/controlTreeUtils.js';
import { addScriptTrace } from '../stores/scriptConsole.js';
import { isJuceAvailable, triggerRawMidiAction, parseDumpMessage, onDumpMessageParsed } from '../bridge/bridge.js';
import {
  startDeviceSync, startBulkDumpSend, commitDeviceParameter,
  latestMidiInputMessage, latestSysexInputMessage, deviceSessionState, deviceRuntimeState,
} from '../stores/deviceProfiles.js';
import {
  handlerNamesForRuntime, RUNTIME_WEBVIEW, VALUE_ACCESSOR_IDS,
  PANEL_TARGET, PANEL_READONLY_PROPERTIES,
} from './panelApi.js';
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
  return panel.controls.find((c) => {
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
  commitDeviceParameter({
    deviceRole: binding.deviceRole ?? DEFAULT_ROLE,
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const helpers = {
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  round: (v) => Math.round(v),
  scale: (v, inLo, inHi, outLo, outHi) => (inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)),
  snap: (v, step) => (step === 0 ? v : Math.round(v / step) * step),
  lerp: (a, b, t) => a + (b - a) * t,
  curve: (v, shape) => (shape === 'exp' ? v * v : shape === 'log' ? Math.sqrt(Math.max(0, v)) : shape === 's' ? v * v * (3 - 2 * v) : v),
  noteName: (n) => { n = Math.floor(n); return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); },
  noteNumber: (name) => { const m = /^([A-G]#?)(-?\d+)$/.exec(name); if (!m) return 0; const i = NOTE_NAMES.indexOf(m[1]); return i < 0 ? 0 : (parseInt(m[2], 10) + 1) * 12 + i; },

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

function sendRawMidi(bytes, actionId) {
  const message = toHexMessage(bytes);
  if (isJuceAvailable()) {
    triggerRawMidiAction({ deviceRole: DEFAULT_ROLE, actionId, message, dryRun: false });
    addScriptTrace('midi', '', `→ ${actionId}: ${message}`);
  } else {
    addScriptTrace('midi', '', `→ ${actionId}: ${message}  (no JUCE host — not sent)`);
  }
}

const midiApi = {
  sendCC: (ch, cc, v) =>
    sendRawMidi([0xB0 | (midiInt(ch, 1, 16) - 1), midiInt(cc, 0, 127), midiInt(v, 0, 127)], `cc_${midiInt(cc, 0, 127)}`),
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
  requestDump: (kind) => {
    if (isJuceAvailable()) {
      startDeviceSync({ deviceRole: DEFAULT_ROLE, request: String(kind ?? '') });
      addScriptTrace('midi', '', `requestDump(${JSON.stringify(kind ?? '')}) → device sync requested`);
    } else {
      addScriptTrace('midi', '', `requestDump(${JSON.stringify(kind ?? '')}) — no device host`);
    }
  },
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

/* ------------------------------------------------------------------ API + executor */

// --- Zone Splitter -----------------------------------------------------------
// `set()` can already reach SplitZone.zones, but nobody is going to hand-write a
// zone array in a script. This reads the current zones, hands them to the same
// pure reducer the editor's own buttons use, and writes the result back — so a
// footswitch changing the split mid-set is one line.
function splitAction(path, action, args) {
  const target = String(path ?? '');
  const zonesPath = `${target}.SplitZone.zones`;
  const current = getValue(zonesPath);
  if (!Array.isArray(current)) {
    addScriptTrace('error', '', `split: "${target}" is not a Zone Splitter (no SplitZone.zones)`);
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
    addScriptTrace('error', '', `phrase: "${target}" is not a Phrase Sequencer (no Phrase section)`);
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
    addScriptTrace('error', '', `${section.toLowerCase()}: "${target}" is not a ${section} (no ${section} section)`);
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
  for (const s of activeScripts()) {
    if (s.enabled === false) continue;
    if (owner && String(s.target ?? '').toLowerCase() !== owner.toLowerCase()) continue;
    const fn = handlerCache.get(s.id)?.handlers?.[action];
    if (typeof fn !== 'function') continue;
    try { return fn(args); } catch (e) { reportScriptError(s.id, e); return undefined; }
  }
  addScriptTrace('error', '', `run("${text}") found no loaded script defining ${action}()`);
  return undefined;
}

/* ------------------------------------------------------------------------- timers */
// A repeating timer owned by the runtime, not the language: Lua can't hold a coroutine open across
// handler calls and QuickJS has no setTimeout, so both need the host to keep time. Starting an id
// that is already running re-times it rather than stacking a second interval.

const timers = new Map();   // id -> interval handle

function startTimer(id, ms) {
  const key = String(id ?? '');
  if (!key) return;
  const period = Math.max(1, Math.round(Number(ms) || 0));
  stopTimer(key);
  timers.set(key, setInterval(() => {
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

function stopAllTimers() {
  for (const handle of timers.values()) clearInterval(handle);
  timers.clear();
}

function buildApi(ownerName, scriptId = '') {
  const self = {
    set: (p, v, form) => setValue(ownerName ? `${ownerName}.${p}` : p, v, typeof form === 'string' ? form : ''),
    get: (p, form) => getValue(ownerName ? `${ownerName}.${p}` : p, form),
  };
  return {
    // The third argument is the value form for the second-argument spelling. `set` also takes an
    // opts object in that position in the contract; only a string is read as a form, so
    // set(path, v, { transmit: false }) is unaffected.
    set: (path, value, form) => setValue(path, value, typeof form === 'string' ? form : ''),
    get: (path, form) => getValue(path, form),
    log: (msg, val) => addScriptTrace('log', '', val !== undefined ? `${msg} ${JSON.stringify(val)}` : String(msg)),
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
    // flow
    emit: (name, data) => deliverEmit(String(name ?? ''), null, data),
    run: (ref, args) => runAction(ref, args),
    on: (target, event, fn) => addListener(scriptId, target, event, fn),
    off: (target, event) => removeListener(scriptId, target, event),
    startTimer: (id, ms) => startTimer(id, ms),
    stopTimer: (id) => stopTimer(id),
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
    addScriptTrace('error', scriptId, `load error: ${e?.message ?? e}`);
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
  if (!ts) { addScriptTrace('error', script.id, 'TypeScript compiler unavailable (offline?)'); return null; }
  const js = transpileTs(script.source);
  if (js == null) { addScriptTrace('error', script.id, 'TypeScript transpile failed'); return null; }
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
    addScriptTrace('error', script.id, `Lua engine failed to start: ${e?.message ?? e}`);
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
    addScriptTrace('error', script.id, `load error: ${e?.message ?? e}`);
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
    addScriptTrace('error', script.id, `Pyodide failed to load: ${e?.message ?? e}`);
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
    addScriptTrace('error', script.id, `load error: ${e?.message ?? e}`);
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

// Report a thrown error as an error line plus a few call-stack frames (when available),
// so the console shows the exception AND where it came from.
function reportScriptError(scriptId, e) {
  const msg = e?.message ?? String(e);
  addScriptTrace('error', scriptId, msg);
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

/** Load (or reuse) a script's handlers. Re-loading replaces the script's on(…) listeners. */
async function handlersFor(script) {
  const key = cacheKey(script);
  const hit = handlerCache.get(script.id);
  if (hit && hit.key === key) return hit.handlers;
  clearListeners(script.id);
  const handlers = await getHandlers(script);
  handlerCache.set(script.id, { key, handlers });
  return handlers;
}

/** Load every active script, so listeners exist and run() can resolve before anything dispatches. */
async function primeHandlers() {
  for (const s of activeScripts()) {
    if (s.enabled === false) continue;
    try { await handlersFor(s); } catch (e) { reportScriptError(s.id, e); }
  }
}

/** Drop all cached handlers, listeners and timers — the script set or the panel changed. */
function resetScriptState() {
  handlerCache.clear();
  listeners.length = 0;
  stopAllTimers();
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
}

/* --- source 3: preview mode flag (lifecycle) --- */

function onPreviewModeChanged(on) {
  if (live.enabledGlobal && on && !live.prevPreviewOn) {
    seedSessionSnapshot();                 // don't fire interaction events for the live snapshot
    const key = String(live.activePanelId ?? '');
    const firstTime = !live.readyFired.has(key);
    live.readyFired.add(key);
    dispatchEvents([
      { event: 'onPanelLoad', controlName: null, payload: undefined },
      { event: 'onPanelReady', controlName: null, payload: { firstTime } },
    ]);
  } else if (live.enabledGlobal && !on && live.prevPreviewOn) {
    dispatchEvents([{ event: 'onPanelClose', controlName: null, payload: undefined }]);
    live.sessionLast.clear();
    stopAllTimers();   // a timer outliving the panel it belongs to keeps firing into nothing
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
}

/* --- source 5: raw MIDI in (device host) --- */
// Payload shapes are copied from the C++ player's own dispatch so a handler reads identically
// whether the window is open or closed. onMidiIn for every message; onCcIn/onSysexIn refine it.

function hexToBytes(hex) {
  const h = String(hex ?? '').replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
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
  dispatchEvents(events, { inbound: true });
}

function onSysexInputMessage(payload) {
  if (live.dispatching || !live.enabledGlobal) return;
  if (!payload) return;
  const bytes = hexToBytes(payload.hex);
  if (!bytes.length) return;
  dispatchEvents([{ event: 'onSysexIn', controlName: null, payload: bytes }], { inbound: true });  // bare byte array
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
  if (!live.enabledGlobal || live.dispatching) return;
  dispatchEvents([{ event: eventName, controlName: controlNameById(controlId), payload }]);
}
