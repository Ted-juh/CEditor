// perfDebug.test.js — the threshold that decides what counts as a freeze.
//
// The stall watch is a heartbeat: an interval that cannot fire while its thread is blocked comes
// back late by exactly the blocked duration. All the judgement is in one comparison, and getting it
// wrong is expensive in both directions — too low and the log fills with ordinary scheduling jitter
// until the real stall is impossible to find, too high and the thing we are hunting goes unreported.
//
// So the comparison is a pure function, and this is it, tested without waiting for a real stall.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isStall } from '../src/CE_Application/utils/perfDebug.js';

test('ordinary jitter is not a stall', () => {
  assert.equal(isStall(250), false, 'a heartbeat arriving exactly on time');
  assert.equal(isStall(263), false, 'a few milliseconds late is what timers do');
  assert.equal(isStall(0), false);
});

test('a gap a person would notice is', () => {
  assert.equal(isStall(1000), true, 'one second, the threshold itself');
  assert.equal(isStall(5300), true, 'the kind of number a frozen window produces');
});

test('the threshold never sits below twice the heartbeat', () => {
  // Otherwise a slower heartbeat would report itself: at a 2s period, a perfectly on-time 2s gap
  // would trip a 1s threshold on every single tick.
  assert.equal(isStall(2000, 2000, 1000), false, 'an on-time tick of a slow heartbeat');
  assert.equal(isStall(4000, 2000, 1000), true);
});

test('a nonsense gap is not a stall', () => {
  // performance.now() differences should never be these, but a report that fires on NaN would be
  // noise in the one log we are relying on to be quiet until it matters.
  assert.equal(isStall(NaN), false);
  assert.equal(isStall(Infinity), false);
  assert.equal(isStall(undefined), false);
});
