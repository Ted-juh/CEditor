// checksums.test.js — the shared checksum table (design doc §48).
//
// The question that started this was "aren't there far more checksums than Roland/Yamaha?". There
// are, but the answer turned up something worse than a short list: there were TWO implementations of
// checksum arithmetic and they already disagreed. ce.midi.checksum knew roland / yamaha / sum / xor;
// the device profile engine knew roland-7bit / sum-7bit on its build path and those plus xor on its
// verify path, and hard-rejected the rest. So a script could compute a checksum no profile could
// express, one engine could build a message it would then reject, and the same name meant different
// things in different places.
//
// This file pins the single table both sides now read, and the two properties that matter:
//
//   1. The CRCs are RIGHT, not merely consistent — checked against the published catalogue values.
//   2. JS and C++ agree, via a fixture both assert.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKSUM_ALGORITHMS, CHECKSUM_IDS, checksumAlgorithm, checksumBytes, checksumNames,
  computeChecksum,
} from '../src/CE_Application/utils/checksums.js';
import {
  ADDRESS_BLOCK, ALIASES, ASCII_CHECK, CHECKSUM_CASES, PUBLISHED_CRC_CHECKS,
} from './fixtures/checksumCases.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { get as storeGet } from 'svelte/store';
import { MODULES, MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';

/* ------------------------------------------------------------------ the algorithms are correct */

test('the CRCs match the published catalogue check values', () => {
  // This is the only claim in the file that is an EXTERNAL fact rather than internal consistency: a
  // CRC-16 that both of our implementations get wrong in the same way would pass every other test
  // here. "123456789" is the catalogue's standard check string.
  for (const [id, expected] of Object.entries(PUBLISHED_CRC_CHECKS)) {
    assert.equal(computeChecksum(id, ASCII_CHECK), expected,
      `${id} must match the published check value 0x${expected.toString(16).toUpperCase()}`);
  }
});

test('every algorithm answers the cross-language fixture', () => {
  for (const [id, expected] of Object.entries(CHECKSUM_CASES)) {
    assert.equal(computeChecksum(id, ASCII_CHECK), expected.ascii, `${id} over the check string`);
    assert.equal(computeChecksum(id, ADDRESS_BLOCK), expected.block, `${id} over the address block`);
    assert.equal(checksumAlgorithm(id).width, expected.width, `${id} width`);
    assert.deepEqual(checksumBytes(id, ADDRESS_BLOCK), expected.bytes, `${id} packed bytes`);
  }
  // …and the fixture covers the whole table, so a new algorithm cannot be added without pinning it.
  assert.deepEqual(Object.keys(CHECKSUM_CASES).sort(), [...CHECKSUM_IDS].sort());
});

test('the two seven-bit complements differ by exactly one', () => {
  // The reason both exist, and the reason they are easy to confuse: a device expecting one and given
  // the other is off by a single bit's worth, which no amount of squinting at hex reveals.
  for (const bytes of [ADDRESS_BLOCK, ASCII_CHECK, [0], [127, 127]]) {
    const twos = computeChecksum('roland-7bit', bytes);
    const ones = computeChecksum('ones-complement-7bit', bytes);
    assert.equal(ones, (twos - 1 + 128) % 128, `over ${bytes.join(' ')}`);
  }
});

test('the two CRC-16 variants really are different algorithms', () => {
  // "crc16" alone is not a specification. If these ever agreed, one of them would be wrong.
  assert.notEqual(computeChecksum('crc16-ccitt', ASCII_CHECK),
    computeChecksum('crc16-modbus', ASCII_CHECK));
});

test('the offset constant is the caller\'s, not ours', () => {
  const base = computeChecksum('sum-7bit', ADDRESS_BLOCK);
  assert.equal(computeChecksum('offset-7bit', ADDRESS_BLOCK, { offset: 0 }), base);
  assert.equal(computeChecksum('offset-7bit', ADDRESS_BLOCK, { offset: 1 }), (base + 1) & 0x7f);
  // Defaulting to 0xA5 is a convenience, not a claim about any particular synth.
  assert.equal(computeChecksum('offset-7bit', ADDRESS_BLOCK),
    (base + 0xa5) & 0x7f);
});

test('every seven-bit algorithm returns a legal SysEx data byte', () => {
  for (const algorithm of CHECKSUM_ALGORITHMS.filter((a) => a.width === 1)) {
    for (const bytes of [ASCII_CHECK, ADDRESS_BLOCK, [], [127, 127, 127, 127]]) {
      const value = computeChecksum(algorithm.id, bytes);
      assert.ok(value >= 0 && value <= 0x7f, `${algorithm.id} returned ${value}`);
    }
  }
});

test('a wide checksum packs into seven-bit bytes without losing anything', () => {
  for (const algorithm of CHECKSUM_ALGORITHMS.filter((a) => a.width > 1)) {
    const bytes = checksumBytes(algorithm.id, ASCII_CHECK);
    assert.equal(bytes.length, algorithm.width);
    for (const byte of bytes) assert.ok(byte >= 0 && byte <= 0x7f, `${algorithm.id} byte ${byte}`);
    // Reassembling must give the value back — otherwise the split is lossy and a CRC sent this way
    // could not be checked at the other end.
    const rebuilt = bytes.reduce((acc, b) => acc * 128 + b, 0);
    assert.equal(rebuilt, computeChecksum(algorithm.id, ASCII_CHECK), `${algorithm.id} round trip`);
  }
});

/* ------------------------------------------------------------------ names */

test('every spelling already in use still resolves to the same algorithm', () => {
  // Existing device profiles say "roland-7bit" and existing scripts say "roland". Neither may break,
  // which is why the table carries aliases rather than being renamed.
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    assert.equal(checksumAlgorithm(alias)?.id, canonical, `${alias} -> ${canonical}`);
    assert.equal(computeChecksum(alias, ADDRESS_BLOCK), computeChecksum(canonical, ADDRESS_BLOCK));
  }
});

