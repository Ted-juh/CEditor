// displayMaps.js — value → visual, for the visuals a display needs and a control does not.
//
// The Bindings section already maps a value into a property path, which covers everything shaped
// like "a number becomes a width". What it does not cover is the handful of maps where the ARITHMETIC
// is the feature: how many cells of a grid light for this level, where a peak marker sits after it
// has been decaying for 300ms, which of eight segments a five-way selector lights. Those are the
// maps the design note left to define, and each of them is a place a component would otherwise
// invent its own slightly-different answer.
//
// The recurring trap in all of them is the EMPTY READING. A meter with no signal yet and a meter
// reading zero look identical if `undefined` coerces to 0, and they are not the same thing: one is
// "not connected", the other is "silent". Every function here returns something a caller can tell
// apart, and none of them coerce absence into a floor.

import { clamp } from './primitives.js';

/** How a bar or a cell run fills. */
export const FILL_MODE = {
  /** Everything from the origin up to the value. A level meter. */
  bar: 'bar',
  /** One cell at the value. A position indicator, a rotary's dot. */
  point: 'point',
  /** From the centre outwards, either way. A pan or a bipolar modulation depth. */
  center: 'center',
};

/**
 * A value's position in its range, 0..1, or `null` when there is no reading.
 *
 * `null` rather than 0 for the same reason `restValueFor` returns null: for a meter whose minimum
 * is zero, "no signal" and "silence" are different states and a display that cannot tell them apart
 * will show a connected device as a dead one.
 */
export function normalizedLevel(value, { min = 0, max = 1 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return null;
  return clamp((n - lo) / (hi - lo), 0, 1);
}

/**
 * Which cells of a run are lit.
 *
 * Returns booleans rather than a count so `point` and `center` need no second function, and so a
 * caller can render a grid by index without re-deriving the rule per cell.
 *
 * ROUNDING IS UP for `bar`, deliberately. A signal just above silence must light the first cell or
 * the meter reads as dead for the whole bottom 1/n of its range — which on an eight-cell meter is
 * an eighth of the scale showing nothing. Exact zero still lights nothing, which is the distinction
 * that rounding up would otherwise destroy.
 */
export function litCells(value, { min = 0, max = 1, cells = 8, mode = FILL_MODE.bar } = {}) {
  const count = Math.max(0, Math.trunc(Number(cells) || 0));
  const off = new Array(count).fill(false);
  if (count === 0) return off;

  const level = normalizedLevel(value, { min, max });
  if (level === null) return off;   // no reading lights nothing, and is not a zero reading

  if (mode === FILL_MODE.point) {
    const index = Math.min(count - 1, Math.floor(level * count));
    off[index] = true;
    return off;
  }

  if (mode === FILL_MODE.center) {
    // The middle cell is the origin. An odd run has a true centre; an even one lights the pair
    // either side of the seam, because leaving a bipolar meter with no centre reading at all is
    // worse than lighting two.
    const centre = (count - 1) / 2;
    const reach = (level - 0.5) * 2 * centre;
    const lo = Math.min(centre, centre + reach);
    const hi = Math.max(centre, centre + reach);
    for (let i = 0; i < count; i += 1) {
      if (i >= Math.floor(lo) && i <= Math.ceil(hi)) off[i] = true;
    }
    return off;
  }

  const lit = level === 0 ? 0 : Math.max(1, Math.ceil(level * count));
  for (let i = 0; i < Math.min(lit, count); i += 1) off[i] = true;
  return off;
}

/**
 * A peak marker that falls back.
 *
 * Pure and clock-free: the caller passes elapsed time, so a test can run a decay in one call and a
 * Timer can run it in sixty. `decayPerSecond` is in normalised units — 0.4 means the marker crosses
 * the whole scale in two and a half seconds, which is roughly what a hardware meter does.
 *
 * A NEW PEAK ALWAYS WINS IMMEDIATELY: the marker's job is to catch a transient too short to see, so
 * it must rise instantly and fall slowly. Smoothing the rise would defeat the entire point of it.
 */
export function peakHold(previous, level, { elapsedMs = 0, decayPerSecond = 0.4, holdMs = 0 } = {}) {
  const now = level === null || level === undefined ? null : clamp(Number(level) || 0, 0, 1);
  const was = previous?.value === null || previous?.value === undefined
    ? null
    : clamp(Number(previous.value) || 0, 0, 1);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);

  if (now !== null && (was === null || now >= was)) {
    return { value: now, heldFor: 0 };
  }
  if (was === null) return { value: null, heldFor: 0 };

  const held = Math.max(0, Number(previous?.heldFor) || 0) + elapsed;
  if (held < Math.max(0, Number(holdMs) || 0)) return { value: was, heldFor: held };

  const fall = (Math.max(0, Number(decayPerSecond) || 0) * elapsed) / 1000;
  const next = Math.max(now ?? 0, was - fall);
  return { value: next, heldFor: held };
}

