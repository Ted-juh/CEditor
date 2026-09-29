// inspectorFields.test.js — ordinary inspector fields drawn from data.
//
// Kinetic was the first section moved onto properties/FieldList.svelte, and Crossfader (three of
// its four sections) the second, for the number and select kinds. Each time the server-rendered
// editor was compared with the hand-written one — Kinetic in three states, Crossfader in four,
// including both of its conditional layouts — and was identical but for whitespace between grid
// cells, which a grid does not draw. These keep the pieces that comparison rested on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import {
  fieldShown, numberValue, numberWrite, rangeView, rangeWrite, scriptRange, scriptRangesNarrowerThanInspector,
  selectOptions, selectsOffTable, toggleOn,
} from '../src/CE_Application/utils/inspectorFields.js';
import * as FIELD_SETS from '../src/CE_Application/models/inspectorFieldSets.js';
import CrossfaderEditor from '../src/CE_Application/sections/CrossfaderEditor.svelte';

const { KINETIC_FIELDS, CROSSFADER_FIELDS, CROSSFADER_HANDLE_FIELDS, CROSSFADER_RETURN_FIELDS, scriptRangeOf } = FIELD_SETS;
const CROSSFADER_ALL = [...CROSSFADER_HANDLE_FIELDS, ...CROSSFADER_FIELDS, ...CROSSFADER_RETURN_FIELDS];
/** Every field set, with the model section it edits. */
const SETS = [['Kinetic', KINETIC_FIELDS], ['Crossfader', CROSSFADER_ALL]];
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

test('a number field shows its default, and clamps only where it says', () => {
  const mix = { min: 0, max: 1, default: 0.5, clamp: true };
  assert.equal(numberValue(mix, undefined), 0.5);
  assert.equal(numberValue(mix, 0), 0, 'a stored 0 is not replaced by the default');
  assert.deepEqual([numberWrite(mix, 1.4), numberWrite(mix, -2), numberWrite(mix, 0.3)], [1, 0, 0.3]);
  assert.deepEqual([numberWrite({ min: 0, max: 5000, clamp: 'min' }, 9000), numberWrite({ min: 0, clamp: 'min' }, -5)], [9000, 0]);
  assert.equal(numberWrite({ min: 2, max: 20 }, 99), 99, 'unclamped writes as typed, as the editor always did');
});

test('select options, and fields that show only in some states', () => {
  assert.deepEqual(selectOptions({ options: ['a', ['b', 'Bee']] }), [['a', 'a'], ['b', 'Bee']]);
  const rest = CROSSFADER_RETURN_FIELDS.find((field) => field.key === 'returnValue');
  const time = CROSSFADER_RETURN_FIELDS.find((field) => field.key === 'returnTime');
  assert.deepEqual([fieldShown(rest, { returnMode: 'rest' }), fieldShown(rest, { returnMode: 'center' })], [true, false]);
  assert.deepEqual([fieldShown(time, {}), fieldShown(time, { returnMode: 'min' })], [false, true]);
});

test('every field names a property its section really has', () => {
  for (const [section, fields] of SETS) {
    const stored = createControl(section)._children[section];
    const keys = fields.filter((field) => field.key).map((field) => field.key);
    assert.deepEqual(keys.filter((key) => !(key in stored)), [], section);
  }
});

test('a select offers exactly the values its component reads, in whatever order it presents them', () => {
  for (const [section, fields] of SETS) assert.deepEqual(selectsOffTable(fields), [], section);
  assert.ok(CROSSFADER_ALL.filter((field) => field.table).length >= 4, 'Law, Orientation, On release and Curve are tied to tables');
  // ...and it catches both ways of being wrong.
  const wrong = [{ key: 'law', kind: 'select', table: ['linear', 'equalPower', 'sharp'], options: ['linear', 'equalPower', 'soft'] }];
  assert.deepEqual(selectsOffTable(wrong), ['law: not offered sharp; offered but not read soft']);
});

test('the scripting API reads its ranges from the field sets, so the two cannot drift', () => {
  // Every verb that writes a field held here carries exactly that field's script range. A literal
  // range put back into componentVerbs.js would have to match to pass — and then it is redundant.
  let linked = 0;
  for (const [section, fields] of SETS) {
    const family = COMPONENT_FAMILIES.find((entry) => entry.section === section);
    for (const field of fields) {
      const range = scriptRange(field);
      if (!range) continue;
      for (const verb of family.verbs.filter((entry) => entry.f === field.key && entry.k === 'num')) {
        assert.deepEqual({ min: verb.min, max: verb.max }, range, `${section}.${field.key} (${verb.v})`);
        linked += 1;
      }
    }
  }
  assert.equal(linked, 8, 'gravity, bounce, friction, keepAlive, mix, detent, returnValue, returnTime');
  assert.throws(() => scriptRangeOf('Kinetic', 'gravityy'), /no ranged field Kinetic.gravityy/, 'a verb naming a field that is not here fails at load');
});

test('a script may reach further than the inspector, never less far', () => {
  for (const [section, fields] of SETS) assert.deepEqual(scriptRangesNarrowerThanInspector(fields), [], section);
  // The three that reach further, on purpose, and nothing else.
  const wider = SETS.flatMap(([section, fields]) => fields.filter((field) => field.script).map((field) => `${section}.${field.key}`));
  assert.deepEqual(wider, ['Kinetic.gravity', 'Kinetic.restitution', 'Crossfader.detent']);
  // ...and the check catches a script range that falls short of the inspector's.
  const short = [{ key: 'mix', kind: 'number', min: 0, max: 1, clamp: true, script: { min: 0, max: 0.5 } }];
  assert.deepEqual(scriptRangesNarrowerThanInspector(short), ['mix: the inspector writes 0..1, a script accepts 0..0.5']);
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

test('the Crossfader editor draws its selects, numbers and conditional fields from the control', () => {
  const draw = (patch) => render(CrossfaderEditor, { props: { control: createControl('Crossfader', { Core: { id: 'x' }, Crossfader: patch }) } }).body;
  const resting = draw({ law: 'sharp', returnMode: 'rest', returnValue: 0.7 });
  assert.match(resting, /<option value="sharp" selected[^>]*>Sharp</, 'the stored law is the one selected');
  // Rest is a compact cell: its label is the NumberCell's own, not the cell's strip.
  assert.match(resting, /nc-label[^>]*>Rest</, 'Rest shows while returning to a set value');
  assert.match(resting, /Time \(ms\)/);
  const latched = draw({ returnMode: 'none' });
  assert.doesNotMatch(latched, /nc-label[^>]*>Rest</);
  assert.doesNotMatch(latched, /Time \(ms\)/, 'nothing about the spring while it latches');
  assert.match(latched, /Label A/, 'the hand-written Labels & colours section is still there');
});
