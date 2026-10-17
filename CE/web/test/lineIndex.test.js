// lineIndex.test.js — a position's line found from an index of line starts, as the code editor and
// the panel file view's whole file do instead of counting the newlines before it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lineAt, lineStartsOf } from '../src/CE_Application/utils/lineIndex.js';

test('every offset is on the line counting its newlines says, and each line starts where the index says', () => {
  for (const text of ['', 'one line', 'a\nb', '\n\nthree\n', 'x\n'.repeat(50) + 'end', '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}']) {
    const starts = lineStartsOf(text);
    assert.equal(starts.length, text.split('\n').length, JSON.stringify(text));
    for (let i = 0; i <= text.length; i++) {
      assert.equal(lineAt(starts, i), text.slice(0, i).split('\n').length - 1, `${JSON.stringify(text)} at ${i}`);
    }
    starts.forEach((start, line) => assert.ok(start === 0 || text[start - 1] === '\n', `line ${line} starts after a newline`));
  }
});
