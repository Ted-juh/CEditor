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
// Three of these are corrections rather than choices, and each is a wrong number on screen if it is
// got wrong: Data Entry MSB zeroes the LSB; an RPN selection cancels the NRPN; and Data Entry with
// nothing selected is an ordinary controller rather than something to swallow.

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
  assert.deepEqual([...NRPN_CONTROLLERS].sort((a, b) => a - b), [6, 38, 98, 99]);
});

test('Data Entry with nothing selected is an ordinary controller', () => {
  // Some gear uses CC 6 on its own. Swallowing it because it *might* be part of an NRPN would make
  // a real controller vanish from the strip and from binding.
  const { assembled, passthrough } = feed('B0 06 40 B0 26 10');
  assert.deepEqual(assembled, []);
  assert.equal(passthrough.length, 2, 'neither byte should have been consumed');
});

test('an RPN selection cancels the NRPN', () => {
  // THE correctness case. CC 101/100 select a registered parameter — pitch bend range, tuning — and
  // the Data Entry that follows belongs to that. Without this, setting a synth's bend range would
  // drive whatever NRPN happened to be selected earlier.
  const selected = feed(`${SELECT}`);
  const after = feed('B0 65 00 B0 64 00 B0 06 02', selected.state);
  assert.deepEqual(after.assembled, [], 'a bend-range RPN was read as an NRPN value');
  assert.equal(after.passthrough.length, 3, 'and none of it should have been swallowed');
});

test('reset all controllers does NOT clear the selection, and that is a known gap', () => {
  // It should — what follows a controller reset is not addressed to what was selected before. But
  // expressionEvent() drops every controller from 120 up, so CC 121 never reaches this machine, and
  // making it arrive means widening a reducer the Router shares. Pinned as the behaviour that
  // actually happens, so the gap is visible rather than assumed closed.
  const selected = feed(`${SELECT}`);
  const after = feed('B0 79 00 B0 06 02', selected.state);
  assert.equal(after.assembled.length, 1, 'if this starts failing, CC 121 now arrives — handle it');
  assert.equal(after.assembled[0].parameterLsb, 32, 'the stale selection is still in force');
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
