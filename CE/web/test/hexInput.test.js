// The hex field used to accept exactly 6 or 8 hex characters and silently
// revert everything else — so `#abc`, the shorthand every CSS author types,
// looked like a dead keystroke. These tests pin every form the field now
// accepts, and pin that a refusal comes with a reason attached.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseColourInput, formatColourInput } from '../src/CE_Application/utils/hexInput.js';

test('3-digit shorthand expands, with or without the hash', () => {
  assert.deepEqual(parseColourInput('#abc'), { ok: true, color: 'AABBCC', alpha: 1 });
  assert.deepEqual(parseColourInput('abc'), { ok: true, color: 'AABBCC', alpha: 1 });
  assert.deepEqual(parseColourInput('  #ABC  '), { ok: true, color: 'AABBCC', alpha: 1 });
});

test('6-digit is taken as-is and uppercased', () => {
  assert.deepEqual(parseColourInput('#aabbcc'), { ok: true, color: 'AABBCC', alpha: 1 });
  assert.deepEqual(parseColourInput('4a90d9'), { ok: true, color: '4A90D9', alpha: 1 });
});

test('8-digit is AARRGGBB — alpha first, as the app stores it', () => {
  const parsed = parseColourInput('#80AABBCC');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.color, 'AABBCC');
  assert.ok(Math.abs(parsed.alpha - 128 / 255) < 0.001);
  assert.deepEqual(parseColourInput('FF333333'), { ok: true, color: '333333', alpha: 1 });
});

test('4-digit shorthand carries the alpha in the same place the 8-digit does', () => {
  const parsed = parseColourInput('#8abc');
  assert.equal(parsed.color, 'AABBCC');
  assert.ok(Math.abs(parsed.alpha - 0x88 / 255) < 0.001);
});

test('rgb() and rgba() are accepted, comma or space separated', () => {
  assert.deepEqual(parseColourInput('rgb(24, 32, 40)'), { ok: true, color: '182028', alpha: 1 });
  assert.deepEqual(parseColourInput('RGB(24 32 40)'), { ok: true, color: '182028', alpha: 1 });

  const half = parseColourInput('rgba(255 0 0 / 50%)');
  assert.equal(half.color, 'FF0000');
  assert.ok(Math.abs(half.alpha - 0.5) < 0.001);

  const frac = parseColourInput('rgba(0,0,255,0.25)');
  assert.equal(frac.color, '0000FF');
  assert.ok(Math.abs(frac.alpha - 0.25) < 0.001);
});

test('out-of-range rgb channels clamp rather than wrapping', () => {
  assert.deepEqual(parseColourInput('rgb(300, -20, 40)'), { ok: true, color: 'FF0028', alpha: 1 });
});

test('a refusal says what is wrong — it never silently reverts', () => {
  const empty = parseColourInput('   ');
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /Enter a colour/);

  const nonsense = parseColourInput('#zzz');
  assert.equal(nonsense.ok, false);
  assert.match(nonsense.reason, /not a hex digit/);
  assert.match(nonsense.reason, /z/, 'the offending characters are quoted back');

  const wrongLength = parseColourInput('#12345');
  assert.equal(wrongLength.ok, false);
  assert.match(wrongLength.reason, /5 hex digits/);
  assert.match(wrongLength.reason, /3 \(#ABC\), 4 \(#8ABC\), 6 \(#AABBCC\) or 8/, 'it lists what would work');

  const badChannels = parseColourInput('rgb(1, 2)');
  assert.equal(badChannels.ok, false);
  assert.match(badChannels.reason, /three channels/);

  const badNumber = parseColourInput('rgb(a, 2, 3)');
  assert.equal(badNumber.ok, false);
  assert.match(badNumber.reason, /not a number/);
});

test('every refusal carries a reason and no colour', () => {
  for (const input of ['', '#', 'ff', '#1234567', 'rgb()', 'rgb(1 2 3 4 5)']) {
    const parsed = parseColourInput(input);
    assert.equal(parsed.ok, false, `${input} should be refused`);
    assert.equal(typeof parsed.reason, 'string');
    assert.ok(parsed.reason.length > 0, `${input} refused with an empty reason`);
    assert.equal(parsed.color, undefined);
  }
});

test('alpha is clamped into 0-1 whatever arrives', () => {
  assert.equal(parseColourInput('rgba(0,0,0,5)').alpha, 1);
  assert.equal(parseColourInput('rgba(0,0,0,-2)').alpha, 0);
});

test('formatColourInput round-trips with the parser', () => {
  assert.equal(formatColourInput('4a90d9', 1), '#FF4A90D9');
  assert.equal(formatColourInput('#000000', 0), '#00000000');

  const text = formatColourInput('AABBCC', 0.5);
  const parsed = parseColourInput(text);
  assert.equal(parsed.color, 'AABBCC');
  assert.ok(Math.abs(parsed.alpha - 0.5) < 0.004);
});
