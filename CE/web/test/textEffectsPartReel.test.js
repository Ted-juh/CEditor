// textEffectsPartReel.test.js — the two text effects after the first seven (utils/textEffects.js):
// Part, the words opening down their middle like elevator doors, and Reel, each letter a window on
// a column of glyphs that rolls up to it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readTextEffect, newTextEffectShape, splitText, textPieceStyles, textEffectRules, textEffectClips,
  reelColumns, REEL_WINDOW, REEL_GLYPHS,
} from '../src/CE_Application/utils/textEffects.js';
import { previewOf } from '../src/CE_Application/utils/effectPreview.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';

const variantOf = (style) => Number(/ce-tx-\w+-(\d+)-a/.exec(style)?.[1]);

test('Part: the first half of the letters is one door, the rest the other, each into the box\'s edge', () => {
  const out = readTextEffect(newTextEffectShape('doors', 'part', 'out'));
  assert.deepEqual([out.split, out.stagger, out.duration], ['letter', 0, 900], 'the doors move together');
  const pieces = splitText('WEL COME', 'letter');
  const styles = textPieceStyles(out, pieces);
  // Seven letters: four in the first door, three in the second; the space is no door's.
  assert.deepEqual(styles.map((style, i) => (pieces[i].animated ? variantOf(style) : null)), [0, 0, 0, null, 0, 1, 1, 1]);
  assert.ok(styles.every((style) => style.startsWith('display:inline-block;')), 'a transform needs a box');
  const rules = textEffectRules(out);
  assert.match(rules, /-0-a\{0%\{\}100%\{transform:translateX\(calc\(-1 \* \(var\(--ce-part-reach, 3em\) \+ 1em\)\)\)\}\}/, 'out: the first door opens left');
  assert.match(rules, /-1-a\{0%\{\}100%\{transform:translateX\(calc\(1 \* \(var\(--ce-part-reach, 3em\) \+ 1em\)\)\)\}\}/, 'and the second right');
  assert.match(textEffectRules(readTextEffect(newTextEffectShape('doors', 'part', 'in'))), /-0-a\{0%\{transform:translateX\(calc\(-1/, 'in: they close from the edges');
  assert.equal(textEffectClips(out), true, 'the box cuts the doors off at its edges');
});

test('Reel: each letter\'s column is the letter and the glyphs it rolls past, a line each, the same every time', () => {
  const into = readTextEffect(newTextEffectShape('code', 'reel', 'in'));
  assert.deepEqual([into.spins, into.glyphs, into.stagger], [6, null, 70]);
  const pieces = splitText('AB C', 'letter');
  const columns = reelColumns(into, pieces, { seedText: 'x' });
  assert.equal(columns[2], null, 'a space does not roll');
  const lines = columns[0].split('\n');
  assert.equal(lines.length, 7);
  assert.equal(lines[0], 'A', 'the letter on top: where a window rests when the run is over');
  assert.ok(lines.slice(1).every((glyph) => REEL_GLYPHS.includes(glyph)));
  assert.deepEqual(reelColumns(into, pieces, { seedText: 'x' }), columns, 'seeded');
  assert.notDeepEqual(reelColumns(into, pieces, { seedText: 'y' }), columns, 'another control rolls other glyphs');
  const away = readTextEffect({ ...newTextEffectShape('code', 'reel', 'out'), spins: 3, glyphs: '0 1' });
  const [column] = reelColumns(away, splitText('Z', 'letter'));
  assert.equal(column.split('\n')[0], 'Z', 'out too: it rolls up off the letter');
  assert.ok(column.split('\n').slice(1).every((glyph) => glyph === '0' || glyph === '1'), 'its own glyphs, spaces dropped');
  assert.deepEqual(reelColumns(readTextEffect(newTextEffectShape('t', 'typewriter', 'in')), pieces), [null, null, null, null], 'only a reel has columns');
  assert.equal(readTextEffect({ ...newTextEffectShape('code', 'reel', 'in'), spins: 900 }).spins, 30);
});

test('Reel: in a window the column rolls a line a glyph; with no window, the letter rolls up into place', () => {
  const into = readTextEffect(newTextEffectShape('code', 'reel', 'in'));
  const pieces = splitText('AB', 'letter');
  const windowed = textPieceStyles(into, pieces, { columns: true });
  assert.ok(windowed.every((style) => style.includes('vertical-align:top;--ce-reel:6;') && variantOf(style) === 0), windowed[0]);
  const bare = textPieceStyles(into, pieces);
  assert.ok(bare.every((style) => variantOf(style) === 1 && !style.includes('--ce-reel')), bare[0]);
  const rules = textEffectRules(into);
  assert.match(rules, /-0-a\{0%\{transform:translateY\(calc\(var\(--ce-reel, 6\) \* -1lh\)\)\}100%\{transform:translateY\(0\)\}\}/, 'in: down from the last glyph onto the letter');
  assert.match(rules, /-1-a\{0%\{transform:translateY\(110%\)\}100%\{\}\}/, 'up from below');
  assert.match(textEffectRules(readTextEffect(newTextEffectShape('code', 'reel', 'out'))), /100%\{transform:translateY\(calc\(var\(--ce-reel, 6\) \* -1lh\)\);opacity:0\}/, 'out: rolls on and fades');
  assert.equal(REEL_WINDOW, 'display:inline-block;height:1lh;overflow:hidden;vertical-align:bottom;');
});

test('the library\'s previews roll a reel in windows too', () => {
  const shown = previewOf(sceneEffect('text:reel:in'));
  assert.ok(shown.pieces.every((piece) => piece.column && piece.column.split('\n')[0] === piece.text), JSON.stringify(shown.pieces));
  assert.ok(previewOf(sceneEffect('text:part:out')).pieces.every((piece) => piece.column === null));
});
