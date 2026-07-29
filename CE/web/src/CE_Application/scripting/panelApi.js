// panelApi.js — single source of truth for the CEditor panel scripting API.
//
// The ONE thing it does not hold itself: what a module costs. That is measured from the preludes
// by tools/scripts/gen-script-modules.mjs and imported below — asserting a size here would just be
// a number nobody recomputes.
//
// This module DESCRIBES the API surface that scripts call. It drives, from one place:
//   • the tree-picker ("This panel" + "Commands"),
//   • edit-time validation (unknown paths, wrong scope, bad args),
//   • the generated reference manual,
//   • (later) the Sol3 (Lua) + juce_javascript (JS) host bindings.
//
// It is DATA, not behaviour — the runtime lives in the C++ host (Model 2).
// Spec: tools/docs/panel-api-spec.md (decisions Q1–Q11). Naming rule throughout:
// self-evident, distinct words, established conventions.
//
// PARITY IS ENFORCED. Five runtimes implement this contract — the WebView runtime
// (panelRuntime.js) and the four C++ engines (Lua/JS/Python preludes + the native-handler
// ABI). CE/web/test/panelApiParity.test.js asserts that every member declared here is
// implemented by each runtime that claims to support it, and that no runtime exposes a
// member this file doesn't declare. Add the entry HERE first, then implement it — an
// undeclared global is a test failure, not a feature.
//
// Snippet templates use ${name} placeholders the picker fills, and $0 for the final
// cursor / $1.. for tab stops. Each member that differs by language carries a per-language
// snippet; otherwise the call looks identical in Lua and JS.

import { MODULE_COST, MODULE_COST_LANGUAGES } from './moduleCost.generated.js';
import {
  COMPONENT_FAMILIES, COMPONENT_VERBS, moduleIdFor, verbSignature, verbSummary, verbArgs,
} from './componentVerbs.js';

export { MODULE_COST, MODULE_COST_LANGUAGES };

/* ------------------------------------------------------------------ languages */

export const SCRIPT_LANGUAGES = [
  {
    id: 'lua',
    label: 'Lua',
    version: '5.4',
    host: 'Sol3',
    live: true, // runs live in the editor (Model 2 — in the C++ host)
    block: 'function(${e})\n  $0\nend', // anonymous function body
    method: ':', // handle method call separator  ->  handle:set(...)
    comment: '--',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    version: 'ES2023',
    host: 'juce_javascript (QuickJS)',
    live: true,
    block: '(${e}) => {\n  $0\n}',
    method: '.', // handle.set(...)
    comment: '//',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    version: '5.x',
    host: 'transpiled to JS (QuickJS)',
    live: true, // transpiles to JS, which runs everywhere JS does
    block: '(${e}) => {\n  $0\n}',
    method: '.',
    comment: '//',
  },
  {
    id: 'python',
    label: 'Python',
    version: '3.x',
    host: 'Pyodide (WASM)',
    live: false, // Tier 2 — live in the WebView (editor preview + plugin window); in the native C++ runtime only when CPython is embedded at export (embedPython auto/on), not in the always-on Lua+JS core
    block: 'def ${e}:\n  $0',
    method: '.',
    comment: '#',
  },
  {
    id: 'cpp',
    label: 'C++',
    version: '17',
    host: 'CeScript interpreter — preview only (compile-at-export planned)',
    live: true,    // runs live in the editor via the interpreted handler subset (cppPreview.js)
    subset: true,  // …a subset; does NOT yet run in the shipped plugin (see native-handlers-design.md)
    block: '[](CeContext& ctx, const CeEvent& event) {\n  $0\n}',
    method: '.',
    comment: '//',
  },
  {
    id: 'csharp',
    label: 'C#',
    version: '12',
    host: 'CeScript interpreter — preview only (compile-at-export planned)',
    live: true,
    subset: true,
    block: '(${e}) => {\n  $0\n}',
    method: '.',
    comment: '//',
  },
  {
    id: 'java',
    label: 'Java',
    version: '21',
    host: 'CeScript interpreter — preview only (compile-at-export planned)',
    live: true,
    subset: true,
    block: '(${e}) -> {\n  $0\n}',
    method: '.',
    comment: '//',
  },
];

// Tier-1 = always built into every export incl. the C++ window-closed runtime (Lua + JS). Python is
// Tier-2: live in the WebView, and in the native runtime only when CPython is embedded at export (the
// embedPython auto/on setting). RUNNABLE_LANGUAGES is every language the WebView runtime can execute
// (C++ via the interpreted preview subset).
export const TIER1_LANGUAGES = ['lua', 'javascript', 'typescript'];
export const RUNNABLE_LANGUAGES = ['lua', 'javascript', 'typescript', 'python', 'cpp', 'csharp', 'java'];

/* ----------------------------------------------------------- scopes / context */
// Where a member is valid. 'any' = all scopes. Scope-relative resolution (Q7):
// names resolve within the script's own container; a custom-component script sees
// only its own parts. `self` = the element the script is attached to (injected,
// same word in both languages).

export const SCRIPT_SCOPES = ['component', 'panel', 'device', 'project'];

export const SELF = {
  id: 'self',
  label: 'self',
  summary: 'The element this script is attached to: the control for a component script, THE PANEL for a panel script. Use instead of a fixed name so one script works on every copy of a reusable component.',
  scopes: ['component', 'panel'],
};

/* ------------------------------------------------------------- the panel itself */
// `panel` is a RESERVED first path segment: it addresses the panel document rather than a control,
// so get("panel.width") and set("panel.bgColour", …) reach the thing the script lives inside.
//
// Before this existed the first segment was always a control name, so the panel — its size, its
// name, its background, its panic key — was invisible to scripts, and asking for it produced
// "control 'panel' not found", which is a misleading answer to a reasonable question.
//
// A control actually NAMED "panel" loses to the document and is reported, because behaviour that
// depends on whether someone happened to name a knob "panel" is worse than a reserved word.

export const PANEL_TARGET = 'panel';

// Identity and structure. Writing these would corrupt the document or silently detach it from its
// file, so they read but do not write. Everything else on the panel is writable, exactly as every
// control property is.
export const PANEL_READONLY_PROPERTIES = ['id', 'panelGuid', 'scriptId', 'filePath', 'controls', 'scripts'];

// The properties worth surfacing in the picker. Not a whitelist — any panel property resolves —
// just the ones a script is likely to want, with a description.
export const PANEL_PROPERTIES = [
  { id: 'name', type: 'string', summary: 'The panel\'s name.' },
  { id: 'width', type: 'number', summary: 'Panel width in pixels.' },
  { id: 'height', type: 'number', summary: 'Panel height in pixels.' },
  { id: 'author', type: 'string', summary: 'Author metadata.' },
  { id: 'version', type: 'string', summary: 'Panel version metadata.' },
  { id: 'description', type: 'string', summary: 'Panel description metadata.' },
  { id: 'locked', type: 'boolean', summary: 'Whether editing is locked.' },
  { id: 'resizable', type: 'boolean', summary: 'Whether the panel window can be resized.' },
  { id: 'panicShortcut', type: 'string', summary: 'The panel-wide emergency-stop key. Empty string switches it off.' },
  { id: 'bgColour', type: 'string', summary: 'Background colour, AARRGGBB hex.' },
  { id: 'bgSolid', type: 'boolean', summary: 'Whether the solid background layer is drawn.' },
  { id: 'bgGradientEnabled', type: 'boolean', summary: 'Whether the gradient background layer is drawn.' },
  { id: 'bgImageEnabled', type: 'boolean', summary: 'Whether the image background layer is drawn.' },
  { id: 'controlCount', type: 'number', readOnly: true, summary: 'How many controls the panel holds.' },
];

/* --------------------------------------------------------------- value access */
// A control value has three representations (Q8). The DPD converts between them.
// Addressed as a suffix on a control path: "cutoff.value", "cutoff.normalizedValue", …

// TWO SPELLINGS, ONE MEANING. The accessor may be a path suffix — get("cutoff.normalizedValue") —
// or a second argument — get("cutoff", "normalizedValue"). Both work in every runtime; the suffix
// is what the picker inserts and what the manual shows. An explicit second argument wins if you
// somehow give both. (The suffix was documented and the argument was implemented, for a while, and
// neither was wired all the way through — see VALUE_ACCESSOR_IDS' use in the runtimes.)
//
// `.value` and `.normalizedValue` are pure arithmetic over the control's own Behavior.min/max, so
// they work anywhere. `.midiValue` is what the DPD would put on the wire, which only the device
// host can answer — it is marked accordingly and reports rather than returning a quiet nothing.

export const VALUE_ACCESSORS = [
  { id: 'value', label: '.value', summary: 'The real, human value — e.g. 8000 (Hz) or "LP" (enum name). The default. Setting it lets the DPD convert to MIDI on send.' },
  { id: 'normalizedValue', label: '.normalizedValue', summary: 'The 0–1 position, from the control\'s own min/max. For uniform math, curves, and linking controls of different ranges.' },
  { id: 'midiValue', label: '.midiValue', requiresDeviceHost: true, summary: 'The value as MIDI (e.g. 101), as the DPD would encode it. Device-bound controls only, and only with the device host attached — the encoding lives there, not in the panel.' },
];

export const VALUE_ACCESSOR_IDS = VALUE_ACCESSORS.map((a) => a.id);

/* ------------------------------------------------------------------- runtimes */
// Where a member actually runs. Most of the API is 'any' — implemented identically by the
// WebView runtime and by the C++ engines, so a script behaves the same window-open and
// window-closed. A few members are 'webview': they drive panel components (Zone Splitter,
// Phrase Sequencer, Recorder, Harmoniser, Setlist) that exist ONLY in the panel view — there
// is no C++ implementation of those components to talk to. The C++ engines still DEFINE
// those names, so calling one window-closed logs a clear explanation instead of dying with
// "attempt to call a nil value"; scriptValidate warns if a window-closed script uses one.

export const RUNTIME_ANY = 'any';         // WebView + every C++ engine
export const RUNTIME_WEBVIEW = 'webview'; // panel view only; C++ engines stub it with a notice
export const RUNTIME_PLAYER = 'player';   // the exported plugin only; the editor has no DAW to raise it

// Some members need the DEVICE HOST — the C++ side that owns the DPD codec and the MIDI ports.
// They are cross-runtime (every engine binds them) but they cannot produce an answer in a plain
// browser tab with no host attached. Marked so the docs say it, and so the runtimes report it
// instead of returning undefined and letting the author guess.
export const REQUIRES_DEVICE_HOST = 'requiresDeviceHost';

/* ------------------------------------------------------------- lifecycle hooks */
// Named entry points the host calls (Q5). `onDaw*` = host-triggered.

export const LIFECYCLE_HOOKS = [
  {
    id: 'onPanelLoad', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelLoad()',
    summary: 'Phase 1 — before the GUI exists. MIDI setup / init SysEx only. Do NOT touch controls; they do not exist yet.',
    params: [],
    snippet: { lua: 'function onPanelLoad()\n  $0\nend', javascript: 'function onPanelLoad() {\n  $0\n}' },
  },
  {
    id: 'onPanelBuild', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onPanelBuild()',
    summary: 'Phase 1b — BUILD the panel. The place to create, clone and parent controls, typically from what the device reports. Runs after onPanelLoad and before onPanelReady, in the panel view only: there is no renderer window-closed, so nothing here can run in a DAW with the window shut. Every control a script creates is cleared before this fires, so the handler always starts from the authored panel and running it twice cannot double the layout.',
    params: [],
    snippet: {
      lua: 'function onPanelBuild()\n  for i = 1, 4 do\n    ce.panel.create("Knob", { name = "osc" .. i, x = 20 + i * 90, y = 40 })\n  end\n  $0\nend',
      javascript: 'function onPanelBuild() {\n  for (let i = 1; i <= 4; i++) {\n    ce.panel.create("Knob", { name: "osc" + i, x: 20 + i * 90, y: 40 });\n  }\n  $0\n}',
    },
  },
  {
    id: 'onError', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onError(info)',
    summary: 'A script failed. `info` carries script, scriptId, event, phase ("load" | "dispatch") and message. Runs everywhere, which is the point — window-closed there is nobody watching a log, so this is how a panel reports its own failures. The error is ALWAYS logged as well; this is in addition to that, never instead of it. An error raised inside onError is logged and not re-dispatched, so a broken reporter cannot loop.',
    params: [{ name: 'info', type: 'object', fields: ['script', 'scriptId', 'event', 'phase', 'message'] }],
    snippet: {
      lua: 'function onError(info)\n  set("status.text", info.script .. ": " .. info.message)\n  $0\nend',
      javascript: 'function onError(info) {\n  set("status.text", `${info.script}: ${info.message}`);\n  $0\n}',
    },
  },
  {
    id: 'onDraw', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onDraw(info)',
    summary: 'Paint on top of the control this script is attached to. `info` carries target, width and height — the control\'s own size, so the drawing scales with it. Called when something asks for a repaint, NOT every frame: to animate, drive it from onTimer and call ce.draw.redraw(). Panel view only; there is no surface with the window shut.',
    params: [{ name: 'info', type: 'object', fields: ['target', 'width', 'height'] }],
    snippet: {
      lua: 'function onDraw(info)\n  ce.draw.clear()\n  ce.draw.stroke("#5B9BD5", 2)\n  ce.draw.line(0, info.height / 2, info.width, info.height / 2)\n  $0\nend',
      javascript: 'function onDraw(info) {\n  ce.draw.clear();\n  ce.draw.stroke("#5B9BD5", 2);\n  ce.draw.line(0, info.height / 2, info.width, info.height / 2);\n  $0\n}',
    },
  },
  {
    id: 'onPanelReady', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelReady(info)',
    summary: 'Phase 2 — GUI ready. Read the synth, fill controls. May re-fire on VST3 window reopen; guard one-time work with `if info.firstTime`.',
    params: [{ name: 'info', type: 'object', fields: ['firstTime'] }],
    snippet: {
      lua: 'function onPanelReady(info)\n  if info.firstTime then\n    $0\n  end\nend',
      javascript: 'function onPanelReady(info) {\n  if (info.firstTime) {\n    $0\n  }\n}',
    },
  },
  {
    id: 'onPanelClose', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelClose()',
    summary: 'Phase 4 — the VIEW is going away: preview stopped, or the plugin window was closed. Your scripts keep running (timers still tick, MIDI still arrives) — a plugin with its window shut is still playing. For "my scripts are being torn down", use onPanelDestroy.',
    params: [],
    snippet: { lua: 'function onPanelClose()\n  $0\nend', javascript: 'function onPanelClose() {\n  $0\n}' },
  },
  {
    id: 'onPanelDestroy', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelDestroy()',
    summary: 'Phase 5 — your SCRIPTS are going away: the panel was switched, the script set replaced, or the plugin unloaded. The last thing that runs. Everything still works here — timers, state, MIDI — so this is where you restore the synth, send a final dump, or release what you took. Fires exactly once per loaded script set, whether or not onPanelClose ever did; a window that was never opened never closed, but it is still destroyed.',
    params: [],
    snippet: { lua: 'function onPanelDestroy()\n  $0\nend', javascript: 'function onPanelDestroy() {\n  $0\n}' },
  },
  // RETURN what you want saved — do not mutate `store`. `store` arrives as a copy: each engine
  // marshals it into the script's own language (a fresh Lua table, a QuickJS object, a Python
  // dict), so writing into it changes something the host will never read, and the state vanishes
  // when the DAW reopens the project. Returning an object is the contract every engine honours:
  // ScriptRuntime::onDawSaveState merges the returned keys into the shared store.
  //
  // Player-only. The editor has no DAW to save a project, so these never fire in preview — test
  // them in the exported plugin.
  {
    id: 'onDawSaveState', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_PLAYER,
    signature: 'onDawSaveState(store) -> object',
    summary: 'The DAW is saving the project — RETURN an object of what to save. `store` is what other scripts have saved so far, for reading. Mutating it does nothing.',
    params: [{ name: 'store', type: 'object' }],
    snippet: {
      lua: 'function onDawSaveState(store)\n  return { ${1:key} = ${2:value} }$0\nend',
      javascript: 'function onDawSaveState(store) {\n  return { ${1:key}: ${2:value} };$0\n}',
    },
  },
  {
    id: 'onDawRestoreState', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_PLAYER,
    signature: 'onDawRestoreState(store)',
    summary: 'The DAW reopened the project — read your values back out of `store` (the object your onDawSaveState returned, merged with every other script\'s).',
    params: [{ name: 'store', type: 'object' }],
    snippet: { lua: 'function onDawRestoreState(store)\n  $0\nend', javascript: 'function onDawRestoreState(store) {\n  $0\n}' },
  },
];

/* -------------------------------------------------------------------- events */
// Subscribed two ways (Q3): named functions `onX(payload)` for a control's OWN events,
// or explicit `on(target, event, fn)` to reach anything else. Payloads use descriptive
// names passed directly (Q4): one obvious datum directly, several fields as one object.

