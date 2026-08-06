// sliderDefaultCurrent.test.js — the authored default has to be the value you see.
//
// CE-BETA-006 from the 2026-08-06 QA pass: a knob authored with a default of -6 dB over
// -60..12, and a slider authored 50 over 0..100, both serialised those defaults correctly into
// exportParameters — and then started at 0.5 dB and 1% on the canvas and in preview.
//
// Two resolvers disagreed. exportParameters reads `defaultCurrentValue ?? defaultValue`, which is
// right. sliderBehavior's defaultCurrentValueFor consulted `centerValue` FIRST and returned it
// whenever it was finite — and it is always finite, because both section templates ship 0.5. So
// the authored default was dead for every slider whose Centre had not been changed by hand, and
// clamp(0.5, -60, 12) is the 0.5 dB the tester saw.
//
// Centre is a marker, not a start value: its own field calls it an "optional centre reference
// value for bipolar sliders and centre markers", and the only other reader draws that marker. A
// bipolar slider that should rest at centre gets there via defaultCurrentValue, which is what the
// presets set it to.
//
// The last test is the one that keeps them honest: the file and the canvas must agree.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getSliderDefaultValues } from '../src/CE_Application/utils/sliderBehavior.js';

/** A behavior block as the section templates actually materialise it — centre always present. */
const slider = (over = {}) => ({
  family: 'range',
  role: 'slider',
  geometry: 'linear',
  valueMode: 'single',
  min: 0,
  max: 1,
  step: 0.01,
  centerValue: 0.5,
  ...over,
});

test('the authored default wins over the centre marker (CE-BETA-006)', () => {
  // The knob from the report: -60..12 dB, authored -6. Was 0.5.
  const knob = slider({ geometry: 'circular', min: -60, max: 12, step: 0.5, defaultCurrentValue: -6 });
  assert.equal(getSliderDefaultValues(knob).current, -6);

  // The slider from the report: 0..100%, authored 50. Was 0.5, shown as 1%.
  const linear = slider({ min: 0, max: 100, step: 1, defaultCurrentValue: 50 });
  assert.equal(getSliderDefaultValues(linear).current, 50);
});

test('an authored default of zero is honoured, not treated as absent', () => {
  // The classic falsy-check bug this kind of fix invites. 0 is a legitimate default, and it is
  // what SECTION_DEFAULTS ships.
  const bipolar = slider({ min: -1, max: 1, defaultCurrentValue: 0, centerValue: 0.5 });
  assert.equal(getSliderDefaultValues(bipolar).current, 0);
});

test('an untouched control is unaffected', () => {
  // Both templates ship defaultCurrentValue and centerValue at 0.5, so nothing moves for a
  // slider nobody has edited — the fix must not silently restart existing panels elsewhere.
  assert.equal(getSliderDefaultValues(slider({ defaultCurrentValue: 0.5 })).current, 0.5);
});

test('centre is still the fallback when no default was authored', () => {
  const { centerValue, ...noDefault } = slider({ min: 0, max: 10, step: 1, centerValue: 7 });
  assert.equal(getSliderDefaultValues({ ...noDefault, centerValue: 7 }).current, 7);
});

test('with neither, it rests at the midpoint', () => {
  assert.equal(getSliderDefaultValues(slider({ min: 0, max: 10, step: 1, centerValue: undefined })).current, 5);
});

test('the default is clamped into range', () => {
  assert.equal(getSliderDefaultValues(slider({ min: 0, max: 10, defaultCurrentValue: 999 })).current, 10);
  assert.equal(getSliderDefaultValues(slider({ min: 0, max: 10, defaultCurrentValue: -999 })).current, 0);
});

test('a non-numeric default falls through rather than poisoning the value', () => {
  assert.equal(getSliderDefaultValues(slider({ min: 0, max: 10, defaultCurrentValue: 'nonsense', centerValue: 4 })).current, 4);
});

test('what is serialised and what is shown agree', () => {
  // The actual defect: the saved file said -6 and the canvas said 0.5. exportParameters reads
  // `defaultCurrentValue ?? defaultValue`; this pins the canvas to the same source, so the two
  // cannot drift apart again without failing here.
  for (const authored of [-6, 0, 12, 3.5]) {
    const behavior = slider({ min: -60, max: 12, step: 0.5, defaultCurrentValue: authored });
    const serialised = behavior.defaultCurrentValue ?? behavior.defaultValue;
    assert.equal(getSliderDefaultValues(behavior).current, serialised,
      `canvas start disagrees with the serialised default for ${authored}`);
  }
});
