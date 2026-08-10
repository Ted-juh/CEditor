import { isJuceAvailable, setPerfDebugEnabled as bridgeSetPerfDebugEnabled } from '../bridge/bridge.js';

const PERF_QUERY_KEY = 'perf';
const PERF_STORAGE_KEY = 'ce.debug.perf';
const PERF_PREFIX = '[perf]';

export function isPerfDebugEnabled() {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get(PERF_QUERY_KEY);
    if (queryValue === '1' || queryValue === 'true') return true;
  } catch {
    // Ignore malformed URL environments.
  }

  try {
    const stored = window.localStorage?.getItem(PERF_STORAGE_KEY);
    return stored === '1' || stored === 'true';
  } catch {
    return false;
  }
}

export function setPerfDebugEnabled(enabled) {
  if (typeof window === 'undefined') return false;

  try {
    if (enabled) {
      window.localStorage?.setItem(PERF_STORAGE_KEY, '1');
    } else {
      window.localStorage?.removeItem(PERF_STORAGE_KEY);
    }
  } catch {
    return false;
  }

  const nextEnabled = isPerfDebugEnabled();
  if (isJuceAvailable()) {
    bridgeSetPerfDebugEnabled(nextEnabled);
  }
  return nextEnabled;
}

export function syncPerfDebugToNative() {
  if (!isJuceAvailable()) return;
  bridgeSetPerfDebugEnabled(isPerfDebugEnabled());
}

/**
 * Was the gap between two heartbeats long enough to call a stall?
 *
 * A timer asked to fire every `periodMs` will drift by a few milliseconds under any load; the
 * threshold has to be far enough above that to mean "a person watched this happen" rather than
 * "the machine was briefly busy". Pure, so the decision is testable without waiting for one.
 */
export function isStall(gapMs, periodMs = HEARTBEAT_MS, thresholdMs = STALL_MS) {
  return Number.isFinite(gapMs) && gapMs >= Math.max(thresholdMs, periodMs * 2);
}

const HEARTBEAT_MS = 250;
const STALL_MS = 1000;
let stallWatchStarted = false;

/**
 * Notice the renderer being blocked, and say for how long.
 *
 * The counterpart to the native stall watch, and the reason both exist: a frozen window is one
 * symptom with two possible causes, and which one it is decides where to look next. If the C++ side
 * reports a gap and this does not, something is holding the message thread. If this reports one and
 * C++ does not, the WebView renderer is busy and native is fine. If both report the same gap,
 * whatever it is crosses the bridge.
 *
 * A heartbeat rather than a profiler because it survives the thing it measures: an interval that
 * cannot fire while the thread is blocked comes back late by exactly the blocked duration.
 * `longtask` entries are collected too where available, since they name the culprit; the heartbeat
 * is what still works when they are not.
 */
export function startPerfDebugStallWatch() {
  if (stallWatchStarted || !isPerfDebugEnabled()) return;
  if (typeof window === 'undefined' || typeof performance === 'undefined') return;
  stallWatchStarted = true;

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (isStall(gap)) {
      console.info(`${PERF_PREFIX} renderer stalled ${gap.toFixed(0)}ms`);
    }
  }, HEARTBEAT_MS);

  try {
    // Not supported everywhere, and unnecessary where it is not — the heartbeat above already
    // catches the stall. This only adds the attribution.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < STALL_MS) continue;
        const source = entry.attribution?.[0]?.name ?? entry.name ?? 'unknown';
        console.info(`${PERF_PREFIX} renderer long task ${entry.duration.toFixed(0)}ms source=${source}`);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // No longtask support: the heartbeat still reports the stall, just without naming it.
  }
}

function resolvePerfDetail(detail) {
  if (typeof detail === 'function') {
    try {
      return String(detail() ?? '').trim();
    } catch (error) {
      return `detail-error=${error?.message ?? 'unknown'}`;
    }
  }

  return String(detail ?? '').trim();
}

function joinPerfDetails(...details) {
  return details
    .map(resolvePerfDetail)
    .filter(Boolean)
    .join(' ');
}

export function logPerfDebug(label, detail = '') {
  if (!isPerfDebugEnabled()) return;
  const suffix = joinPerfDetails(detail);
  console.info(`${PERF_PREFIX} ${label}${suffix ? ` ${suffix}` : ''}`);
}

export function createPerfDebugTimer(label, { minDurationMs = 0, detail = '' } = {}) {
  if (!isPerfDebugEnabled() || typeof performance === 'undefined') {
    return () => 0;
  }

  const start = performance.now();
  return (finalDetail = '') => {
    const duration = performance.now() - start;
    if (duration < Math.max(0, Number(minDurationMs) || 0)) {
      return duration;
    }

    const suffix = joinPerfDetails(detail, finalDetail);
    console.info(`${PERF_PREFIX} ${label} ${duration.toFixed(1)}ms${suffix ? ` ${suffix}` : ''}`);
    return duration;
  };
}

export function measurePerfDebug(label, callback, { minDurationMs = 0, detail = '' } = {}) {
  if (!isPerfDebugEnabled() || typeof performance === 'undefined') {
    return callback();
  }

  const stop = createPerfDebugTimer(label, { minDurationMs, detail });

  try {
    const result = callback();
    stop();
    return result;
  } catch (error) {
    stop(`errored=${error?.message ?? 'unknown'}`);
    throw error;
  }
}
