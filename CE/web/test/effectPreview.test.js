// effectPreview.test.js — what a library card's preview plays (utils/effectPreview.js): each kind of
// effect on a stand-in of what it plays on, through the engines a control plays it through.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { previewKind, previewOf, scenePresetPreview, PREVIEW_REST, PREVIEW_WORD } from '../src/CE_Application/utils/effectPreview.js';
import { SCENE_EFFECTS, sceneEffect, effectFromPreset } from '../src/CE_Application/utils/sceneModel.js';
import { BUILT_IN_SCENE_PRESETS } from '../src/CE_Application/utils/scenePreset.js';
import EffectPreview from '../src/CE_Application/components/animation/EffectPreview.svelte';

test('every library effect has a stand-in, of the kind of thing it plays on', () => {
  const kinds = new Map(SCENE_EFFECTS.map((entry) => [entry.id, previewKind(entry)]));
  assert.ok([...kinds.values()].every((kind) => ['box', 'word', 'pattern', 'ring'].includes(kind)), JSON.stringify([...kinds]));
  assert.equal(kinds.get('move:pop'), 'box');
  assert.equal(kinds.get('text:typewriter:in'), 'word');
  assert.equal(kinds.get('pattern:pulse'), 'pattern');
  assert.equal(kinds.get('value:sweep'), 'ring');
  assert.equal(previewKind({ effect: { kind: 'transition' } }), 'none', 'a transition eases a state change, which a stand-in has not');
  assert.equal(previewKind({ target: 'Parts.band.Patterns.pattern1', effect: { kind: 'keyframes' } }), 'pattern');
});

test('a move plays on the box, a paint on its fill, an image under it, through the keyframe engine', () => {
  const pop = previewOf(sceneEffect('move:pop'), { phase: 'b' });
  assert.match(pop.box, /^animation:ce-kf-\w+-b /);
  assert.equal(pop.fill, '');
  assert.match(pop.rules, /@keyframes ce-kf-\w+-b\{/);
  assert.equal(pop.period, sceneEffect('move:pop').length + PREVIEW_REST);
  const drift = previewOf(sceneEffect('paint:imageDrift'));
  assert.match(drift.image, /^animation:ce-kf-image-/);
  assert.equal(drift.box, '', 'the box itself stays put');
  const gradient = SCENE_EFFECTS.find((entry) => (entry.effect.frames ?? []).some((frame) => frame.turn !== undefined || frame.shift !== undefined));
  if (gradient) {
    const sheen = previewOf(gradient);
    assert.equal(sheen.gradient, true);
    assert.match(sheen.fill, /ce-kf-gradient-/);
  }
});

test('a text effect cuts the word as a Label\'s are, a piece after the last, and waits for its delay', () => {
  const typed = previewOf(sceneEffect('text:typewriter:in'));
  assert.equal(typed.pieces.map((piece) => piece.text).join(''), PREVIEW_WORD);
  const delays = typed.pieces.map((piece) => Number(/ (-?\d+)ms 1 normal/.exec(piece.style)?.[1]));
  assert.deepEqual(delays, [0, 45, 90, 135]);
  assert.match(typed.rules, /@keyframes ce-tx-/);
  const later = previewOf(sceneEffect('text:typewriter:in'), { delay: 200 });
  assert.equal(Number(/ (-?\d+)ms 1 normal/.exec(later.pieces[0].style)?.[1]), 200);
  assert.equal(later.period, typed.period + 200);
});

test('a scene preset plays on stand-ins: one a slot, or three of one that repeats, each a stagger after the last', () => {
  const sweep = BUILT_IN_SCENE_PRESETS.find((preset) => preset.id === 'builtin:knobsSweepIn');
  const shown = scenePresetPreview(sweep, { stagger: 150 });
  assert.equal(shown.minis.length, 3);
  assert.deepEqual(shown.minis.map((mini) => mini.delay), [0, 150, 300]);
  assert.ok(shown.minis.every((mini) => previewKind(mini.entry) === 'ring'));
  assert.equal(shown.period, 300 + shown.minis[2].entry.length + PREVIEW_REST);
  assert.deepEqual(scenePresetPreview(null), { minis: [], period: PREVIEW_REST });
});

test('drawn at rest it is still, on the stand-in of its kind; a preset of yours previews as its first animation', () => {
  const still = render(EffectPreview, { props: { entry: sceneEffect('move:pop') } }).body;
  assert.match(still, /data-preview="box"/);
  assert.doesNotMatch(still, /animation:|<style>/, 'nothing moves until its card is pointed at');
  const word = render(EffectPreview, { props: { entry: sceneEffect('text:typewriter:in') } }).body;
  assert.match(word, />Text</);
  const ring = render(EffectPreview, { props: { entry: sceneEffect('value:sweep'), small: true } }).body;
  assert.match(ring, /data-preview="ring"[^>]*>/);
  assert.match(ring, /class="pv [^"]*small/);
  assert.match(ring, /data-ring-value="0\.350"/, 'at rest, the live value');
  const preset = { animations: { a: { _type: 'Animation', name: 'a', kind: 'keyframes', duration: 500, frames: [{ at: 0, scale: 1 }, { at: 1, scale: 1.2 }], targets: [{ path: 'Transform' }] } } };
  assert.equal(previewKind(effectFromPreset(preset)), 'box', 'a preset of your own previews as its first animation');
});
