/**
 * gestureEvents.js — the gestures with no duration, on one control: a click, a double-click, a
 * long press, a flick, a wheel turn. Recognised here from pointer input, then played two ways:
 *
 *   - the control's keyframe animations with an `event` trigger (the States tab's Events row,
 *     stateMotion.js), requested exactly as ce.anim.play requests one (stores/animationActivity.js);
 *   - for a long press and a flick, the script events `onLongPress` and `onFlick`, beside the
 *     onClick, onDoubleClick and onWheel scripts already receive (scripting/panelApi.js).
 *
 * The tracker is pure: the surface that owns the pointer hands it times and positions, and runs
 * the long-press timers itself. A gesture the control already uses is shared, never taken: dragging
 * a knob still turns it, and a fast release after the drag is also a flick. Decided by the owner on
 * 2026-11-24 (docs/design/animation-designer.md).
 */
import { requestAnimationPlay } from '../stores/animationActivity.js';
import { readAnimations } from './animationModel.js';
import { FLICK_MIN_SPEED, LONG_PRESS_MS } from './stateMotion.js';

/** Moved further than this from where it went down, a press is a drag: no click, no long press. */
export const CLICK_SLOP_PX = 5;
/** A flick's speed is measured over the last stretch of movement before the release. */
export const FLICK_WINDOW_MS = 100;

