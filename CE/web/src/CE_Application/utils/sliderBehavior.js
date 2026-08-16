import { numberOr, clamp } from './primitives.js';
import { displayPrecision, displayScale, fromDisplay, toDisplay } from './valueDisplayScale.js';

// Re-exported so existing `from './sliderBehavior.js'` importers keep working.
export { numberOr, clamp };

export function isSliderBehavior(behavior = null) {
  return String(behavior?.family ?? '').trim().toLowerCase() === 'range'
    && String(behavior?.role ?? '').trim().toLowerCase() === 'slider';
}

export function getSliderGeometry(behavior = null) {
  return String(behavior?.geometry ?? 'linear').trim().toLowerCase() === 'circular'
    ? 'circular'
    : 'linear';
}

export function getSliderValueMode(behavior = null) {
  const mode = String(behavior?.valueMode ?? 'single').trim().toLowerCase();
  if (mode === 'range' || mode === 'band') return mode;
  return 'single';
}

export function getSliderActiveRoles(behavior = null) {
  switch (getSliderValueMode(behavior)) {
    case 'range':
      return ['start', 'end'];
    case 'band':
      return ['start', 'current', 'end'];
    default:
      return ['current'];
  }
}

export function getSliderMin(behavior = null) {
  return numberOr(behavior?.min, 0);
}

export function getSliderMax(behavior = null) {
  const min = getSliderMin(behavior);
  return Math.max(min, numberOr(behavior?.max, min + 1));
}

export function getSliderStep(behavior = null) {
  const valueType = String(behavior?.valueType ?? 'float').trim().toLowerCase();
  const fallback = valueType === 'int' ? 1 : 0.01;
  return Math.max(numberOr(behavior?.step, fallback), fallback);
}

export function getSliderOrientation(behavior = null) {
  return String(behavior?.orientation ?? 'horizontal').trim().toLowerCase() === 'vertical'
    ? 'vertical'
    : 'horizontal';
}

export function getSliderDirection(behavior = null) {
  const geometry = getSliderGeometry(behavior);
  if (geometry === 'circular') {
    return String(behavior?.direction ?? 'cw').trim().toLowerCase() === 'ccw'
      ? 'ccw'
      : 'cw';
  }

  const orientation = getSliderOrientation(behavior);
  const fallback = orientation === 'vertical' ? 'btt' : 'ltr';
  const value = String(behavior?.direction ?? fallback).trim().toLowerCase();
  if (orientation === 'vertical') {
    return value === 'ttb' ? 'ttb' : 'btt';
  }
  return value === 'rtl' ? 'rtl' : 'ltr';
}

export function getSliderStartAngle(behavior = null) {
  return numberOr(behavior?.startAngle, 135);
}

export function getSliderSweepAngle(behavior = null) {
  return clamp(numberOr(behavior?.sweepAngle, 270), 1, 360);
}

export function getSliderAllowWrapAround(behavior = null) {
  return getSliderGeometry(behavior) === 'circular' && behavior?.allowWrapAround === true;
}

export function getSliderAllowHandleCross(behavior = null) {
  return behavior?.allowHandleCross === true;
}

export function getSliderPrimaryRole(behavior = null, activeHandle = '') {
  const mode = getSliderValueMode(behavior);
  if (mode === 'single') return 'current';
  const normalized = String(activeHandle ?? '').trim().toLowerCase();
  if (normalized === 'start' || normalized === 'current' || normalized === 'end') return normalized;
  return mode === 'range' ? 'start' : 'current';
}

/**
 * Where a single-value slider sits before anyone touches it.
 *
 * `defaultCurrentValue` is the authored answer — it is what the Slider tab's "Default Current"
 * field writes, and what exportParameters serialises as the parameter's default. It has to win.
 *
 * It did not. `centerValue` was consulted first and returned whenever it was finite, and it is
 * ALWAYS finite: both section templates ship one (0.5). So the authored default was dead for
 * every slider whose Centre had not been changed by hand, and the two paths disagreed —
 * exportParameters wrote the author's -6 into the file while the canvas and preview started at
 * clamp(0.5, -60, 12) = 0.5 dB. Saved state and visible state describing different sliders.
 *
 * Centre is not a starting value and does not claim to be: its own field describes it as an
 * "optional centre reference value for bipolar sliders and centre markers", and the only other
 * reader is SliderFamilyRenderer drawing that marker. A bipolar slider that should rest at its
 * centre already gets there honestly — the presets set defaultCurrentValue to the centre for
 * exactly that case (SliderEditor's applyPreset).
 *
 * So centre stays as a fallback for a behavior block carrying no default at all, ahead of the
 * midpoint, and stops overriding an author who said what they wanted.
 */
