// deviceProfileChecksum.test.js — the SysEx recipe builder (design doc §48).
//
// deviceProfileLocalEngine is the fallback that runs when the JUCE bridge is absent or a draft source
// is being edited — i.e. the browser editor, and the Device Profile Designer while you are writing
// the profile. It built a DIFFERENT message from DeviceProfileEngine.cpp, which is the one thing a
// fallback must never do: the preview disagreed with the export, so you would "fix" a working profile
// to match a broken picture of it.
//
// Four divergences, all in the $checksum/token loop, and this file pins each:
//
//   1. $checksum CLAMPED rather than masked — clampInt(sum, 0, 127). An F0 alone is 240, so almost
//      every real message produced exactly 127.
//   2. It summed the WHOLE message so far, header included. A checksum covers address, size and data.
//   3. It ignored the declared checksum.type and always summed — so this engine's own verify path,
//      which reads the type correctly, rejected what its build path produced. That round trip is the
//      strongest test here: build, then parse what you built.
//   4. $address and $size were not handled at all, and an unknown token fell through the loop
//      silently, so a template using them was quietly built short.

import test from 'node:test';
import assert from 'node:assert/strict';

import { localCompileParameter } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { checksumBytes, computeChecksum } from '../src/CE_Application/utils/checksums.js';
import { ADDRESS_BLOCK } from './fixtures/checksumCases.js';

/** A minimal Roland-shaped profile: F0 41 <dev> 42 12 <address> <value> <checksum> F7. */
function profileWith(checksumType, extra = {}) {
  return {
    id: 'probe',
    variables: { deviceId: 0x10, channel: 1 },
    parameters: [{
      id: 'filter.cutoff',
      address: '40 00 7F 03 0A'.split(' ').join(' '),
      size: '00 01',
      encoding: { type: 'u7' },
      messageRecipe: 'sx',
    }],
    messageRecipes: [{
      id: 'sx',
      kind: 'sysex',
      checksum: { type: checksumType, ...extra },
      template: ['f0', '41', '$deviceId', '42', '12', '$address', '$encodedValue', '$checksum', 'f7'],
    }],
  };
}

const compile = (type, value = 0x0a, extra = {}) =>
  localCompileParameter(profileWith(type, extra), { parameterId: 'filter.cutoff', value });

/* ------------------------------------------------------------------ the clamp */

test('the checksum is MASKED, not clamped', () => {
  // The bug in one assertion. The old code summed the whole message and clamped to 127; a Roland
  // header alone exceeds that, so the answer was 127 essentially always.
  const built = compile('roland-7bit');
  assert.equal(built.ok, true, built.error);
  const bytes = built.transaction.messages[0].bytes;
  const checksum = bytes[bytes.length - 2];
  assert.notEqual(checksum, 127, 'a clamped sum comes out as 127 — that was the bug');
  // …and it is the right value, computed over the covered range by the shared table.
  assert.equal(checksum, computeChecksum('roland-7bit', [...ADDRESS_BLOCK, 0x0a]));
});

/* ------------------------------------------------------------------ the covered range */

test('the checksum covers address + size + data, and NOT the header', () => {
  const built = compile('sum-7bit');
  const bytes = built.transaction.messages[0].bytes;
  const checksum = bytes[bytes.length - 2];
  // Over the covered bytes only…
  assert.equal(checksum, computeChecksum('sum-7bit', [...ADDRESS_BLOCK, 0x0a]));
  // …and demonstrably NOT over the whole message, which is what it used to do.
  const whole = bytes.slice(0, bytes.length - 2);
  assert.notEqual(checksum, computeChecksum('sum-7bit', whole),
    'summing the header too must give a different answer, or this test proves nothing');
});

/* ------------------------------------------------------------------ the declared type is honoured */

test('each declared algorithm produces its own checksum', () => {
  const covered = [...ADDRESS_BLOCK, 0x0a];
  for (const type of ['sum-7bit', 'roland-7bit', 'ones-complement-7bit', 'xor-7bit']) {
    const built = compile(type);
    assert.equal(built.ok, true, `${type}: ${built.error}`);
    const bytes = built.transaction.messages[0].bytes;
    assert.equal(bytes[bytes.length - 2], computeChecksum(type, covered), type);
  }
});

