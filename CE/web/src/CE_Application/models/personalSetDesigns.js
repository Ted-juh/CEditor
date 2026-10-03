// A personal set's designs, derived again from its own colours every time it is read.
//
// The built-ins get their label, section and instrument designs once, when the program starts
// (models/controlSets.js). A personal set is a copy of one, and a copy took those designs as they
// stood the day it was made. A set duplicated before the designs existed has none. One duplicated
// after kept the original's display face and voices as fixed colours, so recolouring it left its
// instruments in the original's colours. And "New Control Set" copied Graphite, which has no designs
// at all, so a set made that way never got any. (It copies the designed Graphite now.)
//
// So a personal set keeps what its author chose, and the rest is derived on every read, from its
// colours and its lineage:
//
//   basedOn         The built-in it was duplicated from. Its treatments are that built-in's: Tolex's
//                   piping, Walnut's brass plates, Neon's glow. A set based on Graphite takes the
//                   general ones, since Graphite has none only so that existing documents keep their
//                   look, and a personal set is not an existing document. Its Macro keeps the
//                   Macro's own knob, as Graphite's does: Graphite's knob, drawn that small, is a
//                   dot. A set saved before `basedOn` existed is matched by its id, which
//                   duplication made from the original's name ('tolex-copy',
//                   'vintage-mono-copy-2'), or which Settings gave a fresh copy of Graphite
//                   ('new-control-set').
//   chosenFamilies  The families its author picked in Settings, kept exactly as picked. Labels are
//                   the one that overlaps a design: a chosen Label family is not redesigned.
//   designed        What the designs wrote last time, per family, key by key with its value, so the
//                   next read can take back exactly that and leave the rest. A key still holding the
//                   value the design wrote is the design's, and is derived again from the set's
//                   colours now: without that, turning a set's metal finish off would leave the
//                   engraved shadow behind under the new silkscreen, and recolouring it would leave
//                   its instruments in the old colours. A key holding anything else is its author's
//                   and wins over the design: a set file that says what its sections, instruments or
//                   displays are keeps it, read after read.
//
// A set read before `designed` covered a family has no record of it. A copy of a built-in carries
// that built-in's designs as they stood, and they are taken back (the section frame among them: on
// every copy made before sections had a design, that is the button's frame, copied). A set with no
// lineage carries only what its author wrote, less the button frame and the plain field fill that
// every section was given before then, which it carries as if they were its own.
//
// The derived colour roles (the section surface, the instrument face and inks, the series) are not
// kept at all: they are recomputed from the set's colours on every read.
//
// A set with a built-in's id (a set file exported from one, or the export script itself) is left as
// it is: it already carries the program's designs, and the shipped files must not move.

import { labelFamily } from './labelDesigns.js';
import { SECTION_TYPES, isFrameKey, sectionFamilies, withSectionDesign, withSectionSurface } from './sectionDesigns.js';
import { SERIES_ROLES, instrumentFamilies, withInstrumentTokens } from './instrumentDesigns.js';
import { displayFamilies } from './displayDesigns.js';

export const DERIVED_ROLES = ['section.surface', 'instrument.face', 'instrument.ink', 'instrument.text', ...SERIES_ROLES];

const COPY_SUFFIX = /-copy(-\d+)?$/;
// What Settings names a new set, which is a copy of Graphite (ControlSetsSettings createSet).
const NEW_SET = /^new-control-set(-\d+)?$/;

/**
 * The built-in a personal set descends from, or null. `builtInId(text)` answers with the built-in
 * id a text names (an id, or a name as duplication slugs it), or null.
 */
export function lineageOf(set, builtInId) {
  const named = typeof set?.basedOn === 'string' ? builtInId(set.basedOn) : null;
  if (named) return named;
  let id = String(set?.id ?? '');
  if (NEW_SET.test(id)) return builtInId('graphite');
  while (COPY_SUFFIX.test(id)) {
    id = id.replace(COPY_SUFFIX, '');
    const found = builtInId(id);
    if (found) return found;
  }
  return null;
}

