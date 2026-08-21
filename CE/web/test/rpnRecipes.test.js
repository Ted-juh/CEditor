// rpnRecipes.test.js — RPN as an outbound wire kind, and its agreement with NRPN.
//
// RPN existed only on the way IN. midiControlBindings could recognise an incoming 101/100 pair and
// bind a control to it, and midiLearnChips could name one — but nothing could SEND one: the DPD
// schema's wire and recipe enums stopped at `nrpn`, so a profile could not declare an RPN parameter,
// and neither engine had a branch for it. Pitch Bend Sensitivity, Channel Fine/Coarse Tuning — the
// three registered numbers the MIDI spec itself defines — were unreachable from a panel.
//
// WHAT THIS PINS. The two are ONE builder in both engines, because they differ in exactly one thing:
// which controller pair selects the parameter number. 99/98 for an NRPN, 101/100 for an RPN, and the
// null that closes a selection uses whichever pair opened it. Everything else — channel, the 7- vs
// 14-bit value on CC 6 and 38, the delays — is shared, and a second copy would be a second place for
// the value handling to drift.
//
// The C++ side is pinned by the declared tests in CE/profiles/test/test-nrpn-synth.ceditor-device
// .json, which DeviceProfileEngineTests runs. This file is the local engine, which has to build the
// same bytes: it runs when the JUCE bridge is absent or a draft is being edited, and a fallback
// engine that disagrees with the real one is worse than no fallback, because you would "fix" a
// working profile to match a broken picture of it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { localCompileParameter } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const CH1 = 0xb0;
const SELECT_NRPN = [99, 98];
const SELECT_RPN = [101, 100];

/** A profile carrying one parameter-number recipe of either flavour. */
function profileWith(kind, { resolution = 7, nullAfterSend = false, msb = 0, lsb = 0 } = {}) {
  return {
    id: 'probe',
    variables: { channel: 1 },
    messageRecipes: [{
      id: 'probe-recipe',
      kind,
      channel: '$channel',
      parameterMsb: msb,
      parameterLsb: lsb,
      valueResolution: resolution,
      value: '$encodedValue',
      nullAfterSend,
    }],
    parameters: [{
      id: 'probe.value',
      messageRecipe: 'probe-recipe',
      type: 'integer',
      range: { min: 0, max: resolution === 14 ? 16383 : 127 },
      encoding: { type: resolution === 14 ? 'u14-msb-lsb' : 'u7' },
    }],
  };
}

const compile = (profile, value) =>
  localCompileParameter(profile, { parameterId: 'probe.value', value, deviceRole: 'probe' });

/** The [controller, value] pairs of a compiled message, in order. */
function ccPairs(result) {
  assert.ok(result.ok, result.error);
  const bytes = result.transaction.messages.flatMap((m) => m.bytes ?? m);
  const pairs = [];
  for (let i = 0; i < bytes.length; i += 3) {
    assert.equal(bytes[i], CH1, `byte ${i} should be a channel-1 CC status`);
    pairs.push([bytes[i + 1], bytes[i + 2]]);
  }
  return pairs;
}

/* ------------------------------------------------------------------ the pair that selects */

test('an RPN selects with 101/100 where an NRPN selects with 99/98', () => {
  // The entire difference between the two, stated once.
  const rpn = ccPairs(compile(profileWith('rpn', { msb: 0, lsb: 0 }), 2));
  const nrpn = ccPairs(compile(profileWith('nrpn', { msb: 0, lsb: 0 }), 2));

  assert.deepEqual(rpn.slice(0, 2).map(([cc]) => cc), SELECT_RPN);
  assert.deepEqual(nrpn.slice(0, 2).map(([cc]) => cc), SELECT_NRPN);
  // ...and nothing else differs.
  assert.deepEqual(rpn.map(([, v]) => v), nrpn.map(([, v]) => v));
});

test('the registered numbers the MIDI spec names reach the wire intact', () => {
  // 00 00 pitch bend sensitivity, 00 01 fine tune, 00 02 coarse tune.
  for (const [msb, lsb] of [[0, 0], [0, 1], [0, 2]]) {
    const pairs = ccPairs(compile(profileWith('rpn', { msb, lsb }), 4));
    assert.deepEqual(pairs[0], [101, msb]);
    assert.deepEqual(pairs[1], [100, lsb]);
  }
});

/* ------------------------------------------------------------------------- the value */

test('a 7-bit RPN sends one value byte on CC 6', () => {
  const pairs = ccPairs(compile(profileWith('rpn'), 2));
  assert.deepEqual(pairs, [[101, 0], [100, 0], [6, 2]]);
});

test('a 14-bit RPN sends MSB on CC 6 and LSB on CC 38', () => {
  const pairs = ccPairs(compile(profileWith('rpn', { resolution: 14, lsb: 1 }), 8192));
  assert.deepEqual(pairs, [[101, 0], [100, 1], [6, 64], [38, 0]]);
});

test('the value path is shared, byte for byte, across a sweep', () => {
  // The reason this is one builder rather than two: if the RPN branch were its own copy, this is
  // where the 7/14-bit handling would drift after somebody fixed one of them.
  for (const value of [0, 1, 63, 64, 127]) {
    const rpn = ccPairs(compile(profileWith('rpn'), value));
    const nrpn = ccPairs(compile(profileWith('nrpn'), value));
    assert.deepEqual(rpn.slice(2), nrpn.slice(2), `value ${value}`);
  }
});

/* --------------------------------------------------------------------------- the null */

test('the null that closes a selection uses the pair that opened it', () => {
  // 101/100 127 for an RPN. Sending 99/98 127 instead would leave the RPN selected, so the next
  // plain CC 6 on the channel would move the pitch bend range — the exact accident the null exists
  // to prevent.
  const rpn = ccPairs(compile(profileWith('rpn', { nullAfterSend: true }), 2));
  assert.deepEqual(rpn.slice(-2), [[101, 127], [100, 127]]);

  const nrpn = ccPairs(compile(profileWith('nrpn', { nullAfterSend: true }), 2));
  assert.deepEqual(nrpn.slice(-2), [[99, 127], [98, 127]]);
});
