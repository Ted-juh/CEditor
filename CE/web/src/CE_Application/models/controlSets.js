// Control sets — one visual language every ready-made control draws from.
//
// The idea is in docs/design/control-sets.md; this is its first layer, the token dictionary and
// the resolver. A set is a small dictionary of NAMED DECISIONS (`accent`, `control.track`,
// `text.muted`), and a Part or State property that used to hold a literal colour may instead hold
// a REFERENCE to one of those names. The renderer resolves references against the panel's active
// set at draw time, so switching the set restyles every control that has not been overridden.
//
// THE REFERENCE FORM. The design record sketched `{ token: 'accent.hot' }`, an object where a
// string used to be. It is a string instead: `'{accent.hot}'`, the alias syntax of the W3C Design
// Tokens format the record itself points at. Two reasons, both about the code that already exists:
//
//   - Every colour consumer in this codebase is string-typed — `cssColour`, `hexToRgba`, the
//     `.slice(-6)` in a dozen swatches, `parseInt(hex.slice(0, 2), 16)`. An object reaching any of
//     them throws; a string that is not hex merely fails to parse, and every one of those helpers
//     already has a fallback for that. A reference that leaks past the resolver degrades instead
//     of taking the canvas down.
//   - `shrinkControl` diffs a control against its type's defaults with plain equality. A string
//     compares like any other default; an object would have needed a deep-compare special case in
//     the one place the document format is decided.
//
// Text content is NOT a colour: a Label whose content is literally `{value}` (the template syntax
// bindings use) must stay `{value}`. So the resolver only looks at keys that name a colour —
// `colour`, `underlineColour`, `'Background.Fill.colour'` — and never at anything else.

import { PILOT_CONTROL_SETS } from './pilotControlSets.js';
import { CATALOG_CONTROL_SETS, CATALOG_SET_EXTRAS } from './catalogControlSets.js';
import { makeAdditionalControlSets } from './additionalControlSets.js';
import { extendControlSet } from './controlSetCoverage.js';
import { typeFamilies } from './controlSetRecipes.js';
import { withLabelDesign } from './labelDesigns.js';
import { withSectionDesign, withSectionSurface } from './sectionDesigns.js';
import { withInstrumentDesign, withInstrumentTokens } from './instrumentDesigns.js';
import { withDisplayDesign } from './displayDesigns.js';
import { withPersonalDesigns } from './personalSetDesigns.js';
import { deepClone } from '../utils/deepClone.js';