function defaultCurrentValueFor(behavior = null) {
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);

  const authored = behavior?.defaultCurrentValue;
  if (Number.isFinite(Number(authored))) {
    return clamp(Number(authored), min, max);
  }

  const centerValue = behavior?.centerValue;
  if (Number.isFinite(Number(centerValue))) {
    return clamp(Number(centerValue), min, max);
  }

  return clamp(min + ((max - min) / 2), min, max);
}

export function getSliderDefaultValues(behavior = null) {
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const mode = getSliderValueMode(behavior);
  const preserveSemanticOrder = getSliderAllowHandleCross(behavior) || getSliderAllowWrapAround(behavior);
  const start = clamp(numberOr(behavior?.defaultStartValue, min), min, max);
  const end = clamp(numberOr(behavior?.defaultEndValue, max), min, max);
  const current = defaultCurrentValueFor(behavior);

  if (mode === 'range') {
    if (preserveSemanticOrder) {
      return {
        start,
        current: start,
        end,
      };
    }
    const orderedStart = Math.min(start, end);
    const orderedEnd = Math.max(start, end);
    return {
      start: orderedStart,
      current: orderedStart,
      end: orderedEnd,
    };
  }

  if (mode === 'band') {
    if (preserveSemanticOrder) {
      return {
        start,
        current,
        end,
      };
    }
    const orderedStart = Math.min(start, end);
    const orderedEnd = Math.max(start, end);
    return {
      start: orderedStart,
      current: clamp(current, orderedStart, orderedEnd),
      end: orderedEnd,
    };
  }

  return {
    start: min,
    current,
    end: max,
  };
}

function roleOverrideEnabled(session = null, role = 'current') {
  if (role === 'current' && session?.valueOverrideEnabled === true) return true;
  return session?.[`${role}ValueOverrideEnabled`] === true;
}

function roleOverrideValue(session = null, role = 'current') {
  if (role === 'current' && session?.valueOverrideEnabled === true) {
    return session?.valueOverride;
  }
  return session?.[`${role}ValueOverride`];
}

function snapToReachableValue(rawValue, min, max, step) {
  const clamped = clamp(numberOr(rawValue, min), min, max);
  if (!(step > 0)) return clamped;

  const snapped = min + (Math.round((clamped - min) / step) * step);
  const bounded = clamp(snapped, min, max);

  if (Math.abs(max - bounded) <= 0.000001) return max;
  if (Math.abs(min - bounded) <= 0.000001) return min;
  if (Math.abs(clamped - max) < Math.abs(clamped - bounded)) return max;
  if (Math.abs(clamped - min) < Math.abs(clamped - bounded)) return min;
  return bounded;
}

export function snapSliderValue(behavior = null, rawValue = 0) {
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const step = behavior?.snapToStep === false ? 0 : getSliderStep(behavior);
  let next = snapToReachableValue(rawValue, min, max, step);

  if (String(behavior?.valueType ?? 'float').trim().toLowerCase() === 'int') {
    next = Math.round(next);
  }

  return clamp(next, min, max);
}

function normalizeHandleOrder(behavior, values, activeHandle) {
  const mode = getSliderValueMode(behavior);
  const allowCross = getSliderAllowHandleCross(behavior);
  const allowWrap = getSliderAllowWrapAround(behavior);
  if (allowCross || allowWrap) return values;

  if (mode === 'range') {
    if (values.start > values.end) {
      if (activeHandle === 'start') {
        values.start = values.end;
      } else {
        values.end = values.start;
      }
    }
    return values;
  }

  if (mode === 'band') {
    if (values.start > values.end) {
      if (activeHandle === 'start') {
        values.start = values.end;
      } else {
        values.end = values.start;
      }
    }

    if (activeHandle === 'start') {
      values.start = Math.min(values.start, values.current, values.end);
    } else if (activeHandle === 'end') {
      values.end = Math.max(values.start, values.current, values.end);
    }

    values.current = clamp(values.current, values.start, values.end);
  }

  return values;
}

