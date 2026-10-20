// signatureHint.test.js — where the code editor's signature hint goes: after the end of the caret's
// line when it fits there, else a box above the line (below it on the top visible line), kept inside
// the editor, its other parameters folded to "…" when even the box is too wide.

import test from 'node:test';
import assert from 'node:assert/strict';

import { placeSignatureHint, hintParts, hintLength, visualColumn, HINT } from '../src/CE_Application/editor/signatureHint.js';

// An editor 800 px wide and 400 tall at 100, 100; 13px code, 7.8 px a character, 20 px a line.
const BOX = { left: 100, right: 900, top: 100, bottom: 500 };
const CW = 7.8;
const at = (col) => BOX.left + 4 + col * CW;
const place = (o) => placeSignatureHint({
  name: 'sendCC', params: ['channel', 'cc', 'value'], active: 1, lineHeight: 20, charWidth: CW, fontSize: 13, box: BOX, ...o,
});

test('the hint goes after the end of the caret\'s line, two characters on, when it fits there', () => {
  // `  ce.midi.sendCC(1, 74, 64)`: 27 characters, the caret in the 74.
  const p = place({ lineEndX: at(27), caretX: at(21), lineTop: 160 });
  assert.equal(p.mode, 'inline');
  assert.equal(p.x, at(27) + HINT.gapChars * CW);
  assert.equal(p.y, 160, 'on the line itself, not the one above');
  assert.deepEqual(p.parts.map((q) => [q.text, q.active]), [['channel', false], ['cc', true], ['value', false]]);
  assert.equal(p.width, Math.ceil(hintLength('sendCC', p.parts) * CW + 2 * HINT.inlinePadX));
});

test('a line too long for it puts it in a box above the line, at the caret, kept inside the editor', () => {
  const p = place({ lineEndX: at(95), caretX: at(40), lineTop: 160 });
  assert.equal(p.mode, 'above');
  assert.equal(p.x, at(40));
  assert.ok(p.y + 28 <= 160, 'above the line, clear of it');
  // A caret near the right edge: the box moves left to stay in.
  const right = place({ lineEndX: at(99), caretX: at(98), lineTop: 160 });
  assert.equal(right.mode, 'above');
  assert.ok(right.x + right.width <= BOX.right - HINT.margin, 'inside the right edge');
  // Scrolled sideways so that the line's end is off to the left: there is no end to sit after.
  assert.equal(place({ lineEndX: BOX.left - 50, caretX: BOX.left + 10, lineTop: 160 }).mode, 'above');
});

test('on the top visible line it goes below, and a line out of view has none', () => {
  const p = place({ lineEndX: at(99), caretX: at(10), lineTop: 104 });
  assert.equal(p.mode, 'below');
  assert.equal(p.y, 104 + 20 + 2);
  assert.equal(place({ lineEndX: at(5), caretX: at(2), lineTop: 40 }), null, 'scrolled out above');
  assert.equal(place({ lineEndX: at(5), caretX: at(2), lineTop: 520 }), null, 'scrolled out below');
});

test('a box wider than the editor folds the other parameters to "…"', () => {
  const params = ['target', 'path', 'value', 'durationInMilliseconds', 'curveOrBezierPoints', 'delayInMilliseconds'];
  const narrow = { left: 100, right: 300, top: 100, bottom: 500 };
  const p = placeSignatureHint({ name: 'animateTo', params, active: 2, lineEndX: 290, caretX: 150, lineTop: 200, lineHeight: 20, charWidth: CW, fontSize: 13, box: narrow });
  assert.equal(p.mode, 'above');
  assert.deepEqual(p.parts.map((q) => q.text), ['…', 'value', '…']);
  assert.ok(p.width <= 200 - 2 * HINT.margin, 'never wider than the editor');
  assert.deepEqual(hintParts(['a', 'b', 'c'], 0, true).map((q) => q.text), ['a', '…']);
  assert.deepEqual(hintParts(['a', 'b', 'c'], 2, true).map((q) => q.text), ['…', 'c']);
  assert.deepEqual(hintParts(['a', 'b'], 5, true).map((q) => q.text), ['…'], 'past the last parameter, all of them folded');
});

test('columns are counted as the editor draws them, a tab to its next stop of 2', () => {
  assert.equal(visualColumn('abc', 3), 3);
  assert.equal(visualColumn('\t\tx', 2), 4, 'two tabs at the start are four columns');
  assert.equal(visualColumn('a\tb', 2), 2, 'a tab after one character goes to the stop at 2');
  assert.equal(visualColumn('ab\tc', 3), 4, 'one after two goes on to 4');
  // The browser check's line: three tabs at the start and one inside, drawn three columns wider
  // than its 28 characters.
  const line = '\t\t\tce.midi.sendCC(1,\t74, 64)';
  assert.equal(visualColumn(line, line.length), line.length + 3);
  assert.equal(visualColumn('ab', 5), 5, 'past the end, a column per character');
});
