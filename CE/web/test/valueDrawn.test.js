// valueDrawn.test.js — the value-drawn engine (step 6; utils/valueDrawn.js): effects that move what a
// knob's or a slider's value draws for a moment, then hand back to the value.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanClip, cleanValueFrames, VALUE_TARGET } from '../src/CE_Application/utils/sceneFormat.js';
import { SCENE_EFFECTS, sceneEffect, sceneControlOutput, targetLabel } from '../src/CE_Application/utils/sceneModel.js';
import {
  valueFrameAt, valueEffectAt, sceneDrawnValue, valueClipsEnd, drawnValueFor, controlDrawsValue, controlIsKnob,
} from '../src/CE_Application/utils/valueDrawn.js';
import { panelLoops } from '../src/CE_Application/utils/loopBudget.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const near = (actual, expected, within = 1e-6, message = '') => assert.ok(Math.abs(actual - expected) <= within, `${message} ${actual} is not ${expected}`);
const sweep = sceneEffect('value:sweep');
const clip = (over = {}) => ({ id: 'v1', controlId: 'knob', target: VALUE_TARGET, start: 0, length: 1000, effect: sweep.effect, ...over });

test('a value clip plays on what the value draws, and nothing else plays there', () => {
  const read = cleanClip(clip({ effect: { ...sweep.effect, iterations: 3, duration: 99, trigger: { type: 'x' } } }));
  assert.deepEqual(read.effect, { kind: 'value', easing: 'inOutCubic', frames: [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }] },
    'only what the engine reads is kept');
  assert.equal(cleanClip(clip({ target: 'Transform' })), null, 'a value effect on the whole control');
  assert.equal(cleanClip(clip({ effect: { kind: 'keyframes', frames: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }] } })), null, 'a keyframe effect on the value');
  assert.equal(cleanClip(clip({ effect: { kind: 'value', frames: [{ at: 0 }] } })), null, 'one frame is not an effect');
  assert.equal(targetLabel(VALUE_TARGET), 'What the value draws');
});

test('frames are read sorted and in range: a point of the range, an offset from the value, or the value', () => {
  assert.deepEqual(cleanValueFrames([{ at: 1 }, { at: 0.5, value: 7 }, { at: -2, by: -3 }, { at: 'x' }, { at: 0.7, by: 0 }]),
    [{ at: 0, by: -1 }, { at: 0.5, value: 1 }, { at: 0.7 }, { at: 1 }]);
  assert.equal(cleanValueFrames('nope'), null);
  assert.equal(valueFrameAt({ at: 0, value: 0.25 }, 0.9), 0.25);
  near(valueFrameAt({ at: 0, by: 0.2 }, 0.5), 0.7);
  assert.equal(valueFrameAt({ at: 0, by: 0.2 }, 0.95), 1, 'held in the range');
  assert.equal(valueFrameAt({ at: 0 }, 0.4), 0.4, 'neither: the value itself');
});

test('the ring sweep runs round to full and settles on the value, eased within each stretch', () => {
  const live = 0.3;
  assert.equal(valueEffectAt(sweep.effect, 0, live), 0);
  assert.equal(valueEffectAt(sweep.effect, 0.55, live), 1);
  assert.equal(valueEffectAt(sweep.effect, 1, live), live, 'handed back exactly');
  near(valueEffectAt(sweep.effect, 0.275, live), 0.5, 0.05, 'about half way to full, half way through its stretch');
  assert.ok(valueEffectAt(sweep.effect, 0.1, live) < 0.18, 'eased in, so slow to start');
  near(valueEffectAt(sweep.effect, 0.775, live), 0.65, 0.05, 'about half way back from full to the value');
  let last = -1;
  for (let p = 0; p <= 0.55; p += 0.01) { const v = valueEffectAt(sweep.effect, p, live); assert.ok(v >= last - 1e-9, `rising at ${p}`); last = v; }
});

