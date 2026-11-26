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
  odometerChanged,
  effectInTurn,
  wordsHistory,
} from '../src/CE_Application/utils/textEffects.js';

test('the seven effects the owner approved, Part and Reel since, and the knob\'s three, each reads with its own defaults, in and out', () => {
  assert.deepEqual(TEXT_EFFECT_NAMES, ['typewriter', 'explode', 'roll', 'push', 'wipe', 'crossfade', 'shimmer', 'part', 'reel', 'odometer', 'fly', 'fan']);
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

// --- The name ↔ value swap -----------------------------------------------------------------------

test('a Label showing "name, value while touched" reads the name, and the value while its knob is pressed or dragged', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { shownAs, shownText } = await import('../src/CE_Application/utils/labelText.js');
  const knob = createControl('Knob', { Core: { name: 'Filter Cutoff' } });
  assert.equal(shownAs('nameValue', {}), 'name');
  assert.equal(shownAs('nameValue', { hover: true }), 'name', 'hovering is not touching');
  assert.equal(shownAs('nameValue', { pressed: true }), 'value');
  assert.equal(shownAs('nameValue', { dragging: true }), 'value');
  assert.equal(shownAs('value', {}), 'value', 'any other Label: what it shows');
  assert.equal(shownText(knob, 'nameValue', {}), 'Filter Cutoff');
  assert.equal(shownText(knob, 'nameValue', { pressed: true }), shownText(knob, 'value', { pressed: true }));
});

test('the swap recipe makes a Label the owner\'s example: four text effects, each on the words its swap brings', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { setNestedValue } = await import('../src/CE_Application/stores/controlTreeUtils.js');
  const { animationsPatch } = await import('../src/CE_Application/utils/animationModel.js');
  const { nameValueSwapPatch } = await import('../src/CE_Application/utils/textEffects.js');
  const label = createControl('Label');
  assert.equal(label._children.Animations, undefined, 'a Label starts with no Animations section');
  const { patch, names } = nameValueSwapPatch(label, animationsPatch);
  for (const [path, value] of Object.entries(patch)) assert.ok(setNestedValue(label, path, value), `wrote ${path}`);
  assert.equal(label._children.Text.shows, 'nameValue');
  assert.deepEqual(names, ['valueIn', 'nameOut', 'valueOut', 'nameIn']);
  const read = Object.fromEntries(names.map((name) => [name, readTextEffect(label._children.Animations._children[name])]));
  assert.deepEqual([read.valueIn.effect, read.valueIn.way, read.valueIn.trigger.to], ['push', 'in', ['value']]);
  assert.deepEqual([read.nameOut.effect, read.nameOut.way, read.nameOut.trigger.to], ['push', 'out', ['value']]);
  assert.deepEqual([read.valueOut.effect, read.valueOut.way, read.valueOut.trigger.to], ['crossfade', 'out', ['name']]);
  assert.deepEqual([read.nameIn.effect, read.nameIn.way, read.nameIn.trigger.to, read.nameIn.colour], ['typewriter', 'in', ['name'], 'FFFFE3E3']);
  assert.equal(read.nameIn.delay, 150, 'the name waits a moment before it is typed back');

  // Again: the names never collide, and the section is added to, not replaced.
  const again = nameValueSwapPatch(label, animationsPatch);
  assert.deepEqual(again.names, ['valueIn2', 'nameOut2', 'valueOut2', 'nameIn2']);
  assert.ok(Object.keys(again.patch).every((key) => key === 'Text.shows' || key.startsWith('Animations.')));
});

test('a text effect is played by the keyframe player: on request, and on the words of its part', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { resolveInteractiveControl } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const { createKeyframePlayer } = await import('../src/CE_Application/utils/keyframeAnimation.js');
  const button = createControl('Button');
  button._children.Animations._children = {
    type: newTextEffectShape('type', 'typewriter', 'in'),
    legend: { ...newTextEffectShape('legend', 'shimmer', 'in', 'legend'), trigger: { type: 'always' }, iterations: 'infinite' },
  };
  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  const runtime = resolveInteractiveControl(button, {}).runtime;
  let frame = player.next(runtime, {});
  assert.deepEqual([...frame.texts.keys()], ['legend'], 'the shimmer plays all the time, on its part');
  assert.equal(frame.texts.get('legend')[0].effect.iterations, 'infinite');
  clock += 100;
  frame = player.next(runtime, { plays: { type: 1 } });
  assert.deepEqual(frame.fired, ['type'], 'the script-triggered typewriter on request');
  assert.equal(frame.texts.get('')[0].name, 'type');
  assert.match(frame.rules, /@keyframes ce-tx-[0-9a-z]+-0-[ab]\{0%\{opacity:0;\}1%\{opacity:1;\}100%\{opacity:1\}\}/);
});

