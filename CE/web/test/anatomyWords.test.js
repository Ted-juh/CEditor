// anatomyWords.test.js — text effects on the words a knob or slider draws for itself: its scale's
// numbers and ticks, one piece a mark, and the labels on its handles (utils/anatomyWords.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  SLIDER_WORD_PARTS, sliderWordParts, sliderWordsPlace, sliderWordsRefusal, markPieceStyles, markClipBox,
} from '../src/CE_Application/utils/anatomyWords.js';
import { readTextEffect, textEffectRules } from '../src/CE_Application/utils/textEffects.js';
import { sceneControlOutput } from '../src/CE_Application/utils/sceneModel.js';
import { describeTargets, deadTargetCount } from '../src/CE_Application/utils/animationModel.js';
import { render } from 'svelte/server';
import SliderFamilyRenderer from '../src/CE_Application/editor/SliderFamilyRenderer.svelte';

const knob = (behavior = {}, name = 'Cutoff') => {
  const control = createControl('Knob', { Core: { id: 'k1', name } });
  Object.assign(control._children.Behavior, behavior);
  return control;
};
const effect = (fields) => readTextEffect({ kind: 'text', enabled: true, name: 'fx', ...fields });

test('a knob offers the words it draws now: numbers first, then numeral ticks, handle labels, plain ticks', () => {
  assert.deepEqual([...SLIDER_WORD_PARTS], ['tickNumber', 'tickMajor', 'tickMinor', 'labelStart', 'labelCurrent', 'labelEnd']);
  const numbered = knob({ scaleNumberCount: 6, showTicks: true });
  assert.equal(sliderWordParts(numbered)[0], 'tickNumber');
  assert.equal(sliderWordsPlace(numbered), 'Parts.tickNumber');
  const ticksOnly = knob({ scaleNumberCount: 0, showTicks: true });
  assert.equal(sliderWordsPlace(ticksOnly), 'Parts.tickMajor');
  const labelled = knob({ scaleNumberCount: 0, showTicks: true, showHandleLabels: true });
  assert.equal(sliderWordsPlace(labelled), 'Parts.labelCurrent', 'a handle label is words; a line tick is only a mark');
  const bare = knob({ scaleNumberCount: 0, showTicks: false });
  assert.equal(sliderWordsPlace(bare), null);
  assert.deepEqual(sliderWordParts(createControl('Label')), [], 'a Label is not this module\'s');
});

test('a slider on a range shows the labels of the handles it has', () => {
  const range = knob({ geometry: 'linear', valueMode: 'range', showHandleLabels: true, showTicks: false });
  assert.deepEqual(sliderWordParts(range), ['labelStart', 'labelEnd']);
  const band = knob({ geometry: 'linear', valueMode: 'band', showHandleLabels: true, showTicks: false });
  assert.deepEqual(sliderWordParts(band), ['labelStart', 'labelCurrent', 'labelEnd']);
});

test('an effect where a knob draws no words says why, and where it does, nothing', () => {
  const numbered = knob({ scaleNumberCount: 6 });
  assert.equal(sliderWordsRefusal(numbered, 'tickNumber'), '');
  assert.match(sliderWordsRefusal(numbered, ''), /^Cutoff has no words of its own: a text effect plays on its scale’s numbers/);
  assert.match(sliderWordsRefusal(numbered, 'labelTitle'), /Labels of their own beside it/);
  assert.match(sliderWordsRefusal(numbered, 'bodyCap'), /^That part of Cutoff draws no words/);
  assert.match(sliderWordsRefusal(knob({ scaleNumberCount: 0 }), 'tickNumber'), /does not show that now: turn it on in its Ticks section/);
  assert.equal(sliderWordsRefusal(numbered, 'myBadge'), '', 'a part added to the knob is drawn as a part, words and all');
  assert.equal(sliderWordsRefusal(createControl('Label'), ''), '');
});

test('each mark of a scale is one piece, round it in order; whole plays them together', () => {
  const typed = effect({ effect: 'typewriter', split: 'letter', stagger: 50, duration: 300 });
  const styles = markPieceStyles(typed, ['0', '2', '4', '6', '8', '10'], { phase: 'a', seedText: 'k1:fx' });
  assert.equal(styles.length, 6);
  const delays = styles.map((style) => Number(/ (-?\d+)ms \d+ normal/.exec(style)?.[1]));
  assert.deepEqual(delays, [0, 50, 100, 150, 200, 250], 'one a number, not one a letter: "10" is one piece');
  for (const style of styles) {
    assert.doesNotMatch(style, /display:inline-block/, 'SVG text takes no inline display');
    assert.match(style, /transform-box:fill-box;transform-origin:center;$/);
  }
  const whole = markPieceStyles({ ...typed, split: 'whole' }, ['0', '5', '10'], { phase: 'b' });
  assert.deepEqual(whole.map((style) => / (-?\d+)ms \d+ normal/.exec(style)?.[1]), ['0', '0', '0']);
  const posed = markPieceStyles(typed, ['0', '5'], { at: 25 });
  assert.match(posed[1], / 25ms 1 normal backwards paused;/, 'the playhead poses it, as on a Label');
  assert.deepEqual(markPieceStyles(typed, []), []);
});

