// keyframeModel.test.js — the keyframes kind: tracks, triggers, the anime.js timeline, the player.
//
// anime.js runs in Node (its clock falls back from requestAnimationFrame), so the timeline the
// player plays is the one these tests seek, and the player itself is driven here with a real
// clock: a state change starts it, the overlay store fills, the state leaving empties it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import * as anime from 'animejs';

import {
  KEYFRAME_DEFAULTS,
  keyframeAnimations,
  isColourTarget,
  argbToRgba,
  rgbaToArgb,
  normalizeKeyframes,
  keyframesDuration,
  addKeyframe,
  removeKeyframe,
  updateKeyframe,
  triggerFires,
  triggerHeld,
  easingFunction,
  buildKeyframeTimeline,
  sampleKeyframes,
  formatAxisLabel,
} from '../src/CE_Application/utils/keyframeModel.js';
import { syncKeyframePlayer, disposeKeyframePlayer, scrubKeyframes, clearKeyframeScrub, useAnime, keyframePlayerFor } from '../src/CE_Application/utils/keyframePlayer.js';
import { keyframeOverlays } from '../src/CE_Application/stores/keyframeOverlays.js';
import { EASING_BEZIERS } from '../src/CE_Application/utils/animationModel.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rotation = (keyframes) => ({ path: 'Parts.face.Layout.rotation', properties: ['transform'], keyframes });
const colour = (keyframes) => ({ path: 'Parts.face.Background.Fill.colour', properties: ['background-color'], keyframes });

function sequence(overrides = {}) {
  return {
    kind: 'keyframes',
    enabled: true,
    duration: 1000,
    hold: true,
    loop: false,
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
    targets: [
      rotation([{ time: 0, value: 0 }, { time: 500, value: 90, easing: 'linear' }, { time: 1000, value: 0, easing: 'outQuad' }]),
      colour([{ time: 200, value: 'FFFF0000' }, { time: 800, value: 'FF0000FF', easing: 'linear' }]),
      { path: 'Parts.face.opacity', properties: ['opacity'], keyframes: [{ time: 0, value: 0.5 }] },
    ],
    ...overrides,
  };
}

const controlWith = (animations) => ({ _children: { Core: { id: 'c' }, Animations: { _type: 'Animations', enabled: true, _children: animations } } });

// --- Values and tracks ------------------------------------------------------------------------

test('colours go to anime as rgba and come back as AARRGGBB', () => {
  assert.equal(argbToRgba('80FF8000'), 'rgba(255, 128, 0, 0.502)');
  assert.equal(argbToRgba('#00FF00'), 'rgba(0, 255, 0, 1)');
  assert.equal(argbToRgba('nonsense'), 'rgba(0, 0, 0, 0)');
  assert.equal(rgbaToArgb('rgba(255, 128, 0, 0.5)'), '80FF8000');
  assert.equal(rgbaToArgb('rgb(1, 2, 3)'), 'FF010203');
  assert.equal(rgbaToArgb('ff00ff00'), 'FF00FF00');
  assert.equal(rgbaToArgb('00ff00'), 'FF00FF00');
  assert.ok(isColourTarget(colour([])));
  assert.ok(!isColourTarget(rotation([])));
});

test('a track is cleaned and sorted, never in place', () => {
  const target = rotation([{ time: 700, value: '9' }, { time: -5, value: 'x', easing: 'nonsense' }, null, { time: 300.4, value: 2, easing: 'linear' }]);
  const frames = normalizeKeyframes(target);
  assert.deepEqual(frames, [
    { time: 0, value: 0, easing: KEYFRAME_DEFAULTS.easing },
    { time: 300, value: 2, easing: 'linear' },
    { time: 700, value: 9, easing: KEYFRAME_DEFAULTS.easing },
  ]);
  assert.equal(target.keyframes.length, 4, 'the stored array is untouched');
  assert.equal(keyframesDuration(sequence()), 1000);
  assert.equal(keyframesDuration(sequence({ duration: 300 })), 1000, 'the axis reaches the last keyframe');
  assert.equal(keyframesDuration({ targets: [] }), KEYFRAME_DEFAULTS.duration);
});

test('adding, moving and removing a keyframe keep the track sorted and say where it went', () => {
  let target = rotation([{ time: 0, value: 0 }, { time: 600, value: 1 }]);
  target = addKeyframe(target, { time: 300, value: 5, easing: 'inQuad' });
  assert.deepEqual(target.keyframes.map((k) => k.time), [0, 300, 600]);
  target = addKeyframe(target, { time: 300, value: 7 });
  assert.equal(target.keyframes[1].value, 7, 'one at the same time replaces');
  const moved = updateKeyframe(target, 1, { time: 900 });
  assert.deepEqual(moved.target.keyframes.map((k) => k.time), [0, 600, 900]);
  assert.equal(moved.index, 2, 'the selection can follow it');
  const onto = updateKeyframe(moved.target, 2, { time: 600 });
  assert.deepEqual(onto.target.keyframes.map((k) => k.time), [0, 600], 'moving onto another replaces it');
  assert.equal(removeKeyframe(onto.target, 0).keyframes.length, 1);
  assert.equal(updateKeyframe(target, 9, { time: 1 }).index, -1);
  const tinted = updateKeyframe(colour([{ time: 0, value: 'FF000000' }]), 0, { value: 'rgba(255, 0, 0, 1)' });
  assert.equal(tinted.target.keyframes[0].value, 'FFFF0000', 'a colour value is stored as AARRGGBB whatever came in');
});

