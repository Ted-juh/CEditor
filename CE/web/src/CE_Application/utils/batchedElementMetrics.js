// batchedElementMetrics.js — measure many elements without paying for many layouts.
//
// THE PROBLEM THIS SOLVES. A component that measures its own DOM usually writes:
//
//   requestAnimationFrame(sync);                       // measure once it is laid out
//   const ro = new ResizeObserver(sync);               // and again whenever it changes
//   ro.observe(el);
//
// which is correct for one component and quadratic-feeling for four hundred. Two separate costs:
//
//   - One ResizeObserver per component. Each carries its own observation list and its own delivery,
//     so 413 controls create 413 observers and 413 deliveries where one observer watching 413
//     targets would deliver once.
//
//   - One rAF callback per component, each of which READS layout and then WRITES reactive state.
//     The browser drains microtasks between animation-frame callbacks, so Svelte flushes the write
//     from callback N before callback N+1 runs — and that callback's `offsetWidth` then forces a
//     fresh layout. Read, write, read, write, four hundred times: the textbook layout thrash, and
//     invisible in a profile because the time lands inside `offsetWidth`, not in anything named.
//
// So callers hand over a `measure` (reads only) and a `commit` (writes only) instead of one
// function that does both. Every pending measure runs first, then every commit. No write can land
// between two reads, so the whole batch costs ONE layout no matter how many elements are in it.
//
// Measured on the GAIA panel (413 controls): 344 ms of a 2,041 ms panel load, of which this
// recovers the large majority. The split is the load-bearing part — keep reads in `measure` and
// writes in `commit`, or the thrash comes back quietly.

/** Targets to the jobs that care about them. One observer for the whole application. */
const jobsByTarget = new WeakMap();
let observer = null;

const pending = new Set();
let frame = 0;

function drain() {
  frame = 0;
  const jobs = [...pending];
  pending.clear();

  // Every read, then every write. Nothing in between.
  const readings = jobs.map((job) => {
    try {
      return job.measure();
    } catch {
      // A job whose elements went away mid-batch must not take the other 412 with it.
      return undefined;
    }
  });
  jobs.forEach((job, index) => {
    if (readings[index] === undefined) return;
    try {
      job.commit(readings[index]);
    } catch {
      /* same reasoning */
    }
  });
}

function schedule(job) {
  pending.add(job);
  if (frame) return;
  frame = requestAnimationFrame(drain);
}

function ensureObserver() {
  if (observer || typeof ResizeObserver === 'undefined') return observer;
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      for (const job of jobsByTarget.get(entry.target) ?? []) schedule(job);
    }
  });
  return observer;
}

/**
 * Measure `targets` now and whenever any of them resizes, batched with every other caller.
 *
 *   targets — elements to watch; the first delivery from observing them is what performs the
 *             initial measurement, so no separate rAF is needed
 *   measure — () => reading   MUST only read the DOM
 *   commit  — (reading) => void   MUST only write; runs after every measure in the batch
 *
 * Returns a teardown function. Call it from the effect's cleanup.
 */
export function observeElementMetrics({ targets, measure, commit }) {
  const elements = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (elements.length === 0 || typeof measure !== 'function' || typeof commit !== 'function') {
    return () => {};
  }

  const job = { measure, commit };
  const ro = ensureObserver();

  for (const el of elements) {
    let set = jobsByTarget.get(el);
    if (!set) { set = new Set(); jobsByTarget.set(el, set); }
    set.add(job);
    ro?.observe(el);
  }

  // With no ResizeObserver there is no initial delivery to ride on, so ask for one measurement.
  if (!ro) schedule(job);

  return () => {
    pending.delete(job);
    for (const el of elements) {
      const set = jobsByTarget.get(el);
      if (!set) continue;
      set.delete(job);
      // Only stop watching once nothing else is interested: the shared observer is shared.
      if (set.size === 0) { jobsByTarget.delete(el); ro?.unobserve(el); }
    }
  };
}

/**
 * Re-measure everything watching `element` on the next batch. For changes a ResizeObserver cannot
 * see — scrolling being the one that matters here, since it moves an element without resizing it.
 */
export function scheduleElementMetrics(element) {
  for (const job of jobsByTarget.get(element) ?? []) schedule(job);
}

/** Exposed for tests, which need a deterministic drain rather than a real animation frame. */
export function flushElementMetricsForTest() {
  if (frame) cancelAnimationFrame(frame);
  drain();
}

/**
 * Drop the shared observer and any pending work. Only for tests: the observer is created once and
 * kept for the life of the page, so a test that swaps in a new fake ResizeObserver would otherwise
 * be talking to the previous test's instance.
 */
export function resetElementMetricsForTest() {
  observer?.disconnect?.();
  observer = null;
  pending.clear();
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
}
