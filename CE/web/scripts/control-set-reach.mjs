// How far each control set reaches into each control: what it changes, and whether it changes the
// control's form or only its colours.
//
// A set used to leave half the Insert menu alone, and nothing said so: a control a set does not touch
// has no symptom. And a control a set only recolours looks, in every set, like the same part in a
// different paint, which is what "these sets look generic" meant. So this measures both, for every
// control a person can insert and every built-in set but Graphite (which is frozen, so that a panel
// that never chose a set keeps its look):
//
//   changed     properties that differ from the factory control once the set is applied
//               (its family patch, its tokens and its voices: models/controlSetFamilies.js)
//   colour-only a set whose changes are all colours: every value that differs is a colour, a colour
//               token, or sits under a property named for a colour. Everything else is form: a
//               shape, a radius, a finish, a font, a part shown or hidden.
//   forms       how many different forms the sets give the control. One means every set draws the
//               same thing in its own paint.
//
// test/controlSetReach.test.js holds these to a stated rule. Run this to read the table:
//
//   node scripts/control-set-reach.mjs

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { BUILT_IN_CONTROL_SETS } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';

/** Every control the Insert menu offers, once each, in menu order. */
export const INSERTABLE_TYPES = [...new Set(INSERT_CATEGORIES.flatMap((category) => category.items.map((item) => item.type)))]
  .filter((type) => COMPONENT_TYPES[type]);

export const MEASURED_SETS = BUILT_IN_CONTROL_SETS.filter((set) => set.id !== 'graphite');

const COLOURISH = /^(#?([0-9A-F]{6}|[0-9A-F]{8})|\{[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*\}|rgba?\(.*\)|transparent)$/i;

/** A value with every colour in it masked: what is left is its form. */
function colourBlind(value, key = '') {
  if (/colou?r$/i.test(key)) return '•';
  if (typeof value === 'string') return COLOURISH.test(value.trim()) ? '•' : value;
  if (Array.isArray(value)) return value.map((item) => colourBlind(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, colourBlind(v, k)]));
  return value;
}

function flatten(node, prefix = '', out = {}) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out[prefix] = node;
  }
  return out;
}

const IDENTITY = /(^|\.)Core\.(id|name)$/;

/** What one set does to one control: its colour changes and its form changes, by property path. */
export function setChanges(type, set) {
  const factory = flatten(createControl(type));
  const drawn = flatten(resolveControlForSet(createControl(type), set));
  const colour = [];
  const form = {};
  for (const path of new Set([...Object.keys(factory), ...Object.keys(drawn)])) {
    if (IDENTITY.test(path)) continue;
    const before = factory[path];
    const after = drawn[path];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const key = path.split('.').pop();
    if (before !== undefined && JSON.stringify(colourBlind(before, key)) === JSON.stringify(colourBlind(after, key))) colour.push(path);
    else form[path] = after;
  }
  return { colour, form };
}

/** The table: one row per insertable control. */
export function measureControlSetReach({ types = INSERTABLE_TYPES, sets = MEASURED_SETS } = {}) {
  return types.map((type) => {
    const untouched = [];
    const colourOnly = [];
    const forms = new Set();
    const counts = [];
    for (const set of sets) {
      const { colour, form } = setChanges(type, set);
      const formPaths = Object.keys(form);
      counts.push(colour.length + formPaths.length);
      if (!colour.length && !formPaths.length) untouched.push(set.id);
      else if (!formPaths.length) colourOnly.push(set.id);
      forms.add(JSON.stringify(form));
    }
    counts.sort((a, b) => a - b);
    return { type, median: counts[counts.length >> 1], untouched, colourOnly, forms: forms.size };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rows = measureControlSetReach();
  console.log(`| Control | Median changed | Untouched | Colour only | Forms |`);
  console.log(`| --- | ---: | ---: | ---: | ---: |`);
  for (const row of [...rows].sort((a, b) => a.forms - b.forms || a.colourOnly.length - b.colourOnly.length)) {
    console.log(`| ${row.type} | ${row.median} | ${row.untouched.length} | ${row.colourOnly.length} | ${row.forms} |`);
  }
  const bySet = new Map();
  for (const row of rows) for (const id of row.colourOnly) bySet.set(id, [...(bySet.get(id) ?? []), row.type]);
  console.log(`\nSets that only recolour a control, most first (of ${MEASURED_SETS.length}):`);
  for (const [id, types] of [...bySet].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${id}: ${types.length} — ${types.join(', ')}`);
}
