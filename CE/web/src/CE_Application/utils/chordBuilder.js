/**
 * The Chords module's arithmetic, in the browser: the shapes the builder offers, what the
 * engine plays for a key (MidiFxChain.h — shapes, diatonic stacking, voicing, bass, the
 * follow range and the key map), and a name for any set of notes.
 *
 * The engine is the authority. These mirror it so the editor can draw what you will hear,
 * and test/chordBuilder.test.js pins the two together on the cases the C++ tests use.
 */
import { applySmartChordVoicing } from '../stores/instrumentHost.js';

/** The host's scales (PatternModel.cpp scaleTable), by the names the native side uses. */
export const HOST_SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'pentatonic major': [0, 2, 4, 7, 9],
  'pentatonic minor': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  'whole tone': [0, 2, 4, 6, 8, 10],
};

/** Every shape the builder and the follow layer offer. `id` is the engine's name for it. */
export const CHORD_SHAPES = [
  { id: 'triad', label: 'maj', intervals: [0, 4, 7], title: 'Major triad' },
  { id: 'minor', label: 'min', intervals: [0, 3, 7], title: 'Minor triad' },
  { id: 'seventh', label: '7', intervals: [0, 4, 7, 10], title: 'Dominant seventh' },
  { id: 'maj7', label: 'maj7', intervals: [0, 4, 7, 11], title: 'Major seventh' },
  { id: 'm7', label: 'm7', intervals: [0, 3, 7, 10], title: 'Minor seventh' },
  { id: 'sus2', label: 'sus2', intervals: [0, 2, 7], title: 'Suspended second' },
  { id: 'sus4', label: 'sus4', intervals: [0, 5, 7], title: 'Suspended fourth' },
  { id: '6', label: '6', intervals: [0, 4, 7, 9], title: 'Major sixth' },
  { id: 'add9', label: 'add9', intervals: [0, 4, 7, 14], title: 'Major with an added ninth' },
  { id: '9', label: '9', intervals: [0, 4, 7, 10, 14], title: 'Dominant ninth' },
  { id: 'dim', label: 'dim', intervals: [0, 3, 6], title: 'Diminished triad' },
  { id: 'aug', label: 'aug', intervals: [0, 4, 8], title: 'Augmented triad' },
  { id: 'm7b5', label: 'm7♭5', intervals: [0, 3, 6, 10], title: 'Half-diminished seventh' },
  { id: 'power fifth', label: '5', intervals: [0, 7], title: 'Power chord: root and fifth' },
  { id: 'octave', label: '8ve', intervals: [0, 12], title: 'Root doubled an octave up' },
];

/** Shapes that only make sense following a key: the chord that belongs to each degree. */
export const DIATONIC_SHAPES = [
  { id: 'diatonic', label: 'in key', title: 'The chord of each scale degree: D in C major plays D minor' },
  { id: 'diatonic 7th', label: 'in key 7', title: 'The seventh chord of each scale degree' },
];

// The old first-inversion shape still exists in saves; it has no tile, only a label.
const LEGACY_SHAPES = { 'triad (1st inv)': [0, 3, -5] };

export const shapeLabel = (id) =>
  [...CHORD_SHAPES, ...DIATONIC_SHAPES].find((s) => s.id === id)?.label
  ?? (id === 'triad (1st inv)' ? '1st inv' : id);

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const pc = (n) => ((n % 12) + 12) % 12;
export const noteLabel = (n) => `${NOTE_NAMES[pc(n)]}${Math.floor(n / 12) - 1}`;
const clampNote = (n) => Math.max(0, Math.min(127, n));

const scaleMaskOf = (scaleType, root) => {
  const degrees = HOST_SCALES[scaleType];
  if (!degrees) return null;
  return new Set(degrees.map((d) => pc(d + root)));
};

/** The engine's scaleStepsUp: walk `steps` scale tones above `note`. */
const scaleStepsUp = (note, steps, mask) => {
  let n = note;
  for (let s = 0; s < steps; s += 1)
    for (let i = 1; i <= 12; i += 1)
      if (n + i <= 127 && mask.has(pc(n + i))) { n += i; break; }
  return n;
};

/** The engine's constrainNoteToScale: nearest scale tone, ties upward. */
const constrainToMask = (note, mask) => {
  if (!mask || mask.size === 12) return note;
  for (let d = 0; d <= 12; d += 1) {
    if (note + d <= 127 && mask.has(pc(note + d))) return note + d;
    if (note - d >= 0 && mask.has(pc(note - d))) return note - d;
  }
  return note;
};

/** The notes one shape plays on `root`, before any voicing. MidiFxChain::chordNotes. */
export function shapeNotes(shape, root, { scaleType = 'major', scaleRoot = 0 } = {}) {
  const fixed = CHORD_SHAPES.find((s) => s.id === shape)?.intervals ?? LEGACY_SHAPES[shape];
  if (fixed) return fixed.map((i, index) => (index === 0 ? root : clampNote(root + i)));
  if (shape === 'diatonic' || shape === 'diatonic 7th') {
    const seventh = shape === 'diatonic 7th';
    const mask = scaleMaskOf(scaleType, scaleRoot);
    if (!mask || mask.size === 12)
      return (seventh ? [0, 4, 7, 10] : [0, 4, 7]).map((i) => clampNote(root + i));
    const degreeRoot = constrainToMask(root, mask);
    const notes = [degreeRoot, scaleStepsUp(degreeRoot, 2, mask), scaleStepsUp(degreeRoot, 4, mask)];
    if (seventh) notes.push(scaleStepsUp(degreeRoot, 6, mask));
    return notes;
  }
  return [root];
}

