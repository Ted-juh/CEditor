// setEditing.js — what Settings › Control Sets edits of a set, as the owner approved for piece C
// (docs/design/changeable-control-sets.md): every colour role, grouped; the lettering of every
// family; the lamp; every family, each from a template, the author's own, or reset to where the
// set came from. Pure: the page (settings/ControlSetsSettings.svelte) holds the draft and saves it.

import { pristineControlFor } from './controlSetFamilies.js';
import { DERIVED_ROLES } from './personalSetDesigns.js';
import { familySize } from './setFromControl.js';
import { deepClone } from '../utils/deepClone.js';

/**
 * The 45 colour roles a set holds and an author sets, grouped as the controls use them. The other
 * ten (DERIVED_ROLES: the section surface, the instruments' face and inks, the series) are worked
 * out from these on every read, so they are shown and not edited.
 */
export const ROLE_GROUPS = [
  { id: 'panel', label: 'Panel and borders', roles: [
    ['panel.surface', 'Panel surface'], ['border', 'Border'], ['border.surface', 'Border on buttons'], ['border.field', 'Border on fields'], ['border.mixed', 'Border, mixed'],
  ] },
  { id: 'controls', label: 'Controls', roles: [
    ['control.track', 'Track'], ['control.track.edge', 'Track edge'], ['control.fill', 'Value fill'], ['control.fill.hot', 'Value fill, hot'],
    ['control.range', 'Range'], ['control.range.hot', 'Range, hot'], ['control.body', 'Body'], ['control.cap', 'Knob / fader cap'],
    ['control.cap.hot', 'Cap, hot'], ['control.cap.edge', 'Cap edge'], ['control.cap.start', 'Cap, start'], ['control.cap.end', 'Cap, end'],
    ['control.marker', 'Marker'], ['control.tick', 'Tick'], ['control.tick.minor', 'Minor tick'],
  ] },
  { id: 'buttons', label: 'Buttons', roles: [
    ['surface', 'Button surface'], ['surface.hover', 'Surface, hover'], ['surface.pressed', 'Surface, pressed'], ['surface.checked', 'Surface, on'],
    ['surface.mixed', 'Surface, mixed'], ['control.button', 'Button'], ['control.button.hover', 'Button, hover'], ['control.button.pressed', 'Button, pressed'],
  ] },
  { id: 'fields', label: 'Fields and menus', roles: [
    ['control.field', 'Field'], ['control.field.hover', 'Field, hover'], ['control.field.active', 'Field, active'],
    ['control.select', 'Menu'], ['control.select.hover', 'Menu, hover'], ['control.select.pressed', 'Menu, pressed'],
  ] },
  { id: 'text', label: 'Text and accent', roles: [
    ['text.primary', 'Primary text'], ['text.label', 'Label text'], ['text.muted', 'Muted text'], ['text.focus', 'Focus'],
    ['text.inverse', 'Inverse text'], ['accent', 'Accent'], ['accent.hot', 'Accent, hot'],
  ] },
  { id: 'displays', label: 'Displays', roles: [
    ['display.screen', 'Display glass'], ['display.lit', 'Display light'], ['display.unlit', 'Display, unlit'], ['display.backlight', 'Backlight'],
  ] },
];

const DERIVED_LABELS = {
  'section.surface': 'Section surface', 'instrument.face': 'Instrument face', 'instrument.ink': 'Instrument ink',
  'instrument.text': 'Instrument text', 'series.one': 'Series 1', 'series.two': 'Series 2', 'series.three': 'Series 3',
  'series.four': 'Series 4', 'series.five': 'Series 5', 'series.alert': 'Series alert',
};

/** The ten roles worked out from the others, by name. */
export const DERIVED_ROLE_GROUP = { id: 'derived', label: 'Worked out from the colours above', roles: DERIVED_ROLES.map((key) => [key, DERIVED_LABELS[key] ?? key]) };

