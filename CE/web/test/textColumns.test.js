// textColumns.test.js — columns as the code editor draws them (editor/textColumns.js): a tab to its
// next stop, two wide, and the way back from a column to a character. The completion list, the
// diagnostic underlines, the occurrence and Values marks, the rename box and a click all count with
// these; counted in characters, each sat left of its text on a line with tabs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { visualColumn, indexAtColumn, TAB_SIZE } from '../src/CE_Application/editor/textColumns.js';

test('a tab goes to its next stop', () => {
  assert.equal(TAB_SIZE, 2);
  assert.equal(visualColumn('\t\tx', 2), 4);
  assert.equal(visualColumn('a\tb', 2), 2);
  assert.equal(visualColumn('ab\tc', 3), 4);
  assert.equal(visualColumn('ab', 5), 5, 'past the end, a column per character');
});

test('a column goes back to the character drawn there', () => {
  const line = '\t\t\tce.midi.sendCC(1,\t74, 64)';
  for (let i = 0; i <= line.length; i++) {
    assert.equal(indexAtColumn(line, visualColumn(line, i)), i, `character ${i}`);
  }
  // A click inside a tab goes to its nearer edge; past the end, to the end.
  assert.equal(indexAtColumn('a\tb', 1), 1, 'the tab starts at column 1');
  assert.equal(indexAtColumn('ab\tc', 4), 3, 'the tab runs from column 2 to 4: column 4 is before the c');
  assert.equal(indexAtColumn('ab\tc', 3), 2, 'halfway across it goes before the tab');
  assert.equal(indexAtColumn('\tx', 0), 0);
  assert.equal(indexAtColumn('abc', 40), 3);
});
