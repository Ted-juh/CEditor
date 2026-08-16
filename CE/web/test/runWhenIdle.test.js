import test from 'node:test';
import assert from 'node:assert/strict';

import { runWhenIdle } from '../src/CE_Application/utils/runWhenIdle.js';

test('prefers requestIdleCallback, and always passes a timeout', () => {
  // The timeout is the whole safety property: without it an idle callback can be starved forever
  // on a busy editor, and an autosave that never runs is worse than one that stutters.
  const calls = [];
  globalThis.requestIdleCallback = (job, options) => { calls.push(options); job(); };
  try {
    let ran = false;
    runWhenIdle(() => { ran = true; }, 1500);
    assert.equal(ran, true);
    assert.deepEqual(calls, [{ timeout: 1500 }]);
  } finally {
    delete globalThis.requestIdleCallback;
  }
});

test('a negative timeout is clamped rather than passed through', () => {
  const calls = [];
  globalThis.requestIdleCallback = (job, options) => { calls.push(options); };
  try {
    runWhenIdle(() => {}, -5);
    assert.deepEqual(calls, [{ timeout: 0 }]);
  } finally {
    delete globalThis.requestIdleCallback;
  }
});

test('without requestIdleCallback the job still leaves the current task', async () => {
  // The fallback is not a no-op: getting off the current task is most of the benefit on a quiet
  // page, and it is what keeps the work out of the gesture that scheduled it.
  const saved = globalThis.requestIdleCallback;
  delete globalThis.requestIdleCallback;
  try {
    let ran = false;
    runWhenIdle(() => { ran = true; });
    assert.equal(ran, false, 'it must not run synchronously');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(ran, true);
  } finally {
    if (saved) globalThis.requestIdleCallback = saved;
  }
});
