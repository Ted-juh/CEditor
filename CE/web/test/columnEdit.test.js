import test from 'node:test';
import assert from 'node:assert/strict';

import { columnInsert, columnDelete, offsetOf } from '../src/CE_Application/editor/columnEdit.js';

const src = 'alpha\nbeta\ngamma';

test('columnInsert inserts at the same column on each line', () => {
  // col 2 on lines 0..2 → "al|pha", "be|ta", "ga|mma"
  const out = columnInsert(src, 0, 2, 2, 'X');
  assert.equal(out, 'alXpha\nbeXta\ngaXmma');
});

test('columnInsert clamps to the end of short lines', () => {
  const out = columnInsert('aa\nb\nccc', 0, 2, 2, '!');
  // line "b" (len 1) clamps to its end
  assert.equal(out, 'aa!\nb!\ncc!c');
});

test('columnInsert respects the line range', () => {
  const out = columnInsert(src, 1, 2, 1, '_');
  assert.equal(out, 'alpha\nb_eta\ng_amma');
});

test('columnDelete removes the char before the column on each line', () => {
  const out = columnDelete(src, 0, 2, 2);
  assert.equal(out, 'apha\nbta\ngmma');
});

test('columnDelete at column 0 is a no-op', () => {
  assert.equal(columnDelete(src, 0, 2, 0), src);
});

test('offsetOf computes the character offset of a line/col', () => {
  assert.equal(offsetOf(src, 0, 0), 0);
  assert.equal(offsetOf(src, 1, 0), 6);   // after "alpha\n"
  assert.equal(offsetOf(src, 2, 2), 6 + 5 + 2); // "alpha\n"(6) + "beta\n"(5) + 2
});

test('offsetOf clamps col to the line length', () => {
  assert.equal(offsetOf('ab\ncd', 0, 99), 2);
});

test('reversed range (anchor below head) is normalized', () => {
  const out = columnInsert(src, 2, 0, 0, '>');
  assert.equal(out, '>alpha\n>beta\n>gamma');
});
