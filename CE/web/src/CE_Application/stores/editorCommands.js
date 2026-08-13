import { writable } from 'svelte/store';

/** Incremented to signal a zoom-to-selection request */
export const zoomToSelectionSignal = writable(0);

export function requestZoomToSelection() {
  zoomToSelectionSignal.update(n => n + 1);
}

/** Incremented to signal a fit-to-window request. EditorCanvas owns the one
 *  real implementation (it knows the live viewport); every other surface —
 *  menu, zoom bar, global shortcut — asks through this signal instead of
 *  reimplementing the math against a DOM query. */
export const fitToWindowSignal = writable(0);

export function requestFitToWindow() {
  fitToWindowSignal.update(n => n + 1);
}
