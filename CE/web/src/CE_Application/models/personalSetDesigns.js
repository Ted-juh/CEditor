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
//   designed        What the label design wrote last time, so the next read can take it back out
//                   first. Without it, turning a set's metal finish off would leave the engraved
//                   shadow behind under the new silkscreen.
//
// The derived colour roles (the section surface, the instrument face and inks, the series) are not
// kept at all: they are recomputed from the set's colours on every read.
//
// A set with a built-in's id (a set file exported from one, or the export script itself) is left as
// it is: it already carries the program's designs, and the shipped files must not move.

import { withLabelDesign, labelFamily } from './labelDesigns.js';
import { withSectionDesign, withSectionSurface } from './sectionDesigns.js';
import { SERIES_ROLES, withInstrumentDesign, withInstrumentTokens } from './instrumentDesigns.js';
import { withDisplayDesign } from './displayDesigns.js';

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

function withoutKeys(component, keys) {
  if (!keys?.length) return component;
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(component ?? {}).filter(([key]) => !drop.has(key)));
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
  let next = { ...set, id: designId, tokens };

  const chosenLabel = typeof set.chosenFamilies?.Label === 'string';
  if (!chosenLabel) {
    const label = next.families?.Label;
    if (label) {
      next = { ...next, families: { ...next.families, Label: { ...label, component: withoutKeys(label.component, set.designed?.Label) } } };
    }
    next = withLabelDesign(next);
  }
  next = withSectionSurface(next, { fallback: '{surface}' });
  next = withSectionDesign(next);
  next = withInstrumentTokens(next);
  // Nobody authors an instrument family, so the design's keys are the design's, every read.
  next = withInstrumentDesign(next, { replace: true });
  next = withDisplayDesign(next, { replace: true });
  if (lineage === 'graphite' && typeof set.chosenFamilies?.Knob !== 'string') {
    const macro = next.families?.Macro;
    const { 'Macro.knobDesign': _, ...component } = macro?.component ?? {};
    if (macro) next = { ...next, families: { ...next.families, Macro: { ...macro, component } } };
  }

  const out = { ...next, id: set.id };
  if (lineage && !set.basedOn) out.basedOn = lineage;
  const wrote = chosenLabel ? null : Object.keys(labelFamily(next)?.component ?? {});
  const designed = { ...(set.designed ?? {}) };
  if (wrote?.length) designed.Label = wrote;
  else delete designed.Label;
  if (Object.keys(designed).length) out.designed = designed;
  else delete out.designed;
  return out;
}
