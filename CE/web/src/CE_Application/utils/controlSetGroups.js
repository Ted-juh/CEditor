// controlSetGroups.js — the Library of Settings › Control Sets, grouped and searchable.
//
// It was one horizontal strip of every set, 79 built-ins and your own, to scroll sideways through.
// Grouped now: the panel's set and your own first, then the built-ins by kind: the materials and
// moods (Graphite to Receiver), the mechanical ones (a ship's wheel, a kiln, a fan…), and the 36
// synthesizer templates, by era as their gallery titles them ("1970s / analogue").
//
// Across those groups, a style: what a set looks like, whichever group it is in. The Library's
// second row of buttons shows one style at a time (the owner: "family buttons for styles").

import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';

/** The built-ins that are mechanisms rather than finishes. Listed: nothing in a set says so. */
export const MECHANICAL_SET_IDS = ['atlas', 'kiln', 'arcade', 'spool', 'tessera', 'bellows', 'helix', 'iris', 'balance', 'satellite', 'fan', 'crown'];

/** The Library's styles, in the order of its buttons. */
export const SET_STYLES = [['modern', 'Modern'], ['metal', 'Metal'], ['vintage', 'Vintage'], ['glow', 'Glow'], ['mechanical', 'Mechanical']];

// Listed, as the mechanical ones are: nothing in a set says what it looks like. Every built-in is
// here; a set of your own takes the style of the set it was copied from.
const STYLE_IDS = {
  // Clean, flat, rubber and digital.
  modern: ['graphite', 'graphite-studio', 'ember', 'soft', 'pop', 'carbon', 'atelier', 'blueprint',
    'porcelain', 'stompbox', 'switchboard', 'cassette-deck', 'diesel', 'recessed', 'digital-grid', 'studio-white',
    'arc-line', 'carbon-pro', 'deep-flute', 'castellated'],
  // Aluminium, racks, consoles, machined and industrial.
  metal: ['machined', 'console', 'rackmount', 'anodised', 'eurorack', 'aerospace',
    'hi-fi', 'flightdeck', 'chronograph', 'dual-scale', 'broadcast', 'compact-rack', 'turret-stack', 'concave-studio',
    'hex-drive', 'coin-edge', 'gimbal-ring'],
  // Wood, leather, bakelite, valves, cream caps and hammertone.
  vintage: ['tolex', 'walnut', 'reel', 'valve', 'ladder', 'saddle', 'laboratory', 'field', 'receiver', 'ivory', 'ceramic',
    'brassworks', 'bakelite', 'heritage', 'pinstripe', 'valve-console', 'chicken-head', 'lever-dial'],
  // Light, glass and the future.
  glow: ['neon', 'phosphor', 'chrome', 'frost', 'backlit', 'obsidian',
    'gemstone', 'leatherbound', 'edge-light', 'touch-encoder', 'floating-halo', 'prism-cap'],
  mechanical: MECHANICAL_SET_IDS,
};
const STYLE_OF = new Map(Object.entries(STYLE_IDS).flatMap(([style, ids]) => ids.map((id) => [id, style])));

/** A set's style (SET_STYLES): its own, else the one of the set it was copied from; Modern otherwise. */
export function controlSetStyle(set) {
  return STYLE_OF.get(set?.id) ?? STYLE_OF.get(set?.basedOn) ?? 'modern';
}

const TEMPLATE_ERA = new Map(PHYSICAL_DIRECTIONS.map((entry) => [entry.id, String(entry.title ?? '').trim() || 'Other']));

function matches(set, query, style = '') {
  if (style && controlSetStyle(set) !== style) return false;
  const text = String(query ?? '').trim().toLowerCase();
  if (!text) return true;
  return `${set.name ?? ''} ${set.description ?? ''} ${TEMPLATE_ERA.get(set.id) ?? ''}`.toLowerCase().includes(text);
}

/**
 * The Library's groups: `[{ id, label, sets, eras? }]`, empty ones left out. `eras` sub-groups the
 * synthesizer templates: `[{ label, sets }]`. `style` (SET_STYLES) keeps that style only; the set
 * on the panel is shown whatever its style.
 */
export function groupControlSets({ librarySets = [], builtInSets = [], panelSetId = '', query = '', style = '' } = {}) {
  const all = [...librarySets, ...builtInSets];
  const onPanel = all.filter((set) => set.id === panelSetId && matches(set, query));
  const fits = (set) => matches(set, query, style);
  const mine = librarySets.filter(fits);
  const mechanical = builtInSets.filter((set) => MECHANICAL_SET_IDS.includes(set.id) && fits(set));
  const templates = builtInSets.filter((set) => TEMPLATE_ERA.has(set.id) && fits(set));
  const materials = builtInSets.filter((set) => !MECHANICAL_SET_IDS.includes(set.id) && !TEMPLATE_ERA.has(set.id) && fits(set));
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
