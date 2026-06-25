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

const DEFAULT_ROLE = 'mainSynth';

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

function buildApi(ownerName) {
  const self = {
    set: (p, v) => setValue(ownerName ? `${ownerName}.${p}` : p, v),
    get: (p) => getValue(ownerName ? `${ownerName}.${p}` : p),
  };
  return {
    set: (path, value) => setValue(path, value),
    get: (path) => getValue(path),
    log: (msg, val) => addScriptTrace('log', '', val !== undefined ? `${msg} ${JSON.stringify(val)}` : String(msg)),
    // MIDI/device — real raw send via the device bridge; bulk codec is a fast-follow.
    ...midiApi,
    // flow — minimal for M1
    emit: () => {},
    run: () => {},
    on: () => {},
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

/** Run JS source with the panel API bound and collect its declared handlers (sync). */
function runJsSource(source, scriptId, api) {
  const probe = HANDLER_NAMES.map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',');
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
  return runJsSource(script.source, script.id, buildApi(ownerOf(script)));
}

/** TypeScript: prefer the JS the editor already transpiled (what the C++ host ships), else
    transpile on the fly via the lazy compiler. Both run through the JS path. */
async function loadHandlersTs(script) {
  if (typeof script.compiledJs === 'string' && script.compiledJs.length)
    return runJsSource(script.compiledJs, script.id, buildApi(ownerOf(script)));
  const ts = await ensureTs();
  if (!ts) { addScriptTrace('error', script.id, 'TypeScript compiler unavailable (offline?)'); return null; }
  const js = transpileTs(script.source);
  if (js == null) { addScriptTrace('error', script.id, 'TypeScript transpile failed'); return null; }
  return runJsSource(js, script.id, buildApi(ownerOf(script)));
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
  const api = buildApi(ownerOf(script));
  try {
    for (const [k, v] of Object.entries(api)) lua.global.set(k, v);
    // Clear any handlers left in globals by a previous run, eval the source, then collect this
    // run's handlers into a table the JS side can call.
    const clear = HANDLER_NAMES.map((n) => `${n}=nil`).join(';');
    const collect = HANDLER_NAMES.map((n) => `${n}=${n}`).join(',');
    const handlers = await lua.doString(`${clear}\n${script.source}\nreturn {${collect}}`);
    return handlers || {};
  } catch (e) {
    addScriptTrace('error', script.id, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/* ------------------------------------------------------------------ Python executor */
// Python via Pyodide (CPython in WASM), loaded lazily from the jsDelivr CDN on the first Python
// script. Tier-2 language: runs in the WebView (editor preview + the OPEN plugin window). Offline /
// window-closed Python is a follow-up (bundle Pyodide's assets; the C++ Model-2 runtime is Lua+JS).

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
  const api = buildApi(ownerOf(script));
  try {
    // Fresh namespace per run, seeded with the panel API + helpers as Python globals, so the source
    // can call set()/get()/sendCC()/log()/clamp()/scale()/… directly. Each defined handler is read
    // back out as a callable; JS payloads auto-convert (numbers → int/float, objects → attr access).
    const ns = py.toPy(api);
    py.runPython(script.source, { globals: ns });
    const handlers = {};
    for (const name of HANDLER_NAMES) {
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
  const api = buildApi(ownerOf(script));
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
  const api = buildApi(ownerOf(script));
  const ctx = {
    ...api, setValue: api.set, getValue: api.get,
    SetValue: api.set, GetValue: api.get, Log: api.log,
    SendCC: api.sendCC, SendNRPN: api.sendNRPN, SendSysex: api.sendSysex, Clamp: api.clamp, Scale: api.scale,
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
  const api = buildApi(ownerOf(script));
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

/** Run a script now — execute it and call its declared handler (or a named hook). */
export async function runScript(script, hook = null, payload = undefined) {
  const handlers = await getHandlers(script);
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
async function dispatchEvents(events) {
  if (!events.length) return;
  const scripts = activeScripts();
  live.dispatching = true;
  try {
    for (const ev of events) {
      const matches = scripts.filter((s) =>
        s.enabled !== false && s.event === ev.event &&
        (ev.controlName == null || scriptMatchesControl(s, ev.controlName)));
      for (const s of matches) await runScript(s, s.event, ev.payload);
    }
  } finally {
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
      if (s.dragging !== true) events.push({ event: 'onValueChanged', controlName: name, payload: cur.value });
    }
    if (prev.pressed !== cur.pressed) {
      const mouse = { x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0 };
      events.push({ event: cur.pressed ? 'onPointerDown' : 'onPointerUp', controlName: name, payload: mouse });
      if (!cur.pressed) events.push({ event: 'onClick', controlName: name, payload: mouse }); // release = click
    }
    if (prev.hover !== cur.hover) {
      events.push({ event: cur.hover ? 'onHoverStart' : 'onHoverEnd', controlName: name, payload: undefined });
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
  dispatchEvents([{ event: 'onDumpReceived', controlName: null,
    payload: { values: values ?? {}, kind: payload?.dumpId ?? payload?.dumpName ?? '', role } }]);
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
    snapshotValues();          // switching panels shouldn't fire spurious changes
    seedSessionSnapshot();
  }));
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
