// anatomyWords.test.js — text effects on the words a knob or slider draws for itself: its scale's
// numbers and ticks, one piece a mark, and the labels on its handles (utils/anatomyWords.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  SLIDER_WORD_PARTS, sliderWordParts, sliderWordsPlace, sliderWordsRefusal, markPieceStyles, markClipBox, markGeometry, knobFormOf, sliderMarkCount,
} from '../src/CE_Application/utils/anatomyWords.js';
import ControlAnatomy from '../src/CE_Application/editor/ControlAnatomy.svelte';
import InteractivePartRenderer from '../src/CE_Application/editor/InteractivePartRenderer.svelte';
import { sliderControlSnapshot } from '../src/CE_Application/utils/sliderControlPart.js';
import { anatomyOptions, isIllustratedForm } from '../src/CE_Application/models/controlAnatomy.js';
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

test('a fly or a fan moves each mark about the dial\'s centre; any other effect, about itself', () => {
  const around = { centre: { x: 50, y: 50 }, points: [{ x: 20, y: 80 }, { x: 50, y: 10 }, { x: 80, y: 80 }] };
  const fly = effect({ effect: 'fly', way: 'in' });
  assert.deepEqual(markGeometry(fly, around), [
    '--ce-fly-x:30px;--ce-fly-y:-30px;', '--ce-fly-x:0px;--ce-fly-y:40px;', '--ce-fly-x:-30px;--ce-fly-y:-30px;',
  ], 'going in, each starts at the centre');
  assert.deepEqual(markGeometry(effect({ effect: 'fly', way: 'out' }), around)[1], '--ce-fly-out-x:0px;--ce-fly-out-y:-36px;', 'going out, on along its own line, by a pair of its own');
  const fan = markGeometry(effect({ effect: 'fan', way: 'in' }), around);
  assert.deepEqual(fan.map((style) => /--ce-fan-turn:(-?\d+)deg/.exec(style)[1]), ['0', '-135', '-270'], 'each turned back to the first mark');
  for (const style of fan) assert.match(style, /transform-box:view-box;transform-origin:50px 50px;$/);
  assert.deepEqual(markGeometry(effect({ effect: 'roll' }), around), []);
  assert.deepEqual(markGeometry(fly, null), [], 'off a dial, the effect\'s own fallback');
  const styles = markPieceStyles(fly, ['0', '5', '10'], { phase: 'a', geometry: around });
  assert.match(styles[0], /transform-origin:center;--ce-fly-x:30px;--ce-fly-y:-30px;$/, 'after the piece\'s own, so the dial\'s wins');
});

test('a knob\'s marks fly in from its centre, and fan about it', () => {
  const html = drawn({ scaleNumberCount: 3, showTicks: false }, { tickNumber: { effect: 'fan', way: 'in' } });
  const turns = [...html.matchAll(/--ce-fan-turn:(-?[\d.]+)deg;transform-box:view-box;transform-origin:([\d.]+)px ([\d.]+)px;/g)];
  assert.equal(turns.length, 3);
  assert.deepEqual(turns.map((m) => [m[2], m[3]]), [['60', '60'], ['60', '60'], ['60', '60']], 'about the dial of a 120 box');
  assert.deepEqual(turns.map((m) => Math.round(Number(m[1]))), [0, -135, -270], 'the scale is 270°, from its first number');
});

