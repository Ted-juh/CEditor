// musicTheory.js — the interval tables ce.music is built on, in one place.
//
// These live here rather than in each prelude for the reason phase 7 taught: twelve scales and
// twenty chords, hand-copied into Lua, JavaScript, Python and the WebView, is a lot of chances to
// mistype a number — and a mistyped INTERVAL is silent. It does not fail to load or raise a missing
// name; it just plays a wrong note, in one runtime, in one scale, and the panel sounds subtly off
// in the exported plugin and fine in the editor.
//
// So the tables are data, `tools/scripts/gen-script-modules.mjs` emits them into all three C++
// preludes, and the WebView imports them directly. The three verbs built on top are small enough to
// write once per language, and the cross-engine tests pin their answers to the same fixtures.
//
// SCALES is re-exported from the Chord Pad's own table rather than restated. A script asking for
// "dorian" and a Chord Pad set to "dorian" have to mean the same seven notes, and the only way to
// guarantee that is for there to be one table.

import {
  SCALES, NOTE_SHARP, NOTE_FLAT, FLAT_KEY_PCS, MINOR_ISH, QUALITY_SUFFIX, ROMAN, MINOR_QUALITIES,
} from '../utils/chordPadLayout.js';

export { SCALES, NOTE_SHARP, NOTE_FLAT, FLAT_KEY_PCS, QUALITY_SUFFIX, ROMAN };

/**
 * The tables the Chord Pad and the Harmoniser SPELL and NAME with, re-exported for the same reason
 * SCALES is: a script asking "how does this key spell its third" and the panel printing that third
 * have to agree, and the only way to guarantee agreement is one table.
 *
 * Sets do not survive the trip into a Lua/JS/Python prelude, so the two membership tests are
 * emitted as sorted name LISTS. They stay Sets here because that is what the app uses them as.
 */
export const MINOR_SCALE_NAMES = [...MINOR_ISH].sort();
export const MINOR_QUALITY_NAMES = [...MINOR_QUALITIES].sort();

/**
 * Chord intervals in semitones above the root.
 *
 * Absolute shapes, not scale degrees: `ce.music.chord` answers "what is a D minor 7", which does
 * not depend on a key. Building a chord ON a scale degree is what the Chord Pad and Harmoniser do
 * with `stackedChord`, and that is a different question with a different answer.
 *
 * The quality names match `chordQuality()`'s vocabulary (dim, m7b5, dim7) so a chord this module
 * builds and a chord the panel classifies are called the same thing.
 */
export const CHORDS = {
  major:   [0, 4, 7],
  minor:   [0, 3, 7],
  dim:     [0, 3, 6],
  aug:     [0, 4, 8],
  sus2:    [0, 2, 7],
  sus4:    [0, 5, 7],
  power:   [0, 7],
  maj6:    [0, 4, 7, 9],
  min6:    [0, 3, 7, 9],
  dom7:    [0, 4, 7, 10],
  maj7:    [0, 4, 7, 11],
  min7:    [0, 3, 7, 10],
  minMaj7: [0, 3, 7, 11],
  dim7:    [0, 3, 6, 9],
  m7b5:    [0, 3, 6, 10],
  aug7:    [0, 4, 8, 10],
  add9:    [0, 4, 7, 14],
  dom9:    [0, 4, 7, 10, 14],
  maj9:    [0, 4, 7, 11, 14],
  min9:    [0, 3, 7, 10, 14],
};

/** Scale and chord ids, in the order the tables declare them — the order pickers and enums show. */
export const SCALE_NAMES = Object.keys(SCALES);
export const CHORD_NAMES = Object.keys(CHORDS);

/**
 * A note's name and number, by the rule ce.music.name and ce.music.number answer by (the WebView
 * runtime calls these), and the script editor's Values sidebar reads a note by, so the two cannot
 * read one name two ways. NOTE_NAMES is ce.music's own plain spelling, # for a sharp, which every
 * script compares against; NOTE_SHARP and NOTE_FLAT are the panel's.
 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_LETTER = { C: 11, D: 1, E: 3, F: 4, G: 6, A: 8, B: 10 };
const mod12 = (n) => ((Math.floor(n) % 12) + 12) % 12;

/**
 * "C4" -> 60 (middle C is C4), or undefined for a name that cannot be read. All four spellings of an
 * accidental are read (C#4, C♯4, Db4, D♭4); the letter must be a capital and the octave must be
 * there. Undefined, not 0, because 0 is a real note (C-1).
 */
export function noteNumberOf(name) {
  // In any case, as every word from a list is read: "c4", "eb4" and "BB3" (a B, then a flat) are
  // C4, E♭4 and B♭3. The octave after the accidental is what keeps "b" the flat and not the letter.
  const m = /^([A-Ga-g])([#bB]?)(-?\d+)$/.exec(String(name).replace(/\u266F/g, '#').replace(/\u266D/g, 'b').trim());
  if (!m) return undefined;
  const letter = m[1].toUpperCase();
  const acc = m[2] === 'B' ? 'b' : m[2];
  const pc = acc === 'b' ? FLAT_LETTER[letter] : NOTE_NAMES.indexOf(letter + acc);
  if (pc < 0) return undefined;
  // A flat lowers below the letter, so Cb3 is the B under C3 — one octave down, not up.
  const oct = parseInt(m[3], 10) + (acc === 'b' && letter === 'C' ? 0 : 1);
  return oct * 12 + pc;
}

/**
 * A key's note as a pitch class, 0 (C) to 11 (B): a name, "C", "F#", "Eb", in any case and with or
 * without an octave, read by noteNumberOf's rule; or a number, round the octave (12 is C, -1 is B).
 * null for anything else: a name it cannot read is refused, not taken as C.
 */
export function pitchClassOf(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text !== '' && Number.isFinite(Number(text))) return mod12(Math.round(Number(text)));
  const n = noteNumberOf(/\d$/.test(text) ? text : `${text}4`);
  return n === undefined ? null : mod12(n);
}

/**
 * 60 -> "C4". With `flats` left out, ce.music's plain spelling ("C#4"); given, the panel's: true for
 * flats ("D♭4"), false for sharps ("C♯4").
 */
export function noteNameOf(n, flats) {
  const whole = Math.floor(n);
  const table = flats === undefined || flats === null ? NOTE_NAMES : (flats ? NOTE_FLAT : NOTE_SHARP);
  return table[mod12(whole)] + (Math.floor(whole / 12) - 1);
}
