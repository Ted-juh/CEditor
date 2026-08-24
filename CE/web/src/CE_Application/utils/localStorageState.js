// localStorageState.js — small JSON-in-localStorage helpers, plus a guard against paying for a
// write that cannot succeed.
//
// THE GUARD IS NOT A MICRO-OPTIMISATION. localStorage holds about 5 MB per origin, and the
// unsaved-session autosave writes the whole open document. The GAIA panel expands to 21 MB, so
// `setItem` throws QuotaExceededError every time — and the empty `catch` below meant the failure
// was invisible while the JSON.stringify that produced the 21 MB string still cost 225 ms of
// blocked main thread. Measured on the production build: a fifth of a second, at an arbitrary
// moment a few seconds after an edit, to build a string that is immediately discarded. Every time.
//
// So a key that has once been refused for size is not stringified again. The flag is per key and
// per session: only that key stops trying, everything else is untouched, and a fresh run tries
// once more because by then the document may be a different size. One wasted 225 ms per session
// instead of one per autosave tick.

const storedValueCache = new Map();

// Keys whose last write was refused for size. Checked BEFORE the serialize, which is the whole
// point — checking after it would save the storage call and none of the cost.
const overQuotaKeys = new Set();

export function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

/**
 * Is this the browser saying "too big", rather than any other storage failure?
 *
 * Spelled several ways across engines, and the legacy numeric codes are still what Safari and
 * older Firefox report. A non-quota failure — storage disabled, a security error — must NOT set
 * the flag: those are not about size and may not repeat.
 */
function isQuotaError(error) {
  if (!error) return false;
  const name = String(error.name ?? '');
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return error.code === 22 || error.code === 1014;
}

export function readStoredJson(key, fallback) {
  if (!canUseLocalStorage()) return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (raw != null) storedValueCache.set(key, raw);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  if (!canUseLocalStorage()) return;
  if (overQuotaKeys.has(key)) return;

  try {
    const raw = JSON.stringify(value);
    if (storedValueCache.get(key) === raw) return;
    localStorage.setItem(key, raw);
    storedValueCache.set(key, raw);
  } catch (error) {
    if (isQuotaError(error)) {
      overQuotaKeys.add(key);
      // The cached string is what a later write compares against to skip a no-op. Nothing was
      // stored, so leaving a stale entry there would make a future smaller value look unchanged.
      storedValueCache.delete(key);
    }
    // Any other persistence failure is ignored, so UI state still works in memory.
  }
}

export function removeStoredValue(key) {
  if (!canUseLocalStorage()) return;

  try {
    storedValueCache.delete(key);
    // Removing the value is the one thing that can make room, so the key gets another chance.
    overQuotaKeys.delete(key);
    localStorage.removeItem(key);
  } catch {
    // Ignore persistence failures.
  }
}

/** Exposed for tests and diagnostics — never for behaviour. */
export const storedKeyIsOverQuota = (key) => overQuotaKeys.has(key);
export const resetStoredQuotaState = () => { overQuotaKeys.clear(); storedValueCache.clear(); };

export function readStoredBool(key, fallback = false) {
  return Boolean(readStoredJson(key, fallback));
}

export function readStoredNumber(key, fallback = 0) {
  const value = Number(readStoredJson(key, fallback));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The write counterpart to readStoredNumber.
 *
 * There was a read helper and no write one, so callers reached for writeStoredJson and the pair at
 * a call site read as mismatched — `readStoredNumber` in, `writeStoredJson` out, for the same key.
 * A non-finite value is dropped rather than stored: reading it back would fall through to the
 * caller's fallback anyway, and a stored `null` looks like a deliberate choice when it is not.
 */
export function writeStoredNumber(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  writeStoredJson(key, n);
}
