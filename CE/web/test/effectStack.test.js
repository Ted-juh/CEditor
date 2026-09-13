// effectStack.test.js — the Effects tab's model.
//
// The claim the whole feature rests on is that the stack shown in the dock is the stack the canvas
// draws. That is not a claim about the UI, it is a claim about a sort, so it is tested here where
// it costs a fraction of a second. The other half is that a drag produces order numbers which,
// fed back through the same sort, give the order that was asked for — which is a round trip, and
// round trips are what tests are for.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEXT_EFFECTS,
  buildTextStack,
  reorderTextStack,
  findOrderTies,
  buildComponentRows,
  reorderComponentShadows,
  availableDomains,
  readSection,
  visibleFields,
  allEffectFieldLabels,
  withEffectsOff,
  withOnlyEffect,
  withSoloAndMute,
} from '../src/CE_Application/utils/effectStack.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('settings read sections and individual shadow entries, including zero values', () => {
  const item = { enabled: false, blur: 0, offsetX: -12, colour: '80123456' };
  const control = { _children: { Effects: { _children: { Shadows: { items: [item] } } } } };
  const row = buildComponentRows(control).rows[0];
  assert.equal(readSection(control, row.root), item);
  assert.equal(readSection(control, `${row.root}.blur`), 0);
  assert.equal(readSection(control, `${row.root}.enabled`), false);
  assert.equal(readSection(control, 'Effects.Shadows.items.1'), null);
});

/** A control carrying the real shipped Text section, so the defaults under test are the defaults
 *  users actually have. */
function textControl(overrides = {}) {
  const text = clone(SECTION_DEFAULTS.Text);
  Object.assign(text._children.Effects, overrides);
  return { _children: { Core: { id: 'c1', controlType: 'Label' }, Text: text } };
}

function enableAll(control) {
  const fx = control._children.Text._children.Effects;
  for (const descriptor of TEXT_EFFECTS) fx[descriptor.enabled] = true;
  return control;
}

// --- the stack matches the canvas -------------------------------------------------------------

test('the stack lists every ordered effect plus the fill', () => {
  const { rows } = buildTextStack(textControl());
  assert.equal(rows.length, TEXT_EFFECTS.length + 1);
  assert.ok(rows.some((row) => row.key === 'fill'), 'the fill is a row in the stack');
});

test('rows are front first, which is descending order', () => {
  const { rows } = buildTextStack(textControl());
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].order >= rows[i].order,
      `row ${i - 1} (${rows[i - 1].order}) should not sit behind row ${i} (${rows[i].order})`);
  }
});

test('the default stack is the documented one, and the fill sits between stroke2 and innerShadow', () => {
  const { rows } = buildTextStack(textControl());
  const keys = rows.map((row) => row.key);
  assert.deepEqual(keys, [
    'innerGlow',      // 80
    'bevel',          // 60, priority 100
    'innerShadow',    // 60, priority 90
    'fill',           // 50
    'stroke2',        // 45
    'outline',        // 40
    'motion',         // 30
    'glow',           // 20
    'shadow',         // 10
    'reflection',     // 5
  ]);
});

test('the shipped order-60 tie is reproduced, not silently fixed', () => {
  const ties = findOrderTies(buildTextStack(textControl()).rows);
  assert.equal(ties.length, 1);
  assert.deepEqual(ties[0].map((row) => row.key).sort(), ['bevel', 'innerShadow']);
});

test('enabled state is read from the control', () => {
  const { rows } = buildTextStack(textControl({ glowEnabled: true }));
  assert.equal(rows.find((row) => row.key === 'glow').enabled, true);
  assert.equal(rows.find((row) => row.key === 'shadow').enabled, false);
  assert.equal(rows.find((row) => row.key === 'fill').enabled, true, 'the fill is always on');
});

test('unordered effects are listed but not stackable', () => {
  const { unordered } = buildTextStack(textControl());
  assert.deepEqual(unordered.map((row) => row.key), ['blur', 'copy']);
  assert.ok(unordered.every((row) => row.stackable === false));
});

// --- reordering round-trips -------------------------------------------------------------------

/** Apply a patch of `path: value` onto a control, the way applyControlPatch would. */
function applyPatch(control, patch) {
  const next = clone(control);
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('.');
    let node = next;
    for (const part of parts.slice(0, -1)) {
      node._children = node._children ?? {};
      node._children[part] = node._children[part] ?? {};
      node = node._children[part];
    }
    node[parts.at(-1)] = value;
  }
  return next;
}

