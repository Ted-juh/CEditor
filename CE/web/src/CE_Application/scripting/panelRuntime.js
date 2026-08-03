// panelRuntime.js — the M1 JS/WebView script runtime.
//
// Runs scripts in the WebView, where the controls actually live, and binds the panel API
// (set/get/log/helpers/self) directly to the control stores — so `set("cutoff.value", 8000)`
// moves the real control immediately, no C++ round-trip.
//
// Scope (M1): JavaScript + Lua (wasmoon) execution + control set/get + helpers + log → trace
// console, LIVE onValueChanged dispatch (scripts fire on their own when a control's value changes,
// with a loop guard), and REAL MIDI out (sendCC/sendNRPN/sendSysex → the device bridge; requestDump
// → the device-sync path). Fast-follow: Python (Pyodide); bulk dump ↔ panel codec (applyDump/
// sendDump/buildDump) lands with the value/parameter layer. The C++ runtime stays the engine for
// MIDI/device/export and window-closed logic in shipped panels.

import { get } from 'svelte/store';
import { panels, resolvedActivePanelId } from '../stores/panels.js';
import { updateControlProperty } from '../stores/controls.js';
import { valueAtPath } from '../stores/controlTreeUtils.js';
import { addScriptTrace } from '../stores/scriptConsole.js';
import { isJuceAvailable, triggerRawMidiAction, parseDumpMessage, onDumpMessageParsed } from '../bridge/bridge.js';
import { startDeviceSync, startBulkDumpSend } from '../stores/deviceProfiles.js';
import { deviceSessionState } from '../stores/deviceProfileStores.js';
import { onMidiInputMessage, onSysexInputMessage } from '../bridge/bridge.js';
import { panelPreviewSessions, previewModeEnabled } from '../stores/interactionPreview.js';
import { syncDeviceRuntimeStateToPanelPreview } from '../utils/deviceBindingSync.js';
import { scriptDocuments } from '../stores/scriptWorkspace.js';
import {
  transport as transportStore, transportBeatsNow, transportBpmNow,
  transportBeatsPerBar, isTransportRunning,
} from '../stores/transport.js';
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
import { arpScriptPatch } from '../utils/arpLayout.js';
import { turingScriptPatch } from '../utils/turingLayout.js';
import { looperScriptPatch } from '../utils/looperLayout.js';
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
  live.listenersDirty = true;
  stopAllPreviewTimers();
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
  if (segments.length === 0) return '';
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

function setValue(path, value) {
  const { name, segs } = splitScriptPath(path);
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `set: control "${name}" not found on the active panel`); return; }
  const modelPath = resolveModelPath(control, segs);
  if (host) { host.writeValue(control, modelPath, value); return; }
  updateControlProperty(control?._children?.Core?.id, modelPath, value);
}

