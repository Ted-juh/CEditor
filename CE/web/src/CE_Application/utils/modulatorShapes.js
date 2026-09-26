/**
 * The Performance modulators and pattern steps, as pictures you drag.
 *
 * Every curve here is the engine's own arithmetic (InstrumentHostService.cpp): an envelope's
 * `curve` bends each stage as progress ^ 4^curve, an LFO's shapes are the same six formulas, so
 * what the picture shows is what the host plays. The pictures are also the controls, so each
 * shape comes with the inverse: where a handle is dragged to, which setting that means.
 */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// ---- Envelopes -------------------------------------------------------------------------------

// Times are stored in milliseconds (0-60 s) and edited on a log scale: a linear one would make
// the useful first second almost impossible to set.
export const envelopeTimePosition = (milliseconds) =>
  Math.log10(clamp(Number(milliseconds) || 0, 0, 60000) + 1) / Math.log10(60001);
export const envelopeTimeFromPosition = (position) =>
  Math.round((60001 ** clamp(Number(position) || 0, 0, 1) - 1) / 5) * 5;

/** InstrumentHostService::shapeEnvelopeProgress. */
export function shapeEnvelopeProgress(progress, curve, falling) {
  const p = clamp(progress, 0, 1);
  const exponent = 4 ** clamp(Number(curve) || 0, -1, 1);
  return falling ? 1 - (1 - p) ** exponent : p ** exponent;
}

export function formatEnvelopeTime(milliseconds) {
  const ms = Math.max(0, Number(milliseconds) || 0);
  if (ms >= 10000) return `${Math.round(ms / 1000)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 5000 ? 1 : 2)} s`;
  return `${Math.round(ms)} ms`;
}

/**
 * The layout of the envelope picture, for a drawing `width` units wide and 124 high: each timed
 * stage may take up to `segment` wide, and the sustain is held for `hold`. The picture is as wide
 * as its card, so the stages get the room rather than empty bands either side.
 */
export function envelopeBox(width = 360) {
  const w = Math.max(200, Number(width) || 360);
  const hold = Math.max(30, Math.round(w * 0.12));
  return Object.freeze({ left: 10, top: 14, bottom: 112, height: 124, width: w, hold,
                         segment: Math.floor((w - 10 - hold - 16) / 3) });
}
export const ENVELOPE_BOX = envelopeBox(360);

export function envelopeGeometry(envelope, box = ENVELOPE_BOX) {
  const level = (value) => box.bottom - clamp(value, 0, 1) * (box.bottom - box.top);
  const sustain = clamp(Number(envelope.sustain) || 0, 0, 1);
  const attackX = box.left + envelopeTimePosition(envelope.attackMs) * box.segment;
  const decayX = attackX + envelopeTimePosition(envelope.decayMs) * box.segment;
  const holdX = decayX + box.hold;
  const releaseX = holdX + envelopeTimePosition(envelope.releaseMs) * box.segment;
  const curve = Number(envelope.curve) || 0;

  const points = [[box.left, box.bottom]];
  const sample = (from, to, valueAt) => {
    for (let i = 1; i <= 16; i += 1) points.push([from + ((to - from) * i) / 16, level(valueAt(i / 16))]);
  };
  sample(box.left, attackX, (p) => shapeEnvelopeProgress(p, curve, false));
  sample(attackX, decayX, (p) => 1 + (sustain - 1) * shapeEnvelopeProgress(p, curve, true));
  points.push([holdX, level(sustain)]);
  sample(holdX, releaseX, (p) => sustain * (1 - shapeEnvelopeProgress(p, curve, true)));
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // The bend handle sits halfway down the longer falling stage, on the curve itself.
  const onDecay = decayX - attackX >= releaseX - holdX;
  const bend = onDecay
    ? { x: (attackX + decayX) / 2, y: level(1 + (sustain - 1) * shapeEnvelopeProgress(0.5, curve, true)) }
    : { x: (holdX + releaseX) / 2, y: level(sustain * (1 - shapeEnvelopeProgress(0.5, curve, true))) };

  const progress = clamp(Number(envelope.stageProgress) || 0, 0, 1);
  const markerX = envelope.stage === 'attack' ? box.left + (attackX - box.left) * progress
    : envelope.stage === 'decay' ? attackX + (decayX - attackX) * progress
    : envelope.stage === 'sustain' ? (decayX + holdX) / 2
    : envelope.stage === 'release' ? holdX + (releaseX - holdX) * progress
    : box.left;

  return {
    path,
    attack: { x: attackX, y: box.top },
    decay: { x: decayX, y: level(sustain) },
    hold: { x: holdX, y: level(sustain) },
    release: { x: releaseX, y: box.bottom },
    bend,
    marker: { x: markerX, y: level(Number(envelope.value) || 0) },
  };
}

