import { numberOr, clamp } from './primitives.js';

// Re-exported so existing `from './rangeBehavior.js'` importers keep working.
export { numberOr, clamp };

export function isRangeBehavior(behavior = null) {
  return String(behavior?.family ?? '') === 'range';
}

export function getRangeRole(behavior = null) {
  return String(behavior?.role ?? 'spinbox').trim().toLowerCase() || 'spinbox';
}

export function isSliderRangeBehavior(behavior = null) {
  return isRangeBehavior(behavior) && getRangeRole(behavior) === 'slider';
}

export function getRangeMin(behavior = null) {
  return numberOr(behavior?.min, 0);
}

export function getRangeMax(behavior = null) {
  const min = getRangeMin(behavior);
  return Math.max(min, numberOr(behavior?.max, min + 1));
}

export function getRangeStep(behavior = null) {
  const fallbackStep = String(behavior?.valueType ?? '') === 'int' ? 1 : 0.01;
  return Math.max(numberOr(behavior?.step, fallbackStep), fallbackStep);
}

export function snapRangeValue(behavior = null, rawValue = 0) {
  const min = getRangeMin(behavior);
  const max = getRangeMax(behavior);
  let next = clamp(numberOr(rawValue, min), min, max);
  const step = numberOr(behavior?.step, 0);

  if (step > 0 && behavior?.snapToStep !== false) {
    next = min + Math.round((next - min) / step) * step;
  }

  if (String(behavior?.valueType ?? '') === 'int') {
    next = Math.round(next);
  }

  return clamp(next, min, max);
}

export function getCurrentRangeValue(behavior = null, session = null) {
  if (session?.valueOverrideEnabled === true) {
    return snapRangeValue(behavior, session?.valueOverride);
  }
  return snapRangeValue(behavior, behavior?.defaultValue ?? getRangeMin(behavior));
}

// --- Two-value (min/max) range spinner -------------------------------------
// The Range component carries a low (start) and high (end) value plus which one
// the steppers act on. Number stays single-value and ignores all of this.

export function isTwoValueRange(behavior = null) {
  return isRangeBehavior(behavior)
    && String(behavior?.valueMode ?? 'single').trim().toLowerCase() === 'range';
}

export function getRangeActiveHandle(session = null) {
  return String(session?.activeHandle ?? 'start').trim().toLowerCase() === 'end' ? 'end' : 'start';
}

export function getRangeStartValue(behavior = null, session = null) {
  const fallback = numberOr(behavior?.defaultStartValue, getRangeMin(behavior));
  const raw = session?.startValueOverrideEnabled === true ? session?.startValueOverride : fallback;
  return snapRangeValue(behavior, raw);
}

export function getRangeEndValue(behavior = null, session = null) {
  const fallback = numberOr(behavior?.defaultEndValue, getRangeMax(behavior));
  const raw = session?.endValueOverrideEnabled === true ? session?.endValueOverride : fallback;
  return snapRangeValue(behavior, raw);
}

// The active handle's value, clamped so low never crosses high.
export function getRangeHandleValue(behavior = null, session = null, handle = 'start') {
  return handle === 'end' ? getRangeEndValue(behavior, session) : getRangeStartValue(behavior, session);
}

// Adjust one handle by `direction * step * multiplier`, keeping the pair ordered
// (start <= end). Returns the new snapped value for that handle.
export function adjustRangeHandleValue(behavior = null, session = null, handle = 'start', direction = 1, multiplier = 1) {
  const start = getRangeStartValue(behavior, session);
  const end = getRangeEndValue(behavior, session);
  const next = adjustRangeValue(behavior, handle === 'end' ? end : start, direction, multiplier);
  if (handle === 'end') return clamp(next, start, getRangeMax(behavior));
  return clamp(next, getRangeMin(behavior), end);
}

// A parsed direct value for a handle, ordered against the other handle.
export function clampRangeHandleValue(behavior = null, session = null, handle = 'start', rawValue = 0) {
  const snapped = snapRangeValue(behavior, rawValue);
  const start = getRangeStartValue(behavior, session);
  const end = getRangeEndValue(behavior, session);
  if (handle === 'end') return clamp(snapped, start, getRangeMax(behavior));
  return clamp(snapped, getRangeMin(behavior), end);
}

export function adjustRangeValue(behavior = null, currentValue = 0, direction = 1, multiplier = 1) {
  const delta = getRangeStep(behavior) * numberOr(direction, 1) * Math.max(1, numberOr(multiplier, 1));
  return snapRangeValue(behavior, numberOr(currentValue, getRangeMin(behavior)) + delta);
}

export function isMouseDirectionReversed(behavior = null) {
  return behavior?.reverseMouseDirection === true;
}

export function resolveMouseDirection(behavior = null, direction = 1) {
  return numberOr(direction, 1) * (isMouseDirectionReversed(behavior) ? -1 : 1);
}

export function formatRangeValue(behavior = null, value = 0) {
  const snapped = snapRangeValue(behavior, value);
  if (String(behavior?.valueType ?? '') === 'int') {
    return String(Math.round(snapped));
  }

  const step = numberOr(behavior?.step, 0.01);
  const fractionDigits = step > 0 && step < 1
    ? Math.min(6, Math.max(0, String(step).split('.')[1]?.length ?? 0))
    : 2;

  return Number(snapped).toFixed(fractionDigits).replace(/\.?0+$/, '');
}

export function resolveRangeDisplayValue(behavior = null, session = null) {
  if (session?.valueInputActive === true) {
    return String(session?.valueInputBuffer ?? '');
  }
  return formatRangeValue(behavior, getCurrentRangeValue(behavior, session));
}

export function parseRangeInputValue(behavior = null, input = '') {
  const trimmed = String(input ?? '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return snapRangeValue(behavior, parsed);
}

export function isRangeTextInputKey(key = '') {
  const value = String(key ?? '');
  return /^[0-9]$/.test(value) || value === '.' || value === '-';
}

export function getRangeOrientation(behavior = null) {
  return String(behavior?.orientation ?? 'horizontal') === 'vertical' ? 'vertical' : 'horizontal';
}

export function getRangeDirection(behavior = null) {
  const orientation = getRangeOrientation(behavior);
  const fallback = orientation === 'vertical' ? 'btt' : 'ltr';
  return String(behavior?.direction ?? fallback).trim().toLowerCase() || fallback;
}

export function normalizedRangePointerValue(behavior = null, rect = null, clientX = 0, clientY = 0) {
  if (!rect) return 0;

  const localX = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const localY = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  const orientation = getRangeOrientation(behavior);
  const direction = getRangeDirection(behavior);

  if (orientation === 'vertical') {
    return direction === 'ttb' ? localY : 1 - localY;
  }

  return direction === 'rtl' ? 1 - localX : localX;
}

export function resolveRangeZone(behavior = null, rect = null, clientX = 0, clientY = 0) {
  if (!rect) return 'value';

  const orientation = getRangeOrientation(behavior);
  const direction = getRangeDirection(behavior);
  const local = orientation === 'vertical'
    ? clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1)
    : clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);

  if (local <= 0.32) {
    if (orientation === 'vertical') return direction === 'ttb' ? 'decrement' : 'increment';
    return direction === 'rtl' ? 'increment' : 'decrement';
  }

  if (local >= 0.68) {
    if (orientation === 'vertical') return direction === 'ttb' ? 'increment' : 'decrement';
    return direction === 'rtl' ? 'decrement' : 'increment';
  }

  return 'value';
}

