// Phrase Recorder — the note twin of the Gesture Looper.
//
// The Looper records your *motion* and replays it into a parameter. This
// records your *notes* — played on the panel or arriving on the MIDI input —
// and replays them on the clock. Same interaction model (arm, record a pass,
// overdub, undo the pass you regret), different payload.
//
// The difference that shapes the engine: a gesture is a *sample stream* you can
// interpolate, and a phrase is a set of *events with duration*. A sample can be
// approximated; a note-on cannot — miss it and there is silence, double it and
// there is a stuck note. So this file is event bookkeeping, not curve fitting.
//
// Pure: a take and a phase in, notes out. The clock, the MIDI and the timers
// live in the preview surface.
import { SCALES, noteName, useFlats } from './chordPadLayout.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function wrap01(n) { return ((num(n, 0) % 1) + 1) % 1; }

export const MIN_BARS = 1;
export const MAX_BARS = 16;
export const MAX_EVENTS = 512;          // a hard stop, so a stuck input can't grow forever

// What the recorder is doing. `armed` is separate from `recording` on purpose:
// pressing record mid-loop and having it start *there* gives you a take whose
// downbeat is wherever your hand was, which is never what you wanted.
export const RECORDER_STATES = ['idle', 'armed', 'recording', 'overdub'];
// What a take captures. Exported so the script verb's documentation names the values the
// reducer below actually accepts — it used to say "keys"/"harmony"/"both", none of which
// are these.
export const RECORDER_SOURCES = ['input', 'panel', 'both'];
export const RECORDER_STATE_LABELS = {
  idle: 'Idle', armed: 'Armed', recording: 'Recording', overdub: 'Overdub',
};

export function recorderConfig(control) {
  return control?._children?.Recorder ?? {};
}
export function recorderState(control) {
  const s = String(recorderConfig(control).state ?? 'idle');
  return RECORDER_STATES.includes(s) ? s : 'idle';
}
export function isRecordingState(state) { return state === 'recording' || state === 'overdub'; }
export function recorderChannel(control) { return clampInt(recorderConfig(control).channel ?? 1, 1, 16); }
export function recorderTranspose(control) { return clampInt(recorderConfig(control).transpose ?? 0, -48, 48); }
export function recorderSynced(control) { return recorderConfig(control).syncToTransport === true; }
export function recorderBars(control) { return clampInt(recorderConfig(control).bars ?? 2, MIN_BARS, MAX_BARS); }
export function recorderSeconds(control) { return Math.max(0.25, num(recorderConfig(control).seconds, 4)); }
export function recorderPhase(control) {
  const cfg = recorderConfig(control);
  return wrap01(cfg.__phase !== undefined ? cfg.__phase : cfg.phase);
}
export function recorderPlaying(control) { return recorderConfig(control).playing !== false; }
// How long one loop lasts. Synced it's bars at the transport's tempo, so the
// take stays the same number of bars when the tempo changes — which is the
// entire point of syncing a recorded phrase rather than a recorded gesture.
export function recorderLoopSeconds(control, bpm = null, beatsPerBar = 4) {
  if (recorderSynced(control) && bpm !== null) {
    return recorderBars(control) * Math.max(1, num(beatsPerBar, 4)) * (60 / Math.max(1, num(bpm, 120)));
  }
  return recorderSeconds(control);
}

// Where the playhead WAS at a past instant. The input store publishes state, so
// the recorder learns about a note on the frame that notices it — up to a frame
// late. The note carries its arrival time, so the position it is recorded at can
// be wound back to when it actually happened rather than when we looked.
//
// Pure, and clamped: a stamp older than one loop is not useful (it would wrap
// round and land somewhere arbitrary), so anything beyond that falls back to now.
export function phaseAtTime(phaseNow, nowMs, atMs, loopSeconds) {
  const loop = Math.max(0.05, num(loopSeconds, 1));
  // 0 means "no stamp". Guarding here rather than trusting every caller to:
  // treating it as a real time would wind the playhead back by the whole epoch.
  const at = num(atMs, 0);
  if (at <= 0) return wrap01(phaseNow);
  const back = (num(nowMs, 0) - at) / 1000;
  if (!(back > 0) || back >= loop) return wrap01(phaseNow);
  return wrap01(num(phaseNow, 0) - back / loop);
}

