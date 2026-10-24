// lsbFirstEncoding.test.js — a 14-bit value kept least significant byte first (u14-lsb-msb), in the
// web engine as in DeviceProfileEngine.cpp (DeviceProfileEngineTests' LSB-first and dump shape
// tests).
//
// The web engine read it and did not write it: the value fell through to the u7 encoder and went out
// as one byte, clamped to 127. Its dump decoder read only the first byte, so 12345 (39 60) came back
// as 57. And both engines built a dump with each parameter's own encoding rather than the codec the
// dump's mapping gives, which is how the parser reads it: test-sysex-synth's mod.depth is u7 on its
// own and LSB-first in u14LsbDump (F0 7D <id> 0B <lsb> <msb> F7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  encodeParameterValue, decodeParameterValue, localCompileParameter, localBuildDumpMessage, localParseDumpMessage,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { readText } from './support/readText.mjs';

const profileNamed = (file) => JSON.parse(readText(fileURLToPath(new URL(`../../profiles/test/${file}`, import.meta.url))));
const SYNTH = profileNamed('test-sysex-synth.ceditor-device.json');
const LSB = { id: 'x', encoding: { type: 'u14-lsb-msb' } };

test('a 14-bit value is written least significant byte first, and read back', () => {
  assert.deepEqual(encodeParameterValue(LSB, 12345).bytes, [0x39, 0x60]);
  assert.deepEqual(encodeParameterValue(LSB, 200).bytes, [0x48, 0x01]);
  assert.equal(encodeParameterValue(LSB, 12345).number, 12345);
  for (const value of [0, 1, 127, 128, 8191, 16383]) {
    assert.equal(decodeParameterValue(LSB, encodeParameterValue(LSB, value).bytes), value, String(value));
  }
});

test('a dump keeps the value as its mapping\'s codec says, built and parsed alike', () => {
  const built = localBuildDumpMessage(SYNTH, 'u14LsbDump', { 'mod.depth': 200 });
  assert.equal(built.ok, true, built.error);
  assert.equal(built.hex, 'F0 7D 10 0B 48 01 F7');
  assert.equal(localParseDumpMessage(SYNTH, built.hex).values['mod.depth'], 200);
  // The C++ engine's own case: 39 60 is 12345.
  assert.equal(localParseDumpMessage(SYNTH, 'F0 7D 10 0B 39 60 F7').values['mod.depth'], 12345);
});

test('an NRPN still sends the MSB on CC 6 and the LSB on CC 38', () => {
  const msbFirst = profileNamed('test-nrpn-synth.ceditor-device.json');
  const lsbFirst = structuredClone(msbFirst);
  lsbFirst.parameters.find((p) => p.id === 'osc.pitch').encoding = { type: 'u14-lsb-msb' };
  const a = localCompileParameter(msbFirst, { parameterId: 'osc.pitch', value: 12345 });
  const b = localCompileParameter(lsbFirst, { parameterId: 'osc.pitch', value: 12345 });
  assert.equal(a.ok && b.ok, true, a.error ?? b.error);
  assert.equal(b.hex, a.hex, 'the same messages as MSB-first');
  assert.match(a.hex, /\b06 60\b.*\b26 39\b/, 'CC 6 = 0x60, CC 38 = 0x39');
});