/** The direction of a movement by its larger axis, screen-wise: y grows downwards. */
export function flickDirection(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * One press, from down to up. `up` returns what it was:
 * `{ click, moved, held, speed, direction }` — speed in px/s over the last FLICK_WINDOW_MS.
 */
export function createPressTracker({ slop = CLICK_SLOP_PX, windowMs = FLICK_WINDOW_MS } = {}) {
  let start = null;
  let samples = [];
  let moved = false;
  const note = (t, x, y) => {
    samples.push({ t, x, y });
    while (samples.length > 2 && t - samples[1].t > windowMs) samples.shift();
    if (start && Math.hypot(x - start.x, y - start.y) > slop) moved = true;
  };
  return {
    down(t, x, y) {
      start = { t, x, y };
      samples = [{ t, x, y }];
      moved = false;
    },
    move(t, x, y) { if (start) note(t, x, y); },
    /** Still where it went down, and still down: a long press can still happen. */
    stillHeld() { return !!start && !moved; },
    up(t, x, y, { inside = true } = {}) {
      if (!start) return null;
      note(t, x, y);
      const from = samples.find((sample) => t - sample.t <= windowMs) ?? samples[0];
      const span = Math.max(1, t - from.t);
      const dx = x - from.x;
      const dy = y - from.y;
      const result = {
        click: inside && !moved,
        moved,
        held: t - start.t,
        speed: (Math.hypot(dx, dy) / span) * 1000,
        direction: flickDirection(dx, dy),
        vx: dx / span,
        vy: dy / span,
      };
      start = null;
      samples = [];
      return result;
    },
    cancel() { start = null; samples = []; moved = false; },
  };
}

/** A release fast enough to be a flick for scripts, which take any direction. */
export function isFlick(result, minSpeed = FLICK_MIN_SPEED) {
  return !!result?.moved && result.speed >= minSpeed;
}

function eventRows(control, eventId) {
  return readAnimations(control).filter((row) => row.enabled !== false
    && (row.kind === 'keyframes' || row.kind === 'text')
    && row.trigger?.type === 'event'
    && row.trigger.event === eventId);
}

/**
 * The names of the keyframe animations one gesture plays on a control. A flick's animations each
 * ask for a direction (or any) and a least speed; a long press's for how long it was held, so the
 * surface fires `longPress` once per distinct hold (longPressHolds).
 */
export function animationsForGesture(control, eventId, detail = {}) {
  return eventRows(control, eventId).filter((row) => {
    const trigger = row.animation?.trigger ?? {};
    if (eventId === 'flick') {
      const direction = trigger.direction ?? 'any';
      const least = Number(trigger.speed) > 0 ? Number(trigger.speed) : FLICK_MIN_SPEED;
      return detail.moved !== false && (direction === 'any' || direction === detail.direction) && Number(detail.speed ?? 0) >= least;
    }
    if (eventId === 'longPress') {
      const hold = Number(trigger.hold) > 0 ? Number(trigger.hold) : LONG_PRESS_MS;
      return hold === Number(detail.hold ?? LONG_PRESS_MS);
    }
    return true;
  }).map((row) => String(row.animation?.name ?? row.name));
}

/** Every hold a long press on this control is waited for: its animations' own, and the scripts'. */
export function longPressHolds(control) {
  const holds = new Set([LONG_PRESS_MS]);
  for (const row of eventRows(control, 'longPress')) {
    const hold = Number(row.animation?.trigger?.hold);
    holds.add(hold > 0 ? hold : LONG_PRESS_MS);
  }
  return [...holds].sort((a, b) => a - b);
}

/** The slowest flick any of this control's flick animations answers, or the scripts' least. */
export function leastFlickSpeed(control) {
  return Math.min(FLICK_MIN_SPEED, ...eventRows(control, 'flick').map((row) => Number(row.animation?.trigger?.speed) || FLICK_MIN_SPEED));
}

/** Ask for every animation a gesture plays on this control. Returns their names. */
export function playGesture(control, eventId, detail = {}) {
  const id = control?._children?.Core?.id;
  if (!id) return [];
  const names = animationsForGesture(control, eventId, detail);
  for (const name of names) requestAnimationPlay(id, name);
  return names;
}

const eventTime = (event) => (Number.isFinite(event?.timeStamp) && event.timeStamp > 0 ? event.timeStamp
  : (typeof performance !== 'undefined' ? performance.now() : Date.now()));

/**
 * Watch one press on a control from its pointerdown to its release, and play what it was: a click,
 * a long press (once per hold its animations wait for), a flick. `onLongPress(payload)` and
 * `onFlick(payload)` are for a surface that raises script events (the Preview and the player);
 * the Animation tab's stage passes neither. `onGesture(eventId)` hears each gesture once — a click,
 * a long press at the usual hold, a flick — for the scenes that wait on one (utils/sceneRuntime.js).
 * `onDrag(kind, payload)` follows the press itself, for a scene a drag drives (utils/sceneClock.js):
 * 'press', then 'drag' { dx, dy } from where it went down, then 'release' { vx, vy }, all in the
 * panel's pixels (a millisecond, for the speed). Returns a function that stops watching.
 *
 * Its listeners are its own, on the window in the capture phase: a surface's press handling returns
 * early for many kinds of control, and its own pointerup handler stops the event once it has used
 * it. `event.currentTarget` is the control's element; its bounds at the press decide "inside".
 */
export function watchGesture(control, event, { scale = 1, onLongPress = null, onFlick = null, onGesture = null, onDrag = null } = {}) {
  if (typeof window === 'undefined' || !event) return () => {};
  const rect = event.currentTarget?.getBoundingClientRect?.() ?? null;
  const local = (at) => (rect
    ? { x: Math.round((at.clientX - rect.left) / (scale || 1)), y: Math.round((at.clientY - rect.top) / (scale || 1)) }
    : { x: 0, y: 0 });
  const tracker = createPressTracker();
  tracker.down(eventTime(event), event.clientX, event.clientY);
  const downPoint = local(event);
  let live = true;
  const timers = [];

  const per = scale || 1;
  const onMove = (move) => {
    tracker.move(eventTime(move), move.clientX, move.clientY);
    onDrag?.('drag', { dx: (move.clientX - event.clientX) / per, dy: (move.clientY - event.clientY) / per });
  };
  let released = false;
  const release = (vx = 0, vy = 0) => {
    if (released || !onDrag) return;
    released = true;
    onDrag('release', { vx: vx / per, vy: vy / per });
  };
  const stop = () => {
    if (!live) return;
    live = false;
    release();
    for (const timer of timers) clearTimeout(timer);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', stop, true);
  };
  onDrag?.('press', {});
  function onUp(up) {
    const inside = !rect || (up.clientX >= rect.left && up.clientX <= rect.right && up.clientY >= rect.top && up.clientY <= rect.bottom);
    const result = tracker.up(eventTime(up), up.clientX, up.clientY, { inside });
    release(result?.vx ?? 0, result?.vy ?? 0);
    stop();
    if (!result) return;
    if (result.click) { playGesture(control, 'click'); onGesture?.('click'); }
    if (result.moved) {
      playGesture(control, 'flick', result);
      if (isFlick(result)) {
        onFlick?.({ ...local(up), direction: result.direction, speed: Math.round(result.speed) });
        onGesture?.('flick');
      }
    }
  }
  for (const hold of longPressHolds(control)) {
    timers.push(setTimeout(() => {
      if (!live || !tracker.stillHeld()) return;
      playGesture(control, 'longPress', { hold });
      if (hold === LONG_PRESS_MS) { onLongPress?.({ ...downPoint, held: hold }); onGesture?.('longPress'); }
    }, hold));
  }
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', stop, true);
  return stop;
}
