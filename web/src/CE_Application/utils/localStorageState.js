export function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

export function readStoredJson(key, fallback) {
  if (!canUseLocalStorage()) return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures so UI state can still work in-memory.
  }
}

export function removeStoredValue(key) {
  if (!canUseLocalStorage()) return;

  try {
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
