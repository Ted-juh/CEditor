// Arpeggiator — the second member of the "plays the synth" family. It takes a set
// of held notes (its own chord, or the notes a linked Chord Pad is holding) and
// walks them one at a time on the clock: up / down / up-down / as-played /
// random / block-chord, spread across octaves, with a gate length, swing, and an
// optional Euclidean rest pattern. Reuses the Chord Pad's scale engine for its
// own chord and its note-output path to sound. Pure sequencing math + geometry —
// randomness and time come in as arguments, so it's all unit-tested.
import { SCALES, degreeChord, chordNotes, useFlats, noteName } from './chordPadLayout.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
const wrap01 = (n) => ((num(n, 0) % 1) + 1) % 1;

export const ARP_SOURCES = ['chord', 'link', 'input'];
export const ARP_SOURCE_LABELS = {
  chord: 'Its own chord', link: 'A linked Chord Pad', input: 'Incoming MIDI notes',
};
export const ARP_PATTERNS = ['up', 'down', 'updown', 'downup', 'asPlayed', 'random', 'chord'];
export const ARP_PATTERN_LABELS = {
  up: 'Up', down: 'Down', updown: 'Up–Down', downup: 'Down–Up',
  asPlayed: 'As played', random: 'Random', chord: 'Chord (block)',
};

export function arpConfig(control) {
  return control?._children?.Arp ?? {};
}
export function arpPattern(control) {
  const p = String(arpConfig(control).pattern ?? 'up');
  return ARP_PATTERNS.includes(p) ? p : 'up';
}
export function arpPhase(control) {
  const cfg = arpConfig(control);
  return wrap01(cfg.__phase !== undefined ? cfg.__phase : cfg.phase);
}
export function arpRate(control) { return Math.max(0.1, num(arpConfig(control).rate, 6)); }   // steps/sec
export function arpVelocity(control) { return clampInt(arpConfig(control).velocity ?? 96, 1, 127); }
export function arpChannel(control) { return clampInt(arpConfig(control).channel ?? 1, 1, 16); }

export function arpSource(control) {
  const s = String(arpConfig(control).source ?? 'chord');
  return ARP_SOURCES.includes(s) ? s : 'chord';
}
// Sources whose notes are injected from outside rather than computed here.
export function arpSourceIsExternal(control) { return arpSource(control) !== 'chord'; }

// The base note set: the Arp's own chord (key/scale/degree), or notes injected
// as __sourceNotes — from a linked Chord Pad, or from the hardware MIDI input.
export function arpBaseNotes(control) {
  const cfg = arpConfig(control);
  if (arpSourceIsExternal(control)) {
    const live = Array.isArray(cfg.__sourceNotes) ? cfg.__sourceNotes : [];
    return [...new Set(live.map((n) => clampInt(n, 0, 127)))].sort((a, b) => a - b);
  }
  const keyPc = clampInt(cfg.key ?? 0, 0, 11);
  const scale = SCALES[String(cfg.scale ?? 'minor')] ?? SCALES.minor;
  const degree = clampInt(cfg.degree ?? 0, 0, Math.max(0, scale.length - 1));
  const size = String(cfg.chordType ?? 'triad') === 'seventh' ? 4 : 3;
  const ch = degreeChord(keyPc, scale, degree, size, useFlats(keyPc, String(cfg.scale ?? 'minor')));
  if (!ch) return [];
  return chordNotes(keyPc, ch.offsets, { baseOctave: clampInt(cfg.baseOctave ?? 3, -1, 8) });
}

// Repeat the note set upward across `octaves` (1 = just the chord).
export function expandOctaves(notes, octaves = 1) {
  const base = (Array.isArray(notes) ? notes : []).map((n) => clampInt(n, 0, 127)).sort((a, b) => a - b);
  const oc = clampInt(octaves, 1, 4);
  const out = [];
  for (let o = 0; o < oc; o += 1) for (const n of base) { const v = n + o * 12; if (v <= 127) out.push(v); }
  return out;
}

// Order the expanded notes into the walk the pattern describes. Each STEP is an
// array of notes (one note normally; the whole chord in 'chord' mode), so every
// pattern shares one shape.
export function orderNotes(notes, pattern) {
  const asc = (Array.isArray(notes) ? notes : []).slice();
  if (!asc.length) return [];
  switch (String(pattern)) {
    case 'down': return asc.slice().reverse().map((n) => [n]);
    case 'updown': {
      const mid = asc.slice(1, -1).reverse();       // don't repeat the endpoints
      return [...asc, ...mid].map((n) => [n]);
    }
    case 'downup': {
      const desc = asc.slice().reverse();
      const mid = desc.slice(1, -1).reverse();
      return [...desc, ...mid].map((n) => [n]);
    }
    case 'chord': return [asc.slice()];             // one step: the whole chord
    case 'asPlayed':
    case 'random':
    case 'up':
    default: return asc.map((n) => [n]);
  }
}