export const CONTROL_EVENTS = [
  { id: 'valueChange', fn: 'onValueChange', payload: 'value', summary: 'Live — fires continuously while the value is moving (for GUI/preview).' },
  { id: 'valueChanged', fn: 'onValueChanged', payload: 'value', summary: 'Settled — fires when the value reaches its final value (for transmit).' },
  { id: 'click', fn: 'onClick', payload: 'mouse', summary: 'Clicked. mouse.x, mouse.y.' },
  { id: 'doubleClick', fn: 'onDoubleClick', payload: 'mouse', summary: 'Double-clicked.' },
  { id: 'pointerDown', fn: 'onPointerDown', payload: 'mouse', summary: 'Mouse pressed. mouse.x/.y/.button/.modifiers.' },
  { id: 'pointerMove', fn: 'onPointerMove', payload: 'mouse', summary: 'Mouse moved while down.' },
  { id: 'pointerUp', fn: 'onPointerUp', payload: 'mouse', summary: 'Mouse released.' },
  { id: 'hoverStart', fn: 'onHoverStart', payload: null, summary: 'Mouse entered the control.' },
  { id: 'hoverEnd', fn: 'onHoverEnd', payload: null, summary: 'Mouse left the control.' },
  { id: 'wheel', fn: 'onWheel', payload: 'wheel', summary: 'Scrolled over the control. wheel.delta.' },
  { id: 'stateChanged', fn: 'onStateChanged', payload: 'state', summary: 'State swapped (hover/pressed/disabled).' },
];

// `panelStateChanged` used to be declared here. There is no panel-state feature in the model —
// nothing in the editor, the player, or the C++ runtime ever switched one — so the event could
// not fire in any runtime. Declaring an event no runtime raises is the same defect as declaring
// a command no runtime implements; it comes back when panel states do.
export const PANEL_EVENTS = [
  { id: 'controlChanged', fn: 'onControlChanged', payload: 'info', summary: 'Any control changed. info.target, info.value.' },
  { id: 'timer', fn: 'onTimer', payload: 'info', summary: 'A started timer fired. info.id.' },
];

// Musical time. Raised by whichever runtime is following the clock — the editor's master clock, or
// the DAW playhead window-closed — by watching the position on the MESSAGE THREAD at roughly 30Hz.
//
// That polling rate is the honest limit and it is stated everywhere these appear: a beat at 120bpm
// is 500ms, so the event lands within a frame of it, which is right for lighting an LED, advancing
// a setlist or stepping a sequencer. It is NOT sample-accurate and must never be used to time audio.
export const TIME_EVENTS = [
  { id: 'beat', fn: 'onBeat', payload: 'time', summary: 'A beat passed. time.bar, time.beat, time.beats, time.bpm. Message-thread accurate (~30Hz), not sample-accurate.' },
  { id: 'bar', fn: 'onBar', payload: 'time', summary: 'A bar passed. time.bar, time.beats, time.beatsPerBar. Fires with the downbeat, alongside onBeat.' },
  { id: 'transport', fn: 'onTransport', payload: 'time', summary: 'The transport started, stopped, or changed tempo. time.playing, time.bpm, time.source.' },
];

export const DEVICE_EVENTS = [
  // decoded (the DPD payoff — 90% of use)
  { id: 'parameterReceived', fn: 'onParameterReceived', payload: 'info', decoded: true, summary: 'A value arrived, decoded via the DPD. info.parameter, info.value.' },
  { id: 'dumpReceived', fn: 'onDumpReceived', payload: 'dump', decoded: true, summary: 'A bulk dump arrived. dump.bytes, dump.kind. Use applyDump(dump.bytes) to fill the panel.' },
  // raw (escape hatch)
  { id: 'midiIn', fn: 'onMidiIn', payload: 'midi', decoded: false, summary: 'Any MIDI arrived (raw). midi.bytes, midi.channel, midi.status.' },
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', decoded: false, summary: 'A CC arrived. cc.channel, cc.cc, cc.value. NOTE: cc.channel is 0-based here, unlike sendCC and unlike onNoteIn — a long-standing quirk that cannot be changed without breaking panels that already compensate.' },
  // The most common message on the wire had no event of its own: a panel reacting to played notes
  // had to take onMidiIn and decode status nibbles by hand, in every language, including the
  // note-on-with-velocity-0 case that actually means note-off. Both are derived from the STATUS
  // BYTE rather than from the host's messageType, so the two runtimes cannot classify differently.
  { id: 'noteIn', fn: 'onNoteIn', payload: 'note', decoded: false,
    summary: 'A note was played. note.channel (1-16, matching sendNote), note.note, note.velocity. A note-on with velocity 0 is NOT one of these — it is a note-off, and arrives as onNoteOffIn.' },
  { id: 'noteOffIn', fn: 'onNoteOffIn', payload: 'note', decoded: false,
    summary: 'A note was released. note.channel (1-16), note.note, note.velocity (the release velocity, 0 when the device sent a note-on with velocity 0 instead of a note-off).' },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'Raw SysEx arrived.' },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A device connected.' },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A device disconnected.' },
];

export const EVENTS = { control: CONTROL_EVENTS, panel: PANEL_EVENTS, time: TIME_EVENTS, device: DEVICE_EVENTS };

/* ------------------------------------------------------------------ commands */
// The action verbs (Q1, Q2, Q6, Q9). Picker category "Commands". param.type drives validation.
//
// SCOPE, and what it is actually for. `scopes` limits where a member may be used. The Device/MIDI
// verbs used to declare device/panel/project — design intent from the spec, never enforced. When
// enforcement was added the rule turned out to be wrong: a COMPONENT script is a per-control
// script, and a control that sends a CC or a sysex message on press is the ordinary case, not an
// abuse. Enforcing the list as written would have broken every panel whose buttons talk to the
// synth. So the MIDI verbs are 'any', and the only genuinely scoped members left are the
// panel-component verbs, which need a component to exist — a device script runs at onPanelLoad,
// before the GUI is there. That restriction is real, so it is the one that is enforced.

