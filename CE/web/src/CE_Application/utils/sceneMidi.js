/**
 * sceneMidi.js — MIDI in as a scene's trigger (the record's trigger list: "Panel opens, a state, an
 * event, a value, the beat, MIDI in, a script"). A note played, a note let go, a controller pushed
 * past a point, a program change; on one channel or any. The trigger's format is sceneFormat.js's
 * (cleanTrigger).
 *
 * A note let go is a note-off, or a note-on at velocity 0, which is how most keyboards send one: a
 * key lit by its note-on can go out with it, held as long as the key is.
 *
 * A controller fires when it PASSES its point going up — a sustain pedal pressed — and not again
 * while it stays there, or a pedal held down would start the scene on every message it sends. So a
 * reader keeps each controller's last value, per channel, as the messages come.
 *
 * Pure: the live surfaces feed it (PanelPreviewSurface from the editor's MIDI input, Player.svelte
 * from the plug-in's), through the run store's `midi` (stores/sceneStage.js).
 */
import { parseMidiHex, splitMidiMessages } from './midiNoteInput.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** A note by name, as the rest of CEditor names one: 60 is C4. */
export const midiNoteName = (note) => `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

/** One message as a trigger hears it, or null: `{ kind: 'note' | 'noteOff' | 'cc' | 'program', channel (1-16), … }`. */
function triggerEvent(message) {
  const status = message[0] & 0xF0;
  const channel = (message[0] & 0x0F) + 1;
  if (status === 0x90 && (message[2] ?? 0) > 0) return { kind: 'note', channel, note: message[1] & 0x7F, velocity: message[2] & 0x7F };
  if (status === 0x80 || status === 0x90) return { kind: 'noteOff', channel, note: message[1] & 0x7F };
  if (status === 0xB0 && (message[1] & 0x7F) < 120) return { kind: 'cc', channel, cc: message[1] & 0x7F, value: (message[2] ?? 0) & 0x7F };
  if (status === 0xC0) return { kind: 'program', channel, program: message[1] & 0x7F };
  return null;
}

/** The messages in a hex string that a trigger can hear: notes on and off, controllers, program changes. */
export function midiTriggerEvents(hex) {
  return splitMidiMessages(parseMidiHex(hex)).map(triggerEvent).filter(Boolean);
}

/**
 * A reader that remembers each controller's last value, so a controller event carries `previous`:
 * where it was before this message (-1 the first time it is heard).
 */
export function createMidiTriggerReader() {
  const last = new Map();
  return {
    read(hex) {
      return midiTriggerEvents(hex).map((event) => {
        if (event.kind !== 'cc') return event;
        const key = `${event.channel}:${event.cc}`;
        const previous = last.has(key) ? last.get(key) : -1;
        last.set(key, event.value);
        return { ...event, previous };
      });
    },
    reset() { last.clear(); },
  };
}

/** Whether a MIDI trigger answers this event. A controller: only as it passes its point going up. */
export function midiTriggerMatches(trigger, event) {
  if (trigger?.type !== 'midi' || !event) return false;
  if (trigger.channel && trigger.channel !== event.channel) return false;
  if (trigger.message === 'note' || trigger.message === 'noteOff') {
    return event.kind === trigger.message && (trigger.note < 0 || trigger.note === event.note);
  }
  if (trigger.message === 'program') return event.kind === 'program' && (trigger.program < 0 || trigger.program === event.program);
  if (trigger.message === 'cc') {
    if (event.kind !== 'cc' || event.cc !== trigger.cc) return false;
    const before = Number.isFinite(event.previous) ? event.previous : -1;
    return event.value > trigger.above && before <= trigger.above;
  }
  return false;
}

/** A MIDI trigger in words: "Note C4 on channel 1", "Any note", "Note C4 let go", "CC 64 past 63", "Program 5". */
export function midiTriggerText(trigger) {
  const on = trigger?.channel ? ` on channel ${trigger.channel}` : '';
  if (trigger?.message === 'noteOff') return `${trigger.note >= 0 ? `Note ${midiNoteName(trigger.note)}` : 'Any note'} let go${on}`;
  if (trigger?.message === 'cc') return `CC ${trigger.cc} past ${trigger.above}${on}`;
  if (trigger?.message === 'program') return `${trigger.program < 0 ? 'Any program change' : `Program ${trigger.program + 1}`}${on}`;
  return `${trigger?.note >= 0 ? `Note ${midiNoteName(trigger.note)}` : 'Any note'}${on}`;
}
