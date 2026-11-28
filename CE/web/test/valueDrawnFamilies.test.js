// valueDrawnFamilies.test.js — value effects beyond knobs and sliders (utils/valueDrawn.js): the
// Macro's ring and a meter's needle or bar, each drawn from a value of its own.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlDrawsValue, liveDrawnValue } from '../src/CE_Application/utils/valueDrawn.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

test('a Macro and a meter draw a value an effect can move, as knobs and sliders do', () => {
  assert.equal(controlDrawsValue(createControl('Macro')), true);
  assert.equal(controlDrawsValue(createControl('Meter')), true);
  assert.equal(controlDrawsValue(createControl('ProgressBar')), true);
  assert.equal(controlDrawsValue(createControl('Label')), false);
  assert.equal(controlDrawsValue(createControl('Button')), false);
});

test('the live value each draws from: the Macro\'s own, a meter\'s position on its scale, a knob\'s signals', () => {
  const macro = createControl('Macro');
  macro._children.Macro.__value = 0.25;
  assert.equal(liveDrawnValue(macro, {}), 0.25);
  const meter = createControl('Meter');
  Object.assign(meter._children.Meter, { scale: 'linear', valueMin: 0, valueMax: 10, __value: 5 });
  assert.equal(liveDrawnValue(meter, {}), 0.5, 'half way up a linear scale');
  Object.assign(meter._children.Meter, { scale: 'db', dbFloor: -60, dbCeil: 0, valueMin: 0, valueMax: 1, __value: 10 ** -1.5 });
  assert.ok(Math.abs(liveDrawnValue(meter, {}) - 0.5) < 1e-6, 'on a decibel scale, where -60..0 dB puts -30 dB: half way');
  assert.equal(liveDrawnValue(createControl('Knob'), { currentValueNormalized: 0.7 }), 0.7);
  assert.equal(liveDrawnValue(createControl('Knob'), { valueNormalized: 0.4 }), 0.4);
});