test('a knob throws the words its emit animation made, from the tip or the centre, and its readout sits in the cap', () => {
  const control = knob({ min: 0, max: 10, precision: 1, showHandleLabels: false });
  const word = (fields) => ({ id: 1, name: 'stream', at: performance.now(), value: 0.75, from: 0.5, turn: 1,
    emit: { shows: 'value', from: 'tip', direction: 'pointer', travel: 36, size: 12, colour: null, duration: 700, delay: 0, easing: 'ease-out', ...fields } });
  const thrown = render(SliderFamilyRenderer, { props: { control, width: 120, height: 120, emits: [word({})] } }).body;
  const one = /<div class="slider-label emit-word[^"]*" data-emitted-word="" style="([^"]*)">([^<]*)<\/div>/.exec(thrown);
  assert.ok(one, thrown);
  assert.equal(one[2], '7.5');
  assert.match(one[1], /font-size:12px;--ce-emit-x:[-\d.]+px;--ce-emit-y:[-\d.]+px;animation-duration:700ms;animation-delay:0ms;animation-timing-function:ease-out, /);
  const [x, y] = [Number(/left:([-\d.]+)px/.exec(one[1])[1]), Number(/top:([-\d.]+)px/.exec(one[1])[1])];
  assert.ok(Math.hypot(x - 60, y - 60) > 40, `past the pointer's tip: ${x}, ${y}`);
  const delta = render(SliderFamilyRenderer, { props: { control, width: 120, height: 120, emits: [word({ shows: 'delta', from: 'centre', direction: 'up' })] } }).body;
  const two = /data-emitted-word="" style="([^"]*)">([^<]*)</.exec(delta);
  assert.equal(two[2], '+2.5', 'the change since the last word, signed');
  assert.match(two[1], /^left:60\.0px;top:60\.0px;.*--ce-emit-x:0\.0px;--ce-emit-y:-36\.0px;/, 'from the centre, straight up');
  const down = render(SliderFamilyRenderer, { props: { control, width: 120, height: 120, emits: [{ ...word({ shows: 'delta' }), value: 0.25 }] } }).body;
  assert.match(down, /data-emitted-word=""[^>]*>\u22122\.5</, 'a fall is a minus sign, not a hyphen');
  const none = render(SliderFamilyRenderer, { props: { control, width: 120, height: 120 } }).body;
  assert.doesNotMatch(none, /data-emitted-word/);
  const landed = render(SliderFamilyRenderer, { props: { control, width: 120, height: 120, emits: [{ ...word({}), at: performance.now() - 900 }] } }).body;
  assert.doesNotMatch(landed, /data-emitted-word/, 'a word that has flown is not drawn, whenever the player is next asked');

  const capped = knob({ showHandleLabels: true });
  capped._children.Parts = { ...(capped._children.Parts ?? {}) };
  const tipped = render(SliderFamilyRenderer, { props: { control: capped, width: 120, height: 120 } }).body;
  const at = (html) => /class="slider-label[^"]*"[^>]*style="[^"]*left:\s*([-\d.]+)px;\s*top:\s*([-\d.]+)px/.exec(html)?.slice(1).map(Number);
  assert.ok(at(tipped), tipped);
  assert.notDeepEqual(at(tipped), [60, 60], 'by default, at the tip');
});

// --- On a slider's track (2026-11-26, the Components showcase's Slider) ---------------------------

test('on a slider a fly comes in from the side and goes out to it, and a fan slides up the track from the first mark', () => {
  const along = { linear: true, points: [{ x: 70, y: 180 }, { x: 70, y: 100 }, { x: 60, y: 20 }], origins: [{ x: 60, y: 180 }, { x: 60, y: 100 }, { x: 60, y: 20 }], normal: { x: 1, y: 0 } };
  assert.deepEqual(markGeometry(effect({ effect: 'fly', way: 'in' }), along), [
    '--ce-fly-x:40px;--ce-fly-y:0px;', '--ce-fly-x:40px;--ce-fly-y:0px;', '--ce-fly-x:40px;--ce-fly-y:0px;',
  ], 'from 40 px out, along the line from the track through it; one on the track goes along the normal');
  assert.equal(markGeometry(effect({ effect: 'fly', way: 'out' }), along)[0], '--ce-fly-out-x:40px;--ce-fly-out-y:0px;');
  assert.deepEqual(markGeometry(effect({ effect: 'fan', way: 'in' }), along), [
    '--ce-fan-x:0px;--ce-fan-y:0px;--ce-fan-turn:0deg;', '--ce-fan-x:0px;--ce-fan-y:80px;--ce-fan-turn:0deg;', '--ce-fan-x:10px;--ce-fan-y:160px;--ce-fan-turn:0deg;',
  ], 'each from the first mark\'s place, unturned');
});

const fader = (behavior = {}, parts = {}) => {
  const control = createControl('Slider', { Core: { id: 's1', name: 'Level' } });
  Object.assign(control._children.Behavior, { orientation: 'vertical', ...behavior });
  for (const [name, fields] of Object.entries(parts)) Object.assign(control._children.Parts._children[name], fields);
  return control;
};
const cap = (html) => /<circle data-pointer="current" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(html)?.slice(1).map(Number);