test('every value effect in the library ends on the value: the hand-back is the engine\'s promise', () => {
  const values = SCENE_EFFECTS.filter((entry) => entry.category === 'Value');
  assert.ok(values.length >= 4, values.map((entry) => entry.label).join(', '));
  for (const entry of values) {
    assert.equal(entry.target, VALUE_TARGET, entry.id);
    assert.ok(cleanClip({ id: 'c', controlId: 'k', target: entry.target, start: 0, length: entry.length, effect: entry.effect }), `${entry.id} reads`);
    for (const live of [0, 0.37, 1]) assert.equal(valueEffectAt(entry.effect, 1, live), live, `${entry.id} at ${live}`);
  }
});

test('a scene draws its value clip while it plays, its first frame before it, and hands back after', () => {
  const scene = { id: 's', clips: [clip({ start: 200, length: 1000 }), { ...clip({ id: 'other', controlId: 'else' }) }] };
  assert.equal(sceneDrawnValue(scene, 'knob', 0, 0.4), 0, 'before it starts: its first frame');
  assert.equal(sceneDrawnValue(scene, 'knob', 750, 0.4), 1, 'at 55 %');
  assert.equal(sceneDrawnValue(scene, 'knob', 1200, 0.4), null, 'at its end: the value');
  assert.equal(sceneDrawnValue(scene, 'nobody', 750, 0.4), null);
  assert.equal(valueClipsEnd(scene, 'knob'), 1200);
  assert.equal(sceneControlOutput(scene, 'knob').parts.size, 0, 'and no CSS animation for it');
});

test('plays: posed at a moment or running; the later one wins; the hand always wins', () => {
  const scene = { id: 's', clips: [clip()] };
  const posed = drawnValueFor([{ scene, at: 550 }], 'knob', 0.2);
  assert.deepEqual(posed, { value: 1, running: false }, 'posed: drawn there, and no frames asked for');
  const running = drawnValueFor([{ scene, at: null }], 'knob', 0.2, { elapsedOf: () => 100 });
  assert.equal(running.running, true);
  assert.ok(running.value > 0 && running.value < 0.2);
  const ended = drawnValueFor([{ scene, at: null }], 'knob', 0.2, { elapsedOf: () => 1500 });
  assert.deepEqual(ended, { value: null, running: false }, 'over: the value, and the frames stop');
  const fall = { id: 'f', clips: [clip({ effect: sceneEffect('value:fall').effect })] };
  assert.equal(drawnValueFor([{ scene, at: 550 }, { scene: fall, at: 0 }], 'knob', 0.2).value, 1, 'the later play is drawn');
  assert.deepEqual(drawnValueFor([{ scene, at: null }], 'knob', 0.2, { elapsedOf: () => 100, dragging: true }), { value: null, running: true },
    'dragged: the value as it is, while the clip runs on underneath');
});

test('knobs and sliders draw a value an effect can move; a range slider, a label and a macro do not', () => {
  const knob = createControl('Knob');
  const slider = createControl('Slider');
  assert.equal(controlDrawsValue(knob), true);
  assert.equal(controlIsKnob(knob), true);
  assert.equal(controlDrawsValue(slider), true);
  assert.equal(controlIsKnob(slider), false);
  slider._children.Behavior.valueMode = 'range';
  assert.equal(controlDrawsValue(slider), false, 'two handles: which one would it move?');
  assert.equal(controlDrawsValue(createControl('Label')), false);
  assert.equal(controlDrawsValue(createControl('Macro')), false);
});

test('a looping value clip counts two against the loop budget, as a moving gradient does', () => {
  const knob = { _type: 'Knob', _children: { Core: { id: 'knob', name: 'Cutoff' } } };
  const summary = panelLoops([knob], undefined, { scenes: [{ id: 's', name: 'Idle', trigger: { type: 'panelOpen' }, loop: true, length: 1000, clips: [clip({ label: 'Wiggle' })] }] });
  assert.equal(summary.count, 2);
});