// --- The take ---------------------------------------------------------------------
// An event is { t, note, velocity, dur, pass }: position in the loop 0..1,
// length as a fraction of the loop, and which overdub pass laid it down. `pass`
// is what makes undo possible without a full history — you drop a number, not a
// diff.
export const EMPTY_TAKE = Object.freeze({ events: [], pending: {} });

export function recorderTake(control) {
  const raw = recorderConfig(control).take;
  if (!raw || typeof raw !== 'object') return EMPTY_TAKE;
  return { events: normalizeEvents(raw.events), pending: raw.pending && typeof raw.pending === 'object' ? raw.pending : {} };
}
export function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && Number.isFinite(Number(e.note)))
    .map((e) => ({
      t: wrap01(e.t),
      note: clampInt(e.note, 0, 127),
      velocity: clampInt(e.velocity ?? 100, 1, 127),
      // A duration of a whole loop is legal (a drone); longer is not, because it
      // would overlap itself on the next lap and the note-off would land on a
      // note-on of the same pitch.
      dur: Math.min(1, Math.max(0.001, num(e.dur, 0.1))),
      pass: Math.max(0, Math.round(num(e.pass, 0))),
    }))
    .sort((a, b) => a.t - b.t || a.note - b.note);
}
export function takeIsEmpty(take) { return (take?.events?.length ?? 0) === 0; }
export function takeEventCount(take) { return take?.events?.length ?? 0; }
export function takePasses(take) {
  const passes = new Set((take?.events ?? []).map((e) => e.pass));
  return [...passes].sort((a, b) => a - b);
}
export function lastPass(take) {
  const p = takePasses(take);
  return p.length ? p[p.length - 1] : 0;
}

// --- Recording ---------------------------------------------------------------------
// A note-on parks in `pending`; the note-off completes it. Keyed by
// channel+note, because the same pitch on two channels is two notes and
// collapsing them loses one.
const pendKey = (channel, note) => `${clampInt(channel, 1, 16)}:${clampInt(note, 0, 127)}`;

export function recordNoteOn(take, t, channel, note, velocity, pass = 0) {
  const prior = take ?? EMPTY_TAKE;
  if (prior.events.length >= MAX_EVENTS) return prior;
  const key = pendKey(channel, note);
  const pending = { ...prior.pending };
  // A retrigger with no note-off in between: close the first one at this
  // instant rather than dropping it. A lost note-off is a real thing on real
  // cables, and the alternative is an event that never ends.
  let events = prior.events;
  if (pending[key]) events = closePending(events, pending[key], wrap01(t));
  pending[key] = { t: wrap01(t), note: clampInt(note, 0, 127), velocity: clampInt(velocity, 1, 127), pass };
  return { events, pending };
}
export function recordNoteOff(take, t, channel, note) {
  const prior = take ?? EMPTY_TAKE;
  const key = pendKey(channel, note);
  const held = prior.pending[key];
  if (!held) return prior;                       // an off with no on — ignore, don't invent
  const pending = { ...prior.pending };
  delete pending[key];
  return { events: closePending(prior.events, held, wrap01(t)), pending };
}
function closePending(events, held, tOff) {
  // Duration measured FORWARD around the loop, so a note held across the seam
  // keeps its real length instead of becoming negative.
  let dur = tOff - held.t;
  if (dur <= 0) dur += 1;
  const next = events.slice();
  next.push({ ...held, dur: Math.min(1, Math.max(0.001, dur)) });
  return next.sort((a, b) => a.t - b.t || a.note - b.note);
}
// Stopping with keys down. Every open note is closed at the current position —
// the alternative is an event with no end, which plays as a stuck note forever.
export function closeOpenNotes(take, t) {
  const prior = take ?? EMPTY_TAKE;
  const keys = Object.keys(prior.pending);
  if (!keys.length) return prior;
  let events = prior.events;
  for (const k of keys) events = closePending(events, prior.pending[k], wrap01(t));
  return { events, pending: {} };
}
// Undo one overdub pass. Not a general undo stack: the thing you actually want
// is "that last layer was wrong, take it off", and a pass number gives you that
// for free.
export function undoPass(take) {
  const prior = take ?? EMPTY_TAKE;
  if (!prior.events.length) return prior;
  const p = lastPass(prior);
  const events = prior.events.filter((e) => e.pass !== p);
  if (events.length === prior.events.length) return prior;
  return { events, pending: prior.pending };
}
export function clearTake() { return { events: [], pending: {} }; }

