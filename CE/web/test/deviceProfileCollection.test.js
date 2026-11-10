// deviceProfileCollection.test.js — when a collection of dump messages is complete.
//
// Most collections are a known number of messages (a Roland patch's blocks, a reface's header,
// common, operators and footer) and are complete at that count. A Yamaha Performance is as many
// part blocks as the instrument has parts, so its members name the dump that ends it, the Bulk
// Footer (`completion.endsWith`), and it is complete when that arrives, not at a count. The C++
// engine's runCollectionEndsWithTests checks the same probe.

import test from 'node:test';
import assert from 'node:assert/strict';

import { localCollectDumpMessages, localParseDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

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

test('a dump checksum may be a value the device always accepts, where the profile says so', () => {
  const read = (profile, hex) => localParseDumpMessage(profile, hex);
  assert.equal(read(summed(null), 'F0 3E 13 01 40 41 F7').values.level, 64, '01 + 40 = 41: the sum');
  assert.equal(read(summed(null), 'F0 3E 13 01 40 7F F7').ok, false, 'without alsoAccept, 7F is a wrong checksum');
  assert.equal(read(summed(['7F']), 'F0 3E 13 01 40 7F F7').values.level, 64, 'with it, 7F is taken');
  assert.equal(read(summed(['7F']), 'F0 3E 13 01 40 42 F7').ok, false, 'and any other wrong value is still refused');
});
