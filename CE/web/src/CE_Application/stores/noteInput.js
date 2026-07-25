// Live state from the hardware MIDI input: held notes, and expression levels.
//
// The bridge has always emitted `midiInputMessage` and deviceProfiles has always
// parked the last one in `latestMidiInputMessage` — but nothing read it. This is
// the consumer: it folds every incoming message through the pure reducer in
// utils/midiNoteInput.js and publishes "what is currently held", which the
// note-playing controls (Chord Pad, Arp, Ribbon Keyboard, Drum Pads) echo.
//
// One listener for the whole app: notes are global, and four controls watching
// the same stream should agree about it.
import { writable, get } from 'svelte/store';
import { latestMidiInputMessage } from './deviceProfiles.js';
import {
  EMPTY_NOTE_STATE, applyMidiHex, heldNotes, heldNoteEntries,
  EMPTY_EXPRESSION_STATE, applyExpressionHex,
} from '../utils/midiNoteInput.js';

// `seq` increments on every change so consumers can depend on it directly; the
// state object itself is swapped (never mutated) by the pure reducer.
export const midiNoteState = writable({ notes: EMPTY_NOTE_STATE, seq: 0 });

// The continuous half of the same stream: mod wheel, breath, expression, foot,
// aftertouch, note velocity. Separate store so a control that only cares about
// notes doesn't re-render on every CC of a mod-wheel sweep (and vice versa).
export const midiExpressionState = writable({ expression: EMPTY_EXPRESSION_STATE, seq: 0 });

let started = false;
let lastPayload = null;

// Idempotent: the preview surface calls this on mount, so a headless import of
// this module (a test, the profile editor) never attaches a listener.
export function startNoteInputListener() {
  if (started) return;
  started = true;
  latestMidiInputMessage.subscribe((payload) => {
    if (!payload || payload === lastPayload) return;
    lastPayload = payload;
    // SysEx is a dump, not performance data — the reducer skips it anyway, but
    // there's no reason to walk a multi-kilobyte blob on every arrival.
    if (String(payload.messageType ?? '') === 'sysex') return;
    const cur = get(midiNoteState);
    const nextNotes = applyMidiHex(cur.notes, payload.hex);
    // Both reducers return the SAME object when nothing they track changed, so
    // a CC sweep never touches the note store and a note never touches the
    // expression store.
    if (nextNotes !== cur.notes) midiNoteState.set({ notes: nextNotes, seq: cur.seq + 1 });
    const curX = get(midiExpressionState);
    const nextX = applyExpressionHex(curX.expression, payload.hex);
    if (nextX !== curX.expression) midiExpressionState.set({ expression: nextX, seq: curX.seq + 1 });
  });
}

// Drop everything — used when a panel stops previewing, so a stuck note from a
// disconnected keyboard doesn't leave pads lit forever.
export function clearNoteInput() {
  const cur = get(midiNoteState);
  if (cur.notes === EMPTY_NOTE_STATE) return;
  midiNoteState.set({ notes: EMPTY_NOTE_STATE, seq: cur.seq + 1 });
}
// Expression values are LEVELS, not gestures — a mod wheel left at 40% is still
// at 40% when you come back. They're deliberately not cleared with the notes.

// Convenience readers for non-reactive callers. `channel` 0 = omni.
export function inputNotes(channel = 0) { return heldNotes(get(midiNoteState).notes, channel); }
export function inputNoteEntries(channel = 0) { return heldNoteEntries(get(midiNoteState).notes, channel); }

// Test seam: feed hex straight in, without a bridge.
export function ingestMidiHexForTest(hex) {
  const cur = get(midiNoteState);
  midiNoteState.set({ notes: applyMidiHex(cur.notes, hex), seq: cur.seq + 1 });
  const curX = get(midiExpressionState);
  midiExpressionState.set({ expression: applyExpressionHex(curX.expression, hex), seq: curX.seq + 1 });
}
