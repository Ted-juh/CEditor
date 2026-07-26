import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARSETS, charsetString, normalizeText, makeBuffer, moveCaret,
  caretHome, caretEnd, insert, backspace, deleteForward, setChar, cycleChar,
} from '../src/CE_Application/utils/textEditBuffer.js';

const UP = { charset: 'upper', maxLength: 8 };

test('normalizeText filters to the charset and caps length', () => {
  assert.equal(normalizeText('Ab3!', 'upper', 8), 'A3'); // 'b' lowercase + '!' not in the upper set -> dropped
  assert.equal(normalizeText('LEAD 1', 'upper', 8), 'LEAD 1');
  assert.equal(normalizeText('TOOLONGNAME', 'upper', 4), 'TOOL');
  assert.equal(normalizeText('a1b2', 'digits', 8), '12');
});

test('makeBuffer clamps caret into range', () => {
  assert.deepEqual(makeBuffer('LEAD', 2, UP), { text: 'LEAD', caret: 2 });
  assert.deepEqual(makeBuffer('LEAD', 99, UP), { text: 'LEAD', caret: 4 });
  assert.deepEqual(makeBuffer('LEAD', -5, UP), { text: 'LEAD', caret: 0 });
});

test('insert respects charset, maxLength and advances the caret', () => {
  assert.deepEqual(insert({ text: 'LED', caret: 3 }, 'S', UP), { text: 'LEDS', caret: 4 });
  assert.deepEqual(insert({ text: 'LE', caret: 1 }, 'X', UP), { text: 'LXE', caret: 2 });
  // illegal char (lowercase not in 'upper') is ignored
  assert.deepEqual(insert({ text: 'LE', caret: 2 }, 'q', UP), { text: 'LE', caret: 2 });
  // maxLength 8 full -> no insert
  assert.deepEqual(insert({ text: 'ABCDEFGH', caret: 8 }, 'I', UP), { text: 'ABCDEFGH', caret: 8 });
});

test('backspace and deleteForward', () => {
  assert.deepEqual(backspace({ text: 'LEAD', caret: 4 }), { text: 'LEA', caret: 3 });
  assert.deepEqual(backspace({ text: 'LEAD', caret: 0 }), { text: 'LEAD', caret: 0 });
  assert.deepEqual(deleteForward({ text: 'LEAD', caret: 0 }), { text: 'EAD', caret: 0 });
  assert.deepEqual(deleteForward({ text: 'LEAD', caret: 4 }), { text: 'LEAD', caret: 4 });
});

test('moveCaret / home / end clamp', () => {
  assert.deepEqual(moveCaret({ text: 'LEAD', caret: 2 }, 1), { text: 'LEAD', caret: 3 });
  assert.deepEqual(moveCaret({ text: 'LEAD', caret: 0 }, -1), { text: 'LEAD', caret: 0 });
  assert.deepEqual(caretHome({ text: 'LEAD', caret: 3 }), { text: 'LEAD', caret: 0 });
  assert.deepEqual(caretEnd({ text: 'LEAD', caret: 1 }), { text: 'LEAD', caret: 4 });
});

test('setChar overwrites at caret, or appends at the end', () => {
  assert.deepEqual(setChar({ text: 'LEAD', caret: 0 }, 'H', UP), { text: 'HEAD', caret: 0 });
  assert.deepEqual(setChar({ text: 'LEA', caret: 3 }, 'D', UP), { text: 'LEAD', caret: 3 });
  // append blocked at maxLength
  assert.deepEqual(setChar({ text: 'ABCDEFGH', caret: 8 }, 'I', UP), { text: 'ABCDEFGH', caret: 8 });
});

test('cycleChar walks the charset (knob), wraps, and appends at the end', () => {
  const set = charsetString('upper');
  // 'A' +1 -> 'B'
  assert.deepEqual(cycleChar({ text: 'A', caret: 0 }, 1, UP), { text: 'B', caret: 0 });
  // 'A' is index 1, -1 -> index 0 -> space
  assert.deepEqual(cycleChar({ text: 'A', caret: 0 }, -1, UP), { text: ' ', caret: 0 });
  // space is index 0, -1 wraps to the last charset char
  assert.deepEqual(cycleChar({ text: ' ', caret: 0 }, -1, UP), { text: set[set.length - 1], caret: 0 });
  // space (index 0) +1 -> 'A'
  assert.deepEqual(cycleChar({ text: ' ', caret: 0 }, 1, UP), { text: 'A', caret: 0 });
  // at end: append first charset char (space)
  assert.deepEqual(cycleChar({ text: 'LE', caret: 2 }, 1, UP), { text: 'LE ', caret: 2 });
  // at end going back: append last charset char
  assert.deepEqual(cycleChar({ text: 'LE', caret: 2 }, -1, UP), { text: 'LE' + set[set.length - 1], caret: 2 });
});

test('charsets exist and are non-empty', () => {
  for (const key of ['upper', 'alnum', 'ascii', 'digits']) {
    assert.ok(CHARSETS[key] && CHARSETS[key].length > 0, key);
  }
  assert.equal(CHARSETS.ascii.length, 95);
});
