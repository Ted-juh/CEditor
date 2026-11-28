// svgWords.test.js — text effects on words a control draws itself in SVG (utils/svgWords.js): a
// meter's legend, a letter, a word or a figure at a time, and its scale's numbers, a number at a time
// (editor/MeterDeviceParts.svelte); a key's legend, a letter at a time (editor/ButtonDeviceParts.svelte).
// docs/design/component-presets.md, The Meter, "Words inside the meter".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { numeralPieces, wordPieces, wordsSplit } from '../src/CE_Application/utils/svgWords.js';
import { TEXT_TRIGGER_TYPES } from '../src/CE_Application/utils/textEffects.js';

const typewriter = { effect: 'typewriter', way: 'in', split: 'letter', order: 'forward', stagger: 100, duration: 300, delay: 0, iterations: 1, easing: 'linear' };
const LEVEL = [{ x: 80, y: 57, text: 'LEVEL', size: 10 }];
// Where a browser set each letter of LEVEL, drawn whole and centred on 80.
const MEASURED = [{ xs: [65.3, 71, 77.1, 83, 89], end: 94.7 }];

test('a legend word played a letter at a time is its letters, each where the browser set it', () => {
  const pieces = wordPieces(typewriter, LEVEL, MEASURED);
  assert.deepEqual(pieces.map((p) => p.text), ['L', 'E', 'V', 'E', 'L']);
  assert.deepEqual(pieces.map((p) => p.x), [65.3, 71, 77.1, 83, 89]);
  assert.ok(pieces.every((p) => p.anchor === 'start' && p.y === 57 && p.size === 10));
  assert.ok(pieces.every((p) => /animation:/.test(p.style)), 'each plays');
  assert.equal(new Set(pieces.map((p) => p.style)).size, 5, 'each at a time of its own');
  assert.ok(pieces.every((p) => p.clip === null), 'a typewriter cuts nothing');
});

test('until its letters are measured, or played whole, the word is one piece where it always was', () => {
  const unmeasured = wordPieces(typewriter, LEVEL, [null]);
  assert.deepEqual(unmeasured.map((p) => [p.text, p.x, p.anchor]), [['LEVEL', 80, 'middle']]);
  const whole = wordPieces({ ...typewriter, split: 'whole' }, LEVEL, MEASURED);
  assert.deepEqual(whole.map((p) => p.text), ['LEVEL']);
  assert.equal(wordsSplit({ split: 'line' }, LEVEL), 'whole');
  // Measured for another word (the legend changed), it is not trusted.
  assert.deepEqual(wordPieces(typewriter, [{ ...LEVEL[0], text: 'VU' }], MEASURED).map((p) => p.text), ['VU']);
});

test('a word at a time splits at the spaces; figures in cells are a piece a figure already', () => {
  const words = wordPieces({ ...typewriter, split: 'word' }, [{ x: 80, y: 57, text: 'PEAK LEVEL', size: 10 }],
    [{ xs: [52, 58, 64, 70, 76, 80, 86, 92, 98, 104], end: 110 }]);
  assert.deepEqual(words.map((p) => [p.text, p.x]), [['PEAK', 52], ['LEVEL', 80]]);
  const figures = [{ x: 40, y: 80, text: '-', size: 20 }, { x: 80, y: 80, text: '1', size: 20 }, { x: 120, y: 80, text: '2', size: 20 }];
  assert.equal(wordsSplit(typewriter, figures), 'whole', 'no letters to measure');
  const cells = wordPieces(typewriter, figures, []);
  assert.deepEqual(cells.map((p) => [p.text, p.x, p.anchor]), [['-', 40, 'middle'], ['1', 80, 'middle'], ['2', 120, 'middle']]);
  assert.equal(new Set(cells.map((p) => p.style)).size, 3, 'one after another');
});

test('a roll is cut to a box about each piece; a scale\'s numbers are a piece a number', () => {
  const rolled = wordPieces({ ...typewriter, effect: 'roll', direction: 'up' }, LEVEL, MEASURED);
  assert.ok(rolled.every((p) => p.clip && p.clip.width > 0 && p.clip.y < 57 && p.clip.y + p.clip.height > 57), 'about the letter, round its baseline');
  const labels = [{ x: 20, y: 60, text: '-20', size: 6, anchor: 'middle' }, { x: 80, y: 20, text: '0', size: 6, anchor: 'middle' }, { x: 140, y: 60, text: '+3', size: 6, anchor: 'middle' }];
  const numbers = numeralPieces(typewriter, labels);
  assert.deepEqual(numbers.map((p) => p.text), ['-20', '0', '+3']);
  assert.equal(new Set(numbers.map((p) => p.style)).size, 3);
  assert.deepEqual(numeralPieces(null, labels), []);
});

test('the words play on a meter\'s own triggers too, and the renderer draws them so', () => {
  assert.ok(TEXT_TRIGGER_TYPES.includes('clip') && TEXT_TRIGGER_TYPES.includes('level'));
  const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  assert.match(src('editor/ControlAnatomy.svelte'), /<MeterDeviceParts [^>]*\{partTexts\} \/>/);
  const parts = src('editor/MeterDeviceParts.svelte');
  assert.match(src('editor/measureLetters.js'), /node\.getStartPositionOfChar\(i\)\.x/, 'letters measured where the browser set them');
  assert.match(parts, /<text use:measureLetters=\{\{ key: m\.key, measured \}\}[^>]*visibility="hidden"/, 'from the word drawn whole and hidden');
  assert.match(parts, /data-word-piece=\{item\.name\}/);
});

test('a key\'s legend plays a letter at a time too, centred on its box as it is drawn', () => {
  const ON = [{ x: 80, y: 40, text: 'ON', size: 11 }];
  const pieces = wordPieces(typewriter, ON, [{ xs: [72.5, 80.4], end: 87.6 }], { central: true });
  assert.deepEqual(pieces.map((p) => [p.text, p.x, p.y]), [['O', 72.5, 40], ['N', 80.4, 40]]);
  const rolled = wordPieces({ ...typewriter, effect: 'roll' }, ON, [{ xs: [72.5, 80.4], end: 87.6 }], { central: true });
  assert.ok(rolled.every((p) => p.clip.y < 40 && p.clip.y + p.clip.height > 40 && p.clip.y > 40 - 11), 'cut about the middle line, not above a baseline');
  const keys = readFileSync(new URL('../src/CE_Application/editor/ButtonDeviceParts.svelte', import.meta.url), 'utf8');
  assert.match(keys, /wordPieces\(item\.words\.effect, \[text\]/);
  assert.match(keys, /use:measureLetters=\{\{ key: fx\.measure\.key, measured \}\}/);
});
