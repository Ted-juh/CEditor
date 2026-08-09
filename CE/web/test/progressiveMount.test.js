import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOUNT_WHOLE_BELOW,
  FIRST_SLICE,
  SLICE,
  initialMountCount,
  nextMountCount,
  mountIncomplete,
  scheduleNextSlice,
} from '../src/CE_Application/utils/progressiveMount.js';

test('a panel small enough to build in one frame is not chunked at all', () => {
  // This is what keeps the ordinary case exactly as it was. If small panels went through the
  // slicing path they would gain idle callbacks, a partially drawn intermediate state and a new
  // way to be wrong, in exchange for nothing.
  for (const total of [0, 1, 7, 80, MOUNT_WHOLE_BELOW]) {
    assert.equal(initialMountCount(total), total, `${total} items should mount whole`);
    assert.equal(mountIncomplete(initialMountCount(total), total), false);
  }
});

test('a large panel paints a first slice and reports itself unfinished', () => {
  assert.equal(initialMountCount(413), FIRST_SLICE);
  assert.equal(mountIncomplete(FIRST_SLICE, 413), true);
});

test('slices advance to exactly the total and then stop', () => {
  const total = 413;
  let count = initialMountCount(total);
  const seen = [count];
  let passes = 0;
  while (mountIncomplete(count, total)) {
    count = nextMountCount(count, total);
    seen.push(count);
    assert.ok((passes += 1) < 100, 'the fill-in must terminate');
  }
  assert.equal(count, total, 'it lands on the total, never past it');
  assert.deepEqual(seen, [80, 160, 320, 413], 'slices double, so four passes not six');
});

test('every intermediate count is a prefix length, never a rearrangement', () => {
  // Controls paint in DOM order, so the surface renders `items.slice(0, count)`. Monotonically
  // increasing counts are what make each intermediate state the final state truncated — mounting
  // out of order would stack controls wrongly until the fill-in finished.
  const total = 300;
  let count = initialMountCount(total);
  let previous = -1;
  while (mountIncomplete(count, total)) {
    assert.ok(count > previous, 'the count must never go backwards');
    previous = count;
    count = nextMountCount(count, total);
  }
  assert.ok(count > previous);
});

test('a slice size of zero or nonsense still advances', () => {
  // A configuration mistake should stutter, not leave the panel permanently half drawn.
  for (const slice of [0, -50, Number.NaN, undefined]) {
    assert.ok(nextMountCount(10, 413, { slice }) > 10, `slice ${slice} must still advance`);
  }
  // And from a standing start, where doubling has nothing to double.
  assert.ok(nextMountCount(0, 413, { slice: 0 }) > 0);
});

test('the thresholds are overridable, so the surface is testable without 413 controls', () => {
  assert.equal(initialMountCount(10, { mountWholeBelow: 4, firstSlice: 2 }), 2);
  assert.equal(nextMountCount(2, 10, { slice: 3 }), 5);
  assert.equal(nextMountCount(6, 100, { slice: 3 }), 12, 'once doubling outruns the floor, it wins');
  assert.equal(SLICE > 0 && FIRST_SLICE > 0 && MOUNT_WHOLE_BELOW >= FIRST_SLICE, true);
});

test('rubbish inputs do not produce a rubbish slice', () => {
  for (const bad of [null, undefined, Number.NaN, -12, 'seven']) {
    assert.equal(initialMountCount(bad), 0);
    assert.equal(nextMountCount(bad, bad), 0);
    assert.equal(mountIncomplete(bad, bad), false);
  }
  assert.equal(initialMountCount(7.9), 7, 'a fractional count is floored, not rounded up past the end');
});

test('a panel that shrinks below what is already mounted is finished, not negative', () => {
  // Deleting controls while the fill-in is still running.
  assert.equal(mountIncomplete(300, 12), false);
  assert.equal(nextMountCount(300, 12), 12);
});

test('the next slice is scheduled after a paint, not at the browser\'s convenience', () => {
  // This started as requestIdleCallback and was wrong: measured, a 413-control panel sat at 160
  // long enough that anything watching for the surface to stop changing concluded it had finished.
  // The gap must be exactly one paint — long enough to show what is built, short enough that the
  // panel is whole almost immediately.
  const calls = [];
  globalThis.requestAnimationFrame = (fn) => { calls.push(['raf', fn]); return 1; };
  globalThis.cancelAnimationFrame = () => calls.push(['cancel-raf']);
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push([fn, ms]); return 99; };
  globalThis.clearTimeout = () => calls.push(['cancel-timer']);

  try {
    let ran = 0;
    scheduleNextSlice(() => { ran += 1; });
    assert.equal(calls.length, 1, 'a frame is requested');
    assert.equal(ran, 0, 'nothing runs yet');

    calls[0][1]();                       // the frame fires — before paint
    assert.equal(ran, 0, 'still nothing: running here would block the paint this exists to allow');
    assert.deepEqual(timers[0][1], 0);

    timers[0][0]();                      // the macrotask — after paint
    assert.equal(ran, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.clearTimeout;
  }
});

test('cancelling a scheduled slice stops it running', () => {
  const realSetTimeout = globalThis.setTimeout;
  let cancelledFrame = false;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => { cancelledFrame = true; };
  globalThis.setTimeout = () => 99;
  globalThis.clearTimeout = () => {};
  try {
    scheduleNextSlice(() => {})();
    assert.equal(cancelledFrame, true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.clearTimeout;
  }
});

test('without requestAnimationFrame it falls back to a macrotask', () => {
  const realSetTimeout = globalThis.setTimeout;
  delete globalThis.requestAnimationFrame;
  let scheduled = null;
  globalThis.setTimeout = (fn, ms) => { scheduled = [fn, ms]; return 7; };
  globalThis.clearTimeout = () => {};
  try {
    let ran = 0;
    scheduleNextSlice(() => { ran += 1; });
    assert.deepEqual(scheduled[1], 0);
    scheduled[0]();
    assert.equal(ran, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    delete globalThis.clearTimeout;
  }
});
