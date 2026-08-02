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

/* -------------------------------------------------------------- availability */
// Where a member actually runs TODAY. Absent = available everywhere (editor preview and the
// exported plugin). Shape: { preview, export, note } — preview = the editor's live preview
// (JS runtime), export = the exported standalone/VST3. Keep in sync with
// docs/scripting-runtime-gaps.md as gaps close.

const EXPORT_ONLY_PENDING_PREVIEW = {
  preview: false, export: true,
  note: 'Wired in the exported plugin; editor-preview dispatch is pending.',
};
const NOT_WIRED_YET = {
  preview: false, export: false,
  note: 'Planned — not dispatched anywhere yet.',
};
const FLOW_NOT_WIRED = {
  preview: false, export: false,
  note: 'Designed (spec Q6) but not wired yet — stubbed in the preview and a no-op in the exported host.',
};
const TIMERS_EXPORT_ONLY = {
  preview: false, export: true,
  note: 'Runs in the exported plugin (TimerManager); editor-preview timers are pending.',
};
const PANEL_UI_RUNTIME = {
  preview: true, export: true,
  note: 'Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.',
};

export const SELF = {
  id: 'self',
  label: 'self',
  summary: 'The element this script is attached to (control, panel, or custom-component instance). Use instead of a fixed name so one script works on every copy of a reusable component.',
  scopes: ['component', 'panel'],
};

/* --------------------------------------------------------------- value access */
// A control value has three representations (Q8). The DPD converts between them.
// Addressed as a suffix on a control path: "cutoff.value", "cutoff.normalizedValue", …

export const VALUE_ACCESSORS = [
  { id: 'value', label: '.value', summary: 'The real, human value — e.g. 8000 (Hz) or "LP" (enum name). The default. Setting it lets the DPD convert to MIDI on send.' },
  { id: 'normalizedValue', label: '.normalizedValue', summary: 'The 0–1 position. For uniform math, curves, and linking controls of different ranges.' },
  { id: 'midiValue', label: '.midiValue', summary: 'The value as MIDI (e.g. 101). Only for device-bound controls; empty for decorative ones. For hand-built MIDI.' },
];

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
  {
    id: 'onDawSaveState', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onDawSaveState(store)',
    summary: 'The DAW is saving the project — write values into `store`.',
    availability: { preview: false, export: true, note: 'Fires only when a DAW hosts the exported plugin.' },
    params: [{ name: 'store', type: 'object' }],
    snippet: { lua: 'function onDawSaveState(store)\n  $0\nend', javascript: 'function onDawSaveState(store) {\n  $0\n}' },
  },
  {
    id: 'onDawRestoreState', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onDawRestoreState(store)',
    summary: 'The DAW reopened the project — read values back from `store`.',
    availability: { preview: false, export: true, note: 'Fires only when a DAW hosts the exported plugin.' },
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
  { id: 'click', fn: 'onClick', payload: 'mouse', fields: ['x', 'y', 'button', 'modifiers'], summary: 'Clicked (fires on release).' },
  { id: 'doubleClick', fn: 'onDoubleClick', payload: 'mouse', fields: ['x', 'y', 'button', 'modifiers'], summary: 'Double-clicked.' },
  { id: 'pointerDown', fn: 'onPointerDown', payload: 'mouse', fields: ['x', 'y', 'button', 'modifiers'], summary: 'Mouse pressed.' },
  { id: 'pointerMove', fn: 'onPointerMove', payload: 'mouse', fields: ['x', 'y', 'button', 'modifiers'], summary: 'Mouse moved while down.' },
  { id: 'pointerUp', fn: 'onPointerUp', payload: 'mouse', fields: ['x', 'y', 'button', 'modifiers'], summary: 'Mouse released.' },
  { id: 'hoverStart', fn: 'onHoverStart', payload: null, summary: 'Mouse entered the control.' },
  { id: 'hoverEnd', fn: 'onHoverEnd', payload: null, summary: 'Mouse left the control.' },
  { id: 'wheel', fn: 'onWheel', payload: 'wheel', fields: ['delta', 'deltaX', 'deltaY', 'x', 'y'], summary: 'Scrolled over the control. delta = +1 up / −1 down; deltaX/deltaY are the raw values.' },
  { id: 'stateChanged', fn: 'onStateChanged', payload: 'state', summary: 'State swapped (hover/pressed/disabled).', availability: NOT_WIRED_YET },
];

