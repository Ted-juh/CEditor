// deviceDefinitions.test.js — the registry a script writes into.
//
// The unit under test is the half of "a panel that wires itself to a synth nobody wrote a profile
// for" that has nothing to do with scripting: given a declared parameter, do the right bytes go
// out, and given a declared layout, does an arriving dump decode to the right values.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  defineParameter, defineDump, definedParameters, definedParameter, encodeParameter,
  dumpRequestBytes, decodeDump, buildDump, clearDeviceDefinitions, deviceDefinitionCounts, hasDefinedDump,
} from '../src/CE_Application/scripting/deviceDefinitions.js';
import { checksumNames } from '../src/CE_Application/utils/checksums.js';

const ROLE = 'mainSynth';

/** The cases CE/tests/ScriptRuntimeTests.cpp runs through the player's codec as well. */
const CASES = JSON.parse(readFileSync(new URL('./fixtures/deviceCodecCases.json', import.meta.url), 'utf8'));
const hexOf = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

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

test('a Roland template without $checksumStart is defined, with a warning that says why it will fail', () => {
  // The marker is documented rather than inferred, so the definition stands; but without it the
  // checksum covers the header too, and the synth ignores every message. This says so up front.
  const warning = 'defineParameter("lvl"): this is a Roland template (41 after F0) with $checksum and no '
    + '$checksumStart, so the checksum includes the header, and a Roland synth ignores the message. '
    + 'Put $checksumStart where the address begins.';
  const missing = defineParameter(ROLE, 'lvl', {
    sysex: ['F0', '41', '10', '42', '12', '40', '01', '33', '$value', '$checksum', 'F7'], min: 0, max: 127,
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.warning, warning);
  // The bytes it will send, to show the warning is about something real: 27 where 4C is right.
  assert.deepEqual(encodeParameter(ROLE, 'lvl', 64).bytes.slice(-2), [0x27, 0xf7]);

  // With F0 left off, 41 is still the first byte.
  assert.equal(defineParameter(ROLE, 'lvl', { sysex: ['41', '10', '42', '12', '$value', '$checksum'] }).warning, warning);

  const marked = defineParameter(ROLE, 'lvl', {
    sysex: ['F0', '41', '10', '42', '12', '$checksumStart', '40', '01', '33', '$value', '$checksum', 'F7'],
    min: 0, max: 127,
  });
  assert.equal(marked.warning, undefined, 'with the marker there is nothing to say');
  assert.deepEqual(encodeParameter(ROLE, 'lvl', 64).bytes.slice(-2), [0x4c, 0xf7]);

  for (const quiet of [
    { sysex: ['F0', '43', '10', '$value', '$checksum', 'F7'] },   // not Roland
    { sysex: ['F0', '41', '10', '42', '12', '$value', 'F7'] },    // no checksum asked for
  ]) {
    assert.equal(defineParameter(ROLE, 'q', quiet).warning, undefined, JSON.stringify(quiet.sysex));
  }
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

/* ----------------------------------------------- the cases the player runs too, word for word */
// fixtures/deviceCodecCases.json is read by ScriptRuntimeTests.cpp as well, so every case below
// is a promise that the exported plug-in defines, sends, refuses and decodes exactly the same.

test('the shared cases list the checksums ce.midi.checksum does', () => {
  assert.equal(CASES.checksumNames, checksumNames().join(', '));
});

for (const c of CASES.parameters) {
  test(`parameter, in both runtimes: ${c.case}`, () => {
    const r = defineParameter(ROLE, 'p', c.spec);
    if (c.error) {
      assert.equal(r.ok, false, 'it was defined');
      assert.equal(r.error, c.error);
      assert.equal(deviceDefinitionCounts(ROLE).parameters, 0, 'refused means not registered');
      return;
    }
    assert.equal(r.ok, true, r.error);
    assert.equal(r.warning, c.warning);
    if (c.max !== undefined) assert.equal(r.parameter.max, c.max);
    for (const w of c.writes ?? []) {
      const encoded = encodeParameter(ROLE, 'p', w.value);
      if (w.error) {
        assert.equal(encoded.ok, false, `${JSON.stringify(w.value)} was sent`);
        // deviceValueWrite in panelRuntime.js puts the call in front, as the player does.
        assert.equal(`deviceWrite("p"): ${encoded.error}`, w.error);
      } else {
        assert.equal(encoded.ok, true, encoded.error);
        assert.equal(hexOf(encoded.bytes), w.bytes, `writing ${JSON.stringify(w.value)}`);
      }
    }
  });
}

for (const c of CASES.dumps) {
  test(`dump, in both runtimes: ${c.case}`, () => {
    for (const [id, spec] of Object.entries(c.parameters ?? { cutoff: { cc: 74 } })) {
      assert.equal(defineParameter(ROLE, id, spec).ok, true);
    }
    const r = defineDump(ROLE, 'd', c.spec);
    if (c.error) {
      assert.equal(r.ok, false, 'it was defined');
      assert.equal(r.error, c.error);
      assert.equal(hasDefinedDump(ROLE, 'd'), false, 'refused means not registered');
      return;
    }
    assert.equal(r.ok, true, r.error);
    if (c.request) assert.equal(hexOf(dumpRequestBytes(ROLE, 'd')), c.request);
    for (const d of c.decodes ?? []) {
      const decoded = decodeDump(ROLE, d.hex);
      if (d.values === null) {
        assert.equal(decoded.ok, false, `${d.hex} decoded to ${JSON.stringify(decoded.values)}`);
      } else {
        assert.equal(decoded.ok, true, `${d.hex}: ${decoded.error}`);
        assert.deepEqual(decoded.values, d.values);
      }
    }
  });
}

/* ----------------------------------------------------------- what a JSON fixture cannot say */

test('a Lua table with a hole is read the way the player reads it', () => {
  // wasmoon hands { 0xF0, nil, 0x41 } over as { 1: 240, 3: 65 }. The player's Lua bridge counts two
  // keys and reads t[1] and t[2], so it sees F0 and nothing, and refuses at position 1.
  const r = defineParameter(ROLE, 'p', { sysex: { 1: 0xf0, 3: 0x41 } });
  assert.equal(r.error, 'defineParameter("p"): in the sysex template, nothing at position 1 is not a byte, '
    + 'so the parameter was not defined.');
  // A whole sequence that arrived as an object is read in order.
  assert.equal(defineParameter(ROLE, 'q', { sysex: { 1: 0x7d, 2: '$value' } }).ok, true);
  assert.deepEqual(encodeParameter(ROLE, 'q', 3).bytes, [0xf0, 0x7d, 3, 0xf7]);
});

test('a typed array is a list of bytes', () => {
  assert.equal(defineParameter(ROLE, 'p', { cc: 1 }).ok, true);
  const r = defineDump(ROLE, 'd', {
    request: new Uint8Array([0xf0, 0x7d, 0x00, 0xf7]),
    match: { prefix: ['f0', '7d'] },
    fields: [{ parameter: 'p', offset: 2 }],
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(dumpRequestBytes(ROLE, 'd'), [0xf0, 0x7d, 0x00, 0xf7]);
});

test('buildDump puts a checksum named as text where decoding looks for it', () => {
  // The name alone used to be dropped, so buildDump sent a dump with no checksum at all.
  defineParameter(ROLE, 'a', { cc: 1 });
  defineParameter(ROLE, 'b', { cc: 2 });
  assert.equal(defineDump(ROLE, 'd', {
    match: { prefix: ['F0', '7D', '12'], suffix: ['F7'] },
    offset: 3, size: 2, checksum: 'roland-7bit',
    fields: [{ parameter: 'a', offset: 0 }, { parameter: 'b', offset: 1 }],
  }).ok, true);
  const built = buildDump(ROLE, 'd', { a: 0x10, b: 0x40 });
  assert.equal(built.ok, true, built.error);
  assert.equal(built.hex, 'F0 7D 12 10 40 30 F7');      // (128 - 0x50) % 128 = 0x30
  assert.equal(built.checksumStatus, 'ok');
  assert.deepEqual(decodeDump(ROLE, built.hex).values, { a: 0x10, b: 0x40 });

  // …and one wider than a byte takes its full width there too.
  clearDeviceDefinitions();
  defineParameter(ROLE, 'a', { cc: 1 });
  defineDump(ROLE, 'd', {
    match: { prefix: ['F0', '7D', '12'], suffix: ['F7'] }, offset: 3, size: 5, checksum: 'crc16',
    fields: [{ parameter: 'a', offset: 0 }],
  });
  const wide = buildDump(ROLE, 'd', { a: 0x40 });
  assert.equal(wide.hex, 'F0 7D 12 40 00 00 00 00 00 00 64 F7');   // crc16 of 40 00 00 00 00, in three bytes
  assert.equal(decodeDump(ROLE, wide.hex).ok, true, wide.hex);
});

test('a definition made with text choices reports the range it really has', () => {
  const r = defineParameter(ROLE, 'f', { type: 'choice', cc: 70, choices: ['LP', 'HP', 'BP'] });
  assert.equal(r.parameter.min, 0);
  assert.equal(r.parameter.max, 2);
  // With a max given, that max is kept.
  assert.equal(defineParameter(ROLE, 'g', { type: 'choice', cc: 70, max: 10, choices: ['LP', 'HP'] }).parameter.max, 10);
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
