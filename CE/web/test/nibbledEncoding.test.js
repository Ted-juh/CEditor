// nibbledEncoding.test.js — the encoder that 622 of the GAIA's parameters need.
//
// A Roland DT1 carries a value as NIBBLES: four bits per byte, most significant first, so a value up
// to 255 goes as two bytes and one up to 65535 as four. The GAIA uses it for its whole envelope, LFO
// and filter section.
//
// Neither engine could do it, for two different reasons, and both were silent:
//
//   The profile declared {type: "nibbles", count: N} — the DPD authoring schema's vocabulary.
//   DeviceProfileEngine.cpp matches the string "nibbled" and reads a property called "nibbles", so
//   every one of those parameters fell past its branches to
//   fail("Unsupported numeric encoder: nibbles") and never sent. Its sibling profile,
//   roland-sh-201, already used the runtime words; the GAIA was the outlier.
//
//   deviceProfileLocalEngine.js had no nibbled branch AT ALL. Every nibbled parameter fell through
//   to the u7 default and became one byte where the device expects two, three or four — a short,
//   malformed DT1, built quietly, for most of the instrument.
//
// So the profile now speaks the runtime vocabulary and the JS engine implements it. What is pinned
// here is the encoding itself: the split, the order, the byte counts, and the refusal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  decodeParameterValue,
  localCompileParameter,
  parameterValueWidth,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { readText } from './support/readText.mjs';

const GAIA = JSON.parse(readText(fileURLToPath(
  new URL('../../profiles/test/roland-gaia-sh01.ceditor-device.json', import.meta.url))));

const bytes = (hex) => hex.trim().split(/\s+/);
/** The value bytes of a DT1: after the 7-byte header and 4-byte address, before checksum and F7. */
const valueBytes = (hex) => bytes(hex).slice(11, -2);

const twoNibble = GAIA.parameters.find((p) => p.encoding?.nibbles === 2);
const fourNibble = GAIA.parameters.find((p) => p.encoding?.nibbles === 4);

test('the profile speaks the vocabulary both engines read', () => {
  // C++ matches "nibbled" and calls propInt(encoding, "nibbles"). Anything else is refused at send
  // time with no validation at load, so the mismatch only shows when a knob is turned.
  const nibbled = GAIA.parameters.filter((p) => p.encoding?.type === 'nibbled');
  assert.equal(nibbled.length, 622);
  for (const parameter of nibbled) {
    assert.ok([2, 3, 4].includes(parameter.encoding.nibbles),
      `${parameter.id}: nibble count must be in the property C++ reads`);
  }
  assert.equal(GAIA.parameters.filter((p) => p.encoding?.type === 'nibbles').length, 0,
    'the DPD authoring vocabulary is back in a runtime profile');
});

test('a value splits into nibbles, most significant first', () => {
  // 4095 is 0x0FFF: across four nibbles that is 0, 15, 15, 15. Least-significant-first would send
  // 15, 15, 15, 0 — a plausible-looking message that sets the wrong value.
  const hex = localCompileParameter(GAIA, { parameterId: fourNibble.id, value: 4095 }).hex;
  assert.deepEqual(valueBytes(hex), ['00', '0F', '0F', '0F']);

  assert.deepEqual(valueBytes(localCompileParameter(GAIA, { parameterId: twoNibble.id, value: 0 }).hex), ['00', '00']);
  assert.deepEqual(valueBytes(localCompileParameter(GAIA, { parameterId: twoNibble.id, value: 255 }).hex), ['0F', '0F']);
  assert.deepEqual(valueBytes(localCompileParameter(GAIA, { parameterId: twoNibble.id, value: 26 }).hex), ['01', '0A']);
});

test('every nibble is a nibble', () => {
  // The whole point of the encoding: a DT1 body cannot carry a byte above 0x7F, and nibbles keep
  // every byte at 0x0F or less. One byte over and the message is rejected by the instrument.
  for (const value of [0, 1, 17, 200, 255]) {
    for (const byte of valueBytes(localCompileParameter(GAIA, { parameterId: twoNibble.id, value }).hex)) {
      assert.ok(parseInt(byte, 16) <= 0x0f, `${byte} is not a nibble`);
    }
  }
});

test('the message grows with the nibble count', () => {
  // The failure the old fallthrough produced: every one of these was 14 bytes, because the value was
  // always one u7 byte however many the profile asked for.
  const lengthFor = (nibbles) => {
    const parameter = GAIA.parameters.find((p) => p.encoding?.nibbles === nibbles);
    return bytes(localCompileParameter(GAIA, { parameterId: parameter.id, value: 1 }).hex).length;
  };
  assert.equal(lengthFor(2), 15);
  assert.equal(lengthFor(3), 16);
  assert.equal(lengthFor(4), 17);
});

