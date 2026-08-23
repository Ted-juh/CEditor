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

export const RETURN_CURVE = {
  linear: 'linear',
  /** Fast at first, slow into the rest — what a real spring does. */
  exp: 'exp',
  /** Slow, fast, slow. Reads as deliberate rather than sprung. */
  ease: 'ease',
};

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
