// pianoGeometry — where a note sits on a drawn piano. The lanes under the keyboard use this
// to line up with the keys above; a semitone-linear strip was a key and a half off by C8.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_KEYBOARD, isBlack, noteName, whiteIndexOf, whiteCount, keySpan, noteAtFraction,
  zoneExtent, maxPlayBaseOctave, playKeyboardRange, playKeyboardWidthPercent,
} from '../src/CE_Application/utils/pianoGeometry.js';

test('a full keyboard has 75 white keys and C4 is the 36th', () => {
  assert.equal(whiteCount(0, 127), 75);
  assert.equal(whiteIndexOf(0), 0, 'C-1 is the first white key');
  assert.equal(whiteIndexOf(60), 35, 'C4 has 35 white keys below it');
  assert.equal(whiteIndexOf(127), 74, 'G9 is the last');
  assert.equal(whiteCount(60, 95), 21, 'three octaves from C4 are 21 white keys');
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C#4');
  assert.equal(noteName(0), 'C-1');
});

test('the playable keyboard keeps four-octave key size, centres shorter spans and fits longer ones', () => {
  assert.deepEqual(playKeyboardRange(4, 4), { low: 60, high: 107 });
  assert.equal(playKeyboardWidthPercent(1), 25);
  assert.equal(playKeyboardWidthPercent(3), 75);
  assert.equal(playKeyboardWidthPercent(4), 100);
  assert.equal(playKeyboardWidthPercent(5), 100);
  assert.equal(playKeyboardWidthPercent(FULL_KEYBOARD), 100);
});

test('playable octave spans stay complete and Full reaches every MIDI note', () => {
  assert.equal(maxPlayBaseOctave(4), 5);
  assert.deepEqual(playKeyboardRange(8, 4), { low: 72, high: 119 },
    'a requested span near the top shifts down rather than being clipped');
  assert.deepEqual(playKeyboardRange(-1, 10), { low: 0, high: 119 });
  assert.deepEqual(playKeyboardRange(4, FULL_KEYBOARD), { low: 0, high: 127 });
});

test('black keys ride the seam to the right of their white neighbour', () => {
  assert.deepEqual(keySpan(60), [35, 36], 'a white key is one unit');
  assert.deepEqual(keySpan(61), [35.7, 36.3], 'its sharp straddles the seam');
  assert.ok(isBlack(61) && !isBlack(64) && !isBlack(65), 'E to F has no seam key');
  assert.deepEqual(keySpan(60, 60), [0, 1], 'spans are measured from the keyboard\'s own low end');
});

test('the pointer finds every note back from its own span', () => {
  // The round trip that makes dragging honest: the centre of each key's span must resolve
  // to that key, black keys included, on the full keyboard and on a three-octave one.
  for (const [low, high] of [[0, 127], [60, 95], [36, 71]]) {
    const whites = whiteCount(low, high);
    for (let n = low; n <= high; n += 1) {
      const [x0, x1] = keySpan(n, low);
      const centre = ((x0 + x1) / 2) / whites;
      assert.equal(noteAtFraction(centre, low, high), n, `note ${n} on ${low}..${high}`);
    }
  }
  assert.equal(noteAtFraction(-1, 0, 127), 0, 'left of the keyboard is the first key');
  assert.equal(noteAtFraction(2, 0, 127), 127, 'right of it is the last');
});

test('a zone is drawn from its low key\'s left edge to its high key\'s right edge', () => {
  const whole = zoneExtent(0, 127);
  assert.equal(whole.left, 0);
  assert.ok(Math.abs(whole.width - 1) < 1e-9, 'a full-range part spans the whole keyboard');

  const c4 = zoneExtent(60, 60);
  assert.ok(Math.abs(c4.left - 35 / 75) < 1e-9);
  assert.ok(Math.abs(c4.width - 1 / 75) < 1e-9, 'one white key wide');

  const sharp = zoneExtent(61, 61);
  assert.ok(sharp.left > c4.left && sharp.width < c4.width, 'a black key alone is narrower and to the right');

  const clipped = zoneExtent(0, 127, 60, 95);
  assert.equal(clipped.left, 0, 'a range wider than the visible keys is clipped to them');
  assert.ok(Math.abs(clipped.width - 1) < 1e-9);
});