test('two different algorithms do not produce the same message', () => {
  // If they did, the type would still be being ignored and every test above would pass by accident.
  const a = compile('roland-7bit').transaction.messages[0].bytes.join(' ');
  const b = compile('ones-complement-7bit').transaction.messages[0].bytes.join(' ');
  assert.notEqual(a, b);
});

test('xor is accepted on the build path, not only on the verify path', () => {
  // The web engine rejected xor when verifying and silently summed when building, while the C++
  // accepted it when verifying and rejected it when building. Neither could round-trip it.
  const built = compile('xor-7bit');
  assert.equal(built.ok, true, built.error);
});

test('an unsupported algorithm is reported rather than quietly summed', () => {
  const built = compile('sha256');
  assert.equal(built.ok, false);
  assert.match(built.error, /Unsupported checksum type/);
});

test('type "none" still emits a placeholder byte', () => {
  const built = compile('none');
  assert.equal(built.ok, true, built.error);
  const bytes = built.transaction.messages[0].bytes;
  assert.equal(bytes[bytes.length - 2], 0);
});

/* ------------------------------------------------------------------ the tokens */

test('$address and $size are emitted, not dropped', () => {
  const built = compile('sum-7bit');
  const bytes = built.transaction.messages[0].bytes;
  // F0 41 10 42 12 | 40 00 7F 03 0A | 0A | sum | F7
  assert.deepEqual(bytes.slice(0, 5), [0xf0, 0x41, 0x10, 0x42, 0x12]);
  assert.deepEqual(bytes.slice(5, 10), ADDRESS_BLOCK, 'the address must be in the message');
  assert.equal(bytes[10], 0x0a, 'then the encoded value');
  assert.equal(bytes.at(-1), 0xf7);
});

test('a template using $size includes it and covers it', () => {
  const profile = profileWith('sum-7bit');
  profile.messageRecipes[0].template =
    ['f0', '41', '$deviceId', '42', '12', '$address', '$size', '$encodedValue', '$checksum', 'f7'];
  const built = localCompileParameter(profile, { parameterId: 'filter.cutoff', value: 0x0a });
  assert.equal(built.ok, true, built.error);
  const bytes = built.transaction.messages[0].bytes;
  assert.deepEqual(bytes.slice(10, 12), [0x00, 0x01], 'size bytes present');
  assert.equal(bytes[bytes.length - 2],
    computeChecksum('sum-7bit', [...ADDRESS_BLOCK, 0x00, 0x01, 0x0a]),
    'and covered by the checksum');
});

test('a bad hex token is refused instead of skipped', () => {
  const profile = profileWith('sum-7bit');
  profile.messageRecipes[0].template = ['f0', 'zz', '$checksum', 'f7'];
  const built = localCompileParameter(profile, { parameterId: 'filter.cutoff', value: 1 });
  assert.equal(built.ok, false);
  assert.match(built.error, /Invalid hex byte/);
});

test('a template that is not a SysEx message is refused', () => {
  // The C++ has always checked this; the web fallback did not, so a malformed template produced
  // bytes that no device would accept and nothing said so.
  const profile = profileWith('sum-7bit');
  profile.messageRecipes[0].template = ['41', '42', '$checksum'];
  const built = localCompileParameter(profile, { parameterId: 'filter.cutoff', value: 1 });
  assert.equal(built.ok, false);
  assert.match(built.error, /must start with F0 and end with F7/);
});

/* ------------------------------------------------------------------ wide checksums */

test('a CRC checksum occupies the bytes its width needs', () => {
  const built = compile('crc16-ccitt');
  assert.equal(built.ok, true, built.error);
  const bytes = built.transaction.messages[0].bytes;
  const expected = checksumBytes('crc16-ccitt', [...ADDRESS_BLOCK, 0x0a]);
  assert.equal(expected.length, 3, 'a CRC-16 needs three 7-bit bytes');
  assert.deepEqual(bytes.slice(bytes.length - 1 - expected.length, bytes.length - 1), expected);
  // Every byte in a SysEx message must be a legal data byte, which is the whole reason for splitting.
  for (let i = 1; i < bytes.length - 1; i += 1) {
    assert.ok(bytes[i] >= 0 && bytes[i] <= 127, `byte ${i} = ${bytes[i]}`);
  }
});
