// The Text engine (utils/textEffects.js): real text cut into pieces, each animated a little after
// the last. Step 2 of the Animation Designer (docs/design/animation-designer.md); the seven first
// effects were approved by the owner on 2026-11-24. Held here: how text is cut (by grapheme, with
// joined scripts kept whole), the running order, the timing, and that what goes into a <style> is
// numbers, a hash and a checked colour only.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEXT_EFFECT_NAMES,
  newTextEffectShape,
  pieceRanks,
  readTextEffect,
  splitText,
  textEffectClips,
  textEffectRules,
  textEffectSpan,
  textPieceStyles,
} from '../src/CE_Application/utils/textEffects.js';

test('the seven effects the owner approved, each reads with its own defaults, in and out', () => {
  assert.deepEqual(TEXT_EFFECT_NAMES, ['typewriter', 'explode', 'roll', 'push', 'wipe', 'crossfade', 'shimmer']);
  for (const name of TEXT_EFFECT_NAMES) {
    for (const way of ['in', 'out']) {
      const effect = readTextEffect(newTextEffectShape('a', name, way));
      assert.equal(effect.effect, name);
      assert.equal(effect.way, way);
      assert.ok(effect.duration > 0 && Number.isFinite(effect.stagger), `${name} ${way}`);
    }
  }
  assert.equal(readTextEffect(newTextEffectShape('t', 'typewriter', 'in')).order, 'forward');
  assert.equal(readTextEffect(newTextEffectShape('t', 'typewriter', 'out')).order, 'reverse', 'typed forwards, deleted backwards');
  assert.equal(readTextEffect({ ...newTextEffectShape('t'), enabled: false }), null);
  assert.equal(readTextEffect({ kind: 'keyframes' }), null);
  assert.equal(readTextEffect({ ...newTextEffectShape('t'), effect: 'nonsense' }).effect, 'typewriter', 'an unknown effect falls back');
  assert.equal(readTextEffect({ ...newTextEffectShape('t'), stagger: 1e9 }).stagger, 2000, 'numbers are kept in range');
});

test('text is cut by grapheme, so an accent or an emoji is one letter; white space is not animated', () => {
  const pieces = splitText('Café 👍🏽!', 'letter');
  assert.deepEqual(pieces.map((p) => p.text), ['C', 'a', 'f', 'é', ' ', '👍🏽', '!']);
  assert.deepEqual(pieces.map((p) => p.animated), [true, true, true, true, false, true, true]);
  assert.equal(pieces.map((p) => p.text).join(''), 'Café 👍🏽!', 'the pieces give the text back exactly');
  assert.deepEqual(splitText('Filter Cutoff', 'word').filter((p) => p.animated).map((p) => p.text), ['Filter', 'Cutoff']);
  assert.deepEqual(splitText('one\ntwo', 'line').map((p) => p.text), ['one', '\n', 'two']);
  assert.deepEqual(splitText('Filter Cutoff', 'whole'), [{ text: 'Filter Cutoff', animated: true }]);
  assert.deepEqual(splitText('', 'letter'), []);
});

test('a script whose letters join is cut into words, not letters', () => {
  const arabic = splitText('مرحبا بك', 'letter');
  assert.deepEqual(arabic.filter((p) => p.animated).map((p) => p.text), ['مرحبا', 'بك']);
  const hindi = splitText('नमस्ते', 'letter');
  assert.deepEqual(hindi.map((p) => p.text), ['नमस्ते'], 'a Devanagari word stays one piece');
});

test('the running order: forward, reverse, from the centre, and a random that is the same every time', () => {
  const pieces = splitText('abcde', 'letter');
  assert.deepEqual(pieceRanks(pieces, 'forward'), [0, 1, 2, 3, 4]);
  assert.deepEqual(pieceRanks(pieces, 'reverse'), [4, 3, 2, 1, 0]);
  assert.deepEqual(pieceRanks(pieces, 'centre'), [2, 1, 0, 1, 2]);
  const random = pieceRanks(pieces, 'random', 'seed');
  assert.deepEqual([...random].sort(), [0, 1, 2, 3, 4], 'each piece once');
  assert.deepEqual(pieceRanks(pieces, 'random', 'seed'), random, 'and the same order again');
  assert.deepEqual(pieceRanks(splitText('a b', 'letter'), 'forward'), [0, -1, 1], 'the space has no turn');
});