// --- The knob's three (2026-11-26, the Components showcase) -------------------------------------

test('an odometer rolls only the digits that changed, lined up as a counter\'s are', () => {
  assert.deepEqual(odometerChanged('0.45', '0.44'), [false, false, false, true], 'the last digit');
  assert.deepEqual(odometerChanged('12.0', '9.0'), [true, true, false, false], 'from the right: a value grows on the left');
  assert.deepEqual(odometerChanged('0.45 Hz', '0.45'), [false, false, false, false, true, true, true], 'a unit arriving after the value: from the left');
  assert.deepEqual(odometerChanged('0.45', '0.45 Hz'), [false, false, false, false], 'and going');
  assert.deepEqual(odometerChanged('5', null), [true], 'the first words roll whole');
  const odometer = readTextEffect(newTextEffectShape('o', 'odometer'));
  assert.deepEqual([odometer.split, odometer.stagger, odometer.direction], ['letter', 0, 'up'], 'every digit at once, rolling up');
  assert.equal(textEffectClips(odometer), true, 'each digit through its own window');
  assert.match(textEffectRules(odometer, { phase: 'a' }), /0%\{transform:translateY\(110%\)\}/);
});

test('a fly comes from where its marks say, and a fan turns about the dial; on a Label, about itself', () => {
  const fly = readTextEffect(newTextEffectShape('f', 'fly'));
  assert.match(textEffectRules(fly, { phase: 'a' }), /0%\{opacity:0;transform:translate\(var\(--ce-fly-x, 0px\), var\(--ce-fly-y, 0\.8em\)\)\}100%\{\}/,
    'a mark sets the way; a Label\'s letters rise from just below');
  const away = readTextEffect(newTextEffectShape('f', 'fly', 'out'));
  assert.match(textEffectRules(away, { phase: 'a' }), /0%\{\}100%\{opacity:0;transform:translate\(var\(--ce-fly-out-x, 0px\), var\(--ce-fly-out-y, -0\.8em\)\)\}/,
    'away by a pair of its own, so the fly back on the same marks keeps its own');
  const fan = readTextEffect(newTextEffectShape('n', 'fan'));
  assert.equal(fan.stagger, 0, 'every mark turns at once, the far ones further');
  assert.match(textEffectRules(fan, { phase: 'a' }), /0%\{opacity:0;transform:rotate\(var\(--ce-fan-turn, -30deg\)\)\}/);
  assert.equal(textEffectClips(fly), false, 'a mark flying is not cut off at its own box');
  assert.equal(textEffectClips(fan), false);
});

test('several effects on the same words take turns: the last to have started, a later one from its own start', () => {
  const away = { name: 'away', startedAt: 1000, effect: { effect: 'fly', way: 'out', delay: 0 } };
  const back = { name: 'back', startedAt: 1000, effect: { effect: 'fly', way: 'in', delay: 650 } };
  const before = effectInTurn([back, away], 900);
  assert.equal(before.item, away, 'before either starts: the first to start, in its own time');
  assert.equal(before.next, 1650, 'and the in takes over at its start');
  assert.equal(effectInTurn([back, away], 1200).item, away);
  const turned = effectInTurn([back, away], 1660);
  assert.equal(turned.item.name, 'back');
  assert.equal(turned.item.effect.delay, 0, 'its wait was spent on the out');
  assert.equal(back.effect.delay, 650, 'the item handed over is not changed');
  assert.equal(turned.next, null);
  const hover = { name: 'shimmer', startedAt: 5000, effect: { effect: 'shimmer', delay: 0 } };
  assert.equal(effectInTurn([back, away, hover], 5001).item.name, 'shimmer', 'one fired later plays over one done long ago');
  assert.equal(effectInTurn([away], 0).item, away, 'one alone is left as it is');
  const posed = { name: 'p', effect: { effect: 'typewriter', delay: 0 } };
  assert.equal(effectInTurn([posed, { ...posed, name: 'q' }], 0).item.name, 'q', 'posed by a playhead: the last');
  assert.deepEqual(effectInTurn([], 0), { item: null, next: null });
});

test('an odometer compares with the words before they last changed, however often it asks', () => {
  const before = wordsHistory();
  assert.equal(before('0.44'), null, 'nothing came before');
  assert.equal(before('0.44'), null);
  assert.equal(before('0.45'), '0.44');
  assert.equal(before('0.45'), '0.44', 'asked again mid-roll: the same, so the roll is left be');
  assert.equal(before('0.46'), '0.45');
  const lines = wordsHistory((words) => words.join('\n'));
  assert.equal(lines(['12', 'Hz']), null);
  assert.deepEqual(lines(['13', 'Hz']), ['12', 'Hz'], 'a Label\'s lines, compared whole');
});