test('a vertical slider\'s readout starts just past its cap and reads away from it', () => {
  const html = render(SliderFamilyRenderer, { props: { control: fader({ showHandleLabels: true }), width: 120, height: 200 } }).body;
  const [cx, , r] = cap(html);
  const label = /class="slider-label[^"]*"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
  assert.match(label, /transform:translate\(0, -50%\)/, 'its left edge at the anchor, not its middle');
  assert.equal(Number(/left:([\d.]+)px/.exec(label)[1]), cx + r + 6, 'past the cap\'s edge');
  const flat = render(SliderFamilyRenderer, { props: { control: fader({ orientation: 'horizontal', showHandleLabels: true }), width: 200, height: 80 } }).body;
  assert.doesNotMatch(/class="slider-label[^"]*"[^>]*style="([^"]*)"/.exec(flat)[1], /translate\(0, -50%\)/, 'above a horizontal one, centred as before');
});

test('a fader cap draws its lift about its own centre, and nothing when it has none', () => {
  const still = render(SliderFamilyRenderer, { props: { control: fader(), width: 120, height: 200 } }).body;
  assert.doesNotMatch(still, /scale:/, 'a slider\'s own states patch Layout.scale, which a fader cap does not draw');
  const lifted = fader({}, { pointerCurrent: { _children: { ...createControl('Slider')._children.Parts._children.pointerCurrent._children, Layout: { ...createControl('Slider')._children.Parts._children.pointerCurrent._children.Layout, lift: 1.12 } } } });
  const html = render(SliderFamilyRenderer, { props: { control: lifted, width: 120, height: 200 } }).body;
  const [cx, cy] = cap(html);
  assert.match(html, new RegExp(`<g style="transform-origin:${cx.toFixed(2)}px ${cy.toFixed(2)}px;scale:1.12">`));
});

test('a fader throws its words out from beside its cap, away from the track', () => {
  const word = { id: 1, name: 'stream', at: performance.now(), value: 0.5, from: 0.25, turn: 1,
    emit: { shows: 'value', from: 'tip', direction: 'pointer', travel: 24, size: 12, colour: null, duration: 700, delay: 0, easing: 'ease-out' } };
  const html = render(SliderFamilyRenderer, { props: { control: fader({ min: 0, max: 10, precision: 1 }), width: 120, height: 200, emits: [word] } }).body;
  const [cx, , r] = cap(html);
  const style = /data-emitted-word="" style="([^"]*)">([^<]*)</.exec(html);
  assert.equal(style[2], '5.0');
  assert.equal(Number(/left:([\d.]+)px/.exec(style[1])[1]), Number((cx + r + 6).toFixed(1)));
  assert.match(style[1], /transform:translate\(0, -50%\);--ce-emit-x:24\.0px;--ce-emit-y:0\.0px;/, 'out to the right, reading away from the cap');
  const up = render(SliderFamilyRenderer, { props: { control: fader({ min: 0, max: 10, precision: 1 }), width: 120, height: 200, emits: [{ ...word, emit: { ...word.emit, direction: 'up' } }] } }).body;
  assert.match(up, /--ce-emit-x:0\.0px;--ce-emit-y:-24\.0px;/);
});

// --- A knob drawn as a form (ControlAnatomy), and one carried by a component's part -----------------

const formKnob = (form, core = {}) => {
  const control = knob({}, 'Dial');
  Object.assign(control._children.Core, { controlForm: form, ...core });
  return control;
};

test('a knob drawn as a form offers its readout, then its ring of ticks, and says what it draws when asked for more', () => {
  assert.equal(knobFormOf(formKnob('pointer')), 'pointer');
  assert.equal(knobFormOf(knob()), '', 'one drawn from its parts');
  assert.deepEqual(sliderWordParts(formKnob('pointer')), ['labelCurrent', 'tickMajor']);
  assert.deepEqual(sliderWordParts(formKnob('disc')), ['labelCurrent'], 'a disc has no ring of ticks');
  assert.deepEqual(sliderWordParts(formKnob('disc', { formShowValue: false })), []);
  assert.equal(sliderWordsPlace(formKnob('halo')), 'Parts.labelCurrent');
  assert.equal(sliderWordsRefusal(formKnob('halo'), 'tickMajor'), '');
  assert.match(sliderWordsRefusal(formKnob('halo'), 'tickNumber'), /^Dial is drawn as a form \("halo"\): a text effect plays on its readout or its ring of ticks\. Convert it to parts/);
  assert.match(sliderWordsRefusal(formKnob('disc', { formShowValue: false }), ''), /which shows no words now/);
  assert.equal(sliderMarkCount(formKnob('pointer', { formDivisions: 24 }), 'tickMajor'), 25, 'its divisions and one');
});

