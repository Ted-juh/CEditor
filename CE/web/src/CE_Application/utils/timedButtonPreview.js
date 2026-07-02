import { numberOr } from './primitives.js';
const DEFAULT_HOLD_DURATION = 1200;
const DEFAULT_REQUIRED_CLICKS = 2;
const DEFAULT_CLICK_WINDOW = 350;

export const TIMED_BUTTON_EXECUTION_FEEDBACK_MS = 900;

function clearScheduledTimeout(handle, clearTimeoutFn) {
  if (handle != null) {
    clearTimeoutFn(handle);
  }
  return null;
}

function createState() {
  return {
    holdTimer: null,
    clickTimer: null,
    executedTimer: null,
    clickCount: 0,
    holdCompleted: false,
  };
}

export function isTimedButtonBehavior(behavior) {
  return String(behavior?.buttonType ?? '') === 'timed';
}

export function resolveTimedButtonSubtype(behavior) {
  return String(behavior?.subtype ?? 'hold_to_confirm') === 'double_click'
    ? 'double_click'
    : 'hold_to_confirm';
}

export function resolveTimedButtonConfig(behavior) {
  return {
    subtype: resolveTimedButtonSubtype(behavior),
    holdDuration: Math.max(0, Math.round(numberOr(behavior?.holdDuration, DEFAULT_HOLD_DURATION))),
    requiredClicks: Math.max(1, Math.round(numberOr(behavior?.requiredClicks, DEFAULT_REQUIRED_CLICKS))),
    clickWindow: Math.max(50, Math.round(numberOr(behavior?.clickWindow, DEFAULT_CLICK_WINDOW))),
  };
}

export function createTimedButtonPreviewController({
  patchSession,
  scheduleTimeout = setTimeout,
  clearTimeoutFn = clearTimeout,
  executionFeedbackDuration = TIMED_BUTTON_EXECUTION_FEEDBACK_MS,
} = {}) {
  if (typeof patchSession !== 'function') {
    throw new TypeError('createTimedButtonPreviewController requires a patchSession callback.');
  }

  const states = new Map();
  const feedbackDuration = Math.max(0, Math.round(numberOr(
    executionFeedbackDuration,
    TIMED_BUTTON_EXECUTION_FEEDBACK_MS,
  )));

  function ensureState(key) {
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return null;

    let state = states.get(normalizedKey);
    if (!state) {
      state = createState();
      states.set(normalizedKey, state);
    }
    return state;
  }

  function clearHoldTimer(state) {
    state.holdTimer = clearScheduledTimeout(state.holdTimer, clearTimeoutFn);
  }

  function clearClickTimer(state) {
    state.clickTimer = clearScheduledTimeout(state.clickTimer, clearTimeoutFn);
  }

  function clearExecutedTimer(state) {
    state.executedTimer = clearScheduledTimeout(state.executedTimer, clearTimeoutFn);
  }

  function resetClickSequence(state) {
    clearClickTimer(state);
    state.clickCount = 0;
  }

  function releaseExecutedVisual(key, state) {
    clearExecutedTimer(state);
    if (feedbackDuration === 0) {
      patchSession(key, { executed: false });
      return;
    }

    state.executedTimer = scheduleTimeout(() => {
      state.executedTimer = null;
      patchSession(key, { executed: false });
    }, feedbackDuration);
  }

  function markExecuted(key, state) {
    clearHoldTimer(state);
    resetClickSequence(state);
    patchSession(key, {
      pending: false,
      executed: true,
      pressed: false,
    });
    releaseExecutedVisual(key, state);
  }

  function beginPress(key, behavior) {
    if (!isTimedButtonBehavior(behavior)) return false;

    const normalizedKey = String(key ?? '');
    const state = ensureState(normalizedKey);
    if (!state) return false;

    const config = resolveTimedButtonConfig(behavior);
    clearExecutedTimer(state);
    patchSession(normalizedKey, { executed: false });

    if (config.subtype !== 'hold_to_confirm') {
      return true;
    }

    clearHoldTimer(state);
    resetClickSequence(state);
    state.holdCompleted = false;

    if (config.holdDuration === 0) {
      state.holdCompleted = true;
      markExecuted(normalizedKey, state);
      return true;
    }

    patchSession(normalizedKey, { pending: true });
    state.holdTimer = scheduleTimeout(() => {
      state.holdTimer = null;
      state.holdCompleted = true;
      markExecuted(normalizedKey, state);
    }, config.holdDuration);
    return true;
  }

  function releasePress(key, behavior, { inside = true } = {}) {
    if (!isTimedButtonBehavior(behavior)) return false;

    const normalizedKey = String(key ?? '');
    const state = ensureState(normalizedKey);
    if (!state) return false;

    const config = resolveTimedButtonConfig(behavior);

    if (config.subtype === 'hold_to_confirm') {
      const completed = state.holdCompleted === true;
      clearHoldTimer(state);
      state.holdCompleted = false;
      if (!completed) {
        patchSession(normalizedKey, { pending: false });
      }
      return completed;
    }

    if (!inside) return false;

    clearClickTimer(state);
    state.clickCount += 1;

    if (state.clickCount >= config.requiredClicks) {
      state.clickCount = 0;
      markExecuted(normalizedKey, state);
      return true;
    }

    patchSession(normalizedKey, {
      pending: true,
      executed: false,
    });
    state.clickTimer = scheduleTimeout(() => {
      state.clickTimer = null;
      state.clickCount = 0;
      patchSession(normalizedKey, { pending: false });
    }, config.clickWindow);
    return false;
  }

  function cancel(key, { clearExecuted = false } = {}) {
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return;

    const state = states.get(normalizedKey);
    if (!state) return;

    clearHoldTimer(state);
    resetClickSequence(state);
    state.holdCompleted = false;
    if (clearExecuted) {
      clearExecutedTimer(state);
      patchSession(normalizedKey, {
        pending: false,
        executed: false,
      });
      return;
    }

    patchSession(normalizedKey, { pending: false });
  }

  function syncSession(key, session = null) {
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return;

    const state = states.get(normalizedKey);
    if (!state) return;

    const sessionActive = session?.pressed === true
      || session?.pending === true
      || session?.executed === true;

    if (sessionActive) return;

    clearHoldTimer(state);
    resetClickSequence(state);
    clearExecutedTimer(state);
    state.holdCompleted = false;
  }

  function syncKeys(activeKeys = []) {
    const normalizedKeys = new Set(
      (Array.isArray(activeKeys) ? activeKeys : []).map((key) => String(key ?? '')).filter(Boolean)
    );

    for (const [key, state] of states.entries()) {
      if (normalizedKeys.has(key)) continue;
      clearHoldTimer(state);
      resetClickSequence(state);
      clearExecutedTimer(state);
      states.delete(key);
    }
  }

  function destroy() {
    for (const state of states.values()) {
      clearHoldTimer(state);
      resetClickSequence(state);
      clearExecutedTimer(state);
    }
    states.clear();
  }

  return {
    beginPress,
    releasePress,
    cancel,
    syncSession,
    syncKeys,
    destroy,
  };
}
