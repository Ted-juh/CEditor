import { writable } from 'svelte/store';

export { showRulers, showGuides, showDistances } from './runtimePreferences.js';

/** The panel-space point currently at the centre of the canvas viewport,
 *  published by EditorCanvas. New controls insert here (clamped to the
 *  panel) instead of on a blind cascade from the origin. Null when no
 *  canvas is on screen. */
export const viewportPanelCenter = writable(null);