/** The families, grouped as the Insert menu groups the controls. A type not listed goes under Other. */
export const FAMILY_GROUPS = [
  { id: 'rotary', label: 'Knobs and sliders', types: ['Knob', 'Slider', 'Range', 'Crossfader', 'Ribbon', 'PitchWheel', 'ModWheel', 'Macro'] },
  { id: 'buttons', label: 'Buttons and switches', types: ['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton', 'ToggleButton', 'CyclicButton', 'RadioButtonGroup', 'Panic'] },
  { id: 'meters', label: 'Meters', types: ['Meter', 'ProgressBar'] },
  { id: 'fields', label: 'Fields and lists', types: ['Combobox', 'TextInput', 'Listbox', 'Numpad'] },
  { id: 'pads', label: 'Pads and sequencers', types: ['DrumPads', 'StepSequencer', 'Matrix', 'Keyboard', 'ChordPad', 'Arp', 'NoteRibbon', 'Phrase', 'SplitZone'] },
  { id: 'displays', label: 'Displays', types: ['LcdDisplay', 'PixelDisplay', 'Envelope', 'VectorJoystick'] },
  { id: 'layout', label: 'Labels and containers', types: ['Label', 'Group', 'Container', 'TabContainer', 'ScrollArea', 'Background', 'Shape'] },
  { id: 'instruments', label: 'Instruments', types: ['Orbit', 'Looper', 'Router', 'Timbre', 'Turing', 'Kinetic', 'Constellation', 'Constraint', 'Recorder', 'Harmoniser', 'Setlist', 'Transport'] },
];

const FAMILY_LABELS = {
  Knob: 'Knobs', Slider: 'Sliders', Button: 'Buttons', MomentaryButton: 'Momentary buttons', ToggleButton: 'Switches',
  TimedButton: 'Timed buttons', OneShotButton: 'One-shot buttons', CyclicButton: 'Cyclic buttons', RadioButtonGroup: 'Radio groups',
  Meter: 'Meters', ProgressBar: 'Progress bars', DrumPads: 'Drum pads', StepSequencer: 'Steppers', Label: 'Labels',
  PitchWheel: 'Pitch wheels', ModWheel: 'Mod wheels', TextInput: 'Text fields', Listbox: 'Lists', Combobox: 'Menus',
  LcdDisplay: 'LCD displays', PixelDisplay: 'Pixel displays', VectorJoystick: 'Joysticks', TabContainer: 'Tabs',
  ScrollArea: 'Scroll areas', NoteRibbon: 'Note ribbons', ChordPad: 'Chord pads', SplitZone: 'Split zones',
};

/** A family by the name the page shows. */
export function familyLabel(type) {
  return FAMILY_LABELS[type] ?? `${String(type).replace(/([a-z])([A-Z])/g, '$1 $2')}s`;
}

/** The set's families in their groups, each group listing only families the set has. */
export function groupedFamilies(set) {
  const present = new Set(Object.keys(set?.families ?? {}));
  const listed = new Set();
  const groups = FAMILY_GROUPS.map((group) => {
    const types = group.types.filter((type) => present.has(type));
    types.forEach((type) => listed.add(type));
    return { ...group, types };
  }).filter((group) => group.types.length);
  const other = [...present].filter((type) => !listed.has(type)).sort();
  if (other.length) groups.push({ id: 'other', label: 'Other', types: other });
  return groups;
}

const letteringCache = new Map();
/**
 * Where a control of `type` has lettering: its own Text section, and the parts that carry text (a
 * knob's readout and title are parts). `{ section, parts }`.
 */
function letteringOf(type) {
  if (!letteringCache.has(type)) {
    const pristine = pristineControlFor(type);
    const parts = Object.entries(pristine?._children?.Parts?._children ?? {})
      .filter(([, part]) => part?._children?.Text)
      .map(([name]) => name);
    letteringCache.set(type, { section: Boolean(pristine?._children?.Text), parts });
  }
  return letteringCache.get(type);
}

