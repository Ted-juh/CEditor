// sceneRuntime.test.js — panel scenes playing on their triggers (utils/sceneRuntime.js, step 5b).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneRuntime, sceneWaitsFor, sceneListeners } from '../src/CE_Application/utils/sceneRuntime.js';

/** A clock that runs only when told: `advance(ms)` fires what falls due. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    set: (fn, ms) => { const id = next++; pending.set(id, { fn, at: now + ms }); return id; },
    clear: (id) => pending.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    get pending() { return pending.size; },
  };
}

const scene = (id, trigger, over = {}) => ({ id, name: id, trigger, length: 1000, loop: false, clips: [], ...over });
const brief = (runtime) => runtime.plays().map((p) => [p.scene.id, p.phase, p.at]);

test('a trigger is matched by kind, control, and state or gesture', () => {
  const hover = scene('h', { type: 'state', controlId: 'knob', to: 'hover' });
  assert.equal(sceneWaitsFor(hover, { type: 'state', controlId: 'knob', to: 'Hover' }), true, 'a state name in any case');
  assert.equal(sceneWaitsFor(hover, { type: 'state', controlId: 'other', to: 'hover' }), false);
  assert.equal(sceneWaitsFor(hover, { type: 'state', controlId: 'knob', to: 'pressed' }), false);
  const click = scene('c', { type: 'event', controlId: 'pad', event: 'click' });
  assert.equal(sceneWaitsFor(click, { type: 'event', controlId: 'pad', event: 'click' }), true);
  assert.equal(sceneWaitsFor(click, { type: 'event', controlId: 'pad', event: 'doubleClick' }), false);
  assert.equal(sceneWaitsFor(scene('o', { type: 'panelOpen' }), { type: 'panelOpen' }), true);
  assert.equal(sceneWaitsFor(scene('s', { type: 'script' }), { type: 'panelOpen' }), false);
  const listeners = sceneListeners([hover, click, scene('o', { type: 'panelOpen' })]);
  assert.deepEqual([[...listeners.state], [...listeners.event]], [['knob'], ['pad']]);
});

test('the panel opens: its scenes play, then hold their last frame, posed and still', () => {
  const timers = fakeTimers();
  let changes = 0;
  const runtime = createSceneRuntime({ timers, onChange: () => { changes += 1; } });
  runtime.setScenes([scene('intro', { type: 'panelOpen' }), scene('later', { type: 'script' })]);
  assert.deepEqual(runtime.open(), ['intro']);
  assert.deepEqual(brief(runtime), [['intro', 'a', null]], 'running: no pose');
  timers.advance(999);
  assert.deepEqual(brief(runtime), [['intro', 'a', null]]);
  timers.advance(1);
  assert.deepEqual(brief(runtime), [['intro', 'a', 1000]], 'ended: held at its length');
  assert.equal(timers.pending, 0, 'and nothing left running');
  assert.equal(changes, 2);
});

test('a trigger that comes again while it plays starts it again, from the top', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('pulse', { type: 'event', controlId: 'pad', event: 'click' })]);
  runtime.fire({ type: 'event', controlId: 'pad', event: 'click' });
  timers.advance(600);
  runtime.fire({ type: 'event', controlId: 'pad', event: 'click' });
  assert.deepEqual(brief(runtime), [['pulse', 'b', null]], 'the phase flips, which restarts every clip');
  timers.advance(600);
  assert.deepEqual(brief(runtime), [['pulse', 'b', null]], 'the first run\'s end does not cut the second short');
  timers.advance(400);
  assert.deepEqual(brief(runtime), [['pulse', 'b', 1000]]);
});

test('a looping scene starts again each time its length has passed', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('glow', { type: 'state', controlId: 'knob', to: 'hover' }, { loop: true, length: 500 })]);
  runtime.fire({ type: 'state', controlId: 'knob', to: 'hover' });
  const phases = [];
  for (let i = 0; i < 4; i += 1) { phases.push(runtime.plays()[0].phase); timers.advance(500); }
  assert.deepEqual(phases, ['a', 'b', 'a', 'b']);
  assert.equal(runtime.plays()[0].at, null, 'never held');
  runtime.destroy();
  assert.equal(timers.pending, 0);
});

test('with reduced motion a scene goes straight to its last frame', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setReducedMotion(true);
  runtime.setScenes([scene('intro', { type: 'panelOpen' }, { loop: true })]);
  runtime.open();
  assert.deepEqual(brief(runtime), [['intro', 'a', 1000]]);
  assert.equal(timers.pending, 0, 'not even a loop runs');
});

test('the beat: every so many beats while the transport runs, never on the first look', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('bar', { type: 'beat', every: 4 })]);
  assert.deepEqual(runtime.beat(5), [], 'a transport already running when the panel opens');
  assert.deepEqual(runtime.beat(7.9), []);
  assert.deepEqual(runtime.beat(8.1), ['bar'], 'into the next bar');
  assert.deepEqual(runtime.beat(8.5), []);
  assert.deepEqual(runtime.beat(null), [], 'stopped');
  assert.deepEqual(runtime.beat(0), [], 'started again: a first look');
  assert.deepEqual(runtime.beat(4), ['bar']);
});

test('a scene taken out of the panel stops; one edited keeps playing as it now is', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('a', { type: 'panelOpen' }), scene('b', { type: 'panelOpen' })]);
  runtime.open();
  runtime.setScenes([scene('a', { type: 'panelOpen' }, { name: 'renamed' })]);
  assert.deepEqual(runtime.plays().map((p) => [p.scene.id, p.scene.name]), [['a', 'renamed']]);
  assert.equal(timers.pending, 1, 'b\'s timer went with it');
  assert.equal(runtime.start('renamed'), true, 'started by name, as a script will in 5c');
  assert.equal(runtime.start('nope'), false);
});