export const COMMANDS = [
  /* --- Values (Q1) --- */
  {
    id: 'set', category: 'Values', signature: 'set(path, value [, opts])',
    summary: 'Write a value at a path. Suffix the path with .normalizedValue to write a 0–1 position instead of the real value. Transmits to the synth by default (Q2); silence is auto-inferred when reacting to inbound MIDI.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'value', type: 'value', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['transmit'] },
    ],
    scopes: 'any',
    snippet: { lua: 'set("${1:path}", ${2:value})$0', javascript: 'set("${1:path}", ${2:value})$0' },
  },
  {
    id: 'get', category: 'Values', signature: 'get(path [, form])',
    summary: 'Read a value at a path. Choose the representation by suffixing the path (.value — the default — .normalizedValue, or .midiValue) or by passing it as `form`.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'form', type: 'string', required: false, values: VALUE_ACCESSOR_IDS },
    ],
    scopes: 'any',
    snippet: { lua: 'get("${1:path}")$0', javascript: 'get("${1:path}")$0' },
  },

  /* --- Transmit control (Q2, Family A) --- */
  {
    id: 'noTransmit', category: 'Transmit', signature: 'noTransmit(fn)',
    summary: 'Run a block writing to the panel WITHOUT sending to the synth (e.g. an Init-Patch button). Auto-resets at block end.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'noTransmit(function()\n  $0\nend)', javascript: 'noTransmit(() => {\n  $0\n})' },
  },
  {
    id: 'transmit', category: 'Transmit', signature: 'transmit(fn)',
    summary: 'Force a block to send to the synth, even inside an inbound handler.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'transmit(function()\n  $0\nend)', javascript: 'transmit(() => {\n  $0\n})' },
  },

  /* --- Events & Flow (Q3, Q6) --- */
  {
    id: 'on', category: 'Events & Flow', signature: 'on(target, event, fn)',
    summary: 'React to an event on another control / the panel / the device, or to a custom emitted event.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'event', type: 'eventName', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'on("${1:target}", "${2:event}", function(${3:e})\n  $0\nend)',
      javascript: 'on("${1:target}", "${2:event}", (${3:e}) => {\n  $0\n})',
    },
  },
  {
    id: 'off', category: 'Events & Flow', signature: 'off(target, event)',
    summary: 'Stop reacting to an event you subscribed to with on(). Removes this script\'s listeners for that target and event; unknown pairs are ignored.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'event', type: 'eventName', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'off("${1:target}", "${2:event}")$0', javascript: 'off("${1:target}", "${2:event}")$0' },
  },

  /* --- Reactive core -------------------------------------------------------------------------
   * The four verbs that let a script do what setting a property cannot.
   *
   * A properties panel stores a CONSTANT, decided at design time. Everything below stores a RULE
   * the runtime keeps applying: a value that follows other values, a filter every write passes
   * through, an observer over the whole model rather than eleven pre-enumerated events, and a
   * named action the panel can be built out of. */
  {
    id: 'watch', category: 'Events & Flow', signature: 'watch(path, fn)',
    summary: 'Call fn(value, previous) whenever ANY model path changes — a nested section field, a '
      + 'colour, a device binding — not just the eleven declared control events. Source-agnostic: it '
      + 'fires whether a script, the user or inbound MIDI moved it.',
    params: [
      { name: 'path', type: 'string', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'watch("${1:cutoff.value}", function(${2:v}, prev)\n  $0\nend)',
      javascript: 'watch("${1:cutoff.value}", (${2:v}, prev) => {\n  $0\n})',
    },
  },
  {
    id: 'compute', category: 'Events & Flow', signature: 'compute(path, fn)',
    summary: 'Make a property a FORMULA instead of a constant: fn is re-evaluated whenever anything '
      + 'moves, and its result is written to path. Unlike doing it in a handler, the runtime owns '
      + 'the re-evaluation, so it cannot fall out of step with an event you forgot to hook.',
    params: [
      { name: 'path', type: 'string', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'compute("${1:label.text.text}", function()\n  return $0\nend)',
      javascript: 'compute("${1:label.text.text}", () => {\n  return $0\n})',
    },
  },
  {
    id: 'intercept', category: 'Events & Flow', signature: 'intercept(path, fn)',
    summary: 'Sit in front of every write to path. fn(value, prev) returns a replacement value to '
      + 'transform it (clamp, quantize, snap), false to reject it, or nothing to accept it unchanged. '
      + 'The panel has no way to express what happens WHEN a value changes; this does.',
    params: [
      { name: 'path', type: 'string', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'intercept("${1:cutoff.value}", function(${2:v}, prev)\n  return $0\nend)',
      javascript: 'intercept("${1:cutoff.value}", (${2:v}, prev) => {\n  return $0\n})',
    },
  },
  {
    id: 'defineAction', category: 'Events & Flow', signature: 'defineAction(name, fn)',
    summary: 'Register a named action this panel can be built out of: run("name") calls it from any '
      + 'script in any language, and it is offered wherever the panel binds actions. Scripts stop '
      + 'being only things the panel triggers and become things the panel is made of.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'defineAction("${1:initPatch}", function(${2:args})\n  $0\nend)',
      javascript: 'defineAction("${1:initPatch}", (${2:args}) => {\n  $0\n})',
    },
  },
  {
    id: 'emit', category: 'Events & Flow', signature: 'emit(name [, data])',
    summary: 'Announce a custom event; any script listening with on(name, …) reacts. Fire-and-forget, language-neutral.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'data', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'emit("${1:name}", ${2:data})$0', javascript: 'emit("${1:name}", ${2:data})$0' },
  },
  {
    id: 'run', category: 'Events & Flow', signature: 'run(target.action [, args])',
    summary: 'Run a named action elsewhere. Host-dispatched — works cross-language. Supports a return value. Only simple data crosses the boundary.',
    params: [
      { name: 'action', type: 'scriptRef', required: true },
      { name: 'args', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'run("${1:target.action}")$0', javascript: 'run("${1:target.action}")$0' },
  },

  /* --- Timers --- */
  // A repeating timer owned by the host, not by the language: a Lua script can't hold a
  // coroutine open across handler calls, and setTimeout doesn't exist in QuickJS. The id is
  // yours — start with the same id twice and the second call re-times the existing timer.
  {
    id: 'startTimer', category: 'Events & Flow', signature: 'startTimer(id, ms)',
    summary: 'Start (or re-time) a repeating timer. It fires onTimer with info.id every `ms` until stopTimer(id).',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'ms', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'startTimer("${1:id}", ${2:250})$0', javascript: 'startTimer("${1:id}", ${2:250})$0' },
  },
  {
    id: 'after', category: 'Events & Flow', signature: 'after(ms, fn) -> id',
    summary: 'Run `fn` ONCE, `ms` from now. Every other timer here repeats, so a one-shot delay — send a program change, wait for the synth to settle, then send the dump — was written as a repeating timer that stops itself, which is easy to get wrong: a callback that throws before it cancels runs forever. Returns an id you can pass to stopTimer to cancel it before it fires.',
    params: [
      { name: 'ms', type: 'number', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'after(${1:250}, function()\n  $0\nend)',
      javascript: 'after(${1:250}, function () {\n  $0\n});',
    },
  },
  {
    id: 'stopTimer', category: 'Events & Flow', signature: 'stopTimer(id)',
    summary: 'Stop a timer started with startTimer. Stopping an unknown id is harmless.',
    params: [{ name: 'id', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'stopTimer("${1:id}")$0', javascript: 'stopTimer("${1:id}")$0' },
  },

  /* --- Device / MIDI: bulk (Q9) --- */
  {
    id: 'requestDump', category: 'Device / MIDI', signature: 'requestDump(kind [, fn [, opts]])',
    summary: 'Ask the synth to send a dump. `kind` is defined by the DPD ("patch"/"tone"/"global"…) or declared by defineDump. With `fn`, the reply comes back to it — fn(values, info) — instead of only reaching onDumpReceived with nothing tying it to the request. `info.ok` is false when nothing arrived in time (`opts.timeout`, 3000ms by default), so a callback is never left hanging. fn runs AFTER onDumpReceived, so both see the same panel.',
    params: [
      { name: 'kind', type: 'dumpKind', required: true },
      { name: 'fn', type: 'function', required: false },
      { name: 'opts', type: 'object', required: false, fields: ['timeout'] },
    ],
    scopes: 'any',
    snippet: {
      lua: 'requestDump("${1:patch}", function(values, info)\n  if info.ok then $0 end\nend)',
      javascript: 'requestDump("${1:patch}", (values, info) => {\n  if (info.ok) { $0 }\n});',
    },
  },
  {
    id: 'applyDump', category: 'Device / MIDI', signature: 'applyDump(bytes)',
    summary: 'Fill the whole panel from a received dump (walks the DPD map). Silent automatically — inbound context. Also accepts an already-decoded { parameter: value } map, which is how a panel can be filled with no device host attached.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'applyDump(${1:bytes})$0', javascript: 'applyDump(${1:bytes})$0' },
  },
  {
    id: 'sendDump', category: 'Device / MIDI', signature: 'sendDump(kind)',
    summary: 'Build a dump from the panel values and send it to the synth.',
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendDump("${1:patch}")$0', javascript: 'sendDump("${1:patch}")$0' },
  },
  {
    id: 'buildDump', category: 'Device / MIDI', signature: 'buildDump(kind)',
    summary: 'Build the dump bytes from the panel values without sending. Needs the device host: the panel→bytes encoding is the DPD codec, which lives there, so this returns nothing in a plain browser tab and says so.',
    requiresDeviceHost: true,
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: 'any',
    snippet: { lua: 'local bytes = buildDump("${1:patch}")$0', javascript: 'const bytes = buildDump("${1:patch}")$0' },
  },

  /* --- Animation (design doc §6 phase 6) ---
     Move a value over time instead of jumping it. CROSS-RUNTIME, and deliberately so: a filter
     sweep triggered by a note has to work in a DAW with the panel shut, which is what §2 meant by
     "values any, visuals webview". Animating a VISUAL property is panel-view only for the obvious
     reason, but that falls out of what the path addresses rather than needing its own rule.

     The position is a PURE FUNCTION OF ELAPSED TIME — from + (to - from) * ease(elapsed/duration)
     — never an accumulated step. Two runtimes integrating independently would drift apart; two
     runtimes evaluating the same formula at the same elapsed time cannot. */
  {
    id: 'animateTo', category: 'Animation', signature: 'animateTo(path, target [, opts])',
    summary: 'Move a value to `target` over time. `opts` may carry { duration (ms, default 300), curve ("linear" | "exp" | "log" | "s"), from }. Starting a second animation on the same path replaces the first — a value has one destination.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'target', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['duration', 'curve', 'from'] },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.anim.to("${1:cutoff}", ${2:127}, { duration = ${3:500}, curve = "s" })$0',
      javascript: 'ce.anim.to("${1:cutoff}", ${2:127}, { duration: ${3:500}, curve: "s" });$0',
    },
  },
  {
    id: 'animateSpring', category: 'Animation', signature: 'animateSpring(path, target [, opts])',
    summary: 'Move a value to `target` with a damped oscillation — it overshoots and settles. `opts` may carry { duration (ms, default 600), damping (default 6), frequency (default 12), from }.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'target', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['duration', 'damping', 'frequency', 'from'] },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.anim.spring("${1:cutoff}", ${2:127})$0',
      javascript: 'ce.anim.spring("${1:cutoff}", ${2:127});$0',
    },
  },
  {
    id: 'animateStop', category: 'Animation', signature: 'animateStop([path])',
    summary: 'Stop the animation on `path`, leaving the value where it got to. No path stops every animation this panel is running.',
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.anim.stop("${1:cutoff}")$0', javascript: 'ce.anim.stop("${1:cutoff}");$0' },
  },
  {
    id: 'animateRunning', category: 'Animation', signature: 'animateRunning([path])',
    summary: 'Is `path` being animated right now? With no path, is anything? The guard before starting a gesture you do not want to interrupt.',
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: { lua: 'if not ce.anim.running("${1:cutoff}") then $0 end', javascript: 'if (!ce.anim.running("${1:cutoff}")) { $0 }' },
  },

  /* --- User feedback (design doc §6 phase 6, §18) ---
     Panel view only: there is nobody to tell with the window shut. `notify` and `status` are
     fire-and-forget; `dialog` asks a question, and the answer arrives through a CALLBACK rather
     than a return value, because an answer necessarily arrives later than the call. */
  {
    id: 'uiNotify', category: 'User feedback', signature: 'uiNotify(message [, opts])',
    summary: 'Show a brief message to whoever is using the panel. `opts` may carry { kind ("info" | "warn" | "error"), duration (ms, default 3000) }. For "the patch loaded", not for debugging — log() is for debugging.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['kind', 'duration'] },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.ui.notify("${1:Patch loaded}")$0', javascript: 'ce.ui.notify("${1:Patch loaded}");$0' },
  },
  {
    id: 'uiStatus', category: 'User feedback', signature: 'uiStatus([message])',
    summary: 'Put a line in the status bar and leave it there. No message clears it. Unlike notify this persists, so it suits a state ("Recording", "Synced") rather than an event.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'message', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.status("${1:Recording}")$0', javascript: 'ce.ui.status("${1:Recording}");$0' },
  },
  {
    id: 'uiDialog', category: 'User feedback', signature: 'uiDialog(opts [, onChoice]) -> boolean',
    summary: 'Ask a question. The ANSWER comes back through `onChoice`, not as a return value — an answer arrives later than the call. `opts` carries { title, message, buttons (labels, default one "OK"), kind ("info" | "warn" | "error"), default (the label focused first) }. `onChoice` gets the chosen label, or nothing if the dialog was dismissed. The RETURN says whether a dialog was actually put on screen: false means there was nobody to ask (window shut, or one is already open) and your callback has already been called with no answer. Only one dialog at a time — a second call is refused rather than queued, so a runaway script cannot stack modals in front of somebody.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true, fields: ['title', 'message', 'buttons', 'kind', 'default'] },
      { name: 'onChoice', type: 'function', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.dialog({ title = "${1:Overwrite?}", buttons = { "Overwrite", "Cancel" } }, function(choice)\n  if choice == "Overwrite" then\n    $0\n  end\nend)',
      javascript: 'ce.ui.dialog({ title: "${1:Overwrite?}", buttons: ["Overwrite", "Cancel"] }, function (choice) {\n  if (choice === "Overwrite") {\n    $0\n  }\n});',
    },
  },

  /* --- Drawing (design doc §6 phase 5) ---
     Oscilloscopes, envelope editors, XY pads, spectrum displays. Immediate-mode: each verb
     records a command carrying the style in force when it was issued, and the panel renders the
     list on top of the target control. Coordinates are the CONTROL's own, (0,0) at its top-left,
     so a drawing scales with whatever it is drawn on.

     There is no new component type and no canvas to place — any control can be drawn on, which is
     what lets a script put a scope trace over a Background or a value readout over a Knob.

     Panel view only: there is no surface with the window shut. Nothing here is persisted either —
     a drawing is a product of the script, never part of the document. */
  {
    id: 'drawClear', category: 'Drawing', signature: 'drawClear([target])',
    summary: 'Throw away what was drawn on this control. The usual first line of onDraw, because a draw ADDS to the list rather than replacing it.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.clear()$0', javascript: 'ce.draw.clear();$0' },
  },
  {
    id: 'drawFill', category: 'Drawing', signature: 'drawFill(colour)',
    summary: 'The fill colour for the shapes that follow — a hex string such as "#5B9BD5", or nil for no fill.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'colour', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.fill("${1:#5B9BD5}")$0', javascript: 'ce.draw.fill("${1:#5B9BD5}");$0' },
  },
  {
    id: 'drawStroke', category: 'Drawing', signature: 'drawStroke(colour [, width])',
    summary: 'The line colour and thickness for the shapes that follow. `width` defaults to 1; nil colour means no stroke.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'colour', type: 'string', required: false },
      { name: 'width', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.stroke("${1:#5B9BD5}", ${2:2})$0', javascript: 'ce.draw.stroke("${1:#5B9BD5}", ${2:2});$0' },
  },
  {
    id: 'drawRect', category: 'Drawing', signature: 'drawRect(x, y, w, h [, radius])',
    summary: 'A rectangle in the control\'s own coordinates, with an optional corner radius.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true },
      { name: 'w', type: 'number', required: true }, { name: 'h', type: 'number', required: true },
      { name: 'radius', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.rect(${1:0}, ${2:0}, ${3:40}, ${4:20})$0', javascript: 'ce.draw.rect(${1:0}, ${2:0}, ${3:40}, ${4:20});$0' },
  },
  {
    id: 'drawCircle', category: 'Drawing', signature: 'drawCircle(cx, cy, r)',
    summary: 'A circle centred on (cx, cy).',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true }, { name: 'cy', type: 'number', required: true },
      { name: 'r', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.circle(${1:20}, ${2:20}, ${3:8})$0', javascript: 'ce.draw.circle(${1:20}, ${2:20}, ${3:8});$0' },
  },
  {
    id: 'drawLine', category: 'Drawing', signature: 'drawLine(x1, y1, x2, y2)',
    summary: 'A straight line. Stroke only — a line has no inside.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x1', type: 'number', required: true }, { name: 'y1', type: 'number', required: true },
      { name: 'x2', type: 'number', required: true }, { name: 'y2', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.line(${1:0}, ${2:0}, ${3:100}, ${4:0})$0', javascript: 'ce.draw.line(${1:0}, ${2:0}, ${3:100}, ${4:0});$0' },
  },
  {
    id: 'drawPath', category: 'Drawing', signature: 'drawPath(points [, closed])',
    summary: 'A polyline through a flat list of coordinates — { x1, y1, x2, y2, ... }. This is the scope trace and the envelope shape. `closed` joins the last point back to the first.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'array', required: true },
      { name: 'closed', type: 'boolean', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local pts = {}\nfor i = 0, 63 do\n  pts[#pts + 1] = i * (info.width / 63)\n  pts[#pts + 1] = info.height / 2\nend\nce.draw.path(pts)$0',
      javascript: 'const pts = [];\nfor (let i = 0; i < 64; i++) pts.push(i * (info.width / 63), info.height / 2);\nce.draw.path(pts);$0',
    },
  },
  {
    id: 'drawArc', category: 'Drawing', signature: 'drawArc(x, y, radius, from, to)',
    summary: 'An arc centred on (x, y). Angles are DEGREES with 0 at twelve o\'clock, increasing clockwise — the way a knob\'s arc is described, and the same convention the Meter\'s arcStart/arcSweep use. Stroked with the current stroke; filled as a pie slice if a fill is set. The shape a knob ring, a radial meter or a pan indicator is, and the one thing path() could not express.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true },
      { name: 'radius', type: 'number', required: true },
      { name: 'from', type: 'number', required: true }, { name: 'to', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.draw.arc(${1:30}, ${2:30}, ${3:24}, 135, 135 + 270 * ${4:value})$0',
      javascript: 'ce.draw.arc(${1:30}, ${2:30}, ${3:24}, 135, 135 + 270 * ${4:value});$0',
    },
  },
  {
    id: 'drawText', category: 'Drawing', signature: 'drawText(x, y, text [, opts])',
    summary: 'Text at (x, y), which is its LEFT BASELINE. `opts` may carry { size, align, family }; align is "left" | "middle" | "right".',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['size', 'align', 'family'] },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}")$0', javascript: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}");$0' },
  },
  {
    id: 'drawRedraw', category: 'Drawing', signature: 'drawRedraw([target])',
    summary: 'Ask for onDraw to run again. Nothing repaints on its own — that is deliberate, because a per-frame callback nobody asked for is a performance trap. Animate by calling this from onTimer.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.redraw()$0', javascript: 'ce.draw.redraw();$0' },
  },

  /* --- Panel structure (design doc §6 phase 4) ---
     Panels that build themselves. The thing the options UI structurally cannot do: ask the device
     what it has, then generate a control per thing it found.

     PANEL VIEW ONLY, and not by choice — creating a control needs a renderer, and there is none
     with the window shut. The C++ engines define these as explaining stubs like every other
     webview-only verb, and `onPanelBuild` is declared webview-only too so they are never even
     reached there.

     Everything a script creates is MARKED as generated and cleared before onPanelBuild runs, so a
     build is idempotent by construction; generated controls are also stripped when the panel is
     saved, so the author's document never fills up with them. The cost of that, stated plainly: a
     generated control is not in the exported parameter list and cannot be DAW-automated. Drive it
     from a script. */
  {
    id: 'panelCreate', category: 'Panel structure', signature: 'panelCreate(type, props)',
    summary: 'Create a control and return its name (nil if the type is unknown — panelTypes() lists them). `props` may carry name, x, y, width, height, and any section override such as { Behavior = { min = 0, max = 127 } }.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'type', type: 'string', required: true },
      { name: 'props', type: 'object', required: false, fields: ['name', 'x', 'y', 'width', 'height', 'parent'] },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.create("${1:Knob}", { name = "${2:cutoff}", x = 20, y = 40 })$0',
      javascript: 'ce.panel.create("${1:Knob}", { name: "${2:cutoff}", x: 20, y: 40 });$0',
    },
  },
  {
    id: 'panelClone', category: 'Panel structure', signature: 'panelClone(name, props)',
    summary: 'Copy an existing control, including its sections, and return the copy\'s name. The usual way to make eight of something the author designed once.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'props', type: 'object', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.clone("${1:template}", { name = "${2:copy}", y = 120 })$0',
      javascript: 'ce.panel.clone("${1:template}", { name: "${2:copy}", y: 120 });$0',
    },
  },
  {
    id: 'panelDestroy', category: 'Panel structure', signature: 'panelDestroy(name)',
    summary: 'Remove a control and everything inside it. Returns true if it was there. Refuses to remove a control the AUTHOR placed unless you pass its exact name — generated ones go freely.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'ce.panel.destroy("${1:name}")$0', javascript: 'ce.panel.destroy("${1:name}");$0' },
  },
  {
    id: 'panelParent', category: 'Panel structure', signature: 'panelParent(name [, containerName])',
    summary: 'Move a control into a container, or to the top level when `containerName` is nil. Returns true on success. A container is any control with a Children section — Container, Group.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'containerName', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.panel.parent("${1:knob}", "${2:row}")$0', javascript: 'ce.panel.parent("${1:knob}", "${2:row}");$0' },
  },
  {
    id: 'panelFind', category: 'Panel structure', signature: 'panelFind([query])',
    summary: 'The names of matching controls, nested ones included. `query` is a substring of the name, or a table: { type = "Knob", generated = true, parent = "row1" }. No query means every control.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'query', type: 'object', required: false, fields: ['name', 'type', 'generated', 'parent'] }],
    scopes: 'any',
    snippet: {
      lua: 'for _, n in ipairs(ce.panel.find({ type = "${1:Knob}" })) do\n  $0\nend',
      javascript: 'for (const n of ce.panel.find({ type: "${1:Knob}" })) {\n  $0\n}',
    },
  },
  {
    id: 'panelInfo', category: 'Panel structure', signature: 'panelInfo(name)',
    summary: 'What a control is: { name, id, type, x, y, width, height, parent, generated }, or nil if there is no such control.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'local c = ce.panel.info("${1:name}")$0', javascript: 'const c = ce.panel.info("${1:name}");$0' },
  },
  {
    id: 'panelTypes', category: 'Panel structure', signature: 'panelTypes()',
    summary: 'Every component type panelCreate accepts, as a list of names. Ask rather than guess — the list grows.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
    snippet: { lua: 'log(table.concat(ce.panel.types(), ", "))$0', javascript: 'log(ce.panel.types().join(", "));$0' },
  },

  /* --- Panel structure: the collections INSIDE a control (design doc §31) ---
     The Properties panel can add to and remove from eleven sections of a control. `Children` is one
     of them and create/destroy already covers it; these four cover the other ten, which a script
     could previously only reach by writing a whole node as one value and could not remove from at
     all. One verb family rather than ten: the sections differ in what an entry MEANS, not in how it
     is listed, added or dropped. Panel view only, like the rest of ce.panel's structure verbs. */
  {
    id: 'panelEntries', category: 'Panel structure', signature: 'panelEntries(control, section)',
    summary: 'The names in one of a control\'s collection sections — States, Bindings, Animations, Parts, ValueChannels, Behaviors, HitZones, Generators, Links or Variants — in document order. Any other section name is refused, and the message lists the ones that work.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'section', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'for _, s in ipairs(ce.panel.entries("${1:knob}", "States")) do log(s) end$0',
      javascript: 'for (const s of ce.panel.entries("${1:knob}", "States")) log(s);$0',
    },
  },
  {
    id: 'panelEntry', category: 'Panel structure', signature: 'panelEntry(control, section, name)',
    summary: 'One entry out of a collection section, or nil. Matched case-insensitively, the way a path is.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'section', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local st = ce.panel.entry("${1:knob}", "States", "${2:Hover}")$0',
      javascript: 'const st = ce.panel.entry("${1:knob}", "States", "${2:Hover}");$0',
    },
  },
  {
    id: 'panelDefine', category: 'Panel structure', signature: 'panelDefine(control, section, name, spec)',
    summary: 'Create an entry in a collection section, or replace one that is there. The spec is MERGED over the section\'s own template, so declaring a state is one line rather than a hand-written node — hand-writing _type and both patch maps every time is how a verb like this ends up unused. Returns whether it landed.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'section', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'spec', type: 'object', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.define("${1:knob}", "States", "${2:Warn}", { when = { valueGreaterThan = 0.9 } })$0',
      javascript: 'ce.panel.define("${1:knob}", "States", "${2:Warn}", { when: { valueGreaterThan: 0.9 } });$0',
    },
  },
  {
    id: 'panelUndefine', category: 'Panel structure', signature: 'panelUndefine(control, section, name)',
    summary: 'Remove an entry from a collection section. Returns whether there was one, so "already gone" reads differently from "removed". Nothing script-facing could remove one of these before — set(path, nil) leaves the entry exactly where it was.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'section', type: 'string', required: true },
      { name: 'name', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.undefine("${1:knob}", "States", "${2:Disabled}")$0',
      javascript: 'ce.panel.undefine("${1:knob}", "States", "${2:Disabled}");$0',
    },
  },
  {
    id: 'panelPatch', category: 'Panel structure', signature: 'panelPatch(control, state, patch [, part])',
    summary: 'Merge entries into a state\'s patch map — what the control LOOKS LIKE in that state. This verb exists because the addressing model cannot express what it addresses: a patch map\'s keys are themselves dotted paths, so set("k.States.Hover.patches.component.Background.Fill.colour", …) walks off the end of the model looking for three sections that are one key, and set() can only replace the whole map. Merges rather than replaces, and returns how many keys were applied. With `part`, patches one part of a custom component instead of the component itself.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'state', type: 'string', required: true },
      { name: 'patch', type: 'object', required: true },
      { name: 'part', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.patch("${1:knob}", "${2:Hover}", { ["Background.Fill.colour"] = "FFFF0000" })$0',
      javascript: 'ce.panel.patch("${1:knob}", "${2:Hover}", { "Background.Fill.colour": "FFFF0000" });$0',
    },
  },

  /* --- Time: tempo, transport and musical timers (design doc §6 phase 3) ---
     Cross-runtime: the editor follows its own master clock (which follows the DAW when the panel's
     transport source is "host"), the exported plugin follows the DAW playhead directly. Both can
     answer the same questions, so these are `any` rather than player-only.

     Every one of them is a READ or pure arithmetic. Nothing here starts or stops the transport —
     a panel does not own the DAW's playhead, and pretending otherwise is how a panel fights its
     host. */
  {
    id: 'tempo', category: 'Time', signature: 'tempo()',
    summary: 'The current tempo in BPM, or nil when nothing is reporting one. Read it, do not assume 120.',
    scopes: 'any',
    snippet: { lua: 'local bpm = tempo() or 120$0', javascript: 'const bpm = tempo() ?? 120;$0' },
  },
  {
    id: 'isPlaying', category: 'Time', signature: 'isPlaying()',
    summary: 'Is the transport running? False when stopped, and when nothing is reporting a transport at all.',
    scopes: 'any',
    snippet: { lua: 'if isPlaying() then $0 end', javascript: 'if (isPlaying()) { $0 }' },
  },
  {
    id: 'transportInfo', category: 'Time', signature: 'transportInfo()',
    summary: 'The whole picture: { playing, bpm, beats, bar, beat, beatsPerBar, source, valid }. `beats` counts quarter notes from the transport origin; `bar` and `beat` are 1-based. `valid` is false when nothing is reporting a position, in which case the rest is a default rather than a measurement.',
    scopes: 'any',
    snippet: {
      lua: 'local t = ce.time.transport()\nif t.valid then log("bar " .. t.bar) end$0',
      javascript: 'const t = ce.time.transport();\nif (t.valid) log("bar " + t.bar);$0',
    },
  },
  {
    id: 'beatsToMs', category: 'Time', signature: 'beatsToMs(beats [, bpm])',
    summary: 'Musical time to milliseconds at the current tempo — the delay-time calculation a synth panel needs most. Pass `bpm` to override. Returns nil when there is no tempo to work from.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'bpm', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'set("delayTime", beatsToMs(0.75))$0', javascript: 'set("delayTime", beatsToMs(0.75));$0' },
  },
  {
    id: 'msToBeats', category: 'Time', signature: 'msToBeats(ms [, bpm])',
    summary: 'The inverse of beatsToMs — how many quarter notes a duration spans at the current tempo.',
    params: [
      { name: 'ms', type: 'number', required: true },
      { name: 'bpm', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'local beats = msToBeats(${1:500})$0', javascript: 'const beats = msToBeats(${1:500});$0' },
  },
  {
    id: 'syncTimer', category: 'Time', signature: 'syncTimer(id, beats)',
    summary: 'startTimer with a MUSICAL interval: syncTimer("step", 0.25) fires every sixteenth at the current tempo. The interval is computed WHEN YOU CALL IT and does not follow a later tempo change — re-arm it from onTransport if that matters.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'beats', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'syncTimer("${1:step}", 0.25)$0', javascript: 'syncTimer("${1:step}", 0.25);$0' },
  },

  /* --- Device: reads (design doc §6 phase 2) ---
     Ask the synth what it actually HAS, rather than hard-coding what the panel author remembered.
     All four are reads — nothing here changes a device — and all four need the device host,
     because the profile and its parameter table live there.

     One host primitive (`deviceQuery(kind, payload)`) backs all of them, the way sendMidi backs
     every channel message: the shape a script sees is four named verbs defined in each prelude,
     so the five runtimes cannot disagree about what a parameter descriptor looks like. */
  {
    id: 'deviceProfile', category: 'Device / MIDI', signature: 'deviceProfile([role])',
    summary: 'The device profile mapped to a role — { id, name, role, connected, ... } — or nil when no profile is mapped. `role` defaults to "mainSynth".',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'local p = deviceProfile()\nif p then log("device " .. p.name) end$0',
      javascript: 'const p = deviceProfile();\nif (p) log("device " + p.name);$0',
    },
  },
  {
    id: 'deviceParameters', category: 'Device / MIDI', signature: 'deviceParameters([opts])',
    summary: 'The profile\'s parameter descriptors: { id, name, group, type, min, max, access }. `opts` may carry { role, query, group, type, access, limit } to narrow the list. Returns an empty list, not nil, when there is nothing to report — while ce.device is enabled. A gated call returns nil like any other, because a module that is off has no answer to give.',
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, fields: ['role', 'query', 'group', 'type', 'access', 'limit'] }],
    scopes: 'any',
    snippet: {
      lua: 'for _, p in ipairs(deviceParameters({ group = "${1:Filter}" })) do\n  log(p.id .. " " .. p.name)\nend$0',
      javascript: 'for (const p of deviceParameters({ group: "${1:Filter}" })) log(p.id + " " + p.name);$0',
    },
  },
  {
    id: 'deviceParameter', category: 'Device / MIDI', signature: 'deviceParameter(id [, role])',
    summary: 'One parameter descriptor by id, or nil if the profile has no such parameter. Use it to ask whether a synth supports something before driving it.',
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local p = deviceParameter("${1:cutoff}")\nif p then log("max " .. tostring(p.max)) end$0',
      javascript: 'const p = deviceParameter("${1:cutoff}");\nif (p) log("max " + p.max);$0',
    },
  },
  // read / write — the half of phase 2 that was missing. parameters() told a script WHAT the synth
  // has and there was then no way to touch one unless a control happened to be bound to it: a panel
  // that discovered eight oscillators could enumerate them and not address them.
  {
    id: 'deviceRead', category: 'Device / MIDI', signature: 'deviceRead(id [, role]) -> value',
    summary: 'The LAST KNOWN value of a device parameter — what the synth most recently told us, from a dump or a parameter message. Not a live query: asking the synth is asynchronous, and this verb is not. Nothing comes back if the device has never reported it, which is different from zero.',
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local v = ce.device.read("${1:cutoff}")\nif v ~= nil then $0 end',
      javascript: 'const v = ce.device.read("${1:cutoff}");\nif (v !== undefined) { $0 }',
    },
  },
  {
    id: 'deviceWrite', category: 'Device / MIDI', signature: 'deviceWrite(id, value [, role]) -> boolean',
    summary: 'Set a device parameter on the synth, by parameter id, whether or not a control is bound to it. The device profile encodes it. Returns whether the message was dispatched — not whether the synth accepted it, which nothing can know synchronously. `value` is in the parameter\'s own units, the ones deviceParameter() reports min and max for.',
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'value', type: 'value', required: true },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.write("${1:cutoff}", ${2:64})$0',
      javascript: 'ce.device.write("${1:cutoff}", ${2:64});$0',
    },
  },
  {
    id: 'deviceConnected', category: 'Device / MIDI', signature: 'deviceConnected([role])',
    summary: 'Is the device for this role connected and ready? Cheap to call, and the right guard before a dump request.',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'if deviceConnected() then requestDump("patch") end$0',
      javascript: 'if (deviceConnected()) requestDump("patch");$0',
    },
  },

  /* --- Device: declaring what the app was not shipped knowing (design doc §29) ---
     Everything above READS a profile the app ships with. That is a hard ceiling: a panel can only
     address a synth somebody already wrote a profile for, which excludes most of what is in
     people's racks. These write the structure instead.

     A declaration is SELF-ENCODING — the spec carries its own wire format — so nothing in the path
     needs a profile to exist. defineParameter plus onPanelBuild plus bind is a panel that wires
     itself to a synth nobody wrote a profile for.

     Declarations are script-lifetime and are dropped before every onPanelBuild, which is what
     makes a build idempotent and what stops one half-saving into the author's document. */
  {
    id: 'deviceDefineParameter', category: 'Device / MIDI',
    signature: 'defineParameter(id, spec [, role]) -> boolean',
    summary: 'Teach the app a parameter at runtime, for a synth it has no profile for. `spec` says how it reaches the synth — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — plus name/group/type/min/max for what parameters() reports. The declaration is refused (and says why) when there is no wire format: a descriptor that enumerates and sends nothing is worse than an error, because the panel looks built. A declared id overrides a profile one, so a script can correct one wrong parameter without redeclaring the rest. Sysex template tokens: a hex literal, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'spec', type: 'object', required: true, fields: ['name', 'group', 'type', 'min', 'max', 'access', 'cc', 'channel', 'nrpn', 'sysex', 'encoding', 'checksum', 'choices', 'variables'] },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.defineParameter("${1:cutoff}", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = ${2:74} })$0',
      javascript: 'ce.device.defineParameter("${1:cutoff}", { name: "Cutoff", group: "Filter", min: 0, max: 127, cc: ${2:74} });$0',
    },
  },
  {
    id: 'deviceDefineDump', category: 'Device / MIDI',
    signature: 'defineDump(kind, spec [, role]) -> boolean',
    summary: 'Describe a SysEx dump layout at runtime: `request` (the bytes that ask for it), `match` ({ prefix, suffix }), `offset`/`size` for the payload, an optional `checksum`, and `fields` — one { parameter, offset } per value the dump carries. Every field must name a parameter defineParameter already declared; an unknown one is refused rather than decoded to nothing months later. A declared layout is matched against arriving SysEx, fills the bound controls and raises onDumpReceived, exactly as a profile-defined dump does.',
    params: [
      { name: 'kind', type: 'string', required: true },
      { name: 'spec', type: 'object', required: true, fields: ['name', 'request', 'match', 'offset', 'size', 'checksum', 'fields'] },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.defineDump("${1:patch}", {\n  request = "f0 7d 00 f7",\n  match = { prefix = { "f0", "7d", "01" }, suffix = { "f7" } },\n  offset = 3,\n  fields = { { parameter = "${2:cutoff}", offset = 0 } },\n})$0',
      javascript: 'ce.device.defineDump("${1:patch}", {\n  request: "f0 7d 00 f7",\n  match: { prefix: ["f0", "7d", "01"], suffix: ["f7"] },\n  offset: 3,\n  fields: [{ parameter: "${2:cutoff}", offset: 0 }],\n});$0',
    },
  },
  {
    id: 'deviceBind', category: 'Device / MIDI',
    signature: 'bind(control, parameterId [, opts]) -> boolean',
    // Panel view only for the same reason ce.panel.create is: the binding lives on the control
    // model, and there is no control model with the window shut.
    runtime: RUNTIME_WEBVIEW,
    summary: 'Wire a control to a device parameter at runtime. ce.panel.create could already make a control and nothing could connect it to anything, so a self-building panel built dead controls; this is the other half of that pair. Replaces whatever was bound to the same port rather than adding a second binding, and switches DeviceBindings back on if the control had it off. `opts` takes { role, port }; port defaults to "value".',
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'parameterId', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['role', 'port'] },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.bind("${1:cutoffKnob}", "${2:cutoff}")$0',
      javascript: 'ce.device.bind("${1:cutoffKnob}", "${2:cutoff}");$0',
    },
  },
  {
    id: 'deviceUnbind', category: 'Device / MIDI',
    signature: 'unbind(control [, port]) -> boolean',
    runtime: RUNTIME_WEBVIEW,
    summary: 'Remove a control\'s device binding. Returns whether there was one to remove, so "already clean" reads differently from "cleaned up".',
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'port', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.unbind("${1:cutoffKnob}")$0',
      javascript: 'ce.device.unbind("${1:cutoffKnob}");$0',
    },
  },
  {
    id: 'devicePorts', category: 'Device / MIDI', signature: 'ports([opts]) -> list',
    summary: 'What is actually plugged in: [{ id, name, direction, type, hardware, role }]. connected(role) only answers yes/no for a role somebody configured in advance; this enumerates the real ports, so a panel can offer the user a choice or notice a device that showed up. `hardware` is false for the two placeholder rows the app always lists ("No MIDI Input", "Preview Only"), and `role` is the role currently using the port, or empty. `opts.direction` narrows to "in" or "out".',
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, fields: ['direction'] }],
    scopes: 'any',
    snippet: {
      lua: 'for _, p in ipairs(ce.device.ports({ direction = "out" })) do\n  if p.hardware then log(p.name) end\nend$0',
      javascript: 'for (const p of ce.device.ports({ direction: "out" })) if (p.hardware) log(p.name);$0',
    },
  },

  /* --- Device / MIDI: raw (Q9) --- */
  {
    id: 'sendCC', category: 'Device / MIDI', signature: 'sendCC(channel, cc, value)',
    summary: 'Send a raw MIDI CC.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'cc', type: 'number', required: true },
      { name: 'value', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'sendCC(${1:channel}, ${2:cc}, ${3:value})$0', javascript: 'sendCC(${1:channel}, ${2:cc}, ${3:value})$0' },
  },
  {
    id: 'sendNRPN', category: 'Device / MIDI', signature: 'sendNRPN(channel, msb, lsb, value)',
    summary: 'Send a raw NRPN.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'msb', type: 'number', required: true },
      { name: 'lsb', type: 'number', required: true },
      { name: 'value', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0', javascript: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0' },
  },
  {
    id: 'sendRPN', category: 'Device / MIDI', signature: 'sendRPN(channel, msb, lsb, value)',
    summary: 'Send a REGISTERED parameter number — the standard path for pitch-bend range (0,0), fine tuning (0,1) and coarse tuning (0,2), which is the kind of thing a panel sets once at load. Same shape as sendNRPN; the difference is CC 101/100 instead of 99/98.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'msb', type: 'number', required: true },
      { name: 'lsb', type: 'number', required: true },
      { name: 'value', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'sendRPN(${1:1}, 0, 0, ${2:2})  -- pitch-bend range$0', javascript: 'sendRPN(${1:1}, 0, 0, ${2:2});  // pitch-bend range$0' },
  },
  {
    id: 'sendSongPosition', category: 'Device / MIDI', signature: 'sendSongPosition(beats)',
    summary: 'Song Position Pointer — where in the song the next start should resume from, in MIDI beats (one beat = six clocks = a sixteenth note). The piece of sendTransport that was missing for anything driving an external sequencer.',
    params: [{ name: 'beats', type: 'number', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendSongPosition(${1:0})$0', javascript: 'sendSongPosition(${1:0});$0' },
  },
  // --- notes and channel messages -----------------------------------------------------------
  // Until these landed a script could turn a knob but not make a sound: sendCC/sendNRPN/sendSysex
  // were the entire MIDI vocabulary, which in a hardware editor ruled out auditioning a patch,
  // testing a split, or triggering a chord — the things the ChordPad and DrumPads exist for.
  //
  // All of them are arithmetic over one host primitive, `sendMidi`, exactly as `panic` is over
  // sendCC. That is what makes them portable to every runtime and every exported language.
  {
    id: 'sendMidi', category: 'Device / MIDI', signature: 'sendMidi(bytes)',
    summary: 'Send raw MIDI bytes exactly as given — no wrapping, no channel maths. The primitive the other message verbs are built on; reach for one of those first.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendMidi({0x90, 60, 100})$0', javascript: 'sendMidi([0x90, 60, 100])$0' },
  },
  {
    id: 'sendNote', category: 'Device / MIDI', signature: 'sendNote(channel, note, velocity [, ms])',
    summary: 'Note on. `note` is a MIDI number or a name ("C3"). Velocity 0 is a note off, as the MIDI spec has it. '
      + 'Give `ms` and the note off is scheduled for you — every script that plays a note was otherwise '
      + 'hand-rolling a timer for it, and a panel cannot play a note at all.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'note', type: 'value', required: true },
      { name: 'velocity', type: 'number', required: true },
      { name: 'ms', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNote(${1:1}, ${2:60}, ${3:100})$0', javascript: 'sendNote(${1:1}, ${2:60}, ${3:100})$0' },
  },
  {
    id: 'interceptMidiIn', category: 'Device / MIDI', signature: 'interceptMidiIn(fn)',
    summary: 'Sit in the INBOUND path. fn(bytes) returns replacement bytes to rewrite the message, '
      + 'false to swallow it, or nothing to pass it through — before the panel\'s bindings, the note '
      + 'input and the transport see it. onCcIn only lets you react after a binding has already moved '
      + 'the control; this is how a velocity curve, a channel remap or a MIDI-learn layer is built.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiIn(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiIn((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'interceptMidiOut', category: 'Device / MIDI', signature: 'interceptMidiOut(fn)',
    summary: 'Sit in the OUTBOUND path — every message the panel sends, from a script or from a '
      + 'control\'s own binding. Rewrite, thin or block it. CC flooding on a fast drag has no answer '
      + 'from a panel, whose bindings are fixed and which has nothing between them and the port.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiOut(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiOut((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'feedMidi', category: 'Device / MIDI', signature: 'feedMidi(bytes)',
    summary: 'Inject a message as if it had arrived from the hardware, so the panel\'s own bindings, '
      + 'note input and transport all act on it. set() moves a control directly and bypasses every '
      + 'binding; this is how a script-built arpeggiator or sequencer drives the panel instead of '
      + 'around it. Inbound filters run on it, so a fed message obeys the same rules as a real one.',
    params: [{ name: 'bytes', type: 'value', required: true }],
    scopes: 'any',
    snippet: { lua: 'feedMidi(${1:{0x90, 60, 100\}})$0', javascript: 'feedMidi([${1:0x90, 60, 100}])$0' },
  },
  {
    id: 'routeMidi', category: 'Device / MIDI', signature: 'routeMidi(role, fn)',
    summary: 'Send everything in the block to a named device role instead of the default. Blocks '
      + 'rather than a per-call argument, the same shape noTransmit() uses — a panel binds ONE device '
      + 'at design time, so notes to one synth and CCs to another is otherwise impossible.',
    params: [
      { name: 'role', type: 'string', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'routeMidi("${1:aux}", function()\n  $0\nend)',
      javascript: 'routeMidi("${1:aux}", () => {\n  $0\n})',
    },
  },
  {
    id: 'sendNoteOff', category: 'Device / MIDI', signature: 'sendNoteOff(channel, note [, velocity])',
    summary: 'Note off. Release velocity defaults to 0. Nothing schedules this for you — a note you start is a note you stop.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'note', type: 'value', required: true },
      { name: 'velocity', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNoteOff(${1:1}, ${2:60})$0', javascript: 'sendNoteOff(${1:1}, ${2:60})$0' },
  },
  {
    id: 'sendProgramChange', category: 'Device / MIDI', signature: 'sendProgramChange(channel, program [, bankMsb, bankLsb])',
    summary: 'Program change, with an optional bank select (CC 0 / CC 32) sent first, which is the order devices expect.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'program', type: 'number', required: true },
      { name: 'bankMsb', type: 'number', required: false },
      { name: 'bankLsb', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'sendProgramChange(${1:1}, ${2:0})$0', javascript: 'sendProgramChange(${1:1}, ${2:0})$0' },
  },
  {
    id: 'sendPitchBend', category: 'Device / MIDI', signature: 'sendPitchBend(channel, value)',
    summary: 'Pitch bend, 0–16383 with 8192 at centre — the raw 14-bit value, because how many semitones that is depends on the synth\'s bend range, not on us.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'value', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'sendPitchBend(${1:1}, ${2:8192})$0', javascript: 'sendPitchBend(${1:1}, ${2:8192})$0' },
  },
  {
    id: 'sendAftertouch', category: 'Device / MIDI', signature: 'sendAftertouch(channel, pressure [, note])',
    summary: 'Channel pressure, or polyphonic pressure for one note when `note` is given.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'pressure', type: 'number', required: true },
      { name: 'note', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'sendAftertouch(${1:1}, ${2:64})$0', javascript: 'sendAftertouch(${1:1}, ${2:64})$0' },
  },
  {
    id: 'sendClock', category: 'Device / MIDI', signature: 'sendClock()',
    summary: 'One MIDI clock tick (0xF8). Twenty-four per quarter note — drive it from a timer.',
    params: [],
    scopes: 'any',
    snippet: { lua: 'sendClock()$0', javascript: 'sendClock()$0' },
  },
  {
    id: 'sendTransport', category: 'Device / MIDI', signature: 'sendTransport(action)',
    summary: 'MIDI transport: "start" (0xFA), "continue" (0xFB) or "stop" (0xFC).',
    params: [{ name: 'action', type: 'string', required: true, values: ['start', 'continue', 'stop'] }],
    scopes: 'any',
    snippet: { lua: 'sendTransport("${1:start}")$0', javascript: 'sendTransport("${1:start}")$0' },
  },
  {
    id: 'sendSysex', category: 'Device / MIDI', signature: 'sendSysex(bytes)',
    summary: 'Send a raw SysEx message (device-scope, power use).',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendSysex(${1:bytes})$0', javascript: 'sendSysex(${1:bytes})$0' },
  },
  {
    id: 'checksum', category: 'Device / MIDI', signature: 'checksum(type, bytes)',
    summary: 'Compute a device checksum over the data bytes. "roland"/"yamaha" = two\'s-complement 7-bit (the same algorithm, both spellings accepted); "sum" = 7-bit sum; "xor" = XOR of the bytes.',
    params: [
      { name: 'type', type: 'string', required: true, values: ['roland', 'yamaha', 'sum', 'xor'] },
      { name: 'bytes', type: 'bytes', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'checksum("${1:roland}", ${2:bytes})$0', javascript: 'checksum("${1:roland}", ${2:bytes})$0' },
  },
  {
    id: 'panic', category: 'Device / MIDI', signature: 'panic([opts])',
    summary: 'Silence the rig: All Sound Off (120), then All Notes Off (123), then Reset All Controllers (121). Defaults to all 16 channels; pass { channel } for one, { resetControllers: false } to skip 121.',
    params: [{ name: 'opts', type: 'object', required: false, fields: ['channel', 'resetControllers'] }],
    scopes: 'any',
    snippet: { lua: 'panic()$0', javascript: 'panic()$0' },
  },

  /* --- Storage --- */
  // Two different lifetimes, deliberately named apart. `state` is a scratchpad that lives as long
  // as the script is loaded; settings outlive the session. Language globals happened to give you
  // the first one already, but nothing said so, which made it undefined behaviour people relied on.
  {
    id: 'state', category: 'Storage', signature: 'state',
    summary: 'A table of your own that survives between handler calls, private to this script. Cleared when the script reloads — for anything that must outlive the session use saveSetting.',
    params: [],
    scopes: 'any',
    snippet: { lua: 'state.${1:count} = (state.${1:count} or 0) + 1$0', javascript: 'state.${1:count} = (state.${1:count} ?? 0) + 1;$0' },
  },
  {
    id: 'saveSetting', category: 'Storage', signature: 'saveSetting(key, value)',
    summary: 'Persist a value beyond the session. In the editor it is stored with the panel and travels with it; in the exported plugin it goes into the DAW project state.',
    params: [
      { name: 'key', type: 'string', required: true },
      { name: 'value', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'saveSetting("${1:key}", ${2:value})$0', javascript: 'saveSetting("${1:key}", ${2:value})$0' },
  },
  {
    id: 'loadSetting', category: 'Storage', signature: 'loadSetting(key [, fallback])',
    summary: 'Read back a value saved with saveSetting. Returns `fallback` when the key has never been written.',
    params: [
      { name: 'key', type: 'string', required: true },
      { name: 'fallback', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'local ${1:v} = loadSetting("${2:key}", ${3:default})$0', javascript: 'const ${1:v} = loadSetting("${2:key}", ${3:default});$0' },
  },
  // The other two thirds of an interface. saveSetting/loadSetting could write and read a key and
  // nothing could list or delete one, so a panel storing per-preset settings could never clean up
  // after itself and could not show somebody what it had kept.
  {
    id: 'listSettings', category: 'Storage', signature: 'listSettings() -> list',
    summary: 'Every key this panel has saved, in no particular order. An empty list means nothing has been written — not that settings are unavailable.',
    params: [], scopes: 'any',
    snippet: { lua: 'for _, k in ipairs(ce.storage.settings()) do $0 end', javascript: 'for (const k of ce.storage.settings()) { $0 }' },
  },
  {
    id: 'forgetSetting', category: 'Storage', signature: 'forgetSetting(key) -> boolean',
    summary: 'Delete a saved setting. Returns whether there was one to delete, so a script can tell "cleaned up" from "there was nothing there".',
    params: [{ name: 'key', type: 'string', required: true }], scopes: 'any',
    snippet: { lua: 'ce.storage.forget("${1:key}")$0', javascript: 'ce.storage.forget("${1:key}");$0' },
  },

  /* --- Debug --- */
  {
    id: 'log', category: 'Debug', signature: 'log(message [, value])',
    summary: 'Print to the script console without changing state.',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'value', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'log("${1:message}", ${2:value})$0', javascript: 'log("${1:message}", ${2:value})$0' },
  },
  // The console already renders these levels differently — the runtime uses the distinction
  // constantly — and a script could not. Everything a panel author wrote landed at the same level,
  // so a real failure read exactly like a debug print.
  {
    id: 'logWarn', category: 'Debug', signature: 'logWarn(message [, value])',
    summary: 'Print at WARNING level: something is off but the panel carries on. Reads differently from log() in the console, which is the whole point.',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'value', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.warn("${1:message}")$0', javascript: 'ce.core.warn("${1:message}")$0' },
  },
  {
    id: 'logError', category: 'Debug', signature: 'logError(message [, value])',
    summary: 'Print at ERROR level: something the panel could not do. Reporting it does NOT stop the handler — this prints, it does not throw. To stop, use your language\'s own error()/throw, which is exactly why the flat name is logError and not error.',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'value', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.error("${1:message}")$0', javascript: 'ce.core.error("${1:message}")$0' },
  },
];

/* --------------------------------------------------------- panel-component verbs */
// Verbs that drive a placed component's own model: the Zone Splitter's zones, the Phrase
// Sequencer's grid, the Recorder's take, the Harmoniser's key, the Setlist's index. Each
// reads the component's section, hands it to the SAME pure reducer the component's own
// buttons use (utils/*Layout.js), and writes back only the changed fields — so a scripted
// change and a button press are the same event downstream.
//
// Every one of these is runtime: 'webview'. The components are rendered and modelled in the
// panel view; there is no C++ counterpart to drive with the window closed. The C++ engines
// define the names and log a clear notice, so a script that strays across the boundary tells
// you why instead of erroring on an undefined global.
//
// `target` is the component's control name. All are panel/component scope: a device script
// runs before the GUI exists, so there is no component to talk to yet.

// Argument types, from the verb kind. `targetRef` stays the first argument of every verb.
const PARAM_TYPE_FOR = {
  num: 'number', int: 'number', bool: 'boolean', str: 'string', enum: 'string',
  xy: 'number', cell: 'number', line: 'value',
};

const panelVerb = (id, signature, summary, params) => ({
  id, signature, summary, params, category: 'Panel components',
  runtime: RUNTIME_WEBVIEW, scopes: ['component', 'panel'],
});

const T = { name: 'target', type: 'targetRef', required: true };

export const PANEL_COMMANDS = [
  // --- Zone Splitter ---
  panelVerb('splitPreset', 'splitPreset(target, preset [, lowNote, highNote])',
    'Apply a split layout ("single"/"split"/"layer"/"three"…), optionally bounding the key range.',
    [T, { name: 'preset', type: 'string', required: true },
     { name: 'lowNote', type: 'number', required: false }, { name: 'highNote', type: 'number', required: false }]),
  panelVerb('splitMute', 'splitMute(target, zone, enabled)', 'Mute or unmute one zone.',
    [T, { name: 'zone', type: 'number', required: true }, { name: 'enabled', type: 'boolean', required: true }]),
  panelVerb('splitChannel', 'splitChannel(target, zone, channel)', 'Set a zone\'s MIDI output channel.',
    [T, { name: 'zone', type: 'number', required: true }, { name: 'channel', type: 'number', required: true }]),
  panelVerb('splitTranspose', 'splitTranspose(target, zone, semitones)', 'Transpose one zone.',
    [T, { name: 'zone', type: 'number', required: true }, { name: 'semitones', type: 'number', required: true }]),
  panelVerb('splitPoint', 'splitPoint(target, zone, note)', 'Move the split point between two zones.',
    [T, { name: 'zone', type: 'number', required: true }, { name: 'note', type: 'number', required: true }]),

  // --- Phrase Sequencer ---
  panelVerb('phraseSeed', 'phraseSeed(target, seed)', 'Fill the grid from a named seed pattern.',
    [T, { name: 'seed', type: 'string', required: true }]),
  panelVerb('phraseClear', 'phraseClear(target)', 'Clear every step.', [T]),
  panelVerb('phraseKey', 'phraseKey(target, key)', 'Change the key the degrees resolve against.',
    [T, { name: 'key', type: 'string', required: true }]),
  panelVerb('phraseScale', 'phraseScale(target, scale)', 'Change the scale ("major"/"minor"/"dorian"…).',
    [T, { name: 'scale', type: 'string', required: true }]),
  panelVerb('phraseTranspose', 'phraseTranspose(target, semitones)', 'Transpose the phrase, leaving the pattern alone.',
    [T, { name: 'semitones', type: 'number', required: true }]),
  panelVerb('phraseDirection', 'phraseDirection(target, direction)', 'Play direction ("forward"/"reverse"/"pingpong"/"random").',
    [T, { name: 'direction', type: 'string', required: true }]),
  panelVerb('phraseRun', 'phraseRun(target, running)', 'Start or stop the sequencer.',
    [T, { name: 'running', type: 'boolean', required: true }]),
  panelVerb('phraseCell', 'phraseCell(target, step, row, on)', 'Switch one grid cell on or off.',
    [T, { name: 'step', type: 'number', required: true }, { name: 'row', type: 'number', required: true },
     { name: 'on', type: 'boolean', required: true }]),

  // --- Phrase Recorder ---
  panelVerb('recorderRecord', 'recorderRecord(target [, on])', 'Arm / disarm recording (no argument toggles).',
    [T, { name: 'on', type: 'boolean', required: false }]),
  panelVerb('recorderStop', 'recorderStop(target)', 'Stop recording and playback.', [T]),
  panelVerb('recorderPlay', 'recorderPlay(target [, playing])', 'Start / stop playback (no argument toggles).',
    [T, { name: 'playing', type: 'boolean', required: false }]),
  panelVerb('recorderClear', 'recorderClear(target)', 'Erase the take.', [T]),
  panelVerb('recorderUndo', 'recorderUndo(target)', 'Undo the last recorded pass.', [T]),
  panelVerb('recorderQuantize', 'recorderQuantize(target, grid [, strength, scale, key])',
    'Quantise the take to a grid; strength 0–1, optional pitch repair to a scale/key.',
    [T, { name: 'grid', type: 'string', required: true }, { name: 'strength', type: 'number', required: false },
     { name: 'scale', type: 'string', required: false }, { name: 'key', type: 'string', required: false }]),
  panelVerb('recorderTranspose', 'recorderTranspose(target, semitones)', 'Transpose the take.',
    [T, { name: 'semitones', type: 'number', required: true }]),
  panelVerb('recorderBars', 'recorderBars(target, bars)', 'Set the loop length in bars.',
    [T, { name: 'bars', type: 'number', required: true }]),
  panelVerb('recorderSource', 'recorderSource(target, source)', 'Choose what gets recorded ("keys"/"harmony"/"both").',
    [T, { name: 'source', type: 'string', required: true }]),
  panelVerb('recorderNudge', 'recorderNudge(target, by)', 'Shift the take in time by `by` ticks.',
    [T, { name: 'by', type: 'number', required: true }]),
  panelVerb('recorderShift', 'recorderShift(target, semitones)', 'Shift the take in pitch without re-quantising.',
    [T, { name: 'semitones', type: 'number', required: true }]),
  panelVerb('recorderStore', 'recorderStore(target, slot [, name])', 'Save the take into a slot.',
    [T, { name: 'slot', type: 'number', required: true }, { name: 'name', type: 'string', required: false }]),
  panelVerb('recorderLoad', 'recorderLoad(target, slot)', 'Load a take from a slot.',
    [T, { name: 'slot', type: 'number', required: true }]),
  panelVerb('recorderCountIn', 'recorderCountIn(target, bars)', 'Set the count-in length in bars (0 = none).',
    [T, { name: 'bars', type: 'number', required: true }]),

  // --- Harmoniser ---
  panelVerb('harmonyMode', 'harmonyMode(target, mode)', 'Harmoniser mode ("off"/"diatonic"/"fixed"/"chord").',
    [T, { name: 'mode', type: 'string', required: true }]),
  panelVerb('harmonyKey', 'harmonyKey(target, key)', 'Re-key the harmoniser mid-song.',
    [T, { name: 'key', type: 'string', required: true }]),
  panelVerb('harmonyScale', 'harmonyScale(target, scale)', 'Change the scale the harmony follows.',
    [T, { name: 'scale', type: 'string', required: true }]),
  panelVerb('harmonySize', 'harmonySize(target, size)', 'How many voices to add.',
    [T, { name: 'size', type: 'number', required: true }]),
  panelVerb('harmonyShape', 'harmonyShape(target, shape)', 'Apply a named chord shape / preset.',
    [T, { name: 'shape', type: 'string', required: true }]),
  panelVerb('harmonyVoicing', 'harmonyVoicing(target, voicing)', 'Voicing spread ("close"/"open"/"drop2"…).',
    [T, { name: 'voicing', type: 'string', required: true }]),
  panelVerb('harmonyInversion', 'harmonyInversion(target, inversion)', 'Chord inversion.',
    [T, { name: 'inversion', type: 'number', required: true }]),
  panelVerb('harmonyOctave', 'harmonyOctave(target, octave)', 'Octave offset for the added voices.',
    [T, { name: 'octave', type: 'number', required: true }]),
  panelVerb('harmonyOutOfKey', 'harmonyOutOfKey(target, mode)', 'What to do with out-of-key notes ("skip"/"nearest"/"pass").',
    [T, { name: 'mode', type: 'string', required: true }]),
  panelVerb('harmonyKeepPlayed', 'harmonyKeepPlayed(target [, keep])', 'Keep or drop the note actually played.',
    [T, { name: 'keep', type: 'boolean', required: false }]),
  panelVerb('harmonyChannel', 'harmonyChannel(target, channel)', 'MIDI channel for the harmony voices.',
    [T, { name: 'channel', type: 'number', required: true }]),
  panelVerb('harmonyVoiceLeading', 'harmonyVoiceLeading(target, mode)', 'Voice-leading strategy ("off"/"nearest"/"smooth").',
    [T, { name: 'mode', type: 'string', required: true }]),
  panelVerb('harmonyStrum', 'harmonyStrum(target, ms)', 'Spread the voices over `ms` milliseconds.',
    [T, { name: 'ms', type: 'number', required: true }]),
  panelVerb('harmonyDegree', 'harmonyDegree(target, degree, chord)', 'Override the chord used for one scale degree.',
    [T, { name: 'degree', type: 'number', required: true }, { name: 'chord', type: 'string', required: true }]),

  // --- Setlist ---
  // These move the INDEX; the recall follows from the index changing, so a scripted step and a
  // footswitch step are indistinguishable downstream.
  panelVerb('setlistNext', 'setlistNext(target)', 'Advance to the next enabled scene.', [T]),
  panelVerb('setlistPrev', 'setlistPrev(target)', 'Go back to the previous enabled scene.', [T]),
  panelVerb('setlistGoto', 'setlistGoto(target, scene)', 'Jump to a scene by index or name.',
    [T, { name: 'scene', type: 'value', required: true }]),
  panelVerb('setlistEnable', 'setlistEnable(target, scene, enabled)', 'Include or skip a scene in the walk order.',
    [T, { name: 'scene', type: 'value', required: true }, { name: 'enabled', type: 'boolean', required: true }]),
  panelVerb('setlistWrap', 'setlistWrap(target [, wrap])', 'Wrap from the last scene back to the first.',
    [T, { name: 'wrap', type: 'boolean', required: false }]),
  panelVerb('setlistCrossfade', 'setlistCrossfade(target, ms)', 'Crossfade scene values over `ms` milliseconds.',
    [T, { name: 'ms', type: 'number', required: true }]),

  // --- Panel values: snapshot / restore ---
  // The two members of ce.panel that are NOT panel-view only. Creating a control needs a renderer;
  // reading and writing a value does not, and "put the panel back how it was before the solo" is a
  // footswitch action in a DAW with the window shut — which is exactly where it has to work.
  {
    id: 'panelSnapshot', category: 'Panel components', signature: 'panelSnapshot() -> object',
    summary: 'Every control\'s current value, as an object keyed by control name. Pair it with saveSetting to keep one, or hold it in `state` for an A/B compare. Controls with no value of their own are left out rather than recorded as nothing.',
    params: [], scopes: 'any',
    snippet: { lua: 'local before = ce.panel.snapshot()$0', javascript: 'const before = ce.panel.snapshot();$0' },
  },
  {
    id: 'panelEach', category: 'Panel components', signature: 'panelEach(fn) -> number',
    summary: 'Call `fn(name)` once for every control in the panel, containers included, in document order. Returns how many there were. Cross-runtime, like snapshot and for the same reason: walking the panel does not need a renderer. To ask what a control IS rather than what it is called, use ce.panel.info() — which does.',
    params: [{ name: 'fn', type: 'function', required: true }], scopes: 'any',
    snippet: {
      lua: 'ce.panel.each(function(name)\n  $0\nend)',
      javascript: 'ce.panel.each(function (name) {\n  $0\n});',
    },
  },
  {
    id: 'panelRestore', category: 'Panel components', signature: 'panelRestore(snapshot) -> number',
    summary: 'Put the values back, and return how many landed. A name the panel no longer has is skipped rather than failing the whole restore — a snapshot taken before an edit is still worth most of what it holds.',
    params: [{ name: 'snapshot', type: 'object', required: true }], scopes: 'any',
    snippet: { lua: 'ce.panel.restore(before)$0', javascript: 'ce.panel.restore(before);$0' },
  },

  // --- The other twenty-three families (phase 7) ---
  // Everything above was hand-written, because each of those actions is genuinely structural.
  // These are expanded from componentVerbs.js instead: the spec there is the single description of
  // a verb's field, kind, range and prose, and the descriptor, the implementation, the C++ stub
  // name and the documentation are all derived from it. A verb that exists in one place and not
  // another stops being possible.
  ...COMPONENT_VERBS.map((verb) => panelVerb(verb.id, verbSignature(verb), verbSummary(verb),
    [T, ...verbArgs(verb).map((name) => ({
      name,
      type: PARAM_TYPE_FOR[verb.k === 'item' ? verb.kind : verb.k] ?? 'value',
      // A boolean verb toggles when called bare, so its argument is genuinely optional. Every
      // other argument is required — calling `arpRate(target)` is a mistake, not a query.
      required: !(verb.k === 'bool' && verb.toggle),
    }))])),
];

/* ------------------------------------------------------------------- helpers */
// Host-provided, identical in every language (Q10). We do NOT duplicate the language's
// own math (min/max/abs/sin). Extensible — grow as DPD profiles surface new needs.

export const HELPERS = [
  // value / range
  { id: 'scale', category: 'Value / range', signature: 'scale(v, inLo, inHi, outLo, outHi)', summary: 'Map a value from one range to another.' },
  { id: 'clamp', category: 'Value / range', signature: 'clamp(v, lo, hi)', summary: 'Keep a value inside a range.' },
  { id: 'round', category: 'Value / range', signature: 'round(v)', summary: 'Nearest whole number.' },
  { id: 'snap', category: 'Value / range', signature: 'snap(v, step)', summary: 'Snap to the nearest step.' },
  { id: 'curve', category: 'Value / range', signature: 'curve(v, shape)',
    summary: 'Apply a named response curve: "linear", "exp", "log" or "s". A name it does not know is reported and treated as linear — it used to be treated as linear in silence, which reads as a curve that does nothing. For a shape this list does not have, use map().' },
  { id: 'lerp', category: 'Value / range', signature: 'lerp(a, b, t)', summary: 'Blend between a and b by t (0–1).' },
  // wrap, and why it is not `%`. The five runtimes DISAGREE about the sign of a modulo: (-1) % 12
  // is 11 in Lua and Python and -1 in JavaScript, C++, C# and Java. So the ordinary way to write a
  // pitch class — (note + transpose) % 12 — already gives two different answers depending on which
  // engine the panel is running in, and nothing said so. This is the one arithmetic a synth panel
  // does constantly, which is why it belongs to the module rather than to each panel.
  { id: 'wrap', category: 'Value / range', signature: 'wrap(v, lo, hi)',
    summary: 'Bring a value round into a range, half-open: wrap(12, 0, 12) is 0, and wrap(-1, 0, 12) is 11. Use it for pitch classes, LFO phase and step indices instead of the language\'s %, whose sign differs between the runtimes — the same expression gives 11 in Lua and -1 in JavaScript.' },
  // map, and why `curve` was not enough. curve() is a CLOSED set of four names, so a taper it does
  // not have could not be expressed at all — and a properties panel cannot hold an arbitrary curve
  // either, since a property stores a constant. Breakpoints are the smallest thing that can.
  { id: 'mapCurve', category: 'Value / range', signature: 'mapCurve(v, points)',
    summary: 'A response curve of your own: straight lines through breakpoints, given as {{x, y}, …} — map(v, {{0,0},{0.5,0.9},{1,1}}) is a knob that opens fast and finishes slowly. Points are sorted by x, so the order you write them in does not matter; outside the outermost points the value is held rather than extrapolated. Two points with the same x is a step, and the later one wins.' },
  { id: 'quantizeTo', category: 'Value / range', signature: 'quantizeTo(v, values)',
    summary: 'Snap to the nearest value in a LIST, rather than to a regular step: quantizeTo(9, {0, 8, 16}) is 8. snap() covers evenly spaced settings; this covers the ones a synth actually has. A tie goes to the lower value, so the result never depends on rounding.' },
  { id: 'randomChoice', category: 'Value / range', signature: 'randomChoice(values [, weights])',
    summary: 'Pick one of a list, using the seeded generator — so a "random" patch replays. With `weights`, the chance of each is its weight over the total; a missing or negative weight counts as zero, and all-zero weights fall back to an even pick. Exactly one number is drawn from the generator either way, so adding weights does not change what everything AFTER it picks.' },
  { id: 'dbToGain', category: 'Value / range', signature: 'dbToGain(db)',
    summary: 'Decibels to a linear gain: 0 dB is 1, -6 dB is about 0.5. Neither Lua nor JavaScript has it, and a level control that reads in dB and sends a linear value needs it on every move.' },
  { id: 'gainToDb', category: 'Value / range', signature: 'gainToDb(gain)',
    summary: 'The inverse. A gain of zero or less returns -144 dB — the 24-bit noise floor — rather than negative infinity, which is a number half the runtimes cannot carry through a value and none can display.' },

  // --- the rest of the arithmetic a synth panel actually does (design doc §32) ---
  // Nothing here duplicates the language's own scalar maths — min/max/abs/floor/ceil/sin all exist
  // in every runtime already, and that rule is what keeps the list finite. What IS here is either
  // domain-specific, list-shaped (Lua's varargs make the language version unusable over a table),
  // or has to be identical in five runtimes to be worth anything.
  { id: 'norm', category: 'Value / range', signature: 'norm(v, lo, hi)',
    summary: 'A value to its 0–1 position in a range, CLAMPED. scale(v, lo, hi, 0, 1) is the hand-rolled version and it does not clamp, so a value past the end came out past 1 and stayed wrong all the way down the chain. The value model already has a .normalizedValue face; this is that conversion for numbers a script is holding itself.' },
  { id: 'denorm', category: 'Value / range', signature: 'denorm(t, lo, hi)',
    summary: 'The inverse: a 0–1 position back into a range, clamped at both ends.' },
  { id: 'bipolar', category: 'Value / range', signature: 'bipolar(t)',
    summary: '0–1 to -1..+1. The two shapes a modulation source is ever in, and the conversion sits in the middle of every modulation script.' },
  { id: 'unipolar', category: 'Value / range', signature: 'unipolar(v)',
    summary: '-1..+1 back to 0–1.' },
  { id: 'fold', category: 'Value / range', signature: 'fold(v, lo, hi)',
    summary: 'Come back OFF the end of a range instead of round it. wrap() jumps from the top to the bottom, which is right for a pitch class and wrong for a modulation depth — a fold reflects, so the movement stays continuous. Wave folding is the audible version of the same idea, and neither is expressible with the language\'s %.' },
  { id: 'indexOfRange', category: 'Value / range', signature: 'indexOfRange(t, count)',
    summary: 'A 0–1 position to one of `count` slots, zero-based — which preset, which step, which pad. The hand-rolled floor(t * count) returns `count` itself at exactly 1.0, one past the end of the list it is addressing, and that off-by-one only appears when a knob is turned fully up.' },
  { id: 'crossfade', category: 'Value / range', signature: 'crossfade(a, b, t [, law])',
    summary: 'Blend a to b with a fade law: "linear", "equalPower" or "sharp" — the same three the Crossfader component has, which a script could not compute. equalPower is the one that matters: a linear fade between two sounds dips in the middle, audibly, which is why the component defaults away from it.' },
  { id: 'approach', category: 'Value / range', signature: 'approach(current, target, maxStep)',
    summary: 'Move toward a target, no further than maxStep in one call. A rate limit with no state of its own, so it works from any handler without the script keeping a timer — ce.anim owns motion the RUNTIME drives, this is the one a script drives itself, per incoming message. How you smooth a jumpy expression pedal.' },
  { id: 'roundTo', category: 'Value / range', signature: 'roundTo(v, decimals)',
    summary: 'Round to a number of decimal places, for a readout. JavaScript\'s toFixed returns a STRING and Lua has no equivalent at all, so every panel showing a tidy number wrote this itself.' },
  { id: 'almost', category: 'Value / range', signature: 'almost(a, b [, epsilon])',
    summary: 'Float comparison that means what == is assumed to mean. A panel compares values constantly — has this reached its target, is this at the detent — and every one of those values arrived through a scale() or a curve().' },
  { id: 'minOf', category: 'Value / range', signature: 'minOf(values)',
    summary: 'The smallest in a LIST, or nil for an empty one. Lua\'s math.min takes varargs, so over a table it needs table.unpack and falls over on a long one; JavaScript needs a spread with the same limit. A panel deals in lists constantly — macro slots, matrix rows, envelope points, the values out of a dump.' },
  { id: 'maxOf', category: 'Value / range', signature: 'maxOf(values)', summary: 'The largest in a list, or nil for an empty one.' },
  { id: 'sumOf', category: 'Value / range', signature: 'sumOf(values)', summary: 'The total of a list. Zero for an empty one — a sum of nothing is nothing, not an absence.' },
  { id: 'meanOf', category: 'Value / range', signature: 'meanOf(values)', summary: 'The average of a list, or nil for an empty one — unlike a sum, an average of nothing does not exist.' },
  { id: 'blend', category: 'Value / range', signature: 'blend(a, b, t)',
    summary: 'Morph one list of values into another, element by element — which is what a snapshot morph IS, and a script could only do it one value at a time. The SHORTER list decides the length: padding with zeros would drag the missing entries to nothing, and on a patch that is a set of parameters slammed to their minimum.' },
  { id: 'randomFloat', category: 'Value / range', signature: 'randomFloat(lo, hi)',
    summary: 'A seeded random FLOAT in a range. random(lo, hi) returns whole numbers — the form a note or a step wants — so until now there was no seeded way to get a fractional one without doing the arithmetic by hand.' },
  { id: 'randomGaussian', category: 'Value / range', signature: 'randomGaussian([mean, sd])',
    summary: 'A bell rather than a slab: most values near the middle. Humanising velocity or timing with a uniform random is the thing that sounds mechanical. Box-Muller, always consuming exactly two draws — it deliberately does NOT cache the second value the way the textbook version does, because a varying draw count would break seed replay.' },
  { id: 'randomWalk', category: 'Value / range', signature: 'randomWalk(current, step, lo, hi)',
    summary: 'Drift rather than jump — a generative line that stays musical. Folded at the ends rather than clamped, because a walk that clamps sticks to the end it hit and stops moving.' },
  { id: 'randomBool', category: 'Value / range', signature: 'randomBool([chance])',
    summary: 'A weighted coin — the probability gate every step sequencer wants. `chance` is the odds of true, 0.5 by default.' },
  { id: 'shuffle', category: 'Value / range', signature: 'shuffle(values)',
    summary: 'A NEW list in seeded random order (Fisher-Yates, exactly one draw per element after the first). The same seed shuffles the same way, which is what makes a shuffled pattern something you can get back.' },
  { id: 'toDegrees', category: 'Value / range', signature: 'toDegrees(radians)', summary: 'Radians to degrees — the unit ce.draw\'s arcs are in.' },
  { id: 'toRadians', category: 'Value / range', signature: 'toRadians(degrees)', summary: 'Degrees to radians — the unit the language\'s trigonometry is in.' },
  { id: 'distance', category: 'Value / range', signature: 'distance(x1, y1, x2, y2)',
    summary: 'The distance between two points. For XY pads, joysticks, the Orbit and hit testing in ce.draw.' },
  { id: 'angleOf', category: 'Value / range', signature: 'angleOf(x1, y1, x2, y2)',
    summary: 'The angle from one point to another in ce.draw\'s own convention: DEGREES, 0 at twelve o\'clock, increasing clockwise, 0–360. Rebuilding that from atan2 by hand is where a knob pointer ends up running backwards or a quadrant out.' },
  { id: 'polar', category: 'Value / range', signature: 'polar(angle, radius)',
    summary: 'The inverse: an angle and a radius to { x, y } offsets from a centre, in the same convention. Together with angleOf, what a knob ring, a radial meter or a pan indicator is drawn from.' },
  // Seeded, and seeded is the point: the language's own math.random cannot promise the same
  // sequence in five runtimes, so a randomised patch could not be reproduced and a generative
  // sequence would sound different in the editor and in the exported plugin.
  { id: 'random', category: 'Value / range', signature: 'random([lo, hi])',
    summary: 'A random number. With no arguments, a float in [0, 1). With two, a whole number from lo to hi INCLUSIVE — the form a script actually wants for a note or a step. Seeded, so the same seed replays the same sequence in every runtime.' },
  { id: 'randomSeed', category: 'Value / range', signature: 'randomSeed(n)',
    summary: 'Set the seed. The same seed replays the same sequence — which is what makes a "random" patch something you can get back. Reseeding with 0 is treated as the default seed rather than as a dead generator.' },
  // music
  // Middle C is C4 — scientific pitch notation, which is what every runtime has always computed.
  // These summaries said "C3" (the Yamaha convention) from the start, so the docs and the code
  // disagreed by an octave: a script written from the manual transposed everything twelve
  // semitones. The code is right and stays; the wording is what was wrong.
  { id: 'noteName', category: 'Music', signature: 'noteName(n)', summary: 'MIDI note number → name, e.g. 60 → "C4" (middle C).' },
  { id: 'noteNumber', category: 'Music', signature: 'noteNumber(name)', summary: 'Note name → MIDI number, e.g. "C4" → 60. Middle C is C4.' },
  // Scales, chords and quantise-to-scale — what §2 defined ce.music as, finished. The interval
  // tables are the panel's OWN: a script asking for "dorian" and a Chord Pad set to "dorian" mean
  // the same seven notes, because there is one table (scripting/musicTheory.js) generated into
  // every prelude. `root` and `note` accept a MIDI number or a name ("C4"), like sendNote does.
  {
    id: 'scaleNotes', category: 'Music', signature: 'scaleNotes(root [, scale]) -> list',
    summary: 'The notes of one octave of a scale, ascending from `root`. Seven notes for the modes, five for the pentatonics, six for blues — the root is not repeated at the top. `scale` defaults to "major"; an unknown name returns nothing rather than guessing.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'chordNotes', category: 'Music', signature: 'chordNotes(root [, type]) -> list',
    summary: 'The notes of a chord, ascending from `root` — an absolute shape, not a scale degree. `type` defaults to "major"; major minor dim aug sus2 sus4 power maj6 min6 dom7 maj7 min7 minMaj7 dim7 m7b5 aug7 add9 dom9 maj9 min9. An unknown type returns nothing.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'type', type: 'string', required: false },
    ],
  },
  {
    id: 'quantizeNote', category: 'Music', signature: 'quantizeNote(note, root [, scale]) -> number',
    summary: 'Snap a note to the nearest one in a scale, searching both directions. A tie goes UP, always, so two runtimes cannot disagree about a note exactly between two scale tones. `scale` defaults to "major"; an unknown name returns nothing.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  // MIDI data encoding (escape hatch — the DPD does this for modeled params)
  { id: 'to7bit', category: 'MIDI encoding', signature: 'to7bit(v, count, order)', summary: 'Pack v into `count` 7-bit bytes; order = "msb"/"lsb" first (14/21/28-bit).' },
  { id: 'from7bit', category: 'MIDI encoding', signature: 'from7bit(bytes, order)', summary: 'Unpack 7-bit bytes back to a value.' },
  // `to14Bit` is the spelling the WebView runtime shipped with before the contract was
  // enforced. Kept as an alias so panels written against it keep working; `to14bit` (matching
  // to7bit/from7bit) is the documented name and the one the other runtimes define.
  { id: 'to14bit', category: 'MIDI encoding', signature: 'to14bit(v)', summary: 'Shorthand: value → { msb, lsb }.', aliases: ['to14Bit'] },
  { id: 'from14bit', category: 'MIDI encoding', signature: 'from14bit(msb, lsb)', summary: 'Shorthand: msb, lsb → value.' },
  { id: 'toNibbles', category: 'MIDI encoding', signature: 'toNibbles(byte)', summary: 'Split a byte into { hi, lo } 4-bit nibbles.' },
  { id: 'fromNibbles', category: 'MIDI encoding', signature: 'fromNibbles(hi, lo)', summary: 'Combine two nibbles into a byte.' },
  { id: 'nibblize', category: 'MIDI encoding', signature: 'nibblize(bytes)', summary: 'Whole block: byte array → nibble array.' },
  { id: 'denibblize', category: 'MIDI encoding', signature: 'denibblize(bytes)', summary: 'Whole block: nibble array → byte array.' },
  { id: 'toAscii', category: 'MIDI encoding', signature: 'toAscii(str, length)', summary: 'String → padded ASCII byte array (patch names).' },
  { id: 'fromAscii', category: 'MIDI encoding', signature: 'fromAscii(bytes)', summary: 'ASCII byte array → string.' },
  { id: 'toOffset', category: 'MIDI encoding', signature: 'toOffset(v, center)', summary: 'Bipolar → centered encoding (e.g. -64..+63, center 64).' },
  { id: 'fromOffset', category: 'MIDI encoding', signature: 'fromOffset(b, center)', summary: 'Centered encoding → bipolar.' },
  { id: 'toSigned', category: 'MIDI encoding', signature: 'toSigned(v, bits)', summary: 'Value → two\'s-complement in N bits.' },
  { id: 'fromSigned', category: 'MIDI encoding', signature: 'fromSigned(b, bits)', summary: "Two's-complement in N bits → value." },
];

/* ------------------------------------------------------------------- modules */
// See docs/scripting-modules-design.md. Three tiers: `ce` is the system (version, runtime,
// capabilities), `ce.panel`/`ce.device`/`ce.host` are the objects a script acts on, and the modules
// below are the verbs. Modules are opt-in per panel: the exporter bundles only the ones a panel
// enables, and the picker shows only those.
//
// This is a SHAPE change, not a rename. Every member keeps the name it always had; it simply also
// lives at ce.<module>.<name>, and the flat spelling stays as an alias. The one place a short name
// earns its keep is ce.components.*, where `setlistNext` becomes `ce.components.setlist.next`.
//
// `ce.core` is `global: true` — its members are never namespaced. Those are the verbs used on every
// line of every script, and prefixing them would cost more than it buys. This is `using namespace
// juce;`: JUCE does not make you write juce::String either.
//
// THIRD-PARTY modules install into the app and live under `ce.ext.*` — `ce.ext.roland_sysex` — so
// provenance is visible and `ce.<module>` stays first-party. The manifest carries id/version/
// requires/integrity from day one so an installed module fits the same shape as a built-in one.

export const MODULE_ROOT = 'ce';
export const MODULE_EXT_ROOT = 'ce.ext';   // reserved for installed third-party modules

// The API version a panel is written against. Bumped when a module's members change incompatibly;
// panels record it so a runtime can tell "written for an older API" from "broken". Lives here
// rather than in a runtime so every runtime reports the same number.
export const CE_API_VERSION = '1.0';

export const MODULES = [
  { id: 'ce.core', version: '1.1', requires: [], runtime: RUNTIME_ANY, global: true,
    summary: 'Values, flow and logging — the verbs every script uses. Never namespaced.' },
  // requires ce.music because sendNote/sendAftertouch accept a note NAME, and resolving it is
  // noteNumber() — a ce.music member. Gating ce.music away would leave sendNote(1, "C4", …)
  // reading a stub and sending note 0. panelApiParity.test.js walks the preludes and fails on any
  // cross-module call that `requires` does not cover, so this cannot be forgotten again.
  // ce.time is a real dependency now, not a convenience: sendNote's optional duration schedules the
  // note off with after(). The prelude-dependency test caught it the moment the call appeared, which
  // is exactly the drift that rule exists to stop.
  { id: 'ce.midi', version: '1.3', requires: ['ce.core', 'ce.music', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'MIDI in and out — notes (with an optional duration), programs, bend, aftertouch, clock, '
      + 'CC/NRPN/Sysex — plus wire filters, injection, routing, panic, checksums and the 7-bit/nibble/ASCII encoders.' },
  // MIXED, and for the same honest reason ce.panel is: declaring a parameter or a dump layout is
  // data plus a codec and works window-closed, but binding a control to one needs a control model
  // and there is none with the window shut. The two verbs say so individually.
  // requires ce.time because requestDump's optional callback needs a timeout, and the timeout is
  // after() — a ce.time member. Gating ce.time away would leave a callback that never resolves,
  // which is precisely the hanging this closed. The prelude-dependency test caught it the moment
  // the call appeared, which is the drift that rule exists to stop.
  { id: 'ce.device', version: '1.3', requires: ['ce.core', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'The connected synth: what it is, what parameters it has, reading and setting one, and bulk dumps — plus declaring a parameter, a dump layout or a binding for a synth the app has no profile for, and enumerating the ports that are really there. Needs the device host.' },
  // requires ce.core because curve() now REPORTS a shape it does not know instead of silently
  // returning the input, and reporting is log(). ce.core is global and never gated, so the
  // dependency costs nothing at runtime — but it is a real call and the prelude-dependency test
  // is right to want it declared.
  { id: 'ce.math', version: '1.3', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Value and range arithmetic — ranges that wrap, curves of your own shape, snapping to a list, decibels — plus a seeded random you can pick from. Pure: no host involved.' },
  { id: 'ce.music', version: '1.1', requires: [], runtime: RUNTIME_ANY,
    summary: 'Note names and numbers, scales, chords, and snapping a note to a key.' },
  { id: 'ce.time', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Musical time: tempo, transport position, beat/bar events, and timers — plain or beat-synced.' },
  { id: 'ce.anim', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Move a value over time instead of jumping it. Cross-runtime: a sweep has to work with the panel shut too.' },
  { id: 'ce.ui', version: '1.1', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Tell the person using the panel something, or ask them. Panel view only — there is nobody to tell with the window shut.' },
  { id: 'ce.draw', version: '1.1', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Draw on top of any control: scope traces, envelope shapes, XY pads, readouts. Panel view only — there is no surface with the window shut.' },
  // The first MIXED module. Its structure verbs are panel-view only and say so individually, but
  // snapshot/restore are not — so declaring the whole module unavailable window-closed would make
  // ce.has("ce.panel") tell a script to skip two verbs that work perfectly there. The per-member
  // stubs are what state the boundary precisely; the module says "some of this reaches you".
  { id: 'ce.panel', version: '1.3', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Build the panel from a script: create, clone, parent and find controls — panel view only, each verb says so. snapshot/restore work anywhere.' },
  { id: 'ce.storage', version: '1.1', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Per-script scratch state, and settings that outlive the session.' },
  { id: 'ce.components.split', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Zone Splitter. Panel view only — the component is modelled there.' },
  { id: 'ce.components.phrase', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Phrase Sequencer. Panel view only.' },
  { id: 'ce.components.recorder', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Phrase Recorder. Panel view only.' },
  { id: 'ce.components.harmony', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Harmoniser. Panel view only.' },
  { id: 'ce.components.setlist', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Setlist. Panel view only.' },
  // …and one per remaining family, expanded from the same spec the verbs come from. One module
  // per family rather than one for all of them: a panel with an Arpeggiator should not pay for the
  // LCD, the Matrix and the Orbit, and the cost report is per module.
  ...COMPONENT_FAMILIES.map((fam) => ({
    id: moduleIdFor(fam.id), version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: `${fam.summary} Panel view only — the component is modelled there.`,
  })),
];

// module id -> the members it owns. A plain array means "keep the member's own name"; an object
// maps shortName -> memberId, which is how ce.components.setlist.next reaches `setlistNext`.
// Every non-lifecycle member must appear exactly once — panelApiParity.test.js checks it.
const MODULE_MEMBERS = {
  // The namespaced names read well; the FLAT aliases are deliberately more defensive, the same
  // rule ce.time.playing/isPlaying follows. A global `error` would SHADOW Lua's builtin error(),
  // turning the standard way to raise into a print — the quietest possible way to break a script.
  // `action` flat is defineAction: `action` alone reads as "call one", and the whole point of the
  // verb is that it DEFINES one. watch/compute/intercept are unambiguous, so they keep their names.
  'ce.core': { set: 'set', get: 'get', log: 'log', warn: 'logWarn', error: 'logError',
               on: 'on', off: 'off', emit: 'emit', run: 'run',
               noTransmit: 'noTransmit', transmit: 'transmit',
               watch: 'watch', compute: 'compute', intercept: 'intercept', action: 'defineAction' },
  'ce.midi': [
    'sendCC', 'sendNRPN', 'sendRPN', 'sendSysex', 'checksum', 'panic', 'sendSongPosition',
    'sendMidi', 'sendNote', 'sendNoteOff', 'sendProgramChange', 'sendPitchBend',
    'sendAftertouch', 'sendClock', 'sendTransport',
    'to7bit', 'from7bit', 'to14bit', 'from14bit', 'toNibbles', 'fromNibbles', 'nibblize',
    'denibblize', 'toAscii', 'fromAscii', 'toOffset', 'fromOffset', 'toSigned', 'fromSigned',
  ].reduce((acc, id) => { acc[id] = id; return acc; }, {
    // The namespaced names read well; the flat aliases have to stay distinct from ce.core.intercept,
    // which is a different thing entirely — one filters a model path, these filter the wire.
    interceptIn: 'interceptMidiIn', interceptOut: 'interceptMidiOut',
    feed: 'feedMidi', route: 'routeMidi',
  }),
  'ce.device': {
    requestDump: 'requestDump', applyDump: 'applyDump', sendDump: 'sendDump', buildDump: 'buildDump',
    read: 'deviceRead', write: 'deviceWrite',
    // The structure verbs. Namespaced they are plain words — ce.device.defineParameter reads as
    // what it is — and flat they keep the `device` prefix, the same rule the reads follow: a bare
    // global `bind` or `ports` is exactly the collision §1 warned about.
    defineParameter: 'deviceDefineParameter', defineDump: 'deviceDefineDump',
    bind: 'deviceBind', unbind: 'deviceUnbind', ports: 'devicePorts',
    // The reads drop the `device` prefix inside the namespace — ce.device.deviceProfile() stutters,
    // ce.device.profile() reads like what it is. The flat alias keeps the prefix because there it
    // is the only thing distinguishing it from a panel property.
    profile: 'deviceProfile', parameters: 'deviceParameters',
    parameter: 'deviceParameter', connected: 'deviceConnected',
  },
  // `random` and `seed` read better namespaced; flat they keep the randomSeed spelling, because
  // a bare global called `seed` is exactly the collision §1 warned about. `map` and `choice` are
  // the same case and worse — `map` is the single most common name a panel author gives their own
  // helper — so flat they are mapCurve and randomChoice.
  'ce.math': { scale: 'scale', clamp: 'clamp', round: 'round', snap: 'snap', curve: 'curve',
               lerp: 'lerp', random: 'random', seed: 'randomSeed',
               wrap: 'wrap', map: 'mapCurve', quantize: 'quantizeTo', choice: 'randomChoice',
               dbToGain: 'dbToGain', gainToDb: 'gainToDb',
               // Namespaced these read as plain words; flat they keep a qualifier wherever a bare
               // global would be a name a panel author reaches for first — `index`, `min`, `max`,
               // `sum`, `mean` and `degrees` are exactly that, and `almost`/`fold`/`blend` are not.
               norm: 'norm', denorm: 'denorm', bipolar: 'bipolar', unipolar: 'unipolar',
               fold: 'fold', index: 'indexOfRange', crossfade: 'crossfade', approach: 'approach',
               roundTo: 'roundTo', almost: 'almost',
               min: 'minOf', max: 'maxOf', sum: 'sumOf', mean: 'meanOf', blend: 'blend',
               randomFloat: 'randomFloat', gaussian: 'randomGaussian', walk: 'randomWalk',
               chance: 'randomBool', shuffle: 'shuffle',
               degrees: 'toDegrees', radians: 'toRadians',
               distance: 'distance', angle: 'angleOf', polar: 'polar' },
  'ce.music': { name: 'noteName', number: 'noteNumber',
                scale: 'scaleNotes', chord: 'chordNotes', quantize: 'quantizeNote' },
  'ce.anim': {
    to: 'animateTo', spring: 'animateSpring', stop: 'animateStop', running: 'animateRunning',
  },
  'ce.ui': { notify: 'uiNotify', status: 'uiStatus', dialog: 'uiDialog' },
  'ce.draw': {
    clear: 'drawClear', fill: 'drawFill', stroke: 'drawStroke', rect: 'drawRect',
    circle: 'drawCircle', arc: 'drawArc', line: 'drawLine', path: 'drawPath', text: 'drawText',
    redraw: 'drawRedraw',
  },
  'ce.panel': {
    snapshot: 'panelSnapshot', restore: 'panelRestore', each: 'panelEach',
    create: 'panelCreate', clone: 'panelClone', destroy: 'panelDestroy',
    parent: 'panelParent', find: 'panelFind', info: 'panelInfo', types: 'panelTypes',
    // The collections INSIDE a control. `undefine` rather than `remove`, so it cannot be confused
    // with `destroy`, which takes a whole control away.
    entries: 'panelEntries', entry: 'panelEntry',
    define: 'panelDefine', undefine: 'panelUndefine', patch: 'panelPatch',
  },
  'ce.storage': { state: 'state', saveSetting: 'saveSetting', loadSetting: 'loadSetting',
                  settings: 'listSettings', forget: 'forgetSetting' },
  'ce.time': {
    startTimer: 'startTimer', stopTimer: 'stopTimer', syncTimer: 'syncTimer', after: 'after',
    // The namespaced names read well; the FLAT aliases are deliberately more defensive.
    // `playing` and `transport` as bare globals are exactly the collision §1 warned about —
    // ordinary words a panel author would reach for — so flat they are isPlaying and
    // transportInfo. The contract already supports a short name differing from the member id
    // (ce.components.setlist.jump is setlistGoto), so this costs nothing but a line here.
    tempo: 'tempo', playing: 'isPlaying', transport: 'transportInfo',
    beatsToMs: 'beatsToMs', msToBeats: 'msToBeats',
  },
  'ce.components.split': {
    preset: 'splitPreset', mute: 'splitMute', channel: 'splitChannel',
    transpose: 'splitTranspose', point: 'splitPoint',
  },
  'ce.components.phrase': {
    seed: 'phraseSeed', clear: 'phraseClear', key: 'phraseKey', scale: 'phraseScale',
    transpose: 'phraseTranspose', direction: 'phraseDirection', run: 'phraseRun', cell: 'phraseCell',
  },
  'ce.components.recorder': {
    record: 'recorderRecord', stop: 'recorderStop', play: 'recorderPlay', clear: 'recorderClear',
    undo: 'recorderUndo', quantize: 'recorderQuantize', transpose: 'recorderTranspose',
    bars: 'recorderBars', source: 'recorderSource', nudge: 'recorderNudge', shift: 'recorderShift',
    store: 'recorderStore', load: 'recorderLoad', countIn: 'recorderCountIn',
  },
  'ce.components.harmony': {
    mode: 'harmonyMode', key: 'harmonyKey', scale: 'harmonyScale', size: 'harmonySize',
    shape: 'harmonyShape', voicing: 'harmonyVoicing', inversion: 'harmonyInversion',
    octave: 'harmonyOctave', outOfKey: 'harmonyOutOfKey', keepPlayed: 'harmonyKeepPlayed',
    channel: 'harmonyChannel', voiceLeading: 'harmonyVoiceLeading', strum: 'harmonyStrum',
    degree: 'harmonyDegree',
  },
  // One entry per phase-7 family: { run: 'arpRun', rate: 'arpRate', … }, so a script writes
  // ce.components.arp.rate(...) and the flat arpRate(...) still resolves to the same function.
  ...Object.fromEntries(COMPONENT_FAMILIES.map((fam) => [
    moduleIdFor(fam.id),
    Object.fromEntries(fam.verbs.map((verb) => [
      verb.v, fam.prefix + verb.v.charAt(0).toUpperCase() + verb.v.slice(1),
    ])),
  ])),
  'ce.components.setlist': {
    // `jump`, not `goto`: goto is a Lua 5.4 keyword, so both the generated table and the call site
    // ce.components.setlist.goto(...) would fail to parse. The generator refuses reserved words in
    // any of the three languages so this cannot be reintroduced by accident.
    next: 'setlistNext', prev: 'setlistPrev', jump: 'setlistGoto',
    enable: 'setlistEnable', wrap: 'setlistWrap', crossfade: 'setlistCrossfade',
  },
};

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));

/** { shortName: memberId } for a module, whichever form its entry was written in. */
export function moduleMemberMap(moduleId) {
  const entry = MODULE_MEMBERS[moduleId] ?? {};
  return Array.isArray(entry) ? Object.fromEntries(entry.map((id) => [id, id])) : { ...entry };
}

/** The module a member belongs to, and the name it answers to inside it. */
export const MEMBER_MODULE = (() => {
  const out = {};
  for (const moduleId of Object.keys(MODULE_MEMBERS)) {
    for (const [shortName, memberId] of Object.entries(moduleMemberMap(moduleId))) {
      out[memberId] = { module: moduleId, name: shortName };
    }
  }
  return out;
})();

/** Where a member lives: "set" for ce.core (global), "ce.midi.sendCC" otherwise. */
export function memberPath(memberId) {
  const at = memberModule()[memberId];
  if (!at) return memberId;
  // A global module's members ARE globals, so their path is the bare name — unless the short name
  // differs from the flat one, which is exactly the defensive case (ce.core.error is the readable
  // spelling; the global is logError, because `error` would shadow Lua's builtin). There the
  // namespaced path is the only place the short name exists, so it has to be spelled out.
  if (moduleById(at.module)?.global) return at.name === memberId ? at.name : `${at.module}.${at.name}`;
  return `${at.module}.${at.name}`;
}

/** Modules whose members a runtime must bind. Built-in only — this drives the parity suite, and
    an installed extension is not something the five runtimes are held to. */
export function modulesForRuntime(runtime) {
  return MODULES.filter((m) => m.runtime === RUNTIME_ANY || m.runtime === runtime);
}

/** Is `id` a well-formed third-party module id? Installed modules live under ce.ext.* so that
    provenance is visible and the first-party namespace stays ours. */
export function isExtensionModule(id) {
  return String(id ?? '').startsWith(`${MODULE_EXT_ROOT}.`);
}

/* ------------------------------------------------------- installed extensions (ce.ext.*) */
// Everything above is the FIRST-PARTY contract and stays a set of constants: the parity suite
// holds five runtimes to exactly that, and an installed module must not be able to weaken it.
// Extensions live in a registry beside it, and the resolution helpers below read
// `allModules()` / `memberModule()` rather than the constants directly, so an installed module
// is a first-class module everywhere it matters without ever editing the built-in list.
//
// Installing is validated in extensionModules.js — the format, the collision rules, disk I/O.
// This file only holds the registration, because the resolution helpers are here.

const EXTENSIONS = new Map();   // id -> { id, version, requires, runtime, summary, members: [...] }

/** Add (or replace) an installed extension. Assumes an already-validated manifest. */
export function registerExtension(ext) {
  if (!ext?.id) return;
  EXTENSIONS.set(ext.id, ext);
}

export function unregisterExtension(id) { EXTENSIONS.delete(id); }
export function registeredExtensions() { return [...EXTENSIONS.values()]; }
export function clearExtensions() { EXTENSIONS.clear(); }

/** Built-in modules plus every installed extension, in that order. */
export function allModules() {
  return [...MODULES, ...EXTENSIONS.values()];
}

/** allModules() as a lookup. */
export function moduleById(id) {
  return MODULE_BY_ID[id] ?? EXTENSIONS.get(id) ?? null;
}

/** { shortName: memberId } for any module, built-in or installed. */
export function memberMapFor(moduleId) {
  const ext = EXTENSIONS.get(moduleId);
  if (ext) return Object.fromEntries((ext.members ?? []).map((m) => [m.name ?? m.id, m.id]));
  return moduleMemberMap(moduleId);
}

/** MEMBER_MODULE including installed extensions. */
export function memberModule() {
  const out = { ...MEMBER_MODULE };
  for (const ext of EXTENSIONS.values()) {
    for (const [shortName, memberId] of Object.entries(memberMapFor(ext.id))) {
      out[memberId] = { module: ext.id, name: shortName };
    }
  }
  return out;
}

/** Every member descriptor an extension contributes, shaped like a built-in one. */
export function extensionMembers() {
  const out = [];
  for (const ext of EXTENSIONS.values()) {
    for (const m of ext.members ?? []) {
      out.push({ ...m, kind: 'command', runtime: ext.runtime ?? RUNTIME_ANY, extension: ext.id });
    }
  }
  return out;
}

/* --------------------------------------------------------------- module opt-in (slice 3) */
// A panel declares the modules it uses. Everything not declared is gated: the member is still
// bound, but as a stub that names the module and says how to turn it on. Gating by REMOVAL was
// the obvious alternative and is the wrong one — `attempt to call a nil value` is precisely the
// class of unexplained failure the previous two rounds were spent deleting.
//
// Absent declaration means AUTO, not "none": every panel written before this existed keeps
// working, and a beginner never has to know the concept. Narrowing is opt-in on top.

export const MODULE_CORE = 'ce.core';        // never gated — the verbs used on every line
export const MODULE_MODE_AUTO = 'auto';      // derive the set from what the scripts actually touch

/** ce.core plus anything that is not addressable through the namespace, so gating can't strand it. */
const ALWAYS_ENABLED = [MODULE_CORE];

/**
 * Close a declared list over `requires` and pin the always-on modules.
 * Returns { enabled, added, unknown } — `added` is what `requires` pulled in (so the UI can say
 * why a module the user did not tick is on), `unknown` is ids we have never heard of, reported
 * rather than dropped: silently ignoring one is how a typo becomes a mystery.
 */
export function resolveModules(declared) {
  const known = allModules();
  const byId = new Map(known.map((m) => [m.id, m]));
  const enabled = new Set(ALWAYS_ENABLED);
  const added = new Set();
  const unknown = [];
  const missing = [];
  const queue = [];

  const classify = (id, into) => {
    if (byId.has(id)) { queue.push(id); return; }
    // An unresolved ce.ext.* id is MISSING, not unknown: the panel names a real third-party
    // module that this install does not have. That is a different problem with a different fix
    // (install it) and a different message, so it gets its own bucket rather than being lumped
    // in with a typo.
    (isExtensionModule(id) ? missing : unknown).push(id);
    if (into) into.push(id);
  };

  for (const raw of Array.isArray(declared) ? declared : []) {
    const id = String(raw ?? '').trim();
    if (id) classify(id);
  }

  while (queue.length) {
    const id = queue.shift();
    if (enabled.has(id)) continue;
    enabled.add(id);
    for (const need of byId.get(id)?.requires ?? []) {
      if (enabled.has(need)) continue;
      if (byId.has(need)) { added.add(need); queue.push(need); }
      else if (isExtensionModule(need)) { if (!missing.includes(need)) missing.push(need); }
      else if (!unknown.includes(need)) unknown.push(need);
    }
  }

  // Keep manifest order rather than insertion order, so two panels with the same set produce the
  // same list and a diff of the panel document stays readable.
  return {
    enabled: known.map((m) => m.id).filter((id) => enabled.has(id)),
    added: [...added].filter((id) => !ALWAYS_ENABLED.includes(id)),
    unknown,
    missing,
  };
}

// What a reference to a member looks like in the languages a panel can be written in. Both
// spellings count: the flat alias (`sendCC(`) and the namespaced path (`ce.midi.sendCC`).
// Value members have no call parens, so they are matched as bare words.
function memberReferenceRe(memberId, shortName) {
  const flat = escapeForRe(memberId);
  const short = escapeForRe(shortName);
  return new RegExp(`\\b${flat}\\b|\\.\\s*${short}\\b`);
}

function escapeForRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Which modules a piece of script source actually reaches for. A scan, not a parse — same
 * standing caveat as scriptValidate.js: it can over-report from a comment or a string, and
 * over-reporting is the safe direction here (a module gets enabled that did not need to be).
 */
export function modulesUsedBy(source) {
  const src = typeof source === 'string' ? source : '';
  if (!src) return [];
  const known = allModules();
  const hit = new Set();
  for (const [memberId, at] of Object.entries(memberModule())) {
    if (hit.has(at.module)) continue;
    if (moduleById(at.module)?.global) continue;      // ce.core is never gated, never scanned for
    if (memberReferenceRe(memberId, at.name).test(src)) hit.add(at.module);
  }
  // A script may also address a module wholesale — `local midi = ce.midi`, `ce.has("ce.time")`.
  for (const module of known) {
    if (hit.has(module.id) || module.global) continue;
    const path = escapeForRe(module.id);
    if (new RegExp(`\\b${path}\\b`).test(src)) hit.add(module.id);
  }
  return known.map((m) => m.id).filter((id) => hit.has(id));
}

/** The scripts a panel ships, flattened — panel-level plus per-control. Sources only. */
function panelScriptSources(panel) {
  const out = [];
  for (const s of panel?.scripts ?? []) if (typeof s?.source === 'string') out.push(s.source);
  for (const control of panel?.controls ?? []) {
    for (const s of control?._children?.Scripts?.scripts ?? []) {
      if (typeof s?.source === 'string') out.push(s.source);
    }
  }
  return out;
}

/**
 * What this panel's scripting surface resolves to.
 *
 *   scripting.modules absent, or "auto"  -> derived from the sources (the default)
 *   scripting.modules: [...]             -> exactly that, closed over `requires`
 *
 * `mode` is reported back so the Export tab can say which of the two it is showing.
 */
export function panelModules(panel) {
  const declared = panel?.scripting?.modules;
  const isExplicit = Array.isArray(declared);
  const source = isExplicit
    ? declared
    : [...new Set(panelScriptSources(panel).flatMap((src) => modulesUsedBy(src)))];
  return { mode: isExplicit ? 'manual' : MODULE_MODE_AUTO, declared: [...source], ...resolveModules(source) };
}

// The notice a gated member reports instead of acting. Kept as a TEMPLATE because the C++ preludes
// need the same sentence and cannot import this file — gen-script-modules.mjs copies the template
// into each one, so all five runtimes explain a gated call in exactly the same words.
export const MODULE_GATE_MESSAGE =
  '{member}() needs the {module} module, which this panel has not enabled. '
  + 'Add "{module}" to the panel\'s Scripting Modules (Export tab) — or clear the list to let it '
  + 'follow the scripts automatically.';

/** The notice a gated member reports instead of acting. Names the module, and what to do. */
export function moduleGateMessage(memberId, moduleId = memberModule()[memberId]?.module ?? '?') {
  return MODULE_GATE_MESSAGE.split('{member}').join(memberId).split('{module}').join(moduleId);
}

/* -------------------------------------------------------------------- what a module costs */
// MODULE_COST is MEASURED from the preludes by tools/scripts/gen-script-modules.mjs, not asserted
// here — design doc §3. A cost key is a module id, the shared bucket "-", or a GROUP: the five
// component families share one indivisible stub block in the C++ preludes, so `ce.components`
// is billed once rather than split five ways.

/** What one installed extension's prelude weighs, summed over the languages it ships. */
export function extensionCost(ext, languages = MODULE_COST_LANGUAGES) {
  const prelude = ext?.prelude ?? {};
  let bytes = 0;
  for (const language of languages) {
    const src = prelude[language] ?? (language === 'webview' ? prelude.javascript : null);
    if (typeof src === 'string') bytes += src.length;
  }
  return bytes;
}

/** The cost key a module is billed under — itself, or the group that owns its bytes. */
export function costKeyFor(moduleId) {
  return costKeysFor(moduleId)[0] ?? null;
}

/**
 * EVERY cost key a module is charged against: its own, plus each ancestor group that carries
 * shared bytes.
 *
 * Before phase 7 a module had exactly one key, because the five component families shared one
 * indivisible stub block and were billed as the `ce.components` group. Generating the stub lists
 * split those bytes per family — so each family now has its own key AND still leans on a shared
 * `ce.components` region (the generic verb machinery every family goes through). Billing only the
 * most specific key would silently drop that region from every panel's total.
 *
 * A group is charged ONCE however many of its modules are enabled — that is what makes it a group.
 */
export function costKeysFor(moduleId) {
  const keys = [];
  if (MODULE_COST[moduleId]) keys.push(moduleId);
  // An extension carries its own prelude, so it is billed under its own id rather than looked up
  // in the generated table — which only knows about modules compiled into the app.
  else if (moduleById(moduleId) && isExtensionModule(moduleId)) return [moduleId];
  const parts = String(moduleId ?? '').split('.');
  for (let i = parts.length - 1; i >= 2; i--) {
    const group = parts.slice(0, i).join('.');
    if (MODULE_COST[group]) keys.push(group);
  }
  return keys;
}

/**
 * What this panel's scripting surface weighs, per module and in total.
 *
 * These are SOURCE bytes across the runtimes that carry a prelude, not a binary delta: Lua and
 * JavaScript are compiled into the player whether a panel uses them or not. The number is honest
 * about what the surface costs and is the figure the Export tab shows — beside the Python runtime,
 * which is the one that moves megabytes.
 */
export function panelModuleCost(panel, languages = MODULE_COST_LANGUAGES) {
  const { enabled } = panelModules(panel);
  const sum = (key) => languages.reduce((n, l) => n + (MODULE_COST[key]?.[l] ?? 0), 0);

  const billed = new Map();          // cost key -> the modules charged to it
  for (const id of enabled) {
    for (const key of costKeysFor(id)) {
      if (!billed.has(key)) billed.set(key, []);
      billed.get(key).push(id);
    }
  }

  const bytesFor = (key) => (isExtensionModule(key)
    ? extensionCost(moduleById(key), languages)
    : sum(key));

  const modules = [...billed.entries()]
    .map(([key, ids]) => ({ key, ids, bytes: bytesFor(key), extension: isExtensionModule(key) }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    languages: [...languages],
    modules,
    total: modules.reduce((n, m) => n + m.bytes, 0),
    shared: sum(COST_SHARED_KEY),
    // What declaring fewer modules would save: everything not enabled, billed the same way.
    unused: allModules()
      .map((m) => m.id)
      .filter((id) => !enabled.includes(id))
      .reduce((keys, id) => {
        for (const k of costKeysFor(id)) if (!billed.has(k)) keys.add(k);
        return keys;
      }, new Set()),
  };
}

/** The shared baseline every panel pays: host bindings, the event registry, the namespace block. */
export const COST_SHARED_KEY = '-';

/* ----------------------------------------------------------- derived indexes */
// Convenience lookups for the picker, validation, and docs.

export const ALL_MEMBERS = [
  ...LIFECYCLE_HOOKS.map((m) => ({ ...m, kind: 'lifecycle' })),
  ...COMMANDS.map((m) => ({ ...m, kind: 'command' })),
  ...PANEL_COMMANDS.map((m) => ({ ...m, kind: 'command' })),
  ...HELPERS.map((m) => ({ ...m, kind: 'helper' })),
];

export const MEMBER_BY_ID = Object.fromEntries(ALL_MEMBERS.map((m) => [m.id, m]));

/** Where a member runs — 'any' unless it explicitly declares otherwise. */
export function memberRuntime(member) {
  return member?.runtime ?? RUNTIME_ANY;
}

/** Members a given runtime must implement. 'webview' gets everything; a C++ engine gets the
    'any' members as working calls (the 'webview' ones it stubs — see WEBVIEW_ONLY_MEMBERS). */
export function membersForRuntime(runtime) {
  return runtime === RUNTIME_WEBVIEW
    ? ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle')
    : ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle' && memberRuntime(m) === RUNTIME_ANY);
}

/** Does this member need the device host to produce an answer? Cross-runtime either way — the
    runtimes all bind it — but in a plain browser tab it must report, not return a quiet nothing. */
export function requiresDeviceHost(member) {
  return member?.requiresDeviceHost === true;
}

/** Handler names an event source in `runtime` is expected to raise. Lifecycle hooks marked
    RUNTIME_PLAYER (onDaw*) are excluded from the WebView's list: the editor has no DAW. */
export function handlerNamesForRuntime(runtime) {
  const hooks = LIFECYCLE_HOOKS
    .filter((h) => memberRuntime(h) === RUNTIME_ANY || memberRuntime(h) === runtime)
    .map((h) => h.id);
  return [...hooks, ...ALL_EVENTS.map((e) => e.fn)];
}

/** The names the C++ engines define as "needs the panel window" stubs.
 *
 *  COMMANDS only. A lifecycle hook is a function the script DEFINES, not a global the engine
 *  binds, so stubbing one would define a handler that shadows the user's — and `onPanelBuild` is
 *  already kept out of the player's probe list by handlerNamesForRuntime, which is the right
 *  mechanism for a hook. (This only surfaced with onPanelBuild: the other runtime-limited hooks
 *  are player-only, which never reached this path.) */
export const WEBVIEW_ONLY_MEMBERS = ALL_MEMBERS
  .filter((m) => m.kind !== 'lifecycle' && memberRuntime(m) === RUNTIME_WEBVIEW)
  .map((m) => m.id);

/** Is this member a VALUE rather than a callable? `state` is a table you read and write, not a
    function you call, and the signature already says so — it carries no parentheses. Tests and the
    picker both need to tell the two apart. */
export function isValueMember(member) {
  return typeof member?.signature === 'string' && !member.signature.includes('(');
}

/** Every name a member answers to — its id plus any back-compat aliases. */
export function memberNames(member) {
  return [member.id, ...(member.aliases ?? [])];
}

export const ALL_EVENTS = [
  ...CONTROL_EVENTS.map((e) => ({ ...e, group: 'control' })),
  ...PANEL_EVENTS.map((e) => ({ ...e, group: 'panel' })),
  ...TIME_EVENTS.map((e) => ({ ...e, group: 'time' })),
  ...DEVICE_EVENTS.map((e) => ({ ...e, group: 'device' })),
];

export const EVENT_BY_ID = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

/** Every function name a script may define and have called: the lifecycle hooks plus the
    handler name of every event. Runtimes collect handlers by probing for these, so a name
    missing here can never fire — drive the probe list from this, never from a local copy. */
export const ALL_HANDLER_NAMES = [
  ...LIFECYCLE_HOOKS.map((h) => h.id),
  ...ALL_EVENTS.map((e) => e.fn),
];

// `category` on a member is now a descriptive tag only. It used to be the picker's grouping
// (membersByCategory), which is exactly the grouping design doc §1 says does not scale: 47 panel
// verbs in one bucket beside `clamp`. membersByModule() replaced it — modules are what a user
// writes, and since slice 3 they are also what decides whether a member is reachable at all.

/**
 * The picker's grouping: one group per module, in manifest order, plus Lifecycle first.
 *
 * Categories were the old grouping and they do not survive contact with 47 panel-component verbs
 * presented flat beside `clamp` (design doc §1). Modules are the grouping the user now writes in,
 * and — since slice 3 — the grouping that decides what a panel can reach at all, so the picker and
 * the runtime finally answer to the same list.
 *
 * `module` is null for the Lifecycle group: those are functions a script DEFINES, not names it is
 * given, so no module owns them and no module gate applies.
 */
export function membersByModule() {
  const groups = allModules().map((m) => ({ module: m, members: [] }));
  const byId = new Map(groups.map((g) => [g.module.id, g]));
  const lifecycle = { module: null, members: [] };
  const at = memberModule();

  for (const m of [...ALL_MEMBERS, ...extensionMembers()]) {
    if (m.kind === 'lifecycle') { lifecycle.members.push(m); continue; }
    byId.get(at[m.id]?.module)?.members.push(m);
  }
  return [lifecycle, ...groups].filter((g) => g.members.length);
}

/**
 * The snippet with its leading name rewritten to the canonical module path — `ce.midi.sendCC(…)`
 * rather than `sendCC(…)`. `ce.core` is `global: true`, so its members come back untouched.
 *
 * Both spellings work and will keep working; this is which one the picker TEACHES. Inserting the
 * flat name while the rest of the system talks in modules would be teaching the deprecated form.
 */
export function namespacedSnippet(member, languageId) {
  const flat = insertSnippet(member, languageId);
  const path = memberPath(member?.id);
  if (!flat || !member?.id || path === member.id) return flat;
  // EVERY standalone occurrence, not just the first: `state`'s snippet mentions it twice
  // (`state.count = (state.count or 0) + 1`), and rewriting only the leading one would insert a
  // line that uses both spellings at once. The negative look-behind stops a name that is already
  // part of a path from being prefixed twice.
  return flat.replace(new RegExp(`(?<![\\w.])${escapeForRe(member.id)}\\b`, 'g'), path);
}

/** Is a member valid in a given scope? `scopes: 'any'` or undefined => valid everywhere. */
export function isValidInScope(member, scope) {
  const s = member?.scopes;
  if (!s || s === 'any') return true;
  return Array.isArray(s) && s.includes(scope);
}

/** The language descriptor for an id ('lua' | 'javascript'). */
export function language(id) {
  return SCRIPT_LANGUAGES.find((l) => l.id === id) ?? SCRIPT_LANGUAGES[0];
}

/** The snippet to insert for a member in a given language; falls back to the signature. */
export function insertSnippet(member, languageId) {
  return member?.snippet?.[languageId] ?? member?.signature ?? member?.id ?? '';
}