const TOKEN_REFERENCE_PATTERN = /^\{([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\}$/i;
const COLOUR_LITERAL_PATTERN = /^[0-9A-F]{6}(?:[0-9A-F]{2})?$/i;
const MAX_ALIAS_DEPTH = 8;

/**
 * The roles a set has to name. Every built-in set defines every one of these (the test insists),
 * because a partial DEFAULT set is a set that sometimes falls back to a different design, and
 * "every control agrees" is the whole point. The `group` is for a future picker; `description`
 * says what the role is for, not what colour it is.
 */
export const CONTROL_SET_TOKEN_ROLES = [
  // The panel itself. Every text role is chosen to read on this, not on `surface`: in a set whose
  // buttons are cream on a black panel, `surface` is the cream and the text is cream too, and a
  // Label filled with `surface` had cream lettering on a cream plate.
  { name: 'panel.surface', group: 'panel', description: 'The panel\'s face: the fill of a Label and of a Background block. Text roles read on it.' },
  { name: 'section.surface', group: 'panel', description: 'The face of a section (Group, Container, tab page, scroll area): the panel a step further from the lettering, so text roles read on it too.' },
  // Instruments: the controls that draw a live display (Macro, Turing, Arp, Transport, Keyboard...).
  // Their face is the set's display window; the series are their voices. Graphite's are today's
  // palette, so a panel that never chose a set draws them as it always did.
  { name: 'instrument.face', group: 'instrument', description: 'The face of an instrument control: the set\'s display window.' },
  { name: 'instrument.ink', group: 'instrument', description: 'Secondary lettering on an instrument face: captions, scales, units.' },
  { name: 'instrument.text', group: 'instrument', description: 'Primary lettering on an instrument face: names, the current item.' },
  { name: 'series.one', group: 'series', description: 'First voice: bars, notes, curves, the main value.' },
  { name: 'series.two', group: 'series', description: 'The moving or current thing: a playhead, a head step, a puck, a tonic.' },
  { name: 'series.three', group: 'series', description: 'Second voice: steps, in-key notes, rings.' },
  { name: 'series.four', group: 'series', description: 'Third voice: minor chords, added notes.' },
  { name: 'series.five', group: 'series', description: 'Fourth voice: the next lane in a multi-lane display.' },
  { name: 'series.alert', group: 'series', description: 'Alert: record, panic.' },

  // Surfaces: the body of a button-like control and its interaction states.
  { name: 'surface', group: 'surface', description: 'Body of a ready-made control at rest (Button, Toggle, containers).' },
  { name: 'surface.hover', group: 'surface', description: 'Body while the pointer is over it.' },
  { name: 'surface.pressed', group: 'surface', description: 'Body while pressed.' },
  { name: 'surface.checked', group: 'surface', description: 'Body of a selected toggle or radio segment.' },
  { name: 'surface.mixed', group: 'surface', description: 'Body of an indeterminate toggle.' },

  // Stepper buttons and value fields (Number, Range).
  { name: 'control.button', group: 'control', description: 'Stepper button body (Number, Range).' },
  { name: 'control.button.hover', group: 'control', description: 'Stepper button while hovered.' },
  { name: 'control.button.pressed', group: 'control', description: 'Stepper button while pressed.' },
  { name: 'control.field', group: 'control', description: 'Editable value field background.' },
  { name: 'control.field.hover', group: 'control', description: 'Value field while hovered.' },
  { name: 'control.field.active', group: 'control', description: 'Value field while being scrubbed.' },
  { name: 'control.select', group: 'control', description: 'Body of a Combobox, Listbox or TextInput.' },
  { name: 'control.select.hover', group: 'control', description: 'Select body while hovered.' },
  { name: 'control.select.pressed', group: 'control', description: 'Select body while pressed.' },

  // Slider and knob anatomy.
  { name: 'control.track', group: 'control', description: 'Slider track / knob arc background.' },
  { name: 'control.track.edge', group: 'control', description: 'Hairline around the track.' },
  { name: 'control.fill', group: 'control', description: 'Filled span of the track up to the current value.' },
  { name: 'control.fill.hot', group: 'control', description: 'Filled span while dragging.' },
  { name: 'control.range', group: 'control', description: 'Selected band of a two-handle range.' },
  { name: 'control.range.hot', group: 'control', description: 'Selected band while dragging.' },
  { name: 'control.body', group: 'control', description: 'The knob\'s body — the disc under the pointer — when the set draws one.' },
  { name: 'control.cap', group: 'control', description: 'The current-value handle or knob cap.' },
  { name: 'control.cap.hot', group: 'control', description: 'Handle while dragging.' },
  { name: 'control.cap.edge', group: 'control', description: 'Hairline around a handle.' },
  { name: 'control.cap.start', group: 'control', description: 'Start handle of a range, and its label.' },
  { name: 'control.cap.end', group: 'control', description: 'End handle of a range, and its label.' },
  { name: 'control.marker', group: 'control', description: 'Centre / detent marker.' },
  { name: 'control.tick', group: 'control', description: 'Major tick marks.' },
  { name: 'control.tick.minor', group: 'control', description: 'Minor tick marks.' },

  // Accent: the one colour that says "this is live".
  { name: 'accent', group: 'accent', description: 'Primary accent — active fills.' },
  { name: 'accent.hot', group: 'accent', description: 'Focus rings and the active field border.' },

  // Text.
  { name: 'text.primary', group: 'text', description: 'Default text on a control.' },
  { name: 'text.label', group: 'text', description: 'Slider and knob labels (min / max / value).' },
  { name: 'text.muted', group: 'text', description: 'Secondary text — titles, units.' },
  { name: 'text.focus', group: 'text', description: 'Value readout while focused.' },
  { name: 'text.inverse', group: 'text', description: 'Text on an accent or checked surface.' },

  // Displays: the LCD's glass follows the set, because a set names the technology — a green STN,
  // an amber VFD, a blue OLED, paper. Graphite's are the LCD's old literals, colour for colour.
  { name: 'display.lit', group: 'display', description: 'Lit segments and characters of a display.' },
  { name: 'display.unlit', group: 'display', description: 'The ghost of unlit segments behind the text.' },
  { name: 'display.screen', group: 'display', description: 'The screen substrate behind the pixels.' },
  { name: 'display.backlight', group: 'display', description: 'The backlight wash over the screen.' },

  // Borders.
  { name: 'border', group: 'border', description: 'Border of a stepper button.' },
  { name: 'border.surface', group: 'border', description: 'Hairline around a Button or select body.' },
  { name: 'border.field', group: 'border', description: 'Border of a value field at rest.' },
  { name: 'border.mixed', group: 'border', description: 'Border of an indeterminate toggle.' },
];

export const CONTROL_SET_TOKEN_NAMES = CONTROL_SET_TOKEN_ROLES.map((role) => role.name);

/**
 * The built-in sets. `graphite` is the base set and reproduces, colour for colour, what every
 * ready-made control looked like before sets existed — a document that never chose a set has to
 * look exactly as it did. The others exist so that switching has something to switch to.
 *
 * A token's value is an AARRGGBB literal or an alias to another token in the same set
 * (`'{accent}'`), resolved through `resolveToken`.
 */
const BASE_BUILT_IN_SETS = [
  {
    id: 'graphite',
    // Classic: every document that names no set is on it, so it stays exactly what it was. New
    // panels start on the designed Graphite below instead.
    name: 'Graphite Classic',
    description: 'The original look: neutral dark greys with a cool blue accent.',
    tokens: {
      // Graphite names no panel colour, and its labels have always sat on the control surface.
      'panel.surface': '{surface}',
      'surface': 'FF3A3A3A',
      'surface.hover': 'FF4A4A4A',
      'surface.pressed': 'FF2C2C2C',
      'surface.checked': 'FF2D6F9C',
      'surface.mixed': 'FF806019',
      'control.button': 'FF343434',
      'control.button.hover': 'FF3D3D3D',
      'control.button.pressed': 'FF282828',
      'control.field': 'FF151515',
      'control.field.hover': 'FF1B1B1B',
      'control.field.active': 'FF203141',
      'control.select': 'FF2F2F2F',
      'control.select.hover': 'FF414141',
      'control.select.pressed': 'FF2A2A2A',
      'control.track': 'FF2C2C2C',
      'control.track.edge': '55202020',
      'control.fill': '{accent}',
      'control.fill.hot': 'FF71B8F1',
      'control.range': 'FF7BB3FF',
      'control.range.hot': 'FF9FD0FF',
      'control.body': 'FF3A3A3A',
      'control.cap': 'FFF6F6F6',
      'control.cap.hot': 'FFFFFFFF',
      'control.cap.edge': '99333333',
      'control.cap.start': 'FFF2B44B',
      'control.cap.end': 'FF55C79A',
      'control.marker': '99FFFFFF',
      'control.tick': 'CCFFFFFF',
      'control.tick.minor': '99FFFFFF',
      'accent': 'FF5B9BD5',
      'accent.hot': 'FF89C2FF',
      'text.primary': 'FFFFFFFF',
      'text.label': 'FFF5F5F5',
      'text.muted': 'FFB8C7D8',
      'text.focus': 'FFDAEEFF',
      'text.inverse': 'FFFFFFFF',
      'display.lit': 'FF2BE86A',
      'display.unlit': '242BE86A',
      'display.screen': 'FF06371C',
      'display.backlight': 'FF0E5A2E',
      'border': '664C4C4C',
      'border.surface': '66FFFFFF',
      'border.field': '665B5B5B',
      'border.mixed': 'FFFFD166',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm charcoal bodies, cream text and an amber accent.',
    tokens: {
      'surface': 'FF3B3330',
      'surface.hover': 'FF4A403B',
      'surface.pressed': 'FF2C2624',
      'surface.checked': 'FF9A4A1C',
      'surface.mixed': 'FF6B5A1E',
      'control.button': 'FF352E2B',
      'control.button.hover': 'FF403734',
      'control.button.pressed': 'FF2A2422',
      'control.field': 'FF181412',
      'control.field.hover': 'FF1F1A17',
      'control.field.active': 'FF3A2A1C',
      'control.select': 'FF2E2825',
      'control.select.hover': 'FF3F3733',
      'control.select.pressed': 'FF282220',
      'control.track': 'FF2A2422',
      'control.track.edge': '55160F0C',
      'control.fill': '{accent}',
      'control.fill.hot': 'FFFFA352',
      'control.range': 'FFFFC078',
      'control.range.hot': 'FFFFD9A8',
      'control.body': 'FFF3E9DC',
      'control.cap': 'FFF3E9DC',
      'control.cap.hot': 'FFFFFFFF',
      'control.cap.edge': '99332A22',
      'control.cap.start': 'FFE9B44C',
      'control.cap.end': 'FF7FCB9A',
      'control.marker': '99FFF1DD',
      'control.tick': 'CCFFF1DD',
      'control.tick.minor': '99FFF1DD',
      'accent': 'FFF08A24',
      'accent.hot': 'FFFFB35C',
      'text.primary': 'FFFFF6EC',
      'text.label': 'FFF6EEE3',
      'text.muted': 'FFC8B6A2',
      'text.focus': 'FFFFE4C2',
      'text.inverse': 'FFFFFFFF',
      'display.lit': 'FFFFB35C',
      'display.unlit': '24FFB35C',
      'display.screen': 'FF1A1208',
      'display.backlight': 'FF2A1E10',
      'border': '665A4A40',
      'border.surface': '66FFF1DD',
      'border.field': '666A5A4C',
      'border.mixed': 'FFE6C15A',
    },
  },
  {
    id: 'ivory',
    name: 'Ivory',
    description: 'Light parchment surfaces, dark text and a deep blue accent.',
    tokens: {
      'surface': 'FFE9E4DA',
      'surface.hover': 'FFF2EEE6',
      'surface.pressed': 'FFD8D2C6',
      'surface.checked': 'FF2F6F9A',
      'surface.mixed': 'FFE8D48A',
      'control.button': 'FFDDD7CB',
      'control.button.hover': 'FFE7E1D6',
      'control.button.pressed': 'FFCFC8BB',
      'control.field': 'FFFCFAF5',
      'control.field.hover': 'FFFFFFFF',
      'control.field.active': 'FFE3EEF7',
      'control.select': 'FFF7F3EC',
      'control.select.hover': 'FFFFFFFF',
      'control.select.pressed': 'FFE7E1D6',
      'control.track': 'FFCFC8BB',
      'control.track.edge': '55A39B8E',
      'control.fill': '{accent}',
      'control.fill.hot': 'FF3E8FD0',
      'control.range': 'FF7FB5E6',
      'control.range.hot': 'FFA9CCEE',
      'control.body': 'FF22201C',
      'control.cap': 'FFFFFFFF',
      'control.cap.hot': 'FFFFFFFF',
      'control.cap.edge': '99555555',
      'control.cap.start': 'FFD99A1E',
      'control.cap.end': 'FF2E9E6E',
      'control.marker': '99333333',
      'control.tick': 'CC333333',
      'control.tick.minor': '99333333',
      'accent': 'FF2F6F9A',
      'accent.hot': 'FF1F5C88',
      'text.primary': 'FF22201C',
      'text.label': 'FF2B2824',
      'text.muted': 'FF6B665C',
      'text.focus': 'FF0F3D5E',
      'text.inverse': 'FFFFFFFF',
      'display.lit': 'FF8FE3B0',
      'display.unlit': '248FE3B0',
      'display.screen': 'FF1D2A22',
      'display.backlight': 'FF2A3B30',
      'border': '66807A6E',
      'border.surface': '66403A30',
      'border.field': '66807A6E',
      'border.mixed': 'FFB98A00',
    },
  },
];

/**
 * A set's `panel.surface`: the panel colour it names (`panel.colour`), unless the set says
 * otherwise. A set that names no panel colour gets `fallback` — the built-ins pass `'{surface}'`
 * because every built-in must define every role; a user's set is left without one and reaches
 * Graphite's `'{surface}'` alias through the base-set fallback, which resolves against its own
 * surface. Either way that is what its labels sat on before this role existed.
 *
 * An inherited `'{surface}'` alias is replaced when there is a panel colour to replace it with:
 * the additional sets copy their base's tokens wholesale, Graphite's alias among them, and with a
 * panel colour present that alias is exactly the cream-on-cream this role exists to prevent.
 */
export function withPanelSurface(set, { fallback = null } = {}) {
  const current = set?.tokens?.['panel.surface'];
  const panelColour = String(set?.panel?.colour ?? '').trim().toUpperCase();
  const hasPanelColour = COLOUR_LITERAL_PATTERN.test(panelColour);
  let next = current;
  if (hasPanelColour && (current === undefined || tokenNameOf(current) === 'surface')) next = panelColour;
  else if (current === undefined && fallback) next = fallback;
  if (next === current) return set;
  return { ...set, tokens: { ...set.tokens, 'panel.surface': next } };
}

// Graphite, designed: what NEW panels start on (stores/runtimePreferences.js). Graphite itself is
// the base set, the one every document that names no set is drawn in, and it has no designs so
// that those documents keep their look; it is listed as Graphite Classic. This is a set like the
// others: a panel on it names it, so a file made today keeps its look whatever the base set does.
// It is Graphite (its greys and blue, its lettering, its lamp, its buttons and slider) with the
// knob and meter Graphite's starter already drew with (the flat disc and the continuous bar: the
// 'graphite' direction in models/controlSetCoverage.js), a panel a step darker than its controls
// so they sit on it, a display in its own blue rather than the factory's green, and every design
// the pipeline below derives.
function designedGraphite(classic) {
  // Every button letters in Graphite's face. The type block reaches the Button, the Momentary and
  // the Toggle; the timed, one-shot, cycle and radio buttons stayed in the factory's, which Classic
  // keeps as they were.
  const legend = typeFamilies(classic.type).Button?.component ?? {};
  const lettered = Object.fromEntries(['TimedButton', 'OneShotButton', 'CyclicButton', 'RadioButtonGroup']
    .map((type) => [type, { ...classic.families[type], component: { ...legend, ...classic.families[type]?.component } }]));
  return {
    ...classic,
    families: { ...classic.families, ...lettered },
    id: 'graphite-studio',
    name: 'Graphite',
    description: 'The original greys and blue, designed: flat disc knobs, continuous bars, and its panel, sections, displays and instruments drawn in one hand.',
    tokens: {
      ...classic.tokens,
      'display.lit': 'FF89C2FF',
      'display.unlit': '1F89C2FF',
      'display.screen': 'FF060709',
      'display.backlight': 'FF0C1622',
    },
    panel: { colour: 'FF27292D' },
  };
}

// Ember and Ivory began as colour-only sets; their mockup boards showed a chicken-head and a
// black-bodied knob, and models/catalogControlSets.js carries those as extras. Graphite stays
// exactly what it was: it is the look every existing document has.
const ORIGINAL_CONTROL_SETS = [
  ...BASE_BUILT_IN_SETS.map((set) => {
    const extras = CATALOG_SET_EXTRAS[set.id];
    return extras ? { ...set, ...extras, tokens: { ...set.tokens, ...(extras.tokens ?? {}) } } : set;
  }).flatMap((set) => (set.id === 'graphite' ? [set, designedGraphite(set)] : [set])),
  // Tolex and Machined: the pilot sets that reach beyond colour — a family patch each, a lamp, a
  // panel material. Defined in their own module because they are mostly data.
  ...PILOT_CONTROL_SETS,
  // And the rest of the boards.
  ...CATALOG_CONTROL_SETS,
];
export const BUILT_IN_CONTROL_SETS = [...ORIGINAL_CONTROL_SETS, ...makeAdditionalControlSets(ORIGINAL_CONTROL_SETS)]
  .map(extendControlSet)
  .map((set) => withPanelSurface(set, { fallback: '{surface}' }))
  // After panel.surface, which the label designs read to light their lettering.
  .map(withLabelDesign)
  // Then the sections, whose surface is the panel's moved a step from the lettering.
  .map((set) => withSectionSurface(set, { fallback: '{surface}' }))
  .map(withSectionDesign)
  // And the instruments, in the set's display window and its series of voices.
  .map(withInstrumentTokens)
  .map(withInstrumentDesign)
  // And the displays and shapes, in the set's readout and its section language.
  .map(withDisplayDesign);

export const DEFAULT_CONTROL_SET_ID = 'graphite';
// What a new panel starts on unless the user chose otherwise (Settings → Control Sets). Not the
// base set: a document that names no set is a document from before this, and stays on Classic.
// stores/runtimePreferences.js holds the same id as its default, without importing the sets.
export const NEW_PANEL_CONTROL_SET_ID = 'graphite-studio';

// Svelte context key under which a surface that renders a panel of its own (the preview, the
// Player) hands its controls the set to resolve against. A getter, so it follows the panel.
export const CONTROL_SET_CONTEXT_KEY = 'ce.controlSet';
// And the set's lamp, for the material filters (utils/materialFilter.js): CanvasControl and the
// panel surfaces provide it, MaterialFilter reads it. A getter as well.
export const CONTROL_SET_LAMP_CONTEXT_KEY = 'ce.controlSetLamp';
export const BASE_CONTROL_SET = BUILT_IN_CONTROL_SETS.find((set) => set.id === DEFAULT_CONTROL_SET_ID);

const SETS_BY_ID = new Map(BUILT_IN_CONTROL_SETS.map((set) => [set.id, set]));
// A built-in by its id, or by its name as duplication turns a name into an id ('Vintage Mono' is
// brassworks; its copies are 'vintage-mono-copy').
const slugOf = (text) => String(text ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BUILT_IN_BY_SLUG = new Map(BUILT_IN_CONTROL_SETS.map((set) => [slugOf(set.name), set.id]));
export function builtInControlSetId(text) {
  const key = String(text ?? '').trim();
  if (SETS_BY_ID.has(key)) return key;
  return BUILT_IN_BY_SLUG.get(slugOf(key)) ?? null;
}

/**
 * The set an id names. Three places can hold one, and the order is a rule, not an accident:
 * the DOCUMENT's own sets first (a shared file must look the way its author saw it, whatever
 * the reader has installed), then the reader's LIBRARY, then the sets built into this program.
 * So an imported set with the same id as a built-in wins over the built-in — which is exactly
 * what "I exported Ivory, changed it, and imported it again" should mean.
 */
export function getControlSet(id, { document = [], library = [] } = {}) {
  const key = String(id ?? '').trim();
  if (!key) return null;
  for (const list of [document, library]) {
    const found = (Array.isArray(list) ? list : []).find((set) => set?.id === key);
    if (found) return found;
  }
  return SETS_BY_ID.get(key) ?? null;
}

/**
 * The shape of one set, as the document and a set file carry it. Anything that is not a set
 * comes back `null`; anything that is comes back with every optional part normalised, so every
 * reader downstream can index into `tokens`, `families` and `lamp` without defending itself.
 *
 *   - `tokens`: the colour roles (required — a set with none is not a set).
 *   - `lamp`: `{ azimuth, elevation }`, the light every material on the panel is lit by.
 *   - `families`: per control type, what the set changes beyond colour — see
 *     models/controlSetFamilies.js for the patch shape and the rule it is applied under.
 *   - `panel`: what the set asks of the panel behind the controls (today: `material`).
 */
export function normalizeControlSetDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const tokens = value.tokens;
  if (!id || !tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const out = {
    id,
    name: String(value.name ?? id).trim() || id,
    description: String(value.description ?? ''),
    tokens: Object.fromEntries(Object.entries(tokens).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v.trim()])),
  };
  const azimuth = Number(value.lamp?.azimuth);
  const elevation = Number(value.lamp?.elevation);
  if (Number.isFinite(azimuth) && Number.isFinite(elevation)) out.lamp = { azimuth, elevation };
  if (value.families && typeof value.families === 'object' && !Array.isArray(value.families)) out.families = value.families;
  if (value.panel && typeof value.panel === 'object' && !Array.isArray(value.panel)) out.panel = value.panel;
  const type = normalizeControlSetType(value.type);
  if (type) out.type = type;
  // A personal set's lineage and its author's choices (models/personalSetDesigns.js).
  if (typeof value.basedOn === 'string' && value.basedOn.trim()) out.basedOn = value.basedOn.trim();
  const plainStrings = (entry) => (entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).filter(([, v]) => typeof v === 'string')) : null);
  const chosen = plainStrings(value.chosenFamilies);
  if (chosen && Object.keys(chosen).length) out.chosenFamilies = chosen;
  // What the designs wrote on the last read, per family: key and value, or (as the label design kept
  // it before values were recorded) a list of keys. An empty record is kept: it says the design wrote
  // nothing its author had not already, which no record would not.
  if (value.designed && typeof value.designed === 'object' && !Array.isArray(value.designed)) {
    const designed = Object.fromEntries(Object.entries(value.designed)
      .filter(([, record]) => record && typeof record === 'object')
      .map(([family, record]) => [family, Array.isArray(record) ? record.filter((key) => typeof key === 'string') : { ...record }]));
    if (Object.keys(designed).length) out.designed = designed;
  }
  // A set written before `panel.surface` existed still names its panel colour; that is the role.
  // Then its designs, derived again from its own colours, the same way the built-ins' are.
  return withPersonalDesigns(withPanelSurface(out), { builtInId: builtInControlSetId, isBuiltIn: (key) => SETS_BY_ID.has(key) });
}