export const PANEL_EVENTS = [
  { id: 'controlChanged', fn: 'onControlChanged', payload: 'info', fields: ['target', 'value'], summary: 'Any control changed.', availability: NOT_WIRED_YET },
  { id: 'panelStateChanged', fn: 'onPanelStateChanged', payload: 'state', summary: 'Panel state switched.', availability: NOT_WIRED_YET },
  { id: 'timer', fn: 'onTimer', payload: 'info', fields: ['id'], summary: 'A started timer fired.', availability: TIMERS_EXPORT_ONLY },
];

export const DEVICE_EVENTS = [
  // decoded (the DPD payoff — 90% of use)
  { id: 'parameterReceived', fn: 'onParameterReceived', payload: 'info', fields: ['parameter', 'value'], decoded: true, summary: 'A value arrived, decoded via the DPD.', availability: EXPORT_ONLY_PENDING_PREVIEW },
  { id: 'dumpReceived', fn: 'onDumpReceived', payload: 'dump', fields: ['bytes', 'kind'], decoded: true, summary: 'A bulk dump arrived. Use applyDump(dump.bytes) to fill the panel.' },
  // raw (escape hatch)
  { id: 'midiIn', fn: 'onMidiIn', payload: 'midi', fields: ['bytes', 'channel', 'status'], decoded: false, summary: 'Any MIDI arrived (raw).', availability: EXPORT_ONLY_PENDING_PREVIEW },
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', fields: ['channel', 'cc', 'value'], decoded: false, summary: 'A CC arrived.', availability: EXPORT_ONLY_PENDING_PREVIEW },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'Raw SysEx arrived.', availability: EXPORT_ONLY_PENDING_PREVIEW },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A device connected.', availability: NOT_WIRED_YET },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A device disconnected.', availability: NOT_WIRED_YET },
];

export const EVENTS = { control: CONTROL_EVENTS, panel: PANEL_EVENTS, device: DEVICE_EVENTS };

/* ------------------------------------------------------------------ commands */
// The action verbs (Q1, Q2, Q6, Q9). Picker category "Commands". param.type drives validation.

