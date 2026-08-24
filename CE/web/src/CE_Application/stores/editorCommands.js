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

/** Centre-anchored zoom step request (direction +1 / -1) — same ownership
 *  story as fit-to-window: EditorCanvas's zoom controller executes it. */
export const zoomStepSignal = writable({ n: 0, direction: 0 });

export function requestZoomStep(direction) {
  zoomStepSignal.update(({ n }) => ({ n: n + 1, direction }));
}

/** Incremented to open the About overlay. App.svelte owns the overlay; the menu asks for it.
 *  A signal rather than a boolean because "show it" is the whole request — the overlay closes
 *  itself, and a shared boolean would leave the menu holding state it does not own. */
export const aboutSignal = writable(0);

export function requestAbout() {
  aboutSignal.update((n) => n + 1);
}

/** Incremented to open the documentation viewer. Same ownership story as `aboutSignal`. */
export const documentationSignal = writable(0);

export function requestDocumentation() {
  documentationSignal.update((n) => n + 1);
}
