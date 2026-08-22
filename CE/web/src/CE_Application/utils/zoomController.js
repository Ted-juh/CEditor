/**
 * Zoom controller for the editor canvas.
 *
 * Bundles the three zoom operations (wheel, fit-to-window, zoom-to-selection)
 * plus a helper to write a computed { zoom, scrollLeft, scrollTop } result
 * back to the viewport + editorZoom store. Keeps the "compute math → push
 * result" boilerplate out of the component.
 *
 *   opts:
 *     getViewport   — () => HTMLElement | null
 *     getPanel      — () => panel object | null
 *     getSelection  — () => Set<id>   (for zoomToSelection)
 *     editorZoom    — svelte writable store
 *     getZoom       — () => number    (current zoom, sync read)
 *
 * Returned handlers use the math utilities from canvasInteractions.js so
 * this stays a thin orchestration layer.
 *
 * The wheel handler always zooms around the current mouse position. The
 * underlying math keeps the point under the cursor visually stable while the
 * viewport scale changes.
 */
import {
  computeAnchoredZoom,
  computeFitZoom,
  computeZoomToSelection,
  computeWheelZoom,
  tidyZoomStep,
} from './canvasInteractions.js';

export function createZoomController({ getViewport, getPanel, getSelection, editorZoom, getZoom, getZoomIncrement = null }) {
  let pendingScrollFrame = null;
  let pendingDeferredResult = null;

  function flushDeferredScroll() {
    const el = getViewport();
    const latest = pendingDeferredResult;
    pendingDeferredResult = null;
    if (!el || !latest) return;
    el.scrollLeft = latest.scrollLeft;
    el.scrollTop = latest.scrollTop;
  }

  // Apply a compute-result back to viewport + store.
  // `scrollDeferred` schedules scroll writes in requestAnimationFrame so the
  // zoom change takes effect before the scroll position is adjusted — needed
  // for zoomToSelection to land correctly after the DOM reflows.
  function apply(result, scrollDeferred = false) {
    if (!result) return;
    editorZoom.set(result.zoom);
    const el = getViewport();
    if (!el) return;
    if (scrollDeferred) {
      pendingDeferredResult = result;
      if (pendingScrollFrame === null) {
        pendingScrollFrame = requestAnimationFrame(() => {
          pendingScrollFrame = null;
          flushDeferredScroll();
        });
      }
    } else {
      if (pendingScrollFrame !== null) {
        cancelAnimationFrame(pendingScrollFrame);
        pendingScrollFrame = null;
      }
      pendingDeferredResult = null;
      el.scrollLeft = result.scrollLeft;
      el.scrollTop = result.scrollTop;
    }
  }

  function handleWheel(e) {
    const el = getViewport();
    const panel = getPanel();
    if (!el || !panel) return;
    // Plain wheel scrolls the viewport (the browser default every design tool
    // keeps); Ctrl/Cmd+wheel — and a trackpad pinch, which arrives as
    // ctrlKey+wheel — zooms at the cursor.
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    // Defer the scroll write so the new zoomed layout exists before we adjust
    // the viewport, but compose repeated wheel events against the latest
    // pending view so the cursor anchor stays stable during rapid scrolling.
    apply(
      computeWheelZoom(el, e, getZoom(), panel, 1.1, pendingDeferredResult),
      /* scrollDeferred */ true,
    );
  }

  /** Step zoom (buttons, Ctrl+= / Ctrl+-), anchored at the viewport centre so
   *  the view stays put instead of drifting toward the top-left corner.
   *
   *  The step itself is multiplicative and lands on tidy numbers — see
   *  tidyZoomStep, which also explains why the configurable increment is now
   *  read as a percentage of the current zoom. Buttons and wheel are the same
   *  gesture with different hardware, so they had no business disagreeing
   *  about what one notch means. */
  function zoomStep(direction) {
    const el = getViewport();
    const panel = getPanel();
    if (!el || !panel) return;
    const base = pendingDeferredResult?.zoom ?? getZoom();
    apply(
      computeAnchoredZoom(
        el, getZoom(), panel, tidyZoomStep(base, direction, getZoomIncrement?.() ?? 10),
        el.clientWidth / 2, el.clientHeight / 2, pendingDeferredResult,
      ),
      /* scrollDeferred */ true,
    );
  }

  function fitToWindow() {
    const panel = getPanel();
    const el = getViewport();
    const z = computeFitZoom(panel, el);
    if (z == null) return;
    // The fitted panel is fully visible, so any leftover scroll offset only
    // shows empty stage — reset it along with the zoom.
    apply({ zoom: z, scrollLeft: 0, scrollTop: 0 }, /* scrollDeferred */ true);
  }

  function zoomToSelection() {
    const panel = getPanel();
    const el = getViewport();
    apply(computeZoomToSelection(panel, el, getSelection()), /* scrollDeferred */ true);
  }

  return { handleWheel, zoomStep, fitToWindow, zoomToSelection };
}