/**
 * A set's `type` block: the roles `label`, `legend` and `field`, each a family name, a weight and
 * a letter-spacing in px (see controlSetRecipes.typeFamilies for where each lands). Anything
 * else is dropped; a block with no role is no block.
 */
export const CONTROL_SET_TYPE_ROLES = ['label', 'legend', 'field'];
export function normalizeControlSetType(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const role of CONTROL_SET_TYPE_ROLES) {
    const raw = value[role];
    if (!raw || typeof raw !== 'object') continue;
    const entry = {};
    const family = String(raw.family ?? '').trim();
    if (family) entry.family = family;
    if (Number.isFinite(Number(raw.weight))) entry.weight = Number(raw.weight);
    if (Number.isFinite(Number(raw.letterSpacing))) entry.letterSpacing = Number(raw.letterSpacing);
    if (Object.keys(entry).length) out[role] = entry;
  }
  return Object.keys(out).length ? out : null;
}

/** A document's `controlSets` list: every entry that is a set, in order, each id once. */
export function normalizeControlSetList(value) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const set = normalizeControlSetDefinition(entry);
    if (!set || seen.has(set.id)) continue;
    seen.add(set.id);
    out.push(set);
  }
  return out;
}

/** `'{accent.hot}'` → `'accent.hot'`. Anything that is not a reference → `''`. */
export function tokenNameOf(value) {
  if (typeof value !== 'string') return '';
  const match = TOKEN_REFERENCE_PATTERN.exec(value.trim());
  return match ? match[1] : '';
}

