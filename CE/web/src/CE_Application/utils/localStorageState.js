const storedValueCache = new Map();

export function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
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

  try {
    const raw = JSON.stringify(value);
    if (storedValueCache.get(key) === raw) return;
    localStorage.setItem(key, raw);
    storedValueCache.set(key, raw);
  } catch {
    // Ignore persistence failures so UI state can still work in-memory.
  }
}

export function removeStoredValue(key) {
  if (!canUseLocalStorage()) return;

  try {
    storedValueCache.delete(key);
    localStorage.removeItem(key);
  } catch {
    // Ignore persistence failures.
  }
}

export function readStoredBool(key, fallback = false) {
  return Boolean(readStoredJson(key, fallback));
}

export function readStoredNumber(key, fallback = 0) {
  const value = Number(readStoredJson(key, fallback));
  return Number.isFinite(value) ? value : fallback;
}
