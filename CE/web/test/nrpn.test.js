// nrpn.test.js — reassembling a message that is not a message.
//
// Every other thing this app binds is self-describing: three bytes say which controller moved and
// how far. An NRPN is a convention over four ordinary CCs — 99 and 98 select a parameter number,
// then 6 (and optionally 38) carry the value — so a Data Entry byte means nothing without
// remembering what was selected before it, on that channel. That is why this is the only inbound
// path in the app with state, and why it gets its own tests.
//
// The reading has to accept exactly what the writing produces, so this is checked against the
// byte order DeviceProfileEngine.cpp's NRPN recipe builder emits, not against a reading of the spec.
//
// RPN is the same machine with 101/100 as the selector, and deliberately NOT a second tracker: both
// flavours are read by the same Data Entry bytes, so a channel has one selection and the most recent
// selector wins. Four of these are corrections rather than choices, and each is a wrong number on
// screen: Data Entry MSB zeroes the LSB; a selection of either flavour replaces the other; 127:127
// is null rather than a parameter; and Data Entry with nothing selected is an ordinary controller.

import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_NRPN_STATE, NRPN_CONTROLLERS, applyNrpnEvent, applyNrpnEvents } from '../src/CE_Application/utils/nrpn.js';
import { expressionEventsFromHex } from '../src/CE_Application/utils/midiNoteInput.js';

/** Fold a hex run and report what came out. */
const feed = (hex, state = EMPTY_NRPN_STATE) => applyNrpnEvents(state, expressionEventsFromHex(hex));

// The four CCs a 14-bit NRPN write is made of, in the order the C++ recipe builder emits them.
const SELECT = 'B0 63 01 B0 62 20';           // NRPN 1:32
const DATA14 = 'B0 06 02 B0 26 40';           // value MSB 2, LSB 64 -> 320

test('four CCs become one reading', () => {
  const { assembled } = feed(`${SELECT} ${DATA14}`);
  // Two readings, because Data Entry MSB is itself a complete coarse write — a 7-bit device sends
  // only that one, and waiting for an LSB that never comes would make it silent.
  assert.equal(assembled.length, 2);
  assert.deepEqual(assembled.at(-1), {
    kind: 'nrpn', channel: 1, parameterMsb: 1, parameterLsb: 32, value7: 2, value14: 320,
  });
});

test('both readings are offered, because the wire does not say which is meant', () => {
  // 7-bit and 14-bit NRPNs are byte-identical up to the optional CC 38. Nothing in the stream
  // distinguishes them, so the binding declares it and this hands back both.
  const { assembled } = feed(`${SELECT} B0 06 40`);
  assert.deepEqual(assembled, [{
    kind: 'nrpn', channel: 1, parameterMsb: 1, parameterLsb: 32, value7: 64, value14: 8192,
  }]);
});

test('a coarse write zeroes the fine byte', () => {
  // Per convention, Data Entry MSB resets the LSB. Keeping the previous one would briefly report a
  // value mixing two different settings — the high half of the new one and the low half of the old.
  const first = feed(`${SELECT} ${DATA14}`);
  assert.equal(first.assembled.at(-1).value14, 320);
  const second = feed('B0 06 03', first.state);
  assert.equal(second.assembled.at(-1).value14, 384, 'the stale LSB of 64 was carried over');
});

test('the plumbing CCs are consumed and everything else passes through', () => {
  // What stops one NRPN knob from being offered as four meaningless controllers.
  const { assembled, passthrough } = feed(`${SELECT} ${DATA14} B0 4A 60 D0 20`);
  assert.equal(assembled.length, 2);
  assert.deepEqual(passthrough.map((e) => e.kind), ['cc', 'aftertouch']);
  assert.equal(passthrough[0].cc, 74, 'an unrelated CC must survive');
  assert.deepEqual([...NRPN_CONTROLLERS].sort((a, b) => a - b), [6, 38, 98, 99, 100, 101],
    'both selector pairs and both data bytes are plumbing');
});

test('Data Entry with nothing selected is an ordinary controller', () => {
  // Some gear uses CC 6 on its own. Swallowing it because it *might* be part of an NRPN would make
  // a real controller vanish from the strip and from binding.
  const { assembled, passthrough } = feed('B0 06 40 B0 26 10');
  assert.deepEqual(assembled, []);
  assert.equal(passthrough.length, 2, 'neither byte should have been consumed');
});

test('an RPN selection replaces the NRPN rather than joining it', () => {
  // THE correctness case, and the reason both flavours share one machine. CC 101/100 select a
  // registered parameter — pitch bend range, tuning — and the Data Entry that follows belongs to
  // that. Two independent trackers would both claim the CC 6 and the NRPN-bound control would move.
  const selected = feed(SELECT);
  const after = feed('B0 65 00 B0 64 00 B0 06 02', selected.state);
  assert.equal(after.assembled.length, 1);
  assert.deepEqual(after.assembled[0], {
    kind: 'rpn', channel: 1, parameterMsb: 0, parameterLsb: 0, value7: 2, value14: 256,
  }, 'a bend-range RPN was read as an NRPN value');
});

test('switching flavour drops the half-selection', () => {
  // An RPN MSB after an NRPN MSB must not inherit the NRPN's LSB — that would address a parameter
  // nobody selected, with a number assembled from two different requests.
  const { assembled } = feed('B0 63 01 B0 62 20 B0 65 00 B0 06 02');
  assert.deepEqual(assembled, [], 'the RPN LSB never arrived, so nothing is selected');
});

