/**
 * The two momentary subtypes that were specified, given a Properties panel, and never wired.
 *
 * `Behavior` has offered `momentary / repeating` ("Repeats while held", with a Delay and an
 * Interval) and `momentary / press_to_talk` ("Active only while held") since the section was
 * written. `repeatEnabled`, `repeatDelay`, `repeatInterval` and `activeWhileHeld` are stored on
 * every control and read by NOTHING — a repo-wide search finds them in the model, in
 * BehaviorEditor.svelte and in a menu list, and nowhere else. Their neighbours in the `timed`
 * family (hold_to_confirm, double_click) are fully implemented in timedButtonPreview.js, which is
 * what makes these two an oversight rather than a design decision.
 *
 * This is that file's twin, deliberately: same shape, same injectable clock, same patchSession
 * channel, so the two read as one idea and a fix to either is obvious in the other.
 *
 * HOW A REPEAT REACHES ANYTHING. Everything about an interaction travels as a session patch —
 * device bindings read the patch, the script runtime diffs the session. So a repeat is a patch and
 * nothing else:
 *
 *   `executed: true` briefly, which is the existing "it fired" pulse a timed button already sends,
 *   so trigger bindings need no new case; and
 *   `repeatCount`, a counter that only ever goes up, which is what lets a consumer tell TWO fires
 *     from one. A boolean cannot: two `executed: true` patches in a row are indistinguishable from
 *     one, and at a 120 ms interval they are certain to coalesce.
 *
 * `pressed` stays TRUE throughout. The button is still held — saying otherwise would make the
 * visual flicker and would raise a release the user never performed.
 */

import { numberOr } from './primitives.js';
import { createRepeatClock } from './repeatClock.js';

const DEFAULT_REPEAT_DELAY = 300;
const DEFAULT_REPEAT_INTERVAL = 120;
// How long `executed` stays true for one repeat. Short enough to fall inside the fastest interval
// the editor allows (the Properties panel clamps Interval to >= 10 ms), so two fires never merge
// into one long pulse.
const PULSE_MS = 8;

export function isMomentaryBehavior(behavior) {
  return String(behavior?.buttonType ?? '') === 'momentary';
}

/** Repeating needs BOTH the subtype and the flag: the flag is what the Properties panel toggles. */
export function isRepeatingBehavior(behavior) {
  return isMomentaryBehavior(behavior)
    && String(behavior?.subtype ?? '') === 'repeating'
    && behavior?.repeatEnabled !== false;
}

export function isPressToTalkBehavior(behavior) {
  return isMomentaryBehavior(behavior)
    && (String(behavior?.subtype ?? '') === 'press_to_talk' || behavior?.activeWhileHeld === true);
}

/**
 * Delay and interval, clamped the way the Properties panel clamps them (`min={0}` and `min={10}`).
 * A zero delay is legal and means "start repeating immediately"; a zero interval is not, because it
 * is a busy loop rather than a fast roll.
 */
export function resolveRepeatConfig(behavior) {
  return {
    delay: Math.max(0, Math.round(numberOr(behavior?.repeatDelay, DEFAULT_REPEAT_DELAY))),
    interval: Math.max(10, Math.round(numberOr(behavior?.repeatInterval, DEFAULT_REPEAT_INTERVAL))),
  };
}

export function createMomentaryButtonPreviewController({
  patchSession,
  scheduleTimeout = setTimeout,
  clearTimeoutFn = clearTimeout,
  scheduleInterval = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (typeof patchSession !== 'function') {
    throw new TypeError('createMomentaryButtonPreviewController requires a patchSession callback.');
  }

  // The delay-then-interval half is repeatClock.js, shared with the drum pads' roll: released
  // during the delay, released between fires, re-pressed while winding down and torn down
  // mid-press are the same four edges whether the thing repeating is a button or a pad.
  const clock = createRepeatClock({
    onFire: (key, n) => fire(key, n),
    scheduleTimeout, clearTimeoutFn, scheduleInterval, clearIntervalFn,
  });
  // One pulse timer per key, which is this file's own business rather than the clock's.
  const pulses = new Map();

  function clearPulse(key) {
    const handle = pulses.get(key);
    if (handle != null) { clearTimeoutFn(handle); pulses.delete(key); }
  }

  function fire(key, n) {
    patchSession(key, { executed: true, repeatCount: n });
    // Drop the pulse so the NEXT one is a change. Without this the second fire patches the same
    // value and shallowEqualSession swallows it, which looks exactly like the repeat having died.
    clearPulse(key);
    pulses.set(key, scheduleTimeout(() => {
      pulses.delete(key);
      patchSession(key, { executed: false });
    }, PULSE_MS));
  }

  /**
   * Start a press. Returns EXTRA SESSION FIELDS for the caller to fold into the press patch it is
   * already sending, rather than sending a second patch of our own.
   *
   * That distinction is load-bearing. The script runtime drops a session change that arrives while
   * it is still dispatching the previous one, so press-to-talk's assertion — a separate patch
   * landing immediately after the generic `pressed: true` — was being swallowed, and the control
   * reported its release without ever reporting its press. One patch cannot race itself.
   *
   * `checked`, not a new field: it is the state port bindings read and the value the script runtime
   * reports, so this is what makes press-to-talk observable rather than indistinguishable from a
   * plain button.
   */
  function beginPress(key, behavior) {
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return null;

    if (isPressToTalkBehavior(behavior)) return { checked: true };
    if (!isRepeatingBehavior(behavior)) return null;

    clearPulse(normalizedKey);
    clock.start(normalizedKey, resolveRepeatConfig(behavior));
    // Zero the counter IN the press patch. It is how a consumer tells "this hold produced repeats"
    // from "it did not", which is what decides whether the release is one more fire or the end of
    // a roll — and a hold that started at whatever the last one finished on could not say.
    return { repeatCount: 0 };
  }

  /** The release half, same contract: fields for the caller's release patch, or null. */
  function releasePress(key, behavior) {
    const normalizedKey = String(key ?? '');
    if (!normalizedKey) return null;

    if (isPressToTalkBehavior(behavior)) return { checked: false };
    if (!isRepeatingBehavior(behavior)) return null;

    clock.stop(normalizedKey);
    clearPulse(normalizedKey);
    return { executed: false };
  }

  /** Drop a press without releasing it — the control went away, or the pointer was taken over. */
  function cancel(key) {
    const normalizedKey = String(key ?? '');
    clock.stop(normalizedKey);
    clearPulse(normalizedKey);
  }

  function syncKeys(activeKeys = []) {
    const keep = (Array.isArray(activeKeys) ? activeKeys : [])
      .map((key) => String(key ?? '')).filter(Boolean);
    clock.sync(keep);
    const alive = new Set(keep);
    for (const key of [...pulses.keys()]) if (!alive.has(key)) clearPulse(key);
  }

  function destroy() {
    clock.destroy();
    for (const key of [...pulses.keys()]) clearPulse(key);
  }

  return { beginPress, releasePress, cancel, syncKeys, destroy };
}
