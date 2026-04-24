import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIMED_BUTTON_EXECUTION_FEEDBACK_MS,
  createTimedButtonPreviewController,
} from '../src/CE_Application/utils/timedButtonPreview.js';

function createScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  function schedule(callback, delay = 0) {
    const id = nextId += 1;
    timers.set(id, {
      id,
      callback,
      runAt: now + Math.max(0, Number(delay) || 0),
    });
    return id;
  }

  function clear(id) {
    timers.delete(id);
  }

  function advance(ms) {
    now += Math.max(0, Number(ms) || 0);

    let ran = true;
    while (ran) {
      ran = false;
      const dueTimers = [...timers.values()]
        .filter((timer) => timer.runAt <= now)
        .sort((left, right) => left.runAt - right.runAt || left.id - right.id);

      for (const timer of dueTimers) {
        if (!timers.has(timer.id)) continue;
        timers.delete(timer.id);
        timer.callback();
        ran = true;
      }
    }
  }

  return { schedule, clear, advance };
}

function createControllerHarness(overrides = {}) {
  const scheduler = createScheduler();
  const patches = [];
  const sessionById = new Map();
  const controller = createTimedButtonPreviewController({
    patchSession: (controlId, patch) => {
      const previous = sessionById.get(controlId) ?? {};
      const next = { ...previous, ...patch };
      sessionById.set(controlId, next);
      patches.push({ controlId, patch, session: next });
    },
    scheduleTimeout: scheduler.schedule,
    clearTimeoutFn: scheduler.clear,
    executionFeedbackDuration: overrides.executionFeedbackDuration ?? TIMED_BUTTON_EXECUTION_FEEDBACK_MS,
  });

  return {
    controller,
    patches,
    session(controlId) {
      return sessionById.get(controlId) ?? {};
    },
    advance: scheduler.advance,
  };
}

test('hold-to-confirm timed buttons stay pending until the hold duration completes', () => {
  const harness = createControllerHarness({ executionFeedbackDuration: 200 });
  const behavior = {
    buttonType: 'timed',
    subtype: 'hold_to_confirm',
    holdDuration: 500,
  };

  harness.controller.beginPress('hold_1', behavior);
  assert.equal(harness.session('hold_1').pending, true);
  assert.equal(harness.session('hold_1').executed, false);

  harness.advance(499);
  assert.equal(harness.session('hold_1').pending, true);
  assert.equal(harness.session('hold_1').executed, false);

  harness.advance(1);
  assert.equal(harness.session('hold_1').pending, false);
  assert.equal(harness.session('hold_1').executed, true);
  assert.equal(harness.session('hold_1').pressed, false);

  harness.controller.releasePress('hold_1', behavior, { inside: true });
  harness.advance(200);
  assert.equal(harness.session('hold_1').executed, false);
});

test('releasing a hold-to-confirm button early cancels the pending state', () => {
  const harness = createControllerHarness();
  const behavior = {
    buttonType: 'timed',
    subtype: 'hold_to_confirm',
    holdDuration: 400,
  };

  harness.controller.beginPress('hold_cancel', behavior);
  harness.advance(150);
  harness.controller.releasePress('hold_cancel', behavior, { inside: true });

  assert.equal(harness.session('hold_cancel').pending, false);
  assert.equal(harness.session('hold_cancel').executed, false);

  harness.advance(500);
  assert.equal(harness.session('hold_cancel').executed, false);
});

test('double-click timed buttons execute only after the required click count within the window', () => {
  const harness = createControllerHarness({ executionFeedbackDuration: 150 });
  const behavior = {
    buttonType: 'timed',
    subtype: 'double_click',
    requiredClicks: 2,
    clickWindow: 300,
  };

  harness.controller.beginPress('double_1', behavior);
  harness.controller.releasePress('double_1', behavior, { inside: true });
  assert.equal(harness.session('double_1').pending, true);
  assert.equal(harness.session('double_1').executed, false);

  harness.advance(100);
  harness.controller.beginPress('double_1', behavior);
  harness.controller.releasePress('double_1', behavior, { inside: true });
  assert.equal(harness.session('double_1').pending, false);
  assert.equal(harness.session('double_1').executed, true);

  harness.advance(150);
  assert.equal(harness.session('double_1').executed, false);
});

test('double-click timed buttons clear pending when the click window expires', () => {
  const harness = createControllerHarness();
  const behavior = {
    buttonType: 'timed',
    subtype: 'double_click',
    requiredClicks: 2,
    clickWindow: 250,
  };

  harness.controller.beginPress('double_timeout', behavior);
  harness.controller.releasePress('double_timeout', behavior, { inside: true });
  assert.equal(harness.session('double_timeout').pending, true);

  harness.advance(250);
  assert.equal(harness.session('double_timeout').pending, false);
  assert.equal(harness.session('double_timeout').executed, false);
});
