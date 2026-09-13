import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostState, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

const state = fields => normalizeHostState({ rack: { pages: [{ pageId: 'p', slots: [{
  slotId: 's1', midiCc: 74, midiChannel: 1, midiNote: -1, ...fields,
}, { slotId: 's2', midiCc: 75, midiPickup: true }] }] } });
const slot = s => s.rack.pages[0].slots[0];

test('old sessions keep immediate absolute MIDI bindings', () => {
  assert.equal(slot(state()).midiPickup, false);
  assert.equal(slot(state()).midiRelative, false);
  assert.equal(slot(state()).pickupDirection, 0);
});

test('pickup direction only appears for an enabled absolute CC binding', () => {
  assert.equal(slot(state({ midiPickup: true, pickupDirection: -1 })).pickupDirection, -1);
  for (const fields of [
    { midiRelative: true }, { midiNote: 36 }, { midiCc: -1 }, { toggle: true },
    { midiPickup: false }, { midiPickup: 'true' }, { pickupDirection: 55 },
  ]) assert.equal(slot(state({ midiPickup: true, pickupDirection: 1, ...fields })).pickupDirection, 0);
});

test('changing MIDI mode preserves the pickup preference and other controls', () => {
  let s = state({ midiPickup: true, pickupDirection: 1, rangeMin: .2, rangeMax: .8 });
  s = applyMockCommand(s, { cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', midiRelative: true });
  assert.equal(slot(s).midiRelative, true);
  assert.equal(slot(s).midiPickup, true);
  assert.equal(slot(s).pickupDirection, 0);
  assert.equal(slot(s).rangeMin, .2);
  assert.equal(s.rack.pages[0].slots[1].midiPickup, true);
  s = applyMockCommand(s, { cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', midiRelative: false });
  assert.equal(slot(s).midiPickup, true);
  s = applyMockCommand(s, { cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', midiPickup: false });
  assert.equal(slot(s).midiPickup, false);
  assert.equal(s.rack.pages[0].slots[1].midiPickup, true);
});
