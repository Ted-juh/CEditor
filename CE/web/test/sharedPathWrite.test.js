// sharedPathWrite.test.js — a path write that copies only what it passes through.
//
// Measured 2026-09-29 (docs/design/undo-history-measurement-2026-09-29.md): every property write
// deepCloned the whole control first, ~15-35 KB expanded, so a select-all nudge on the AN1x panel
// copied the entire panel and undo history kept the copy — 1.3 GB after fifty. Drag, group resize,
// nudge and align now write through setNestedValueShared, which copies the path's spine and shares
// the rest.
//
// That is only safe if it writes EXACTLY what setNestedValue wrote, so the first test is a parity
// sweep over every leaf of every component type, plus the awkward paths: sections materialised
// from a template, array indices, root keys, and writes that do not land.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue, setNestedValueShared } from '../src/CE_Application/stores/controlTreeUtils.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { applyControlPatchesById, updateSelectedProperty } from '../src/CE_Application/stores/controls.js';

/** Every dotted path to a leaf, walking `_children` the way paths name it. */
function leafPaths(node, prefix = '', out = [], depth = 0) {
  if (depth > 8 || node === null || typeof node !== 'object') return out;
  const entries = Array.isArray(node)
    ? node.map((value, index) => [String(index), value])
    : [...Object.entries(node).filter(([key]) => key !== '_children'), ...Object.entries(node._children ?? {})];
  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') leafPaths(value, path, out, depth + 1);
    else out.push(path);
  }
  return out;
}

function checkParity(control, path, value) {
  const before = JSON.stringify(control);
  const expected = deepClone(control);
  let expectedLanded;
  try {
    expectedLanded = setNestedValue(expected, path, value);
  } catch (error) {
    // Writing through a primitive throws in setNestedValue; the shared write must throw the same
    // way, and still leave the original alone.
    assert.throws(() => setNestedValueShared(control, path, value), error.constructor, `${path}: should throw too`);
    assert.equal(JSON.stringify(control), before, `${path}: the original was changed by a failed write`);
    return null;
  }
  const { control: actual, landed } = setNestedValueShared(control, path, value);
  assert.equal(JSON.stringify(control), before, `${path}: the original was changed`);
  assert.equal(landed, expectedLanded, `${path}: landed`);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${path}: wrote something different`);
  return actual;
}

test('writes exactly what setNestedValue writes, on every leaf of every component type', () => {
  let checked = 0;
  for (const type of Object.keys(COMPONENT_TYPES)) {
    const control = createControl(type, { Core: { id: `p_${type}` } });
    const paths = leafPaths(control._children).filter((path) => !path.startsWith('Core.'));
    for (const path of paths) {
      checkParity(control, path, 12345);
      checked += 1;
    }
  }
  assert.ok(checked > 5000, `swept ${checked} paths`);
});

test('and on the awkward paths', () => {
  const knob = createControl('Knob', { Core: { id: 'awk' } });
  const paths = [
    'Transform.x',                                   // the nudge
    'Transform',                                     // a root key: replaces a whole section
    'Background.Effects.enabled',                    // materialised from a template on the way
    'Background.Fill.SolidEffects.enabled',
    'Nope.x',                                        // no such section: does not land
    'Transform.nope.deeper',                         // walks off the end
    'Behavior.valueRange.min',
    'Transform.x.y',                                 // through a primitive
  ];
  for (const path of paths) checkParity(knob, path, 7);
  checkParity(knob, 'Background', { _type: 'Background', _children: {} });   // a tree value
  const withArray = { _children: { S: { _type: 'S', list: [{ a: 1 }, { a: 2 }] } } };
  checkParity(withArray, 'S.list.1.a', 9);
  checkParity(withArray, 'S.list.1', { a: 3 });
  checkParity(withArray, 'S.list.5.a', 9);                                   // past the end
});

test('what the write did not pass through is shared, not copied', () => {
  const knob = createControl('Knob', { Core: { id: 'share' } });
  const { control } = setNestedValueShared(knob, 'Transform.x', 99);
  assert.notEqual(control, knob);
  assert.notEqual(control._children.Transform, knob._children.Transform, 'the spine is new');
  for (const section of Object.keys(knob._children)) {
    if (section === 'Transform') continue;
    assert.equal(control._children[section], knob._children[section], `${section} is shared`);
  }
});

test('a patch to a container shares its children; a patch to a child leaves its siblings alone', () => {
  const kids = Array.from({ length: 3 }, (unused, i) => createControl('Knob', { Core: { id: `sp_k${i}` } }));
  const box = createControl('Container', { Core: { id: 'sp_box' } });
  box._children.Children = { _type: 'Children', layout: 'none', gap: 0, padding: 0, clip: false,
    _children: Object.fromEntries(kids.map((kid) => [kid._children.Core.id, kid])) };
  const panel = createPanel('shared-write');
  panel.controls = [box, createControl('Label', { Core: { id: 'sp_other' } })];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === 'shared-write');
  setActivePanel(live.id);
  const before = get(panels).find((p) => p.id === live.id).controls;

  applyControlPatchesById(new Map([['sp_box', { 'Transform.x': 50 }]]));
  let after = get(panels).find((p) => p.id === live.id).controls;
  assert.equal(after[0]._children.Transform.x, 50);
  assert.equal(after[0]._children.Children, before[0]._children.Children, 'moving a container copies none of its children');
  assert.equal(after[1], before[1], 'an untouched control is the same object');

  applyControlPatchesById(new Map([['sp_k1', { 'Transform.y': 7 }]]));
  const moved = get(panels).find((p) => p.id === live.id).controls;
  const map = moved[0]._children.Children._children;
  assert.equal(map.sp_k1._children.Transform.y, 7, 'a nested control is patched');
  assert.equal(map.sp_k0, after[0]._children.Children._children.sp_k0, 'its siblings are the same objects');
  assert.equal(before[0]._children.Children._children.sp_k1._children.Transform.y, kids[1]._children.Transform.y,
    'and the state before it was not touched');

  selectedComponentIds.set(new Set(['sp_k0', 'sp_other']));
  updateSelectedProperty('Transform.width', 77);
  after = get(panels).find((p) => p.id === live.id).controls;
  assert.equal(after[0]._children.Children._children.sp_k0._children.Transform.width, 77);
  assert.equal(after[1]._children.Transform.width, 77);
  assert.equal(after[1]._children.Background, before[1]._children.Background, 'a multi-edit shares what it did not write');
});