test('a mark rolls or pushes through a box about itself', () => {
  assert.deepEqual(markClipBox({ text: '10', x: 50, y: 20, size: 10 }), { x: 41.8, y: 13.5, width: 16.4, height: 13 });
  assert.deepEqual(markClipBox({ r: 2, x: 10, y: 10 }), { x: 7, y: 7, width: 6, height: 6 });
  assert.deepEqual(markClipBox({ x1: 10, y1: 0, x2: 10, y2: 12, width: 2 }), { x: 8, y: -2, width: 4, height: 16 });
});

test('a scene clip on a knob\'s numbers reaches the renderer as that part\'s text, with its rules', () => {
  const fx = { kind: 'text', effect: 'typewriter', way: 'in', iterations: 1 };
  const output = sceneControlOutput({ clips: [{ id: 'c1', controlId: 'k1', target: 'Parts.tickNumber', start: 0, length: 600, effect: fx }] }, 'k1', { phase: 'a' });
  const texts = output?.texts?.get('tickNumber');
  assert.equal(texts?.length, 1);
  assert.equal(texts[0].effect.effect, 'typewriter');
  assert.ok(output.rules.includes(textEffectRules(texts[0].effect, { phase: 'a' })));
});

test('the Animation tab marks a text effect where a knob draws no words, and not where it does', () => {
  const control = knob({ scaleNumberCount: 6 });
  const row = (path) => ({ kind: 'text', name: 'fx', enabled: true, targets: [{ path }] });
  assert.equal(describeTargets(row('Parts.tickNumber'), [], { control })[0].status.works, true);
  const dead = describeTargets(row('Text'), [], { control })[0].status;
  assert.equal(dead.works, false);
  assert.equal(dead.reason, 'no words');
  assert.match(dead.detail, /^Cutoff has no words of its own/);
  assert.equal(deadTargetCount(row('Parts.bodyCap'), [], { control }), 1);
  assert.equal(deadTargetCount(row('Text'), []), 0, 'without the control, as before');
});

// The knob drawn, with effects on its marks: what the renderer writes (server-rendered, so no CSS runs).
function drawn(behavior, texts) {
  const control = knob(behavior);
  const partTexts = new Map(Object.entries(texts).map(([part, fields]) => [part, [{ name: 'fx', phase: 'a', effect: effect(fields) }]]));
  return render(SliderFamilyRenderer, { props: { control, width: 120, height: 120, partTexts } }).body;
}

test('a knob draws its scale numbers as pieces of an effect, one a number, in its own colour', () => {
  const html = drawn({ scaleNumberCount: 6, showTicks: false }, { tickNumber: { effect: 'typewriter', stagger: 40 } });
  const numbers = [...html.matchAll(/<text data-scale-number="" data-word-piece=""[^>]*style="([^"]*)"[^>]*>([^<]*)<\/text>/g)];
  assert.deepEqual(numbers.map((match) => match[2]), ['0', '2', '4', '6', '8', '10']);
  assert.deepEqual(numbers.map((match) => / (\d+)ms 1 normal backwards/.exec(match[1])?.[1]), ['0', '40', '80', '120', '160', '200']);
  for (const [, style] of numbers) assert.match(style, /^color:[^;]+;animation:ce-tx-\w+-0-a /);
  assert.match(html, /<g opacity="1"><text data-scale-number="" data-word-piece=""[^>]*fill="currentColor"/, 'the part\'s opacity on the group, the colour through currentColor');
  assert.doesNotMatch(html, /<clipPath id="[^"]*Word\d+"/, 'a typewriter moves nothing, so nothing is clipped');
  const still = drawn({ scaleNumberCount: 6, showTicks: false }, {});
  assert.doesNotMatch(still, /data-word-piece/);
  assert.match(still, /<text data-scale-number=""[^>]*fill="[^c][^"]*"[^>]*opacity="1"/, 'with no effect, drawn as before');
});

test('a roll clips each tick to a box about itself; a handle label is cut into letters', () => {
  const html = drawn({ scaleNumberCount: 0, showTicks: true, showHandleLabels: true },
    { tickMajor: { effect: 'roll', split: 'letter' }, labelCurrent: { effect: 'explode', split: 'letter' } });
  const clips = [...html.matchAll(/<clipPath id="([^"]+tickMajorWord\d+)"><rect /g)].map((match) => match[1]);
  assert.ok(clips.length >= 2, html);
  for (const id of clips) assert.ok(html.includes(`clip-path="url(#${id})"`), id);
  assert.match(html, /<div class="slider-label[^"]*" data-label-words="" style="[^"]*"><!--\[--><span style="display:inline-block;white-space:pre;animation:ce-tx-/);
});
