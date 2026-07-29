// deviceDefinitions.test.js — the registry a script writes into.
//
// The unit under test is the half of "a panel that wires itself to a synth nobody wrote a profile
// for" that has nothing to do with scripting: given a declared parameter, do the right bytes go
// out, and given a declared layout, does an arriving dump decode to the right values.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defineParameter, defineDump, definedParameters, definedParameter, encodeParameter,
  dumpRequestBytes, decodeDump, clearDeviceDefinitions, deviceDefinitionCounts, hasDefinedDump,
} from '../src/CE_Application/scripting/deviceDefinitions.js';

const ROLE = 'mainSynth';

test.beforeEach(() => clearDeviceDefinitions());

/* ------------------------------------------------------------------------------- parameters */

test('a declared parameter enumerates the way a profile-backed one does', () => {
  const r = defineParameter(ROLE, 'cutoff', { name: 'Cutoff', group: 'Filter', min: 0, max: 127, cc: 74 });
  assert.equal(r.ok, true);

  const list = definedParameters(ROLE);
  assert.equal(list.length, 1);
  // The same keys a shipped descriptor carries, so a script cannot tell the two apart by shape…
  assert.deepEqual(Object.keys(list[0]).sort(),
    ['access', 'defined', 'group', 'id', 'max', 'min', 'name', 'type'].sort());
  // …only by `defined`, which is there for the script that needs to.
  assert.equal(list[0].defined, true);
  assert.equal(definedParameter(ROLE, 'cutoff').name, 'Cutoff');
  assert.equal(definedParameter(ROLE, 'nope'), null);
});

test('a parameter with no wire format is refused, and the message says what is missing', () => {
  const r = defineParameter(ROLE, 'cutoff', { name: 'Cutoff', min: 0, max: 127 });
  assert.equal(r.ok, false);
  assert.match(r.error, /no wire format/);
  assert.match(r.error, /cc = 74/);
  // Refused means not registered: a descriptor that enumerates and sends nothing is worse than an
  // error, because the panel looks built.
  assert.equal(deviceDefinitionCounts(ROLE).parameters, 0);
});

test('a CC parameter sends the CC, on its own channel, clamped to its own range', () => {
  defineParameter(ROLE, 'cutoff', { cc: 74, channel: 3, min: 0, max: 100 });
  assert.deepEqual(encodeParameter(ROLE, 'cutoff', 64).bytes, [0xb2, 74, 64]);
  // Clamped to the parameter's declared maximum, not to the encoding's.
  assert.deepEqual(encodeParameter(ROLE, 'cutoff', 900).bytes, [0xb2, 74, 100]);
});

test('an NRPN parameter sends the full four-message sequence', () => {
  defineParameter(ROLE, 'fine', { nrpn: { msb: 1, lsb: 9 }, encoding: 'u14', min: 0, max: 16383 });
  assert.deepEqual(encodeParameter(ROLE, 'fine', 300).bytes, [
    0xb0, 99, 1, 0xb0, 98, 9,
    0xb0, 6, 2, 0xb0, 38, 44,          // 300 = (2 << 7) | 44
  ]);
});

test('a boolean parameter uses the values it declared, not a guessed 0/127', () => {
  defineParameter(ROLE, 'sw', { type: 'boolean', cc: 65, trueValue: 127, falseValue: 0 });
  assert.deepEqual(encodeParameter(ROLE, 'sw', true).bytes, [0xb0, 65, 127]);
  assert.deepEqual(encodeParameter(ROLE, 'sw', false).bytes, [0xb0, 65, 0]);
});

test('a choice parameter sends the value its name maps to', () => {
  defineParameter(ROLE, 'wave', {
    type: 'choice', cc: 70,
    choices: [{ id: 'saw', value: 0 }, { id: 'square', value: 42 }],
  });
  assert.deepEqual(encodeParameter(ROLE, 'wave', 'square').bytes, [0xb0, 70, 42]);
});

test('encoding an undeclared parameter is not an error — it is not ours', () => {
  // The caller falls through to the shipped profile, so this must not report a failure.
  const r = encodeParameter(ROLE, 'unknown', 1);
  assert.equal(r.ok, false);
  assert.equal(r.error, '');
});

/* ------------------------------------------------------------ the sysex template and checksum */

test('a sysex template fills $value and wraps the message', () => {
  defineParameter(ROLE, 'p', { sysex: ['41', '10', '$value'], min: 0, max: 127 });
  assert.deepEqual(encodeParameter(ROLE, 'p', 9).bytes, [0xf0, 0x41, 0x10, 9, 0xf7]);
});

test('$checksumStart is what makes a Roland checksum right rather than nearly right', () => {
  // A real Roland DT1: F0 41 <dev> 42 12 <addr…> <data> <checksum> F7, and the checksum covers
  // the ADDRESS AND DATA only. Summing the manufacturer header too is the classic silent failure.
  defineParameter(ROLE, 'p', {
    sysex: ['41', '$deviceId', '42', '12', '$checksumStart', '03', '00', '01', '00', '$value', '$checksum'],
    variables: { deviceId: 0x10 },
    min: 0, max: 127,
  });
  const bytes = encodeParameter(ROLE, 'p', 0x20).bytes;
  const sum = (0x03 + 0x00 + 0x01 + 0x00 + 0x20) % 128;
  assert.deepEqual(bytes, [
    0xf0, 0x41, 0x10, 0x42, 0x12, 0x03, 0x00, 0x01, 0x00, 0x20, (128 - sum) % 128, 0xf7,
  ]);
});

