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

// --- Expression state ---------------------------------------------------------
// The other half of the input stream: continuous controllers. The Expression
// Router advertises mod wheel / breath / expression / foot / aftertouch /
// velocity, all of which ride the same bytes the notes do — so the same parser
// feeds both, and there is only ever one listener.
//
// Entries carry a monotonically increasing `n` rather than a timestamp, so the
// module stays clock-free (and therefore testable): "most recent" is the
// highest n, which is what an omni lookup needs to pick between channels.
export const EMPTY_EXPRESSION_STATE = Object.freeze({ cc: {}, at: {}, vel: {}, pat: {}, n: 0 });

export function expressionEvent(message) {
  const m = Array.isArray(message) ? message : [];
  if (!m.length) return null;
  const status = m[0] & 0xF0;
  const channel = (m[0] & 0x0F) + 1;
  if (status === 0xB0) {
    const cc = m[1] & 0x7F;
    // Channel-mode messages aren't continuous controllers, but 120/123 do have
    // to reach the reducer: they silence the channel, so any per-note pressure
    // it was holding is stale.
    if (cc === 120 || cc === 123) return { kind: 'pressureClearAll', channel };
    if (cc >= 120) return null;
    return { kind: 'cc', channel, cc, value: (m[2] ?? 0) & 0x7F };
  }
  if (status === 0xD0) return { kind: 'aftertouch', channel, value: m[1] & 0x7F };
  // Polyphonic key pressure: per-note, so it is keyed by note as well.
  if (status === 0xA0) {
    return { kind: 'polyAftertouch', channel, note: m[1] & 0x7F, value: (m[2] ?? 0) & 0x7F };
  }
  // A note-on doubles as the velocity source; a release carries no dynamics —
  // but it MUST clear that note's pressure, or "hardest key" stays stuck on a
  // key nobody is touching any more.
  if (status === 0x90) {
    const value = (m[2] ?? 0) & 0x7F;
    return value > 0
      ? { kind: 'velocity', channel, value }
      : { kind: 'pressureClear', channel, note: m[1] & 0x7F };
  }
  if (status === 0x80) return { kind: 'pressureClear', channel, note: m[1] & 0x7F };
  return null;
}
export function expressionEventsFromHex(hex) {
  return splitMidiMessages(parseMidiHex(hex)).map(expressionEvent).filter(Boolean);
}

export function applyExpressionEvent(state, event) {
  const s = state ?? EMPTY_EXPRESSION_STATE;
  if (!event) return s;
  if (event.kind === 'pressureClear') {
    const key = `${event.channel}:${event.note}`;
    if (!(key in s.pat)) return s;
    const pat = { ...s.pat };
    delete pat[key];
    return { ...s, pat, n: s.n + 1 };
  }
  if (event.kind === 'pressureClearAll') {
    const pat = {};
    let changed = false;
    for (const [k, v] of Object.entries(s.pat)) {
      if (v.channel === event.channel) { changed = true; continue; }
      pat[k] = v;
    }
    return changed ? { ...s, pat, n: s.n + 1 } : s;
  }
  const bucket = event.kind === 'cc' ? 'cc'
    : event.kind === 'aftertouch' ? 'at'
    : event.kind === 'velocity' ? 'vel'
    : event.kind === 'polyAftertouch' ? 'pat' : null;
  if (!bucket) return s;
  const key = event.kind === 'cc' ? `${event.channel}:${event.cc}`
    : event.kind === 'polyAftertouch' ? `${event.channel}:${event.note}`
    : `${event.channel}`;
  const prev = s[bucket][key];
  if (prev && prev.v === event.value) return s;          // unchanged → no churn
  const n = s.n + 1;
  const entry = { v: event.value, n };
  if (event.kind === 'polyAftertouch') { entry.channel = event.channel; entry.note = event.note; }
  return { ...s, [bucket]: { ...s[bucket], [key]: entry }, n };
}
export function applyExpressionEvents(state, events) {
  let s = state ?? EMPTY_EXPRESSION_STATE;
  for (const e of (Array.isArray(events) ? events : [])) s = applyExpressionEvent(s, e);
  return s;
}
export function applyExpressionHex(state, hex) {
  return applyExpressionEvents(state, expressionEventsFromHex(hex));
}