/**
 * What dragging a handle of the envelope picture to (x, y) sets. `geometry` is the picture as
 * it was when the drag began: each stage's time is measured from where the previous one ends.
 */
export function envelopeDragFields(handle, { x, y }, geometry, box = ENVELOPE_BOX) {
  const time = (from) => envelopeTimeFromPosition((x - from) / box.segment);
  if (handle === 'attack') return { attackMs: time(box.left) };
  if (handle === 'decay') {
    return {
      decayMs: time(geometry.attack.x),
      sustain: Math.round(clamp((box.bottom - y) / (box.bottom - box.top), 0, 1) * 100) / 100,
    };
  }
  if (handle === 'release') return { releaseMs: time(geometry.hold.x) };
  return {};
}

/**
 * The bend handle follows the pointer: dragged up, the falling stages linger high before they
 * drop (the curve bulges up with it) and the attack jumps up early; dragged down, the reverse.
 */
export function envelopeBendFromDrag(startCurve, deltaY) {
  return Math.round(clamp((Number(startCurve) || 0) + deltaY / 60, -1, 1) * 100) / 100;
}

// ---- LFOs ------------------------------------------------------------------------------------

export const LFO_SHAPES = Object.freeze([
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawUp', label: 'Saw up' },
  { value: 'sawDown', label: 'Saw down' },
  { value: 'square', label: 'Square' },
  { value: 'sampleHold', label: 'Sample & hold' },
]);

// Sample-and-hold holds one value per cycle, hashed from the LFO and the cycle number on the
// native side; the picture stands in with a fixed, recognisable sequence.
const HELD = [0.72, 0.28, 0.9, 0.46];

/** The shape of an LFO at phase 0..1, before its range (InstrumentHostService's six formulas). */
export function lfoShapeAt(shape, phase, cycle = 0) {
  const p = phase - Math.floor(phase);
  if (shape === 'triangle') return 1 - Math.abs(p * 2 - 1);
  if (shape === 'sawUp') return p;
  if (shape === 'sawDown') return 1 - p;
  if (shape === 'square') return p < 0.5 ? 0 : 1;
  if (shape === 'sampleHold') return HELD[((cycle % HELD.length) + HELD.length) % HELD.length];
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
}

/**
 * The LFO over `cycles` cycles of time, as an SVG path in a width × height box: the phase
 * offset shifts where the wave starts, and the minimum and maximum squeeze it, as they do in the
 * engine.
 */
export function lfoPath(lfo, width, height, { cycles = 2, pad = 4 } = {}) {
  const minimum = clamp(Number(lfo.minimum) || 0, 0, 1);
  const maximum = clamp(Number(lfo.maximum ?? 1), 0, 1);
  const offset = Number(lfo.phaseOffset) || 0;
  const y = (v) => pad + (1 - (minimum + v * (maximum - minimum))) * (height - pad * 2);
  const samples = 96 * cycles;
  const parts = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * cycles;
    const shifted = t + offset;
    const x = (i / samples) * width;
    const value = lfoShapeAt(lfo.shape, shifted, Math.floor(shifted));
    parts.push(`${i ? 'L' : 'M'}${x.toFixed(2)},${y(value).toFixed(2)}`);
  }
  return parts.join(' ');
}

/** A tiny waveform for a shape button, in a 24 × 14 box. */
export function lfoIconPath(shape) {
  return lfoPath({ shape, minimum: 0, maximum: 1, phaseOffset: shape === 'sine' ? 0.25 : 0 }, 24, 14, { cycles: 1, pad: 2 });
}

