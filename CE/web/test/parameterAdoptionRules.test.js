// parameterAdoptionRules.test.js — what a control looks like after a device parameter is dropped
// on it, and the two ways that has gone wrong.
//
// The module's own header states the rule it exists to enforce: "Adoption is a REBIND, not a
// merge". It records two regressions where that was half-applied — a unit of "BPM" surviving a
// rebind to a unitless parameter, and "+64" surviving a rebind away from a bipolar one. Those are
// pinned below so they cannot come back.
//
// The new one is the same shape as the response-curve defect found in this pass: `??` substitutes
// for null and undefined, so a range that is PRESENT but not a number reached Number() and adopted
// NaN as the control's min and max. Profiles are external files and nothing on the load path
// checks the type of a range, so a single typo poisoned every value the control mapped afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parameterAdoptionPatches, LABEL_BEARING_TYPES,
} from '../src/CE_Application/utils/parameterAdoptionRules.js';

const BIPOLAR = { id: 'oct', name: 'Octave Shift', type: 'bipolar', range: { min: 61, max: 67 },
  default: 64, display: { min: -3, max: 3, unit: 'oct', shortLabel: 'Oct' } };
const TEMPO = { id: 'bpm', name: 'Tempo', type: 'float', range: { min: 20, max: 300 }, default: 120,
  display: { unit: 'BPM' } };
const PLAIN = { id: 'lvl', name: 'Level', type: 'integer', range: { min: 0, max: 127 }, default: 64 };

test('a range that is not a number falls back rather than adopting NaN', () => {
  // "abc" is what a hand-written or generated profile actually produces; [] and {} are what a
  // malformed one does. All three used to reach Number() unguarded.
  for (const range of [{ min: 'abc', max: 'def' }, { min: [], max: {} }, { min: NaN, max: NaN },
                       { min: null, max: undefined }, {}]) {
    const patches = parameterAdoptionPatches('Knob', { type: 'integer', range, default: 5 });
    for (const key of ['Behavior.min', 'Behavior.max', 'Behavior.defaultCurrentValue']) {
      assert.ok(Number.isFinite(patches[key]), `${JSON.stringify(range)} -> ${key} = ${patches[key]}`);
    }
    assert.equal(patches['Behavior.min'], 0, 'the fallback is the same one a MISSING range already used');
    assert.equal(patches['Behavior.max'], 127);
  }
});

test('a default that is not a number falls back to the minimum', () => {
  const patches = parameterAdoptionPatches('Knob', { type: 'integer', range: { min: 12, max: 80 }, default: 'oops' });
  assert.equal(patches['Behavior.defaultCurrentValue'], 12);
});

test('a numeric range that IS a number is still adopted exactly, strings included', () => {
  // The fix must not start rejecting the numeric strings a profile may legitimately carry.
  const patches = parameterAdoptionPatches('Knob', { type: 'integer', range: { min: '12', max: '80' }, default: '40' });
  assert.equal(patches['Behavior.min'], 12);
  assert.equal(patches['Behavior.max'], 80);
  assert.equal(patches['Behavior.defaultCurrentValue'], 40);
});

test('rebinding clears the previous parameter\'s readout — the two regressions the header names', () => {
  assert.equal(parameterAdoptionPatches('Knob', TEMPO)['Behavior.unit'], 'BPM');
  assert.equal(parameterAdoptionPatches('Knob', PLAIN)['Behavior.unit'], '',
    'a unitless parameter must clear the previous unit, not inherit it');

  const bipolar = parameterAdoptionPatches('Knob', BIPOLAR);
  assert.equal(bipolar['Behavior.showSign'], true);
  assert.equal(bipolar['Behavior.displayMin'], -3);
  assert.equal(bipolar['Behavior.displayMax'], 3);

  const plain = parameterAdoptionPatches('Knob', PLAIN);
  assert.equal(plain['Behavior.showSign'], false, 'a plain parameter must clear the sign');
  assert.equal(plain['Behavior.displayMin'], null, 'and the display range');
  assert.equal(plain['Behavior.displayMax'], null);
});

test('the display range is only remapped when the profile says it differs from the wire', () => {
  const same = parameterAdoptionPatches('Knob', { type: 'integer', range: { min: 0, max: 127 },
    default: 0, display: { min: 0, max: 127 } });
  assert.equal(same['Behavior.displayMin'], null, 'an identical display range is not a remap');
  assert.equal(same['Behavior.showSign'], false);
});

test('only label-bearing types adopt the label', () => {
  for (const type of LABEL_BEARING_TYPES) {
    assert.ok('Text.content' in parameterAdoptionPatches(type, BIPOLAR), `${type} should take the label`);
  }
  for (const type of ['Knob', 'Slider', 'Range', 'Number']) {
    assert.ok(!('Text.content' in parameterAdoptionPatches(type, BIPOLAR)), `${type} has no label to take`);
  }
});

test('a degenerate parameter produces patches rather than throwing', () => {
  for (const parameter of [null, undefined, {}, { type: 'choice' }, { type: 'choice', choices: [] },
                           { type: 'choice', choices: [{}] }, { type: 'boolean' }, { type: 'action' }]) {
    const patches = parameterAdoptionPatches('Knob', parameter);
    assert.ok(patches && typeof patches === 'object');
    for (const [key, value] of Object.entries(patches)) {
      assert.ok(typeof value !== 'number' || Number.isFinite(value), `${JSON.stringify(parameter)} -> ${key} = ${value}`);
    }
  }
});