// --- Quantise --------------------------------------------------------------------
// Strength is deliberate. Full quantise makes a human take sound like a step
// sequencer — and if that is what you wanted, the Phrase Sequencer already
// exists and is better at it. Partial quantise pulls the timing toward the grid
// while keeping the feel, which is the reason to record a phrase rather than
// draw one.
export function quantizeTime(t, grid, strength = 1) {
  const n = Math.max(1, Math.round(num(grid, 16)));
  const s = clamp01(num(strength, 1));
  const p = wrap01(t);
  const snapped = Math.round(p * n) / n;
  return wrap01(p + (snapped - p) * s);
}
// Snap a pitch to the nearest note of the scale. Ties go DOWN, deterministically
// — a coin-flip here means the same take quantises two different ways.
export function snapNoteToScale(note, keyPc, scaleName) {
  const scale = SCALES[String(scaleName)] ?? null;
  if (!scale) return clampInt(note, 0, 127);
  const n = clampInt(note, 0, 127);
  const key = ((Math.round(num(keyPc, 0)) % 12) + 12) % 12;
  const pcs = scale.map((s) => ((s + key) % 12 + 12) % 12);
  if (pcs.includes(((n % 12) + 12) % 12)) return n;
  for (let d = 1; d <= 6; d += 1) {
    if (pcs.includes((((n - d) % 12) + 12) % 12)) return Math.max(0, n - d);
    if (pcs.includes((((n + d) % 12) + 12) % 12)) return Math.min(127, n + d);
  }
  return n;
}
export function quantizeTake(take, opts = {}) {
  const prior = take ?? EMPTY_TAKE;
  const { grid = 16, strength = 1, keyPc = null, scaleName = null, quantizeLength = false } = opts;
  if (!prior.events.length) return prior;
  const events = prior.events.map((e) => {
    const t = quantizeTime(e.t, grid, strength);
    const note = keyPc === null || !scaleName ? e.note : snapNoteToScale(e.note, keyPc, scaleName);
    // Lengths are left alone unless asked: quantising them turns a legato line
    // into blocks, and that is a separate decision from fixing the timing.
    const dur = quantizeLength
      ? Math.min(1, Math.max(1 / Math.max(1, Math.round(num(grid, 16))), Math.round(e.dur * grid) / grid))
      : e.dur;
    return { ...e, t, note, dur };
  });
  return { events: events.sort((a, b) => a.t - b.t || a.note - b.note), pending: prior.pending };
}

// --- Playback -------------------------------------------------------------------
// Which events start inside (from, to] on the loop, wrap included. A window is
// half-open at the start so an event exactly on the seam fires once per lap and
// not twice.
export function eventsInWindow(events, from, to) {
  const evs = Array.isArray(events) ? events : [];
  const a = wrap01(from);
  const b = wrap01(to);
  if (a === b) return [];
  if (a < b) return evs.filter((e) => e.t > a && e.t <= b);
  // Wrapped: the window crosses the seam, so it's two ranges.
  return evs.filter((e) => e.t > a || e.t <= b);
}
// How long an event sounds, in seconds, for a loop of this length.
export function eventSeconds(event, loopSeconds) {
  return Math.max(0.005, num(event?.dur, 0.1) * Math.max(0.05, num(loopSeconds, 1)));
}
// The pitch actually sent: the recorded note plus the transpose. Out of range is
// DROPPED, not clamped — clamping piles every stray note onto 0 or 127, which
// sounds like a stuck key.
export function playedNote(control, event) {
  const n = Math.round(num(event?.note, 60)) + recorderTranspose(control);
  return n < 0 || n > 127 ? null : n;
}
export function playedVelocity(control, event) {
  const scale = Math.max(0.1, num(recorderConfig(control).velocityScale, 1));
  return clampInt(Math.round(num(event?.velocity, 100) * scale), 1, 127);
}