test('RPN 0:0 is pitch bend sensitivity, and its two bytes are not one number', () => {
  // Worth stating because it is the one place the 14-bit reading is actively misleading: for bend
  // range the MSB is semitones and the LSB is cents, so a binding wanting semitones asks for 7-bit.
  // Nothing here can know that — it is a property of the parameter, not of the transport.
  const { assembled } = feed('B0 65 00 B0 64 00 B0 06 02 B0 26 32');
  assert.equal(assembled.at(-1).value7, 2, '2 semitones');
  assert.equal(assembled.at(-1).value14, 306, 'and the 14-bit reading is not 2.5 anything');
});

test('the null pair selects nothing, so a stray Data Entry lands nowhere', () => {
  // 127:127 is reserved for "deselect", and it is exactly what this app's own sender writes when a
  // binding asks for nullAfterSend. Reading it as a parameter would attribute every later Data
  // Entry to it.
  for (const selector of ['B0 63 7F B0 62 7F', 'B0 65 7F B0 64 7F']) {
    const { assembled, passthrough } = feed(`${selector} B0 06 40`);
    assert.deepEqual(assembled, [], `${selector} was treated as a real parameter`);
    assert.deepEqual(passthrough, [], 'but the bytes are still plumbing, not controllers');
  }
});

test('a null after a send stops the next Data Entry reaching the parameter', () => {
  // The full sequence a nullAfterSend binding emits, then an unrelated Data Entry.
  const sent = feed(`${SELECT} B0 06 40 B0 63 7F B0 62 7F`);
  assert.equal(sent.assembled.length, 1, 'the real write still landed');
  const after = feed('B0 06 10', sent.state);
  assert.deepEqual(after.assembled, [], 'a later Data Entry was attributed to the closed parameter');
});

test('reset all controllers clears the selection', () => {
  // What follows a controller reset is not addressed to whatever was selected before it. This used
  // to be a pinned GAP: expressionEvent() dropped every controller from 120 up, so CC 121 never
  // reached this machine and a stale selection stayed in force, silently capturing the next Data
  // Entry. CC 121 now arrives as its own `controllerReset` kind — not as a cc event, so it reaches
  // here and is inert in the router, the learn buckets and matchesMidiControl, all of which gate on
  // kind. That was the cost of "widening a reducer the Router shares", and it turned out not to be
  // one.
  const selected = feed(`${SELECT}`);
  const after = feed('B0 79 00 B0 06 02', selected.state);
  assert.deepEqual(after.assembled, [], 'a Data Entry after a reset was attributed to the old selection');
});

test('a reset clears only its own channel', () => {
  // Two synths on two channels: resetting one must not drop the other's selection.
  let { state } = feed('B0 63 01 B0 62 20');          // ch 1 -> NRPN 1:32
  ({ state } = feed('B1 63 05 B1 62 06', state));     // ch 2 -> NRPN 5:6
  ({ state } = feed('B0 79 00', state));              // reset ch 1 only

  assert.deepEqual(feed('B0 06 10', state).assembled, [], 'channel 1 kept its selection');
  const two = feed('B1 06 10', state);
  assert.equal(two.assembled.length, 1, 'channel 2 lost a selection nobody reset');
  assert.equal(two.assembled[0].parameterLsb, 6);
});

test('a reset with nothing selected changes nothing', () => {
  // No churn: the reducer must hand back the same state object rather than a fresh one, or every
  // panic button press would wake every consumer of it.
  const { state } = feed('B0 63 01 B0 62 20');
  const before = feed('B1 79 00', state);             // reset a channel with no selection
  assert.equal(before.state, state, 'an empty reset minted new state');
});

test('channels are kept apart', () => {
  // Two synths, or two parts, selecting different parameters at once. One shared selection would
  // send channel 2's value to channel 1's parameter.
  let { state } = feed('B0 63 01 B0 62 20');          // ch 1 -> NRPN 1:32
  ({ state } = feed('B1 63 05 B1 62 06', state));     // ch 2 -> NRPN 5:6
  const one = applyNrpnEvents(state, expressionEventsFromHex('B0 06 10'));
  const two = applyNrpnEvents(one.state, expressionEventsFromHex('B1 06 20'));
  assert.deepEqual(
    [one.assembled[0].parameterMsb, one.assembled[0].parameterLsb, one.assembled[0].channel], [1, 32, 1]);
  assert.deepEqual(
    [two.assembled[0].parameterMsb, two.assembled[0].parameterLsb, two.assembled[0].channel], [5, 6, 2]);
});

test('a half-selected parameter waits', () => {
  // MSB seen, LSB not. Guessing zero for the missing half would bind to a parameter nobody selected.
  const { assembled } = feed('B0 63 01 B0 06 40');
  assert.deepEqual(assembled, []);
});

test('the reducer does not mutate what it is given', () => {
  const before = JSON.stringify(EMPTY_NRPN_STATE);
  feed(`${SELECT} ${DATA14}`);
  assert.equal(JSON.stringify(EMPTY_NRPN_STATE), before);
  const result = applyNrpnEvent(EMPTY_NRPN_STATE, { kind: 'cc', channel: 1, cc: 99, value: 1 });
  assert.notEqual(result.state, EMPTY_NRPN_STATE, 'a new state, not the frozen one edited');
});

test('a non-CC event is left entirely alone', () => {
  const { state, assembled, passthrough } = feed('90 3C 5A F0 7E 7F 06 02 F7');
  assert.equal(state, EMPTY_NRPN_STATE, 'nothing to remember, so the same object back');
  assert.deepEqual(assembled, []);
  assert.equal(passthrough.length, 1, 'the note survives; the sysex is not an expression event');
});