test('a u14 value occupies two template bytes', () => {
  defineParameter(ROLE, 'p', { sysex: ['7d', '$value'], encoding: 'u14', min: 0, max: 16383 });
  assert.deepEqual(encodeParameter(ROLE, 'p', 300).bytes, [0xf0, 0x7d, 2, 44, 0xf7]);
});

/* ------------------------------------------------------------------------------------ dumps */

function declarePatchDump() {
  defineParameter(ROLE, 'cutoff', { cc: 74, min: 0, max: 127 });
  defineParameter(ROLE, 'reso', { cc: 71, min: 0, max: 127 });
  return defineDump(ROLE, 'patch', {
    request: 'f0 7d 00 f7',
    match: { prefix: ['f0', '7d', '01'], suffix: ['f7'] },
    offset: 3,
    size: 2,
    fields: [{ parameter: 'cutoff', offset: 0 }, { parameter: 'reso', offset: 1 }],
  });
}

test('a declared layout decodes an arriving dump into parameter values', () => {
  assert.equal(declarePatchDump().ok, true);
  assert.equal(hasDefinedDump(ROLE, 'patch'), true);
  assert.deepEqual(dumpRequestBytes(ROLE, 'patch'), [0xf0, 0x7d, 0x00, 0xf7]);

  const decoded = decodeDump(ROLE, 'F0 7D 01 40 0A F7');
  assert.equal(decoded.ok, true);
  assert.equal(decoded.kind, 'patch');
  assert.deepEqual(decoded.values, { cutoff: 0x40, reso: 0x0a });
});

test('a message that matches no declared layout reports that, rather than inventing values', () => {
  declarePatchDump();
  const decoded = decodeDump(ROLE, 'F0 7D 02 40 0A F7');
  assert.equal(decoded.ok, false);
  assert.ok(decoded.error);
});

test('with nothing declared, decoding returns null so the caller leaves the message alone', () => {
  // This is what keeps a panel that never called defineDump behaving exactly as it did before.
  assert.equal(decodeDump(ROLE, 'F0 7D 01 40 0A F7'), null);
});

test('a field naming an undefined parameter is refused, and says which', () => {
  defineParameter(ROLE, 'cutoff', { cc: 74 });
  const r = defineDump(ROLE, 'patch', { fields: [{ parameter: 'reso', offset: 0 }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /"reso" is not a defined parameter/);
  assert.match(r.error, /defineParameter\("reso"/);
  assert.equal(deviceDefinitionCounts(ROLE).dumps, 0);
});

test('a layout with no fields is refused', () => {
  const r = defineDump(ROLE, 'patch', { request: 'f0 7d 00 f7' });
  assert.equal(r.ok, false);
  assert.match(r.error, /no fields/);
});

test('a declared checksum is verified on the way in', () => {
  defineParameter(ROLE, 'a', { cc: 1, min: 0, max: 127 });
  defineDump(ROLE, 'patch', {
    match: { prefix: ['f0', '7d'], suffix: ['f7'] },
    offset: 2,
    fields: [{ parameter: 'a', offset: 0 }],
    checksum: { type: 'roland-7bit', fromOffset: 2, toOffset: 2, byteOffset: 3 },
  });
  const value = 0x20;
  const good = (128 - value) % 128;
  assert.equal(decodeDump(ROLE, `F0 7D ${value.toString(16)} ${good.toString(16).padStart(2, '0')} F7`).ok, true);
  const bad = decodeDump(ROLE, `F0 7D ${value.toString(16)} 00 F7`);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /checksum/i);
});

test('a text field decodes as text, through the codec the local engine already has', () => {
  defineParameter(ROLE, 'name', { type: 'text', encoding: 'u7', length: 4, sysex: ['7d', '$value'] });
  defineDump(ROLE, 'patch', {
    match: { prefix: ['f0', '7d'], suffix: ['f7'] },
    offset: 2,
    fields: [{ parameter: 'name', offset: 0 }],
  });
  // "Lead" followed by the F7 the suffix matches.
  const decoded = decodeDump(ROLE, 'F0 7D 4C 65 61 64 F7');
  assert.equal(decoded.ok, true);
  assert.equal(decoded.values.name, 'Lead');
});

/* ------------------------------------------------------------------------- roles and clearing */

test('definitions are per role, so two synths do not share a parameter table', () => {
  defineParameter(ROLE, 'cutoff', { cc: 74 });
  assert.equal(definedParameters('secondSynth').length, 0);
  assert.equal(definedParameters(ROLE).length, 1);
});

test('clearing drops everything, which is what makes onPanelBuild idempotent', () => {
  declarePatchDump();
  clearDeviceDefinitions();
  assert.deepEqual(deviceDefinitionCounts(ROLE), { parameters: 0, dumps: 0 });
  assert.equal(decodeDump(ROLE, 'F0 7D 01 40 0A F7'), null);
});
