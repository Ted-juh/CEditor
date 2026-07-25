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
import { onHostTransport } from '../bridge/bridge.js';
import { triggerRawMidiAction } from '../bridge/bridge.js';
import { splitMidiMessages, parseMidiHex } from '../utils/midiNoteInput.js';
import {
  beatsAt, startedAtFor, transportEvent, clockPulsesBetween,
  estimateTempoFromPulses, parseHostPosition, hostJumped, transportIsFollowing,
  loopedBeats, loopCycleIndex, countInBeats, countInRemaining,
  MIN_BPM, MAX_BPM,
} from '../utils/transportLayout.js';

const TICK_MS = 4;            // clock resolution
const PUBLISH_MS = 33;        // ~30Hz to the UI
const PULSE_HISTORY = 24;     // one quarter note of incoming clock gaps

export const transport = writable({
  running: false,
  bpm: 120,
  beats: 0,
  source: 'internal',
  beatsPerBar: 4,             // the meter, so "2 bars" means something to followers
  externalBpm: null,          // what the incoming clock says, when following one
  externalLocked: false,      // …and whether it has arrived recently
  hostAvailable: false,       // the DAW is reporting a playhead at all
  loopEnabled: false,
  countingIn: false,          // in the count-in bars before the first step
  countInLeft: 0,             // …and how many beats of it are left
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
let beatsPerBar = 4;

// Loop points. Only ever applied when WE own the position: following a DAW or
// an incoming clock, the other end decides where the music is, and folding
// their position into our loop would put the panel somewhere the master isn't.
let loopEnabled = false;
let loopStartBeats = 0;
let loopLengthBeats = 16;
let lastLoopCycle = null;

// Count-in. Modelled as "not running yet" rather than a negative position, so
// every follower's existing stopped behaviour (hold, stay silent) is exactly
// right with no change to any of them.
let countingIn = false;
let countInTotal = 0;
let countInAt = 0;
let countInResumeBeats = 0;

// Host playhead state (source 'host'). The DAW reports a POSITION, not a
// pulse stream, so we anchor to it and extrapolate between updates with the
// same recompute-from-start rule as everything else here — 30 host updates a
// second would otherwise make the readout visibly steppy at display rate.
let hostListening = false;
let hostAvailable = false;
let hostPlaying = false;
let hostAnchorBeats = 0;
let hostAnchorAt = 0;
let hostBpm = null;

// Bumped on any DISCONTINUITY in the position — a host locate, a rewind, an
// external start/reset. Followers that fire per step watch this and re-baseline
// instead of replaying the gap. Exposed as a plain counter rather than an event
// so a follower that missed a frame still notices.
let jumpSeq = 0;
function bumpJump() { jumpSeq += 1; }
export function transportJumpSeq() { return jumpSeq; }

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
    beatsPerBar,
    source,
    externalBpm,
    externalLocked: source === 'external'
      ? (lastPulseAt > 0 && (now - lastPulseAt) < 500)
      : (source === 'host' && hostAvailable),
    hostAvailable,
    loopEnabled: loopEnabled && source === 'internal',
    countingIn,
    countInLeft: countingIn ? countInRemaining(countInAt, now, bpm, countInTotal) : 0,
    seq: cur.seq + 1,
  });
}

function sendClockBytes(count) {
  for (let i = 0; i < count; i += 1) {
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: 'midi_clock', message: 'F8', dryRun: false });
  }
}

