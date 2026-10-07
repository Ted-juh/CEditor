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
// Spec: docs/design/panel-api-spec.md (decisions Q1–Q11). Naming rule throughout:
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
  verbArgKinds, verbArgOptional,
} from './componentVerbs.js';
import { HAND_WRITTEN_VALUES } from './componentTables.js';
// The legal values an option accepts come from the table its own implementation reads, for the
// reason the component enums do: a documented list somebody retyped is a list that drifts. These
// two supply the image-layer and typography vocabularies.
import {
  BACKGROUND_FITS, BACKGROUND_ALIGNS, TEXT_FITS, IMAGE_BLENDS, IMAGE_CLIP_MODES, IMAGE_LAYER_IDS,
} from '../utils/imageLayers.js';
import { FEATURE_KEYS, CASE_MODES, SCRIPT_MODES, JUSTIFICATIONS } from './textStyle.js';
// And ce.anim's curve names from the table ce.anim evaluates. This list was typed out, and when the
// animation overhaul added five easings every runtime accepted them and the documentation did not.
import { ANIM_CURVE_NAMES, CURVE_NAMES } from './easingTables.js';

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
  summary: 'The control or panel this script belongs to: the control for a control script, the panel for a panel script. Use it instead of a fixed name, so that one script works on every copy of a control.',
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
  { id: 'value', label: '.value', summary: 'The real value, as you would read it on the synth\'s front panel: 8000 (Hz), or "LP" for a named setting. This is what you get when you do not ask for one of the others. Set it, and the device profile works out which MIDI to send.' },
  { id: 'normalizedValue', label: '.normalizedValue', summary: 'The same value as a position from 0 to 1, worked out from the control\'s own minimum and maximum. Use it for curves, and to make two controls with different ranges move together.' },
  { id: 'midiValue', label: '.midiValue', requiresDeviceHost: true, summary: 'The value as it is sent over MIDI — 101, say — encoded the way the device profile encodes it. Only available for a control that is bound to a synth parameter.' },
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
    summary: 'Runs first, as soon as the panel is opened and before any controls exist. Use it to set up MIDI or send the synth a start-up message. Do not read or change controls here — they have not been created yet.',
    params: [],
    snippet: { lua: 'function onPanelLoad()\n  $0\nend', javascript: 'function onPanelLoad() {\n  $0\n}' },
  },
  {
    id: 'onPanelBuild', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onPanelBuild()',
    summary: 'Runs after onPanelLoad and before onPanelReady. This is the place to create, copy and arrange controls from a script. Controls made by a script are removed before each run, so this always starts from the panel as you built it.',
    params: [],
    snippet: {
      lua: 'function onPanelBuild()\n  for i = 1, 4 do\n    ce.panel.create("Knob", { name = "osc" .. i, x = 20 + i * 90, y = 40 })\n  end\n  $0\nend',
      javascript: 'function onPanelBuild() {\n  for (let i = 1; i <= 4; i++) {\n    ce.panel.create("Knob", { name: "osc" + i, x: 20 + i * 90, y: 40 });\n  }\n  $0\n}',
    },
  },
  {
    id: 'onError', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onError(info)',
    summary: 'Runs when any script on the panel fails. `info` says which script failed, what it was doing and what the error was. The error is always written to the log as well. If onError itself fails, that error is logged and onError is not called again, so it cannot get stuck in a loop.',
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
    summary: 'Paints on top of the control this script is attached to; `info` gives the control\'s name and its current size. It runs when the control needs repainting, not on every frame: to animate, call `ce.draw.redraw()` from a timer.',
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
    summary: 'Runs once the controls exist. This is the moment to ask the synth for its current settings and fill the controls. In a plugin it runs again each time the window is reopened, so put one-time work inside `if info.firstTime`.',
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
    summary: 'Runs when the panel window closes: you stopped the preview, or the plugin window was closed in the DAW. Your scripts keep running after this — timers still tick and MIDI still arrives. To clean up when the scripts themselves are stopped, use onPanelDestroy.',
    params: [],
    snippet: { lua: 'function onPanelClose()\n  $0\nend', javascript: 'function onPanelClose() {\n  $0\n}' },
  },
  {
    id: 'onPanelDestroy', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelDestroy()',
    summary: 'Runs when the scripts are about to be stopped: another panel was opened, the scripts were replaced, or the plugin was removed. It is the last hook to run, and timers, saved state and MIDI still work, so this is the place to restore the synth or send a final dump. It runs exactly once, even if onPanelClose never did.',
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
    summary: 'Runs when the DAW saves the project. Return a table (Lua) or object (JavaScript) holding what you want saved. `store` shows what other scripts have saved so far; it is for reading only, and changing it saves nothing.',
    params: [{ name: 'store', type: 'object' }],
    snippet: {
      lua: 'function onDawSaveState(store)\n  return { ${1:key} = ${2:value} }$0\nend',
      javascript: 'function onDawSaveState(store) {\n  return { ${1:key}: ${2:value} };$0\n}',
    },
  },
  {
    id: 'onDawRestoreState', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_PLAYER,
    signature: 'onDawRestoreState(store)',
    summary: 'Runs when the DAW reopens the project. Read your values back out of `store`, which holds what your onDawSaveState returned together with what every other script saved.',
    params: [{ name: 'store', type: 'object' }],
    snippet: { lua: 'function onDawRestoreState(store)\n  $0\nend', javascript: 'function onDawRestoreState(store) {\n  $0\n}' },
  },
];

/* -------------------------------------------------------------------- events */
// Subscribed two ways (Q3): named functions `onX(payload)` for a control's OWN events,
// or explicit `on(target, event, fn)` to reach anything else. Payloads use descriptive
// names passed directly (Q4): one obvious datum directly, several fields as one object.

export const CONTROL_EVENTS = [
  { id: 'valueChange', fn: 'onValueChange', payload: 'value', summary: 'Fires again and again while the value is moving, for example while a knob is being dragged. Use it for things on screen that should follow the control.' },
  { id: 'valueChanged', fn: 'onValueChanged', payload: 'value', summary: 'Fires once, when the value has settled — for example when the knob is let go. This is the moment to tell the synth.' },
  { id: 'activeHandleChanged', fn: 'onActiveHandleChanged', payload: 'info', summary: 'A slider with more than one handle switched to a different handle. `info.activeHandle` and `info.previousActiveHandle` are each "start", "current" or "end".' },
  { id: 'click', fn: 'onClick', payload: 'mouse', summary: 'The control was clicked. `mouse.x` and `mouse.y` say where, inside the control.' },
  { id: 'doubleClick', fn: 'onDoubleClick', payload: 'mouse', summary: 'The control was double-clicked. `mouse.x` and `mouse.y` say where.' },
  { id: 'pointerDown', fn: 'onPointerDown', payload: 'mouse', summary: 'A mouse button was pressed on the control. `mouse.x` and `mouse.y` say where, `mouse.button` which button, and `mouse.modifiers` which modifier keys were held.' },
  { id: 'pointerMove', fn: 'onPointerMove', payload: 'mouse', summary: 'The mouse moved while a button was held down on the control. `mouse.x` and `mouse.y` give the new position.' },
  { id: 'pointerUp', fn: 'onPointerUp', payload: 'mouse', summary: 'The mouse button was released.' },
  { id: 'hoverStart', fn: 'onHoverStart', payload: null, summary: 'The mouse pointer moved onto the control.' },
  { id: 'hoverEnd', fn: 'onHoverEnd', payload: null, summary: 'The mouse pointer left the control.' },
  { id: 'wheel', fn: 'onWheel', payload: 'wheel', summary: 'The mouse wheel was turned over the control. `wheel.delta` says how far, and in which direction.' },
  { id: 'stateChanged', fn: 'onStateChanged', payload: 'state', summary: 'The control\'s look-state changed. `state` is one word: "normal", "hover", "pressed" or "disabled".' },
];

// `panelStateChanged` used to be declared here. There is no panel-state feature in the model —
// nothing in the editor, the player, or the C++ runtime ever switched one — so the event could
// not fire in any runtime. Declaring an event no runtime raises is the same defect as declaring
// a command no runtime implements; it comes back when panel states do.
export const PANEL_EVENTS = [
  { id: 'controlChanged', fn: 'onControlChanged', payload: 'info', summary: 'Any control on the panel changed. `info.target` is the control\'s name and `info.value` its new value. Use it to react to many controls in one place.' },
  { id: 'timer', fn: 'onTimer', payload: 'info', summary: 'A timer you started is due. `info.id` is the name you gave it in `ce.time.startTimer()` or `ce.time.syncTimer()`.' },
];

// Musical time. Raised by whichever runtime is following the clock — the editor's master clock, or
// the DAW playhead window-closed — by watching the position on the MESSAGE THREAD at roughly 30Hz.
//
// That polling rate is the honest limit and it is stated everywhere these appear: a beat at 120bpm
// is 500ms, so the event lands within a frame of it, which is right for lighting an LED, advancing
// a setlist or stepping a sequencer. It is NOT sample-accurate and must never be used to time audio.
export const TIME_EVENTS = [
  { id: 'beat', fn: 'onBeat', payload: 'time', summary: 'A beat went by while the transport is playing. `time.bar` and `time.beat` give the position, `time.beats` the total count of beats, and `time.bpm` the tempo. It arrives within a thirtieth of a second of the beat: right for lighting an LED or stepping a display, not for timing sound.' },
  { id: 'bar', fn: 'onBar', payload: 'time', summary: 'A new bar started. `time.bar` is the bar number, `time.beats` the total count of beats, and `time.beatsPerBar` the time signature\'s beats per bar. It fires on the downbeat, together with onBeat.' },
  { id: 'transport', fn: 'onTransport', payload: 'time', summary: 'The transport started, stopped or changed tempo. `time.playing` says whether it is running, `time.bpm` gives the tempo and `time.source` what is driving it.' },
];

