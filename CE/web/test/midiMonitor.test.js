// midiMonitor.test.js — reading the MIDI traffic.
//
// The monitor was not missing. C++ keeps a 500-event ring buffer and stamps every event with a
// timestamp, direction, device, message type, meaning, hex and status — and all of it was already
// arriving in the UI. The Device tab showed the last FOUR events and three of the seven fields, so
// you could see that MIDI had happened but not when, not to which synth, and not whether it worked.
//
// The one thing that cannot be tested here is real traffic, which is exactly why the reading of it
// is pure and tested: filtering, ordering and formatting are the parts that can be wrong in a way a
// human staring at a synth would blame on the synth.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterMonitorEvents,
  isMonitorFailure,
  monitorCounts,
  monitorEventLine,
  monitorFacets,
  monitorTime,
} from '../src/CE_Application/utils/midiMonitor.js';

const event = (over = {}) => ({
  timestamp: '2026-08-09T18:04:05.123+00:00',
  direction: 'out',
  deviceRole: 'Roland GAIA SH-01',
  messageType: 'cc',
  semantic: 'common.patchLevel = 64',
  hex: 'B0 07 40',
  status: 'sent',
  ...over,
});

test('the time keeps its milliseconds and drops the date', () => {
  // A monitor is read by scanning the left edge for a gap or a burst. MIDI arrives milliseconds
  // apart, so a list stamped to the second says nothing about ordering or rate; the date says
  // nothing at all.
  assert.equal(monitorTime(event()), '18:04:05.123');
  assert.equal(monitorTime(event({ timestamp: '2026-08-09T18:04:05+00:00' })), '18:04:05.000');
  assert.equal(monitorTime(event({ timestamp: '2026-08-09T18:04:05.7Z' })), '18:04:05.700');
  assert.equal(monitorTime({}), '', 'an event with no stamp must not render "NaN"');
});

test('a copied line carries every field the event has', () => {
  assert.equal(
    monitorEventLine(event()),
    '18:04:05.123  out  Roland GAIA SH-01  cc  common.patchLevel = 64  B0 07 40  sent',
  );
  assert.equal(monitorEventLine({ direction: 'in', semantic: 'note on' }), 'in  note on',
    'missing fields must collapse rather than leave gaps');
});

test('a failed send is recognised however C++ phrased it', () => {
  // The failure that prompted all of this said "Not sent: unresolved profile for primary" — no word
  // "error" in it anywhere.
  assert.equal(isMonitorFailure(event({ status: 'Not sent: unresolved profile for primary' })), true);
  assert.equal(isMonitorFailure(event({ status: 'error: port closed' })), true);
  assert.equal(isMonitorFailure(event({ status: 'send failed' })), true);
  assert.equal(isMonitorFailure(event({ status: 'sent' })), false);
  assert.equal(isMonitorFailure(event({ status: '' })), false);
});

test('newest first, because the interesting event is the one that just happened', () => {
  const rows = filterMonitorEvents([event({ semantic: 'first' }), event({ semantic: 'second' })]);
  assert.deepEqual(rows.map((e) => e.semantic), ['second', 'first']);
});

test('each filter narrows on its own field', () => {
  const events = [
    event({ direction: 'out', deviceRole: 'GAIA', messageType: 'cc', semantic: 'cutoff' }),
    event({ direction: 'in', deviceRole: 'GAIA', messageType: 'sysex', semantic: 'patch dump' }),
    event({ direction: 'out', deviceRole: 'Digitakt', messageType: 'cc', semantic: 'kick tune' }),
  ];

  assert.deepEqual(filterMonitorEvents(events, { direction: 'in' }).map((e) => e.semantic), ['patch dump']);
  assert.deepEqual(filterMonitorEvents(events, { device: 'Digitakt' }).map((e) => e.semantic), ['kick tune']);
  assert.deepEqual(filterMonitorEvents(events, { type: 'sysex' }).map((e) => e.semantic), ['patch dump']);
  assert.equal(filterMonitorEvents(events, {}).length, 3);
});

test('search matches any field, including the hex', () => {
  // One box instead of one per column: a parameter name, a device or a couple of bytes all narrow
  // the same way, which is what people type into a monitor anyway.
  const events = [event({ semantic: 'cutoff', hex: 'B0 4A 20' }), event({ semantic: 'resonance', hex: 'B0 47 10' })];

  assert.deepEqual(filterMonitorEvents(events, { search: 'cutoff' }).map((e) => e.semantic), ['cutoff']);
  assert.deepEqual(filterMonitorEvents(events, { search: '47' }).map((e) => e.semantic), ['resonance']);
  assert.deepEqual(filterMonitorEvents(events, { search: 'GAIA' }).length, 2, 'the device is searchable too');
  assert.deepEqual(filterMonitorEvents(events, { search: '   ' }).length, 2, 'whitespace is not a filter');
});

test('failures only, for the case someone is actually debugging', () => {
  const events = [event({ status: 'sent' }), event({ status: 'Not sent: unresolved profile' })];
  assert.deepEqual(filterMonitorEvents(events, { failuresOnly: true }).map((e) => e.status),
    ['Not sent: unresolved profile']);
});

test('filters combine', () => {
  const events = [
    event({ direction: 'out', deviceRole: 'GAIA', semantic: 'cutoff' }),
    event({ direction: 'out', deviceRole: 'Digitakt', semantic: 'cutoff' }),
    event({ direction: 'in', deviceRole: 'GAIA', semantic: 'cutoff' }),
  ];
  const rows = filterMonitorEvents(events, { direction: 'out', device: 'GAIA', search: 'cut' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deviceRole, 'GAIA');
});

test('the filter options are drawn from the traffic, not from a fixed list', () => {
  // Offering every message type MIDI has when only two are present is a menu of dead ends.
  const facets = monitorFacets([
    event({ deviceRole: 'GAIA', messageType: 'cc' }),
    event({ deviceRole: 'Digitakt', messageType: 'sysex' }),
    event({ deviceRole: 'GAIA', messageType: 'cc' }),
    event({ deviceRole: '', messageType: '' }),
  ]);
  assert.deepEqual(facets.devices, ['Digitakt', 'GAIA']);
  assert.deepEqual(facets.types, ['cc', 'sysex']);
});

test('the counts say whether anything is happening at all', () => {
  const counts = monitorCounts([
    event({ direction: 'out', status: 'sent' }),
    event({ direction: 'out', status: 'Not sent: no mapping' }),
    event({ direction: 'in', status: '' }),
  ]);
  assert.deepEqual(counts, { sent: 2, received: 1, failed: 1, total: 3 });
  assert.deepEqual(monitorCounts([]), { sent: 0, received: 0, failed: 0, total: 0 });
  assert.deepEqual(monitorCounts(undefined), { sent: 0, received: 0, failed: 0, total: 0 });
});