function getValue(path) {
  const { name, segs } = splitScriptPath(path);
  const control = findControlByName(name);
  if (!control) return undefined;
  const modelPath = resolveModelPath(control, segs);
  if (host) return host.readValue(control, modelPath);
  return valueAtPath(control, modelPath);
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
};

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
// 2's-complement 7-bit checksum (Roland/Yamaha bulk): sum data bytes, return (128 - sum) & 0x7F.
function checksum7(bytes) {
  let sum = 0;
  for (const v of bytes) sum = (sum + (midiInt(v, 0, 255) & 0x7f)) & 0x7f;
  return (128 - sum) & 0x7f;
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

// Notes: noteOn/noteOff are the held pair; sendNote schedules its own note-off after
// durationMs (default 200). Channels 1–16, matching the whole script API.
function noteOnApi(ch, note, vel) {
  const n = midiInt(note, 0, 127);
  sendRawMidi([0x90 | (midiInt(ch, 1, 16) - 1), n, midiInt(vel === undefined ? 100 : vel, 1, 127)], `note_on_${n}`);
}
function noteOffApi(ch, note) {
  const n = midiInt(note, 0, 127);
  sendRawMidi([0x80 | (midiInt(ch, 1, 16) - 1), n, 0], `note_off_${n}`);
}

/** Live master-clock snapshot for scripts: { playing, bpm, beats, beat, bar, beatsPerBar }. */
function transportSnapshot() {
  const beats = transportBeatsNow();
  const perBar = transportBeatsPerBar() || 4;
  return {
    playing: isTransportRunning(),
    bpm: transportBpmNow(),
    beats,
    beatsPerBar: perBar,
    bar: Math.floor(beats / perBar) + 1,
    beat: Math.floor(beats % perBar) + 1,
  };
}

/* ------------------------------------------------------------------- timers (preview) */
// setInterval-backed named timers, mirroring the C++ TimerManager's contract: repeat by
// default, restart-on-reuse, { once } fires a single time, { beats } converts via the tempo
// at start. All are cleared when the preview stops or the panel changes.

const previewTimers = new Map(); // id -> interval/timeout handle (+ once flag)

function startTimerApi(id, msOrOpts) {
  const key = String(id ?? '');
  if (!key) { addScriptTrace('error', '', 'startTimer(): a timer id is required'); return; }
  let ms = msOrOpts;
  let once = false;
  if (ms && typeof ms === 'object') {
    once = ms.once === true;
    if (ms.beats > 0) {
      const bpm = transportSnapshot().bpm;
      ms = ms.beats * (60000 / (bpm > 0 ? bpm : 120));
    } else ms = ms.ms;
  }
  ms = Math.max(5, Math.round(Number(ms) || 0)); // same floor as the C++ TimerManager
  stopTimerApi(key); // restart-on-reuse (timer-system.md)
  const fire = () => {
    if (once) previewTimers.delete(key);
    dispatchEvents([{ event: 'onTimer', controlName: null, payload: { id: key } }]);
  };
  previewTimers.set(key, once ? setTimeout(fire, ms) : setInterval(fire, ms));
}

function stopTimerApi(id) {
  const key = String(id ?? '');
  const h = previewTimers.get(key);
  if (h !== undefined) { clearInterval(h); clearTimeout(h); previewTimers.delete(key); }
}

function stopAllPreviewTimers() {
  for (const h of previewTimers.values()) { clearInterval(h); clearTimeout(h); }
  previewTimers.clear();
}

/* ------------------------------------------------------- script key/value state */
// Panel-scoped stateSet/stateGet. In the editor it lives for the session (per panel); the
// exported plugin persists its own store with the DAW project (PluginProcessor).

const scriptKvByPanel = new Map(); // panelId -> Map(key -> value)

function kvStore() {
  const pid = String(live.activePanelId ?? 'panel');
  if (!scriptKvByPanel.has(pid)) scriptKvByPanel.set(pid, new Map());
  return scriptKvByPanel.get(pid);
}

const stateApi = {
  stateSet: (key, value) => { kvStore().set(String(key ?? ''), value); },
  stateGet: (key, fallback) => {
    const v = kvStore().get(String(key ?? ''));
    return v === undefined ? fallback : v;
  },
};

const midiApi = {
  sendCC: (ch, cc, v) =>
    sendRawMidi([0xB0 | (midiInt(ch, 1, 16) - 1), midiInt(cc, 0, 127), midiInt(v, 0, 127)], `cc_${midiInt(cc, 0, 127)}`),
  startTimer: startTimerApi,
  stopTimer: stopTimerApi,
  ...stateApi,
  noteOn: noteOnApi,
  noteOff: noteOffApi,
  sendNote: (ch, note, vel, durationMs) => {
    noteOnApi(ch, note, vel);
    setTimeout(() => noteOffApi(ch, note), midiInt(durationMs === undefined ? 200 : durationMs, 1, 60000));
  },
  transport: transportSnapshot,
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
  requestDump: (request) => {
    if (isJuceAvailable()) {
      startDeviceSync({ deviceRole: DEFAULT_ROLE, request: String(request ?? '') });
      addScriptTrace('midi', '', `requestDump(${JSON.stringify(request ?? '')}) → device sync requested`);
    } else {
      addScriptTrace('midi', '', `requestDump(${JSON.stringify(request ?? '')}) — no JUCE host`);
    }
  },
  // 14-bit split + 7-bit checksum, for hand-built NRPN / SysEx.
  to14Bit: (v) => { const n = midiInt(v, 0, 16383); return { msb: (n >> 7) & 0x7f, lsb: n & 0x7f }; },
  checksum: (type, bytes) => checksum7(toByteArray(bytes ?? type)),

  // Bulk dump ↔ panel.
  // applyDump fills the panel from a dump: pass a DECODED { parameterId: value } map and it lands
  // on the bound controls right away (no host needed); pass raw bytes and the device host (C++ DPD
  // codec) decodes them, then onDumpMessageParsed fills the panel + fires onDumpReceived.
  applyDump: (data, role = DEFAULT_ROLE) => {
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
  sendDump: (kind, role = DEFAULT_ROLE) => {
    if (isJuceAvailable()) {
      startBulkDumpSend({ deviceRole: role, expectedDumpId: String(kind ?? ''), dryRun: false });
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) → bulk send requested`);
    } else {
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) — no device host`);
    }
  },
  // buildDump (panel → bytes) is encoded by the device profile's codec, which lives in the C++ host.
  buildDump: () => {
    addScriptTrace('midi', '', 'buildDump(...) — panel→bytes encoding runs in the device host (export/native); use sendDump to transmit');
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
  // Pattern slots + song mode (the chain of patterns).
  phraseStore: (target, slot, name) => phraseAction(target, 'store', { slot, name }),
  phraseLoad: (target, slot) => phraseAction(target, 'load', { slot }),
  phraseChain: (target, on) => phraseAction(target, 'chain', on === undefined ? {} : { on: on !== false }),
  phraseChainLoop: (target, loop) => phraseAction(target, 'chainLoop', loop === undefined ? {} : { loop: loop !== false }),
};

// --- Arpeggiator / Turing / Gesture Looper ----------------------------------
// Same sectionAction shape as the Recorder family; the Turing's `seed` takes the
// injected randomness the same way phraseSeed does.
const arpCmd = (t, a, g) => sectionAction(t, 'Arp', arpScriptPatch, a, g);
const arpApi = {
  arpPattern: (target, pattern) => arpCmd(target, 'pattern', { pattern }),
  arpRate: (target, rate) => arpCmd(target, 'rate', { rate }),
  arpSync: (target, on) => arpCmd(target, 'sync', on === undefined ? {} : { on: on !== false }),
  arpDivision: (target, division) => arpCmd(target, 'division', { division }),
  arpOctaves: (target, octaves) => arpCmd(target, 'octaves', { octaves }),
  arpGate: (target, gate) => arpCmd(target, 'gate', { gate }),
  arpSwing: (target, swing) => arpCmd(target, 'swing', { swing }),
  arpVelocity: (target, velocity) => arpCmd(target, 'velocity', { velocity }),
  arpChannel: (target, channel) => arpCmd(target, 'channel', { channel }),
  arpSource: (target, source) => arpCmd(target, 'source', { source }),
};

const turingCmd = (t, a, g) =>
  sectionAction(t, 'Turing', (cfg, action, args) => turingScriptPatch(cfg, action, args, () => Math.random()), a, g);
const turingApi = {
  turingRandomness: (target, amount) => turingCmd(target, 'randomness', { randomness: amount }),
  turingLength: (target, length) => turingCmd(target, 'length', { length }),
  turingRate: (target, rate) => turingCmd(target, 'rate', { rate }),
  turingSync: (target, on) => turingCmd(target, 'sync', on === undefined ? {} : { on: on !== false }),
  turingDivision: (target, division) => turingCmd(target, 'division', { division }),
  turingSeed: (target) => turingCmd(target, 'seed', {}),
  turingClear: (target) => turingCmd(target, 'clear', {}),
  turingQuantize: (target, levels) => turingCmd(target, 'quantize', { levels }),
};

const looperCmd = (t, a, g) => sectionAction(t, 'Looper', looperScriptPatch, a, g);
const looperApi = {
  looperLaneEnable: (target, lane, enabled) => looperCmd(target, 'laneEnable', { lane, enabled: enabled !== false }),
  looperLaneClear: (target, lane) => looperCmd(target, 'laneClear', { lane }),
  looperClear: (target) => looperCmd(target, 'clear', {}),
  looperRest: (target, lane, rest) => looperCmd(target, 'rest', { lane, rest }),
  looperSync: (target, on) => looperCmd(target, 'sync', on === undefined ? {} : { on: on !== false }),
  looperBars: (target, bars) => looperCmd(target, 'bars', { bars }),
  looperSeconds: (target, seconds) => looperCmd(target, 'seconds', { seconds }),
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

/* ------------------------------------------------------- flow: emit / on / run */
// The composition layer (spec Q6), mirroring the C++ host (ScriptRuntime::dispatchEvent /
// runAction): emit() re-enters the shared dispatch pipeline; on() registrations are collected
// per script load into live.listeners and fired alongside named handlers; run() finds the
// first script defining the action function and calls it.

// A registration matches both the handler-style name a source dispatches ("onValueChanged")
// and the catalog event id a script registers ("valueChanged"). Custom names have no alias.
function eventAliases(event) {
  const names = new Set([event]);
  if (/^on[A-Z]/.test(event)) names.add(event.charAt(2).toLowerCase() + event.slice(3));
  return names;
}

function listenerTargetMatches(target, controlName) {
  if (target === '*' || target === 'self') return true;
  if (controlName == null) return false;
  return String(target).toLowerCase() === String(controlName).toLowerCase();
}

// emit-chain backstop: A emits → a handler emits → … is cut off (and reported) at a fixed
// depth instead of looping forever (the async twin of the C++ maxDispatchDepth guard).
const MAX_EMIT_CHAIN = 16;
let emitChain = 0;

function emitCustomEvent(name, data) {
  const ev = String(name ?? '').trim();
  if (!ev) { addScriptTrace('error', '', 'emit(): event name required'); return; }
  if (emitChain >= MAX_EMIT_CHAIN) {
    addScriptTrace('error', '', `emit("${ev}") dropped: emit chain exceeded ${MAX_EMIT_CHAIN} (feedback loop?)`);
    return;
  }
  emitChain += 1;
  addScriptTrace('trace', '', `emit("${ev}")`);
  // Fire-and-forget by contract; errors are reported per handler inside the dispatch.
  dispatchEvents([{ event: ev, controlName: null, payload: data }]).finally(() => { emitChain -= 1; });
}

const SYNC_RUN_LANGS = new Set(['javascript', 'js', 'cpp', 'c++', 'csharp', 'cs', 'c#', 'java']);
const canRunSync = (s) =>
  SYNC_RUN_LANGS.has(s.language)
  || ((s.language === 'typescript' || s.language === 'ts') && typeof s.compiledJs === 'string' && s.compiledJs.length > 0);

// Synchronously load a script's handlers, probing for `action` too (JS/TS-precompiled/C++/C#/Java).
function loadHandlersSync(script, action) {
  const lang = script.language;
  if (lang === 'javascript' || lang === 'js') return runJsSource(script.source, script.id, buildApi(ownerOf(script)), action);
  if (lang === 'typescript' || lang === 'ts') return runJsSource(script.compiledJs, script.id, buildApi(ownerOf(script)), action);
  if (lang === 'cpp' || lang === 'c++') return loadHandlersCpp(script);
  if (lang === 'csharp' || lang === 'cs' || lang === 'c#') return loadHandlersCsharp(script);
  if (lang === 'java') return loadHandlersJava(script);
  return null;
}

function runNamedAction(targetAction, args) {
  const raw = String(targetAction ?? '').trim();
  const dot = raw.indexOf('.');
  const target = dot > 0 ? raw.slice(0, dot) : '';
  const action = dot > 0 ? raw.slice(dot + 1) : raw;
  if (!action) { addScriptTrace('error', '', 'run(): empty action name'); return undefined; }

  const candidates = activeScripts().filter((s) => s.enabled !== false
    && (!target
      || String(s.name ?? '').toLowerCase() === target.toLowerCase()
      || String(s.target ?? '').toLowerCase() === target.toLowerCase()));

  // Sync-capable scripts first, so run() can hand back the action's return value
  // (matching the C++ host). Lua/Python (and un-transpiled TS) load asynchronously —
  // they still run, but the return value is unavailable.
  for (const s of candidates.filter(canRunSync)) {
    const fn = loadHandlersSync(s, action)?.[action];
    if (typeof fn !== 'function') continue;
    addScriptTrace('trace', s.id, `run("${raw}")`);
    try { return fn(args); } catch (e) { reportScriptError(s.id, e); return undefined; }
  }
  const rest = candidates.filter((s) => !canRunSync(s));
  if (rest.length) {
    (async () => {
      for (const s of rest) {
        const fn = (await getHandlers(s, undefined, action))?.[action];
        if (typeof fn !== 'function') continue;
        addScriptTrace('trace', s.id, `run("${raw}") — async target, return value unavailable`);
        try { const r = fn(args); if (r && typeof r.then === 'function') await r; }
        catch (e) { reportScriptError(s.id, e); }
        return;
      }
      addScriptTrace('error', '', `run("${raw}"): no script defines ${action}()`);
    })();
    return undefined;
  }
  addScriptTrace('error', '', `run("${raw}"): no script defines ${action}()`);
  return undefined;
}

function buildApi(ownerName, collect) {
  // A handle remembers a path prefix (spec Q1's convenience form): h.set("value", 8000) ==
  // set("cutoff.value", 8000); h.on("valueChanged", fn) registers a targeted listener.
  const makeHandle = (name) => ({
    set: (p, v) => setValue(`${name}.${p}`, v),
    get: (p) => getValue(`${name}.${p}`),
    on: (event, fn) => {
      if (typeof fn !== 'function') { addScriptTrace('error', '', `handle.on("${event}"): callback must be a function`); return; }
      collect?.({ target: String(name), event: String(event ?? ''), fn });
    },
  });
  const self = {
    set: (p, v) => setValue(ownerName ? `${ownerName}.${p}` : p, v),
    get: (p) => getValue(ownerName ? `${ownerName}.${p}` : p),
    on: (event, fn) => {
      if (typeof fn !== 'function') { addScriptTrace('error', '', `self.on("${event}"): callback must be a function`); return; }
      collect?.({ target: ownerName || '*', event: String(event ?? ''), fn });
    },
  };
  return {
    panel: { get: (name) => makeHandle(String(name ?? '')) },
    set: (path, value) => setValue(path, value),
    get: (path) => getValue(path),
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
    // Arpeggiator — re-pattern it, sync it, spread it.
    ...arpApi,
    // Turing Modulator — lock the loop, evolve it, ask for a new one.
    ...turingApi,
    // Gesture Looper — mute or wipe lanes, set the loop length.
    ...looperApi,
    // flow (Q6) — emit re-enters dispatch; on() registrations are collected per load;
    // run() calls a named action in another script.
    emit: (name, data) => emitCustomEvent(name, data),
    run: (targetAction, args) => runNamedAction(targetAction, args),
    on: (a, b, c) => {
      // on(target, event, fn), or on(name, fn) for a custom emit()ted event on any target.
      const reg = typeof b === 'function'
        ? { target: '*', event: String(a ?? ''), fn: b }
        : { target: String(a ?? '*'), event: String(b ?? ''), fn: c };
      if (!reg.event) { addScriptTrace('error', '', 'on(): event name required'); return; }
      if (typeof reg.fn !== 'function') {
        addScriptTrace('error', '', `on(…, "${reg.event}", …): the callback form isn't supported in the C++/C#/Java preview — use a named handler function instead`);
        return;
      }
      collect?.(reg);
    },
    noTransmit: (fn) => { try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } },
    transmit: (fn) => { try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } },
    self,
    ...helpers,
  };
}

