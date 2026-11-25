/**
 * sceneClock.js — a scene whose playhead is a gesture, not time (step 5c; docs/design/animation-designer.md,
 * "Gestures that drive a scene"). The input sets where the scene should be, 0 to 1 (`target`); this
 * moves what is shown (`shown`) after it, exactly, smoothly or on a spring, and carries a released
 * drag on with its speed. Pure: the runtime (sceneRuntime.js) feeds it inputs and frame times.
 *
 * With reduced motion a driven scene still follows the hand — it is the hand — but exactly, and a
 * drag let go does not carry on.
 */

import { resolvePartPixelRect } from './customComponentLayout.js';

/** How fast `smooth` closes the gap: about 63 % of it in this many milliseconds. */
export const SMOOTH_MS = 90;
/** The spring: stiffness and damping per second; damped a little under critical, so it settles with a small overshoot. */
export const SPRING = Object.freeze({ stiffness: 260, damping: 26 });
/** A released drag's speed falls to about 37 % in this many milliseconds. */
export const CARRY_MS = 300;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/** How far a drag moved the way the clock goes forward, in pixels. */
export function along(dx, dy, direction = 'up') {
  if (direction === 'down') return Number(dy) || 0;
  if (direction === 'left') return -(Number(dx) || 0);
  if (direction === 'right') return Number(dx) || 0;
  return -(Number(dy) || 0);
}

/**
 * Where one of a control's parts is, in the control's own pixels, for a clock heard on that part
 * alone: from the part's layout and the control's size. Null when it has no such part, or no layout.
 */
export function partRectOf(control, part) {
  const node = control?._children?.Parts?._children?.[part];
  const transform = control?._children?.Transform ?? {};
  const rect = node?._children?.Layout ? resolvePartPixelRect(node._children.Layout, Number(transform.width) || 0, Number(transform.height) || 0) : null;
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

/** Whether a point in the control's pixels is inside a rect. */
export const pointInRect = (point, rect) => !!point && !!rect
  && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

/** The pointer over a part, as a pointer clock hears it: 0 to 1 across and down the part, and whether it is over it. */
export function pointerInRect(point, rect) {
  if (!point || !rect) return { x: 0, y: 0, inside: false };
  return { x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height, inside: pointInRect(point, rect) };
}

export function createClockState() {
  return { target: 0, shown: 0, velocity: 0, carry: 0, startTarget: 0, holding: false, seen: false };
}

/**
 * Feed one input to a clock's state. `kind` is 'value' { normalized }, 'pointer' { x, y, inside },
 * 'press', 'drag' { dx, dy }, 'release' { vx, vy } (pixels a millisecond) or 'wheel' { notches }.
 * Returns whether it changed anything.
 */
export function clockInput(state, clock, kind, payload = {}, { reducedMotion = false } = {}) {
  const before = state.target;
  const exact = reducedMotion || clock.follow === 'exact';
  switch (clock.source) {
    case 'value':
      if (kind !== 'value') return false;
      state.target = clamp01(payload.normalized);
      // The first look is where the scene starts, not something to animate up to.
      if (!state.seen) { state.shown = state.target; state.seen = true; }
      break;
    case 'pointerX':
    case 'pointerY':
      if (kind !== 'pointer') return false;
      if (payload.inside) state.target = clamp01(clock.source === 'pointerX' ? payload.x : payload.y);
      else if (clock.release === 'back') state.target = 0;
      else return false;
      break;
    case 'drag':
      if (kind === 'press') { state.startTarget = state.target; state.holding = true; state.carry = 0; return false; }
      if (kind === 'drag' && state.holding) {
        state.target = clamp01(state.startTarget + along(payload.dx, payload.dy, clock.direction) / clock.span);
        break;
      }
      if (kind === 'release' && state.holding) {
        state.holding = false;
        if (clock.release === 'back') state.target = 0;
        else if (clock.release === 'carry' && !reducedMotion) state.carry = along(payload.vx, payload.vy, clock.direction) / clock.span;
        break;
      }
      return false;
    case 'wheel':
      if (kind !== 'wheel') return false;
      state.target = clamp01(state.target + (Number(payload.notches) || 0) / clock.span);
      break;
    default:
      return false;
  }
  if (exact) { state.shown = state.target; state.velocity = 0; }
  return state.target !== before || state.carry !== 0 || exact;
}

/** Move a clock's state on by `dt` milliseconds. Returns whether it is still moving. */
export function clockStep(state, clock, dt, { reducedMotion = false } = {}) {
  const ms = Math.max(0, Math.min(64, Number(dt) || 0));
  if (state.carry) {
    state.target = clamp01(state.target + state.carry * ms);
    state.carry *= Math.exp(-ms / CARRY_MS);
    if (Math.abs(state.carry) < 2e-5 || state.target === 0 || state.target === 1) state.carry = 0;
  }
  if (reducedMotion || clock.follow === 'exact') {
    state.shown = state.target;
    state.velocity = 0;
  } else if (clock.follow === 'spring') {
    const s = ms / 1000;
    state.velocity += (SPRING.stiffness * (state.target - state.shown) - SPRING.damping * state.velocity) * s;
    state.shown += state.velocity * s;
  } else {
    state.shown += (state.target - state.shown) * (1 - Math.exp(-ms / SMOOTH_MS));
  }
  const settled = !state.carry && Math.abs(state.target - state.shown) < 1e-4 && Math.abs(state.velocity) < 1e-3;
  if (settled) { state.shown = state.target; state.velocity = 0; }
  return !settled;
}
