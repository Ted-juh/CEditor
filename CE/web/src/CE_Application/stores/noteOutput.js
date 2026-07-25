// A tap on the notes the PANEL plays.
//
// Every note-emitting control — Chord Pad, Arpeggiator, Ribbon Keyboard, Drum
// Pads, Phrase Sequencer, Zone Splitter — sends through one funnel
// (`sendNoteBytes` in the preview surface). That makes "record what I just
// played on the panel" a single tap rather than six integrations, and it means
// a control added later is captured without touching this file.
//
// Events, not state, for the same reason the router has its own store: a
// recorder has to see each note-on once, when it happens. A snapshot of what is
// currently held would miss anything shorter than a frame and repeat everything
// longer.
import { writable } from 'svelte/store';

export const noteOutputEvents = writable({ events: [], seq: 0 });

let seq = 0;

/**
 * Publish one note the panel just played.
 * `sourceType` is the controlType that played it — the recorder uses it to
 * ignore other recorders, because two of them pointed at each other would feed
 * each other forever, doubling the take every lap.
 */
export function publishNoteOutput(events) {
  const batch = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!batch.length) return;
  seq += 1;
  noteOutputEvents.set({ events: batch, seq });
}

export function noteOutputFromBytes(bytes, sourceType = '', sourceId = '') {
  const b = Array.isArray(bytes) ? bytes : [];
  if (b.length < 3) return null;
  const status = b[0] & 0xF0;
  const channel = (b[0] & 0x0F) + 1;
  const note = b[1] & 0x7F;
  const velocity = b[2] & 0x7F;
  // A note-on at velocity 0 is a note-off. Every device does this and a
  // recorder that misses it records a note that never ends.
  if (status === 0x90 && velocity > 0) return { kind: 'on', channel, note, velocity, sourceType, sourceId };
  if (status === 0x80 || (status === 0x90 && velocity === 0)) return { kind: 'off', channel, note, velocity: 0, sourceType, sourceId };
  return null;
}

export function clearNoteOutput() { seq += 1; noteOutputEvents.set({ events: [], seq }); }
