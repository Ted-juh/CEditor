// deviceProfileTransform.test.js — encoding.transform and the ccSequence recipe in the JS engine,
// held to the SAME profile and the same bytes as the C++ engine.
//
// CE/profiles/test/test-transform-synth.ceditor-device.json carries its own tests (value in,
// bytes out; a dump in, values out). CE/tests/DeviceProfileEngineTests.cpp runs them through
// DeviceProfileEngine.cpp; this runs them through deviceProfileLocalEngine.js. The local engine is
// what the editor and the Device Profile Designer's preview use when the bridge is absent, so the
// two disagreeing would mean a preview showing a message the export never sends.
//
// Both additions came from Ctrlr panels (docs/design/ctrlr-import-plan.md): about 4,000 of the
// public panels' sending modulators shape the value with a formula ("value + 64", a negative value
// in two's complement, an inverted range), and about 800 send a 14-bit CC pair or an NRPN with its
// data low byte first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  decodeParameterValue, encodeParameterValue, localCompileParameter, localParseDumpMessage,
  transformFromWire, transformToWire, validateLocalProfileSource,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const SOURCE = readFileSync(fileURLToPath(new URL('../../profiles/test/test-transform-synth.ceditor-device.json', import.meta.url)), 'utf8');
const PROFILE = JSON.parse(SOURCE);
const flat = (hex) => String(hex ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const parameter = (id) => PROFILE.parameters.find((p) => p.id === id);

test('the profile validates in the JS engine', () => {
  const validation = validateLocalProfileSource(PROFILE.id, SOURCE);
  assert.ok(validation.ok, JSON.stringify(validation.validation ?? validation.error));
});

for (const check of PROFILE.tests.filter((t) => t.kind !== 'dumpParse')) {
  test(`the C++ engine's test, here: ${check.name}`, () => {
    const compiled = localCompileParameter(PROFILE, { parameterId: check.parameter, value: check.value });
    assert.ok(compiled.ok, compiled.error);
    // One message holding every CC here, one message per CC there: the BYTES are what must agree.
    assert.equal(flat(compiled.hex), flat(check.expectedHex));
  });
}

test('the dump test: two\'s complement and offset values read back', () => {
  const check = PROFILE.tests.find((t) => t.kind === 'dumpParse');
  const parsed = localParseDumpMessage(PROFILE, check.inputHex);
  assert.ok(parsed.ok, parsed.error);
  for (const [id, value] of Object.entries(check.expectedValues)) assert.equal(parsed.values[id], value, id);
});

test('the transform: forward, backward, and the range deciding two\'s complement', () => {
  const twos = parameter('detune.signed14').encoding.transform;
  assert.equal(transformToWire(twos, -1), 16383);
  assert.equal(transformToWire(twos, 8191), 8191);
  // 16383 is +16383 on the positive branch and -1 on the negative one. Only the range can say.
  assert.equal(transformFromWire(twos, 16383, { min: -8192, max: 8191 }), -1);
  assert.equal(transformFromWire(twos, 16383), 16383, 'with no range, the first branch that fits');
  assert.equal(decodeParameterValue(parameter('detune.signed14'), [0x7f, 0x7f]), -1);

  const inverted = parameter('depth.inverted');
  assert.equal(decodeParameterValue(inverted, [0x3f]), 0);
  assert.equal(decodeParameterValue(inverted, [0x00]), 63);

  const scaled = parameter('level.scaled');
  assert.equal(decodeParameterValue(scaled, [63]), 50, 'a truncated scale reads back to the value that sent it');

  const encoded = encodeParameterValue(parameter('pan.offset'), -6);
  assert.deepEqual(encoded.bytes, [58]);
  assert.equal(encoded.displayed, '-6', 'the readout shows the value, not the wire number');
});

test('a CC sequence refuses a byte it cannot send', () => {
  const broken = {
    ...PROFILE,
    messageRecipes: [{ id: 'bad', kind: 'ccSequence', channel: 1, messages: [{ controller: 7, value: '$byte5' }] }],
    parameters: [{ id: 'x', type: 'integer', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, messageRecipe: 'bad' }],
  };
  const compiled = localCompileParameter(broken, { parameterId: 'x', value: 3 });
  assert.equal(compiled.ok, false);
  assert.match(compiled.error, /not a MIDI data byte/);
});