export const COMMANDS = [
  /* --- Values (Q1) --- */
  {
    id: 'set', category: 'Values', signature: 'set(path, value [, opts])',
    summary: 'Write a value at a path. Transmits to the synth by default (Q2); silence is auto-inferred when reacting to inbound MIDI.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'value', type: 'value', required: true },
      { name: 'opts', type: 'object', required: false, fields: ['transmit'] },
    ],
    scopes: 'any',
    snippet: { lua: 'set("${1:path}", ${2:value})$0', javascript: 'set("${1:path}", ${2:value})$0' },
  },
  {
    id: 'get', category: 'Values', signature: 'get(path)',
    summary: 'Read a value at a path. Suffix with .value (default), .normalizedValue, or .midiValue.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
    snippet: { lua: 'get("${1:path}")$0', javascript: 'get("${1:path}")$0' },
  },

  /* --- Transmit control (Q2, Family A) --- */
  {
    id: 'noTransmit', category: 'Transmit', signature: 'noTransmit(fn)',
    summary: 'Run a block writing to the panel WITHOUT sending to the synth (e.g. an Init-Patch button). Auto-resets at block end.',
    availability: { preview: true, export: true, note: 'The block always runs; transmit gating is enforced by the exported (C++) runtime — the editor preview does not gate.' },
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'noTransmit(function()\n  $0\nend)', javascript: 'noTransmit(() => {\n  $0\n})' },
  },
  {
    id: 'transmit', category: 'Transmit', signature: 'transmit(fn)',
    summary: 'Force a block to send to the synth, even inside an inbound handler.',
    availability: { preview: true, export: true, note: 'The block always runs; transmit gating is enforced by the exported (C++) runtime — the editor preview does not gate.' },
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'transmit(function()\n  $0\nend)', javascript: 'transmit(() => {\n  $0\n})' },
  },

  /* --- Events & Flow (Q3, Q6) --- */
  {
    id: 'on', category: 'Events & Flow', signature: 'on(target, event, fn)',
    summary: 'React to an event on another control / the panel / the device, or to a custom emitted event.',
    availability: FLOW_NOT_WIRED,
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
    id: 'emit', category: 'Events & Flow', signature: 'emit(name [, data])',
    summary: 'Announce a custom event; any script listening with on(name, …) reacts. Fire-and-forget, language-neutral.',
    availability: FLOW_NOT_WIRED,
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'data', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'emit("${1:name}", ${2:data})$0', javascript: 'emit("${1:name}", ${2:data})$0' },
  },
  {
    id: 'run', category: 'Events & Flow', signature: 'run(target.action [, args])',
    summary: 'Run a named action elsewhere ("target.action" = the owning control/panel, then the action name). Host-dispatched — works cross-language. Supports a return value. Only simple data crosses the boundary.',
    availability: FLOW_NOT_WIRED,
    params: [
      { name: 'action', type: 'scriptRef', required: true },
      { name: 'args', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'run("${1:target.action}")$0', javascript: 'run("${1:target.action}")$0' },
  },

  /* --- Device / MIDI: bulk (Q9) --- */
  {
    id: 'requestDump', category: 'Device / MIDI', signature: 'requestDump(kind)',
    summary: 'Ask the synth to send a dump. kind ("patch"/"tone"/"global"…) is defined by the DPD.',
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: ['device', 'panel', 'project'],
    snippet: { lua: 'requestDump("${1:patch}")$0', javascript: 'requestDump("${1:patch}")$0' },
  },
  {
    id: 'applyDump', category: 'Device / MIDI', signature: 'applyDump(bytes)',
    summary: 'Fill the whole panel from a received dump (walks the DPD map). Silent automatically — inbound context.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: ['device', 'panel', 'project'],
    snippet: { lua: 'applyDump(${1:bytes})$0', javascript: 'applyDump(${1:bytes})$0' },
  },
  {
    id: 'sendDump', category: 'Device / MIDI', signature: 'sendDump(kind)',
    summary: 'Build a dump from the panel values and send it to the synth.',
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: ['device', 'panel', 'project'],
    snippet: { lua: 'sendDump("${1:patch}")$0', javascript: 'sendDump("${1:patch}")$0' },
  },
  {
    id: 'buildDump', category: 'Device / MIDI', signature: 'buildDump(kind)',
    summary: 'Build the dump bytes from the panel values without sending.',
    availability: { preview: false, export: false, note: 'Planned — the panel→bytes codec is not yet exposed to scripts in either runtime; use sendDump to transmit.' },
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: ['device', 'panel', 'project'],
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
    scopes: ['device', 'panel'],
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
    scopes: ['device', 'panel'],
    snippet: { lua: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0', javascript: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0' },
  },
  {
    id: 'sendSysex', category: 'Device / MIDI', signature: 'sendSysex(bytes)',
    summary: 'Send a raw SysEx message (device-scope, power use).',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: ['device'],
    snippet: { lua: 'sendSysex(${1:bytes})$0', javascript: 'sendSysex(${1:bytes})$0' },
  },
  {
    id: 'checksum', category: 'Device / MIDI', signature: 'checksum(type, bytes)',
    summary: 'Compute a device checksum (e.g. "roland", "yamaha").',
    params: [
      { name: 'type', type: 'string', required: true },
      { name: 'bytes', type: 'bytes', required: true },
    ],
    scopes: ['device'],
    snippet: { lua: 'checksum("${1:roland}", ${2:bytes})$0', javascript: 'checksum("${1:roland}", ${2:bytes})$0' },
  },

  /* --- Timers (see docs/timer-system.md) --- */
  {
    id: 'startTimer', category: 'Timers', signature: 'startTimer(id, ms)',
    summary: 'Start (or restart) a named repeating timer; onTimer fires with info.id every ms until stopTimer(id).',
    availability: TIMERS_EXPORT_ONLY,
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'ms', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'startTimer("${1:id}", ${2:ms})$0', javascript: 'startTimer("${1:id}", ${2:ms})$0' },
  },
  {
    id: 'stopTimer', category: 'Timers', signature: 'stopTimer(id)',
    summary: 'Stop a named timer started with startTimer(id, ms).',
    availability: TIMERS_EXPORT_ONLY,
    params: [{ name: 'id', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'stopTimer("${1:id}")$0', javascript: 'stopTimer("${1:id}")$0' },
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

  /* --- Component commands ---
     Musical components expose their moves as commands so a footswitch or script can drive them
     without hand-editing config trees. Backed by the pure reducers in utils/*Layout.js
     (…ScriptPatch), run by the shared JS panel runtime (editor preview + exported player).
     `target` is the component's control name. Full stories: the component docs
     (zone-splitter.md, phrase-sequencer.md, phrase-recorder.md, harmoniser.md, setlist.md). */

  /* Zone Splitter */
  {
    id: 'splitPreset', category: 'Zone Splitter', signature: 'splitPreset(target, preset [, lowNote, highNote])',
    summary: 'Swap the whole split arrangement to a named preset (e.g. "threeWay"); optional boundary notes.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'preset', type: 'string', required: true },
      { name: 'lowNote', type: 'number', required: false },
      { name: 'highNote', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'splitPreset("${1:target}", "${2:preset}")$0', javascript: 'splitPreset("${1:target}", "${2:preset}")$0' },
  },
  {
    id: 'splitMute', category: 'Zone Splitter', signature: 'splitMute(target, zone [, enabled])',
    summary: 'Mute a zone (pass false to unmute). Zone by name or index.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'zone', type: 'value', required: true },
      { name: 'enabled', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'splitMute("${1:target}", "${2:zone}")$0', javascript: 'splitMute("${1:target}", "${2:zone}")$0' },
  },
  {
    id: 'splitChannel', category: 'Zone Splitter', signature: 'splitChannel(target, zone, channel)',
    summary: 'Route a zone to a MIDI channel.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'zone', type: 'value', required: true },
      { name: 'channel', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'splitChannel("${1:target}", "${2:zone}", ${3:channel})$0', javascript: 'splitChannel("${1:target}", "${2:zone}", ${3:channel})$0' },
  },
  {
    id: 'splitTranspose', category: 'Zone Splitter', signature: 'splitTranspose(target, zone, semitones)',
    summary: 'Transpose a zone in semitones.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'zone', type: 'value', required: true },
      { name: 'semitones', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'splitTranspose("${1:target}", "${2:zone}", ${3:semitones})$0', javascript: 'splitTranspose("${1:target}", "${2:zone}", ${3:semitones})$0' },
  },
  {
    id: 'splitPoint', category: 'Zone Splitter', signature: 'splitPoint(target, zone, note)',
    summary: 'Move a zone boundary to a MIDI note.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'zone', type: 'value', required: true },
      { name: 'note', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'splitPoint("${1:target}", "${2:zone}", ${3:note})$0', javascript: 'splitPoint("${1:target}", "${2:zone}", ${3:note})$0' },
  },

  /* Phrase Sequencer */
  {
    id: 'phraseSeed', category: 'Phrase Sequencer', signature: 'phraseSeed(target, seed)',
    summary: 'Swap the pattern to a named seed (e.g. "arpUp"). An unknown seed is a no-op.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'seed', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseSeed("${1:target}", "${2:seed}")$0', javascript: 'phraseSeed("${1:target}", "${2:seed}")$0' },
  },
  {
    id: 'phraseClear', category: 'Phrase Sequencer', signature: 'phraseClear(target)',
    summary: 'Clear the pattern grid.',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'phraseClear("${1:target}")$0', javascript: 'phraseClear("${1:target}")$0' },
  },
  {
    id: 'phraseKey', category: 'Phrase Sequencer', signature: 'phraseKey(target, key)',
    summary: 'Move the phrase to a new key (0 = C … 11 = B) — the pattern itself is untouched.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'key', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseKey("${1:target}", ${2:key})$0', javascript: 'phraseKey("${1:target}", ${2:key})$0' },
  },
  {
    id: 'phraseScale', category: 'Phrase Sequencer', signature: 'phraseScale(target, scale)',
    summary: 'Re-harmonise to a named scale (e.g. "dorian").',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'scale', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseScale("${1:target}", "${2:scale}")$0', javascript: 'phraseScale("${1:target}", "${2:scale}")$0' },
  },
  {
    id: 'phraseTranspose', category: 'Phrase Sequencer', signature: 'phraseTranspose(target, semitones)',
    summary: 'Transpose playback in semitones.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'semitones', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseTranspose("${1:target}", ${2:semitones})$0', javascript: 'phraseTranspose("${1:target}", ${2:semitones})$0' },
  },
  {
    id: 'phraseDirection', category: 'Phrase Sequencer', signature: 'phraseDirection(target, direction)',
    summary: 'Set playback direction: "forward", "reverse", "pingpong", or "random".',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'direction', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseDirection("${1:target}", "${2:forward}")$0', javascript: 'phraseDirection("${1:target}", "${2:forward}")$0' },
  },
  {
    id: 'phraseRun', category: 'Phrase Sequencer', signature: 'phraseRun(target [, running])',
    summary: 'Start the sequencer (false stops it).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'running', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseRun("${1:target}", ${2:true})$0', javascript: 'phraseRun("${1:target}", ${2:true})$0' },
  },
  {
    id: 'phraseCell', category: 'Phrase Sequencer', signature: 'phraseCell(target, step, row, on)',
    summary: 'Turn one grid cell on/off (step column, scale-degree row). Out-of-grid cells are a no-op.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'step', type: 'number', required: true },
      { name: 'row', type: 'number', required: true },
      { name: 'on', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'phraseCell("${1:target}", ${2:step}, ${3:row}, ${4:true})$0', javascript: 'phraseCell("${1:target}", ${2:step}, ${3:row}, ${4:true})$0' },
  },

  /* Phrase Recorder */
  {
    id: 'recorderRecord', category: 'Phrase Recorder', signature: 'recorderRecord(target [, on])',
    summary: 'Arm/stop recording. No argument toggles (what a footswitch wants); true/false is idempotent (safe for a MIDI-mapped switch that fires twice).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'on', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderRecord("${1:target}")$0', javascript: 'recorderRecord("${1:target}")$0' },
  },
  {
    id: 'recorderStop', category: 'Phrase Recorder', signature: 'recorderStop(target)',
    summary: 'Stop recording/arming (back to idle).',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'recorderStop("${1:target}")$0', javascript: 'recorderStop("${1:target}")$0' },
  },
  {
    id: 'recorderPlay', category: 'Phrase Recorder', signature: 'recorderPlay(target [, playing])',
    summary: 'Toggle loop playback; false mutes the loop without losing it.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'playing', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderPlay("${1:target}", ${2:true})$0', javascript: 'recorderPlay("${1:target}", ${2:true})$0' },
  },
  {
    id: 'recorderClear', category: 'Phrase Recorder', signature: 'recorderClear(target)',
    summary: 'Throw the take away.',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'recorderClear("${1:target}")$0', javascript: 'recorderClear("${1:target}")$0' },
  },
  {
    id: 'recorderUndo', category: 'Phrase Recorder', signature: 'recorderUndo(target)',
    summary: 'Drop the last overdub pass.',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'recorderUndo("${1:target}")$0', javascript: 'recorderUndo("${1:target}")$0' },
  },
  {
    id: 'recorderQuantize', category: 'Phrase Recorder', signature: 'recorderQuantize(target, grid [, strength, scale, key])',
    summary: 'Quantize the take to a grid (1–64), by strength 0–1; give scale + key to also pull notes into key.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'grid', type: 'number', required: true },
      { name: 'strength', type: 'number', required: false },
      { name: 'scale', type: 'string', required: false },
      { name: 'key', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderQuantize("${1:target}", ${2:16}, ${3:1})$0', javascript: 'recorderQuantize("${1:target}", ${2:16}, ${3:1})$0' },
  },
  {
    id: 'recorderTranspose', category: 'Phrase Recorder', signature: 'recorderTranspose(target, semitones)',
    summary: 'Transpose playback only (−48…+48) — the recorded take is untouched. To rewrite the take, use recorderShift.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'semitones', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderTranspose("${1:target}", ${2:semitones})$0', javascript: 'recorderTranspose("${1:target}", ${2:semitones})$0' },
  },
  {
    id: 'recorderBars', category: 'Phrase Recorder', signature: 'recorderBars(target, bars)',
    summary: 'Set the loop length in bars.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'bars', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderBars("${1:target}", ${2:bars})$0', javascript: 'recorderBars("${1:target}", ${2:bars})$0' },
  },
  {
    id: 'recorderSource', category: 'Phrase Recorder', signature: 'recorderSource(target, source)',
    summary: 'What gets recorded: "input", "panel", or "both".',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'source', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderSource("${1:target}", "${2:panel}")$0', javascript: 'recorderSource("${1:target}", "${2:panel}")$0' },
  },
  {
    id: 'recorderNudge', category: 'Phrase Recorder', signature: 'recorderNudge(target, by)',
    summary: 'Shift the whole take in time by a fraction of the loop — the fix for a consistently-late take.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'by', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderNudge("${1:target}", ${2:by})$0', javascript: 'recorderNudge("${1:target}", ${2:by})$0' },
  },
  {
    id: 'recorderShift', category: 'Phrase Recorder', signature: 'recorderShift(target, semitones)',
    summary: 'Rewrite the recorded take, transposed — unlike recorderTranspose, this changes the notes themselves.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'semitones', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderShift("${1:target}", ${2:semitones})$0', javascript: 'recorderShift("${1:target}", ${2:semitones})$0' },
  },
  {
    id: 'recorderStore', category: 'Phrase Recorder', signature: 'recorderStore(target, slot [, name])',
    summary: 'Save the take into a slot (1-based), optionally named.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'slot', type: 'number', required: true },
      { name: 'name', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderStore("${1:target}", ${2:slot})$0', javascript: 'recorderStore("${1:target}", ${2:slot})$0' },
  },
  {
    id: 'recorderLoad', category: 'Phrase Recorder', signature: 'recorderLoad(target, slot)',
    summary: 'Load a stored take from a slot (1-based).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'slot', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderLoad("${1:target}", ${2:slot})$0', javascript: 'recorderLoad("${1:target}", ${2:slot})$0' },
  },
  {
    id: 'recorderCountIn', category: 'Phrase Recorder', signature: 'recorderCountIn(target, bars)',
    summary: 'Set the count-in length (0–4 bars).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'bars', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'recorderCountIn("${1:target}", ${2:bars})$0', javascript: 'recorderCountIn("${1:target}", ${2:bars})$0' },
  },

  /* Harmoniser */
  {
    id: 'harmonyMode', category: 'Harmoniser', signature: 'harmonyMode(target, mode)',
    summary: '"diatonic" (build chords in key) or "memory" (replay captured shapes).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'mode', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyMode("${1:target}", "${2:diatonic}")$0', javascript: 'harmonyMode("${1:target}", "${2:diatonic}")$0' },
  },
  {
    id: 'harmonyKey', category: 'Harmoniser', signature: 'harmonyKey(target, key)',
    summary: 'Re-key it mid-song (0 = C … 11 = B; wraps around).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'key', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyKey("${1:target}", ${2:key})$0', javascript: 'harmonyKey("${1:target}", ${2:key})$0' },
  },
  {
    id: 'harmonyScale', category: 'Harmoniser', signature: 'harmonyScale(target, scale)',
    summary: 'Set the scale (e.g. "major", "minor", "dorian").',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'scale', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyScale("${1:target}", "${2:scale}")$0', javascript: 'harmonyScale("${1:target}", "${2:scale}")$0' },
  },
  {
    id: 'harmonySize', category: 'Harmoniser', signature: 'harmonySize(target, size)',
    summary: 'Chord size — 2 to 6 voices.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'size', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonySize("${1:target}", ${2:size})$0', javascript: 'harmonySize("${1:target}", ${2:size})$0' },
  },
  {
    id: 'harmonyShape', category: 'Harmoniser', signature: 'harmonyShape(target, shape)',
    summary: 'A preset name or an explicit interval list. An unknown preset is a no-op, never a silent default.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'shape', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyShape("${1:target}", {0, 4, 7})$0', javascript: 'harmonyShape("${1:target}", [0, 4, 7])$0' },
  },
  {
    id: 'harmonyVoicing', category: 'Harmoniser', signature: 'harmonyVoicing(target, voicing)',
    summary: '"close", "open", or "drop2".',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'voicing', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyVoicing("${1:target}", "${2:close}")$0', javascript: 'harmonyVoicing("${1:target}", "${2:close}")$0' },
  },
  {
    id: 'harmonyInversion', category: 'Harmoniser', signature: 'harmonyInversion(target, inversion)',
    summary: 'Chord inversion.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'inversion', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyInversion("${1:target}", ${2:inversion})$0', javascript: 'harmonyInversion("${1:target}", ${2:inversion})$0' },
  },
  {
    id: 'harmonyOctave', category: 'Harmoniser', signature: 'harmonyOctave(target, octave)',
    summary: 'Octave offset for the generated chord.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'octave', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyOctave("${1:target}", ${2:octave})$0', javascript: 'harmonyOctave("${1:target}", ${2:octave})$0' },
  },
  {
    id: 'harmonyOutOfKey', category: 'Harmoniser', signature: 'harmonyOutOfKey(target, mode)',
    summary: 'Notes outside the key: "pass", "nearest", or "mute".',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'mode', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyOutOfKey("${1:target}", "${2:nearest}")$0', javascript: 'harmonyOutOfKey("${1:target}", "${2:nearest}")$0' },
  },
  {
    id: 'harmonyKeepPlayed', category: 'Harmoniser', signature: 'harmonyKeepPlayed(target [, keep])',
    summary: 'Keep the played note in the chord (toggles without an argument).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'keep', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyKeepPlayed("${1:target}", ${2:true})$0', javascript: 'harmonyKeepPlayed("${1:target}", ${2:true})$0' },
  },
  {
    id: 'harmonyChannel', category: 'Harmoniser', signature: 'harmonyChannel(target, channel)',
    summary: 'MIDI channel for the generated notes.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'channel', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyChannel("${1:target}", ${2:channel})$0', javascript: 'harmonyChannel("${1:target}", ${2:channel})$0' },
  },
  {
    id: 'harmonyVoiceLeading', category: 'Harmoniser', signature: 'harmonyVoiceLeading(target, mode)',
    summary: 'How consecutive chords connect: "off", "closest", or "smooth".',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'mode', type: 'string', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyVoiceLeading("${1:target}", "${2:smooth}")$0', javascript: 'harmonyVoiceLeading("${1:target}", "${2:smooth}")$0' },
  },
  {
    id: 'harmonyStrum', category: 'Harmoniser', signature: 'harmonyStrum(target, ms)',
    summary: 'Strum spread in milliseconds (0–400).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'ms', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyStrum("${1:target}", ${2:ms})$0', javascript: 'harmonyStrum("${1:target}", ${2:ms})$0' },
  },
  {
    id: 'harmonyDegree', category: 'Harmoniser', signature: 'harmonyDegree(target, degree, chord)',
    summary: "Override one scale degree's chord with an interval list; nil/null restores stacked thirds.",
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'degree', type: 'number', required: true },
      { name: 'chord', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'harmonyDegree("${1:target}", ${2:degree}, {0, 5, 7})$0', javascript: 'harmonyDegree("${1:target}", ${2:degree}, [0, 5, 7])$0' },
  },

  /* Setlist */
  {
    id: 'setlistNext', category: 'Setlist', signature: 'setlistNext(target)',
    summary: 'Step to the next enabled scene — same event downstream as a footswitch step.',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'setlistNext("${1:target}")$0', javascript: 'setlistNext("${1:target}")$0' },
  },
  {
    id: 'setlistPrev', category: 'Setlist', signature: 'setlistPrev(target)',
    summary: 'Step back to the previous enabled scene.',
    params: [{ name: 'target', type: 'targetRef', required: true }],
    scopes: 'any',
    snippet: { lua: 'setlistPrev("${1:target}")$0', javascript: 'setlistPrev("${1:target}")$0' },
  },
  {
    id: 'setlistGoto', category: 'Setlist', signature: 'setlistGoto(target, scene)',
    summary: 'Jump to a scene — 1-based index or scene name (a name survives a reorder).',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'scene', type: 'value', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'setlistGoto("${1:target}", ${2:scene})$0', javascript: 'setlistGoto("${1:target}", ${2:scene})$0' },
  },
  {
    id: 'setlistEnable', category: 'Setlist', signature: 'setlistEnable(target, scene [, enabled])',
    summary: 'Include a scene, or skip it with false ("skip one tonight").',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'scene', type: 'value', required: true },
      { name: 'enabled', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'setlistEnable("${1:target}", ${2:scene}, ${3:false})$0', javascript: 'setlistEnable("${1:target}", ${2:scene}, ${3:false})$0' },
  },
  {
    id: 'setlistWrap', category: 'Setlist', signature: 'setlistWrap(target [, wrap])',
    summary: 'Wrap from the last scene back to the first.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'wrap', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'setlistWrap("${1:target}", ${2:true})$0', javascript: 'setlistWrap("${1:target}", ${2:true})$0' },
  },
  {
    id: 'setlistCrossfade', category: 'Setlist', signature: 'setlistCrossfade(target, ms)',
    summary: 'Crossfade time between scenes, in milliseconds.',
    params: [
      { name: 'target', type: 'targetRef', required: true },
      { name: 'ms', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'setlistCrossfade("${1:target}", ${2:ms})$0', javascript: 'setlistCrossfade("${1:target}", ${2:ms})$0' },
  },
];