const HANDLER_NAMES = [
  'onPanelLoad', 'onPanelReady', 'onPanelClose', 'onDawSaveState', 'onDawRestoreState',
  'onValueChange', 'onValueChanged', 'onClick', 'onDoubleClick',
  'onPointerDown', 'onPointerMove', 'onPointerUp', 'onHoverStart', 'onHoverEnd', 'onWheel', 'onStateChanged',
  'onDumpReceived', 'onParameterReceived',
  // Collected so named handlers are ready the moment their preview dispatch lands
  // (today these fire in the exported plugin — see panelApi.js availability).
  'onTimer', 'onMidiIn', 'onCcIn', 'onSysexIn', 'onNoteIn',
  'onControlChanged', 'onPanelStateChanged', 'onDeviceConnected', 'onDeviceDisconnected',
  'onBeat', 'onBar',
];

/** A sensible sample payload for manually running a handler from the editor. */
function samplePayload(event) {
  if (event === 'onPanelReady') return { firstTime: true };
  if (event === 'onValueChange' || event === 'onValueChanged') return 64;
  if (event && event.startsWith('on') && (event.includes('Pointer') || event.includes('Click'))) return { x: 0, y: 0 };
  return undefined;
}

/** The owner name a script's `self`/relative paths resolve against (a concrete control name, or none). */
function ownerOf(script) {
  return script?.target && script.target !== '*' && script.target !== 'self' ? script.target : '';
}