export function isTokenReference(value) {
  return tokenNameOf(value) !== '';
}

export function makeTokenReference(name) {
  return `{${String(name ?? '').trim()}}`;
}

export function isColourLiteral(value) {
  return typeof value === 'string' && COLOUR_LITERAL_PATTERN.test(value.trim());
}

/**
 * Resolve a token NAME to a literal, following aliases within the set, then falling back to the
 * base set for a name the set does not define. Returns `undefined` for a name nobody defines —
 * the caller decides what "unknown" looks like (the renderer leaves the reference in place, the
 * swatch shows its fallback colour).
 */
export function resolveToken(name, set = BASE_CONTROL_SET) {
  const chain = set && set !== BASE_CONTROL_SET ? [set, BASE_CONTROL_SET] : [BASE_CONTROL_SET];
  let current = String(name ?? '').trim();
  for (let depth = 0; depth < MAX_ALIAS_DEPTH && current; depth += 1) {
    let value;
    for (const candidate of chain) {
      const found = candidate?.tokens?.[current];
      if (found !== undefined) { value = found; break; }
    }
    if (value === undefined) return undefined;
    const alias = tokenNameOf(value);
    if (!alias) return typeof value === 'string' ? value.trim().toUpperCase() : undefined;
    current = alias;
  }
  return undefined;
}

