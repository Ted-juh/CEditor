import test from 'node:test';
import assert from 'node:assert/strict';
import { applyControlSlotValues, normalizeHostState } from '../src/CE_Application/stores/instrumentHost.js';

test('page values track target IDs across pages and undo range/inversion', () => {
  const slot = { slotId: 's1', assigned: true, resolved: true, partId: 'synth', parameterId: 'cutoff', rangeMin: .2, rangeMax: .8 };
  const state = normalizeHostState({ rack: { pages: [
    { pageId: 'a', slots: [slot, { ...slot, slotId: 's2', partId: 'other' }, { ...slot, slotId: 's3', resolved: false }] },
    { pageId: 'b', slots: [{ ...slot, inverted: true }, { ...slot, slotId: 's2', rangeMax: .2, inverted: true }] },
  ] } });
  const updated = applyControlSlotValues(state, { partId: 'synth', changes: [{ id: 'cutoff', value: .35, text: '350 Hz' }] });
  assert.ok(Math.abs(updated.rack.pages[0].slots[0].value - .25) < 1e-10);
  assert.ok(Math.abs(updated.rack.pages[1].slots[0].value - .75) < 1e-10);
  assert.equal(updated.rack.pages[0].slots[0].valueText, '350 Hz');
  assert.equal(updated.rack.pages[1].slots[1].value, 1);
  assert.equal(updated.rack.pages[0].slots[1], state.rack.pages[0].slots[1]);
  assert.equal(updated.rack.pages[0].slots[2], state.rack.pages[0].slots[2]);
  assert.equal(state.rack.pages[0].slots[0].value, 0);
  const clamped = applyControlSlotValues(updated, { partId: 'synth', changes: [{ id: 'cutoff', value: 1 }] });
  assert.equal(clamped.rack.pages[0].slots[0].value, 1);
  assert.equal(clamped.rack.pages[1].slots[0].value, 0);
});

test('unrelated, malformed and unchanged deltas retain the state reference', () => {
  const state = normalizeHostState({ rack: { pages: [{ pageId: 'a', slots: [
    { slotId: 's1', assigned: true, resolved: true, partId: 'synth', parameterId: 'cutoff', value: .5, valueText: '50%' },
  ] }] } });
  for (const payload of [null, {}, { partId: 'synth', changes: [{ id: 'cutoff', value: NaN }] },
    { partId: 'other', changes: [{ id: 'cutoff', value: .1 }] },
    { partId: 'synth', changes: [{ id: 'cutoff', value: .5, text: '50%' }] }]) {
    assert.equal(applyControlSlotValues(state, payload), state);
  }
});

test('reversed ranges retain the same physical position used by native pickup', () => {
  const state = normalizeHostState({ rack: { pages: [{ pageId: 'a', slots: [
    { slotId: 's1', assigned: true, resolved: true, partId: 'synth', parameterId: 'cutoff', rangeMin: .8, rangeMax: .2 },
  ] }] } });
  const updated = applyControlSlotValues(state, { partId: 'synth', changes: [{ id: 'cutoff', value: .65 }] });
  assert.ok(Math.abs(updated.rack.pages[0].slots[0].value - .25) < 1e-10);
});
