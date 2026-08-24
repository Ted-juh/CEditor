/**
 * viewerSync.js — keeping the Viewer sidebar's readout honest without a timer.
 *
 * Review finding B10, third clause: `ViewerSettings` read the image viewer's
 * zoom off a 100ms `setInterval` that ran for as long as the tab was mounted,
 * ten wakeups a second forever so that a number could be right the twenty or so
 * times a session it actually changes. The eyedropper indicator was worse — it
 * was a `$derived` that read `void zoomDisplay` purely to borrow the poll's
 * heartbeat, which is a polling loop wearing a reactive statement's clothes.
 *
 * The awkwardness that led there is real: `ViewerEditor` keeps its zoom as
 * component-local `$state` and exposes it only through `getZoom()`, so there is
 * nothing to subscribe to. But zoom does not change on its own — it changes
 * because of an input event, and there are only three kinds: the sidebar's own
 * buttons (which call `refresh()` directly, synchronously, right after acting),
 * the wheel over the canvas, and pointer/key interaction with the image. So we
 * read after those, coalesced to one read per frame, and not otherwise.
 *
 * The scheduler is injected so the coalescing can be tested rather than
 * described; in the app it is `requestAnimationFrame`, which puts the read
 * after the viewer's own handler has run.
 */

/**
 * The events that can move the viewer's zoom or arm its eyedropper. `wheel`
 * for zoom, pointer-up for drag-zoom and for the image tabs (each image keeps
 * its own zoom, so switching image changes the readout), key-up for anything
 * the canvas binds to the keyboard.
 */
export const VIEWER_SYNC_EVENTS = ['wheel', 'pointerup', 'pointercancel', 'keyup'];

export function readViewerState(ref) {
  return {
    zoom: Number.isFinite(Number(ref?.getZoom?.())) ? Math.round(Number(ref.getZoom())) : null,
    eyedropper: ref?.isEyedropper?.() === true,
  };
}

function defaultSchedule(run) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(run);
  return setTimeout(run, 0);
}

/**
 * @param {object}   options
 * @param {Function} options.getRef   returns the viewer component, or null before it mounts
 * @param {Function} options.apply    called with { zoom, eyedropper } only when something changed
 * @param {Function} [options.schedule] defers a coalesced read; defaults to rAF
 */
export function createViewerSync({ getRef, apply, schedule = defaultSchedule } = {}) {
  let last = null;
  let pending = false;

  function refresh() {
    const ref = getRef?.() ?? null;
    if (!ref) return false;
    const next = readViewerState(ref);
    if (next.zoom === null && last) return false;
    if (last && last.zoom === next.zoom && last.eyedropper === next.eyedropper) return false;
    last = next;
    apply?.(next);
    return true;
  }

  function requestRefresh() {
    if (pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      refresh();
    });
  }

  /**
   * Listen on `target` (the window in the app). Passive and capturing: the
   * viewer's own handlers must keep their events untouched, and capture means
   * we still hear a wheel that a child stops propagating.
   */
  function attach(target, events = VIEWER_SYNC_EVENTS) {
    if (!target?.addEventListener) return () => {};
    const options = { passive: true, capture: true };
    for (const type of events) target.addEventListener(type, requestRefresh, options);
    return () => {
      for (const type of events) target.removeEventListener(type, requestRefresh, options);
    };
  }

  return { refresh, requestRefresh, attach };
}
