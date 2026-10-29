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
  COMPONENT_FAMILIES, COMPONENT_VERBS, moduleIdFor, verbSignature, verbSummary, verbArgs, verbExample, verbNotes, verbParamSummary,
  verbArgKinds, verbArgOptional, verbIndexArgs, verbNameArgs,
} from './componentVerbs.js';
import { HAND_WRITTEN_VALUES } from './componentTables.js';
import { LAYOUT_WORDS } from './layoutWords.js';
import { VOICE_LEAD_MODES, ARP_ORDER_PATTERNS } from './noteLists.js';
// The legal values an option accepts come from the table its own implementation reads, for the
// reason the component enums do: a documented list somebody retyped is a list that drifts. These
// two supply the image-layer and typography vocabularies.
import {
  BACKGROUND_FITS, BACKGROUND_ALIGNS, TEXT_FITS, IMAGE_BLENDS, IMAGE_CLIP_MODES, IMAGE_LAYER_IDS,
} from '../utils/imageLayers.js';
import { FEATURE_KEYS, CASE_MODES, SCRIPT_MODES, JUSTIFICATIONS } from './textStyle.js';
// And ce.anim's curve names from the table ce.anim evaluates. This list was typed out, and when the
// animation overhaul added five easings every runtime accepted them and the documentation did not.
import { ANIM_CURVE_NAMES } from './easingTables.js';
// The two vocabularies a component verb's enum may be, so its argument can say which (verbValueTyping).
import { DIVISION_NAMES } from './timeTables.js';
import { SCALE_NAMES } from './musicTheory.js';
import { controlsInTree } from './scriptPanelExport.js';

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
  { id: 'bgColour', type: 'string', summary: 'Background colour: 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#". Read as every colour property is, so "red" is stored as "#FF0000" and what is not a colour is refused.' },
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
  /* --- ce.patch: choosing parameters, the options every patch command shares - */
  patchGroups: { name: 'groups', type: 'list of text', default: 'every group', sample: '{"Filter", "Amp Env"}', summary: 'Only parameters in these groups, as the profile names them, in any case.' },
  patchOnly: { name: 'only', type: 'list of text', default: 'every parameter', sample: '{"cutoff"}', summary: 'Only these parameters, by id. With groups: those in either.' },
  patchExcept: { name: 'except', type: 'list of text', default: 'none', summary: 'Never these parameters, by id or group name. Wins over groups and only.' },
  patchLock: { name: 'lock', type: 'list of text', default: 'none', summary: 'These keep their value from the first patch, by id or group name. Unlike except, they stay in the result.' },
  patchInclude: { name: 'include', type: 'list of text', default: 'none', summary: 'Take in what is left out by default: "name" for the patch name, "readOnly" for parameters the synth cannot be sent, or ids and groups.' },
  patchRole: { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"', summary: 'The device, by its role as the panel names it.' },
  patchScope: { name: 'scope', type: 'text', default: '"voice"', summary: 'The part of the synth, when the command takes no patch to read it from.' },
  patchSeed: { name: 'seed', type: 'number', default: 'the script\'s random stream', summary: 'Where the random numbers start: the same seed gives the same patch, in every language.' },

  /* --- ce.ci: the options its commands share -------------------------------- */
  ciRole: { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"', summary: 'The device whose MIDI ports to ask on.' },
  ciResId: { name: 'resId', type: 'text', default: 'none', summary: 'For a resource that holds several items: which one, such as one program.' },
  ciTimeout: { name: 'timeoutMs', type: 'number', default: '3000', unit: 'milliseconds', summary: 'How long to wait for the device\'s answer.' },

  /* --- ce.verify: the options its checks share ----------------------------- */
  verifyRole: { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"', summary: 'The device. Every check but coverage asks the main synth only.' },
  verifyIds: { name: 'ids', type: 'list of text', default: 'every parameter', sample: '{"cutoff", "resonance"}', summary: 'Only these parameters, by id.' },
  verifyGroup: { name: 'group', type: 'text', default: 'every group', summary: 'Only the parameters of this group, as the profile names it, in any case.' },
  verifySettle: { name: 'settleMs', type: 'number', default: '100', unit: 'milliseconds', summary: 'The wait between sending and asking the synth for the value back.' },

  /* --- ce.format: the options every formatting command shares ------------- */
  formatDecimals: { name: 'decimals', type: 'number', default: 'as the command decides', summary: 'Exactly this many decimal places, 0 to 6.' },
  formatDigits: { name: 'digits', type: 'number', default: '3', summary: 'Significant digits, 1 to 6, when `decimals` is left out.' },
  formatSign: { name: 'sign', type: 'text', default: '"auto"', values: ['auto', 'always'], summary: '"always" writes a plus too, as in "+12".' },
  formatUnit: { name: 'unit', type: 'true or false, or text', default: 'true', summary: 'Off for no unit, or text for a unit of its own, such as "st".' },
  formatSpace: { name: 'space', type: 'true or false', default: 'true', summary: 'The space between the number and its unit. None before % either way.' },
  formatWidth: { name: 'width', type: 'number', summary: 'Pad to this many characters, the text on the right. Longer text is not cut (that is ce.format.fit).' },
  formatPlaceholder: { name: 'placeholder', type: 'text', default: '"--"', summary: 'The text for a missing value.' },
  formatUnicode: { name: 'unicode', type: 'true or false', default: 'false', summary: 'The typographic characters (−, ∞, ♯, ♭), for a label in a normal font. LCD fonts have none of them.' },
  formatAbbreviations: { name: 'abbreviations', type: 'table', summary: 'More words to shorten, or the built-in ones changed: { Cutoff = "Cut" }.' },

  /* --- persistence ------------------------------------------------------- */
  scope: {
    name: 'scope', type: 'text', default: '"panel"', values: ['panel', 'script', 'local'],
    summary: '"panel": every script on the panel; kept with the panel.\n"script": this script only.\n"local": this computer only, never written into the panel; in an exported plug-in, this instance only.\nCase-insensitive.\nLeft out: "panel".\nAny other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value.',
  },

  /* --- animation timing (ce.anim.to / .spring / .envelope) ---------------- */
  duration: {
    name: 'duration', type: 'number', default: '300', unit: 'milliseconds',
    summary: 'Length of the animation.\nRange: ≥ 0.\n0 or below: immediate jump.\nInvalid: default.',
  },
  beats: {
    name: 'beats', type: 'number', sample: '2', unit: 'beats',
    summary: 'Length in beats, overriding duration.\nRange: > 0.\nTempo: read at the start; with sync, followed.\nOutside the range, or invalid: duration.',
  },
  sync: {
    name: 'sync', type: 'true or false', default: 'false',
    summary: '`true`: moves only while the transport plays, and follows tempo changes.\nInvalid: false.',
  },
  delay: {
    name: 'delay', type: 'number', default: '0', unit: 'milliseconds',
    summary: 'Wait before the start.\nRange: ≥ 0.\nBelow 0, or invalid: no wait.',
  },
  stagger: {
    name: 'stagger', type: 'number', default: '0', unit: 'milliseconds',
    summary: 'Delay per list entry: entry n starts n × stagger after the first.\nLists only.\nRange: ≥ 0.\nInvalid: 0.',
  },
  // The runs IN ALL, which is what this always said. Every runtime used to read it as runs after
  // the first (repeat = 1 ran twice, repeat = 0 once); startAnimationImpl and
  // ScriptRuntime::startAnimation now do what it says. apiContractRuntimes.test.js counts the runs.
  repeat: {
    name: 'repeat', type: 'number', default: '1',
    summary: 'Number of runs.\nFraction: rounded.\n≤ 0: repeats until stopped.\nInvalid: 1.\nLua: `["repeat"] = 3` (keyword).',
  },
  pingpong: {
    name: 'pingpong', type: 'true or false', default: 'false',
    summary: '`true`: alternate runs play in reverse.\nRequires repeat 0, or ≥ 2.\nInvalid: false.',
  },
  // done(completed), which is what this always said. Every runtime used to pass one table,
  // { path, completed } or { paths, completed }, and a table is always true, so `if completed then`
  // read a cancelled move as a finished one. fireAnimationDone and the preludes' __animDone
  // listeners now pass the boolean alone.
  done: {
    name: 'done', type: 'function',
    summary: 'Callback at the end: done(completed).\ncompleted: true after the last run or `ce.anim.finish()`; false after `ce.anim.stop()` or replacement.\nList: called once, after the last entry; true only if every entry completed.\nInvalid: no callback.',
  },
  animFrom: {
    name: 'from', type: 'number', sample: '0',
    summary: 'Start value.\nDefault: the current value.\nInvalid: default.',
  },

  /* --- a control's props (ce.panel.create / .clone) ---------------------- */
  // Shared because clone's `props` "works as in create", and listed nothing while it did: the two
  // read the same keys through applyControlProps.
  controlName: {
    name: 'name', type: 'text', default: 'one derived from the type', sample: '"cutoff"',
    summary: 'The name every other command reaches it by.\nTaken already: a number is added; use the name given back.',
  },
  controlX: {
    name: 'x', type: 'number', default: '0', unit: 'pixels',
    summary: 'Pixels from the left edge of its container.\nNot a number: as it was, with a console warning the first time.',
  },
  controlY: {
    name: 'y', type: 'number', default: '0', unit: 'pixels',
    summary: 'Pixels from the top edge of its container.\nNot a number: as it was, with a console warning the first time.',
  },
  controlWidth: {
    name: 'width', type: 'number', default: 'the type\'s own', unit: 'pixels', sample: '64',
    summary: 'Pixels.\n0 or below, or not a number: as it was, with a console warning the first time.',
  },
  controlHeight: {
    name: 'height', type: 'number', default: 'the type\'s own', unit: 'pixels', sample: '64',
    summary: 'Pixels.\n0 or below, or not a number: as it was, with a console warning the first time.',
  },
  controlParent: {
    name: 'parent', type: 'text', default: 'the panel itself', sample: '"row1"', kind: 'control',
    summary: 'The name of a container to put it in: a control with a Children section, such as a Container or a Group.\nNot a control, or not a container: rejected with a console error.',
  },
  controlSection: {
    name: '<section>', type: 'object', group: 'any section',
    summary: ['Any section of the control, by the name set() uses, such as { Behavior = { min = 0, max = 127 } }.',
      'The section\'s name as written: Behavior, not behavior.', 'A section the control does not have: rejected with a console error.',
      'Inside one, names in any case, as in a path; a child given is merged into the one there: { Background = { Fill = { colour = "red" } } } changes the Fill and keeps the rest.',
      'A colour: stored as set() stores it; one it would refuse: rejected with a console error.',
      'A setting the section does not have: written, with a console warning, as set() writes one.'].join('\n'),
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
    name: 'role', type: 'text', kind: 'deviceRole', default: 'the panel\'s current device',
    sample: '"main"',
    summary: 'Which configured device to use, when the panel is set up for more than one.',
  },

  /* --- byte lists (ce.midi.read / .write) ----------------------------------- */
  // One definition for the two, because a number is read back the way it was written: write's
  // options were only "the same as read's" in its summary, listed nowhere, so the check of option
  // keys could not refuse { bit = 8 } there, and a 300 went to the synth as 02 2C rather than 01 2C.
  bytesBits: {
    name: 'bits', type: 'number', default: '7', values: [7, 8],
    summary: 'How many bits of each byte carry the number: 7 for SysEx data, 8 for a whole byte.',
  },
  bytesOrder: {
    name: 'order', type: 'text', default: '"msb"', values: ['msb', 'lsb'],
    summary: 'Which byte comes first: the most significant ("msb") or the least ("lsb"). Case-insensitive.',
  },

  /* --- image layers (ce.image) -------------------------------------------- */
  tint: {
    name: 'tint', type: 'colour',
    summary: 'Tint colour, as "#RRGGBB", or "AARRGGBB" with its alpha first; the "#" is optional. '
      + 'A web colour with only one meaning is taken too and stored as those digits, as `set()` '
      + 'stores one: "#000" as "000000", "red" as "FF0000", and rgb(), rgba(), hsl() or hsla() the '
      + 'same way, as AARRGGBB when it is see-through. Anything else, a number or "#" with four '
      + 'digits included, is refused with a message, and the other options still apply. Omit it to '
      + 'leave the image untinted.',
  },
  opacity: {
    name: 'opacity', type: 'number', default: '1', unit: '0 to 1',
    summary: 'Image opacity. 0 is invisible, 1 is fully opaque. A value above 1, such as 50 written for ce.image.set\'s scale, draws fully opaque and writes a warning.',
  },
  imageRotation: {
    name: 'rotation', type: 'number', default: '0', unit: 'degrees', hint: '0 is upright, increasing clockwise',
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
    summary: 'Runs first, when the panel opens, before any control exists.',
    notes: [
      'Set up MIDI here, or send the synth a start-up message.',
      'Controls cannot be read or changed yet.',
    ],
    params: [],
    snippet: { lua: 'function onPanelLoad()\n  $0\nend', javascript: 'function onPanelLoad() {\n  $0\n}' },
  },
  {
    id: 'onPanelBuild', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_WEBVIEW,
    signature: 'onPanelBuild()',
    summary: 'Runs after `onPanelLoad`, to create, copy and arrange controls from a script.',
    notes: [
      'Controls a script made are removed before each run, so it starts from the panel as it was built.',
      'Panel view only.',
    ],
    params: [],
    snippet: {
      lua: 'function onPanelBuild()\n  for i = 1, 4 do\n    ce.panel.create("Knob", { name = "osc" .. i, x = 20 + i * 90, y = 40 })\n  end\n  $0\nend',
      javascript: 'function onPanelBuild() {\n  for (let i = 1; i <= 4; i++) {\n    ce.panel.create("Knob", { name: "osc" + i, x: 20 + i * 90, y: 40 });\n  }\n  $0\n}',
    },
  },
  {
    id: 'onError', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onError(info)',
    summary: 'Runs when any script on the panel fails.',
    notes: [
      'The error is written to the console as well.',
      'An error in `onError` itself is written to the console, and `onError` is not called for it, so it cannot loop.',
    ],
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
    summary: 'Paints on top of the control this script is attached to.',
    notes: [
      'Runs when the control needs painting, not every frame: to animate, call `ce.draw.redraw()` from a timer.',
      'Panel view only.',
    ],
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
    summary: 'Runs once the controls exist.',
    notes: [
      'Ask the synth for its settings here, and fill the controls.',
      'In a plug-in it runs again each time the window opens: put one-time work inside `if info.firstTime`.',
    ],
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
    summary: 'Runs when the panel window closes.',
    notes: [
      'The preview stopped, or the plug-in\'s window was closed in the DAW.',
      'The scripts go on running: timers tick and MIDI arrives. `onPanelDestroy` runs when they stop.',
    ],
    params: [],
    snippet: { lua: 'function onPanelClose()\n  $0\nend', javascript: 'function onPanelClose() {\n  $0\n}' },
  },
  {
    id: 'onPanelDestroy', kind: 'lifecycle', category: 'Lifecycle',
    signature: 'onPanelDestroy()',
    summary: 'Runs when the scripts are about to stop.',
    notes: [
      'Another panel was opened, the scripts were replaced, or the plug-in was removed.',
      'The last hook: timers, saved values and MIDI still work, so restore the synth or send a last dump here.',
      'Once, even when `onPanelClose` never ran.',
    ],
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
  // them in the exported plugin. With the plug-in's window open the page's scripts run them
  // (panelRuntime.js, setDawStateSink), and the state passes between page and window-shut engines
  // as the window opens and closes (PluginProcessor.h, applyDawStateFromPage).
  {
    id: 'onDawSaveState', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_PLAYER,
    signature: 'onDawSaveState(store) -> object',
    summary: 'Runs so the DAW can save your values with the project: return what to keep.',
    notes: [
      'Return a table holding what you want saved.',
      'Runs shortly after your scripts have run, whether the plug-in\'s window is open or shut.',
      '`store` shows what other scripts saved so far; it is to read only, and changing it saves nothing.',
      'In an exported plug-in only.',
    ],
    params: [{ name: 'store', type: 'object' }],
    snippet: {
      lua: 'function onDawSaveState(store)\n  return { ${1:key} = ${2:value} }$0\nend',
      javascript: 'function onDawSaveState(store) {\n  return { ${1:key}: ${2:value} };$0\n}',
    },
  },
  {
    id: 'onDawRestoreState', kind: 'lifecycle', category: 'Lifecycle', runtime: RUNTIME_PLAYER,
    signature: 'onDawRestoreState(store)',
    summary: 'Runs when the DAW opens the project again, and when the plug-in\'s window opens or closes: read your values back.',
    notes: [
      '`store` holds what your `onDawSaveState` returned, with every other script\'s.',
      'The window opening or closing runs it so that the scripts that run next carry on from the same values.',
      'In an exported plug-in only.',
    ],
    params: [{ name: 'store', type: 'object' }],
    snippet: { lua: 'function onDawRestoreState(store)\n  $0\nend', javascript: 'function onDawRestoreState(store) {\n  $0\n}' },
  },
];

/* -------------------------------------------------------------------- events */
// Subscribed two ways (Q3): named functions `onX(payload)` for a control's OWN events,
// or explicit `on(target, event, fn)` to reach anything else. Payloads use descriptive
// names passed directly (Q4): one obvious datum directly, several fields as one object.

export const CONTROL_EVENTS = [
  { id: 'valueChange', fn: 'onValueChange', payload: 'value', summary: 'Runs again and again while the value moves, as a knob is dragged: for what on screen follows the control.' },
  { id: 'valueChanged', fn: 'onValueChanged', payload: 'value', summary: 'Runs once, when the value settles, as a knob is let go: the moment to tell the synth.' },
  { id: 'activeHandleChanged', fn: 'onActiveHandleChanged', payload: 'info', summary: 'A slider with more than one handle moved to another handle. `info.activeHandle` and `info.previousActiveHandle` are each "start", "current" or "end".' },
  { id: 'click', fn: 'onClick', payload: 'mouse', summary: 'The control was clicked. `mouse.x` and `mouse.y` say where, inside the control.' },
  { id: 'doubleClick', fn: 'onDoubleClick', payload: 'mouse', summary: 'The control was double-clicked. `mouse.x` and `mouse.y` say where.' },
  { id: 'pointerDown', fn: 'onPointerDown', payload: 'mouse', summary: 'A mouse button was pressed on the control. `mouse.x` and `mouse.y` say where, `mouse.button` which button, and `mouse.modifiers` the keys held.' },
  { id: 'pointerMove', fn: 'onPointerMove', payload: 'mouse', summary: 'The mouse moved while a button was held down on the control. `mouse.x` and `mouse.y` give the new position.' },
  { id: 'pointerUp', fn: 'onPointerUp', payload: 'mouse', summary: 'The mouse button was released.' },
  { id: 'hoverStart', fn: 'onHoverStart', payload: null, summary: 'The mouse pointer moved onto the control.' },
  { id: 'hoverEnd', fn: 'onHoverEnd', payload: null, summary: 'The mouse pointer left the control.' },
  { id: 'wheel', fn: 'onWheel', payload: 'wheel', summary: 'The mouse wheel was turned over the control. `wheel.delta` says how far, and in which direction.' },
  { id: 'stateChanged', fn: 'onStateChanged', payload: 'state', summary: 'The control\'s look changed. `state` is "normal", "hover", "pressed" or "disabled".' },
];

// `panelStateChanged` used to be declared here. There is no panel-state feature in the model —
// nothing in the editor, the player, or the C++ runtime ever switched one — so the event could
// not fire in any runtime. Declaring an event no runtime raises is the same defect as declaring
// a command no runtime implements; it comes back when panel states do.
export const PANEL_EVENTS = [
  { id: 'controlChanged', fn: 'onControlChanged', payload: 'info', summary: 'A control on the panel changed. `info.target` is its name and `info.value` its new value: one handler for many controls.' },
  { id: 'timer', fn: 'onTimer', payload: 'info', summary: 'A timer you started is due. `info.id` is the name you gave it in `ce.time.startTimer()` or `ce.time.syncTimer()`.' },
  // ce.keys. Panel view only: with the window shut there is no keyboard.
  { id: 'keyDown', fn: 'onKeyDown', payload: 'key', runtime: RUNTIME_WEBVIEW,
    summary: 'A key went down that nothing else on the panel kept: not while typing, and not the panic key, a shortcut, a piano key or a key the focused control used. `key.key` is its name as printed ("R", "7", "Space", "Up", "F2"), `key.code` its place, the same on every layout ("KeyR"), `key.ctrl`, `key.shift`, `key.alt` and `key.meta` the modifiers, `key.repeat` true while the system repeats a held key, and `key.control` the control that has the keyboard. Return true to keep the key: it then goes no further, not to the DAW and not to the editor.' },
  { id: 'keyUp', fn: 'onKeyUp', payload: 'key', runtime: RUNTIME_WEBVIEW,
    summary: 'A key whose keyDown was raised went up, with the same fields except `repeat`. Also raised for every such key when the panel loses the keyboard while it is held. Its return value is not used.' },
];

// Musical time. Raised by whichever runtime is following the clock — the editor's master clock, or
// the DAW playhead window-closed — by watching the position on the MESSAGE THREAD at roughly 30Hz.
//
// That polling rate is the honest limit and it is stated everywhere these appear: a beat at 120bpm
// is 500ms, so the event lands within a frame of it, which is right for lighting an LED, advancing
// a setlist or stepping a sequencer. It is NOT sample-accurate and must never be used to time audio.
export const TIME_EVENTS = [
  { id: 'beat', fn: 'onBeat', payload: 'time', summary: 'A beat went by while the transport plays. `time.bar` and `time.beat` give where, `time.beats` the beats so far, and `time.bpm` the tempo. Within a thirtieth of a second: right for a light or a display, not for timing sound.' },
  { id: 'bar', fn: 'onBar', payload: 'time', summary: 'A bar began, on the downbeat, with onBeat. `time.bar` is its number, `time.beats` the beats so far, and `time.beatsPerBar` the beats in a bar.' },
  { id: 'transport', fn: 'onTransport', payload: 'time', summary: 'The transport started, stopped or changed tempo. `time.playing` says whether it runs, `time.bpm` gives the tempo and `time.source` what drives it.' },
];

export const DEVICE_EVENTS = [
  // decoded (the DPD payoff — 90% of use)
  { id: 'parameterReceived', fn: 'onParameterReceived', payload: 'info', decoded: true, summary: 'The synth sent a parameter\'s value, read through its profile. `info.parameter` is the parameter\'s id and `info.value` its value, in the parameter\'s own units.' },
  { id: 'dumpReceived', fn: 'onDumpReceived', payload: 'dump', decoded: true, summary: 'A dump from the synth arrived and was read; the controls bound to it are filled in already. `dump.values` holds each value by parameter id, `dump.kind` names the dump, such as "patch", and `dump.role` the synth it came from.' },
  // A preset changed on the instrument OR from this panel, which is one event on purpose: a script
  // that repaints a name display does not care which end pressed the button, and giving it two
  // events would mean every such script wiring both and getting it wrong once.
  // ce.osc: every OSC message that arrives, whether or not a pattern matched it.
  { id: 'oscIn', fn: 'onOscIn', payload: 'message', decoded: false,
    summary: 'An OSC message arrived on the port ce.osc.listen() opened. `message.address` is where it was sent, `message.args` its values, `message.types` their OSC types, `message.from` who sent it ({ host, port }), and `message.time` a bundle\'s time. origin() gives "osc".' },
  // ce.daw: the DAW moved a parameter, or chose a program (docs/design/ce-daw-module.md). Raised by an
  // exported plug-in, with its window open or shut; never in the editor, which has no DAW.
  { id: 'automationIn', fn: 'onAutomationIn', payload: 'move', decoded: false,
    summary: 'The DAW moved a parameter. `move.control` is the control\'s name, `move.path` its path, `move.value` the new value in the control\'s own range and `move.id` the DAW parameter\'s id. The control\'s own value events fire too, with origin() giving "host". Never for a change a script or a hand made.' },
  { id: 'dawProgramIn', fn: 'onDawProgramIn', payload: 'program', decoded: false,
    summary: 'The DAW chose a program from the plug-in\'s bank, and the plug-in has sent it to the synth. `program.index` counts from 0, `program.number` from 1, and `program.name` is its name.' },
  // ce.ci: a MIDI-CI device answered, left, or had a profile turned on or off (docs/design/ce-ci-module.md).
  { id: 'ciDiscovered', fn: 'onCiDiscovered', payload: 'device', decoded: true, summary: 'A MIDI-CI device answered: to ce.ci.discover(), or by announcing itself. `device` is as ce.ci.discover() describes it: `device.muid`, `device.model`, `device.names` and `device.matchesProfile` among them.' },
  { id: 'ciDeviceRemoved', fn: 'onCiDeviceRemoved', payload: 'device', decoded: true, summary: 'A MIDI-CI device is gone. `device.muid` is its number and `device.role` the panel\'s device it was found on. Its subscriptions have ended.' },
  { id: 'ciProfileChanged', fn: 'onCiProfileChanged', payload: 'profile', decoded: true, summary: 'A MIDI-CI profile was turned on or off, by a script or on the device itself. `profile.muid` is the device, `profile.id` the profile, `profile.address` "device" or a channel, and `profile.enabled` its new state.' },
  // ce.verify: raised after a check's own function has run, so one script can show what any script checked.
  { id: 'verifyDone', fn: 'onVerifyDone', payload: 'report', decoded: true, summary: 'A ce.verify check finished. `report` is the report its function was given: `report.kind` says which check, `report.ok` whether all was well, and `report.matched`, `report.differed` and `report.unchecked` say what was found. Raised for cancelled checks too.' },
  { id: 'presetChange', fn: 'onPresetChange', payload: 'preset', decoded: true, summary: 'The preset changed. `preset.slot`, `preset.program`, `preset.name`, `preset.category` and `preset.bankId` describe it; `preset.source` is "device" when the synth sent a Program Change, "panel" when the panel called recallPreset.' },
  // raw (escape hatch)
  { id: 'midiIn', fn: 'onMidiIn', payload: 'midi', decoded: false, summary: 'A MIDI message arrived. `midi.bytes` holds it as received, `midi.status` its first byte and `midi.channel` its channel, counted from 0. `midi.from` is the device it came from.' },
  { id: 'ccIn', fn: 'onCcIn', payload: 'cc', decoded: false, summary: 'A controller message arrived. `cc.cc` is the controller number and `cc.value` its value; `cc.channel` counts from 0 here, 0 to 15, where sendCC and onNoteIn count 1 to 16. `cc.from` is the device it came from.' },
  // The most common message on the wire had no event of its own: a panel reacting to played notes
  // had to take onMidiIn and decode status nibbles by hand, in every language, including the
  // note-on-with-velocity-0 case that actually means note-off. Both are derived from the STATUS
  // BYTE rather than from the host's messageType, so the two runtimes cannot classify differently.
  { id: 'noteIn', fn: 'onNoteIn', payload: 'note', decoded: false,
    summary: 'A note was played. `note.channel`, 1 to 16 as in sendNote, `note.note` and `note.velocity` describe it. A note-on at velocity 0 is a note-off in MIDI, and arrives as onNoteOffIn. `note.from` is the device it came from, and `note.id` the note\'s id while ce.mpe.listen() reads that device.' },
  { id: 'noteOffIn', fn: 'onNoteOffIn', payload: 'note', decoded: false,
    summary: 'A note was let go. `note.channel`, 1 to 16, `note.note` and `note.velocity` describe it; the velocity is the release velocity, or 0 for a note-on at velocity 0. `note.from` and `note.id` are as onNoteIn gives them.' },
  // The rest of a device's MIDI, decoded once before any script (midiInDecoder.js, MidiInDecoder.h).
  // Bends, pressure and expression are thinned to one every 10 ms per channel, never reordered.
  { id: 'bendIn', fn: 'onBendIn', payload: 'bend', decoded: false,
    summary: 'A pitch bend arrived. `bend.value` is -8192 to 8191, 0 in the middle; `bend.amount` the same from -1 to 1; `bend.raw` 0 to 16383, as the two bytes carry it. `bend.channel` is 1 to 16 and `bend.from` the device. Raised at most once every 10 ms per channel, with the latest value.' },
  { id: 'pressureIn', fn: 'onPressureIn', payload: 'pressure', decoded: false,
    summary: 'Channel pressure arrived. `pressure.value` is 0 to 127, `pressure.amount` 0 to 1, `pressure.channel` 1 to 16 and `pressure.from` the device. Raised at most once every 10 ms per channel.' },
  { id: 'polyPressureIn', fn: 'onPolyPressureIn', payload: 'pressure', decoded: false,
    summary: 'Pressure on one note arrived. `pressure.note` is the note, `pressure.value` 0 to 127, `pressure.amount` 0 to 1, `pressure.channel` 1 to 16 and `pressure.from` the device. Raised at most once every 10 ms per note.' },
  { id: 'programIn', fn: 'onProgramIn', payload: 'program', decoded: false,
    summary: 'A program change arrived. `program.program` is 0 to 127, as the message carries it, and `program.number` 1 to 128, as most synths show it. `program.bankMsb` and `program.bankLsb` are the bank select that came just before it on this channel, when one did. `program.channel` is 1 to 16 and `program.from` the device.' },
  { id: 'nrpnIn', fn: 'onNrpnIn', payload: 'nrpn', decoded: false,
    summary: 'An NRPN arrived, put together from its controllers (99, 98, then 6 and 38). `nrpn.msb` and `nrpn.lsb` are the parameter number\'s halves, as sendNRPN takes them, and `nrpn.parameter` the two as one number. `nrpn.value` is 0 to 16383 when the fine half came (`nrpn.fine` true), else 0 to 127. For an increment or decrement, `nrpn.step` is 1 or -1 instead. The controllers still raise ccIn too.' },
  { id: 'rpnIn', fn: 'onRpnIn', payload: 'rpn', decoded: false,
    summary: 'An RPN arrived, put together from controllers 101 and 100, then 6 and 38. The fields are those of nrpnIn, and `rpn.name` is "bendRange", "fineTuning", "coarseTuning" or "mpeConfiguration" for the numbers that have one.' },
  { id: 'transportIn', fn: 'onTransportIn', payload: 'transport', decoded: false,
    summary: 'A device sent start, stop, continue or a song position. `transport.action` is "start", "stop", "continue" or "position"; for "position", `transport.beat` is where it points, in beats from the start. `transport.from` is the device. Clock ticks are not raised one by one.' },
  { id: 'expressionIn', fn: 'onExpressionIn', payload: 'expression', decoded: false,
    summary: 'A note read with ce.mpe.listen() moved. `expression.id` is the note\'s id, as noteIn gave it, `expression.note` the note and `expression.channel` its member channel. `expression.bend` is in semitones, `expression.pressure` and `expression.timbre` 0 to 1, and `expression.changed` says which moved: "bend", "pressure" or "timbre". Raised at most once every 10 ms per note.' },
  { id: 'sysexIn', fn: 'onSysexIn', payload: 'bytes', decoded: false, summary: 'A SysEx message arrived. `bytes` holds it as a list of numbers.' },
  { id: 'deviceConnected', fn: 'onDeviceConnected', payload: 'device', decoded: false, summary: 'A synth was connected and is ready. `device.role` names it and `device.profileId` its profile.' },
  { id: 'deviceDisconnected', fn: 'onDeviceDisconnected', payload: 'device', decoded: false, summary: 'A synth is no longer connected and ready. `device.role` names it, and `device.message` may say why.' },
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
    summary: 'A sequencer moved to its next step: an Arpeggiator, Turing Machine, Phrase Sequencer or Looper. `step.target` is its name, `step.index` the step, counted from 1, `step.of` how many there are, and `step.notes` the notes it plays.' },
  { id: 'cycle', fn: 'onCycle', payload: 'cycle', runtime: RUNTIME_WEBVIEW,
    summary: 'A sequence or loop came round to its start: an Arpeggiator, Turing Machine, Looper or Orbit. `cycle.target` is its name and `cycle.count` how many times it has come round since the panel opened.' },
  { id: 'hit', fn: 'onHit', payload: 'hit', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or strip was struck: a Chord Pad, Drum Pads or Note Ribbon. `hit.target` is its name, `hit.id` which pad or key, `hit.note` the note and `hit.velocity` how hard.' },
  { id: 'release', fn: 'onRelease', payload: 'release', runtime: RUNTIME_WEBVIEW,
    summary: 'A pad, key or strip was let go. `release.target` is its name, `release.id` which pad or key, and `release.note` the note.' },
  { id: 'scene', fn: 'onScene', payload: 'scene', runtime: RUNTIME_WEBVIEW,
    summary: 'The Setlist moved to a scene, however it was chosen. `scene.target` is its name, `scene.index` the scene, counted from 1, and `scene.name` its name.' },
  { id: 'stage', fn: 'onStage', payload: 'stage', runtime: RUNTIME_WEBVIEW,
    summary: 'A Recorder or an Envelope moved to a new stage. `stage.target` is its name, `stage.stage` the new stage and `stage.previous` the old one: the Recorder\'s "idle", "armed", "recording" and "overdub", the Envelope\'s "sustain", "release" and "end". Not onStateChanged, which is hover and press.' },
  { id: 'settled', fn: 'onSettled', payload: 'settled', runtime: RUNTIME_WEBVIEW,
    summary: 'A Ribbon, Crossfader or Vector Joystick finished going back to its rest. `settled.target` is its name and `settled.value` where it came to rest.' },
  { id: 'bounce', fn: 'onBounce', payload: 'bounce', runtime: RUNTIME_WEBVIEW,
    summary: 'The Kinetic ball hit a wall. `bounce.target` is its name, `bounce.x` and `bounce.y` where it hit, and `bounce.vx` and `bounce.vy` its speed across and down.' },
  { id: 'recall', fn: 'onRecall', payload: 'recall', runtime: RUNTIME_WEBVIEW,
    summary: 'The Constellation, in snap mode, moved to another preset. `recall.target` is its name, `recall.id` the preset and `recall.label` its label.' },
  { id: 'zone', fn: 'onZone', payload: 'zone', runtime: RUNTIME_WEBVIEW,
    summary: 'A Meter\'s reading crossed into another zone, such as from green into red. `zone.target` is its name, `zone.zone` the new zone, `zone.previous` the old one and `zone.value` the reading.' },
  { id: 'voiced', fn: 'onVoiced', payload: 'voiced', runtime: RUNTIME_WEBVIEW,
    summary: 'A Zone Splitter or Harmoniser turned a played note into other notes. `voiced.target` is its name, `voiced.note` and `voiced.velocity` the note played, and `voiced.out` the notes it made.' },
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
    summary: 'Change a value on the panel: a control\'s value, or any property a path reaches.',
    notes: [
      'Sent to the synth, except while a handler answers MIDI from the synth, so a value is not echoed back; `opts.transmit` decides otherwise.',
      'A new property on a section with a fixed shape: written, with a console warning that nothing reads it.',
      'Returns nothing.',
    ],
    example: '`set("Cutoff", 64)` turns the control called Cutoff to 64.',

    params: [
      { name: 'path', type: 'path', required: true, summary: 'A control\'s name, then a dot and the property: "Cutoff.value", "Cutoff.Transform.x". The name alone: its value. Names in any case.\n"panel." and a property: the panel\'s own, such as "panel.width".\n".normalizedValue" at the end: its position, 0 to 1, in place of the value.\nNot a control on the panel, or a property it does not have: nothing is written, with a console error.' },
      { name: 'value', type: 'value', required: true, summary: 'The new value.\nA Knob\'s, a Slider\'s, a Number\'s or a Range\'s value, and a position: a number. Text that is a number: read as one.\nA colour property: 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#"; "#000", a name such as "red", rgb() and hsl() are stored written out, as "#000000" and "#FF0000".\nA gradient stop: RRGGBB, without alpha.\nLeft out, a number in any other form, or a colour in any other form: nothing is written, with a console error.', at: 'path' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
        { name: 'transmit', type: 'true or false', default: 'decided by where the write came from',
          summary: 'Whether the change is sent to the synth: true sent, false not.\nLeft out: sent, except while a handler answers MIDI from the synth.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'set("${1:path}", ${2:value})$0', javascript: 'set("${1:path}", ${2:value})$0' },
  },
  {
    id: 'get', category: 'Values', signature: 'get(path [, form])',
    summary: 'Read a value from the panel.',
    notes: [
      'Returns the value; a colour written out, as `set()` stores it.',
    ],
    example: '`get("Cutoff")` gives the value of the control called Cutoff.',

    params: [
      { name: 'path', type: 'path', required: true, summary: 'A control\'s name, then a dot and the property: "Cutoff.value", "Cutoff.Transform.x". The name alone: its value. Names in any case.\n"panel." and a property: the panel\'s own, such as "panel.width".\nNot a control on the panel, or a property it does not have: no result, with a console error.\nA property with no value yet: no result, without a word.' },
      { name: 'form', type: 'string', required: false, summary: '"value": the control\'s value.\n"normalizedValue": its position, 0 to 1.\n"midiValue": the number the synth is sent; only where the synth\'s profile is attached.\nCase-insensitive.\nLeft out: "value", or the form the path ends with.\nAny other: no result, with a console error naming the forms.', values: VALUE_ACCESSOR_IDS },
    ],
    scopes: 'any',
    snippet: { lua: 'get("${1:path}")$0', javascript: 'get("${1:path}")$0' },
  },

  /* --- Transmit control (Q2, Family A) --- */
  {
    id: 'noTransmit', category: 'Transmit', signature: 'noTransmit(fn)',
    summary: 'Change controls without sending anything to the synth.',
    notes: [
      'For an Init Patch button that resets many controls at once.',
      'Sending is back on when the function ends; an error in it is printed in the console.',
      'Returns nothing.',
    ],
    example: '`noTransmit(function() set("Cutoff", 0) set("Reso", 0) end)` resets both, silently.',

    params: [{ name: 'fn', type: 'function', required: true, summary: 'The changes to make.\nNot a function: a console error.' }],
    scopes: 'any',
    snippet: { lua: 'noTransmit(function()\n  $0\nend)', javascript: 'noTransmit(() => {\n  $0\n})' },
  },
  {
    id: 'transmit', category: 'Transmit', signature: 'transmit(fn)',
    summary: 'Send changes to the synth even while a handler answers MIDI from it.',
    notes: [
      'Outside such a handler changes are sent anyway.',
      'Returns nothing.',
    ],
    example: '`transmit(function() set("Cutoff", 64) end)` sends 64 from inside a MIDI handler.',

    params: [{ name: 'fn', type: 'function', required: true, summary: 'The changes to send.' }],
    scopes: 'any',
    snippet: { lua: 'transmit(function()\n  $0\nend)', javascript: 'transmit(() => {\n  $0\n})' },
  },

  /* --- Events & Flow (Q3, Q6) --- */
  {
    id: 'on', category: 'Events & Flow', signature: 'on(target, event, fn)',
    summary: 'Call a function whenever an event happens.',
    notes: [
      'Put it at the top of a script, outside any function: it is set up once, when the script loads; running the script again replaces it.',
      'A script answers the event its Runs on setting names without it.',
      'Returns nothing. A function left out: nothing is set up, without a word.',
    ],
    example: '`on("*", "patchLoaded", fn)` calls fn each time any script emits patchLoaded.',

    params: [
      { name: 'target', type: 'targetRef', required: true, summary: 'What the event comes from: a control\'s name, in any case, or "*" for anything.\nLeft out: "*".' },
      { name: 'event', type: 'eventName', required: true, summary: 'The event: a handler\'s name, such as "onValueChanged", or a name `emit()` announces.\nLeft out: nothing is set up, with a console error.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the event\'s information.\nNot a function, or left out: nothing is set up, with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'on("${1:target}", "${2:event}", function(${3:e})\n  $0\nend)',
      javascript: 'on("${1:target}", "${2:event}", (${3:e}) => {\n  $0\n})',
    },
  },
  {
    id: 'off', category: 'Events & Flow', signature: 'off(target, event)',
    summary: 'Stop calling the functions `on()` set up for an event.',
    notes: [
      'This script\'s only; other scripts\' go on.',
      'Returns nothing. One that was not set up: nothing, without a word.',
    ],
    example: '`off("Cutoff", "onValueChanged")` stops this script\'s calls for Cutoff\'s value changes.',

    params: [
      { name: 'target', type: 'targetRef', required: true, summary: 'As `on()` was given it.\nLeft out: "*".' },
      { name: 'event', type: 'eventName', required: true, summary: 'As `on()` was given it.' },
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
    summary: 'Call a function whenever a value on the panel changes.',
    notes: [
      'Whatever made the change: a script, a drag, MIDI from the synth.',
      'Running the script again replaces it.',
      'Returns nothing. A function left out: nothing is set up, without a word.',
    ],
    example: '`watch("Cutoff", function(value, previous) log(value) end)` logs Cutoff\'s value each time it changes.',

    params: [
      { name: 'path', type: 'string', required: true, summary: 'What to watch: a path, as `set()` takes it.\nLeft out: nothing is set up, with a console error.', kind: 'path' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the new value and the one before.\nNot a function, or left out: nothing is set up, with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'watch("${1:cutoff.value}", function(${2:v}, prev)\n  $0\nend)',
      javascript: 'watch("${1:cutoff.value}", (${2:v}, prev) => {\n  $0\n})',
    },
  },
  {
    id: 'compute', category: 'Events & Flow', signature: 'compute(path, fn)',
    summary: 'Make a property follow a formula.',
    notes: [
      'Worked out again whenever anything on the panel changes, and written to the path.',
      'Running the script again replaces it.',
      'Returns nothing. A function left out: nothing is set up, without a word.',
    ],
    example: '`compute("Readout.Text.content", function() return get("Cutoff") .. " Hz" end)` keeps Readout showing Cutoff\'s value.',

    params: [
      { name: 'path', type: 'string', required: true, summary: 'The property to write: a path, as `set()` takes it.\nLeft out: nothing is set up, with a console error.', kind: 'path' },
      { name: 'fn', type: 'function', required: true, summary: 'Returns the value to write.\nNot a function, or left out: nothing is set up, with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'compute("${1:label.text.text}", function()\n  return $0\nend)',
      javascript: 'compute("${1:label.text.text}", () => {\n  return $0\n})',
    },
  },
  {
    id: 'intercept', category: 'Events & Flow', signature: 'intercept(path, fn)',
    summary: 'Check or change every value written to a property before it lands.',
    notes: [
      'Running the script again replaces it.',
      'Returns nothing. A function left out: nothing is set up, without a word.',
    ],
    example: '`intercept("Cutoff", function(value) return math.floor(value) end)` keeps Cutoff whole.',

    params: [
      { name: 'path', type: 'string', required: true, summary: 'The property: a path, as `set()` takes it.\nLeft out: nothing is set up, with a console error.', kind: 'path' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the value and the one before.\nA value returned: written in its place.\nfalse: the change is refused.\nNothing: written as it is.\nNot a function, or left out: nothing is set up, with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'intercept("${1:cutoff.value}", function(${2:v}, prev)\n  return $0\nend)',
      javascript: 'intercept("${1:cutoff.value}", (${2:v}, prev) => {\n  return $0\n})',
    },
  },
  {
    id: 'defineAction', category: 'Events & Flow', signature: 'defineAction(name, fn)',
    summary: 'Name a function, so other scripts and the panel can call it.',
    notes: [
      'The panel offers it wherever a control can trigger an action.',
      'A name this script defined: replaced. One another script defined: this one is ignored, with a console error.',
      'Returns nothing. A name or a function left out: nothing is defined, without a word.',
    ],
    example: '`defineAction("randomize", fn)` lets any script call fn with `run("randomize")`.',

    params: [
      { name: 'name', type: 'string', required: true, summary: 'The action\'s name, in any case.\nLeft out: nothing is set up, with a console error.', kind: 'sharedName' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with what `run()` passes; what it returns goes back.\nNot a function, or left out: nothing is set up, with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'defineAction("${1:initPatch}", function(${2:args})\n  $0\nend)',
      javascript: 'defineAction("${1:initPatch}", (${2:args}) => {\n  $0\n})',
    },
  },
  {
    id: 'emit', category: 'Events & Flow', signature: 'emit(name [, data])',
    summary: 'Announce an event of your own, with data.',
    notes: [
      'It does not wait for an answer: `run()` gives one.',
      'An emit inside an emit, 16 deep: dropped, with a console error.',
      'Returns nothing.',
    ],
    example: '`emit("patchLoaded", { name = "Init" })` calls every function `on("*", "patchLoaded", fn)` set up.',

    params: [
      { name: 'name', type: 'string', required: true, summary: 'The event\'s name, as `on()` listens for it.', kind: 'sharedName' },
      { name: 'data', type: 'value', required: false, summary: 'Passed to each function.\nLeft out: nothing.' },
    ],
    scopes: 'any',
    snippet: { lua: 'emit("${1:name}", ${2:data})$0', javascript: 'emit("${1:name}", ${2:data})$0' },
  },
  {
    id: 'run', category: 'Events & Flow', signature: 'run(target.action [, args])',
    summary: 'Call an action another script defined, and give back what it returns.',
    notes: [
      'Works across languages: only numbers, text, true or false, lists and tables pass in and out.',
      'Returns what the action returns. No script defines it: no result, with a console error.',
    ],
    example: '`run("randomize")` calls the action randomize and gives its result.',

    params: [
      { name: 'action', type: 'scriptRef', required: true, summary: 'The action\'s name, as `defineAction()` gave it; or "Control.action" for the function of that name in a control\'s script.', kind: 'sharedName' },
      { name: 'args', type: 'value', required: false, summary: 'Passed to the action.\nLeft out: nothing.' },
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
    summary: 'Start a repeating timer.',
    example: '`startTimer("blink", 250)` runs onTimer with info.id "blink" every 250 ms.',
    notes: [
      'Runs onTimer each time, until `ce.time.stopTimer()` with the same id.',
      'An id already running: restarted with the new interval; a `ce.time.syncTimer()` of that name becomes a millisecond one.',
      'Returns no value; rejected with a console error: no timer is started.',
    ],
    params: [
      { name: 'id', type: 'string', required: true, kind: 'sharedName', summary: 'The timer\'s name, as onTimer\'s info.id reports it.\nLeft out, or "": rejected with a console error.' },
      { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'Interval in milliseconds.\nRange: > 0.\nText, even "250", ≤ 0, or invalid: rejected with a console error.' },
    ],
    scopes: 'any',
    snippet: { lua: 'startTimer("${1:id}", ${2:250})$0', javascript: 'startTimer("${1:id}", ${2:250})$0' },
  },
  {
    id: 'after', category: 'Events & Flow', signature: 'after(ms, fn) -> id',
    summary: 'Run a function once, after a delay.',
    example: '`after(500, function() set("gate", 0) end)` sets gate to 0 half a second from now.',
    notes: [
      'Returns an id for `ce.time.stopTimer()`, which cancels it before it runs.',
      'Rejected with a console error: nothing is scheduled, no result.',
    ],
    params: [
      { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'Delay in milliseconds.\nRange: ≥ 0.\n0: as soon as the handler has returned.\nText, even "1000", < 0, or invalid: rejected with a console error.' },
      { name: 'fn', type: 'function', required: true, summary: 'The function to run.\nNot a function: rejected with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'after(${1:250}, function()\n  $0\nend)',
      javascript: 'after(${1:250}, function () {\n  $0\n});',
    },
  },
  {
    id: 'stopTimer', category: 'Events & Flow', signature: 'stopTimer(id)',
    summary: 'Stop a timer, or cancel a one-off before it runs.',
    example: '`stopTimer("blink")` stops the timer called blink.',
    notes: [
      'Stops a `ce.time.startTimer()` or `ce.time.syncTimer()` timer, or cancels an `after()` or `afterBeats()` by the id it returned.',
      'An id that is not running: nothing happens, and nothing is said.',
      'Returns no value.',
    ],
    params: [{ name: 'id', type: 'string', required: true, kind: 'sharedName', summary: 'The timer\'s name, or the id `after()` returned.\nLeft out, or "": rejected with a console error.' }],
    scopes: 'any',
    snippet: { lua: 'stopTimer("${1:id}")$0', javascript: 'stopTimer("${1:id}")$0' },
  },

  /* --- Device / MIDI: bulk (Q9) --- */
  {
    id: 'requestDump', category: 'Device / MIDI', signature: 'requestDump(kind [, fn [, opts]])',
    refusal: 'false',
    summary: 'Ask the synth to send a dump: every setting of a patch in one message.',
    example: '`requestDump("patch")` asks the synth for its patch dump.',
    notes: [
      'When it arrives, the bound controls are filled and `onDumpReceived` runs.',
      'Returns true when the request went out. Rejected: false, with a console error.',
    ],
    params: [
      { name: 'kind', type: 'dumpKind', required: true, summary: 'A dump the device profile defines, such as "system", or one declared with `deviceDefineDump()`; or a request\'s own id, such as "requestSystem".\nAny other: rejected with a console error.' },
      { name: 'fn', type: 'function', required: false, summary: 'Called as fn(values, info) when the reply arrives, or when it does not.\n`info.ok` false: nothing arrived in time; see `opts.timeout`.\nA request answered by several dumps at once: none is waited for; name the dump wanted.' },
      { name: 'opts', type: 'object', required: false, summary: 'The option below.', fields: optionFields([
        { name: 'timeout', type: 'number', default: 'the request\'s own timeout for every try, at least 3000', unit: 'milliseconds',
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
    refusal: 'result',
    summary: 'Switch the synth to a stored preset.',
    example: '`recallPreset(64)` switches to preset 64, the first of the second bank on a synth whose banks hold 64.',
    notes: [
      'Sent as the device profile says the synth needs: a Program Change, a Bank Select and a Program Change, or a SysEx message.',
      'Returns { ok, error, slot, name, category, messages }; refused: `ok` false, `error` saying why, and a console error.',
    ],
    params: [
      { name: 'slot', type: 'number', required: true, summary: 'Preset number across all banks, counted from 0, as the device profile numbers them: not the MIDI program number.\nNot a whole number from 0: rejected with a console error.', kind: 'presetSlot' },
      { name: 'opts', type: 'object', required: false, summary: 'The option below.', fields: optionFields([
        { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"',
          summary: 'Which device to recall on, when the panel names more than one.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'recallPreset(${1:0})$0', javascript: 'recallPreset(${1:0})$0' },
  },
  {
    id: 'preset', category: 'Device / MIDI', signature: 'preset([role])',
    summary: 'Describe the preset loaded now.',
    example: '`preset().name` gives the loaded preset\'s name.',
    notes: [
      'Returns { slot, program, name, category, bankId, bankLabel, writable, source }.',
      'What the panel has seen: a Program Change arriving or a `recallPreset()` going out. Until then `slot` is -1: most synths do not say, and cannot be asked.',
    ],
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: { lua: 'local p = preset()$0', javascript: 'const p = preset();$0' },
  },
  {
    id: 'applyDump', category: 'Device / MIDI', signature: 'applyDump(bytes)',
    summary: 'Fill the panel from a dump, without sending anything to the synth.',
    example: '`applyDump({ cutoff = 64 })` sets the controls bound to cutoff to 64.',
    notes: [
      'Returns how many values were applied.',
    ],
    params: [{ name: 'bytes', type: 'bytes', required: true, summary: 'A table of parameter ids and values: applied as they are.\nOr the dump\'s bytes, a list of numbers or hex text read a byte at a time as `sendSysex()` reads it: decoded by the device profile.\nBytes in the panel view: not decoded, with a console line; the exported plug-in decodes them.' }],
    scopes: 'any',
    snippet: { lua: 'applyDump(${1:bytes})$0', javascript: 'applyDump(${1:bytes})$0' },
  },
  {
    id: 'sendDump', category: 'Device / MIDI', signature: 'sendDump(kind)',
    summary: 'Build a dump from the panel\'s values and send it to the synth.',
    example: '`sendDump("patch")` sends the panel\'s values to the synth as its patch dump.',
    notes: [
      'Rejected: with a console error; nothing is sent.',
    ],
    params: [{ name: 'kind', type: 'dumpKind', required: true, summary: 'A dump the device profile defines, by its id, as `requestDump()` takes it.\nAny other: rejected with a console error.' }],
    scopes: 'any',
    snippet: { lua: 'sendDump("${1:patch}")$0', javascript: 'sendDump("${1:patch}")$0' },
  },
  {
    id: 'buildDump', category: 'Device / MIDI', signature: 'buildDump(kind)',
    summary: 'Build a dump from the panel\'s values, and give back its bytes without sending them.',
    example: '`local bytes = buildDump("patch")` keeps the panel\'s values as a patch dump.',
    notes: [
      'A profile\'s dump is built by the device host: in the panel view, only a dump declared with `deviceDefineDump()` is.',
      'Returns a list of bytes. Rejected: no result, with a console error.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'kind', type: 'dumpKind', required: true, summary: 'A dump the device profile defines, by its id, or one declared with `deviceDefineDump()`.\nAny other: rejected with a console error.' }],
    scopes: 'any',
    snippet: { lua: 'local bytes = buildDump("${1:patch}")$0', javascript: 'const bytes = buildDump("${1:patch}")$0' },
  },

  /* --- Colour arithmetic (design doc §41) ---
     In ce.math rather than ce.draw because it is PURE and cross-runtime: setting a control's colour
     from a value works with the panel shut, and the exported plugin does it.

     §36's sweep swept utils/*Layout.js and declared ce.math complete. colorMath.js and
     colorHelpers.js do not match that glob — the sweep had a blind spot exactly the shape of its
     own search pattern, which is worth writing down because it is the failure mode of any sweep.

     ONE input form, and a trap worth naming. Every verb here accepts what a colour property
     accepts, read as if the long form the property would store had been given
     (scriptColours.storedColour): "RRGGBB", "AARRGGBB" or "#RRGGBB" as written (6 or 8 hex digits,
     one "#" at most), and CSS's short forms written out first, as set() writes them out ("#abc",
     "red", rgb(), hsl()); anything else is refused with a message. Each returns "#RRGGBB", which
     CSS, SVG and a panel property all accept. The app STORES colours as AARRGGBB (JUCE's order:
     "66FFFFFF" is a 40%-opaque white in every panel document) while CSS wants #RRGGBBAA — the same
     four bytes the other way round. So exactly one verb, `alpha`, returns the panel's form, and
     making a DRAWING translucent is ce.draw.opacity(), a different question with a different
     answer. Case is normalised to upper; hex is case-insensitive everywhere it is read. */
  {
    id: 'lighten', category: 'Value / range', signature: 'lighten(colour [, amount]) -> string',
    summary: 'Make a colour lighter.',
    example: '`lighten("#336699", 0.5)` gives "#99B3CC".',
    params: [
      { name: 'colour', type: 'string', required: true, kind: 'colour', summary: 'The colour, in any form a colour property takes, such as "#FF8800", "red" or rgb(255, 136, 0).' },
      { name: 'amount', type: 'number', required: false, unit: '0 to 1', summary: 'Range: 0 ↔ 1 (unchanged ↔ white).\nDefault: 0.4.\nOutside the range: an error in the console and no result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'darken', category: 'Value / range', signature: 'darken(colour [, amount]) -> string',
    summary: 'Make a colour darker.',
    example: '`darken("#336699", 0.5)` gives "#1A334D".',
    notes: ['The amount works the opposite way to lighten\'s: a smaller amount makes the colour darker.'],
    params: [
      { name: 'colour', type: 'string', required: true, kind: 'colour', summary: 'The colour, in any form a colour property takes, such as "#FF8800", "red" or rgb(255, 136, 0).' },
      { name: 'amount', type: 'number', required: false, unit: '0 to 1', summary: 'Range: 0 ↔ 1 (black ↔ unchanged).\nDefault: 0.55.\nOutside the range: an error in the console and no result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'mixColour', category: 'Value / range', signature: 'mixColour(a, b, t) -> string',
    summary: 'Blend two colours.',
    example: '`mixColour("#00FF00", "#FF0000", 0.5)` gives "#808000".',
    notes: ['Red, green and blue are each blended in a straight line. This suits a meter that fades from green to red.'],
    params: [
      { name: 'a', type: 'string', required: true, kind: 'colour', summary: 'The first colour, in any form a colour property takes.' },
      { name: 'b', type: 'string', required: true, kind: 'colour', summary: 'The second colour, in any form a colour property takes.' },
      { name: 't', type: 'number', required: true, unit: '0 to 1', summary: 'Range: 0 ↔ 1 (first colour ↔ second colour). 0.5 is halfway.\nLeft out: 0.\nOutside the range: held at 0 or 1.\nNot a number: an error in the console and no result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'colourAlpha', category: 'Value / range', signature: 'colourAlpha(colour, a) -> string',
    summary: 'Give a colour a transparency, ready to store in a control\'s colour property.',
    example: '`colourAlpha("#FF0000", 0.5)` gives "80FF0000".',
    notes: [
      'It returns AARRGGBB without "#", the form a colour property stores. The other colour commands return "#RRGGBB".',
      'The web\'s #RRGGBBAA form has the same four bytes in a different order, so the two forms can\'t be swapped.',
      'To make something you draw see-through, use `ce.draw.opacity`.',
    ],
    params: [
      { name: 'colour', type: 'string', required: true, kind: 'colour', summary: 'The colour, in any form a colour property takes. Any alpha it already has is replaced.' },
      { name: 'a', type: 'number', required: true, unit: '0 to 1', summary: 'Range: 0 ↔ 1 (fully transparent ↔ fully solid).\nOutside the range or left out: an error in the console and no result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'hexToRgb', category: 'Value / range', signature: 'hexToRgb(colour) -> table',
    summary: 'Split a colour into its red, green and blue parts.',
    example: '`hexToRgb("#FF8000")` gives r 255, g 128 and b 0.',
    notes: ['It returns r, g and b, each in the range 0 ↔ 255.'],
    params: [{ name: 'colour', type: 'string', required: true, kind: 'colour', summary: 'The colour, in any form a colour property takes. Any alpha is ignored.' }],
    scopes: 'any',
  },
  {
    id: 'rgbToHex', category: 'Value / range', signature: 'rgbToHex(r, g, b) -> string',
    summary: 'Build a colour from red, green and blue parts.',
    example: '`rgbToHex(255, 128, 0)` gives "#FF8000".',
    params: [
      { name: 'r', type: 'number', required: true, summary: 'Red.\nRange: 0 ↔ 255.\nLeft out: 0.\nOutside the range: held at 0 or 255. A fraction is rounded.\nNot a number: an error in the console and no result.' },
      { name: 'g', type: 'number', required: true, summary: 'Green.\nRange: 0 ↔ 255.\nLeft out: 0.\nOutside the range: held at 0 or 255. A fraction is rounded.\nNot a number: an error in the console and no result.' },
      { name: 'b', type: 'number', required: true, summary: 'Blue.\nRange: 0 ↔ 255.\nLeft out: 0.\nOutside the range: held at 0 or 255. A fraction is rounded.\nNot a number: an error in the console and no result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'colourFromArgb', category: 'Value / range', signature: 'colourFromArgb(colour) -> string',
    summary: 'Read a colour written with its alpha first, as AARRGGBB.',
    example: '`colourFromArgb("#80FF0000")` gives "80FF0000".',
    notes: [
      'It returns "#RRGGBB" when the colour is fully solid, otherwise AARRGGBB without "#".',
      '"#" with 8 hex digits means AARRGGBB to a colour property and the colour commands, but RRGGBBAA to a drawing. This command says you mean alpha first; `ce.math.fromRGBA` says alpha last.',
    ],
    params: [{ name: 'colour', type: 'string', required: true, kind: 'colour', order: 'argb', summary: '8 or 4 hex digits, alpha first, with or without "#". 6 or 3 hex digits: no alpha, returned solid.\nAnything else, such as "red": an error in the console and no result.' }],
    scopes: 'any',
  },
  {
    id: 'colourFromRgba', category: 'Value / range', signature: 'colourFromRgba(colour) -> string',
    summary: 'Read a colour written with its alpha last, as RRGGBBAA, the web\'s order.',
    example: '`colourFromRgba("#FF000080")` gives "80FF0000".',
    notes: [
      'It returns "#RRGGBB" when the colour is fully solid, otherwise AARRGGBB without "#".',
      '"#" with 8 hex digits means RRGGBBAA to a drawing, but AARRGGBB to a colour property and the colour commands. This command says you mean alpha last; `ce.math.fromARGB` says alpha first.',
    ],
    params: [{ name: 'colour', type: 'string', required: true, kind: 'colour', order: 'rgba', summary: '8 or 4 hex digits, alpha last, with or without "#". 6 or 3 hex digits: no alpha, returned solid.\nAnything else, such as "red": an error in the console and no result.' }],
    scopes: 'any',
  },
  {
    id: 'hexToHsl', category: 'Value / range', signature: 'hexToHsl(colour) -> table',
    summary: 'Describe a colour by its hue, saturation and lightness.',
    example: '`hexToHsl("#FF0000")` gives h 0, s 100 and l 50.',
    notes: [
      'It returns h in the range 0 ↔ 360, and s and l in the range 0 ↔ 100, as in the colour editor. The numbers are not rounded.',
      'A grey has hue 0 and saturation 0.',
    ],
    params: [{ name: 'colour', type: 'string', required: true, kind: 'colour', summary: 'The colour, in any form a colour property takes. Any alpha is ignored.' }],
    scopes: 'any',
  },
  {
    id: 'hslToHex', category: 'Value / range', signature: 'hslToHex(h, s, l) -> string',
    summary: 'Build a colour from hue, saturation and lightness.',
    example: '`hslToHex(120, 100, 50)` gives "#00FF00".',
    notes: ['The reverse of `ce.math.hsl`.'],
    params: [
      { name: 'h', type: 'number', required: true, summary: 'Hue.\nRange: 0 ↔ 360.\nLeft out: 0.\nOutside the range: wraps round, so -120 is 240 and 480 is 120.\nNot a number: an error in the console and no result.' },
      { name: 's', type: 'number', required: true, summary: 'Saturation.\nRange: 0 ↔ 100.\nLeft out: 0.\nOutside the range: held at 0 or 100.\nNot a number: an error in the console and no result.' },
      { name: 'l', type: 'number', required: true, summary: 'Lightness.\nRange: 0 ↔ 100.\nLeft out: 0.\nOutside the range: held at 0 or 100.\nNot a number: an error in the console and no result.' },
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
    refusal: 'false',
    summary: 'Move a value smoothly to a new number over time.',
    example: '`animateTo("cutoff", 127, {duration = 500})` moves cutoff to 127 in half a second.',
    notes: [
      'A new move on a value that is already moving replaces the old one, and the old one\'s `done` is called with false.',
      'Returns false if the call is rejected.',
    ],
    params: [
      { name: 'path', type: 'path', required: true, summary: 'The value to animate, or a list of values.\nColour property, or a control not on the panel: rejected with a console error.\nList containing either: the entire list is rejected.' },
      { name: 'target', type: 'number', required: true, summary: 'The end value.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: curve "linear", duration 300.',
        fields: optionFields([
          'duration', 'beats', 'sync',
          { name: 'curve', type: 'text or list', default: '"linear"', kind: 'curve',
            values: [...ANIM_CURVE_NAMES],
            summary: 'Easing curve: a name, or cubic Bézier control points {x1, y1, x2, y2}.\nRange: x1, x2: 0 ↔ 1; y1, y2: -2 ↔ 3.\nInvalid: linear.' },
          { name: 'damping', type: 'number', default: '6', kind: 'number',
            summary: 'Spring damping (curve = "spring").\nRange: ≥ 0.\n0: undamped.\nInvalid: default.' },
          { name: 'frequency', type: 'number', default: '12', kind: 'number',
            summary: 'Spring oscillation frequency (curve = "spring").\nRange: ≥ 0.\n0: no oscillation.\nBelow 0: sign ignored.\nInvalid: default.' },
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
    refusal: 'false',
    summary: 'Move a value to a new number with a spring motion.',
    example: '`animateSpring("cutoff", 127)` moves cutoff to 127 with a spring, in 600 ms.',
    notes: [
      'A new move on a value that is already moving replaces the old one, and the old one\'s `done` is called with false.',
      'Returns false if the call is rejected.',
    ],
    params: [
      { name: 'path', type: 'path', required: true, summary: 'The value to animate, or a list of values.\nColour property, or a control not on the panel: rejected with a console error.\nList containing either: the entire list is rejected.' },
      { name: 'target', type: 'number', required: true, summary: 'The end value.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: duration 600, damping 6, frequency 12.',
        fields: optionFields([
          { like: 'duration', default: '600' },
          { name: 'damping', type: 'number', default: '6', kind: 'number',
            summary: 'Spring damping.\nRange: ≥ 0.\n0: undamped.\nInvalid: default.' },
          { name: 'frequency', type: 'number', default: '12', kind: 'number',
            summary: 'Spring oscillation frequency.\nRange: ≥ 0.\n0: no oscillation.\nBelow 0: sign ignored.\nInvalid: default.' },
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
    summary: 'Stop an animation where it is.',
    notes: [
      'The animation\'s `done` function is called with false.',
      'To jump to the end instead, use `ce.anim.finish()`.',
    ],
    params: [{ name: 'path', type: 'path', required: false, summary: 'The value.\nLeft out: every animation on the panel.' }],
    scopes: 'any',
    snippet: { lua: 'ce.anim.stop("${1:cutoff}")$0', javascript: 'ce.anim.stop("${1:cutoff}");$0' },
  },
  {
    id: 'animateRunning', category: 'Animation', signature: 'animateRunning([path])',
    summary: 'Report whether a value is being animated.',
    example: '`animateRunning("cutoff")` gives true while cutoff is being animated.',
    notes: [
      'Returns true while an animation is on the value, paused or not.',
    ],
    params: [{ name: 'path', type: 'path', required: false, summary: 'The value.\nLeft out: any value on the panel.' }],
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
    refusal: 'false',
    summary: 'Move a value through a shape given as points.',
    example: '`animateEnvelope("cutoff", {{0, 0}, {0.1, 1}, {1, 0}}, {duration = 800, to = 127})` moves cutoff to 127 in 80 ms, then back to 0 by 800 ms.',
    notes: [
      'A new move on a value that is already moving replaces the old one, and the old one\'s `done` is called with false.',
      'Returns false if the call is rejected.',
    ],
    params: [
      { name: 'path', type: 'path', required: true, summary: 'The value to animate, or a list of values.\nColour property, or a control not on the panel: rejected with a console error.\nList containing either: the entire list is rejected.' },
      // The Values tab draws the shape and, for points written out, edits them (scriptValueKinds'
      // readEnvelope, which reads them as the runtime does: scripting/animEnvelope.js).
      { name: 'points', type: 'list', required: true, kind: 'envelope',
        summary: 'The shape: a list of {x, y} or {x, y, curve}.\nx: position in the animation. Range: 0 ↔ 1. Outside the range: rejected with a console error.\ny: level. Range: 0 ↔ 1 (from ↔ to). Outside the range: not held.\ncurve: shape of the segment leading to the point: "linear", "exp", "log", "s" or "hold". Unknown: linear.\nPoints are sorted by x. Before the first and after the last: that point\'s y.\nFewer than 2 points: rejected.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: from 0, to 1, duration 300.',
        fields: optionFields([
          { name: 'from', type: 'number', default: '0',
            summary: 'Value at y = 0.\nInvalid: default.' },
          { name: 'to', type: 'number', default: '1',
            summary: 'Value at y = 1.\nInvalid: default.' },
          'duration', 'beats', 'sync', 'delay', 'stagger', 'repeat', 'pingpong', 'done',
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
    summary: 'Describe the animation on a value.',
    example: '`animateValue("cutoff").progress` gives how far the move is, 0 ↔ 1.',
    notes: [
      'Returns {path, kind, value, progress, from, to, elapsed, remaining, paused, cycle, sync}.',
      'kind: "to", "spring" or "envelope". progress: 0 ↔ 1. elapsed, remaining: ms; none with sync.',
      'No animation on the value: no result.',
    ],
    params: [{ name: 'path', type: 'path', required: true, summary: 'The value.' }],
    scopes: 'any',
  },
  {
    id: 'animateList', category: 'Animation', signature: 'animateList() -> list',
    summary: 'List every running animation.',
    example: '`animateList()` gives {} while nothing is animated.',
    notes: [
      'Returns a list of tables as `ce.anim.value()` returns them, sorted by path.',
      'None running: an empty list.',
    ],
    scopes: 'any',
  },
  {
    id: 'animatePause', category: 'Animation', signature: 'animatePause(path)',
    summary: 'Hold an animation where it is.',
    example: '`animatePause("cutoff")` holds cutoff\'s animation.',
    notes: [
      'Returns true if it was running; false if none, or already paused.',
      '`ce.anim.resume()` continues from the held point.',
    ],
    params: [{ name: 'path', type: 'path', required: true, summary: 'The value.' }],
    scopes: 'any',
  },
  {
    id: 'animateResume', category: 'Animation', signature: 'animateResume(path)',
    summary: 'Continue a paused animation from where it was held.',
    example: '`animateResume("cutoff")` continues cutoff\'s animation.',
    notes: [
      'Returns true if it was paused; false otherwise.',
    ],
    params: [{ name: 'path', type: 'path', required: true, summary: 'The value.' }],
    scopes: 'any',
  },
  {
    id: 'animateReverse', category: 'Animation', signature: 'animateReverse(path)',
    summary: 'Turn a running animation around, back to its start at the same speed.',
    example: '`animateReverse("cutoff")` sends cutoff\'s animation back to where it started.',
    notes: [
      'Returns true if it was running; false otherwise.',
      'An envelope plays its shape backwards; a paused animation turns around and stays paused.',
      'Arriving back at the start counts as completed: `done` is called with true.',
    ],
    params: [{ name: 'path', type: 'path', required: true, summary: 'The value.' }],
    scopes: 'any',
  },
  {
    id: 'animateFinish', category: 'Animation', signature: 'animateFinish(path)',
    summary: 'End an animation at its end value now.',
    example: '`animateFinish("cutoff")` sets cutoff to the end value of its animation.',
    notes: [
      'Returns true if it was running; false otherwise.',
      'The value is set to the end of the current run (its start, on a reversed run); an envelope to the end of its shape. `done` is called with true.',
      'To stop where it is instead: `ce.anim.stop()`.',
    ],
    params: [{ name: 'path', type: 'path', required: true, summary: 'The value.' }],
    scopes: 'any',
  },
  /* ce.anim's other verbs move a VALUE along a curve. This one plays an animation a control already
     has — a keyframe animation built in the Animation tab: a pulse, a flash — the way its own trigger
     would. It is drawn, not computed, so it is panel view only: with the window shut there is
     nothing to play it on, and the C++ preludes carry a no-op stub for it like every visual verb. */
  {
    id: 'animatePlay', category: 'Animation', signature: 'animatePlay(control, animation)',
    summary: 'Play one of a control\'s keyframe animations from its first frame.',
    example: '`animatePlay("Lamp", "flash")` plays Lamp\'s flash animation.',
    notes: [
      'Returns true if the control has a keyframe animation of that name. Already playing: restarts.',
      'A transition cannot be played this way: rejected with a console error listing the keyframe animations.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, kind: 'control', summary: 'The control\'s name.' },
      { name: 'animation', type: 'string', required: true, kind: 'animation', summary: 'The animation\'s name, as in the Animation tab. Not case-sensitive.' },
    ],
    scopes: 'any',
  },

  /* --- User feedback (design doc §6 phase 6, §18) ---
     Panel view only: there is nobody to tell with the window shut. `notify` and `status` are
     fire-and-forget; `dialog` asks a question, and the answer arrives through a CALLBACK rather
     than a return value, because an answer necessarily arrives later than the call. */
  {
    id: 'uiNotify', category: 'User feedback', signature: 'uiNotify(message [, opts])',
    summary: 'Show a short message to the person using the panel.',
    example: '`uiNotify("Patch saved")` shows Patch saved for three seconds.',
    notes: [
      'Returns its id, for `ce.ui.update()` and `ce.ui.dismiss()`.',
      'For what the player should know; `log()` is for you.',
      'A click on it removes it.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'message', type: 'string', required: true, summary: 'The text.\nA number: written as text.\nLeft out, or "": nothing is shown, with a console error.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
        'uiKind',
        { name: 'duration', type: 'number', default: '3000', unit: 'milliseconds', min: null,
          summary: 'How long the message stays up. 0 or less keeps it visible until something '
            + 'dismisses it.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.ui.notify("${1:Patch loaded}")$0', javascript: 'ce.ui.notify("${1:Patch loaded}");$0' },
  },
  {
    id: 'uiStatus', category: 'User feedback', signature: 'uiStatus([message] [, opts])',
    refusal: 'false',
    summary: 'Show a line of text in the status bar, until it is replaced.',
    example: '`uiStatus("Recording", { kind = "warn" })` shows Recording in the status bar.',
    notes: [
      'For a state that lasts, such as "Synced"; `ce.ui.notify()` is for an event.',
      '`ce.ui.state()` reads it back.',
      'Returns true.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'message', type: 'string', required: false, summary: 'The text.\nLeft out, or "": the status bar is cleared.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['uiKind']) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.ui.status("${1:Recording}")$0', javascript: 'ce.ui.status("${1:Recording}");$0' },
  },
  {
    id: 'uiDialog', category: 'User feedback', signature: 'uiDialog(opts [, onChoice]) -> boolean',
    refusal: 'unanswered',
    summary: 'Ask a question with buttons.',
    example: '`uiDialog({ title = "Overwrite the patch?", buttons = { "Cancel", "Overwrite" } }, fn)` asks, and calls fn with the button clicked.',
    notes: [
      'One dialog at a time.',
      'Returns true if it appeared. Another dialog open: false, and `onChoice` called with nothing; `ce.ui.state()` says so.',
      'No title and no message: false, with a console error, and `onChoice` called with nothing.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
        'uiTitle', 'uiMessage',
        { name: 'buttons', type: 'list of text', default: 'one button labelled "OK"',
          summary: 'The button labels, left to right. Whichever is clicked is what `onChoice` is '
            + 'given.' },
        'uiKind',
        { name: 'default', type: 'text', default: 'the first button', sample: '"Cancel"',
          summary: 'The label of the button focused when the dialog opens.' },
      ]) },
      { name: 'onChoice', type: 'function', required: false, summary: 'Called later with the label of the button clicked; nothing when it was closed without one.' },
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
    refusal: 'unanswered',
    summary: 'Ask for a line of text.',
    example: '`uiPrompt({ title = "Name this patch", value = "Init" }, fn)` asks, and calls fn with what was typed.',
    notes: [
      'Enter accepts.',
      'Returns true if it appeared. Another dialog open: false, and `onAnswer` called with nothing.',
      'No title and no message: false, with a console error, and `onAnswer` called with nothing.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.',
        fields: optionFields([
          'uiTitle', 'uiMessage',
          { name: 'value', type: 'text', default: 'empty', sample: 'get("patchName")',
            summary: 'What the text field starts out holding.' },
          { name: 'placeholder', type: 'text', sample: '"Patch name"',
            summary: 'Grey hint text shown while the field is empty.' },
          'uiAccept', 'uiCancel', 'uiKind',
          // Read by the dialog store for every shape, and listed so the check of option keys
          // (panelRuntime.js) does not refuse a key that works.
          { name: 'default', type: 'text', default: 'the accept label', sample: '"Cancel"',
            summary: 'Which of the two buttons is drawn as the default one: the accept label or the '
              + 'cancel label. Pressing Enter in the field accepts either way.' },
        ]) },
      { name: 'onAnswer', type: 'function', required: false, summary: 'Called later with the text typed; "" when an empty field was accepted; nothing when it was cancelled.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.prompt({ title = "${1:Name this patch}", value = get("patchName") }, function(name)\n  if name ~= nil then set("patchName", name) end\nend)$0',
      javascript: 'ce.ui.prompt({ title: "${1:Name this patch}", value: get("patchName") }, (name) => {\n  if (name !== undefined) set("patchName", name);\n});$0',
    },
  },
  {
    id: 'uiChoose', category: 'User feedback', signature: 'uiChoose(opts [, onAnswer]) -> boolean',
    refusal: 'unanswered',
    summary: 'Ask for a choice from a list.',
    example: '`uiChoose({ title = "Load which bank?", items = { "A", "B", "C" } }, fn)` asks, and calls fn with the bank chosen.',
    notes: [
      'A long list scrolls.',
      'Returns true if it appeared. Another dialog open: false, and `onAnswer` called with nothing.',
      'No title and no message, or no items: false, with a console error, and `onAnswer` called with nothing.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: true, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.',
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
      { name: 'onAnswer', type: 'function', required: false, summary: 'Called later with the item chosen; a list of them with `multiple`; nothing when it was cancelled.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.ui.choose({ title = "${1:Load which preset?}", items = names }, function(pick)\n  if pick ~= nil then $0 end\nend)',
      javascript: 'ce.ui.choose({ title: "${1:Load which preset?}", items: names }, (pick) => {\n  if (pick !== undefined) { $0 }\n});',
    },
  },
  {
    id: 'uiDismiss', category: 'User feedback', signature: 'uiDismiss([id]) -> number',
    summary: 'Remove a message `ce.ui.notify()` showed, or every one.',
    example: '`uiDismiss(id)` removes that message.',
    notes: [
      'Returns how many were removed.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'id', type: 'number', required: false, summary: 'The id `ce.ui.notify()` gave.\nLeft out: every message.\nNot a number: nothing is removed, with a console error.' }],
    scopes: 'any',
    snippet: { lua: 'ce.ui.dismiss(${1:id})$0', javascript: 'ce.ui.dismiss(${1:id});$0' },
  },
  {
    id: 'uiUpdate', category: 'User feedback', signature: 'uiUpdate(id, message [, opts]) -> boolean',
    summary: 'Change the text of a message that is showing.',
    example: '`uiUpdate(id, "Sending 3 of 8")` changes the message in place.',
    notes: [
      'For progress: show the first with `duration = 0`, so it stays, then change it as you go.',
      'Returns true; false once the message has gone, such as when it was clicked away, so you know to stop.',
      'No id, or no message: false, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'id', type: 'number', required: true, summary: 'The id `ce.ui.notify()` gave.' },
      { name: 'message', type: 'string', required: true, summary: 'The new text.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
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
    summary: 'Give what is on screen: the status bar, the messages and whether a dialog is open.',
    example: '`uiState().dialog` gives true while a dialog is open.',
    notes: [
      'Returns { status, statusKind, notifications, dialog }; each notification { id, message, kind, sticky }.',
      '`dialog` true: why `ce.ui.dialog()` gave false, rather than there being no panel window.',
    ],
    runtime: RUNTIME_WEBVIEW,
    scopes: 'any',
    snippet: { lua: 'if not ce.ui.state().dialog then $0 end', javascript: 'if (!ce.ui.state().dialog) { $0 }' },
  },
  {
    id: 'uiCopy', category: 'User feedback', signature: 'uiCopy(text) -> boolean',
    summary: 'Copy text to the clipboard.',
    example: '`uiCopy(encodeJson(allSettings()))` copies the panel\'s settings as JSON.',
    notes: [
      'Returns true when it was tried, not that it worked: the system may refuse a copy that does not follow a click, which the console says.',
      'Scripts cannot read the clipboard.',
      'No text: false, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'text', type: 'string', required: true, summary: 'The text.\nA number: written as text.' }],
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
    summary: 'Erase everything drawn on a control.',
    example: '`drawClear("Scope")` erases what is drawn on Scope.',
    notes: [
      'Drawing commands add to what is there, so this is usually the first line of onDraw.',
      'Returns true; unknown control, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false, kind: 'control', summary: 'The control\'s name.\nLeft out: the control the script is attached to.' }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.clear()$0', javascript: 'ce.draw.clear();$0' },
  },
  {
    id: 'drawFill', category: 'Drawing', signature: 'drawFill(colour)',
    summary: 'Set the fill colour for the shapes drawn after it.',
    example: '`drawFill("#5B9BD5")` fills the shapes drawn after it with that blue.',
    notes: [
      'Applies to everything drawn after it; each onDraw starts with no fill and no stroke.',
      'Returns no value.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'colour', type: 'string', required: false, kind: 'colour',
      summary: 'A colour (the table in the introduction), or a gradient from `ce.draw.gradient()`.\nLeft out, "" or "none": no fill.\nNot a colour: rejected with a console error; the fill stays as it was.' }],
    scopes: 'any',
    snippet: { lua: 'ce.draw.fill("${1:#5B9BD5}")$0', javascript: 'ce.draw.fill("${1:#5B9BD5}");$0' },
  },
  {
    id: 'drawStroke', category: 'Drawing', signature: 'drawStroke([colour] [, width] [, opts])',
    summary: 'Set the line colour and width for the shapes drawn after it.',
    example: '`drawStroke("#5B9BD5", 2)` outlines the shapes drawn after it in that blue, 2 pixels wide.',
    notes: [
      'Applies to everything drawn after it; each onDraw starts with no fill and no stroke.',
      'Returns no value.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'colour', type: 'value', required: false, kind: 'colour',
        summary: 'A colour (the table in the introduction), or a gradient from `ce.draw.gradient()`.\nLeft out, "" or "none": no outlines.\nNot a colour: rejected with a console error; the stroke stays as it was.' },
      { name: 'width', type: 'number', required: false, unit: 'pixels', summary: 'Line width in pixels.\nRange: > 0.\nDefault: 1.\n≤ 0, or invalid: 1.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: solid lines, butt ends, mitred corners.', fields: optionFields([
        { name: 'dash', type: 'list of numbers', default: 'a solid line', kind: 'dash',
          summary: 'On and off lengths in pixels, alternating.\nA length < 0, or invalid: 0.\nNot a list: solid line.' },
        { name: 'dashOffset', type: 'number', default: '0', unit: 'pixels',
          summary: 'Where the dash pattern starts.\nAdvanced on a timer: the dashes move.\nInvalid: 0.' },
        { name: 'cap', type: 'text', default: '"butt"', values: ['butt', 'round', 'square'],
          summary: 'Line ends: "butt", "round" or "square". Case-insensitive.\nInvalid: default.' },
        { name: 'join', type: 'text', default: '"miter"', values: ['miter', 'round', 'bevel'],
          summary: 'Corners: "miter", "round" or "bevel". Case-insensitive.\nInvalid: default.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.stroke("${1:#5B9BD5}", ${2:2})$0', javascript: 'ce.draw.stroke("${1:#5B9BD5}", ${2:2});$0' },
  },
  {
    id: 'drawRect', category: 'Drawing', signature: 'drawRect(x, y, w, h [, radius])',
    summary: 'Draw a rectangle.',
    example: '`drawRect(10, 10, 40, 20, 4)` draws a 40 × 20 rectangle at (10, 10) with rounded corners.',
    notes: [
      'Drawn with the fill and stroke in force.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true, kind: 'number', summary: 'Left edge, in pixels from the control\'s left.' }, { name: 'y', type: 'number', required: true, kind: 'number', summary: 'Top edge, in pixels from the control\'s top.' },
      { name: 'w', type: 'number', required: true, kind: 'number', summary: 'Width in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' }, { name: 'h', type: 'number', required: true, kind: 'number', summary: 'Height in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
      { name: 'radius', type: 'number', required: false, kind: 'number', summary: 'Corner radius in pixels.\nRange: ≥ 0.\nDefault: 0.\n< 0, or invalid: 0.' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.rect(${1:0}, ${2:0}, ${3:40}, ${4:20})$0', javascript: 'ce.draw.rect(${1:0}, ${2:0}, ${3:40}, ${4:20});$0' },
  },
  {
    id: 'drawCircle', category: 'Drawing', signature: 'drawCircle(cx, cy, r)',
    summary: 'Draw a circle.',
    example: '`drawCircle(50, 50, 20)` draws a circle of radius 20 centred on (50, 50).',
    notes: [
      'Drawn with the fill and stroke in force.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s left.' }, { name: 'cy', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s top.' },
      { name: 'r', type: 'number', required: true, kind: 'number', summary: 'Radius in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.circle(${1:20}, ${2:20}, ${3:8})$0', javascript: 'ce.draw.circle(${1:20}, ${2:20}, ${3:8});$0' },
  },
  {
    id: 'drawLine', category: 'Drawing', signature: 'drawLine(x1, y1, x2, y2)',
    summary: 'Draw a straight line.',
    example: '`drawLine(0, 0, 100, 50)` draws a line from (0, 0) to (100, 50).',
    notes: [
      'Drawn with the stroke in force; the fill does not apply.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x1', type: 'number', required: true, kind: 'number', summary: 'Start, in pixels from the control\'s left.' }, { name: 'y1', type: 'number', required: true, kind: 'number', summary: 'Start, in pixels from the control\'s top.' },
      { name: 'x2', type: 'number', required: true, kind: 'number', summary: 'End, in pixels from the control\'s left.' }, { name: 'y2', type: 'number', required: true, kind: 'number', summary: 'End, in pixels from the control\'s top.' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.line(${1:0}, ${2:0}, ${3:100}, ${4:0})$0', javascript: 'ce.draw.line(${1:0}, ${2:0}, ${3:100}, ${4:0});$0' },
  },
  {
    id: 'drawPath', category: 'Drawing', signature: 'drawPath(points [, closed])',
    summary: 'Draw a line through a series of points.',
    example: '`drawPath({0, 20, 10, 5, 20, 20})` draws a line through (0, 20), (10, 5) and (20, 20).',
    notes: [
      'Drawn with the stroke in force; closed, it is filled too.',
      'One flat list of coordinates, unlike `ce.draw.curve()` and `ce.draw.points()`, which take a list of points.',
      'Returns true; fewer than two points, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'array', required: true,
        summary: 'One flat list of coordinates: {x1, y1, x2, y2, …}.\nA pair that is not two numbers: left out.\nAn odd number of values: the last left out.\nFewer than two points left, or not a list: rejected with a console error.' },
      { name: 'closed', type: 'boolean', required: false, summary: 'Join the last point to the first.\nDefault: false.\nInvalid: false.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local pts = {}\nfor i = 0, 63 do\n  pts[#pts + 1] = i * (info.width / 63)\n  pts[#pts + 1] = info.height / 2\nend\nce.draw.path(pts)$0',
      javascript: 'const pts = [];\nfor (let i = 0; i < 64; i++) pts.push(i * (info.width / 63), info.height / 2);\nce.draw.path(pts);$0',
    },
  },
  {
    id: 'drawArc', category: 'Drawing', signature: 'drawArc(x, y, radius, from, to)',
    summary: 'Draw part of a circle.',
    example: '`drawArc(50, 50, 40, 0, 90)` draws a quarter circle of radius 40 centred on (50, 50), from twelve o\'clock clockwise to three o\'clock.',
    notes: [
      'Drawn with the stroke in force; with a fill, filled as a pie slice through the centre.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s left.' }, { name: 'y', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s top.' },
      { name: 'radius', type: 'number', required: true, kind: 'number', summary: 'Radius in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
      { name: 'from', type: 'number', required: true, unit: 'degrees', hint: '0 is twelve o\'clock, increasing clockwise', summary: 'Start angle in degrees.\n0: twelve o\'clock, increasing clockwise, as the Meter\'s arcStart.' },
      { name: 'to', type: 'number', required: true, unit: 'degrees', hint: '0 is twelve o\'clock, increasing clockwise', summary: 'End angle in degrees.\nAbove from: drawn clockwise; below from: anticlockwise.\n360 or more apart: a full circle.' },
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
    summary: 'Make a gradient to use as a fill or stroke colour.',
    example: '`drawGradient({"red", "blue"}, 90)` gives a gradient from red on the left to blue on the right.',
    notes: [
      'Returns a gradient for `ce.draw.fill()` or `ce.draw.stroke()`. Rejected: no result.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'stops', type: 'list', required: true, kind: 'gradient',
        summary: 'A list of colours (the table in the introduction), of { at, colour, opacity } tables, or a mix.\nat: position along the gradient. Range: 0 ↔ 1. Left out: spaced evenly.\nopacity: Range: 0 ↔ 1. Default: 1.\nFewer than two stops, not a list, a colour that is not one, or at or opacity outside its range: rejected with a console error.' },
      { name: 'angle', type: 'number', required: false, unit: 'degrees', hint: '0 points up and 90 right; left out, it is 180, top to bottom',
        summary: 'Direction in degrees.\n0: upwards; 90: to the right, as the Background section\'s gradients.\nDefault: 180 (top to bottom).\nInvalid: default.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))$0',
      javascript: 'ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));$0',
    },
  },
  {
    id: 'drawOpacity', category: 'Drawing', signature: 'drawOpacity([a])',
    summary: 'Set how solid the shapes drawn after it are.',
    example: '`drawOpacity(0.5)` draws the shapes after it half see-through.',
    notes: [
      'Applies to everything drawn after it, like the fill and stroke.',
      'One colour see-through instead: `ce.math.alpha()`.',
      'Returns no value.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'a', type: 'number', required: false, unit: '0 to 1',
      summary: 'Opacity.\nRange: 0 ↔ 1 (0: invisible; 1: solid).\nLeft out: solid, which switches it off.\nOutside the range, or invalid: rejected with a console error; the opacity stays as it was.' }],
    scopes: 'any',
  },
  {
    id: 'drawTransform', category: 'Drawing', signature: 'drawTransform([opts])',
    summary: 'Rotate, move or scale the shapes drawn after it.',
    example: '`drawTransform({rotate = 135, cx = 40, cy = 40})` turns the shapes after it 135° clockwise about (40, 40).',
    notes: [
      'Replaces the transform before it; left out, it clears it.',
      'Returns no value.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: no transform.', fields: optionFields([
      { name: 'rotate', type: 'number', default: '0', unit: 'degrees', hint: '0 is upright, increasing clockwise',
        summary: 'Rotation in degrees, clockwise.\nInvalid: default.' },
      { name: 'cx', type: 'number', default: 'the top-left corner', unit: 'pixels', sample: '40',
        summary: 'Centre of rotation, in pixels from the control\'s left.\nGiven without cy: the top-left corner.\nInvalid: 0.' },
      { name: 'cy', type: 'number', default: 'the top-left corner', unit: 'pixels', sample: '40',
        summary: 'Centre of rotation, in pixels from the control\'s top.\nGiven without cx: the top-left corner.\nInvalid: 0.' },
      { name: 'x', type: 'number', default: '0', unit: 'pixels', summary: 'Shift to the right, in pixels.\nInvalid: default.' },
      { name: 'y', type: 'number', default: '0', unit: 'pixels', summary: 'Shift down, in pixels.\nInvalid: default.' },
      { name: 'scale', type: 'number', default: '1',
        summary: 'Size factor.\n2: double; 0.5: half; negative: mirrored.\nInvalid: default.' },
    ]) }],
    scopes: 'any',
    snippet: {
      lua: 'ce.draw.transform({ rotate = ${1:135}, cx = w / 2, cy = h / 2 })$0',
      javascript: 'ce.draw.transform({ rotate: ${1:135}, cx: w / 2, cy: h / 2 });$0',
    },
  },
  {
    id: 'drawEllipse', category: 'Drawing', signature: 'drawEllipse(cx, cy, rx, ry)',
    summary: 'Draw an ellipse.',
    example: '`drawEllipse(50, 25, 40, 20)` draws an ellipse 80 wide and 40 tall centred on (50, 25).',
    notes: [
      'Drawn with the fill and stroke in force.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s left.' }, { name: 'cy', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s top.' },
      { name: 'rx', type: 'number', required: true, kind: 'number', summary: 'Horizontal radius in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' }, { name: 'ry', type: 'number', required: true, kind: 'number', summary: 'Vertical radius in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
    ],
    scopes: 'any',
  },
  {
    id: 'drawPixelText', category: 'Drawing', signature: 'drawPixelText(text, x, y [, scale])',
    summary: 'Write text in the built-in 5 × 7 LCD font.',
    example: '`drawPixelText("128", 4, 4, 2)` writes 128 at (4, 4), each font pixel 2 screen pixels.',
    notes: [
      'Drawn in the fill colour, or the stroke colour with no fill; each lit pixel a sharp square.',
      '(`x`, `y`) is the top-left corner of the text, unlike `ce.draw.text()`, where `y` is the baseline.',
      'A character the font has no glyph for: a gap, with a console warning the first time.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'text', type: 'string', required: true, summary: 'The text.\nA number: written as text.' },
      { name: 'x', type: 'number', required: true, summary: 'Left edge, in pixels from the control\'s left.' }, { name: 'y', type: 'number', required: true, summary: 'Top edge, in pixels from the control\'s top.' },
      { name: 'scale', type: 'number', required: false, summary: 'Screen pixels per font pixel.\nRange: ≥ 1, whole.\nDefault: 1.\nA fraction: rounded.\n< 1, or invalid: 1.' },
    ],
    scopes: 'any',
  },
  {
    id: 'drawMeasure', category: 'Drawing', signature: 'drawMeasure(text [, opts]) -> table',
    summary: 'Measure text before drawing it.',
    example: '`drawMeasure("Hello", {size = 14}).width` gives the width of Hello at size 14.',
    notes: [
      'Returns { width, height, exact }: pixels, and whether the width was measured (true) or estimated (false; the LCD font is always exact).',
      'Rejected: no result.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'text', type: 'string', required: true, summary: 'The text.\nA number: measured as text.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: size 12, sans-serif.', fields: optionFields([
        { name: 'size', type: 'number', default: '12', unit: 'pixels', sample: '14', summary: 'Text size in pixels.\nRange: > 0.\n≤ 0, or invalid: default.' },
        { name: 'family', type: 'text', sample: '"Inter Tight"', kind: 'font', summary: 'Font family.\nLeft out: sans-serif.' },
        { name: 'pixel', type: 'true or false', default: 'false',
          summary: 'Measure in the LCD font of `ce.draw.pixelText()` instead.\nInvalid: false.' },
        { name: 'scale', type: 'number', default: '1',
          summary: 'Screen pixels per font pixel, with pixel.\nRange: ≥ 1, whole.\nA fraction: rounded.\n< 1, or invalid: 1.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawBatch', category: 'Drawing', signature: 'drawBatch(fn) -> boolean',
    summary: 'Run a function and show everything it draws in one update.',
    example: '`drawBatch(function() for i = 0, 63 do ce.draw.line(i, 0, i, 20) end end)` draws 64 lines in one update.',
    notes: [
      'Several times faster for a loop of commands; `ce.draw.grid()`, `ce.draw.lines()` and `ce.draw.points()` are one command already.',
      'Returns true; not a function: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true, summary: 'The function to run.\nAn error in it: written to the console; what it drew before it stays.' }],
    scopes: 'any',
  },
  {
    id: 'drawGrid', category: 'Drawing', signature: 'drawGrid([opts]) -> boolean',
    summary: 'Draw a grid of lines in one command.',
    example: '`drawGrid({columns = 16, rows = 4})` draws 17 vertical and 5 horizontal lines over the control.',
    notes: [
      'Drawn with the stroke in force; the closing lines are drawn, so 4 columns are 5 lines.',
      'Returns true; neither a spacing nor a count, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'The options below: a box, and a spacing or a count.\nLeft out: rejected with a console error.',
      fields: optionFields([
        { name: 'x', type: 'number', default: '0', unit: 'pixels', sample: '4',
          summary: 'Left edge, in pixels from the control\'s left.\nInvalid: 0.' },
        { name: 'y', type: 'number', default: '0', unit: 'pixels', sample: '4',
          summary: 'Top edge, in pixels from the control\'s top.\nInvalid: 0.' },
        { name: 'width', type: 'number', default: 'to the control\'s right edge', unit: 'pixels', sample: '120',
          summary: 'Width in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
        { name: 'height', type: 'number', default: 'to the control\'s bottom edge', unit: 'pixels', sample: '60',
          summary: 'Height in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
        { name: 'step', type: 'number', unit: 'pixels', sample: '10',
          summary: 'Spacing both ways, in pixels.\nRange: > 0.\nGiven with columns or rows: ignored that way.\n≤ 0, or invalid: ignored.' },
        { name: 'stepX', type: 'number', unit: 'pixels', sample: '10',
          summary: 'Spacing across, in pixels.\nRange: > 0.\nGiven with columns: ignored.\n≤ 0, or invalid: ignored.' },
        { name: 'stepY', type: 'number', unit: 'pixels', sample: '20',
          summary: 'Spacing down, in pixels.\nRange: > 0.\nGiven with rows: ignored.\n≤ 0, or invalid: ignored.' },
        { name: 'columns', type: 'number', sample: '16',
          summary: 'Number of columns across the width.\nRange: ≥ 1, whole.\nA fraction: rounded.\n< 1, or invalid: ignored.' },
        { name: 'rows', type: 'number', sample: '4',
          summary: 'Number of rows down the height.\nRange: ≥ 1, whole.\nA fraction: rounded.\n< 1, or invalid: ignored.' },
      ]) }],
    scopes: 'any',
  },
  {
    id: 'drawLines', category: 'Drawing', signature: 'drawLines(segments) -> boolean',
    summary: 'Draw separate straight lines in one command.',
    example: '`drawLines({{0, 0, 10, 0}, {0, 5, 10, 5}})` draws two horizontal lines.',
    notes: [
      'Drawn with the stroke in force; the fill does not apply.',
      'One connected line through points: `ce.draw.path()`.',
      'Returns true; no segments, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'segments', type: 'list', required: true,
      summary: 'A list of segments, each {x1, y1, x2, y2} or {x1 = , y1 = , x2 = , y2 = }.\nAn item that is not a segment: left out.\nEmpty, or not a list: rejected with a console error.' }],
    scopes: 'any',
  },
  {
    id: 'drawPoints', category: 'Drawing', signature: 'drawPoints(points [, radius]) -> boolean',
    summary: 'Draw a set of dots in one command.',
    example: '`drawPoints({{10, 10}, {20, 14}}, 2)` draws two dots of radius 2.',
    notes: [
      'Drawn with the fill and stroke in force.',
      'Returns true; no points, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'list', required: true,
        summary: 'A list of points, each {x, y} or {x = , y = }.\nAn item that is not a point: left out.\nEmpty, or not a list: rejected with a console error.' },
      { name: 'radius', type: 'number', required: false, unit: 'pixels', summary: 'Radius of each dot, in pixels.\nRange: > 0.\nDefault: 1.5.\n≤ 0, or invalid: default.' },
    ],
    scopes: 'any',
  },
  {
    id: 'drawCurve', category: 'Drawing', signature: 'drawCurve(points [, opts]) -> boolean',
    summary: 'Draw a smooth curve through a list of points in one command.',
    example: '`drawCurve({{0, 30}, {30, 0}, {60, 30}}, {tension = 0.8})` draws a rounded curve through three points.',
    notes: [
      'Drawn with the stroke in force; closed, it is filled too.',
      'Returns true; fewer than two points, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'points', type: 'list', required: true,
        summary: 'A list of points, each {x, y} or {x = , y = }.\nAn item that is not a point: left out.\nFewer than two left, or not a list: rejected with a console error.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: tension 0.5, open.', fields: optionFields([
        { name: 'tension', type: 'number', default: '0.5', unit: '0 to 1',
          summary: 'Roundness.\nRange: 0 ↔ 1 (0: straight lines between the points; 1: fully rounded).\nOutside the range: the nearest end.\nInvalid: default.' },
        { name: 'closed', type: 'true or false', default: 'false',
          summary: 'Join the last point to the first.\nInvalid: false.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawPolygon', category: 'Drawing', signature: 'drawPolygon(cx, cy, radius, sides [, opts]) -> boolean',
    summary: 'Draw a regular polygon.',
    example: '`drawPolygon(50, 30, 20, 6)` draws a hexagon centred on (50, 30), its corners 20 pixels from the centre.',
    notes: [
      'Drawn with the fill and stroke in force.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'cx', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s left.' },
      { name: 'cy', type: 'number', required: true, kind: 'number', summary: 'Centre, in pixels from the control\'s top.' },
      { name: 'radius', type: 'number', required: true, kind: 'number', summary: 'Distance from the centre to each corner, in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
      { name: 'sides', type: 'number', required: true, summary: 'Number of sides.\nRange: ≥ 3, whole.\nA fraction: rounded.\n< 3, or invalid: 3.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: a corner at twelve o\'clock.', fields: optionFields([
        { name: 'rotation', type: 'number', default: '0', unit: 'degrees', hint: '0 puts a corner at twelve o\'clock, increasing clockwise',
          summary: 'Rotation in degrees, clockwise.\n0: a corner at twelve o\'clock, as `ce.draw.arc()` measures its angles.\nInvalid: default.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawImage', category: 'Drawing', signature: 'drawImage(src, x, y, w, h [, opts]) -> boolean',
    summary: 'Draw an image in a box.',
    example: '`drawImage(ce.image.asset("logo").dataUrl, 0, 0, 64, 64, {fit = "contain"})` draws the library icon logo in a 64 × 64 box, keeping its shape.',
    notes: [
      'Returns true; a source that is not image data, or no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'src', type: 'string', required: true, kind: 'image',
        summary: 'The image data: a data URL, or the dataUrl of `ce.image.asset()`.\nAn icon\'s name: rejected with a console error, which names the call to use.' },
      { name: 'x', type: 'number', required: true, kind: 'number', summary: 'Left edge, in pixels from the control\'s left.' },
      { name: 'y', type: 'number', required: true, kind: 'number', summary: 'Top edge, in pixels from the control\'s top.' },
      { name: 'w', type: 'number', required: true, kind: 'number', summary: 'Width in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
      { name: 'h', type: 'number', required: true, kind: 'number', summary: 'Height in pixels.\nRange: ≥ 0.\n< 0, or invalid: 0.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: fit "fill".', fields: optionFields([
        { name: 'fit', type: 'text', default: '"fill"', values: ['fill', 'contain', 'cover'],
          summary: 'How the image fills the box: "fill" (stretched), "contain" (its shape kept, with gaps) or "cover" (its shape kept, cropped). Case-insensitive.\nInvalid: default.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'drawClip', category: 'Drawing', signature: 'drawClip([x, y, w, h]) -> boolean',
    summary: 'Limit the shapes drawn after it to a rectangle.',
    example: '`drawClip(0, 0, 60, 20)` shows only what the shapes after it draw inside the top-left 60 × 20.',
    notes: [
      'Applies to everything drawn after it, like the fill and stroke; `ce.draw.save()` and `ce.draw.restore()` include it.',
      'All four left out: no clip.',
      'Drawing never goes outside the control: a clip only makes the area smaller.',
      'Returns true; some of the four left out: rejected with a console error; the clip stays as it was.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: false, summary: 'Left edge, in pixels from the control\'s left.\nInvalid: 0.' },
      { name: 'y', type: 'number', required: false, summary: 'Top edge, in pixels from the control\'s top.\nInvalid: 0.' },
      { name: 'w', type: 'number', required: false, summary: 'Width in pixels.\nRange: > 0.\n≤ 0, or invalid: 0, which hides everything drawn after it.' },
      { name: 'h', type: 'number', required: false, summary: 'Height in pixels.\nRange: > 0.\n≤ 0, or invalid: 0, which hides everything drawn after it.' },
    ],
    scopes: 'any',
  },
  {
    id: 'drawBlend', category: 'Drawing', signature: 'drawBlend(mode) -> boolean',
    summary: 'Set how the shapes drawn after it mix with what is under them.',
    example: '`drawBlend("multiply")` darkens what is under the shapes drawn after it.',
    notes: [
      'Applies to everything drawn after it, like the fill and stroke; "normal" switches it off.',
      'Returns true; not a mode: rejected with a console error; the blend stays as it was.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'mode', type: 'string', required: true,
      values: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
        'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'],
      summary: 'One of "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". Case-insensitive.\nInvalid: rejected with a console error.' }],
    scopes: 'any',
  },
  {
    id: 'drawSave', category: 'Drawing', signature: 'drawSave() -> boolean',
    summary: 'Remember the drawing style, for `ce.draw.restore()`.',
    example: '`drawSave()` remembers the style; `drawRestore()` brings it back.',
    notes: [
      'The style: fill, stroke, width, dash, cap, join, opacity, transform, clip and blend.',
      'Saved styles are forgotten at the start of each onDraw.',
      'Returns true.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'drawRestore', category: 'Drawing', signature: 'drawRestore() -> boolean',
    summary: 'Bring back the style remembered by the last `ce.draw.save()`.',
    example: '`drawRestore()` brings back the style `drawSave()` remembered.',
    notes: [
      'Returns true; nothing saved: rejected with a console error; the style stays as it was.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'imageAssets', category: 'Images', signature: 'imageAssets([opts]) -> list',
    summary: 'List the images a control can show: the icon library\'s, then the panel\'s own.',
    example: '`imageAssets({ vector = true })` gives the vector icons.',
    notes: [
      'Returns a list of { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }.',
      '`source` "panel": carried with the panel. `portable`: in the panel already; true for those, false for the library\'s.',
      'A library icon is copied into the panel on sharing or export when a control shows it or a script names it in quotes; not one whose name a script builds as it runs.',
      '`embeddable`: it has image data that `ce.image.embed()` can copy into the panel.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
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
    summary: 'Find one image by its id or name.',
    example: '`imageAsset("Logo")` gives the image called Logo.',
    notes: [
      'Returns the entry, as `ce.image.assets()` gives each.',
      'By id first, then by name, as the panel finds an icon to draw.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'idOrName', type: 'string', required: true, summary: 'The image\'s id or name; a name in any case.\nNot an image: no result, without a word.\nLeft out: no result, with a console error.', kind: 'image' }],
    scopes: 'any',
  },
  {
    id: 'imageSet', category: 'Images', signature: 'imageSet(target, src [, opts]) -> boolean',
    summary: 'Put a picture on one of a control\'s image layers, and switch the layer on.',
    example: '`imageSet("Pad", "textures/metal.png", { opacity = 60 })` shows the picture behind Pad at 60%.',
    notes: [
      'The picture and the switch are set together: a layer is never on with nothing in it.',
      'A text layer replaces the text\'s fill.',
      'Returns true. An option the layer does not have: refused, with a console error, and false.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'src', type: 'string', required: true, summary: 'The picture: a file\'s path or address, or a data URL ("data:image/png;base64,…").\nOnly a data URL survives an export; `ce.image.embed()` copies a file in.\nLeft out: the picture is kept; only the options are set.\n"": the layer is emptied and switched off.\nLeft out, with no option: nothing is set, with a console error.', kind: 'image' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.',
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
            summary: 'How solid the layer is, on the panel\'s own 0 to 100 scale — not 0 to 1. A value above 0 and up to 1 is applied as written, which is almost invisible, and writes a warning.' },
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
    summary: 'Switch an image layer off and empty it.',
    example: '`imageClear("Pad", "overlay")` takes the overlay away.',
    notes: [
      'A text layer sets the text\'s fill back to "solid": a text fill with no picture shows nothing.',
      'Returns true; false with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'layer', type: 'string', required: false, summary: '"image" or "overlay": the background layers, which stack.\n"textImage" or "textTexture": the text\'s fill.\nCase-insensitive.\nLeft out: "image".\nAny other: rejected with a console error.',
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageRead', category: 'Images', signature: 'imageRead(target [, layer]) -> table',
    summary: 'Read every setting of one image layer.',
    example: '`imageRead("Pad").source` gives "data", "file" or "none".',
    notes: [
      'Returns the layer\'s settings, with three more:',
      '`active`: whether it is drawn; a text layer\'s by the text\'s fill, not its switch.',
      '`source`: "data", "file" or "none".',
      '`portable`: whether it survives an export; only embedded data does.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'layer', type: 'string', required: false, summary: '"image" or "overlay": the background layers, which stack.\n"textImage" or "textTexture": the text\'s fill.\nCase-insensitive.\nLeft out: "image".\nAny other: rejected with a console error.',
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageIcon', category: 'Images', signature: 'imageIcon(target, idOrName [, opts]) -> boolean',
    summary: 'Show an image in a control\'s Icon section, by its id or name.',
    example: '`imageIcon("Play", "play-circle", { size = 24 })` shows the play-circle icon on Play.',
    notes: [
      'A control showing only its text is switched to show the icon beside it, or alone with no text.',
      'Write the id or name in quotes: sharing and exporting find the icon that way, and copy it into the panel.',
      'Use it rather than `set()`: it writes the asset\'s id and name together.',
      'Returns true; false with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'idOrName', type: 'string', required: true, summary: 'The image\'s id or name; a name in any case.\nNot an image: rejected with a console error.', kind: 'image' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.',
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
    summary: 'Copy a layer\'s picture into the panel, so it survives an export.',
    example: '`imageEmbed("Pad")` copies Pad\'s background picture into the panel.',
    notes: [
      'Returns true; the picture already in the panel: true, changing nothing.',
      'A file not read yet: false, and its reading starts; call it again once it has loaded.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'layer', type: 'string', required: false, summary: '"image" or "overlay": the background layers, which stack.\n"textImage" or "textTexture": the text\'s fill.\nCase-insensitive.\nLeft out: "image".\nAny other: rejected with a console error.',
        values: ['image', 'overlay', 'textImage', 'textTexture'] },
    ],
    scopes: 'any',
  },
  {
    id: 'imageLoad', category: 'Images', signature: 'imageLoad(path) -> boolean',
    summary: 'Start reading an image file, and say whether it is ready.',
    example: '`imageLoad("textures/metal.png")` gives false at first, then true once the file is read.',
    notes: [
      'A layer that points at a file shows nothing until it is read, which happens in the background.',
      'Returns true when it is ready; a data URL at once.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'path', type: 'string', required: true, summary: 'The file\'s path, or a data URL.\nLeft out, or "": false, with a console error.' }],
    scopes: 'any',
  },
  {
    id: 'textFonts', category: 'Typography', signature: 'textFonts([opts]) -> list',
    summary: 'List every font the panel can use, and what each supports.',
    example: '`textFonts({ variable = true })` gives the variable fonts.',
    notes: [
      'Returns a list: the built-in fonts, the font library\'s, and the panel\'s own, `source` "panel".',
      '`portable`: there wherever the panel goes; true for the built-in fonts and the panel\'s own, false for the library\'s.',
      'A library font is copied into the panel on sharing or export when a control uses it or a script names it in quotes.',
      '`featuresKnown` false: an empty `features` list means they are not known, not that there are none.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
      { name: 'portable', type: 'true or false',
        summary: 'Set true to list only fonts that are already there wherever the panel goes: the '
          + 'built-in fonts and the ones the panel carries. A font from your font library is packed '
          + 'in when you share or export the panel, if a control uses it or a script names it in quotes.' },
      { name: 'variable', type: 'true or false',
        summary: 'Set true to list only variable fonts, the ones with adjustable axes such as '
          + 'weight and width.' },
    ]) }],
    scopes: 'any',
  },
  {
    id: 'textFont', category: 'Typography', signature: 'textFont(family) -> table|nil',
    summary: 'Find one font by its family name.',
    example: '`textFont("Inter").variable` gives true for a variable Inter.',
    notes: [
      'Returns its description, as `ce.text.fonts()` gives each.',
      'Use it to see that a font is there before setting it, or which axes it has.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'family', type: 'string', required: true, summary: 'The family, or its display name, as the Properties panel shows it, in any case.\nNot a font the panel has: no result, without a word.\nLeft out: no result, with a console error.', kind: 'font' }],
    scopes: 'any',
  },
  {
    id: 'textStyle', category: 'Typography', signature: 'textStyle(target, opts) -> boolean',
    summary: 'Set a control\'s typography in one call: font, size, weight, spacing, alignment and the rest.',
    example: '`textStyle("Title", { family = "Inter", size = 18, weight = "Bold" })` sets Title in 18-point Inter Bold.',
    notes: [
      'Use it rather than `set()` for the weight: it is two fields that must agree, and this writes both.',
      'Name the font in quotes: sharing and exporting find a library font that way, and copy it into the panel.',
      'Returns true. A font the panel has not, or a feature the font has not: refused, with a console error, the other options set, and false.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'opts', type: 'object', required: true, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.',
        // The declared list used to name 17 fields while the implementation accepted 27: the four
        // paddings and five of the six OpenType switches were missing, so the only way to learn
        // that `tabularFigures` was allowed was to read textStyle.js. The feature switches come
        // from FEATURE_KEYS and the three word-lists from their own tables, so this cannot
        // fall behind again.
        fields: optionFields([
          { name: 'family', type: 'text', sample: '"Inter Tight"', kind: 'font',
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
    summary: 'Set one axis of a variable font, by its four-letter tag.',
    example: '`textAxis("Title", "wght", 650)` sets Title\'s weight axis to 650.',
    notes: [
      '"wght" sets the control\'s weight too, as the Properties panel\'s slider does.',
      'Returns true; false with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'tag', type: 'string', required: true, summary: 'The axis\'s tag, such as "wght" or "wdth".\nNot one the font has: rejected with a console error.', kind: 'fontAxis' },
      { name: 'value', type: 'number', required: true, summary: 'The axis\'s value.\nOutside the font\'s range: the nearest end.', kind: 'fontAxis' },
    ],
    scopes: 'any',
  },
  {
    id: 'textRead', category: 'Typography', signature: 'textRead(target [, name]) -> value|table',
    summary: 'Read one text setting by name, or every one.',
    example: '`textRead("Title", "size")` gives Title\'s text size.',
    notes: [
      'Returns the value; left out, { content, resolvedWeight, font, multiline, position }.',
      '`resolvedWeight`: the weight the text is drawn at, from its two weight fields.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'name', type: 'string', required: false, summary: 'A setting\'s name, such as "size" or "lineHeight", wherever in the Text section it is.\nLeft out: every setting, as a table.\nNot a setting: no result, with a console error.' },
    ],
    scopes: 'any',
  },
  {
    id: 'textMeasure', category: 'Typography', signature: 'textMeasure(target [, text]) -> table',
    summary: 'Measure how much room a control\'s text takes, in its own font.',
    example: '`textMeasure("Title").truncated` gives true when some of the text is cut off.',
    notes: [
      'Returns { width, height, lines, truncated, exact }.',
      'Laid out as the panel lays it out: spacing, wrapping and the line limit count.',
      '`exact` false: it could not be measured, and the answer is an estimate.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'text', type: 'string', required: false, summary: 'Text to measure in the control\'s font.\nLeft out: the control\'s own.' },
    ],
    scopes: 'any',
  },
  {
    id: 'textFit', category: 'Typography', signature: 'textFit(target [, opts]) -> table',
    summary: 'Find the largest text size at which a control\'s text fits, and set it.',
    example: '`textFit("Title", { min = 8 })` makes Title\'s text as large as fits, and 8 at least.',
    notes: [
      'Returns { size, fits, changed, exact }.',
      'Tries whole sizes from `max` down to `min`. Even `min` too large: set to `min`, `fits` false.',
      'Unlike Text.Multiline.fitMode "shrink", which only draws the text smaller, this writes the size.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'target', type: 'string', required: true, summary: 'The control\'s name.\nNot a control on the panel: rejected with a console error.', kind: 'control' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
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
  // patch
  // A synth's sound as a value (docs/design/ce-patch-module.md). Everything that is the same in
  // every runtime is patchCore.js; the runtimes read and send around it.
  {
    id: 'patchCurrent', category: 'Patches', signature: 'patchCurrent([scope [, opts]]) -> patch', refusal: 'nothing',
    summary: 'Capture the patch as the panel knows it now: the values the synth last reported, or the controls hold.',
    example: '`local before = ce.patch.current()` keeps the voice as it is now.',
    notes: [
      'A patch is a table: { device, role, scope, name, values, missing, source }. `values` is parameter id to value, in the parameter\'s own units; a choice is its id, such as "saw".',
      'Asks the synth nothing. A parameter the synth never reported is listed in `missing`.',
      'A panel without a device profile still works: `values` is then keyed by control name.',
    ],
    params: [
      { name: 'scope', type: 'text', required: false, summary: 'The part of the synth: "voice" when left out, or a scope ce.patch.scopes() lists.\nNot one: no result, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole', 'patchScope']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchRead', category: 'Patches', signature: 'patchRead(scope, fn [, opts]) -> boolean', refusal: 'false',
    summary: 'Ask the synth for a patch, and get it when the reply arrives: fn(patch, info).',
    example: '`ce.patch.read("voice", function(p, info) if info.ok then state.original = p end end)` asks the synth for the voice it is playing.',
    notes: [
      'Asks for the scope\'s dumps, one after another, with ce.device.requestDump(); the panel\'s controls are filled from each reply, as a dump always fills them.',
      '`info.ok` is false when a reply did not arrive in time; the patch is then what the panel knows. `info.missing` lists the ids no reply held.',
      'A scope with no dumps to ask for (the profile\'s patch section, or define(), names them): false, with a console error.',
    ],
    params: [
      { name: 'scope', type: 'text', required: true, summary: 'The part of the synth.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called as fn(patch, info) when the reply arrives, or when it does not.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'timeout', type: 'number', unit: 'milliseconds', default: 'as long as the profile asks', summary: 'How long to wait for each dump.' },
        'patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchLoad', category: 'Patches', signature: 'patchLoad(name [, opts]) -> patch', refusal: 'nothing',
    summary: 'Get a patch kept with ce.patch.save(), by its name.',
    example: '`ce.patch.apply(ce.patch.load("Warm pad"))` plays the patch kept as "Warm pad".',
    notes: [
      'Loading sends nothing: pass the result to apply() to hear it.',
      'No patch by that name, or one kept for another synth: no result, with a console error naming it.',
    ],
    params: [
      { name: 'name', type: 'text', required: true, summary: 'The name it was kept under, in any case.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchMorph', category: 'Patches', signature: 'patchMorph(a, b, t [, opts]) -> patch', refusal: 'nothing',
    summary: 'A patch part of the way from one patch to another.',
    example: '`ce.patch.morph(warm, bright, 0.25)` gives a patch a quarter of the way from warm to bright.',
    notes: [
      'A number moves in a straight line from a to b, then is rounded to its step and held inside its range. A choice or an on/off is a\'s below `switchAt` and b\'s from it. The patch name stays a\'s.',
      'A parameter only one of the two patches holds keeps that patch\'s value.',
      'To morph from a knob, call it in the knob\'s onValueChange and pass the result to apply(p, { live = true }).',
      'b of another synth or scope: no result, with a console error.',
    ],
    params: [
      { name: 'a', type: 'table', required: true, summary: 'The patch at 0.' },
      { name: 'b', type: 'table', required: true, summary: 'The patch at 1.' },
      { name: 't', type: 'number', required: true, summary: 'Range: 0 to 1 (a to b).\nOutside the range: held at 0 or 1.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole',
        { name: 'switchAt', type: 'number', default: '0.5', summary: 'Where a choice or an on/off changes from a\'s value to b\'s, 0 to 1.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchBlend', category: 'Patches', signature: 'patchBlend(patches, weights [, opts]) -> patch', refusal: 'nothing',
    summary: 'One patch made of several, each counting as much as its weight.',
    example: '`ce.patch.blend({ a, b, c }, { 0.5, 0.3, 0.2 })` leans mostly towards a.',
    notes: [
      'The weights need not add up to 1; a patch without a weight counts 0. Adding up to 0 or less: no result, with a console error.',
      'A choice or an on/off takes the value of the patch with the largest weight.',
      'The weights from ce.math.weightsFor() go straight in, for a morph pad.',
    ],
    params: [
      { name: 'patches', type: 'list', required: true, summary: 'Two or more patches of the same synth and scope.' },
      { name: 'weights', type: 'list of numbers', required: true, summary: 'How much each counts.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchRandom', category: 'Patches', signature: 'patchRandom([opts]) -> patch', refusal: 'nothing',
    summary: 'A new patch with random values, within each parameter\'s range.',
    example: '`ce.patch.random({ groups = {"Filter"}, seed = 7 })` gives the current patch with a new filter section.',
    notes: [
      'What is not chosen keeps its value from `from`. The patch name never changes.',
      'The same `seed` gives the same patch, in every language.',
      'A panel without a device profile does not say each control\'s range: no result, with a console error.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole', 'patchScope', 'patchSeed',
        { name: 'from', type: 'table', default: 'ce.patch.current()', summary: 'The patch whose unchosen values are kept.' },
        { name: 'within', type: 'table', default: 'each parameter\'s whole range', sample: '{ cutoff = { 40, 100 } }', summary: 'Narrower ranges by id; outside the parameter\'s range they are held inside it.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchMutate', category: 'Patches', signature: 'patchMutate(patch, amount [, opts]) -> patch', refusal: 'nothing',
    summary: 'A variation of a patch: every chosen value moved a little, at random.',
    example: '`ce.patch.mutate(p, 0.1)` moves each number by up to a tenth of its range.',
    notes: [
      'Numbers move by up to `amount` of their range, more often a little than a lot.',
      'A choice or an on/off changes with a chance of `amount`, to another of its values. Text never changes.',
    ],
    params: [
      { name: 'patch', type: 'table', required: true, summary: 'The patch to vary.' },
      { name: 'amount', type: 'number', required: true, summary: 'Range: 0 to 1 (no change to any value).\nOutside the range: held at 0 or 1.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole', 'patchSeed']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchMerge', category: 'Patches', signature: 'patchMerge(base, other, opts) -> patch', refusal: 'nothing',
    summary: 'A patch with the chosen parameters taken from another patch.',
    example: '`ce.patch.merge(mine, theirs, { groups = {"Filter"} })` keeps mine with the filter from theirs.',
    notes: ['One of `groups` or `only` is needed: taking every value is `other` itself. Neither: no result, with a console error.'],
    params: [
      { name: 'base', type: 'table', required: true, summary: 'The patch that gives everything not chosen.' },
      { name: 'other', type: 'table', required: true, summary: 'The patch that gives the chosen parameters.' },
      { name: 'opts', type: 'object', required: true, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchDiff', category: 'Patches', signature: 'patchDiff(a, b [, opts]) -> list', refusal: 'nothing',
    summary: 'List the parameters whose values differ between two patches: { id, name, group, from, to }.',
    example: '`ce.patch.diff(saved, ce.patch.current())` lists what has changed since the patch was saved.',
    notes: [
      'In the profile\'s parameter order; the same patches give an empty list.',
      'A parameter only one patch holds is listed, with no value on the other side.',
      'Two numbers closer than the parameter\'s step count as the same, and so do two names that differ only in trailing spaces.',
    ],
    params: [
      { name: 'a', type: 'table', required: true, summary: 'The first patch.' },
      { name: 'b', type: 'table', required: true, summary: 'The second patch.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchEqual', category: 'Patches', signature: 'patchEqual(a, b [, opts]) -> boolean', refusal: 'nothing',
    summary: 'Tell whether two patches hold the same values.',
    example: '`if not ce.patch.equal(state.saved, ce.patch.current()) then ... end` runs when the patch has been changed.',
    notes: ['The same as an empty ce.patch.diff(a, b, opts).'],
    params: [
      { name: 'a', type: 'table', required: true, summary: 'The first patch.' },
      { name: 'b', type: 'table', required: true, summary: 'The second patch.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchApply', category: 'Patches', signature: 'patchApply(patch [, opts]) -> table', refusal: 'result',
    summary: 'Put a patch on the panel and send it to the synth, the way this synth takes a patch.',
    example: '`ce.patch.apply(p)` makes the panel and the synth play p.',
    notes: [
      'The panel\'s controls always take the values, whatever `send` says.',
      'Returns { ok, via, applied, sent, skipped }: `via` is "parameters", "dump" or "none"; `skipped` lists { id, why }. Refused: ok false, with a console error.',
      '"auto" sends the scope\'s dumps when the profile\'s patch section says `deliver = "dump"`, and one message per changed parameter otherwise.',
      'A patch of another synth: refused, naming it.',
    ],
    params: [
      { name: 'patch', type: 'table', required: true, summary: 'The patch to apply.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchGroups', 'patchOnly', 'patchExcept', 'patchLock', 'patchInclude', 'patchRole',
        { name: 'send', type: 'text', default: '"auto"', values: ['auto', 'parameters', 'dump', 'none'], summary: 'How it goes to the synth: "none" sets the panel only.' },
        { name: 'changedOnly', type: 'true or false', default: 'true', summary: 'Send only values that differ from what the synth last had.' },
        { name: 'live', type: 'true or false', default: 'false', summary: 'For a value moving under a hand: the 32 parameters that moved most now, the rest with the next apply without live.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchSave', category: 'Patches', signature: 'patchSave(name, patch [, opts]) -> boolean', refusal: 'false',
    summary: 'Keep a patch by name, for this synth.',
    example: '`ce.patch.save("Warm pad", p)` keeps p as "Warm pad".',
    notes: [
      'Kept with the panel, as ce.storage.saveSetting() keeps a value: in the editor with the panel document, in an exported plug-in in the DAW project.',
      'A name of 1 to 64 characters; anything else: false, with a console error.',
    ],
    params: [
      { name: 'name', type: 'text', required: true, summary: 'Up to 64 characters.' },
      { name: 'patch', type: 'table', required: true, summary: 'The patch.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'replace', type: 'true or false', default: 'true', summary: 'Off: a name already in use is refused, with a console error.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchList', category: 'Patches', signature: 'patchList([opts]) -> list', refusal: 'empty list',
    summary: 'List the patches kept for this synth: { name, scope, savedAt }, newest first.',
    example: '`ce.patch.list()` gives every kept patch\'s name.',
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchRole',
        { name: 'scope', type: 'text', default: 'every scope', summary: 'Only the patches of this scope.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchForget', category: 'Patches', signature: 'patchForget(name [, opts]) -> boolean', refusal: 'false',
    summary: 'Remove a kept patch.',
    example: '`ce.patch.forget("Warm pad")` removes it.',
    notes: ['Returns true when one was removed; no patch by that name: false, without a word.'],
    params: [
      { name: 'name', type: 'text', required: true, summary: 'Its name, in any case.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchWrite', category: 'Patches', signature: 'patchWrite(patch, slot [, opts]) -> table', refusal: 'result',
    summary: 'Store a patch in the synth\'s own memory, in a writable slot.',
    example: '`ce.patch.write(p, 130)` stores p in preset 130.',
    notes: [
      'Overwrites what the slot held. The synth does not ask, so ask first with ce.ui.choose().',
      'How it is stored is the profile\'s patch section: `write = { via = "dump", dump = "..." }` sets the "slot" variable and sends that dump. A profile that does not say: refused, with a console error.',
      'Returns { ok, slot, error }.',
    ],
    params: [
      { name: 'patch', type: 'table', required: true, summary: 'The patch.' },
      { name: 'slot', type: 'number', required: true, summary: 'The preset number across all banks, counted from 0, as ce.device.recallPreset() takes it.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['patchRole']) },
    ],
    scopes: 'any',
  },
  {
    id: 'patchScopes', category: 'Patches', signature: 'patchScopes([role]) -> list', refusal: 'empty list',
    summary: 'Describe the parts of the synth a patch can hold: { id, name, parameters, canRead, canSend, via }.',
    example: '`ce.patch.scopes()` might give a voice and a system scope.',
    notes: [
      'Without a patch section in the profile: "voice" is every parameter but actions and the System, Global, Utility and Performance groups, and "system" those groups.',
      'A panel without a device profile: one scope, "voice", holding the panel\'s controls.',
    ],
    params: [{ name: 'role', type: 'string', required: false, kind: 'deviceRole', summary: 'The device; left out: "mainSynth".' }],
    scopes: 'any',
  },
  {
    id: 'patchDefine', category: 'Patches', signature: 'patchDefine(scope, spec [, role]) -> boolean', refusal: 'false',
    summary: 'Describe a scope from the script, for a synth whose profile has no patch section, or to change one.',
    example: '`ce.patch.define("voice", { groups = {"Osc", "Filter", "Amp"}, dumps = {"voice"} })` makes the voice those three groups, read and sent as the voice dump.',
    notes: [
      'spec takes the fields the profile\'s patch section takes for one scope: name, groups, only, except, dumps, read, transform. Anything else: false, with a console error.',
      'Lasts while the panel is open; call it in onPanelLoad.',
    ],
    params: [
      { name: 'scope', type: 'text', required: true, summary: 'The scope\'s id. An existing one is replaced for this panel.' },
      { name: 'spec', type: 'table', required: true, summary: 'The scope: groups, only, except and dumps, as lists of names.' },
      { name: 'role', type: 'string', required: false, kind: 'deviceRole', summary: 'The device.' },
    ],
    scopes: 'any',
  },
  // ci
  // MIDI-CI for scripts (docs/design/ce-ci-module.md). The session lives once, in the device layer in
  // C++ (DeviceProfileService::ciCommand); ciCore.js checks a call and hands back the answers, the same
  // in every runtime. Not yet tried against a real MIDI-CI device: only against JUCE's own, in a loopback.
  {
    id: 'ciDiscover', category: 'MIDI-CI', signature: 'ciDiscover([opts,] fn) -> boolean', refusal: 'false',
    summary: 'Ask which MIDI-CI devices are there, and get the ones that answer.',
    example: '`ce.ci.discover(function(found) log(#found .. " MIDI-CI devices") end)`.',
    notes: [
      'fn is called once, when the time is up, with a list of devices; none: an empty list. A synth that does not speak MIDI-CI says nothing, so an empty list is the usual answer.',
      'A device is { muid, role, manufacturer, family, model, version, names, propertyExchange, profiles, matchesProfile }: `muid` its MIDI-CI number for this session; the codes as hex text, as device profiles write them ("41", "01 00"); `names` the words from its DeviceInfo; `matchesProfile` true when it is the synth the role\'s device profile describes.',
      'A muid changes each time the device is switched on: to find a device again, keep its manufacturer, family and model.',
      'Each device is also raised as ciDiscovered as soon as it answers. Returns true when asked; false when the role has no MIDI output.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['ciRole',
        { name: 'timeoutMs', type: 'number', default: '3000', unit: 'milliseconds', summary: 'How long to listen for answers.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the list of devices.' },
    ],
    scopes: 'any',
  },
  {
    id: 'ciDevices', category: 'MIDI-CI', signature: 'ciDevices([role]) -> list', refusal: 'empty list',
    summary: 'The MIDI-CI devices found so far, without asking again.',
    example: '`#ce.ci.devices() > 0` is true once a MIDI-CI device has answered.',
    notes: ['A device stays in the list until it says it is leaving or its ports close.'],
    params: [{ name: 'role', type: 'string', required: false, kind: 'deviceRole', summary: 'Only the devices on this role\'s ports. Left out: all.' }],
    scopes: 'any',
  },
  {
    id: 'ciGet', category: 'MIDI-CI', signature: 'ciGet(muid, resource [, opts], fn) -> boolean', refusal: 'false',
    summary: 'Read a resource from a device: its DeviceInfo, a controller or program list, or one of its own.',
    example: '`ce.ci.get(state.synth, "ResourceList", fn)` gives the list of resources the device has.',
    notes: [
      'fn is called with { ok, status, message, body, mediaType }: `status` is the device\'s own (200 is fine, 404 a resource it does not have); `body` is a table for JSON, text for text, and bytes otherwise. No answer in time: ok false, status 0, "no reply in time".',
      'ResourceList first: it says which resources exist, and whether each can be set or followed.',
      'Returns true when sent; false, with a console error, for a device without property exchange or one nobody found.',
    ],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device, from discover or devices.' },
      { name: 'resource', type: 'text', required: true, summary: 'The resource\'s name, as the device names it.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['ciResId', 'ciTimeout',
        { name: 'offset', type: 'number', default: '0', summary: 'For a long list the device gives in pages: where to start.' },
        { name: 'limit', type: 'number', default: 'the whole list', summary: 'For a long list: how many to give.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'ciSet', category: 'MIDI-CI', signature: 'ciSet(muid, resource, body [, opts], fn) -> boolean', refusal: 'false',
    summary: 'Change a resource on a device.',
    example: '`ce.ci.set(state.synth, "X-PatchName", { name = "Warm Pad" }, fn)` renames the patch on a device that has that resource.',
    notes: [
      'A table is sent as JSON, text as text. To send bytes, give `mediaType`, such as "application/octet-stream".',
      'fn is called with { ok, status, message }: 405 is a resource the device will not change.',
      'Changes the device, as sendSysex can.',
    ],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device.' },
      { name: 'resource', type: 'text', required: true, summary: 'The resource\'s name.' },
      { name: 'body', type: 'value', required: true, summary: 'What to set it to.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['ciResId', 'ciTimeout',
        { name: 'partial', type: 'true or false', default: 'false', summary: 'Send only the fields that change, for a device that allows it.' },
        { name: 'mediaType', type: 'text', default: 'as body says', summary: 'What body is, such as "text/plain"; needed for bytes.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the result.' },
    ],
    scopes: 'any',
  },
  {
    id: 'ciSubscribe', category: 'MIDI-CI', signature: 'ciSubscribe(muid, resource [, opts], fn) -> id', refusal: 'nothing',
    summary: 'Be told when a resource changes on the device.',
    example: '`ce.ci.subscribe(state.synth, "ProgramList", fn)` calls fn when the user renames or stores a program on the synth.',
    notes: [
      'fn is called with { command, body } for each change: "full" (the whole resource), "partial" (only what changed) or "notify" (it changed: get it again); and once with "end" when the device, the panel or ce.ci.unsubscribe() ends it, or the device is gone. A device that refuses: "end" with ok false.',
      'Returns an id for ce.ci.unsubscribe(); a device without property exchange: nothing, with a console error.',
    ],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device.' },
      { name: 'resource', type: 'text', required: true, summary: 'The resource\'s name.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['ciResId']) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with each update.' },
    ],
    scopes: 'any',
  },
  {
    id: 'ciUnsubscribe', category: 'MIDI-CI', signature: 'ciUnsubscribe(id) -> boolean', refusal: 'false',
    summary: 'Stop following a resource; the device is told.',
    example: '`ce.ci.unsubscribe(state.programs)` in onPanelClose.',
    notes: ['Returns true when there was one.'],
    params: [{ name: 'id', type: 'number', required: true, summary: 'The id ce.ci.subscribe() gave.' }],
    scopes: 'any',
  },
  {
    id: 'ciProfiles', category: 'MIDI-CI', signature: 'ciProfiles(muid [, fn]) -> list', refusal: 'empty list',
    summary: 'A device\'s MIDI-CI profiles, and which are on.',
    example: '`ce.ci.profiles(state.synth)` gives what the last inquiry found.',
    notes: [
      'Each is { id, address, enabled }: `id` the profile\'s five bytes as hex text ("7E 21 09 01 00"), `address` "device" or a channel, 1 to 16.',
      'Without fn: the list as last heard, at once. With fn: the device is asked again, and fn is called with the fresh list.',
      'A MIDI-CI profile is an agreed way for a device to behave, such as a drawbar organ. It is not one of CEditor\'s device profiles.',
    ],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device.' },
      { name: 'fn', type: 'function', required: false, summary: 'Called with the fresh list.' },
    ],
    scopes: 'any',
  },
  {
    id: 'ciSetProfile', category: 'MIDI-CI', signature: 'ciSetProfile(muid, id, on [, opts]) -> boolean', refusal: 'false',
    summary: 'Turn a MIDI-CI profile on or off.',
    example: '`ce.ci.setProfile(state.synth, "7E 21 09 01 00", true)`.',
    notes: ['The device answers with its new state, raised as ciProfileChanged. A device that refuses raises nothing, and profiles keeps the old state.'],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device.' },
      { name: 'id', type: 'text', required: true, summary: 'The profile, as profiles gives it.' },
      { name: 'on', type: 'boolean', required: true, summary: 'On or off.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'channel', type: 'number', default: 'the whole device', summary: 'One channel, 1 to 16, for a profile turned on per channel.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'ciDraftProfile', category: 'MIDI-CI', signature: 'ciDraftProfile(muid, fn) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Make a draft device profile from what a device reports.',
    example: '`ce.ci.draftProfile(state.synth, function(draft) log(draft.summary.parameters .. " parameters") end)`.',
    notes: [
      'Asks for DeviceInfo, AllCtrlList, ChCtrlList and ProgramList, then builds the draft as the Discovery screen does, marked as partial.',
      'fn is called with { profile, summary }: `profile` a table ready to save as JSON with ce.file.save(); `summary` counts what it holds, and `missing` lists what the device did not say.',
      'A starting point, not a finished profile: MIDI-CI says which controllers a device has, not its SysEx dumps.',
    ],
    params: [
      { name: 'muid', type: 'number', required: true, summary: 'The device.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the draft.' },
    ],
    scopes: 'any',
  },
  // osc
  // Open Sound Control (docs/design/ce-osc-module.md). The port, OSC's reading and writing and the
  // user's yes for the network live once, in C++ (Osc/OscService.h); oscCore.js checks a call and runs
  // each pattern's function, the same in every runtime.
  {
    id: 'oscListen', category: 'OSC', signature: 'oscListen([opts]) -> boolean', refusal: 'false',
    summary: 'Start receiving OSC on a port.',
    example: '`ce.osc.listen({ port = 8000, network = true })` receives from a tablet on the same network, after the user says yes.',
    notes: [
      'This computer only, unless `network` is on; then the user is asked the first time, and listening starts when they say yes. The answer is kept on this computer for the panel, never in the panel file.',
      'The port in use is in status().port: show it where the user types it into the tablet. Calling it again moves to the new port.',
      'Returns true when listening, or waiting for the user. In an exported plug-in with its window shut, false when the port is in use or the user said no; in the panel view that comes a moment later, as a console line and status().error.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'port', type: 'number', default: '8000', summary: 'The port, 1024 to 65535.' },
        { name: 'network', type: 'boolean', default: 'false', summary: 'Receive from other computers too, after the user says yes.' },
        { name: 'nextFree', type: 'boolean', default: 'false', summary: 'Take the next free port when this one is in use, as a second copy of the panel must.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'oscStop', category: 'OSC', signature: 'oscStop() -> boolean', refusal: 'false',
    summary: 'Stop receiving OSC, and close the port.',
    example: '`ce.osc.stop()` from an "OSC off" switch.',
    notes: ['Closed by itself when the panel closes. Returns true when a port was open.'],
    params: [],
    scopes: 'any',
  },
  {
    id: 'oscOn', category: 'OSC', signature: 'oscOn(pattern, fn) -> number', refusal: 'nothing',
    summary: 'Run a function for every OSC message to an address; wildcards allowed.',
    example: '`ce.osc.on("/fader/*", fn)` runs `fn` for `/fader/1`, `/fader/2` and so on.',
    notes: [
      'OSC\'s wildcards, inside one part of the address: `*` any text, `?` one character, `[1-4]` one of a range, `[!0]` anything but, `{cutoff,reso}` one of a list.',
      'fn is called with the message: { address, args, types, from, time }. `args` are its values; `types` the OSC type of each, such as "if"; `from` { host, port }, which ce.osc.send() takes to answer; `time` a bundle\'s time.',
      'Several patterns can match one message; each function runs, in the order they were made. A script\'s patterns go when it reloads.',
      'Returns an id for ce.osc.off().',
    ],
    params: [
      { name: 'pattern', type: 'string', required: true, summary: 'An address, starting with /.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with each message.' },
    ],
    scopes: 'any',
  },
  {
    id: 'oscOff', category: 'OSC', signature: 'oscOff(id) -> boolean', refusal: 'false',
    summary: 'Remove a pattern ce.osc.on() made.',
    example: '`ce.osc.off(state.faders)`.',
    notes: ['Returns true when there was one.'],
    params: [{ name: 'id', type: 'number', required: true, summary: 'The id ce.osc.on() gave.' }],
    scopes: 'any',
  },
  {
    id: 'oscTarget', category: 'OSC', signature: 'oscTarget(name [, address]) -> boolean', refusal: 'false',
    summary: 'Give a destination a name, so ce.osc.send() can use it.',
    example: '`ce.osc.target("tablet", "192.168.1.20:9000")`.',
    notes: [
      'Another computer asks the user once, as listening on the network does; this computer ("127.0.0.1" or "localhost") does not.',
      'Names belong to the panel and are shared by its scripts, until the panel closes.',
      'Returns true when set, or waiting for the user\'s answer.',
    ],
    params: [
      { name: 'name', type: 'string', required: true, summary: 'The name scripts will use.' },
      { name: 'address', type: 'value', required: false, default: 'forget the name', summary: '"host:port", { host, port }, or a message\'s from.' },
    ],
    scopes: 'any',
  },
  {
    id: 'oscSend', category: 'OSC', signature: 'oscSend(to, address [, args] [, types]) -> boolean', refusal: 'false',
    summary: 'Send one OSC message.',
    example: '`ce.osc.send("tablet", "/label/1", "Cutoff")` sets a label in TouchOSC.',
    notes: [
      'Every number goes as `f`, the type most receivers expect; text as `s`, true and false as `T` and `F`, nothing as `N`, a list of bytes as `b`. A whole number needs `types` "i", because some languages cannot tell 1 from 1.0.',
      '`types` gives one OSC type for each value instead: i h f d s S T F N I b r m t c.',
      'Sending never waits; messages go out in the order sent. A destination on another computer asks the user first, and the message waits for the answer.',
      'Returns true when sent; false for an address without a leading /, types that do not fit the values, or a destination the user refused.',
    ],
    params: [
      { name: 'to', type: 'value', required: true, summary: 'A name from ce.osc.target(), "host:port", or a message\'s from.' },
      { name: 'address', type: 'string', required: true, summary: 'Where to send it, starting with /.' },
      { name: 'args', type: 'value', required: false, default: 'no values', summary: 'One value, or a list of them.' },
      { name: 'types', type: 'string', required: false, default: 'worked out from the values', summary: 'The OSC types, one per value, such as "if".' },
    ],
    scopes: 'any',
  },
  {
    id: 'oscBundle', category: 'OSC', signature: 'oscBundle(to, messages [, opts]) -> boolean', refusal: 'false',
    summary: 'Send several OSC messages as one packet, so they arrive together.',
    example: '`ce.osc.bundle("tablet", { { address = "/fader/1", args = { 0.5 } }, { address = "/label/1", args = { "64" } } })`.',
    notes: [
      'For a tablet showing many values: one bundle for a page of faders is one packet, not twenty. A bundle larger than 64 KB is refused; split it.',
      'Returns true when sent.',
    ],
    params: [
      { name: 'to', type: 'value', required: true, summary: 'As ce.osc.send() takes it.' },
      { name: 'messages', type: 'list', required: true, summary: 'A list of { address, args, types }.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'time', type: 'number', default: 'at once', unit: 'seconds since 1900', summary: 'When the receiver should act on it, for a receiver that schedules bundles.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'oscStatus', category: 'OSC', signature: 'oscStatus() -> table', refusal: 'nothing',
    summary: 'What OSC is doing: listening or not, on which port, what was received, sent and dropped.',
    example: '`ce.osc.status().port` is the port to type into the tablet.',
    notes: [
      'Returns { listening, waiting, port, network, received, sent, dropped, error }: `waiting` while the user has not answered; the counts since the panel opened; `error` the last reason something was refused: "portInUse", "refusedByUser", "badPort", "badAddress", "badMessage", "tooLarge" or "badPacket".',
      'In the panel view it answers from what the transport last said, a moment behind.',
    ],
    params: [],
    scopes: 'any',
  },
  // daw
  // The exported plug-in and its DAW (docs/design/ce-daw-module.md). dawCore.js checks a call and asks
  // the plug-in, the same in every runtime; in the editor there is no DAW.
  {
    id: 'dawHost', category: 'DAW', signature: 'dawHost() -> table', refusal: 'nothing',
    summary: 'What the exported plug-in is running in: the DAW\'s name, the plug-in format, the sample rate and block size, and whether its window is open.',
    example: '`ce.daw.host().name` is "Bitwig Studio" in Bitwig.',
    notes: [
      'Returns { name, format, sampleRate, blockSize, editorOpen }. `name` is the DAW as JUCE knows it, else "Unknown"; `format` is "vst3", "clap", "lv2", "au" or "standalone".',
      '`sampleRate` and `blockSize` are nothing until the DAW has started the plug-in. Tempo, position and play state are in ce.time.',
      'In the editor: nothing.',
    ],
    params: [],
    scopes: 'any',
  },
  {
    id: 'dawParameters', category: 'DAW', signature: 'dawParameters() -> list', refusal: 'empty list',
    summary: 'The plug-in\'s DAW parameters, in the order the DAW lists them.',
    example: '`#ce.daw.parameters()` is how many the DAW can automate.',
    notes: [
      'Each is { id, name, path, control, min, max, default, unit, kind, choices, group, value }: `kind` is "float", "choice" or "bool"; `choices` the texts of a list; `group` the folder the DAW shows it in; `name` the name the DAW shows now; `value` as get() gives it.',
      'The spare parameters are at the end, with `path` nothing while empty.',
      'In the editor: the list the next export would bake.',
    ],
    params: [],
    scopes: 'any',
  },
  {
    id: 'dawParameter', category: 'DAW', signature: 'dawParameter(path) -> table', refusal: 'nothing',
    summary: 'One DAW parameter, by its control\'s path.',
    example: '`ce.daw.parameter("Cutoff.value").name` is the name the DAW shows for the cutoff knob.',
    notes: ['Returns one entry as ce.daw.parameters() gives it; a control that is not a DAW parameter: nothing.'],
    params: [{ name: 'path', type: 'string', required: true, summary: 'The control\'s path, as set takes it.' }],
    scopes: 'any',
  },
  {
    id: 'dawProgram', category: 'DAW', signature: 'dawProgram() -> table', refusal: 'nothing',
    summary: 'The program the DAW has chosen from the plug-in\'s bank.',
    example: '`ce.daw.program().name` is what the DAW\'s program menu shows.',
    notes: [
      'Returns { index, number, name, count }: `index` from 0, `number` from 1, `count` the size of the bank.',
      'The bank is the one baked at export from the device profile\'s presets. A panel without one, and the editor: nothing.',
    ],
    params: [],
    scopes: 'any',
  },
  {
    id: 'dawPrograms', category: 'DAW', signature: 'dawPrograms() -> list', refusal: 'empty list',
    summary: 'The whole bank the DAW chooses from.',
    example: '`ce.daw.programs()[1].name` is the first program\'s name.',
    notes: ['Returns a list of { index, number, name }; no bank: an empty list.'],
    params: [],
    scopes: 'any',
  },
  {
    id: 'dawBeginGesture', category: 'DAW', signature: 'dawBeginGesture(path) -> boolean', refusal: 'false',
    summary: 'Start one DAW gesture on a parameter: every set on it until endGesture is one move to the DAW.',
    example: '`ce.daw.beginGesture("Cutoff.value")` before a sweep the script plays.',
    notes: [
      'Without it, each set is a gesture of its own, and a DAW writing automation in touch or latch mode lets go of the parameter after every value.',
      'Only for changes the script makes over time: a morph, a sweep. A drag by a hand is one gesture already.',
      'A gesture left open is ended, with a console line, when the window or the plug-in closes.',
      'Returns true when started; false when one is already open on it, or the path is not a DAW parameter, and in the editor.',
    ],
    params: [{ name: 'path', type: 'string', required: true, summary: 'The control\'s path.' }],
    scopes: 'any',
  },
  {
    id: 'dawEndGesture', category: 'DAW', signature: 'dawEndGesture(path) -> boolean', refusal: 'false',
    summary: 'End the gesture ce.daw.beginGesture() started.',
    example: '`ce.daw.endGesture("Cutoff.value")` when the sweep is done.',
    notes: ['Returns true when a gesture was open.'],
    params: [{ name: 'path', type: 'string', required: true, summary: 'The control\'s path.' }],
    scopes: 'any',
  },
  {
    id: 'dawRename', category: 'DAW', signature: 'dawRename(path [, name]) -> boolean', refusal: 'false',
    summary: 'Give a parameter a new name in the DAW.',
    example: '`ce.daw.rename("Osc2Param.value", "Sync amount")` when the oscillator\'s mode changes what its knob does.',
    notes: [
      'The parameter\'s id and place stay the same, so automation already written stays on it. The name is saved with the project.',
      'Not every DAW shows a new name at once; some only after the project is opened again, and LV2 has no way to say it.',
      'Returns true when the name was changed; in the editor, false.',
    ],
    params: [
      { name: 'path', type: 'string', required: true, summary: 'The control\'s path.' },
      { name: 'name', type: 'string', required: false, default: 'the name it was exported with', summary: 'The new name.' },
    ],
    scopes: 'any',
  },
  {
    id: 'dawAssign', category: 'DAW', signature: 'dawAssign(slot [, path] [, opts]) -> boolean', refusal: 'false',
    summary: 'Put a control on one of the panel\'s spare parameters, so the DAW can automate it.',
    example: '`ce.daw.assign(1, "LfoRate.value")` puts the LFO rate on spare parameter 1.',
    notes: [
      'The author reserves spare parameters in the panel\'s export settings; the script decides what is on them.',
      'The spare shows the control\'s range and text: "440 Hz", not "0.53". Moving one moves the other, both ways.',
      'A control is on one slot at a time: assigning it again moves it. The assignment is saved with the project and comes back before its automation plays.',
      'Returns true when assigned; false for a slot the panel does not have, a control with no range, and in the editor.',
    ],
    params: [
      { name: 'slot', type: 'number', required: true, summary: '1 to the number of spare parameters the panel has.' },
      { name: 'path', type: 'string', required: false, default: 'empty the slot', summary: 'The control\'s path.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'name', type: 'string', default: 'the control\'s name', summary: 'The name the DAW shows for the slot.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'dawMarkChanged', category: 'DAW', signature: 'dawMarkChanged() -> boolean', refusal: 'false',
    summary: 'Tell the DAW the project has unsaved changes.',
    example: '`ce.daw.markChanged()` after a script changed something only onDawSaveState saves.',
    notes: [
      'Without it a DAW may close the project without asking, and lose what only the script holds. A change to a DAW parameter needs no call.',
      'Also runs onDawSaveState on the next tick, so the state is ready when the DAW asks.',
      'Returns true when the DAW was told; in the editor, false.',
    ],
    params: [],
    scopes: 'any',
  },
  // mpe
  // MPE out (docs/design/midi-input-and-mpe.md): mpeCore.js picks each note's member channel and sends
  // its expression there, the same in every runtime. One zone per panel; Python's is per script.
  {
    id: 'mpeZone', category: 'MPE', signature: 'mpeZone([opts]) -> boolean', refusal: 'false',
    summary: 'Set up the MPE zone the panel plays into, and tell the synth.',
    example: '`ce.mpe.zone({ members = 7 })` plays into a lower zone of seven channels, 2 to 8.',
    notes: [
      'MPE gives each sounding note a MIDI channel of its own, so each note can bend, swell and change tone by itself. A zone is one manager channel and the member channels its notes use: the lower zone has channel 1 as manager and members from 2 upwards; the upper zone has 16 and members from 15 down.',
      'With `send` on, the synth gets the MPE Configuration Message (RPN 6) on the manager channel and the bend range (RPN 0) on every channel of the zone, so both ends agree.',
      'Changing the zone ends every sounding note first. Returns true when the zone is set.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'zone', type: 'string', default: '"lower"', summary: '"lower" (manager channel 1) or "upper" (manager channel 16).' },
        { name: 'members', type: 'number', default: '15', summary: 'How many member channels, 1 to 15, and so how many notes can sound at once.' },
        { name: 'bendRange', type: 'number', default: '48', unit: 'semitones', summary: 'How far a full bend goes on a member channel. MPE\'s own default.' },
        { name: 'managerBendRange', type: 'number', default: '2', unit: 'semitones', summary: 'The same, for the manager channel.' },
        { name: 'send', type: 'boolean', default: 'true', summary: 'Send the setup to the synth. Off for a synth set up by hand.' },
        { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"', summary: 'The device to play.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'mpeNoteOn', category: 'MPE', signature: 'mpeNoteOn(note, velocity [, opts]) -> number', refusal: 'nothing',
    summary: 'Play a note on a member channel of its own, and get its id.',
    example: '`local id = ce.mpe.noteOn("C4", 100)` plays middle C and keeps its id.',
    notes: [
      'The channel is the free member channel released longest ago, so a release tail on the synth is not cut off. Every channel busy: the oldest note is ended first, with a console line the first time.',
      'The starting bend, timbre and pressure are sent before the note, as MPE asks, so a note never starts at the last note\'s bend.',
      'Before ce.mpe.zone(): a lower zone of 15 is set up first, and sent.',
      'Returns the note\'s id, a number.',
    ],
    params: [
      { name: 'note', type: 'number or text', required: true, summary: 'The note, 0 to 127, or a name such as "C4".' },
      { name: 'velocity', type: 'number', required: true, summary: '1 to 127.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'bend', type: 'number', default: '0', unit: 'semitones', summary: 'The bend the note starts with, held to the zone\'s bend range.' },
        { name: 'pressure', type: 'number', default: '0', summary: 'The pressure it starts with, 0 to 1.' },
        { name: 'timbre', type: 'number', default: '0.5', summary: 'The timbre it starts with, 0 to 1 (controller 74).' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'mpeExpress', category: 'MPE', signature: 'mpeExpress(id, values) -> boolean', refusal: 'false',
    summary: 'Change one sounding note\'s bend, pressure or timbre.',
    example: '`ce.mpe.express(id, { bend = 0.5, pressure = 0.8 })` bends the note up a quarter tone and presses it.',
    notes: [
      'What is left out is not sent.',
      'A note that has ended: false, and nothing sent, so a late gesture does not land on the next note to use that channel. Returns true when sent.',
    ],
    params: [
      { name: 'id', type: 'number', required: true, summary: 'A note\'s id, from ce.mpe.noteOn().' },
      { name: 'values', type: 'object', required: true, fields: optionFields([
        { name: 'bend', type: 'number', default: 'not sent', unit: 'semitones', summary: 'The note\'s bend, held to the zone\'s bend range.' },
        { name: 'pressure', type: 'number', default: 'not sent', summary: 'Its pressure, 0 to 1.' },
        { name: 'timbre', type: 'number', default: 'not sent', summary: 'Its timbre, 0 to 1 (controller 74).' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'mpeNoteOff', category: 'MPE', signature: 'mpeNoteOff(id [, velocity]) -> boolean', refusal: 'false',
    summary: 'End a note played with ce.mpe.noteOn().',
    example: '`ce.mpe.noteOff(id)` releases the note.',
    notes: ['Returns true when the note was sounding; false when it had already ended.'],
    params: [
      { name: 'id', type: 'number', required: true, summary: 'The note\'s id.' },
      { name: 'velocity', type: 'number', required: false, default: '64', summary: 'The release velocity, 0 to 127.' },
    ],
    scopes: 'any',
  },
  {
    id: 'mpeAllOff', category: 'MPE', signature: 'mpeAllOff() -> number', refusal: 'zero',
    summary: 'End every note the panel plays through MPE, and set each member channel\'s bend back to the middle.',
    example: '`ce.mpe.allOff()` in onPanelClose leaves the synth silent.',
    notes: [
      'Returns how many notes were ended.',
      'ce.midi.panic() silences these too, as it does every note; call this as well, so ce.mpe.notes() is empty again.',
    ],
    params: [],
    scopes: 'any',
  },
  {
    id: 'mpeNotes', category: 'MPE', signature: 'mpeNotes() -> list', refusal: 'empty list',
    summary: 'The notes sounding now through ce.mpe.',
    example: '`#ce.mpe.notes()` is how many are held.',
    notes: ['Each is { id, note, channel, velocity, bend, pressure, timbre }, oldest first; none: an empty list.'],
    params: [],
    scopes: 'any',
  },
  {
    id: 'mpeListen', category: 'MPE', signature: 'mpeListen([opts]) -> boolean', refusal: 'false',
    summary: 'Read MPE from a device: give each note an id, and raise expressionIn as it moves.',
    example: '`ce.mpe.listen({ from = "controller" })` reads MPE from the device the panel calls "controller".',
    notes: [
      'An MPE controller sends each note on its own channel, with its bend, pressure and timbre on that channel. This turns them back into notes.',
      'While listening, noteIn and noteOffIn from that device carry `note.id`, the same id expressionIn gives, and bendIn, pressureIn and controller 74 on its member channels are raised as expressionIn instead.',
      'The zone comes from the MPE Configuration Message the device sends, when it sends one; else from `zone` and `members` here.',
      'Returns true when listening. `listen({ off = true })` stops.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'from', type: 'string', kind: 'deviceRole', default: 'every input', summary: 'The device to read, by its role.' },
        { name: 'zone', type: 'string', default: '"lower"', summary: '"lower" or "upper", until the device says which.' },
        { name: 'members', type: 'number', default: '15', summary: 'How many member channels, 1 to 15, until the device says.' },
        { name: 'bendRange', type: 'number', default: '48', unit: 'semitones', summary: 'For turning a member channel\'s bend into semitones.' },
        { name: 'off', type: 'boolean', default: 'false', summary: 'True stops reading the device.' }]) },
    ],
    scopes: 'any',
  },
  // file
  // Librarian files through the person's own dialogs (docs/design/ce-file-module.md). A script never
  // names a path: every file comes from a dialog the person answered. The dialogs are the panel
  // view's (scriptFileHost.js, over CE/src/ScriptFiles.h); the four that take files apart work on
  // bytes and run everywhere (fileCore.js).
  {
    id: 'fileOpen', category: 'Files', signature: 'fileOpen(opts, fn) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Ask the person for a file, and get its contents.',
    example: '`ce.file.open({ types = {"syx"} }, function(file, data) … end)` asks for a .syx file and gives its bytes.',
    notes: [
      'fn is called as fn(file, data) once the person has chosen, or fn(nil) when they cancel. `data` is bytes for syx and mid, text for txt and csv, and a value for json.',
      '`file` is a table to keep and pass back: { id, name, type, size, canWrite, isFolder }. It holds no folder: the script never sees where the file is.',
      'A json file that is not valid JSON: fn(file, nil), with a console error naming the line where it goes wrong.',
      'Returns true when the dialog opened. Another ce.file dialog already open: the console says so. With the plug-in\'s window shut there is nobody to answer, so nothing is done.',
      'Files of up to 8 MB.',
    ],
    params: [
      { name: 'opts', type: 'object', required: true, fields: optionFields([
        { name: 'types', type: 'list of text', default: 'none, needed', sample: '{"syx"}', summary: 'The types the dialog accepts, from syx, mid, json, txt and csv.' },
        { name: 'title', type: 'text', default: '"Open"', summary: 'The dialog\'s title: say what the file is for, such as "Import a bank".' },
        { name: 'multiple', type: 'true or false', default: 'false', summary: 'Let the person pick several files: fn is then called once for each.' },
        { name: 'writable', type: 'true or false', default: 'false', summary: 'Let ce.file.write() write this file again later, as a librarian keeps a bank file open.' },
        { name: 'read', type: 'true or false', default: 'true', summary: 'Off: give the file value only, and read it later with ce.file.read().' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called as fn(file, data), or fn(nil) when the person cancels.' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileSave', category: 'Files', signature: 'fileSave(name, data [, opts [, fn]]) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Ask the person where to save, then write the file there.',
    example: '`ce.file.save("Bank A.syx", bytes)` offers to save the bytes as "Bank A.syx".',
    notes: [
      'The extension of `name` sets the type: .syx, .mid, .json, .txt or .csv. Anything else: false, with a console error.',
      '`data` is bytes for syx and mid, text for txt and csv, and any value for json. The wrong kind for the type: false, with a console error, and nothing written.',
      'fn is called as fn(file) when it is written, or fn(nil, why) when the person cancels or the write fails. The file value has `canWrite` on, so ce.file.write() can save to it again without asking.',
      'The dialog asks before writing over a file that is there. The person can change the name; the file keeps the type asked for.',
    ],
    params: [
      { name: 'name', type: 'text', required: true, summary: 'The name the dialog suggests, with its extension.' },
      { name: 'data', type: 'value', required: true, summary: 'What to write.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'title', type: 'text', default: '"Save"', summary: 'The dialog\'s title.' },
        { name: 'indent', type: 'number', default: 'none', summary: 'For json: spaces to indent each level, so a person can read the file.' }]) },
      { name: 'fn', type: 'function', required: false, summary: 'Called as fn(file), or fn(nil, why).' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileRead', category: 'Files', signature: 'fileRead(file, fn) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Read a chosen file again, as it is now.',
    example: '`ce.file.read(state.bank, function(data) … end)` reads the bank file the person opened earlier.',
    notes: [
      'fn is called as fn(data), the contents as open gives them, or fn(nil, why) when the file has gone or cannot be read.',
      'Not a file value from ce.file.open, save or list: false, with a console error.',
    ],
    params: [
      { name: 'file', type: 'table', required: true, summary: 'A file value from open, save or list.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called as fn(data), or fn(nil, why).' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileWrite', category: 'Files', signature: 'fileWrite(file, data [, fn]) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Write a chosen file again, without asking.',
    example: '`ce.file.write(state.bank, ce.file.syxJoin(state.messages))` saves the edited bank back to its file.',
    notes: [
      'Only a file whose `canWrite` is on: one from save, saveIn, or open with `writable`. Anything else: false, with a console error saying the person must save to it first.',
      'Written whole, through a temporary file, so a write cut short leaves the old file as it was.',
      'fn is called as fn(true) when written, or fn(false, why) when not.',
    ],
    params: [
      { name: 'file', type: 'table', required: true, summary: 'A file value whose canWrite is on.' },
      { name: 'data', type: 'value', required: true, summary: 'What to write, as save takes it.' },
      { name: 'fn', type: 'function', required: false, summary: 'Called as fn(true), or fn(false, why).' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileFolder', category: 'Files', signature: 'fileFolder(opts, fn) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Ask the person for a folder.',
    example: '`ce.file.folder({ title = "Export the bank to", writable = true }, function(dir) … end)` asks where to put a bank\'s files.',
    notes: [
      'fn is called as fn(folder) once chosen, or fn(nil) when the person cancels.',
      'Only this folder: not the folders inside it, and nothing above it.',
    ],
    params: [
      { name: 'opts', type: 'object', required: true, fields: optionFields([
        { name: 'title', type: 'text', default: '"Choose a folder"', summary: 'The dialog\'s title.' },
        { name: 'writable', type: 'true or false', default: 'false', summary: 'Let ce.file.saveIn() write into it.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called as fn(folder), or fn(nil).' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileList', category: 'Files', signature: 'fileList(folder [, opts]) -> list', refusal: 'empty list', runtime: RUNTIME_WEBVIEW,
    summary: 'The files in a chosen folder, sorted as a person sorts them ("2" before "10").',
    example: '`ce.file.list(dir, { types = {"syx"} })` gives every .syx file in it.',
    notes: [
      'Each is a file value, for ce.file.read(). They can be written only when the folder was chosen writable.',
      'The files there when the folder was chosen, as saveIn last left them, or when list was last called: a file another program adds shows the next time.',
    ],
    params: [
      { name: 'folder', type: 'table', required: true, summary: 'A folder value from ce.file.folder().' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'types', type: 'list of text', default: 'every type on the list', summary: 'Only these types.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'fileSaveIn', category: 'Files', signature: 'fileSaveIn(folder, name, data [, opts [, fn]]) -> boolean', refusal: 'false', runtime: RUNTIME_WEBVIEW,
    summary: 'Write one file into a chosen folder.',
    example: '`ce.file.saveIn(dir, "001 Brass.syx", bytes)` writes one patch of a bank.',
    notes: [
      'Only a folder chosen `writable`. A name with a /, \\ or .. in it, or without a listed extension: false, with a console error.',
      'A file of that name already there is not written over, and fn gets the reason, unless `replace` is on. The person agreed to a folder, not to losing what was in it.',
      'fn is called as fn(file) when written, or fn(nil, why) when not.',
    ],
    params: [
      { name: 'folder', type: 'table', required: true, summary: 'A folder value from ce.file.folder(), chosen writable.' },
      { name: 'name', type: 'text', required: true, summary: 'The file\'s name, with its extension.' },
      { name: 'data', type: 'value', required: true, summary: 'What to write, as save takes it.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'replace', type: 'true or false', default: 'false', summary: 'Write over a file of that name.' },
        { name: 'indent', type: 'number', default: 'none', summary: 'For json: spaces to indent each level.' }]) },
      { name: 'fn', type: 'function', required: false, summary: 'Called as fn(file), or fn(nil, why).' },
    ],
    scopes: 'any',
  },
  {
    id: 'fileSyxSplit', category: 'Files', signature: 'fileSyxSplit(bytes [, opts]) -> list', refusal: 'empty list',
    summary: 'The SysEx messages in a .syx file, one by one, each from F0 to F7.',
    example: '`ce.file.syxSplit(bytes)` gives a list of messages.',
    notes: [
      'Bytes outside any message are left out, with a console warning saying how many and where. So is a message cut off by the next F0, or with no F7 at the end of the file, unless `partial` is on.',
      'Works on bytes the script holds, so it runs everywhere, window shut too.',
    ],
    params: [
      { name: 'bytes', type: 'array', required: true, kind: 'bytes', summary: 'The file\'s bytes, a list or hex text.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'partial', type: 'true or false', default: 'false', summary: 'Keep a last message with no F7, so a cut-off file can still be looked at.' },
        { name: 'prefix', type: 'list', default: 'none', summary: 'Only messages that start with these bytes, such as {0xF0, 0x41} for Roland.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'fileSyxJoin', category: 'Files', signature: 'fileSyxJoin(messages) -> list', refusal: 'nothing',
    summary: 'Messages as one .syx file\'s bytes, in the order given, nothing added between.',
    example: '`ce.file.save("Bank A.syx", ce.file.syxJoin(state.messages))` saves a bank.',
    notes: ['A message that does not start with F0 and end with F7: nothing, with a console error naming which.'],
    params: [{ name: 'messages', type: 'list', required: true, summary: 'Messages, each bytes or hex text.' }],
    scopes: 'any',
  },
  {
    id: 'fileMidiRead', category: 'Files', signature: 'fileMidiRead(bytes [, opts]) -> table', refusal: 'nothing',
    summary: 'A MIDI file as tracks of notes: { ticksPerBeat, tempo, tempos, timeSignature, tracks }.',
    example: '`ce.file.midiRead(data).tracks[1].notes` gives the first track\'s notes.',
    notes: [
      'Each track is { name, notes, events }. A note is { beat, note, velocity, length, channel }: `beat` from 0, `length` in beats, `channel` from 1. `events` holds everything else as { beat, bytes }: controllers, program changes, bend, SysEx.',
      '`tempo` is the tempo at the start, 120 when the file gives none; `tempos` lists every change as { beat, bpm }.',
      'A note-on with velocity 0 ends the note. A note that never ends lasts to the end of its track, with a console warning naming it.',
      'Types 0 and 1. A type 2 file, a file timed in SMPTE frames, or one cut short: nothing, with a console error.',
    ],
    params: [
      { name: 'bytes', type: 'array', required: true, kind: 'bytes', summary: 'The file\'s bytes.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'track', type: 'number', default: 'every track', summary: 'Read only this track, counted from 1.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'fileMidiWrite', category: 'Files', signature: 'fileMidiWrite(song [, opts]) -> list', refusal: 'nothing',
    summary: 'A MIDI file\'s bytes from a song, a list of notes, or a Phrase Recorder\'s take.',
    example: '`ce.file.midiWrite(ce.components.recorder.read("Recorder"))` gives the recorder\'s take as a MIDI file.',
    notes: [
      '`song` is a song as midiRead gives it, a list of notes { beat, note, velocity, length, channel } written as one track, or a Phrase Recorder\'s section, whose take is written over its bars at the transport\'s beats per bar.',
      'One track is written as type 0, several as type 1, at 480 ticks per beat unless the song says otherwise.',
      'Returns the bytes, for ce.file.save(). Anything else as `song`: nothing, with a console error.',
    ],
    params: [
      { name: 'song', type: 'table', required: true, summary: 'A song, a list of notes, or a recorder\'s section.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'tempo', type: 'number', default: 'the song\'s, else the transport\'s, else 120', summary: 'The tempo written at the start, in beats per minute.' },
        { name: 'name', type: 'text', default: 'none', summary: 'The name written into the first track.' },
        { name: 'channel', type: 'number', default: '1', summary: 'The channel, 1 to 16, for notes that carry none.' }]) },
    ],
    scopes: 'any',
  },
  // verify
  // Asking the synth whether it holds what was sent (docs/design/ce-verify-module.md). The deciding is
  // verifyCore.js, the same in every runtime; each check ends in one report, handed to its function
  // and raised as onVerifyDone.
  {
    id: 'verifyCoverage', category: 'Verify', signature: 'verifyCoverage([opts]) -> table', refusal: 'nothing',
    summary: 'Which parameters a check can read back from the synth, which it cannot and why, and whether each dump\'s length adds up. Sends nothing.',
    example: '`ce.verify.coverage().checkable` is how many of the synth\'s parameters can be checked.',
    notes: [
      'Returns { role, total, checkable, unchecked, dumps }: `unchecked` lists { id, name, why }, `why` "notInDump" (no dump holds it) or "noRequest" (the profile cannot ask for that dump).',
      '`dumps` lists { kind, expectedBytes, layoutBytes, unread } for every dump these parameters are in. `expectedBytes` is the length the profile gives, `layoutBytes` what its layout adds up to; when the two differ, the profile is wrong in one of them. `unread` lists the payload bytes no parameter reads, as { from, to }.',
      'Reads only the profile, so it works without a synth connected.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole', 'verifyIds', 'verifyGroup']) },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyCheck', category: 'Verify', signature: 'verifyCheck([opts,] fn) -> boolean', refusal: 'false',
    summary: 'Ask the synth for its values and compare them with what the panel shows. Writes nothing.',
    example: '`ce.verify.check(function(report) log(ce.verify.summary(report)) end)` checks every parameter and logs one line.',
    notes: [
      'Asks only for the dumps that hold the parameters asked about, one after another, with the profile\'s gap between them. Each reply fills the panel, as a dump always does.',
      'The report: { kind, role, ok, total, matched, differed, unchecked, dumps, probes, ms, cancelled }. `matched` lists ids; `differed` lists { id, name, expected, got, raw }, `expected` what the panel held and `got` what the synth sent, `raw` the number the synth sent for a choice the profile does not name; `unchecked` lists { id, name, why }; `dumps` lists { kind, status, expectedBytes }, `status` "ok" or "noReply".',
      '`why` is "notInDump", "noRequest", "noReply" (asked, asked again, no answer in time), "moved" (the value changed while it was checked), "notWritable" or "cancelled".',
      '`ok` is true when nothing differed and nothing was left unchecked by no reply, a move or a cancel.',
      'Returns true when started; false while a check runs on that device, when the synth is not connected, or for any device but the main synth.',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole', 'verifyIds', 'verifyGroup']) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the report.' },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyDump', category: 'Verify', signature: 'verifyDump(kind [, opts], fn) -> boolean', refusal: 'false',
    summary: 'Ask for the same dump several times and compare the first reply with the last. Writes nothing.',
    example: '`ce.verify.dump("common", function(report) log(#report.differed) end)` logs how many values changed between two asks.',
    notes: [
      'A value that changes when nothing was sent is one the synth changes by itself, such as a counter or a clock. Every check that compares it will find it different.',
      '`differed` holds the parameters that changed, `expected` the first reply\'s value and `got` the last.',
      'A dump the profile has no request for: false, with a console error.',
    ],
    params: [
      { name: 'kind', type: 'dumpKind', required: true, summary: 'The dump, by the id the profile gives it, or the id of its request.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole',
        { name: 'times', type: 'number', default: '2', summary: 'How many times to ask, 2 to 10.' },
        { name: 'gapMs', type: 'number', default: '500', unit: 'milliseconds', summary: 'The wait between the asks.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the report.' },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyWrite', category: 'Verify', signature: 'verifyWrite(id, value [, opts], fn) -> boolean', refusal: 'false',
    summary: 'Send one value, ask the synth for it back, and compare.',
    example: '`ce.verify.write("tone1.filter.cutoff", 64, fn)` sends 64 and reports whether the synth holds 64.',
    notes: [
      'Sent as ce.device.write() sends it, so the panel\'s control follows. ce.device.write() says the message left; this says whether it landed.',
      'A parameter no dump holds is still sent, and is reported unchecked with the reason.',
    ],
    params: [
      { name: 'id', type: 'text', required: true, summary: 'The parameter id, as the profile names it.' },
      { name: 'value', type: 'number or text', required: true, summary: 'The value, in the parameter\'s own units, as ce.device.write() takes it.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole', 'verifySettle']) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the report.' },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyProbe', category: 'Verify', signature: 'verifyProbe(id [, opts], fn) -> boolean', refusal: 'false',
    summary: 'Try a parameter at several values, read each one back, then put the old value back.',
    example: '`ce.verify.probe("tone1.lfo.rate", fn)` tries the lowest, middle and highest rate and the two next to each end.',
    notes: [
      'Left out, `values` is: for a number, the lowest, the one above it, the middle, the one below the highest, and the highest; for a choice, every choice up to 16, else the first, middle and last; for on/off, both; for text, a name of full length and an empty one.',
      'The report\'s `probes` lists { id, value, got, same } for each value tried, and `differed` the values that did not land. `restored` is true when the old value was read back too.',
      'The old value is sent back when the probe ends, fails or is cancelled. A parameter that cannot be read back is not sent at all.',
    ],
    params: [
      { name: 'id', type: 'text', required: true, summary: 'The parameter id.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole', 'verifySettle',
        { name: 'values', type: 'list', default: 'as the notes say', summary: 'The values to try, in the parameter\'s own units.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the report.' },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyPatch', category: 'Verify', signature: 'verifyPatch([opts,] fn) -> boolean', refusal: 'false',
    summary: 'Send the panel\'s whole sound, ask for every dump that holds it, and compare every value.',
    example: '`ce.verify.patch(fn)` after building a sound in the panel, before saving it on the synth.',
    notes: [
      '`via` left out: whole dumps when the profile\'s patch section says `deliver = "dump"`, else one message per parameter.',
      'Parameters the profile says cannot be written are reported unchecked as "notWritable".',
    ],
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields(['verifyRole', 'verifyIds', 'verifyGroup', 'verifySettle',
        { name: 'via', type: 'text', default: 'as the profile delivers a patch', values: ['dump', 'parameters'], summary: 'How the sound is sent: whole dumps, or one value at a time.' },
        { name: 'send', type: 'true or false', default: 'true', summary: 'Off: compare without sending first, as check does.' }]) },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the report.' },
    ],
    scopes: 'any',
  },
  {
    id: 'verifySummary', category: 'Verify', signature: 'verifySummary(report [, opts]) -> text', refusal: 'nothing',
    summary: 'A report as one line of text.',
    example: '`ce.verify.summary(report)` gives "1180 of 1222 match, 3 differ, 39 unchecked (no reply: tone3)".',
    notes: [
      'Counts, then in brackets the dump that did not answer, or the most common reason a parameter was left unchecked. A cancelled check says so first.',
      'Not a report: nothing, with a console error.',
    ],
    params: [
      { name: 'report', type: 'table', required: true, summary: 'A report from any check.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'width', type: 'number', default: 'no limit', summary: 'The most characters to give, for an LCD line. Too long: the part in brackets goes first, then the words are shortened ("5/9 ok 1 diff 3 unchk"), then the line is cut.' }]) },
    ],
    scopes: 'any',
  },
  {
    id: 'verifyRunning', category: 'Verify', signature: 'verifyRunning([role]) -> table', refusal: 'nothing',
    summary: 'The check running now on a device: { kind, role, done, total, ms }, or nothing.',
    example: '`ce.verify.running()` while a patch check runs gives { kind = "patch", done = 3, total = 5, ms = 1840 }.',
    notes: [
      '`done` and `total` count dumps asked for (for a probe, values tried), so a script can show progress.',
      'In Lua and JavaScript every script sees every check on the panel. In Python a script sees the checks it started.',
    ],
    params: [{ name: 'role', type: 'string', required: false, kind: 'deviceRole', summary: 'The device; left out: "mainSynth".' }],
    scopes: 'any',
  },
  {
    id: 'verifyCancel', category: 'Verify', signature: 'verifyCancel([role]) -> boolean', refusal: 'false',
    summary: 'Stop the check running on a device.',
    example: '`ce.verify.cancel()` from a "Stop" button.',
    notes: [
      'The check\'s function is still called, with what was read so far and `cancelled` true; what was not read is unchecked as "cancelled". A probe sends the old value back first.',
      'Returns true when a check was running.',
    ],
    params: [{ name: 'role', type: 'string', required: false, kind: 'deviceRole', summary: 'The device; left out: "mainSynth".' }],
    scopes: 'any',
  },
  // keys
  // The computer keyboard on a panel (docs/design/ce-keys-module.md). Panel view only: with the
  // window shut there is no keyboard. Who gets a key, in order, is scriptKeys.js's header.
  {
    id: 'keysShortcut', category: 'Keyboard', signature: 'keysShortcut(keys, fn [, opts]) -> id', refusal: 'nothing',
    summary: 'Run a function when a key, or a key with modifiers, is pressed anywhere on the panel.',
    example: '`ce.keys.shortcut("Ctrl+G", randomizeVoice, { description = "Random voice" })` runs randomizeVoice on Ctrl+G.',
    notes: [
      'Refused, with a console line saying why: the editor\'s own keys, the keys DAWs and the system take (Ctrl+R, Ctrl+S and the like), the panic key, and a key another shortcut already has. Space is allowed, with a console line: in a DAW it then no longer starts the transport while the plug-in has the keyboard.',
      'A shortcut without a modifier waits for a focused control that uses that key: with a knob focused, a shortcut on "Up" does not run, and the knob moves. With a modifier it always runs.',
      'Shortcuts name the key printed on it: "Ctrl+G" is G wherever it sits on a German or French keyboard.',
      'Nothing runs while the user is typing into a text box or editing an LCD.',
      'Returns an id for `remove`; refused: nothing. A script\'s shortcuts are removed when it reloads.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'keys', type: 'text', required: true, summary: 'The key and its modifiers joined by +: "Ctrl+G", "Shift+Up", "F2", "Space". Modifiers are Ctrl, Shift, Alt and Meta (the Windows key, or Cmd on a Mac), in any order and any case.' },
      { name: 'fn', type: 'function', required: true, summary: 'Called with the same fields keyDown gives.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'description', type: 'text', sample: '"Random voice"', summary: 'The words `list` shows for it.' },
        { name: 'repeat', type: 'true or false', default: 'false', summary: 'On: run again while the key is held and the system repeats it.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'keysRemove', category: 'Keyboard', signature: 'keysRemove(id) -> boolean',
    summary: 'Take a shortcut away.',
    example: '`ce.keys.remove(state.randomKey)` when the page that used it is hidden.',
    notes: ['Returns true when there was one.'],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'id', type: 'number', required: true, summary: 'The id `shortcut` gave.' }],
    scopes: 'any',
  },
  {
    id: 'keysList', category: 'Keyboard', signature: 'keysList() -> list',
    summary: 'Every key the panel uses, for a help page: a list of { id, keys, description }.',
    example: '`#ce.keys.list()` is how many keys the panel uses.',
    notes: [
      'The panic key comes first (id "panic"), then the shortcuts in the order they were made.',
      'The piano is one entry while it is on, keys "Piano".',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'keysIsDown', category: 'Keyboard', signature: 'keysIsDown(key) -> boolean',
    summary: 'Whether a key is held now.',
    example: '`ce.keys.isDown("Shift")` in onValueChange, to move a knob in fine steps while Shift is held.',
    notes: [
      'Counts keys the panel saw go down, except while typing. False after the panel loses the keyboard.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'key', type: 'text', required: true, summary: 'A name as keyDown gives it ("Shift", "R", "Up"), or a place as its `code` gives it ("KeyR").' }],
    scopes: 'any',
  },
  {
    id: 'keysHeld', category: 'Keyboard', signature: 'keysHeld() -> list',
    summary: 'The keys held now, by name, in the order they went down.',
    example: '`ce.keys.held()` while Ctrl and G are held gives { "Ctrl", "G" }.',
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'keysPiano', category: 'Keyboard', signature: 'keysPiano([opts]) -> boolean', refusal: 'false',
    summary: 'Play notes from the letter keys of the computer keyboard.',
    example: '`ce.keys.piano({ target = "Keys" })` plays through the Keyboard component named "Keys", which lights up as notes play.',
    notes: [
      'The layout is the one Ableton Live and Hostage use, by the keys\' place: the middle letter row plays the white keys from C (A, S, D, F, G, H, J, K, L, ;, \'), the row above it the black ones (W, E, T, Y, U, O, P). On a German or French keyboard the same places play the same notes.',
      'A key held plays one note until it is let go; the system\'s key repeat is ignored. Keys pressed with Ctrl, Alt or Meta are left for shortcuts.',
      'With a `target`, the notes go through that Keyboard component: its channel, velocity, transpose, octave and scale lock apply, its keys show what is held, and it raises hit and release as for the mouse. Without one, the options below apply and the notes go to the device as sendNote sends them.',
      'Every note is let go when the panel loses the keyboard, when the piano is turned off, and on the panic key.',
      'Returns true when on; false when off, or when the panel has nothing to play to.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'on', type: 'true or false', default: 'true', summary: 'Off stops the piano and lets every note go.' },
        { name: 'target', type: 'text', kind: 'control', sample: '"Keys"', summary: 'A Keyboard component to play through.' },
        { name: 'octave', type: 'number', default: '4', summary: 'The octave the A key starts: 4 makes it C4, note 60.' },
        { name: 'velocity', type: 'number', default: '100', summary: 'How hard every note is played, 1 to 127.' },
        { name: 'channel', type: 'number', default: '1', summary: 'The MIDI channel, 1 to 16, without a `target`.' },
        { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"', summary: 'The device, without a `target`.' },
        { name: 'octaveKeys', type: 'true or false', default: 'true', summary: 'Z and X move the octave down and up.' },
        { name: 'velocityKeys', type: 'true or false', default: 'true', summary: 'C and V lower and raise the velocity by 20.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'keysPianoInfo', category: 'Keyboard', signature: 'keysPianoInfo() -> table',
    summary: 'What the piano is doing: { on, octave, velocity, channel, target, notes }.',
    example: '`ce.keys.pianoInfo().octave` is the octave Z and X have moved it to.',
    notes: [
      '`notes` is a list of { note, key } for the notes held now.',
      'To react to each note as it is played, give the piano a `target` and listen to that component\'s hit and release.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'keysFocus', category: 'Keyboard', signature: 'keysFocus([control]) -> boolean',
    summary: 'Give a control the keyboard, so the arrows and digits move it.',
    example: '`ce.keys.focus("Cutoff")` after a shortcut that jumps to the filter.',
    notes: [
      'The control shows its focus ring, as after Tab.',
      'Left out: no control has the keyboard, and keys go to shortcuts and keyDown.',
      'Refused (false) for a control with "Focusable" off or its keys turned off, a hidden control, and outside the preview.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'control', type: 'string', required: false, kind: 'control', summary: 'The control\'s name.' }],
    scopes: 'any',
  },
  {
    id: 'keysFocused', category: 'Keyboard', signature: 'keysFocused() -> text',
    summary: 'The control that has the keyboard, or nothing.',
    example: '`ce.keys.focused() == "Cutoff"` while the cutoff knob takes the arrows.',
    notes: ['The same name as keyDown\'s `control`.'],
    runtime: RUNTIME_WEBVIEW,
    params: [],
    scopes: 'any',
  },
  {
    id: 'drawText', category: 'Drawing', signature: 'drawText(x, y, text [, opts])',
    refusal: 'false',
    summary: 'Write text.',
    example: '`drawText(4, 12, "hello", {size = 10})` writes hello at size 10, its baseline at y 12.',
    notes: [
      'Drawn in the fill colour, or the stroke colour with no fill.',
      '`y` is the baseline: the line the letters sit on. `ce.draw.pixelText()` takes the top-left corner.',
      'Returns true; no control to draw on: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'x', type: 'number', required: true, kind: 'number', summary: 'Left end, centre or right end of the text, by align, in pixels from the control\'s left.' },
      { name: 'y', type: 'number', required: true, kind: 'number', summary: 'Baseline, in pixels from the control\'s top.' },
      { name: 'text', type: 'string', required: true, summary: 'The text.\nA number: written as text.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: size 12, left-aligned, the control\'s font.', fields: optionFields([
        { name: 'size', type: 'number', default: '12', unit: 'pixels', sample: '12', summary: 'Text size in pixels.\nRange: > 0.\n≤ 0, or invalid: default.' },
        { name: 'align', type: 'text', default: '"left"', values: ['left', 'middle', 'right'],
          summary: 'Which part of the text sits at x: "left", "middle" or "right". Case-insensitive.\n"center", "centre" and "centred": "middle".\nInvalid: rejected with a console error.' },
        { name: 'family', type: 'text', sample: '"Inter Tight"', kind: 'font', summary: 'Font family.\nLeft out: the control\'s font.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}")$0', javascript: 'ce.draw.text(${1:4}, ${2:12}, "${3:hello}");$0' },
  },
  {
    id: 'drawRedraw', category: 'Drawing', signature: 'drawRedraw([target])',
    summary: 'Run onDraw again for a control.',
    example: '`drawRedraw()` in onTimer redraws the control the script is attached to every tick.',
    notes: [
      'Nothing is redrawn on its own: to animate, call this from onTimer.',
      'Returns true; unknown control, or no control to redraw: rejected with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'target', type: 'string', required: false, kind: 'control', summary: 'The control\'s name.\nLeft out: the control the script is attached to.' }],
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
    summary: 'Create a control of a type, and give back its name.',
    example: '`ce.panel.create("Knob", { name = "Cutoff", x = 20, y = 40 })` makes a knob called Cutoff at 20, 40.',
    notes: [
      'Returns its name. Rejected: no result, with a console error; nothing is created.',
      'A control a script creates is not saved with the panel, and is cleared before each `onPanelBuild`, which is where to create it.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'type', type: 'string', required: true, summary: 'The control\'s type, such as "Knob": one of `ce.panel.types()`. Case-insensitive.\nNot a type, or left out: rejected with a console error.', kind: 'componentType' },
      { name: 'props', type: 'object', required: false, summary: 'Its name, place, size and container, and any of its sections\' settings: the options below.\nLeft out: the type\'s own, at the top level.', fields: optionFields([
        'controlName', 'controlX', 'controlY', 'controlWidth', 'controlHeight', 'controlParent',
        'controlSection',
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
    summary: 'Copy a control, with all its settings, and give back the copy\'s name.',
    example: '`ce.panel.clone("Cutoff", { name = "Cutoff2", y = 120 })` makes a copy of Cutoff called Cutoff2, at y 120.',
    notes: [
      'Returns the copy\'s name. Rejected: no result, with a console error; nothing is copied.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'name', type: 'string', required: true, summary: 'The control to copy.\nNot a control, or left out: rejected with a console error.', kind: 'control' },
      { name: 'props', type: 'object', required: false, summary: 'As `ce.panel.create()`\'s: the options below.\nLeft out: a copy called its name with "_copy" added, in the same container.', at: 'name', fields: optionFields([
        { like: 'controlName', default: 'the original\'s name with _copy added' },
        'controlX', 'controlY', 'controlWidth', 'controlHeight',
        { like: 'controlParent', default: 'the original\'s container' },
        'controlSection',
      ]) },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.clone("${1:template}", { name = "${2:copy}", y = 120 })$0',
      javascript: 'ce.panel.clone("${1:template}", { name: "${2:copy}", y: 120 });$0',
    },
  },
  {
    id: 'panelDestroy', category: 'Panel structure', signature: 'panelDestroy(name)',
    summary: 'Remove a control, and everything inside it.',
    example: '`ce.panel.destroy("Cutoff")` removes the control called Cutoff.',
    notes: [
      'Any control: placed in the editor or made by a script.',
      'Returns true when it was removed; false when there was no control of that name.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: false, without a word.\nLeft out: rejected with a console error.', kind: 'control' }],
    scopes: 'any',
    snippet: { lua: 'ce.panel.destroy("${1:name}")$0', javascript: 'ce.panel.destroy("${1:name}");$0' },
  },
  {
    id: 'panelParent', category: 'Panel structure', signature: 'panelParent(name [, containerName])',
    summary: 'Move a control into a container, or out to the top level of the panel.',
    example: '`ce.panel.parent("Cutoff", "Row")` moves Cutoff into the container called Row.',
    notes: [
      'Returns true when it moved. Rejected: false, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'name', type: 'string', required: true, summary: 'The control to move.\nNot a control, or left out: rejected with a console error.', kind: 'control' },
      { name: 'containerName', type: 'string', required: false, summary: 'A control with a Children section, such as a Container or a Group.\nLeft out, or "": the top level of the panel.\nNot a control, not a container, or the control itself or one inside it: rejected with a console error.', kind: 'control' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.panel.parent("${1:knob}", "${2:row}")$0', javascript: 'ce.panel.parent("${1:knob}", "${2:row}");$0' },
  },
  {
    id: 'panelFind', category: 'Panel structure', signature: 'panelFind([query])',
    summary: 'List the names of the controls that match a query.',
    example: '`ce.panel.find({ type = "Knob" })` gives the name of every knob.',
    notes: [
      'Containers and the controls inside them are both listed.',
      'Returns a list of names, in panel order. Rejected: an empty list, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'query', type: 'object', required: false, summary: 'Part of a name, in any case; or a table of the filters below, every one of which must match.\nLeft out: every control.\nAnything else, or a filter it does not have: rejected with a console error.', fields: optionFields([
      { name: 'name', type: 'text', sample: '"osc"', summary: 'Part of a name, in any case.' },
      { name: 'type', type: 'text', sample: '"Knob"', summary: 'A control type, such as "Knob": one of ce.panel.types(). Case-insensitive.\nNot a type: rejected with a console error.' },
      { name: 'generated', type: 'true or false',
        summary: 'Whether a script made the control.\ntrue: only the controls a script made.\nfalse: only the ones placed in the editor.\nNot true or false, such as the text "true": rejected with a console error.' },
      { name: 'parent', type: 'text', sample: '"row1"',
        summary: 'A container\'s name, in any case: only the controls directly inside it.' },
    ]) }],
    scopes: 'any',
    snippet: {
      lua: 'for _, n in ipairs(ce.panel.find({ type = "${1:Knob}" })) do\n  $0\nend',
      javascript: 'for (const n of ce.panel.find({ type: "${1:Knob}" })) {\n  $0\n}',
    },
  },
  {
    id: 'panelInfo', category: 'Panel structure', signature: 'panelInfo(name)',
    summary: 'Describe a control: its name, id, type, place, size and container, and whether a script made it.',
    example: '`ce.panel.info("Cutoff").type` gives "Knob".',
    notes: [
      'Returns { name, id, type, x, y, width, height, parent, generated }. `x` and `y` are from its container\'s corner; `ce.panel.rect()` gives its place on the panel.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: no result, without a word.\nLeft out: rejected with a console error.', kind: 'control' }],
    scopes: 'any',
    snippet: { lua: 'local c = ce.panel.info("${1:name}")$0', javascript: 'const c = ce.panel.info("${1:name}");$0' },
  },
  {
    id: 'panelTypes', category: 'Panel structure', signature: 'panelTypes()',
    summary: 'List every control type `ce.panel.create()` takes.',
    example: '`ce.panel.types()` gives { "Background", "Label", "Button", … }.',
    notes: [
      'Returns a list of type names.',
    ],
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
    refusal: 'zero',
    summary: 'Line controls up on one edge or centre line.',
    example: '`ce.panel.align({ "Cutoff", "Res" }, "top")` lines up the tops of Cutoff and Res.',
    notes: [
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list, or one name.\nA name that is not a control: said in the console, and skipped.\nNo control: rejected with a console error.' },
      { name: 'edge', type: 'string', required: true, summary: '"left", "right", "top" or "bottom": that edge.\n"hCenter": the centre line across; "vCenter": the centre line down.\nCase-insensitive.\nInvalid: rejected with a console error.', values: LAYOUT_WORDS.panelAlign.values },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: each its default.', fields: optionFields([
        { name: 'to', type: 'text', default: 'the box the whole group occupies', sample: '"cutoff"',
          summary: 'One of the names given: the others line up on it, the canvas\'s key object.\nNot one of the names: rejected with a console error.' },
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
    refusal: 'zero',
    summary: 'Space controls out evenly between the first and the last.',
    example: '`ce.panel.distribute({ "A", "B", "C" }, "hSpacing")` makes the gaps between A, B and C equal.',
    notes: [
      'The first and the last stay where they are, unless `opts.gap` is given.',
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list of two or more.\nA name that is not a control: said in the console, and skipped.\nFewer than two controls: rejected with a console error.' },
      { name: 'what', type: 'string', required: true, summary: '"leftEdges", "hCenters", "rightEdges", "topEdges", "vCenters" or "bottomEdges": those positions evened out.\n"hSpacing" or "vSpacing": the gaps between them evened out, for controls of different sizes.\nCase-insensitive.\nInvalid: rejected with a console error.', values: LAYOUT_WORDS.panelDistribute.values },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: each its default.', fields: optionFields([
        { name: 'gap', type: 'number', default: 'worked out from the space available', sample: '12',
          unit: 'pixels',
          summary: 'Pixels between one control and the next, with "hSpacing" or "vSpacing": the last control moves too.\nNot a number: as left out, with a console warning the first time.' },
        // true is all distributePatches acts on (alignOpposite). This was typed as text, sampled
        // "top" and said it took ce.panel.align's words, every one of which did nothing.
        { name: 'align', type: 'true or false', default: 'false',
          summary: 'With "hSpacing" or "vSpacing" only.\ntrue: also lined up across: every top edge level with the leftmost control\'s, or every left edge with the topmost\'s.\nAnything but true, such as "top": not.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelMatch', category: 'Panel structure', signature: 'panelMatch(names, what [, opts]) -> number',
    refusal: 'zero',
    summary: 'Make controls the same width, height, or both.',
    example: '`ce.panel.match({ "A", "B" }, "both")` gives B the size of A.',
    notes: [
      'Returns how many controls it sized, whether or not they changed. Rejected: 0, with a console error; nothing changes.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list of two or more.\nA name that is not a control: said in the console, and skipped.\nFewer than two controls: rejected with a console error.' },
      { name: 'what', type: 'string', required: true, summary: '"width", "height" or "both".\nCase-insensitive.\nInvalid: rejected with a console error.', values: LAYOUT_WORDS.panelMatch.values },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: each its default.', fields: optionFields([
        { name: 'to', type: 'text', default: 'the first name you gave', sample: '"cutoff"',
          summary: 'One of the names given: the others take its size, and it keeps its own.\nNot one of the names: rejected with a console error.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelGrid', category: 'Panel structure', signature: 'panelGrid(names [, opts]) -> number',
    refusal: 'zero',
    summary: 'Arrange controls in a grid of equal cells, each as big as the largest.',
    example: '`ce.panel.grid(pads, { columns = 4 })` lays the pads out four to a row.',
    notes: [
      'In reading order, not the order listed: top to bottom, then left to right; controls within about 20 pixels of the same height are one row.',
      'The first in that order stays where it is, and the grid grows from there.',
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list of two or more.\nA name that is not a control: said in the console, and skipped.\nFewer than two controls: rejected with a console error.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: each its default.', fields: optionFields([
        { name: 'columns', type: 'number', default: '3',
          summary: 'Controls to a row.\nA fraction: rounded.\nBelow 1: 1, with a console warning the first time.\nNot a number: 3, with a console warning the first time.' },
        { name: 'gapX', type: 'number', default: '10', unit: 'pixels',
          summary: 'Pixels between columns.\nNot a number: 10, with a console warning the first time.' },
        { name: 'gapY', type: 'number', default: '10', unit: 'pixels',
          summary: 'Pixels between rows.\nNot a number: 10, with a console warning the first time.' },
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
    refusal: 'zero',
    summary: 'Arrange controls evenly round a circle, in the order listed.',
    example: '`ce.panel.circle(knobs, { radius = 80 })` sets the knobs round a circle of radius 80.',
    notes: [
      'Centred on the middle of the box they fill now; each control\'s centre on the circle.',
      '0 degrees is three o\'clock here, where `ce.draw.arc()` has twelve.',
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list of two or more.\nA name that is not a control: said in the console, and skipped.\nFewer than two controls: rejected with a console error.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: each its default.', fields: optionFields([
        { name: 'radius', type: 'number', default: '100', unit: 'pixels',
          summary: 'Pixels from the centre to each control\'s centre.\nBelow 0: rejected with a console error.\nNot a number: 100, with a console warning the first time.' },
        { name: 'startAngle', type: 'number', default: '0', unit: 'degrees', hint: '0 is three o\'clock, increasing clockwise',
          summary: 'Degrees, clockwise from three o\'clock: where the first control goes.\nNot a number: 0, with a console warning the first time.' },
      ]) },
    ],
    scopes: 'any',
  },
  {
    id: 'panelFlip', category: 'Panel structure', signature: 'panelFlip(names, axis) -> number',
    summary: 'Mirror the positions of controls across the middle of the box they fill.',
    example: '`ce.panel.flip({ "A", "B" }, "horizontal")` swaps A and B left for right.',
    notes: [
      'Only their places change: the controls are not turned.',
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list of two or more.\nA name that is not a control: said in the console, and skipped.\nFewer than two controls: rejected with a console error.' },
      { name: 'axis', type: 'string', required: true, summary: '"horizontal": left and right swap.\n"vertical": top and bottom swap.\nCase-insensitive.\nInvalid: rejected with a console error.', values: LAYOUT_WORDS.panelFlip.values },
    ],
    scopes: 'any',
  },
  {
    id: 'panelRect', category: 'Panel structure', signature: 'panelRect(name) -> table',
    summary: 'Get a control\'s box on the panel, or the box around several.',
    example: '`ce.panel.rect("Cutoff").right` gives Cutoff\'s right edge, in panel pixels.',
    notes: [
      'Returns { x, y, width, height, right, bottom }, from the panel\'s corner: a container\'s offset included, which Transform.x and Transform.y leave out.',
      'Rejected: no result, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'name', type: 'text or list', required: true, summary: 'A control\'s name, or a list of names.\nA name that is not a control: said in the console, and skipped.\nNo control: rejected with a console error.' }],
    scopes: 'any',
  },
  {
    id: 'panelOrder', category: 'Panel structure', signature: 'panelOrder(names, where) -> number',
    summary: 'Bring controls to the front, or send them to the back, among the controls in their container.',
    example: '`ce.panel.order({ "Glow" }, "back")` draws Glow behind the other controls in its container.',
    notes: [
      'A control later in its container is drawn over the ones before it.',
      'Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'names', type: 'list', required: true, summary: 'Control names: a list, or one name.\nA name that is not a control: said in the console, and skipped.\nNo control: rejected with a console error.' },
      { name: 'where', type: 'string', required: true, summary: '"front": over all the others.\n"forward": over one more.\n"backward": under one more.\n"back": under all the others.\nCase-insensitive.\nInvalid: rejected with a console error.', values: LAYOUT_WORDS.panelOrder.values },
    ],
    scopes: 'any',
  },
  {
    id: 'panelBatch', category: 'Panel structure', signature: 'panelBatch(fn) -> boolean',
    summary: 'Make a set of changes count as one step, so one undo takes them all back.',
    example: '`ce.panel.batch(function() ce.panel.grid(pads) end)` makes the grid one undo step.',
    notes: [
      { text: 'Code after an `await` in the function is not part of the batch.', check: 'noAwait' },
      'The panel shows the changes together when the function ends. Code inside it already sees its own earlier changes.',
      'The exported plugin has no undo: there the function just runs.',
      'Returns true. Rejected: false, with a console error; nothing runs.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'fn', type: 'function', required: true, summary: 'The function that makes the changes: run at once.\nIf it fails with an error: the step is closed all the same.\nNot a function, or left out: rejected with a console error.' }],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.batch(function()\n  $0\nend)',
      javascript: 'ce.panel.batch(() => {\n  $0\n});',
    },
  },
  {
    id: 'panelKeep', category: 'Panel structure', signature: 'panelKeep([path]) -> boolean',
    summary: 'Keep a change made in preview, so it stays when preview stops.',
    example: '`ce.panel.keep("Cutoff.Background.Fill.colour")` keeps the colour a script gave Cutoff\'s fill.',
    notes: [
      'Preview is a rehearsal: when it stops, the panel goes back to how it was built, and a script\'s changes with it.',
      'A control a script made cannot be kept: the next run makes it again.',
      'Returns true when something was kept; false when nothing could be, as when the panel is not previewing.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [{ name: 'path', type: 'path', required: false, summary: 'A property\'s path, as `set()` takes it.\nLeft out: every change this run made.' }],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.keep("${1:Cutoff.Background.Fill.colour}")$0',
      javascript: 'ce.panel.keep("${1:Cutoff.Background.Fill.colour}")$0',
    },
  },
  {
    id: 'panelEntries', category: 'Panel structure', signature: 'panelEntries(control, section)',
    summary: 'List the names of the entries in one of a control\'s collection sections.',
    example: '`ce.panel.entries("Cutoff", "States")` gives { "Hover", "Pressed", … }.',
    notes: [
      'Returns the names, in the control\'s order. Rejected: an empty list, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'section', type: 'string', required: true, summary: 'One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.\nAny other: rejected with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'for _, s in ipairs(ce.panel.entries("${1:knob}", "States")) do log(s) end$0',
      javascript: 'for (const s of ce.panel.entries("${1:knob}", "States")) log(s);$0',
    },
  },
  {
    id: 'panelEntry', category: 'Panel structure', signature: 'panelEntry(control, section, name)',
    summary: 'Get one entry of a collection section, by its name.',
    example: '`ce.panel.entry("Cutoff", "States", "Hover")` gives Cutoff\'s Hover state.',
    notes: [
      'Returns the entry as a table. Rejected: no result, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'section', type: 'string', required: true, summary: 'One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.\nAny other: rejected with a console error.' },
      { name: 'name', type: 'string', required: true, summary: 'The entry\'s name. Case-insensitive.\nNot one of the section\'s: no result, without a word.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local st = ce.panel.entry("${1:knob}", "States", "${2:Hover}")$0',
      javascript: 'const st = ce.panel.entry("${1:knob}", "States", "${2:Hover}");$0',
    },
  },
  {
    id: 'panelDefine', category: 'Panel structure', signature: 'panelDefine(control, section, name, spec)',
    summary: 'Add an entry to a collection section, or replace the one of that name.',
    example: '`ce.panel.define("Cutoff", "States", "Held", { when = { pressed = true } })` adds a state that applies while Cutoff is pressed.',
    notes: [
      'A new state has no condition and no changes; it applies while its `when` flags hold and its `rule` is true, such as `rule = "value > 64"`.',
      'A new animation is a 120 ms change into hover and back; with `kind = "keyframes"`, one that plays all the time over the frames given.',
      'Returns true when it was written. Rejected: false, with a console error; nothing is defined.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'section', type: 'string', required: true, summary: 'One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.\nAny other: rejected with a console error.' },
      { name: 'name', type: 'string', required: true, summary: 'The entry\'s name. Case-insensitive: one of that name is replaced.' },
      { name: 'spec', type: 'object', required: false, summary: 'The entry\'s settings, only those to set: the rest are the section\'s defaults.\nA key the section\'s entries do not have, in any case: rejected with a console error that lists the ones they take.\nLeft out: every setting its default.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.define("${1:knob}", "States", "${2:Held}", { when = { pressed = true } })$0',
      javascript: 'ce.panel.define("${1:knob}", "States", "${2:Held}", { when: { pressed: true } });$0',
    },
  },
  {
    id: 'panelUndefine', category: 'Panel structure', signature: 'panelUndefine(control, section, name)',
    summary: 'Remove an entry from a collection section.',
    example: '`ce.panel.undefine("Cutoff", "States", "Disabled")` removes Cutoff\'s Disabled state.',
    notes: [
      '`set(path, nil)` does not remove an entry: this does.',
      'Returns true when it was removed; false when there was none. Rejected: false, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'section', type: 'string', required: true, summary: 'One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.\nAny other: rejected with a console error.' },
      { name: 'name', type: 'string', required: true, summary: 'The entry\'s name. Case-insensitive.\nNot one of the section\'s: false, without a word.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.panel.undefine("${1:knob}", "States", "${2:Disabled}")$0',
      javascript: 'ce.panel.undefine("${1:knob}", "States", "${2:Disabled}");$0',
    },
  },
  {
    id: 'panelPatch', category: 'Panel structure', signature: 'panelPatch(control, state, patch [, part])',
    summary: 'Change how a control looks in one of its states, such as hovered or pressed.',
    example: '`ce.panel.patch("Cutoff", "Hover", { ["Background.Fill.colour"] = "red" })` turns Cutoff\'s fill red while it is hovered.',
    notes: [
      'This reaches the settings inside a state, which `set()` cannot.',
      'Returns how many settings were applied. Rejected: 0, with a console error.',
    ],
    runtime: RUNTIME_WEBVIEW,
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'state', type: 'string', required: true, summary: 'The state\'s name, as `ce.panel.entries(control, "States")` lists them.\nNot one of its states: rejected with a console error.' },
      { name: 'patch', type: 'object', required: true, summary: 'Property paths, such as "Background.Fill.colour", with their values in that state: added to what it changes already.\nA path in any case.\nA path that leads nowhere, a whole section, or a property its section lacks: not applied, with a console line saying why.\nA colour: stored as `set()` stores it; one it would refuse: rejected with a console error, and nothing is applied.', kind: 'patch', at: 'control' },
      { name: 'part', type: 'string', required: false, summary: 'One part of a custom component, to change in that state.\nNot one of its parts: rejected with a console error.' },
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
    summary: 'Read the tempo in beats per minute.',
    example: '`tempo()` gives 120 at 120 BPM.',
    notes: [
      'Returns the tempo; nothing supplying one: no result. Read it rather than assuming 120.',
    ],
    scopes: 'any',
    snippet: { lua: 'local bpm = tempo() or 120$0', javascript: 'const bpm = tempo() ?? 120;$0' },
  },
  {
    id: 'isPlaying', category: 'Time', signature: 'isPlaying()',
    summary: 'Read whether the transport is running.',
    example: '`ce.time.playing()` gives true while the transport runs.',
    notes: [
      'Returns true while running; stopped, or nothing supplying a transport: false.',
    ],
    scopes: 'any',
    snippet: { lua: 'if isPlaying() then $0 end', javascript: 'if (isPlaying()) { $0 }' },
  },
  {
    id: 'transportInfo', category: 'Time', signature: 'transportInfo()',
    summary: 'Read the whole transport state in one table.',
    example: '`ce.time.transport().bar` gives the current bar, counted from 1.',
    notes: [
      'Returns { playing, bpm, beats, bar, beat, beatsPerBar, source, valid }.',
      '`beats` counts quarter notes from the start (bar 1, beat 1); `bar` and `beat` count from 1.',
      '`source` names what drives the clock. `valid` false: nothing supplies a position, and the rest are defaults.',
    ],
    scopes: 'any',
    snippet: {
      lua: 'local t = ce.time.transport()\nif t.valid then log("bar " .. t.bar) end$0',
      javascript: 'const t = ce.time.transport();\nif (t.valid) log("bar " + t.bar);$0',
    },
  },
  {
    id: 'beatsToMs', category: 'Time', signature: 'beatsToMs(beats [, bpm])',
    summary: 'Convert beats to milliseconds.',
    example: '`beatsToMs(0.75)` gives 375 at 120 BPM.',
    notes: [
      'Returns milliseconds; no tempo to work from: no result.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'Length in beats (quarter notes).\nInvalid: 0.' },
      { name: 'bpm', type: 'number', required: false, unit: 'BPM', summary: 'Tempo to convert at.\nRange: > 0.\nLeft out, ≤ 0, or invalid: the transport\'s tempo.' },
    ],
    scopes: 'any',
    snippet: { lua: 'set("delayTime", beatsToMs(0.75))$0', javascript: 'set("delayTime", beatsToMs(0.75));$0' },
  },
  {
    id: 'msToBeats', category: 'Time', signature: 'msToBeats(ms [, bpm])',
    summary: 'Convert milliseconds to beats.',
    example: '`msToBeats(500)` gives 1 at 120 BPM.',
    notes: [
      'Returns beats (quarter notes); no tempo to work from: no result.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'Length in milliseconds.\nInvalid: 0.' },
      { name: 'bpm', type: 'number', required: false, unit: 'BPM', summary: 'Tempo to convert at.\nRange: > 0.\nLeft out, ≤ 0, or invalid: the transport\'s tempo.' },
    ],
    scopes: 'any',
    snippet: { lua: 'local beats = msToBeats(${1:500})$0', javascript: 'const beats = msToBeats(${1:500});$0' },
  },
  {
    id: 'syncTimer', category: 'Time', signature: 'syncTimer(id, beats [, opts])',
    summary: 'Start a repeating timer with an interval in beats.',
    example: '`syncTimer("step", 0.25)` runs onTimer with info.id "step" every sixteenth note.',
    notes: [
      'Works as `ce.time.startTimer()`: onTimer each time, `ce.time.stopTimer()` stops it.',
      'A tempo change changes the interval, and restarts the timer from that moment.',
      'Returns no value; rejected with a console error, or no tempo to work from: no timer is started.',
    ],
    params: [
      { name: 'id', type: 'string', required: true, kind: 'sharedName', summary: 'The timer\'s name, as onTimer\'s info.id reports it.\nLeft out, or "": rejected with a console error.' },
      { name: 'beats', type: 'number or division', required: true, kind: 'division',
        summary: 'Interval in beats, or a division name such as "1/16" or "1/8T" (any case).\nRange: > 0.\nText that is not a division, ≤ 0, or invalid: rejected with a console error.' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.\nLeft out: the interval follows the tempo.', fields: optionFields([
        { name: 'follow', type: 'true or false', default: 'true',
          summary: 'Follow the tempo: the interval changes with it.\nfalse: the interval stays as the tempo at the start gave it.\nInvalid: true.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'syncTimer("${1:step}", 0.25)$0', javascript: 'syncTimer("${1:step}", 0.25);$0' },
  },
  {
    id: 'afterBeats', category: 'Time', signature: 'afterBeats(beats, fn) -> id',
    summary: 'Run a function once, after a number of beats.',
    example: '`afterBeats(2, fn)` runs fn two beats from now.',
    notes: [
      'The delay is worked out from the tempo at the call; a later tempo change does not move it.',
      'Returns an id for `ce.time.stopTimer()`; rejected with a console error, or no tempo to work from: nothing is scheduled, no result.',
    ],
    params: [
      { name: 'beats', type: 'number or division', required: true, kind: 'division',
        summary: 'Delay in beats, or a division name such as "1/4" (any case).\nRange: ≥ 0.\n0: as soon as the handler has returned.\nText that is not a division, < 0, or invalid: rejected with a console error.' },
      { name: 'fn', type: 'function', required: true, summary: 'The function to run.\nNot a function: rejected with a console error.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'afterBeats(${1:2}, function()\n  $0\nend)',
      javascript: 'afterBeats(${1:2}, () => {\n  $0\n});',
    },
  },
  {
    id: 'runningTimers', category: 'Time', signature: 'runningTimers() -> list',
    summary: 'List the repeating timers that are running.',
    example: '`ce.time.timers()` gives {"blink", "step"} with those two running.',
    notes: [
      'Returns the ids of `ce.time.startTimer()` and `ce.time.syncTimer()` timers, sorted.',
      'One-off timers from `after()` and `afterBeats()` are not listed: their ids were returned when they were started.',
    ],
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
    summary: 'Read a clock in milliseconds, for measuring how long something takes.',
    example: '`ce.time.now() - t0` gives the milliseconds since t0 was read.',
    notes: [
      'Returns milliseconds. One reading alone means nothing: subtract an earlier reading to find how much time has passed.',
      'It is not the time of day or a date, and it does not jump when the computer\'s clock is changed.',
    ],
    scopes: 'any',
    snippet: { lua: 'local t0 = nowMs()$0', javascript: 'const t0 = nowMs();$0' },
  },
  {
    id: 'beatsPerDivision', category: 'Time', signature: 'beatsPerDivision(name) -> number',
    summary: 'Convert a note division to beats.',
    example: '`ce.time.division("1/16")` gives 0.25.',
    notes: [
      'The names the sequencer components use: "1/1" to "1/32", "D" dotted, "T" triplet; any case.',
      'Returns beats; not a division: rejected with a console error, no result.',
    ],
    params: [{ name: 'name', type: 'string', required: true, kind: 'division', summary: 'A division name: "1/16", "1/8T", "1/4D".\nAny case.\nInvalid: rejected with a console error.' }],
    scopes: 'any',
    snippet: { lua: 'local beats = beatsPerDivision("1/16")$0', javascript: 'const beats = beatsPerDivision("1/16");$0' },
  },
  {
    id: 'divisionNames', category: 'Time', signature: 'divisionNames() -> list',
    summary: 'List every note division.',
    example: '`ce.time.divisions()` gives 14 entries, "1/1" first.',
    notes: [
      'Returns { id, label, beats } per division, in menu order: "1/16", "16th", 0.25.',
    ],
    scopes: 'any',
    snippet: { lua: 'for _, d in ipairs(divisionNames()) do log(d.label) end$0', javascript: 'for (const d of divisionNames()) log(d.label);$0' },
  },
  {
    id: 'barBeatAt', category: 'Time', signature: 'barBeatAt(beats [, beatsPerBar]) -> table',
    summary: 'Convert a position in beats to bar, beat and tick.',
    example: '`ce.time.position(4.5)` gives bar 2, beat 1, tick 12, text "2.1.12".',
    notes: [
      'Returns { bar, beat, tick, text }: bars and beats from 1, ticks 0 ↔ 23 (24 per beat, as MIDI clock), text as the Transport shows it.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'beatsPerBar', type: 'number', required: false, unit: 'beats', summary: 'Beats in a bar.\nRange: ≥ 1.\nDefault: 4.\n< 1: 1.\nInvalid: default.' },
    ],
    scopes: 'any',
    snippet: { lua: 'log(barBeatAt(transportInfo().beats).text)$0', javascript: 'log(barBeatAt(transportInfo().beats).text);$0' },
  },
  {
    id: 'stepAt', category: 'Time', signature: 'stepAt(beats, division) -> number',
    summary: 'Find which step of a note grid a position is on.',
    example: '`ce.time.step(2.5, "1/16")` gives 10.',
    notes: [
      'Steps count from 0 at the start.',
      'Returns the step; rejected with a console error: no result.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'division', type: 'string', required: true, kind: 'division', summary: 'A division name, as `ce.time.division()` reads it.\nInvalid: rejected with a console error.' },
    ],
    scopes: 'any',
  },
  {
    id: 'stepsBetween', category: 'Time', signature: 'stepsBetween(from, to, division [, max]) -> table',
    summary: 'Find the grid steps that start between two positions.',
    example: '`ce.time.steps(0, 1, "1/16")` gives steps {1, 2, 3, 4}, dropped 0.',
    notes: [
      'Returns { steps, dropped }: the steps after from, up to and including to, and how many were left out.',
      'More than max crossed: the most recent are kept, the rest counted in dropped. Use it to catch up after a late update.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'from', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'to', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'division', type: 'string', required: true, kind: 'division', summary: 'A division name, as `ce.time.division()` reads it.\nInvalid: rejected with a console error.' },
      { name: 'max', type: 'number', required: false, unit: 'steps', summary: 'Most steps returned.\nRange: ≥ 1, whole.\nDefault: 16.\nA fraction: rounded.\n< 1: 1.\nInvalid: default.' },
    ],
    scopes: 'any',
  },
  {
    id: 'swingOffset', category: 'Time', signature: 'swingOffset(step, amount, division) -> number',
    summary: 'Find how far to delay a step for swing, in beats.',
    example: '`ce.time.swing(1, 0.5, "1/16")` gives 0.0625: step 1 is delayed a quarter of a step.',
    notes: [
      'Even steps (0, 2, 4…) stay; odd steps are delayed by up to half a step. Add it to the step\'s position.',
      'The Transport\'s own calculation, so a script\'s timing matches the panel\'s sequencers.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'step', type: 'number', required: true, unit: 'steps', summary: 'Step number.\nA fraction: rounded.\nInvalid: 0.' },
      { name: 'amount', type: 'number', required: true, unit: '0 to 1', summary: 'Swing amount.\nRange: 0 ↔ 1 (0: straight; 1: half a step).\nOutside the range: the nearest end.\nInvalid: 0.' },
      { name: 'division', type: 'string', required: true, kind: 'division', summary: 'A division name, as `ce.time.division()` reads it.\nInvalid: rejected with a console error.' },
    ],
    scopes: 'any',
  },
  {
    id: 'cycleAt', category: 'Time', signature: 'cycleAt(beats, bars [, beatsPerBar]) -> table',
    summary: 'Find where a position falls in a cycle of bars.',
    example: '`ce.time.cycle(6, 1)` gives phase 0.5, count 1, length 4.',
    notes: [
      'Returns { phase, count, length }: 0 ↔ 1 through the current cycle, whole cycles finished, and the cycle in beats.',
      'Worked out from the position each time, so it does not drift.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'bars', type: 'number', required: true, unit: 'bars', summary: 'Cycle length in bars.\nRange: 0.25 ↔ 64.\nOutside the range: the nearest end.\nInvalid: 0.25.' },
      { name: 'beatsPerBar', type: 'number', required: false, unit: 'beats', summary: 'Beats in a bar.\nRange: ≥ 1.\nDefault: 4.\n< 1: 1.\nInvalid: default.' },
    ],
    scopes: 'any',
  },
  {
    id: 'loopedBeats', category: 'Time', signature: 'loopedBeats(beats, startBeats, lengthBeats) -> table',
    summary: 'Fold a position into a loop.',
    example: '`ce.time.looped(13, 4, 8)` gives beats 5, pass 1.',
    notes: [
      'Returns { beats, pass }: the position inside the loop, and which time round, from 0.',
      'Before the loop start: the position unchanged, pass -1, so a count-in works.',
      'Worked out from the position each time, so it does not drift; a change of pass is a wrap.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'Position in beats from the start.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'startBeats', type: 'number', required: true, unit: 'beats', summary: 'Loop start in beats.\nRange: ≥ 0.\n< 0: 0.\nInvalid: 0.' },
      { name: 'lengthBeats', type: 'number', required: true, unit: 'beats', summary: 'Loop length in beats.\nRange: ≥ 0.01.\n< 0.01: 0.01.\nInvalid: 0.01.' },
    ],
    scopes: 'any',
  },
  {
    id: 'tapTempo', category: 'Time', signature: 'tapTempo(times [, resetMs]) -> number',
    summary: 'Work out a tempo from tap times.',
    example: '`ce.time.tap({1000, 1500, 2000, 2500})` gives 120.',
    notes: [
      'Only the taps since the last pause count: a gap longer than resetMs starts a new measurement.',
      'Returns BPM, 20 ↔ 300; fewer than two usable taps: no result.',
      'Rejected with a console error: no result.',
    ],
    params: [
      { name: 'times', type: 'list', required: true, summary: 'A list of tap times in milliseconds, as `ce.time.now()` gives them.\nAn item that is not a number above 0: left out.\nNot a list: rejected with a console error.' },
      { name: 'resetMs', type: 'number', required: false, unit: 'milliseconds', summary: 'Gap that starts a new measurement, in milliseconds.\nRange: > 0.\nDefault: 2000.\n≤ 0, or invalid: default.' },
    ],
    scopes: 'any',
  },
  {
    id: 'clockTempo', category: 'Time', signature: 'clockTempo(intervalsMs) -> number',
    summary: 'Work out a tempo from the gaps between MIDI clock pulses.',
    example: '`ce.time.clockTempo({20.8, 20.8, 20.9})` gives 120.',
    notes: [
      '24 pulses per beat, as between the 0xF8 messages `ce.midi.interceptIn()` sees; the median gap, so one late pulse does not move the result.',
      'Returns BPM, 20 ↔ 300; an empty list: no result.',
      'Rejected with a console error: no result.',
    ],
    params: [{ name: 'intervalsMs', type: 'list', required: true, summary: 'A list of gaps in milliseconds.\nAn item that is not a number above 0: left out.\nNot a list: rejected with a console error.' }],
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
    summary: 'Describe the device profile in use for a device.',
    example: '`deviceProfile().name` gives the main synth\'s profile name.',
    notes: [
      'Returns { id, name, role, connected, … }; no profile chosen: no result.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: {
      lua: 'local p = deviceProfile()\nif p then log("device " .. p.name) end$0',
      javascript: 'const p = deviceProfile();\nif (p) log("device " + p.name);$0',
    },
  },
  {
    id: 'deviceParameters', category: 'Device / MIDI', signature: 'deviceParameters([opts])',
    refusal: 'empty list',
    summary: 'List the synth\'s parameters, as the device profile describes them.',
    example: '`deviceParameters({ group = "Filter" })` lists the filter\'s parameters.',
    notes: [
      'Returns a list of { id, name, group, type, min, max, access }; none to show: an empty list.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'The options below, every one of which must match.\nLeft out: every parameter.\nNot a table: an empty list, with a console error.', fields: optionFields([
      'role',
      { name: 'query', type: 'text', sample: '"cutoff"',
        summary: 'Keep only parameters whose name or id contains this.' },
      { name: 'group', type: 'text', sample: '"Filter"',
        summary: 'Keep only one group, the way the synth itself files them — "Oscillator", '
          + '"Filter" and so on.' },
      { name: 'type', type: 'text', sample: '"number"',
        summary: 'Keep only one kind of parameter, such as "number" or "choice".' },
      { name: 'access', type: 'text', sample: '"writable"',
        summary: 'Keep only some parameters by what can be done with them: "writable", the ones the '
          + 'panel can send to the synth; "readonly", the ones the synth only reports; '
          + '"realtimeWarning", the ones not safe to move while notes are playing.\nAny other '
          + 'value: not filtered, with a console error.' },
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
    summary: 'Describe one of the synth\'s parameters, by its id.',
    example: '`deviceParameter("cutoff").max` gives the highest value cutoff takes.',
    notes: [
      'Returns { id, name, group, type, min, max, access }.',
      'Use it to see whether a synth has a parameter before writing it.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true, summary: 'The parameter\'s id, as the device profile names it.\nNot one of its parameters: no result, without a word.\nLeft out: no result, with a console error.', kind: 'deviceParameter' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
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
    summary: 'Read the last value the synth reported for a parameter.',
    example: '`deviceRead("cutoff")` gives the cutoff the synth last sent.',
    notes: [
      'Not a live query: what arrived in a dump or a parameter message; the synth is not asked.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true, summary: 'The parameter\'s id.\nNever reported: no result, without a word; not 0.\nLeft out: no result, with a console error.', kind: 'deviceParameter' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'local v = ce.device.read("${1:cutoff}")\nif v ~= nil then $0 end',
      javascript: 'const v = ce.device.read("${1:cutoff}");\nif (v !== undefined) { $0 }',
    },
  },
  {
    id: 'deviceWrite', category: 'Device / MIDI', signature: 'deviceWrite(id, value [, role]) -> boolean',
    summary: 'Change a parameter on the synth by its id, without a control.',
    example: '`deviceWrite("cutoff", 64)` sends cutoff 64 to the synth.',
    notes: [
      'The device profile builds the message.',
      'Returns true when the message was dispatched, not whether the synth took it. Rejected: false, with a console error; nothing is sent.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true, summary: 'The parameter\'s id, as the device profile names it or `deviceDefineParameter()` declared it.\nNot one of them: rejected with a console error.', kind: 'deviceParameter' },
      { name: 'value', type: 'number or text', required: true, summary: 'In the parameter\'s own units: those `deviceParameter()` gives the min and max of.\nA choice: its name, in any case, or its number.\nOne it cannot read: rejected with a console error.' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.write("${1:cutoff}", ${2:64})$0',
      javascript: 'ce.device.write("${1:cutoff}", ${2:64});$0',
    },
  },
  {
    id: 'deviceConnected', category: 'Device / MIDI', signature: 'deviceConnected([role])',
    summary: 'Check whether a device is connected and ready.',
    example: '`deviceConnected()` gives true once the main synth is.',
    notes: [
      'Quick to call: check it before asking for a dump.',
      'Returns true or false.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
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
    summary: 'Describe a synth parameter from the script.',
    example: '`deviceDefineParameter("cutoff", { cc = 74 })` declares cutoff as CC 74.',
    notes: [
      'For a synth with no device profile, or a parameter a profile has wrong.',
      'Returns true when it was defined. Rejected: false, with a console error; nothing is defined.',
    ],
    params: [
      { name: 'id', type: 'string', required: true, summary: 'The id to give it.\nOne the profile has: replaced, for this project.' },
      { name: 'spec', type: 'object', required: true, summary: 'How it reaches the synth, `cc`, `nrpn` or `sysex`, and the options below.\nAnything wrong in it: rejected with a console error saying what: no MIDI form, a byte that is not one, an unknown type, encoding, checksum or $token, or a range the MIDI form cannot carry.', fields: optionFields([
        { name: 'name', type: 'text', default: 'the id', sample: '"Cutoff"',
          summary: 'What to call it in the parameter list.' },
        { name: 'group', type: 'text', sample: '"Filter"', summary: 'Which group to file it under, such as "Filter".' },
        { name: 'type', type: 'text', default: '"number"',
          summary: 'What kind of value it holds: "number" (or "integer"), "boolean", "choice" (or '
            + '"enum") for one of `choices`, or "text" for a name read out of a dump, which cannot be '
            + 'written on its own. A number reads a number or decimal text such as "64". A boolean '
            + 'reads true or false, a number (0 is off, any other number is on), or "on", "off", '
            + '"true" or "false" in any case. Any case of the type is read; another type is refused.' },
        { name: 'min', type: 'number', default: '0',
          summary: 'The lowest value it accepts. Nothing here sends a negative number, so a minimum '
            + 'below 0 is refused: declare what the synth receives and add the offset in your script '
            + 'with ce.midi.toOffset.' },
        { name: 'max', type: 'number', default: '127',
          summary: 'The highest value it accepts, up to what the MIDI form carries: 127 for a CC or '
            + 'one SysEx byte, 16383 for an NRPN or "u14". With choices given as names it is the last '
            + 'one\'s value unless you say otherwise. A higher maximum is refused.' },
        { name: 'access', type: 'text', default: '"readwrite"',
          summary: 'Whether the synth lets you read this parameter, write it, or both.' },
        { name: 'choices', type: 'list of text',
          summary: 'The settings, in order, when the parameter is a choice: their names, each worth '
            + 'its position plus `min` (so { "LP", "HP", "BP" } sends 0, 1 and 2), or { id, value } '
            + 'pairs. write() takes a name in any case, or the number itself; another name is '
            + 'refused, with the choices listed.' },
        { name: 'trueValue', type: 'number', default: '1',
          summary: 'What a boolean sends when it is on.' },
        { name: 'falseValue', type: 'number', default: '0',
          summary: 'What a boolean sends when it is off.' },
        { name: 'cc', type: 'number', unit: '0 to 127', sample: '74', group: 'how it reaches the synth — pick one',
          summary: 'Send it as this CC number, 0 to 127. The simplest of the three wire formats.' },
        // `fields` here are msb and lsb, which the check of option keys reads one level down, in
        // every runtime: { mbs = 1 } was accepted and sent MSB 0.
        { name: 'nrpn', type: 'object', group: 'how it reaches the synth — pick one',
          summary: 'Send it as an NRPN, as { msb, lsb } or the two numbers as a list.',
          fields: [
            { name: 'msb', type: 'number', unit: '0 to 127', summary: 'The parameter number\'s high byte (CC 99).' },
            { name: 'lsb', type: 'number', unit: '0 to 127', summary: 'The parameter number\'s low byte (CC 98).' },
          ] },
        { name: 'sysex', type: 'text or list', group: 'how it reaches the synth — pick one', kind: 'bytes', template: true,
          summary: 'Send it as a SysEx message built from this template, a list or text such as '
            + '"F0 41 10 $value F7". Each entry is one byte, a number from 0 to 255 or one or two hex '
            + 'digits, or one of the tokens $value, $deviceId (16 unless `variables` says otherwise), '
            + '$channel, $checksumStart, $checksum, or any $name you listed in `variables`. Anything '
            + 'else is refused. The checksum covers everything after F0 unless $checksumStart says '
            + 'where it begins. A Roland checksum covers only the address and the data, so a Roland '
            + 'template (41 after F0) with $checksum and no $checksumStart is defined with a warning.' },
        { name: 'channel', type: 'number', unit: '1 to 16', default: '1',
          summary: 'The MIDI channel to send on, 1 to 16. In a SysEx template it is what $channel '
            + 'puts there.' },
        { name: 'encoding', type: 'text', default: '"u7"', sample: '"to14bit"',
          summary: 'How the number is packed into a SysEx template\'s $value: "u7" is one byte, '
            + '"u14" two, most significant first, as ce.midi.to14bit gives them ("to14bit" is read as '
            + 'the same), and "nibbled" is `nibbles` 4-bit nibbles, most significant first. '
            + '"boolean-u7", the device profiles\' name for a switch\'s byte, is one byte too. Any case '
            + 'is read; another name is refused.' },
        { name: 'nibbles', type: 'number', default: '2',
          summary: 'How many nibbles a "nibbled" value takes, 1 to 8.' },
        { name: 'checksum', type: 'text', default: '"roland"', sample: '"xor-7bit"',
          summary: 'Which checksum $checksum puts in the template: any of ce.midi.checksum\'s names, '
            + 'in any case, computed the same way. One wider than a byte, such as a CRC, takes as '
            + 'many bytes as it needs. An unknown name is refused, with the names listed.' },
        { name: 'variables', type: 'object',
          summary: 'Extra named bytes your SysEx template can refer to as $name, such as an address '
            + 'or a part number. Each is a number from 0 to 255, or one or two hex digits as text.' },
        // Read by both runtimes (deviceDefinitions.js, ScriptRuntime::defineDeviceParameter) and
        // listed nowhere, so the check of option keys would have refused them.
        { name: 'length', type: 'number', default: '0',
          summary: 'For a text parameter, how many characters it holds.' },
        { name: 'pad', type: 'number', default: '32',
          summary: 'For a text parameter, the character code that fills it out to `length` (32 is '
            + 'a space).' },
      ]) },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
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
    summary: 'Describe a SysEx dump layout from the script.',
    example: '`deviceDefineDump("patch", { request = "F0 7D 01 F7", match = { prefix = "F0 7D 02" }, offset = 3, fields = { { parameter = "cutoff", offset = 0 } } })` declares a patch dump that starts with cutoff.',
    notes: [
      'Every field\'s parameter must be declared with `deviceDefineParameter()` first.',
      'A dump of the layout arriving fills the bound controls and runs `onDumpReceived`, as a device profile\'s does.',
      'Returns true when it was defined. Rejected: false, with a console error; nothing is defined.',
    ],
    params: [
      { name: 'kind', type: 'string', required: true, summary: 'The name to give the dump, as `requestDump()` and `buildDump()` take it.' },
      { name: 'spec', type: 'object', required: true, summary: 'The options below: the bytes that ask for it, how to recognise it, and where each value sits.\nBytes are read as `deviceDefineParameter()` reads them.\nAnything wrong in it, or no prefix to recognise it by: rejected with a console error saying what.', fields: optionFields([
        { name: 'name', type: 'text', default: 'the kind', sample: '"Patch"',
          summary: 'What to call this dump where it is listed.' },
        { name: 'request', type: 'text or list',
          summary: 'The bytes that ask the synth for it, a list or text such as "F0 7D 00 F7", one '
            + 'byte to an entry.' },
        { name: 'match', type: 'object', required: true,
          summary: 'How to recognise the reply, as { prefix, suffix } — the bytes a matching '
            + 'message starts and ends with, which may include $deviceId (16) and $channel (1). A '
            + 'layout with no prefix is refused, because it would match every SysEx that arrives.',
          fields: [
            { name: 'prefix', type: 'text or list', summary: 'The bytes a matching message starts with.' },
            { name: 'suffix', type: 'text or list', summary: 'The bytes a matching message ends with.' },
          ] },
        // Both runtimes read these at the top level when `match` does not give them.
        { name: 'prefix', type: 'text or list',
          summary: 'The same as `match.prefix`, used when `match` does not give one.' },
        { name: 'suffix', type: 'text or list',
          summary: 'The same as `match.suffix`, used when `match` does not give one.' },
        { name: 'offset', type: 'number', default: '0',
          summary: 'How many bytes in from the start of the message the values begin.' },
        { name: 'size', type: 'number', default: 'whatever is left', sample: '256',
          summary: 'How many bytes of values there are.' },
        { name: 'checksum', type: 'text or object', sample: '"roland-7bit"',
          summary: 'Which checksum the message carries, so it is checked on the way in and computed '
            + 'by buildDump: any of ce.midi.checksum\'s names. Named alone, it sits just before the '
            + 'suffix (at the end when there is none) and covers every byte from the end of the '
            + 'prefix up to it, which is the Roland layout when the prefix is the header. Anywhere '
            + 'else, give { type, fromOffset, toOffset, byteOffset }, counted from the start of the '
            + 'message; any you leave out are placed as for a name. An unknown name is refused.' },
        { name: 'fields', type: 'list of objects', required: true,
          summary: 'Where each value sits among those bytes, one { parameter, offset } per '
            + 'value. Every parameter must already be declared with defineParameter; an unknown '
            + 'name is refused.' },
      ]) },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
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
    summary: 'Connect a control to a synth parameter, so moving the control changes it.',
    example: '`deviceBind("Cutoff", "cutoff")` makes the control Cutoff send the synth\'s cutoff.',
    notes: [
      'It replaces a binding on the same port, and switches the control\'s device binding back on.',
      'Returns true when bound. Rejected: false, with a console error.',
    ],
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'parameterId', type: 'string', required: true, summary: 'The parameter\'s id, as the device profile names it or `deviceDefineParameter()` declares it.\nNot one either knows yet: bound all the same, with a console warning; it works if the parameter arrives.', kind: 'deviceParameter' },
      { name: 'opts', type: 'object', required: false, summary: 'The options below.', fields: optionFields([
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
    summary: 'Disconnect a control from its synth parameter.',
    example: '`deviceUnbind("Cutoff")` stops Cutoff sending to the synth.',
    notes: [
      'Returns true when there was a binding to remove, false when not. Rejected: false, with a console error.',
    ],
    params: [
      { name: 'control', type: 'string', required: true, summary: 'The control\'s name.\nNot a control: rejected with a console error.', kind: 'control' },
      { name: 'port', type: 'string', required: false, summary: 'The port to disconnect.\nLeft out: "value".' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.unbind("${1:cutoffKnob}")$0',
      javascript: 'ce.device.unbind("${1:cutoffKnob}");$0',
    },
  },
  {
    id: 'devicePorts', category: 'Device / MIDI', signature: 'devicePorts([opts]) -> list',
    summary: 'List the MIDI ports.',
    example: '`devicePorts({ direction = "out" })` lists the ports that send.',
    notes: [
      'Returns a list of { id, name, direction, type, hardware, role }.',
      '`hardware` is false for the two the app always shows, "No MIDI Input" and "Preview Only"; `role` names the device using the port, or is "".',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'opts', type: 'object', required: false, summary: 'The option below.\nLeft out: every port.\nNot a table: an empty list, with a console error.', fields: optionFields([
      { name: 'direction', type: 'text', values: ['in', 'out'],
        summary: '"in": only the ports that receive.\n"out": only the ones that send.\nCase-insensitive.\nAnything else: every port, with a console warning the first time.' },
    ]) }],
    scopes: 'any',
    snippet: {
      lua: 'for _, p in ipairs(ce.device.ports({ direction = "out" })) do\n  if p.hardware then log(p.name) end\nend$0',
      javascript: 'for (const p of ce.device.ports({ direction: "out" })) if (p.hardware) log(p.name);$0',
    },
  },
  {
    id: 'deviceVariables', category: 'Device / MIDI', signature: 'deviceVariables([role]) -> table',
    summary: 'Read the values the device profile fills into its messages.',
    example: '`deviceVariables().deviceId` gives the device id the panel sends.',
    notes: [
      'Returns `channel`, `deviceId` and any others the profile has, with this project\'s settings applied; no profile chosen: no result.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: {
      lua: 'log("device id " .. tostring(ce.device.variables().deviceId))$0',
      javascript: 'log(`device id ${ce.device.variables().deviceId}`);$0',
    },
  },
  {
    id: 'deviceSetVariable', category: 'Device / MIDI',
    signature: 'deviceSetVariable(name, value [, role]) -> boolean',
    summary: 'Change one of the values the device profile fills into its messages, for this project.',
    example: '`deviceSetVariable("deviceId", 17)` talks to a second unit of the same synth.',
    notes: [
      'Saved with this project: the shared device profile is not changed, so two panels can use different device ids for one synth.',
      'Returns true when it was set. Rejected: false, with a console error; nothing changes. A device no profile is chosen for: rejected.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'name', type: 'string', required: true, summary: 'The value\'s name, such as "deviceId" or "channel".\nLeft out: rejected with a console error.' },
      { name: 'value', type: 'number', required: true, summary: 'A number.\nRange: 0 ↔ 127, whole; a channel 1 ↔ 16.\nA fraction: rounded.\nOutside the range: the nearest end, with a console warning the first time.\nText that is not a number: rejected with a console error.' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'ce.device.setVariable("deviceId", 17)$0',
      javascript: 'ce.device.setVariable("deviceId", 17);$0',
    },
  },
  {
    id: 'deviceTiming', category: 'Device / MIDI', signature: 'deviceTiming([role]) -> table',
    summary: 'Read how fast the panel may send to the device.',
    example: '`deviceTiming().minDelayBetweenMessagesMs` gives the least gap between messages.',
    notes: [
      'Returns `minDelayBetweenMessagesMs` and any other timing the device profile sets, with this project\'s settings applied.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: {
      lua: 'log("gap " .. tostring(ce.device.timing().minDelayBetweenMessagesMs) .. " ms")$0',
      javascript: 'log(`gap ${ce.device.timing().minDelayBetweenMessagesMs} ms`);$0',
    },
  },
  {
    id: 'deviceSetTiming', category: 'Device / MIDI',
    signature: 'deviceSetTiming(name, ms [, role]) -> boolean',
    summary: 'Change one timing setting, for this project.',
    example: '`deviceSetTiming("minDelayBetweenMessagesMs", 20)` leaves at least 20 ms between messages.',
    notes: [
      'Saved with this project: the device profile is not changed.',
      'Returns true when it was set. Rejected: false, with a console error. A device no profile is chosen for: rejected.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'name', type: 'string', required: true, summary: 'The setting\'s name, as `deviceTiming()` lists it. Case-insensitive.\nNot one of them, or left out: nothing is changed, with a console error.' },
      { name: 'ms', type: 'number', required: true, summary: 'Milliseconds.\nRange: 0 ↔ 60000, whole.\nA fraction: rounded.\nOutside the range: the nearest end, with a console warning the first time.' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
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
    summary: 'Read what the device profile says it supports.',
    example: '`deviceCoverage("realtimeEditing")` gives "complete", "partial" or "notImplemented".',
    notes: [
      'A profile can answer in words of its own: check for the ones that matter.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'feature', type: 'string', required: false, summary: 'A feature\'s name, such as "singleParameterWrite", "realtimeEditing" or "editBufferDumpParse".\nLeft out: every feature, as a table.\nNot one the profile names: no result.' },
      { name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'if ce.device.coverage("singleParameterWrite") == "complete" then log("write one at a time") end$0',
      javascript: 'if (ce.device.coverage("singleParameterWrite") === "complete") log("write one at a time");$0',
    },
  },
  {
    id: 'deviceRecipes', category: 'Device / MIDI', signature: 'deviceRecipes([role]) -> list',
    summary: 'List the message templates the device profile can build.',
    example: '`deviceRecipes()` gives the formats the synth\'s parameters are sent in.',
    notes: [
      'Returns a list of names; no profile chosen: an empty list.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: {
      lua: 'for _, id in ipairs(ce.device.recipes()) do log(id) end$0',
      javascript: 'for (const id of ce.device.recipes()) log(id);$0',
    },
  },
  {
    id: 'deviceRequests', category: 'Device / MIDI', signature: 'deviceRequests([role]) -> list',
    summary: 'List the requests the device profile can send.',
    example: '`deviceRequests()` gives names such as an identity request.',
    notes: [
      'Returns a list of names: check here before assuming a synth answers one.',
    ],
    requiresDeviceHost: true,
    params: [{ name: 'role', type: 'string', required: false, summary: 'The device, by its role as the panel names it.\nLeft out: "mainSynth".', kind: 'deviceRole' }],
    scopes: 'any',
    snippet: {
      lua: 'for _, id in ipairs(ce.device.requests()) do log(id) end$0',
      javascript: 'for (const id of ce.device.requests()) log(id);$0',
    },
  },

  /* --- Device / MIDI: raw (Q9) --- */
  {
    id: 'sendCC', category: 'Device / MIDI', signature: 'sendCC(channel, cc, value)',
    summary: 'Send a CC message.',
    example: '`sendCC(1, 74, 100)` sets controller 74 to 100 on channel 1.',
    notes: ['CC means Control Change.'],
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'cc', type: 'number', required: true, unit: '0 to 127', summary: 'The controller number, from 0 to 127.' },
      { name: 'value', type: 'number', required: true, unit: '0 to 127', summary: 'The new value, from 0 to 127.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendCC(${1:channel}, ${2:cc}, ${3:value})$0', javascript: 'sendCC(${1:channel}, ${2:cc}, ${3:value})$0' },
  },
  {
    id: 'sendNRPN', category: 'Device / MIDI', signature: 'sendNRPN(channel, msb, lsb, value)',
    summary: 'Send an NRPN message.',
    example: '`sendNRPN(1, 0, 5, 9000)` sets parameter 0 / 5 to 9000 on channel 1.',
    notes: ['NRPN means Non-Registered Parameter Number. Many synths use NRPNs for settings that need more than 128 steps.'],
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'msb', type: 'number', required: true, unit: '0 to 127', summary: 'The first half of the parameter number, from 0 to 127.' },
      { name: 'lsb', type: 'number', required: true, unit: '0 to 127', summary: 'The second half of the parameter number, from 0 to 127.' },
      { name: 'value', type: 'number', required: true, unit: '0 to 16383', summary: 'The new value, from 0 to 16383. It is sent as two 7-bit halves.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0', javascript: 'sendNRPN(${1:channel}, ${2:msb}, ${3:lsb}, ${4:value})$0' },
  },
  {
    id: 'sendRPN', category: 'Device / MIDI', signature: 'sendRPN(channel, msb, lsb, value)',
    summary: 'Set the pitch-bend range or the tuning with an RPN message.',
    example: '`sendRPN(1, 0, 0, 12 * 128)` sets the pitch-bend range on channel 1 to 12 semitones.',
    notes: [
      'RPN means Registered Parameter Number: its numbers mean the same on every synth.',
      'It is sent on controllers 101 and 100, where sendNRPN uses 99 and 98.',
    ],
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'msb', type: 'number', required: true, unit: '0 to 127', summary: 'The first half of the parameter number, from 0 to 127.' },
      { name: 'lsb', type: 'number', required: true, unit: '0 to 127', summary: 'The second half of the parameter number, from 0 to 127. With msb 0, 0 is the pitch-bend range, 1 fine tuning and 2 coarse tuning.' },
      { name: 'value', type: 'number', required: true, unit: '0 to 16383', summary: 'The new value, from 0 to 16383. For the pitch-bend range it is the semitones × 128, plus cents.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendRPN(${1:1}, 0, 0, ${2:2 * 128})  -- pitch-bend range, 2 semitones$0', javascript: 'sendRPN(${1:1}, 0, 0, ${2:2 * 128});  // pitch-bend range, 2 semitones$0' },
  },
  {
    id: 'sendSongPosition', category: 'Device / MIDI', signature: 'sendSongPosition(beats)',
    summary: 'Tell a sequencer where in the song to continue from.',
    example: '`sendSongPosition(16)` is the start of bar 2 in 4/4.',
    notes: ['This sends a Song Position Pointer. The sequencer plays from there when it gets Continue; Start always plays from the beginning.'],
    params: [{ name: 'beats', type: 'number', required: true, summary: 'The position from the start of the song, in sixteenth notes, from 0 to 16383. One sixteenth note is six clock ticks.' }],
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
    summary: 'Send MIDI bytes exactly as written.',
    example: '`sendMidi("90 3C 64")` starts note 60 on channel 1.',
    notes: ['Nothing is added or changed. When another send command does what you need, use that one.'],
    params: [{ name: 'bytes', type: 'bytes', required: true, summary: 'A list of bytes from 0 to 255, or hex text such as "90 3C 64": one or two digits a byte, with spaces or commas between. Text with a longer run, such as "903C64", is refused with a message and nothing is sent.' }],
    scopes: 'any',
    snippet: { lua: 'sendMidi({0x90, 60, 100})$0', javascript: 'sendMidi([0x90, 60, 100])$0' },
  },
  {
    id: 'sendNote', category: 'Device / MIDI', signature: 'sendNote(channel, note, velocity [, ms])',
    summary: 'Play a note.',
    example: '`sendNote(1, "C3", 100, 500)` plays C3 on channel 1 for half a second.',
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'note', type: 'value', required: true, kind: 'note', summary: 'A note number from 0 to 127, or a name such as "C3", "Eb4" or "F#2": a letter from A to G, then # or b if it has one, then the octave, in any case. A name that cannot be read, or a note outside 0 to 127, is refused with a message.' },
      { name: 'velocity', type: 'number', required: true, unit: '0 to 127', summary: 'How hard the note is played, from 0 to 127. 0 means note off.' },
      { name: 'ms', type: 'number', required: false, unit: 'milliseconds', summary: 'How long the note plays, in milliseconds, above 0. The note off is then sent for you. Left out, the note plays until sendNoteOff.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNote(${1:1}, ${2:60}, ${3:100})$0', javascript: 'sendNote(${1:1}, ${2:60}, ${3:100})$0' },
  },
  {
    id: 'interceptMidiIn', category: 'Device / MIDI', signature: 'interceptMidiIn(fn)',
    summary: 'See every MIDI message from the synth before the panel uses it.',
    returns: [
      { key: 'bytes', when: 'other bytes', then: 'The message is changed.' },
      { key: 'false', when: 'false', then: 'The message is dropped.' },
      { key: 'nothing', when: 'nothing', then: 'It goes through as it is.' },
    ],
    notes: ['Returned bytes are read as a send reads them. If they are not bytes, the message is dropped and the console says why.'],
    params: [{ name: 'fn', type: 'function', required: true, summary: 'Called with the bytes of each message. What it returns decides what happens to the message.' }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiIn(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiIn((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'interceptMidiOut', category: 'Device / MIDI', signature: 'interceptMidiOut(fn)',
    summary: 'See every MIDI message the panel sends before it goes out.',
    returns: [
      { key: 'bytes', when: 'other bytes', then: 'The message is changed.' },
      { key: 'false', when: 'false', then: 'The message is dropped.' },
      { key: 'nothing', when: 'nothing', then: 'It goes out as it is.' },
    ],
    notes: [
      'It sees what a control sends by its own MIDI setting too, not only what scripts send.',
      'Returned bytes are read as a send reads them. If they are not bytes, the message is dropped and the console says why.',
    ],
    params: [{ name: 'fn', type: 'function', required: true, summary: 'Called with the bytes of each message. What it returns decides what happens to the message.' }],
    scopes: 'any',
    snippet: {
      lua: 'interceptMidiOut(function(${1:bytes})\n  $0\n  return ${1:bytes}\nend)',
      javascript: 'interceptMidiOut((${1:bytes}) => {\n  $0\n  return ${1:bytes}\n})',
    },
  },
  {
    id: 'feedMidi', category: 'Device / MIDI', signature: 'feedMidi(bytes)',
    summary: 'Act as if a MIDI message came from the synth.',
    example: '`feedMidi("B0 4A 40")` gives the controls on CC 74, channel 1, the value 64.',
    notes: ['The controls, the note input and the transport react as they would to the synth. interceptMidiIn sees the message first.'],
    params: [{ name: 'bytes', type: 'value', required: true, kind: 'bytes', summary: 'A list of bytes from 0 to 255, or hex text such as "90 3C 64": one or two digits a byte, with spaces or commas between. Text with a longer run, such as "903C64", is refused with a message and nothing is sent.' }],
    scopes: 'any',
    snippet: { lua: 'feedMidi(${1:{0x90, 60, 100\}})$0', javascript: 'feedMidi([${1:0x90, 60, 100}])$0' },
  },
  {
    id: 'routeMidi', category: 'Device / MIDI', signature: 'routeMidi(role, fn)',
    summary: 'Send everything a block of code sends to another device instead of the main synth.',
    params: [
      { name: 'role', type: 'string', required: true, kind: 'deviceRole', summary: 'The device\'s role, such as "drums". The MIDI settings give each role its output.' },
      { name: 'fn', type: 'function', required: true, summary: 'The code whose MIDI goes to that device. Only what it sends is affected, as with noTransmit.' },
    ],
    scopes: 'any',
    snippet: {
      lua: 'routeMidi("${1:aux}", function()\n  $0\nend)',
      javascript: 'routeMidi("${1:aux}", () => {\n  $0\n})',
    },
  },
  {
    id: 'sendNoteOff', category: 'Device / MIDI', signature: 'sendNoteOff(channel, note [, velocity])',
    summary: 'Release a note.',
    example: '`sendNoteOff(1, "C3")` releases C3 on channel 1.',
    notes: ['Every note started with sendNote without a length needs its own note off.'],
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'note', type: 'value', required: true, kind: 'note', summary: 'A note number from 0 to 127, or a name such as "C3", "Eb4" or "F#2": a letter from A to G, then # or b if it has one, then the octave, in any case. A name that cannot be read, or a note outside 0 to 127, is refused with a message.' },
      { name: 'velocity', type: 'number', required: false, unit: '0 to 127', summary: 'The release velocity, from 0 to 127. It is 0 when left out.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendNoteOff(${1:1}, ${2:60})$0', javascript: 'sendNoteOff(${1:1}, ${2:60})$0' },
  },
  {
    id: 'sendProgramChange', category: 'Device / MIDI', signature: 'sendProgramChange(channel, program [, bankMsb, bankLsb])',
    summary: 'Switch the synth to another sound with a Program Change.',
    example: '`sendProgramChange(1, 0)` picks the sound most synths call 1.',
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'program', type: 'number', required: true, unit: '0 to 127', summary: 'The program number, from 0 to 127. Most synths count from 1, so 0 is the one they call 1.' },
      { name: 'bankMsb', type: 'number', required: false, unit: '0 to 127', summary: 'The first half of the bank number, from 0 to 127. Given, a Bank Select is sent before the Program Change: controller 0, and controller 32 when bankLsb is given too.' },
      { name: 'bankLsb', type: 'number', required: false, unit: '0 to 127', summary: 'The second half of the bank number, from 0 to 127.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendProgramChange(${1:1}, ${2:0})$0', javascript: 'sendProgramChange(${1:1}, ${2:0})$0' },
  },
  {
    id: 'sendPitchBend', category: 'Device / MIDI', signature: 'sendPitchBend(channel, value)',
    summary: 'Send pitch bend.',
    example: '`sendPitchBend(1, 8192)` is no bend on channel 1.',
    notes: ['The synth decides how many semitones a full bend is. sendRPN can set it.'],
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'value', type: 'number', required: true, unit: '0 to 16383', summary: 'From 0, all the way down, to 16383, all the way up; 8192 is the centre. Left out, the bend goes back to the centre.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendPitchBend(${1:1}, ${2:8192})$0', javascript: 'sendPitchBend(${1:1}, ${2:8192})$0' },
  },
  {
    id: 'sendAftertouch', category: 'Device / MIDI', signature: 'sendAftertouch(channel, pressure [, note])',
    summary: 'Send aftertouch, the pressure on keys while they are held.',
    example: '`sendAftertouch(1, 80)` sends pressure 80 for the whole of channel 1.',
    params: [
      { name: 'channel', type: 'number', required: true, unit: '1 to 16', summary: 'The MIDI channel, from 1 to 16.' },
      { name: 'pressure', type: 'number', required: true, unit: '0 to 127', summary: 'How hard, from 0 to 127.' },
      { name: 'note', type: 'value', required: false, kind: 'note', summary: 'One note, for polyphonic aftertouch, as a number or a name as for sendNote. Left out, the pressure is for the whole channel: channel pressure.' },
    ],
    scopes: 'any',
    snippet: { lua: 'sendAftertouch(${1:1}, ${2:64})$0', javascript: 'sendAftertouch(${1:1}, ${2:64})$0' },
  },
  {
    id: 'sendClock', category: 'Device / MIDI', signature: 'sendClock()',
    summary: 'Send one MIDI clock tick.',
    notes: ['There are 24 ticks to a quarter note, so call it from a timer.'],
    params: [],
    scopes: 'any',
    snippet: { lua: 'sendClock()$0', javascript: 'sendClock()$0' },
  },
  {
    id: 'sendTransport', category: 'Device / MIDI', signature: 'sendTransport(action)',
    summary: 'Start, continue or stop a connected sequencer or drum machine.',
    example: '`sendTransport("start")` starts it from the beginning.',
    params: [{ name: 'action', type: 'string', required: true, values: ['start', 'continue', 'stop'], summary: '"start" (FA), "continue" (FB) or "stop" (FC). Case-insensitive. Any other action, or none, is refused with a message and nothing is sent.' }],
    scopes: 'any',
    snippet: { lua: 'sendTransport("${1:start}")$0', javascript: 'sendTransport("${1:start}")$0' },
  },
  {
    id: 'sendSysex', category: 'Device / MIDI', signature: 'sendSysex(bytes)',
    summary: 'Send a SysEx message.',
    example: '`sendSysex("F0 7E 7F 06 01 F7")` asks the synth what model it is.',
    notes: [
      'SysEx means System Exclusive: messages each manufacturer defines for its own synths.',
      'F0 at the start and F7 at the end are added when they are missing.',
    ],
    params: [{ name: 'bytes', type: 'bytes', required: true, summary: 'A list of bytes, or hex text such as "F0 41 10 42 F7": one or two digits a byte, with spaces or commas between. In a list, a byte is a whole number from 0 to 255 or text that is one hex byte, such as "F7". Anything else, such as "F04110" or 300, is refused with a message and nothing is sent.' }],
    scopes: 'any',
    snippet: { lua: 'sendSysex(${1:bytes})$0', javascript: 'sendSysex(${1:bytes})$0' },
  },
  {
    id: 'checksum', category: 'Device / MIDI', signature: 'checksum(type, bytes [, opts]) -> number',
    summary: 'Work out the checksum a synth expects at the end of a SysEx message.',
    example: '`checksum("roland", {0x40, 0x00, 0x7F, 0x00})` gives 0x41.',
    notes: ['The 7-bit types fit in one SysEx byte. The CRC types do not: split their result into bytes with to7bit before sending.'],
    params: [
      { name: 'type', type: 'string', required: true,
        summary: 'How the synth works it out: "sum-7bit", "roland-7bit" (also written "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" or "crc32". Case-insensitive. An unknown name, or none, returns nothing and prints the names it accepts.',
        values: ['sum-7bit', 'roland-7bit', 'ones-complement-7bit', 'xor-7bit', 'offset-7bit',
          'sum-8bit', 'twos-complement-8bit', 'crc8', 'crc16-ccitt', 'crc16-modbus', 'crc32'] },
      { name: 'bytes', type: 'bytes', required: true, summary: 'The bytes it covers, as a list or as hex text. Bytes that are not bytes return nothing, with a message.' },
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
    summary: 'Stop every note and sound on every channel.',
    notes: ['It sends All Sound Off, All Notes Off and Reset All Controllers.'],
    params: [{ name: 'opts', type: 'object', required: false, fields: optionFields([
      { name: 'channel', type: 'number', unit: '1 to 16', default: 'all sixteen channels', sample: '1',
        summary: 'Silence one channel instead of every one, from 1 to 16. Anything else, such as "all", is refused and nothing is sent.' },
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
    summary: 'A table the script keeps its own values in between handler calls.',
    example: '`state.count = (state.count or 0) + 1` counts the calls.',
    notes: [
      'This script\'s only.',
      'Emptied when the script loads again; `ce.storage.saveSetting()` keeps a value longer.',
    ],
    params: [],
    scopes: 'any',
    snippet: { lua: 'state.${1:count} = (state.${1:count} or 0) + 1$0', javascript: 'state.${1:count} = (state.${1:count} ?? 0) + 1;$0' },
  },
  {
    id: 'saveSetting', category: 'Storage', signature: 'saveSetting(key, value [, opts]) -> boolean',
    summary: 'Save a value under a name, to keep it when the script loads again.',
    example: '`saveSetting("lastPatch", 12)` keeps 12 under lastPatch.',
    notes: [
      'Kept with the panel; in an exported plug-in, in the DAW project.',
      'Returns true; false when it could not be saved, such as where storage is not available.',
    ],
    params: [
      { name: 'key', type: 'string', required: true, summary: 'A name you choose, matched as written.\nA number: used as text.\nLeft out, or anything else: nothing is saved, with a console error.', kind: 'sharedName' },
      { name: 'value', type: 'value', required: true, summary: 'Numbers, text, true or false, lists and tables.\nLeft out: nothing is saved, with a console error. `ce.storage.forget()` deletes a setting.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) },
    ],
    scopes: 'any',
    snippet: { lua: 'saveSetting("${1:key}", ${2:value})$0', javascript: 'saveSetting("${1:key}", ${2:value})$0' },
  },
  {
    id: 'loadSetting', category: 'Storage', signature: 'loadSetting(key [, fallback [, opts]])',
    summary: 'Read a value saved with `ce.storage.saveSetting()`.',
    example: '`loadSetting("lastPatch", 1)` gives the saved patch, or 1 if none was saved.',
    notes: [
      'Returns the value.',
      'Each scope keeps its own: the same name in two scopes is two values.',
    ],
    params: [
      { name: 'key', type: 'string', required: true, summary: 'The name it was saved under, matched as written.\nA number: used as text.\nLeft out, or anything else: the fallback, with a console error.', kind: 'sharedName' },
      { name: 'fallback', type: 'value', required: false, summary: 'Given back when nothing is saved under the name.\nLeft out: no result.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) },
    ],
    scopes: 'any',
    snippet: { lua: 'local ${1:v} = loadSetting("${2:key}", ${3:default})$0', javascript: 'const ${1:v} = loadSetting("${2:key}", ${3:default});$0' },
  },
  // The other two thirds of an interface. saveSetting/loadSetting could write and read a key and
  // nothing could list or delete one, so a panel storing per-preset settings could never clean up
  // after itself and could not show somebody what it had kept.
  {
    id: 'listSettings', category: 'Storage', signature: 'listSettings([opts]) -> list',
    summary: 'List the names saved in one scope.',
    example: '`listSettings()` gives the names saved for the panel.',
    notes: [
      'Returns a list of names, in no order. An empty list: nothing saved yet; `ce.storage.info()` says whether storage works.',
      'The "panel" scope leaves out every script\'s own.',
    ],
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) }], scopes: 'any',
    snippet: { lua: 'for _, k in ipairs(ce.storage.settings()) do $0 end', javascript: 'for (const k of ce.storage.settings()) { $0 }' },
  },
  {
    id: 'forgetSetting', category: 'Storage', signature: 'forgetSetting(key [, opts]) -> boolean',
    summary: 'Delete one saved value.',
    example: '`forgetSetting("lastPatch")` deletes lastPatch.',
    notes: [
      'Returns true if there was one to delete; false if not.',
    ],
    params: [
      { name: 'key', type: 'string', required: true, summary: 'The name it was saved under, matched as written.\nA number: used as text.\nLeft out, or anything else: false, with a console error.', kind: 'sharedName' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) },
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
                    should not carry your MIDI port choice with it. In the exported plug-in it is
                    also this instance only: two copies of a panel each keep their own.
     A scope this build does not know is REFUSED rather than quietly treated as "panel": storing a
     value somewhere the caller did not ask for is how a private setting becomes a shared one. */
  {
    id: 'allSettings', category: 'Storage', signature: 'allSettings([opts]) -> table',
    summary: 'Give every value saved in one scope, by name.',
    example: '`allSettings().lastPatch` gives the saved lastPatch.',
    notes: [
      'Returns a table of names and values.',
      'The "panel" scope leaves out every script\'s own.',
    ],
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) }],
    scopes: 'any',
    snippet: {
      lua: 'for k, v in pairs(ce.storage.all()) do log(k, v) end$0',
      javascript: 'for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);$0',
    },
  },
  {
    id: 'clearSettings', category: 'Storage', signature: 'clearSettings([opts]) -> number',
    summary: 'Delete every value saved in one scope.',
    example: '`clearSettings({ scope = "script" })` deletes this script\'s own.',
    notes: [
      'Returns how many were deleted.',
      'Clearing "panel" leaves every script\'s own.',
    ],
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'storageInfo', category: 'Storage', signature: 'storageInfo([opts]) -> table',
    summary: 'Tell where one scope\'s values are kept, and whether they will last.',
    example: '`storageInfo().available` gives true where saved values are kept.',
    notes: [
      'Returns { scope, backing, available, count, bytes }.',
      '`backing`: "panel", with the panel, in the editor; "project", in the DAW project, in an exported plug-in; "machine", on this computer.',
      '`available` false: nothing saved there is kept.',
      '`count`: how many; `bytes`: their size as JSON text.',
    ],
    params: [{ name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields(['scope']) }],
    scopes: 'any',
  },
  {
    id: 'encodeJson', category: 'Storage', signature: 'encodeJson(value [, opts]) -> string',
    summary: 'Write a value as JSON text.',
    example: '`encodeJson({ b = 1, a = 2 })` gives {"a":2,"b":1}.',
    notes: [
      'Returns the text, the keys sorted, so the same data gives the same text.',
      'A value with no JSON form, such as a function or a table inside itself, or left out: no result, without a word.',
      'The same in every language; Lua has no JSON of its own.',
    ],
    params: [
      { name: 'value', type: 'value', required: true, summary: 'Numbers, text, true or false, lists and tables.' },
      { name: 'opts', type: 'object', required: false, summary: 'Options, below.\nAn option it does not have: nothing is done, with a console error.', fields: optionFields([
        { name: 'indent', type: 'number', default: '0',
          summary: 'Spaces to indent each level, laid out over several lines.\n0: one line.\nRange: 0 ↔ 10.\nA fraction: rounded down.\nAbove 10: 10, with a console warning the first time.\nBelow 0, or not a number: one line, with a console warning the first time.' },
      ]) },
    ],
    scopes: 'any',
    snippet: { lua: 'sendSysex(toAscii(ce.storage.encode(patch)))$0', javascript: 'sendSysex(toAscii(ce.storage.encode(patch)));$0' },
  },
  {
    id: 'decodeJson', category: 'Storage', signature: 'decodeJson(text) -> value',
    summary: 'Read JSON text back into a value.',
    example: '`decodeJson("[1, 2]")` gives {1, 2}.',
    notes: [
      'Returns the value.',
      'A JSON null is nothing: {"a":1,"b":null} gives a table with a only, and [1,null,2] a list of two.',
    ],
    params: [{ name: 'text', type: 'string', required: true, summary: 'JSON text.\nText that is not JSON, not text, or left out: no result, with a console error.' }],
    scopes: 'any',
  },

  /* --- Debug --- */
  {
    id: 'log', category: 'Debug', signature: 'log(message [, value])',
    summary: 'Print a message to the script console.',
    notes: [
      'Changes nothing on the panel.',
      'Returns nothing.',
    ],
    example: '`log("cutoff", 64)` prints cutoff 64.',

    params: [
      { name: 'message', type: 'string', required: true, summary: 'The text.\nA number or a table: written as text.' },
      { name: 'value', type: 'value', required: false, summary: 'Printed after the message, with a space; a table written out.\nLeft out: the message alone.' },
    ],
    scopes: 'any',
    snippet: { lua: 'log("${1:message}", ${2:value})$0', javascript: 'log("${1:message}", ${2:value})$0' },
  },
  // The console already renders these levels differently — the runtime uses the distinction
  // constantly — and a script could not. Everything a panel author wrote landed at the same level,
  // so a real failure read exactly like a debug print.
  {
    id: 'logWarn', category: 'Debug', signature: 'logWarn(message [, value])',
    summary: 'Print a warning to the script console.',
    notes: [
      'Shown as a warning; the handler goes on.',
      'Returns nothing.',
    ],
    example: '`logWarn("no tempo yet")` prints no tempo yet as a warning.',

    params: [
      { name: 'message', type: 'string', required: true, summary: 'The text.\nA number or a table: written as text.' },
      { name: 'value', type: 'value', required: false, summary: 'Printed after the message, with a space; a table written out.\nLeft out: the message alone.' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.warn("${1:message}")$0', javascript: 'ce.core.warn("${1:message}")$0' },
  },
  {
    id: 'logError', category: 'Debug', signature: 'logError(message [, value])',
    summary: 'Print an error to the script console.',
    notes: [
      'It only prints: the handler goes on. To stop it, raise an error your language\'s way: error() in Lua, throw in JavaScript, raise in Python.',
      'Returns nothing.',
    ],
    example: '`logError("patch not found")` prints patch not found as an error.',

    params: [
      { name: 'message', type: 'string', required: true, summary: 'The text.\nA number or a table: written as text.' },
      { name: 'value', type: 'value', required: false, summary: 'Printed after the message, with a space; a table written out.\nLeft out: the message alone.' },
    ],
    scopes: 'any',
    snippet: { lua: 'ce.core.error("${1:message}")$0', javascript: 'ce.core.error("${1:message}")$0' },
  },  // Who made a change (docs/design/ce-daw-module.md). A command and not a field, because
  // onValueChange(value) is given a plain number, and a second argument would break the typed
  // languages' handlers.
  {
    id: 'origin', category: 'Events', signature: 'origin() -> text', refusal: 'nothing',
    summary: 'Who made the change the running handler is for: "user", "script", "host", "device", "osc" or "load".',
    example: 'In `onValueChanged`, `origin() == "host"` means the DAW\'s automation moved the knob.',
    notes: [
      '"user": a hand on the panel. "script": a set() from any script, outside a handler. "host": the DAW, in an exported plug-in. "device": the synth, through a dump, a parameter or any MIDI it sent. "osc": an OSC message. "load": the panel, a preset or the project being opened.',
      'Outside a handler, and for an event no change caused (a timer, a key): nothing.',
      'With the plug-in\'s window shut, a change a hand made while it was open is not raised again; and a script\'s set() raises no value events there, as inside a handler with the window open.',
    ],
    params: [],
    scopes: 'any',
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
  list: 'list',
  // Where on an LCD (lcdPositions.js): a row, or a table of layout, row and col. And a layout, by
  // its number or its name.
  position: 'number or table', layoutRef: 'number or name',
  // A key's note, as a name or a number (componentVerbs' pitchClassOf).
  pitchClass: 'number or name',
};

/** What the value a component verb writes may be, as the spec says it: the closed list an enum
 *  takes (with `kind` naming the vocabulary when it is the divisions or the scales), or a number's
 *  range. Read by the script editor's Values sidebar; the reference renders neither, as it renders
 *  no argument's, and says both in the verb's summary instead. Only for the argument that IS the
 *  value — the last, when its kind is the verb's own (an addressed verb's index is not). */
function verbValueTyping(verb, kind) {
  // A value the spec names a kind for (the LCD's line, read against the display it is written to).
  if (verb.valueKind && kind === 'str') return { kind: verb.valueKind };
  if (kind !== verb.k && kind !== verb.kind) return {};
  if (kind === 'enum' && Array.isArray(verb.values)) {
    const same = (list) => list.length === verb.values.length && list.every((x, i) => x === verb.values[i]);
    const named = same(DIVISION_NAMES) ? { kind: 'division' } : same(SCALE_NAMES) ? { kind: 'scale' } : {};
    return { values: verb.values, ...named };
  }
  if ((kind === 'num' || kind === 'int') && Number.isFinite(verb.min) && Number.isFinite(verb.max)) {
    return { min: verb.min, max: verb.max };
  }
  // A colour field, named as the renderer names one (controlSets.isColourKey): the Drum Pads' pad
  // colour, which set() reads by the colour rule too.
  if (kind === 'str' && /(?:^c|C)olou?r$/.test(String(verb.item ?? verb.f ?? ''))) return { kind: 'colour' };
  return {};
}

const panelVerb = (id, signature, summary, params, extra = {}) => ({
  id, signature, summary, params, category: 'Panel components',
  runtime: RUNTIME_WEBVIEW, scopes: ['component', 'panel'], ...extra,
});

const T = { name: 'target', type: 'targetRef', required: true };

export const PANEL_COMMANDS = [
  // --- Zone Splitter ---
  // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
  // "ce.components.split"): what splitZoneLayout.js's script actions do with each.
  panelVerb('splitPreset', 'splitPreset(target, preset [, lowNote, highNote])',
    `Replace every zone with a layout: ${oneOf(HAND_WRITTEN_VALUES['split.preset'])}.`,
    [T, { name: 'preset', type: 'string', required: true, kind: 'componentWord',
      summary: '"whole": one zone, channel 1.\n"classic": the lower half on channel 1, an octave down; the upper half on channel 2.\n"splitLayer": a bass below; two channels layered above.\n"threeWay": bass, pad and lead across channels 1 to 3.\n"velLayer": the same keys, played softly on channel 1 and hard on channel 2.\nCase-insensitive.\nAny other: rejected with a console error.' },
     { name: 'lowNote', type: 'number', required: false, kind: 'note', summary: 'The lowest note of the layout.\nA MIDI note number, or a name such as "C4".\nRange: 0 ↔ 127.\nOutside the range: the nearest end.\nAny other: rejected with a console error.\nLeft out: 36, C2.' },
     { name: 'highNote', type: 'number', required: false, kind: 'note', summary: 'The highest note of the layout.\nA MIDI note number, or a name such as "C4".\nRange: 0 ↔ 127.\nOutside the range: the nearest end.\nAny other: rejected with a console error.\nLeft out: 96, C7.\nBelow `lowNote`: the two are swapped.' }],
    { example: '`ce.components.split.preset("Split", "classic", "C2", "C6")` splits C2 to C6 in two halves.',
      notes: ['Returns true. Rejected: false, with a console error.'] }),
  panelVerb('splitMute', 'splitMute(target, zone, enabled)', 'Let one zone sound, or mute it.',
    [T, { name: 'zone', type: 'number', required: true, kind: 'componentIndex', summary: 'The zone: its number, counted from 1, as the panel labels it, or its name, in any case.\nNot a zone: rejected with a console error naming them.' }, { name: 'enabled', type: 'boolean', required: true, summary: 'true: it sounds.\nfalse: muted.\nLeft out: it sounds.' }],
    { example: '`ce.components.split.mute("Split", "Bass", false)` mutes the zone called Bass.', notes: ['Returns true. Rejected: false, with a console error.'] }),
  panelVerb('splitChannel', 'splitChannel(target, zone, channel)', 'Set the MIDI channel one zone plays on.',
    [T, { name: 'zone', type: 'number', required: true, kind: 'componentIndex', summary: 'The zone: its number, counted from 1, as the panel labels it, or its name, in any case.\nNot a zone: rejected with a console error naming them.' }, { name: 'channel', type: 'number', required: true, summary: 'MIDI channel.\nRange: 1 ↔ 16, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.split.channel("Split", 2, 5)` sends zone 2 on channel 5.', notes: ['Returns true. Rejected: false, with a console error.'] }),
  panelVerb('splitTranspose', 'splitTranspose(target, zone, semitones)', 'Transpose one zone.',
    [T, { name: 'zone', type: 'number', required: true, kind: 'componentIndex', summary: 'The zone: its number, counted from 1, as the panel labels it, or its name, in any case.\nNot a zone: rejected with a console error naming them.' }, { name: 'semitones', type: 'number', required: true, summary: 'Semitones: 12 an octave up.\nRange: -48 ↔ 48, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.split.transpose("Split", 1, -12)` plays zone 1 an octave down.', notes: ['Returns true. Rejected: false, with a console error.'] }),
  panelVerb('splitPoint', 'splitPoint(target, zone, note)', 'Move the top note of one zone.',
    [T, { name: 'zone', type: 'number', required: true, kind: 'componentIndex', summary: 'The zone: its number, counted from 1, as the panel labels it, or its name, in any case.\nNot a zone: rejected with a console error naming them.' }, { name: 'note', type: 'number', required: true, kind: 'note', summary: 'Its new top note.\nA MIDI note number, or a name such as "C4".\nRange: 0 ↔ 127.\nOutside the range: the nearest end.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.split.point("Split", 1, "B3")` ends zone 1 at B3.',
      notes: ['A zone that starts just above it moves with it, as a drag of the split point does.', 'Returns true. Rejected: false, with a console error.'] }),

  // --- Phrase Sequencer ---
  // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
  // "ce.components.phrase"): what phraseLayout.js's phraseScriptPatch does with each.
  panelVerb('phraseSeed', 'phraseSeed(target, seed)', `Fill the grid with a pattern: ${oneOf(HAND_WRITTEN_VALUES['phrase.seed'])}.`,
    [T, { name: 'seed', type: 'string', required: true, kind: 'componentWord',
      summary: '"clear": empty.\n"octaves": the root and the octave above, by turns.\n"arpUp": the chord walked upward across the bar.\n"riff": a one-bar line, off the beat, with ties.\n"random": a note of the scale on each step.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.phrase.seed("Phrase", "riff")` fills the grid with a riff.', notes: ['What the grid held is replaced.', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseClear', 'phraseClear(target)', 'Empty the grid.', [T],
    { example: '`ce.components.phrase.clear("Phrase")` switches every cell off.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseKey', 'phraseKey(target, key)', 'Set the key its rows play in.',
    [T, { name: 'key', type: 'number', required: true, kind: 'componentWord', summary: 'The key\'s note: a name, such as "F#", in any case, or a number round the octave, 0 being C: 14 is 2, D.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.phrase.key("Phrase", "D")` plays the pattern in D.', notes: ['Row 1 is the key\'s note; each row up is the next step of the scale.', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseScale', 'phraseScale(target, scale)', 'Set the scale its rows play.',
    [T, { name: 'scale', type: 'string', required: true, kind: 'scale', summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.phrase.scale("Phrase", "dorian")` plays the pattern in the dorian mode.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseTranspose', 'phraseTranspose(target, semitones)', 'Transpose what the pattern plays, leaving the grid as it is.',
    [T, { name: 'semitones', type: 'number', required: true, summary: 'Semitones: 12 an octave up.\nRange: -48 ↔ 48, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.phrase.transpose("Phrase", 12)` plays the pattern an octave up.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseDirection', 'phraseDirection(target, direction)', `Set the order it plays the steps in: ${oneOf(HAND_WRITTEN_VALUES['phrase.direction'])}.`,
    [T, { name: 'direction', type: 'string', required: true, kind: 'componentWord',
      summary: '"forward": first to last.\n"reverse": last to first.\n"pingpong": forward, then back.\n"random": a step at random each time.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.phrase.direction("Phrase", "pingpong")` plays forward and back.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseRun', 'phraseRun(target, running)', 'Start or stop the sequencer.',
    [T, { name: 'running', type: 'boolean', required: true, summary: 'true: it plays.\nfalse: it stops.\nLeft out: it plays.' }],
    { example: '`ce.components.phrase.run("Phrase", false)` stops the sequencer.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('phraseCell', 'phraseCell(target, step, row, on)', 'Switch one cell of the grid on or off.',
    [T, { name: 'step', type: 'number', required: true, kind: 'componentIndex', summary: 'Step, counted from 1, left to right.\nA fraction: rounded.\nNot a step of the grid: rejected with a console error.' },
     { name: 'row', type: 'number', required: true, kind: 'componentIndex', summary: 'Row, counted from 1, from the bottom: a step of the scale; a semitone in chromatic mode, set in the inspector.\nA fraction: rounded.\nNot a row of the grid: rejected with a console error.' },
     { name: 'on', type: 'boolean', required: true, summary: 'true: on.\nfalse: off.\nLeft out: toggles.' }],
    { example: '`ce.components.phrase.cell("Phrase", 1, 3, true)` plays row 3 on the first step.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),

  // --- Phrase Recorder ---
  // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
  // "ce.components.recorder"): what noteRecorderLayout.js's recorderScriptPatch and the preview do.
  panelVerb('recorderRecord', 'recorderRecord(target [, on])', 'Arm the recorder, or stop it.',
    [T, { name: 'on', type: 'boolean', required: false,
      summary: 'true: armed; it records from the top of the next loop, after `countIn()`.\nfalse: stopped.\nLeft out: armed if stopped, stopped if armed or recording.' }],
    { example: '`ce.components.recorder.record("Recorder")` arms it, or stops it if it is armed or recording.',
      notes: ['A take that has notes is recorded over: layered on, until it is stopped.', 'Returns true. Already that way: true, with a console line.'] }),
  panelVerb('recorderStop', 'recorderStop(target)', 'Stop recording, or arming.', [T],
    { example: '`ce.components.recorder.stop("Recorder")` stops recording; the loop goes on playing.',
      notes: ['The take plays on: `play(target, false)` stops it.', 'Returns true. Already stopped: true, with a console line.'] }),
  panelVerb('recorderPlay', 'recorderPlay(target [, playing])', 'Start or stop playing the take.',
    [T, { name: 'playing', type: 'boolean', required: false, summary: 'true: it plays.\nfalse: it is silent.\nLeft out: toggles.' }],
    { example: '`ce.components.recorder.play("Recorder", false)` silences the take.',
      notes: ['Returns true. Already that way: true, with a console line.'] }),
  panelVerb('recorderClear', 'recorderClear(target)', 'Delete the take.', [T],
    { example: '`ce.components.recorder.clear("Recorder")` empties the take.',
      notes: ['The stored slots are kept.', 'Returns true. Recording, or no take: false, with a console error.'] }),
  panelVerb('recorderUndo', 'recorderUndo(target)', 'Delete the last pass recorded over the take.', [T],
    { example: '`ce.components.recorder.undo("Recorder")` takes away what the last pass added.',
      notes: ['Returns true. Recording, or no take: false, with a console error.'] }),
  panelVerb('recorderQuantize', 'recorderQuantize(target, grid [, strength, scale, key])',
    'Move the take\'s notes toward a grid, and into a key.',
    [T, { name: 'grid', type: 'number', required: true,
      summary: 'Divisions of the loop: 16 over one bar is sixteenth notes.\nRange: 1 ↔ 64, whole.\nOutside the range: the nearest end.\nText, such as "1/16": rejected with a console error.' },
     { name: 'strength', type: 'number', required: false,
       summary: 'How far each note moves: 1 onto the grid, 0.5 halfway, 0 not at all.\nRange: 0 ↔ 1.\nLeft out: the inspector\'s Strength, 0 unless it is set, which moves nothing.' },
     { name: 'scale', type: 'string', required: false, kind: 'scale',
       summary: 'With `key`, notes outside the key are moved to the nearest in it, ties down.\nOne of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out, with `key` given: the inspector\'s scale.\nAny other: rejected with a console error.' },
     { name: 'key', type: 'string', required: false,
       summary: 'The key\'s note: a name, such as "F#", in any case, or a number round the octave, 0 being C.\nLeft out, with `scale` given: the inspector\'s key.\nBoth left out: the pitches are kept.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.recorder.quantize("Recorder", 16, 1)` puts every note on a sixteenth of the loop.',
      notes: ['The lengths are kept.', 'Returns true. Recording, or no take: false, with a console error.'] }),
  panelVerb('recorderTranspose', 'recorderTranspose(target, semitones)', 'Transpose what the take plays, leaving the take as recorded.',
    [T, { name: 'semitones', type: 'number', required: true, summary: 'Semitones: 12 an octave up.\nRange: -48 ↔ 48, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.recorder.transpose("Recorder", -12)` plays the take an octave down.',
      notes: ['`shift()` changes the notes of the take itself.', 'Returns true. Already that way: true, with a console line.'] }),
  panelVerb('recorderBars', 'recorderBars(target, bars)', 'Set how many bars the loop is, while it follows the Transport.',
    [T, { name: 'bars', type: 'number', required: true, summary: 'Bars.\nRange: 1 ↔ 16, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.recorder.bars("Recorder", 4)` makes the loop four bars long.',
      notes: ['Following the Transport is set in the inspector; otherwise the loop is a length in seconds.', 'Returns true. Already that way: true, with a console line.'] }),
  panelVerb('recorderSource', 'recorderSource(target, source)', `Set where the notes it records come from: ${oneOf(HAND_WRITTEN_VALUES['recorder.source'])}.`,
    [T, { name: 'source', type: 'string', required: true, kind: 'componentWord',
      summary: '"input": the MIDI input.\n"panel": the panel\'s own note controls, such as a Chord Pad.\n"both": either.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.recorder.source("Recorder", "input")` records only the keyboard played into it.',
      notes: ['Returns true. Already that way: true, with a console line.'] }),
  panelVerb('recorderNudge', 'recorderNudge(target, by)', 'Move every note of the take earlier or later.',
    [T, { name: 'by', type: 'number', required: true, summary: 'Part of the loop: 0.01 is a hundredth later; below 0, earlier.\nPast the end of the loop: round to its start.\n0, or not a number: rejected with a console error.' }],
    { example: '`ce.components.recorder.nudge("Recorder", -0.005)` moves a late take a little earlier.',
      notes: ['Returns true. Recording, or no take: false, with a console error.'] }),
  panelVerb('recorderShift', 'recorderShift(target, semitones)', 'Transpose the notes of the take itself.',
    [T, { name: 'semitones', type: 'number', required: true, summary: 'Semitones: 12 an octave up.\nA fraction: rounded.\nA note that would pass 0 or 127: deleted.\n0, or not a number: rejected with a console error.' }],
    { example: '`ce.components.recorder.shift("Recorder", 7)` moves the take up a fifth.',
      notes: ['Its timing is kept: nothing is quantized.', '`transpose()` changes only what it plays.', 'Returns true. Recording, or no take: false, with a console error.'] }),
  panelVerb('recorderStore', 'recorderStore(target, slot [, name])', 'Keep a copy of the take in a slot.',
    [T, { name: 'slot', type: 'number', required: true, kind: 'componentIndex', summary: 'Slot, counted from 1.\nRange: 1 ↔ 8.\nA fraction: rounded.\nAny other: rejected with a console error.' },
     { name: 'name', type: 'string', required: false, summary: 'The slot\'s name.\nLeft out: its name as it was; a new slot is "Take" and its number.' }],
    { example: '`ce.components.recorder.store("Recorder", 2, "Verse")` keeps the take in slot 2, called Verse.',
      notes: ['A slot that holds a take: replaced.', 'Returns true. Recording: false, with a console error.'] }),
  panelVerb('recorderLoad', 'recorderLoad(target, slot)', 'Make a stored take the take.',
    [T, { name: 'slot', type: 'number', required: true, kind: 'componentIndex', summary: 'Slot, counted from 1.\nA fraction: rounded.\nA slot that holds no take: rejected with a console error.' }],
    { example: '`ce.components.recorder.load("Recorder", 2)` plays the take stored in slot 2.',
      notes: ['A copy: the slot is kept as it was.', 'Returns true. Recording: false, with a console error.'] }),
  panelVerb('recorderCountIn', 'recorderCountIn(target, bars)', 'Set how many bars it waits, once armed, before it records.',
    [T, { name: 'bars', type: 'number', required: true, summary: 'Bars.\n0: none; it records from the top of the next loop.\nRange: 0 ↔ 4, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.recorder.countIn("Recorder", 1)` waits a bar before recording.',
      notes: ['Counted in whole loops: a loop longer than the count-in waits one loop.', 'Returns true. Already that way: true, with a console line.'] }),

  // --- Harmoniser ---
  // Done in one pass at the owner's word (docs/design/api-descriptions-handoff.md,
  // "ce.components.harmony"): what harmoniserLayout.js's harmoniserScriptPatch does with each.
  panelVerb('harmonyMode', 'harmonyMode(target, mode)', `Set how it builds the harmony: ${oneOf(HAND_WRITTEN_VALUES['harmony.mode'])}.`,
    [T, { name: 'mode', type: 'string', required: true, kind: 'componentWord',
      summary: '"diatonic": the chord the played note\'s step of the key has; always in the key.\n"memory": a fixed shape, `shape()`, on whatever note is played, in the key or not.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.mode("Harmoniser", "memory")` plays one chord shape on every note.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyKey', 'harmonyKey(target, key)', 'Set the key it harmonises in.',
    [T, { name: 'key', type: 'number', required: true, kind: 'componentWord', summary: 'The key\'s note: a name, such as "F#", in any case, or a number round the octave, 0 being C: 14 is 2, D.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.key("Harmoniser", "Bb")` harmonises in B♭.', notes: ['While `mode()` is "diatonic".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyScale', 'harmonyScale(target, scale)', 'Set the scale it harmonises in.',
    [T, { name: 'scale', type: 'string', required: true, kind: 'scale', summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.scale("Harmoniser", "minor")` harmonises in the minor key.', notes: ['While `mode()` is "diatonic".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonySize', 'harmonySize(target, size)', 'Set how many notes each chord has.',
    [T, { name: 'size', type: 'number', required: true, summary: 'Notes: 3 a triad, 4 a seventh chord.\nRange: 2 ↔ 6, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.harmony.size("Harmoniser", 4)` plays seventh chords.', notes: ['While `mode()` is "diatonic".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyShape', 'harmonyShape(target, shape)', `Set the chord shape it plays: ${oneOf(HAND_WRITTEN_VALUES['harmony.shape'])}, or a list of intervals.`,
    [T, { name: 'shape', type: 'string', required: true, kind: 'componentWord',
      summary: 'A shape by name, case-insensitive; or a list of semitones above the played note, such as {0, 4, 7}, -36 to 36 each, 6 at most.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.shape("Harmoniser", "min7")` plays a minor seventh on every note.', notes: ['While `mode()` is "memory".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyVoicing', 'harmonyVoicing(target, voicing)', `Set how the notes of each chord are spread: ${oneOf(HAND_WRITTEN_VALUES['harmony.voicing'])}.`,
    [T, { name: 'voicing', type: 'string', required: true, kind: 'componentWord',
      summary: '"close": as close together as they go.\n"open": the middle note an octave up.\n"drop2": the second note from the top an octave down.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.voicing("Harmoniser", "open")` spreads each chord wider.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyInversion', 'harmonyInversion(target, inversion)', 'Set which note of each chord is lowest.',
    [T, { name: 'inversion', type: 'number', required: true, summary: '0: the root lowest. 1: the third. 2: the fifth. 3: the seventh.\nPast the chord\'s notes: the highest inversion it has, 2 for a triad.\nRange: 0 ↔ 3, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.harmony.inversion("Harmoniser", 1)` puts the third lowest.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyOctave', 'harmonyOctave(target, octave)', 'Move the added notes by whole octaves.',
    [T, { name: 'octave', type: 'number', required: true, summary: 'Octaves: 1 up, -1 down.\nRange: -3 ↔ 3, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.harmony.octave("Harmoniser", -1)` puts the harmony an octave below.', notes: ['The played note stays where it is.', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyOutOfKey', 'harmonyOutOfKey(target, mode)', `Set what a played note outside the key does: ${oneOf(HAND_WRITTEN_VALUES['harmony.outOfKey'])}.`,
    [T, { name: 'mode', type: 'string', required: true, kind: 'componentWord',
      summary: '"pass": the note sounds alone, without harmony.\n"nearest": harmonised as the nearest note of the key.\n"mute": nothing sounds.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.outOfKey("Harmoniser", "nearest")` harmonises a wrong note as the nearest right one.', notes: ['While `mode()` is "diatonic".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyKeepPlayed', 'harmonyKeepPlayed(target [, keep])', 'Sound the played note with its harmony, or only the harmony.',
    [T, { name: 'keep', type: 'boolean', required: false, summary: 'true: the played note sounds too.\nfalse: only the added notes.\nLeft out: toggles.' }],
    { example: '`ce.components.harmony.keepPlayed("Harmoniser", false)` plays the harmony without the note played.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyChannel', 'harmonyChannel(target, channel)', 'Set the MIDI channel the chords play on.',
    [T, { name: 'channel', type: 'number', required: true, summary: 'MIDI channel.\nRange: 1 ↔ 16, whole.\nA fraction: rounded.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.harmony.channel("Harmoniser", 2)` plays the chords on channel 2.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyVoiceLeading', 'harmonyVoiceLeading(target, mode)', `Set how each chord moves from the one before: ${oneOf(HAND_WRITTEN_VALUES['harmony.voiceLeading'])}.`,
    [T, { name: 'mode', type: 'string', required: true, kind: 'componentWord',
      summary: '"off": each chord as `inversion()` sets it.\n"closest": the notes move as little as they can, all together.\n"smooth": the top note moves as little as it can.\nCase-insensitive.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.voiceLeading("Harmoniser", "closest")` keeps the chords close together.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyStrum', 'harmonyStrum(target, ms)', 'Spread the notes of each chord out in time, as a strum.',
    [T, { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'Milliseconds from the first note to the last.\n0: all together.\nRange: 0 ↔ 400.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.harmony.strum("Harmoniser", 60)` strums each chord over 60 ms.', notes: ['Up or down: set in the inspector.', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('harmonyDegree', 'harmonyDegree(target, degree, chord)', 'Play a chord of your own on one step of the key.',
    [T, { name: 'degree', type: 'number', required: true, kind: 'componentIndex', summary: 'Step of the scale, counted from 1.\nA fraction: rounded.\nNot a step of the scale: rejected with a console error.' },
     { name: 'chord', type: 'string', required: true, kind: 'componentWord', summary: 'Semitones above the step\'s note, such as {0, 5, 7}, -36 to 36 each, 6 at most.\n"clear": the key\'s own chord again.\nAny other: rejected with a console error.' }],
    { example: '`ce.components.harmony.degree("Harmoniser", 6, {0, 5, 7})` plays a sus4 on the sixth step.', notes: ['While `mode()` is "diatonic".', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),

  // --- Setlist ---
  // These move the INDEX; the recall follows from the index changing, so a scripted step and a
  // footswitch step are indistinguishable downstream. Done in one pass at the owner's word
  // (docs/design/api-descriptions-handoff.md, "ce.components.setlist").
  panelVerb('setlistNext', 'setlistNext(target)', 'Go to the next scene it plays.', [T],
    { example: '`ce.components.setlist.next("Setlist")` recalls the next scene.',
      notes: ['Scenes switched off with `enable()` are passed over.', 'At the last: to the first while `wrap()` is on; else rejected with a console error.', 'Returns true. Rejected: false, with a console error.'] }),
  panelVerb('setlistPrev', 'setlistPrev(target)', 'Go back to the scene before.', [T],
    { example: '`ce.components.setlist.prev("Setlist")` recalls the scene before.',
      notes: ['Scenes switched off with `enable()` are passed over.', 'At the first: to the last while `wrap()` is on; else rejected with a console error.', 'Returns true. Rejected: false, with a console error.'] }),
  panelVerb('setlistGoto', 'setlistGoto(target, scene)', 'Go to a scene by its number or name.',
    [T, { name: 'scene', type: 'number or text', required: true, kind: 'componentIndex', summary: 'Its number, counted from 1, or its name, as written.\nNot a scene: rejected with a console error naming them.' }],
    { example: '`ce.components.setlist.jump("Setlist", "Ballad")` recalls the scene called Ballad.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('setlistEnable', 'setlistEnable(target, scene, enabled)', 'Play a scene in the set, or pass over it.',
    [T, { name: 'scene', type: 'number or text', required: true, kind: 'componentIndex', summary: 'Its number, counted from 1, or its name, as written.\nNot a scene: rejected with a console error naming them.' },
     { name: 'enabled', type: 'boolean', required: true, summary: 'true: played.\nfalse: passed over by `next()` and `prev()`.\nLeft out: played.' }],
    { example: '`ce.components.setlist.enable("Setlist", 2, false)` skips scene 2 tonight.', notes: ['`jump()` still goes to it.', 'Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('setlistWrap', 'setlistWrap(target [, wrap])', 'Go round from the last scene to the first, or stop at the ends.',
    [T, { name: 'wrap', type: 'boolean', required: false, summary: 'true: round.\nfalse: stops at the ends.\nLeft out: toggles.' }],
    { example: '`ce.components.setlist.wrap("Setlist", true)` goes from the last scene to the first.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),
  panelVerb('setlistCrossfade', 'setlistCrossfade(target, ms)', 'Set how long a scene\'s values take to fade in.',
    [T, { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'Milliseconds.\n0: at once.\nRange: 0 ↔ 10000.\nOutside the range: the nearest end.\nNot a number: rejected with a console error.' }],
    { example: '`ce.components.setlist.crossfade("Setlist", 800)` fades each scene in over 0.8 s.', notes: ['Returns true. Already that way: true, with a console line.', 'Rejected: false, with a console error.'] }),

  /* --- Reading the five (design doc §44) ---
     Every component member in the API was a WRITE. The twenty-three spec-driven families now read
     by VERB name, because their spec knows which field each verb writes; these five predate that
     spec and have no such map, so they read by the MODEL field name — which is the name their own
     summaries already use. `read(target)` with no field is the whole section either way, so the
     one shape a script is most likely to want is the same across all twenty-eight. */
  panelVerb('splitRead', 'splitRead(target [, field])', 'Read the Zone Splitter\'s settings.',
    [T, { name: 'field', type: 'string', required: false, kind: 'componentWord', summary: 'A setting\'s name, in any case, such as "zones" or "lowNote".\nLeft out: every setting, as a table.\nNot one of its settings: no result, with a console error naming them.' }],
    { example: '`ce.components.split.read("Split", "zones")` gives the zones, each { label, lowNote, highNote, channel, transpose, enabled, … }.', notes: ['Returns the value.'] }),
  panelVerb('phraseRead', 'phraseRead(target [, field])', 'Read the Phrase Sequencer\'s settings.',
    [T, { name: 'field', type: 'string', required: false, kind: 'componentWord', summary: 'A setting\'s name, in any case, such as "key" or "pattern".\nLeft out: every setting, as a table.\nNot one of its settings: no result, with a console error naming them.' }],
    { example: '`ce.components.phrase.read("Phrase", "key")` gives the key, 0 being C.', notes: ['Returns the value.'] }),
  panelVerb('recorderRead', 'recorderRead(target [, field])', 'Read the Phrase Recorder\'s settings and take.',
    [T, { name: 'field', type: 'string', required: false, kind: 'componentWord',
      summary: 'A setting\'s name, in any case, such as "state" or "take".\nLeft out: every setting, as a table.\nNot one of its settings: no result, with a console error naming them.' }],
    { example: '`ce.components.recorder.read("Recorder", "state")` gives "idle", "armed", "recording" or "overdub".',
      notes: ['"take": { events }, each note { t, note, velocity, dur, pass }, `t` and `dur` as parts of the loop.', 'Returns the value.'] }),
  panelVerb('harmonyRead', 'harmonyRead(target [, field])', 'Read the Harmoniser\'s settings.',
    [T, { name: 'field', type: 'string', required: false, kind: 'componentWord', summary: 'A setting\'s name, in any case, such as "mode" or "degreeChords".\nLeft out: every setting, as a table.\nNot one of its settings: no result, with a console error naming them.' }],
    { example: '`ce.components.harmony.read("Harmoniser", "mode")` gives "diatonic" or "memory".', notes: ['Returns the value.'] }),
  panelVerb('setlistRead', 'setlistRead(target [, field])', 'Read the Setlist\'s settings and scenes.',
    [T, { name: 'field', type: 'string', required: false, kind: 'componentWord', summary: 'A setting\'s name, in any case, such as "index" or "scenes".\nLeft out: every setting, as a table.\nNot one of its settings: no result, with a console error naming them.' }],
    { example: '`ce.components.setlist.read("Setlist", "index")` gives the scene in front, counted from 0.', notes: ['"scenes": each { name, values, enabled, … }.', 'Returns the value.'] }),

  // --- Panel values: snapshot / restore ---
  // The two members of ce.panel that are NOT panel-view only. Creating a control needs a renderer;
  // reading and writing a value does not, and "put the panel back how it was before the solo" is a
  // footswitch action in a DAW with the window shut — which is exactly where it has to work.
  {
    id: 'panelSnapshot', category: 'Panel components', signature: 'panelSnapshot() -> object',
    summary: 'Capture every control\'s value, by name.',
    example: '`local before = ce.panel.snapshot()` keeps the panel\'s values, to put back with `ce.panel.restore(before)`.',
    notes: [
      'A control without a value of its own is left out.',
      'Keep it with `ce.storage.saveSetting()`, or in `state` for an A/B comparison.',
      'Returns a table of control names and their values.',
    ],
    params: [], scopes: 'any',
    snippet: { lua: 'local before = ce.panel.snapshot()$0', javascript: 'const before = ce.panel.snapshot();$0' },
  },
  {
    id: 'panelEach', category: 'Panel components', signature: 'panelEach(fn) -> number',
    summary: 'Call a function once for every control, with its name.',
    example: '`ce.panel.each(function(name) log(name) end)` logs every control\'s name.',
    notes: [
      '`ce.panel.info()` tells more about each.',
      'Returns how many controls it was called for. Rejected: 0, with a console error.',
    ],
    params: [{ name: 'fn', type: 'function', required: true, summary: 'Called as fn(name) for every control, those inside containers too, in panel order.\nThe names are taken first, so it can make or remove controls.\nNot a function, or left out: rejected with a console error.' }], scopes: 'any',
    snippet: {
      lua: 'ce.panel.each(function(name)\n  $0\nend)',
      javascript: 'ce.panel.each(function (name) {\n  $0\n});',
    },
  },
  {
    id: 'panelRestore', category: 'Panel components', signature: 'panelRestore(snapshot) -> number',
    summary: 'Write the values of a `ce.panel.snapshot()` back to the controls.',
    example: '`ce.panel.restore(before)` puts back the values `before` holds.',
    notes: [
      'Returns how many values were written. Rejected: 0, with a console error.',
    ],
    params: [{ name: 'snapshot', type: 'object', required: true, summary: 'A table of control names and values, as `ce.panel.snapshot()` gives.\nA control the panel no longer has: skipped.\nNot a table, or left out: rejected with a console error.' }], scopes: 'any',
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
    const args = verbArgs(verb);
    // The example, the notes and each parameter's text come from the spec as well (componentVerbs'
    // verbExample, verbNotes and verbParamSummary), in the form every other module's take: one rule
    // per line, the range and what is rejected. A verb's own `ex`, `notes` and `argDocs` win.
    return panelVerb(verb.id, verbSignature(verb), verbSummary(verb),
      [{ ...T, summary: verbParamSummary(verb, 'target', 'target') }, ...args.map((name, i) => ({
        name,
        type: PARAM_TYPE_FOR[kinds[i]] ?? 'value',
        summary: verbParamSummary(verb, name, kinds[i]),
        // Both halves come from the spec rather than from this file's reading of it, and
        // componentVerbs.test.js holds them to the signature line — which is how the two used to
        // disagree, every optional argument being published as required.
        required: !optional[i],
        ...(i === args.length - 1 ? verbValueTyping(verb, kinds[i]) : {}),
        // The index that addresses an element (a pad, a lane, a grid cell, a named element), which
        // the Values tab reads against the control the call names.
        ...(verbIndexArgs(verb).includes(name) ? { kind: 'componentIndex' } : {}),
        // …and the name of one of the family's verbs, which read, size, fill, insert and remove take.
        ...(verbNameArgs(verb).includes(name) ? { kind: 'componentWord' } : {}),
      }))], { example: verbExample(verb), notes: verbNotes(verb) });
  }),
];

/* ------------------------------------------------------------------- helpers */
// Host-provided, identical in every language (Q10). We do NOT duplicate the language's
// own math (min/max/abs/sin). Extensible — grow as DPD profiles surface new needs.

export const HELPERS = [
  // value / range
  {
    id: 'scale', category: 'Value / range', signature: 'scale(v, inLo, inHi, outLo, outHi)',
    summary: 'Move a value from one range to another.',
    example: '`scale(64, 0, 127, 0, 100)` gives about 50.',
    notes: ['The result is not kept inside the new range: a value outside the first range lands outside the second. Use `ce.math.norm()` and `ce.math.denorm()` when it must stay inside.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to move.' },
      { name: 'inLo', type: 'number', required: true, summary: 'The low end of the range the value is in.' },
      { name: 'inHi', type: 'number', required: true, summary: 'The high end of the range the value is in. If it equals the low end, the result is the new range\'s low end.' },
      { name: 'outLo', type: 'number', required: true, summary: 'The low end of the range to move it to.' },
      { name: 'outHi', type: 'number', required: true, summary: 'The high end of the range to move it to.' },
    ],
  },
  {
    id: 'clamp', category: 'Value / range', signature: 'clamp(v, lo, hi)',
    summary: 'Keep a value inside a range.',
    example: '`clamp(140, 0, 127)` gives 127.',
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to keep in range.' },
      { name: 'lo', type: 'number', required: true, summary: 'The bottom of the range. Must be below hi. A value below it gives lo.' },
      { name: 'hi', type: 'number', required: true, summary: 'The top of the range. A value above it gives hi.' },
    ],
  },
  {
    id: 'round', category: 'Value / range', signature: 'round(v)',
    summary: 'Round to the nearest whole number.',
    example: '`round(2.5)` gives 3.',
    notes: [
      'A half always rounds up, so -2.5 gives -2.',
      'To keep decimal places, use `ce.math.roundTo`.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number to round.' },
    ],
  },
  {
    id: 'snap', category: 'Value / range', signature: 'snap(v, step)',
    summary: 'Round a value to the nearest step.',
    example: '`snap(37, 10)` gives 40.',
    notes: [
      'Halfway rounds up, as with `ce.math.round`: 35 gives 40.',
      'For steps that are not evenly spaced, use `ce.math.quantize`.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to round.' },
      { name: 'step', type: 'number', required: true, summary: 'The size of the steps, such as 10 or 0.25. 0 leaves the value unchanged.\nLeft out: an error in the console and no result.' },
    ],
  },
  {
    id: 'curve', category: 'Value / range', signature: 'curve(v, shape)',
    summary: 'Bend a value from 0 to 1 with a response curve.',
    example: '`curve(0.5, "exp")` gives 0.25.',
    notes: ['For a curve of your own, use `ce.math.map`. For the curves the panel\'s Envelopes use, use `ce.math.shape`.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value.\nRange: 0 ↔ 1.\nOutside the range: not held at 0 or 1.' },
      { name: 'shape', type: 'text', required: false, summary: '"linear" (unchanged), "exp" (slow, then fast), "log" (fast, then slow) or "s" (slow at both ends). Case-insensitive.\nLeft out: "linear". An unknown name: a note in the console, and "linear" is used.' },
    ],
  },
  {
    id: 'lerp', category: 'Value / range', signature: 'lerp(a, b, t)',
    summary: 'Blend between two numbers.',
    example: '`lerp(10, 20, 0.25)` gives 12.5.',
    notes: ['For whole lists of numbers, use `ce.math.blend`.'],
    params: [
      { name: 'a', type: 'number', required: true, summary: 'The first number.' },
      { name: 'b', type: 'number', required: true, summary: 'The second number.' },
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (a ↔ b). 0.5 is halfway.\nLeft out: an error in the console and no result.\nOutside the range: not held at 0 or 1, so the result goes past a or b.' },
    ],
  },
  // wrap, and why it is not `%`. The five runtimes DISAGREE about the sign of a modulo: (-1) % 12
  // is 11 in Lua and Python and -1 in JavaScript, C++, C# and Java. So the ordinary way to write a
  // pitch class — (note + transpose) % 12 — already gives two different answers depending on which
  // engine the panel is running in, and nothing said so. This is the one arithmetic a synth panel
  // does constantly, which is why it belongs to the module rather than to each panel.
  {
    id: 'wrap', category: 'Value / range', signature: 'wrap(v, lo, hi)',
    summary: 'Wrap a value into a range, so going past the top starts again from the bottom.',
    example: '`wrap(-1, 0, 12)` gives 11.',
    notes: ['Use it for pitch classes, LFO phase and step numbers instead of your language\'s % operator. With a negative number, % differs between languages: -1 % 12 gives 11 in Lua and -1 in JavaScript.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to wrap.' },
      { name: 'lo', type: 'number', required: true, summary: 'The bottom of the range. Must be below hi. The result can equal lo.' },
      { name: 'hi', type: 'number', required: true, summary: 'The top of the range.\nThe result never equals hi: wrap(12, 0, 12) gives 0.' },
    ],
  },
  // map, and why `curve` was not enough. curve() is a CLOSED set of four names, so a taper it does
  // not have could not be expressed at all — and a properties panel cannot hold an arbitrary curve
  // either, since a property stores a constant. Breakpoints are the smallest thing that can.
  {
    id: 'mapCurve', category: 'Value / range', signature: 'mapCurve(v, points)',
    summary: 'Map a value through a curve you draw as points.',
    example: '`mapCurve(0.25, {{0, 0}, {0.5, 0.9}, {1, 1}})` gives 0.45.',
    notes: [
      'Below the first point or above the last: held at that point\'s y.',
      'Two points with the same x make a step, and the later one wins.',
      '{1, 1, "exp"} rises slowly, then fast.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to map.' },
      { name: 'points', type: 'list', required: false, summary: 'A list of points, each {x, y}, joined by straight lines and sorted by x first. A third entry bends the line that ends at the point: "exp", "log", "s" or "hold", as in ce.math.shape. A fourth sets how far it bends.\nLeft out or empty: the value is returned unchanged.' },
    ],
  },
  {
    id: 'quantizeTo', category: 'Value / range', signature: 'quantizeTo(v, values)',
    summary: 'Snap a value to the nearest entry in a list.',
    example: '`quantizeTo(9, {0, 8, 16})` gives 8.',
    notes: [
      'Exactly halfway between two entries, the lower one wins: 12 gives 8.',
      'For evenly spaced steps, use `ce.math.snap`.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value to snap.' },
      { name: 'values', type: 'list of numbers', required: false, summary: 'The entries to choose from, in any order.\nLeft out or empty: the value is returned unchanged.' },
    ],
  },
  {
    id: 'randomChoice', category: 'Value / range', signature: 'randomChoice(values [, weights])',
    summary: 'Pick an entry from a list at random.',
    example: '`randomChoice({"C", "E", "G"}, {3, 1, 1})` picks "C" three times as often as "E" or "G".',
    notes: ['It uses one random number, with or without weights, so adding weights does not change later random numbers.'],
    params: [
      { name: 'values', type: 'list', required: true, summary: 'The entries.\nEmpty: no result.' },
      { name: 'weights', type: 'list of numbers', required: false, summary: 'How likely each entry is: its weight divided by the total.\nDefault: all equal. A missing or negative weight counts as 0; if every weight is 0, all are equal.' },
    ],
  },
  {
    id: 'dbToGain', category: 'Value / range', signature: 'dbToGain(db)',
    summary: 'Convert decibels to a linear gain.',
    example: '`dbToGain(-6)` gives about 0.5.',
    params: [
      { name: 'db', type: 'number', required: true, summary: 'The level in dB. 0 dB gives 1.' },
    ],
  },
  {
    id: 'gainToDb', category: 'Value / range', signature: 'gainToDb(gain)',
    summary: 'Convert a linear gain to decibels.',
    example: '`gainToDb(0.5)` gives about -6.',
    params: [
      { name: 'gain', type: 'number', required: true, summary: 'The linear gain. 1 gives 0 dB. 0 or below gives -144 dB, the floor of 24-bit audio; no result is lower than that.' },
    ],
  },

  // --- the rest of the arithmetic a synth panel actually does (design doc §32) ---
  // Nothing here duplicates the language's own scalar maths — min/max/abs/floor/ceil/sin all exist
  // in every runtime already, and that rule is what keeps the list finite. What IS here is either
  // domain-specific, list-shaped (Lua's varargs make the language version unusable over a table),
  // or has to be identical in five runtimes to be worth anything.
  {
    id: 'norm', category: 'Value / range', signature: 'norm(v, lo, hi)',
    summary: 'Turn a value into its position within a range, from 0 to 1.',
    example: '`norm(64, 0, 127)` gives about 0.5.',
    notes: ['The reverse is `ce.math.denorm`.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value.\nOutside the range: held at 0 or 1.' },
      { name: 'lo', type: 'number', required: true, summary: 'The value that gives 0.' },
      { name: 'hi', type: 'number', required: true, summary: 'The value that gives 1. It may be below lo, for a range that runs the other way.' },
    ],
  },
  {
    id: 'denorm', category: 'Value / range', signature: 'denorm(t, lo, hi)',
    summary: 'Turn a position from 0 to 1 back into a value in a range.',
    example: '`denorm(0.5, 0, 127)` gives 63.5.',
    notes: ['The reverse of `ce.math.norm`.'],
    params: [
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (lo ↔ hi).\nOutside the range: held at 0 or 1.' },
      { name: 'lo', type: 'number', required: true, summary: 'The value at 0.' },
      { name: 'hi', type: 'number', required: true, summary: 'The value at 1. It may be below lo, for a range that runs the other way.' },
    ],
  },
  {
    id: 'bipolar', category: 'Value / range', signature: 'bipolar(t)',
    summary: 'Turn a value from 0 to 1 into one from -1 to +1.',
    example: '`bipolar(0.75)` gives 0.5.',
    notes: ['The reverse is `ce.math.unipolar`.'],
    params: [
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (-1 ↔ +1). 0.5 gives 0.\nOutside the range: not held.' },
    ],
  },
  {
    id: 'unipolar', category: 'Value / range', signature: 'unipolar(v)',
    summary: 'Turn a value from -1 to +1 into one from 0 to 1.',
    example: '`unipolar(0.5)` gives 0.75.',
    notes: ['The reverse of `ce.math.bipolar`.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'Range: -1 ↔ +1 (0 ↔ 1). 0 gives 0.5.\nOutside the range: not held.' },
    ],
  },
  {
    id: 'fold', category: 'Value / range', signature: 'fold(v, lo, hi)',
    summary: 'Bounce a value back off the ends of a range.',
    example: '`fold(12, 0, 10)` gives 8.',
    notes: ['Where `ce.math.wrap` jumps from the top to the bottom, fold keeps the movement smooth. Fold suits modulation depths; wrap suits pitch classes.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value. Past the top it heads back down; below the bottom it heads back up.' },
      { name: 'lo', type: 'number', required: true, summary: 'The bottom of the range. Must be below hi.' },
      { name: 'hi', type: 'number', required: true, summary: 'The top of the range.' },
    ],
  },
  {
    id: 'indexOfRange', category: 'Value / range', signature: 'indexOfRange(t, count)',
    summary: 'Turn a position from 0 to 1 into a slot number, such as which of eight waveforms a knob picks.',
    example: '`indexOfRange(0.5, 8)` gives 4.',
    params: [
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (first slot ↔ last slot).\nOutside the range: held at the first or last slot.' },
      { name: 'count', type: 'number', required: true, summary: 'How many slots. They count from 0, so the last is count - 1.' },
    ],
  },
  {
    id: 'crossfade', category: 'Value / range', signature: 'crossfade(a, b, t [, law])',
    summary: 'Fade from one value to another with one of the Crossfader\'s fade laws.',
    example: '`crossfade(0, 1, 0.5, "equalPower")` gives about 0.71.',
    notes: [
      'A linear fade between two sounds dips audibly in the middle; "equalPower" does not.',
      '"equalPower" adds the two values, weighted, so halfway it gives more than either: (10, 20, 0.5) gives about 21.2. That is right for two volumes.',
    ],
    params: [
      { name: 'a', type: 'number', required: true, summary: 'The value at 0.' },
      { name: 'b', type: 'number', required: true, summary: 'The value at 1.' },
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (a ↔ b).\nLeft out: 0.\nOutside the range: held at 0 or 1.' },
      { name: 'law', type: 'text', required: false, summary: '"linear", "equalPower" or "sharp". Case-insensitive.\nDefault: "linear". An unknown name is used as "linear".' },
    ],
  },
  {
    id: 'approach', category: 'Value / range', signature: 'approach(current, target, maxStep)',
    summary: 'Move a value toward a target by no more than a set step.',
    example: '`approach(10, 50, 15)` gives 25.',
    notes: ['It keeps nothing between calls, so it works in any handler without a timer, such as each time an expression pedal sends a value.'],
    params: [
      { name: 'current', type: 'number', required: true, summary: 'The value now.' },
      { name: 'target', type: 'number', required: true, summary: 'Where it is going.\nWithin one step of it: the target exactly.' },
      { name: 'maxStep', type: 'number', required: true, summary: 'The most it moves in one call. 0 or left out: straight to the target. A negative step counts as positive.' },
    ],
  },
  {
    id: 'roundTo', category: 'Value / range', signature: 'roundTo(v, decimals)',
    summary: 'Round to a number of decimal places.',
    example: '`roundTo(3.14159, 2)` gives 3.14.',
    notes: ['It returns a number, not text, so you can keep calculating with it.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number to round.' },
      { name: 'decimals', type: 'number', required: false, summary: 'How many decimal places to keep.\nDefault: 0.\nBelow 0: 0.' },
    ],
  },
  {
    id: 'almost', category: 'Value / range', signature: 'almost(a, b [, epsilon])',
    summary: 'Check whether two numbers are equal to within a small margin.',
    example: '`almost(0.1 + 0.2, 0.3)` gives true.',
    notes: ['Use it instead of == on numbers that have been through arithmetic such as `ce.math.scale`, where rounding can leave two numbers that should match very slightly apart.'],
    params: [
      { name: 'a', type: 'number', required: true, summary: 'The first number.' },
      { name: 'b', type: 'number', required: true, summary: 'The second number.' },
      { name: 'epsilon', type: 'number', required: false, summary: 'How far apart they may be.\nDefault: 0.000000001.' },
    ],
  },
  {
    id: 'minOf', category: 'Value / range', signature: 'minOf(values)',
    summary: 'Find the smallest number in a list.',
    example: '`minOf({3, 1, 2})` gives 1.',
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The numbers.\nEmpty or left out: no result.' },
    ],
  },
  {
    id: 'maxOf', category: 'Value / range', signature: 'maxOf(values)',
    summary: 'Find the largest number in a list.',
    example: '`maxOf({3, 1, 2})` gives 3.',
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The numbers.\nEmpty or left out: no result.' },
    ],
  },
  {
    id: 'sumOf', category: 'Value / range', signature: 'sumOf(values)',
    summary: 'Add up a list of numbers.',
    example: '`sumOf({1, 2, 3})` gives 6.',
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The numbers.\nEmpty or left out: 0.' },
    ],
  },
  {
    id: 'meanOf', category: 'Value / range', signature: 'meanOf(values)',
    summary: 'Find the average of a list of numbers.',
    example: '`meanOf({1, 2, 6})` gives 3.',
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The numbers.\nEmpty or left out: no result.' },
    ],
  },
  // `a, b` said nothing about these being LISTS, and with no return annotation the signature read
  // like lerp's. Passing two numbers returns an empty list, which is correct and baffling.
  {
    id: 'blend', category: 'Value / range', signature: 'blend(fromList, toList, t) -> list',
    summary: 'Blend one list of numbers into another, entry by entry.',
    example: '`blend({0, 100}, {10, 0}, 0.5)` gives {5, 50}.',
    notes: [
      'Use it to morph between two snapshots.',
      'For two single numbers, use `ce.math.lerp`.',
    ],
    params: [
      { name: 'fromList', type: 'list of numbers', required: true, summary: 'The list at 0.' },
      { name: 'toList', type: 'list of numbers', required: true, summary: 'The list at 1. If the lists differ in length, the result is as long as the shorter one.' },
      { name: 't', type: 'number', required: true, summary: 'Range: 0 ↔ 1 (fromList ↔ toList).\nLeft out: 0.\nOutside the range: not held at 0 or 1.' },
    ],
  },
  {
    id: 'randomFloat', category: 'Value / range', signature: 'randomFloat(lo, hi)',
    summary: 'Get a random number with a fractional part.',
    example: '`randomFloat(0.5, 2)` gives a number from 0.5 up to, but not including, 2.',
    notes: ['`ce.math.random` with two numbers gives whole numbers; use this one for fractions.'],
    params: [
      { name: 'lo', type: 'number', required: false, summary: 'The bottom of the range.\nBoth left out: 0 ↔ 1.\nGiven alone: the top of a range from 0, so randomFloat(5) is from 0 up to 5.' },
      { name: 'hi', type: 'number', required: false, summary: 'The top of the range, which it never reaches. It may be below lo.' },
    ],
  },
  {
    id: 'randomGaussian', category: 'Value / range', signature: 'randomGaussian([mean, sd])',
    summary: 'Get a random number on a bell curve, so most results land near the middle.',
    example: '`randomGaussian(100, 5)` gives a number near 100: within 5 of it about two times in three.',
    notes: [
      'Use it to humanise velocity or timing, where an even spread sounds mechanical.',
      'It always uses two random numbers, so a replayed seed stays in step.',
    ],
    params: [
      { name: 'mean', type: 'number', required: false, summary: 'Where most results land.\nDefault: 0.' },
      { name: 'sd', type: 'number', required: false, summary: 'How widely they spread, the standard deviation: about two thirds land within one sd of the mean.\nDefault: 1.' },
    ],
  },
  {
    id: 'randomWalk', category: 'Value / range', signature: 'randomWalk(current, step, lo, hi)',
    summary: 'Take one step of a random walk, for a value that drifts instead of jumping.',
    example: '`randomWalk(64, 3, 0, 127)` gives a number from 61 to 67.',
    params: [
      { name: 'current', type: 'number', required: true, summary: 'The value now. Pass back what the last call returned.' },
      { name: 'step', type: 'number', required: true, summary: 'The most it moves, either way.' },
      { name: 'lo', type: 'number', required: false, summary: 'The bottom. At it, the walk bounces back.\nLeft out, with hi: no limits.' },
      { name: 'hi', type: 'number', required: false, summary: 'The top. At it, the walk bounces back.' },
    ],
  },
  {
    id: 'randomBool', category: 'Value / range', signature: 'randomBool([chance])',
    summary: 'Get true or false at random.',
    example: '`randomBool(0.25)` gives true about one time in four.',
    notes: ['Use it as a probability gate on sequencer steps.'],
    params: [
      { name: 'chance', type: 'number', required: false, summary: 'The probability of true.\nRange: 0 ↔ 1 (never ↔ always).\nDefault: 0.5.\nOutside the range: held at 0 or 1.' },
    ],
  },
  {
    id: 'shuffle', category: 'Value / range', signature: 'shuffle(values)',
    summary: 'Put a list in random order.',
    example: '`shuffle({1, 2, 3})` gives the same three numbers in a random order.',
    notes: ['It uses one random number for each entry after the first, so the same seed always shuffles the same way.'],
    params: [
      { name: 'values', type: 'list', required: true, summary: 'The list.\nIt is not changed: a new list is returned.\nEmpty or left out: an empty list.' },
    ],
  },
  {
    id: 'toDegrees', category: 'Value / range', signature: 'toDegrees(radians)',
    summary: 'Convert an angle from radians to degrees.',
    example: '`toDegrees(3.14159)` gives about 180.',
    notes: ['ce.draw measures arcs in degrees.'],
    params: [
      { name: 'radians', type: 'number', required: true, summary: 'The angle in radians.' },
    ],
  },
  {
    id: 'toRadians', category: 'Value / range', signature: 'toRadians(degrees)',
    summary: 'Convert an angle from degrees to radians.',
    example: '`toRadians(180)` gives about 3.14159.',
    notes: ['Your language\'s own sin and cos take radians.'],
    params: [
      { name: 'degrees', type: 'number', required: true, summary: 'The angle in degrees.' },
    ],
  },
  {
    id: 'distance', category: 'Value / range', signature: 'distance(x1, y1, x2, y2)',
    summary: 'Measure the straight-line distance between two points.',
    example: '`distance(0, 0, 3, 4)` gives 5.',
    notes: ['Use it for XY pads, joysticks and the Orbit, or to check whether a click landed on something you drew.'],
    params: [
      { name: 'x1', type: 'number', required: true, summary: 'The first point\'s x.' },
      { name: 'y1', type: 'number', required: true, summary: 'The first point\'s y.' },
      { name: 'x2', type: 'number', required: true, summary: 'The second point\'s x.' },
      { name: 'y2', type: 'number', required: true, summary: 'The second point\'s y.' },
    ],
  },
  {
    id: 'angleOf', category: 'Value / range', signature: 'angleOf(x1, y1, x2, y2)',
    summary: 'Find the angle from one point to another.',
    example: '`angleOf(0, 0, 10, 0)` gives 90.',
    notes: [
      'It returns degrees in the range 0 ↔ 360: 0 at twelve o\'clock, increasing clockwise, as ce.draw measures them.',
      'y counts downwards, as on screen, so a point straight above gives 0.',
      'The same point twice gives 0.',
    ],
    params: [
      { name: 'x1', type: 'number', required: true, summary: 'The first point\'s x.' },
      { name: 'y1', type: 'number', required: true, summary: 'The first point\'s y.' },
      { name: 'x2', type: 'number', required: true, summary: 'The second point\'s x.' },
      { name: 'y2', type: 'number', required: true, summary: 'The second point\'s y.' },
    ],
  },
  {
    id: 'polar', category: 'Value / range', signature: 'polar(angle, radius)',
    summary: 'Turn an angle and a distance into x and y offsets from a centre.',
    example: '`polar(0, 10)` gives x 0 and y -10: straight up, as y counts downwards.',
    notes: ['Add the offsets to your centre to find, for example, the tip of a knob\'s pointer.'],
    params: [
      { name: 'angle', type: 'number', required: true, summary: 'The angle in degrees: 0 at twelve o\'clock, increasing clockwise, as ce.math.angle returns it.' },
      { name: 'radius', type: 'number', required: true, summary: 'The distance from the centre.\nLeft out: 0.' },
    ],
  },

  // --- the transforms the Properties panel itself applies (design doc §33) ---
  // The panel does not only store constants; it CONFIGURES value transforms — a Macro slot's
  // curve, a Router's dead zone and transfer curve, an Envelope segment's curve and tension, a
  // Timbre pad's blend power, a slider's tick stops, a Meter's dB scale. A script could not
  // reproduce any of them, so it could not compute what its own panel was about to display, and
  // anything it worked out alongside a bound control came out subtly different. These are the
  // app's own functions, matched exactly.
  {
    id: 'shapeCurve', category: 'Value / range', signature: 'shapeCurve(v, curve [, tension])',
    summary: 'Bend a value from 0 to 1 with the curves the panel\'s Envelope segments and Router breakpoints use.',
    example: '`shapeCurve(0.5, "exp")` gives about 0.16.',
    notes: [
      'This is a different family from `ce.math.curve`.',
      '`ce.math.unshape` reverses it.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value.\nRange: 0 ↔ 1.\nOutside the range: held at 0 or 1.' },
      { name: 'curve', type: 'text', required: false, summary: '"linear", "exp" (slow, then fast), "log" (fast, then slow), "scurve" or "s" (slow at both ends), or "hold" (0 until the end, then 1). Case-insensitive.\nLeft out or unknown: "linear".' },
      { name: 'tension', type: 'number', required: false, summary: 'How strongly "exp" and "log" bend.\nDefault: 1.6, as in the app; 0 also gives 1.6, not a straight line. At 1 it matches the curve a Macro slot uses.' },
    ],
  },
  {
    id: 'deadzone', category: 'Value / range', signature: 'deadzone(v, amount [, invert])',
    summary: 'Add a dead zone to the bottom of a value from 0 to 1, as the Expression Router does.',
    example: '`deadzone(0.55, 0.1)` gives 0.5.',
    notes: ['The response starts at the edge of the dead zone instead of jumping up from it.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value.\nRange: 0 ↔ 1.\nOutside the range: held at 0 or 1.' },
      { name: 'amount', type: 'number', required: true, summary: 'The size of the dead zone.\nAt or below it: 0. The rest is stretched to fill 0 ↔ 1.' },
      { name: 'invert', type: 'true or false', required: false, summary: 'true flips the value first.\nDefault: false.' },
    ],
  },
  {
    id: 'weightsFor', category: 'Value / range', signature: 'weightsFor(points, x, y [, power])',
    summary: 'Work out how much each anchor point counts at a position, as a Timbre Space or Preset Constellation does.',
    notes: [
      'It returns one weight per anchor, adding up to 1: the closer the anchor, the bigger its share.',
      'Pass the result to `ce.math.blendBy` to morph values.',
    ],
    params: [
      { name: 'points', type: 'list', required: true, summary: 'The anchors, as a list of {x, y}.\nEmpty: an empty list.' },
      { name: 'x', type: 'number', required: true, summary: 'The position\'s x.\nRange: 0 ↔ 1.' },
      { name: 'y', type: 'number', required: true, summary: 'The position\'s y.\nRange: 0 ↔ 1.' },
      { name: 'power', type: 'number', required: false, summary: 'How sharp the blend is: higher lets the nearest anchor take over sooner.\nDefault: 2.' },
    ],
  },
  {
    id: 'blendBy', category: 'Value / range', signature: 'blendBy(values, weights)',
    summary: 'Combine many values into one weighted average.',
    example: '`blendBy({0, 100}, {3, 1})` gives 25.',
    notes: ['This is how a morph pad turns its weights into one value. `ce.math.blend` blends two lists instead.'],
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The values to combine.' },
      { name: 'weights', type: 'list of numbers', required: true, summary: 'How much each value counts. They need not add up to 1.\nAdding up to 0 or less: 0. If the lists differ in length, the shorter one decides.' },
    ],
  },
  {
    id: 'tickStops', category: 'Value / range', signature: 'tickStops(major [, minor])',
    summary: 'Get the positions of a slider\'s scale marks, the same ones the app draws.',
    example: '`tickStops(3, 1)` gives major {0, 0.5, 1} and minor {0.25, 0.75}.',
    notes: [
      'It returns two lists, major and minor, of positions in the range 0 ↔ 1.',
      'Use it when you draw your own scale, so its marks line up with the app\'s.',
    ],
    params: [
      { name: 'major', type: 'number', required: false, summary: 'How many major marks, counting both ends.\nDefault: 11.' },
      { name: 'minor', type: 'number', required: false, summary: 'How many smaller marks between each pair of major ones.\nDefault: 0.' },
    ],
  },
  {
    id: 'dbPosition', category: 'Value / range', signature: 'dbPosition(fraction [, floorDb, ceilDb])',
    summary: 'Find how far up a dB meter a level reaches.',
    example: '`dbPosition(1)` gives about 0.91: 0 dB on a meter from -60 to +6.',
    notes: ['It returns a position in the range 0 ↔ 1 (bottom ↔ top).'],
    params: [
      { name: 'fraction', type: 'number', required: true, summary: 'The level, as a linear value.\nRange: 0 ↔ 1.\nOutside the range: held at 0 or 1.' },
      { name: 'floorDb', type: 'number', required: false, summary: 'The bottom of the meter, in dB.\nDefault: -60, as on the Meter component.' },
      { name: 'ceilDb', type: 'number', required: false, summary: 'The top of the meter, in dB.\nDefault: +6.' },
    ],
  },

  // --- taming what arrives on the wire (design doc §34) ---
  // A controller does not send tidy numbers. It sends a value that jitters, crosses a threshold
  // repeatedly, spikes once, and has already been through a taper. These four are what a script
  // needs to make that usable, and none of them composes out of what was already here.
  {
    id: 'smooth', category: 'Value / range', signature: 'smooth(current, target, coefficient [, epsilon])',
    summary: 'Move a value part of the way toward a target, so it eases in as it gets close.',
    example: '`smooth(0, 100, 0.2)` gives 20.',
    notes: [
      'Use it to steady a jittery pedal or a noisy CC.',
      'For a fixed step size, use `ce.math.approach`.',
    ],
    params: [
      { name: 'current', type: 'number', required: true, summary: 'The value now.' },
      { name: 'target', type: 'number', required: true, summary: 'Where it is going.' },
      { name: 'coefficient', type: 'number', required: true, summary: 'The share of the remaining distance covered in each call.\nRange: 0 ↔ 1 (stays put ↔ jumps to the target).\nOutside the range: held at 0 or 1.' },
      { name: 'epsilon', type: 'number', required: false, summary: 'How close counts as arrived: within it, the value lands on the target.\nDefault: 0.0001.' },
    ],
  },
  {
    id: 'hysteresis', category: 'Value / range', signature: 'hysteresis(value, on, low, high)',
    summary: 'Turn a changing value into an on/off state that does not flicker.',
    example: '`hysteresis(0.5, true, 0.3, 0.7)` gives true: between the two thresholds the state stays as it was.',
    notes: ['With two thresholds, a value hovering around one line cannot flip the state back and forth. Electronics calls this a Schmitt trigger.'],
    params: [
      { name: 'value', type: 'number', required: true, summary: 'The changing value.' },
      { name: 'on', type: 'true or false', required: true, summary: 'The state now. Pass back what the last call returned.' },
      { name: 'low', type: 'number', required: true, summary: 'At or below this, the state switches off. Must be below high.' },
      { name: 'high', type: 'number', required: true, summary: 'At or above this, the state switches on.' },
    ],
  },
  {
    id: 'median', category: 'Value / range', signature: 'median(values)',
    summary: 'Find the middle value of a list.',
    example: '`median({1, 2, 100})` gives 2.',
    notes: ['Unlike the average, one stray spike does not move it.'],
    params: [
      { name: 'values', type: 'list of numbers', required: true, summary: 'The numbers, in any order.\nWith an even count: the average of the two middle ones.\nEmpty or left out: no result.' },
    ],
  },
  {
    id: 'euclid', category: 'Value / range', signature: 'euclid(steps, pulses [, rotation])',
    summary: 'Make a Euclidean rhythm: hits spread as evenly as possible across a number of steps.',
    example: '`euclid(8, 3)` gives {false, false, true, false, false, true, false, true}.',
    notes: ['It returns a list of true and false, the same pattern the Arpeggiator uses for its rests.'],
    params: [
      { name: 'steps', type: 'number', required: true, summary: 'How many steps.\nRange: 1 ↔ 64.\nOutside the range: held at 1 or 64.' },
      { name: 'pulses', type: 'number', required: true, summary: 'How many of the steps are hits.\nMore than steps: every step is a hit.' },
      { name: 'rotation', type: 'number', required: false, summary: 'How many steps to shift the pattern by, without changing the spacing.\nDefault: 0. Negative shifts the other way.' },
    ],
  },
  {
    id: 'unshape', category: 'Value / range', signature: 'unshape(y, curve [, tension])',
    summary: 'Undo a curve: give a value after the curve and get the value from before it.',
    example: '`unshape(shapeCurve(0.3, "exp"), "exp")` gives 0.3.',
    notes: [
      'The reverse of `ce.math.shape`. Use it when a value returns from the synth through a taper, so the control lands where it started.',
      '"hold" has no exact reverse: it returns the earliest value that gives the same result.',
    ],
    params: [
      { name: 'y', type: 'number', required: true, summary: 'The value after the curve.' },
      { name: 'curve', type: 'text', required: true, summary: 'The same curve that was used.' },
      { name: 'tension', type: 'number', required: false, summary: 'The same tension that was used.\nDefault: 1.6.' },
    ],
  },
  // Seeded, and seeded is the point: the language's own math.random cannot promise the same
  // sequence in five runtimes, so a randomised patch could not be reproduced and a generative
  // sequence would sound different in the editor and in the exported plugin.
  {
    id: 'random', category: 'Value / range', signature: 'random([lo, hi])',
    summary: 'Get a random number.',
    example: '`random(1, 6)` gives a whole number from 1 to 6, as a die does.',
    notes: ['Only whole numbers inside the range: random(1.5, 3.5) gives 2 or 3. With none inside, such as random(1.2, 1.8): an error in the console and no result.'],
    params: [
      { name: 'lo', type: 'number', required: false, summary: 'The lowest whole number it can return. Give lo and hi together; with only lo, or neither, it returns a fraction in the range 0 ↔ 1, never 1.' },
      { name: 'hi', type: 'number', required: false, summary: 'The highest whole number it can return. It may be below lo.' },
    ],
  },
  {
    id: 'randomSeed', category: 'Value / range', signature: 'randomSeed(n)',
    summary: 'Set where this script\'s random numbers start, so the same seed gives the same sequence.',
    notes: [
      'Until you set one, every script starts from the same default, so its numbers repeat each time it loads.',
      'Every script and every named stream has its own sequence, so this never affects another script.',
    ],
    params: [
      { name: 'n', type: 'number', required: true, summary: 'The seed. 0 uses the default.' },
    ],
  },
  {
    id: 'randomStream', category: 'Value / range', signature: 'randomStream(name, fn)',
    summary: 'Run a block of code with random numbers from a separate, named sequence.',
    notes: ['Use it so two parts of one script, such as a melody and a drum pattern, do not affect each other\'s random numbers or seeds.'],
    params: [
      { name: 'name', type: 'text', required: true, summary: 'The sequence\'s name. Two scripts using the same name get separate sequences.' },
      { name: 'fn', type: 'function', required: true, summary: 'The code to run. The script\'s own sequence returns when it ends, even if it ends in an error.' },
    ],
  },
  // --- ce.format: a value as text, and text back (docs/design/ce-format-module.md) ---
  // Pure, and the same text in every language: formatCore.js here, and a line-for-line twin in each
  // prelude, held together by test/formatParity.test.js. Options are checked as everywhere else: a
  // key a command does not take refuses the call (the design said "ignored"; the contract's rule won).
  {
    id: 'formatNumber', category: 'Formatting', signature: 'formatNumber(v [, opts])', refusal: 'nothing',
    summary: 'A number as text, with as many decimals as it needs.',
    example: '`ce.format.number(12, { sign = "always" })` gives "+12".',
    notes: [
      'A whole number has no decimals unless `decimals` asks for them: 3 gives "3", and with `decimals = 1`, "3.0".',
      'Otherwise three significant digits, trailing zeros dropped: 2.50 gives "2.5", 0.123456 gives "0.123".',
      'Rounding is half away from zero and the point is always a point, in every language and on every computer.',
      'No value (nothing, or text that is not a number) gives the placeholder, "--", never "0".',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number. Text that is a number, such as "440", is read as one.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode']) },
    ],
  },
  {
    id: 'formatHz', category: 'Formatting', signature: 'formatHz(v [, opts])', refusal: 'nothing',
    summary: 'A frequency, in Hz or kHz, whichever reads shorter.',
    example: '`ce.format.hz(1250)` gives "1.25 kHz".',
    notes: [
      'kHz from 1000 Hz up: 999 gives "999 Hz", 1000 gives "1 kHz". Below 1 Hz, as an LFO rate can be: 0.25 gives "0.25 Hz".',
      '`space = false` packs it for a narrow display: "12.3kHz".',
    ],
    params: [
      { name: 'v', type: 'number', required: true, unit: 'hertz', summary: 'The frequency.\nBelow 0: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'scale', type: 'text', default: '"auto"', values: ['auto', 'Hz', 'kHz'],
          summary: '"Hz" or "kHz" keeps one, so a column of values lines up.' }]) },
    ],
  },
  {
    id: 'formatTime', category: 'Formatting', signature: 'formatTime(ms [, opts])', refusal: 'nothing',
    summary: 'A duration, in ms or s, whichever reads shorter.',
    example: '`ce.format.time(1200)` gives "1.2 s".',
    notes: [
      'Seconds from 1000 ms up; below 1 ms, 0.5 gives "0.5 ms".',
      'For a length in beats, use `ce.format.division`; for minutes, `ce.format.clock`.',
    ],
    params: [
      { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'The duration.\nBelow 0: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'scale', type: 'text', default: '"auto"', values: ['auto', 'ms', 's'],
          summary: '"ms" or "s" keeps one, so a column of values lines up.' }]) },
    ],
  },
  {
    id: 'formatDb', category: 'Formatting', signature: 'formatDb(v [, opts])', refusal: 'nothing',
    summary: 'A level in decibels, with one decimal.',
    example: '`ce.format.db(-6)` gives "-6.0 dB".',
    notes: [
      'One decimal by default, because a readout jumping between "-6 dB" and "-5.9 dB" reads as a fault.',
      'At or below `floor` it is written "-inf dB": silence, as `ce.math.gainToDb` gives it, is -144 dB.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, unit: 'dB', summary: 'The level, or a gain (1 = 0 dB) with `fromGain`.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'fromGain', type: 'true or false', default: 'false', summary: '`v` is a gain, converted as `ce.math.gainToDb` does.' },
        { name: 'floor', type: 'number', default: '-144', unit: 'dB', summary: 'At or below this: "-inf dB". A mixer fader often wants -80.' }]) },
    ],
  },
  {
    id: 'formatPercent', category: 'Formatting', signature: 'formatPercent(v [, opts])', refusal: 'nothing',
    summary: 'A share, as a percentage.',
    example: '`ce.format.percent(0.5)` gives "50%".',
    notes: [
      'Whole percentages unless `decimals` asks for more; no space before %.',
      'Outside the range it is written as it is, "120%": hold it with `ce.math.clamp` first.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The share, 0 to 1 unless `min` and `max` say otherwise.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'min', type: 'number', default: '0', summary: 'The value that is 0%.' },
        { name: 'max', type: 'number', default: '1', summary: 'The value that is 100%. `max = 127` reads a knob\'s raw value.\nThe same as min: the placeholder, with a console error.' }]) },
    ],
  },
  {
    id: 'formatPan', category: 'Formatting', signature: 'formatPan(v [, opts])', refusal: 'nothing',
    summary: 'A position from left to right, as a synth\'s display writes it.',
    example: '`ce.format.pan(-0.5)` gives "L25"; `ce.format.pan(0)` gives "C".',
    notes: [
      'With the default range, -1 to 1, the far left and far right read `steps`: -1 gives "L50", 1 gives "R50".',
      'With a range of your own, the number is the distance from the centre as it is, which is what synths show: with `{ min = 0, max = 127, center = 64 }`, 0 reads "L64" and 127 "R63".',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The position.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatWidth', 'formatPlaceholder',
        { name: 'min', type: 'number', default: '-1', summary: 'The far left.' },
        { name: 'max', type: 'number', default: '1', summary: 'The far right.' },
        { name: 'center', type: 'number', default: 'halfway', summary: 'The value that reads "C".' },
        { name: 'steps', type: 'number', default: '50', summary: 'What the far left and far right read, for the default range.' },
        { name: 'style', type: 'text', default: '"L50"', values: ['L50', '50L', '<50', '50>'],
          summary: '"L50" or "50L"; "<50" (">50" on the right) or "50>" ("50<" on the left) for a display with no letters to spare.' }]) },
    ],
  },
  {
    id: 'formatRatio', category: 'Formatting', signature: 'formatRatio(v [, opts])', refusal: 'nothing',
    summary: 'A ratio, as a compressor or a frequency-modulation operator shows it.',
    example: '`ce.format.ratio(4)` gives "4:1"; with `style = "x"`, 2 gives "x2.00".',
    notes: ['A ratio of infinity, as a limiter has, is written "inf:1".'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The ratio.\n0 or below: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatWidth',
        'formatPlaceholder', 'formatUnicode',
        { name: 'style', type: 'text', default: '":"', values: [':', 'x'], summary: '":" for "4:1"; "x" for "x2.00", as an FM ratio reads, two decimals.' }]) },
    ],
  },
  {
    id: 'formatClock', category: 'Formatting', signature: 'formatClock(ms [, opts])', refusal: 'nothing',
    summary: 'A time as a clock shows it: minutes, seconds and tenths.',
    example: '`ce.format.clock(83450)` gives "1:23.4".',
    notes: [
      'Hours appear from 60 minutes on: "1:02:03.4".',
      'Cut, not rounded: a clock shows the tenth that has passed, never one still to come.',
      'For a song position in bars and beats, use `ce.time.position`.',
    ],
    params: [
      { name: 'ms', type: 'number', required: true, unit: 'milliseconds', summary: 'The time.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'decimals', type: 'number', default: '1', summary: 'Decimals of the seconds, 0 to 3.' },
        { name: 'hours', type: 'true or false', default: 'false', summary: 'Always show hours.' }]) },
    ],
  },
  {
    id: 'formatNote', category: 'Formatting', signature: 'formatNote(n [, opts])', refusal: 'nothing',
    summary: 'A MIDI note number as a note name, in the octave numbering the synth uses.',
    example: '`ce.format.note(60, { middleC = 3 })` gives "C3", as a Yamaha\'s display reads middle C.',
    notes: [
      'Makers disagree on middle C: Roland and most software say C4, Yamaha says C3, some old gear C5. Get it wrong and every note on the display is an octave off.',
      'The same names as `ce.music.name`, which stays for music; this one is for display.',
    ],
    params: [
      { name: 'n', type: 'number', required: true, summary: 'The MIDI note, 0 to 127. A fraction is rounded.\nOutside the range: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'middleC', type: 'number', default: '4', summary: 'The octave number note 60 is written with: 3, 4 or 5.' },
        { name: 'flats', type: 'true or false', default: 'false', summary: '"Db4" rather than "C#4".' },
        { name: 'octave', type: 'true or false', default: 'true', summary: 'Off: the letter alone, "C#", for a key or a chord root.' }]) },
    ],
  },
  {
    id: 'formatDivision', category: 'Formatting', signature: 'formatDivision(beats [, opts])', refusal: 'nothing',
    summary: 'The note length nearest to a number of beats, by the names the sequencer components use.',
    example: '`ce.format.division(0.25)` gives "1/16"; `ce.format.division(1/3)` gives "1/8T".',
    notes: [
      'The names of `ce.time.divisions()`: "1/1" to "1/32", with "D" for dotted and "T" for triplet.',
      'A length near no division gives the beats as a number, "0.3 beats", rather than the wrong name.',
    ],
    params: [
      { name: 'beats', type: 'number', required: true, unit: 'beats', summary: 'The length; a quarter note is 1.\n0 or below: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatWidth', 'formatPlaceholder',
        { name: 'tolerance', type: 'number', default: '0.02', summary: 'How far from a division, as a part of it, still counts as that division. 0 to 0.5.' }]) },
    ],
  },
  {
    id: 'formatParameter', category: 'Formatting', signature: 'formatParameter(id, v [, opts])', refusal: 'nothing',
    summary: 'A synth parameter\'s value, written the way the synth\'s own display writes it, from the device profile.',
    example: '`ce.format.parameter("octaveShift", 61)` gives "-3" on a GAIA, where the value is stored 61 to 67 and the panel reads -3 to +3.',
    notes: [
      'What it reads from the profile, in order: a choice\'s label; `display.table`, its first entry for the lowest stored value; `display.min` and `display.max` to scale the stored range to the shown one; `display.format` to pick the command (`hz`, `time`, `db`, `percent`, `pan`, `ratio`, `note`, `division`); `display.unit`; `display.precision`; and `display.middleC`, from the parameter or the profile.',
      'A parameter the profile says nothing more about is written as its number, which is what the panel shows today.',
      'A `percent` is how far along the stored range the value is; a `pan` is the distance from the middle of the shown range, or from 0 when the range runs through 0.',
      'What the call passes wins over what the profile says: `decimals = 0` writes a parameter whose profile gives one decimal without it.',
      'The one command most panels need: `ce.components.lcd.text("Display", 1, ce.format.parameter(id, value))` shows any parameter as the synth does, once its profile says how.',
    ],
    requiresDeviceHost: true,
    params: [
      { name: 'id', type: 'string', required: true, kind: 'deviceParameter', summary: 'The parameter, by its id in the device profile.\nNot one of its parameters: the placeholder, with a console error.' },
      { name: 'v', type: 'number or text', required: true, summary: 'The value as the synth stores it, as `ce.device.read()` gives it.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatDecimals', 'formatDigits', 'formatSign',
        'formatUnit', 'formatSpace', 'formatWidth', 'formatPlaceholder', 'formatUnicode',
        { name: 'role', type: 'string', kind: 'deviceRole', default: '"mainSynth"',
          summary: 'Which device\'s profile to read, when the panel names more than one.' }]) },
    ],
  },
  {
    id: 'formatTable', category: 'Formatting', signature: 'formatTable(v, table [, opts])', refusal: 'nothing',
    summary: 'Text from a lookup table, for a value whose display follows no formula.',
    example: '`ce.format.table(2, {"Off", "I", "II", "I+II"})` gives "II".',
    notes: [
      'The first entry is for value 0 in every language, Lua included, because synths count from 0; `start = 1` changes that.',
      'A list of ranges, `{ upTo, text }`, is read in order: the first whose upTo the value does not pass.',
      'Past the end of the table: the placeholder, with a console warning.',
    ],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value.' },
      { name: 'table', type: 'list', required: true, summary: 'A list of texts, or a list of { upTo, text } ranges.\nNeither, or empty: the placeholder, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatWidth', 'formatPlaceholder',
        { name: 'start', type: 'number', default: '0', summary: 'The value the first entry of a list is for.' }]) },
    ],
  },
  {
    id: 'formatFit', category: 'Formatting', signature: 'formatFit(text, width [, opts])', refusal: 'nothing',
    summary: 'Text made exactly `width` characters long: shortened the way a synth\'s display shortens it, then padded.',
    example: '`ce.format.fit("Filter Envelope", 10)` gives "Filter Env".',
    notes: [
      'It shortens one step at a time until the text fits: (1) the abbreviation list, Envelope to Env, Resonance to Reso and about 50 more; (2) vowels from the ends of the longest words, never a first letter, Filter to Fltr; (3) the spaces between words, from the right; (4) the end, cut.',
      'Characters are counted, which is right for an LCD and any monospaced font; for a proportional font, measure with `ce.text.measure`.',
    ],
    params: [
      { name: 'text', type: 'text', required: true, summary: 'The text. A number is written as text first.' },
      { name: 'width', type: 'number', required: true, summary: 'The characters, from 1.\nBelow 1: nothing, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatAbbreviations',
        { name: 'align', type: 'text', default: '"left"', values: ['left', 'right', 'center'], summary: 'Where the padding goes.' },
        { name: 'pad', type: 'true or false', default: 'true', summary: 'Off: shortened but not padded.' },
        { name: 'steps', type: 'number', default: '4', summary: 'The last shortening step allowed, 1 to 4: 1 for abbreviations only, so a name is never mangled.' }]) },
    ],
  },
  {
    id: 'formatLine', category: 'Formatting', signature: 'formatLine(left, right, width [, opts])', refusal: 'nothing',
    summary: 'One display line: a label on the left and a value on the right, with spaces between.',
    example: '`ce.format.line("Cutoff", "12.3k", 16)` gives "Cutoff     12.3k".',
    notes: [
      'When the two do not fit, the label is shortened, as `ce.format.fit` does, never the value: a wrong-looking value is worse than a short name.',
      'A value wider than the line is cut from the left, so its end, where the unit is, stays.',
    ],
    params: [
      { name: 'left', type: 'text', required: true, summary: 'The label.' },
      { name: 'right', type: 'text', required: true, summary: 'The value, usually from another ce.format command.' },
      { name: 'width', type: 'number', required: true, summary: 'The line\'s width in characters.\nBelow 1: nothing, with a console error.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['formatAbbreviations',
        { name: 'gap', type: 'number', default: '1', summary: 'The fewest spaces between the two.' }]) },
    ],
  },
  {
    id: 'formatParse', category: 'Formatting', signature: 'formatParse(text [, opts]) -> number', refusal: 'nothing',
    summary: 'A number from text a person typed, in the forms the other ce.format commands write.',
    example: '`ce.format.parse("1.2k")` gives 1200; `ce.format.parse("C4", { kind = "note" })` gives 60.',
    notes: [
      'Without a kind it reads a number, with k for thousands, and Hz, kHz, ms, s, dB and % as units, each turned into the unit its command takes: "1.2 s" gives 1200 (ms), "50%" gives 0.5.',
      'With a kind it also reads that kind\'s forms: a note name, a division ("1/8T"), a pan ("L25"), a ratio ("4:1"); and a bare number is taken in that kind\'s unit, so "5" is 5 ms as a time.',
      'Spaces and case do not matter. Nothing it can read: no result, and no console line, because a person typing is not a script\'s mistake.',
    ],
    params: [
      { name: 'text', type: 'text', required: true, summary: 'What was typed.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields([
        { name: 'kind', type: 'text', default: '"auto"', values: ['auto', 'hz', 'time', 'db', 'percent', 'pan', 'ratio', 'note', 'division'],
          summary: 'What the value is. A unit that belongs to another kind gives no result.' },
        { name: 'min', type: 'number', summary: 'The result is held at or above this; for a pan, the far left.' },
        { name: 'max', type: 'number', summary: 'The result is held at or below this; for a pan, the far right.' },
        { name: 'center', type: 'number', summary: 'For a pan: the value that reads "C".' },
        { name: 'steps', type: 'number', default: '50', summary: 'For a pan, as `ce.format.pan` takes it.' },
        { name: 'middleC', type: 'number', default: '4', summary: 'For a note, as `ce.format.note` takes it.' }]) },
    ],
  },

  // music
  // Middle C is C4 — scientific pitch notation, which is what every runtime has always computed.
  // These summaries said "C3" (the Yamaha convention) from the start, so the docs and the code
  // disagreed by an octave: a script written from the manual transposed everything twelve
  // semitones. The code is right and stays; the wording is what was wrong.
  {
    id: 'noteName', category: 'Music', signature: 'noteName(n [, flats])',
    summary: 'Give the name of a MIDI note number.',
    example: '`ce.music.name(61)` gives "C#4".',
    notes: [
      'Returns the name as text.',
      '`ce.music.spelling()` says whether a key is spelled with flats.',
    ],
    params: [
      { name: 'n', type: 'number', required: true, summary: 'Note number: 60 is middle C, C4.\nA fraction: rounded down.\nOutside 0 to 127: named the same way; -1 is "B-2".\nNot a number, or left out: no result, with a console error.', kind: 'note' },
      { name: 'flats', type: 'boolean', required: false, summary: 'Left out: # for a sharp, as "C#4", plain text to type and compare.\ntrue: flats, as the panel spells them: "D♭4".\nfalse: sharps, as the panel spells them: "C♯4".' },
    ],
  },
  {
    id: 'noteNumber', category: 'Music', signature: 'noteNumber(name) -> number',
    summary: 'Give the MIDI note number of a note name.',
    example: '`ce.music.number("Eb4")` gives 63.',
    notes: [
      'Returns the number. It can pass 127: "G#9" is 128.',
      'A name it cannot read gives no result rather than 0, since 0 is a note: C-1.',
    ],
    params: [{ name: 'name', type: 'string', required: true, summary: 'A letter from A to G, then #, ♯, b or ♭ if it has one, then the octave: "C4" is 60, middle C. Case-insensitive; spaces round it are ignored.\nCb is the B below; B# and E# are not read.\nNo octave, a name that cannot be read, a number, or left out: no result, with a console error.', kind: 'note' }],
  },
  // Scales, chords and quantise-to-scale — what §2 defined ce.music as, finished. The interval
  // tables are the panel's OWN: a script asking for "dorian" and a Chord Pad set to "dorian" mean
  // the same seven notes, because there is one table (scripting/musicTheory.js) generated into
  // every prelude. `root` and `note` accept a MIDI number or a name ("C4"), like sendNote does.
  {
    id: 'scaleNotes', category: 'Music', signature: 'scaleNotes(root [, scale]) -> list',
    summary: 'Give the notes of a scale, one octave up from its root.',
    example: '`ce.music.scale("D4", "dorian")` gives {62, 64, 65, 67, 69, 71, 72}.',
    notes: [
      'Returns 7 notes; 5 for the pentatonic scales, 6 for "blues". The root is not repeated at the top.',
      'Notes past 127 are given as they are; `sendNote()` refuses them.',
    ],
    params: [
      { name: 'root', type: 'value', required: true, summary: 'The first note.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
    ],
  },
  {
    id: 'chordNotes', category: 'Music', signature: 'chordNotes(root [, type]) -> list',
    summary: 'Give the notes of a chord of a type, up from its root.',
    example: '`ce.music.chord("D4", "min7")` gives {62, 65, 69, 72}.',
    notes: [
      'Returns the notes, lowest first. Notes past 127 are given as they are.',
      'A chord on a step of a key: `ce.music.degreeChord()`.',
    ],
    params: [
      { name: 'root', type: 'value', required: true, summary: 'The lowest note.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'type', type: 'string', required: false, summary: 'One of "major", "minor", "dim", "aug", "sus2", "sus4", "power", "maj6", "min6", "dom7", "maj7", "min7", "minMaj7", "dim7", "m7b5", "aug7", "add9", "dom9", "maj9" and "min9". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'chord' },
    ],
  },
  {
    id: 'quantizeNote', category: 'Music', signature: 'quantizeNote(note, root [, scale]) -> number',
    summary: 'Move a note to the nearest note of a key.',
    example: '`ce.music.quantize(61, "C4")` gives 62.',
    notes: [
      'Returns the note. A note in the key is returned as it is.',
      'Equally near two notes of the key: the higher.',
    ],
    params: [
      { name: 'note', type: 'value', required: true, summary: 'The note to move.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'root', type: 'value', required: true, summary: 'The key\'s note; its octave does not matter.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
    ],
  },
  // Key, degree and voicing — phase 12. The three verbs above answer questions about a note or a
  // shape in isolation; these answer questions about a note IN A KEY, which is what the Chord Pad,
  // the Harmoniser and the Arpeggiator each compute for themselves and no script could reach. Every
  // one is the panel's own algorithm rather than a second opinion: a script naming a chord and the
  // Chord Pad labelling the same chord have to agree, or the panel contradicts itself on screen.
  {
    id: 'noteSpelling', category: 'Music', signature: 'noteSpelling(root [, scale]) -> boolean',
    summary: 'Tell whether a key is spelled with flats.',
    example: '`ce.music.spelling("F4")` gives true.',
    notes: [
      'Returns true for the keys of F, B♭, E♭, A♭, D♭ and G♭; false for the others.',
      'A minor-type scale ("minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "locrian", "pentatonicMin") is judged by the key a minor third above its root, as the Chord Pad judges it: C minor is spelled as E♭ major.',
      'Pass it to `ce.music.name()` to spell as the panel does.',
    ],
    params: [
      { name: 'root', type: 'value', required: true, summary: 'The key\'s note; its octave does not matter.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
    ],
  },
  {
    id: 'inScale', category: 'Music', signature: 'inScale(note, root [, scale]) -> boolean',
    summary: 'Tell whether a note is in a key.',
    example: '`ce.music.inScale(66, "C4")` gives false.',
    notes: [
      'Returns true or false.',
      'In any octave: C2 is in the key of C5.',
    ],
    params: [
      { name: 'note', type: 'value', required: true, summary: 'The note.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'root', type: 'value', required: true, summary: 'The key\'s note; its octave does not matter.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
    ],
  },
  {
    id: 'scaleDegree', category: 'Music', signature: 'scaleDegree(note, root [, scale]) -> number',
    summary: 'Give which step of a key a note is.',
    example: '`ce.music.degree("G4", "C4")` gives 5.',
    notes: [
      'Returns the step, counted from 1: 1 the root, 5 the fifth.',
      'A note not in the key: no result, without a word. `ce.music.quantize()` moves it into the key first.',
    ],
    params: [
      { name: 'note', type: 'value', required: true, summary: 'The note, in any octave.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'root', type: 'value', required: true, summary: 'The key\'s note; its octave does not matter.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
    ],
  },
  {
    id: 'degreeChord', category: 'Music', signature: 'degreeChord(root [, scale [, degree [, size]]]) -> table',
    summary: 'Give the chord a key builds on one of its steps.',
    example: '`ce.music.degreeChord("C4", "major", 5).name` gives "G".',
    notes: [
      'Returns { notes, names, name, quality, roman, degree, rootNote, offsets }: the notes; their names without the octave, and the chord\'s ("E♭m7"), spelled as the key is; its quality, as `ce.music.quality()` names it; its roman numeral ("V", "vii°"); the step; its lowest note; the notes as semitones above the root.',
      'Built from every other note of the scale, as the Chord Pad builds it.',
      'Named from its first four notes: a chord of 5 or more is named as its seventh chord.',
      'A chord of a type: `ce.music.chord()`.',
    ],
    params: [
      { name: 'root', type: 'value', required: true, summary: 'The key\'s note; its octave places the chord.\nA MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.\nA fraction: rounded down.\nA name that cannot be read, not a note, or left out: no result, with a console error.', kind: 'note' },
      { name: 'scale', type: 'string', required: false, summary: 'One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.\nLeft out: "major".\nAny other: no result, with a console error.', kind: 'scale' },
      { name: 'degree', type: 'number', required: false, summary: 'Step, counted from 1: 1 the root, 5 the fifth.\nPast the last step: on into the octave above; 8 is the root an octave up.\n0 and below: the octave below; 0 is the last step.\nA fraction: rounded down.\nLeft out: 1.\nNot a number: 1, with a console warning the first time.' },
      { name: 'size', type: 'number', required: false, summary: 'Notes: 3 a triad, 4 a seventh chord.\nBelow 2: 2.\nA fraction: rounded down.\nLeft out: 3.\nNot a number: 3, with a console warning the first time.' },
    ],
  },
  {
    id: 'chordQuality', category: 'Music', signature: 'chordQuality(notes) -> string',
    summary: 'Name a chord from its notes.',
    example: '`ce.music.quality({60, 63, 67, 70})` gives "min7".',
    notes: [
      'Returns one of "maj", "min", "dim", "aug", "sus2", "sus4", "maj7", "dom7", "min7", "minMaj7", "dim7" and "m7b5", as the Chord Pad names chords.',
      'Named from the lowest note: an inverted chord is named from its bass.',
      'A chord it cannot place, such as a bare fifth or one note: "maj".',
      'An empty list: no result, without a word.',
    ],
    params: [{ name: 'notes', type: 'list', required: true, summary: 'MIDI note numbers or names, such as {60, "E4", 67}.\nNot a list, a list with anything else in it, or left out: no result, with a console error that says where.', kind: 'noteList' }],
  },
  {
    id: 'voiceLead', category: 'Music', signature: 'voiceLead(notes [, previous [, mode]]) -> list',
    summary: 'Rearrange a chord so its notes move as little as they can from the chord before.',
    example: '`ce.music.lead({72, 76, 79}, {60, 64, 67})` gives {60, 64, 67}.',
    notes: [
      'Returns the notes as numbers.',
      'As the Harmoniser leads its voices.',
    ],
    params: [
      { name: 'notes', type: 'list', required: true, summary: 'The chord to rearrange: MIDI note numbers or names, such as {60, "E4", 67}.\nNot a list, a list with anything else in it, or left out: an empty list, with a console error that says where.', kind: 'noteList' },
      { name: 'previous', type: 'list', required: false, summary: 'The chord before, as `notes`.\nLeft out, or empty: the notes sorted, low to high.\nNot a list, or a list with anything else in it: an empty list, with a console error.', kind: 'noteList' },
      { name: 'mode', type: 'string', required: false, summary: '"closest": all the notes together move as little as they can.\n"smooth": the top note moves as little as it can; the others may jump.\n"off": the notes sorted, low to high.\nCase-insensitive.\nLeft out: "closest".\nAny other: "closest", with a console warning the first time.', values: VOICE_LEAD_MODES },
    ],
  },
  {
    id: 'expandOctaves', category: 'Music', signature: 'expandOctaves(notes [, octaves]) -> list',
    summary: 'Repeat notes in the octaves above, as an Arpeggiator spreads them.',
    example: '`ce.music.octaves({60, 64}, 2)` gives {60, 64, 72, 76}.',
    notes: [
      'Returns the notes sorted, low to high, then again an octave up for each octave more.',
      'A note that would pass 127 is left out.',
      'The step before `ce.music.arp()`.',
    ],
    params: [
      { name: 'notes', type: 'list', required: true, summary: 'MIDI note numbers or names, such as {60, "E4", 67}.\nNot a list, a list with anything else in it, or left out: an empty list, with a console error that says where.', kind: 'noteList' },
      { name: 'octaves', type: 'number', required: false, summary: 'Octaves, counting the notes\' own.\nRange: 1 ↔ 4, whole.\nOutside the range: the nearest end, with a console warning the first time.\nA fraction: rounded down, with a console warning the first time.\nNot a number: 1, with a console warning the first time.\nLeft out: 1.', kind: 'number' },
    ],
  },
  {
    id: 'arpOrder', category: 'Music', signature: 'arpOrder(notes, pattern) -> list',
    summary: 'Give the order an arpeggiator pattern plays notes in.',
    example: '`ce.music.arp({60, 64, 67}, "updown")` gives {{60}, {64}, {67}, {64}}.',
    notes: [
      'Returns a list of steps, each a list of notes.',
      'Sort the notes first for a rising run; `ce.music.octaves()` sorts them.',
      'Shuffled: `ce.math.shuffle()`.',
    ],
    params: [
      { name: 'notes', type: 'list', required: true, summary: 'MIDI note numbers or names, such as {60, "E4", 67}.\nNot a list, a list with anything else in it, or left out: an empty list, with a console error that says where.', kind: 'noteList' },
      { name: 'pattern', type: 'string', required: true, summary: '"up": in the order given.\n"down": the order given, reversed.\n"updown": up, then down, not playing the top or the bottom twice.\n"downup": down, then up, the same way.\n"asPlayed": in the order given.\n"random": in the order given; the Arpeggiator picks each step as it plays.\n"chord": every note at once, in one step.\nCase-insensitive.\nAny other: "up", with a console warning the first time.\nLeft out: an empty list, with a console error.', values: ARP_ORDER_PATTERNS },
    ],
  },
  // MIDI data encoding (escape hatch — the DPD does this for modeled params)
  {
    id: 'to7bit', category: 'MIDI encoding', signature: 'to7bit(v, count, order)',
    summary: 'Split a number into SysEx bytes.',
    example: '`to7bit(1000, 2)` gives {7, 104}.',
    notes: ['Returns a list of bytes, each from 0 to 127.', 'from7bit joins them back.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number to split, from 0. Two bytes hold up to 16383, three up to 2097151, four up to 268435455.\nA fraction: rounded down.\nOne that does not fit in the bytes, not a number, or left out: no result, with a console error.' },
      { name: 'count', type: 'number', required: false, summary: 'How many bytes of 7 bits to make, from 1 to 4.\nLeft out: 2.\nAny other: no result, with a console error.' },
      { name: 'order', type: 'text', required: false, summary: '"msb": the high byte first.\n"lsb": the low byte first.\nCase-insensitive.\nLeft out: "msb".\nAny other: no result, with a console error.' },
    ],
  },
  {
    id: 'from7bit', category: 'MIDI encoding', signature: 'from7bit(bytes, order)',
    summary: 'Join SysEx bytes back into one number.',
    example: '`from7bit({7, 104})` gives 1000.',
    notes: ['Returns a number.'],
    params: [
      { name: 'bytes', type: 'list of bytes', required: true, summary: '1 to 4 bytes, each from 0 to 127, as a list or as hex text.\nMore or fewer, a byte above 127, not a list of bytes, or left out: no result, with a console error.' },
      { name: 'order', type: 'text', required: false, summary: '"msb": the high byte first.\n"lsb": the low byte first.\nCase-insensitive.\nLeft out: "msb".\nAny other: no result, with a console error.' },
    ],
  },
  // `to14Bit` is the spelling the WebView runtime shipped with before the contract was
  // enforced. Kept as an alias so panels written against it keep working; `to14bit` (matching
  // to7bit/from7bit) is the documented name and the one the other runtimes define.
  {
    id: 'to14bit', category: 'MIDI encoding', signature: 'to14bit(v)',
    summary: 'Split a number into two 7-bit halves, msb and lsb.',
    example: '`to14bit(8192)` gives msb 64 and lsb 0.',
    notes: ['Returns { msb, lsb }, each from 0 to 127.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number, from 0 to 16383.\nA fraction: rounded down.\nOutside 0 to 16383, not a number, or left out: no result, with a console error.' },
    ],
    aliases: ['to14Bit'],
  },
  {
    id: 'from14bit', category: 'MIDI encoding', signature: 'from14bit(msb, lsb)',
    summary: 'Join two 7-bit halves into one number.',
    example: '`from14bit(64, 0)` gives 8192.',
    notes: ['Returns a number from 0 to 16383.'],
    params: [
      { name: 'msb', type: 'number', required: true, summary: 'The high half, a whole number from 0 to 127.\nAny other, or left out: no result, with a console error.' },
      { name: 'lsb', type: 'number', required: true, summary: 'The low half, a whole number from 0 to 127.\nAny other, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'toNibbles', category: 'MIDI encoding', signature: 'toNibbles(byte)',
    summary: 'Split a byte into its two 4-bit halves, its nibbles.',
    example: '`toNibbles(0x4A)` gives hi 0x4 and lo 0xA.',
    notes: ['Returns { hi, lo }, each from 0 to 15.', 'Some synths send every byte this way.'],
    params: [
      { name: 'byte', type: 'number', required: true, summary: 'A byte, from 0 to 255.\nA fraction: rounded down.\nOutside 0 to 255, not a number, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'fromNibbles', category: 'MIDI encoding', signature: 'fromNibbles(hi, lo)',
    summary: 'Join two 4-bit halves back into one byte.',
    example: '`fromNibbles(0x4, 0xA)` gives 0x4A.',
    notes: ['Returns a byte, from 0 to 255.'],
    params: [
      { name: 'hi', type: 'number', required: true, summary: 'The high half, a whole number from 0 to 15.\nAny other, or left out: no result, with a console error.' },
      { name: 'lo', type: 'number', required: true, summary: 'The low half, a whole number from 0 to 15.\nAny other, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'nibblize', category: 'MIDI encoding', signature: 'nibblize(bytes)',
    summary: 'Split every byte in a list into two 4-bit halves.',
    example: '`nibblize({0x4A, 0x10})` gives {0x4, 0xA, 0x1, 0x0}.',
    notes: ['Returns a list twice as long, the high half of each byte first.'],
    params: [
      { name: 'bytes', type: 'list of bytes', required: true, summary: 'The bytes, each from 0 to 255, as a list or as hex text.\nNot a list of bytes, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'denibblize', category: 'MIDI encoding', signature: 'denibblize(bytes)',
    summary: 'Join a list of 4-bit halves back into bytes.',
    example: '`denibblize({0x4, 0xA, 0x1, 0x0})` gives {0x4A, 0x10}.',
    notes: ['Returns a list half as long.'],
    params: [
      { name: 'bytes', type: 'list of bytes', required: true, summary: 'Pairs of halves, the high half first, each from 0 to 15, as a list or as hex text.\nAn odd count, a half above 15, not a list of bytes, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'toAscii', category: 'MIDI encoding', signature: 'toAscii(str, length)',
    summary: 'Turn text, such as a patch name, into character codes.',
    example: '`toAscii("Lead", 6)` gives {76, 101, 97, 100, 32, 32}.',
    notes: ['Returns a list of codes, each from 0 to 127.', 'fromAscii turns them back into text.'],
    params: [
      { name: 'str', type: 'text', required: true, summary: 'The text, in ASCII: letters without accents, digits, spaces and the signs on an English keyboard.\nA character outside ASCII, not text, or left out: no result, with a console error.' },
      { name: 'length', type: 'number', required: false, summary: 'The length of the field, from 1.\nShorter text: filled out with spaces.\nLonger text: cut to the length, with a console warning the first time.\nLeft out: the text as it is.\nAny other: the text as it is, with a console warning the first time.' },
    ],
  },
  {
    id: 'fromAscii', category: 'MIDI encoding', signature: 'fromAscii(bytes)',
    summary: 'Turn character codes back into text, such as a patch name read from a dump.',
    example: '`fromAscii({76, 101, 97, 100})` gives "Lead".',
    notes: ['Returns the text.'],
    params: [
      { name: 'bytes', type: 'list of bytes', required: true, summary: 'The character codes, each from 0 to 127, as a list or as hex text.\nA code above 127, not a list of bytes, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'toOffset', category: 'MIDI encoding', signature: 'toOffset(v, center)',
    summary: 'Add a centre to a value that can go below zero, so it fits in a MIDI byte.',
    example: '`toOffset(-10, 64)` gives 54.',
    notes: ['Returns the value plus the centre, not held to 0 to 127.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The value, which may be negative.\nNot a number, or left out: no result, with a console error.' },
      { name: 'center', type: 'number', required: true, summary: 'The number that stands for zero, often 64.\nNot a number, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'fromOffset', category: 'MIDI encoding', signature: 'fromOffset(b, center)',
    summary: 'Take the centre off a MIDI byte, to get back a value that can go below zero.',
    example: '`fromOffset(54, 64)` gives -10.',
    notes: ['Returns the byte minus the centre.'],
    params: [
      { name: 'b', type: 'number', required: true, summary: 'The byte, as the synth sends it.\nNot a number, or left out: no result, with a console error.' },
      { name: 'center', type: 'number', required: true, summary: 'The number that stands for zero, often 64.\nNot a number, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'toSigned', category: 'MIDI encoding', signature: 'toSigned(v, bits)',
    summary: 'Turn a negative number into the bits a synth stores it as.',
    example: '`toSigned(-1, 8)` gives 255.',
    notes: ['This is called two\'s complement. fromSigned reads it back.', 'Returns a number from 0 below 2 to the power of bits: 0 to 255 for 8 bits.'],
    params: [
      { name: 'v', type: 'number', required: true, summary: 'The number: -128 to 127 for 8 bits, -64 to 63 for 7.\nFrom 0: comes back unchanged.\nA fraction: rounded down.\nOutside the range, not a number, or left out: no result, with a console error.' },
      { name: 'bits', type: 'number', required: true, summary: 'How many bits the synth uses for it, from 1 to 32, such as 7 or 8.\nAny other, or left out: no result, with a console error.' },
    ],
  },
  {
    id: 'fromSigned', category: 'MIDI encoding', signature: 'fromSigned(b, bits)',
    summary: 'Read a negative number from the bits a synth stores it as.',
    example: '`fromSigned(255, 8)` gives -1.',
    notes: ['This reads two\'s complement, as toSigned writes it.', 'Returns a number: -128 to 127 for 8 bits.'],
    params: [
      { name: 'b', type: 'number', required: true, summary: 'The stored value, as the synth sends it: a whole number from 0 below 2 to the power of bits, 0 to 255 for 8 bits.\nAny other, or left out: no result, with a console error.' },
      { name: 'bits', type: 'number', required: true, summary: 'How many bits the synth uses for it, from 1 to 32, such as 7 or 8.\nAny other, or left out: no result, with a console error.' },
    ],
  },

  // Byte lists: what JUCE's MemoryBlock does, over the lists scripts already pass bytes in
  // (docs/design/script-bytes.md says why lists and not a block object). Shared rules, stated in
  // the parameters and notes that need them: offsets and bit positions count from 0 in every language, Lua
  // included, as dump layouts do; a list may be hex text; a mistake answers nothing and says why;
  // every list that comes back is new.
  {
    id: 'getBits', category: 'MIDI encoding', signature: 'getBits(value, start, count) -> number',
    summary: 'Read a setting from a byte.',
    example: '`getBits(0xB4, 4, 3)` gives 3.',
    params: [
      { name: 'value', type: 'number', required: true, summary: 'A number of up to 32 bits, or a list of bytes, where the bits run on from one byte into the next, eight to a byte. A list item that is not a byte from 0 to 255 is refused with a message.' },
      { name: 'start', type: 'number', required: true, summary: 'The first bit of the setting, counted from 0 at the right, the lowest bit.' },
      { name: 'count', type: 'number', required: true, summary: 'How many bits the setting has, from 1 to 32. Bits past the end of the value are refused with a message, not read as 0.' },
    ],
  },
  {
    id: 'setBits', category: 'MIDI encoding', signature: 'setBits(value, start, count, bits) -> number|list',
    summary: 'Change a setting in a byte.',
    example: '`setBits(0xB4, 4, 3, 5)` gives 0xD4.',
    params: [
      { name: 'value', type: 'number', required: true, summary: 'A number of up to 32 bits, or a list of bytes. A number gives back a number, and a list gives back a new list: the list passed in is not changed.' },
      { name: 'start', type: 'number', required: true, summary: 'The first bit of the setting, counted from 0 at the right, the lowest bit.' },
      { name: 'count', type: 'number', required: true, summary: 'How many bits the setting has, from 1 to 32.' },
      { name: 'bits', type: 'number', required: true, summary: 'The new setting. A value that does not fit in the bits is refused with a message, not cut down to fit.' },
    ],
  },
  {
    id: 'bytesRead', category: 'MIDI encoding', signature: 'bytesRead(bytes, offset, count [, opts]) -> number',
    summary: 'Read a number from a SysEx message.',
    example: '`bytesRead(msg, 6, 2)` reads bytes 6 and 7.',
    notes: [
      { text: 'Offsets count from 0 in every language, Lua included, as dump layouts count them.', check: 'luaOffset' },
      'By default the bytes are SysEx\'s 7-bit bytes, high byte first, the way to7bit writes them. The options can say otherwise.',
    ],
    params: [
      { name: 'bytes', type: 'bytes', required: true, summary: 'The message, as a list of bytes or as hex text.' },
      { name: 'offset', type: 'number', required: true, summary: 'Where the number starts, counted from 0.' },
      { name: 'count', type: 'number', required: true, summary: 'How many bytes the number takes, from 1 to 4. Bytes past the end of the message are refused with a message.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['bytesBits', 'bytesOrder']) },
    ],
  },
  {
    id: 'bytesWrite', category: 'MIDI encoding', signature: 'bytesWrite(bytes, offset, count, value [, opts]) -> list',
    // Its signature ends `-> list`, which would make a refused call answer an empty list; but every
    // byte-list verb answers nothing when it refuses (ce.midi.write already did for a value that does
    // not fit), because an empty list reads as a message with nothing in it.
    refusal: 'nothing',
    summary: 'Write a number into a SysEx message.',
    example: '`bytesWrite(msg, 6, 2, 1000)` writes 1000 into bytes 6 and 7.',
    notes: [
      { text: 'Offsets count from 0 in every language, Lua included, as dump layouts count them.', check: 'luaOffset' },
      'An option other than bits and order is refused with a message, and nothing comes back.',
    ],
    params: [
      { name: 'bytes', type: 'bytes', required: true, summary: 'The message, as a list of bytes or as hex text.\nIt is not changed: a new list comes back.' },
      { name: 'offset', type: 'number', required: true, summary: 'Where the number starts, counted from 0. The write may run past the end, and the list grows, but it cannot start past the end.' },
      { name: 'count', type: 'number', required: true, summary: 'How many bytes the number takes, from 1 to 4.' },
      { name: 'value', type: 'number', required: true, summary: 'The number to write. A number that does not fit in the bytes is refused with a message.' },
      { name: 'opts', type: 'object', required: false, fields: optionFields(['bytesBits', 'bytesOrder']) },
    ],
  },
  {
    id: 'bytesSlice', category: 'MIDI encoding', signature: 'bytesSlice(bytes, offset [, count]) -> list',
    summary: 'Copy part of a list of bytes into a new list.',
    example: '`fromAscii(bytesSlice(dump, 10, 12))` reads the 12-letter name at byte 10.',
    notes: [
      { text: 'Offsets count from 0 in every language, Lua included, as dump layouts count them.', check: 'luaOffset' },
    ],
    params: [
      { name: 'bytes', type: 'bytes', required: true, summary: 'The list, or hex text.' },
      { name: 'offset', type: 'number', required: true, summary: 'Where to start copying, counted from 0.' },
      { name: 'count', type: 'number', required: false, summary: 'How many bytes to copy. Left out, every byte to the end. Bytes past the end are refused with a message.' },
    ],
  },
  {
    id: 'bytesPut', category: 'MIDI encoding', signature: 'bytesPut(bytes, offset, values) -> list',
    summary: 'Write a run of bytes into a copy of a list.',
    example: '`bytesPut(dump, 10, toAscii("Lead", 12))` writes a patch name from byte 10.',
    notes: [
      { text: 'Offsets count from 0 in every language, Lua included, as dump layouts count them.', check: 'luaOffset' },
    ],
    params: [
      { name: 'bytes', type: 'bytes', required: true, summary: 'The list, or hex text.\nIt is not changed: a new list comes back.' },
      { name: 'offset', type: 'number', required: true, summary: 'Where to start writing, counted from 0. The write may run past the end, and the list grows, but it cannot start past the end.' },
      { name: 'values', type: 'bytes', required: true, summary: 'The bytes to write, as a list or as hex text.' },
    ],
  },
  {
    id: 'bytesFind', category: 'MIDI encoding', signature: 'bytesFind(bytes, pattern [, from]) -> number',
    summary: 'Find where a run of bytes first appears in a list, such as a patch\'s header in a bulk dump.',
    example: '`bytesFind(dump, "F0 41")` gives the offset of the first F0 41.',
    notes: ['When the bytes are not there it gives nothing, without a message.'],
    params: [
      { name: 'bytes', type: 'bytes', required: true, summary: 'The list to search, or hex text.' },
      { name: 'pattern', type: 'bytes', required: true, summary: 'The bytes to find, as a list or as hex text.' },
      { name: 'from', type: 'number', required: false, summary: 'Where to start looking, counted from 0. It is 0 when left out.' },
    ],
  },
  {
    id: 'bytesToHex', category: 'MIDI encoding', signature: 'bytesToHex(bytes) -> string',
    summary: 'Write bytes as hex text.',
    example: '`bytesToHex({240, 65, 16, 247})` gives "F0 41 10 F7".',
    notes: ['It is the form the console shows MIDI in, and the form every send reads.'],
    params: [{ name: 'bytes', type: 'bytes', required: true, summary: 'The bytes, as a list.' }],
  },
  {
    id: 'bytesFromHex', category: 'MIDI encoding', signature: 'bytesFromHex(text) -> list',
    summary: 'Read hex text into a list of bytes.',
    example: '`bytesFromHex("F0 41 10 F7")` gives {240, 65, 16, 247}.',
    params: [{ name: 'text', type: 'text', required: true, summary: 'One or two digits a byte, with or without 0x, with spaces or commas between, as every send reads it. Text with a longer run, such as "F04110", is refused with a message, and so is anything that is not text.' }],
  },
  {
    id: 'bytesToBase64', category: 'MIDI encoding', signature: 'bytesToBase64(bytes) -> string',
    summary: 'Write bytes as base64 text, to keep a dump in a setting or in state.',
    example: '`bytesToBase64({240, 65, 16, 247})` gives "8EEQ9w==".',
    notes: ['Base64 is about a third shorter than hex. It uses the standard alphabet, with = padding.'],
    params: [{ name: 'bytes', type: 'bytes', required: true, summary: 'The bytes, as a list.' }],
  },
  {
    id: 'bytesFromBase64', category: 'MIDI encoding', signature: 'bytesFromBase64(text) -> list',
    summary: 'Read base64 text back into a list of bytes.',
    example: '`bytesFromBase64("8EEQ9w==")` gives {240, 65, 16, 247}.',
    params: [{ name: 'text', type: 'text', required: true, summary: 'The base64 text. Spaces and line breaks are ignored; anything else that is not base64 is refused with a message.' }],
  },
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
    blurb: 'MIDI in and out, MPE, the connected device and MIDI-CI, its patches and checking what it holds, music theory, musical time, the DAW an exported plug-in runs in, and OSC.',
    modules: ['ce.midi', 'ce.mpe', 'ce.device', 'ce.ci', 'ce.patch', 'ce.verify', 'ce.music', 'ce.time', 'ce.daw', 'ce.osc'] },
  { id: 'numbers', label: 'Working out values',
    blurb: 'Value and range arithmetic, a value as text, and moving a value over time.',
    modules: ['ce.math', 'ce.format', 'ce.anim'] },
  { id: 'panel', label: 'The panel itself',
    blurb: 'Creating and arranging controls, the computer keyboard, saving things that outlive the session, and files.',
    modules: ['ce.panel', 'ce.keys', 'ce.storage', 'ce.file'] },
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
    summary: 'Read and change values, listen for events, and print to the console: the commands every script uses.' },
  // requires ce.music because sendNote/sendAftertouch accept a note NAME, and resolving it is
  // noteNumber() — a ce.music member. Gating ce.music away would leave sendNote(1, "C4", …)
  // reading a stub and sending note 0. panelApiParity.test.js walks the preludes and fails on any
  // cross-module call that `requires` does not cover, so this cannot be forgotten again.
  // ce.time is a real dependency now, not a convenience: sendNote's optional duration schedules the
  // note off with after(). The prelude-dependency test caught it the moment the call appeared, which
  // is exactly the drift that rule exists to stop.
  { id: 'ce.midi', version: '1.3', requires: ['ce.core', 'ce.music', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Send and receive MIDI: notes, controllers, programs, bend, clock and SysEx, with filters, routing, panic, checksums and the byte encoders synths use.'
      + 'CC/NRPN/Sysex — plus wire filters, injection, routing, panic, checksums and the 7-bit/nibble/ASCII encoders.' },
  // MIXED, and for the same honest reason ce.panel is: declaring a parameter or a dump layout is
  // data plus a codec and works window-closed, but binding a control to one needs a control model
  // and there is none with the window shut. The two verbs say so individually.
  // requires ce.time because requestDump's optional callback needs a timeout, and the timeout is
  // after() — a ce.time member. Gating ce.time away would leave a callback that never resolves,
  // which is precisely the hanging this closed. The prelude-dependency test caught it the moment
  // the call appeared, which is the drift that rule exists to stop.
  { id: 'ce.device', version: '1.3', requires: ['ce.core', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Talk to the connected synth: its parameters, reading and setting them, and its dumps; and describe a synth the app has no profile for. Needs a synth connected.' },
  // requires ce.core because curve() now REPORTS a shape it does not know instead of silently
  // returning the input, and reporting is log(). ce.core is global and never gated, so the
  // dependency costs nothing at runtime — but it is a real call and the prelude-dependency test
  // is right to want it declared.
  { id: 'ce.math', version: '1.8', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Work with numbers: ranges, curves, snapping, decibels, colours and random numbers.' },
  { id: 'ce.format', version: '1.1', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Show a value as the text a person reads, such as Hz, dB, a note name or a clock time, and read typed text back as a value.' },
  { id: 'ce.music', version: '1.2', requires: [], runtime: RUNTIME_ANY,
    summary: 'Work with notes and keys: note names, scales, chords, snapping to a key, chord names, voice leading and arpeggio orders.' },
  { id: 'ce.time', version: '1.3', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Work in musical time: the tempo, the song position, beats and bars, timers, note lengths, swing and tap tempo.' },
  // requires ce.math because envelope() drives the value through ce.math.map — one lookup, shared
  // with the Envelope component — and ce.time because `beats` and `sync` are the transport's.
  { id: 'ce.anim', version: '1.1', requires: ['ce.core', 'ce.math', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Move a value over time: to a target, with a spring, or along a drawn shape, in time with the tempo or not. Works with the panel window shut.' },
  { id: 'ce.ui', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Talk to the person playing: messages, the status bar, questions and the clipboard. Panel view only.' },
  { id: 'ce.draw', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Draw on top of any control: shapes, gradients and text in the LCD font, and measure it. Panel view only.' },
  // The first MIXED module. Its structure verbs are panel-view only and say so individually, but
  // snapshot/restore are not — so declaring the whole module unavailable window-closed would make
  // ce.has("ce.panel") tell a script to skip two verbs that work perfectly there. The per-member
  // stubs are what state the boundary precisely; the module says "some of this reaches you".
  { id: 'ce.panel', version: '1.4', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Create, copy, find and arrange controls. Panel view only, but for snapshot and restore, which work anywhere.' },
  { id: 'ce.storage', version: '1.2', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Keep values: for the script while it runs, or saved with the panel, for one script or on this computer; and read and write JSON.' },
  // Panel view only, and for a reason worth stating: the font catalogue is the editor's, and the
  // measuring is done on a canvas. A player host has neither, and a typography verb that answered
  // from a guess would be worse than one that says it is not there.
  // Panel view only, for the same reason ce.text is: the icon library and the file cache are the
  // editor's, and a verb that answered from a guess would be worse than one that says it is absent.
  { id: 'ce.image', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Put pictures on controls, from files or the icon library, and keep them in the panel for an export. Panel view only.' },
  // requires the four whose commands it reads and sends through, so they are there whenever it is.
  { id: 'ce.patch', version: '1.0', requires: ['ce.core', 'ce.device', 'ce.panel', 'ce.math', 'ce.storage'], runtime: RUNTIME_ANY,
    summary: 'Work with a synth\'s whole sound: capture, morph, randomize, merge, compare, send and keep patches.' },
  // requires ce.core only: the transport is the device layer's, and messages arrive as events.
  { id: 'ce.osc', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Send and receive Open Sound Control messages, using the network only after the user says yes.' },
  // requires ce.core only: it asks the plug-in, and names controls as set does.
  { id: 'ce.daw', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_ANY,
    summary: 'Work with the DAW an exported plug-in runs in: its parameters, programs, gestures, names and spare parameters.' },
  // requires ce.midi, whose sends MPE goes out through and whose note names it reads.
  { id: 'ce.mpe', version: '1.0', requires: ['ce.core', 'ce.midi'], runtime: RUNTIME_ANY,
    summary: 'Play and read MPE, where each note has a channel of its own and can bend, swell and change tone by itself.' },
  // requires ce.device, whose role ports MIDI-CI goes out and comes back on.
  { id: 'ce.ci', version: '1.0', requires: ['ce.core', 'ce.device'], runtime: RUNTIME_ANY,
    summary: 'Ask a MIDI-CI device who it is, read and change its properties, and turn its profiles on and off. Not yet tried against a real MIDI-CI device.' },
  // requires ce.time, whose tempo and beats per bar midiWrite uses when a song gives neither. The
  // dialogs are the panel view's; the byte commands run everywhere.
  { id: 'ce.file', version: '1.0', requires: ['ce.core', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Open, save and take apart librarian files, such as .syx and MIDI files, through the person\'s own file dialogs.' },
  // requires ce.device, whose dumps it asks for, and ce.time, whose after() spaces the asks.
  { id: 'ce.verify', version: '1.0', requires: ['ce.core', 'ce.device', 'ce.time'], runtime: RUNTIME_ANY,
    summary: 'Ask the synth whether it holds what was sent, and report what matched, what differed and what could not be checked.' },
  { id: 'ce.keys', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Use the computer keyboard: shortcuts, the keys held and a piano on the letter keys. Panel view only.' },
  { id: 'ce.text', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Set a control\'s typography, list the fonts there are, and measure text to fit its box. Panel view only.' },
  { id: 'ce.components.split', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Split the keyboard into zones, each with its own channel and transpose. Panel view only.' },
  { id: 'ce.components.phrase', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Drive the Phrase Sequencer: its pattern, key, scale, direction and cells. Panel view only.' },
  { id: 'ce.components.recorder', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Record, play and edit takes on the Phrase Recorder, and keep them in slots. Panel view only.' },
  { id: 'ce.components.harmony', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Set how the Harmoniser turns each played note into a chord. Panel view only.' },
  { id: 'ce.components.setlist', version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: 'Move through the Setlist\'s scenes, and set which it plays. Panel view only.' },
  // …and one per remaining family, expanded from the same spec the verbs come from. One module
  // per family rather than one for all of them: a panel with an Arpeggiator should not pay for the
  // LCD, the Matrix and the Orbit, and the cost report is per module.
  ...COMPONENT_FAMILIES.map((fam) => ({
    id: moduleIdFor(fam.id), version: '1.0', requires: ['ce.core'], runtime: RUNTIME_WEBVIEW,
    summary: `${fam.summary} Panel view only.`,
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
               watch: 'watch', compute: 'compute', intercept: 'intercept', action: 'defineAction',
               origin: 'origin' },
  'ce.midi': [
    'sendCC', 'sendNRPN', 'sendRPN', 'sendSysex', 'checksum', 'panic', 'sendSongPosition',
    'sendMidi', 'sendNote', 'sendNoteOff', 'sendProgramChange', 'sendPitchBend',
    'sendAftertouch', 'sendClock', 'sendTransport',
    'to7bit', 'from7bit', 'to14bit', 'from14bit', 'toNibbles', 'fromNibbles', 'nibblize',
    'denibblize', 'toAscii', 'fromAscii', 'toOffset', 'fromOffset', 'toSigned', 'fromSigned',
    'getBits', 'setBits',
  ].reduce((acc, id) => { acc[id] = id; return acc; }, {
    // The namespaced names read well; the flat aliases have to stay distinct from ce.core.intercept,
    // which is a different thing entirely — one filters a model path, these filter the wire.
    interceptIn: 'interceptMidiIn', interceptOut: 'interceptMidiOut',
    feed: 'feedMidi', route: 'routeMidi',
    // The byte-list helpers: short names in the namespace, and flat names that say "bytes", since
    // a bare global read, write, slice, put or find is a word a script reaches for itself.
    read: 'bytesRead', write: 'bytesWrite', slice: 'bytesSlice', put: 'bytesPut', find: 'bytesFind',
    toHex: 'bytesToHex', fromHex: 'bytesFromHex', toBase64: 'bytesToBase64', fromBase64: 'bytesFromBase64',
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
               fromARGB: 'colourFromArgb', fromRGBA: 'colourFromRgba',
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
  // Every namespaced name is a bare word (`number`, `time`, `table`, `line`, `fit`, `parse`), so
  // every flat alias keeps the format prefix.
  'ce.format': {
    number: 'formatNumber', hz: 'formatHz', time: 'formatTime', db: 'formatDb', percent: 'formatPercent',
    pan: 'formatPan', ratio: 'formatRatio', clock: 'formatClock', note: 'formatNote', division: 'formatDivision',
    parameter: 'formatParameter', table: 'formatTable', fit: 'formatFit', line: 'formatLine', parse: 'formatParse',
  },
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
  'ce.patch': {
    current: 'patchCurrent', read: 'patchRead', load: 'patchLoad', morph: 'patchMorph', blend: 'patchBlend',
    random: 'patchRandom', mutate: 'patchMutate', merge: 'patchMerge', diff: 'patchDiff', equal: 'patchEqual',
    apply: 'patchApply', save: 'patchSave', list: 'patchList', forget: 'patchForget', write: 'patchWrite',
    scopes: 'patchScopes', define: 'patchDefine',
  },
  'ce.osc': {
    listen: 'oscListen', stop: 'oscStop', on: 'oscOn', off: 'oscOff', target: 'oscTarget', send: 'oscSend',
    bundle: 'oscBundle', status: 'oscStatus',
  },
  'ce.daw': {
    host: 'dawHost', parameters: 'dawParameters', parameter: 'dawParameter', program: 'dawProgram',
    programs: 'dawPrograms', beginGesture: 'dawBeginGesture', endGesture: 'dawEndGesture', rename: 'dawRename',
    assign: 'dawAssign', markChanged: 'dawMarkChanged',
  },
  'ce.mpe': {
    zone: 'mpeZone', noteOn: 'mpeNoteOn', express: 'mpeExpress', noteOff: 'mpeNoteOff',
    allOff: 'mpeAllOff', notes: 'mpeNotes', listen: 'mpeListen',
  },
  'ce.ci': {
    discover: 'ciDiscover', devices: 'ciDevices', get: 'ciGet', set: 'ciSet', subscribe: 'ciSubscribe',
    unsubscribe: 'ciUnsubscribe', profiles: 'ciProfiles', setProfile: 'ciSetProfile', draftProfile: 'ciDraftProfile',
  },
  'ce.file': {
    open: 'fileOpen', save: 'fileSave', read: 'fileRead', write: 'fileWrite', folder: 'fileFolder', list: 'fileList',
    saveIn: 'fileSaveIn', syxSplit: 'fileSyxSplit', syxJoin: 'fileSyxJoin', midiRead: 'fileMidiRead', midiWrite: 'fileMidiWrite',
  },
  'ce.verify': {
    coverage: 'verifyCoverage', check: 'verifyCheck', dump: 'verifyDump', write: 'verifyWrite', probe: 'verifyProbe',
    patch: 'verifyPatch', summary: 'verifySummary', running: 'verifyRunning', cancel: 'verifyCancel',
  },
  'ce.keys': {
    shortcut: 'keysShortcut', remove: 'keysRemove', list: 'keysList', isDown: 'keysIsDown', held: 'keysHeld',
    piano: 'keysPiano', pianoInfo: 'keysPianoInfo', focus: 'keysFocus', focused: 'keysFocused',
  },
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
function memberReferenceRe(memberId, shortName, isModuleName = false) {
  const flat = escapeForRe(memberId);
  const short = escapeForRe(shortName);
  // A member whose short name is also a module's (ce.format.time beside ce.time) would otherwise be
  // found in every script that reaches for that module, so `ce.time` itself does not count for it.
  const before = isModuleName ? '(?<!\\bce\\s*)' : '';
  return new RegExp(`\\b${flat}\\b|${before}\\.\\s*${short}\\b`);
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
    .map(([id, at]) => ({
      module: at.module,
      re: memberReferenceRe(id, at.name, known.some((m) => m.id === `ce.${at.name}`)),
    }));
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

/** The scripts a panel ships, flattened — panel-level plus per-control, a container's children
 *  included (controlsInTree). Sources only. */
function panelScriptSources(panel) {
  const out = [];
  for (const s of panel?.scripts ?? []) if (typeof s?.source === 'string') out.push(s.source);
  for (const control of controlsInTree(panel?.controls)) {
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

/* ------------------------------------------------------------ a parameter's type, in words
 * The reference, the hover card and the Values tab show each parameter's type and whether it is
 * required beside its description, so the description does not have to say "Number required."
 * (docs/design/api-descriptions-handoff.md). `type` is the contract's own field, and readers branch
 * on several of its values (targetRef, path, bytes, eventName, dumpKind, object), so the words are
 * derived here rather than written into it. A `kind` that says more than the type wins: a note is a
 * number or a name such as "C4", whatever the type says.
 */
const TYPE_WORDS = {
  number: 'number', string: 'text', dumpKind: 'text', scriptRef: 'text', boolean: 'true or false',
  array: 'list', targetRef: 'control name', eventName: 'event name',
  'number or division': 'number or text', value: 'any value',
  'number or table': 'number or table', 'number or name': 'number or name',
};
const KIND_WORDS = {
  note: 'note', noteList: 'list of notes', colour: 'colour', bytes: 'bytes',
};

/** `param`'s type in plain words: "number", "text", "options"… An object is "options" when it
 *  lists its fields and a command takes it, and "table" otherwise, as a handler is given one. */
export function paramTypeLabel(param, member = null) {
  if (!param) return '';
  if (KIND_WORDS[param.kind]) return KIND_WORDS[param.kind];
  if (param.type === 'object') return param.fields?.length && member?.kind !== 'lifecycle' ? 'options' : 'table';
  return TYPE_WORDS[param.type] ?? String(param.type ?? '');
}

/** "number, required" or "text, optional": what the reference shows in brackets after a name. */
export function paramTypeLine(param, member = null) {
  const type = paramTypeLabel(param, member);
  const need = param?.required ? 'required' : 'optional';
  return type ? `${type}, ${need}` : need;
}

/* ------------------------------------------------------------ option keys a call does not take
 * An options table is the one argument where a mistake cannot show: `{ easing = "outBack" }` on
 * ce.anim.to moved in a straight line, and the call succeeded. So a key a member's options do not
 * list REFUSES the call, in every runtime that implements the member: the WebView runtime checks
 * each call against what is listed here (panelRuntime.js, applyOptionChecks), and
 * tools/scripts/gen-script-modules.mjs writes the same lists, and the same check, into each C++
 * engine's prelude. A panel cannot then work in the exported plug-in and refuse in the editor, or
 * the other way round.
 *
 * What is not a mistake, and is not checked: a key that is a number (a Lua list arrives as a table of
 * numbered keys, and a list is not an options table); anything inside an option's value, unless
 * the option lists fields of its own (a NRPN's msb and lsb); a section name where `<section>` is
 * listed; and every key of a member whose options list no fields, since nothing says what such a
 * member does not take. */

/** Members that check their own option keys: ce.text.style and ce.image.set (whose keys image.set
 *  reads in any case), which refuse the whole call for an unknown one in the common words
 *  (panelRuntime's refusedForUnknownOptions), ce.panel.find for its filters, and the storage calls,
 *  where a misspelled `scope` key would share a private setting. ce.panel.define checks its spec,
 *  whose keys depend on the section it defines in, in the common words with the call before them
 *  (panelRuntime's DEFINE_SPECS); its spec lists no fields, so the common check would pass it by in
 *  any case. The common check leaves them to it rather than saying it twice. */
export const MEMBERS_CHECKING_OWN_OPTIONS = new Set([
  'textStyle', 'imageSet', 'panelFind', 'panelDefine',
  'saveSetting', 'loadSetting', 'listSettings', 'forgetSetting', 'allSettings', 'clearSettings',
  'storageInfo',
]);

/** What a refused call answers. A call refused before it does anything, as an unknown option key
 *  refuses it, answers what the member answers when it refuses anything else:
 *    'nothing'     nil, undefined or None, as most members do;
 *    'false'       a member that answers whether it did what was asked;
 *    'zero'        a count of what it changed, as ce.panel's arranging verbs answer;
 *    'empty list'  a member that answers a list, so a loop over the answer still runs;
 *    'result'      a result table, { ok = false, error = <what the console says> }, recallPreset's;
 *    'unanswered'  false, with the callback already called with nothing, which is what false
 *                  always means from ce.ui.dialog, prompt and choose.
 *  A member names its own with `refusal`; without one, a signature that ends `-> boolean` answers
 *  'false', one that ends `-> list` 'empty list', and anything else 'nothing'. */
export const REFUSAL_ANSWERS = ['nothing', 'false', 'zero', 'empty list', 'result', 'unanswered'];

export function refusalOf(member) {
  if (member?.refusal) return member.refusal;
  const returns = /->\s*(\w+)\s*$/.exec(String(member?.signature ?? ''))?.[1];
  if (returns === 'boolean') return 'false';
  if (returns === 'list') return 'empty list';
  return 'nothing';
}

/** A field list as the check reads it: the names in the contract's order (which is the order a
 *  refusal lists them in), the fields of any option that lists its own, and whether a section name
 *  is an option too. */
function optionShape(fields) {
  const names = [];
  const nested = {};
  let sections = false;
  for (const field of fields) {
    if (field.name === '<section>') { sections = true; continue; }
    names.push(field.name);
    if (Array.isArray(field.fields) && field.fields.length) nested[field.name] = optionShape(field.fields);
  }
  return { names, nested, sections };
}

/** Every member whose calls have their option keys checked, with what is checked:
 *  [{ id, path, refusal, params: [{ index, name, shape }] }], one entry per member whose options
 *  list fields, except the members that check their own. Built-in members only. */
export function optionChecks() {
  const out = [];
  for (const member of ALL_MEMBERS) {
    if (member.kind === 'lifecycle' || MEMBERS_CHECKING_OWN_OPTIONS.has(member.id)) continue;
    const params = [];
    (member.params ?? []).forEach((param, index) => {
      if (Array.isArray(param.fields) && param.fields.length) {
        params.push({ index, name: param.name, shape: optionShape(param.fields) });
      }
    });
    if (params.length) out.push({ id: member.id, path: memberPath(member.id), refusal: refusalOf(member), params });
  }
  return out;
}

/** "a", "a and b", "a, b and c": several things named in one sentence. */
export const andList = (items) => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** `ce.anim.to: "easing" is not one of its options, so nothing was done. Its options are: …`, in
 *  the words the storage calls, the first to refuse an unknown key, already used in every runtime.
 *  `keys` are the unknown keys of one group (sorted), `parent` the option they sit in ('' for the
 *  call's own), and `shape` what optionChecks gives for it. The WebView runtime refuses a call in
 *  these words (panelRuntime.js, applyOptionChecks), and the script editor's Values sidebar shows
 *  them on the key's row. */
export function unknownOptionsMessage(path, { parent, keys, shape }) {
  const quoted = keys.map((key) => `"${parent ? `${parent}.` : ''}${key}"`);
  const what = keys.length === 1
    ? `${quoted[0]} is not one of its options, so nothing was done.`
    : `${andList(quoted)} are not among its options, so nothing was done.`;
  const names = shape.sections
    ? [...shape.names, 'and the name of any section, such as Behavior']
    : shape.names;
  const listed = names.length === 1
    ? `${parent ? `The only option of ${parent}` : 'Its only option'} is ${names[0]}.`
    : `${parent ? `The options of ${parent}` : 'Its options'} are: ${names.join(', ')}.`;
  return `${path}: ${what} ${listed}`;
}

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
