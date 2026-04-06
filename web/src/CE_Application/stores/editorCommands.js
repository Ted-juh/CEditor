import { writable } from 'svelte/store';

/** Incremented to signal a zoom-to-selection request */
export const zoomToSelectionSignal = writable(0);

export function requestZoomToSelection() {
  zoomToSelectionSignal.update(n => n + 1);
}
