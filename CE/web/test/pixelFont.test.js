import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONT_W, FONT_H, glyphRows, drawCharInto, drawTextInto } from '../src/CE_Application/utils/pixelFont.js';

test('glyphs are well-formed 5x7 grids', () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    + '0123456789.,:;!?-_+=/()<>%#@°*"\'[]\\ ';
  for (const ch of chars) {
    const rows = glyphRows(ch);
    assert.ok(rows, `missing glyph: ${ch}`);
    assert.equal(rows.length, FONT_H, `rows: ${ch}`);
    for (const row of rows) assert.equal(row.length, FONT_W, `row width: ${ch}`);
  }
});

test('lowercase has its own distinct glyphs', () => {
  // a-z are now real lowercase shapes, not an uppercase fold.
  assert.notDeepEqual(glyphRows('a'), glyphRows('A'));
  assert.notDeepEqual(glyphRows('e'), glyphRows('E'));
  // Unknown case still folds (e.g. accented char -> block fallback or none).
  assert.deepEqual(glyphRows('m').length, FONT_H);
});

test('block characters generate fills', () => {
  const full = glyphRows('█');
  assert.equal(full.every((r) => r === '#####'), true);
  const low = glyphRows('▁');
  assert.equal(low[FONT_H - 1], '#####');
  assert.equal(low[0], '.....');
  const left = glyphRows('▏');
  assert.equal(left[0][0], '#');
  assert.equal(left[0][FONT_W - 1], '.');
});

test('drawCharInto stamps exact pixels at scale 1 and 2', () => {
  const w = 12; const h = 16;
  const buf = new Uint8Array(w * h);
  drawCharInto(buf, w, h, 'I', 0, 0, 1);
  // 'I' top row is .###. -> pixels at x 1..3, y 0
  assert.deepEqual([buf[0], buf[1], buf[2], buf[3], buf[4]], [0, 1, 1, 1, 0]);

  const buf2 = new Uint8Array(w * h);
  drawCharInto(buf2, w, h, 'I', 0, 0, 2);
  // scale 2: same row doubled -> pixels at x 2..7 on rows 0 and 1
  assert.equal(buf2[0 * w + 2], 1);
  assert.equal(buf2[1 * w + 7], 1);
  assert.equal(buf2[0 * w + 0], 0);
});

test('drawTextInto aligns and clips within a box', () => {
  const w = 20; const h = 8;
  const right = new Uint8Array(w * h);
  drawTextInto(right, w, h, 'I', 0, 0, 1, 'right', 20);
  // right-aligned single char (5px wide): rightmost glyph column at x 19 is
  // '.###.' col 4 -> blank; col x 16..18 lit on row 0.
  assert.equal(right[17], 1);
  assert.equal(right[2], 0);

  const clipped = new Uint8Array(w * h);
  drawTextInto(clipped, w, h, 'III', 0, 0, 1, 'left', 8);
  // box 8px wide: the third char (starts at x 12) must be fully clipped.
  for (let x = 8; x < w; x += 1) assert.equal(clipped[x], 0, `x=${x}`);
});
