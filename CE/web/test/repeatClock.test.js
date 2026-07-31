// repeatClock.test.js — the four edges that make a repeat correct.
//
// This is the clock a repeating button and a rolling drum pad both hold. It was extracted from
// momentaryButtonPreview.js, which had already been through the release-between-fires bug (a roll
// striking once more on the way up) — so the point of these tests is that the second caller inherits
// that fix rather than rediscovering it.
//
// Timers are injected, so every case here is exact rather than a race against a real clock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRepeatClock } from '../src/CE_Application/utils/repeatClock.js';

/** A hand-cranked scheduler. `tick(ms)` advances time and runs whatever is due. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timeouts = new Map();   // handle -> { at, fn }
  const intervals = new Map();  // handle -> { every, due, fn }

  return {
    now: () => now,
    scheduleTimeout: (fn, ms) => { const h = next++; timeouts.set(h, { at: now + ms, fn }); return h; },
    clearTimeoutFn: (h) => timeouts.delete(h),
    scheduleInterval: (fn, ms) => {
      const h = next++;
      intervals.set(h, { every: Math.max(1, ms), due: now + Math.max(1, ms), fn });
      return h;
    },
    clearIntervalFn: (h) => intervals.delete(h),
    /** Advance in 1 ms steps so an interval fires as many times as it is owed, in order. */
    tick(ms) {
      for (let i = 0; i < ms; i += 1) {
        now += 1;
        for (const [h, t] of [...timeouts]) {
          if (t.at <= now) { timeouts.delete(h); t.fn(); }
        }
        for (const [h, iv] of [...intervals]) {
          while (intervals.has(h) && iv.due <= now) { iv.due += iv.every; iv.fn(); }
        }
      }
    },
    pending: () => timeouts.size + intervals.size,
  };
}

function harness() {
  const clk = fakeClock();
  const fired = [];
  const clock = createRepeatClock({
    onFire: (key, n) => fired.push(`${key}#${n}`),
    scheduleTimeout: clk.scheduleTimeout,
    clearTimeoutFn: clk.clearTimeoutFn,
    scheduleInterval: clk.scheduleInterval,
    clearIntervalFn: clk.clearIntervalFn,
  });
  return { clk, clock, fired };
}

test('nothing fires before the delay, and the first fire lands ON it', () => {
  // Not one interval after it. A first fire at delay + interval reads as the delay being longer
  // than it was set to, which is the kind of wrongness nobody reports and everybody works around.
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 250, interval: 100 });

  clk.tick(249);
  assert.deepEqual(fired, [], 'silent through the delay');
  clk.tick(1);
  assert.deepEqual(fired, ['a#1'], 'and the first strike is the delay expiring');
  clk.tick(100);
  assert.deepEqual(fired, ['a#1', 'a#2']);
});

test('a zero delay starts at once', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 0, interval: 50 });
  assert.deepEqual(fired, ['a#1'], 'before any time has passed at all');
  clk.tick(50);
  assert.deepEqual(fired, ['a#1', 'a#2']);
});

test('released during the delay, it never starts', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 300, interval: 60 });
  clk.tick(120);
  assert.equal(clock.stop('a'), 0, 'nothing fired, so the count is zero');
  clk.tick(1000);
  assert.deepEqual(fired, [], 'and no timer survived to fire later');
});

test('released between fires, it does not strike once more on the way up', () => {
  // The bug this clock exists to not have twice. A trailing fire after release is a note the player
  // did not play.
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 0, interval: 100 });
  clk.tick(250);
  assert.deepEqual(fired, ['a#1', 'a#2', 'a#3']);
  assert.equal(clock.stop('a'), 3, 'stop reports what the hold produced');
  clk.tick(1000);
  assert.deepEqual(fired, ['a#1', 'a#2', 'a#3'], 'and then silence');
});

test('re-pressing restarts the count and does not leave a second clock running', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 0, interval: 100 });
  clk.tick(150);                                   // #1 at 0, #2 at 100
  clock.start('a', { delay: 0, interval: 100 });   // pressed again without a stop
  assert.deepEqual(fired.slice(-1), ['a#1'], 'the new press counts from one');
  clk.tick(100);
  assert.deepEqual(fired, ['a#1', 'a#2', 'a#1', 'a#2'], 'one clock, not two');
});

test('two keys run independently', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 0, interval: 100 });
  clock.start('b', { delay: 0, interval: 250 });
  clk.tick(250);
  assert.deepEqual(fired.filter((f) => f.startsWith('a')), ['a#1', 'a#2', 'a#3']);
  assert.deepEqual(fired.filter((f) => f.startsWith('b')), ['b#1', 'b#2']);
  clock.stop('a');
  clk.tick(250);
  assert.deepEqual(fired.filter((f) => f.startsWith('a')), ['a#1', 'a#2', 'a#3'], 'stopping one leaves the other');
  assert.equal(clock.count('b'), 3);
});

test('an interval of zero is refused rather than run as a busy loop', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 0, interval: 0 });
  clk.tick(3);
  assert.equal(fired.length, 4, 'floored at 1 ms: the opening fire plus one per millisecond');
});

test('sync and destroy leave no timer behind', () => {
  const { clk, clock, fired } = harness();
  clock.start('a', { delay: 500, interval: 100 });
  clock.start('b', { delay: 0, interval: 100 });

  clock.sync(['b']);                    // 'a' belonged to a control that is gone
  clk.tick(1000);
  assert.deepEqual(fired.filter((f) => f.startsWith('a')), [], 'a dropped key must not fire');
  assert.ok(fired.length > 0, 'and the surviving one keeps going');

  clock.destroy();
  assert.equal(clk.pending(), 0, 'nothing is still scheduled');
  const after = fired.length;
  clk.tick(1000);
  assert.equal(fired.length, after);
});

test('running() says whether a press is still winding or ticking', () => {
  const { clk, clock } = harness();
  assert.equal(clock.running('a'), false);
  clock.start('a', { delay: 200, interval: 100 });
  assert.equal(clock.running('a'), true, 'true through the delay, before anything has fired');
  clk.tick(200);
  assert.equal(clock.running('a'), true);
  clock.stop('a');
  assert.equal(clock.running('a'), false);
});