// The component commands run in the shared JS panel runtime, everywhere it runs — tag the whole
// block rather than repeating the note 47 times.
const COMPONENT_CATEGORIES = new Set(['Zone Splitter', 'Phrase Sequencer', 'Phrase Recorder', 'Harmoniser', 'Setlist']);
for (const c of COMMANDS) {
  if (COMPONENT_CATEGORIES.has(c.category) && !c.availability) c.availability = PANEL_UI_RUNTIME;
}

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
  { id: 'noteName', category: 'Music', signature: 'noteName(n)', summary: 'MIDI note number → name, e.g. 60 → "C4" (middle C = C4).' },
  { id: 'noteNumber', category: 'Music', signature: 'noteNumber(name)', summary: 'Note name → MIDI number, e.g. "C4" → 60.' },
  // MIDI data encoding (escape hatch — the DPD does this for modeled params)
  { id: 'to7bit', category: 'MIDI encoding', signature: 'to7bit(v, count, order)', summary: 'Pack v into `count` 7-bit bytes; order = "msb"/"lsb" first (14/21/28-bit).' },
  { id: 'from7bit', category: 'MIDI encoding', signature: 'from7bit(bytes, order)', summary: 'Unpack 7-bit bytes back to a value.' },
  { id: 'to14bit', category: 'MIDI encoding', signature: 'to14bit(v)', summary: 'Shorthand: value → { msb, lsb }.' },
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
  ...HELPERS.map((m) => ({ ...m, kind: 'helper' })),
];