// --- Geometry -----------------------------------------------------------------
// A piano roll that fits itself to the take. A fixed 128-row range would draw
// one recorded octave as three invisible pixels.
export function takeNoteRange(events, minSpan = 12) {
  const evs = Array.isArray(events) ? events : [];
  if (!evs.length) return { lo: 48, hi: 48 + minSpan };
  let lo = 127; let hi = 0;
  for (const e of evs) { if (e.note < lo) lo = e.note; if (e.note > hi) hi = e.note; }
  const span = Math.max(minSpan, hi - lo + 1);
  const pad = Math.floor((span - (hi - lo + 1)) / 2);
  const outLo = Math.max(0, lo - pad);
  return { lo: outLo, hi: Math.min(127, outLo + span - 1) };
}
export function recorderGeometry(width, height, pad = 8, headerH = 20) {
  const p = Math.max(0, num(pad, 8));
  const hdr = Math.max(0, num(headerH, 0));
  return {
    x0: p, y0: p + hdr,
    w: Math.max(1, num(width, 0) - p * 2),
    h: Math.max(1, num(height, 0) - p * 2 - hdr),
  };
}
// An event drawn as a bar: x from its position, width from its duration. A note
// that wraps the seam is returned as TWO rects — the alternative is a bar that
// runs off the right edge and looks shorter than it sounds.
export function eventRects(geom, event, range) {
  const lo = Math.min(range.lo, range.hi);
  const hi = Math.max(range.lo, range.hi);
  const rows = Math.max(1, hi - lo + 1);
  const rowH = geom.h / rows;
  const row = clampInt(event.note, lo, hi) - lo;
  const y = geom.y0 + (rows - 1 - row) * rowH;
  const h = Math.max(1.5, rowH - 1);
  const x = geom.x0 + wrap01(event.t) * geom.w;
  const full = num(event.dur, 0.1) * geom.w;
  const toEdge = geom.x0 + geom.w - x;
  if (full <= toEdge) return [{ x, y, w: Math.max(1.5, full), h }];
  return [
    { x, y, w: Math.max(1.5, toEdge), h },
    { x: geom.x0, y, w: Math.max(1.5, full - toEdge), h },
  ];
}
export function playheadX(geom, phase) { return geom.x0 + wrap01(phase) * geom.w; }
export function rowLabelFor(note, flats = true) {
  const m = clampInt(note, 0, 127);
  return `${noteName(((m % 12) + 12) % 12, flats)}${Math.floor(m / 12) - 1}`;
}
export function recorderUseFlats(control) {
  const cfg = recorderConfig(control);
  return useFlats(clampInt(cfg.key ?? 0, 0, 11), String(cfg.scale ?? 'minor'));
}

// --- The transport of the recorder itself ------------------------------------------
// Arming, and what a loop boundary does to it. Pure, because "what happens when
// the loop comes round" is the one rule that has to be right and is the hardest
// to test by hand.
export function onLoopBoundary(state, opts = {}) {
  const { hadEvents = false, once = false, lapsWaited = 0, countInLaps: laps = 0 } = opts;
  switch (String(state)) {
    // Armed means "start at the top of the next loop": the take's downbeat is
    // the loop's downbeat, not wherever your hand happened to be. With a
    // count-in it waits that many more laps first — still landing on a
    // boundary, just a later one.
    case 'armed':
      if (laps > 0 && lapsWaited < laps) return 'armed';
      return hadEvents ? 'overdub' : 'recording';
    // A single pass drops back to playing at the seam; otherwise it keeps
    // layering until you stop it.
    case 'recording': return once ? 'idle' : 'recording';
    case 'overdub': return once ? 'idle' : 'overdub';
    default: return String(state);
  }
}
// What pressing the record button does from here.
export function toggleRecordState(state, hadEvents = false) {
  if (isRecordingState(state)) return 'idle';
  if (state === 'armed') return 'idle';           // pressed twice = changed your mind
  return hadEvents ? 'armed' : 'armed';
}
export function nextPassFor(take, state) {
  return state === 'overdub' ? lastPass(take) + 1 : 0;
}

// --- Take slots --------------------------------------------------------------------
// Several takes on one recorder, so you can try an idea without losing the one
// that worked. The live take is `take`; the others live in `slots` and swapping
// is a copy in each direction, not a reference — otherwise editing the live take
// would silently rewrite the stored one.
export const MAX_SLOTS = 8;