/** A chord the builder makes: the shape on its root, inverted and voiced, a bass under it. */
export function buildChord({ root = 60, quality = 'triad', inversion = 0, voicing = 'close', bass = false } = {}) {
  let notes = shapeNotes(quality, root);
  if (notes.length > 1) notes = applySmartChordVoicing(notes, { inversion, voicing });
  notes = [...notes].sort((a, b) => a - b);
  if (bass && root - 12 >= 0 && notes.length < 6) notes.unshift(root - 12);
  return notes.slice(0, 6);
}

/** What the module plays for one key, the way MidiFxChain::process decides it (without the
    voice-leading history, which depends on what was played before). Transpose and the scale
    fold are the other modules' business; this is the chord stage on its own. */
export function chordForKey(fx, key) {
  const mapping = fx.chordKeyMap ? fx.keyMap.find((m) => m.key === key) : null;
  const mapped = mapping ? fx.chordSet[mapping.chord] : null;
  if (mapped && mapped.notes.length > 0) return { source: 'map', notes: [...mapped.notes] };
  const follows = fx.chordFollow && fx.chord !== 'off' && fx.chord !== 'custom keys'
    && key >= fx.chordFollowLow && key <= fx.chordFollowHigh;
  if (!follows) return { source: 'plain', notes: [key] };
  let notes = shapeNotes(fx.chord, key, fx);
  if (notes.length < 2) return { source: 'plain', notes };
  const bassNote = notes[0] - 12;
  if (fx.chordInversion !== 0 || fx.chordVoicing !== 'close')
    notes = applySmartChordVoicing(notes, { inversion: fx.chordInversion, voicing: fx.chordVoicing });
  if (fx.chordBass && notes.length < 6 && bassNote >= 0) notes = [...notes, bassNote];
  return { source: 'follow', notes };
}

// Chord names by the interval set above the root, simplest first so a plain triad is never
// called something exotic.
const NAMED = [
  [[0, 4, 7], ''], [[0, 3, 7], 'm'], [[0, 7], '5'], [[0, 4, 7, 10], '7'],
  [[0, 4, 7, 11], 'maj7'], [[0, 3, 7, 10], 'm7'], [[0, 2, 7], 'sus2'], [[0, 5, 7], 'sus4'],
  [[0, 4, 7, 9], '6'], [[0, 3, 7, 9], 'm6'], [[0, 2, 4, 7], 'add9'], [[0, 2, 3, 7], 'madd9'],
  [[0, 2, 4, 7, 10], '9'], [[0, 2, 4, 7, 11], 'maj9'], [[0, 2, 3, 7, 10], 'm9'],
  [[0, 3, 6], 'dim'], [[0, 4, 8], 'aug'], [[0, 3, 6, 10], 'm7♭5'], [[0, 3, 6, 9], 'dim7'],
  [[0, 5, 7, 10], '7sus4'], [[0, 3, 7, 11], 'm(maj7)'],
];
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A name for any notes: "Cm7", "F/C", or the note names when it is not a chord we know. */
export function chordName(notes) {
  const sorted = [...new Set((notes ?? []).map(Number))].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  const classes = [...new Set(sorted.map(pc))];
  if (classes.length === 1) return NOTE_NAMES[classes[0]];
  const bass = pc(sorted[0]);
  // The bass first: a chord is named from its lowest note when that works.
  const roots = [bass, ...classes.filter((c) => c !== bass)];
  for (const root of roots) {
    const intervals = [...new Set(classes.map((c) => pc(c - root)))].sort((a, b) => a - b);
    const hit = NAMED.find(([set]) => sameSet(set.map(pc).sort((a, b) => a - b), intervals));
    if (hit) return `${NOTE_NAMES[root]}${hit[1]}${root === bass ? '' : `/${NOTE_NAMES[bass]}`}`;
  }
  return sorted.map((n) => NOTE_NAMES[pc(n)]).join('·');
}

/** The chords of a key, one per degree, as set entries: what "fill from the key" adds. */
export function chordsOfKey(scaleType, scaleRoot, { seventh = false, octave = 4 } = {}) {
  const degrees = HOST_SCALES[scaleType];
  if (!degrees || degrees.length !== 7) return [];
  const base = (octave + 1) * 12 + scaleRoot;
  return degrees.map((d) => {
    const notes = shapeNotes(seventh ? 'diatonic 7th' : 'diatonic', base + d, { scaleType, scaleRoot });
    // Say which builder shape it is, so the builder can edit it like one it made.
    const quality = CHORD_SHAPES.find((s) => sameSet(s.intervals, notes.map((n) => n - notes[0])))?.id ?? '';
    return { name: '', notes, root: notes[0], quality, inversion: 0, voicing: 'close', bass: false };
  });
}

/** removeSetChord's mirror: the set without chord `index`, and the key map renumbered. */
export function withoutSetChord(fx, index) {
  const chordSet = fx.chordSet.filter((_, i) => i !== index);
  const keyMap = fx.keyMap
    .filter((m) => m.chord !== index)
    .map((m) => (m.chord > index ? { ...m, chord: m.chord - 1 } : m));
  return { chordSet, keyMap };
}

/** mapKey's mirror: `key` points at `chord` (or at nothing, for -1). */
export function withKeyMapped(fx, key, chord) {
  const keyMap = fx.keyMap.filter((m) => m.key !== key);
  if (chord >= 0 && chord < fx.chordSet.length) keyMap.push({ key, chord });
  return keyMap.sort((a, b) => a.key - b.key);
}