export const MEMBER_BY_ID = Object.fromEntries(ALL_MEMBERS.map((m) => [m.id, m]));

export const ALL_EVENTS = [
  ...CONTROL_EVENTS.map((e) => ({ ...e, group: 'control' })),
  ...PANEL_EVENTS.map((e) => ({ ...e, group: 'panel' })),
  ...DEVICE_EVENTS.map((e) => ({ ...e, group: 'device' })),
];

export const EVENT_BY_ID = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

/** Group commands + helpers + lifecycle by their `category`, for the picker's "Commands" side. */
export function membersByCategory() {
  const order = [
    'Lifecycle', 'Values', 'Transmit', 'Events & Flow', 'Device / MIDI', 'Timers', 'Debug',
    'Zone Splitter', 'Phrase Sequencer', 'Phrase Recorder', 'Harmoniser', 'Setlist',
    'Value / range', 'Music', 'MIDI encoding',
  ];
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

/** The snippet to insert for a member in a given language; falls back to the signature.
 *  TypeScript call syntax is identical to JavaScript, so it shares the JS snippet. */
export function insertSnippet(member, languageId) {
  const id = languageId === 'typescript' ? 'javascript' : languageId;
  return member?.snippet?.[id] ?? member?.snippet?.[languageId] ?? member?.signature ?? member?.id ?? '';
}
