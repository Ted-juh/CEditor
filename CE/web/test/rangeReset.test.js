import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeResetValue } from '../src/CE_Application/utils/rangeReset.js';

test('bipolar reset uses displayed zero, including offset and scaled MIDI ranges', () => {
  assert.equal(rangeResetValue({ min: -50, max: 50, defaultValue: 12 }), 0);
  assert.equal(rangeResetValue({ min: 14, max: 114, defaultValue: 22 }, { offset: -64 }), 64);
  assert.equal(rangeResetValue({ min: 24, max: 2024, defaultValue: 24, displayMin: -100, displayMax: 100 }), 1024);
  assert.equal(rangeResetValue({ min: 0, max: 100, format: { displayMin: -20, displayMax: 80 } }), 20);
  assert.equal(rangeResetValue({ min: 0, max: 100 }, { display: { min: 80, max: -20 } }), 80);
});

test('unipolar reset uses the authored default, independent of the saved current value', () => {
  assert.equal(rangeResetValue({ min: 0, max: 127, defaultValue: 100, currentValue: 12 }), 100);
  assert.equal(rangeResetValue({ min: 5, max: 300, defaultValue: 120, displayMin: null, displayMax: null }), 120);
  assert.equal(rangeResetValue({ min: 5, max: 300 }), 5);
  assert.equal(rangeResetValue({ min: 0, max: 127, defaultValue: 200 }), 127);
});
