// sceneClock.test.js — scenes whose playhead is a gesture: a value, a drag, the wheel, the pointer
// (utils/sceneClock.js, utils/sceneRuntime.js; the Animation Designer, step 5c).

import test from 'node:test';
import assert from 'node:assert/strict';

import { along, createClockState, clockInput, clockStep } from '../src/CE_Application/utils/sceneClock.js';
import { cleanClock, cleanScene } from '../src/CE_Application/utils/sceneFormat.js';
import { createSceneRuntime, sceneListeners, sceneWaitsFor } from '../src/CE_Application/utils/sceneRuntime.js';

const clock = (over = {}) => cleanClock({ source: 'drag', controlId: 'knob', follow: 'exact', ...over });
const near = (actual, expected, within = 1e-3, message = '') => assert.ok(Math.abs(actual - expected) <= within, `${message} ${actual} is not ${expected}`);
/** Run a clock's frames for `ms`, 16 at a time; returns how many frames it still moved. */
function run(state, c, ms, options) {
  let moving = 0;
  for (let t = 0; t < ms; t += 16) if (clockStep(state, c, 16, options)) moving += 1;
  return moving;
}

test('a clock is stored only when something other than time drives the scene', () => {
  assert.equal(cleanClock(null), null);
  assert.equal(cleanClock({ source: 'time' }), null);
  assert.equal(cleanClock({ source: 'nonsense' }), null);
  assert.deepEqual(cleanClock({ source: 'drag', controlId: 'k' }),
    { source: 'drag', controlId: 'k', span: 130, direction: 'up', follow: 'smooth', release: 'stay' });
  assert.equal(cleanClock({ source: 'wheel', controlId: 'k' }).span, 10, 'ten notches end to end');
  assert.equal(cleanClock({ source: 'drag', span: 99999 }).span, 4000);
  assert.equal(cleanClock({ source: 'drag', span: -3 }).span, 130);
  const scene = cleanScene({ id: 's', name: 'S', length: 800, clips: [], clock: { source: 'value', controlId: 'k', follow: 'spring' } });
  assert.equal(scene.clock.source, 'value');
  assert.equal(scene.clock.follow, 'spring');
  assert.equal('clock' in cleanScene({ id: 't', name: 'T', length: 800, clips: [] }), false, 'a scene played by time carries no clock');
});

test('a drag moves the playhead by how far it went the way the clock runs', () => {
  assert.equal(along(3, -40, 'up'), 40);
  assert.equal(along(3, 40, 'down'), 40);
  assert.equal(along(-25, 9, 'left'), 25);
  assert.equal(along(25, 9, 'right'), 25);
  const c = clock();
  const state = createClockState();
  assert.equal(clockInput(state, c, 'drag', { dx: 0, dy: -65 }), false, 'no press, no drag');
  clockInput(state, c, 'press');
  clockInput(state, c, 'drag', { dx: 0, dy: -65 });
  assert.equal(state.target, 0.5, 'half the span, half the scene');
  assert.equal(state.shown, 0.5, 'exact: at once');
  clockInput(state, c, 'drag', { dx: 0, dy: -400 });
  assert.equal(state.target, 1, 'held at the end');
  clockInput(state, c, 'release', { vx: 0, vy: 0 });
  clockInput(state, c, 'press');
  clockInput(state, c, 'drag', { dx: 0, dy: 26 });
  near(state.target, 0.8, 1e-9, 'a second drag starts where the first left it');
});

test('let go, a drag stays, springs back, or carries on with its speed', () => {
  const back = clock({ release: 'back' });
  const s1 = createClockState();
  clockInput(s1, back, 'press');
  clockInput(s1, back, 'drag', { dx: 0, dy: -100 });
  clockInput(s1, back, 'release', { vx: 0, vy: 0 });
  assert.equal(s1.target, 0, 'back to the start');

  const carry = clock({ release: 'carry', span: 200 });
  const s2 = createClockState();
  clockInput(s2, carry, 'press');
  clockInput(s2, carry, 'drag', { dx: 0, dy: -40 });
  clockInput(s2, carry, 'release', { vx: 0, vy: -0.5 });
  assert.ok(s2.carry > 0, 'thrown upwards, forwards');
  run(s2, carry, 2000);
  assert.ok(s2.target > 0.5, `carried well past where it was let go: ${s2.target}`);
  assert.equal(s2.carry, 0, 'and it came to rest');

  const s3 = createClockState();
  clockInput(s3, carry, 'press', {}, { reducedMotion: true });
  clockInput(s3, carry, 'drag', { dx: 0, dy: -40 }, { reducedMotion: true });
  clockInput(s3, carry, 'release', { vx: 0, vy: -0.5 }, { reducedMotion: true });
  assert.equal(s3.carry, 0, 'with reduced motion nothing carries on');
  assert.equal(s3.shown, 0.2, 'and the scene is exactly where the hand left it');
});

