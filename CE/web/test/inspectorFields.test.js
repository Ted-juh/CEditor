// inspectorFields.test.js — ordinary inspector fields drawn from data.
//
// The Kinetic section was the first moved onto properties/FieldList.svelte. When it moved, the
// server-rendered editor was compared with the hand-written one for three states (defaults, set
// values, an emptied section) and was identical but for whitespace between grid cells, which a grid
// does not draw. These keep the pieces that comparison rested on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { fieldsOutsideVerbs, rangeView, rangeWrite, toggleOn } from '../src/CE_Application/utils/inspectorFields.js';
import { KINETIC_FIELDS } from '../src/CE_Application/models/inspectorFieldSets.js';
import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import KineticEditor from '../src/CE_Application/sections/KineticEditor.svelte';

test('a toggle reads a missing value by its convention', () => {
  const on = { defaultOn: true };
  const off = { defaultOn: false };
  assert.deepEqual([toggleOn(on, undefined), toggleOn(on, false), toggleOn(on, true)], [true, false, true]);
  assert.deepEqual([toggleOn(off, undefined), toggleOn(off, false), toggleOn(off, true)], [false, false, true]);
});

test('a percent slider shows 0..100 and stores 0..1; a plain one stores what it shows', () => {
  const bounce = { percent: true, default: 0.92 };
  assert.deepEqual(rangeView(bounce, undefined), { min: 0, max: 100, step: 1, value: 92, text: '92%' });
  assert.deepEqual(rangeView(bounce, 0.504), { min: 0, max: 100, step: 1, value: 50, text: '50%' });
  assert.equal(rangeWrite(bounce, '37'), 0.37);
  assert.equal(rangeWrite(bounce, 'x'), 0.92, 'nonsense falls back to the default');
  const gravity = { min: 0, max: 4, step: 0.05, default: 0, decimals: 2 };
  assert.deepEqual(rangeView(gravity, 1.5), { min: 0, max: 4, step: 0.05, value: 1.5, text: '1.50' });
  assert.equal(rangeWrite(gravity, '2.25'), 2.25);
});

test('every Kinetic field names a property the section really has', () => {
  const section = createControl('Kinetic')._children.Kinetic;
  const keys = KINETIC_FIELDS.filter((field) => field.key).map((field) => field.key);
  assert.deepEqual(keys.filter((key) => !(key in section)), []);
});

test('the inspector never writes a value a script would be refused', () => {
  const kinetic = COMPONENT_FAMILIES.find((family) => family.section === 'Kinetic');
  assert.deepEqual(fieldsOutsideVerbs(KINETIC_FIELDS, kinetic.verbs), []);
  // ...and the check does catch it when it happens.
  const tooFar = [{ key: 'friction', kind: 'range', min: 0, max: 2 }];
  assert.match(fieldsOutsideVerbs(tooFar, kinetic.verbs)[0], /friction: the inspector writes 0..2, a script accepts 0..1/);
});

test('the Kinetic editor draws every field, with the value the control holds', () => {
  const control = createControl('Kinetic', {
    Core: { id: 'k1' },
    Kinetic: { running: false, gravity: 1.37, restitution: 0.5, friction: 0.2, keepAlive: 0, showTrail: false },
  });
  const html = render(KineticEditor, { props: { control } }).body;
  for (const field of KINETIC_FIELDS.filter((f) => f.label)) {
    assert.match(html, new RegExp(`property-label[^>]*>${field.label}<`), field.label);
  }
  for (const text of ['1.37', '50%', '0.20', '0%']) assert.ok(html.includes(`>${text}<`), `slider text ${text}`);
  assert.match(html, /Sync to transport/, 'the editor\'s own snippet renders in its slot');
  assert.match(html, /Reset ball/);
  const switches = [...html.matchAll(/role="switch" aria-checked="(true|false)"/g)].map((m) => m[1]);
  assert.deepEqual(switches.slice(0, 1), ['false'], 'Run is off, as stored');
});
