// documentUnknownKeys.test.js — the properties a control's document form names that its defaults lack.
//
// documentShape.unknownKeys is what the panel file view's spelling warning is built on. It decides
// nothing (the format keeps every key); it has to find a misspelling wherever one can be typed, say
// where as a person reads it, give a pattern that matches the same key in another control whatever
// its parts and entries are called, and not take for unknown what the format writes on purpose.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { shrinkControl, unknownKeys } from '../src/CE_Application/stores/documentShape.js';
import { shrinkEntries, ENTRY_BASELINES } from '../src/CE_Application/stores/documentEntries.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';

const form = (control) => shrinkEntries(shrinkControl(control));
const paths = (sparse) => unknownKeys(sparse).map((key) => key.path);

test('a fresh control of every kind names nothing unknown', () => {
  for (const type of ['Knob', 'Slider', 'Button', 'Label', 'Combobox', 'CustomComponent', 'Container']) {
    assert.deepEqual(paths(form(createControl(type))), [], type);
  }
});

test('a misspelling is found wherever it can be typed, said as a person reads it', () => {
  const button = form(createControl('Button', { Core: { id: 'b', name: 'b' } }));
  button._children.Transform = { ...button._children.Transform, widht: 4 };
  button._children.Transfrom = { x: 1 };
  button._children.Background = { _children: { Fill: { colur: 'FF000000' }, Fil: {} } };
  assert.deepEqual(paths(button).sort(), ['Background.Fil', 'Background.Fill.colur', 'Transform.widht', 'Transfrom'].sort());
  // A section the type does not have, unless written whole with its `_type`.
  const knob = form(createControl('Knob', { Core: { id: 'k', name: 'k' } }));
  knob._children.Background = { _children: { Fill: { colour: 'FF000000' } } };
  assert.deepEqual(paths(knob), ['Background']);
  knob._children.Background._type = 'Background';
  assert.deepEqual(paths(knob), []);

  const custom = createControl('CustomComponent', { Core: { id: 'c', name: 'c' } });
  custom._children.Parts._children.cap = createPartNode('cap');
  const sparse = form(custom);
  sparse._children.Parts._children.cap._children.Layout = { ...sparse._children.Parts._children.cap._children.Layout, wdith: 3 };
  sparse._children.HitZones = { _children: { grab: { _type: 'HitZone', name: 'grab', cursro: 'move' } } };
  sparse._children.Value = { _type: 'Value', rows: [{ id: 'a', displayTxt: 'A' }] };
  const found = unknownKeys(sparse);
  assert.deepEqual(found.map((key) => key.path).sort(), ['HitZones.grab.cursro', 'Parts.cap.Layout.wdith', 'Value.rows.0.displayTxt'].sort());
  assert.deepEqual(found.map((key) => key.pattern).sort(), ['HitZones.*.cursro', 'Parts.*.Layout.wdith', 'Value.rows.#.displayTxt'].sort(),
    'the pattern does not keep the names a person chose');
});

test('what the format writes on purpose, and lists of free names, are not unknown', () => {
  const custom = createControl('CustomComponent', { Core: { id: 'c', name: 'c' } });
  const part = createPartNode('cap');
  custom._children.Parts._children.cap = part;
  const sparse = form(custom);
  // The part diff always writes Corners.linked (ALWAYS_WRITTEN), so it is in every saved part.
  assert.ok(JSON.stringify(sparse).includes('"linked"') || !part._children.Background, 'the fixture part has corners');
  assert.deepEqual(paths(sparse), []);
  // A state of a name nobody else uses: any name is allowed there.
  sparse._children.States = { _children: { Glowing: { name: 'Glowing', whatever: 1 } } };
  assert.deepEqual(paths(sparse), []);
  // A binding written whole: held against its baseline.
  sparse._children.Bindings = { _children: { led: { ...ENTRY_BASELINES.Bindings, name: 'led' } } };
  assert.deepEqual(paths(sparse), []);
});