/**
 * A colour property's value as the renderer should see it: a reference resolved against `set`,
 * anything else returned untouched. An unresolvable reference comes back as itself, so the colour
 * helpers downstream reach their own fallbacks rather than this function inventing one.
 */
export function resolveColourValue(value, set = BASE_CONTROL_SET) {
  const name = tokenNameOf(value);
  if (!name) return value;
  return resolveToken(name, set) ?? value;
}

/**
 * The same, for the swatches in the properties panel: always a literal. A reference that resolves
 * shows its colour; one that does not, and any non-colour, shows `fallback`.
 */
export function resolveColourLiteral(value, set = BASE_CONTROL_SET, fallback = 'FF3A3A3A') {
  const resolved = resolveColourValue(value, set);
  return isColourLiteral(resolved) ? String(resolved).trim().toUpperCase() : fallback;
}

// A key names a colour when it is `colour`, ends in `Colour` (`underlineColour`, `accentColour`)
// or is a dotted property path ending in `.colour` (the keys of a State's patch map). Nothing
// else is looked at — see the note on text content at the top of the file.
function isColourKey(key) {
  return key === 'colour' || key.endsWith('Colour') || key.endsWith('.colour') || key === 'cellBg' || key.endsWith('.cellBg');
}

function resolveNode(node, set, stats) {
  if (Array.isArray(node)) {
    let copy = null;
    for (let index = 0; index < node.length; index += 1) {
      const next = resolveNode(node[index], set, stats);
      if (next !== node[index]) {
        if (!copy) copy = node.slice();
        copy[index] = next;
      }
    }
    return copy ?? node;
  }
  if (!node || typeof node !== 'object') return node;

  let copy = null;
  for (const key of Object.keys(node)) {
    const value = node[key];
    let next = value;
    if (typeof value === 'string') {
      if (isColourKey(key) && isTokenReference(value)) {
        next = resolveColourValue(value, set);
        if (next === value) stats.unresolved.push(tokenNameOf(value));
        else stats.resolved += 1;
      }
    } else if (value && typeof value === 'object') {
      next = resolveNode(value, set, stats);
    }
    if (next !== value) {
      if (!copy) copy = { ...node };
      copy[key] = next;
    }
  }
  return copy ?? node;
}

