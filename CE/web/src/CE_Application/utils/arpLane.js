/**
 * The arpeggiator's step lane: one column per step, one row per thing a step can do.
 *
 *   velocity  — how hard (0 = a rest). Empty = the velocities you played.
 *   repeats   — 1..4 hits inside the step (ratchets).
 *   tie       — hold into the next step (legato).
 *   octave    — -2..+2 octaves on this step.
 *   chance    — 0..100 % that the step plays.
 *   melody    — the drawn note per step, in "drawn" mode (degreePattern).
 *
 * The engine (ArpEngine) cycles each row on its own length. The editor keeps every row that
 * is in use the lane's length, which is what these helpers are for: they return the fields to
 * send, never mutate the slot.
 */

export const LANE_LENGTHS = [4, 8, 12, 16, 24, 32];

export const ROWS = {
  velocity: { field: 'velocityPattern', fallback: 100 },
  repeats: { field: 'ratchetPattern', fallback: 1 },
  tie: { field: 'tiePattern', fallback: 0 },
  octave: { field: 'octavePattern', fallback: 0 },
  chance: { field: 'chancePattern', fallback: 100 },
  melody: { field: 'degreePattern', fallback: -1 },
};

/** Steps per beat, named as the note value they are where there is one. */
export const RATE_CHOICES = [
  [1, '1/4'], [2, '1/8'], [3, '3/beat'], [4, '1/16'], [6, '6/beat'], [8, '1/32'], [12, '12/beat'], [16, '1/64'],
];

export const ARP_MODES = [
  { value: 'up', label: 'Up', shape: [1, 3, 5] },
  { value: 'down', label: 'Down', shape: [5, 3, 1] },
  { value: 'up-down', label: 'Up-down', shape: [1, 3, 5, 3] },
  { value: 'down-up', label: 'Down-up', shape: [5, 3, 1, 3] },
  { value: 'order', label: 'As played', shape: [3, 1, 5] },
  { value: 'random', label: 'Random', shape: [3, 5, 1, 4] },
  { value: 'chord', label: 'Chord', shape: null },
  { value: 'pattern', label: 'Drawn', shape: [1, 4, 2, 5, 3] },
];

/** The lane's length: the longest row in use, else 16. */
export function laneLength(arp) {
  const lengths = Object.values(ROWS).map(({ field }) => (arp?.[field] ?? []).length);
  return Math.max(...lengths) || 16;
}

/** Every row in use, stretched or cut to `length`. Unused rows stay empty (plain). */
export function resizeLane(arp, length) {
  const out = {};
  for (const { field, fallback } of Object.values(ROWS)) {
    const row = arp?.[field] ?? [];
    if (row.length > 0) out[field] = Array.from({ length }, (_, i) => row[i] ?? fallback);
  }
  return out;
}

/** One cell of one row set; a row not yet in use starts at the lane's length. */
export function setLaneCell(arp, rowName, step, value) {
  const { field, fallback } = ROWS[rowName];
  const length = laneLength(arp);
  const row = (arp?.[field] ?? []).length > 0 ? [...arp[field]] : Array.from({ length }, () => fallback);
  row[step] = value;
  return { [field]: row };
}

/** What a click on a cell steps to, per row. */
export const nextRepeats = (n) => (n % 4) + 1;
export const nextOctave = (o) => (o === 2 ? -2 : o + 1);
export const nextChance = (c) => (c >= 100 ? 75 : c >= 75 ? 50 : c >= 50 ? 25 : 100);

/** Clears every lane row back to plain, keeping the mode, rate and the rest. */
export const clearLane = () => Object.fromEntries(Object.values(ROWS).map(({ field }) => [field, []]));

/** Starting points, written for this app from common arpeggiator practice. Each is the whole
    lane plus, where it matters, the mode, the rate and the feel. */
export const ARP_PATTERNS = [
  { id: 'plain', label: 'Plain 16ths', title: 'Every step the same: the lane cleared',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight' } },
  { id: 'trance', label: 'Trance gate', title: 'Chopped sixteenths with gaps',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      velocityPattern: [120, 0, 90, 0, 120, 0, 90, 90, 120, 0, 90, 0, 120, 90, 0, 90] } },
  { id: 'accents', label: 'Accents on the beat', title: 'Loud on each beat, softer between',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      velocityPattern: [120, 70, 85, 70, 115, 70, 85, 70, 120, 70, 85, 70, 115, 70, 85, 70] } },
  { id: 'alberti', label: 'Alberti', title: 'Low, high, middle, high: the classical left hand',
    fields: { ...clearLane(), mode: 'pattern', patternSemitones: false, stepsPerBeat: 4, feel: 'straight',
      degreePattern: [0, 2, 1, 2, 0, 2, 1, 2] } },
  { id: 'broken', label: 'Broken chord', title: 'Up through the chord and back, in two octaves',
    fields: { ...clearLane(), mode: 'pattern', patternSemitones: false, stepsPerBeat: 4, feel: 'straight', octaves: 2,
      degreePattern: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3] } },
  { id: 'rolls', label: 'Rolls', title: 'Repeats building up to the next bar',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      ratchetPattern: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 3, 4],
      velocityPattern: [110, 70, 80, 70, 100, 70, 80, 75, 105, 75, 85, 80, 95, 100, 110, 120] } },
  { id: 'octaves', label: 'Octave bounce', title: 'Every other step jumps up an octave',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      octavePattern: [0, 1, 0, 1, 0, 1, 0, 1] } },
  { id: 'three', label: '3 against 4', title: 'An accent every third step over a four-step beat',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      velocityPattern: [120, 60, 60, 115, 60, 60, 115, 60, 60, 115, 60, 60] } },
  { id: 'legato', label: 'Legato line', title: 'Tied pairs for a gliding mono line',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      tiePattern: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] } },
  { id: 'loose', label: 'Loose', title: 'Some steps only sometimes: a pattern that breathes',
    fields: { ...clearLane(), stepsPerBeat: 4, feel: 'straight',
      chancePattern: [100, 50, 75, 50, 100, 25, 75, 50, 100, 50, 75, 25, 100, 50, 75, 75] } },
  { id: 'triplets', label: 'Triplets', title: 'Eighth-note triplets, accent on each beat',
    fields: { ...clearLane(), stepsPerBeat: 2, feel: 'triplet', velocityPattern: [120, 75, 75] } },
];
