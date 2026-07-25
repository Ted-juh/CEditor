// The shared master clock. One of these for the whole app: two components
// following two clocks is not sync.
//
// Two rates on purpose. The clock itself runs on a short interval so MIDI
// clock-out (24 pulses per quarter — every 21ms at 120bpm) isn't jittered by
// the display refresh, and so it keeps counting if requestAnimationFrame gets
// throttled, which browsers do the moment a window stops being visible. The
// STORE only publishes at display rate, because a Svelte store set 250 times a
// second would re-render the world for no benefit.
//
// Consumers that need the exact position call transportBeatsNow() from their
// own ticker rather than reading the store — see the Arp.
import { writable, get } from 'svelte/store';
import { latestMidiInputMessage } from './deviceProfiles.js';
import { triggerRawMidiAction } from '../bridge/bridge.js';
import { splitMidiMessages, parseMidiHex } from '../utils/midiNoteInput.js';
import {
  beatsAt, startedAtFor, transportEvent, clockPulsesBetween,
  estimateTempoFromPulses, MIN_BPM, MAX_BPM,
} from '../utils/transportLayout.js';

const TICK_MS = 4;            // clock resolution
const PUBLISH_MS = 33;        // ~30Hz to the UI
const PULSE_HISTORY = 24;     // one quarter note of incoming clock gaps

export const transport = writable({
  running: false,
  bpm: 120,
  beats: 0,
  source: 'internal',
  externalBpm: null,          // what the incoming clock says, when following one
  externalLocked: false,      // …and whether it has arrived recently
  seq: 0,
});

let timer = null;
let startedAt = 0;
let bpm = 120;
let running = false;
let beats = 0;
let lastPublishAt = 0;
let clockOut = false;
let lastPulseBeats = 0;

// External clock state.
let source = 'internal';
let pulseTimes = [];
let lastPulseAt = 0;
let externalBpm = null;
let externalBeats = 0;        // counted from incoming pulses, 24 per quarter
let listening = false;
let lastPayload = null;

function publish(force = false) {
  const now = Date.now();
  if (!force && now - lastPublishAt < PUBLISH_MS) return;
  lastPublishAt = now;
  const cur = get(transport);
  transport.set({
    running,
    bpm,
    beats,
    source,
    externalBpm,
    externalLocked: source === 'external' && lastPulseAt > 0 && (now - lastPulseAt) < 500,
    seq: cur.seq + 1,
  });
}

function sendClockBytes(count) {
  for (let i = 0; i < count; i += 1) {
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: 'midi_clock', message: 'F8', dryRun: false });
  }
}

function tick() {
  if (!running) return;
  const now = Date.now();
  const next = source === 'external' ? externalBeats : beatsAt(startedAt, now, bpm);
  if (clockOut && next > beats) {
    // Only when we're the master — echoing someone else's clock back is how
    // feedback loops start.
    if (source === 'internal') {
      const pulses = clockPulsesBetween(lastPulseBeats, next);
      if (pulses > 0) { sendClockBytes(Math.min(pulses, 48)); lastPulseBeats = next; }
    }
  }
  beats = next;
  publish();
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
}
function stopTimer() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// --- Controls ---------------------------------------------------------------------
export function startTransport(atBeat = null) {
  if (atBeat !== null) beats = Math.max(0, Number(atBeat) || 0);
  startedAt = startedAtFor(beats, Date.now(), bpm);
  lastPulseBeats = beats;
  running = true;
  ensureTimer();
  if (clockOut && source === 'internal') {
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: 'midi_start', message: 'FA', dryRun: false });
  }
  publish(true);
}
export function stopTransport() {
  running = false;
  stopTimer();
  if (clockOut && source === 'internal') {
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: 'midi_stop', message: 'FC', dryRun: false });
  }
  publish(true);
}
export function toggleTransport() {
  if (running) stopTransport(); else startTransport();
}
export function rewindTransport() {
  beats = 0;
  externalBeats = 0;
  startedAt = Date.now();
  lastPulseBeats = 0;
  publish(true);
}
// Changing tempo must not jump the position: re-anchor the start instant so the
// current beat stays put and only the rate ahead of it changes.
export function setTransportBpm(next) {
  const v = Math.min(MAX_BPM, Math.max(MIN_BPM, Number(next) || 120));
  if (v === bpm) return;
  bpm = v;
  startedAt = startedAtFor(beats, Date.now(), bpm);
  publish(true);
}
export function setTransportSource(next) {
  const v = next === 'external' ? 'external' : 'internal';
  if (v === source) return;
  source = v;
  if (v === 'external') { ensureListener(); externalBeats = beats; }
  else startedAt = startedAtFor(beats, Date.now(), bpm);
  publish(true);
}
export function setTransportClockOut(enabled) { clockOut = enabled === true; }

// Exact position, for consumers that tick themselves. Reading the store instead
// would give them the last published value, which is up to a frame stale.
export function transportBeatsNow() {
  if (!running) return beats;
  return source === 'external' ? externalBeats : beatsAt(startedAt, Date.now(), bpm);
}
export function isTransportRunning() { return running; }
export function transportBpmNow() { return source === 'external' ? (externalBpm ?? bpm) : bpm; }

// --- External clock ------------------------------------------------------------------
// Its own subscription rather than sharing the note-input listener: the two
// track unrelated things, and coupling them would mean a panel with no
// transport still paying for clock parsing on every byte.
function ensureListener() {
  if (listening) return;
  listening = true;
  latestMidiInputMessage.subscribe((payload) => {
    if (!payload || payload === lastPayload) return;
    lastPayload = payload;
    if (source !== 'external') return;
    if (String(payload.messageType ?? '') === 'sysex') return;
    for (const message of splitMidiMessages(parseMidiHex(payload.hex))) {
      const ev = transportEvent(message);
      if (!ev) continue;
      handleExternal(ev);
    }
  });
}
function handleExternal(ev) {
  const now = Date.now();
  if (ev.kind === 'clock') {
    if (lastPulseAt > 0) {
      pulseTimes.push(now - lastPulseAt);
      if (pulseTimes.length > PULSE_HISTORY) pulseTimes.shift();
      const est = estimateTempoFromPulses(pulseTimes);
      if (est !== null) { externalBpm = est; bpm = est; }
    }
    lastPulseAt = now;
    if (running) externalBeats += 1 / 24;      // the pulses ARE the position
    return;
  }
  if (ev.kind === 'start') { externalBeats = 0; beats = 0; running = true; ensureTimer(); publish(true); return; }
  if (ev.kind === 'continue') { running = true; ensureTimer(); publish(true); return; }
  if (ev.kind === 'stop') { running = false; publish(true); return; }
  if (ev.kind === 'reset') { externalBeats = 0; beats = 0; running = false; stopTimer(); publish(true); }
}

// Test seam: drive the external path without a bridge.
export function feedTransportMidiForTest(hex) {
  const prevSource = source;
  source = 'external';
  for (const m of splitMidiMessages(parseMidiHex(hex))) {
    const ev = transportEvent(m);
    if (ev) handleExternal(ev);
  }
  source = prevSource;
}
export function resetTransportForTest() {
  running = false; stopTimer(); beats = 0; externalBeats = 0; bpm = 120;
  source = 'internal'; pulseTimes = []; lastPulseAt = 0; externalBpm = null;
  clockOut = false; startedAt = 0; lastPulseBeats = 0;
  publish(true);
}
