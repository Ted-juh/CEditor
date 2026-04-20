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