test('moving a row to the front puts it at the front', () => {
  const control = enableAll(textControl());
  const before = buildTextStack(control).rows;
  const patch = reorderTextStack(before, 'shadow', 0);
  assert.ok(Object.keys(patch).length > 0, 'a real move produces a patch');
  const after = buildTextStack(applyPatch(control, patch)).rows;
  assert.equal(after[0].key, 'shadow');
});

test('moving a row to the back puts it at the back', () => {
  const control = enableAll(textControl());
  const before = buildTextStack(control).rows;
  const patch = reorderTextStack(before, 'innerGlow', before.length - 1);
  const after = buildTextStack(applyPatch(control, patch)).rows;
  assert.equal(after.at(-1).key, 'innerGlow');
});

test('every single-step move lands where it was asked to', () => {
  const control = enableAll(textControl());
  const rows = buildTextStack(control).rows;
  for (let target = 0; target < rows.length; target += 1) {
    for (const row of rows) {
      const patch = reorderTextStack(rows, row.key, target);
      const after = buildTextStack(applyPatch(control, patch)).rows;
      assert.equal(after[target].key, row.key,
        `moving ${row.key} to index ${target} should land it there`);
    }
  }
});

test('a move that changes nothing writes nothing', () => {
  const rows = buildTextStack(textControl()).rows;
  const index = rows.findIndex((row) => row.key === 'outline');
  assert.deepEqual(reorderTextStack(rows, 'outline', index), {});
  assert.deepEqual(reorderTextStack(rows, 'nonexistent', 0), {});
});

test('the usual move touches one property and leaves the rest of the document alone', () => {
  const control = enableAll(textControl());
  const rows = buildTextStack(control).rows;
  // reflection (5) up one slot, between shadow (10) and glow (20) — room to land.
  const patch = reorderTextStack(rows, 'reflection', rows.length - 2);
  assert.equal(Object.keys(patch).length, 1, 'only the moved row is rewritten');
  assert.ok('Text.Effects.reflectionOrder' in patch);
});

test('separating the order-60 tie renumbers the stack rather than failing', () => {
  const control = enableAll(textControl());
  const rows = buildTextStack(control).rows;
  const bevel = rows.findIndex((row) => row.key === 'bevel');
  const innerShadow = rows.findIndex((row) => row.key === 'innerShadow');
  assert.equal(Math.abs(bevel - innerShadow), 1, 'they are adjacent to begin with');

  // Drop bevel behind innerShadow: no number exists between two 60s, so the stack renumbers.
  const patch = reorderTextStack(rows, 'bevel', innerShadow);
  const after = buildTextStack(applyPatch(control, patch));
  assert.equal(after.rows[innerShadow].key, 'bevel');
  assert.equal(findOrderTies(after.rows).length, 0, 'renumbering leaves no ties behind');
});

test('a renumbered stack keeps its visual order', () => {
  const control = enableAll(textControl());
  const rows = buildTextStack(control).rows;
  const patch = reorderTextStack(rows, 'bevel', rows.findIndex((row) => row.key === 'innerShadow'));
  const after = buildTextStack(applyPatch(control, patch)).rows;
  const expected = rows.map((row) => row.key).filter((key) => key !== 'bevel');
  const actual = after.map((row) => row.key).filter((key) => key !== 'bevel');
  assert.deepEqual(actual, expected, 'nothing but the dragged row changes position');
});

// --- component effects ------------------------------------------------------------------------

function componentControl() {
  return {
    _children: {
      Core: { id: 'c2', controlType: 'Button' },
      Effects: clone(SECTION_DEFAULTS.Effects),
    },
  };
}

test('component shadows become rows, groups do not stack', () => {
  const { rows, unordered } = buildComponentRows(componentControl());
  assert.equal(rows.length, 1, 'the shipped default has one shadow');
  assert.ok(rows.every((row) => row.stackable));
  assert.deepEqual(unordered.map((row) => row.key), ['bevel', 'filters', 'blend']);
  assert.ok(unordered.every((row) => row.stackable === false));
});

