// controlSetGroups.js — the Library of Settings › Control Sets, grouped and searchable.
//
// It was one horizontal strip of every set, 79 built-ins and your own, to scroll sideways through.
// Grouped now: the panel's set and your own first, then the built-ins by kind: the materials and
// moods (Graphite to Receiver), the mechanical ones (a ship's wheel, a kiln, a fan…), and the 36
// synthesizer templates, by era as their gallery titles them ("1970s / analogue").

import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';

/** The built-ins that are mechanisms rather than finishes. Listed: nothing in a set says so. */
export const MECHANICAL_SET_IDS = ['atlas', 'kiln', 'arcade', 'spool', 'tessera', 'bellows', 'helix', 'iris', 'balance', 'satellite', 'fan', 'crown'];

const TEMPLATE_ERA = new Map(PHYSICAL_DIRECTIONS.map((entry) => [entry.id, String(entry.title ?? '').trim() || 'Other']));

function matches(set, query) {
  const text = String(query ?? '').trim().toLowerCase();
  if (!text) return true;
  return `${set.name ?? ''} ${set.description ?? ''} ${TEMPLATE_ERA.get(set.id) ?? ''}`.toLowerCase().includes(text);
}

/**
 * The Library's groups: `[{ id, label, sets, eras? }]`, empty ones left out. `eras` sub-groups the
 * synthesizer templates: `[{ label, sets }]`.
 */
export function groupControlSets({ librarySets = [], builtInSets = [], panelSetId = '', query = '' } = {}) {
  const all = [...librarySets, ...builtInSets];
  const onPanel = all.filter((set) => set.id === panelSetId && matches(set, query));
  const mine = librarySets.filter((set) => matches(set, query));
  const mechanical = builtInSets.filter((set) => MECHANICAL_SET_IDS.includes(set.id) && matches(set, query));
  const templates = builtInSets.filter((set) => TEMPLATE_ERA.has(set.id) && matches(set, query));
  const materials = builtInSets.filter((set) => !MECHANICAL_SET_IDS.includes(set.id) && !TEMPLATE_ERA.has(set.id) && matches(set, query));
  const eras = [];
  for (const set of templates) {
    const label = TEMPLATE_ERA.get(set.id);
    let era = eras.find((entry) => entry.label === label);
    if (!era) { era = { label, sets: [] }; eras.push(era); }
    era.sets.push(set);
  }
  return [
    { id: 'panel', label: 'On this panel', sets: onPanel },
    { id: 'mine', label: 'My sets', sets: mine },
    { id: 'materials', label: 'Materials & moods', sets: materials },
    { id: 'mechanical', label: 'Mechanical', sets: mechanical },
    { id: 'templates', label: 'Synthesizer templates', sets: templates, eras },
  ].filter((group) => group.sets.length);
}