test('names resolve case-insensitively and ignore surrounding space', () => {
  assert.equal(checksumAlgorithm('  ROLAND  ')?.id, 'roland-7bit');
  assert.equal(checksumAlgorithm('CRC16-Modbus')?.id, 'crc16-modbus');
});

test('an unknown name returns nothing rather than a different algorithm\'s answer', () => {
  assert.equal(computeChecksum('nope', ADDRESS_BLOCK), undefined);
  assert.equal(checksumAlgorithm('nope'), null);
  assert.equal(checksumBytes('nope', ADDRESS_BLOCK), undefined);
  // The old behaviour: anything unrecognised silently fell through to Roland. That made a typo
  // indistinguishable from a working call, which is the one thing a checksum must never be.
  assert.notEqual(computeChecksum('nope', ADDRESS_BLOCK), computeChecksum('roland', ADDRESS_BLOCK));
});

test('checksumNames lists every accepted spelling', () => {
  const names = checksumNames();
  for (const id of CHECKSUM_IDS) assert.ok(names.includes(id), `${id} missing`);
  for (const alias of Object.keys(ALIASES)) assert.ok(names.includes(alias), `${alias} missing`);
});

/* ------------------------------------------------------------------ through ce.midi.checksum */

function withMidi(fn) {
  const control = createControl('Label', { name: 'L' });
  panels.set([{
    id: 'p', name: 'P', controls: [control],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('', 'checksum-script')); } finally { panels.set([]); }
}

const traced = () => storeGet(scriptTrace).map((t) => t.message).join('\n');

test('ce.midi.checksum reaches every algorithm in the table', () => {
  withMidi((api) => {
    for (const [id, expected] of Object.entries(CHECKSUM_CASES)) {
      assert.equal(api.checksum(id, ADDRESS_BLOCK), expected.block, id);
    }
  });
});

test('ce.midi.checksum keeps its old answers for the four names it always had', () => {
  // The point of the shared table is that it changed nothing for existing scripts.
  withMidi((api) => {
    assert.equal(api.checksum('roland', ADDRESS_BLOCK), 52);
    assert.equal(api.checksum('yamaha', ADDRESS_BLOCK), 52);
    assert.equal(api.checksum('sum', ADDRESS_BLOCK), 76);
    assert.equal(api.checksum('xor', ADDRESS_BLOCK), 54);
    // The one-argument form still means Roland.
    assert.equal(api.checksum(ADDRESS_BLOCK), 52);
  });
});

test('ce.midi.checksum reports an unknown algorithm instead of guessing', () => {
  withMidi((api) => {
    clearScriptTrace();
    assert.equal(api.checksum('crc17', ADDRESS_BLOCK), undefined);
    assert.match(traced(), /no such algorithm/);
    // The message has to say what WOULD have worked, or it just relocates the guesswork.
    assert.match(traced(), /crc16-ccitt/);
  });
});

test('ce.midi.checksum passes the offset constant through', () => {
  withMidi((api) => {
    assert.equal(api.checksum('offset-7bit', ADDRESS_BLOCK, { offset: 0 }),
      api.checksum('sum', ADDRESS_BLOCK));
  });
});

test('the contract lists exactly the algorithms the table has', () => {
  // The page renders these as the accepted values, so a name in the contract that the table lacks
  // would be documentation for something that reports an error.
  const declared = MEMBER_BY_ID.checksum.params.find((p) => p.name === 'type').values;
  assert.deepEqual([...declared].sort(), [...CHECKSUM_IDS].sort());
});

test('a wide checksum is usable with to7bit, which is what the summary tells you to do', () => {
  withMidi((api) => {
    const value = api.checksum('crc16-ccitt', ADDRESS_BLOCK);
    assert.ok(value > 0x7f === false || value >= 0, 'sanity');
    // The documented route: compute, then split. Asserted through the API's own encoder rather than
    // by restating the arithmetic.
    const split = api.to7bit(value, 3, 'msb');
    assert.deepEqual(split, checksumBytes('crc16-ccitt', ADDRESS_BLOCK));
    assert.equal(api.from7bit(split, 'msb'), value);
  });
});
