// progressiveMount.js — decide how much of a large panel to put on screen in the first frame.
//
// Opening the GAIA panel builds 413 CanvasControls in one synchronous block, and the whole editor
// waits for it: measured, the app shell, the panel surface and the controls all appear together at
// the very end. Nothing is visible for the entire time, which is the worst possible shape for the
// same amount of work — the author cannot see the menu bar, the docks, or the first control until
// the last one is built.
//
// So the surface mounts a first slice, paints, and appends the rest in idle time. The total work is
// unchanged; what changes is when the first pixel lands.
//
// Two rules make this safe rather than clever:
//
//   - It grows a PREFIX. Controls are painted in DOM order, so mounting them out of order would
//     stack them wrongly until the fill-in finished. Every intermediate state is the final state
//     truncated, never a rearrangement of it.
//
//   - Below the threshold nothing happens at all. A panel small enough to build in one frame is
//     rendered whole on the first pass, so the ordinary case has exactly the behaviour it had
//     before — no chunking, no idle callbacks, no partially drawn panel to reason about.
//
// Nothing else reads controls out of the DOM (snapping, distance guides, alignment, scenery
// compilation and export all read the document), so a surface that is still filling in is visually
// incomplete and functionally whole.

/** Panels with at most this many items are mounted in one pass, exactly as before. */
export const MOUNT_WHOLE_BELOW = 120;

/** How many items the first, blocking pass builds. Roughly a viewport's worth. */
export const FIRST_SLICE = 80;

/** How many more each idle pass adds. */
export const SLICE = 80;

/**
 * How many items to render on the first pass.
 *
 * Returns `total` for a small panel, which is what switches the whole mechanism off.
 */
export function initialMountCount(total, { mountWholeBelow = MOUNT_WHOLE_BELOW, firstSlice = FIRST_SLICE } = {}) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  if (count <= mountWholeBelow) return count;
  return Math.min(count, Math.max(1, firstSlice));
}

/**
 * How many to render after one more pass. Never exceeds `total`, and always advances, so a
 * misconfigured slice size cannot leave the panel permanently half-drawn.
 *
 * Slices GROW. Each one costs a paint, and the fixed overhead of chunking showed up as ~140 ms
 * added to the time the panel takes to become whole — real, and paid by every panel large enough
 * to slice. Doubling reaches 413 in four passes instead of six while keeping the first pass small,
 * which is the one that decides when the editor appears. The later, larger slices land when the
 * author already has something on screen.
 */
export function nextMountCount(current, total, { slice = SLICE } = {}) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const now = Math.max(0, Math.floor(Number(current) || 0));
  // `Math.max(1, NaN)` is NaN, which would freeze the fill-in rather than slow it — coerce first.
  const step = Math.max(1, Math.floor(Number(slice) || 0), now);
  return Math.min(count, now + step);
}

/** True while there is still something waiting to be mounted. */
export const mountIncomplete = (current, total) => (Number(current) || 0) < (Number(total) || 0);

/**
 * Schedule the next slice: after the current one has been painted, and not one moment later.
 * Returns a cancel function.
 *
 * NOT `requestIdleCallback`. The goal is to unblock the first paint, not to spread the work out —
 * the panel still has to be whole almost immediately, because a half-drawn panel is a half-drawn
 * panel however good the reason. Idle callbacks are scheduled at the browser's convenience, and
 * measured here they left a 413-control panel sitting at 160 for long enough that anything watching
 * for the surface to stop changing concluded it had finished. A frame plus a macrotask is the
 * narrowest gap that still lets the browser paint what is already built.
 */
export function scheduleNextSlice(job) {
  if (typeof requestAnimationFrame !== 'function') {
    const timer = setTimeout(job, 0);
    return () => clearTimeout(timer);
  }
  let timer = null;
  // rAF runs before paint; the macrotask inside it runs after. Building the next slice from inside
  // the rAF itself would block the very paint this exists to allow.
  const frame = requestAnimationFrame(() => { timer = setTimeout(job, 0); });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
  };
}