export function getSliderActiveHandle(behavior = null, session = null) {
  const roles = getSliderActiveRoles(behavior);
  if (roles.length === 1) return roles[0];
  const requested = String(session?.activeHandle ?? '').trim().toLowerCase();
  if (roles.includes(requested)) return requested;

  const policy = String(behavior?.activeHandlePolicy ?? '').trim().toLowerCase();
  if (roles.includes(policy.replace('first', ''))) {
    return policy.replace('first', '');
  }
  return roles.includes('current') ? 'current' : roles[0];
}

export function getSliderResolvedValues(behavior = null, session = null) {
  const defaults = getSliderDefaultValues(behavior);
  const roles = getSliderActiveRoles(behavior);
  const activeHandle = getSliderActiveHandle(behavior, session);
  const values = {
    start: defaults.start,
    current: defaults.current,
    end: defaults.end,
  };

  for (const role of roles) {
    if (!roleOverrideEnabled(session, role)) continue;
    values[role] = roleOverrideValue(session, role);
  }

  values.start = snapSliderValue(behavior, values.start);
  values.current = snapSliderValue(behavior, values.current);
  values.end = snapSliderValue(behavior, values.end);

  return normalizeHandleOrder(behavior, values, activeHandle);
}

export function isSliderDirty(behavior = null, session = null) {
  const defaults = getSliderDefaultValues(behavior);
  const values = getSliderResolvedValues(behavior, session);
  const roles = getSliderActiveRoles(behavior);
  return roles.some((role) => Math.abs(numberOr(values[role], 0) - numberOr(defaults[role], 0)) > 0.000001);
}

export function normalizeSliderValue(value, min, max) {
  const span = max - min;
  if (!Number.isFinite(span) || Math.abs(span) < 0.000001) return 0;
  return clamp((value - min) / span, 0, 1);
}

export function getSliderNormalizedValues(behavior = null, session = null) {
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const values = getSliderResolvedValues(behavior, session);
  return {
    start: normalizeSliderValue(values.start, min, max),
    current: normalizeSliderValue(values.current, min, max),
    end: normalizeSliderValue(values.end, min, max),
  };
}

function defaultPrecisionFor(behavior = null) {
  if (Number.isFinite(Number(behavior?.precision))) {
    return clamp(Math.round(numberOr(behavior?.precision, 0)), 0, 6);
  }

  const step = numberOr(behavior?.step, 0.01);
  if (step <= 0 || step >= 1) return String(behavior?.valueType ?? '').trim().toLowerCase() === 'int' ? 0 : 2;
  const [, fraction = ''] = String(step).split('.');
  return clamp(fraction.length, 0, 6);
}

/** The wire->display map this behaviour declares, or null when it declares none. */
export function sliderDisplayScale(behavior = null) {
  return displayScale(behavior, getSliderMin(behavior), getSliderMax(behavior));
}

export function formatSliderNumericValue(behavior = null, value = 0) {
  const snapped = snapSliderValue(behavior, value);
  // Snap in WIRE space, then map. The other order snaps to display steps, which for a 0..127
  // parameter shown as 0..100 lands on values the wire cannot hold.
  const scale = sliderDisplayScale(behavior);
  const shown = toDisplay(scale, snapped);
  const precision = displayPrecision(scale, defaultPrecisionFor(behavior));
  const showSign = behavior?.showSign === true && shown > 0;
  const prefix = String(behavior?.prefix ?? '');
  const suffix = String(behavior?.suffix ?? '');
  const unit = String(behavior?.unit ?? '');
  // A FIXED decimal point and NO grouping, deliberately — see the note on parseSliderInputValue.
  //
  // This used to be toLocaleString(undefined, ...), which is locale-dependent, and the parser below
  // strips commas as thousands separators. On any comma-decimal locale that pair is not an inverse,
  // it is data corruption: a GAIA MFX parameter at 12768 displayed as "12.768" in nl-NL, and typing
  // that back set 12.768 — out by a factor of a thousand. Grouping is the same hazard in reverse,
  // since "1,234" is 1234 in one locale and 1.234 in another.
  //
  // A parameter readout is a number you type back, not prose. Every audio plugin makes this trade.
  //
  // There is also no trailing-zero strip any more. There used to be a
  // `.replace(/\.?0+$/, precision === 0 ? '' : '$&')`, and it did exactly one thing: eat trailing
  // zeros off INTEGERS. `0` formatted as "", `10` as "1", `100` as "1". The `'$&'` branch replaced
  // the match with itself, so above precision 0 the call was a no-op — the only reachable behaviour
  // was the wrong one.
  const text = Number(shown).toFixed(precision);
  return `${prefix}${showSign ? '+' : ''}${text}${suffix}${unit ? ` ${unit}` : ''}`.trim();
}

