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
import { HAND_WRITTEN_VALUES } from './componentTables.js';
// The legal values an option accepts come from the table its own implementation reads, for the
// reason the component enums do: a documented list somebody retyped is a list that drifts. These
// two supply the image-layer and typography vocabularies.
import {
  BACKGROUND_FITS, BACKGROUND_ALIGNS, TEXT_FITS, IMAGE_BLENDS, IMAGE_CLIP_MODES, IMAGE_LAYER_IDS,
} from '../utils/imageLayers.js';
import { FEATURE_KEYS, CASE_MODES, SCRIPT_MODES, JUSTIFICATIONS } from './textStyle.js';

/** `"a", "b" or "c"` from a table, for a summary that names the values a verb accepts.
 *
 *  Interpolated rather than typed out, for the reason componentTables.js exists: five of these
 *  summaries named values the reducer REFUSES. harmonyOutOfKey was documented as "skip"/"nearest"/
 *  "pass" where the engine has pass/nearest/mute, so a script author following the contract wrote
 *  "skip" and got nothing — the documentation was the bug. */
const oneOf = (values) => values.map((x) => `"${x}"`).join(', ');

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
  summary: 'The element this script is attached to: the control for a component script, the panel for a panel script. Use instead of a fixed name so one script works on every copy of a reusable component.',
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
  { id: 'midiValue', label: '.midiValue', requiresDeviceHost: true, summary: 'The value as MIDI (e.g. 101), as the DPD would encode it. Device-bound controls only, and requires the device host attached.' },
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

/* -------------------------------------------------------------- option fields */
// A `params` entry whose type is 'object' used to declare its contents as bare names:
//
//     { name: 'opts', type: 'object', fields: ['duration', 'beats', 'sync', 'curve', …] }
//
// That says what an option is CALLED and nothing else. Not what it holds, not what happens when
// you leave it out, not which of the eight spellings of `curve` are real ones. The detail existed,
// but only as prose inside `summary` — ce.anim.to's ran to 955 characters, and a reader looking for
// the default duration had to find it mid-sentence. Customers said so: "many opts to fill in, but
// it is not clear what those opts are, or what the markup is to construct them."
//
// So a field is a DESCRIPTOR: what it holds, what it does if omitted, and the closed list of values
// it accepts where there is one. The reference page renders that as a table, and derives the
// literal you actually type from it, in each language.
//
// `optionFields` resolves a mix of shared names and inline descriptors. The nine timing options the
// three animation verbs share are therefore written once and cannot drift apart, while a field that
// only looks shared — `fit` means one thing on a background layer and another on text — stays
// inline where it can say so.

/**
 * Resolve an option-field list into full descriptors.
 *
 * Entries may be a shared field's name, an inline `{ name, type, … }`, or `{ like: 'duration', … }`
 * to take a shared one and override part of it. An unknown name throws at load: a field list is
 * documentation, and documentation naming something that does not exist is worse than none.
 */
function optionFields(entries) {
  return entries.map((entry) => {
    const shared = typeof entry === 'string' ? entry : entry.like;
    if (!shared) return entry;
    const base = SHARED_OPTION_FIELDS[shared];
    if (!base) throw new Error(`panelApi: no shared option field called "${shared}"`);
    if (typeof entry === 'string') return base;
    const { like, ...override } = entry;
    return { ...base, ...override };
  });
}

/** The option fields more than one member declares, defined once. */
const SHARED_OPTION_FIELDS = {
  /* --- persistence ------------------------------------------------------- */
  scope: {
    name: 'scope', type: 'text', default: '"panel"', values: ['panel', 'script', 'local'],
    summary: 'Which store to use. "panel" is shared by every script on the panel and travels with '
      + 'it; "script" is private to this one; "local" stays on this machine and is never written '
      + 'into the panel document.',
  },

  /* --- animation timing (ce.anim.to / .spring / .envelope) ---------------- */
  duration: {
    name: 'duration', type: 'number', default: '300', unit: 'milliseconds',
    summary: 'How long the move takes.',
  },
  beats: {
    name: 'beats', type: 'number', sample: '2',
    summary: 'Length in beats instead of milliseconds. Overrides `duration` and follows the tempo.',
  },
  sync: {
    name: 'sync', type: 'true or false', default: 'false',
    summary: 'Follow the transport rather than the wall clock, so the move pauses when playback '
      + 'does.',
  },
  delay: {
    name: 'delay', type: 'number', default: '0', unit: 'milliseconds',
    summary: 'Wait this long before starting.',
  },
  stagger: {
    name: 'stagger', type: 'number', default: '0', unit: 'milliseconds',
    summary: 'When `path` is a list, offset each move after the first by this much, so they start '
      + 'in turn.',
  },
  repeat: {
    name: 'repeat', type: 'number', default: '1',
    summary: 'How many times to run it. 0 or less repeats until you stop it.',
  },
  pingpong: {
    name: 'pingpong', type: 'true or false', default: 'false',
    summary: 'On a repeat, run the move backwards every other time instead of jumping back to the '
      + 'start.',
  },
  done: {
    name: 'done', type: 'function',
    summary: 'Called when the move ends: done(completed). `completed` is false if the move was '
      + 'stopped early.',
  },
  animFrom: {
    name: 'from', type: 'number', sample: '0',
    summary: 'Start from this value instead of wherever the control is now.',
  },

  /* --- dialogs and messages (ce.ui) -------------------------------------- */
  uiKind: {
    name: 'kind', type: 'text', default: '"info"', values: ['info', 'warn', 'error'],
    summary: 'Severity of the message. Sets the colour and the icon.',
  },
  uiTitle: { name: 'title', type: 'text', sample: '"Overwrite the patch?"', summary: 'The bold line at the top.' },
  uiMessage: { name: 'message', type: 'text', sample: '"This cannot be undone."', summary: 'The body text under the heading.' },
  uiAccept: {
    name: 'accept', type: 'text', default: '"OK"',
    summary: 'The label on the confirm button.',
  },
  uiCancel: {
    name: 'cancel', type: 'text', default: '"Cancel"',
    summary: 'The label on the cancel button.',
  },

  /* --- devices ------------------------------------------------------------ */
  role: {
    name: 'role', type: 'text', default: 'the panel\'s current device',
    sample: '"main"',
    summary: 'Which configured device to use, when the panel is set up for more than one.',
  },

  /* --- image layers (ce.image) -------------------------------------------- */
  tint: {
    name: 'tint', type: 'colour',
    summary: 'Tint colour, as "#RRGGBB". Omit to leave the image untinted.',
  },
  opacity: {
    name: 'opacity', type: 'number', default: '1', unit: '0 to 1',
    summary: 'Image opacity. 0 is invisible, 1 is fully opaque.',
  },
  imageRotation: {
    name: 'rotation', type: 'number', default: '0', unit: 'degrees',
    summary: 'Turn the image clockwise, with 0 upright.',
  },
};

/** What each OpenType switch on ce.text.style does, in words rather than in four-letter tags.
 *  Keyed by the app's own FEATURE_KEYS, and checked against them below so a feature cannot be
 *  added to the editor and left undescribed here. */
const TYPOGRAPHIC_FEATURES = {
  ligatures: 'Join pairs like "fi" and "fl" into the single shapes the font draws for them.',
  stylisticAlternates: 'Use the alternative letter shapes the designer drew, where there are any.',
  oldstyleFigures: 'Draw numerals that sit on the baseline at differing heights, the way lower-case '
    + 'letters do, so they read better inside a sentence.',
  tabularFigures: 'Give every digit the same width so columns of numbers line up — what you want '
    + 'for a readout that keeps changing.',
  fractions: 'Draw things like 1/2 as a proper stacked fraction.',
  slashedZero: 'Put a slash through zero so it cannot be mistaken for a capital O.',
};

{
  const undescribed = FEATURE_KEYS.filter((key) => !TYPOGRAPHIC_FEATURES[key]);
  if (undescribed.length) {
    throw new Error(`panelApi: typographic feature(s) with no description: ${undescribed.join(', ')}`);
  }
}

/* ------------------------------------------------------------- lifecycle hooks */
// Named entry points the host calls (Q5). `onDaw*` = host-triggered.

export const LIFECYCLE_HOOKS = [
  {
    id: 'onPanelLoad', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelLoad()',
    summary: 'Phase 1 — before the GUI exists. MIDI setup / init SysEx only. Do not touch controls; they do not exist yet.',
    params: [],
    snippet: { lua: 'function onPanelLoad()\n  $0\nend', javascript: 'function onPanelLoad() {\n  $0\n}' },
  },
  {
    id: 'onPanelBuild', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onPanelBuild()',
    summary: 'Phase 1b — build the panel: create, clone and parent controls. Runs after onPanelLoad and before onPanelReady, panel view only. Script-created controls are cleared before each run, so it always starts from the authored panel.',
    params: [],
    snippet: {
      lua: 'function onPanelBuild()\n  for i = 1, 4 do\n    ce.panel.create("Knob", { name = "osc" .. i, x = 20 + i * 90, y = 40 })\n  end\n  $0\nend',
      javascript: 'function onPanelBuild() {\n  for (let i = 1; i <= 4; i++) {\n    ce.panel.create("Knob", { name: "osc" + i, x: 20 + i * 90, y: 40 });\n  }\n  $0\n}',
    },
  },
  {
    id: 'onError', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onError(info)',
    summary: 'A script failed. `info` carries script, scriptId, event, phase ("load" | "dispatch") and message. Runs in every runtime, including window-closed; the error is always logged as well. An error raised inside onError is logged and not re-dispatched, so a broken reporter cannot loop.',
    params: [{ name: 'info', type: 'object', fields: optionFields([
      { name: 'script', type: 'text', summary: 'The name of the script that failed.' },
      { name: 'scriptId', type: 'text', summary: 'Its id, which stays the same when it is renamed.' },
      { name: 'event', type: 'text', summary: 'The handler that was running, such as "onValueChanged".' },
      { name: 'phase', type: 'text', values: ['load', 'dispatch'],
        summary: 'Whether it failed while being loaded or while handling an event.' },
      { name: 'message', type: 'text', summary: 'The error message.' },
    ]) }],
    snippet: {
      lua: 'function onError(info)\n  set("status.text", info.script .. ": " .. info.message)\n  $0\nend',
      javascript: 'function onError(info) {\n  set("status.text", `${info.script}: ${info.message}`);\n  $0\n}',
    },
  },
  {
    id: 'onDraw', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onDraw(info)',
    summary: 'Paint on top of the control this script is attached to. `info` carries target, width and height (the control\'s current size). Called on repaint, not every frame: to animate, drive it from onTimer and call ce.draw.redraw(). Panel view only.',
    params: [{ name: 'info', type: 'object', fields: optionFields([
      { name: 'target', type: 'text', summary: 'The name of the control being painted.' },
      { name: 'width', type: 'number', unit: 'pixels', summary: 'How wide the control is right now.' },
      { name: 'height', type: 'number', unit: 'pixels', summary: 'How tall it is right now.' },
    ]) }],
    snippet: {
      lua: 'function onDraw(info)\n  ce.draw.clear()\n  ce.draw.stroke("#5B9BD5", 2)\n  ce.draw.line(0, info.height / 2, info.width, info.height / 2)\n  $0\nend',
      javascript: 'function onDraw(info) {\n  ce.draw.clear();\n  ce.draw.stroke("#5B9BD5", 2);\n  ce.draw.line(0, info.height / 2, info.width, info.height / 2);\n  $0\n}',
    },
  },
  {
    id: 'onPanelReady', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelReady(info)',
    summary: 'Phase 2 — GUI ready. Read the synth, fill controls. May re-fire on VST3 window reopen; guard one-time work with `if info.firstTime`.',
    params: [{ name: 'info', type: 'object', fields: optionFields([
      { name: 'firstTime', type: 'true or false',
        summary: 'True the first time the panel opens, false when a plugin window is reopened. '
          + 'Guard one-time setup with it.' },
    ]) }],
    snippet: {
      lua: 'function onPanelReady(info)\n  if info.firstTime then\n    $0\n  end\nend',
      javascript: 'function onPanelReady(info) {\n  if (info.firstTime) {\n    $0\n  }\n}',
    },
  },
  {
    id: 'onPanelClose', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelClose()',
    summary: 'Phase 4 — the view is closing: preview stopped, or the plugin window was closed. Scripts keep running (timers still tick, MIDI still arrives). For script teardown, use onPanelDestroy.',
    params: [],
    snippet: { lua: 'function onPanelClose()\n  $0\nend', javascript: 'function onPanelClose() {\n  $0\n}' },
  },
  {
    id: 'onPanelDestroy', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelDestroy()',
    summary: 'Phase 5 — scripts are being torn down: panel switched, script set replaced, or plugin unloaded. The last hook to run; timers, state and MIDI still work, so restore the synth or send a final dump here. Fires exactly once per loaded script set, even if onPanelClose never fired.',
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
    summary: 'The DAW is saving the project — return an object of what to save. `store` is what other scripts have saved so far, for reading. Mutating it does nothing.',
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
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', decoded: false, summary: 'A CC arrived. cc.channel, cc.cc, cc.value. Note: cc.channel is 0-based here, unlike sendCC and onNoteIn.' },
  // The most common message on the wire had no event of its own: a panel reacting to played notes
  // had to take onMidiIn and decode status nibbles by hand, in every language, including the
  // note-on-with-velocity-0 case that actually means note-off. Both are derived from the STATUS
  // BYTE rather than from the host's messageType, so the two runtimes cannot classify differently.
  { id: 'noteIn', fn: 'onNoteIn', payload: 'note', decoded: false,
    summary: 'A note was played. note.channel (1-16, matching sendNote), note.note, note.velocity. A note-on with velocity 0 counts as a note-off and arrives as onNoteOffIn instead.' },
  { id: 'noteOffIn', fn: 'onNoteOffIn', payload: 'note', decoded: false,
    summary: 'A note was released. note.channel (1-16), note.note, note.velocity (the release velocity, 0 when the device sent a note-on with velocity 0 instead of a note-off).' },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'Raw SysEx arrived.' },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A device connected.' },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A device disconnected.' },
];

/* Components (design doc §45).
 *
 * The catalogue above is 24 events and not one of them comes from a component. After §44 a script
 * could drive 302 component members and could not be told anything — an arpeggiator firing a step,
 * a setlist changing scene, a take finishing, a pad being struck were all invisible, and the only
 * way to notice was to poll a read() on a timer.
 *
 * Grouped by WHAT HAPPENED rather than by family, so one handler serves several components and a
 * script stays portable: `on("*", "step", …)` is the same handler for an Arpeggiator, a Turing
 * Machine, a Phrase Sequencer and a Looper.
 *
 * Panel view only, and that is not a policy choice — the component engines live in the preview
 * surface and the C++ engines carry stubs, so window-closed there is nothing running to raise one.
 * Every payload carries `target`, because `on("*", …)` is a legitimate subscription and the handler
 * has to know which arpeggiator.
 */
