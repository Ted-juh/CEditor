// deviceProfileCollection.test.js — when a collection of dump messages is complete.
//
// Most collections are a known number of messages (a Roland patch's blocks, a reface's header,
// common, operators and footer) and are complete at that count. A Yamaha Performance is as many
// part blocks as the instrument has parts, so its members name the dump that ends it, the Bulk
// Footer (`completion.endsWith`), and it is complete when that arrives, not at a count. The C++
// engine's runCollectionEndsWithTests checks the same probe.

import test from 'node:test';
import assert from 'node:assert/strict';

import { localCollectDumpMessages, localCompileParameter, localParseDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const block = (id, byte, size, endsWith) => ({
  id,
  kind: 'sysex',
  matcher: { prefix: ['F0', '7D', byte], suffix: ['F7'] },
  payload: { offset: 3, size },
  completion: { expectedMessages: 2, expectedBytes: 4 + size, collectionId: 'performance', ...(endsWith ? { endsWith } : {}) },
  mappings: size ? [{ parameter: 'level', offset: 0 }] : [],
});
const probe = (endsWith) => ({
  schemaVersion: 1,
  id: 'probe-endswith',
  parameters: [{ id: 'level', name: 'Level', type: 'integer', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { canRead: true } }],
  dumpDefinitions: [block('header', '01', 0, endsWith), block('part', '02', 1, endsWith), block('footer', '03', 0, endsWith)],
});

test('a collection that names its footer is complete when the footer arrives, however many came first', () => {
  const profile = probe('footer');
  const begun = localCollectDumpMessages(profile, ['F0 7D 01 F7', 'F0 7D 02 40 F7']);
  assert.equal(begun.complete, false, 'two messages are its expected count, but no footer yet');
  const whole = localCollectDumpMessages(profile, ['F0 7D 01 F7', 'F0 7D 02 40 F7', 'F0 7D 02 41 F7', 'F0 7D 03 F7']);
  assert.deepEqual([whole.complete, whole.expectedMessageCount, whole.values.level], [true, 4, 65]);
});

test('a collection without one is complete at its count, as before', () => {
  const profile = probe(null);
  assert.equal(localCollectDumpMessages(profile, ['F0 7D 01 F7', 'F0 7D 02 40 F7']).complete, true);
  assert.equal(localCollectDumpMessages(profile, ['F0 7D 01 F7']).complete, false);
});

// Waldorf's checksum is the data's sum masked to 7 bits, and `A checksum of 7Fh is always accepted
// as valid`: a dump may carry 7F instead. `checksum.alsoAccept` names such values; anything else is
// still refused. The C++ engine's runChecksumAlsoAcceptTests checks the same probe.
const summed = (alsoAccept) => ({
  schemaVersion: 1,
  id: 'probe-also-accept',
  parameters: [{ id: 'level', name: 'Level', type: 'integer', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { canRead: true } }],
  dumpDefinitions: [{
    id: 'sound',
    kind: 'sysex',
    matcher: { prefix: ['F0', '3E', '13'], suffix: ['F7'] },
    payload: { offset: 3, size: 2 },
    checksum: { type: 'sum-7bit', fromOffset: 3, toOffset: 4, byteOffset: 5, ...(alsoAccept ? { alsoAccept } : {}) },
    completion: { expectedBytes: 7 },
    mappings: [{ parameter: 'level', offset: 1 }],
  }],
});

// A dump of records (the Groove Synthesis 3rd Wave's edit buffer): each setting a record of its key
// and value, two bytes each, in whatever order the device sends; a mapping names the key it reads,
// and a scope the record of another key it must follow (the part being edited). The C++ engine's
// runDumpRecordTests checks the same probe.
const recorded = {
  schemaVersion: 1,
  id: 'probe-records',
  parameters: [
    { id: 'part', name: 'Part', type: 'integer', range: { min: 0, max: 15 }, encoding: { type: 'u14' }, access: { canRead: true } },
    { id: 'tempo', name: 'Tempo', type: 'integer', range: { min: 200, max: 2400 }, encoding: { type: 'u14' }, access: { canRead: true } },
    { id: 'cutoff', name: 'Cutoff', type: 'integer', range: { min: 0, max: 255 }, encoding: { type: 'u14' }, access: { canRead: true } },
    { id: 'absent', name: 'Absent', type: 'integer', range: { min: 0, max: 127 }, encoding: { type: 'u14' }, access: { canRead: true } },
  ],
  dumpDefinitions: [{
    id: 'editBuffer',
    kind: 'sysex',
    matcher: { prefix: ['F0', '00', '02', '4A', '01', '03'], suffix: ['F7'] },
    payload: { offset: 6, records: { size: 4, keyAt: 0, keyType: 'u14', valueAt: 2, valueType: 'u14' } },
    completion: { expectedMessages: 1 },
    mappings: [
      { parameter: 'tempo', record: 33 },
      { parameter: 'cutoff', record: 300, scope: { record: 0, value: 2 } },
      { parameter: 'absent', record: 400 },
    ],
  }],
};

test('a dump of records: each mapping read by its key, a scoped one only after its scope\'s record holds the value', () => {
  // Part 1's cutoff (300 = 02 2C) is 10, part 2's 200; tempo (33 = 00 21) is 1200 (09 30).
  const body = '00 00 00 01  02 2C 00 0A  00 21 09 30  00 00 00 02  02 2C 01 48';
  const parsed = localParseDumpMessage(recorded, `F0 00 02 4A 01 03 ${body} F7`);
  assert.ok(parsed.ok, parsed.error);
  assert.deepEqual(parsed.values, { tempo: 1200, cutoff: 200 }, 'part 2\'s cutoff, the tempo wherever it comes, nothing for a key the dump lacks');
  assert.equal(localParseDumpMessage(recorded, `F0 00 02 4A 01 03 ${body} 00 F7`).ok, false, 'a record cut short is refused');
  const unnamed = structuredClone(recorded);
  delete unnamed.dumpDefinitions[0].mappings[0].record;
  assert.equal(localParseDumpMessage(unnamed, `F0 00 02 4A 01 03 ${body} F7`).matchStatus, 'invalidDefinition', 'a mapping of a dump of records names its record');
});

test('a dump checksum may be a value the device always accepts, where the profile says so', () => {
  const read = (profile, hex) => localParseDumpMessage(profile, hex);
  assert.equal(read(summed(null), 'F0 3E 13 01 40 41 F7').values.level, 64, '01 + 40 = 41: the sum');
  assert.equal(read(summed(null), 'F0 3E 13 01 40 7F F7').ok, false, 'without alsoAccept, 7F is a wrong checksum');
  assert.equal(read(summed(['7F']), 'F0 3E 13 01 40 7F F7').values.level, 64, 'with it, 7F is taken');
  assert.equal(read(summed(['7F']), 'F0 3E 13 01 40 42 F7').ok, false, 'and any other wrong value is still refused');
});

// A signed value in 21 bits, two's complement, most significant byte first: the KRONOS's parameter
// change. Beside it a bit field read `signed`, as the KRONOS's dump keeps -99~+99 in a byte, and the
// same byte read without. The C++ engine's runS21MsbFirstTests checks the same probe.
test('s21-msb-lsb: two\'s complement over 21 bits, high byte first, sent and read back', () => {
  const s21 = (id, min, max) => ({ id, name: id, messageRecipe: 'pc', type: 'integer', range: { min, max }, encoding: { type: 's21-msb-lsb' }, access: { canWrite: true, canRead: true } });
  const field = (signed) => ({ type: 'bitfields', ...(signed ? { signed: true } : {}), parts: [{ at: 0, from: 0, bits: 7 }] });
  const probe = {
    schemaVersion: 1,
    id: 'probe-s21',
    variables: { channel: 1, deviceId: 48 },
    parameters: [s21('tune', -1200, 1200), s21('intensity', -64, 63), s21('level', 0, 127)],
    messageRecipes: [{ id: 'pc', kind: 'sysex', template: ['F0', '42', '$deviceId', '68', '43', '02', '00', '00', '05', '00', '$encodedValue', 'F7'] }],
    dumpDefinitions: [{
      id: 'probe',
      kind: 'sysex',
      matcher: { prefix: ['F0', '42', '30', '68', '4C'], suffix: ['F7'] },
      payload: { offset: 5, size: 4 },
      completion: { expectedBytes: 10 },
      mappings: [{ parameter: 'tune', offset: 0 }, { parameter: 'intensity', offset: 3, codec: field(true) }, { parameter: 'level', offset: 3, codec: field(false) }],
    }],
  };
  for (const [value, hex] of [[-50, '7F 7F 4E'], [300, '00 02 2C'], [0, '00 00 00'], [-1, '7F 7F 7F']]) {
    const compiled = localCompileParameter(probe, { parameterId: 'tune', value });
    assert.ok(compiled.ok, compiled.error);
    assert.equal(compiled.transaction.encodedValueHex, hex, String(value));
    assert.equal(compiled.transaction.hex, `F0 42 30 68 43 02 00 00 05 00 ${hex} F7`);
  }
  assert.deepEqual(localParseDumpMessage(probe, 'F0 42 30 68 4C 7F 7F 4E 4E F7').values, { tune: -50, intensity: -50, level: 78 });
});

// `when`: a field another byte selects (a KRONOS EXi slot's engine settings, read only when the
// slot's Algorithm Type holds that engine). The C++ engine's runDumpWhenTests checks the same probe.
test('when: a field is read only when the byte that selects it holds its value', () => {
  const u7 = (id) => ({ id, name: id, type: 'integer', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { canRead: true } });
  const probe = {
    schemaVersion: 1,
    id: 'probe-when',
    parameters: [u7('engine'), u7('alCutoff'), u7('cxDrawbar')],
    dumpDefinitions: [{
      id: 'probe',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '05'], suffix: ['F7'] },
      payload: { offset: 3, size: 2 },
      completion: { expectedBytes: 6 },
      mappings: [
        { parameter: 'engine', offset: 0 },
        { parameter: 'alCutoff', offset: 1, when: { offset: 0, value: 2 } },
        { parameter: 'cxDrawbar', offset: 1, when: { offset: 0, value: 3 } },
      ],
    }],
  };
  assert.deepEqual(localParseDumpMessage(probe, 'F0 7D 05 02 40 F7').values, { engine: 2, alCutoff: 64 });
  assert.deepEqual(localParseDumpMessage(probe, 'F0 7D 05 03 40 F7').values, { engine: 3, cxDrawbar: 64 });
  assert.deepEqual(localParseDumpMessage(probe, 'F0 7D 05 00 40 F7').values, { engine: 0 });
});