export function formatSliderReadout(behavior = null, session = null) {
  const mode = getSliderValueMode(behavior);
  const values = getSliderResolvedValues(behavior, session);
  const separator = String(behavior?.rangeSeparator ?? ' - ');
  if (mode === 'range') {
    return `${formatSliderNumericValue(behavior, values.start)}${separator}${formatSliderNumericValue(behavior, values.end)}`;
  }
  if (mode === 'band') {
    const bandSeparator = String(behavior?.bandSeparator ?? ' | ');
    return [
      formatSliderNumericValue(behavior, values.start),
      formatSliderNumericValue(behavior, values.current),
      formatSliderNumericValue(behavior, values.end),
    ].join(bandSeparator);
  }
  return formatSliderNumericValue(behavior, values.current);
}

export function getSliderDisplayValue(behavior = null, session = null) {
  const role = String(session?.valueInputRole ?? getSliderPrimaryRole(behavior, getSliderActiveHandle(behavior, session))).trim().toLowerCase();
  if (session?.valueInputActive === true) {
    return String(session?.valueInputBuffer ?? '');
  }
  const values = getSliderResolvedValues(behavior, session);
  return formatSliderNumericValue(behavior, values[role] ?? values.current);
}

export function parseSliderInputValue(behavior = null, input = '') {
  const trimmed = String(input ?? '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null;
  }

  const prefix = String(behavior?.prefix ?? '').trim();
  const suffix = String(behavior?.suffix ?? '').trim();
  const unit = String(behavior?.unit ?? '').trim();
  let normalized = trimmed;

  if (prefix && normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length).trim();
  if (suffix && normalized.endsWith(suffix)) normalized = normalized.slice(0, normalized.length - suffix.length).trim();
  if (unit && normalized.endsWith(unit)) normalized = normalized.slice(0, normalized.length - unit.length).trim();
  // A comma is accepted as a DECIMAL separator, not stripped as a thousands separator. Stripping
  // was the other half of the locale bug above: it turned "64,5" into 645. Nothing formats with
  // grouping any more, so a comma in the input can only have come from a person typing their own
  // decimal separator, and reading it as one is what they meant.
  normalized = normalized.replace(',', '.');

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  // The exact inverse of formatSliderNumericValue. Without it a readout of -3 that you retype as
  // -3 sets -3 on the wire, and the control jumps to its floor the first time anyone edits by
  // keyboard — a bug that only appears on the parameters the display scale exists for.
  return snapSliderValue(behavior, fromDisplay(sliderDisplayScale(behavior), parsed));
}

export function getSliderLegalRangeForHandle(behavior = null, session = null, handle = 'current') {
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const values = getSliderResolvedValues(behavior, session);
  if (getSliderAllowHandleCross(behavior) || getSliderAllowWrapAround(behavior)) {
    return { min, max };
  }

  if (handle === 'start') {
    return { min, max: getSliderValueMode(behavior) === 'band' ? values.current : values.end };
  }
  if (handle === 'end') {
    return { min: getSliderValueMode(behavior) === 'band' ? values.current : values.start, max };
  }
  if (getSliderValueMode(behavior) === 'band') {
    return { min: values.start, max: values.end };
  }
  return { min, max };
}
