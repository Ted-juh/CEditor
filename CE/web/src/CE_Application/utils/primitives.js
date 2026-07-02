/**
 * Tiny numeric/string helpers shared across the app. These used to be copy-pasted locally in
 * ~25 files; import from here instead of redefining them.
 */

/** Coerce to a finite number, else return `fallback`. */
export function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** Clamp `value` into [min, max]. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Sanitize a name for use inside an SVG id/url() reference. */
export function safeSvgId(value, fallback = 'control') {
  return String(value ?? fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
}
