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

test('a script starts a scene by name and hears how it ends: done(true) at the end, done(false) cut short', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('sc_intro', { type: 'script' }, { name: 'Intro' })]);
  const heard = [];
  assert.equal(runtime.start('intro', { done: (completed) => heard.push(['first', completed]) }), true, 'any case');
  timers.advance(400);
  runtime.start('Intro', { done: (completed) => heard.push(['second', completed]) });
  assert.deepEqual(heard, [['first', false]], 'started again: the first run was cut short');
  timers.advance(1000);
  assert.deepEqual(heard, [['first', false], ['second', true]]);
  runtime.start('Intro', { done: (completed) => heard.push(['third', completed]) });
  runtime.seek('Intro', 0.5);
  assert.deepEqual(heard.at(-1), ['third', false], 'a seek interrupts it');
});

test('seek holds a scene at a point of its length, paused, until it is started or sought again', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('s', { type: 'script' }, { length: 2000 })]);
  assert.equal(runtime.seek('s', 0.25), true);
  assert.deepEqual(brief(runtime), [['s', 'a', 500]]);
  runtime.seek('s', 7);
  assert.deepEqual(brief(runtime), [['s', 'a', 2000]], 'clamped to the end');
  assert.equal(timers.pending, 0, 'nothing runs while it is held');
  assert.equal(runtime.seek('nope', 0.5), false);
  assert.equal(runtime.seek('s', 'half'), false);
});

test('a seek into a run makes its animations afresh, so the time it had run does not count; one from a hold does not', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([scene('s', { type: 'script' }, { length: 2000 })]);
  runtime.start('s');
  assert.deepEqual(brief(runtime), [['s', 'a', null]]);
  runtime.seek('s', 0.25);
  assert.deepEqual(brief(runtime), [['s', 'b', 500]], 'the other phase: a CSS animation paused from its first moment');
  runtime.seek('s', 0.5);
  assert.deepEqual(brief(runtime), [['s', 'b', 1000]], 'held already: the same animation, only its delay moves');
  runtime.start('s');
  timers.advance(2000);
  assert.deepEqual(brief(runtime), [['s', 'a', 2000]], 'played to its end');
  runtime.seek('s', 0.1);
  assert.deepEqual(brief(runtime), [['s', 'b', 200]], 'after a finished play, afresh too');
});

test('a one-off effect plays on its place, and a new one there replaces it', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setScenes([]);
  const heard = [];
  runtime.effect('lamp|Transform', scene('fx1', { type: 'script' }, { length: 300 }), { done: (c) => heard.push(['fx1', c]) });
  runtime.effect('lamp|Text', scene('fx2', { type: 'script' }, { length: 300 }));
  assert.deepEqual(runtime.plays().map((p) => p.scene.id), ['fx1', 'fx2'], 'two places, two effects');
  runtime.effect('lamp|Transform', scene('fx3', { type: 'script' }, { length: 300 }));
  assert.deepEqual(runtime.plays().map((p) => p.scene.id), ['fx2', 'fx3'], 'the box\'s first effect is gone');
  assert.deepEqual(heard, [['fx1', false]]);
  runtime.setScenes([scene('panel', { type: 'panelOpen' })]);
  assert.deepEqual(runtime.plays().map((p) => p.scene.id), ['fx2', 'fx3'], 'the panel\'s scenes changing leaves them be');
  timers.advance(300);
  assert.deepEqual(runtime.plays().map((p) => p.at), [300, 300], 'held at their ends');
});

test('with reduced motion a script still hears done(true), once the call has returned', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers });
  runtime.setReducedMotion(true);
  runtime.setScenes([scene('s', { type: 'script' })]);
  const heard = [];
  runtime.start('s', { done: (c) => heard.push(c) });
  assert.deepEqual(heard, []);
  timers.advance(0);
  assert.deepEqual(heard, [true]);
});
