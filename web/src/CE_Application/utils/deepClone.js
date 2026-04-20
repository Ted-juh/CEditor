/**
 * Quick structured-clone replacement for data that's known to be plain
 * JSON (no Date, Map, Set, functions, etc.). The ValueTree data this
 * project deals with is always JSON-serializable, so this is safe.
 *
 * Using a named helper is purely for readability — JSON.parse(JSON.stringify(x))
 * appears in ~20 places across the codebase and hides the intent.
 */
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}