export function recorderSlots(control) {
  const raw = recorderConfig(control).slots;
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_SLOTS).map((t, i) => ({
    id: String(t?.id ?? `slot_${i + 1}`),
    name: String(t?.name ?? `Take ${i + 1}`),
    events: normalizeEvents(t?.events),
  }));
}
export function slotIndex(control) {
  const n = recorderSlots(control).length;
  if (!n) return -1;
  return clampInt(recorderConfig(control).slot ?? 0, 0, n - 1);
}
// Store the live take into a slot. Returns the whole slot list.
export function storeSlot(slots, index, take, name = null) {
  const list = (Array.isArray(slots) ? slots : []).slice(0, MAX_SLOTS);
  const i = Math.round(num(index, 0));
  if (i < 0 || i >= MAX_SLOTS) return list;
  const events = normalizeEvents(take?.events);
  const next = list.slice();
  while (next.length <= i) next.push({ id: `slot_${next.length + 1}`, name: `Take ${next.length + 1}`, events: [] });
  next[i] = { ...next[i], name: name ?? next[i].name, events };
  return next;
}
// Load a slot into a live take. A COPY: the take you go on to edit must not be
// the same array the slot is holding.
export function loadSlot(slots, index) {
  const list = Array.isArray(slots) ? slots : [];
  const i = Math.round(num(index, 0));
  if (i < 0 || i >= list.length) return EMPTY_TAKE;
  return { events: normalizeEvents(list[i]?.events).map((e) => ({ ...e })), pending: {} };
}

// --- Editing a recorded note -------------------------------------------------------
// Not a piano-roll editor — the Phrase Sequencer is that. This is the small set
// of repairs you want on a take you otherwise like: move one note off the beat
// it landed wrong on, change its pitch, make it longer, drop it.
//
// Notes are addressed by INDEX into the sorted event list, because a take has no
// stable ids and adding them would only be for this.
export function editNote(take, index, patch) {
  const prior = take ?? EMPTY_TAKE;
  const i = Math.round(num(index, -1));
  if (i < 0 || i >= prior.events.length || !patch || typeof patch !== 'object') return prior;
  const cur = prior.events[i];
  const next = {
    ...cur,
    ...(patch.t !== undefined ? { t: wrap01(patch.t) } : {}),
    ...(patch.note !== undefined ? { note: clampInt(patch.note, 0, 127) } : {}),
    ...(patch.velocity !== undefined ? { velocity: clampInt(patch.velocity, 1, 127) } : {}),
    ...(patch.dur !== undefined ? { dur: Math.min(1, Math.max(0.001, num(patch.dur, cur.dur))) } : {}),
  };
  // Same object out when nothing actually moved.
  if (next.t === cur.t && next.note === cur.note && next.velocity === cur.velocity && next.dur === cur.dur) return prior;
  const events = prior.events.slice();
  events[i] = next;
  // Re-sorted, because everything downstream assumes time order.
  return { events: events.sort((a, b) => a.t - b.t || a.note - b.note), pending: prior.pending };
}
export function deleteNote(take, index) {
  const prior = take ?? EMPTY_TAKE;
  const i = Math.round(num(index, -1));
  if (i < 0 || i >= prior.events.length) return prior;
  return { events: prior.events.filter((_, k) => k !== i), pending: prior.pending };
}
// Nudge every note by a fraction of the loop. The whole-take version of "it is
// consistently a hair late", which is the commonest thing wrong with a take.
export function nudgeTake(take, delta) {
  const prior = take ?? EMPTY_TAKE;
  const d = num(delta, 0);
  if (!d || !prior.events.length) return prior;
  const events = prior.events
    .map((e) => ({ ...e, t: wrap01(e.t + d) }))
    .sort((a, b) => a.t - b.t || a.note - b.note);
  return { events, pending: prior.pending };
}
// Transpose the take itself, rather than at playback. Notes off the end are
// DROPPED — the same rule playback uses, so the two can't disagree about what
// the take contains.
export function transposeTake(take, semitones) {
  const prior = take ?? EMPTY_TAKE;
  const by = Math.round(num(semitones, 0));
  if (!by || !prior.events.length) return prior;
  const events = prior.events
    .map((e) => ({ ...e, note: e.note + by }))
    .filter((e) => e.note >= 0 && e.note <= 127)
    .sort((a, b) => a.t - b.t || a.note - b.note);
  return { events, pending: prior.pending };
}

// --- Count-in -----------------------------------------------------------------------
// The Transport has one, but it counts the whole panel in from a stop. This one
// counts THIS recorder in from wherever the music already is, which is what you
// want when the band is playing and you want to catch the next four bars.
export function countInBars(control) { return clampInt(recorderConfig(control).countIn ?? 0, 0, 4); }
// Laps to wait before `armed` becomes `recording`. Expressed in whole loops,
// because the loop is the unit the arming already works in.
export function countInLaps(control) {
  const bars = countInBars(control);
  if (bars <= 0) return 0;
  return Math.max(1, Math.ceil(bars / Math.max(1, recorderBars(control))));
}

