// repeatClock.js — "wait, then fire on an interval, and stop cleanly", in one place.
//
// Two things in the editor repeat while something is held: a momentary button with `repeating` set,
// and a drum pad with `roll` set. The shape is identical and the edge cases are the ones that bite —
// released during the delay (must never start), released between fires (must not fire once more on
// the way up), re-pressed while still winding down (must not run two clocks), and torn down with a
// press outstanding (must not leave a timer editing a surface that is gone).
//
// The button's version was written first and got those right. Rather than write them a second time
// for the pads, they live here and both callers hold one of these.
//
// The clock knows nothing about MIDI, sessions or controls. It is keyed by a string, it calls
// `onFire(key, n)` with a 1-based count of how many times it has fired for THIS press, and the
// caller decides what firing means. The count is what lets a consumer tell two fires apart when a
// boolean cannot — at a 60 ms interval two `true`s in a row are indistinguishable from one.
//
// Timers are injected so tests drive them rather than wait for them.

function createEntry() {
  return { delayTimer: null, repeatTimer: null, count: 0, holding: false };
}

export function createRepeatClock({
  onFire,
  scheduleTimeout = setTimeout,
  clearTimeoutFn = clearTimeout,
  scheduleInterval = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (typeof onFire !== 'function') {
    throw new TypeError('createRepeatClock requires an onFire callback.');
  }

  const entries = new Map();

  function stopTimers(entry) {
    if (entry.delayTimer != null) { clearTimeoutFn(entry.delayTimer); entry.delayTimer = null; }
    if (entry.repeatTimer != null) { clearIntervalFn(entry.repeatTimer); entry.repeatTimer = null; }
  }

  /**
   * Begin a press. `delay` is how long before the FIRST repeat and may be 0 ("start immediately");
   * `interval` is the gap between repeats and is floored at 1 ms, because 0 is a busy loop rather
   * than a fast roll.
   *
   * Returns whether a clock is now running, so a caller can tell "started" from "this one does not
   * repeat" without inspecting the config twice.
   */
  function start(key, { delay = 0, interval = 120 } = {}) {
    const id = String(key ?? '');
    if (!id) return false;

    const every = Math.max(1, Math.round(Number(interval) || 0));
    const wait = Math.max(0, Math.round(Number(delay) || 0));

    let entry = entries.get(id);
    if (!entry) { entry = createEntry(); entries.set(id, entry); }
    stopTimers(entry);
    entry.holding = true;
    entry.count = 0;

    const begin = () => {
      entry.delayTimer = null;
      // Released during the delay. The press is over; starting now would fire into nothing.
      if (!entry.holding) return;
      fire(id, entry);
      entry.repeatTimer = scheduleInterval(() => {
        if (!entry.holding) { stopTimers(entry); return; }
        fire(id, entry);
      }, every);
    };

    // The first repeat lands AT the delay, not one interval after it: a delay of 250 means "quiet
    // for 250 ms, then start", and a first fire at 250 + interval reads as the delay being longer
    // than it was set to.
    if (wait === 0) begin();
    else entry.delayTimer = scheduleTimeout(begin, wait);
    return true;
  }

  function fire(id, entry) {
    entry.count += 1;
    onFire(id, entry.count);
  }

  /** End a press. Returns how many times it fired, so "this hold rolled" reads differently from
   *  "this hold was a single strike" — which is usually what decides whether the release means
   *  anything. */
  function stop(key) {
    const entry = entries.get(String(key ?? ''));
    if (!entry) return 0;
    entry.holding = false;
    stopTimers(entry);
    return entry.count;
  }

  /** How many times the current (or last) press fired, without ending it. */
  function count(key) {
    return entries.get(String(key ?? ''))?.count ?? 0;
  }

  function running(key) {
    const entry = entries.get(String(key ?? ''));
    return Boolean(entry?.holding && (entry.delayTimer != null || entry.repeatTimer != null));
  }

  /** Drop every key not in `keep` — the controls they belonged to are gone. */
  function sync(keep = []) {
    const alive = new Set(
      (Array.isArray(keep) ? keep : []).map((k) => String(k ?? '')).filter(Boolean),
    );
    for (const [id, entry] of entries.entries()) {
      if (alive.has(id)) continue;
      entry.holding = false;
      stopTimers(entry);
      entries.delete(id);
    }
  }

  function destroy() {
    for (const entry of entries.values()) { entry.holding = false; stopTimers(entry); }
    entries.clear();
  }

  return { start, stop, count, running, sync, destroy };
}
