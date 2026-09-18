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
    name: 'Graphite',
    description: 'The original look: neutral dark greys with a cool blue accent.',
    tokens: {
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
      'border': '66807A6E',
      'border.surface': '66403A30',
      'border.field': '66807A6E',
      'border.mixed': 'FFB98A00',
    },
  },
];

// Ember and Ivory began as colour-only sets; their mockup boards showed a chicken-head and a
// black-bodied knob, and models/catalogControlSets.js carries those as extras. Graphite stays
// exactly what it was: it is the look every existing document has.
export const BUILT_IN_CONTROL_SETS = [
  ...BASE_BUILT_IN_SETS.map((set) => {
    const extras = CATALOG_SET_EXTRAS[set.id];
    return extras ? { ...set, ...extras, tokens: { ...set.tokens, ...(extras.tokens ?? {}) } } : set;
  }),
  // Tolex and Machined: the pilot sets that reach beyond colour — a family patch each, a lamp, a
  // panel material. Defined in their own module because they are mostly data.
  ...PILOT_CONTROL_SETS,
  // And the rest of the boards.
  ...CATALOG_CONTROL_SETS,
];

export const DEFAULT_CONTROL_SET_ID = 'graphite';

// Svelte context key under which a surface that renders a panel of its own (the preview, the
// Player) hands its controls the set to resolve against. A getter, so it follows the panel.
export const CONTROL_SET_CONTEXT_KEY = 'ce.controlSet';
// And the set's lamp, for the material filters (utils/materialFilter.js): CanvasControl and the
// panel surfaces provide it, MaterialFilter reads it. A getter as well.
export const CONTROL_SET_LAMP_CONTEXT_KEY = 'ce.controlSetLamp';
export const BASE_CONTROL_SET = BUILT_IN_CONTROL_SETS.find((set) => set.id === DEFAULT_CONTROL_SET_ID);

const SETS_BY_ID = new Map(BUILT_IN_CONTROL_SETS.map((set) => [set.id, set]));

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
  return out;
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
  return key === 'colour' || key.endsWith('Colour') || key.endsWith('.colour');
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
