import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleIdlePreparation } from '../src/CE_Application/utils/idlePreparation.js';

function clock() {
  let id = 0, time = 0;
  const timers = new Map(), idle = new Map(), listeners = new Map();
  return {
    timers, idle, listeners, performance: { now: () => time },
    setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
    requestIdleCallback(fn) { idle.set(++id, fn); return id; },
    cancelIdleCallback(key) { idle.delete(key); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    event(type, extra = {}) { listeners.get(type)?.({ type, ...extra }); },
    advance(ms) { time += ms; },
    quiet() { const values = [...timers.values()]; timers.clear(); values.forEach(t => t.fn()); },
    slice() { const values = [...idle.values()]; idle.clear(); values.forEach(fn => fn({ timeRemaining: () => 10 })); },
  };
}

test('preparation waits for quiet, yields between slices, and cancels on a superseding edit', () => {
  const host = clock(), ran = [];
  const cancel = scheduleIdlePreparation(function* () {
    for (let n = 0; n < 10; n++) yield () => { ran.push(n); host.advance(3); };
  }, { host, delay: 900, sliceMs: 4 });
  assert.deepEqual(ran, []);
  assert.equal([...host.timers.values()][0].delay, 900);
  host.quiet(); host.slice();
  assert.deepEqual(ran, [0, 1]);
  assert.equal(host.idle.size, 1);
  cancel(); host.slice(); host.quiet();
  assert.deepEqual(ran, [0, 1]);
  assert.equal(host.listeners.size, 0);
});

test('dragging pauses preparation; release and typing restart the quiet interval', () => {
  const host = clock(); let ran = 0;
  scheduleIdlePreparation(() => [() => ran++], { host });
  host.quiet(); host.event('pointerdown'); host.slice();
  assert.equal(ran, 0);
  assert.equal(host.timers.size, 0);
  host.event('pointerup'); assert.equal(host.timers.size, 1);
  host.quiet(); host.event('keydown'); host.slice();
  assert.equal(ran, 0);
  host.quiet(); host.slice();
  assert.equal(ran, 1);
  assert.equal(host.listeners.size, 0);
});

test('cancelling before the delay never even plans the panel', () => {
  const host = clock(); let planned = false;
  const cancel = scheduleIdlePreparation(() => { planned = true; return []; }, { host });
  cancel(); host.quiet(); host.slice();
  assert.equal(planned, false);
});