function tick() {
  if (countingIn) { tickCountIn(); return; }
  if (!running) return;
  const now = Date.now();
  const raw = source === 'external' ? externalBeats
    : source === 'host' ? hostBeatsAt(now)
    : beatsAt(startedAt, now, bpm);
  const next = foldLoop(raw);
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
  countingIn = false;
  lastLoopCycle = null;
  if (atBeat !== null) { beats = Math.max(0, Number(atBeat) || 0); bumpJump(); }
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
  countingIn = false;
  stopTimer();
  if (clockOut && source === 'internal') {
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: 'midi_stop', message: 'FC', dryRun: false });
  }
  publish(true);
}
export function toggleTransport() {
  if (running || countingIn) stopTransport(); else startTransport();
}
export function rewindTransport() {
  bumpJump();
  countingIn = false;
  lastLoopCycle = null;
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
  const v = next === 'external' ? 'external' : next === 'host' ? 'host' : 'internal';
  if (v === source) return;
  source = v;
  if (v === 'external') { ensureListener(); externalBeats = beats; }
  else if (v === 'host') { ensureHostListener(); }
  else startedAt = startedAtFor(beats, Date.now(), bpm);
  publish(true);
}
export function setTransportClockOut(enabled) { clockOut = enabled === true; }
// The meter. Components that loop in BARS need it; nothing else does, which is
// why it lives here rather than being read off whichever Transport control the
// follower happens to find first.
export function setTransportSignature(perBar) {
  const v = Math.min(32, Math.max(1, Math.round(Number(perBar) || 4)));
  if (v === beatsPerBar) return;
  beatsPerBar = v;
  publish(true);
}
export function transportBeatsPerBar() { return beatsPerBar; }

// Exact position, for consumers that tick themselves. Reading the store instead
// would give them the last published value, which is up to a frame stale.
export function transportBeatsNow() {
  if (source === 'host') return hostBeatsAt(Date.now());
  if (!running) return beats;
  if (source === 'external') return externalBeats;
  return foldLoop(beatsAt(startedAt, Date.now(), bpm));
}
export function isTransportRunning() { return running; }
export function transportBpmNow() {
  if (source === 'host') return hostBpm ?? bpm;
  return source === 'external' ? (externalBpm ?? bpm) : bpm;
}

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
  if (ev.kind === 'start') { bumpJump(); externalBeats = 0; beats = 0; running = true; ensureTimer(); publish(true); return; }
  if (ev.kind === 'continue') { running = true; ensureTimer(); publish(true); return; }
  if (ev.kind === 'stop') { running = false; publish(true); return; }
  if (ev.kind === 'reset') { bumpJump(); externalBeats = 0; beats = 0; running = false; stopTimer(); publish(true); }
}

// --- Loop points ----------------------------------------------------------------------
// The fold is pure (see loopedBeats); all this does is notice a WRAP, which is
// a discontinuity like a host locate and has to be reported as one. Otherwise
// the Arp would fire every step between the loop end and the loop start on the
// frame it came round.
function foldLoop(raw) {
  if (!loopEnabled || source !== 'internal') return raw;
  const cycle = loopCycleIndex(raw, loopStartBeats, loopLengthBeats);
  if (lastLoopCycle !== null && cycle !== lastLoopCycle) bumpJump();
  lastLoopCycle = cycle;
  return loopedBeats(raw, loopStartBeats, loopLengthBeats);
}
export function setTransportLoop(enabled, startBeats, lengthBeats) {
  const on = enabled === true;
  const start = Math.max(0, Number(startBeats) || 0);
  const len = Math.max(0.01, Number(lengthBeats) || 0.01);
  if (on === loopEnabled && start === loopStartBeats && len === loopLengthBeats) return;
  loopEnabled = on;
  loopStartBeats = start;
  loopLengthBeats = len;
  lastLoopCycle = null;               // don't report the change itself as a wrap
  publish(true);
}
export function transportLoopNow() {
  return { enabled: loopEnabled && source === 'internal', startBeats: loopStartBeats, lengthBeats: loopLengthBeats };
}