test('smooth follows a little behind and settles; spring overshoots a touch and settles', () => {
  const smooth = clock({ source: 'wheel', follow: 'smooth', span: 4 });
  const s = createClockState();
  clockInput(s, smooth, 'wheel', { notches: 2 });
  assert.equal(s.target, 0.5);
  assert.equal(s.shown, 0, 'not at once');
  clockStep(s, smooth, 16);
  assert.ok(s.shown > 0 && s.shown < 0.5, `on its way: ${s.shown}`);
  const frames = run(s, smooth, 3000);
  assert.ok(frames < 100, `it stops asking for frames: ${frames}`);
  assert.equal(s.shown, 0.5);

  const spring = clock({ source: 'wheel', follow: 'spring', span: 4 });
  const p = createClockState();
  clockInput(p, spring, 'wheel', { notches: 4 });
  let most = 0;
  for (let t = 0; t < 2000; t += 16) { clockStep(p, spring, 16); most = Math.max(most, p.shown); }
  assert.ok(most > 1 && most < 1.15, `a small overshoot: ${most}`);
  assert.equal(p.shown, 1);

  const reduced = createClockState();
  clockInput(reduced, spring, 'wheel', { notches: 2 }, { reducedMotion: true });
  assert.equal(reduced.shown, 0.5, 'with reduced motion it follows exactly');
});

test('a value clock starts where the value is; the pointer drives one across or down', () => {
  const value = clock({ source: 'value', follow: 'smooth' });
  const v = createClockState();
  clockInput(v, value, 'value', { normalized: 0.7 });
  assert.equal(v.shown, 0.7, 'the first look is where it starts, not something to glide up to');
  clockInput(v, value, 'value', { normalized: 0.2 });
  assert.equal(v.target, 0.2);
  assert.equal(v.shown, 0.7, 'later changes are followed');
  assert.equal(clockInput(v, value, 'wheel', { notches: 1 }), false, 'a value clock hears only the value');

  const across = clock({ source: 'pointerX' });
  const a = createClockState();
  clockInput(a, across, 'pointer', { x: 0.25, y: 0.9, inside: true });
  assert.equal(a.shown, 0.25);
  assert.equal(clockInput(a, across, 'pointer', { inside: false }), false, 'left: it stays where it was');
  assert.equal(a.shown, 0.25);
  const down = clock({ source: 'pointerY', release: 'back' });
  const d = createClockState();
  clockInput(d, down, 'pointer', { x: 0.25, y: 0.9, inside: true });
  assert.equal(d.shown, 0.9);
  clockInput(d, down, 'pointer', { inside: false });
  assert.equal(d.shown, 0, 'back: it goes home when the pointer leaves');
});

/** Frames that come only when told: `tick(ms)` runs one at that much later. */
function fakeFrames() {
  let now = 0;
  let pending = null;
  return {
    request: (fn) => { pending = fn; return 1; },
    cancel: () => { pending = null; },
    now: () => now,
    tick(ms = 16) { now += ms; const fn = pending; pending = null; fn?.(now); return !!fn; },
    get waiting() { return !!pending; },
  };
}

const driven = (id, c, over = {}) => ({ id, name: id, trigger: { type: 'open' }, length: 1000, loop: false, clips: [], clock: cleanClock(c), ...over });

test('the runtime: a driven scene is always on show, posed where its clock is, and no trigger plays it', () => {
  const frames = fakeFrames();
  let changes = 0;
  const runtime = createSceneRuntime({ frames, onChange: () => { changes += 1; } });
  const fader = driven('f', { source: 'drag', controlId: 'pad', follow: 'smooth', span: 100 });
  runtime.setScenes([fader]);
  assert.equal(sceneWaitsFor(fader, { type: 'open' }), false);
  runtime.open();
  assert.deepEqual(runtime.plays().map((p) => [p.scene.id, p.phase, p.at]), [['f', 'a', 0]], 'at its start, posed');
  assert.equal(runtime.start('f'), false, 'a driven scene is not played by time');

  assert.deepEqual(runtime.input('other', 'press'), []);
  runtime.input('pad', 'press');
  const moved = runtime.input('pad', 'drag', { dx: 0, dy: -50 });
  assert.deepEqual(moved, ['f']);
  assert.ok(frames.waiting, 'a frame is asked for while it catches up');
  while (frames.tick()) { /* until it settles */ }
  assert.equal(runtime.plays()[0].at, 500, 'half way through the scene');
  assert.equal(frames.waiting, false, 'and once settled, no more frames');
  assert.ok(changes > 2);

  assert.equal(runtime.seek('f', 0.25), true, 'a script can still put it somewhere');
  assert.equal(runtime.plays()[0].at, 250);

  runtime.setScenes([]);
  assert.deepEqual(runtime.plays(), []);
  runtime.setScenes([fader]);
  assert.equal(runtime.plays()[0].at, 0, 'taken out and put back, it starts again from its start');
  runtime.destroy();
});

test('the runtime lists which controls each kind of input is wanted from', () => {
  const listeners = sceneListeners([
    driven('a', { source: 'value', controlId: 'k1' }),
    driven('b', { source: 'pointerX', controlId: 'k2' }),
    driven('c', { source: 'pointerY', controlId: 'k3' }),
    driven('d', { source: 'drag', controlId: 'k4' }),
    driven('e', { source: 'wheel', controlId: 'k5' }),
    { id: 's', trigger: { type: 'state', controlId: 'k6', to: 'hover' }, clips: [] },
  ]);
  assert.deepEqual([...listeners.value], ['k1']);
  assert.deepEqual([...listeners.pointer].sort(), ['k2', 'k3']);
  assert.deepEqual([...listeners.drag], ['k4']);
  assert.deepEqual([...listeners.wheel], ['k5']);
  assert.deepEqual([...listeners.state], ['k6']);
});