// Read a bucket. `channel` 0 = omni, which returns the most recently updated
// matching entry. Returns undefined when that controller has never been seen —
// the caller needs to tell "never arrived" from "arrived as 0".
function readBucket(map, exactKey, omniSuffix) {
  if (exactKey !== null) return map[exactKey]?.v;
  let best;
  for (const [k, entry] of Object.entries(map ?? {})) {
    if (omniSuffix !== null && !k.endsWith(omniSuffix)) continue;
    if (!best || entry.n > best.n) best = entry;
  }
  return best?.v;
}
export function ccValue(state, cc, channel = 0) {
  const s = state ?? EMPTY_EXPRESSION_STATE;
  const c = Math.round(num(cc, -1));
  const ch = Math.round(num(channel, 0));
  return readBucket(s.cc, ch > 0 ? `${ch}:${c}` : null, `:${c}`);
}
export function aftertouchValue(state, channel = 0) {
  const s = state ?? EMPTY_EXPRESSION_STATE;
  const ch = Math.round(num(channel, 0));
  return readBucket(s.at, ch > 0 ? `${ch}` : null, null);
}
export function velocityValue(state, channel = 0) {
  const s = state ?? EMPTY_EXPRESSION_STATE;
  const ch = Math.round(num(channel, 0));
  return readBucket(s.vel, ch > 0 ? `${ch}` : null, null);
}

export const POLY_PRESSURE_MODES = ['highest', 'last'];
// Poly pressure is per-note, but a router destination is one number, so it has
// to be reduced. 'highest' = the hardest-pressed key still down (press anything
// harder and it opens); 'last' = the key you most recently leaned on. Entries
// for released keys are already gone, so neither can read a stale finger.
export function polyPressureEntries(state, channel = 0) {
  const s = state ?? EMPTY_EXPRESSION_STATE;
  const ch = Math.round(num(channel, 0));
  return Object.values(s.pat).filter((e) => ch === 0 || e.channel === ch);
}
export function polyAftertouchValue(state, channel = 0, mode = 'highest') {
  const entries = polyPressureEntries(state, channel);
  if (!entries.length) return undefined;
  if (String(mode) === 'last') {
    return entries.reduce((best, e) => (!best || e.n > best.n ? e : best), null).v;
  }
  return entries.reduce((m, e) => Math.max(m, e.v), 0);
}

// --- MIDI learn ----------------------------------------------------------------
// "Wiggle the controller you want" is a better way to pick a source than reading
// a list, but the first message that arrives is the WRONG answer: brushing a key
// on the way to the mod wheel sends a note, and some keyboards trickle
// aftertouch constantly. So a learn session watches for a window and picks the
// controller that MOVED THE MOST — largest span between its lowest and highest
// value, ties broken by how many messages it sent. A single stray note-on can't
// win because it has a span of zero.
export const EMPTY_LEARN_STATE = Object.freeze({ candidates: {}, n: 0 });

export function learnKey(event) {
  if (!event) return '';
  if (event.kind === 'cc') return `cc:${event.channel}:${event.cc}`;
  if (event.kind === 'aftertouch') return `at:${event.channel}`;
  if (event.kind === 'velocity') return `vel:${event.channel}`;
  // Deliberately NOT per note: you're learning "poly pressure on this channel",
  // not "poly pressure on middle C".
  if (event.kind === 'polyAftertouch') return `pat:${event.channel}`;
  return '';
}

export function applyLearnEvent(state, event) {
  const s = state ?? EMPTY_LEARN_STATE;
  const key = learnKey(event);
  if (!key) return s;
  const prev = s.candidates[key];
  const v = event.value;
  const next = prev
    ? { ...prev, min: Math.min(prev.min, v), max: Math.max(prev.max, v), count: prev.count + 1, last: v }
    : { kind: event.kind, channel: event.channel, cc: event.cc ?? null, min: v, max: v, count: 1, last: v };
  return { candidates: { ...s.candidates, [key]: next }, n: s.n + 1 };
}
export function applyLearnHex(state, hex) {
  let s = state ?? EMPTY_LEARN_STATE;
  for (const e of expressionEventsFromHex(hex)) s = applyLearnEvent(s, e);
  return s;
}

// Everything seen this session, most-moved first.
export function learnCandidates(state) {
  return Object.entries((state ?? EMPTY_LEARN_STATE).candidates)
    .map(([key, c]) => ({ key, ...c, span: c.max - c.min }))
    .sort((a, b) => (b.span - a.span) || (b.count - a.count));
}
// The winner, or null while nothing has moved convincingly yet. The thresholds
// are what stop a resting controller's jitter, or one stray note, from being
// adopted the instant you press Learn.
export function learnBest(state, { minSpan = 8, minMessages = 2 } = {}) {
  const span = Math.max(0, num(minSpan, 8));
  const msgs = Math.max(1, Math.round(num(minMessages, 2)));
  return learnCandidates(state).find((c) => c.span >= span && c.count >= msgs) ?? null;
}
// A human description of a candidate, for the "listening…" readout.
export function learnCandidateLabel(candidate) {
  if (!candidate) return '';
  const ch = ` · ch ${candidate.channel}`;
  if (candidate.kind === 'aftertouch') return `Aftertouch${ch}`;
  if (candidate.kind === 'polyAftertouch') return `Poly pressure${ch}`;
  if (candidate.kind === 'velocity') return `Note velocity${ch}`;
  return `CC ${candidate.cc}${ch}`;
}