// --- Count-in ---------------------------------------------------------------------------
function tickCountIn() {
  const now = Date.now();
  if (countInRemaining(countInAt, now, bpm, countInTotal) > 0) { publish(); return; }
  // Done. Start for real, at the position the count-in was counting in to.
  countingIn = false;
  beats = countInResumeBeats;
  startedAt = startedAtFor(beats, now, bpm);
  lastLoopCycle = null;
  running = true;
  bumpJump();
  publish(true);
}
export function isCountingIn() { return countingIn; }
export function countInBeatsLeft() {
  return countingIn ? countInRemaining(countInAt, Date.now(), bpm, countInTotal) : 0;
}
export function cancelCountIn() {
  if (!countingIn) return;
  countingIn = false;
  stopTimer();
  publish(true);
}
// Start after `bars` of count-in. Zero bars is an ordinary start, and following
// somebody else's clock there is nothing for us to count in to — the master
// decides when the music begins.
export function startTransportWithCountIn(bars, atBeat = null) {
  const total = countInBeats(bars, beatsPerBar);
  if (total <= 0 || source !== 'internal') { startTransport(atBeat); return; }
  countInResumeBeats = atBeat !== null ? Math.max(0, Number(atBeat) || 0) : beats;
  beats = countInResumeBeats;
  countInTotal = total;
  countInAt = Date.now();
  countingIn = true;
  running = false;
  ensureTimer();
  publish(true);
}

// --- Host playhead ------------------------------------------------------------------
// The DAW is authoritative and it hands us a POSITION (ppq — quarter notes since
// the song start). That is strictly better than counting MIDI clock pulses: a
// dropped pulse puts a counter permanently behind, a position cannot go stale
// that way. But the DAW only speaks ~30 times a second, so between updates we
// extrapolate with the same beatsAt() rule the internal clock uses, re-anchoring
// on every message. The readout is smooth and never more than one update out.
function hostBeatsAt(now) {
  if (!hostPlaying) return hostAnchorBeats;
  return hostAnchorBeats + beatsAt(hostAnchorAt, now, hostBpm ?? bpm);
}

export function applyHostTransport(payload) {
  const info = parseHostPosition(payload);
  const now = Date.now();
  if (!info || !info.ok) {
    // The host went quiet (offline render, or a wrapper with no playhead). Hold
    // the last position and drop the lock indicator — don't snap to zero, which
    // would look like a rewind nobody asked for.
    hostAvailable = false;
    hostAnchorBeats = hostBeatsAt(now);
    hostPlaying = false;
    if (source === 'host') { beats = hostAnchorBeats; running = false; publish(true); }
    return;
  }
  hostAvailable = true;
  if (info.bpm !== null) hostBpm = info.bpm;
  if (info.beatsPerBar !== null) setTransportSignature(info.beatsPerBar);

  if (info.beats !== null) {
    // Re-anchor on every report — the host's position IS the truth, and
    // extrapolation only fills the gap until the next one. But note whether
    // this was a JUMP (locate, loop wrap, rewind) rather than playing on,
    // because followers must not "catch up" through a jump: the Arp firing the
    // sixteen steps between bar 2 and bar 40 because someone moved the locator
    // is exactly the bug crossedSteps would otherwise produce.
    if (hostJumped(hostBeatsAt(now), info.beats)) bumpJump();
    hostAnchorBeats = info.beats;
    hostAnchorAt = now;
  } else if (info.playing && !hostPlaying) {
    hostAnchorAt = now;                    // playing with no position: free-run
  }
  hostPlaying = info.playing;

  if (source !== 'host') return;
  running = info.playing;
  if (hostBpm !== null) bpm = hostBpm;
  beats = hostBeatsAt(now);
  if (running) ensureTimer(); else stopTimer();
  publish(true);
}

function ensureHostListener() {
  if (hostListening) return;
  hostListening = true;
  // A no-op outside the exported plugin: onHostTransport returns an empty
  // unsubscriber when window.__JUCE__ isn't there, so the editor preview just
  // never sees an update and the component says so.
  onHostTransport((payload) => applyHostTransport(payload));
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
  clockOut = false; startedAt = 0; lastPulseBeats = 0; beatsPerBar = 4;
  hostAvailable = false; hostPlaying = false; hostAnchorBeats = 0; hostAnchorAt = 0; hostBpm = null;
  jumpSeq = 0;
  loopEnabled = false; loopStartBeats = 0; loopLengthBeats = 16; lastLoopCycle = null;
  countingIn = false; countInTotal = 0; countInAt = 0; countInResumeBeats = 0;
  publish(true);
}
