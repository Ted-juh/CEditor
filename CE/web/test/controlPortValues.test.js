import test from 'node:test';
import assert from 'node:assert/strict';
import { controlPortValues, isFanoutControl } from '../src/CE_Application/utils/controlPortValues.js';

test('controlPortValues fans an Envelope out to its stage ports', () => {
  const env = { _children: { Core: { controlType: 'Envelope' }, Envelope: {
    points: [{ x: 0, y: 0 }, { x: 0.2, y: 1 }, { x: 0.5, y: 0.6 }, { x: 1, y: 0 }], sustainIndex: 2,
  } } };
  const v = controlPortValues(env);
  assert.deepEqual(Object.keys(v).sort(), ['attack', 'decay', 'peakIndex', 'release', 'sustain', 'sustainIndex']);
  assert.ok(Math.abs(v.attack - 0.2) < 1e-6 && Math.abs(v.sustain - 0.6) < 1e-6);
  assert.equal(isFanoutControl(env), true);
});

test('single-port controls return null (normal binding path)', () => {
  assert.equal(controlPortValues({ _children: { Core: { controlType: 'Knob' } } }), null);
  assert.equal(isFanoutControl({ _children: { Core: { controlType: 'Meter' } } }), false);
});
