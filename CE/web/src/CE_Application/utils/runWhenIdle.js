/**
 * Run a job in a gap between frames, or at the latest after `timeoutMs`.
 *
 * For work that has to happen but must not happen NOW: serialising the document for the autosave
 * takes hundreds of milliseconds on a large panel, and running it from a bare timer drops that
 * cost on whatever the author is doing at the moment the timer fires. A freeze in the middle of a
 * drag, several seconds after the edit that caused it, with nothing on screen to explain it.
 *
 * `timeout` is not optional in spirit: without it an idle callback can be starved indefinitely on
 * a busy page, and an autosave that never runs is worse than one that stutters. With it the
 * browser promises to run the job by then even if it never finds a gap.
 *
 * Falls back to a macrotask where requestIdleCallback is missing — which still gets the work off
 * the current task, and is the whole benefit on a quiet page.
 */
export function runWhenIdle(job, timeoutMs = 2000) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(job, { timeout: Math.max(0, timeoutMs) });
    return;
  }
  setTimeout(job, 0);
}