export const COMPONENT_EVENTS = [
  { id: 'step', fn: 'onStep', payload: 'step', runtime: RUNTIME_WEBVIEW,
    summary: 'A sequencer advanced. step.target, step.index (1-based), step.of, step.notes. Raised by the Arpeggiator, Turing Machine, Phrase Sequencer and Looper.' },
  { id: 'cycle', fn: 'onCycle', payload: 'cycle', runtime: RUNTIME_WEBVIEW,
    summary: 'A sequence or loop came back round. cycle.target, cycle.count (how many times since the panel opened). Arpeggiator, Turing, Looper, Orbit.' },
  { id: 'hit', fn: 'onHit', payload: 'hit', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or ribbon was struck. hit.target, hit.id, hit.note, hit.velocity. Chord Pad, Drum Pads, Note Ribbon.' },
  { id: 'release', fn: 'onRelease', payload: 'release', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or ribbon was released. release.target, release.id, release.note.' },
  { id: 'scene', fn: 'onScene', payload: 'scene', runtime: RUNTIME_WEBVIEW,
    summary: 'The Setlist recalled a scene. scene.target, scene.index (1-based), scene.name. Fires on any recall, scripted or footswitch.' },
  { id: 'stage', fn: 'onStage', payload: 'stage', runtime: RUNTIME_WEBVIEW,
    summary: 'A component entered a new stage. stage.target, stage.stage, stage.previous. Raised by the Recorder ("idle"/"armed"/"recording"/"overdub") and the Envelope ("sustain"/"release"/"end"). Not onStateChanged, which is a control\'s hover/pressed state.' },
  { id: 'settled', fn: 'onSettled', payload: 'settled', runtime: RUNTIME_WEBVIEW,
    summary: 'A spring-return control finished gliding home. settled.target, settled.value. Ribbon, Crossfader, Vector Joystick.' },
  { id: 'bounce', fn: 'onBounce', payload: 'bounce', runtime: RUNTIME_WEBVIEW,
    summary: 'The Kinetic ball hit a wall. bounce.target, bounce.x, bounce.y, bounce.vx, bounce.vy.' },
  { id: 'recall', fn: 'onRecall', payload: 'recall', runtime: RUNTIME_WEBVIEW,
    summary: 'The Constellation snapped to a preset. recall.target, recall.id, recall.label. Snap mode only — blend mode does not fire it.' },
  { id: 'zone', fn: 'onZone', payload: 'zone', runtime: RUNTIME_WEBVIEW,
    summary: 'A Meter crossed into a different threshold zone. zone.target, zone.zone, zone.previous, zone.value.' },
  { id: 'voiced', fn: 'onVoiced', payload: 'voiced', runtime: RUNTIME_WEBVIEW,
    summary: 'A component turned a played note into other notes. voiced.target, voiced.note, voiced.velocity, voiced.out (the notes it produced). Raised by the Zone Splitter and the Harmoniser.' },
];

export const EVENTS = { control: CONTROL_EVENTS, panel: PANEL_EVENTS, time: TIME_EVENTS, device: DEVICE_EVENTS, component: COMPONENT_EVENTS };

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
    summary: 'Write a value at a path. Suffix the path with .normalizedValue to write a 0–1 position instead of the real value. Transmits to the synth by default; writes made while reacting to inbound MIDI stay silent.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'value', type: 'value', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'transmit', type: 'true or false', default: 'decided by where the write came from',
          summary: 'Whether to send the change to the synth. Left out, a write made while handling '
            + 'something the synth sent stays silent and any other write is sent. Set it only when '
            + 'you need to override that.' },
      ]) },
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
    summary: 'Run a block writing to the panel without sending to the synth (e.g. an Init-Patch button). Auto-resets at block end.',
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
    summary: 'Call fn(value, previous) whenever any model path changes — a nested section field, a '
      + 'colour, a device binding. Fires regardless of source: script, user, or inbound MIDI.',
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
    summary: 'Make a property a formula: fn is re-evaluated whenever anything moves, and its result '
      + 'is written to path.',
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
    summary: 'Intercept every write to path. fn(value, prev) returns a replacement value to '
      + 'transform it (clamp, quantize, snap), false to reject it, or nothing to accept it unchanged.',
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
    summary: 'Register a named action. run("name") calls it from any script in any language, and it '
      + 'is offered wherever the panel binds actions.',
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
    summary: 'Run `fn` once, `ms` from now. Returns an id; pass it to stopTimer to cancel before it fires.',
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
    summary: 'Ask the synth to send a dump. `kind` is defined by the DPD ("patch"/"tone"/"global"…) or declared by defineDump. With `fn`, the reply is delivered to fn(values, info); `info.ok` is false when nothing arrived within `opts.timeout` (default 3000ms). fn runs after onDumpReceived, so both see the same panel.',
    params: [
      { name: 'kind', type: 'dumpKind', required: true },
      { name: 'fn', type: 'function', required: false },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'timeout', type: 'number', default: '3000', unit: 'milliseconds',
          summary: 'How long to wait for the reply before giving up and calling `fn` with '
            + 'info.ok = false.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'requestDump("${1:patch}", function(values, info)\n  if info.ok then $0 end\nend)',
      javascript: 'requestDump("${1:patch}", (values, info) => {\n  if (info.ok) { $0 }\n});',
    },
  },
  {
    id: 'applyDump', category: 'Device / MIDI', signature: 'applyDump(bytes)',
    summary: 'Fill the whole panel from a received dump (walks the DPD map). Silent automatically — inbound context. Also accepts an already-decoded { parameter: value } map, which works with no device host attached.',
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
    summary: 'Build the dump bytes from the panel values without sending. Requires the device host (the DPD codec lives there); returns nothing in a plain browser tab and reports why.',
    requiresDeviceHost: true,
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: 'any',
    snippet: { lua: 'local bytes = buildDump("${1:patch}")$0', javascript: 'const bytes = buildDump("${1:patch}")$0' },
  },

  /* --- Colour arithmetic (design doc §41) ---
     In ce.math rather than ce.draw because it is PURE and cross-runtime: setting a control's colour
     from a value works with the panel shut, and the exported plugin does it.

     §36's sweep swept utils/*Layout.js and declared ce.math complete. colorMath.js and
     colorHelpers.js do not match that glob — the sweep had a blind spot exactly the shape of its
     own search pattern, which is worth writing down because it is the failure mode of any sweep.

     ONE input form, and a trap worth naming. Every verb here accepts "RRGGBB", "AARRGGBB" or
     "#RRGGBB" — the app's own parser reads the last six characters — and returns "#RRGGBB", which
     CSS, SVG and a panel property all accept. The app STORES colours as AARRGGBB (JUCE's order:
     "66FFFFFF" is a 40%-opaque white in every panel document) while CSS wants #RRGGBBAA — the same
     four bytes the other way round. So exactly one verb, `alpha`, returns the panel's form, and
     making a DRAWING translucent is ce.draw.opacity(), a different question with a different
     answer. Case is normalised to upper; hex is case-insensitive everywhere it is read. */
  {
    id: 'lighten', category: 'Value / range', signature: 'lighten(colour [, amount]) -> string',
    summary: 'Scale each channel toward white. `amount` 0..1, default 0.4 (the border renderer\'s highlight amount). Returns nothing for a colour it cannot read.',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'amount', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'darken', category: 'Value / range', signature: 'darken(colour [, amount]) -> string',
    summary: 'Scale each channel toward black. `amount` 0..1, default 0.55 (the border groove shading amount).',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'amount', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'mixColour', category: 'Value / range', signature: 'mixColour(a, b, t) -> string',
    summary: 'Blend two colours, `t` 0..1. Per-channel linear interpolation in plain RGB.',
    params: [
      { name: 'a', type: 'string', required: true },
      { name: 'b', type: 'string', required: true },
      { name: 't', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'colourAlpha', category: 'Value / range', signature: 'colourAlpha(colour, a) -> string',
    summary: 'Apply an alpha to a colour, returned in the panel\'s stored form: AARRGGBB, no leading #. The one colour verb that does not return #RRGGBB. Warning: CSS #rrggbbaa is the same bytes in the opposite order. To make a drawing translucent use ce.draw.opacity().',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'a', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'hexToRgb', category: 'Value / range', signature: 'hexToRgb(colour) -> table',
    summary: 'A colour as { r, g, b }, each 0..255. Returns nothing for a colour it cannot read.',
    params: [{ name: 'colour', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'rgbToHex', category: 'Value / range', signature: 'rgbToHex(r, g, b) -> string',
    summary: 'Convert channels 0..255 to "#RRGGBB". Out-of-range channels are clamped, not wrapped.',
    params: [
      { name: 'r', type: 'number', required: true },
      { name: 'g', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'hexToHsl', category: 'Value / range', signature: 'hexToHsl(colour) -> table',
    summary: 'A colour as { h, s, l } — hue 0..360, saturation and lightness 0..100 (the colour editor\'s ranges). Grey returns hue 0 and saturation 0.',
    params: [{ name: 'colour', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'hslToHex', category: 'Value / range', signature: 'hslToHex(h, s, l) -> string',
    summary: 'Convert hue 0..360, saturation and lightness 0..100 to "#RRGGBB". Inverse of hexToHsl.',
    params: [
      { name: 'h', type: 'number', required: true },
      { name: 's', type: 'number', required: true },
      { name: 'l', type: 'number', required: true },
    ],
    scopes: 'any',
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
    summary: 'Animate a value to `target` instead of jumping there. Pass a list of controls to move them all in one call, with `stagger` offsetting their starts. Starting a second move on the same control replaces the first; the replaced one reports cancelled, not finished.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'target', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          'duration', 'beats', 'sync',
          { name: 'curve', type: 'text', default: '"linear"',
            values: ['linear', 'exp', 'log', 's', 'inQuad', 'outQuad', 'inOutQuad', 'outCubic'],
            summary: 'The shape of the move. The first four are ce.math.curve\'s; the last four are '
              + 'the Properties panel\'s. An unrecognised name is reported and the move runs linear.' },
          'animFrom', 'delay', 'stagger', 'repeat', 'pingpong', 'done',
        ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.anim.to("${1:cutoff}", ${2:127}, { duration = ${3:500}, curve = "s" })$0',
      javascript: 'ce.anim.to("${1:cutoff}", ${2:127}, { duration: ${3:500}, curve: "s" });$0',
    },
  },
  {
    id: 'animateSpring', category: 'Animation', signature: 'animateSpring(path, target [, opts])',
    summary: 'Move a value to `target` with a damped oscillation — it overshoots and settles. `opts`: { duration (ms, default 600), damping (default 6), frequency (default 12), from } plus everything animateTo takes except `curve` — beats, sync, delay, stagger, repeat, pingpong, done, and a list of paths.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'target', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          { like: 'duration', default: '600' },
          { name: 'damping', type: 'number', default: '6',
            summary: 'How quickly the wobble dies away. Higher settles sooner; lower keeps '
              + 'bouncing.' },
          { name: 'frequency', type: 'number', default: '12',
            summary: 'How fast it wobbles. Higher is a tighter, faster bounce.' },
          'animFrom', 'beats', 'sync', 'delay', 'stagger', 'repeat', 'pingpong', 'done',
        ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.anim.spring("${1:cutoff}", ${2:127})$0',
      javascript: 'ce.anim.spring("${1:cutoff}", ${2:127});$0',
    },
  },
  {
    id: 'animateStop', category: 'Animation', signature: 'animateStop([path])',
    summary: 'Stop the animation on `path`, leaving the value where it got to. No path stops every animation this panel is running. `done` fires with completed = false; use finish() to jump to the target instead.',
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.anim.stop("${1:cutoff}")$0', javascript: 'ce.anim.stop("${1:cutoff}");$0' },
  },
  {
    id: 'animateRunning', category: 'Animation', signature: 'animateRunning([path])',
    summary: 'Return whether `path` is being animated right now. With no path, return whether any animation is running.',
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: { lua: 'if not ce.anim.running("${1:cutoff}") then $0 end', javascript: 'if (!ce.anim.running("${1:cutoff}")) { $0 }' },
  },

  /* --- Animation, the rest of it (design doc §39) ---
     `to` and `spring` are both "a value moves from A to B and stops". Everything below is what that
     leaves out: a shape rather than a destination, a hold that is not a cancel, a way to see how far
     a move has got, and a way to end one on purpose rather than by abandoning it.

     The Properties panel's Animations section could already say things a script could not — several
     targets in one declaration, a delay, and its own easing vocabulary. Those are options on `to`
     now. These seven are the other direction: things a stored property structurally cannot be. */
  {
    id: 'animateEnvelope', category: 'Animation', signature: 'animateEnvelope(path, points [, opts])',
    summary: 'Move a value through a multi-point shape — an attack and decay, a hold and fall. `points` is a list of { x, y } points between 0 and 1, the same format the Envelope component uses. Unlike `to`, the value can rise and fall within one animation.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'points', type: 'list', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          { name: 'from', type: 'number', default: '0',
            summary: 'The value that y = 0 in the shape means.' },
          { name: 'to', type: 'number', default: '1',
            summary: 'The value that y = 1 in the shape means.' },
          'duration', 'beats', 'sync', 'delay', 'repeat', 'pingpong', 'done',
        ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.anim.envelope("${1:cutoff}", { {x=0,y=0}, {x=0.1,y=1}, {x=0.4,y=0.6}, {x=1,y=0} }, { duration = ${2:800}, to = 127 })$0',
      javascript: 'ce.anim.envelope("${1:cutoff}", [{x:0,y:0},{x:0.1,y:1},{x:0.4,y:0.6},{x:1,y:0}], { duration: ${2:800}, to: 127 });$0',
    },
  },
  {
    id: 'animateValue', category: 'Animation', signature: 'animateValue(path) -> table',
    summary: 'Describe the animation on `path`: { path, kind, value, progress, from, to, elapsed, remaining, paused, cycle, sync }. Returns nothing when the path is not animating. `elapsed` and `remaining` are nil for a transport-synced animation.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateList', category: 'Animation', signature: 'animateList() -> list',
    summary: 'List every running animation, in path order, each described as animateValue describes it.',
    scopes: 'any',
  },
  {
    id: 'animatePause', category: 'Animation', signature: 'animatePause(path)',
    summary: 'Hold an animation where it is, without ending it. Returns false when nothing is running on the path, or it is already paused.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateResume', category: 'Animation', signature: 'animateResume(path)',
    summary: 'Resume an animation from where pause() held it; it continues rather than restarting.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateReverse', category: 'Animation', signature: 'animateReverse(path)',
    summary: 'Turn a running animation around from where it is, travelling back at the same rate — a move that was 80% done takes 80% of its duration to get home. An envelope reverses its shape as well as its direction.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateFinish', category: 'Animation', signature: 'animateFinish(path)',
    summary: 'Jump to the target and complete: the value lands exactly where the animation was going and `done` fires with completed = true. Use stop() to cancel instead, leaving the value where it is.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },

  /* --- User feedback (design doc §6 phase 6, §18) ---
     Panel view only: there is nobody to tell with the window shut. `notify` and `status` are
     fire-and-forget; `dialog` asks a question, and the answer arrives through a CALLBACK rather
     than a return value, because an answer necessarily arrives later than the call. */
  {
    id: 'uiNotify', category: 'User feedback', signature: 'uiNotify(message [, opts])',
    summary: 'Show a brief message to the panel user and return its ID. `opts` may carry { kind ("info" | "warn" | "error"), duration (ms, default 3000; 0 or less means until dismissed) }. For user-facing events, not debugging — use log() for that. Pass the ID to ce.ui.update(id, …) to replace the message in place, or to ce.ui.dismiss(id) to remove it.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        'uiKind',
        { name: 'duration', type: 'number', default: '3000', unit: 'milliseconds',
          summary: 'How long the message stays up. 0 or less keeps it visible until something '
            + 'dismisses it.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.ui.notify("${1:Patch loaded}")$0', javascript: 'ce.ui.notify("${1:Patch loaded}");$0' },
  },
  {
    id: 'uiStatus', category: 'User feedback', signature: 'uiStatus([message] [, opts])',
    summary: 'Put a line in the status bar; it persists until replaced. No message clears it. Use for a state ("Recording", "Synced") rather than an event — notify is for events. `opts` may carry { kind ("info" | "warn" | "error") }. Read it back with ce.ui.state().',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'message', type: 'string', required: false },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['uiKind']) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.ui.status("${1:Recording}")$0', javascript: 'ce.ui.status("${1:Recording}");$0' },
  },
  {
    id: 'uiDialog', category: 'User feedback', signature: 'uiDialog(opts [, onChoice]) -> boolean',
    summary: 'Ask a question with buttons. The answer arrives asynchronously through `onChoice`, which receives the clicked label, or nothing if the dialog was dismissed. The call itself returns whether a dialog appeared: false means there was nobody to ask and the callback has already run with no answer. Only one dialog can be open at a time.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true, fields: optionFields([
        'uiTitle', 'uiMessage',
        { name: 'buttons', type: 'list of text', default: 'one button labelled "OK"',
          summary: 'The button labels, left to right. Whichever is clicked is what `onChoice` is '
            + 'given.' },
        'uiKind',
        { name: 'default', type: 'text', default: 'the first button', sample: '"Cancel"',
          summary: 'The label of the button focused when the dialog opens.' },
      ]) },
      { name: 'onChoice', type: 'function', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.dialog({ title = "${1:Overwrite?}", buttons = { "Overwrite", "Cancel" } }, function(choice)\n  if choice == "Overwrite" then\n    $0\n  end\nend)',
      javascript: 'ce.ui.dialog({ title: "${1:Overwrite?}", buttons: ["Overwrite", "Cancel"] }, function (choice) {\n  if (choice === "Overwrite") {\n    $0\n  }\n});',
    },
  },

  /* --- User feedback, the rest of it (design doc §40) ---
     notify/status/dialog got the three LIFETIMES right — an event that expires, a state that
     persists, a question that waits. What they left out was addressing them, and what KIND of
     question you can ask.

     The bar here is not the Properties panel, which has no run-time messaging at all. It is what
     the APP does to talk to whoever is using it: it asks for text (the browser's prompt(), where a
     note is renamed), it offers lists to pick from, its own toasts can be dismissed by clicking
     them, and it copies to the clipboard in six places. A script could do none of those. */
  {
    id: 'uiPrompt', category: 'User feedback', signature: 'uiPrompt(opts [, onAnswer]) -> boolean',
    summary: 'Ask the user to type text. The answer comes back through `onAnswer` as text, or as nothing if they cancelled — an empty answer and no answer are distinct. Enter accepts. Returns whether a dialog appeared; false means the callback has already run with no answer.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true,
        fields: optionFields([
          'uiTitle', 'uiMessage',
          { name: 'value', type: 'text', default: 'empty', sample: 'get("patchName")',
            summary: 'What the text field starts out holding.' },
          { name: 'placeholder', type: 'text', sample: '"Patch name"',
            summary: 'Grey hint text shown while the field is empty.' },
          'uiAccept', 'uiCancel', 'uiKind',
        ]) },
      { name: 'onAnswer', type: 'function', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.prompt({ title = "${1:Name this patch}", value = get("patchName") }, function(name)\n  if name ~= nil then set("patchName", name) end\nend)$0',
      javascript: 'ce.ui.prompt({ title: "${1:Name this patch}", value: get("patchName") }, (name) => {\n  if (name !== undefined) set("patchName", name);\n});$0',
    },
  },
  {
    id: 'uiChoose', category: 'User feedback', signature: 'uiChoose(opts [, onAnswer]) -> boolean',
    summary: 'Ask the user to pick from a list. The answer is the chosen item, a list of items if `multiple` is set, or nothing if they cancelled. A long list scrolls rather than growing.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true,
        fields: optionFields([
          'uiTitle', 'uiMessage',
          { name: 'items', type: 'list of text', required: true,
            summary: 'The choices to offer. A long list scrolls.' },
          { name: 'default', type: 'text', default: 'nothing selected', sample: '"Init"',
            summary: 'The item selected when the dialog opens.' },
          { name: 'multiple', type: 'true or false', default: 'false',
            summary: 'Allow more than one to be picked, in which case the answer is a list.' },
          'uiAccept', 'uiCancel', 'uiKind',
        ]) },
      { name: 'onAnswer', type: 'function', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.choose({ title = "${1:Load which preset?}", items = names }, function(pick)\n  if pick ~= nil then $0 end\nend)',
      javascript: 'ce.ui.choose({ title: "${1:Load which preset?}", items: names }, (pick) => {\n  if (pick !== undefined) { $0 }\n});',
    },
  },
  {
    id: 'uiDismiss', category: 'User feedback', signature: 'uiDismiss([id]) -> number',
    summary: 'Remove a message; the user can also do this by clicking it. With no id, clears every message. Returns how many were removed.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'id', type: 'number', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.dismiss(${1:id})$0', javascript: 'ce.ui.dismiss(${1:id});$0' },
  },
  {
    id: 'uiUpdate', category: 'User feedback', signature: 'uiUpdate(id, message [, opts]) -> boolean',
    summary: 'Change a message that is already on screen, in place. To show progress, give the original message a duration of 0 so it stays put, then update it as you go. Returns false once the message has gone — for example dismissed by hand — so you can stop updating.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'id', type: 'number', required: true },
      { name: 'message', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        'uiKind',
        { name: 'duration', type: 'number', default: 'unchanged', sample: '5000',
          summary: 'A new lifetime for the message. If omitted, a sticky message stays sticky '
            + 'and a timed one gets its full time back.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local id = ce.ui.notify("${1:Working}…", { duration = 0 })\n-- …later\nce.ui.update(id, "${1:Working}… done")$0',
      javascript: 'const id = ce.ui.notify("${1:Working}…", { duration: 0 });\n// …later\nce.ui.update(id, "${1:Working}… done");$0',
    },
  },
  {
    id: 'uiState', category: 'User feedback', signature: 'uiState() -> table',
    summary: 'Return what is on screen: { status, statusKind, notifications ([{ id, message, kind, sticky }]), dialog }. Use `dialog` to tell apart the two reasons dialog() can return false — nobody to ask, or a dialog already open.',
    runtime: RUNTIME_WEBVIEW,
    scopes: 'any',
    snippet: { lua: 'if not ce.ui.state().dialog then $0 end', javascript: 'if (!ce.ui.state().dialog) { $0 }' },
  },
  {
    id: 'uiCopy', category: 'User feedback', signature: 'uiCopy(text) -> boolean',
    summary: 'Put text on the clipboard. The write is asynchronous and a browser may refuse it without a user gesture: the return means the copy was attempted, and a refusal is reported to the console. There is no clipboard read.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'text', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.copy(bytesToHex(buildDump("patch")))$0', javascript: 'ce.ui.copy(bytesToHex(buildDump("patch")));$0' },
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
    summary: 'Discard everything drawn on this control. Drawing commands accumulate rather than replace, so this is the usual first line of onDraw.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.clear()$0', javascript: 'ce.draw.clear();$0' },
  },
  {
    id: 'drawFill', category: 'Drawing', signature: 'drawFill(colour)',
    summary: 'The fill colour for the shapes that follow — a hex string such as "#5B9BD5", or nil for no fill. May be a gradient from ce.draw.gradient() rather than a flat colour.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'colour', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.fill("${1:#5B9BD5}")$0', javascript: 'ce.draw.fill("${1:#5B9BD5}");$0' },
  },
  {
    id: 'drawStroke', category: 'Drawing', signature: 'drawStroke([colour] [, width] [, opts])',
    summary: 'The line colour and thickness for the shapes that follow. `width` defaults to 1; nil colour means no stroke, and `colour` may be a gradient from ce.draw.gradient(). `opts` carries { dash (a list of on/off lengths, e.g. { 3, 3 }), dashOffset (how far into that pattern to start), cap ("butt" | "round" | "square"), join ("miter" | "round" | "bevel") }.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'colour', type: 'value', required: false },
      { name: 'width', type: 'number', required: false },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'dash', type: 'list of numbers', default: 'a solid line',
          summary: 'Alternating on and off lengths in pixels. The panel\'s own beat marks are '
            + '{ 3, 3 } — three pixels drawn, three skipped.' },
        { name: 'dashOffset', type: 'number', default: '0', unit: 'pixels',
          summary: 'How far into the dash pattern to start. Advance it on a timer and the dashes '
            + 'march along the line.' },
        { name: 'cap', type: 'text', default: '"butt"', values: ['butt', 'round', 'square'],
          summary: 'The shape a line ends in.' },
        { name: 'join', type: 'text', default: '"miter"', values: ['miter', 'round', 'bevel'],
          summary: 'How two line segments meet at a corner.' },
      ]) },
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
    summary: 'A straight line. Stroke only; fill does not apply.',
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
    summary: 'A polyline through a flat list of coordinates — { x1, y1, x2, y2, ... }. `closed` joins the last point back to the first.',
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
    summary: 'An arc centred on (x, y). Angles are degrees with 0 at twelve o\'clock, increasing clockwise — the same convention the Meter\'s arcStart/arcSweep use. Stroked with the current stroke; filled as a pie slice if a fill is set.',
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
  /* --- Drawing, the rest of it (design doc §41) ---
     fill and stroke took a flat colour and a width, and that was the whole style vocabulary. The
     app's own renderers draw gradients (gradientCoords() is documented as being FOR this renderer:
     "intended for use with SVG gradientUnits=userSpaceOnUse"), dashed strokes (the Transport's beat
     marks, the Constellation's probe link), translucent overlays, and text in a 5x7 LCD font. A
     script could do none of it. */
  {
    id: 'drawGradient', category: 'Drawing', signature: 'drawGradient(stops [, angle]) -> value',
    summary: 'Build a gradient to use in place of a flat colour with fill() or stroke(). Give a plain list of colours to space them evenly, or a list of { at, colour, opacity } to place them yourself; the two forms can be mixed. `angle` is 0 for up and 90 for right, the same as the Background section\'s gradients. Fewer than two usable colours returns nothing.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'stops', type: 'list', required: true },
      { name: 'angle', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))$0',
      javascript: 'ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));$0',
    },
  },
  {
    id: 'drawOpacity', category: 'Drawing', signature: 'drawOpacity(a)',
    summary: 'Set the opacity for everything drawn after this, 0..1. Like fill and stroke, it applies to what follows, not to one shape. A value that is not a number clears it. To make a stored colour translucent instead, use ce.math.alpha().',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'a', type: 'number', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawTransform', category: 'Drawing', signature: 'drawTransform([opts])',
    summary: 'Rotate, move or scale everything drawn after this. `opts` carries { rotate (degrees, clockwise), cx, cy (the centre to rotate about), x, y (a shift), scale }. No opts clears it.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'rotate', type: 'number', default: '0', unit: 'degrees',
        summary: 'Turn everything drawn after this clockwise.' },
      { name: 'cx', type: 'number', default: 'the middle of the control', unit: 'pixels', sample: '40',
        summary: 'The horizontal point to rotate about. A wrong centre makes the shape orbit '
          + 'the wrong point.' },
      { name: 'cy', type: 'number', default: 'the middle of the control', unit: 'pixels', sample: '40',
        summary: 'The vertical point to rotate about.' },
      { name: 'x', type: 'number', default: '0', unit: 'pixels', summary: 'Move everything sideways.' },
      { name: 'y', type: 'number', default: '0', unit: 'pixels', summary: 'Move everything up or down.' },
      { name: 'scale', type: 'number', default: '1',
        summary: 'Grow or shrink. 2 is double size, 0.5 is half.' },
    ]) }],
    scopes: 'any',
    snippet: {
      lua: 'ce.draw.transform({ rotate = ${1:135}, cx = w / 2, cy = h / 2 })$0',
      javascript: 'ce.draw.transform({ rotate: ${1:135}, cx: w / 2, cy: h / 2 });$0',
    },
  },
  {
    id: 'drawEllipse', category: 'Drawing', signature: 'drawEllipse(cx, cy, rx, ry)',
    summary: 'An ellipse centred on (cx, cy), with horizontal radius rx and vertical radius ry.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true }, { name: 'cy', type: 'number', required: true },
      { name: 'rx', type: 'number', required: true }, { name: 'ry', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'drawPixelText', category: 'Drawing', signature: 'drawPixelText(text, x, y [, scale])',
    summary: 'Text in the app’s built-in 5x7 LCD font, the same one the LCD components use. `scale` is a whole-number pixel size, 1 by default. Drawn one square per lit pixel, with no smoothing. (x, y) is the top-left corner, unlike text() whose y is the baseline.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'text', type: 'string', required: true },
      { name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true },
      { name: 'scale', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'drawMeasure', category: 'Drawing', signature: 'drawMeasure(text [, opts]) -> table',
    summary: 'Measure a string before drawing it: returns { width, height, exact }. `opts` carries { size, family } for ordinary text, or { pixel = true, scale } for the LCD font. The pixel font is a fixed grid, so its answer is exact; a proportional font must be measured, and when no surface is available the result is an estimate with `exact` false.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'text', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'size', type: 'number', unit: 'pixels', sample: '14', summary: 'The text size to measure at.' },
        { name: 'family', type: 'text', sample: '"Inter Tight"', summary: 'The font family to measure in.' },
        { name: 'pixel', type: 'true or false', default: 'false',
          summary: 'Measure in the panel\'s built-in LCD font instead of a normal one. That font '
            + 'is a fixed grid, so the answer is exact arithmetic.' },
        { name: 'scale', type: 'number', default: '1',
          summary: 'How many screen pixels one LCD pixel is. Only used with `pixel`.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawBatch', category: 'Drawing', signature: 'drawBatch(fn) -> boolean',
    summary: 'Send a run of drawing commands as a single update instead of one each. Use it when drawing in a loop — a waveform, a set of tick marks — where it is several times faster. grid, lines and points already send a whole set at once and do not need it.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawGrid', category: 'Drawing', signature: 'drawGrid([opts]) -> boolean',
    summary: 'Draw a whole grid as one command and one path. `opts` may carry { x, y, width, height } (defaulting to the control\'s box) and either a spacing — { step } or { stepX, stepY } — or a count, { columns, rows }. The closing line is drawn, so a 4-column grid has five verticals.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false,
      fields: optionFields([
        { name: 'x', type: 'number', default: 'the control\'s left edge', unit: 'pixels', sample: '4',
          summary: 'Where the grid starts horizontally.' },
        { name: 'y', type: 'number', default: 'the control\'s top edge', unit: 'pixels', sample: '4',
          summary: 'Where it starts vertically.' },
        { name: 'width', type: 'number', default: 'the control\'s width', unit: 'pixels', sample: '120',
          summary: 'How wide the grid is.' },
        { name: 'height', type: 'number', default: 'the control\'s height', unit: 'pixels', sample: '60',
          summary: 'How tall the grid is.' },
        { name: 'step', type: 'number', unit: 'pixels', sample: '10',
          summary: 'Spacing both ways — a line every this many pixels. Use this or `columns`, '
            + 'not both.' },
        { name: 'stepX', type: 'number', unit: 'pixels', sample: '10', summary: 'Horizontal spacing on its own.' },
        { name: 'stepY', type: 'number', unit: 'pixels', sample: '20', summary: 'Vertical spacing on its own.' },
        { name: 'columns', type: 'number', sample: '16',
          summary: 'How many columns to divide the width into. The closing line is drawn, so four '
            + 'columns give five vertical lines.' },
        { name: 'rows', type: 'number', sample: '4', summary: 'How many rows to divide the height into.' },
      ]) }],
    scopes: 'any',
  },
  {
    id: 'drawLines', category: 'Drawing', signature: 'drawLines(segments) -> boolean',
    summary: 'Draw many disjoint line segments as one command — a list of [x1, y1, x2, y2]. For unconnected geometry: tick marks, a vu ladder, a grid you compute yourself. drawPath draws a connected run.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'segments', type: 'list', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawPoints', category: 'Drawing', signature: 'drawPoints(points [, radius]) -> boolean',
    summary: 'A scatter of dots as one command — a list of [x, y], with `radius` defaulting to 1.5. The radius is independent of the stroke width.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'list', required: true },
      { name: 'radius', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'drawCurve', category: 'Drawing', signature: 'drawCurve(points [, opts]) -> boolean',
    summary: 'A smooth curve through the given points — a Catmull-Rom spline emitted as cubic Béziers, in one command.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'list', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'tension', type: 'number', default: '0.5', unit: '0 to 1',
          summary: 'How round the curve is. 0 gives straight lines between the points, 1 is fully '
            + 'rounded.' },
        { name: 'closed', type: 'true or false', default: 'false',
          summary: 'Join the last point back to the first to make a loop.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawPolygon', category: 'Drawing', signature: 'drawPolygon(cx, cy, radius, sides [, opts]) -> boolean',
    summary: 'A regular polygon centred on (cx, cy). `opts.rotation` is in degrees with 0 at twelve o\'clock, clockwise — the same convention drawArc uses, so a polygon and an arc at the same angle line up. Fewer than three sides is raised to three.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true },
      { name: 'cy', type: 'number', required: true },
      { name: 'radius', type: 'number', required: true },
      { name: 'sides', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'rotation', type: 'number', default: '0', unit: 'degrees',
          summary: 'Turn the shape clockwise, with 0 putting a corner at twelve o\'clock — the '
            + 'same convention drawArc uses, so a polygon and an arc at the same angle line up.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawImage', category: 'Drawing', signature: 'drawImage(src, x, y, w, h [, opts]) -> boolean',
    summary: 'Draw an image. `src` must be a data URL or a library icon\'s dataUrl from ce.image.asset(); a bare asset name is refused rather than drawn as nothing. `opts.fit` is "fill" (stretch, the default), "contain" or "cover".',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'src', type: 'string', required: true },
      { name: 'x', type: 'number', required: true },
      { name: 'y', type: 'number', required: true },
      { name: 'w', type: 'number', required: true },
      { name: 'h', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'fit', type: 'text', default: '"fill"', values: ['fill', 'contain', 'cover'],
          summary: 'How the image fills the box you gave. "fill" stretches it to fit exactly, '
            + '"contain" keeps its shape and leaves gaps, "cover" keeps its shape and crops.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawClip', category: 'Drawing', signature: 'drawClip([x, y, w, h]) -> boolean',
    summary: 'Restrict everything drawn after this to a rectangle. It is a style, not a shape: it applies until changed, and save()/restore() put it back. No arguments clears it. The control\'s own bounds still clip on top, so a clip can narrow the drawing area but never widen it.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: false },
      { name: 'y', type: 'number', required: false },
      { name: 'w', type: 'number', required: false },
      { name: 'h', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'drawBlend', category: 'Drawing', signature: 'drawBlend(mode) -> boolean',
    summary: 'How what follows composites with what is under it: "normal" (the default), "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion". An unknown mode is refused and reported rather than silently ignored.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'mode', type: 'string', required: true,
      values: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
        'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'] }],
    scopes: 'any',
  },
  {
    id: 'drawSave', category: 'Drawing', signature: 'drawSave() -> boolean',
    summary: 'Push the current style — fill, stroke, width, dash, dash offset, cap, join, opacity, transform, clip and blend — so restore() can put it back. The stack is cleared at the start of each drawing pass, so a forgotten restore cannot leak into the next one.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'drawRestore', category: 'Drawing', signature: 'drawRestore() -> boolean',
    summary: 'Pop the style that save() pushed. Reports and returns false when nothing was saved, rather than silently resetting to defaults.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'imageAssets', category: 'Images', signature: 'imageAssets([opts]) -> list',
    summary: 'List the icon library, as { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }. `opts` narrows with { vector = true } or { embeddable = true }. `portable` is false for every entry: the payload lives in app settings, not in the panel document, so a reference to it does not survive an export. `embeddable` says whether ce.image.embed() can copy the data URL into a layer.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'vector', type: 'true or false',
        summary: 'Set true to list only vector icons, which stay sharp at any size.' },
      { name: 'embeddable', type: 'true or false',
        summary: 'Set true to list only icons ce.image.embed() can copy into the panel, so they '
          + 'survive an export.' },
    ]) }],
    scopes: 'any',
  },
  {
    id: 'imageAsset', category: 'Images', signature: 'imageAsset(idOrName) -> table|nil',
    summary: 'Look up one library asset, by id first and then by name — the same resolution order the renderer uses. Returns nil when the library has no such asset; call it before writing an asset reference. Beware the name fallback: a coincidental name match is indistinguishable from an id hit.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'idOrName', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'imageSet', category: 'Images', signature: 'imageSet(target, src [, opts]) -> boolean',
    summary: 'Set an image on one of a control\'s four image layers and switch that layer on, always writing the picture and the switch together so a layer cannot be on and empty. Background layers composite with each other; a picture inside text replaces whatever was there. An option the chosen layer does not have is refused and reported, not stored.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'src', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          { name: 'layer', type: 'text', default: '"image"', values: IMAGE_LAYER_IDS,
            summary: 'Which of the control\'s four image layers to write. The first two are '
              + 'background layers and stack; the last two fill the text and are exclusive. Each '
              + 'option below applies only to layers that have it; an unsupported option is '
              + 'refused and reported.' },
          { name: 'fit', type: 'text', default: '"fill" on a background, "cover" on text',
            values: [...new Set([...BACKGROUND_FITS, ...TEXT_FITS])],
            summary: 'How the image fills the layer. The meaning differs by layer type: on a '
              + `background it is one of ${BACKGROUND_FITS.join(', ')} and "fill" means COVER; `
              + `on text it is one of ${TEXT_FITS.join(', ')} and "fill" means stretch. The `
              + 'text texture layer always tiles and takes no fit.' },
          { name: 'align', type: 'text', default: '"center"', values: BACKGROUND_ALIGNS,
            summary: 'Where the image sits when it does not fill the layer. Background layers '
              + 'only — on a text layer use offsetX and offsetY instead. Note the hyphens.' },
          { like: 'opacity', unit: '0 to 100', default: '100',
            summary: 'How solid the layer is, on the panel\'s own 0 to 100 scale — not 0 to 1.' },
          'tint',
          { name: 'blend', type: 'text', default: '"normal"', values: IMAGE_BLENDS,
            summary: 'How the layer mixes with what is underneath it. Background layers only.' },
          { name: 'blur', type: 'number', default: '0', unit: 'pixels',
            summary: 'Soften the image. Background layers only.' },
          { name: 'offsetX', type: 'number', default: '0', unit: 'pixels',
            summary: 'Nudge the image sideways.' },
          { name: 'offsetY', type: 'number', default: '0', unit: 'pixels',
            summary: 'Nudge it up or down.' },
          { like: 'imageRotation' },
          { name: 'flipH', type: 'true or false', default: 'false',
            summary: 'Mirror it left to right. Background layers only.' },
          { name: 'flipV', type: 'true or false', default: 'false',
            summary: 'Mirror it top to bottom. Background layers only.' },
          { name: 'grayscale', type: 'true or false', default: 'false',
            summary: 'Remove all colour from the image. Background layers only.' },
          { name: 'saturation', type: 'number', default: '1',
            summary: 'Colour intensity. 0 is grey, 1 is unchanged, above 1 is stronger. '
              + 'Background layers only.' },
          { name: 'brightness', type: 'number', default: '1',
            summary: 'Lighten above 1, darken below. Background layers only.' },
          { name: 'contrast', type: 'number', default: '1',
            summary: 'Increase above 1, flatten below. Background layers only.' },
          { name: 'tileScale', type: 'number', default: '1',
            summary: 'How big each tile is when the image repeats. Never less than 0.1.' },
          { name: 'clipMode', type: 'text', default: '"shape"', values: IMAGE_CLIP_MODES,
            summary: 'Whether the image is clipped to the control\'s drawn shape or to its plain '
              + 'rectangle. Background layers only.' },
          { name: 'muted', type: 'true or false', default: 'false',
            summary: 'Keep the layer configured but hide it, so you can switch it back on without '
              + 'setting it up again. Background layers only.' },
        ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'imageClear', category: 'Images', signature: 'imageClear(target [, layer]) -> boolean',
    summary: 'Turn a layer off and blank its source in one step. An exclusive text layer also resets to "solid", because a selected mode with no source paints nothing.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'layer', type: 'string', required: false,
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageRead', category: 'Images', signature: 'imageRead(target [, layer]) -> table',
    summary: 'Read the layer\'s full state, plus three derived fields: `active` is whether the layer will actually paint (for a text layer this depends on `mode`, not on `Enabled`), `source` is "data" | "file" | "none", and `portable` says whether it survives an export — only an embedded data URL does.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'layer', type: 'string', required: false,
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageIcon', category: 'Images', signature: 'imageIcon(target, idOrName [, opts]) -> boolean',
    summary: 'Point a control\'s Icon section at a library asset. `opts` may carry { size, fit, tint, opacity, rotation }. Writes both the id and the name, because the renderer resolves by id and falls back to the name. An asset the library does not have is refused rather than stored.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'idOrName', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          { name: 'size', type: 'number', default: '16', unit: 'pixels',
            summary: 'How big the icon is drawn.' },
          { name: 'fit', type: 'text', default: '"contain"',
            summary: 'How the icon fills its box, using the Icon section\'s own values.' },
          'tint', 'opacity', 'imageRotation',
        ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'imageEmbed', category: 'Images', signature: 'imageEmbed(target [, layer]) -> boolean',
    summary: 'Copy the layer\'s resolved data URL into the layer, replacing a machine-local file path, so the image survives export. Already-embedded sources return true unchanged. A file the host has not read yet returns false; the read is requested, and calling again once it lands succeeds.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'layer', type: 'string', required: false,
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageLoad', category: 'Images', signature: 'imageLoad(path) -> boolean',
    summary: 'Ask the host to read a file into the cache, and report whether it is there yet. A path source renders blank until this has happened, and the read is asynchronous — so this returns false the first time and true once the data has arrived. A data URL needs no loading and returns true immediately.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'path', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'textFonts', category: 'Typography', signature: 'textFonts([opts]) -> list',
    summary: 'List every font the panel can use, with per-font capabilities. `portable` says whether the font survives an export: built-in fonts work everywhere, while a library font lives on this machine, is not part of the panel document, and falls back to a system font for other users. `featuresKnown` says whether the font\'s typographic features have actually been checked; when it is false, an empty feature list means unchecked, not featureless.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'portable', type: 'true or false',
        summary: 'Set true to list only fonts that survive an export. A font from the icon library '
          + 'is registered by the editor and is not part of the panel document, so it looks right '
          + 'while you build and falls back to a system font once exported.' },
      { name: 'variable', type: 'true or false',
        summary: 'Set true to list only variable fonts, the ones with adjustable axes such as '
          + 'weight and width.' },
    ]) }],
    scopes: 'any',
  },
  {
    id: 'textFont', category: 'Typography', signature: 'textFont(family) -> table|nil',
    summary: 'Get one font descriptor by family name, or nil when no such font is available. Matched case-insensitively against the stored family and its label, the same matching the Properties panel uses. Use it to check a family before writing it, or to ask what variable axes a face has.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'family', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'textStyle', category: 'Typography', signature: 'textStyle(target, opts) -> boolean',
    summary: 'Set a control\'s type — font, size, weight, spacing, alignment and the rest — in one call. Boldness is stored as a pair of fields that must agree; this always writes both together, where setting one directly leaves them inconsistent. An unavailable font, a feature the font does not offer, or an option that is not a text option is refused and reported. Returns false if any part did not apply.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'opts', type: 'object', required: true,
        // The declared list used to name 17 fields while the implementation accepted 27: the four
        // paddings and five of the six OpenType switches were missing, so the only way to learn
        // that `tabularFigures` was allowed was to read textStyle.js. The feature switches come
        // from FEATURE_KEYS and the three word-lists from their own tables, so this cannot
        // fall behind again.
        fields: optionFields([
          { name: 'family', type: 'text', sample: '"Inter Tight"',
            summary: 'The font family. An unavailable family is refused rather than stored; a '
              + 'bare set() would store it and quietly fall back to a system font.' },
          { name: 'size', type: 'number', unit: 'pixels', sample: '18',
            summary: 'How big the text is drawn.' },
          { name: 'weight', type: 'number or text', sample: '600',
            summary: 'How heavy the text is, either as a number from 100 to 900 or as a name such '
              + 'as "Bold". The panel stores this as a pair of fields that must agree, and this '
              + 'always writes both.' },
          { name: 'bold', type: 'true or false', summary: 'A shorthand for a heavy weight.' },
          { name: 'italic', type: 'true or false', summary: 'Slant the text over.' },
          { name: 'caseMode', type: 'text', default: '"normal"', values: CASE_MODES,
            summary: 'Re-case the text as it is drawn, without changing what it says.' },
          { name: 'scriptMode', type: 'text', default: '"normal"', values: SCRIPT_MODES,
            summary: 'Draw the text smaller and raised or lowered, as superscript or subscript.' },
          { name: 'justification', type: 'text', values: JUSTIFICATIONS,
            summary: 'Where the text sits inside the control.' },
          { name: 'letterSpacing', type: 'number', default: '0', unit: 'pixels',
            summary: 'Extra space between letters. Negative tightens them up.' },
          { name: 'wordSpacing', type: 'number', default: '0', unit: 'pixels',
            summary: 'Extra space between words.' },
          { name: 'baselineShift', type: 'number', default: '0', unit: 'pixels',
            summary: 'Move the text off its baseline, up for positive.' },
          { name: 'lineHeight', type: 'number', sample: '1.4',
            summary: 'The gap from one line of text to the next.' },
          { name: 'maxLines', type: 'number', default: '0',
            summary: 'Stop after this many lines. 0 means no limit.' },
          { name: 'paddingLeft', type: 'number', default: '0', unit: 'pixels',
            summary: 'Inset the text from the control\'s left edge.' },
          { name: 'paddingRight', type: 'number', default: '0', unit: 'pixels',
            summary: 'Inset it from the right edge.' },
          { name: 'paddingTop', type: 'number', default: '0', unit: 'pixels',
            summary: 'Inset it from the top edge.' },
          { name: 'paddingBottom', type: 'number', default: '0', unit: 'pixels',
            summary: 'Inset it from the bottom edge.' },
          { name: 'underline', type: 'true or false', default: 'false', summary: 'Draw a rule under it.' },
          { name: 'strikethrough', type: 'true or false', default: 'false',
            summary: 'Draw a rule through it.' },
          { name: 'overline', type: 'true or false', default: 'false', summary: 'Draw a rule above it.' },
          ...FEATURE_KEYS.map((key) => ({
            name: key, type: 'true or false', default: 'false', group: 'typographic feature',
            summary: `${TYPOGRAPHIC_FEATURES[key]} A font that does not offer it refuses the `
              + 'option rather than ignoring it.',
          })),
        ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'textAxis', category: 'Typography', signature: 'textAxis(target, tag, value) -> boolean',
    summary: 'Set one variable-font axis by its four-letter tag, clamped to the range the font declares. An axis the face does not have is refused rather than stored. Setting `wght` also updates the weight pair, matching the Properties panel\'s own axis control — otherwise a variable face renders its old weight.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'tag', type: 'string', required: true },
      { name: 'value', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'textRead', category: 'Typography', signature: 'textRead(target [, name]) -> value|table',
    summary: 'Read one text field by name, from whichever of Font / Multiline / Position owns it — `size` and `lineHeight` are both just names; the script need not know which node holds them. With no name, return the whole state: { content, resolvedWeight, font, multiline, position }. `resolvedWeight` is the weight the renderer will actually use, not either half of the stored pair.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'name', type: 'string', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'textMeasure', category: 'Typography', signature: 'textMeasure(target [, text]) -> table',
    summary: 'Measure the room a control\'s text takes up, in its own font: { width, height, lines, truncated, exact }. Measures through the same code that draws the text, so the result matches the actual layout — spacing, wrapping and line limits included. Pass `text` to measure text the control does not hold yet. `exact` is false when there was no surface to measure on and the answer is an estimate.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'text', type: 'string', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'textFit', category: 'Typography', signature: 'textFit(target [, opts]) -> table',
    summary: 'Shrink Font.size until the text fits the control\'s box, write that size, and report { size, fits, changed, exact }. `opts` may carry { min = 6, max = the current size, text }. Unlike Text.Multiline.fitMode = "shrink", which scales only at paint time and never changes the stored size, this writes the size so other things can read and align to it. `fits` is false when even `min` overflows; the call still succeeds.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'min', type: 'number', default: '6', unit: 'pixels',
          summary: 'The smallest size to shrink to. If the text still overflows at this size, the '
            + 'result has fits = false; the call still succeeds.' },
        { name: 'max', type: 'number', default: 'the control\'s current size', unit: 'pixels', sample: '24',
          summary: 'The largest size to try.' },
        { name: 'text', type: 'text', default: 'the control\'s own text', sample: '"PATCH NAME"',
          summary: 'Measure this text instead, to size a control for something it does not hold '
            + 'yet.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawText', category: 'Drawing', signature: 'drawText(x, y, text [, opts])',
    summary: 'Text at (x, y), which is its left baseline. `opts` may carry { size, align, family }; align is "left" | "middle" | "right".',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true }, { name: 'y', type: 'number', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'size', type: 'number', unit: 'pixels', sample: '12', summary: 'How big the text is.' },
        { name: 'align', type: 'text', default: '"left"', values: ['left', 'middle', 'right'],
          summary: 'Which part of the text sits at the x you gave.' },
        { name: 'family', type: 'text', sample: '"Inter Tight"', summary: 'The font family to draw in.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}")$0', javascript: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}");$0' },
  },
  {
    id: 'drawRedraw', category: 'Drawing', signature: 'drawRedraw([target])',
    summary: 'Ask for onDraw to run again. Nothing repaints on its own; to animate, call this from onTimer.',
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
      { name: 'props', type: 'object', required: false, fields: optionFields([
        { name: 'name', type: 'text', default: 'one derived from the type', sample: '"cutoff"',
          summary: 'The control\'s name. Every other verb addresses the control by this name.' },
        { name: 'x', type: 'number', default: '0', unit: 'pixels',
          summary: 'Distance from the left edge of whatever contains it.' },
        { name: 'y', type: 'number', default: '0', unit: 'pixels',
          summary: 'Distance from the top edge.' },
        { name: 'width', type: 'number', default: 'the type\'s own', unit: 'pixels', sample: '64',
          summary: 'How wide to make it.' },
        { name: 'height', type: 'number', default: 'the type\'s own', unit: 'pixels', sample: '64',
          summary: 'How tall to make it.' },
        { name: 'parent', type: 'text', default: 'the panel itself', sample: '"row1"',
          summary: 'The name of a container to put it inside.' },
        { name: '<section>', type: 'object', group: 'any section',
          summary: 'Any section of the control, to set up as you create it — for example '
            + '{ Behavior = { min = 0, max = 127 } }. The section names are the ones set() uses.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.create("${1:Knob}", { name = "${2:cutoff}", x = 20, y = 40 })$0',
      javascript: 'ce.panel.create("${1:Knob}", { name: "${2:cutoff}", x: 20, y: 40 });$0',
    },
  },
  {
    id: 'panelClone', category: 'Panel structure', signature: 'panelClone(name, props)',
    summary: 'Copy an existing control, including its sections, and return the copy\'s name. `props` overrides properties on the copy.',
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
    summary: 'Remove a control and everything inside it. Returns true if it was there. Refuses to remove a control the author placed unless you pass its exact name — generated ones go freely.',
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
    params: [{ name: 'query', type: 'object', required: false, fields: optionFields([
      { name: 'name', type: 'text', sample: '"osc"', summary: 'Match controls whose name contains this.' },
      { name: 'type', type: 'text', sample: '"Knob"', summary: 'Match one kind of control, such as "Knob". '
        + 'ce.panel.types() lists the spellings.' },
      { name: 'generated', type: 'true or false',
        summary: 'Match only controls a script created, or only ones you placed by hand.' },
      { name: 'parent', type: 'text', sample: '"row1"',
        summary: 'Match only what is inside the container of this name.' },
    ]) }],
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
    summary: 'Every component type panelCreate accepts, as a list of names.',
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
  /* --- Panel: arranging what is there (design doc §42) ---
     stores/alignment.js is twenty-seven operations — align, distribute, match size, order, flip,
     tidy into a grid, arrange in a circle — every one on the canvas context menu and not one of
     them reachable from a script. A script that built sixteen pads computed every coordinate by
     hand, and got tidy's reading-order sort or circle's bounding-box centring subtly different.

     They were written against the editor's SELECTION, which is not a thing a script should touch,
     so the maths moved into pure functions and these verbs call the same ones with a list of NAMES.
     Six collapsed verbs rather than twenty-seven members: align(names, "left") beats alignLeft,
     and it is the shape ce.time.division and ce.music.degreeChord already use.

     Coordinates are PANEL coordinates throughout. Transform.x inside a container is
     container-relative, and aligning two controls in different containers by their local x is
     aligning nothing — so transforms are gathered with the container offset applied and written
     back through it, exactly as the canvas does. */
  {
    id: 'panelAlign', category: 'Panel structure', signature: 'panelAlign(names, edge [, opts]) -> number',
    summary: 'Align controls on one edge: "left" | "hCenter" | "right" | "top" | "vCenter" | "bottom". Default reference is the group\'s bounding box; `opts.to` names one control to align to instead (the canvas\'s key object). Returns how many moved. Names that are not controls are reported and skipped.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'edge', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'to', type: 'text', default: 'the box the whole group occupies', sample: '"cutoff"',
          summary: 'Name one of the controls to line the others up on, instead of on the group as '
            + 'a whole. This is what the canvas calls the key object.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.align({ "${1:knob1}", "${2:knob2}" }, "left")$0',
      javascript: 'ce.panel.align(["${1:knob1}", "${2:knob2}"], "left");$0',
    },
  },
  {
    id: 'panelDistribute', category: 'Panel structure', signature: 'panelDistribute(names, what [, opts]) -> number',
    summary: 'Spread controls evenly. `what` is "leftEdges" | "hCenters" | "rightEdges" | "topEdges" | "vCenters" | "bottomEdges" (even out positions) or "hSpacing" | "vSpacing" (even out the gaps between differently-sized controls). The first and last controls stay put. `opts.gap` forces a fixed gap instead of computing one; `opts.align` also lines up the cross axis. Needs at least two controls.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'what', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'gap', type: 'number', default: 'worked out from the space available', sample: '12',
          unit: 'pixels',
          summary: 'Force a fixed gap between the controls rather than spreading them to fill '
            + 'what is there.' },
        { name: 'align', type: 'text', sample: '"top"',
          summary: 'Also line them up on this edge across the other axis, so a row ends up level '
            + 'as well as evenly spaced. Takes the same words as ce.panel.align.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelMatch', category: 'Panel structure', signature: 'panelMatch(names, what [, opts]) -> number',
    summary: 'Give controls the same size: "width" | "height" | "both". The first name is the reference unless `opts.to` names another, and the reference does not resize itself. Returns how many changed.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'what', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'to', type: 'text', default: 'the first name you gave', sample: '"cutoff"',
          summary: 'Name the control whose size the others should copy. It is not resized itself.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelGrid', category: 'Panel structure', signature: 'panelGrid(names [, opts]) -> number',
    summary: 'Arrange controls into a grid. `opts` carries { columns (3), gapX (10), gapY (10) }. Cells are uniform, sized by the biggest control. Order is reading order — rows quantised to 20px, then left to right — not document order. The first control in that order anchors the origin.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'columns', type: 'number', default: '3',
          summary: 'How many controls per row.' },
        { name: 'gapX', type: 'number', default: '10', unit: 'pixels',
          summary: 'The gap between columns.' },
        { name: 'gapY', type: 'number', default: '10', unit: 'pixels',
          summary: 'The gap between rows.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.grid(pads, { columns = ${1:4}, gapX = 8, gapY = 8 })$0',
      javascript: 'ce.panel.grid(pads, { columns: ${1:4}, gapX: 8, gapY: 8 });$0',
    },
  },
  {
    id: 'panelCircle', category: 'Panel structure', signature: 'panelCircle(names [, opts]) -> number',
    summary: 'Arrange controls around a circle centred on their own bounding box. `opts` carries { radius (100), startAngle (0, degrees) }. Placement follows the order of `names`.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'radius', type: 'number', default: '100', unit: 'pixels',
          summary: 'How far from the centre to place each control.' },
        { name: 'startAngle', type: 'number', default: '0', unit: 'degrees',
          summary: 'Where the first control goes, clockwise from twelve o\'clock.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelFlip', category: 'Panel structure', signature: 'panelFlip(names, axis) -> number',
    summary: 'Mirror control positions about the centre of their bounding box — "horizontal" or "vertical". Moves the controls only; it does not rotate or mirror the controls themselves.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'axis', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'panelRect', category: 'Panel structure', signature: 'panelRect(name) -> table',
    summary: 'A control\'s position in panel coordinates: { x, y, width, height, right, bottom }. Unlike Transform.x, this accounts for container offsets. Given a list of names, returns the bounding box of the group. Returns nothing when no name resolves.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'value', required: true }],
    scopes: 'any',
  },
  {
    id: 'panelOrder', category: 'Panel structure', signature: 'panelOrder(names, where) -> number',
    summary: 'Change z-order: "front" | "forward" | "backward" | "back". Controls move within their own parent only. Later in document order paints later, so "front" is the end of the list.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'where', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'panelBatch', category: 'Panel structure', signature: 'panelBatch(fn) -> boolean',
    summary: 'Run `fn` so that everything it does is a single undo step. The history flush happens even if the callback throws. In the player there is no history and the callback simply runs.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.batch(function()\n  $0\nend)',
      javascript: 'ce.panel.batch(() => {\n  $0\n});',
    },
  },
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
    summary: 'One entry out of a collection section, or nil. The name is matched case-insensitively, like a path.',
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
    summary: 'Create an entry in a collection section, or replace an existing one. The spec is merged over the section\'s own template, so a partial spec is enough. Returns whether it landed.',
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
    summary: 'Remove an entry from a collection section. Returns whether an entry existed. Note that set(path, nil) does not remove entries; this is the verb that does.',
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
    summary: 'Change how a control looks in one of its states — hovered, pressed, disabled. The patch is merged into the existing state rather than replacing it. Returns how many entries were applied. Use `part` to patch one part of a custom component. State entries are themselves paths, which plain set() cannot address.',
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
    summary: 'The current tempo in bpm, or nil when nothing is reporting one. Read it, do not assume 120.',
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
    summary: 'Convert beats to milliseconds at the current tempo. Pass `bpm` to override. Returns nil when there is no tempo to work from.',
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
    id: 'syncTimer', category: 'Time', signature: 'syncTimer(id, beats [, opts])',
    summary: 'startTimer with a musical interval: syncTimer("step", 0.25) fires every sixteenth at the current tempo. The interval follows tempo changes; each re-arm resets the timer\'s phase. Pass { follow = false } to freeze the interval at the creation tempo. When no tempo is being reported, nothing is started and the failure is reported.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'beats', type: 'number', required: true },
      { name: 'opts', type: 'table', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'syncTimer("${1:step}", 0.25)$0', javascript: 'syncTimer("${1:step}", 0.25);$0' },
  },
  {
    id: 'afterBeats', category: 'Time', signature: 'afterBeats(beats, fn) -> id',
    summary: 'after() with a musical delay: afterBeats(2, fn) runs fn in two beats\' time. The delay is computed at call time and does not follow a later tempo change. Returns the timer id, which stopTimer cancels. When no tempo is being reported, nothing is scheduled (it does not fire immediately) and the failure is reported.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'fn', type: 'function', required: true },
    ],
    scopes: 'any',
    snippet: {
      lua: 'afterBeats(${1:2}, function()\n  $0\nend)',
      javascript: 'afterBeats(${1:2}, () => {\n  $0\n});',
    },
  },
  {
    id: 'runningTimers', category: 'Time', signature: 'runningTimers() -> list',
    summary: 'The ids of running named timers (startTimer or syncTimer), sorted. One-shot timers are not listed; after() already returns its id.',
    scopes: 'any',
    snippet: { lua: 'for _, id in ipairs(runningTimers()) do log(id) end$0', javascript: 'for (const id of runningTimers()) log(id);$0' },
  },

  /* --- Time: the grid, the clock and the transport's own arithmetic (design doc §38) ---
     Everything above answers "where is the transport NOW" or "how long is a beat". None of it
     answers where an ARBITRARY position falls, what the grid is, or what the panel's own clock
     decided — all of which utils/transportLayout.js computes and no script could reach.

     The Properties panel lets you set `division`, `swing`, `loopStartBar`, `loopLengthBars` on a
     Transport and `division`/`swing` on the Arp, Phrase and Turing. A script could SET every one
     of those and use none of them: set("arp.division", "1/8T") worked, and turning "1/8T" into a
     third of a beat did not. These are the transport's OWN functions, so a script's grid and the
     component's grid are the same grid. */
  {
    id: 'nowMs', category: 'Time', signature: 'nowMs() -> number',
    summary: 'A monotonic millisecond reading. The origin is arbitrary; only differences are meaningful. Not a wall clock or date.',
    scopes: 'any',
    snippet: { lua: 'local t0 = nowMs()$0', javascript: 'const t0 = nowMs();$0' },
  },
  {
    id: 'beatsPerDivision', category: 'Time', signature: 'beatsPerDivision(name) -> number',
    summary: 'A note division as a fraction of a beat: "1/16" → 0.25, "1/8T" → 0.333…, "1/4D" → 1.5. The same names every sequencer property uses. Returns nothing for a name this build does not know.',
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'local beats = beatsPerDivision("1/16")$0', javascript: 'const beats = beatsPerDivision("1/16");$0' },
  },
  {
    id: 'divisionNames', category: 'Time', signature: 'divisionNames() -> list',
    summary: 'Every division this build knows, in picker order: { id, label, beats }. Build menus from this list rather than hard-coding the names.',
    scopes: 'any',
    snippet: { lua: 'for _, d in ipairs(divisionNames()) do log(d.label) end$0', javascript: 'for (const d of divisionNames()) log(d.label);$0' },
  },
  {
    id: 'barBeatAt', category: 'Time', signature: 'barBeatAt(beats [, beatsPerBar]) -> table',
    summary: 'Convert any beat position to a musical position: { bar, beat, tick, text, beatsPerBar }. Bars and beats are 1-based; ticks are at 24 ppqn. `text` is the Transport component\'s own readout format ("3.2.00").',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'beatsPerBar', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'log(barBeatAt(transportInfo().beats).text)$0', javascript: 'log(barBeatAt(transportInfo().beats).text);$0' },
  },
  {
    id: 'stepAt', category: 'Time', signature: 'stepAt(beats, division) -> number',
    summary: 'Which step of the grid a position is on, counting from 0 at the transport origin. Returns nothing for an unknown division.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'division', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'stepsBetween', category: 'Time', signature: 'stepsBetween(from, to, division [, max]) -> table',
    summary: 'Count step boundaries crossed between two beat positions: { steps, dropped }. Use it to catch up steps a late frame slept through. `max` caps the catch-up (default 16); anything over the cap is counted in `dropped`, and the most recent steps are the ones kept.',
    params: [
      { name: 'from', type: 'number', required: true },
      { name: 'to', type: 'number', required: true },
      { name: 'division', type: 'string', required: true },
      { name: 'max', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'swingOffset', category: 'Time', signature: 'swingOffset(step, amount, division) -> number',
    summary: 'The swing offset for a step, in beats, to add to that step\'s position: every odd step is pushed later by up to half a step. `amount` is 0..1, the same number the Transport\'s swing property holds. Uses the transport\'s own swing calculation.',
    params: [
      { name: 'step', type: 'number', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'division', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'cycleAt', category: 'Time', signature: 'cycleAt(beats, bars [, beatsPerBar]) -> table',
    summary: 'Position within a repeating cycle of `bars` bars: { phase, count, length }. `phase` is 0–1 through the cycle, `count` how many have completed, `length` the cycle in beats. Derived from the position, never accumulated, so it stays exact over long runs.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'bars', type: 'number', required: true },
      { name: 'beatsPerBar', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'loopedBeats', category: 'Time', signature: 'loopedBeats(beats, startBeats, lengthBeats) -> table',
    summary: 'Fold a timeline position into a loop: { beats, pass }. Positions before the loop start are returned untouched, so a run-in or count-in works. `pass` is which time round the loop you are, and -1 before the loop is reached; watch it for changes to detect a wrap. The looped position is a pure function of the un-looped one, so it stays exact over long runs.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'startBeats', type: 'number', required: true },
      { name: 'lengthBeats', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'tapTempo', category: 'Time', signature: 'tapTempo(times [, resetMs]) -> number',
    summary: 'Tempo from a list of tap times, in the milliseconds now() reports. Taps more than `resetMs` apart (default 2000) start a new measurement rather than averaging across the pause. Returns nothing from fewer than two usable taps; the result is clamped to 20–300 bpm.',
    params: [
      { name: 'times', type: 'list', required: true },
      { name: 'resetMs', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'clockTempo', category: 'Time', signature: 'clockTempo(intervalsMs) -> number',
    summary: 'Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note), e.g. 0xF8 intervals collected with ce.midi.interceptIn. Uses the median interval, so one late pulse does not skew the result. Returns nothing from an empty list.',
    params: [{ name: 'intervalsMs', type: 'list', required: true }],
    scopes: 'any',
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
    summary: 'The profile\'s parameter descriptors: { id, name, group, type, min, max, access }. `opts` may carry { role, query, group, type, access, limit } to narrow the list. Returns an empty list, not nil, when there is nothing to report; returns nil when ce.device is gated off.',
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      'role',
      { name: 'query', type: 'text', sample: '"cutoff"',
        summary: 'Keep only parameters whose name or id contains this.' },
      { name: 'group', type: 'text', sample: '"Filter"',
        summary: 'Keep only one group, the way the synth itself files them — "Oscillator", '
          + '"Filter" and so on.' },
      { name: 'type', type: 'text', sample: '"number"',
        summary: 'Keep only one kind of parameter, such as "number" or "choice".' },
      { name: 'access', type: 'text', sample: '"readwrite"',
        summary: 'Keep only parameters you can read, write, or both.' },
      { name: 'limit', type: 'number', default: 'no limit', sample: '50',
        summary: 'Return at most this many. Useful on a synth with hundreds.' },
    ]) }],
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
    summary: 'The last reported value of a device parameter, from a dump or a parameter message. Not a live query of the synth. Returns nothing if the device has never reported it — distinct from zero.',
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
    summary: 'Set a device parameter on the synth by parameter id; no control binding is required. The device profile encodes the message. Returns whether the message was dispatched, not whether the synth accepted it. `value` is in the parameter\'s own units, the ones deviceParameter() reports min and max for.',
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
    signature: 'deviceDefineParameter(id, spec [, role]) -> boolean',
    summary: 'Declare a device parameter at runtime, for a synth with no shipped profile. `spec` gives the wire format — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — plus name/group/type/min/max for what parameters() reports. A spec with no wire format is refused, and the refusal says why. A declared id overrides a profile one, so a script can correct one wrong parameter without redeclaring the rest. Sysex template tokens: a hex literal, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'spec', type: 'object', required: true, fields: optionFields([
        { name: 'name', type: 'text', default: 'the id', sample: '"Cutoff"',
          summary: 'What to call it in the parameter list.' },
        { name: 'group', type: 'text', sample: '"Filter"', summary: 'Which group to file it under, such as "Filter".' },
        { name: 'type', type: 'text', default: '"number"',
          summary: 'What kind of value it holds — a number, or a choice from `choices`.' },
        { name: 'min', type: 'number', default: '0', summary: 'The lowest value it accepts.' },
        { name: 'max', type: 'number', default: '127',
          summary: 'The highest value it accepts.' },
        { name: 'access', type: 'text', default: '"readwrite"',
          summary: 'Whether the synth lets you read this parameter, write it, or both.' },
        { name: 'choices', type: 'list of text',
          summary: 'The names of the settings, in order, when the parameter is a choice rather '
            + 'than a number.' },
        { name: 'cc', type: 'number', sample: '74', group: 'how it reaches the synth — pick one',
          summary: 'Send it as this CC number. The simplest of the three wire formats.' },
        { name: 'nrpn', type: 'object', group: 'how it reaches the synth — pick one',
          summary: 'Send it as an NRPN, as { msb, lsb }.' },
        { name: 'sysex', type: 'list', group: 'how it reaches the synth — pick one',
          summary: 'Send it as a SysEx message built from this template. Entries are hex literals '
            + 'or one of the tokens $value, $deviceId, $checksumStart, $checksum, or any $name you '
            + 'listed in `variables`.' },
        { name: 'channel', type: 'number', default: 'the panel\'s channel', sample: '1',
          summary: 'The MIDI channel to send on.' },
        { name: 'encoding', type: 'text', sample: '"to14bit"',
          summary: 'How the number is packed into bytes when one byte is not enough — the same '
            + 'names ce.midi\'s encoders use.' },
        { name: 'checksum', type: 'text', sample: '"roland-7bit"',
          summary: 'Which checksum to compute for a SysEx template that asks for one. The names '
            + 'are ce.midi.checksum\'s.' },
        { name: 'variables', type: 'object',
          summary: 'Extra named values your SysEx template can refer to as $name, such as an '
            + 'address or a part number.' },
      ]) },
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
    signature: 'deviceDefineDump(kind, spec [, role]) -> boolean',
    summary: 'Declare a SysEx dump layout at runtime: `request` (the bytes that ask for it), `match` ({ prefix, suffix }), `offset`/`size` for the payload, an optional `checksum`, and `fields` — one { parameter, offset } per value the dump carries. Every field must name a parameter already declared with defineParameter; an unknown one is refused. A declared layout is matched against arriving SysEx, fills the bound controls and raises onDumpReceived, exactly as a profile-defined dump does.',
    params: [
      { name: 'kind', type: 'string', required: true },
      { name: 'spec', type: 'object', required: true, fields: optionFields([
        { name: 'name', type: 'text', default: 'the kind', sample: '"Patch"',
          summary: 'What to call this dump where it is listed.' },
        { name: 'request', type: 'text or list', summary: 'The bytes that ask the synth for it.' },
        { name: 'match', type: 'object', required: true,
          summary: 'How to recognise the reply, as { prefix, suffix } — the bytes a matching '
            + 'message starts and ends with.' },
        { name: 'offset', type: 'number', default: '0',
          summary: 'How many bytes in from the start the payload begins.' },
        { name: 'size', type: 'number', default: 'whatever is left', sample: '256',
          summary: 'How many bytes of payload there are.' },
        { name: 'checksum', type: 'text', sample: '"roland-7bit"',
          summary: 'Which checksum the message carries, so it can be verified. The names are '
            + 'ce.midi.checksum\'s.' },
        { name: 'fields', type: 'list of objects', required: true,
          summary: 'Where each value sits inside the payload, one { parameter, offset } per '
            + 'value. Every parameter must already be declared with defineParameter; an unknown '
            + 'name is refused.' },
      ]) },
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
    signature: 'deviceBind(control, parameterId [, opts]) -> boolean',
    // Panel view only for the same reason ce.panel.create is: the binding lives on the control
    // model, and there is no control model with the window shut.
    runtime: RUNTIME_WEBVIEW,
    summary: 'Wire a control to a device parameter at runtime. Replaces whatever was bound to the same port rather than adding a second binding, and switches DeviceBindings back on if the control had it off. `opts` takes { role, port }; port defaults to "value".',
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'parameterId', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        'role',
        { name: 'port', type: 'text', default: '"value"',
          summary: 'Which part of the control is wired up. Binding again on the same port '
            + 'replaces the old binding rather than adding a second one.' },
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.bind("${1:cutoffKnob}", "${2:cutoff}")$0',
      javascript: 'ce.device.bind("${1:cutoffKnob}", "${2:cutoff}");$0',
    },
  },
  {
    id: 'deviceUnbind', category: 'Device / MIDI',
    signature: 'deviceUnbind(control [, port]) -> boolean',
    runtime: RUNTIME_WEBVIEW,
    summary: 'Remove a control\'s device binding. Returns whether there was one to remove.',
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
    id: 'devicePorts', category: 'Device / MIDI', signature: 'devicePorts([opts]) -> list',
    summary: 'Enumerate the MIDI ports: [{ id, name, direction, type, hardware, role }]. `hardware` is false for the two placeholder rows the app always lists ("No MIDI Input", "Preview Only"); `role` is the role currently using the port, or empty. `opts.direction` narrows to "in" or "out".',
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'direction', type: 'text', values: ['in', 'out'],
        summary: 'List only the ports that receive, or only the ones that send.' },
    ]) }],
    scopes: 'any',
    snippet: {
      lua: 'for _, p in ipairs(ce.device.ports({ direction = "out" })) do\n  if p.hardware then log(p.name) end\nend$0',
      javascript: 'for (const p of ce.device.ports({ direction: "out" })) if (p.hardware) log(p.name);$0',
    },
  },
  {
    id: 'deviceVariables', category: 'Device / MIDI', signature: 'deviceVariables([role]) -> table',
    summary: 'The variables every message recipe interpolates — `channel`, `deviceId` and whatever else the profile declares — as their effective values: the profile\'s defaults with this project\'s overrides applied. Returns nothing when no profile is mapped to the role.',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'log("device id " .. tostring(ce.device.variables().deviceId))$0',
      javascript: 'log(`device id ${ce.device.variables().deviceId}`);$0',
    },
  },
  {
    id: 'deviceSetVariable', category: 'Device / MIDI',
    signature: 'deviceSetVariable(name, value [, role]) -> boolean',
    summary: 'Set one recipe variable, 0..127 — e.g. to point this panel at a different unit. The write lands on this project\'s override, not on the shared profile, so two panels can use different device ids for the same synth. Individual uses clamp further (a channel is 1..16).',
    requiresDeviceHost: true,
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'value', type: 'number', required: true },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.setVariable("deviceId", 17)$0',
      javascript: 'ce.device.setVariable("deviceId", 17);$0',
    },
  },
  {
    id: 'deviceTiming', category: 'Device / MIDI', signature: 'deviceTiming([role]) -> table',
    summary: 'How fast the panel is allowed to talk to this device: `minDelayBetweenMessagesMs` and any other timing the profile declares, with this project\'s overrides applied.',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'log("gap " .. tostring(ce.device.timing().minDelayBetweenMessagesMs) .. " ms")$0',
      javascript: 'log(`gap ${ce.device.timing().minDelayBetweenMessagesMs} ms`);$0',
    },
  },
  {
    id: 'deviceSetTiming', category: 'Device / MIDI',
    signature: 'deviceSetTiming(name, ms [, role]) -> boolean',
    summary: 'Set one timing override for this project, in milliseconds, 0..60000 — e.g. to slow the panel down for a device that cannot keep up. As with setVariable, the profile itself is not modified.',
    requiresDeviceHost: true,
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'ms', type: 'number', required: true },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.setTiming("minDelayBetweenMessagesMs", 40)$0',
      javascript: 'ce.device.setTiming("minDelayBetweenMessagesMs", 40);$0',
    },
  },
  {
    id: 'deviceCoverage', category: 'Device / MIDI',
    signature: 'deviceCoverage([feature [, role]]) -> table|string',
    summary: 'The profile\'s self-reported feature coverage, as strings rather than booleans. With no feature, returns the whole map — `singleParameterWrite`, `realtimeEditing`, `editBufferDumpParse` and so on. Profiles answer "complete", "partial" and "notImplemented", but also free-form values such as "filter-block-rq1". Test the words you care about.',
    requiresDeviceHost: true,
    params: [
      { name: 'feature', type: 'string', required: false },
      { name: 'role', type: 'string', required: false },
    ],
    scopes: 'any',
    snippet: {
      lua: 'if ce.device.coverage("singleParameterWrite") == "complete" then log("write one at a time") end$0',
      javascript: 'if (ce.device.coverage("singleParameterWrite") === "complete") log("write one at a time");$0',
    },
  },
  {
    id: 'deviceRecipes', category: 'Device / MIDI', signature: 'deviceRecipes([role]) -> list',
    summary: 'The ids of the message recipes this profile can build — the templates its parameters send through. An empty list when no profile is mapped.',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'for _, id in ipairs(ce.device.recipes()) do log(id) end$0',
      javascript: 'for (const id of ce.device.recipes()) log(id);$0',
    },
  },
  {
    id: 'deviceRequests', category: 'Device / MIDI', signature: 'deviceRequests([role]) -> list',
    summary: 'The ids of the named requests this profile can send — an identity enquiry, an edit-buffer request. Ask before assuming one exists.',
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'for _, id in ipairs(ce.device.requests()) do log(id) end$0',
      javascript: 'for (const id of ce.device.requests()) log(id);$0',
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
    summary: 'Send a registered parameter number (RPN): the standard path for pitch-bend range (0,0), fine tuning (0,1) and coarse tuning (0,2). Same shape as sendNRPN, but uses CC 101/100 instead of 99/98.',
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
    summary: 'Send a Song Position Pointer: where the next start or continue resumes from, in MIDI beats (one beat = six clocks = a sixteenth note).',
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
    summary: 'Note on. `note` is a MIDI number or a name ("C3"). Velocity 0 is a note off. Give `ms` and the matching note off is scheduled automatically.',
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
    summary: 'Intercept inbound MIDI before the panel\'s bindings, note input and transport see it. '
      + 'fn(bytes) returns replacement bytes to rewrite the message, false to swallow it, or nothing '
      + 'to pass it through.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiIn(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiIn((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'interceptMidiOut', category: 'Device / MIDI', signature: 'interceptMidiOut(fn)',
    summary: 'Intercept outbound MIDI — every message the panel sends, from a script or from a '
      + 'control\'s own binding. fn(bytes) returns replacement bytes to rewrite the message, false '
      + 'to swallow it, or nothing to pass it through.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiOut(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiOut((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'feedMidi', category: 'Device / MIDI', signature: 'feedMidi(bytes)',
    summary: 'Inject a message as if it had arrived from the hardware: the panel\'s own bindings, '
      + 'note input and transport all act on it. Inbound intercepts and filters run on it, so a fed '
      + 'message obeys the same rules as a real one.',
    params: [{ name: 'bytes', type: 'value', required: true }],
    scopes: 'any',
    snippet: { lua: 'feedMidi(${1:{0x90, 60, 100\}})$0', javascript: 'feedMidi([${1:0x90, 60, 100}])$0' },
  },
  {
    id: 'routeMidi', category: 'Device / MIDI', signature: 'routeMidi(role, fn)',
    summary: 'Send everything inside `fn` to a named device role instead of the default device. '
      + 'Block-scoped, the same shape noTransmit() uses.',
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
    summary: 'Note off. Release velocity defaults to 0. Nothing schedules this for you: send it for every note you start.',
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
    summary: 'Program change, with an optional bank select (CC 0 / CC 32) sent first.',
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
    summary: 'Pitch bend as the raw 14-bit value: 0–16383, centre 8192. How many semitones that spans depends on the synth\'s bend range.',
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
    summary: 'Send a raw SysEx message.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendSysex(${1:bytes})$0', javascript: 'sendSysex(${1:bytes})$0' },
  },
  {
    id: 'checksum', category: 'Device / MIDI', signature: 'checksum(type, bytes [, opts]) -> number',
    summary: 'Compute the checksum a synth expects at the end of a message. Eleven methods: "sum-7bit", "roland-7bit" (also spelled "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" and "crc32"; a name not on the list returns nothing and reports the accepted names. The 7-bit methods fit in a single SysEx byte, the CRCs do not — pass CRC results through to7bit() before sending.',
    params: [
      { name: 'type', type: 'string', required: true,
        values: ['sum-7bit', 'roland-7bit', 'ones-complement-7bit', 'xor-7bit', 'offset-7bit',
          'sum-8bit', 'twos-complement-8bit', 'crc8', 'crc16-ccitt', 'crc16-modbus', 'crc32'] },
      { name: 'bytes', type: 'bytes', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'offset', type: 'number', default: '0',
          summary: 'The constant the "offset-7bit" method subtracts from. Only that method reads '
            + 'it; the value varies by manufacturer.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'checksum("${1:roland}", ${2:bytes})$0', javascript: 'checksum("${1:roland}", ${2:bytes})$0' },
  },
  {
    id: 'panic', category: 'Device / MIDI', signature: 'panic([opts])',
    summary: 'Silence the rig: All Sound Off (120), then All Notes Off (123), then Reset All Controllers (121). Defaults to all 16 channels; pass { channel } for one, { resetControllers: false } to skip 121.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'channel', type: 'number', default: 'all sixteen channels', sample: '1',
        summary: 'Silence one channel instead of every one.' },
      { name: 'resetControllers', type: 'true or false', default: 'true',
        summary: 'Whether to send Reset All Controllers (121) as well as the two note-off '
          + 'messages. Set false to leave pitch bend and modulation where they are.' },
    ]) }],
    scopes: 'any',
    snippet: { lua: 'panic()$0', javascript: 'panic()$0' },
  },

  /* --- Storage --- */
  // Two different lifetimes, deliberately named apart. `state` is a scratchpad that lives as long
  // as the script is loaded; settings outlive the session. Language globals happened to give you
  // the first one already, but nothing said so, which made it undefined behaviour people relied on.
  {
    id: 'state', category: 'Storage', signature: 'state',
    summary: 'A table that persists between handler calls, private to this script. Cleared when the script reloads; use saveSetting for anything that must outlive the session.',
    params: [],
    scopes: 'any',
    snippet: { lua: 'state.${1:count} = (state.${1:count} or 0) + 1$0', javascript: 'state.${1:count} = (state.${1:count} ?? 0) + 1;$0' },
  },
  {
    id: 'saveSetting', category: 'Storage', signature: 'saveSetting(key, value [, opts]) -> boolean',
    summary: 'Save a value persistently. In the editor a panel-scope setting is stored with the panel and travels with it; in an exported plugin it is stored in the host\'s project. Returns false when storage is unavailable.',
    params: [
      { name: 'key', type: 'string', required: true },
      { name: 'value', type: 'value', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) },
    ],
    scopes: 'any',
    snippet: { lua: 'saveSetting("${1:key}", ${2:value})$0', javascript: 'saveSetting("${1:key}", ${2:value})$0' },
  },
  {
    id: 'loadSetting', category: 'Storage', signature: 'loadSetting(key [, fallback [, opts]])',
    summary: 'Read back a value saved with saveSetting. Returns `fallback` when the key has never been written. `opts.scope` must match the scope the value was saved in — the same key in different scopes names different values.',
    params: [
      { name: 'key', type: 'string', required: true },
      { name: 'fallback', type: 'value', required: false },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) },
    ],
    scopes: 'any',
    snippet: { lua: 'local ${1:v} = loadSetting("${2:key}", ${3:default})$0', javascript: 'const ${1:v} = loadSetting("${2:key}", ${3:default});$0' },
  },
  // The other two thirds of an interface. saveSetting/loadSetting could write and read a key and
  // nothing could list or delete one, so a panel storing per-preset settings could never clean up
  // after itself and could not show somebody what it had kept.
  {
    id: 'listSettings', category: 'Storage', signature: 'listSettings([opts]) -> list',
    summary: 'List every key saved in one scope, in no particular order. An empty list means nothing has been written; use storageInfo() to check whether storage is available. `opts.scope` as elsewhere; a panel-scope listing omits other scripts\u2019 private keys.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }], scopes: 'any',
    snippet: { lua: 'for _, k in ipairs(ce.storage.settings()) do $0 end', javascript: 'for (const k of ce.storage.settings()) { $0 }' },
  },
  {
    id: 'forgetSetting', category: 'Storage', signature: 'forgetSetting(key [, opts]) -> boolean',
    summary: 'Delete a saved setting. Returns whether a value existed to delete. `opts.scope` as elsewhere.',
    params: [
      { name: 'key', type: 'string', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) },
    ], scopes: 'any',
    snippet: { lua: 'ce.storage.forget("${1:key}")$0', javascript: 'ce.storage.forget("${1:key}");$0' },
  },
  /* --- Storage: scopes, bulk and JSON (design doc §43) ---
     `state` was per-script and said so. Settings were panel-wide and said NOTHING, so two scripts
     both saving "count" clobbered each other in silence — an asymmetry nobody had written down.

     Three scopes now, differing in who sees a value and where it lives. `scope` is an option on
     every settings verb, defaulting to "panel", which is exactly what settings have always been:
       · "panel"  — shared by every script on the panel, in the document, travels with it.
       · "script" — private to the calling script, the way `state` already is.
       · "local"  — THIS MACHINE only, never written into the document. A panel you send somebody
                    should not carry your MIDI port choice with it.
     A scope this build does not know is REFUSED rather than quietly treated as "panel": storing a
     value somewhere the caller did not ask for is how a private setting becomes a shared one. */
  {
    id: 'allSettings', category: 'Storage', signature: 'allSettings([opts]) -> table',
    summary: 'Every setting in one scope, as a table of key to value. `opts.scope` is "panel" (default), "script" or "local". A panel-scope listing omits other scripts’ private keys.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
    snippet: {
      lua: 'for k, v in pairs(ce.storage.all()) do log(k, v) end$0',
      javascript: 'for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);$0',
    },
  },
  {
    id: 'clearSettings', category: 'Storage', signature: 'clearSettings([opts]) -> number',
    summary: 'Delete every setting in one scope; returns how many were deleted. Panel scope leaves other scripts’ private keys untouched.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'storageInfo', category: 'Storage', signature: 'storageInfo([opts]) -> table',
    summary: 'Describe a scope\'s store: { scope, backing, available, count, bytes }. `backing` names where values live — the panel document, this machine, or the DAW project state. `available` false means writes in this scope will not persist.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'encodeJson', category: 'Storage', signature: 'encodeJson(value [, opts]) -> string',
    summary: 'Encode a value as JSON text. `opts.indent` pretty-prints with that many spaces. Returns nothing for a value with no JSON form — a cycle, a function. Identical in every runtime, including Lua, which has no json module of its own.',
    params: [
      { name: 'value', type: 'value', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'indent', type: 'number', default: '0',
          summary: 'Lay the JSON out over several lines, indented by this many spaces. 0 keeps it '
            + 'on one line.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'sendSysex(toAscii(ce.storage.encode(patch)))$0', javascript: 'sendSysex(toAscii(ce.storage.encode(patch)));$0' },
  },
  {
    id: 'decodeJson', category: 'Storage', signature: 'decodeJson(text) -> value',
    summary: 'Decode JSON text into a value. Invalid JSON returns nothing. A JSON null also decodes to nothing: {"a":1,"b":null} arrives with one key and [1,null,2] with two entries, so encode-then-decode is not a full round trip where nulls are involved.',
    params: [{ name: 'text', type: 'string', required: true }],
    scopes: 'any',
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
    summary: 'Print at warning level: something is off but the panel carries on. Rendered distinctly from log() in the console.',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'value', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.warn("${1:message}")$0', javascript: 'ce.core.warn("${1:message}")$0' },
  },
  {
    id: 'logError', category: 'Debug', signature: 'logError(message [, value])',
    summary: 'Print at error level: something the panel could not do. Prints without throwing — the handler continues. To stop the handler, use your language\'s own error()/throw.',
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
  panelVerb('recorderSource', 'recorderSource(target, source)',
    `Choose what gets recorded — ${oneOf(HAND_WRITTEN_VALUES['recorder.source'])}.`,
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
  panelVerb('harmonyMode', 'harmonyMode(target, mode)',
    `Harmoniser mode — ${oneOf(HAND_WRITTEN_VALUES['harmony.mode'])}.`,
    [T, { name: 'mode', type: 'string', required: true }]),
  panelVerb('harmonyKey', 'harmonyKey(target, key)', 'Re-key the harmoniser mid-song.',
    [T, { name: 'key', type: 'string', required: true }]),
  panelVerb('harmonyScale', 'harmonyScale(target, scale)', 'Change the scale the harmony follows.',
    [T, { name: 'scale', type: 'string', required: true }]),
  panelVerb('harmonySize', 'harmonySize(target, size)', 'How many voices to add.',
    [T, { name: 'size', type: 'number', required: true }]),
  panelVerb('harmonyShape', 'harmonyShape(target, shape)', 'Apply a named chord shape / preset.',
    [T, { name: 'shape', type: 'string', required: true }]),
  panelVerb('harmonyVoicing', 'harmonyVoicing(target, voicing)',
    `Voicing spread — ${oneOf(HAND_WRITTEN_VALUES['harmony.voicing'])}.`,
    [T, { name: 'voicing', type: 'string', required: true }]),
  panelVerb('harmonyInversion', 'harmonyInversion(target, inversion)', 'Chord inversion.',
    [T, { name: 'inversion', type: 'number', required: true }]),
  panelVerb('harmonyOctave', 'harmonyOctave(target, octave)', 'Octave offset for the added voices.',
    [T, { name: 'octave', type: 'number', required: true }]),
  panelVerb('harmonyOutOfKey', 'harmonyOutOfKey(target, mode)',
    `What to do with out-of-key notes — ${oneOf(HAND_WRITTEN_VALUES['harmony.outOfKey'])}.`,
    [T, { name: 'mode', type: 'string', required: true }]),
  panelVerb('harmonyKeepPlayed', 'harmonyKeepPlayed(target [, keep])', 'Keep or drop the note actually played.',
    [T, { name: 'keep', type: 'boolean', required: false }]),
  panelVerb('harmonyChannel', 'harmonyChannel(target, channel)', 'MIDI channel for the harmony voices.',
    [T, { name: 'channel', type: 'number', required: true }]),
  panelVerb('harmonyVoiceLeading', 'harmonyVoiceLeading(target, mode)',
    `Voice-leading strategy — ${oneOf(HAND_WRITTEN_VALUES['harmony.voiceLeading'])}.`,
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

  /* --- Reading the five (design doc §44) ---
     Every component member in the API was a WRITE. The twenty-three spec-driven families now read
     by VERB name, because their spec knows which field each verb writes; these five predate that
     spec and have no such map, so they read by the MODEL field name — which is the name their own
     summaries already use. `read(target)` with no field is the whole section either way, so the
     one shape a script is most likely to want is the same across all twenty-eight. */
  panelVerb('splitRead', 'splitRead(target [, field])',
    'Read the Zone Splitter\'s settings — the whole section, or one field by name (`zones`, `preset`). '
    + 'Fields are addressed by model field name, not by verb name.',
    [T, { name: 'field', type: 'string', required: false }]),
  panelVerb('phraseRead', 'phraseRead(target [, field])',
    'Read the Phrase Sequencer\'s settings — the whole section, or one field by name.',
    [T, { name: 'field', type: 'string', required: false }]),
  panelVerb('recorderRead', 'recorderRead(target [, field])',
    'Read the Phrase Recorder\'s state — the whole section, or one field by name. Includes '
    + 'recording status and the take contents.',
    [T, { name: 'field', type: 'string', required: false }]),
  panelVerb('harmonyRead', 'harmonyRead(target [, field])',
    'Read the Harmoniser\'s settings — the whole section, or one field by name.',
    [T, { name: 'field', type: 'string', required: false }]),
  panelVerb('setlistRead', 'setlistRead(target [, field])',
    'Read the Setlist — the whole section, or one field by name. `scenes` is the scene list; '
    + '`index` is the current position.',
    [T, { name: 'field', type: 'string', required: false }]),

  // --- Panel values: snapshot / restore ---
  // The two members of ce.panel that are NOT panel-view only. Creating a control needs a renderer;
  // reading and writing a value does not, and "put the panel back how it was before the solo" is a
  // footswitch action in a DAW with the window shut — which is exactly where it has to work.
  {
    id: 'panelSnapshot', category: 'Panel components', signature: 'panelSnapshot() -> object',
    summary: 'Every control\'s current value, as an object keyed by control name. Controls with no value of their own are omitted. Pair it with saveSetting to persist one, or hold it in `state` for an A/B compare.',
    params: [], scopes: 'any',
    snippet: { lua: 'local before = ce.panel.snapshot()$0', javascript: 'const before = ce.panel.snapshot();$0' },
  },
  {
    id: 'panelEach', category: 'Panel components', signature: 'panelEach(fn) -> number',
    summary: 'Call `fn(name)` once for every control in the panel, containers included, in document order. Returns how many there were. Works in any runtime. To inspect a control rather than list its name, use ce.panel.info() — which is panel view only.',
    params: [{ name: 'fn', type: 'function', required: true }], scopes: 'any',
    snippet: {
      lua: 'ce.panel.each(function(name)\n  $0\nend)',
      javascript: 'ce.panel.each(function (name) {\n  $0\n});',
    },
  },
  {
    id: 'panelRestore', category: 'Panel components', signature: 'panelRestore(snapshot) -> number',
    summary: 'Write snapshot values back to the panel; returns how many landed. A name the panel no longer has is skipped rather than failing the whole restore.',
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
    summary: 'Apply a named response curve: "linear", "exp", "log" or "s". An unknown name is reported and treated as linear. For other shapes use map().' },
  { id: 'lerp', category: 'Value / range', signature: 'lerp(a, b, t)', summary: 'Blend between a and b by t (0–1).' },
  // wrap, and why it is not `%`. The five runtimes DISAGREE about the sign of a modulo: (-1) % 12
  // is 11 in Lua and Python and -1 in JavaScript, C++, C# and Java. So the ordinary way to write a
  // pitch class — (note + transpose) % 12 — already gives two different answers depending on which
  // engine the panel is running in, and nothing said so. This is the one arithmetic a synth panel
  // does constantly, which is why it belongs to the module rather than to each panel.
  { id: 'wrap', category: 'Value / range', signature: 'wrap(v, lo, hi)',
    summary: 'Wrap a value into a half-open range: wrap(12, 0, 12) is 0, wrap(-1, 0, 12) is 11. Use for pitch classes, LFO phase and step indices instead of the language\'s %, whose sign on negatives differs between runtimes — the same expression gives 11 in Lua and -1 in JavaScript.' },
  // map, and why `curve` was not enough. curve() is a CLOSED set of four names, so a taper it does
  // not have could not be expressed at all — and a properties panel cannot hold an arbitrary curve
  // either, since a property stores a constant. Breakpoints are the smallest thing that can.
  { id: 'mapCurve', category: 'Value / range', signature: 'mapCurve(v, points)',
    summary: 'A response curve of your own: straight lines through breakpoints, given as {{x, y}, …} — map(v, {{0,0},{0.5,0.9},{1,1}}) is a knob that opens fast and finishes slowly. Points are sorted by x, so the order you write them in does not matter; outside the outermost points the value is held rather than extrapolated. Two points with the same x is a step, and the later one wins.' },
  { id: 'quantizeTo', category: 'Value / range', signature: 'quantizeTo(v, values)',
    summary: 'Snap to the nearest value in a list, rather than to a regular step: quantizeTo(9, {0, 8, 16}) is 8. snap() covers evenly spaced settings; this covers the ones a synth actually has. A tie goes to the lower value, so the result never depends on rounding.' },
  { id: 'randomChoice', category: 'Value / range', signature: 'randomChoice(values [, weights])',
    summary: 'Pick one of a list, using the seeded generator — so a "random" patch replays. With `weights`, the chance of each is its weight over the total; a missing or negative weight counts as zero, and all-zero weights fall back to an even pick. Exactly one number is drawn from the generator either way, so adding weights does not change what everything after it picks.' },
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
    summary: 'A value to its 0–1 position in a range, clamped. scale(v, lo, hi, 0, 1) is the hand-rolled version and it does not clamp, so a value past the end came out past 1 and stayed wrong all the way down the chain. The value model already has a .normalizedValue face; this is that conversion for numbers a script is holding itself.' },
  { id: 'denorm', category: 'Value / range', signature: 'denorm(t, lo, hi)',
    summary: 'The inverse: a 0–1 position back into a range, clamped at both ends.' },
  { id: 'bipolar', category: 'Value / range', signature: 'bipolar(t)',
    summary: '0–1 to -1..+1. The two shapes a modulation source is ever in, and the conversion sits in the middle of every modulation script.' },
  { id: 'unipolar', category: 'Value / range', signature: 'unipolar(v)',
    summary: '-1..+1 back to 0–1.' },
  { id: 'fold', category: 'Value / range', signature: 'fold(v, lo, hi)',
    summary: 'Come back off the end of a range instead of round it. wrap() jumps from the top to the bottom, which is right for a pitch class and wrong for a modulation depth — a fold reflects, so the movement stays continuous. Wave folding is the audible version of the same idea, and neither is expressible with the language\'s %.' },
  { id: 'indexOfRange', category: 'Value / range', signature: 'indexOfRange(t, count)',
    summary: 'A 0–1 position to one of `count` slots, zero-based — which preset, which step, which pad. The hand-rolled floor(t * count) returns `count` itself at exactly 1.0, one past the end of the list it is addressing, and that off-by-one only appears when a knob is turned fully up.' },
  { id: 'crossfade', category: 'Value / range', signature: 'crossfade(a, b, t [, law])',
    summary: 'Blend a to b with a fade law: "linear", "equalPower" or "sharp" — the same three the Crossfader component has, which a script could not compute. equalPower is the one that matters: a linear fade between two sounds dips in the middle, audibly, which is why the component defaults away from it.' },
  { id: 'approach', category: 'Value / range', signature: 'approach(current, target, maxStep)',
    summary: 'Move toward a target, no further than maxStep in one call. A rate limit with no state of its own, so it works from any handler without the script keeping a timer — ce.anim owns motion the runtime drives, this is the one a script drives itself, per incoming message. How you smooth a jumpy expression pedal.' },
  { id: 'roundTo', category: 'Value / range', signature: 'roundTo(v, decimals)',
    summary: 'Round to a number of decimal places, for a readout. JavaScript\'s toFixed returns a string and Lua has no equivalent at all, so every panel showing a tidy number wrote this itself.' },
  { id: 'almost', category: 'Value / range', signature: 'almost(a, b [, epsilon])',
    summary: 'Float comparison that means what == is assumed to mean. A panel compares values constantly — has this reached its target, is this at the detent — and every one of those values arrived through a scale() or a curve().' },
  { id: 'minOf', category: 'Value / range', signature: 'minOf(values)',
    summary: 'The smallest in a list, or nil for an empty one. Lua\'s math.min takes varargs, so over a table it needs table.unpack and falls over on a long one; JavaScript needs a spread with the same limit. A panel deals in lists constantly — macro slots, matrix rows, envelope points, the values out of a dump.' },
  { id: 'maxOf', category: 'Value / range', signature: 'maxOf(values)', summary: 'The largest in a list, or nil for an empty one.' },
  { id: 'sumOf', category: 'Value / range', signature: 'sumOf(values)', summary: 'The total of a list. Zero for an empty one — a sum of nothing is nothing, not an absence.' },
  { id: 'meanOf', category: 'Value / range', signature: 'meanOf(values)', summary: 'The average of a list, or nil for an empty one — unlike a sum, an average of nothing does not exist.' },
  // `a, b` said nothing about these being LISTS, and with no return annotation the signature read
  // like lerp's. Passing two numbers returns an empty list, which is correct and baffling.
  { id: 'blend', category: 'Value / range', signature: 'blend(fromList, toList, t) -> list',
    summary: 'Morph one list of values into another, element by element — which is what a snapshot morph is, and a script could only do it one value at a time. Both arguments are lists: for two single numbers you want lerp. The shorter list decides the length: padding with zeros would drag the missing entries to nothing, and on a patch that is a set of parameters slammed to their minimum.' },
  { id: 'randomFloat', category: 'Value / range', signature: 'randomFloat(lo, hi)',
    summary: 'A seeded random float in a range. random(lo, hi) returns whole numbers — the form a note or a step wants — so until now there was no seeded way to get a fractional one without doing the arithmetic by hand.' },
  { id: 'randomGaussian', category: 'Value / range', signature: 'randomGaussian([mean, sd])',
    summary: 'A bell rather than a slab: most values near the middle. Humanising velocity or timing with a uniform random is the thing that sounds mechanical. Box-Muller, always consuming exactly two draws — it deliberately does not cache the second value the way the textbook version does, because a varying draw count would break seed replay.' },
  { id: 'randomWalk', category: 'Value / range', signature: 'randomWalk(current, step, lo, hi)',
    summary: 'Drift rather than jump — a generative line that stays musical. Folded at the ends rather than clamped, because a walk that clamps sticks to the end it hit and stops moving.' },
  { id: 'randomBool', category: 'Value / range', signature: 'randomBool([chance])',
    summary: 'A weighted coin — the probability gate every step sequencer wants. `chance` is the odds of true, 0.5 by default.' },
  { id: 'shuffle', category: 'Value / range', signature: 'shuffle(values)',
    summary: 'A new list in seeded random order (Fisher-Yates, exactly one draw per element after the first). The same seed shuffles the same way, which is what makes a shuffled pattern something you can get back.' },
  { id: 'toDegrees', category: 'Value / range', signature: 'toDegrees(radians)', summary: 'Radians to degrees — the unit ce.draw\'s arcs are in.' },
  { id: 'toRadians', category: 'Value / range', signature: 'toRadians(degrees)', summary: 'Degrees to radians — the unit the language\'s trigonometry is in.' },
  { id: 'distance', category: 'Value / range', signature: 'distance(x1, y1, x2, y2)',
    summary: 'The distance between two points. For XY pads, joysticks, the Orbit and hit testing in ce.draw.' },
  { id: 'angleOf', category: 'Value / range', signature: 'angleOf(x1, y1, x2, y2)',
    summary: 'The angle from one point to another in ce.draw\'s own convention: degrees, 0 at twelve o\'clock, increasing clockwise, 0–360. Rebuilding that from atan2 by hand is where a knob pointer ends up running backwards or a quadrant out.' },
  { id: 'polar', category: 'Value / range', signature: 'polar(angle, radius)',
    summary: 'The inverse: an angle and a radius to { x, y } offsets from a centre, in the same convention. Together with angleOf, what a knob ring, a radial meter or a pan indicator is drawn from.' },

  // --- the transforms the Properties panel itself applies (design doc §33) ---
  // The panel does not only store constants; it CONFIGURES value transforms — a Macro slot's
  // curve, a Router's dead zone and transfer curve, an Envelope segment's curve and tension, a
  // Timbre pad's blend power, a slider's tick stops, a Meter's dB scale. A script could not
  // reproduce any of them, so it could not compute what its own panel was about to display, and
  // anything it worked out alongside a bound control came out subtly different. These are the
  // app's own functions, matched exactly.
  { id: 'shapeCurve', category: 'Value / range', signature: 'shapeCurve(v, curve [, tension])',
    summary: 'Bend a value the way the panel itself bends one — the curve an Envelope segment or a Router breakpoint uses. This is not the same as curve(), which is a simpler and older set of shapes, so a curve name read straight out of a control belongs here rather than there. Both spellings of the s-curve are accepted. `tension` defaults to 1.6 rather than 0, matching the app: leaving it unset does not give you a straight line. With `tension` set to 1 this is also the curve a Macro slot uses, so shape(v, curve, 1) reproduces the third of the app\'s three curve families — the one nothing else names.' },
  { id: 'deadzone', category: 'Value / range', signature: 'deadzone(v, amount [, invert])',
    summary: 'The Expression Router\'s input shaping: below the threshold the value is zero, and the remaining range rescales to fill 0–1 so response starts right at the edge of the dead zone. The rescale is the part a hand-rolled version leaves out, and leaving it out loses the top of the range.' },
  { id: 'weightsFor', category: 'Value / range', signature: 'weightsFor(points, x, y [, power])',
    summary: 'The inverse-distance blend weights a Timbre Space and a Preset Constellation use, normalised so they sum to 1. `power` is the blend sharpness — higher means the nearest anchor dominates sooner. Pair with blendBy() to morph a set of values the way the pad does.' },
  { id: 'blendBy', category: 'Value / range', signature: 'blendBy(values, weights)',
    summary: 'A weighted average — what weightsFor() is for, and what a morph pad is. blend() interpolates two lists; this collapses many values by weight.' },
  { id: 'tickStops', category: 'Value / range', signature: 'tickStops(major [, minor])',
    summary: 'The 0–1 stop positions a slider\'s scale is drawn from, as { major, minor }. Use these when you are drawing your own scale, so your minor ticks line up with the ones the app draws beside them rather than being visibly out of step.' },
  { id: 'dbPosition', category: 'Value / range', signature: 'dbPosition(fraction [, floorDb, ceilDb])',
    summary: 'Where a level sits on a dB meter, 0–1. gainToDb answers "how many dB is this"; this answers "how far up the meter does it go", which is the question a script drawing a meter is asking. Defaults match the Meter component: floor -60, ceiling +6.' },

  // --- taming what arrives on the wire (design doc §34) ---
  // A controller does not send tidy numbers. It sends a value that jitters, crosses a threshold
  // repeatedly, spikes once, and has already been through a taper. These four are what a script
  // needs to make that usable, and none of them composes out of what was already here.
  { id: 'smooth', category: 'Value / range', signature: 'smooth(current, target, coefficient [, epsilon])',
    summary: 'Smooth out a jumpy value — a twitchy expression pedal, a noisy CC. It moves quickly at first and then eases in, which is the response you want for that. Different from approach(), which moves a fixed amount each time and is really a speed limit. The important part is that it arrives: smoothing like this gets closer and closer forever, so a value smoothed by hand ends up sitting at 0.9999 and transmitting for ever. This one snaps to the target once it is close enough.' },
  { id: 'hysteresis', category: 'Value / range', signature: 'hysteresis(value, on, low, high)',
    summary: 'A Schmitt trigger: turns on at `high`, off at `low`, and holds in between. `on` is the state it is in now, and the return is the state it should be. A plain threshold chatters — a CC hovering on the line flips a switch dozens of times a second, which on a bound control is dozens of MIDI messages a second. Two thresholds plus the current state is the fix, and nothing else in the module composes to it.' },
  { id: 'median', category: 'Value / range', signature: 'median(values)',
    summary: 'The middle value of a list, or the mean of the two middle ones; nil for an empty list. Distinct from mean() and the reason is the point: a mean smears a spike across the result, a median rejects it. On a noisy controller reading that is the difference between a glitch you can hear and one you cannot.' },
  { id: 'euclid', category: 'Value / range', signature: 'euclid(steps, pulses [, rotation])',
    summary: 'A Euclidean rhythm: `pulses` hits spread as evenly as they will go across `steps`, handed back as a list of yes/no. This is the same working-out the Arpeggiator uses for its rest pattern, so a sequencer or gate you write yourself lands on the same rhythm rather than an approximation of it. `rotation` turns the whole pattern round without changing the spacing between hits.' },
  { id: 'unshape', category: 'Value / range', signature: 'unshape(y, curve [, tension])',
    summary: 'The inverse of shape(). Going device → panel through a taper needs it: a value shaped on the way out has to be un-shaped on the way back, or the control lands somewhere other than where it started. Only map() is invertible by hand — swap x and y — while a named curve is not. `hold` is a step, so many inputs give the same output and there is no true inverse; it returns the earliest input that produces the output, which is the only answer that is a function.' },
  // Seeded, and seeded is the point: the language's own math.random cannot promise the same
  // sequence in five runtimes, so a randomised patch could not be reproduced and a generative
  // sequence would sound different in the editor and in the exported plugin.
  { id: 'random', category: 'Value / range', signature: 'random([lo, hi])',
    summary: 'A random number. With no arguments, a float in [0, 1). With two, a whole number from lo to hi inclusive — the form a script actually wants for a note or a step. Seeded, so the same seed replays the same sequence in every runtime.' },
  { id: 'randomSeed', category: 'Value / range', signature: 'randomSeed(n)',
    summary: 'Set the seed of the generator this script is drawing from. The same seed replays the same sequence — which is what makes a "random" patch something you can get back. Reseeding with 0 is treated as the default seed rather than as a dead generator. Seeds one generator: every script has its own, and inside a script every named stream has its own, so this cannot reach into somebody else\'s sequence.' },
  { id: 'randomStream', category: 'Value / range', signature: 'randomStream(name, fn)',
    summary: 'Give a run of random draws their own private sequence, so two generative parts of one script do not tread on each other — shuffling in one leaves what the other gets alone, and so does seeding it. Normal behaviour returns when the block ends, even if something goes wrong inside it. Each script\'s streams are its own, so two scripts using the same name still do not share one.' },
  // music
  // Middle C is C4 — scientific pitch notation, which is what every runtime has always computed.
  // These summaries said "C3" (the Yamaha convention) from the start, so the docs and the code
  // disagreed by an octave: a script written from the manual transposed everything twelve
  // semitones. The code is right and stays; the wording is what was wrong.
  {
    id: 'noteName', category: 'Music', signature: 'noteName(n [, flats])',
    summary: 'MIDI note number → name, e.g. 60 → "C4" (middle C). With `flats` omitted you get this module\'s plain-ASCII spelling ("C#4") — what noteNumber has always round-tripped. Pass `flats` and you get the panel\'s spelling instead, from the same table the Chord Pad, Harmoniser and Arpeggiator print from: true → "E♭4", false → "C♯4". `ce.music.spelling` answers which one a key wants.',
    params: [
      { name: 'n', type: 'number', required: true },
      { name: 'flats', type: 'boolean', required: false },
    ],
  },
  {
    id: 'noteNumber', category: 'Music', signature: 'noteNumber(name) -> number',
    summary: 'Note name → MIDI number, e.g. "C4" → 60. Middle C is C4. Reads all four spellings — "C#4", "C♯4", "Db4", "D♭4" — so a name the panel printed can be read back. A name it cannot read returns nothing: 0 is a real note (C-1), so returning it for a misspelling meant a typo played a wrong note in silence.',
    params: [{ name: 'name', type: 'string', required: true }],
  },
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
    summary: 'Snap a note to the nearest one in a scale, searching both directions. A tie goes up, always, so two runtimes cannot disagree about a note exactly between two scale tones. `scale` defaults to "major"; an unknown name returns nothing.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  // Key, degree and voicing — phase 12. The three verbs above answer questions about a note or a
  // shape in isolation; these answer questions about a note IN A KEY, which is what the Chord Pad,
  // the Harmoniser and the Arpeggiator each compute for themselves and no script could reach. Every
  // one is the panel's own algorithm rather than a second opinion: a script naming a chord and the
  // Chord Pad labelling the same chord have to agree, or the panel contradicts itself on screen.
  {
    id: 'noteSpelling', category: 'Music', signature: 'noteSpelling(root [, scale]) -> boolean',
    summary: 'Does this key write its accidentals as flats? F, B♭, E♭, A♭, D♭ and G♭ do — judged by the relative major, so C minor spells E♭/A♭ rather than D♯/G♯, exactly as the Chord Pad does. Pass the answer to noteName and a script\'s labels match the panel\'s without having to decide anything. An unknown scale returns nothing.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'inScale', category: 'Music', signature: 'inScale(note, root [, scale]) -> boolean',
    summary: 'Is this note in the key? Octave-blind, like every key question — C2 and C5 are both the tonic of C. `scale` defaults to "major"; an unknown name returns nothing.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'scaleDegree', category: 'Music', signature: 'scaleDegree(note, root [, scale]) -> number',
    summary: 'Which degree of the key a note is: 1 for the tonic, 5 for the dominant. A note outside the key has no degree and returns nothing rather than the nearest one — rounding here is what turns a wrong note into a plausible chord, and quantizeNote is the verb that rounds on purpose.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'degreeChord', category: 'Music', signature: 'degreeChord(root, scale, degree [, size]) -> table',
    summary: 'Which chord a key builds on a given degree — the same working-out the Chord Pad does. Degrees start at 1, so degreeChord(60, "major", 5) is the chord on the fifth. `size` is how many notes: 3 for a triad, 4 for a seventh. You get back the notes, the chord spelled the way the key spells it ("E♭m7") and its roman numeral. Use this when you want the chord a key implies; use chordNotes when you already know which chord you want.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: true },
      { name: 'degree', type: 'number', required: true },
      { name: 'size', type: 'number', required: false },
    ],
  },
  {
    id: 'chordQuality', category: 'Music', signature: 'chordQuality(notes) -> string',
    summary: 'Name a chord from the notes in it: [60, 63, 70] → "min7". Reads intervals above the lowest note, so it takes a chord from chordNotes, from degreeChord, or one a script built by hand — the inverse of chordNotes. The vocabulary is the panel\'s (maj, min, dim, aug, sus2, sus4, maj7, dom7, min7, minMaj7, dim7, m7b5), so a chord this names and a chord the Chord Pad labels agree.',
    params: [{ name: 'notes', type: 'list', required: true }],
  },
  {
    id: 'voiceLead', category: 'Music', signature: 'voiceLead(notes, previous [, mode]) -> list',
    summary: 'Rearrange a chord so it moves as little as possible from the one before it — the Harmoniser\'s voice leading, available to any script that sends chords. "closest" keeps every note as close as it can; "smooth" holds the top note still, which keeps a melody in place while the notes underneath move; "off" gives you root position. With no previous chord there is nothing to move away from, so the first chord of a phrase comes back untouched.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'previous', type: 'list', required: true },
      { name: 'mode', type: 'string', required: false },
    ],
  },
  {
    id: 'expandOctaves', category: 'Music', signature: 'expandOctaves(notes [, octaves]) -> list',
    summary: 'The same note set repeated up over `octaves` octaves (1..4), ascending — the Arpeggiator\'s own expansion, the step before arpOrder. Anything that would land above 127 is dropped rather than clamped: clamping stacks strays on one pitch, which sounds like a stuck key rather than like nothing.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'octaves', type: 'number', required: false },
    ],
  },
  {
    id: 'arpOrder', category: 'Music', signature: 'arpOrder(notes, pattern) -> list',
    summary: 'The order an arpeggiator pattern plays notes in, as a list of steps — each step being a list of notes, so "chord" (everything at once) comes back the same shape as the rest. The patterns are up, down, updown, downup, asPlayed, random and chord. Notes are used in the order you give them, which is what makes "asPlayed" meaningful; sort them first if you want a rising run. "updown" and "downup" do not play the turning points twice. "random" hands the notes back in the order given, exactly as the panel\'s arpeggiator does, because it picks its step as it plays; for a shuffled order use ce.math.shuffle.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'pattern', type: 'string', required: true },
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

/* ------------------------------------------------------------------ module groups */
// The reference used to be 41 modules in one flat run, 28 of them ce.components.*, with a single
// nav-rail link called "Every module" pointing at the lot. Customers said what that is like to
// use: "all components are in one long list while it would be easier to have them under a
// collapsible tree, even subcategorised."
//
// So the modules are filed. `MODULE_GROUPS` is the top level and `COMPONENT_GROUPS` sorts the
// component families underneath it — the same division the COMPONENT_FAMILIES source already made
// in its section comments, written down as data so the page and the nav rail can both read it.
// Both are checked below: a module in no group, or a group naming a module that does not exist,
// fails at load rather than quietly vanishing from the page.

export const MODULE_GROUPS = [
  { id: 'core', label: 'The basics',
    blurb: 'Always available, in every script.',
    modules: ['ce.core'] },
  { id: 'sound', label: 'Notes, MIDI and time',
    blurb: 'Talking to the instrument, and doing it in time with the music.',
    modules: ['ce.midi', 'ce.device', 'ce.music', 'ce.time'] },
  { id: 'numbers', label: 'Working out values',
    blurb: 'Arithmetic on values and ranges, and moving a value over time instead of jumping it.',
    modules: ['ce.math', 'ce.anim'] },
  { id: 'panel', label: 'The panel itself',
    blurb: 'Building and arranging controls, and remembering things between sessions.',
    modules: ['ce.panel', 'ce.storage'] },
  { id: 'appearance', label: 'How it looks',
    blurb: 'Drawing, images, type, and talking to whoever is using the panel.',
    modules: ['ce.draw', 'ce.image', 'ce.text', 'ce.ui'] },
  { id: 'components', label: 'Components',
    blurb: 'One module per interactive component. Each takes the control\'s name first, and every '
      + 'verb reports whether the component now holds what you asked for.',
    componentGroups: true },
];

export const COMPONENT_GROUPS = [
  { id: 'notes', label: 'Note sources',
    blurb: 'Components that produce notes.',
    modules: ['arp', 'chordpad', 'noteribbon', 'drumpads', 'phrase', 'recorder', 'harmony'] },
  { id: 'movement', label: 'Movement and randomness',
    blurb: 'Components that keep changing on their own.',
    modules: ['turing', 'looper', 'orbit', 'kinetic', 'constellation', 'timbre'] },
  { id: 'routing', label: 'Routing and modulation',
    blurb: 'Components that send one value somewhere else, or shape it on the way.',
    modules: ['router', 'macro', 'matrix', 'constraint', 'envelope', 'split'] },
  { id: 'handson', label: 'Hands-on controls',
    blurb: 'Components you play with directly.',
    modules: ['ribbon', 'crossfader', 'joystick', 'meter'] },
  { id: 'displays', label: 'Displays',
    blurb: 'Components that show something rather than set it.',
    modules: ['lcd', 'pixel'] },
  { id: 'panelwide', label: 'Panel-wide',
    blurb: 'Components that act on the whole panel rather than one value.',
    modules: ['transport', 'panic', 'setlist'] },
];

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
  { id: 'ce.math', version: '1.8', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Value and range arithmetic — ranges that wrap, curves of your own shape, snapping to a list, decibels, colour — plus a seeded random you can pick from. Pure: no host involved.' },
  { id: 'ce.music', version: '1.2', requires: [], runtime: RUNTIME_ANY,
    summary: 'Note names and numbers, scales, chords, and snapping a note to a key — plus what a key implies: which degree a note is, the chord built on a degree and its numeral, how a key spells its accidentals, and the Harmoniser\'s and Arpeggiator\'s own voicing and walk.' },
  { id: 'ce.time', version: '1.3', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Musical time: tempo, transport position, beat/bar events, and timers — plain, one-shot or beat-synced — plus the transport\'s own grid: note divisions, bar/beat at any position, the steps between two readings, swing, cycles, loop folding and tempo from taps or clock pulses. And a monotonic clock, because there was none.' },
  // requires ce.math because envelope() drives the value through ce.math.map — one lookup, shared
  // with the Envelope component — and ce.time because `beats` and `sync` are the transport's.
  { id: 'ce.anim', version: '1.1', requires: ['ce.core', 'ce.math', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Move a value over time instead of jumping it: to a destination, with a spring, or through a shape you draw — delayed, staggered, repeating, tempo-synced, and telling you when it is done. Cross-runtime: a sweep has to work with the panel shut too.' },
  { id: 'ce.ui', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Tell the person using the panel something, take it back, or replace it; ask them a question — a choice, a line of text, or a pick from a list; and put something on their clipboard. Panel view only — there is nobody to tell, ask or copy for with the window shut.' },
  { id: 'ce.draw', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Draw on top of any control: scope traces, envelope shapes, XY pads, readouts. Gradients, dashes, opacity and transforms as well as flat shapes, plus the panel\'s own LCD font and a way to measure text. Panel view only — there is no surface with the window shut.' },
  // The first MIXED module. Its structure verbs are panel-view only and say so individually, but
  // snapshot/restore are not — so declaring the whole module unavailable window-closed would make
  // ce.has("ce.panel") tell a script to skip two verbs that work perfectly there. The per-member
  // stubs are what state the boundary precisely; the module says "some of this reaches you".
  { id: 'ce.panel', version: '1.4', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Build the panel from a script and arrange what is there: create, clone, parent and find controls, then align, distribute, match, order, grid or circle them — panel view only, each verb says so. snapshot/restore work anywhere.' },
  { id: 'ce.storage', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Per-script scratch state, and settings that outlive the session — shared with the panel, private to one script, or kept on this machine only. Plus JSON, because one of the four runtimes has none.' },
  // Panel view only, and for a reason worth stating: the font catalogue is the editor's, and the
  // measuring is done on a canvas. A player host has neither, and a typography verb that answered
  // from a guess would be worse than one that says it is not there.
  // Panel view only, for the same reason ce.text is: the icon library and the file cache are the
  // editor's, and a verb that answered from a guess would be worse than one that says it is absent.
  { id: 'ce.image', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'The image layers a control carries — background image and overlay, text image and texture, and the Icon section — plus the icon library they can draw from. A Label has 102 image-related fields and a Knob 864; all were writable by path and none was named anywhere in this API. What this adds is knowing which assets exist, keeping the two activation models straight (background layers composite, text layers are exclusive), and being honest about which sources survive an export.' },
  { id: 'ce.text', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Typography as something a script can reason about: what fonts exist and what they support, style writes that keep weight consistent instead of half-applying it, variable axes, and measuring a control\'s own text in its own font so it can be fitted to its box. The fields were always reachable with set() — the rules around them were not.' },
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

/* ------------------------------------------------- the grouping, checked and indexed */
// A module that no group claims would simply not appear on the page, and a group naming one that
// does not exist would render an empty row. Both are silent failures of the kind the whole
// generate-rather-than-write approach exists to prevent, so both are errors at load.

/** Every module id a group claims, component short names expanded to full module ids. */
const GROUPED_MODULE_IDS = MODULE_GROUPS.flatMap((group) => (group.componentGroups
  ? COMPONENT_GROUPS.flatMap((sub) => sub.modules.map((id) => `ce.components.${id}`))
  : group.modules));

{
  const known = new Set(MODULES.map((m) => m.id));
  const unfiled = [...known].filter((id) => !GROUPED_MODULE_IDS.includes(id));
  const phantom = GROUPED_MODULE_IDS.filter((id) => !known.has(id));
  const twice = GROUPED_MODULE_IDS.filter((id, i) => GROUPED_MODULE_IDS.indexOf(id) !== i);
  if (unfiled.length) throw new Error(`panelApi: module(s) in no group: ${unfiled.join(', ')}`);
  if (phantom.length) throw new Error(`panelApi: group names unknown module(s): ${phantom.join(', ')}`);
  if (twice.length) throw new Error(`panelApi: module(s) in two groups: ${twice.join(', ')}`);
}

/**
 * The modules as a two-level tree: top-level groups, and for Components a level of families
 * underneath. Each node carries the module ids it holds, in the order the group declares them.
 */
export function moduleTree() {
  return MODULE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    blurb: group.blurb,
    modules: group.componentGroups ? [] : [...group.modules],
    subgroups: group.componentGroups
      ? COMPONENT_GROUPS.map((sub) => ({
        id: sub.id,
        label: sub.label,
        blurb: sub.blurb,
        modules: sub.modules.map((id) => `ce.components.${id}`),
      }))
      : [],
  }));
}

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
    // The profile DOCUMENT, rather than the catalogue row profile() answers from. `variables` and
    // `timing` are §1 collisions as bare globals — both are words a panel author reaches for — so
    // flat they keep the device prefix, the same rule every other read here follows.
    variables: 'deviceVariables', setVariable: 'deviceSetVariable',
    timing: 'deviceTiming', setTiming: 'deviceSetTiming',
    coverage: 'deviceCoverage', recipes: 'deviceRecipes', requests: 'deviceRequests',
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
               chance: 'randomBool', shuffle: 'shuffle', stream: 'randomStream',
               // Colour. `mix`, `alpha`, `rgb`, `hex` and `hsl` are all §1 collisions as bare
               // globals, so the flat spellings say what they convert.
               lighten: 'lighten', darken: 'darken', mix: 'mixColour', alpha: 'colourAlpha',
               rgb: 'hexToRgb', hex: 'rgbToHex', hsl: 'hexToHsl', fromHsl: 'hslToHex',
               degrees: 'toDegrees', radians: 'toRadians',
               distance: 'distance', angle: 'angleOf', polar: 'polar',
               // The panel's own transforms. `shape` is deliberately NOT `curve` — the two compute
               // different families and collapsing them would change what existing panels sound like.
               shape: 'shapeCurve', deadzone: 'deadzone', weights: 'weightsFor',
               blendBy: 'blendBy', ticks: 'tickStops', dbPosition: 'dbPosition',
               // All four stay bare flat: unlike `min`/`max`/`sum`/`mean`, none of these is a name
               // a panel author would give their own helper, so a qualifier would only be noise.
               smooth: 'smooth', hysteresis: 'hysteresis', median: 'median', unshape: 'unshape',
               euclid: 'euclid' },
  'ce.music': { name: 'noteName', number: 'noteNumber',
                scale: 'scaleNotes', chord: 'chordNotes', quantize: 'quantizeNote',
                spelling: 'noteSpelling', inScale: 'inScale', degree: 'scaleDegree',
                degreeChord: 'degreeChord', quality: 'chordQuality', lead: 'voiceLead',
                octaves: 'expandOctaves', arp: 'arpOrder' },
  'ce.anim': {
    to: 'animateTo', spring: 'animateSpring', stop: 'animateStop', running: 'animateRunning',
    // `value`, `list`, `pause`, `finish` and `reverse` are all §1 collisions as bare globals —
    // ordinary words a panel author reaches for — so the flat spellings keep the animate prefix.
    envelope: 'animateEnvelope', value: 'animateValue', list: 'animateList',
    pause: 'animatePause', resume: 'animateResume', reverse: 'animateReverse',
    finish: 'animateFinish',
  },
  'ce.ui': {
    notify: 'uiNotify', status: 'uiStatus', dialog: 'uiDialog',
    // `prompt`, `choose`, `copy`, `state`, `update` and `dismiss` are all §1 collisions as bare
    // globals — prompt and copy especially — so the flat spellings keep the ui prefix.
    prompt: 'uiPrompt', choose: 'uiChoose', dismiss: 'uiDismiss',
    update: 'uiUpdate', state: 'uiState', copy: 'uiCopy',
  },
  'ce.draw': {
    clear: 'drawClear', fill: 'drawFill', stroke: 'drawStroke', rect: 'drawRect',
    circle: 'drawCircle', arc: 'drawArc', line: 'drawLine', path: 'drawPath', text: 'drawText',
    redraw: 'drawRedraw',
    // §1 again: `gradient`, `opacity`, `transform`, `ellipse` and `measure` are all words a panel
    // author reaches for, so the flat spellings keep the draw prefix.
    gradient: 'drawGradient', opacity: 'drawOpacity', transform: 'drawTransform',
    ellipse: 'drawEllipse', pixelText: 'drawPixelText', measure: 'drawMeasure',
    // §49. `grid`, `lines`, `points`, `curve`, `polygon`, `image`, `clip`, `blend`, `save`,
    // `restore` and `batch` are all bare words, so every flat alias keeps the draw prefix — the
    // same §1 rule the rest of this module follows.
    batch: 'drawBatch', grid: 'drawGrid', lines: 'drawLines', points: 'drawPoints',
    curve: 'drawCurve', polygon: 'drawPolygon', image: 'drawImage', clip: 'drawClip',
    blend: 'drawBlend', save: 'drawSave', restore: 'drawRestore',
  },
  // §1 once more, and this module is the clearest case of it: every namespaced spelling here is a
  // bare English word, so every flat alias keeps the text prefix. `read`, `style`, `fit` and
  // `measure` as globals would be four collisions waiting to happen.
  'ce.text': {
    fonts: 'textFonts', font: 'textFont', style: 'textStyle', axis: 'textAxis',
    read: 'textRead', measure: 'textMeasure', fit: 'textFit',
  },
  // §1 again: `set`, `read`, `clear` and `load` as bare globals would collide with ce.core's own
  // verbs, so every flat alias keeps the image prefix.
  'ce.image': {
    assets: 'imageAssets', asset: 'imageAsset', set: 'imageSet', clear: 'imageClear',
    read: 'imageRead', icon: 'imageIcon', embed: 'imageEmbed', load: 'imageLoad',
  },
  'ce.panel': {
    snapshot: 'panelSnapshot', restore: 'panelRestore', each: 'panelEach',
    create: 'panelCreate', clone: 'panelClone', destroy: 'panelDestroy',
    parent: 'panelParent', find: 'panelFind', info: 'panelInfo', types: 'panelTypes',
    // The collections INSIDE a control. `undefine` rather than `remove`, so it cannot be confused
    // with `destroy`, which takes a whole control away.
    entries: 'panelEntries', entry: 'panelEntry',
    define: 'panelDefine', undefine: 'panelUndefine', patch: 'panelPatch',
    // Arranging what is there. `align`, `match`, `grid`, `circle`, `flip`, `rect`, `order` and
    // `batch` are all §1 collisions as bare globals, so the flat spellings keep the panel prefix.
    align: 'panelAlign', distribute: 'panelDistribute', match: 'panelMatch',
    grid: 'panelGrid', circle: 'panelCircle', flip: 'panelFlip',
    rect: 'panelRect', order: 'panelOrder', batch: 'panelBatch',
  },
  'ce.storage': { state: 'state', saveSetting: 'saveSetting', loadSetting: 'loadSetting',
                  settings: 'listSettings', forget: 'forgetSetting',
                  // `all`, `clear`, `info`, `encode` and `decode` are §1 collisions as bare
                  // globals, so the flat spellings say what they are about.
                  all: 'allSettings', clear: 'clearSettings', info: 'storageInfo',
                  encode: 'encodeJson', decode: 'decodeJson' },
  'ce.time': {
    startTimer: 'startTimer', stopTimer: 'stopTimer', syncTimer: 'syncTimer', after: 'after',
    // The namespaced names read well; the FLAT aliases are deliberately more defensive.
    // `playing` and `transport` as bare globals are exactly the collision §1 warned about —
    // ordinary words a panel author would reach for — so flat they are isPlaying and
    // transportInfo. The contract already supports a short name differing from the member id
    // (ce.components.setlist.jump is setlistGoto), so this costs nothing but a line here.
    tempo: 'tempo', playing: 'isPlaying', transport: 'transportInfo',
    beatsToMs: 'beatsToMs', msToBeats: 'msToBeats',
    // Phase 12b. `now` is the collision §1 warned about all over again — a bare global `now` is
    // exactly the name a panel author reaches for — so flat it is nowMs. `division`, `step`,
    // `steps`, `swing`, `cycle`, `looped`, `tap` and `position` are the same story.
    afterBeats: 'afterBeats', timers: 'runningTimers',
    now: 'nowMs', division: 'beatsPerDivision', divisions: 'divisionNames',
    position: 'barBeatAt', step: 'stepAt', steps: 'stepsBetween', swing: 'swingOffset',
    cycle: 'cycleAt', looped: 'loopedBeats', tap: 'tapTempo', clockTempo: 'clockTempo',
  },
  'ce.components.split': {
    preset: 'splitPreset', mute: 'splitMute', channel: 'splitChannel',
    transpose: 'splitTranspose', point: 'splitPoint', read: 'splitRead',
  },
  'ce.components.phrase': {
    seed: 'phraseSeed', clear: 'phraseClear', key: 'phraseKey', scale: 'phraseScale',
    transpose: 'phraseTranspose', direction: 'phraseDirection', run: 'phraseRun', cell: 'phraseCell',
    read: 'phraseRead',
  },
  'ce.components.recorder': {
    record: 'recorderRecord', stop: 'recorderStop', play: 'recorderPlay', clear: 'recorderClear',
    undo: 'recorderUndo', quantize: 'recorderQuantize', transpose: 'recorderTranspose',
    bars: 'recorderBars', source: 'recorderSource', nudge: 'recorderNudge', shift: 'recorderShift',
    store: 'recorderStore', load: 'recorderLoad', countIn: 'recorderCountIn',
    read: 'recorderRead',
  },
  'ce.components.harmony': {
    mode: 'harmonyMode', key: 'harmonyKey', scale: 'harmonyScale', size: 'harmonySize',
    shape: 'harmonyShape', voicing: 'harmonyVoicing', inversion: 'harmonyInversion',
    octave: 'harmonyOctave', outOfKey: 'harmonyOutOfKey', keepPlayed: 'harmonyKeepPlayed',
    channel: 'harmonyChannel', voiceLeading: 'harmonyVoiceLeading', strum: 'harmonyStrum',
    degree: 'harmonyDegree', read: 'harmonyRead',
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
    read: 'setlistRead',
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
  const reaches = (x) => memberRuntime(x) === RUNTIME_ANY || memberRuntime(x) === runtime;
  const hooks = LIFECYCLE_HOOKS.filter(reaches).map((h) => h.id);
  // Events are filtered the same way now that some of them have a runtime. The component events
  // are raised by the preview surface, and the exported player has no component engine at all — so
  // probing a player script for onStep would be probing for a handler nothing there can ever call.
  return [...hooks, ...ALL_EVENTS.filter(reaches).map((e) => e.fn)];
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
  ...COMPONENT_EVENTS.map((e) => ({ ...e, group: 'component' })),
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
