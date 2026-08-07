// valueDisplayScale.js — the number on the wire is not always the number a person reads.
//
// THE PROBLEM, in the form it actually arrived. The GAIA's Octave Shift is stored 61..67 and its
// front panel reads -3..+3. Arpeggio Octave Range is the same. Every MFX parameter is stored
// 12768..52768 and reads -20000..+20000. A control bound to one of those showed 64 where the
// instrument shows 0 — not wrong by a rounding, wrong by a constant, on every bipolar parameter the
// machine has. The device profile has carried `display.min` / `display.max` since it was written;
// nothing between the profile and the screen did anything with them.
//
// A SCALE, NOT AN OFFSET. Bipolar parameters happen to be a pure offset, but the pair (wire range,
// display range) also covers a parameter stored 0..127 that reads 0..100, or 5..300 BPM read as
// itself. One linear map handles all of them and needs no per-parameter code.
//
// THE INVERSE IS NOT OPTIONAL, and it is the half that is easy to forget. If a readout says -3 and
// typing -3 sets 61 on the wire, the two directions agree. If typing -3 sets -3, the control jumps
// somewhere nobody asked for the moment anyone edits by keyboard. Both directions live here so they
// cannot drift apart.
//
// ABSENT BY DEFAULT. No displayMin/displayMax means no scale, which means every existing control
// formats exactly as it did — this cannot change a panel that never opted in.

import { numberOr } from './primitives.js';

/**
 * The display scale on a Behavior or a ValueChannel's `format`, or null.
 *
 * Null in every ambiguous case: a missing bound, a non-finite one, a zero-width wire range (nothing
 * to map from), or a display range identical to the wire range (a map that would be the identity,
 * and carrying one costs a multiply and a rounding for no reason).
 */
export function displayScale(spec, wireMin, wireMax) {
  if (!spec) return null;
  const displayMin = Number(spec.displayMin);
  const displayMax = Number(spec.displayMax);
  if (!Number.isFinite(displayMin) || !Number.isFinite(displayMax)) return null;

  const min = numberOr(wireMin, 0);
  const max = numberOr(wireMax, 0);
  if (max === min) return null;
  if (displayMin === min && displayMax === max) return null;

  return { min, max, displayMin, displayMax };
}

/** Wire value -> the number to show. Outside the wire range it keeps extrapolating, deliberately:
 *  clamping here would hide a value that is out of range instead of showing that it is. */
export function toDisplay(scale, value) {
  if (!scale) return value;
  const n = numberOr(value, scale.min);
  return scale.displayMin + ((n - scale.min) / (scale.max - scale.min)) * (scale.displayMax - scale.displayMin);
}

/** The number a person typed -> the wire value. The exact inverse of toDisplay. */
export function fromDisplay(scale, value) {
  if (!scale) return value;
  const n = numberOr(value, scale.displayMin);
  if (scale.displayMax === scale.displayMin) return scale.min;
  return scale.min + ((n - scale.displayMin) / (scale.displayMax - scale.displayMin)) * (scale.max - scale.min);
}

/**
 * A value channel's value, as text for a person.
 *
 * Lives here rather than beside createValueChannel because the scale and the formatting cannot be
 * separated: precision depends on the scale (see displayPrecision), so splitting them across two
 * files would mean one of them guessing.
 *
 * Non-numeric channels — enum, array, anything that does not parse — are returned as they are.
 * Formatting an array as a number produced "NaN" on every arpeggiator, which is a good deal worse
 * than the raw text this replaced.
 */
export function formatChannelValue(channel, raw) {
  if (raw == null) return '';
  const type = String(channel?.type ?? '').trim().toLowerCase();
  if (type === 'enum' || type === 'array' || type === 'string' || Array.isArray(raw)) return String(raw);
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return String(raw);

  const format = channel?.format ?? {};
  const scale = displayScale(format, channel?.min, channel?.max);
  const shown = toDisplay(scale, numeric);
  const base = Number.isFinite(Number(format.precision))
    ? Math.max(0, Math.min(6, Math.round(Number(format.precision))))
    : (type === 'int' || type === 'bool' ? 0 : 2);
  const precision = displayPrecision(scale, base);

  const prefix = String(format.prefix ?? '');
  const suffix = String(format.suffix ?? '');
  const unit = String(format.unit ?? '');
  const text = shown.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
  return `${prefix}${text}${suffix}${unit ? ` ${unit}` : ''}`.trim();
}

/**
 * How many decimals a display value needs so one wire step is still visible.
 *
 * A wire range of 61..67 shown as -3..+3 moves one-for-one and wants none. A range of 0..127 shown
 * as 0..100 moves 0.79 per step, and rounding that to a whole number makes two adjacent wire values
 * read the same — which looks exactly like a control that has stopped responding.
 */
export function displayPrecision(scale, fallback = 0) {
  if (!scale) return fallback;
  const perStep = Math.abs((scale.displayMax - scale.displayMin) / (scale.max - scale.min));
  if (perStep >= 1) return fallback;
  if (perStep >= 0.1) return Math.max(fallback, 1);
  return Math.max(fallback, 2);
}
