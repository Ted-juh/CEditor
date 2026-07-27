// panelApi.js — single source of truth for the CEditor panel scripting API.
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
  summary: 'The element this script is attached to (control, panel, or custom-component instance). Use instead of a fixed name so one script works on every copy of a reusable component.',
  scopes: ['component', 'panel'],
};

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
    summary: 'Phase 4 — really closing. Final cleanup, send a closing dump, all-notes-off.',
    params: [],
    snippet: { lua: 'function onPanelClose()\n  $0\nend', javascript: 'function onPanelClose() {\n  $0\n}' },
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

export const DEVICE_EVENTS = [
  // decoded (the DPD payoff — 90% of use)
  { id: 'parameterReceived', fn: 'onParameterReceived', payload: 'info', decoded: true, summary: 'A value arrived, decoded via the DPD. info.parameter, info.value.' },
  { id: 'dumpReceived', fn: 'onDumpReceived', payload: 'dump', decoded: true, summary: 'A bulk dump arrived. dump.bytes, dump.kind. Use applyDump(dump.bytes) to fill the panel.' },
  // raw (escape hatch)
  { id: 'midiIn', fn: 'onMidiIn', payload: 'midi', decoded: false, summary: 'Any MIDI arrived (raw). midi.bytes, midi.channel, midi.status.' },
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', decoded: false, summary: 'A CC arrived. cc.channel, cc.cc, cc.value.' },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'Raw SysEx arrived.' },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A device connected.' },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A device disconnected.' },
];

export const EVENTS = { control: CONTROL_EVENTS, panel: PANEL_EVENTS, device: DEVICE_EVENTS };

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
    id: 'stopTimer', category: 'Events & Flow', signature: 'stopTimer(id)',
    summary: 'Stop a timer started with startTimer. Stopping an unknown id is harmless.',
    params: [{ name: 'id', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'stopTimer("${1:id}")$0', javascript: 'stopTimer("${1:id}")$0' },
  },

  /* --- Device / MIDI: bulk (Q9) --- */
  {
    id: 'requestDump', category: 'Device / MIDI', signature: 'requestDump(kind)',
    summary: 'Ask the synth to send a dump. kind ("patch"/"tone"/"global"…) is defined by the DPD.',
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: 'any',
    snippet: { lua: 'requestDump("${1:patch}")$0', javascript: 'requestDump("${1:patch}")$0' },
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
  { id: 'curve', category: 'Value / range', signature: 'curve(v, shape)', summary: 'Apply a named response curve ("log","exp","s"…).' },
  { id: 'lerp', category: 'Value / range', signature: 'lerp(a, b, t)', summary: 'Blend between a and b by t (0–1).' },
  // music
  { id: 'noteName', category: 'Music', signature: 'noteName(n)', summary: 'MIDI note number → name, e.g. 60 → "C3".' },
  { id: 'noteNumber', category: 'Music', signature: 'noteNumber(name)', summary: 'Note name → MIDI number, e.g. "C3" → 60.' },
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

/** The names the C++ engines define as "needs the panel window" stubs. */
export const WEBVIEW_ONLY_MEMBERS = ALL_MEMBERS
  .filter((m) => memberRuntime(m) === RUNTIME_WEBVIEW)
  .map((m) => m.id);

/** Every name a member answers to — its id plus any back-compat aliases. */
export function memberNames(member) {
  return [member.id, ...(member.aliases ?? [])];
}

export const ALL_EVENTS = [
  ...CONTROL_EVENTS.map((e) => ({ ...e, group: 'control' })),
  ...PANEL_EVENTS.map((e) => ({ ...e, group: 'panel' })),
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

/** Group commands + helpers + lifecycle by their `category`, for the picker's "Commands" side. */
export function membersByCategory() {
  const order = ['Lifecycle', 'Values', 'Transmit', 'Events & Flow', 'Device / MIDI', 'Panel components', 'Debug', 'Value / range', 'Music', 'MIDI encoding'];
  const map = new Map(order.map((c) => [c, []]));
  for (const m of ALL_MEMBERS) {
    if (!map.has(m.category)) map.set(m.category, []);
    map.get(m.category).push(m);
  }
  return [...map.entries()].filter(([, items]) => items.length).map(([category, items]) => ({ category, items }));
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
