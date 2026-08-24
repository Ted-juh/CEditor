// returnToRest.js — the spring-back a pitch wheel has, factored once.
//
// Four components were each about to reinvent it: a pitch or mod wheel springing to centre, a
// ribbon returning to rest, a vector joystick recentring, a spring-loaded fader. One capability,
// many components — the same rule the Timer follows.
//
// THE PART THAT IS NOT OBVIOUS is that the glide has to EMIT. A spring-back that jumps the on-screen
// control to centre and tells the device nothing leaves the synth bent — so the return is a series
// of values over time, not a single write, and something has to rate-limit it. That policy lives
// with the morph budget in `snapshotModel.js` rather than being invented twice.
//
// Pure: a function of (from, rest, elapsed) → value, plus the rest-value rules. The Timer drives it
// and the preview surface writes what it returns, neither of which belongs in a unit test.

export const RETURN_MODE = {
  /** Latch. The control stays where it was let go — the default, and what most controls want. */
  none: 'none',
  center: 'center',
  min: 'min',
  max: 'max',
  /** A configured value. */
  rest: 'rest',
};

/**
 * The modes and curves as ordered lists, for a picker or a script verb's enum.
 *
 * Derived from the objects rather than written twice — a fourth mode added above would otherwise
 * be invisible to every editor and every script until somebody noticed the list was short.
 */
export const RETURN_MODES = ['none', 'center', 'min', 'max', 'rest'];

export const RETURN_CURVE = {
  linear: 'linear',
  /** Fast at first, slow into the rest — what a real spring does. */
  exp: 'exp',
  /** Slow, fast, slow. Reads as deliberate rather than sprung. */
  ease: 'ease',
};

export const RETURN_CURVES = ['linear', 'exp', 'ease'];

/** The defaults a Behavior section carries. `none` so nothing existing starts springing. */
export const RETURN_DEFAULTS = {
  returnMode: RETURN_MODE.none,
  returnValue: 0,
  returnTime: 120,
  returnCurve: RETURN_CURVE.exp,
};

/**
 * Where this control returns to, in its own units.
 *
 * `null` means it does not return at all, which the caller must be able to tell from "returns to
 * zero" — those are opposite behaviours for a fader whose minimum is zero.
 */
export function restValueFor(behavior) {
  const mode = String(behavior?.returnMode ?? RETURN_MODE.none);
  if (mode === RETURN_MODE.none) return null;

  const min = Number(behavior?.min ?? 0);
  const max = Number(behavior?.max ?? 1);
  switch (mode) {
    case RETURN_MODE.center: return min + (max - min) / 2;
    case RETURN_MODE.min: return min;
    case RETURN_MODE.max: return max;
    case RETURN_MODE.rest: {
      const value = Number(behavior?.returnValue ?? min);
      return Number.isFinite(value) ? Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max)) : min;
    }
    default: return null;
  }
}

/** Shape the 0..1 progress. */
export function shapeProgress(progress, curve = RETURN_CURVE.exp) {
  const t = Math.min(1, Math.max(0, Number(progress) || 0));
  switch (curve) {
    // 1 - (1-t)^3: most of the distance is covered early, then it settles — a spring, not a ramp.
    case RETURN_CURVE.exp: return 1 - (1 - t) ** 3;
    case RETURN_CURVE.ease: return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    default: return t;
  }
}

/**
 * One frame of a return.
 *
 * `done` is part of the answer rather than something the caller re-derives from the value, because
 * a curve can land on the rest value before its time is up and a caller comparing floats would keep
 * ticking a finished glide forever.
 */
export function returnStep(from, rest, elapsedMs, behavior) {
  // `null` is restValueFor's way of saying "this control does not return", and Number(null) is 0 —
  // which is a real rest value for a fader whose minimum is zero. Checked before any coercion, or a
  // latching control springs to its floor the first time somebody lets go of it.
  if (rest === null || rest === undefined) return { value: from, done: true };

  const target = Number(rest);
  const start = Number(from);
  if (!Number.isFinite(target)) return { value: from, done: true };
  if (from === null || from === undefined || !Number.isFinite(start)) return { value: target, done: true };

  const duration = Number(behavior?.returnTime ?? RETURN_DEFAULTS.returnTime);
  // Zero means snap, and it has to be exactly zero rather than "very fast": a control configured to
  // snap should not emit an intermediate value at all.
  if (!Number.isFinite(duration) || duration <= 0) return { value: target, done: true };

  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed >= duration) return { value: target, done: true };

  const shaped = shapeProgress(elapsed / duration, behavior?.returnCurve);
  return { value: start + (target - start) * shaped, done: false };
}

/**
 * Every value a return will emit, at a given frame rate.
 *
 * Used by the tests and by anything that wants the glide without a clock — and it exists mostly so
 * the emit cadence is a stated number rather than whatever the caller's timer happened to be. At
 * 60fps a 120ms return is eight values, which is a spring a synth can follow and not a flood.
 */
