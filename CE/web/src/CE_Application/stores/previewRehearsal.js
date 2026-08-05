// previewRehearsal.js — preview is a rehearsal, not an edit.
//
// Before this, everything that happened during a preview reached the authored document and stayed
// there. Two separate routes:
//
//   • a script's set() — in the editor there is no runtime host, so panelRuntime writes straight
//     through updateControlProperty(), the same function every Properties-panel editor calls;
//   • a gesture on one of the ~12 components whose preview handlers call updateControlProperty()
//     directly (Envelope, Matrix, Joystick, Crossfader, Ribbon, Macro, Orbit, Looper, Router,
//     Timbre, Turing, Constellation) — so merely dragging an envelope in preview edited the file.
//
// Both then autosaved, and stopping preview restored nothing. There was no way back: no undo step
// the author would recognise as theirs, and nothing on disk from before the run.
//
// So: snapshot the panels store when preview starts, put it back when preview stops. Not an undo
// step — a bracket around the whole run. The undo stack is the wrong tool for this (50 slots, and
// one animation at 60Hz evicts every real edit under it), which is why recording is suspended for
// the duration instead.
//
// What makes a blanket restore safe is that the editor already locks authoring while previewing —
// the Properties panel swaps to the Preview Inspector and the canvas gates keys, drag, resize and
// the context menu. So "changed while previewing" IS "changed by the runtime", and there is no
// authored edit inside the bracket that could be thrown away with it.
//
// NOT rehearsed:
//   • the exported player, which owns its document and never puts it back (setRuntimeHost turns
//     this off — see panelRuntime.setRuntimeHost);
//   • MIDI. A rehearsal is about the document; messages already sent to a synth cannot be unsent,
//     and pretending otherwise would be worse than not trying;
//   • ce.storage settings, which write panel.scripting.settings outside the store on purpose —
//     saveSetting("panel") means "remember this", and a rehearsal that forgot it would make the
//     verb useless.

import { get } from 'svelte/store';
import { panels, setAutosaveSuspended } from './panels.js';
import { setHistoryRecordingSuppressed } from './history.js';

/** The document as it was when preview started, or null when no rehearsal is running. */
let saved = null;

/** The editor rehearses; the player does not. */
let enabled = true;

/**
 * Turn rehearsing off (the player) or on (the editor).
 *
 * The player installs a runtime host and owns its document: its "preview" is the plugin running,
 * and its panel is reloaded from the .cepanel rather than restored from a snapshot.
 */
export function setPreviewRehearsalEnabled(on) {
  enabled = on !== false;
  if (!enabled && saved !== null) {
    // Mid-rehearsal when the host arrives: drop the snapshot rather than apply it, since the
    // document that follows is the player's, not the one we photographed.
    saved = null;
    setHistoryRecordingSuppressed(false);
    setAutosaveSuspended(false);
  }
}

/** Whether a rehearsal is currently open. */
export function isRehearsing() {
  return saved !== null;
}

/**
 * Photograph the document, and stop recording undo steps and autosaving until the rehearsal ends.
 *
 * A failed serialisation leaves no snapshot and no suspension: better to keep today's behaviour
 * for that panel than to suspend the safety net and then have nothing to restore from.
 */
export function beginPreviewRehearsal() {
  if (!enabled || saved !== null) return false;
  try {
    saved = JSON.stringify(get(panels));
  } catch {
    saved = null;
    return false;
  }
  setHistoryRecordingSuppressed(true);
  setAutosaveSuspended(true);
  return true;
}

/**
 * Put the document back exactly as it was, then resume recording and autosaving.
 *
 * Compared before writing, so a preview that changed nothing does not touch the store at all —
 * that keeps `modified` false on a panel the author only looked at.
 */
export function endPreviewRehearsal() {
  if (saved === null) return false;
  const json = saved;
  saved = null;
  let restored = false;
  try {
    if (JSON.stringify(get(panels)) !== json) {
      panels.set(JSON.parse(json));
      restored = true;
    }
  } catch {
    // A panel that will not round-trip is left as it is: a half-applied restore would be worse
    // than none. The suspensions still lift in the finally below.
  } finally {
    setHistoryRecordingSuppressed(false);
    setAutosaveSuspended(false);
  }
  return restored;
}

/** Drop a rehearsal without restoring — for tests and for teardown paths that own the document. */
export function discardPreviewRehearsal() {
  if (saved === null) return;
  saved = null;
  setHistoryRecordingSuppressed(false);
  setAutosaveSuspended(false);
}