/**
 * Which segment of an enumerated display is lit.
 *
 * Distinct from `litCells(point)` because the input is a CHOICE and not a level: a five-way waveform
 * selector's third position is segment 2, not "40% of the way along". Feeding it through a level
 * would round differently at the ends and light the wrong segment on a four-way.
 */
export function segmentStates(value, { segments = 0, choices = null } = {}) {
  const list = Array.isArray(choices) ? choices : null;
  const count = Math.max(0, Math.trunc(Number(segments) || list?.length || 0));
  const states = new Array(count).fill(false);
  if (count === 0) return states;
  if (value === undefined || value === null) return states;

  let index = -1;
  if (list) {
    index = list.findIndex((choice) => choice === value
      || String(choice?.value ?? choice?.id ?? choice) === String(value));
  }
  if (index < 0) {
    const n = Number(value);
    if (Number.isFinite(n)) index = Math.trunc(n);
  }
  // Out of range lights nothing rather than clamping to an end. A selector reporting a position the
  // display does not have is a mapping bug, and lighting segment 0 for it hides that.
  if (index < 0 || index >= count) return states;

  states[index] = true;
  return states;
}

/**
 * Text from a value, for an LCD field or a readout.
 *
 * `placeholder` is what "no reading" looks like, and it defaults to the em dash rather than an empty
 * string: a field that goes blank looks broken, and one showing "0" is lying.
 */
export function textFromValue(value, {
  decimals = null, unit = '', prefix = '', choices = null, placeholder = '—', pad = 0,
} = {}) {
  if (value === undefined || value === null || value === '') return placeholder;

  if (Array.isArray(choices)) {
    const n = Number(value);
    const picked = Number.isFinite(n) ? choices[Math.trunc(n)] : null;
    const label = picked?.label ?? picked?.name ?? (typeof picked === 'string' ? picked : null);
    if (label !== null && label !== undefined) return `${prefix}${label}`;
  }

  if (typeof value === 'boolean') return `${prefix}${value ? 'On' : 'Off'}`;

  const n = Number(value);
  if (!Number.isFinite(n)) return `${prefix}${String(value)}${unit}`;

  const places = decimals === null || decimals === undefined ? null : Math.max(0, Math.trunc(decimals));
  let text = places === null ? String(n) : n.toFixed(places);
  const width = Math.max(0, Math.trunc(Number(pad) || 0));
  if (width > 0) text = text.padStart(width, '0');
  return `${prefix}${text}${unit}`;
}

/**
 * The fill geometry a bar-shaped display needs: where it starts and how far it runs.
 *
 * One function for all three modes because a caller that computes `width` itself for `bar` and then
 * meets a `center` meter will get the offset wrong — a centre-origin bar grows from the middle in
 * both directions, so its `start` moves as well as its `length`.
 */
export function barGeometry(value, { min = 0, max = 1, mode = FILL_MODE.bar, origin = null } = {}) {
  const level = normalizedLevel(value, { min, max });
  if (level === null) return { start: 0, length: 0, level: null, empty: true };

  if (mode === FILL_MODE.center) {
    const anchor = origin === null || origin === undefined
      ? 0.5
      : clamp(Number(normalizedLevel(origin, { min, max }) ?? 0.5), 0, 1);
    return {
      start: Math.min(anchor, level),
      length: Math.abs(level - anchor),
      level,
      empty: false,
    };
  }

  if (mode === FILL_MODE.point) {
    return { start: level, length: 0, level, empty: false };
  }

  return { start: 0, length: level, level, empty: false };
}

/**
 * A threshold band for a cell or a bar — the colour a level meter changes at.
 *
 * Bands are `{ from, colour }` with `from` normalised, and the LAST band whose `from` the level has
 * reached wins. Sorted here rather than trusting the author's order, because a band list that is
 * out of order silently colours everything with the first entry.
 */
export function bandFor(level, bands = []) {
  if (level === null || level === undefined) return null;
  const list = (Array.isArray(bands) ? bands : [])
    .filter((band) => band && Number.isFinite(Number(band.from)))
    .sort((a, b) => Number(a.from) - Number(b.from));
  let hit = null;
  for (const band of list) {
    if (clamp(Number(level), 0, 1) >= Number(band.from)) hit = band;
  }
  return hit;
}
