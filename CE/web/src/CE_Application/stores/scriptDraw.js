// scriptDraw.js — what scripts have drawn, per control.
//
// A drawing is a PRODUCT of the script, never part of the document: it lives here, in memory, and
// is never written to the panel or the saved file. That is the same rule generated controls follow
// (design doc §13) and it is stronger here — a scope trace is thrown away and redrawn constantly,
// and persisting one would be meaningless as well as wrong.
//
// The shape is immediate-mode: each verb records a command carrying the style in force when it was
// issued, so the renderer needs no state machine of its own — it walks the list and emits one SVG
// element per command, in order.

import { writable, get } from 'svelte/store';

/** controlId -> { commands: [...], revision: n } */
export const scriptDrawings = writable({});

/** The commands drawn on one control, or an empty list. */
export function drawingFor(controlId) {
  return get(scriptDrawings)[String(controlId)]?.commands ?? [];
}

/**
 * Replace one control's command list. `revision` bumps so the renderer re-runs.
 *
 * The runtime hands over its OWN array rather than a copy (design doc §49): it used to pass
 * `[...list]` on every single command, so drawing n shapes copied the list n times and did O(n²)
 * work for what is a sequence of appends — 21ms for a 256-segment trace, before any rendering. That
 * means consumers must depend on `revision` and not on the array's identity, since the identity no
 * longer changes between commands. ScriptDrawOverlay does exactly that, with a comment saying why.
 */
export function setDrawing(controlId, commands) {
  const key = String(controlId);
  scriptDrawings.update((all) => ({
    ...all,
    [key]: { commands, revision: (all[key]?.revision ?? 0) + 1 },
  }));
}


/** Drop one control's drawing, or every drawing when no id is given. */
export function clearDrawing(controlId = null) {
  if (controlId == null) { scriptDrawings.set({}); return; }
  const key = String(controlId);
  scriptDrawings.update((all) => {
    if (!(key in all)) return all;
    const next = { ...all };
    delete next[key];
    return next;
  });
}
