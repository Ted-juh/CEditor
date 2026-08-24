/**
 * The in-place gradient-stop colour edit, as a state machine both hosts share.
 *
 * There are two places a stop's colour can be edited without leaving the
 * gradient: double-clicking the thumb on the preview, and clicking the chip in
 * the sidebar's stop list. They are different components with different
 * plumbing — one keeps a live internal copy of the stops, the other emits
 * every change — and the one thing that must NOT differ between them is what
 * happens when the user walks away from the edit. So the decision lives here
 * and neither of them gets a vote.
 *
 * THE RULE: an edit previews live, and abandoning it (clicking away, or the
 * host closing) COMMITS. Cancel and Escape restore the colour the stop had.
 * The review found the app holding two opposite rules at once — the dock's
 * cross-tab stop edit committed on tab-away while the notepad's colour pick
 * discarded — and the fix is not to pick a side per component.
 */

import { updateStopAt } from './gradientStops.js';

const HEX6 = /^[0-9A-F]{6}$/;

/** Normalise anything a chooser hands back to a bare RRGGBB. */
export function normalizeStopColour(value, fallback = 'FFFFFF') {
  const hex = String(value ?? '').replace(/^#/, '').toUpperCase();
  // The chooser speaks AARRGGBB; a stop is RRGGBB. The gradient's opacity
  // lives on the fill layer, so an alpha here would be silently thrown away
  // downstream anyway — better to drop it in one known place.
  const tail = hex.length >= 6 ? hex.slice(-6) : '';
  return HEX6.test(tail) ? tail : fallback;
}

/**
 * Open an edit. Returns `{ index, original }`, or null when there is no such
 * stop — callers use the null to mean "nothing opened".
 */
export function beginStopEdit(stops, index) {
  const stop = stops?.[index];
  if (!stop) return null;
  return { index, original: normalizeStopColour(stop.color) };
}

/** Live preview: the stops with this edit's stop recoloured. */
export function previewStopColour(stops, edit, colour) {
  if (!edit) return stops;
  return updateStopAt(stops, edit.index, { color: normalizeStopColour(colour, edit.original) });
}

/** Keep it. Returns the new stops and closes the edit. */
export function commitStopEdit(stops, edit, colour) {
  if (!edit) return { stops, edit: null };
  return { stops: previewStopColour(stops, edit, colour), edit: null };
}

/** Take it back. Returns the stops with the original colour restored. */
export function cancelStopEdit(stops, edit) {
  if (!edit) return { stops, edit: null };
  return { stops: updateStopAt(stops, edit.index, { color: edit.original }), edit: null };
}
