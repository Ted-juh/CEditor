// sceneMarkers.test.js — a scene's timeline markers (sceneFormat.js `markers`): each a moment that
// calls a script's action as a play passes it (sceneRuntime.js), and the runtime's door for them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanScene, cleanMarkers } from '../src/CE_Application/utils/sceneFormat.js';
import { createSceneRuntime } from '../src/CE_Application/utils/sceneRuntime.js';

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
  };
}
const noFrames = { request: () => 1, cancel: () => {} };

/** A scene of 1 s with markers at 200 ms (lights) and 700 ms (beam), and one not named yet. */
const marked = (over = {}) => cleanScene({
  id: 's', name: 'Show', trigger: { type: 'script' }, length: 1000, loop: false, clips: [],
  markers: [{ id: 'm2', at: 700, action: 'beam' }, { id: 'm1', at: 200, action: 'lights' }, { id: 'm3', at: 500, action: '' }],
  ...over,
});

function setUp(scene, { reduced = false } = {}) {
  const timers = fakeTimers();
  const heard = [];
  const runtime = createSceneRuntime({ timers, frames: noFrames, onMarker: (action, { scene: s, marker }) => heard.push([action, s.id, marker.at]) });
  runtime.setScenes([scene]);
  runtime.setReducedMotion(reduced);
  return { timers, heard, runtime };
}

test('markers are read in time order, within the scene, ids unique; none leaves no key', () => {
  const scene = marked();
  assert.deepEqual(scene.markers.map((m) => [m.id, m.at, m.action]), [['m1', 200, 'lights'], ['m3', 500, ''], ['m2', 700, 'beam']]);
  assert.deepEqual(cleanMarkers([{ id: 'a', at: 5000, action: 'x' }, { id: 'a', at: 1, action: 'y' }, { id: 'bad id', at: 1, action: 'z' }], 1000),
    [{ id: 'a', at: 1000, action: 'x' }], 'past the end is at the end; a second "a" and a bad id are dropped');
  assert.equal('markers' in cleanScene({ id: 's', name: 'S', trigger: { type: 'script' }, length: 500, clips: [] }), false);
});

test('a play calls each marker\'s action as it passes it, and a marker not named yet calls nothing', () => {
  const { timers, heard, runtime } = setUp(marked());
  runtime.start('Show');
  timers.advance(199);
  assert.deepEqual(heard, []);
  timers.advance(1);
  assert.deepEqual(heard, [['lights', 's', 200]]);
  timers.advance(800);
  assert.deepEqual(heard, [['lights', 's', 200], ['beam', 's', 700]]);
});

test('a loop calls them every time round; a play cut short calls none of the rest; a held scene none', () => {
  const looping = setUp(marked({ loop: true }));
  looping.runtime.start('Show');
  looping.timers.advance(2300);
  assert.deepEqual(looping.heard.map(([action]) => action), ['lights', 'beam', 'lights', 'beam', 'lights']);
  const cut = setUp(marked());
  cut.runtime.start('Show');
  cut.timers.advance(300);
  cut.runtime.seek('Show', 0.1);
  cut.timers.advance(2000);
  assert.deepEqual(cut.heard.map(([action]) => action), ['lights'], 'the seek holds it: beam is never reached');
});

test('with reduced motion the scene jumps to its end, and calls them all at once, in order', () => {
  const { timers, heard, runtime } = setUp(marked(), { reduced: true });
  runtime.start('Show');
  assert.deepEqual(heard, [], 'after the call has returned, not inside it');
  timers.advance(0);
  assert.deepEqual(heard.map(([action]) => action), ['lights', 'beam']);
});

test('a scene a gesture drives calls a marker as the hand moves it forward past it, not back', () => {
  const { heard, runtime } = setUp(marked({ clock: { source: 'value', controlId: 'k', follow: 'exact' } }));
  runtime.input('k', 'value', { normalized: 0 });
  runtime.input('k', 'value', { normalized: 0.5 });
  assert.deepEqual(heard.map(([action]) => action), ['lights']);
  runtime.input('k', 'value', { normalized: 0.1 });
  assert.deepEqual(heard.map(([action]) => action), ['lights'], 'going back passes none');
  runtime.input('k', 'value', { normalized: 1 });
  assert.deepEqual(heard.map(([action]) => action), ['lights', 'lights', 'beam']);
  runtime.seek('Show', 0);
  runtime.seek('Show', 0.75);
  assert.deepEqual(heard.map(([action]) => action), ['lights', 'lights', 'beam', 'lights', 'beam'], 'a script as its clock, the same');
});

test('an action that throws does not stop the scene', () => {
  const timers = fakeTimers();
  const runtime = createSceneRuntime({ timers, frames: noFrames, onMarker: () => { throw new Error('boom'); } });
  runtime.setScenes([marked()]);
  let done = null;
  runtime.start('Show', { done: (completed) => { done = completed; } });
  timers.advance(1000);
  assert.equal(done, true);
});
