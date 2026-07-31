// componentElements.js — how a component's list grows by one, in the one place both callers use.
//
// Seven components carry a list of objects the canvas can add to: the Macro's assignments, the
// Orbit's nodes, the Router's destinations, a Constraint's members, the Timbre pad's anchors, the
// Envelope's breakpoints and the Looper's lanes. Every one of those "Add" buttons built its element
// inline in its own .svelte editor, so a script had no way to reach any of them — ce.components
// could edit element N and could not create one, and ce.panel's collection verbs cover the editor's
// own sections (States, Bindings, Animations…), not these.
//
// Same shape as stores/alignment.js after §42: the maths comes out of the button into a pure
// function, the button calls it, and the script verb calls the same one. A template that only the
// canvas knows is a template the export cannot reproduce.
//
// One deliberate change on the way out: element ids were `${prefix}${Date.now()}`, which collides
// when two are added inside a millisecond — reachable from a script in a way it never was from a
// mouse — and makes a document that cannot be diffed against itself. They are now the lowest
// unused number for the prefix, which is stable, unique, and reads the way the labels already do.

import { envelopePointAdded, envelopePointRemoved } from './envelopeLayout.js';

/**
 * The two breakpoint lists, which are one idea.
 *
 * A Router's transfer curve is sampled by the envelope's own `envValueAt`, so its points ARE
 * envelope points — a breakpoint goes into the widest gap and takes its neighbour's curve, and the
 * endpoints are not removable. Giving the Router its own template would be a second, worse copy of
 * a rule that already exists.
 */
const isCurve = (section, field) =>
  `${section}.${field}` === 'Envelope.points' || `${section}.${field}` === 'Router.curve';

/** The lowest `<prefix><n>` not already taken, so two adds in the same millisecond differ. */
export function uniqueElementId(prefix, list) {
  const taken = new Set((Array.isArray(list) ? list : []).map((x) => String(x?.id ?? '')));
  for (let n = 0; ; n += 1) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * One new element per (section, field). `cfg` is the whole section, for the two templates that
 * need something outside their own list — a Timbre anchor carries a value per morph target.
 */
export const COMPONENT_ELEMENT_TEMPLATES = {
  'Macro.slots': (list) => ({
    id: uniqueElementId('m', list), label: `Dest ${list.length + 1}`,
    depth: 1, curve: 'linear', min: 0, max: 1, enabled: true,
  }),
  'Orbit.nodes': (list) => ({
    id: uniqueElementId('n', list), label: `Node ${list.length + 1}`,
    radius: 0.6, angle: (list.length * 60) % 360, ratio: 1,
    output: 'y', depth: 1, invert: false, enabled: true,
  }),
  'Router.destinations': (list) => ({
    id: uniqueElementId('r', list), label: `Dest ${list.length + 1}`,
    depth: 1, min: 0, max: 1, enabled: true,
  }),
  'Constraint.members': (list) => ({
    id: uniqueElementId('c', list), label: `Member ${list.length + 1}`, value: 0.5,
  }),
  'Timbre.anchors': (list, cfg) => {
    const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
    const values = {};
    for (const t of targets) values[String(t?.id ?? '')] = 0.5;
    return {
      id: uniqueElementId('a', list), label: `Anchor ${list.length + 1}`,
      x: 0.5, y: 0.5, values,
    };
  },
  // The Meter's colour zones. No id — a zone is identified by where it starts. The new one lands
  // just above the last, which is what MeterEditor's own Add button did inline before this existed.
  'Meter.zones': (list) => ({
    from: Math.min(0.95, (list.at(-1)?.from ?? 0) + 0.1), colour: 'FFEB5757',
  }),
  'Looper.lanes': (list) => ({
    id: uniqueElementId('g', list), label: `Lane ${list.length + 1}`,
    points: [], rest: 0, enabled: true,
  }),
};

/** Whether this list can be grown from here at all. */
export function canGrowComponentList(section, field) {
  return `${section}.${field}` in COMPONENT_ELEMENT_TEMPLATES || isCurve(section, field);
}

/**
 * The list with one element added — appended, or inserted BEFORE a 0-based index.
 *
 * Nothing back when this list has no template, so a caller can tell "grown" from "not a list this
 * component grows". The Envelope is its own case and stays in envelopeLayout.js: a breakpoint goes
 * into the widest gap and takes its neighbour's curve, which is a shape decision rather than a
 * template.
 */
export function componentListWithElement(section, field, list, cfg, at = null) {
  const current = Array.isArray(list) ? list : [];
  if (isCurve(section, field)) return envelopePointAdded(current, at);
  const make = COMPONENT_ELEMENT_TEMPLATES[`${section}.${field}`];
  if (!make) return null;
  const element = make(current, cfg);
  if (at == null || at < 0 || at > current.length) return [...current, element];
  const next = [...current];
  next.splice(at, 0, element);
  return next;
}

/**
 * The list with one 0-based element removed, or nothing when it must not be.
 *
 * The Envelope refuses its endpoints and refuses to go below two points — an envelope with one
 * breakpoint is not an envelope — and that rule lives with the envelope rather than here.
 */
export function componentListWithoutElement(section, field, list, at) {
  const current = Array.isArray(list) ? list : [];
  if (isCurve(section, field)) return envelopePointRemoved(current, at);
  if (!(`${section}.${field}` in COMPONENT_ELEMENT_TEMPLATES) && !isCurve(section, field)) return null;
  if (!Number.isInteger(at) || at < 0 || at >= current.length) return null;
  return current.filter((_, i) => i !== at);
}
