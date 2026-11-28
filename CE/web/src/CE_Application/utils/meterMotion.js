// meterMotion.js — what moves a meter by itself (the Meter, phase 2: docs/design/component-presets.md).
//
// Two things, both pure, both kept by the preview surface (editor/PanelPreviewSurface.svelte,
// applyMeterValueSource) on the meter ticker it already runs for a falling peak:
//
//   A TEST SIGNAL (Meter.testSignal), so a meter moves in Preview with nothing connected: a level
//   made up from the time, as music would move it ('program'), a slow sweep up and down ('sweep'),
//   or a quiet level with a loud burst now and then ('bursts'). It is the meter's level only while
//   nothing else gives one (a route, a script, a control it follows), and only where the surface is
//   asked for it: the editor's Preview, never an exported plug-in, whose meters show what they are
//   sent and nothing invented.
//
//   BALLISTICS (Meter.riseTime, fallTime, overshoot): how a needle gets to a new level, as drawn.
//   A damped spring that reaches the level in about `riseTime` ms going up and `fallTime` ms going
//   down, swinging `overshoot` of the move past it first: a VU's 300 ms with a little overshoot, a
//   PPM's quick rise and slow fall. Both 0, it jumps, as a meter always did. Only the DRAWING
//   moves so: its reading, what a Label shows, and what its animations hear stay the level as it
//   arrives.

export const METER_TEST_SIGNALS = Object.freeze(['', 'program', 'sweep', 'bursts']);
export const METER_TEST_SIGNAL_LABELS = Object.freeze({ '': 'None', program: 'Programme', sweep: 'Sweep', bursts: 'Bursts' });

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

// Smooth noise over time, -1 to 1: a few slow sines out of step with one another.
const wander = (t, seed) => (
  Math.sin(t * 0.00071 + seed * 40) * 0.5
  + Math.sin(t * 0.00173 + seed * 91) * 0.3
  + Math.sin(t * 0.00411 + seed * 17) * 0.2
);
// Fast jitter, -1 to 1, the grain of a live signal.
const grain = (t, seed) => Math.sin(t * 0.031 + seed * 7) * Math.sin(t * 0.047 + seed * 13);

/**
 * Where a test signal puts the level at `t` ms, 0 to 1 along the meter's scale; null for none. Every
 * meter on the same signal moves as one, so needles with different ballistics can be compared.
 *
 *   program  a beat every half second, each a kick that dies away, over a level that wanders, with
 *            a louder phrase every eight seconds that reaches the top
 *   sweep    up from nothing to full scale in three seconds and back down in three
 *   bursts   a quiet level, and every 2.4 s a burst to the top that holds for 150 ms and falls away
 */
export function meterTestLevel(kind, t) {
  const time = num(t, 0);
  const seed = 0.3;
  if (kind === 'sweep') {
    const phase = (time % 6000) / 6000;
    return clamp01(phase < 0.5 ? phase * 2 : 2 - phase * 2);
  }
  if (kind === 'bursts') {
    // Each burst holds at the top for 150 ms, as a loud hit does, so a meter whose level is read once
    // a frame sees it clip however slow its frames: one that fell away at once was above 90% for
    // some 24 ms, and on a busy machine most went unseen.
    const since = time % 2400;
    const burst = since < 30 ? since / 30 : since < 180 ? 1 : Math.exp(-(since - 180) / 160);
    return clamp01(0.16 + grain(time, seed) * 0.03 + burst * 0.84);
  }
  if (kind === 'program') {
    const beat = (time % 500) / 500;
    const kick = Math.exp(-beat * 500 / 180);
    const loud = Math.max(0, Math.sin(((time % 8000) / 8000) * Math.PI)) ** 6;
    return clamp01(0.5 + wander(time, seed) * 0.14 + kick * 0.2 + loud * 0.32 + grain(time, seed) * 0.025);
  }
  return null;
}

/**
 * A meter's ballistics as its settings give them, or null: it jumps. Rise and fall in ms (0 to 5000;
 * one of them 0 takes the other's), overshoot 0 to 0.5 of the move.
 */