// --- Driving it from a script -------------------------------------------------------------
// Same contract as the Phrase Sequencer's: a PURE reducer over the config that
// returns a PATCH of only the fields that change. An empty patch is a no-op,
// which is what every unrecognised argument produces — a script on a footswitch
// must not take the panel down because someone typed "quantise".
export const RECORDER_SCRIPT_ACTIONS = [
  'record', 'stop', 'play', 'clear', 'undo', 'quantize', 'transpose', 'bars', 'source',
  'nudge', 'shift', 'store', 'load', 'countIn',
];

export function recorderScriptPatch(cfg, action, args = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const a = args && typeof args === 'object' ? args : {};
  const state = RECORDER_STATES.includes(String(c.state)) ? String(c.state) : 'idle';
  const take = { events: normalizeEvents(c.take?.events), pending: {} };
  // While it is capturing, the live take lives in the session and is committed
  // when recording stops. A script writing the take now would be overwritten a
  // moment later, so the take-editing actions refuse rather than pretend.
  const busy = isRecordingState(state);

  switch (String(action)) {
    case 'record': {
      // Explicit on/off is idempotent, for a MIDI-mapped switch that may fire
      // twice; unspecified toggles, which is what a footswitch wants.
      const want = a.on;
      if (want === true) return busy || state === 'armed' ? {} : { state: 'armed' };
      if (want === false) return state === 'idle' ? {} : { state: 'idle' };
      return { state: toggleRecordState(state, take.events.length > 0) };
    }
    case 'stop':
      return state === 'idle' ? {} : { state: 'idle' };
    case 'play': {
      const want = a.playing;
      const now = c.playing !== false;
      const next = want === undefined ? !now : want !== false;
      return next === now ? {} : { playing: next };
    }
    case 'clear':
      if (busy) return {};
      return take.events.length ? { take: clearTake(), state: 'idle' } : {};
    case 'undo': {
      if (busy) return {};
      const next = undoPass(take);
      return next === take ? {} : { take: next };
    }
    case 'quantize': {
      if (busy || !take.events.length) return {};
      const grid = clampInt(a.grid ?? c.grid ?? 16, 1, 64);
      const strength = clamp01(num(a.strength ?? c.quantizeStrength, 0));
      const intoKey = a.scale !== undefined || a.key !== undefined;
      return {
        take: quantizeTake(take, {
          grid,
          strength,
          keyPc: intoKey ? clampInt(a.key ?? c.key ?? 0, 0, 11) : null,
          scaleName: intoKey ? String(a.scale ?? c.scale ?? 'minor') : null,
          quantizeLength: a.lengths === true,
        }),
      };
    }
    case 'transpose': {
      const t = Number(a.transpose);
      return Number.isFinite(t) ? { transpose: clampInt(t, -48, 48) } : {};
    }
    case 'bars': {
      const b = Number(a.bars);
      return Number.isFinite(b) ? { bars: clampInt(b, MIN_BARS, MAX_BARS) } : {};
    }
    case 'source': {
      const s = String(a.source ?? '');
      return RECORDER_SOURCES.includes(s) ? { source: s } : {};
    }
    case 'nudge': {
      if (busy) return {};
      const d = Number(a.by);
      if (!Number.isFinite(d) || d === 0) return {};
      const next = nudgeTake(take, d);
      return next === take ? {} : { take: next };
    }
    // `shift` transposes the TAKE, where `transpose` only changes playback. Two
    // commands because they are genuinely different: one rewrites what you
    // recorded, the other leaves it alone.
    case 'shift': {
      if (busy) return {};
      const by = Number(a.semitones);
      if (!Number.isFinite(by) || by === 0) return {};
      const next = transposeTake(take, by);
      return next === take ? {} : { take: next };
    }
    case 'store': {
      if (busy) return {};
      const i = Number(a.slot);
      if (!Number.isFinite(i)) return {};
      const slots = storeSlot(c.slots, Math.round(i) - 1, take, a.name ? String(a.name) : null);
      return slots.length ? { slots } : {};
    }
    case 'load': {
      if (busy) return {};
      const i = Number(a.slot);
      if (!Number.isFinite(i)) return {};
      const idx = Math.round(i) - 1;
      const list = Array.isArray(c.slots) ? c.slots : [];
      if (idx < 0 || idx >= list.length) return {};
      return { take: loadSlot(list, idx), slot: idx };
    }
    case 'countIn': {
      const n = Number(a.bars);
      return Number.isFinite(n) ? { countIn: clampInt(n, 0, 4) } : {};
    }
    default:
      return {};
  }
}
