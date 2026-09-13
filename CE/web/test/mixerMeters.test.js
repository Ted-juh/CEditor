import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMeters, applyMeterFrame, advanceMeters, clearMeterPeaks, meterPercent, peakToDb } from '../src/CE_Application/utils/mixerMeters.js';
const frame = (left, right = left, id = 'part') => ({ channels: [{ id, left, right }] });
const near = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} ≈ ${b}`);

test('sample peaks remain stereo and above unity; 0 dBFS latches overload', () => {
  const state = applyMeterFrame(emptyMeters(), frame(1.2, .25), 100);
  near(state.channels.part.levels[0], 20 * Math.log10(1.2));
  near(state.channels.part.levels[1], -12.041199826559248);
  assert.equal(state.channels.part.over, true);
  assert.equal(applyMeterFrame(emptyMeters(), frame(1), 100).channels.part.over, true);
  assert.equal(meterPercent(3), 100);
  assert.equal(meterPercent(-Infinity), 0);
});

test('fast attack, timed release and a one-second peak marker are time-based', () => {
  let state = applyMeterFrame(emptyMeters(), frame(1), 100);
  state = applyMeterFrame(state, frame(0), 600);
  near(state.channels.part.levels[0], -12);
  assert.equal(state.channels.part.holds[0], 0);
  state = advanceMeters(state, 1600);
  near(state.channels.part.holds[0], -12);
  near(state.channels.part.levels[0], -36);
  state = advanceMeters(state, 5000);
  assert.equal(state.channels.part.levels[0], -Infinity, 'stalled bridge releases to silence');
  assert.equal(state.channels.part.holds[0], -Infinity);
  assert.equal(state.channels.part.maximumDb, 0, 'numeric peak persists');
  assert.equal(state.channels.part.over, true, 'OVER persists');
});

test('clearing one channel leaves others alone; a fresh over-range packet re-latches', () => {
  let state = applyMeterFrame(emptyMeters(), { channels: [...frame(1.2).channels, ...frame(1.5, 1.5, '@master').channels] }, 100);
  state = clearMeterPeaks(state, 'part', 500);
  assert.equal(state.channels.part.over, false);
  assert.equal(state.channels.part.maximumDb, -Infinity, 'stale input is not reused');
  assert.equal(state.channels['@master'].over, true);
  state = applyMeterFrame(state, frame(1.01), 550);
  assert.equal(state.channels.part.over, true);
  state = clearMeterPeaks(state, undefined, 600);
  assert.equal(state.channels.part.over, false);
  near(state.channels.part.maximumDb, peakToDb(1.01));
});

test('roster edits preserve peaks by ID and remove departed channels', () => {
  let state = applyMeterFrame(emptyMeters(), { channels: [...frame(.8, .8, 'a').channels, ...frame(.2, .2, 'b').channels] }, 100);
  state = applyMeterFrame(state, { channels: [...frame(.1, .1, 'b').channels, ...frame(.1, .1, 'a').channels] }, 150);
  near(state.channels.a.maximumDb, peakToDb(.8));
  near(state.channels.b.maximumDb, peakToDb(.2));
  state = applyMeterFrame(state, frame(.1, .1, 'b'), 200);
  assert.deepEqual(Object.keys(state.channels), ['b']);
  assert.deepEqual(applyMeterFrame(state, { channels: [] }, 250).channels, {});
});

test('malformed input cannot produce NaN heights or inherit object properties', () => {
  const empty = emptyMeters();
  assert.equal(applyMeterFrame(empty, null, 100), empty);
  assert.deepEqual(applyMeterFrame(empty, frame(NaN), 100).channels, {});
  assert.deepEqual(applyMeterFrame(empty, frame(-1), 100).channels, {});
  const state = applyMeterFrame(empty, frame(.5, .5, '__proto__'), 100);
  near(state.channels.__proto__.maximumDb, peakToDb(.5));
});