test('a form plays an effect on its ticks one a tick, and on its readout whole, painting with currentColor', () => {
  const draw = (form, texts) => render(ControlAnatomy, { props: { control: formKnob(form), width: 120, height: 128,
    partTexts: new Map(Object.entries(texts).map(([part, fields]) => [part, [{ name: 'fx', phase: 'a', effect: effect(fields) }]])) } }).body;
  const ticks = draw('pointer', { tickMajor: { effect: 'typewriter', stagger: 30 } });
  const lines = [...ticks.matchAll(/<line [^>]*stroke="currentColor"[^>]*style="([^"]*)"[^>]*data-word-piece=""/g)].map((match) => match[1]);
  assert.equal(lines.length, 13, 'twelve divisions: thirteen ticks');
  assert.deepEqual(lines.slice(0, 3).map((style) => / (\d+)ms 1 normal/.exec(style)?.[1]), ['0', '30', '60']);
  const readout = draw('disc', { labelCurrent: { effect: 'explode' } });
  assert.match(readout, /<text [^>]*fill="currentColor"[^>]*style="color:[^;]+;animation:ce-tx-/);
  const still = draw('disc', {});
  assert.doesNotMatch(still, /data-word-piece/);
});

test('a knob carried by a component\'s part plays an effect on that part on its first words', () => {
  const carried = sliderControlSnapshot(knob({ scaleNumberCount: 6 }));
  const item = { name: 'fx', phase: 'a', effect: effect({ effect: 'typewriter', stagger: 40 }) };
  const html = render(InteractivePartRenderer, {
    props: {
      part: { kind: 'slidercontrol', visible: true, meta: { sliderControl: { control: carried, value: 0.5 } }, _children: { Layout: { x: 0, y: 0, width: 100, height: 100, xUnit: 'px', yUnit: 'px', anchorX: 'left', anchorY: 'top' } } },
      partName: 'k', parentWidth: 100, parentHeight: 100, textEffect: item,
    },
  }).body;
  const numbers = [...html.matchAll(/<text data-scale-number="" data-word-piece=""[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  assert.deepEqual(numbers, ['0', '2', '4', '6', '8', '10']);
});

test('a roll or a push moves a form\'s tick or readout through a box about it, on a group that stays still', () => {
  const draw = (form, texts) => render(ControlAnatomy, { props: { control: formKnob(form), width: 120, height: 128,
    partTexts: new Map(Object.entries(texts).map(([part, fields]) => [part, [{ name: 'fx', phase: 'a', effect: effect(fields) }]])) } }).body;
  const rolled = draw('pointer', { tickMajor: { effect: 'roll' } });
  const tickClips = [...rolled.matchAll(/<g clip-path="url\(#([^)]+-tk62-\d+)\)"[^>]*><clipPath id="\1"><rect [^>]*><\/rect><\/clipPath>\s*<line [^>]*data-word-piece=""/g)];
  assert.equal(tickClips.length, 13, 'each tick in a box of its own');
  const pushed = draw('disc', { labelCurrent: { effect: 'push' } });
  assert.match(pushed, /<g clip-path="url\(#([^)]+-ro164)\)"[^>]*><clipPath id="\1"><rect [^>]*><\/rect><\/clipPath><text [^>]*data-word-piece=""/);
  const typed = draw('pointer', { tickMajor: { effect: 'typewriter' }, labelCurrent: { effect: 'typewriter' } });
  assert.doesNotMatch(typed, /-tk62-|-ro164/, 'a typewriter moves nothing, so nothing is clipped');
  const illustrated = anatomyOptions('Knob').map(([id]) => id).find((id) => isIllustratedForm(id));
  const design = draw(illustrated, { labelCurrent: { effect: 'roll' } });
  assert.match(design, /clip-path="url\(#[^)]+-ro16\d\)"/, `${illustrated}'s readout clipped too`);
});
