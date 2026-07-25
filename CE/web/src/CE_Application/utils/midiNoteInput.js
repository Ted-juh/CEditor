// Note input — the read side of the note-playing family. The panel already
// SENDS notes (Chord Pad, Arp, Ribbon, Drum Pads); this turns the same controls
// into monitors of what's coming IN, so a panel doubles as a chord analyser, a
// keyboard-fed arpeggiator, or a drum-map checker.
//
// Everything here is pure: raw MIDI bytes in, note events and a held-note state
// out. The live wiring (subscribing to the hardware input) lives in
// stores/noteInput.js; the reducer it drives is all tested here.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// "90 3C 60" / "903C60" / "0x90,0x3c,0x60" → [144, 60, 96]. Anything unparseable
// is dropped rather than poisoning the stream with NaN.
export function parseMidiHex(hex) {
  const s = String(hex ?? '').trim();
  if (!s) return [];
  const tokens = s.includes(' ') || s.includes(',')
    ? s.split(/[\s,]+/).filter(Boolean)
    : (s.replace(/^0x/i, '').match(/../g) ?? []);
  const out = [];
  for (const t of tokens) {
    const v = parseInt(String(t).replace(/^0x/i, ''), 16);
    if (Number.isFinite(v) && v >= 0 && v <= 255) out.push(v);
  }
  return out;
}

// How many data bytes follow a channel-voice status byte.
function dataLength(status) {
  switch (status & 0xF0) {
    case 0xC0: case 0xD0: return 1;             // program change, channel pressure
    case 0x80: case 0x90: case 0xA0: case 0xB0: case 0xE0: return 2;
    default: return 0;
  }
}

// Split a byte blob into individual MIDI messages. Handles RUNNING STATUS (real
// hardware omits the repeated status byte on a fast run of notes), skips SysEx
// wholesale, and drops single-byte realtime clock/sense so they can't be
// mistaken for data.
export function splitMidiMessages(bytes) {
  const b = (Array.isArray(bytes) ? bytes : []).map((v) => num(v, 0) & 0xFF);
  const out = [];
  let running = 0;
  let i = 0;
  while (i < b.length) {
    const byte = b[i];
    if (byte === 0xF0) {                         // SysEx: skip to its terminator
      let j = i + 1;
      while (j < b.length && b[j] !== 0xF7) j += 1;
      i = j + 1;
      running = 0;
      continue;
    }
    if (byte >= 0xF8) { out.push([byte]); i += 1; continue; }   // realtime
    if (byte >= 0xF0) { running = 0; i += 1; continue; }        // other system
    let status;
    let start;
    if (byte >= 0x80) { status = byte; running = byte; start = i + 1; }
    else if (running) { status = running; start = i; }          // running status
    else { i += 1; continue; }                                  // orphan data byte
    const need = dataLength(status);
    if (start + need > b.length) break;                         // truncated tail
    out.push([status, ...b.slice(start, start + need)]);
    i = start + need;
  }
  return out;
}

// One message → the note event it represents, or null if it isn't one we care
// about. Note-on with velocity 0 is a note-OFF: that's how most hardware
// releases a key when it's using running status.
export function noteEvent(message) {
  const m = Array.isArray(message) ? message : [];
  if (!m.length) return null;
  const status = m[0] & 0xF0;
  const channel = (m[0] & 0x0F) + 1;
  if (m[0] === 0xFF) return { kind: 'reset', channel: 0, note: 0, velocity: 0 };
  if (status === 0x80) return { kind: 'noteOff', channel, note: m[1] & 0x7F, velocity: 0 };
  if (status === 0x90) {
    const velocity = (m[2] ?? 0) & 0x7F;
    return { kind: velocity > 0 ? 'noteOn' : 'noteOff', channel, note: m[1] & 0x7F, velocity };
  }
  if (status === 0xB0) {
    const cc = m[1] & 0x7F;
    // 120 = all sound off, 123 = all notes off. Both silence the channel.
    if (cc === 120 || cc === 123) return { kind: 'allNotesOff', channel, note: 0, velocity: 0 };
  }
  return null;
}

export function noteEventsFromHex(hex) {
  return splitMidiMessages(parseMidiHex(hex)).map(noteEvent).filter(Boolean);
}

// --- Held-note state ----------------------------------------------------------
// A plain object keyed "channel:note" so the same pitch on two channels stays
// distinct. Pure: every apply returns a new object, so a Svelte store can just
// swap it in and the renderers re-derive.
export const EMPTY_NOTE_STATE = Object.freeze({});
const keyOf = (channel, note) => `${channel}:${note}`;

export function applyNoteEvent(state, event) {
  const s = state ?? EMPTY_NOTE_STATE;
  if (!event) return s;
  if (event.kind === 'reset') return EMPTY_NOTE_STATE;
  if (event.kind === 'allNotesOff') {
    const next = {};
    let changed = false;
    for (const [k, v] of Object.entries(s)) {
      if (v.channel === event.channel) { changed = true; continue; }
      next[k] = v;
    }
    return changed ? next : s;
  }
  const key = keyOf(event.channel, event.note);
  if (event.kind === 'noteOff') {
    if (!(key in s)) return s;
    const next = { ...s };
    delete next[key];
    return next;
  }
  if (event.kind === 'noteOn') {
    const prev = s[key];
    if (prev && prev.velocity === event.velocity) return s;
    return { ...s, [key]: { note: event.note, channel: event.channel, velocity: event.velocity } };
  }
  return s;
}
export function applyNoteEvents(state, events) {
  let s = state ?? EMPTY_NOTE_STATE;
  for (const e of (Array.isArray(events) ? events : [])) s = applyNoteEvent(s, e);
  return s;
}
export function applyMidiHex(state, hex) {
  return applyNoteEvents(state, noteEventsFromHex(hex));
}

// The sounding notes, low to high. `channel` 0 means omni (any channel), which
// is the sane default for an echo display — you rarely care which channel a
// keyboard is on, only that a key is down.
export function heldNoteEntries(state, channel = 0) {
  const ch = Math.round(num(channel, 0));
  return Object.values(state ?? EMPTY_NOTE_STATE)
    .filter((v) => ch === 0 || v.channel === ch)
    .sort((a, b) => a.note - b.note);
}
export function heldNotes(state, channel = 0) {
  return [...new Set(heldNoteEntries(state, channel).map((v) => v.note))].sort((a, b) => a - b);
}
export function isNoteHeld(state, note, channel = 0) {
  return heldNotes(state, channel).includes(Math.round(num(note, -1)));
}
