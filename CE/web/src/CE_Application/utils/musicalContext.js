// musicalContext.js — one key and scale the whole panel plays in.
//
// THE SYSTEMIC PIECE the chord-generator design flagged: note-aware components each need a key and
// a scale, and without a shared one they drift apart. A chord generator building diatonic chords, a
// pad grid laying out a scale-locked keyboard, a note ribbon highlighting in-key notes and an
// arpeggiator quantising its output should all change key TOGETHER — one control moves and the
// whole panel re-harmonises. That is a capability, not a component.
//
// PURE, and deliberately so: this is intervals and modular arithmetic, and every consumer is either
// a renderer or a runtime that should not be dragged in to test it.
//
// TWELVE-TONE, and it says so. Microtonal and non-12-TET are real and are not here; a `scale` is an
// interval set within an octave of twelve semitones, and pretending otherwise by leaving the
// assumption implicit is how a future 24-TET attempt would find it everywhere at once.

/** Semitone offsets from the root, within one octave. */
export const SCALES = {
  chromatic:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:   [0, 2, 3, 5, 7, 9, 11],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  phrygian:       [0, 1, 3, 5, 7, 8, 10],
  lydian:         [0, 2, 4, 6, 7, 9, 11],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  locrian:        [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues:          [0, 3, 5, 6, 7, 10],
  wholeTone:      [0, 2, 4, 6, 8, 10],
};

export const SCALE_LABELS = {
  chromatic: 'Chromatic', major: 'Major', minor: 'Natural minor',
  harmonicMinor: 'Harmonic minor', melodicMinor: 'Melodic minor',
  dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian',
  mixolydian: 'Mixolydian', locrian: 'Locrian',
  pentatonicMajor: 'Pentatonic major', pentatonicMinor: 'Pentatonic minor',
  blues: 'Blues', wholeTone: 'Whole tone',
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_MUSICAL_CONTEXT = { root: 0, scale: 'major', enabled: true };

/** Root as a number 0–11, from a number or a note name. Anything unreadable is C. */
export function rootFrom(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return ((Math.round(value) % 12) + 12) % 12;
  const text = String(value ?? '').trim().toUpperCase().replace('♯', '#').replace('♭', 'b');
  const direct = NOTE_NAMES.indexOf(text);
  if (direct >= 0) return direct;
  // Flats, which a user will type and which no lookup table above carries.
  const flats = { DB: 1, EB: 3, GB: 6, AB: 8, BB: 10 };
  return flats[text.toUpperCase()] ?? 0;
}

/** The interval set for a scale name, or a custom array. Unknown names fall back to chromatic. */
export function intervalsFor(scale) {
  if (Array.isArray(scale)) {
    const cleaned = [...new Set(scale.map((n) => ((Math.round(Number(n)) % 12) + 12) % 12))].sort((a, b) => a - b);
    return cleaned.length ? cleaned : SCALES.chromatic;
  }
  return SCALES[String(scale ?? '')] ?? SCALES.chromatic;
}

/** Normalise whatever a panel or a control carries into a usable context. */
export function normalizeContext(context) {
  return {
    root: rootFrom(context?.root ?? 0),
    scale: Array.isArray(context?.scale) ? context.scale : String(context?.scale ?? 'major'),
    enabled: context?.enabled !== false,
  };
}

/** Is this MIDI note in the key? A disabled context puts everything in it. */
export function isInScale(note, context) {
  const { root, scale, enabled } = normalizeContext(context);
  if (!enabled) return true;
  const pitchClass = ((Math.round(Number(note)) - root) % 12 + 12) % 12;
  return intervalsFor(scale).includes(pitchClass);
}

/**
 * Move a note to the nearest note in the key.
 *
 * Ties go DOWN, deliberately and consistently. A note exactly between two scale tones has to go
 * somewhere, and an arbitrary choice made the same way every time is a musical decision a player
 * can learn; one made differently depending on which way they approached it is a bug they cannot.
 */
export function quantizeToScale(note, context) {
  const { root, scale, enabled } = normalizeContext(context);
  const target = Math.round(Number(note));
  if (!enabled || !Number.isFinite(target)) return target;

  const intervals = intervalsFor(scale);
  if (intervals.length === 12) return target;

  for (let distance = 0; distance <= 6; distance += 1) {
    for (const candidate of distance === 0 ? [target] : [target - distance, target + distance]) {
      if (isInScale(candidate, { root, scale, enabled })) return candidate;
    }
  }
  return target;
}

/** The MIDI notes of the scale across an octave starting at `from`. */
export function scaleDegrees(context, from = 60, count = null) {
  const { root, scale } = normalizeContext(context);
  const intervals = intervalsFor(scale);
  const base = Math.round(Number(from));
  const wanted = count ?? intervals.length;

  const notes = [];
  for (let i = 0; i < wanted; i += 1) {
    const octave = Math.floor(i / intervals.length);
    notes.push(base + root + intervals[i % intervals.length] + octave * 12);
  }
  return notes;
}

/** Chord shapes, as scale-degree steps from the chord's own root degree. */
export const CHORD_SHAPES = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
  ninth: [0, 2, 4, 6, 8],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
  power: [0, 4],
};

/**
 * The diatonic chord on a scale degree.
 *
 * Built by STACKING SCALE DEGREES rather than fixed semitone intervals, which is what makes it
 * diatonic: degree ii of a major scale comes out minor and degree vii diminished without either
 * being written down anywhere. Change the scale and the qualities change with it, which is the
 * whole point of a shared context.
 */
export function diatonicChord(degree, context, { shape = 'triad', octave = 60 } = {}) {
  const { root, scale } = normalizeContext(context);
  const intervals = intervalsFor(scale);
  const steps = CHORD_SHAPES[shape] ?? CHORD_SHAPES.triad;
  const start = Math.round(Number(degree)) || 0;

  return steps.map((step) => {
    const index = start + step;
    const wrapped = ((index % intervals.length) + intervals.length) % intervals.length;
    const octaveShift = Math.floor(index / intervals.length) * 12;
    return octave + root + intervals[wrapped] + octaveShift;
  });
}

/** A readable name for the current key, for a label or a log line. */
export function contextLabel(context) {
  const { root, scale } = normalizeContext(context);
  const name = Array.isArray(scale) ? 'Custom' : (SCALE_LABELS[scale] ?? scale);
  return `${NOTE_NAMES[root]} ${name}`;
}