const SECTIONS = new Set(SECTION_TYPES);
// What every section was given before sections had a design (controlSetCoverage), besides the
// button's frame: a set file saved then carries these as though they were its own.
const OLD_SECTION = {
  'Background.Fill.colour': '{control.field}', 'Background.Fill.gradientEnabled': false, 'Text.Fill.colour': '{text.primary}',
  'TabContainer.stripColour': '{control.field}', 'TabContainer.tabColour': '{surface}',
  'TabContainer.labelColour': '{text.primary}', 'TabContainer.activeLabelColour': '{text.inverse}',
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The keys of a family the designs wrote, out of `own`: by the record of the last read when there is
 * one (a list of keys, as the label design kept it before values were recorded, or key and value),
 * otherwise as the header says.
 */
function derivedKeys(type, own, { record, design, button, copy }) {
  const keys = Object.keys(own);
  if (Array.isArray(record)) return keys.filter((key) => record.includes(key));
  if (record && typeof record === 'object') return keys.filter((key) => key in record && same(own[key], record[key]));
  const section = SECTIONS.has(type);
  if (copy) return keys.filter((key) => key in design || (section && isFrameKey(key)));
  return keys.filter((key) => (key in design && same(own[key], design[key]))
    || (section && isFrameKey(key) && button && key in button && same(own[key], button[key]))
    || (section && key in OLD_SECTION && same(own[key], OLD_SECTION[key])));
}

/**
 * The set with its derived designs made again. `builtInId` as for lineageOf; `isBuiltIn(id)` says
 * whether an id is a built-in's own.
 */
export function withPersonalDesigns(set, { builtInId = () => null, isBuiltIn = () => false } = {}) {
  if (!set?.tokens || isBuiltIn(set.id)) return set;
  const lineage = lineageOf(set, builtInId);
  // The id the treatments are read under: the set's lineage, or for a set with none or Graphite's,
  // its own id, which no treatment list names: the general designs.
  const designId = lineage && lineage !== 'graphite' ? lineage : set.id;
  const tokens = Object.fromEntries(Object.entries(set.tokens).filter(([name]) => !DERIVED_ROLES.includes(name)));
  const chosenLabel = typeof set.chosenFamilies?.Label === 'string';

  // What the designs write for this set, read in the order the built-ins take them
  // (models/controlSets.js): each reads the set as the one before left it.
  const designs = {};
  const take = (families) => { for (const [type, family] of Object.entries(families ?? {})) designs[type] = { ...family.component }; };
  let read = { ...set, id: designId, tokens };
  const label = chosenLabel ? null : labelFamily(read);
  if (label) designs.Label = { ...label.component };
  read = withSectionSurface(read, { fallback: '{surface}' });
  take(sectionFamilies(read));
  // The instruments' case and the displays' bezel are drawn in the sections' frame (designGrammar).
  read = withSectionDesign(read);
  read = withInstrumentTokens(read);
  take(instrumentFamilies(read));
  take(displayFamilies(read));
  // A set descended from Graphite keeps the Macro's own knob, as Graphite does, until a Knobs design
  // is picked: Graphite's knob, drawn that small, is a dot.
  const ownKnob = lineage === 'graphite' && typeof set.chosenFamilies?.Knob !== 'string';
  if (ownKnob && designs.Macro) delete designs.Macro['Macro.knobDesign'];

  // Each family is what its author wrote over what the design writes now.
  const families = { ...set.families };
  const designed = {};
  const button = set.families?.Button?.component;
  for (const type of new Set([...Object.keys(designs), ...Object.keys(set.designed ?? {})])) {
    // A Labels design picked in Settings is the author's, whole.
    if (type === 'Label' && chosenLabel) continue;
    const design = designs[type] ?? {};
    const own = set.families?.[type]?.component ?? {};
    const derived = new Set(derivedKeys(type, own, { record: set.designed?.[type], design, button, copy: Boolean(lineage) }));
    const authored = Object.fromEntries(Object.entries(own).filter(([key]) => !derived.has(key)));
    const component = { ...design, ...authored };
    if (ownKnob && type === 'Macro') delete component['Macro.knobDesign'];
    if (!set.families?.[type] && !Object.keys(component).length) continue;
    families[type] = { ...set.families?.[type], component };
    if (designs[type]) designed[type] = Object.fromEntries(Object.entries(design).filter(([key]) => !(key in authored)));
  }

  const out = { ...set, tokens: read.tokens, families };
  if (lineage && !set.basedOn) out.basedOn = lineage;
  if (Object.keys(designed).length) out.designed = designed;
  else delete out.designed;
  return out;
}
