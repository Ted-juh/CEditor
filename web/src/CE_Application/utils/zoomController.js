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
 */
import {
  computeFitZoom,
  computeZoomToSelection,
  computeWheelZoom,
} from './canvasInteractions.js';

export function createZoomController({ getViewport, getPanel, getSelection, editorZoom, getZoom }) {
  // Apply a compute-result back to viewport + store.
  // `scrollDeferred` schedules scroll writes in requestAnimationFrame so the
  // zoom change takes effect before the scroll position is adjusted — needed
  // for zoomToSelection to land correctly after the DOM reflows.
  function apply(result, scrollDeferred = false) {
    if (!result) return;
    editorZoom.set(result.zoom);
    const el = getViewport();
    if (!el) return;
    const write = () => {
      if (!el) return;
      el.scrollLeft = result.scrollLeft;
      el.scrollTop  = result.scrollTop;
    };
    if (scrollDeferred) requestAnimationFrame(write);
    else write();
  }

  function handleWheel(e) {
    const el = getViewport();
    const panel = getPanel();
    if (!el || !panel || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    apply(computeWheelZoom(el, e, getZoom(), panel));
  }

  function fitToWindow() {
    const panel = getPanel();
    const el = getViewport();
    const z = computeFitZoom(panel, el);
    if (z != null) editorZoom.set(z);
  }

  function zoomToSelection() {
    const panel = getPanel();
    const el = getViewport();
    apply(computeZoomToSelection(panel, el, getSelection()), /* scrollDeferred */ true);
  }

  return { handleWheel, fitToWindow, zoomToSelection };
}
