// Transport — the master clock. Everything time-based here used to run on its
// own steps-per-second: the Arp, the Looper, the Turing, the Kinetic, the
// Constellation wander. None could lock to anything, including each other.
//
// The one thing that matters in a clock is that it does not DRIFT. So position
// is always computed as `(now - startedAt) × tempo`, never accumulated tick by
// tick — a float you add to sixty times a second is a float that wanders, and
// clamping big frames (which every ticker here does) makes it wander faster.
// Recomputing from the start instant means a late frame produces a late
// reading, not a permanently wrong one.
//
// Jitter is a separate thing and we cannot fully win it: a browser timer is not
// a sample clock. What we can do is never LOSE an event — see crossedSteps.
// All pure: time comes in as an argument.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampNum(n, lo, hi) { const v = num(n, lo); return v < lo ? lo : v > hi ? hi : v; }
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }

export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const PPQN = 24;              // MIDI clock pulses per quarter note

// Note divisions, in BEATS per step (a beat = a quarter note).
export const DIVISIONS = {
  '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125,
  '1/2D': 3, '1/4D': 1.5, '1/8D': 0.75, '1/16D': 0.375,
  '1/2T': 4 / 3, '1/4T': 2 / 3, '1/8T': 1 / 3, '1/16T': 1 / 6,
};
export const DIVISION_IDS = Object.keys(DIVISIONS);
export const DIVISION_LABELS = {
  '1/1': 'Whole', '1/2': 'Half', '1/4': 'Quarter', '1/8': '8th', '1/16': '16th', '1/32': '32nd',
  '1/2D': 'Half ·', '1/4D': 'Quarter ·', '1/8D': '8th ·', '1/16D': '16th ·',
  '1/2T': 'Half T', '1/4T': 'Quarter T', '1/8T': '8th T', '1/16T': '16th T',
};
export function beatsPerStep(division) {
  return DIVISIONS[String(division)] ?? DIVISIONS['1/16'];
}

export const TRANSPORT_SOURCES = ['internal', 'external'];
export const TRANSPORT_SOURCE_LABELS = { internal: 'Internal', external: 'MIDI clock in' };

export function transportConfig(control) {
  return control?._children?.Transport ?? {};
}
export function transportBpm(control) { return clampNum(transportConfig(control).bpm ?? 120, MIN_BPM, MAX_BPM); }
export function transportSource(control) {
  const s = String(transportConfig(control).source ?? 'internal');
  return TRANSPORT_SOURCES.includes(s) ? s : 'internal';
}
export function transportSignature(control) {
  const cfg = transportConfig(control);
  return { beats: clampInt(cfg.beatsPerBar ?? 4, 1, 32), unit: clampInt(cfg.beatUnit ?? 4, 1, 32) };
}

// --- Position -------------------------------------------------------------------
// Beats elapsed since the start instant. NOT accumulated: this is the whole
// reason the transport exists rather than each component keeping its own phase.
export function beatsAt(startedAtMs, nowMs, bpm) {
  const elapsed = Math.max(0, num(nowMs, 0) - num(startedAtMs, 0));
  return (elapsed / 60000) * clampNum(bpm, MIN_BPM, MAX_BPM);
}
// The inverse — where the start instant must be for `beats` to read now. Used
// when the position is set by hand or by an external clock, so the same
// recompute-from-start rule keeps holding afterwards.
export function startedAtFor(beats, nowMs, bpm) {
  return num(nowMs, 0) - (num(beats, 0) / clampNum(bpm, MIN_BPM, MAX_BPM)) * 60000;
}
export function secondsPerBeat(bpm) { return 60 / clampNum(bpm, MIN_BPM, MAX_BPM); }

// Musical position for display: bars and beats count from 1, as musicians do.
export function barBeat(beats, signature = { beats: 4, unit: 4 }) {
  const perBar = Math.max(1, num(signature?.beats, 4));
  const b = Math.max(0, num(beats, 0));
  const bar = Math.floor(b / perBar) + 1;
  const beat = Math.floor(b % perBar) + 1;
  const tick = Math.floor(((b % 1) * PPQN));
  return { bar, beat, tick };
}
export function formatBarBeat(beats, signature = { beats: 4, unit: 4 }) {
  const { bar, beat, tick } = barBeat(beats, signature);
  return `${bar}.${beat}.${String(tick).padStart(2, '0')}`;
}

