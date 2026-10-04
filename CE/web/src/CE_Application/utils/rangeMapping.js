/**
 * How a control (a macro, a knob, a fader) drives a parameter, drawn as one range with two ends.
 *
 * The host stores a binding as rangeMin, rangeMax and an `inverted` flag, and plays it as
 * rangeMin + (inverted ? 1 - position : position) * (rangeMax - rangeMin), after snapping the
 * position to `steps` (InstrumentHostService::writeMappedBinding, ControlBinding::snap). The
 * picture has no flag: it has where the parameter is when the control is at the bottom (start)
 * and at the top (end). Dragging the ends past each other is what inverting means.
 */

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value) => Math.round(value * 1000) / 1000;

/** Where the parameter sits at the control's bottom and top. */
export function bindingEnds({ rangeMin = 0, rangeMax = 1, inverted = false } = {}) {
  return inverted ? { start: rangeMax, end: rangeMin } : { start: rangeMin, end: rangeMax };
}

/** The stored binding for two ends: a range that runs downwards is an inverted one. */
export function bindingFromEnds(start, end) {
  const a = round(clamp01(start)), b = round(clamp01(end));
  return a <= b ? { rangeMin: a, rangeMax: b, inverted: false } : { rangeMin: b, rangeMax: a, inverted: true };
}

/** ControlBinding::snap: N steps are N evenly spaced positions, ends included. */
export function snapPosition(position, steps = 0) {
  const p = clamp01(position);
  if (!(steps >= 2)) return p;
  return Math.round(p * (steps - 1)) / (steps - 1);
}

/** What the parameter is when the control is at `position`. */
export function mapPosition(binding, position) {
  const { start, end } = bindingEnds(binding);
  return start + snapPosition(position, binding?.steps ?? 0) * (end - start);
}

/** The positions a stepped control can land on (empty when it is smooth). */
export const stepPositions = (steps) => (steps >= 2
  ? Array.from({ length: steps }, (_, i) => i / (steps - 1)) : []);
