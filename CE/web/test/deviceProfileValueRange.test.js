// deviceProfileValueRange.test.js — the web engine refuses the values DeviceProfileEngine.cpp refuses.
//
// The two engines are meant to build the same MIDI. They did not agree on a value outside its
// parameter's range: C++ (`validateAndEncodeValue`) fails with "Value outside range min-max for
// <id>", while deviceProfileLocalEngine.js never looked at the range and let the u7 and 14-bit
// encoders CLAMP what the bytes could not hold. A bank select declared 0-3 compiled 100 as
// B0 00 64 and reported ok, so the DPD preview showed a message the program refuses to send.
//
// What is pinned here is C++'s list, in C++'s order and words: not a number, outside the range
// (integer, float and bipolar parameters; 0-127 when none is declared), then more than the
// encoder's bytes hold — u7, s7, both 14-bit orders — and the choice refusals. In-range values are
// checked to still build exactly what they built before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  encodeParameterValue,
  localBuildDumpMessage,
  localCompileParameter,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import {
  buildDump, clearDeviceDefinitions, defineDump, defineParameter,
} from '../src/CE_Application/scripting/deviceDefinitions.js';
import { buildInboundIndex, decodeInbound } from '../src/CE_Application/utils/inboundParameterIndex.js';
import { readText } from './support/readText.mjs';

const profileFile = (name) => JSON.parse(readText(fileURLToPath(
  new URL(`../../profiles/test/${name}.ceditor-device.json`, import.meta.url))));

/** The reported case: a bank select on CC 0, declared 0-3. */
const BANK = {
  id: 'test.bank-select',
  parameters: [{
    id: 'common.bankSelect', type: 'integer', range: { min: 0, max: 3 },
    encoding: { type: 'u7' }, messageRecipe: 'cc0',
  }],
  messageRecipes: [{ id: 'cc0', kind: 'cc', controller: 0 }],
};

/** One parameter, the rest of it given. */
const param = (extra) => ({ id: 'p', type: 'integer', ...extra });

test('a value outside the parameter\'s range is refused, as C++ refuses it', () => {
  assert.deepEqual(
    localCompileParameter(BANK, { parameterId: 'common.bankSelect', value: 100 }),
    { ok: false, error: 'Value outside range 0-3 for common.bankSelect' });
  assert.equal(localCompileParameter(BANK, { parameterId: 'common.bankSelect', value: -1 }).error,
    'Value outside range 0-3 for common.bankSelect');
});

test('a value inside it still compiles, to the same message as before', () => {
  for (const value of [0, 1, 2, 3]) {
    const compiled = localCompileParameter(BANK, { parameterId: 'common.bankSelect', value });
    assert.equal(compiled.ok, true, compiled.error);
    assert.equal(compiled.hex, `B0 00 0${value}`);
  }
});

test('a real profile\'s narrow range: the GAIA\'s cutoff keyfollow is 54-74', () => {
  const gaia = profileFile('roland-gaia');
  const at = (value) => localCompileParameter(gaia, { parameterId: 'filter.cutoffKeyfollow', value });
  assert.equal(at(64).ok, true, at(64).error);
  assert.match(at(64).hex, /^F0 41 [0-9A-F]{2} 00 00 41 12 10 00 01 0D 40 [0-9A-F]{2} F7$/);
  assert.equal(at(53).error, 'Value outside range 54-74 for filter.cutoffKeyfollow');
  // The value a 0-127 knob sends at the top, which the u7 encoder used to accept as it stood.
  assert.equal(at(127).error, 'Value outside range 54-74 for filter.cutoffKeyfollow');
});

test('the range is compared before rounding, as C++ compares it', () => {
  const p = param({ range: { min: 0, max: 3 } });
  assert.equal(encodeParameterValue(p, 3.4).error, 'Value outside range 0-3 for p');
  assert.deepEqual(encodeParameterValue(p, 2.6).bytes, [3]);
});

test('no declared range is 0-127, and each kind of number parameter is held to its range', () => {
  assert.equal(encodeParameterValue(param({}), 128).error, 'Value outside range 0-127 for p');
  assert.deepEqual(encodeParameterValue(param({}), 127).bytes, [127]);
  for (const type of ['integer', 'float', 'bipolar']) {
    assert.equal(encodeParameterValue(param({ type, range: { min: 0, max: 10 } }), 11).error,
      'Value outside range 0-10 for p', type);
  }
});