// The full step sequence for a control given its base notes.
export function arpSequence(control, baseNotes) {
  const cfg = arpConfig(control);
  return orderNotes(expandOctaves(baseNotes, cfg.octaves ?? 1), arpPattern(control));
}

// --- Euclidean rest pattern (Bjorklund): `pulses` hits spread over `steps` ----
export function euclid(steps, pulses, rotation = 0) {
  const n = clampInt(steps, 1, 64);
  const k = clampInt(pulses, 0, n);
  if (k <= 0) return new Array(n).fill(false);
  if (k >= n) return new Array(n).fill(true);
  // Bresenham-style spread — the standard, stable Euclidean rhythm.
  const out = new Array(n).fill(false);
  let bucket = 0;
  for (let i = 0; i < n; i += 1) {
    bucket += k;
    if (bucket >= n) { bucket -= n; out[i] = true; }
  }
  const rot = ((Math.round(num(rotation, 0)) % n) + n) % n;
  return out.slice(rot).concat(out.slice(0, rot));
}
// Does step `i` fire? A hand-muted step never fires; otherwise the Euclidean
// mask decides (when it's enabled).
export function stepFires(control, i) {
  const cfg = arpConfig(control);
  const mutes = Array.isArray(cfg.mutes) ? cfg.mutes : [];
  if (mutes.includes(Math.round(num(i, 0)))) return false;
  if (cfg.euclidEnabled !== true) return true;
  const mask = euclid(cfg.euclidSteps ?? 8, cfg.euclidPulses ?? 5, cfg.euclidRotate ?? 0);
  return mask.length ? mask[((Math.round(num(i, 0)) % mask.length) + mask.length) % mask.length] : true;
}

// The step index at a phase, for a sequence of `length` steps.
export function stepIndexAt(phase, length) {
  const n = Math.max(1, Math.round(num(length, 1)));
  return Math.min(n - 1, Math.floor(wrap01(phase) * n));
}
// Swing: delay every ODD step by up to half a step (0 = straight, 1 = max shuffle).
export function swingDelay(stepIndex, swing, stepSeconds) {
  const s = clamp01(num(swing, 0));
  const odd = Math.abs(Math.round(num(stepIndex, 0))) % 2 === 1;
  return odd ? s * 0.5 * Math.max(0, num(stepSeconds, 0)) : 0;
}
// How long a note sounds: a fraction of the step (gate 1 = legato, tied).
export function gateSeconds(control, stepSeconds) {
  const g = clamp01(num(arpConfig(control).gate, 0.6));
  return Math.max(0.01, g * Math.max(0.01, num(stepSeconds, 0.1)));
}
export function stepSeconds(control) { return 1 / arpRate(control); }

// Toggle a hand-mute on step `i`, returning the new mute list (pure).
export function toggleMute(control, i) {
  const cfg = arpConfig(control);
  const idx = Math.round(num(i, 0));
  const mutes = (Array.isArray(cfg.mutes) ? cfg.mutes : []).map((m) => Math.round(num(m, 0)));
  return mutes.includes(idx) ? mutes.filter((m) => m !== idx) : [...mutes, idx].sort((a, b) => a - b);
}

// Should this control spell with flats? Keyed off its own key/scale (link mode
// has no key of its own, so it follows the same default as the Chord Pad).
export function arpUseFlats(control) {
  const cfg = arpConfig(control);
  return useFlats(clampInt(cfg.key ?? 0, 0, 11), String(cfg.scale ?? 'minor'));
}
// "C4" / "E♭3" for a MIDI note number.
export function midiNoteLabel(note, flats = false) {
  const m = clampInt(note, 0, 127);
  return `${noteName(((m % 12) + 12) % 12, flats)}${Math.floor(m / 12) - 1}`;
}

// --- Geometry: a lane of step cells ------------------------------------------
export function arpGeometry(width, height, count, pad = 8, headerH = 26) {
  const p = Math.max(0, num(pad, 8));
  const y0 = p + Math.max(0, num(headerH, 0));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - y0 - p);
  const n = Math.max(1, Math.round(num(count, 1)));
  const gap = n > 16 ? 1 : 3;
  return { x0: p, y0, w, h, count: n, gap, cellW: Math.max(2, (w - gap * (n - 1)) / n) };
}
export function arpCell(geom, i) {
  return { x: geom.x0 + i * (geom.cellW + geom.gap), y: geom.y0, w: geom.cellW, h: geom.h };
}
export function arpCellAt(geom, px, count) {
  const n = Math.max(1, Math.round(num(count, geom.count)));
  for (let i = 0; i < n; i += 1) {
    const c = arpCell(geom, i);
    if (px >= c.x && px <= c.x + c.w) return i;
  }
  return -1;
}