/** The families whose controls have lettering. */
export function letteringFamilies(set) {
  return Object.keys(set?.families ?? {}).filter((type) => {
    const where = letteringOf(type);
    return where.section || where.parts.length > 0;
  });
}

const mostCommon = (values) => {
  const counts = new Map();
  for (const value of values) if (value !== undefined && value !== null && value !== '') counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// Every place a family writes its lettering: its component, and its text parts.
function letteringPatches(set) {
  const out = [];
  for (const type of letteringFamilies(set)) {
    const where = letteringOf(type);
    const family = set.families[type] ?? {};
    if (where.section) out.push(family.component ?? {});
    for (const part of where.parts) out.push(family.parts?.[part] ?? {});
  }
  return out;
}

/** The set's lettering as most of its families have it: `{ family, weightValue, letterSpacing }`. */
export function setLettering(set) {
  const patches = letteringPatches(set);
  return {
    family: mostCommon(patches.map((c) => c['Text.Font.family'])) ?? '',
    weightValue: Number(mostCommon(patches.map((c) => c['Text.Font.weightValue'])) ?? 400),
    letterSpacing: Number(mostCommon(patches.map((c) => c['Text.Font.letterSpacing'])) ?? 0),
  };
}

/**
 * The set with every family's lettering set in `patch` ({ family, weightValue, letterSpacing }): its
 * own text, and its text parts.
 */
export function withLettering(set, patch) {
  const next = deepClone(set);
  const paths = {};
  if (patch.family !== undefined) paths['Text.Font.family'] = patch.family;
  if (patch.weightValue !== undefined) {
    paths['Text.Font.weightValue'] = Number(patch.weightValue);
    paths['Text.Font.weight'] = Number(patch.weightValue) >= 600 ? 'Bold' : 'Regular';
  }
  if (patch.letterSpacing !== undefined) paths['Text.Font.letterSpacing'] = Number(patch.letterSpacing);
  for (const type of letteringFamilies(next)) {
    const where = letteringOf(type);
    const family = { ...next.families[type] };
    if (where.section) family.component = { ...(family.component ?? {}), ...paths };
    if (where.parts.length) {
      const parts = { ...(family.parts ?? {}) };
      for (const part of where.parts) parts[part] = { ...(parts[part] ?? {}), ...paths };
      family.parts = parts;
    }
    next.families[type] = family;
  }
  return next;
}

/** The set with its lamp moved: `azimuth` (where the light comes from, degrees) and `elevation`. */
export function withLamp(set, patch) {
  const next = deepClone(set);
  const clampNum = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const lamp = { azimuth: 225, elevation: 48, ...(next.lamp ?? {}) };
  if (patch.azimuth !== undefined) lamp.azimuth = clampNum(patch.azimuth, 0, 360, lamp.azimuth);
  if (patch.elevation !== undefined) lamp.elevation = clampNum(patch.elevation, 0, 90, lamp.elevation);
  next.lamp = lamp;
  return next;
}

/** What a family shows as its design: the template it was taken from, the author's own, or ''. */
export function familySourceLabel(set, type, nameOf = (id) => id) {
  const chosen = set?.chosenFamilies?.[type];
  if (chosen === 'own') return `Own design · ${familySize(set.families?.[type])} properties`;
  return chosen ? nameOf(chosen) : '';
}

/**
 * The set with `type`'s family back as `source` (the built-in it descends from) has it, and no
 * longer marked as chosen or the author's own. Null when there is nowhere to go back to.
 */
export function withFamilyReset(set, type, source) {
  const family = source?.families?.[type];
  if (!family) return null;
  const next = deepClone(set);
  next.families = { ...(next.families ?? {}), [type]: deepClone(family) };
  if (next.chosenFamilies?.[type]) {
    const { [type]: _, ...chosen } = next.chosenFamilies;
    next.chosenFamilies = chosen;
  }
  return next;
}
