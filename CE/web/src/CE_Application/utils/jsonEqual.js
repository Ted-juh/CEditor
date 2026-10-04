// jsonEqual.js — JSON.stringify(a) === JSON.stringify(b), without building either string.

/**
 * Do two values serialize to the same JSON? The answer `JSON.stringify(a) === JSON.stringify(b)`
 * would give, without building either string.
 *
 * WHY NOT JUST STRINGIFY. Measured 2026-09-29 (docs/design/undo-history-measurement-2026-09-29.md):
 * on the GAIA panel every control sits inside one of six top-level containers, one of them 6.5 MB
 * expanded. Moving one knob inside it replaced that container's reference, so the compare below
 * stringified all 6.5 MB twice — 60-85 ms on every commit and again on every undo. Edits never
 * mutate in place, so everything the edit did not touch is still the SAME object on both sides:
 * returning at the first `===` walks only the path down to the change.
 *
 * Kept to JSON's rules on purpose, because the callers used to compare strings and dedupe
 * depends on the same answer: key ORDER counts (a `_children` map's order is document order, so
 * reordering one is a real edit), keys whose value is undefined or a function are skipped as
 * JSON skips them, undefined or a function inside an array reads as null, and a non-finite number
 * reads as null.
 */
export function jsonEqual(a, b) {
  if (a === b) return true;
  const ta = jsonType(a);
  const tb = jsonType(b);
  if (ta !== tb) return false;
  if (ta === 'null') return true;
  if (ta !== 'array' && ta !== 'object') return a === b;
  if (typeof a.toJSON === 'function' || typeof b.toJSON === 'function') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (ta === 'array') {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = serializedKeys(a);
  const kb = serializedKeys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (!jsonEqual(a[ka[i]], b[kb[i]])) return false;
  }
  return true;
}

/** The JSON kind of a value, folding what JSON writes as null into 'null'. */
function jsonType(value) {
  if (value === null || value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** The keys JSON.stringify would write, in the order it would write them. */
function serializedKeys(object) {
  return Object.keys(object).filter((key) => {
    const value = object[key];
    return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
  });
}