test('a value that is not a finite number is refused', () => {
  for (const value of [NaN, Infinity, -Infinity, 'nan', 'inf']) {
    assert.equal(encodeParameterValue(param({}), value).error, 'Value is not numeric for p', String(value));
  }
});

test('a value is read as a number the way JUCE reads one', () => {
  // `(double) juce::var`: what C++ then range-checks. An absent value and a word are 0 there, not
  // refusals, so they must not be refusals here either, or the two disagree the other way.
  const p = param({ range: { min: 0, max: 20 } });
  assert.deepEqual(encodeParameterValue(p, '12').bytes, [12]);
  assert.deepEqual(encodeParameterValue(p, ' 12 dB').bytes, [12]);
  assert.deepEqual(encodeParameterValue(p, undefined).bytes, [0]);
  assert.deepEqual(encodeParameterValue(p, 'off').bytes, [0]);
  assert.deepEqual(encodeParameterValue(p, true).bytes, [1]);
  assert.equal(encodeParameterValue(p, '21').error, 'Value outside range 0-20 for p');
});

test('a range wider than the encoder still cannot send what its bytes do not hold', () => {
  const u7 = param({ range: { min: -63, max: 63 }, encoding: { type: 'u7' } });
  assert.equal(encodeParameterValue(u7, -1).error, 'Encoded u7 value outside MIDI data byte range for p');
  assert.deepEqual(encodeParameterValue(u7, 63).bytes, [63]);

  const s7 = param({ range: { min: -100, max: 100 }, encoding: { type: 's7' } });
  assert.equal(encodeParameterValue(s7, -65).error, 'Encoded s7 value outside MIDI data byte range for p');
  assert.equal(encodeParameterValue(s7, 64).error, 'Encoded s7 value outside MIDI data byte range for p');

  for (const type of ['u14-msb-lsb', 'u14', 'u14-lsb-msb']) {
    const u14 = param({ range: { min: 0, max: 20000 }, encoding: { type } });
    assert.equal(encodeParameterValue(u14, 16384).error, 'Encoded u14 value outside 0-16383 for p', type);
    assert.equal(encodeParameterValue(u14, 16383).bytes.length, 2, type);
  }
  assert.deepEqual(encodeParameterValue(param({ range: { min: 0, max: 16383 }, encoding: { type: 'u14-lsb-msb' } }), 12345).bytes,
    [0x39, 0x60], 'least significant byte first');
});

test('a value no type is range-checked for still cannot leave the byte', () => {
  // The fallback encoder clamped for every type. A value it cannot carry is refused now, as the
  // nibbled and signed encoders already did.
  assert.equal(encodeParameterValue({ id: 'q', encoding: { type: 'u7' } }, 200).error,
    'Encoded u7 value outside MIDI data byte range for q');
  assert.equal(encodeParameterValue({ id: 'q', encoding: { type: 'u14' } }, 20000).error,
    'Encoded u14 value outside 0-16383 for q');
});

test('an action sends its own trigger byte whatever it is given, as C++ does', () => {
  // C++ never reads an action's value, so it never refuses one. This engine sent the value as a u7,
  // so the SH-201's All Notes Off went out as B0 7B 7F where the program sends B0 7B 00 — and once
  // the u7 encoder stopped clamping, a press of 128 would have been refused here and sent there.
  const sh201 = profileFile('roland-sh-201');
  for (const value of [true, 1, 127, 128, -1, undefined]) {
    const compiled = localCompileParameter(sh201, { parameterId: 'actions.allNotesOff', value });
    assert.equal(compiled.ok, true, compiled.error);
    assert.equal(compiled.hex, 'B0 7B 00', String(value));
  }
  assert.deepEqual(encodeParameterValue({ id: 'a', type: 'action', triggerValue: 5 }, 0).bytes, [5]);
  assert.equal(encodeParameterValue({ id: 'a', type: 'action', triggerValue: 200 }, 1).error,
    'Action encoded value outside MIDI data byte range for a');
});