/**
 * A control (or any subtree) with every colour reference replaced by the literal `set` gives it.
 *
 * Copy-on-write: a tree that holds no references comes back as THE SAME OBJECT, and a tree that
 * does is copied only along the paths that changed. Two reasons that matters. The canvas calls
 * this on every render of every control, and most controls in an existing document are literals
 * throughout, so the common case has to be a walk and nothing more. And Svelte's fine-grained
 * updates key off identity — untouched subtrees keeping theirs means a set switch repaints what
 * changed and not what did not.
 */
export function resolveControlTokens(control, set = BASE_CONTROL_SET) {
  if (!control || typeof control !== 'object') return control;
  return resolveNode(control, set ?? BASE_CONTROL_SET, { resolved: 0, unresolved: [] });
}

/** The token names referenced anywhere in a tree, each once, in first-seen order. */
export function collectTokenReferences(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectTokenReferences(item, found);
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (isColourKey(key) && isTokenReference(value)) found.add(tokenNameOf(value));
    } else if (value && typeof value === 'object') {
      collectTokenReferences(value, found);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// The panel document's side of it.
//
// A panel names its set as `controlSet: { id }`. An object rather than a bare string so that
// phase 3 — the set travelling inside the document, per-panel token overrides — has somewhere to
// go without a migration. Unknown ids are KEPT: a document that names a set this build does not
// have renders in the base set and still says which set it wanted, so the same file opened where
// that set exists gets it back.
// ---------------------------------------------------------------------------------------------

export function normalizeControlSet(value) {
  const raw = typeof value === 'string' ? value : value?.id;
  const id = String(raw ?? '').trim();
  return { id: id || DEFAULT_CONTROL_SET_ID };
}

/** The document form: `null` when the panel is on the default set with nothing else to say. */
export function serializeControlSet(value) {
  const normalized = normalizeControlSet(value);
  if (normalized.id === DEFAULT_CONTROL_SET_ID) return null;
  return { id: normalized.id };
}

/**
 * The set a panel resolves against: the one it names, looked up in the document's own sets
 * first, then `library` (the reader's, when the caller has it), then the built-ins — or the base
 * set when it names none or names one nobody has. A chosen library set is copied into the
 * document at the moment it is chosen (stores/controlSets.js), so the callers that have no
 * library to offer — the Player, the build — still find it.
 */
export function controlSetForPanel(panel, library = []) {
  return getControlSet(panel?.controlSet?.id, { document: panel?.controlSets, library }) ?? BASE_CONTROL_SET;
}

/**
 * What a new panel starts on, given the user's default (Settings → Control Sets) and their
 * library. The default may be one of the user's own sets, and a panel pointed at a library set
 * has to carry a copy of it — the Player and the build have no library, so a set the document
 * only names renders as the base set there. So a library default comes back as `controlSets` too,
 * the same copy choosing it from the panel's picker would have put there. The library is looked
 * at first, so an imported set that shares a built-in's id is the one carried, as it is the one
 * the editor shows. A default nobody has (a library set deleted since) starts on the base set
 * rather than on a name the new panel would only render as Graphite anyway.
 */
export function newPanelControlSet(defaultId, library = []) {
  const id = normalizeControlSet(defaultId).id;
  const librarySet = (Array.isArray(library) ? library : []).find((set) => set?.id === id);
  const carried = librarySet ? normalizeControlSetDefinition(deepClone(librarySet)) : null;
  if (carried) return { controlSet: { id }, controlSets: [carried] };
  if (SETS_BY_ID.has(id)) return { controlSet: { id }, controlSets: [] };
  return { controlSet: { id: DEFAULT_CONTROL_SET_ID }, controlSets: [] };
}
