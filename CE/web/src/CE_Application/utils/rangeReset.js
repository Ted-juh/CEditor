import { displayScale, fromDisplay } from './valueDisplayScale.js';

// A bipolar control resets to the zero the musician sees, which may be 64 on
// the wire. Other ranges reset to their authored default, never their last value.
export function rangeResetValue(spec, meta = {}) {
  const min = Number(spec.min ?? 0), max = Number(spec.max ?? 1);
  const scale = displayScale(spec.format ?? spec, min, max);
  const offset = Number(meta.offset ?? 0);
  let displayMin = scale?.displayMin ?? min + offset;
  let displayMax = scale?.displayMax ?? max + offset;
  if (meta.display) {
    displayMin = Number(meta.display.min);
    displayMax = Number(meta.display.max);
  }
  let value = Number(spec.defaultValue ?? min);
  if (Math.min(displayMin, displayMax) < 0 && Math.max(displayMin, displayMax) > 0) {
    value = fromDisplay({ min, max, displayMin, displayMax }, 0);
  }
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