test('an action\'s own message, coming back in, is not read as a value it does not carry', () => {
  // The inbound index compiles each parameter at several values and keeps what does not move. An
  // action now builds the same whole message for every one, and the index took that message's last
  // byte for its value: an RQ1 echoed back read its F7 as 119 and set the action to it.
  const sh201 = profileFile('roland-sh-201');
  const index = buildInboundIndex(sh201);
  const request = localCompileParameter(sh201, { parameterId: 'actions.requestSystem', value: true }).hex;
  assert.equal(decodeInbound(index, request), null, 'an RQ1 ends on its checksum and F7, not a value');
  // A CC action's message does end on its byte, and that is read.
  assert.deepEqual(decodeInbound(index, 'B0 7B 00'), { parameterId: 'actions.allNotesOff', value: 0 });
});

test('a switch is not refused for its value, since C++ reads it as on or off', () => {
  // Its byte without a boolean-u7 encoder is a separate difference, left as it was; what matters
  // here is that no value of it is refused that C++ would send.
  for (const type of ['boolean', 'momentary']) {
    for (const value of [128, -1, 1000, 'on']) {
      assert.equal(encodeParameterValue({ id: 's', type }, value).error, undefined, `${type} ${value}`);
    }
  }
});

test('a half is rounded away from zero, as std::round rounds it', () => {
  const pan = param({ range: { min: -64, max: 63 }, encoding: { type: 's7', signedOffset: 64 } });
  assert.deepEqual(encodeParameterValue(pan, -10.5).bytes, [64 - 11]);
  assert.deepEqual(encodeParameterValue(pan, 10.5).bytes, [64 + 11]);
});

test('a choice that is not one, or whose wire value is not a data byte, is refused', () => {
  const choice = {
    id: 'c', type: 'choice', encoding: { type: 'enum' },
    choices: [{ id: 'lp', label: 'LP', value: 0 }, { id: 'hp', label: 'HP', value: 1 }, { id: 'wide', label: 'Wide', value: 200 }],
  };
  assert.deepEqual(encodeParameterValue(choice, 'hp').bytes, [1]);
  assert.deepEqual(encodeParameterValue(choice, 1).bytes, [1]);
  assert.equal(encodeParameterValue(choice, 9).error, "Unknown choice value '9' for c");
  assert.equal(encodeParameterValue(choice, 'bp').error, "Unknown choice value 'bp' for c");
  assert.equal(encodeParameterValue(choice, 'wide').error, 'Choice encoded value outside MIDI data byte range for c');
});

test('the range in a refusal is written as juce::String writes a double', () => {
  assert.equal(encodeParameterValue(param({ range: { min: 0.5, max: 1000000 } }), 0).error,
    'Value outside range 0.5-1e+06 for p');
  assert.equal(encodeParameterValue(param({ range: { min: -64, max: 63 } }), 64).error,
    'Value outside range -64-63 for p');
});

test('a dump refuses an out-of-range value too, as C++ buildDumpMessage does', () => {
  const synth = profileFile('test-sysex-synth');
  const refused = localBuildDumpMessage(synth, 's7PatchDump', { 'lfo.pan': 100 });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'Cannot encode lfo.pan: Value outside range -64-63 for lfo.pan');
  assert.equal(localBuildDumpMessage(synth, 's7PatchDump', { 'lfo.pan': 63 }).ok, true);
});

test('a script-declared integer is held to its own declared range, not to 0-127', () => {
  // A declared dump is built through the same encoder from a synthetic profile. Without the
  // declared range there, an integer read as a profile parameter with none: 0-127.
  clearDeviceDefinitions();
  try {
    assert.equal(defineParameter('mainSynth', 'w', { type: 'integer', nrpn: { msb: 0, lsb: 1 }, encoding: 'u14' }).ok, true);
    assert.equal(defineDump('mainSynth', 'd', {
      match: { prefix: ['F0', '7D', '12'], suffix: ['F7'] }, offset: 3, size: 2,
      fields: [{ parameter: 'w', offset: 0 }],
    }).ok, true);
    const built = buildDump('mainSynth', 'd', { w: 9000 });
    assert.equal(built.ok, true, built.error);
    assert.equal(built.hex, 'F0 7D 12 46 28 F7');          // 9000 = 0x46 << 7 | 0x28
  } finally {
    clearDeviceDefinitions();
  }
});