test('a value too large for its nibbles is refused, not wrapped', () => {
  // C++ fails rather than truncating, and so does this: a silently wrapped parameter sends a
  // confident wrong number, which is worse than sending nothing.
  const result = localCompileParameter(GAIA, { parameterId: twoNibble.id, value: 999 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Nibbled value outside 0-255/);
  assert.match(result.error, new RegExp(twoNibble.id.replace('.', '\\.')), 'say which parameter');
});

test('an absent nibble count means two, and an impossible one is refused', () => {
  // Both straight from DeviceProfileEngine.cpp: propInt(encoding, "nibbles", 2) for the default, and
  // an explicit fail outside 1-8. Worth pinning because the first version of this branch clamped
  // instead, which turned an absent count into ONE nibble here and two in C++ — a preview
  // disagreeing with an export, silently, which is the exact failure this whole encoder exists to
  // stop. No shipped profile omits the count today; the point is that one may.
  const bare = { ...GAIA, parameters: [{ ...twoNibble, id: 'bare', encoding: { type: 'nibbled' } }] };
  assert.deepEqual(valueBytes(localCompileParameter(bare, { parameterId: 'bare', value: 255 }).hex), ['0F', '0F']);

  const tooWide = { ...GAIA, parameters: [{ ...twoNibble, id: 'wide', encoding: { type: 'nibbled', nibbles: 9 } }] };
  const result = localCompileParameter(tooWide, { parameterId: 'wide', value: 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /requires 1-8 nibbles/);
});

test('every parameter in the profile compiles', () => {
  // The blunt one. Before this, 622 of them could not be built on the desktop build at all.
  const failures = [];
  for (const parameter of GAIA.parameters) {
    const result = localCompileParameter(GAIA, { parameterId: parameter.id, value: 1 });
    if (!result?.ok) failures.push(`${parameter.id}: ${result?.error}`);
  }
  assert.deepEqual(failures, []);
  assert.equal(GAIA.parameters.length, 793);
});

test('the decoder reads back what each encoder writes', () => {
  // The inverse direction, added when the panel learned to FOLLOW the instrument rather than only
  // drive it. It mirrors the dump decoder in DeviceProfileEngine.cpp, so the branches the GAIA never
  // exercises — u8, s7, lsb-first 14-bit — are checked here rather than left to a device that has
  // one. Width comes first because everything downstream slices by it: read a four-nibble value as
  // one byte and you get its top nibble, which is a plausible number and the wrong one.
  const cases = [
    [{ type: 'u7' }, 1, [0x5a], 90],
    [{ type: 'u8' }, 1, [0xc8], 200],
    [{ type: 's7' }, 1, [0x00], -64],
    [{ type: 's7', signedOffset: 64 }, 1, [0x7f], 63],
    [{ type: 'u14-msb-lsb' }, 2, [0x01, 0x00], 128],
    [{ type: 'u14-lsb-msb' }, 2, [0x00, 0x01], 128],
    [{ type: 'nibbled', nibbles: 2 }, 2, [0x0f, 0x0f], 255],
    [{ type: 'nibbled', nibbles: 4 }, 4, [0x00, 0x0f, 0x0f, 0x0f], 4095],
    [{ type: 'nibbled' }, 2, [0x01, 0x0a], 26],
    [{ type: 'boolean-u7' }, 1, [127], 1],
  ];
  for (const [encoding, width, bytes, expected] of cases) {
    const parameter = { id: 'p', encoding };
    assert.equal(parameterValueWidth(parameter), width, `${encoding.type}: wrong width`);
    assert.equal(decodeParameterValue(parameter, bytes), expected, `${encoding.type}: wrong value`);
  }

  assert.equal(decodeParameterValue({ encoding: { type: 'nibbled', nibbles: 4 } }, [0x00, 0x0f]), null,
    'too few bytes decodes to nothing rather than to a partial value');
  assert.equal(decodeParameterValue({ encoding: { type: 'nibbled', nibbles: 9 } }, [1, 2]), null,
    'an encoder the sender would refuse does not silently decode');
});

test('the checksum covers the nibbles that are actually sent', () => {
  // Roland's 7-bit checksum is over address and data, and the data is now longer. A checksum
  // computed over the old one-byte value would be wrong on every nibbled parameter.
  const hex = localCompileParameter(GAIA, { parameterId: twoNibble.id, value: 26 }).hex;
  const all = bytes(hex).map((b) => parseInt(b, 16));
  const covered = all.slice(7, -2);                     // address + value, no header, no checksum, no F7
  const checksum = all.at(-2);
  const sum = covered.reduce((n, b) => n + b, 0);
  assert.equal(checksum, (128 - (sum % 128)) % 128, 'the checksum does not match the bytes it covers');
});