// ---- Rates -----------------------------------------------------------------------------------

export const SYNC_RATES = Object.freeze([
  { beats: 0.125, label: '1/32' },
  { beats: 1 / 6, label: '1/16T' },
  { beats: 0.25, label: '1/16' },
  { beats: 1 / 3, label: '1/8T' },
  { beats: 0.5, label: '1/8' },
  { beats: 2 / 3, label: '1/4T' },
  { beats: 1, label: '1/4' },
  { beats: 2, label: '1/2' },
  { beats: 4, label: '1 bar' },
  { beats: 8, label: '2 bars' },
  { beats: 16, label: '4 bars' },
]);

/** A free rate steps by ratio, not by a fixed amount: 0.05 Hz and 30 Hz both need fine steps. */
export function stepRateHz(hz, steps, fine = false, low = 0.01, high = 40) {
  const ratio = fine ? 1.01 : 1.06;
  const next = clamp((Number(hz) || low) * ratio ** steps, low, high);
  const digits = next < 1 ? 3 : next < 10 ? 2 : 1;
  return Number(next.toFixed(digits));
}

export const formatHz = (hz) => {
  const value = Number(hz) || 0;
  return value < 1 ? value.toFixed(value < 0.1 ? 3 : 2) : value < 10 ? value.toFixed(2) : value.toFixed(1);
};

// ---- Pattern step rows -----------------------------------------------------------------------

/**
 * The per-step values drawn as rows under a pattern lane. Each maps a bar height (0..1) to the
 * stored value and back. Length is split at one step: the lower half of the bar is 5-100% of a
 * step, the upper half 1-4 steps, since short notes are where the detail is.
 */
export const STEP_ROWS = Object.freeze({
  velocity: { field: 'velocity', label: 'Velocity', min: 1, max: 127,
    fromHeight: (h) => Math.max(1, Math.round(h * 127)), toHeight: (v) => v / 127,
    format: (v) => String(v) },
  gate: { field: 'gate', label: 'Length', min: 0.05, max: 4,
    fromHeight: (h) => Math.round((h <= 0.5 ? 0.05 + (h / 0.5) * 0.95 : 1 + ((h - 0.5) / 0.5) * 3) * 20) / 20,
    toHeight: (v) => (v <= 1 ? ((v - 0.05) / 0.95) * 0.5 : 0.5 + ((v - 1) / 3) * 0.5),
    format: (v) => (v === 1 ? '1 step' : v < 1 ? `${Math.round(v * 100)}%` : `${v} steps`) },
  probability: { field: 'probability', label: 'Chance', min: 0, max: 100,
    fromHeight: (h) => Math.round(h * 20) * 5, toHeight: (v) => v / 100,
    format: (v) => `${v}%` },
  microtiming: { field: 'microtiming', label: 'Nudge', min: -0.5, max: 0.5, bipolar: true,
    fromHeight: (h) => Math.round((h - 0.5) * 100) / 100, toHeight: (v) => v + 0.5,
    format: (v) => (v === 0 ? 'on time' : `${v > 0 ? 'late' : 'early'} ${Math.round(Math.abs(v) * 100)}%`) },
  ratchets: { field: 'ratchets', label: 'Ratchet', min: 1, max: 8,
    fromHeight: (h) => 1 + Math.round(h * 7), toHeight: (v) => (v - 1) / 7,
    format: (v) => (v === 1 ? 'once' : `×${v}`) },
});

/** Which rows a lane gets: notes and drums have the full set, a value lane only timing and chance. */
export const stepRowsFor = (laneType) => (laneType === 'cc' || laneType === 'parameter'
  ? ['probability', 'microtiming']
  : ['velocity', 'gate', 'probability', 'microtiming', 'ratchets']);

export function stepRowValue(row, height) {
  const spec = STEP_ROWS[row];
  return clamp(spec.fromHeight(clamp(height, 0, 1)), spec.min, spec.max);
}

export const stepRowHeight = (row, value) => clamp(STEP_ROWS[row].toHeight(Number(value)), 0, 1);