/* -------------------------------------------------------------- JavaScript executor */

// Handler names to probe for after evaluating a source: the catalog, plus an optional extra
// (run()'s action function) when it's a valid identifier not already listed.
function probeNames(extra) {
  return extra && /^[A-Za-z_$][\w$]*$/.test(extra) && !HANDLER_NAMES.includes(extra)
    ? [...HANDLER_NAMES, extra]
    : HANDLER_NAMES;
}

/** Run JS source with the panel API bound and collect its declared handlers (sync). */
function runJsSource(source, scriptId, api, extraProbe) {
  const probe = probeNames(extraProbe).map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',');
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
function loadHandlersJs(script, collect, extraProbe) {
  return runJsSource(script.source, script.id, buildApi(ownerOf(script), collect), extraProbe);
}

/** TypeScript: prefer the JS the editor already transpiled (what the C++ host ships), else
    transpile on the fly via the lazy compiler. Both run through the JS path. */
async function loadHandlersTs(script, collect, extraProbe) {
  if (typeof script.compiledJs === 'string' && script.compiledJs.length)
    return runJsSource(script.compiledJs, script.id, buildApi(ownerOf(script), collect), extraProbe);
  const ts = await ensureTs();
  if (!ts) { addScriptTrace('error', script.id, 'TypeScript compiler unavailable (offline?)'); return null; }
  const js = transpileTs(script.source);
  if (js == null) { addScriptTrace('error', script.id, 'TypeScript transpile failed'); return null; }
  return runJsSource(js, script.id, buildApi(ownerOf(script), collect), extraProbe);
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
async function loadHandlersLua(script, collect, extraProbe) {
  let lua;
  try {
    lua = await getLuaEngine();
  } catch (e) {
    addScriptTrace('error', script.id, `Lua engine failed to start: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), collect);
  try {
    for (const [k, v] of Object.entries(api)) lua.global.set(k, v);
    // Clear any handlers left in globals by a previous run, eval the source, then collect this
    // run's handlers into a table the JS side can call.
    const names = probeNames(extraProbe);
    const clear = names.map((n) => `${n}=nil`).join(';');
    const gather = names.map((n) => `${n}=${n}`).join(',');
    const handlers = await lua.doString(`${clear}\n${script.source}\nreturn {${gather}}`);
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
async function loadHandlersPython(script, collect, extraProbe) {
  let py;
  try {
    py = await getPyodideEngine();
  } catch (e) {
    addScriptTrace('error', script.id, `Pyodide failed to load: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), collect);
  try {
    // Fresh namespace per run, seeded with the panel API + helpers as Python globals, so the source
    // can call set()/get()/sendCC()/log()/clamp()/scale()/… directly. Each defined handler is read
    // back out as a callable; JS payloads auto-convert (numbers → int/float, objects → attr access).
    const ns = py.toPy(api);
    py.runPython(script.source, { globals: ns });
    const handlers = {};
    for (const name of probeNames(extraProbe)) {
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
function loadHandlersCpp(script, collect) {
  const api = buildApi(ownerOf(script), collect);
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
function loadHandlersCsharp(script, collect) {
  const api = buildApi(ownerOf(script), collect);
  const ctx = {
    ...api, setValue: api.set, getValue: api.get,
    SetValue: api.set, GetValue: api.get, Log: api.log,
    SendCC: api.sendCC, SendNRPN: api.sendNRPN, SendSysex: api.sendSysex,
    SendNote: api.sendNote, NoteOn: api.noteOn, NoteOff: api.noteOff, Transport: api.transport,
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
function loadHandlersJava(script, collect) {
  const api = buildApi(ownerOf(script), collect);
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

/** Execute a script's source and return its declared handlers (JS/C++/C#/Java sync; Lua/Python async).
    `collect` (optional) receives each on(...) registration made by the script's top-level code;
    `extraProbe` (optional) additionally probes for that function name (run()'s action lookup). */
async function getHandlers(script, collect, extraProbe) {
  const lang = script?.language ?? 'lua';
  if (lang === 'javascript' || lang === 'js') return loadHandlersJs(script, collect, extraProbe);
  if (lang === 'typescript' || lang === 'ts') return loadHandlersTs(script, collect, extraProbe);
  if (lang === 'lua') return loadHandlersLua(script, collect, extraProbe);
  if (lang === 'python' || lang === 'py') return loadHandlersPython(script, collect, extraProbe);
  if (lang === 'cpp' || lang === 'c++') return loadHandlersCpp(script, collect);
  if (lang === 'csharp' || lang === 'cs' || lang === 'c#') return loadHandlersCsharp(script, collect);
  if (lang === 'java') return loadHandlersJava(script, collect);
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

/** Run a script now — execute it and call its declared handler (or a named hook). */
export async function runScript(script, hook = null, payload = undefined) {
  const regs = [];
  const handlers = await getHandlers(script, (r) => regs.push(r));
  live.listeners.set(script.id, regs);   // refresh this script's on(...) registrations
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
  dispatching: 0,          // dispatch nesting depth (emit() re-enters); truthy while any dispatch runs
  listeners: new Map(),    // scriptId -> [{ target, event, fn }] from on(...) registrations
  listenersDirty: true,    // scripts changed → rescan on the next dispatch
  transportPrevBeats: null, // last transport beat position seen (null = re-seed on next tick)
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

// Rebuild the on(...) registration registry by loading every enabled script once (top-level
// code runs — same as the C++ host, whose engines evaluate each script at loadScripts()).
// Called lazily from dispatchEvents when the script set changed, so pure-listener scripts
// (only on() calls, no bound event) register without their bound event ever firing.
async function refreshListeners() {
  const next = new Map();
  for (const s of activeScripts()) {
    if (s.enabled === false) continue;
    const regs = [];
    await getHandlers(s, (r) => regs.push(r));
    next.set(s.id, regs);
  }
  live.listeners = next;
}

// Run a batch of { event, controlName, payload } against the matching live scripts. A null
// controlName means panel-wide (lifecycle / custom emit). Guarded so a script's own set()
// can't re-enter the watchers; nested entries (a handler that emit()s) share the depth.
const MAX_DISPATCH_DEPTH = 16;
async function dispatchEvents(events) {
  if (!events.length) return;
  if (live.dispatching >= MAX_DISPATCH_DEPTH) {
    addScriptTrace('error', '', `event "${events[0]?.event}" dropped: dispatch depth exceeded ${MAX_DISPATCH_DEPTH} (emit feedback loop?)`);
    return;
  }
  const scripts = activeScripts();
  live.dispatching += 1;
  try {
    if (live.listenersDirty) {
      live.listenersDirty = false;
      await refreshListeners();
    }
    for (const ev of events) {
      // 1) Scripts bound to this event (named-function handlers).
      const matches = scripts.filter((s) =>
        s.enabled !== false && s.event === ev.event &&
        (ev.controlName == null || scriptMatchesControl(s, ev.controlName)));
      for (const s of matches) await runScript(s, s.event, ev.payload);

      // 2) Explicit on(target, event, fn) / on(name, fn) registrations. Sources dispatch
      //    handler-style names ("onValueChanged"); registrations may use the catalog id
      //    ("valueChanged") — match either spelling.
      const wanted = eventAliases(ev.event);
      for (const [scriptId, regs] of live.listeners) {
        for (const r of regs) {
          if (!wanted.has(r.event)) continue;
          if (!listenerTargetMatches(r.target, ev.controlName)) continue;
          try {
            const res = r.fn(ev.payload);
            if (res && typeof res.then === 'function') await res;
          } catch (e) {
            reportScriptError(scriptId, e);
          }
        }
      }
    }
  } finally {
    live.dispatching -= 1;
    if (live.dispatching === 0) {
      snapshotValues();          // absorb panels writes our scripts just made
      seedSessionSnapshot();     // and any preview-overlay writes
    }
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
    next.set(id, { value: sessionValue(s), pressed: s.pressed === true, hover: s.hover === true });
  }
  live.sessionLast = next;
}

function onPreviewSessionsChanged(sessions) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  const next = new Map();
  for (const [id, s] of Object.entries(sessions ?? {})) {
    const cur = { value: sessionValue(s), pressed: s.pressed === true, hover: s.hover === true };
    next.set(id, cur);
    const prev = live.sessionLast.get(id);
    if (!prev) continue;
    const name = controlNameById(id);
    if (!Object.is(prev.value, cur.value) && cur.value !== undefined) {
      events.push({ event: 'onValueChange', controlName: name, payload: cur.value });
      if (s.dragging !== true) {
        events.push({ event: 'onValueChanged', controlName: name, payload: cur.value });
        events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value: cur.value } });
      }
    }
    if (prev.pressed !== cur.pressed) {
      const mouse = { x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0 };
      events.push({ event: cur.pressed ? 'onPointerDown' : 'onPointerUp', controlName: name, payload: mouse });
      if (!cur.pressed) events.push({ event: 'onClick', controlName: name, payload: mouse }); // release = click
    }
    if (prev.hover !== cur.hover) {
      events.push({ event: cur.hover ? 'onHoverStart' : 'onHoverEnd', controlName: name, payload: undefined });
    }
    // Composite interaction state, for onStateChanged: pressed wins over hover.
    const stateOf = (x) => (x.pressed ? 'pressed' : x.hover ? 'hover' : 'normal');
    if (stateOf(prev) !== stateOf(cur)) {
      events.push({ event: 'onStateChanged', controlName: name, payload: stateOf(cur) });
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
    stopAllPreviewTimers();
  }
  live.prevPreviewOn = on;
}

/* --- source 4: the transport (onBeat / onBar) --- */

/**
 * The onBeat/onBar events between two clock readings (pure — exported for tests).
 * bar/beat are 1-based; `beats` is the absolute beat index crossed. A backwards jump
 * (rewind) produces no events — the caller just re-seeds from the new position.
 */
export function beatCrossings(prevBeats, nowBeats, beatsPerBar) {
  const perBar = beatsPerBar > 0 ? beatsPerBar : 4;
  const events = [];
  const from = Math.floor(prevBeats);
  const to = Math.floor(nowBeats);
  for (let b = from + 1; b <= to; b += 1) {
    events.push({ event: 'onBeat', controlName: null,
      payload: { beats: b, bar: Math.floor(b / perBar) + 1, beat: (b % perBar) + 1 } });
    if (b % perBar === 0) {
      events.push({ event: 'onBar', controlName: null, payload: { bar: Math.floor(b / perBar) + 1 } });
    }
  }
  return events;
}

// The transport store publishes on its own clock tick; derive beat crossings from the live
// (never-accumulated) beat position. Re-seeds while stopped so a restart fires beat 1 cleanly.
function onTransportChanged(t) {
  if (!live.enabledGlobal) return;
  if (t?.running !== true) { live.transportPrevBeats = null; return; }
  const beats = transportBeatsNow();
  const prev = live.transportPrevBeats ?? Math.floor(beats) - 1e-9; // first tick → fire the current beat once
  live.transportPrevBeats = beats;
  if (live.dispatching) return; // a dispatch is running; next tick picks up from here
  const events = beatCrossings(prev, beats, transportBeatsPerBar());
  if (events.length) dispatchEvents(events);
}

/* --- source 5: incoming bulk dumps (device host) --- */

// A bulk dump arrived and the device host (C++ DPD codec) decoded it. Fill the bound controls and
// fire onDumpReceived so scripts can run post-load logic. No-op in a plain browser (no host).
function hexToByteList(hexIn) {
  const hex = String(hexIn ?? '').replace(/\s+/g, '');
  const bytes = [];
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16) & 0xFF);
  return bytes;
}

function onDumpParsed(payload) {
  const values = payload?.values ?? payload?.parsed?.values ?? null;
  const role = payload?.deviceRole ?? DEFAULT_ROLE;
  if (values && typeof values === 'object') syncDeviceRuntimeStateToPanelPreview({ [role]: values });
  // Same payload shape as the C++ Player runtime: decoded values + kind + role + the raw bytes.
  const events = [{ event: 'onDumpReceived', controlName: null,
    payload: { values: values ?? {}, kind: payload?.dumpId ?? payload?.dumpName ?? '', role,
      bytes: hexToByteList(payload?.hex) } }];
  // …and one onParameterReceived per decoded parameter (the DPD payoff), like the Player.
  if (values && typeof values === 'object') {
    for (const [parameter, value] of Object.entries(values)) {
      events.push({ event: 'onParameterReceived', controlName: null, payload: { parameter, value } });
    }
  }
  dispatchEvents(events);
}

/* --- source 6: raw MIDI in (device bridge) --- */
// Mirrors the Player's window-closed tap: onMidiIn for every message, refined into onCcIn /
// onNoteIn; onSysexIn for sysex. Channels are 1-16, matching the whole script API.
// Exported for tests — in the app these are fed by the bridge's midi/sysex input events.

export function handleMidiInputMessage(payload) {
  const bytes = hexToByteList(payload?.hex);
  if (!bytes.length) return;
  const status = bytes[0];
  const channel = status >= 0x80 && status < 0xF0 ? (status & 0x0F) + 1 : 0;
  const events = [{ event: 'onMidiIn', controlName: null, payload: { bytes, status, channel } }];
  const kind = status & 0xF0;
  if (kind === 0xB0 && bytes.length >= 3) {
    events.push({ event: 'onCcIn', controlName: null, payload: { channel, cc: bytes[1], value: bytes[2] } });
  }
  if ((kind === 0x90 || kind === 0x80) && bytes.length >= 3) {
    events.push({ event: 'onNoteIn', controlName: null,
      payload: { channel, note: bytes[1], velocity: bytes[2], on: kind === 0x90 && bytes[2] > 0 } });
  }
  dispatchEvents(events);
}

export function handleSysexInputMessage(payload) {
  const bytes = hexToByteList(payload?.hex);
  if (!bytes.length) return;
  dispatchEvents([{ event: 'onSysexIn', controlName: null, payload: bytes }]);
}

/* --- source 7: device session (connect / disconnect) --- */
// The DPD session state is the panel's notion of "connected": a role's session reaching
// "ready" is onDeviceConnected; leaving it is onDeviceDisconnected.

const deviceReadyByRole = new Map();

function onDeviceSessionChanged(sessions) {
  const events = [];
  for (const [role, s] of Object.entries(sessions ?? {})) {
    const state = String(s?.state ?? '');
    const ready = state === 'ready';
    const wasReady = deviceReadyByRole.get(role) === true;
    deviceReadyByRole.set(role, ready);
    if (ready === wasReady) continue;
    events.push({ event: ready ? 'onDeviceConnected' : 'onDeviceDisconnected', controlName: null,
      payload: { role, state } });
  }
  if (events.length) dispatchEvents(events);
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
    live.listenersDirty = true;
    stopAllPreviewTimers();    // another panel's timers must not keep firing
    snapshotValues();          // switching panels shouldn't fire spurious changes
    seedSessionSnapshot();
  }));
  live.unsubs.push(scriptDocuments.subscribe(() => { live.listenersDirty = true; }));
  live.unsubs.push(transportStore.subscribe((t) => onTransportChanged(t)));
  live.unsubs.push(deviceSessionState.subscribe((s) => onDeviceSessionChanged(s)));
  live.unsubs.push(onMidiInputMessage((payload) => handleMidiInputMessage(payload)));
  live.unsubs.push(onSysexInputMessage((payload) => handleSysexInputMessage(payload)));
  live.unsubs.push(panels.subscribe(() => onPanelsChanged()));
  live.unsubs.push(panelPreviewSessions.subscribe((s) => onPreviewSessionsChanged(s)));
  live.unsubs.push(previewModeEnabled.subscribe((on) => onPreviewModeChanged(on === true)));
  live.unsubs.push(onDumpMessageParsed((payload) => onDumpParsed(payload)));
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
  live.listenersDirty = true;   // rescan on(...) registrations against the new script set
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