export function returnFrames(from, rest, behavior, { fps = 60 } = {}) {
  const duration = Number(behavior?.returnTime ?? RETURN_DEFAULTS.returnTime);
  if (!Number.isFinite(duration) || duration <= 0) return [Number(rest)];

  const step = 1000 / Math.max(1, fps);
  const frames = [];
  for (let elapsed = step; elapsed < duration; elapsed += step) {
    frames.push(returnStep(from, rest, elapsed, behavior).value);
  }
  frames.push(Number(rest));
  return frames;
}

/**
 * A 2D return — a joystick's puck, a vector pad.
 *
 * Both axes travel on ONE progress rather than one each, so the puck moves in a straight line to
 * the centre. Per-axis timing would make it curve, which looks like a bug in a control whose whole
 * job is to be a position.
 */
export function returnStep2D(from, rest, elapsedMs, behavior) {
  const x = returnStep(from?.x, rest?.x, elapsedMs, behavior);
  const y = returnStep(from?.y, rest?.y, elapsedMs, behavior);
  return { value: { x: x.value, y: y.value }, done: x.done && y.done };
}

/**
 * One canonical return spec out of any of the vocabularies that grew before this module existed.
 *
 * Three components shipped their own spring before the capability was factored out, and each
 * invented its own words for it:
 *
 *   Joystick    `returnToCenter: true`, `returnAxes`, `returnRate: 4`
 *   Crossfader  `returnToCenter: true`, `returnRate: 4`
 *   Ribbon      `returnMode: 'center'|'min'|'max'|'rest'`, `returnValue`, `returnRate: 8`
 *
 * They are unified onto `returnMode` / `returnValue` / `returnTime` / `returnCurve` — but READ-TIME
 * rather than by rewriting panel files. A file migration can corrupt a document and has to be right
 * first time on data nobody can re-check; a normaliser cannot, runs on every load forever, and
 * keeps working for a panel authored years ago that nobody re-saved.
 *
 * RATE BECOMES TIME, and the conversion is exact rather than a feel-match: the old glide moved at
 * `rate` units per second across a 0..1 range, so it crossed the whole range in `1000 / rate`
 * milliseconds. Rate 4 was 250ms, rate 8 was 125ms. The curve becomes `linear`, because the old
 * glide was a constant-speed walk — giving these three the default `exp` spring would be a
 * different feel silently applied to existing panels.
 */
export function normalizeReturnBehavior(section, { defaultRate = 4, range = 1 } = {}) {
  const source = section ?? {};

  // `returnToCenter` is the boolean spelling; `returnMode` the named one. A component carrying both
  // is a component mid-migration, and the named one is the newer statement of intent.
  const named = String(source.returnMode ?? '').trim();
  const mode = Object.values(RETURN_MODE).includes(named)
    ? named
    : (source.returnToCenter === true ? RETURN_MODE.center : RETURN_MODE.none);

  const rate = Number(source.returnRate);
  const explicitTime = Number(source.returnTime);
  const time = Number.isFinite(explicitTime) && explicitTime >= 0
    ? explicitTime
    // Rate 0 meant "snap instantly" in all three, and 0ms means the same here.
    : (Number.isFinite(rate) && rate > 0 ? 1000 / rate : (rate === 0 ? 0 : 1000 / defaultRate));

  const curve = Object.values(RETURN_CURVE).includes(String(source.returnCurve ?? ''))
    ? String(source.returnCurve)
    : RETURN_CURVE.linear;

  return {
    returnMode: mode,
    returnValue: Number.isFinite(Number(source.returnValue)) ? Number(source.returnValue) : 0,
    returnTime: time,
    returnCurve: curve,
    // The three all work in 0..1, which restValueFor needs told: without a range it assumes 0..1
    // anyway, but saying so keeps a component with real units working through the same path.
    min: Number.isFinite(Number(source.min)) ? Number(source.min) : 0,
    max: Number.isFinite(Number(source.max)) ? Number(source.max) : range,
    // Joystick-only, and passed through rather than interpreted here: which axes spring back is a
    // question only a 2-D control can ask, and returnStep2D takes it as an argument.
    returnAxes: String(source.returnAxes ?? 'both'),
  };
}

/**
 * A 2-D return that can spring one axis and leave the other.
 *
 * The joystick's `returnAxes`. An axis that is not returning holds its value and reports itself
 * done, so the glide finishes when the axes that ARE returning have arrived rather than never.
 */
export function returnStep2DAxes(from, rest, elapsedMs, behavior, axes = 'both') {
  const doX = axes === 'both' || axes === 'x';
  const doY = axes === 'both' || axes === 'y';
  const x = doX ? returnStep(from?.x, rest?.x, elapsedMs, behavior) : { value: from?.x, done: true };
  const y = doY ? returnStep(from?.y, rest?.y, elapsedMs, behavior) : { value: from?.y, done: true };
  return { value: { x: x.value, y: y.value }, done: x.done && y.done };
}