test('reordering shadows rewrites the array', () => {
  const control = componentControl();
  control._children.Effects._children.Shadows.items = [
    { enabled: true, colour: 'AA000000' },
    { enabled: true, colour: 'BB000000' },
    { enabled: true, colour: 'CC000000' },
  ];
  const patch = reorderComponentShadows(control, 2, 0);
  const items = patch['Effects.Shadows.items'];
  assert.deepEqual(items.map((item) => item.colour), ['CC000000', 'AA000000', 'BB000000']);
  assert.deepEqual(reorderComponentShadows(control, 1, 1), {}, 'a no-op writes nothing');
});

// --- domains and fields -----------------------------------------------------------------------

test('a control only offers the domains it has', () => {
  assert.deepEqual(availableDomains(textControl()), ['text']);
  assert.deepEqual(availableDomains(componentControl()), ['component']);
  assert.deepEqual(availableDomains(null), []);
});

test('fields gated on another field disappear when it is off', () => {
  const outline = TEXT_EFFECTS.find((entry) => entry.key === 'outline');
  const row = { fields: outline.fields };
  const off = visibleFields(row, { outlineDashEnabled: false }).map((field) => field.key);
  const on = visibleFields(row, { outlineDashEnabled: true }).map((field) => field.key);
  assert.ok(!off.includes('outlineDashLength'));
  assert.ok(on.includes('outlineDashLength'));
  assert.ok(on.includes('outlineDashGap'));
});

test('every field label is available for the panel search index', () => {
  const labels = allEffectFieldLabels();
  for (const needle of ['Outline', 'Glow', 'Blur', 'Bevel', 'Filters', 'Backlight', 'Dot pitch']) {
    assert.ok(labels.includes(needle), `${needle} should be searchable`);
  }
});

test('no two effects in a domain share a key', () => {
  const { rows, unordered } = buildTextStack(textControl());
  const keys = [...rows, ...unordered].map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length);
});

// --- preview clones ---------------------------------------------------------------------------

test('withEffectsOff switches every text effect off without touching the original', () => {
  const control = enableAll(textControl());
  const off = withEffectsOff(control, 'text');
  const offRows = buildTextStack(off).rows;
  assert.ok(offRows.every((row) => row.key === 'fill' || row.enabled === false));
  assert.ok(buildTextStack(control).rows.some((row) => row.enabled && row.key !== 'fill'),
    'the source control is untouched');
});

test('withOnlyEffect leaves exactly one effect on', () => {
  const control = enableAll(textControl());
  const solo = withOnlyEffect(control, 'text', 'glow');
  const on = buildTextStack(solo).rows.filter((row) => row.enabled && row.key !== 'fill');
  assert.deepEqual(on.map((row) => row.key), ['glow']);
});

test('the fill thumbnail is the letterform with nothing else on', () => {
  const control = enableAll(textControl());
  const fill = withOnlyEffect(control, 'text', 'fill');
  const on = buildTextStack(fill).rows.filter((row) => row.enabled && row.key !== 'fill');
  assert.equal(on.length, 0, 'no effect is switched on for the fill row');
});

test('solo beats mute, and neither is destructive', () => {
  const control = enableAll(textControl());
  const soloed = withSoloAndMute(control, 'text', { soloed: ['outline'], muted: ['outline'] });
  const on = buildTextStack(soloed).rows.filter((row) => row.enabled && row.key !== 'fill');
  assert.deepEqual(on.map((row) => row.key), ['outline']);

  const muted = withSoloAndMute(control, 'text', { muted: ['glow'] });
  const keys = buildTextStack(muted).rows.filter((row) => row.enabled).map((row) => row.key);
  assert.ok(!keys.includes('glow'));
  assert.ok(keys.includes('outline'), 'unmuted effects stay on');

  assert.equal(withSoloAndMute(control, 'text', {}), control, 'no solo or mute is a pass-through');
});

test('component filters reset to neutral when switched off', () => {
  const control = componentControl();
  Object.assign(control._children.Effects._children.Filters, { brightness: 40, invert: 90 });
  const off = withEffectsOff(control, 'component');
  const filters = off._children.Effects._children.Filters;
  assert.equal(filters.brightness, 100);
  assert.equal(filters.invert, 0);
  assert.equal(control._children.Effects._children.Filters.brightness, 40, 'source untouched');
});

test('withOnlyEffect keeps the filter values it is previewing', () => {
  const control = componentControl();
  Object.assign(control._children.Effects._children.Filters, { brightness: 40, invert: 90 });
  const only = withOnlyEffect(control, 'component', 'filters');
  assert.equal(only._children.Effects._children.Filters.brightness, 40);
});
