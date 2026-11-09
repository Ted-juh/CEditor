// s7Encoding.test.js — a signed 7-bit parameter (a pan, a tune, an envelope depth) is written as the
// value plus its bias and read back as the byte less it, in the web engine as in
// DeviceProfileEngine.cpp and the DPD's codecs.mjs.
//
// The web engine read s7 but did not write it: the value fell through to the u7 encoder, which
// clamped it to 0-127, so every negative value went out as 0 and every other one 64 too low. A pan
// of 0 read back as -64. Its dump decoder had no s7 branch either, so a dump's s7 field came back as
// the raw byte: a pan of -10 as 54. test-sysex-synth's lfo.pan is the profile's s7 parameter, with
// a bias of 64 and a dump of its own (s7PatchDump: F0 7D <id> 0A <pan> F7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  encodeParameterValue, decodeParameterValue, localCompileParameter, localBuildDumpMessage, localParseDumpMessage,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { readText } from './support/readText.mjs';

const SYNTH = JSON.parse(readText(fileURLToPath(
  new URL('../../profiles/test/test-sysex-synth.ceditor-device.json', import.meta.url))));
const PAN = SYNTH.parameters.find((p) => p.id === 'lfo.pan');

test('a signed value is written as the value plus its bias', () => {
  assert.equal(PAN.encoding.type, 's7');
  for (const [value, byte] of [[-64, 0x00], [-10, 0x36], [0, 0x40], [10, 0x4a], [63, 0x7f]]) {
    const encoded = encodeParameterValue(PAN, value);
    assert.deepEqual(encoded.bytes, [byte], `pan ${value}`);
    assert.equal(encoded.number, byte, 'the number on the wire, as every other encoding gives it');
    assert.equal(encoded.displayed, String(value));
  }
  // Another bias, and a value given as text, as a control's value may be.
  assert.deepEqual(encodeParameterValue({ id: 't', encoding: { type: 's7', signedOffset: 24 } }, -24).bytes, [0]);
  assert.deepEqual(encodeParameterValue(PAN, '-10').bytes, [0x36]);
});

test('every value of the range reads back as itself', () => {
  for (let value = PAN.range.min; value <= PAN.range.max; value += 1) {
    assert.equal(decodeParameterValue(PAN, encodeParameterValue(PAN, value).bytes), value, `pan ${value}`);
  }
});

test('a value the byte cannot hold is refused, not clamped', () => {
  // The pan's range is the byte's, and the range is checked first, in DeviceProfileEngine.cpp's
  // order and words — so that is the refusal these get.
  assert.equal(encodeParameterValue(PAN, -65).error, 'Value outside range -64-63 for lfo.pan');
  assert.equal(encodeParameterValue(PAN, 64).error, 'Value outside range -64-63 for lfo.pan');
  assert.equal(localCompileParameter(SYNTH, { parameterId: 'lfo.pan', value: 100 }).ok, false);
  // A bias that leaves the byte short of the value is the encoder's refusal, also C++'s words.
  assert.equal(encodeParameterValue({ id: 't', encoding: { type: 's7', signedOffset: 24 } }, 104).error,
    'Encoded s7 value outside MIDI data byte range for t');
});

test('the parameter\'s own message carries the signed byte', () => {
  const compiled = localCompileParameter(SYNTH, { parameterId: 'lfo.pan', value: -10 });
  assert.equal(compiled.ok, true, compiled.error);
  const bytes = compiled.bytes ?? compiled.hex.split(/\s+/).map((h) => parseInt(h, 16));
  assert.ok(bytes.includes(0x36), `the message ${compiled.hex} has the pan's byte, 36`);
});

test('a dump built with a signed value parses back to it', () => {
  for (const value of [-64, -10, 0, 63]) {
    const built = localBuildDumpMessage(SYNTH, 's7PatchDump', { 'lfo.pan': value });
    assert.equal(built.ok, true, built.error);
    assert.equal(built.bytes[4], value + 64, `pan ${value} is byte ${value + 64}`);
    const parsed = localParseDumpMessage(SYNTH, built.hex);
    assert.equal(parsed.ok, true, parsed.error);
    assert.equal(parsed.values['lfo.pan'], value, `pan ${value} reads back`);
  }
  // The C++ engine's own case (DeviceProfileEngineTests.cpp): byte 36 is -10.
  assert.equal(localParseDumpMessage(SYNTH, 'F0 7D 10 0A 36 F7').values['lfo.pan'], -10);
});