test('timing: each piece starts a stagger after the last, and the whole runs to the last piece\'s end', () => {
  const effect = readTextEffect({ ...newTextEffectShape('t', 'typewriter', 'in'), stagger: 50, duration: 200, delay: 100 });
  const pieces = splitText('abc', 'letter');
  const styles = textPieceStyles(effect, pieces);
  assert.match(styles[0], / 200ms linear 100ms 1 normal backwards;$|200ms .* 100ms 1 normal backwards;$/);
  assert.match(styles[2], / 200ms .* 200ms 1 normal backwards;$/, `the third piece waits 100 + 2 × 50: ${styles[2]}`);
  assert.equal(textEffectSpan(effect, 3), 100 + 2 * 50 + 200);
  const out = readTextEffect(newTextEffectShape('t', 'crossfade', 'out'));
  assert.match(textPieceStyles(out, splitText('x', 'whole'))[0], / both;$/, 'an out effect holds its end pose');
});

test('moving effects make each piece a box a transform applies to, and roll and push clip to the label', () => {
  const explode = readTextEffect(newTextEffectShape('e', 'explode', 'in'));
  const styles = textPieceStyles(explode, splitText('ab c', 'letter'));
  assert.match(styles[0], /^display:inline-block;white-space:pre;animation:/);
  assert.equal(styles[2], 'display:inline-block;white-space:pre;', 'the space keeps its width and has no animation');
  assert.equal(textEffectClips(readTextEffect(newTextEffectShape('r', 'roll'))), true);
  assert.equal(textEffectClips(readTextEffect(newTextEffectShape('p', 'push'))), true);
  assert.equal(textEffectClips(explode), false);
});

test('the rules are numbers, a hash and a checked colour, whatever the document says', () => {
  for (const name of TEXT_EFFECT_NAMES) {
    for (const way of ['in', 'out']) {
      const effect = readTextEffect({ ...newTextEffectShape('t', name, way), colour: '"}body{display:none' });
      const css = textEffectRules(effect, { phase: 'b', colourProperty: 'fill' });
      assert.match(css, /^(@keyframes ce-tx-[0-9a-z]+-\d+-b\{[^@]*\})+$/, `${name} ${way}`);
      assert.doesNotMatch(css, /body|display:none|"/, 'nothing from the document gets in');
    }
  }
  const shimmer = readTextEffect({ ...newTextEffectShape('s', 'shimmer'), colour: 'FFFF8800' });
  assert.match(textEffectRules(shimmer, { colourProperty: 'color' }), /50%\{color:#FF8800FF\}/);
  assert.equal(textEffectRules(readTextEffect(newTextEffectShape('x', 'explode'))).match(/@keyframes/g).length, 12, 'twelve directions, not one rule a letter');
});

test('in and out of roll, push and wipe go the way they say', () => {
  const rule = (effect, way, direction) => textEffectRules(readTextEffect({ ...newTextEffectShape('t', effect, way), direction }));
  assert.match(rule('roll', 'in', 'up'), /0%\{transform:translateY\(110%\)\}/, 'rolling up, it comes from below');
  assert.match(rule('roll', 'out', 'up'), /100%\{transform:translateY\(-110%\)\}/, 'and leaves over the top');
  assert.match(rule('push', 'in', 'right'), /0%\{transform:translateX\(-110%\)\}/, 'pushed right, it comes from the left');
  assert.match(rule('push', 'out', 'right'), /100%\{transform:translateX\(110%\)\}/);
  assert.match(rule('wipe', 'in', 'right'), /0%\{clip-path:inset\(0 100% 0 0\)\}/, 'wiped in from the left');
  assert.match(rule('wipe', 'out', 'right'), /100%\{clip-path:inset\(0 0 0 100%\)\}/);
});
