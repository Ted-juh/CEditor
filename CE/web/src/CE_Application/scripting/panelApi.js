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
    live: false, // Tier 2 — WebView only (editor preview + open plugin window); not in the C++ runtime
    block: 'def ${e}:\n  $0',
    method: '.',
    comment: '#',
  },
  {
    id: 'cpp',
    label: 'C++',
    version: '17',
    host: 'CeScript interpreter (preview) · clang at export',
    live: true,    // runs live via the interpreted handler subset (cppPreview.js)
    subset: true,  // …a subset — the full source is compiled into the export
    block: '[](CeContext& ctx, const CeEvent& event) {\n  $0\n}',
    method: '.',
    comment: '//',
  },
  {
    id: 'csharp',
    label: 'C#',
    version: '12',
    host: 'CeScript interpreter (preview) · .NET at export',
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
    host: 'CeScript interpreter (preview) · javac at export',
    live: true,
    subset: true,
    block: '(${e}) -> {\n  $0\n}',
    method: '.',
    comment: '//',
  },
];

// Tier-1 = always available everywhere (incl. the C++ window-closed runtime). Python is Tier-2
// (WebView only). RUNNABLE_LANGUAGES is every language the WebView runtime can execute (C++ via
// the interpreted preview subset).
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
    params: [{ name: 'store', type: 'object' }],
    snippet: { lua: 'function onDawSaveState(store)\n  $0\nend', javascript: 'function onDawSaveState(store) {\n  $0\n}' },
  },
  {
    id: 'onDawRestoreState', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onDawRestoreState(store)',
    summary: 'The DAW reopened the project — read values back from `store`.',
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

export const PANEL_EVENTS = [
  { id: 'controlChanged', fn: 'onControlChanged', payload: 'info', summary: 'Any control changed. info.target, info.value.' },
  { id: 'panelStateChanged', fn: 'onPanelStateChanged', payload: 'state', summary: 'Panel state switched.' },
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
  const order = ['Lifecycle', 'Values', 'Transmit', 'Events & Flow', 'Device / MIDI', 'Debug', 'Value / range', 'Music', 'MIDI encoding'];
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
