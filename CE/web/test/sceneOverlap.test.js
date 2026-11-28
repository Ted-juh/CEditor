// sceneOverlap.test.js — several clips on one place of a control (sceneModel.js, "SEVERAL CLIPS ON
// ONE PLACE"): the clip that started last decides. Fade in, then fade out; type in, then out. A later
// clip that moves what an earlier one moves does not hold its first frame from the scene's start, so
// the earlier one is seen; one that moves nothing the earlier does still holds it, as a lone clip does.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sceneEffect, sceneControlOutput, textSwitchTimes } from '../src/CE_Application/utils/sceneModel.js';

const clip = (id, controlId, target, start, effectId, length = sceneEffect(effectId).length) => ({ id, controlId, target, start, length, effect: sceneEffect(effectId).effect });
const fillOf = (value) => / (both|forwards|backwards|none)( paused)?$/.exec(value)?.[1];

test('fade in, then fade out: the fade in is seen, and the fade out holds the end', () => {
  // Out of order in the scene: they are laid down in the order they start.
  const scene = { id: 'sc', clips: [clip('out', 'lamp', 'Transform', 2000, 'move:fadeOut'), clip('in', 'lamp', 'Transform', 0, 'move:fadeIn')] };
  const [first, second] = sceneControlOutput(scene, 'lamp').parts.get('');
  assert.match(first, / 0ms 1 normal both$/, 'the fade in first, holding its first frame and its last');
  assert.match(second, / 2000ms 1 normal forwards$/, 'the fade out after it, holding only its last frame');
  const posed = sceneControlOutput(scene, 'lamp', { at: 250 }).parts.get('');
  assert.deepEqual(posed.map(fillOf), ['both', 'forwards'], 'posed at the playhead, the same');
});

test('a later clip that moves something else still holds its first frame, as a lone clip does', () => {
  const scene = { id: 'sc', clips: [clip('pulse', 'k', 'Transform', 0, 'move:pulse'), clip('in', 'k', 'Transform', 1200, 'move:fadeIn')] };
  assert.deepEqual(sceneControlOutput(scene, 'k').parts.get('').map(fillOf), ['both', 'both'], 'a scale and an opacity do not meet: the knob is not seen before it fades in');
  const rise = { id: 'sc', clips: [clip('in', 'k', 'Transform', 0, 'move:fadeIn'), clip('rise', 'k', 'Transform', 900, 'move:rise')] };
  assert.deepEqual(sceneControlOutput(rise, 'k').parts.get('').map(fillOf), ['both', 'forwards'], 'a rise moves the opacity the fade moved');
});

test('colours, a gradient\'s turn and shift, and a pattern meet as their properties do', () => {
  const flashes = { id: 'sc', clips: [clip('a', 't', 'Transform', 0, 'paint:flash'), clip('b', 't', 'Transform', 800, 'paint:flash')] };
  assert.deepEqual(sceneControlOutput(flashes, 't').colours.get('').paint.map(fillOf), ['both', 'forwards']);
  const paint = { id: 'sc', clips: [clip('turn', 'g', 'Transform', 0, 'paint:turn'), clip('sheen', 'g', 'Transform', 500, 'paint:sheen')] };
  assert.deepEqual(sceneControlOutput(paint, 'g').colours.get('').gradient.map(fillOf), ['both', 'both'], 'a turn and a shift are two properties');
  const pattern = { id: 'sc', clips: [clip('a', 'w', 'Patterns.pattern1', 0, 'pattern:fadeIn'), clip('b', 'w', 'Patterns.pattern1', 900, 'pattern:fadeOut')] };
  assert.deepEqual(sceneControlOutput(pattern, 'w').patterns.get('pattern1').map(fillOf), ['both', 'forwards']);
  const two = { id: 'sc', clips: [clip('a', 'w', 'Patterns.pattern1', 0, 'pattern:fadeIn'), clip('b', 'w', 'Patterns.pattern2', 900, 'pattern:fadeOut')] };
  const out = sceneControlOutput(two, 'w');
  assert.deepEqual([fillOf(out.patterns.get('pattern1')[0]), fillOf(out.patterns.get('pattern2')[0])], ['both', 'both'], 'two patterns are two elements');
});

test('type in, then out: the words draw the clip that has started, by the playhead or as the scene runs', () => {
  const scene = { id: 'sc', clips: [clip('in', 'w', 'Text', 0, 'text:typewriter:in'), clip('out', 'w', 'Text', 1500, 'text:typewriter:out'), clip('n', 'w', 'Parts.tickNumber', 200, 'text:roll:in')] };
  assert.deepEqual(textSwitchTimes(scene, 'w'), [1500], 'the numbers have one clip: nothing to switch');
  const at = (ms) => sceneControlOutput(scene, 'w', { at: ms }).texts.get('');
  assert.deepEqual(at(300).map((item) => [item.name, item.at]), [['in', 300]]);
  assert.deepEqual(at(0).map((item) => item.name), ['in']);
  assert.deepEqual(at(1600).map((item) => [item.name, item.effect.way]), [['out', 'out']]);
  // Running: the first until the control moves the words on, then the out, counted from that moment.
  const start = sceneControlOutput(scene, 'w', { elapsed: 0 }).texts.get('');
  assert.deepEqual(start.map((item) => [item.name, item.effect.delay]), [['in', 0]]);
  const [late] = sceneControlOutput(scene, 'w', { elapsed: 1512 }).texts.get('');
  assert.deepEqual([late.name, late.effect.delay], ['out', -12], 'the switch came 12 ms late, so the out starts 12 ms in');
  assert.deepEqual(sceneControlOutput(scene, 'w', { elapsed: 1512 }).texts.get('tickNumber').map((item) => [item.name, item.effect.delay]), [['n', 200]], 'other words keep their own clip');
});

test('one text clip on some words plays as it did', () => {
  const scene = { id: 'sc', clips: [clip('in', 'w', 'Text', 700, 'text:explode:in')] };
  const [item] = sceneControlOutput(scene, 'w', { elapsed: 900 }).texts.get('');
  assert.equal(item.effect.delay, 700, 'nothing to switch, so nothing is counted from elapsed');
  assert.deepEqual(textSwitchTimes(scene, 'w'), []);
});