// --- Steps ----------------------------------------------------------------------
export function stepAtBeat(beats, division) {
  return Math.floor(Math.max(0, num(beats, 0)) / beatsPerStep(division));
}
// Which step boundaries were crossed between two readings. A stalled frame must
// FIRE the steps it slept through, not silently drop them — that's the
// difference between a stutter and a hole in the bar. Capped so that returning
// from a long stall (a backgrounded window, a breakpoint) doesn't dump hundreds
// of notes at once; the cap is reported so a caller can say it happened.
export function crossedSteps(prevBeats, nextBeats, division, maxSteps = 16) {
  const per = beatsPerStep(division);
  const from = Math.max(0, num(prevBeats, 0));
  const to = Math.max(0, num(nextBeats, 0));
  if (to <= from) return { steps: [], dropped: 0 };
  const first = Math.floor(from / per) + 1;
  const last = Math.floor(to / per);
  if (last < first) return { steps: [], dropped: 0 };
  const total = last - first + 1;
  const cap = Math.max(1, Math.round(num(maxSteps, 16)));
  const kept = Math.min(total, cap);
  const steps = [];
  // On an overrun keep the MOST RECENT steps: catching up to now matters more
  // than replaying where you were.
  for (let i = last - kept + 1; i <= last; i += 1) steps.push(i);
  return { steps, dropped: total - kept };
}
// --- Cycles -----------------------------------------------------------------
// For the components whose "rate" is really a LOOP LENGTH rather than a step:
// the Looper's take, the Constellation's wander. Expressed in bars, so the loop
// lines up with the bar line instead of merely running at the right speed.
export const MIN_BARS = 0.25;
export const MAX_BARS = 64;
export function cycleBeats(bars, beatsPerBar = 4) {
  return Math.max(0.01, clampNum(bars, MIN_BARS, MAX_BARS) * Math.max(1, num(beatsPerBar, 4)));
}
// Phase 0..1 through a cycle at a transport position. Same rule as everything
// else here: derived from the position, never accumulated, so a loop that has
// been running for an hour is still exactly on the bar line.
export function cyclePhaseAt(beats, bars, beatsPerBar = 4) {
  const len = cycleBeats(bars, beatsPerBar);
  return (((Math.max(0, num(beats, 0)) / len) % 1) + 1) % 1;
}
// How many whole cycles have completed — for anything that fires once a loop.
export function cycleCountAt(beats, bars, beatsPerBar = 4) {
  return Math.floor(Math.max(0, num(beats, 0)) / cycleBeats(bars, beatsPerBar));
}
// A bar count as a human string: "2 bars", "1/2 bar".
export function barsLabel(bars) {
  const b = clampNum(bars, MIN_BARS, MAX_BARS);
  if (b >= 1) return `${Number.isInteger(b) ? b : b.toFixed(2).replace(/0+$/, '')} bar${b === 1 ? '' : 's'}`;
  return `1/${Math.round(1 / b)} bar`;
}

// --- Musical time for continuous simulations ---------------------------------
// The Kinetic Modulator is an integrator, not a clock — there is no closed form
// to recompute its ball position from, so it cannot be made drift-free the way
// a phase can. What it CAN do is advance in musical time instead of wall-clock:
// a tempo change scales the motion, and a stopped transport freezes it. The
// reference tempo makes the sync a no-op at 120bpm, so turning it on doesn't
// silently change how an existing patch feels.
export const REFERENCE_BPM = 120;
export function musicalDelta(prevBeats, nextBeats, referenceBpm = REFERENCE_BPM) {
  const d = num(nextBeats, 0) - num(prevBeats, 0);
  if (!(d > 0)) return 0;
  return d * secondsPerBeat(referenceBpm);
}

// Swing: push every odd step later, by up to half a step.
export function swungBeatOffset(stepIndex, swing, division) {
  const s = clampNum(swing, 0, 1);
  const odd = Math.abs(Math.round(num(stepIndex, 0))) % 2 === 1;
  return odd ? s * 0.5 * beatsPerStep(division) : 0;
}

// --- MIDI realtime ----------------------------------------------------------------
// The bytes have always been arriving: splitMidiMessages already recognises
// 0xF8 and friends as single-byte messages, and every consumer so far has
// thrown them away because nothing wanted them.
export function transportEvent(message) {
  const b = Array.isArray(message) ? message[0] : message;
  switch (b) {
    case 0xF8: return { kind: 'clock' };
    case 0xFA: return { kind: 'start' };
    case 0xFB: return { kind: 'continue' };
    case 0xFC: return { kind: 'stop' };
    case 0xFF: return { kind: 'reset' };
    default: return null;
  }
}
// Clock pulses (24 PPQN) to send between two positions, for clock-OUT.
export function clockPulsesBetween(prevBeats, nextBeats) {
  const from = Math.floor(Math.max(0, num(prevBeats, 0)) * PPQN);
  const to = Math.floor(Math.max(0, num(nextBeats, 0)) * PPQN);
  return Math.max(0, to - from);
}
// Tempo from the gaps between incoming clock pulses. The MEDIAN, not the mean:
// one late pulse from a USB hiccup would drag an average around, and a wobbling
// BPM readout is worse than a slightly stale one.
export function estimateTempoFromPulses(intervalsMs) {
  const list = (Array.isArray(intervalsMs) ? intervalsMs : [])
    .map((v) => num(v, 0)).filter((v) => v > 0).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  const median = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  if (median <= 0) return null;
  return clampNum(60000 / (median * PPQN), MIN_BPM, MAX_BPM);
}

// Tap tempo. Taps more than `resetMs` apart start a new measurement rather than
// averaging across a pause — otherwise the first tap after a break poisons it.
export function tapTempo(timestamps, resetMs = 2000) {
  const list = (Array.isArray(timestamps) ? timestamps : []).map((v) => num(v, 0)).filter((v) => v > 0);
  if (list.length < 2) return null;
  const gaps = [];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const gap = list[i] - list[i - 1];
    if (gap <= 0 || gap > num(resetMs, 2000)) break;
    gaps.push(gap);
  }
  if (!gaps.length) return null;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return clampNum(60000 / mean, MIN_BPM, MAX_BPM);
}

// --- Geometry ---------------------------------------------------------------------
export function transportGeometry(width, height, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  return {
    x: p, y: p, w, h,
    buttonW: Math.min(46, Math.max(26, w * 0.18)),
    beatsY: p + h - 12,
  };
}
// The play/stop button's hit box (left of the readout).
export function transportButtonRect(geom) {
  return { x: geom.x, y: geom.y, w: geom.buttonW, h: geom.h };
}
export function hitTransportButton(geom, px, py) {
  const r = transportButtonRect(geom);
  const x = num(px, -1);
  const y = num(py, -1);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