// --- Triggers -----------------------------------------------------------------------------------

test('a state trigger fires on entering its state, from any or a named state, and holds while it stays', () => {
  const hover = { trigger: { type: 'stateChange', from: ['*'], to: ['hover'] } };
  assert.equal(triggerFires(hover, [], ['hover']), true);
  assert.equal(triggerFires(hover, ['hover'], ['hover', 'pressed']), false, 'already there');
  assert.equal(triggerFires(hover, ['hover'], []), false, 'leaving is not entering');
  assert.equal(triggerFires({ trigger: { type: 'stateChange', from: ['pressed'], to: ['hover'] } }, [], ['hover']), false);
  assert.equal(triggerFires({ trigger: { type: 'stateChange', from: ['pressed'], to: ['hover'] } }, ['pressed'], ['hover']), true);
  assert.equal(triggerFires({ trigger: { type: 'stateChange', to: ['*'] } }, ['hover'], []), true, '* is any change');
  assert.equal(triggerFires({ trigger: { type: 'valueChange' } }, [], ['hover']), false);
  assert.equal(triggerHeld(hover, ['hover', 'pressed']), true);
  assert.equal(triggerHeld(hover, ['pressed']), false);
  assert.equal(triggerHeld({ trigger: { to: ['*'] } }, ['hover']), false, 'nothing specific to hold on');
});

// --- The timeline -------------------------------------------------------------------------------

test('the easing a keyframe arrives with is the same bezier the CSS transition gets', () => {
  const out = easingFunction('outQuad');
  assert.equal(out(0), 0);
  assert.equal(out(1), 1);
  assert.ok(out(0.25) > 0.25, 'out-easing is fast at the start');
  assert.equal(easingFunction('nonsense')(0.3), 0.3, 'unknown is linear');
  assert.ok(EASING_BEZIERS.outQuad);
});

test('the timeline poses every track at any time, holds before the first keyframe and after the last', () => {
  const animation = sequence();
  const at = (t) => sampleKeyframes(anime, animation, t);
  assert.deepEqual(at(0), { 'Parts.face.Layout.rotation': 0, 'Parts.face.Background.Fill.colour': 'FFFF0000', 'Parts.face.opacity': 0.5 });
  assert.equal(at(250)['Parts.face.Layout.rotation'], 45, 'linear to 90 at 500');
  assert.ok(Math.abs(at(500)['Parts.face.Layout.rotation'] - 90) < 0.001);
  assert.equal(at(100)['Parts.face.Background.Fill.colour'], 'FFFF0000', 'held until its first keyframe at 200');
  assert.equal(at(500)['Parts.face.Background.Fill.colour'], 'FFB400B4', 'halfway red to blue, linear');
  assert.equal(at(900)['Parts.face.Background.Fill.colour'], 'FF0000FF', 'held after the last');
  assert.equal(at(1000)['Parts.face.opacity'], 0.5, 'one keyframe is a constant');
  assert.ok(Math.abs(at(1000)['Parts.face.Layout.rotation']) < 0.001, 'back to 0 at the end');
  const built = buildKeyframeTimeline(anime, sequence({ duration: 2000 }));
  assert.equal(built.duration, 2000, 'the axis runs the full length even when the keyframes end early');
  assert.equal(built.tracks.length, 3);
  assert.equal(buildKeyframeTimeline(anime, { targets: [{ path: '', keyframes: [{ time: 0, value: 1 }] }] }).tracks.length, 0, 'a track with no path is skipped');
});

test('keyframeAnimations lists only enabled keyframes animations', () => {
  const control = controlWith({ a: sequence(), b: sequence({ enabled: false }), c: { kind: 'spring', targets: [] }, d: null });
  assert.deepEqual(keyframeAnimations(control).map(([name]) => name), ['a']);
  assert.deepEqual(keyframeAnimations({ _children: { Animations: { enabled: false, _children: { a: sequence() } } } }), []);
});

// --- The player ---------------------------------------------------------------------------------

