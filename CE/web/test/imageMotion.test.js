// imageMotion.test.js — a fill's image that moves under keyframes: panned, zoomed, turned (the
// `image` channel of utils/keyframeAnimation.js), the picture moving inside its clip.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanFrames, readKeyframes, channelFrames, colourKeyframesRule, colourAnimationValue, colourVariables,
  IMAGE_CHANNEL, FRAME_IMAGE,
} from '../src/CE_Application/utils/keyframeAnimation.js';
import { sceneEffect, sceneControlOutput } from '../src/CE_Application/utils/sceneModel.js';

const drift = (frames) => readKeyframes({ kind: 'keyframes', name: 'drift', duration: 4000, iterations: 'infinite', trigger: { type: 'always' }, frames }, 'drift');

test('a frame can pan, zoom and turn the image: kept in range, and nothing else read as one', () => {
  assert.deepEqual([...FRAME_IMAGE], ['panX', 'panY', 'zoom', 'spin']);
  assert.deepEqual(cleanFrames([{ at: 0, panX: 500, zoom: 0, spin: 9000 }, { at: 1, panY: -20, zoom: 1.2 }]),
    [{ at: 0, panX: 200, zoom: 0.1, spin: 3600 }, { at: 1, panY: -20, zoom: 1.2 }]);
});

test('image frames are a channel of their own, moving the picture with its own translate, scale and rotate', () => {
  const entry = drift([{ at: 0, zoom: 1, panX: 0 }, { at: 1, zoom: 1.15, panX: -5, panY: 3 }]);
  assert.equal(entry.moves, false, 'the control itself does not move');
  assert.equal(channelFrames(entry, IMAGE_CHANNEL).length, 2);
  const rule = colourKeyframesRule(entry, IMAGE_CHANNEL, 'a');
  assert.match(rule, /@keyframes ce-kf-image-\w+-a\{0%\{translate:0% 0%;scale:1\}100%\{translate:-5% 3%;scale:1\.15\}\}/, rule);
  assert.match(colourAnimationValue(entry, IMAGE_CHANNEL, 'a'), /^ce-kf-image-\w+-a /);
  const vars = colourVariables(new Map([['', { paint: [], shape: [], stroke: [], text: [], gradient: [], image: ['x 1s'] }]]).get(''));
  assert.match(vars, /--ce-kf-image:x 1s;/);
});

test('a frame that only turns writes only rotate, so a pan before it holds', () => {
  const entry = drift([{ at: 0, spin: 0 }, { at: 1, spin: 90 }]);
  assert.match(colourKeyframesRule(entry, IMAGE_CHANNEL, 'a'), /0%\{rotate:0deg\}100%\{rotate:90deg\}/);
});

test('the library\'s image drift, in a scene, plays on the control\'s image', () => {
  const entry = sceneEffect('paint:imageDrift');
  assert.ok(entry, 'there is one');
  assert.equal(entry.category, 'Paint');
  const out = sceneControlOutput({ id: 's', clips: [{ id: 'c', controlId: 'k', target: 'Transform', start: 0, length: 3000, effect: entry.effect }] }, 'k', { at: 1500 });
  assert.equal(out.colours.get('').image.length, 1);
  assert.equal(out.parts.size, 0, 'nothing on the control itself');
});