export function meterBallistics(cfg = {}) {
  const rise = Math.max(0, Math.min(5000, num(cfg.riseTime, 0)));
  const fall = Math.max(0, Math.min(5000, num(cfg.fallTime, 0)));
  if (!(rise > 0) && !(fall > 0)) return null;
  return { rise: rise || fall, fall: fall || rise, overshoot: Math.max(0, Math.min(0.5, num(cfg.overshoot, 0))) };
}

// The spring's damping for an overshoot: none overshoots nothing (critically damped).
function dampingFor(overshoot) {
  if (!(overshoot > 0)) return 1;
  const l = Math.log(overshoot);
  return -l / Math.sqrt(Math.PI * Math.PI + l * l);
}

const STEP_MS = 4;
const LONGEST_MS = 250;

/**
 * The needle `dt` ms on, going for `target` (0 to 1): `{ pos, vel }` from the same. A spring whose
 * stiffness is the rise's while it is below the level and the fall's while above, so a PPM leaps up
 * and sinks; stepped implicitly in 4 ms steps, which stays steady however stiff. A gap longer than a
 * quarter of a second (a hidden tab) is taken as a quarter of a second.
 */
export function stepNeedle(state, target, dt, ballistics) {
  let pos = num(state?.pos, target);
  let vel = num(state?.vel, 0);
  const goal = clamp01(num(target, 0));
  if (!ballistics) return { pos: goal, vel: 0 };
  const zeta = dampingFor(ballistics.overshoot);
  let left = Math.max(0, Math.min(LONGEST_MS, num(dt, 0))) / 1000;
  while (left > 1e-9) {
    const h = Math.min(STEP_MS / 1000, left);
    left -= h;
    // About 99% of the way in its time, critically damped: 6.64 time constants.
    const omega = 6.64 / ((goal >= pos ? ballistics.rise : ballistics.fall) / 1000);
    vel = (vel + h * omega * omega * (goal - pos)) / (1 + 2 * zeta * omega * h + omega * omega * h * h);
    pos += h * vel;
  }
  // A needle stops at its pins.
  if (pos < 0) { pos = 0; vel = Math.max(0, vel); }
  if (pos > 1.06) { pos = 1.06; vel = Math.min(0, vel); }
  return { pos, vel };
}

/**
 * A value effect's needle on a meter with ballistics, one frame on: the effect says where the needle
 * is going (`effect`, 0 to 1, or null once it has ended), the spring how it gets there. Ended, it goes
 * on following the meter's own drawn place (`live`, its ballistics already) and is handed back, null,
 * once it rests on it, so the needle never jumps. `state` null starts it where it is drawn, at rest.
 * `now` in ms; editor/CanvasControl.svelte steps it once a frame.
 */
export function effectNeedleStep(state, { effect, live, now, ballistics }) {
  const was = state ?? { pos: num(live, 0), vel: 0, at: num(now, 0) };
  const going = Number.isFinite(effect);
  const target = going ? effect : num(live, 0);
  const next = stepNeedle(was, target, num(now, 0) - num(was.at, 0), ballistics);
  return !going && needleSettled(next, target) ? null : { ...next, at: num(now, 0) };
}

/** Whether a needle has come to rest on its level. */
export function needleSettled(state, target) {
  return Math.abs(num(state?.pos, 0) - num(target, 0)) < 5e-4 && Math.abs(num(state?.vel, 0)) < 5e-3;
}

/**
 * The value a meter reads where its level stands at `pos` (0 to 1 along its scale): the inverse of
 * meterLayout.js meterPosition, so a test signal shows a reading in the meter's own units (decibels
 * on a decibel scale).
 */
export function meterValueAt(pos, cfg = {}) {
  const lo = num(cfg.valueMin, 0);
  const hi = num(cfg.valueMax, 1);
  const p = clamp01(num(pos, 0));
  let fraction = p;
  if (String(cfg.scale) === 'db') {
    const floor = num(cfg.dbFloor, -60);
    const ceil = num(cfg.dbCeil, 6);
    fraction = Math.min(1, 10 ** ((floor + p * (ceil - floor)) / 20));
  }
  return lo + fraction * (hi - lo);
}
