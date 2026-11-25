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

// --- A control's own value animations (the Animation tab), and presets -----------------------------

import { readValueAnimation, createKeyframePlayer } from '../src/CE_Application/utils/keyframeAnimation.js';
import { ownValuePlay } from '../src/CE_Application/utils/valueDrawn.js';
import { animationKindsFor, kindPatch, describeAnimation, describeTargets, triggerSummary, VALUE_KIND } from '../src/CE_Application/utils/animationModel.js';
import { controlScenes, effectFromPreset } from '../src/CE_Application/utils/sceneModel.js';
import { cleanPreset, PRESET_FORMAT } from '../src/CE_Application/utils/animationPresetFormat.js';
import { presetDoesNotFit } from '../src/CE_Application/utils/animationPresetModel.js';
import { animationLoopWeight } from '../src/CE_Application/utils/loopBudget.js';

const ownSweep = (over = {}) => ({ _type: 'Animation', name: 'sweep', kind: 'value', duration: 1000, delay: 0, easing: 'inOutCubic', frames: sweep.effect.frames, trigger: { type: 'script' }, targets: [{ path: VALUE_TARGET }], ...over });

test('the Animation tab offers the value kind on a knob or a slider, and switching to it makes a ring sweep', () => {
  assert.ok(animationKindsFor(createControl('Knob')).includes(VALUE_KIND));
  assert.ok(!animationKindsFor(createControl('Label')).includes(VALUE_KIND));
  const fromPulse = kindPatch(describeAnimation('a', { kind: 'keyframes', trigger: { type: 'always' }, duration: 600, frames: [{ at: 0, scale: 1 }, { at: 1, scale: 1.1 }] }), VALUE_KIND);
  assert.equal(fromPulse.kind, VALUE_KIND);
  assert.deepEqual(fromPulse.targets, [{ path: VALUE_TARGET }]);
  assert.deepEqual(fromPulse.trigger, { type: 'stateChange', from: ['*'], to: ['hover'] }, '"all the time" would never let the value be seen');
  assert.equal('duration' in fromPulse, false, 'a pulse\'s 600 ms is kept: the patch leaves it');
  assert.equal(kindPatch(describeAnimation('t', { kind: 'transition', duration: 120 }), VALUE_KIND).duration, 1200, 'a transition\'s blink becomes a sweep\'s length');
  assert.equal(valueEffectAt({ ...fromPulse, frames: fromPulse.frames }, 0.55, 0.3), 1, 'the ring sweep');
  const back = kindPatch(describeAnimation('a', ownSweep()), 'keyframes');
  assert.ok(back.frames.length >= 2 && back.frames.every((frame) => frame.value === undefined), 'back to keyframes: a pulse, not value frames');
  const row = describeAnimation('sweep', ownSweep({ iterations: 'infinite', trigger: { type: 'stateChange', to: ['hover'] } }));
  assert.equal(row.valueFrames.length, 3);
  assert.equal(triggerSummary(row), 'while hover');
  assert.equal(describeTargets(row)[0].status.works, true);
  assert.equal(describeTargets({ ...row, targets: [{ path: 'Transform' }] })[0].status.works, false);
});

test('the keyframe player plays a control\'s own value animation, and reports when its run began', () => {
  const entry = readValueAnimation(ownSweep({ delay: 100 }), 'sweep');
  assert.equal(entry.value.kind, 'value');
  assert.equal(entry.span, 1100);
  assert.equal(readValueAnimation(ownSweep({ frames: [{ at: 0 }] }), 'x'), null, 'one frame is not an animation');
  let clock = 5000;
  const player = createKeyframePlayer({ now: () => clock });
  const runtime = { keyframes: { enabled: true, reducedMotion: false, entries: [entry] }, activeStates: [], signals: {} };
  assert.equal(player.next(runtime).values.length, 0, 'a script animation waits to be asked');
  clock = 6000;
  const out = player.next(runtime, { plays: { sweep: 1 } });
  assert.equal(out.values.length, 1);
  assert.equal(out.values[0].startedAt, 6000);
  const play = ownValuePlay('knob', out.values[0]);
  assert.equal(drawnValueFor([play], 'knob', 0.3, { elapsedOf: () => 100 + 550 }).value, 1, 'its delay, then the sweep');
  assert.equal(drawnValueFor([play], 'knob', 0.3, { elapsedOf: () => 1200 }).value, null, 'and handed back');
  assert.equal(player.next(runtime, { plays: { sweep: 1 }, reducedMotion: true }).values.length, 0, 'with reduced motion it does not play');
});

test('a looping value animation runs round again, and counts two against the loop budget', () => {
  const play = ownValuePlay('knob', { name: 'w', effect: sweep.effect, phase: 'a', startedAt: 0, delay: 0, duration: 1000, iterations: 'infinite' });
  assert.equal(drawnValueFor([play], 'knob', 0.3, { elapsedOf: () => 2550 }).value, 1, 'the third run, at its peak');
  assert.equal(drawnValueFor([play], 'knob', 0.3, { elapsedOf: () => 99999 }).running, true);
  assert.equal(animationLoopWeight(ownSweep({ iterations: 'infinite' })), 2);
  assert.equal(animationLoopWeight(ownSweep()), 0);
});

test('a control\'s own value animation shows in the Designer as a scene, on what its value draws', () => {
  const knob = createControl('Knob');
  knob._children.Animations = { _type: 'Animations', enabled: true, _children: { sweep: ownSweep({ delay: 200 }) } };
  const [own] = controlScenes([knob]);
  assert.equal(own.clips[0].target, VALUE_TARGET);
  assert.equal(own.clips[0].start, 200);
  assert.equal(own.clips[0].effect.kind, 'value');
});

test('a value effect saved as a preset goes on a knob or a slider, and back into the Designer\'s library', () => {
  const preset = cleanPreset({ format: PRESET_FORMAT, version: 1, id: 'p_sweep', name: 'My sweep', animations: { sweep: ownSweep() }, states: {}, fields: {} });
  assert.ok(preset, 'the format keeps a value animation');
  assert.equal(presetDoesNotFit(preset, createControl('Knob')), '');
  assert.equal(presetDoesNotFit(preset, createControl('Slider')), '');
  assert.match(presetDoesNotFit(preset, createControl('Label')), /draws none: it goes on a knob or a slider/);
  const entry = effectFromPreset(preset);
  assert.equal(entry.target, VALUE_TARGET);
  assert.equal(entry.effect.kind, 'value');
  assert.ok(cleanClip({ id: 'c', controlId: 'k', target: entry.target, start: 0, length: entry.length, effect: entry.effect }), 'and it makes a clip');
});