export const DEVICE_EVENTS = [
  // decoded (the DPD payoff — 90% of use)
  { id: 'parameterReceived', fn: 'onParameterReceived', payload: 'info', decoded: true, summary: 'The synth reported a parameter value and the device profile has decoded it. `info.parameter` is the parameter\'s id and `info.value` its value, in the parameter\'s own units.' },
  { id: 'dumpReceived', fn: 'onDumpReceived', payload: 'dump', decoded: true, summary: 'A bulk dump from the synth arrived and has been decoded. The controls bound to its parameters are already filled in by the time this runs. `dump.values` holds every decoded value (parameter id to value), `dump.kind` names the dump, such as "patch", and `dump.role` the device it came from.' },
  // A preset changed on the instrument OR from this panel, which is one event on purpose: a script
  // that repaints a name display does not care which end pressed the button, and giving it two
  // events would mean every such script wiring both and getting it wrong once.
  { id: 'presetChange', fn: 'onPresetChange', payload: 'preset', decoded: true, summary: 'The current preset changed. `preset.slot`, `preset.program`, `preset.name`, `preset.category` and `preset.bankId` describe the new one. `preset.source` says which end changed it: "device" when the instrument sent a Program Change, "panel" when the panel called recallPreset.' },
  // raw (escape hatch)
  { id: 'midiIn', fn: 'onMidiIn', payload: 'midi', decoded: false, summary: 'Any MIDI message arrived, exactly as received. `midi.bytes` holds the message, `midi.status` its first byte and `midi.channel` its channel, counted from 0.' },
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', decoded: false, summary: 'A Control Change message arrived. `cc.cc` is the controller number and `cc.value` its value. Note that `cc.channel` is 0-based here (0 to 15), unlike sendCC and onNoteIn, which count channels 1 to 16.' },
  // The most common message on the wire had no event of its own: a panel reacting to played notes
  // had to take onMidiIn and decode status nibbles by hand, in every language, including the
  // note-on-with-velocity-0 case that actually means note-off. Both are derived from the STATUS
  // BYTE rather than from the host's messageType, so the two runtimes cannot classify differently.
  { id: 'noteIn', fn: 'onNoteIn', payload: 'note', decoded: false,
    summary: 'A note was played. `note.channel` (1-16, the same as sendNote), `note.note` and `note.velocity` describe it. A note-on with velocity 0 means "note off" in MIDI, so it arrives as onNoteOffIn instead.' },
  { id: 'noteOffIn', fn: 'onNoteOffIn', payload: 'note', decoded: false,
    summary: 'A note was released. `note.channel` (1-16), `note.note` and `note.velocity` describe it; the velocity is the release velocity, or 0 when the device sent a note-on with velocity 0 instead of a note-off.' },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'A System Exclusive (SysEx) message arrived. `bytes` is the message as a list of numbers.' },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A device became connected and ready. `device.role` names which device it is, `device.profileId` its device profile.' },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A device is no longer connected and ready. `device.role` names which device it was, and `device.message` may say why.' },
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
    summary: 'A sequencer moved to its next step. `step.target` is the component\'s name, `step.index` the step number (counting from 1), `step.of` how many steps there are, and `step.notes` the notes it plays. Raised by the Arpeggiator, Turing Machine, Phrase Sequencer and Looper.' },
  { id: 'cycle', fn: 'onCycle', payload: 'cycle', runtime: RUNTIME_WEBVIEW,
    summary: 'A sequence or loop came back round to its start. `cycle.target` is the component\'s name and `cycle.count` how many times it has come round since the panel opened. Raised by the Arpeggiator, Turing Machine, Looper and Orbit.' },
  { id: 'hit', fn: 'onHit', payload: 'hit', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or ribbon was struck. `hit.target` is the component\'s name, `hit.id` which pad or key, `hit.note` the note and `hit.velocity` how hard. Raised by the Chord Pad, Drum Pads and Note Ribbon.' },
  { id: 'release', fn: 'onRelease', payload: 'release', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or ribbon was let go. `release.target` is the component\'s name, `release.id` which pad or key, and `release.note` the note.' },
  { id: 'scene', fn: 'onScene', payload: 'scene', runtime: RUNTIME_WEBVIEW,
    summary: 'The Setlist switched to a scene. `scene.target` is the component\'s name, `scene.index` the scene number (counting from 1) and `scene.name` its name. It fires however the scene was chosen, by a script or by a footswitch.' },
  { id: 'stage', fn: 'onStage', payload: 'stage', runtime: RUNTIME_WEBVIEW,
    summary: 'A component moved into a new stage. `stage.target` is the component\'s name, `stage.stage` the new stage and `stage.previous` the old one. The Recorder reports "idle", "armed", "recording" and "overdub"; the Envelope reports "sustain", "release" and "end". This is not the same as onStateChanged, which is about hover and press.' },
  { id: 'settled', fn: 'onSettled', payload: 'settled', runtime: RUNTIME_WEBVIEW,
    summary: 'A spring-loaded control finished gliding back to its rest position. `settled.target` is the component\'s name and `settled.value` where it came to rest. Raised by the Ribbon, Crossfader and Vector Joystick.' },
  { id: 'bounce', fn: 'onBounce', payload: 'bounce', runtime: RUNTIME_WEBVIEW,
    summary: 'The Kinetic ball hit a wall. `bounce.target` is the component\'s name, `bounce.x` and `bounce.y` where it hit, and `bounce.vx` and `bounce.vy` its speed across and down.' },
  { id: 'recall', fn: 'onRecall', payload: 'recall', runtime: RUNTIME_WEBVIEW,
    summary: 'The Constellation snapped to one of its presets. `recall.target` is the component\'s name, `recall.id` the preset and `recall.label` its label. It fires in snap mode only, not in blend mode.' },
  { id: 'zone', fn: 'onZone', payload: 'zone', runtime: RUNTIME_WEBVIEW,
    summary: 'A Meter\'s reading crossed into a different zone, such as from green into red. `zone.target` is the component\'s name, `zone.zone` the new zone, `zone.previous` the old one and `zone.value` the reading.' },
  { id: 'voiced', fn: 'onVoiced', payload: 'voiced', runtime: RUNTIME_WEBVIEW,
    summary: 'A component turned one played note into other notes. `voiced.target` is the component\'s name, `voiced.note` and `voiced.velocity` the note that was played, and `voiced.out` the notes it produced. Raised by the Zone Splitter and the Harmoniser.' },
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
    summary: 'Change a value on the panel — usually a control\'s value, but any property a path can reach. Add .normalizedValue to the path to give a position from 0 to 1 instead of the real value. A change you make this way is sent to the synth, except while your script is reacting to MIDI that came from the synth: then it stays silent, so the synth does not get its own value echoed back.',
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
    summary: 'Read a value from the panel. A control\'s value comes in three forms: add .value (the default), .normalizedValue or .midiValue to the end of the path, or pass the form\'s name as `form`. Returns nothing if the control or property does not exist.',
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
    summary: 'Run a block of code that changes controls without sending anything to the synth — for example an Init Patch button that resets twenty controls at once. Sending switches back on by itself when the block ends.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'noTransmit(function()\n  $0\nend)', javascript: 'noTransmit(() => {\n  $0\n})' },
  },
  {
    id: 'transmit', category: 'Transmit', signature: 'transmit(fn)',
    summary: 'Run a block of code whose changes are sent to the synth even while your script is reacting to MIDI from the synth, when they would normally stay silent.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: { lua: 'transmit(function()\n  $0\nend)', javascript: 'transmit(() => {\n  $0\n})' },
  },

  /* --- Events & Flow (Q3, Q6) --- */
  {
    id: 'on', category: 'Events & Flow', signature: 'on(target, event, fn)',
    summary: 'Listen for an event from any script: on another control, on the panel, on the device, or a custom event announced with emit. `target` is the name of what to listen to ("*" means anything), `event` the handler name, such as "onValueChanged", and `fn` the function to call. Put it at the top of a script, outside any function, so it is set up once when the script loads. A script also answers the one event in its Runs on setting without this.',
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
    summary: 'Stop listening to an event you started listening to with on. It removes this script\'s listeners for that target and event; other scripts\' listeners are left alone. Naming something you were not listening to does nothing.',
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
    summary: 'Call `fn(value, previous)` whenever a path on the panel changes — a control\'s value, a colour, a setting deep inside a section. It fires whatever made the change: a script, the user, or MIDI from the synth.',
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
    summary: 'Turn a property into a formula. `fn` is worked out again whenever anything on the panel changes, and its result is written to `path` — for example a label that always shows the cutoff frequency.',
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
    summary: 'Check or change every value written to `path` before it lands. `fn(value, previous)` can return a different value to use instead (to clamp, round or snap it), return false to refuse the change, or return nothing to let it through unchanged.',
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
    summary: 'Give a function a name so other scripts can call it. Any script, in any language, can then run it with run("name"), and the panel offers it wherever controls can be set to trigger an action.',
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
    summary: 'Announce a custom event by name, optionally with some data. Every script listening for it with on("*", name, fn) is called. The announcing script does not wait for an answer; use run when you need one.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'data', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'emit("${1:name}", ${2:data})$0', javascript: 'emit("${1:name}", ${2:data})$0' },
  },
  {
    id: 'run', category: 'Events & Flow', signature: 'run(target.action [, args])',
    summary: 'Call an action that another script has defined, and get its result back. Name it as "action", or as "control.action" to call the function of that name in a particular control\'s script. It works across languages, so only plain data — numbers, text, true/false, lists and tables — can be passed in and returned.',
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
    summary: 'Start a repeating timer called `id` that fires every `ms` milliseconds. Each time it fires, your `onTimer` handler runs with `info.id` set to that name, until you call `ce.time.stopTimer()` with the same `id`. Starting an `id` that is already running restarts it with the new interval, and turns a `ce.time.syncTimer()` timer of that name into a plain millisecond one.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'ms', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'startTimer("${1:id}", ${2:250})$0', javascript: 'startTimer("${1:id}", ${2:250})$0' },
  },
  {
    id: 'after', category: 'Events & Flow', signature: 'after(ms, fn) -> id',
    summary: 'Run `fn` once, `ms` milliseconds from now. Returns an id you can pass to `ce.time.stopTimer()` to cancel it before it runs.',
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
    summary: 'Stop a timer started with `ce.time.startTimer()` or `ce.time.syncTimer()`, or cancel a `ce.time.after()` before it runs. Stopping an id that is not running does nothing and is not an error.',
    params: [{ name: 'id', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'stopTimer("${1:id}")$0', javascript: 'stopTimer("${1:id}")$0' },
  },

  /* --- Device / MIDI: bulk (Q9) --- */
  {
    id: 'requestDump', category: 'Device / MIDI', signature: 'requestDump(kind [, fn [, opts]])',
    summary: 'Ask the synth to send a dump — all of a patch\'s settings in one message. `kind` is a dump the device profile knows, such as "patch" or "global", or one declared with defineDump. When the dump arrives, the bound controls are filled and onDumpReceived runs. Give `fn` and it is also called with `(values, info)`; `info.ok` is false when nothing arrived in time (3 seconds, unless `opts.timeout` says otherwise).',
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
    id: 'recallPreset', category: 'Device / MIDI', signature: 'recallPreset(slot [, opts])',
    summary: 'Switch the synth to a stored preset, using whatever message the device profile says that synth needs: a Program Change, a Bank Select plus a Program Change, or a SysEx message. Returns { ok, error, slot, name, category, messages }. `slot` counts presets across all banks, as the device profile numbers them — it is not the MIDI program number. On a synth whose second bank starts at 64, slot 64 is that bank\'s first preset, whatever program number it uses.',
    params: [
      { name: 'slot', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'role', type: 'string', default: '"mainSynth"',
          summary: 'Which device to recall on, when the panel names more than one.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'recallPreset(${1:0})$0', javascript: 'recallPreset(${1:0})$0' },
  },
  {
    id: 'preset', category: 'Device / MIDI', signature: 'preset([role])',
    summary: 'Describe the preset that is loaded now: { slot, program, name, category, bankId, bankLabel, writable, source }. Most synths do not announce their preset when they connect and cannot be asked, so this reports what the panel has seen — a Program Change arriving or a recallPreset going out. Until then `slot` is -1.',
    params: [{ name: 'role', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'local p = preset()$0', javascript: 'const p = preset();$0' },
  },
  {
    id: 'applyDump', category: 'Device / MIDI', signature: 'applyDump(bytes)',
    summary: 'Fill the panel from a dump. Give the raw bytes and the device profile decodes them and sets every bound control; give a table of parameter values (parameter id to value) and they are applied directly. Nothing is sent back to the synth.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'applyDump(${1:bytes})$0', javascript: 'applyDump(${1:bytes})$0' },
  },
  {
    id: 'sendDump', category: 'Device / MIDI', signature: 'sendDump(kind)',
    summary: 'Build a dump from the panel\'s current values and send it to the synth.',
    params: [{ name: 'kind', type: 'dumpKind', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendDump("${1:patch}")$0', javascript: 'sendDump("${1:patch}")$0' },
  },
  {
    id: 'buildDump', category: 'Device / MIDI', signature: 'buildDump(kind)',
    summary: 'Build a dump from the panel\'s current values and return its bytes without sending them — for example to store it or change it first.',
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
    summary: 'Make a colour lighter. `amount` runs from 0 (unchanged) to 1 (white) and defaults to 0.4. Returns nothing if the colour cannot be read.',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'amount', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'darken', category: 'Value / range', signature: 'darken(colour [, amount]) -> string',
    summary: 'Make a colour darker. `amount` is how much of the colour\'s brightness to keep: 1 leaves it unchanged, 0 makes it black, and the default is 0.55. This runs the opposite way to `ce.math.lighten()`, where a bigger `amount` means a bigger change. Returns nothing if the colour cannot be read.',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'amount', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'mixColour', category: 'Value / range', signature: 'mixColour(a, b, t) -> string',
    summary: 'Blend two colours: `t` of 0 gives `a`, 1 gives `b`, and 0.5 the colour halfway between. Red, green and blue are each blended in a straight line, which suits something like a meter fading from green to red. `t` is held inside 0 to 1. Returns nothing if either colour cannot be read.',
    params: [
      { name: 'a', type: 'string', required: true },
      { name: 'b', type: 'string', required: true },
      { name: 't', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'colourAlpha', category: 'Value / range', signature: 'colourAlpha(colour, a) -> string',
    summary: 'Give a colour a transparency, ready to store in a control\'s colour property. `a` runs from 0 (fully transparent) to 1 (fully solid). The result is in the panel\'s own stored form, AARRGGBB with no leading #, which makes this the one colour command that does not return "#RRGGBB". Take care: the web\'s `#RRGGBBAA` form holds the same four bytes in the opposite order, so the two cannot be swapped for each other. To make something you draw see-through, use `ce.draw.opacity()` instead. Returns nothing if the colour cannot be read.',
    params: [
      { name: 'colour', type: 'string', required: true },
      { name: 'a', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'hexToRgb', category: 'Value / range', signature: 'hexToRgb(colour) -> table',
    summary: 'Split a colour into its red, green and blue parts, returned as { r, g, b } with each from 0 to 255. Returns nothing if the colour cannot be read.',
    params: [{ name: 'colour', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'rgbToHex', category: 'Value / range', signature: 'rgbToHex(r, g, b) -> string',
    summary: 'Build a colour from red, green and blue parts, each from 0 to 255, and return it as "#RRGGBB". A part outside that range is held at 0 or 255 rather than wrapping round, and fractions are rounded.',
    params: [
      { name: 'r', type: 'number', required: true },
      { name: 'g', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'hexToHsl', category: 'Value / range', signature: 'hexToHsl(colour) -> table',
    summary: 'Describe a colour as { h, s, l }: hue from 0 to 360, and saturation and lightness from 0 to 100, the same ranges the colour editor uses. The numbers are not rounded. A grey has hue 0 and saturation 0. Returns nothing if the colour cannot be read.',
    params: [{ name: 'colour', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'hslToHex', category: 'Value / range', signature: 'hslToHex(h, s, l) -> string',
    summary: 'Build a colour from hue (0 to 360), saturation and lightness (0 to 100) and return it as "#RRGGBB". The reverse of `ce.math.hsl()`.',
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
    summary: 'Move a value smoothly to `target` over time instead of jumping straight there. Pass a list of controls to move them all with one call; `opts.stagger` starts each one a little after the one before. Starting a new move on a value that is already animating replaces the old move, and the old one\'s `done` callback runs with `completed` set to false, because it was cancelled rather than finished.',
    params: [
      { name: 'path', type: 'path', required: true },
      { name: 'target', type: 'number', required: true },
      { name: 'opts', type: 'object', required: false,
        fields: optionFields([
          'duration', 'beats', 'sync',
          { name: 'curve', type: 'text or list', default: '"linear"',
            values: [...ANIM_CURVE_NAMES],
            summary: `The shape of the move. The first ${CURVE_NAMES.length} names are the curves of `
              + '`ce.math.curve()`; the rest are the easings the Animation tab offers, so a script and an '
              + 'animation that name the same curve move the same way. "spring" overshoots and settles like '
              + '`ce.anim.spring()`, shaped by `damping` and `frequency`. Instead of a name you can give the '
              + 'four numbers of a custom curve — x1, y1, x2, y2, as the Animation tab shows them — so an '
              + 'animation\'s `bezier` can be passed straight in; x1 and x2 are kept between 0 and 1. A name '
              + 'it does not know is reported, and the move runs in a straight line.' },
          { name: 'damping', type: 'number', default: '6',
            summary: 'With curve = "spring": how quickly the wobble dies away, as ce.anim.spring reads it.' },
          { name: 'frequency', type: 'number', default: '12',
            summary: 'With curve = "spring": how fast it wobbles, as ce.anim.spring reads it.' },
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
    summary: 'Move a value to `target` with a springy motion: it overshoots, wobbles and settles. `opts.damping` sets how quickly the wobble dies away and `opts.frequency` how fast it wobbles; the move lasts 600 ms unless you set `opts.duration`. Every other option `ce.anim.to()` takes works here too except `curve`, and you can pass a list of controls the same way.',
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
    summary: 'Stop the animation on `path` and leave the value wherever it has got to. With no `path`, every animation on the panel stops. Any `done` callback runs with `completed` set to false. To jump to the end instead, use `ce.anim.finish()`.',
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.anim.stop("${1:cutoff}")$0', javascript: 'ce.anim.stop("${1:cutoff}");$0' },
  },
  {
    id: 'animateRunning', category: 'Animation', signature: 'animateRunning([path])',
    summary: 'Return true if `path` is being animated right now; a paused animation still counts. With no `path`, return true if any animation is running.',
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
    summary: 'Move a value through a shape with several points — an attack and decay, say, or a hold and then a fall — so it can rise and fall within one animation, which `ce.anim.to()` cannot do. `points` is a list of { x, y } points from 0 to 1, the same form the Envelope component uses: x is how far through the animation, y is the level. y = 0 means `opts.from` (default 0) and y = 1 means `opts.to` (default 1), so to sweep a 0–127 knob, set `opts.to` to 127. It needs at least two points; with fewer, nothing starts and a note is written to the script console.',
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
    summary: 'Describe the animation running on `path`. The table has `path`, `kind` ("to", "spring" or "envelope"), `value` (where it is now), `progress` (0 to 1), `from`, `to`, `elapsed`, `remaining`, `paused`, `cycle` and `sync`. Returns nothing if `path` is not animating. For an animation that follows the transport, `elapsed` and `remaining` are empty, because its timing depends on the transport rather than the clock.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateList', category: 'Animation', signature: 'animateList() -> list',
    summary: 'List every running animation, sorted by path, each described the same way `ce.anim.value()` describes one.',
    scopes: 'any',
  },
  {
    id: 'animatePause', category: 'Animation', signature: 'animatePause(path)',
    summary: 'Hold an animation where it is without ending it; `ce.anim.resume()` carries on from the same point. Returns false if nothing is animating on `path` or it is already paused.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateResume', category: 'Animation', signature: 'animateResume(path)',
    summary: 'Carry on a paused animation from where `ce.anim.pause()` held it, rather than starting it again. Returns false if there is no paused animation on `path`.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateReverse', category: 'Animation', signature: 'animateReverse(path)',
    summary: 'Turn a running animation round so it heads back to where it started, at the same speed — a move that was 80% done takes 80% of its time to get back. An envelope plays its shape backwards as well. Returns false if nothing is animating on `path`.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  {
    id: 'animateFinish', category: 'Animation', signature: 'animateFinish(path)',
    summary: 'End an animation by jumping straight to its end: the value lands exactly where the animation was heading, and `done` runs with `completed` set to true. To cancel instead and leave the value where it is, use `ce.anim.stop()`. Returns false if nothing is animating on `path`.',
    params: [{ name: 'path', type: 'path', required: true }],
    scopes: 'any',
  },
  /* ce.anim's other verbs move a VALUE along a curve. This one plays an animation a control already
     has — a keyframe animation built in the Animation tab: a pulse, a flash — the way its own trigger
     would. It is drawn, not computed, so it is panel view only: with the window shut there is
     nothing to play it on, and the C++ preludes carry a no-op stub for it like every visual verb. */
  {
    id: 'animatePlay', category: 'Animation', signature: 'animatePlay(control, animation)',
    summary: 'Play one of a control\'s keyframe animations (the ones made in the Animation tab) right now, from its first frame — restarting it if it is already playing. Returns true if the control has a keyframe animation with that name; the name is not case-sensitive. A transition cannot be started this way, because it plays when its own trigger happens: asking for one returns false and writes a message to the script console listing the keyframe animations the control does have.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true },
      { name: 'animation', type: 'string', required: true },
    ],
    scopes: 'any',
  },

  /* --- User feedback (design doc §6 phase 6, §18) ---
     Panel view only: there is nobody to tell with the window shut. `notify` and `status` are
     fire-and-forget; `dialog` asks a question, and the answer arrives through a CALLBACK rather
     than a return value, because an answer necessarily arrives later than the call. */
  {
    id: 'uiNotify', category: 'User feedback', signature: 'uiNotify(message [, opts])',
    summary: 'Show a short pop-up message to the person using the panel, and return its ID. It disappears after 3 seconds unless you set `opts.duration` (in milliseconds); 0 or less keeps it up until it is dismissed. Use it for things the user should know about, not for debugging — that is what `log()` is for. Pass the ID to `ce.ui.update()` to change the message in place, or to `ce.ui.dismiss()` to remove it.',
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
    summary: 'Show a line of text in the status bar. It stays until you replace it; call this with no message to clear it. Use it for an ongoing state, such as "Recording" or "Synced" — for a one-off event, use `ce.ui.notify()`. Read the current status back with `ce.ui.state()`.',
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
    summary: 'Ask a question with buttons. The answer arrives later through `onChoice`, which receives the label of the button that was clicked, or nothing if the dialog was closed without a choice. Only one dialog can be open at a time. The call itself returns true if the dialog appeared; if it returns false, nothing was shown — for example because another dialog is already open — and `onChoice` has already been called with nothing.',
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
    summary: 'Ask the user to type some text. The answer arrives through `onAnswer`: the text they typed, or nothing if they cancelled. An empty answer (they accepted an empty field) is not the same as no answer. Pressing Enter accepts. Returns true if the dialog appeared; if it returns false, `onAnswer` has already been called with nothing.',
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
    summary: 'Ask the user to pick from a list. The answer arrives through `onAnswer`: the chosen item, a list of items if `opts.multiple` is set, or nothing if they cancelled. A long list scrolls rather than making the dialog taller. Returns true if the dialog appeared; if it returns false — for example because `opts.items` is empty — `onAnswer` has already been called with nothing.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true,
        fields: optionFields([
          'uiTitle', 'uiMessage',
          { name: 'items', type: 'list of text', required: true,
            summary: 'The choices to offer. A long list scrolls.' },
          { name: 'default', type: 'text', default: 'the first item', sample: '"Init"',
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
    summary: 'Remove a message shown with `ce.ui.notify()`; the user can also remove one by clicking it. With no `id`, every message is removed. Returns how many were removed.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'id', type: 'number', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.dismiss(${1:id})$0', javascript: 'ce.ui.dismiss(${1:id});$0' },
  },
  {
    id: 'uiUpdate', category: 'User feedback', signature: 'uiUpdate(id, message [, opts]) -> boolean',
    summary: 'Change the text of a message that is already showing, in place. To show progress, show the first message with an `opts.duration` of 0 so it stays up, then update it as you go. Returns false once the message has gone — for example because the user dismissed it — so you know to stop updating.',
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
    summary: 'Return what is on screen: `status`, `statusKind`, `notifications` (a list, each with `id`, `message`, `kind` and `sticky`) and `dialog`. `dialog` is true while a dialog is open, which tells you why `ce.ui.dialog()` returned false: another dialog was already showing, rather than there being no panel window to show it in.',
    runtime: RUNTIME_WEBVIEW,
    scopes: 'any',
    snippet: { lua: 'if not ce.ui.state().dialog then $0 end', javascript: 'if (!ce.ui.state().dialog) { $0 }' },
  },
  {
    id: 'uiCopy', category: 'User feedback', signature: 'uiCopy(text) -> boolean',
    summary: 'Copy text to the clipboard. The copy happens in the background, and the system may refuse it unless it follows a click by the user, so true means the copy was attempted, not that it worked; a refusal is written to the script console. Scripts cannot read the clipboard.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'text', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.copy(ce.storage.encode(buildDump("${1:patch}")))$0', javascript: 'ce.ui.copy(ce.storage.encode(buildDump("${1:patch}")));$0' },
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
    summary: 'Erase everything drawn on this control, or on the control named `target`. Drawing commands add to what is already there rather than replacing it, so this is usually the first line of onDraw.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.clear()$0', javascript: 'ce.draw.clear();$0' },
  },
  {
    id: 'drawFill', category: 'Drawing', signature: 'drawFill(colour)',
    summary: 'Set the fill colour for the shapes drawn after this: a hex string such as "#5B9BD5", or a gradient from `ce.draw.gradient()`. Call it with no colour to stop filling. Each onDraw starts with no fill and no stroke, so set one of them before you draw shapes.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'colour', type: 'string', required: false }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.fill("${1:#5B9BD5}")$0', javascript: 'ce.draw.fill("${1:#5B9BD5}");$0' },
  },
  {
    id: 'drawStroke', category: 'Drawing', signature: 'drawStroke([colour] [, width] [, opts])',
    summary: 'Set the line colour and thickness for the shapes drawn after this. `width` defaults to 1, and `colour` can be a hex string or a gradient from `ce.draw.gradient()`; with no colour, outlines are not drawn. `opts` adds dashes and sets the style of line ends and corners.',
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
    summary: 'Draw a rectangle at (`x`, `y`), `w` wide and `h` tall, measured from the control\'s top-left corner. `radius` rounds the corners.',
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
    summary: 'Draw a circle of radius `r`, centred on (`cx`, `cy`).',
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
    summary: 'Draw a straight line from (`x1`, `y1`) to (`x2`, `y2`) in the current stroke colour and width. The fill colour does not apply to lines.',
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
    summary: 'Draw a line through a series of points, given as one flat list of coordinates: { x1, y1, x2, y2, ... }. Set `closed` to true to join the last point back to the first. Note the flat list: `ce.draw.curve()` and `ce.draw.points()` take a list of [x, y] pairs instead.',
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
    summary: 'Draw part of a circle centred on (`x`, `y`), from angle `from` to angle `to`. Angles are in degrees, with 0 at twelve o\'clock and increasing clockwise, the same as the Meter\'s `arcStart` and `arcSweep`. The arc is drawn in the stroke colour; if a fill is set, it is filled as a pie slice.',
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
    summary: 'Make a gradient to pass to `ce.draw.fill()` or `ce.draw.stroke()` in place of a plain colour. Give a plain list of colours to space them evenly, or a list of { at, colour, opacity } to place each one yourself (`at` runs from 0 to 1); you can mix the two. `angle` is in degrees, 0 pointing up and 90 pointing right, the same as the Background section\'s gradients; without it the gradient runs from top to bottom. Returns nothing if there are fewer than two usable colours.',
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
    summary: 'Set how solid everything drawn after this is, from 0 (invisible) to 1 (fully solid). Like fill and stroke, it applies to everything that follows, not to one shape. Call it with no number to switch it off again. To make a single colour see-through instead, use `ce.math.alpha()`.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'a', type: 'number', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawTransform', category: 'Drawing', signature: 'drawTransform([opts])',
    summary: 'Rotate, move or scale everything drawn after this. To turn a shape about its own centre, such as a knob\'s pointer, give that centre as `opts.cx` and `opts.cy`. Each call replaces the previous transform rather than adding to it, and calling it with no options clears it.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'rotate', type: 'number', default: '0', unit: 'degrees',
        summary: 'Turn everything drawn after this clockwise.' },
      { name: 'cx', type: 'number', default: 'the top-left corner', unit: 'pixels', sample: '40',
        summary: 'The horizontal point to rotate about. Give `cx` and `cy` together; without them '
          + 'the rotation turns about the top-left corner, which makes a shape orbit that corner.' },
      { name: 'cy', type: 'number', default: 'the top-left corner', unit: 'pixels', sample: '40',
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
    summary: 'Draw an oval centred on (`cx`, `cy`), with horizontal radius `rx` and vertical radius `ry`.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true }, { name: 'cy', type: 'number', required: true },
      { name: 'rx', type: 'number', required: true }, { name: 'ry', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'drawPixelText', category: 'Drawing', signature: 'drawPixelText(text, x, y [, scale])',
    summary: 'Write text in the app\'s built-in 5x7 LCD font, the same one the LCD components show. `scale` is how many screen pixels make one font pixel, a whole number, 1 by default. Each lit pixel is drawn as a sharp square, with no smoothing. (`x`, `y`) is the top-left corner of the text, unlike `ce.draw.text()`, where `y` is the baseline.',
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
    summary: 'Measure a piece of text before drawing it. Returns { width, height, exact }. Give `opts.size` and `opts.family` for ordinary text (size 12 by default), or set `opts.pixel` to true for the LCD font. The LCD font is a fixed grid, so its answer is always exact. Ordinary text has to be measured, and if that cannot be done the result is an estimate and `exact` is false.',
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
    summary: 'Run `fn` and show all the drawing it does in one update, instead of one update per command. Use it when you draw in a loop, such as a waveform or a row of tick marks, where it is several times faster. `ce.draw.grid()`, `ce.draw.lines()` and `ce.draw.points()` already draw a whole set in one go and do not need it.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawGrid', category: 'Drawing', signature: 'drawGrid([opts]) -> boolean',
    summary: 'Draw a whole grid of lines in one command. It covers the control unless you give a box. Give either a spacing (`opts.step`, or `opts.stepX` and `opts.stepY`) or a number of `opts.columns` and `opts.rows`; with neither, nothing is drawn and it returns false. The closing lines are drawn too, so a 4-column grid has five vertical lines.',
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
    summary: 'Draw many separate straight lines in one command, from a list of [x1, y1, x2, y2]. Use it for things that are not joined up: tick marks, the rungs of a level meter, a grid you work out yourself. To draw one connected line through a series of points, use `ce.draw.path()`.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'segments', type: 'list', required: true }],
    scopes: 'any',
  },
  {
    id: 'drawPoints', category: 'Drawing', signature: 'drawPoints(points [, radius]) -> boolean',
    summary: 'Draw a set of dots in one command, from a list of [x, y]. `radius` defaults to 1.5 and does not depend on the stroke width.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'list', required: true },
      { name: 'radius', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'drawCurve', category: 'Drawing', signature: 'drawCurve(points [, opts]) -> boolean',
    summary: 'Draw a smooth curve that passes through a list of points, each given as [x, y], in one command. It needs at least two points. `opts.tension` sets how round the curve is, and `opts.closed` joins it into a loop, which is filled if a fill is set.',
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
    summary: 'Draw a shape with `sides` equal sides, such as a triangle or a hexagon, centred on (`cx`, `cy`) with its corners `radius` away from the centre. At rotation 0 a corner points to twelve o\'clock; `opts.rotation` turns it clockwise in degrees, the same way `ce.draw.arc()` measures angles, so the two line up. Fewer than three sides counts as three.',
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
    summary: 'Draw an image in the box at (`x`, `y`), `w` wide and `h` tall. `src` must be the image data itself: a data URL, or the `dataUrl` of a library icon from `ce.image.asset()`. An asset\'s name on its own draws nothing, and an empty `src` is refused with a message. `opts.fit` sets how the image fills the box.',
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
    summary: 'Limit everything drawn after this to the rectangle (`x`, `y`, `w`, `h`). Like fill and stroke, it stays in force until you change it, and `ce.draw.save()` and `ce.draw.restore()` include it. Call it with no arguments to remove it. Drawing never goes outside the control anyway, so a clip can only make the area smaller.',
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
    summary: 'Choose how what you draw next mixes with what is already underneath: "normal" (the default), "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". An unknown mode is refused with a message and returns false.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'mode', type: 'string', required: true,
      values: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
        'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'] }],
    scopes: 'any',
  },
  {
    id: 'drawSave', category: 'Drawing', signature: 'drawSave() -> boolean',
    summary: 'Remember the current drawing style (fill, stroke, width, dashes, line ends and corners, opacity, transform, clip and blend) so `ce.draw.restore()` can bring it back. Saved styles are thrown away at the start of each onDraw, so a forgotten restore cannot affect the next drawing.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'drawRestore', category: 'Drawing', signature: 'drawRestore() -> boolean',
    summary: 'Bring back the style saved by the most recent `ce.draw.save()`. If nothing was saved, it reports an error, returns false and leaves the style as it is, rather than quietly going back to the defaults.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'imageAssets', category: 'Images', signature: 'imageAssets([opts]) -> list',
    summary: 'List the images in your icon library, then any icons the panel carries with it. Each entry is { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }. `source` is "panel" for a carried icon, and `portable` says whether the picture is already in the panel: true for those, false for your library\'s. Sharing or exporting copies a library icon into the panel if a control shows it or a script names it in quotes, but not one whose name a script builds while it runs. `embeddable` says whether the entry has image data that can be copied into the panel.',
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
    summary: 'Look up one image in the icon library or among the icons the panel carries, by id first and then by name (capitals do not matter), the same way the panel finds an icon when it draws one. Returns the entry, in the same form as `ce.image.assets()`, or nothing if there is no such image, so check with it before pointing a control at an asset. Be aware that a name which happens to match is returned just as an id match would be.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'idOrName', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'imageSet', category: 'Images', signature: 'imageSet(target, src [, opts]) -> boolean',
    summary: 'Put a picture on one of a control\'s four image layers and switch that layer on. The picture and the on-switch are always set together, so a layer is never left on with nothing in it. `opts.layer` picks the layer: "image" (the default) and "overlay" are background layers that stack; "textImage" and "textTexture" fill the text itself, and choosing one replaces whatever fill the text had. An option the chosen layer does not have is refused with a message, and the command returns false.',
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
    summary: 'Switch an image layer off and empty it in one step. `layer` is "image" unless you name another. Clearing "textImage" or "textTexture" also sets the text fill back to "solid", because a text fill with no picture would show nothing.',
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
    summary: 'Read all the settings of one image layer (`layer` is "image" unless you name another), plus three extra fields. `active` says whether the layer will actually be drawn; for a text layer that depends on the text\'s fill mode, not on its Enabled switch. `source` is "data", "file" or "none". `portable` says whether the image survives an export, which only embedded image data does.',
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
    summary: 'Show an image from the icon library (or one the panel carries) in a control\'s Icon section, chosen by id or name. `opts` can also set its size, fit, tint, opacity and rotation. An image that is not there is refused with a message rather than stored. Write the id or name in quotes, as a plain string: that is how sharing and exporting find the icon and pack it into the panel. Use this rather than `set()`: it records the asset\'s id and name together, so the control finds exactly that image.',
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
    summary: 'Copy a layer\'s image into the panel itself, in place of a file path that only exists on this computer, so the image survives export. If the layer already holds embedded image data, it returns true and changes nothing. If the file has not been read yet, it returns false and starts reading it; call it again once the file has loaded and it will succeed.',
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
    summary: 'Start reading an image file and report whether it is ready. A layer that points at a file shows nothing until the file has been read, and reading happens in the background, so this returns false the first time and true once the image has arrived. A data URL needs no reading and returns true straight away.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'path', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'textFonts', category: 'Typography', signature: 'textFonts([opts]) -> list',
    summary: 'List every font the panel can use, with what each one supports. `portable` says whether a font survives an export: the built-in fonts work everywhere, but a font from your font library lives on this computer, is not saved with the panel, and is replaced by a system font for anyone else. `featuresKnown` says whether the font\'s typographic features have actually been checked; when it is false, an empty `features` list means they are unknown, not that there are none.',
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
    summary: 'Look up one font by family name. Returns its description, with the same fields as `ce.text.fonts()`, or nothing if no such font is available. Capitals do not matter, and the font\'s display name works too, just as in the Properties panel. Use it to check that a font exists before you set it, or to see which variable axes it has.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'family', type: 'string', required: true }],
    scopes: 'any',
  },
  {
    id: 'textStyle', category: 'Typography', signature: 'textStyle(target, opts) -> boolean',
    summary: 'Set a control\'s typography in one call: font, size, weight, spacing, alignment and the rest. Use it rather than `set()` for the weight, because boldness is stored in two fields that must agree and this always writes both. A font that is not available, a typographic feature the font does not have, or an option that is not a text option is refused with a message, while the other options still apply. Returns false if any part did not apply.',
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
    summary: 'Set one axis of a variable font by its four-letter tag, such as "wght" for weight. The value is kept within the range the font allows, and an axis the font does not have is refused rather than stored. Setting "wght" also updates the control\'s weight, as the Properties panel\'s own axis slider does; otherwise the text would still be drawn at its old weight.',
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
    summary: 'Read one text setting by name, such as "size" or "lineHeight", without having to know which part of the Text section (Font, Multiline or Position) holds it. With no name, returns everything as { content, resolvedWeight, font, multiline, position }. `resolvedWeight` is the weight the text is actually drawn at, worked out from the two stored weight fields.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'name', type: 'string', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'textMeasure', category: 'Typography', signature: 'textMeasure(target [, text]) -> table',
    summary: 'Measure how much room a control\'s text takes up in its own font. Returns { width, height, lines, truncated, exact }, where `truncated` says whether some of the text is cut off. It lays the text out exactly as the panel does, so spacing, wrapping and line limits all count. Pass `text` to measure something the control does not hold yet. `exact` is false when the text could not actually be measured and the answer is an estimate.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true },
      { name: 'text', type: 'string', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'textFit', category: 'Typography', signature: 'textFit(target [, opts]) -> table',
    summary: 'Find the largest text size at which a control\'s text fits inside its box, write that size to the control, and return { size, fits, changed, exact }. It tries whole-number sizes from `opts.max` (the current size) down to `opts.min` (6). Setting Text.Multiline.fitMode to "shrink" only shrinks the text as it is drawn and never changes the stored size; this writes the size, so other code can read it and line things up with it. If even `opts.min` overflows, `fits` is false and the size is set to `opts.min`; the call still succeeds.',
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
    summary: 'Write text at (`x`, `y`), where `y` is the baseline, the line the letters sit on. With `opts.align` set to "left" (the default), "middle" or "right", `x` is the left end, the centre or the right end of the text. The size is 12 unless you set `opts.size`. Text is painted in the fill colour, or in the stroke colour if there is no fill.',
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
    summary: 'Ask for onDraw to run again, for this control or for the one named `target`. Nothing is redrawn on its own: to animate, call this from onTimer.',
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
    summary: 'Create a new control of the given `type`, such as "Knob", and return its name, or nothing if there is no such type (`ce.panel.types()` lists them). `props` sets its name, position, size and container, and any section settings, such as { Behavior = { min = 0, max = 127 } }. If the name is taken, a number is added to make it unique, so use the name this returns. Controls a script creates are not saved with the panel and are cleared before each onPanelBuild, which is the place to create them.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'type', type: 'string', required: true },
      { name: 'props', type: 'object', required: false, fields: optionFields([
        { name: 'name', type: 'text', default: 'one derived from the type', sample: '"cutoff"',
          summary: 'The control\'s name. Every other command addresses the control by this name.' },
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
    summary: 'Copy an existing control, with all its settings, and return the copy\'s name, or nothing if there is no control of that name. The copy goes into the same container as the original and is called `<name>_copy` unless `props` names it; a number is added if that name is taken. `props` works as in `ce.panel.create()`, so you can move the copy or change its settings as you make it.',
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
    summary: 'Remove a control, together with everything inside it. Returns true if the control was there and has been removed, false if there was no such control. It works on any control: the ones you placed in the editor as well as the ones a script created.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'ce.panel.destroy("${1:name}")$0', javascript: 'ce.panel.destroy("${1:name}");$0' },
  },
  {
    id: 'panelParent', category: 'Panel structure', signature: 'panelParent(name [, containerName])',
    summary: 'Move a control into a container, or back to the top level of the panel when `containerName` is left out. Returns true on success. A container is any control with a Children section, such as a Container or a Group. A control cannot be moved into itself or into one of the controls it contains.',
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
    summary: 'List the names of the controls that match `query`, including controls inside containers. `query` can be part of a name (capitals do not matter) or a table such as { type = "Knob", generated = true, parent = "row1" }, where `generated` picks out the controls a script created. With no query, it lists every control.',
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
    summary: 'Describe a control: { name, id, type, x, y, width, height, parent, generated }, or nothing if there is no such control. `x` and `y` are measured from the control\'s container; use `ce.panel.rect()` for its position on the panel. `generated` is true for a control a script created.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'local c = ce.panel.info("${1:name}")$0', javascript: 'const c = ce.panel.info("${1:name}");$0' },
  },
  {
    id: 'panelTypes', category: 'Panel structure', signature: 'panelTypes()',
    summary: 'List the names of every control type `ce.panel.create()` accepts.',
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
    summary: 'Line controls up on one edge or centre line: "left", "hCenter", "right", "top", "vCenter" or "bottom". By default they line up with the box around the whole group; `opts.to` names one of the listed controls to line up with instead. Returns how many controls it moved. Names that are not controls are reported and skipped.',
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
    summary: 'Space controls out evenly. "leftEdges", "hCenters", "rightEdges", "topEdges", "vCenters" and "bottomEdges" even out their positions; "hSpacing" and "vSpacing" even out the gaps between them, which suits controls of different sizes. The first and last controls stay where they are. With "hSpacing" or "vSpacing", `opts.gap` sets a fixed gap instead (the last control then moves too), and `opts.align` also lines them up the other way. Needs at least two controls; returns how many it moved.',
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
    summary: 'Make controls the same size: "width", "height" or "both". The first name in the list sets the size, unless `opts.to` names another control from the list; that control keeps its own size and the others copy it. Needs at least two controls. Returns how many controls changed.',
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
    summary: 'Arrange controls in a grid of equal cells, each as big as the largest control. They are placed in reading order (top to bottom, then left to right, with controls at about the same height, within roughly 20 pixels, counted as one row), not in the order you list them. The first control in that order stays where it is and the grid grows from there. Needs at least two controls; returns how many it moved.',
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
    summary: 'Arrange controls evenly around a circle, centred on the middle of the box they currently fill, in the order you list them. Each control\'s centre sits on the circle. `opts.startAngle` is in degrees, with 0 at three o\'clock and angles running clockwise, which differs from `ce.draw.arc()`, where 0 is twelve o\'clock. Needs at least two controls; returns how many it moved.',
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
    summary: 'Mirror the positions of controls across the middle of the box they fill: "horizontal" swaps left and right, "vertical" swaps top and bottom. Only their positions change; the controls themselves are not turned or mirrored. Needs at least two controls; returns how many it moved.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'axis', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'panelRect', category: 'Panel structure', signature: 'panelRect(name) -> table',
    summary: 'Get a control\'s position on the panel: { x, y, width, height, right, bottom }. Unlike Transform.x and Transform.y, this includes the offset of any container the control sits in. Give a list of names to get the box around the whole group. Returns nothing if none of the names is a control.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'value', required: true }],
    scopes: 'any',
  },
  {
    id: 'panelOrder', category: 'Panel structure', signature: 'panelOrder(names, where) -> number',
    summary: 'Change which controls are drawn on top of which: "front", "forward", "backward" or "back". Controls only move among the others in the same container. Controls that come later in the panel are drawn over earlier ones, so "front" moves a control to the end of its container. Returns how many controls it moved.',
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true },
      { name: 'where', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'panelBatch', category: 'Panel structure', signature: 'panelBatch(fn) -> boolean',
    summary: 'Run `fn` so that everything it changes is undone in a single step, which is useful when a script builds or rearranges a whole page. The changes appear together when `fn` finishes, though code inside `fn` already sees its own earlier changes. The undo step is closed even if `fn` fails with an error. `fn` must not wait: anything after an `await` is not part of the batch. In the exported plugin there is no undo, and `fn` simply runs.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.batch(function()\n  $0\nend)',
      javascript: 'ce.panel.batch(() => {\n  $0\n});',
    },
  },
  {
    id: 'panelKeep', category: 'Panel structure', signature: 'panelKeep([path]) -> boolean',
    summary: 'Keep a change made during preview. Preview is a rehearsal: when it stops, the panel goes back to how you built it, and anything a script changed is undone with it. `ce.panel.keep("Cutoff.Background.Fill.colour")` keeps one property; `ce.panel.keep()` with no path keeps everything this run changed. A control the script created cannot be kept, because the next run builds it again and keeping it would leave an extra copy every time. Returns false when nothing could be kept, including when the panel is not being previewed.',
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'path', type: 'path', required: false }],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.keep("${1:Cutoff.Background.Fill.colour}")$0',
      javascript: 'ce.panel.keep("${1:Cutoff.Background.Fill.colour}")$0',
    },
  },
  {
    id: 'panelEntries', category: 'Panel structure', signature: 'panelEntries(control, section)',
    summary: 'List the names of the entries in one of a control\'s collection sections (States, Bindings, Animations, Parts, ValueChannels, Behaviors, HitZones, Generators, Links or Variants), in the order the control holds them. Any other section name is refused with a message listing the ones that work.',
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
    summary: 'Get one entry from a collection section, or nothing if there is no entry of that name. Capitals in `name` do not matter, just as in a path.',
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
    summary: 'Add an entry to a collection section, or replace the entry of that name. `spec` only needs what you want to set; for States and Animations the rest is filled in for you. A new state starts with no condition and no changes. A new animation is a 120 ms change into hover and back from any state, as the Animation tab makes one, or, with `kind = "keyframes"`, an animation that plays all the time over the frames you give. Returns true if the entry was written.',
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
    summary: 'Remove an entry from a collection section. Returns true if the entry was there, false if not. `set(path, nil)` does not remove an entry; this command does.',
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
    summary: 'Change how a control looks in one of its states, such as hovered, pressed or disabled. `patch` maps property paths, such as "Background.Fill.colour", to new values, and is added to what the state already changes rather than replacing it. Give `part` to change one part of a custom component. Returns how many settings were applied, or 0 if the control has no state of that name. This is the way to reach the settings inside a state, which `set()` cannot.',
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
    summary: 'Return the current tempo in beats per minute, or nothing if nothing is supplying a tempo. Read it rather than assuming 120.',
    scopes: 'any',
    snippet: { lua: 'local bpm = tempo() or 120$0', javascript: 'const bpm = tempo() ?? 120;$0' },
  },
  {
    id: 'isPlaying', category: 'Time', signature: 'isPlaying()',
    summary: 'Return true while the transport is running. Returns false when it is stopped, and also when nothing is supplying a transport at all.',
    scopes: 'any',
    snippet: { lua: 'if isPlaying() then $0 end', javascript: 'if (isPlaying()) { $0 }' },
  },
  {
    id: 'transportInfo', category: 'Time', signature: 'transportInfo()',
    summary: 'Return everything about the transport in one table: `playing`, `bpm`, `beats`, `bar`, `beat`, `beatsPerBar`, `source` and `valid`. `beats` counts quarter notes from the very start (bar 1, beat 1), and `bar` and `beat` count from 1, as musicians do. `source` says what is driving the clock. If `valid` is false, nothing is supplying a position and the other values are only defaults, not real readings.',
    scopes: 'any',
    snippet: {
      lua: 'local t = ce.time.transport()\nif t.valid then log("bar " .. t.bar) end$0',
      javascript: 'const t = ce.time.transport();\nif (t.valid) log("bar " + t.bar);$0',
    },
  },
  {
    id: 'beatsToMs', category: 'Time', signature: 'beatsToMs(beats [, bpm])',
    summary: 'Convert a number of beats to milliseconds at the current tempo, or at `bpm` if you give one. Returns nothing if there is no tempo to work from.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'bpm', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'set("delayTime", beatsToMs(0.75))$0', javascript: 'set("delayTime", beatsToMs(0.75));$0' },
  },
  {
    id: 'msToBeats', category: 'Time', signature: 'msToBeats(ms [, bpm])',
    summary: 'Convert a length of time in milliseconds to beats (quarter notes) at the current tempo, or at `bpm` if you give one — the reverse of `ce.time.beatsToMs()`. Returns nothing if there is no tempo to work from.',
    params: [
      { name: 'ms', type: 'number', required: true },
      { name: 'bpm', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'local beats = msToBeats(${1:500})$0', javascript: 'const beats = msToBeats(${1:500});$0' },
  },
  {
    id: 'syncTimer', category: 'Time', signature: 'syncTimer(id, beats [, opts])',
    summary: 'Start a repeating timer whose interval is measured in beats rather than milliseconds: `ce.time.syncTimer("step", 0.25)` fires every sixteenth note. It works like `ce.time.startTimer()` — your `onTimer` handler runs each time, and `ce.time.stopTimer()` stops it. When the tempo changes, the interval changes with it; the timer restarts from that moment, so it does not stay lined up with its earlier ticks. Set `opts.follow` to false to keep the interval fixed at the tempo it started with. If there is no tempo to work from, no timer starts and a note is written to the script console.',
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
    summary: 'Run `fn` once after a number of beats: `ce.time.afterBeats(2, fn)` runs it two beats from now. The delay is worked out from the tempo at the moment you call it, so a later tempo change does not move it. Returns an id you can pass to `ce.time.stopTimer()` to cancel. If there is no tempo to work from, nothing is scheduled — `fn` does not run straight away either — and a note is written to the script console.',
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
    summary: 'List the ids of the repeating timers that are running — the ones started with `ce.time.startTimer()` or `ce.time.syncTimer()` — in sorted order. One-off timers from `ce.time.after()` and `ce.time.afterBeats()` are not listed; you already have their ids from when you started them.',
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
    summary: 'Return a clock reading in milliseconds, for timing things. A single reading means nothing on its own: subtract an earlier reading to find how much time has passed. It is not the time of day or a date, and it does not jump when the computer\'s clock is changed.',
    scopes: 'any',
    snippet: { lua: 'local t0 = nowMs()$0', javascript: 'const t0 = nowMs();$0' },
  },
  {
    id: 'beatsPerDivision', category: 'Time', signature: 'beatsPerDivision(name) -> number',
    summary: 'Return how many beats a note division lasts: "1/16" is 0.25, "1/8T" is 0.333… and "1/4D" is 1.5. These are the same names the sequencer components use for their division settings. Returns nothing for a name it does not recognise.',
    params: [{ name: 'name', type: 'string', required: true }],
    scopes: 'any',
    snippet: { lua: 'local beats = beatsPerDivision("1/16")$0', javascript: 'const beats = beatsPerDivision("1/16");$0' },
  },
  {
    id: 'divisionNames', category: 'Time', signature: 'divisionNames() -> list',
    summary: 'List every note division available, in the order a division menu shows them. Each entry has an `id` such as "1/16", a display `label` such as "16th", and its length in `beats`. Build your menus from this list instead of typing the names in by hand.',
    scopes: 'any',
    snippet: { lua: 'for _, d in ipairs(divisionNames()) do log(d.label) end$0', javascript: 'for (const d of divisionNames()) log(d.label);$0' },
  },
  {
    id: 'barBeatAt', category: 'Time', signature: 'barBeatAt(beats [, beatsPerBar]) -> table',
    summary: 'Turn a position in beats into bars, beats and ticks — for any position, not only where the transport is now. Returns `bar`, `beat`, `tick` and `text`. Bars and beats count from 1, and `tick` splits each beat into 24 parts (0 to 23), the same resolution as MIDI clock. `text` is written the way the Transport component displays it, such as "3.2.00". `beatsPerBar` defaults to 4.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'beatsPerBar', type: 'number', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'log(barBeatAt(transportInfo().beats).text)$0', javascript: 'log(barBeatAt(transportInfo().beats).text);$0' },
  },
  {
    id: 'stepAt', category: 'Time', signature: 'stepAt(beats, division) -> number',
    summary: 'Return which step of a note grid a position falls on — with `division` set to "1/16", for example, which sixteenth note. Steps count from 0 at the very start (bar 1, beat 1). Returns nothing if `division` is not a name it recognises.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'division', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'stepsBetween', category: 'Time', signature: 'stepsBetween(from, to, division [, max]) -> table',
    summary: 'Find the grid steps that start between two positions — after `from`, up to and including `to`. Returns `steps`, a list of the step numbers, and `dropped`, how many were left out. Use it to catch up on steps that went by between two updates, so a late update does not skip any. `max` limits how many are returned (16 by default); if more were crossed, the most recent ones are kept and the rest are counted in `dropped`. Returns nothing for an unknown division.',
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
    summary: 'Return how far to delay a step to give it swing, in beats — add it to the step\'s position. Even-numbered steps (0, 2, 4…) stay put and odd ones are pushed later by up to half a step: `amount` runs from 0 (straight) to 1 (half a step), the same number the Transport\'s swing setting holds. It uses the Transport\'s own swing calculation, so your timing matches the panel\'s sequencers. Returns nothing for an unknown division.',
    params: [
      { name: 'step', type: 'number', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'division', type: 'string', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'cycleAt', category: 'Time', signature: 'cycleAt(beats, bars [, beatsPerBar]) -> table',
    summary: 'Find where a position falls within a cycle that repeats every `bars` bars (0.25 to 64). Returns `phase`, how far through the current cycle you are, from 0 to 1; `count`, how many whole cycles have finished; and `length`, the cycle\'s length in beats. It is worked out fresh from the position each time rather than added up as it goes, so it does not drift, even after hours.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'bars', type: 'number', required: true },
      { name: 'beatsPerBar', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'loopedBeats', category: 'Time', signature: 'loopedBeats(beats, startBeats, lengthBeats) -> table',
    summary: 'Map a position on the timeline into a loop that starts at `startBeats` and lasts `lengthBeats`. Returns `beats`, the position inside the loop, and `pass`, which time round the loop you are on, counting from 0. Positions before the loop start come back unchanged with `pass` set to -1, so a count-in or lead-in works. When `pass` changes, the loop has just wrapped round. Like `ce.time.cycle()`, it is worked out fresh from the position each time, so it does not drift over long runs.',
    params: [
      { name: 'beats', type: 'number', required: true },
      { name: 'startBeats', type: 'number', required: true },
      { name: 'lengthBeats', type: 'number', required: true },
    ],
    scopes: 'any',
  },
  {
    id: 'tapTempo', category: 'Time', signature: 'tapTempo(times [, resetMs]) -> number',
    summary: 'Work out a tempo from a list of tap times, in milliseconds as `ce.time.now()` gives them. Only the taps since the last pause count: a gap longer than `resetMs` (2000 by default) starts a new measurement, so taps after a break are not averaged with the ones before it. Returns nothing if there are fewer than two usable taps. The result is kept between 20 and 300 bpm.',
    params: [
      { name: 'times', type: 'list', required: true },
      { name: 'resetMs', type: 'number', required: false },
    ],
    scopes: 'any',
  },
  {
    id: 'clockTempo', category: 'Time', signature: 'clockTempo(intervalsMs) -> number',
    summary: 'Work out the tempo from the gaps between incoming MIDI clock pulses, which arrive 24 times per beat — for example the times between `0xF8` messages you collected with `ce.midi.interceptIn()`. It uses the middle value of the gaps (the median), so one late pulse does not throw the result off. Returns nothing from an empty list. The result is kept between 20 and 300 bpm.',
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
    summary: 'Describe the device profile in use for a device: { id, name, role, connected, ... }. Returns nothing when no profile is chosen. `role` names the device and defaults to "mainSynth".',
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
    summary: 'List the synth\'s parameters as the device profile describes them, each as { id, name, group, type, min, max, access }. Use `opts` to narrow the list, for example to one group. Returns an empty list when there is nothing to show, and nothing at all only when the ce.device module is switched off.',
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
    summary: 'Describe one of the synth\'s parameters by its id, or return nothing if the device profile has no such parameter. Use it to check whether a synth has something before you try to change it.',
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
    summary: 'The last value the synth reported for a parameter, from a dump or a parameter message. Not a live query of the synth: it does not ask the synth anything. Returns nothing if the synth has never reported that parameter, which is different from 0.',
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
    summary: 'Change a parameter on the synth by its id, without needing a control for it. The device profile builds the right message. `value` is in the parameter\'s own units — the ones deviceParameter gives min and max for. Returns whether the message was dispatched, not whether the synth accepted it.',
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
    summary: 'Check whether a device is connected and ready. It is quick to call, and the right thing to check before asking for a dump.',
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
    summary: 'Describe a synth parameter from your script, for a synth that has no device profile, or to correct one parameter in a profile that has it wrong. `spec` must say how the parameter travels over MIDI — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — and may add a name, group, type, min and max. A spec with no MIDI form is refused, with a message saying why. In a SysEx template you can use hex bytes, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.',
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
    summary: 'Describe a SysEx dump layout from your script: `request` (the bytes that ask for it), `match` (the start and end bytes that recognise it), `offset` and `size` (where the values sit), an optional `checksum`, and `fields` — one { parameter, offset } for each value. Every field must name a parameter already described with defineParameter. Once declared, an arriving dump of this layout fills the bound controls and runs onDumpReceived, just like a dump from a device profile.',
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
          summary: 'How many bytes in from the start of the message the values begin.' },
        { name: 'size', type: 'number', default: 'whatever is left', sample: '256',
          summary: 'How many bytes of values there are.' },
        { name: 'checksum', type: 'text', sample: '"roland-7bit"',
          summary: 'Which checksum the message carries, so it can be verified. The names are '
            + 'ce.midi.checksum\'s.' },
        { name: 'fields', type: 'list of objects', required: true,
          summary: 'Where each value sits among those bytes, one { parameter, offset } per '
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
    summary: 'Connect a control to a synth parameter from your script, so moving the control changes the parameter. It replaces any existing connection on the same port rather than adding a second one, and switches the control\'s device binding back on if it was off. The port defaults to "value".',
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
    summary: 'Disconnect a control from its synth parameter. Returns whether there was a connection to remove.',
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
    summary: 'List the MIDI ports, each as { id, name, direction, type, hardware, role }. `hardware` is false for the two entries the app always shows ("No MIDI Input" and "Preview Only"); `role` names the device currently using the port, or is empty. Set `opts.direction` to "in" or "out" to list only one kind.',
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
    summary: 'The values the device profile fills into its messages — `channel`, `deviceId` and any others the profile has — with this project\'s own settings applied. Returns nothing when no profile is chosen for the device.',
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
    summary: 'Change one of the values the device profile fills into its messages, from 0 to 127 — for example the device id, to talk to a second unit of the same synth. The change is saved with this project only; the shared device profile is not changed, so two panels can use different device ids for the same synth. Some values are limited further (a channel is 1 to 16).',
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
    summary: 'How fast the panel may send to this device: `minDelayBetweenMessagesMs` and any other timing the device profile sets, with this project\'s own settings applied.',
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
    summary: 'Change one timing setting for this project, in milliseconds from 0 to 60000 — for example to slow the panel down for a synth that cannot keep up. Like deviceSetVariable, this does not change the device profile itself.',
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
    summary: 'What the device profile says it supports, as words rather than true/false. With no `feature`, returns the whole list — `singleParameterWrite`, `realtimeEditing`, `editBufferDumpParse` and so on. Profiles answer "complete", "partial" or "notImplemented", and sometimes something more specific, so check for the words you care about.',
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
    summary: 'The names of the message templates this device profile can build — the formats its parameters are sent in. An empty list when no profile is chosen.',
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
    summary: 'The names of the requests this device profile can send, such as an identity request or an edit-buffer request. Check here before assuming a synth supports one.',
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
    summary: 'Send a MIDI Control Change (CC) message: `channel` 1 to 16, controller number `cc` 0 to 127, `value` 0 to 127.',
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
    summary: 'Send an NRPN (Non-Registered Parameter Number) message: `msb` and `lsb` pick the parameter and `value` runs from 0 to 16383. Many synths use NRPNs for parameters that need more than 128 steps.',
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
    summary: 'Send an RPN (Registered Parameter Number) message — the standard way to set pitch-bend range (0, 0), fine tuning (0, 1) and coarse tuning (0, 2). It works like sendNRPN, but uses controllers 101 and 100 instead of 99 and 98.',
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
    summary: 'Send a Song Position Pointer, which tells a sequencer where to resume when it next receives start or continue. `beats` is in MIDI beats: one MIDI beat is six clock ticks, a sixteenth note.',
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
    summary: 'Send MIDI bytes exactly as you give them, with nothing added or changed. All the other send commands are built on this one, so use one of those when it fits.',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendMidi({0x90, 60, 100})$0', javascript: 'sendMidi([0x90, 60, 100])$0' },
  },
  {
    id: 'sendNote', category: 'Device / MIDI', signature: 'sendNote(channel, note, velocity [, ms])',
    summary: 'Play a note. `note` is a MIDI note number or a name such as "C3". A velocity of 0 means note off. Give `ms` and the matching note off is sent for you after that many milliseconds.',
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
    summary: 'See every MIDI message from the synth before the panel acts on it. `fn(bytes)` can return different bytes to change the message, false to drop it, or nothing to let it through unchanged.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiIn(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiIn((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'interceptMidiOut', category: 'Device / MIDI', signature: 'interceptMidiOut(fn)',
    summary: 'See every MIDI message the panel sends — from a script or from a control\'s own MIDI setting — before it goes out. `fn(bytes)` can return different bytes to change the message, false to drop it, or nothing to let it through unchanged.',
    params: [{ name: 'fn', type: 'function', required: true }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiOut(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiOut((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'feedMidi', category: 'Device / MIDI', signature: 'feedMidi(bytes)',
    summary: 'Pretend a MIDI message arrived from the synth. The panel\'s controls, note input and transport react to it exactly as they would to the real thing, and any interceptMidiIn filters see it first.',
    params: [{ name: 'bytes', type: 'value', required: true }],
    scopes: 'any',
    snippet: { lua: 'feedMidi(${1:{0x90, 60, 100\}})$0', javascript: 'feedMidi([${1:0x90, 60, 100}])$0' },
  },
  {
    id: 'routeMidi', category: 'Device / MIDI', signature: 'routeMidi(role, fn)',
    summary: 'Send everything the code inside `fn` sends to another device, named by its `role`, instead of the main synth. It works like noTransmit: only the block is affected.',
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
    summary: 'Release a note. The release velocity defaults to 0. Nothing does this for you: every note you start with sendNote (without `ms`) needs its own note off.',
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
    summary: 'Send a Program Change to switch the synth to another sound. Give `bankMsb` and `bankLsb` and a Bank Select (controllers 0 and 32) is sent first.',
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
    summary: 'Send pitch bend as a 14-bit number from 0 to 16383, where 8192 is the centre (no bend). How many semitones the full range covers is set on the synth.',
    params: [
      { name: 'channel', type: 'number', required: true },
      { name: 'value', type: 'number', required: true },
    ],
    scopes: 'any',
    snippet: { lua: 'sendPitchBend(${1:1}, ${2:8192})$0', javascript: 'sendPitchBend(${1:1}, ${2:8192})$0' },
  },
  {
    id: 'sendAftertouch', category: 'Device / MIDI', signature: 'sendAftertouch(channel, pressure [, note])',
    summary: 'Send aftertouch (key pressure) for the whole channel, or for one note when `note` is given (polyphonic aftertouch).',
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
    summary: 'Send one MIDI clock tick (`0xF8`). There are 24 ticks per quarter note, so call it from a timer.',
    params: [],
    scopes: 'any',
    snippet: { lua: 'sendClock()$0', javascript: 'sendClock()$0' },
  },
  {
    id: 'sendTransport', category: 'Device / MIDI', signature: 'sendTransport(action)',
    summary: 'Start, continue or stop a connected sequencer or drum machine: `action` is "start" (`0xFA`), "continue" (`0xFB`) or "stop" (`0xFC`).',
    params: [{ name: 'action', type: 'string', required: true, values: ['start', 'continue', 'stop'] }],
    scopes: 'any',
    snippet: { lua: 'sendTransport("${1:start}")$0', javascript: 'sendTransport("${1:start}")$0' },
  },
  {
    id: 'sendSysex', category: 'Device / MIDI', signature: 'sendSysex(bytes)',
    summary: 'Send a System Exclusive (SysEx) message, given as a list of bytes or as hex text such as "F0 41 10 42 F7".',
    params: [{ name: 'bytes', type: 'bytes', required: true }],
    scopes: 'any',
    snippet: { lua: 'sendSysex(${1:bytes})$0', javascript: 'sendSysex(${1:bytes})$0' },
  },
  {
    id: 'checksum', category: 'Device / MIDI', signature: 'checksum(type, bytes [, opts]) -> number',
    summary: 'Work out the checksum a synth expects at the end of a SysEx message. `type` is one of "sum-7bit", "roland-7bit" (also accepted as "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" or "crc32". An unknown name returns nothing and prints the names it accepts. The 7-bit types fit in one SysEx byte; the CRC types do not, so split their result into bytes with to7bit before sending.',
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
    summary: 'Silence everything: sends All Sound Off (controller 120), All Notes Off (123) and Reset All Controllers (121). It covers all 16 channels unless you name one with `opts.channel`; set `opts.resetControllers` to false to leave controllers alone.',
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
    summary: 'A table your script can keep its own values in from one handler call to the next. Only this script can see it. It is emptied when the script reloads, so use `ce.storage.saveSetting()` for anything that must last longer.',
    params: [],
    scopes: 'any',
    snippet: { lua: 'state.${1:count} = (state.${1:count} or 0) + 1$0', javascript: 'state.${1:count} = (state.${1:count} ?? 0) + 1;$0' },
  },
  {
    id: 'saveSetting', category: 'Storage', signature: 'saveSetting(key, value [, opts]) -> boolean',
    summary: 'Save a value under `key` so it outlasts the script — unlike `ce.storage.state`, it survives a reload. By default it is stored with the panel and travels with it; in an exported plugin it is saved in the DAW project. `opts.scope` sets who sees it: "panel" (every script on the panel, the default), "script" (only this script) or "local" (only this computer, never saved into the panel). Returns false if the value could not be saved, for example because storage is not available.',
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
    summary: 'Read back a value saved with `ce.storage.saveSetting()`. Returns `fallback` if nothing has been saved under `key` (or nothing, if you did not give a fallback). `opts.scope` must match the scope the value was saved in — the same key in two scopes holds two separate values.',
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
    summary: 'List the keys saved in one scope, in no particular order. An empty list only means nothing has been saved yet; to check whether storage is working at all, use `ce.storage.info()`. Pick the scope with `opts.scope`, as for `ce.storage.saveSetting()`. The "panel" scope leaves out every script\'s private keys, including this script\'s own.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }], scopes: 'any',
    snippet: { lua: 'for _, k in ipairs(ce.storage.settings()) do $0 end', javascript: 'for (const k of ce.storage.settings()) { $0 }' },
  },
  {
    id: 'forgetSetting', category: 'Storage', signature: 'forgetSetting(key [, opts]) -> boolean',
    summary: 'Delete a saved setting. Returns true if there was a value to delete and false if there was not. Pick the scope with `opts.scope`, as for `ce.storage.saveSetting()`.',
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
    summary: 'Return every setting in one scope as a table of keys and values. `opts.scope` is "panel" (the default), "script" or "local". The "panel" scope leaves out every script\'s private settings, including this script\'s own.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
    snippet: {
      lua: 'for k, v in pairs(ce.storage.all()) do log(k, v) end$0',
      javascript: 'for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);$0',
    },
  },
  {
    id: 'clearSettings', category: 'Storage', signature: 'clearSettings([opts]) -> number',
    summary: 'Delete every setting in one scope and return how many were deleted. Clearing the "panel" scope does not touch any script\'s private settings.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'storageInfo', category: 'Storage', signature: 'storageInfo([opts]) -> table',
    summary: 'Describe where one scope\'s settings are kept: `scope`, `backing`, `available`, `count` (how many settings) and `bytes` (their size as JSON text). `backing` is "panel" (stored with the panel, in the editor), "project" (in the DAW project, in an exported plugin) or "machine" (on this computer only). If `available` is false, nothing you save in this scope will be kept.',
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'encodeJson', category: 'Storage', signature: 'encodeJson(value [, opts]) -> string',
    summary: 'Turn a value — a table, a list, a number, some text — into JSON text, for example to keep a structure in a setting or copy it to the clipboard. `opts.indent` lays it out over several lines, indented by that many spaces. Keys are always written in sorted order, so the same data always gives the same text. Returns nothing for a value that has no JSON form, such as a function or a table that contains itself. It works the same in every scripting language, including Lua, which has no JSON support of its own.',
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
    summary: 'Turn JSON text back into a value. Text that is not valid JSON returns nothing. A JSON null also reads back as nothing: `{"a":1,"b":null}` comes back with only the key `a`, and `[1,null,2]` as a list of two items. So encoding and then decoding is not a full round trip when nulls are involved.',
    params: [{ name: 'text', type: 'string', required: true }],
    scopes: 'any',
  },

  /* --- Debug --- */
  {
    id: 'log', category: 'Debug', signature: 'log(message [, value])',
    summary: 'Print a message to the script console, optionally followed by a value. It changes nothing on the panel.',
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
    summary: 'Print a warning to the script console: something is not right, but the panel carries on. Warnings stand out from ordinary log lines.',
    params: [
      { name: 'message', type: 'string', required: true },
      { name: 'value', type: 'value', required: false },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.warn("${1:message}")$0', javascript: 'ce.core.warn("${1:message}")$0' },
  },
  {
    id: 'logError', category: 'Debug', signature: 'logError(message [, value])',
    summary: 'Print an error to the script console: something the panel could not do. It only prints — your handler keeps running. To stop the handler, use your language\'s own way of raising an error (error() in Lua, throw in JavaScript).',
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

// Argument types. `targetRef` stays the first argument of every verb; the rest are keyed by the
// kind of the ARGUMENT, which componentVerbs.verbArgKinds gives one of per name — not by the kind
// of the verb. Those are different things for anything addressed: the index of
// `drumPadsLabel(target, index, label)` is a number and its label is a string, and typing both from
// the verb's one kind published the index as a string. `list` is what fill() takes.
const PARAM_TYPE_FOR = {
  num: 'number', int: 'number', bool: 'boolean', str: 'string', enum: 'string',
  list: 'value',
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
    summary: 'Capture every control\'s current value, as an object keyed by control name. Controls that have no value of their own are left out. Store it with `ce.storage.saveSetting()` to keep it, or hold it in `state` for an A/B comparison, and put it back with `ce.panel.restore()`.',
    params: [], scopes: 'any',
    snippet: { lua: 'local before = ce.panel.snapshot()$0', javascript: 'const before = ce.panel.snapshot();$0' },
  },
  {
    id: 'panelEach', category: 'Panel components', signature: 'panelEach(fn) -> number',
    summary: 'Call `fn(name)` once for every control on the panel, including containers and the controls inside them, in the order they appear in the panel. Returns how many controls it visited. The list of names is taken before the first call, so `fn` can safely create or remove controls. To find out more about a control than its name, use `ce.panel.info()`.',
    params: [{ name: 'fn', type: 'function', required: true }], scopes: 'any',
    snippet: {
      lua: 'ce.panel.each(function(name)\n  $0\nend)',
      javascript: 'ce.panel.each(function (name) {\n  $0\n});',
    },
  },
  {
    id: 'panelRestore', category: 'Panel components', signature: 'panelRestore(snapshot) -> number',
    summary: 'Write the values from a `ce.panel.snapshot()` back to the controls. Returns how many values were written. A control the panel no longer has is skipped rather than stopping the whole restore.',
    params: [{ name: 'snapshot', type: 'object', required: true }], scopes: 'any',
    snippet: { lua: 'ce.panel.restore(before)$0', javascript: 'ce.panel.restore(before);$0' },
  },

  // --- The other twenty-three families (phase 7) ---
  // Everything above was hand-written, because each of those actions is genuinely structural.
  // These are expanded from componentVerbs.js instead: the spec there is the single description of
  // a verb's field, kind, range and prose, and the descriptor, the implementation, the C++ stub
  // name and the documentation are all derived from it. A verb that exists in one place and not
  // another stops being possible.
  ...COMPONENT_VERBS.map((verb) => {
    const kinds = verbArgKinds(verb);
    const optional = verbArgOptional(verb);
    return panelVerb(verb.id, verbSignature(verb), verbSummary(verb),
      [T, ...verbArgs(verb).map((name, i) => ({
        name,
        type: PARAM_TYPE_FOR[kinds[i]] ?? 'value',
        // Both halves come from the spec rather than from this file's reading of it, and
        // componentVerbs.test.js holds them to the signature line — which is how the two used to
        // disagree, every optional argument being published as required.
        required: !optional[i],
      }))]);
  }),
];

/* ------------------------------------------------------------------- helpers */
// Host-provided, identical in every language (Q10). We do NOT duplicate the language's
// own math (min/max/abs/sin). Extensible — grow as DPD profiles surface new needs.

export const HELPERS = [
  // value / range
  { id: 'scale', category: 'Value / range', signature: 'scale(v, inLo, inHi, outLo, outHi)', summary: 'Map a value from one range to another: `v` at `inLo` gives `outLo`, at `inHi` gives `outHi`, and everything between follows a straight line. It does not clamp, so a value outside the input range lands outside the output range; use `ce.math.norm()` and `ce.math.denorm()` when the result must stay inside. If `inLo` equals `inHi`, it returns `outLo`.' },
  { id: 'clamp', category: 'Value / range', signature: 'clamp(v, lo, hi)', summary: 'Keep a value inside a range: anything below `lo` becomes `lo`, anything above `hi` becomes `hi`, and anything in between comes back unchanged.' },
  { id: 'round', category: 'Value / range', signature: 'round(v)', summary: 'Round to the nearest whole number. A half rounds up, so 2.5 gives 3 and -2.5 gives -2. To keep some decimal places, use `ce.math.roundTo()`.' },
  { id: 'snap', category: 'Value / range', signature: 'snap(v, step)', summary: 'Round a value to the nearest multiple of `step`: `ce.math.snap(37, 10)` gives 40. A `step` of 0 leaves the value unchanged. For steps that are not evenly spaced, use `ce.math.quantize()`.' },
  { id: 'curve', category: 'Value / range', signature: 'curve(v, shape)',
    summary: 'Bend a 0 to 1 value with a named response curve: "linear", "exp", "log" or "s". An unknown name prints a note to the console and is treated as "linear". For a curve of your own, use `ce.math.map()`; for the curves the panel\'s Envelopes use, use `ce.math.shape()`.' },
  { id: 'lerp', category: 'Value / range', signature: 'lerp(a, b, t)', summary: 'Blend between two numbers: `t` of 0 gives `a`, 1 gives `b`, and 0.5 the point halfway between. `t` is not held inside 0 to 1, so values beyond either end carry on past `a` or `b`. For whole lists of numbers, use `ce.math.blend()`.' },
  // wrap, and why it is not `%`. The five runtimes DISAGREE about the sign of a modulo: (-1) % 12
  // is 11 in Lua and Python and -1 in JavaScript, C++, C# and Java. So the ordinary way to write a
  // pitch class — (note + transpose) % 12 — already gives two different answers depending on which
  // engine the panel is running in, and nothing said so. This is the one arithmetic a synth panel
  // does constantly, which is why it belongs to the module rather than to each panel.
  { id: 'wrap', category: 'Value / range', signature: 'wrap(v, lo, hi)',
    summary: 'Wrap a value round into a range, so that going past the top starts again from the bottom: `ce.math.wrap(12, 0, 12)` gives 0 and `ce.math.wrap(-1, 0, 12)` gives 11. The result can equal `lo` but never `hi`. Use it for pitch classes, LFO phase and step numbers instead of your language\'s % operator, which treats negative numbers differently from language to language: the same expression gives 11 in Lua and -1 in JavaScript.' },
  // map, and why `curve` was not enough. curve() is a CLOSED set of four names, so a taper it does
  // not have could not be expressed at all — and a properties panel cannot hold an arbitrary curve
  // either, since a property stores a constant. Breakpoints are the smallest thing that can.
  { id: 'mapCurve', category: 'Value / range', signature: 'mapCurve(v, points)',
    summary: 'Map a value through a curve you draw as points joined by straight lines, given as {{x, y}, …}: `ce.math.map(v, {{0,0},{0.5,0.9},{1,1}})`. The points are sorted by x first. Below the first point or above the last, the value is held at that point\'s y rather than continuing the line. Two points with the same x make a step, and the later one wins.' },
  { id: 'quantizeTo', category: 'Value / range', signature: 'quantizeTo(v, values)',
    summary: 'Snap a value to the nearest entry in a list: `ce.math.quantize(9, {0, 8, 16})` gives 8. When the value sits exactly halfway between two entries, the lower one wins. An empty list returns the value unchanged. For evenly spaced steps, use `ce.math.snap()`.' },
  { id: 'randomChoice', category: 'Value / range', signature: 'randomChoice(values [, weights])',
    summary: 'Pick one entry from a list at random, using the script\'s seeded random numbers. With `weights`, each entry\'s chance is its weight divided by the total, so weights of {3, 1} make the first entry three times as likely as the second. A missing or negative weight counts as zero, and if every weight is zero each entry is equally likely. It uses exactly one random number either way, so adding weights does not change what later random calls return. Returns nothing for an empty list.' },
  { id: 'dbToGain', category: 'Value / range', signature: 'dbToGain(db)',
    summary: 'Convert decibels to a linear gain: 0 dB gives 1, and -6 dB gives about 0.5.' },
  { id: 'gainToDb', category: 'Value / range', signature: 'gainToDb(gain)',
    summary: 'Convert a linear gain to decibels: 1 gives 0 dB, and 0.5 gives about -6 dB. A gain of zero or less gives -144 dB (the floor of 24-bit audio) instead of minus infinity, and nothing comes back lower than that.' },

  // --- the rest of the arithmetic a synth panel actually does (design doc §32) ---
  // Nothing here duplicates the language's own scalar maths — min/max/abs/floor/ceil/sin all exist
  // in every runtime already, and that rule is what keeps the list finite. What IS here is either
  // domain-specific, list-shaped (Lua's varargs make the language version unusable over a table),
  // or has to be identical in five runtimes to be worth anything.
  { id: 'norm', category: 'Value / range', signature: 'norm(v, lo, hi)',
    summary: 'Turn a value into its position within a range: 0 at `lo`, 1 at `hi`. Values outside the range are held at 0 or 1. The reverse is `ce.math.denorm()`.' },
  { id: 'denorm', category: 'Value / range', signature: 'denorm(t, lo, hi)',
    summary: 'Turn a 0 to 1 position back into a value in a range: 0 gives `lo` and 1 gives `hi`. Positions outside 0 to 1 are held at the ends. The reverse of `ce.math.norm()`.' },
  { id: 'bipolar', category: 'Value / range', signature: 'bipolar(t)',
    summary: 'Convert a 0 to 1 value to the -1 to +1 range: 0 becomes -1, 0.5 becomes 0 and 1 becomes +1. The reverse is `ce.math.unipolar()`.' },
  { id: 'unipolar', category: 'Value / range', signature: 'unipolar(v)',
    summary: 'Convert a -1 to +1 value to the 0 to 1 range: -1 becomes 0, 0 becomes 0.5 and +1 becomes 1. The reverse of `ce.math.bipolar()`.' },
  { id: 'fold', category: 'Value / range', signature: 'fold(v, lo, hi)',
    summary: 'Bounce a value back off the ends of a range instead of wrapping it: past `hi` it heads back down, and below `lo` it heads back up. Where `ce.math.wrap()` jumps from the top to the bottom, fold keeps the movement smooth, which suits modulation depths; wrap suits pitch classes.' },
  { id: 'indexOfRange', category: 'Value / range', signature: 'indexOfRange(t, count)',
    summary: 'Turn a 0 to 1 position into a slot number, counting from 0, for `count` slots, for example to pick one of eight waveforms with a knob. At exactly 1 it returns the last slot, `count - 1`, rather than one past the end.' },
  { id: 'crossfade', category: 'Value / range', signature: 'crossfade(a, b, t [, law])',
    summary: 'Fade from `a` to `b` as `t` goes from 0 to 1, using one of the Crossfader component\'s three fade laws: "linear", "equalPower" or "sharp". `law` defaults to "linear". A linear fade between two sounds dips audibly in the middle; "equalPower" does not.' },
  { id: 'approach', category: 'Value / range', signature: 'approach(current, target, maxStep)',
    summary: 'Move `current` toward `target`, but by no more than `maxStep` in one call; once it is within `maxStep`, it lands exactly on the target. It keeps nothing between calls, so you can use it in any handler (say, each time an expression pedal sends a value) without running a timer. A `maxStep` of 0 jumps straight to the target.' },
  { id: 'roundTo', category: 'Value / range', signature: 'roundTo(v, decimals)',
    summary: 'Round to a number of decimal places: `ce.math.roundTo(3.14159, 2)` gives 3.14. Returns a number, not text, so you can keep calculating with it.' },
  { id: 'almost', category: 'Value / range', signature: 'almost(a, b [, epsilon])',
    summary: 'Check whether two numbers are equal to within `epsilon`, which defaults to a tiny 0.000000001. Use it instead of == on values that have been through `ce.math.scale()`, `ce.math.curve()` or similar arithmetic, where rounding can leave numbers that should match a hair apart.' },
  { id: 'minOf', category: 'Value / range', signature: 'minOf(values)',
    summary: 'The smallest number in a list, or nothing if the list is empty.' },
  { id: 'maxOf', category: 'Value / range', signature: 'maxOf(values)', summary: 'The largest number in a list, or nothing if the list is empty.' },
  { id: 'sumOf', category: 'Value / range', signature: 'sumOf(values)', summary: 'The total of a list of numbers, or 0 if the list is empty.' },
  { id: 'meanOf', category: 'Value / range', signature: 'meanOf(values)', summary: 'The average of a list of numbers, or nothing if the list is empty.' },
  // `a, b` said nothing about these being LISTS, and with no return annotation the signature read
  // like lerp's. Passing two numbers returns an empty list, which is correct and baffling.
  { id: 'blend', category: 'Value / range', signature: 'blend(fromList, toList, t) -> list',
    summary: 'Blend one list of numbers into another, entry by entry: `t` of 0 gives `fromList` and 1 gives `toList`, like a morph between two snapshots. Both arguments are lists; for two single numbers use `ce.math.lerp()`. If the lists differ in length, the result is as long as the shorter one: the extra entries are dropped, not blended toward zero.' },
  { id: 'randomFloat', category: 'Value / range', signature: 'randomFloat(lo, hi)',
    summary: 'A random number with a fractional part, from `lo` up to but not including `hi`, taken from the script\'s seeded random numbers. With no arguments it runs from 0 to 1. `ce.math.random(lo, hi)` gives whole numbers; use this when you want fractions.' },
  { id: 'randomGaussian', category: 'Value / range', signature: 'randomGaussian([mean, sd])',
    summary: 'A random number on a bell curve: most results land near `mean` (default 0), and `sd`, the standard deviation (default 1), sets how widely they spread, with about two thirds falling within one `sd` of `mean`. Good for humanising velocity or timing, where an even spread sounds mechanical. It always uses exactly two numbers from the seeded sequence, so replaying a seed stays in step.' },
  { id: 'randomWalk', category: 'Value / range', signature: 'randomWalk(current, step, lo, hi)',
    summary: 'Take one step of a random walk: returns `current` moved by a random amount of up to `step` in either direction. Feed the result back in each time for a line that drifts instead of jumping. At `lo` and `hi` the walk bounces back rather than sticking to the edge; leave them out for no limits. Uses the script\'s seeded random numbers.' },
  { id: 'randomBool', category: 'Value / range', signature: 'randomBool([chance])',
    summary: 'Return true or false at random, from the script\'s seeded random numbers. `chance` is the probability of true, from 0 to 1, and defaults to 0.5: 0.25 gives true about one time in four. Handy as a probability gate on sequencer steps.' },
  { id: 'shuffle', category: 'Value / range', signature: 'shuffle(values)',
    summary: 'Return a new list with the same entries in random order; the original list is left alone. It uses the script\'s seeded random numbers, one for each entry after the first, so the same seed always shuffles the same way.' },
  { id: 'toDegrees', category: 'Value / range', signature: 'toDegrees(radians)', summary: 'Convert an angle from radians to degrees, the unit `ce.draw` uses for arcs.' },
  { id: 'toRadians', category: 'Value / range', signature: 'toRadians(degrees)', summary: 'Convert an angle from degrees to radians, the unit your language\'s own sin and cos expect.' },
  { id: 'distance', category: 'Value / range', signature: 'distance(x1, y1, x2, y2)',
    summary: 'The straight-line distance between two points. Handy for XY pads, joysticks and the Orbit, and for checking whether a click landed on something you drew with `ce.draw`.' },
  { id: 'angleOf', category: 'Value / range', signature: 'angleOf(x1, y1, x2, y2)',
    summary: 'The angle from the first point to the second, in the convention `ce.draw` uses: degrees from 0 to 360, with 0 at twelve o\'clock and increasing clockwise. As on screen, y counts downwards, so a point straight above gives 0.' },
  { id: 'polar', category: 'Value / range', signature: 'polar(angle, radius)',
    summary: 'Turn an angle and a distance into { x, y } offsets from a centre point, using the same convention as `ce.math.angle()`: degrees, 0 at twelve o\'clock, clockwise. Add the offsets to your centre to find, for example, the tip of a knob\'s pointer.' },

  // --- the transforms the Properties panel itself applies (design doc §33) ---
  // The panel does not only store constants; it CONFIGURES value transforms — a Macro slot's
  // curve, a Router's dead zone and transfer curve, an Envelope segment's curve and tension, a
  // Timbre pad's blend power, a slider's tick stops, a Meter's dB scale. A script could not
  // reproduce any of them, so it could not compute what its own panel was about to display, and
  // anything it worked out alongside a bound control came out subtly different. These are the
  // app's own functions, matched exactly.
  { id: 'shapeCurve', category: 'Value / range', signature: 'shapeCurve(v, curve [, tension])',
    summary: 'Bend a 0 to 1 value with the curves the panel\'s Envelope segments and Router breakpoints use: "linear", "exp", "log", "scurve" ("s" also works) and "hold". This is a different family from `ce.math.curve()`. `tension` sets how strongly "exp" and "log" bend and defaults to 1.6, as in the app, so leaving it out (or passing 0) does not give a straight line. With `tension` at 1 it matches the curve a Macro slot uses, so `shape(v, curve, 1)` reproduces it.' },
  { id: 'deadzone', category: 'Value / range', signature: 'deadzone(v, amount [, invert])',
    summary: 'Add a dead zone to the bottom of a 0 to 1 value, the way the Expression Router shapes its input. Anything at or below `amount` becomes 0, and the rest is stretched to fill 0 to 1, so the response starts right at the edge of the dead zone instead of jumping up from it. Pass `invert` as true to flip the value first.' },
  { id: 'weightsFor', category: 'Value / range', signature: 'weightsFor(points, x, y [, power])',
    summary: 'Work out how much each anchor point counts at a position, the way a Timbre Space or Preset Constellation does: the closer an anchor is to `x`, `y`, the bigger its share. `points` is a list of { x, y } anchors, and `x` and `y` run from 0 to 1. Returns one weight per point, adding up to 1. `power` (default 2) sets how sharp the blend is: higher lets the nearest anchor take over sooner. Pass the result to `ce.math.blendBy()` to morph values.' },
  { id: 'blendBy', category: 'Value / range', signature: 'blendBy(values, weights)',
    summary: 'A weighted average: each entry in `values` counts as much as its matching entry in `weights`, which is how a morph pad turns its weights into one value. The weights do not need to add up to 1, and if they add up to zero or less the result is 0. `ce.math.blend()` blends two lists; this combines many values into one.' },
  { id: 'tickStops', category: 'Value / range', signature: 'tickStops(major [, minor])',
    summary: 'The positions of a slider\'s scale marks, from 0 to 1, as { major, minor } lists, the same ones the app draws. `major` is how many major marks there are, counting both ends (default 11); `minor` is how many smaller marks sit between each pair (default 0). Use it when you draw your own scale, so its marks line up with the app\'s.' },
  { id: 'dbPosition', category: 'Value / range', signature: 'dbPosition(fraction [, floorDb, ceilDb])',
    summary: 'How far up a dB meter a level reaches, from 0 (bottom) to 1 (top). `fraction` is a linear level from 0 to 1; it is converted to decibels and placed between `floorDb` and `ceilDb`, which default to -60 and +6 like the Meter component.' },

  // --- taming what arrives on the wire (design doc §34) ---
  // A controller does not send tidy numbers. It sends a value that jitters, crosses a threshold
  // repeatedly, spikes once, and has already been through a taper. These four are what a script
  // needs to make that usable, and none of them composes out of what was already here.
  { id: 'smooth', category: 'Value / range', signature: 'smooth(current, target, coefficient [, epsilon])',
    summary: 'Move `current` part of the way toward `target`: `coefficient`, from 0 to 1, is the share of the remaining distance covered on each call, so the value moves quickly at first and eases in as it gets close. Once within `epsilon` (default 0.0001) it snaps to the target, so it actually arrives instead of creeping closer forever. Good for taming a jittery pedal or a noisy CC. For a fixed step size, use `ce.math.approach()`.' },
  { id: 'hysteresis', category: 'Value / range', signature: 'hysteresis(value, on, low, high)',
    summary: 'Turn a changing value into an on/off state that does not flicker. It switches on when `value` reaches `high`, switches off when it falls to `low`, and keeps its current state in between. Pass the current state as `on` and it returns the new one. With two thresholds, a value hovering around one line cannot flip the state back and forth. Electronics calls this a Schmitt trigger.' },
  { id: 'median', category: 'Value / range', signature: 'median(values)',
    summary: 'The middle value of a list, or the average of the two middle values when the count is even. Returns nothing for an empty list. Unlike an average, a single stray spike does not pull it off course.' },
  { id: 'euclid', category: 'Value / range', signature: 'euclid(steps, pulses [, rotation])',
    summary: 'A Euclidean rhythm: `pulses` hits spread as evenly as possible across `steps` steps (up to 64), returned as a list of true and false values. It is the same pattern the Arpeggiator uses for its rests. `rotation` shifts the pattern round without changing the spacing between hits.' },
  { id: 'unshape', category: 'Value / range', signature: 'unshape(y, curve [, tension])',
    summary: 'The reverse of `ce.math.shape()`: give it a value that has been through a curve, with the same `curve` and `tension`, and it returns the value from before the curve. Use it when a value comes back from the synth through a taper, so the control lands where it started. "hold" is a step with no true reverse, so it returns the earliest input that gives that output.' },
  // Seeded, and seeded is the point: the language's own math.random cannot promise the same
  // sequence in five runtimes, so a randomised patch could not be reproduced and a generative
  // sequence would sound different in the editor and in the exported plugin.
  { id: 'random', category: 'Value / range', signature: 'random([lo, hi])',
    summary: 'A random number from the script\'s seeded sequence. With no arguments, a fraction from 0 up to but not including 1. With `lo` and `hi`, a whole number from `lo` to `hi`, both included. The same seed replays the same sequence in every scripting language, in the editor and in the exported plugin.' },
  { id: 'randomSeed', category: 'Value / range', signature: 'randomSeed(n)',
    summary: 'Set the seed for this script\'s random numbers, so the same seed replays the same sequence. A seed of 0 uses the default. Until you set one, every script starts from that same default, so its numbers repeat each time it loads. Every script has its own sequence, and so does every named stream, so this never affects another script.' },
  { id: 'randomStream', category: 'Value / range', signature: 'randomStream(name, fn)',
    summary: 'Run `fn` with its random numbers taken from a separate, named sequence, so two generative parts of one script (a melody and a drum pattern, say) do not disturb each other\'s numbers or seeds. The script\'s normal sequence comes back when the block ends, even if it ends in an error. Streams belong to one script: two scripts using the same name get separate streams.' },
  // music
  // Middle C is C4 — scientific pitch notation, which is what every runtime has always computed.
  // These summaries said "C3" (the Yamaha convention) from the start, so the docs and the code
  // disagreed by an octave: a script written from the manual transposed everything twelve
  // semitones. The code is right and stays; the wording is what was wrong.
  {
    id: 'noteName', category: 'Music', signature: 'noteName(n [, flats])',
    summary: 'Turn a MIDI note number into a name: 60 gives "C4" (middle C). With `flats` left out, you get plain text with # for sharps ("C#4"), which is easy to type and compare against. Pass `flats` to get the panel\'s own spelling instead: true gives flats ("D♭4") and false gives sharps ("C♯4"). `ce.music.spelling()` tells you which one a key uses.',
    params: [
      { name: 'n', type: 'number', required: true },
      { name: 'flats', type: 'boolean', required: false },
    ],
  },
  {
    id: 'noteNumber', category: 'Music', signature: 'noteNumber(name) -> number',
    summary: 'Turn a note name into a MIDI note number: "C4" gives 60 (middle C is C4). Sharps and flats can be typed either way, so "C#4", "C♯4", "Db4" and "D♭4" all work. The letter must be a capital and the octave must be there. A name it cannot read returns nothing rather than 0, because 0 is a real note (C-1).',
    params: [{ name: 'name', type: 'string', required: true }],
  },
  // Scales, chords and quantise-to-scale — what §2 defined ce.music as, finished. The interval
  // tables are the panel's OWN: a script asking for "dorian" and a Chord Pad set to "dorian" mean
  // the same seven notes, because there is one table (scripting/musicTheory.js) generated into
  // every prelude. `root` and `note` accept a MIDI number or a name ("C4"), like sendNote does.
  {
    id: 'scaleNotes', category: 'Music', signature: 'scaleNotes(root [, scale]) -> list',
    summary: 'One octave of a scale, rising from `root`: seven notes for most scales, five for the pentatonics and six for blues, without repeating the root at the top. `root` can be a note number or a name such as "C4". `scale` defaults to "major" and can be "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" or "blues". A name it does not know returns nothing.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'chordNotes', category: 'Music', signature: 'chordNotes(root [, type]) -> list',
    summary: 'The notes of a named chord, rising from `root`: a fixed shape such as a D minor 7, not something built from a key. `type` defaults to "major"; the types are major, minor, dim, aug, sus2, sus4, power, maj6, min6, dom7, maj7, min7, minMaj7, dim7, m7b5, aug7, add9, dom9, maj9 and min9. An unknown type returns nothing. To build a chord on a step of a key, use `ce.music.degreeChord()`.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'type', type: 'string', required: false },
    ],
  },
  {
    id: 'quantizeNote', category: 'Music', signature: 'quantizeNote(note, root [, scale]) -> number',
    summary: 'Move a note to the nearest note of a scale, looking both up and down; when two scale notes are equally close, it goes up. A note already in the scale comes back unchanged. `scale` defaults to "major" and takes the same names as `ce.music.scale()`; an unknown name returns nothing.',
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
    summary: 'Whether a key writes its sharps and flats as flats: true for F, B♭, E♭, A♭, D♭ and G♭. A minor-type scale is judged by the major key a minor third above its root, so C minor spells E♭ and A♭ rather than D♯ and G♯. Pass the result to `ce.music.name()` so your labels match the panel\'s. An unknown scale returns nothing.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'inScale', category: 'Music', signature: 'inScale(note, root [, scale]) -> boolean',
    summary: 'Whether a note belongs to a key, in any octave: C2 and C5 both count as the tonic of C. `scale` defaults to "major"; an unknown name returns nothing.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'scaleDegree', category: 'Music', signature: 'scaleDegree(note, root [, scale]) -> number',
    summary: 'Which step of the key a note is: 1 for the tonic, 5 for the dominant. A note outside the key returns nothing rather than the nearest step; use `ce.music.quantize()` first if you want to pull it into the key. `scale` defaults to "major"; an unknown name returns nothing.',
    params: [
      { name: 'note', type: 'value', required: true },
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: false },
    ],
  },
  {
    id: 'degreeChord', category: 'Music', signature: 'degreeChord(root, scale, degree [, size]) -> table',
    summary: 'The chord a key builds on one of its steps, by stacking every other note of the scale. Steps count from 1, so `ce.music.degreeChord(60, "major", 5)` is the chord on the fifth, G major. `size` is the number of notes: 3 for a triad (the default), 4 for a seventh chord. Returns a table with the `notes`, their `names`, the chord `name` spelled the way the key spells it (such as "E♭m7"), its `quality` and its `roman` numeral. An unknown scale returns nothing. For a chord you already know by name, use `ce.music.chord()`.',
    params: [
      { name: 'root', type: 'value', required: true },
      { name: 'scale', type: 'string', required: true },
      { name: 'degree', type: 'number', required: true },
      { name: 'size', type: 'number', required: false },
    ],
  },
  {
    id: 'chordQuality', category: 'Music', signature: 'chordQuality(notes) -> string',
    summary: 'Name a chord from its notes: [60, 63, 70] gives "min7". It reads the intervals above the lowest note, so put the root at the bottom: an inverted chord is named from its bass note. The possible names are maj, min, dim, aug, sus2, sus4, maj7, dom7, min7, minMaj7, dim7 and m7b5, the same ones the Chord Pad uses. Note that these say maj and min where `ce.music.chord()` says major and minor, and that a chord it cannot place, such as a bare fifth, comes back as maj. Returns nothing for an empty list.',
    params: [{ name: 'notes', type: 'list', required: true }],
  },
  {
    id: 'voiceLead', category: 'Music', signature: 'voiceLead(notes, previous [, mode]) -> list',
    summary: 'Rearrange a chord so it moves as little as possible from the chord before it, the way the Harmoniser leads its voices. `mode` "closest" (the default) keeps the total movement of all the notes smallest; "smooth" keeps the top note as still as possible and lets the inner notes jump; "off" just returns the notes sorted from low to high. With no previous chord, the notes also come back sorted but otherwise unchanged.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'previous', type: 'list', required: true },
      { name: 'mode', type: 'string', required: false },
    ],
  },
  {
    id: 'expandOctaves', category: 'Music', signature: 'expandOctaves(notes [, octaves]) -> list',
    summary: 'Repeat a set of notes in the octaves above, the way the Arpeggiator spreads its notes before playing them; it is the step before `ce.music.arp()`. The notes are sorted low to high, then repeated 12 semitones higher for each extra octave. `octaves` runs from 1 to 4 and defaults to 1. Notes that would go above 127 are left out, not squeezed onto 127.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'octaves', type: 'number', required: false },
    ],
  },
  {
    id: 'arpOrder', category: 'Music', signature: 'arpOrder(notes, pattern) -> list',
    summary: 'The order an arpeggiator pattern plays the notes in, as a list of steps. Each step is itself a list of notes, so "chord" (everything at once, in one step) has the same shape as the others. Patterns: up, down, updown, downup, asPlayed, random, chord. Notes are used in the order you give them, so sort them first for a rising run. "updown" and "downup" do not repeat the top and bottom notes at the turn. "random" returns the notes in the order given, as the panel\'s arpeggiator does, because it picks each step as it plays; for a shuffled order use `ce.math.shuffle()`.',
    params: [
      { name: 'notes', type: 'list', required: true },
      { name: 'pattern', type: 'string', required: true },
    ],
  },
  // MIDI data encoding (escape hatch — the DPD does this for modeled params)
  { id: 'to7bit', category: 'MIDI encoding', signature: 'to7bit(v, count, order)', summary: 'Split a number into `count` bytes of 7 bits each, the way SysEx carries large values: 2 bytes for values up to 16383, 3 for 21 bits, 4 for 28. `order` is "msb" (most significant byte first, the default) or "lsb".' },
  { id: 'from7bit', category: 'MIDI encoding', signature: 'from7bit(bytes, order)', summary: 'Join 7-bit bytes back into one number — the reverse of to7bit. `order` is "msb" (the default) or "lsb".' },
  // `to14Bit` is the spelling the WebView runtime shipped with before the contract was
  // enforced. Kept as an alias so panels written against it keep working; `to14bit` (matching
  // to7bit/from7bit) is the documented name and the one the other runtimes define.
  { id: 'to14bit', category: 'MIDI encoding', signature: 'to14bit(v)', summary: 'Split a value from 0 to 16383 into its two 7-bit halves, returned as { msb, lsb }.', aliases: ['to14Bit'] },
  { id: 'from14bit', category: 'MIDI encoding', signature: 'from14bit(msb, lsb)', summary: 'Join two 7-bit halves, `msb` and `lsb`, back into one value from 0 to 16383.' },
  { id: 'toNibbles', category: 'MIDI encoding', signature: 'toNibbles(byte)', summary: 'Split a byte into its two 4-bit halves (nibbles), returned as { hi, lo }. Some synths send every byte this way.' },
  { id: 'fromNibbles', category: 'MIDI encoding', signature: 'fromNibbles(hi, lo)', summary: 'Join two 4-bit halves, `hi` and `lo`, back into one byte.' },
  { id: 'nibblize', category: 'MIDI encoding', signature: 'nibblize(bytes)', summary: 'Split a whole list of bytes into nibbles, high half first, so the list comes back twice as long.' },
  { id: 'denibblize', category: 'MIDI encoding', signature: 'denibblize(bytes)', summary: 'Join a list of nibbles (high half first) back into bytes, so the list comes back half as long.' },
  { id: 'toAscii', category: 'MIDI encoding', signature: 'toAscii(str, length)', summary: 'Turn text, such as a patch name, into a list of character codes. Give `length` and the list is padded with spaces up to that length.' },
  { id: 'fromAscii', category: 'MIDI encoding', signature: 'fromAscii(bytes)', summary: 'Turn a list of character codes back into text — for example a patch name read from a dump.' },
  { id: 'toOffset', category: 'MIDI encoding', signature: 'toOffset(v, center)', summary: 'Encode a value that can go below zero by adding `center` to it — for example -64 to +63 sent as 0 to 127 with a centre of 64.' },
  { id: 'fromOffset', category: 'MIDI encoding', signature: 'fromOffset(b, center)', summary: 'Decode an offset value by subtracting `center` — the reverse of toOffset.' },
  { id: 'toSigned', category: 'MIDI encoding', signature: 'toSigned(v, bits)', summary: 'Turn a negative number into the form a synth uses for a signed value of `bits` bits (two\'s complement). Positive numbers come back unchanged. Use fromSigned to read one back.' },
  { id: 'fromSigned', category: 'MIDI encoding', signature: 'fromSigned(b, bits)', summary: 'Read a signed value of `bits` bits (two\'s complement) back into an ordinary number, which may be negative. The reverse of toSigned.' },
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
    blurb: 'MIDI in and out, the connected device, music theory, and musical time.',
    modules: ['ce.midi', 'ce.device', 'ce.music', 'ce.time'] },
  { id: 'numbers', label: 'Working out values',
    blurb: 'Value and range arithmetic, and moving a value over time.',
    modules: ['ce.math', 'ce.anim'] },
  { id: 'panel', label: 'The panel itself',
    blurb: 'Creating and arranging controls, and saving things that outlive the session.',
    modules: ['ce.panel', 'ce.storage'] },
  { id: 'appearance', label: 'How it looks',
    blurb: 'Drawing, images, typography, and dialogs with the user.',
    modules: ['ce.draw', 'ce.image', 'ce.text', 'ce.ui'] },
  { id: 'components', label: 'Components',
    blurb: 'One module per component. Every command names the control first, and tells you whether the setting took.',
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
    summary: 'Values, flow and logging — the commands every script uses. Never namespaced.' },
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
    summary: 'The connected synth: identity, parameters, reading and setting them, and bulk dumps — plus declaring parameters, dump layouts and bindings for a synth the app has no profile for, and enumerating available ports. Needs the device host.' },
  // requires ce.core because curve() now REPORTS a shape it does not know instead of silently
  // returning the input, and reporting is log(). ce.core is global and never gated, so the
  // dependency costs nothing at runtime — but it is a real call and the prelude-dependency test
  // is right to want it declared.
  { id: 'ce.math', version: '1.8', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Value and range arithmetic: wrapping, curves, list snapping, decibels, colour, and seeded random. Pure — no host involved.' },
  { id: 'ce.music', version: '1.2', requires: [], runtime: RUNTIME_ANY,
    summary: 'Note names and numbers, scales, chords, snapping a note to a key, key spelling, scale degrees and degree chords, chord naming, voice leading, and arpeggio expansion and ordering.' },
  { id: 'ce.time', version: '1.3', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Musical time: tempo, transport position, beat/bar events, timers (plain, one-shot or beat-synced), note divisions, bar/beat at any position, steps between readings, swing, cycles, loop folding, tempo from taps or clock pulses, and a monotonic clock.' },
  // requires ce.math because envelope() drives the value through ce.math.map — one lookup, shared
  // with the Envelope component — and ce.time because `beats` and `sync` are the transport's.
  { id: 'ce.anim', version: '1.1', requires: ['ce.core', 'ce.math', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Move a value over time: to a destination, with a spring, or through a drawn shape — delayed, staggered, repeating, tempo-synced, with completion callbacks. Cross-runtime: works with the panel shut.' },
  { id: 'ce.ui', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Notifications (show, retract, replace), questions — a choice, a line of text, or a pick from a list — and the clipboard. Panel view only.' },
  { id: 'ce.draw', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Draw on top of any control: shapes, gradients, dashes, opacity and transforms, plus the panel\'s own LCD font and text measurement. Panel view only.' },
  // The first MIXED module. Its structure verbs are panel-view only and say so individually, but
  // snapshot/restore are not — so declaring the whole module unavailable window-closed would make
  // ce.has("ce.panel") tell a script to skip two verbs that work perfectly there. The per-member
  // stubs are what state the boundary precisely; the module says "some of this reaches you".
  { id: 'ce.panel', version: '1.4', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Create, clone, parent and find controls, then align, distribute, match, order, grid or circle them — panel view only, each command says so. snapshot/restore work anywhere.' },
  { id: 'ce.storage', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Per-script scratch state, and settings that outlive the session — shared with the panel, private to one script, or kept on this machine only. Plus JSON encode/decode.' },
  // Panel view only, and for a reason worth stating: the font catalogue is the editor's, and the
  // measuring is done on a canvas. A player host has neither, and a typography verb that answered
  // from a guess would be worse than one that says it is not there.
  // Panel view only, for the same reason ce.text is: the icon library and the file cache are the
  // editor's, and a verb that answered from a guess would be worse than one that says it is absent.
  { id: 'ce.image', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'The image layers a control carries — background image and overlay, text image and texture, and the Icon section — plus the icon library they draw from. Background layers composite; text layers are exclusive. Reports which image sources survive an export.' },
  { id: 'ce.text', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Typography: which fonts exist and what they support, style writes that keep weight consistent, variable axes, and measuring a control\'s text in its own font to fit it to its box.' },
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
    // Preset recall keeps its full name flat AND namespaced: `recallPreset` is unambiguous either
    // way, where a bare global `preset` would not be — so the read is aliased and the action is not.
    recallPreset: 'recallPreset', preset: 'preset',
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
    finish: 'animateFinish', play: 'animatePlay',
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
    rect: 'panelRect', order: 'panelOrder', batch: 'panelBatch', keep: 'panelKeep',
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
  invalidateModuleScan();
}

export function unregisterExtension(id) { EXTENSIONS.delete(id); invalidateModuleScan(); }
export function registeredExtensions() { return [...EXTENSIONS.values()]; }
export function clearExtensions() { EXTENSIONS.clear(); invalidateModuleScan(); }

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

// Building each handler's API asks which modules ALL panel scripts use. A panel
// with hundreds of handlers used to rescan every source and rebuild every regex
// hundreds of times on preview entry. Sources and the module registry are the
// complete inputs; visual edits and MIDI values cannot change this result.
let moduleScanMatchers = null;
const sourceModuleCache = new Map();
const MODULE_SCAN_CACHE_LIMIT = 512;
const MODULE_SCAN_CACHE_CHARS = 2_000_000;
let sourceModuleCacheChars = 0;

function invalidateModuleScan() {
  moduleScanMatchers = null;
  sourceModuleCache.clear();
  sourceModuleCacheChars = 0;
}

function scanMatchers() {
  if (moduleScanMatchers) return moduleScanMatchers;
  const known = allModules();
  const members = Object.entries(memberModule())
    .filter(([, at]) => !moduleById(at.module)?.global)
    .map(([id, at]) => ({ module: at.module, re: memberReferenceRe(id, at.name) }));
  const paths = known.filter((module) => !module.global)
    .map((module) => ({ module: module.id, re: new RegExp(`\\b${escapeForRe(module.id)}\\b`) }));
  return moduleScanMatchers = { known, members, paths };
}

/**
 * Which modules a piece of script source actually reaches for. A scan, not a parse — same
 * standing caveat as scriptValidate.js: it can over-report from a comment or a string, and
 * over-reporting is the safe direction here (a module gets enabled that did not need to be).
 */
export function modulesUsedBy(source) {
  const src = typeof source === 'string' ? source : '';
  if (!src) return [];
  const cached = sourceModuleCache.get(src);
  if (cached) return [...cached];
  const { known, members, paths } = scanMatchers();
  const hit = new Set();
  for (const { module, re } of members) {
    if (!hit.has(module) && re.test(src)) hit.add(module);
  }
  // A script may also address a module wholesale — `local midi = ce.midi`, `ce.has("ce.time")`.
  for (const { module, re } of paths) {
    if (!hit.has(module) && re.test(src)) hit.add(module);
  }
  const result = known.map((m) => m.id).filter((id) => hit.has(id));
  if (src.length <= MODULE_SCAN_CACHE_CHARS) {
    while (sourceModuleCache.size >= MODULE_SCAN_CACHE_LIMIT
      || sourceModuleCacheChars + src.length > MODULE_SCAN_CACHE_CHARS) {
      const oldest = sourceModuleCache.keys().next().value;
      sourceModuleCacheChars -= oldest.length;
      sourceModuleCache.delete(oldest);
    }
    sourceModuleCache.set(src, result);
    sourceModuleCacheChars += src.length;
  }
  return [...result];
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