test('entering the state plays the sequence into the overlay store; leaving it clears the pose', async () => {
  useAnime(anime);
  const control = controlWith({ glow: sequence() });
  syncKeyframePlayer('c', control, { activeStates: [], valueNormalized: 0 });
  assert.equal(get(keyframeOverlays).c, undefined, 'mounting fires nothing');

  syncKeyframePlayer('c', control, { activeStates: ['hover'], valueNormalized: 0 });
  await sleep(250);
  const mid = get(keyframeOverlays).c;
  assert.ok(mid, 'the overlay is being written');
  assert.ok(mid['Parts.face.Layout.rotation'] > 10 && mid['Parts.face.Layout.rotation'] < 90, `rotation on its way: ${mid['Parts.face.Layout.rotation']}`);
  assert.equal(mid['Parts.face.opacity'], 0.5);

  // Node's clock for anime.js is a timer, not a frame, and runs a little slow: wait well past the end.
  await sleep(1400);
  const end = get(keyframeOverlays).c;
  assert.ok(end, 'held on the last frame while hover stays');
  assert.ok(Math.abs(end['Parts.face.Layout.rotation']) < 0.5, `landed: ${end['Parts.face.Layout.rotation']}`);

  syncKeyframePlayer('c', control, { activeStates: [], valueNormalized: 0 });
  assert.equal(get(keyframeOverlays).c, undefined, 'hover left: the pose went with it');
  assert.ok(keyframePlayerFor('c'));
  disposeKeyframePlayer('c');
  assert.equal(keyframePlayerFor('c'), null);
});

test('a sequence that does not hold clears itself at the end; a value trigger follows the value', async () => {
  useAnime(anime);
  const control = controlWith({
    blink: sequence({ hold: false, duration: 200, targets: [rotation([{ time: 0, value: 0 }, { time: 200, value: 10, easing: 'linear' }])] }),
    sweep: sequence({ trigger: { type: 'valueChange', source: 'value.normalized' }, targets: [rotation([{ time: 0, value: 0 }, { time: 1000, value: 100, easing: 'linear' }])] }),
  });
  syncKeyframePlayer('v', control, { activeStates: [], valueNormalized: 0.25 });
  await sleep(20);
  assert.equal(get(keyframeOverlays).v['Parts.face.Layout.rotation'], 25, 'the value trigger poses on mount');

  syncKeyframePlayer('v', control, { activeStates: ['hover'], valueNormalized: 0.25 });
  await sleep(60);
  assert.ok(get(keyframeOverlays).v['Parts.face.Layout.rotation'] > 0, 'the blink is running on top');
  await sleep(600);
  assert.equal(get(keyframeOverlays).v['Parts.face.Layout.rotation'], 25, 'the blink cleared itself; the sweep remains');

  syncKeyframePlayer('v', control, { activeStates: ['hover'], valueNormalized: 0.5 });
  await sleep(20);
  assert.equal(get(keyframeOverlays).v['Parts.face.Layout.rotation'], 50);

  syncKeyframePlayer('v', control, { activeStates: ['hover'], valueNormalized: 0.5, enabled: false });
  assert.equal(get(keyframeOverlays).v, undefined, 'animations off: nothing posed');
  disposeKeyframePlayer('v');
});

test('the scrub poses a control with no player at all, and is cleared on its own', async () => {
  useAnime(anime);
  scrubKeyframes('s', 'glow', sequence(), 250);
  await sleep(20);
  assert.equal(get(keyframeOverlays).s['Parts.face.Layout.rotation'], 45);
  scrubKeyframes('s', 'glow', sequence(), 500);
  assert.ok(Math.abs(get(keyframeOverlays).s['Parts.face.Layout.rotation'] - 90) < 0.001, 'the same build seeks again');
  clearKeyframeScrub('s');
  assert.equal(get(keyframeOverlays).s, undefined);
});

test('a sequence that follows the value leaves a mainValue track out; other channels and frames play', () => {
  const animation = sequence({
    trigger: { type: 'valueChange', source: 'value.normalized' },
    targets: [
      { path: 'ValueChannels.mainValue', properties: ['channel'], keyframes: [{ time: 0, value: 0 }, { time: 1000, value: 1, easing: 'linear' }] },
      { path: 'ValueChannels.glow', properties: ['channel'], keyframes: [{ time: 0, value: 0 }, { time: 1000, value: 10, easing: 'linear' }] },
      { path: 'Parts.strip.Image.frameIndex', properties: ['frame'], keyframes: [{ time: 0, value: 0 }, { time: 1000, value: 7, easing: 'linear' }] },
    ],
  });
  const pose = sampleKeyframes(anime, animation, 500);
  assert.deepEqual(Object.keys(pose), ['ValueChannels.glow', 'Parts.strip.Image.frameIndex']);
  assert.equal(pose['ValueChannels.glow'], 5);
  assert.equal(pose['Parts.strip.Image.frameIndex'], 3.5, 'the renderer rounds the frame');
  const played = sampleKeyframes(anime, { ...animation, trigger: { type: 'stateChange', to: ['hover'] } }, 500);
  assert.equal(played['ValueChannels.mainValue'], 0.5, 'a state-triggered sequence may drive the value');
});

test('the ruler says its unit: milliseconds under a second, seconds from there', () => {
  assert.equal(formatAxisLabel(0), '0 ms');
  assert.equal(formatAxisLabel(250), '250 ms');
  assert.equal(formatAxisLabel(999.6), '1000 ms');
  assert.equal(formatAxisLabel(1000), '1 s');
  assert.equal(formatAxisLabel(1500), '1.5 s');
  assert.equal(formatAxisLabel(2250), '2.25 s');
  assert.equal(formatAxisLabel('x'), '0 ms');
});
