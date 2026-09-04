/**
 * pianoGeometry.js — where a note sits on a drawn piano.
 *
 * A piano is not linear in semitones: seven white keys share an octave with five black ones
 * riding on top, so anything drawn OVER a keyboard — a part's key range, say — has to use the
 * keyboard's own geometry or it lands a key and a half off by the top of the range and looks
 * like a bug in the arithmetic rather than in the drawing. This is that geometry, in white-key
 * units, pure, so a test can prove the round trip for all 128 notes.
 *
 * A white key occupies exactly one unit. A black key sits on the seam to its right: from 0.7
 * of its white neighbour to 0.3 of the next, which is where the drawn black key is, so hitting
 * one with the pointer picks it rather than the white key underneath.
 */

const WHITE_IN_OCTAVE = [0, 2, 4, 5, 7, 9, 11];
const BLACK_IN_OCTAVE = new Set([1, 3, 6, 8, 10]);
const WHITES_BELOW = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];   // whites before each semitone in an octave

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const isBlack = (note) => BLACK_IN_OCTAVE.has(((note % 12) + 12) % 12);

/** C-1 for 0, C4 for 60 — the convention the split lanes already used. */
export const noteName = (note) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

/** How many white keys lie strictly below `note` (0 for C-1). */
export function whiteIndexOf(note) {
  const octave = Math.floor(note / 12);
  return octave * 7 + WHITES_BELOW[note % 12];
}

/** White keys in an inclusive note range. */
export function whiteCount(low, high) {
  let count = 0;
  for (let n = low; n <= high; n += 1) if (!isBlack(n)) count += 1;
  return count;
}

/** The [x0, x1) span of a note in white-key units, measured from `low`'s first white key. */
export function keySpan(note, low = 0) {
  const origin = whiteIndexOf(low);
  const white = whiteIndexOf(note) - origin;
  return isBlack(note) ? [white - 0.3, white + 0.3] : [white, white + 1];
}

/** The note under a horizontal fraction (0..1) of a keyboard spanning [low, high]. Black keys
    win where they overlap, because that is what the pointer is on top of. */
export function noteAtFraction(fraction, low = 0, high = 127) {
  const whites = whiteCount(low, high);
  const x = Math.max(0, Math.min(whites - 1e-9, fraction * whites));
  for (let n = low; n <= high; n += 1) {
    if (!isBlack(n)) continue;
    const [x0, x1] = keySpan(n, low);
    if (x >= x0 && x < x1) return n;
  }
  const whiteIndex = Math.floor(x);
  for (let n = low; n <= high; n += 1)
    if (!isBlack(n) && whiteIndexOf(n) - whiteIndexOf(low) === whiteIndex) return n;
  return high;
}

/** A zone [keyLow..keyHigh] as left/width fractions of a keyboard spanning [low, high]. */
export function zoneExtent(keyLow, keyHigh, low = 0, high = 127) {
  const whites = whiteCount(low, high);
  const clampedLow = Math.max(low, Math.min(high, keyLow));
  const clampedHigh = Math.max(clampedLow, Math.min(high, keyHigh));
  const x0 = keySpan(clampedLow, low)[0];
  const x1 = keySpan(clampedHigh, low)[1];
  return { left: Math.max(0, x0 / whites), width: Math.max(0, (x1 - Math.max(0, x0)) / whites) };
}
