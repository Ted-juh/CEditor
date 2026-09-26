// The Chords module's browser arithmetic, pinned to the engine: the same keys and settings the
// C++ tests play through MidiFxChain (PerformanceEngineTests.cpp) must come out the same here,
// or the editor would draw chords the part does not play.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHORD_SHAPES, shapeNotes, buildChord, chordForKey, chordName, chordsOfKey,
  withoutSetChord, withKeyMapped,
} from '../src/CE_Application/utils/chordBuilder.js';

const fx = (over = {}) => ({
  chord: 'off', chordFollow: true, chordFollowLow: 0, chordFollowHigh: 127, chordInversion: 0,
  chordVoicing: 'close', chordVoiceLeading: false, chordBass: false, chordKeyMap: false,
  chordSet: [], keyMap: [], scaleType: 'major', scaleRoot: 0, ...over,
});

test('every shape plays the intervals the engine plays', () => {
  const expected = {
    triad: [60, 64, 67], minor: [60, 63, 67], seventh: [60, 64, 67, 70], maj7: [60, 64, 67, 71],
    m7: [60, 63, 67, 70], sus2: [60, 62, 67], sus4: [60, 65, 67], 6: [60, 64, 67, 69],
    add9: [60, 64, 67, 74], 9: [60, 64, 67, 70, 74], dim: [60, 63, 66], aug: [60, 64, 68],
    m7b5: [60, 63, 66, 70], 'power fifth': [60, 67], octave: [60, 72],
  };
  for (const s of CHORD_SHAPES) assert.deepEqual(shapeNotes(s.id, 60), expected[s.id], s.id);
  assert.deepEqual(shapeNotes('diatonic', 62), [62, 65, 69], 'D in C major is D minor');
  assert.deepEqual(shapeNotes('diatonic', 71), [71, 74, 77], 'B is B diminished');
  assert.deepEqual(shapeNotes('diatonic 7th', 60), [60, 64, 67, 71]);
});

test('what a key plays: follow, range, bass, voicing and the key map, as the engine decides', () => {
  assert.deepEqual(chordForKey(fx({ chord: 'triad', chordInversion: 1 }), 60).notes, [64, 67, 72]);
  assert.deepEqual(chordForKey(fx({ chord: 'triad', chordVoicing: 'open' }), 60).notes, [60, 67, 76]);
  assert.deepEqual(chordForKey(fx({ chord: 'triad', chordBass: true }), 60).notes, [60, 64, 67, 48]);
  const split = fx({ chord: 'minor', chordFollowHigh: 59 });
  assert.deepEqual(chordForKey(split, 48).notes, [48, 51, 55]);
  assert.deepEqual(chordForKey(split, 60), { source: 'plain', notes: [60] }, 'above the range, the key alone');
  assert.deepEqual(chordForKey(fx({ chord: 'minor', chordFollow: false }), 60).notes, [60],
    'the light off keeps the shape and mutes it');
  const mapped = fx({ chord: 'triad', chordKeyMap: true, chordSet: [{ notes: [60, 63, 67, 72] }],
                     keyMap: [{ key: 60, chord: 0 }] });
  assert.deepEqual(chordForKey(mapped, 60), { source: 'map', notes: [60, 63, 67, 72] }, 'the map wins');
  assert.deepEqual(chordForKey(mapped, 62).notes, [62, 66, 69], 'and the rest follow');
  assert.deepEqual(chordForKey({ ...mapped, chordKeyMap: false }, 60).notes, [60, 64, 67],
    'with the key map off, the mapped key follows too');
});

test('the builder: shape on a root, inverted, voiced, with a bass', () => {
  assert.deepEqual(buildChord({ root: 60, quality: 'triad' }), [60, 64, 67]);
  assert.deepEqual(buildChord({ root: 60, quality: 'triad', inversion: 1 }), [64, 67, 72]);
  assert.deepEqual(buildChord({ root: 57, quality: 'm7', voicing: 'drop 2' }), [52, 57, 60, 67],
    'drop 2: the second-highest voice goes down an octave');
  assert.deepEqual(buildChord({ root: 60, quality: '9', bass: true }), [48, 60, 64, 67, 70, 74],
    'a ninth plus its bass is exactly the six voices the engine allows');
});

test('names: simple first, inversions as slash chords, unknowns as their notes', () => {
  assert.equal(chordName([60, 64, 67]), 'C');
  assert.equal(chordName([62, 65, 69]), 'Dm');
  assert.equal(chordName([64, 67, 72]), 'C/E');
  assert.equal(chordName([57, 60, 64, 67]), 'Am7');
  assert.equal(chordName([60, 63, 66, 70]), 'Cm7♭5');
  assert.equal(chordName([55, 60, 62]), 'Gsus4', 'G C D: named from the bass when that works');
  assert.equal(chordName([60, 61]), 'C·C♯');
  assert.equal(chordName([]), '—');
});

test('the chords of a key fill the set, and removing or mapping keeps the map honest', () => {
  const key = chordsOfKey('major', 7);
  assert.deepEqual(key.map((c) => chordName(c.notes)), ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F♯dim']);
  assert.deepEqual(key.map((c) => c.quality), ['triad', 'minor', 'minor', 'triad', 'triad', 'minor', 'dim'],
    'each says which builder shape it is, so the builder edits it like its own');
  assert.deepEqual(chordsOfKey('pentatonic minor', 0), [], 'only seven-note scales have seven chords');

  const state = fx({ chordSet: [{ notes: [60] }, { notes: [62] }, { notes: [64] }],
                     keyMap: [{ key: 36, chord: 0 }, { key: 37, chord: 1 }, { key: 38, chord: 2 }] });
  const removed = withoutSetChord({ ...state, padMap: [0, 1, 2, -1], progression: [2, 1, 0, 1] }, 1);
  assert.deepEqual(removed.keyMap, [{ key: 36, chord: 0 }, { key: 38, chord: 1 }]);
  assert.deepEqual(removed.padMap, [0, -1, 1, -1], 'its pads empty, later pads renumber');
  assert.deepEqual(removed.progression, [1, 0], 'its steps go, later steps renumber');
  assert.deepEqual(withKeyMapped(state, 37, 2).find((m) => m.key === 37), { key: 37, chord: 2 });
  assert.equal(withKeyMapped(state, 37, -1).some((m) => m.key === 37), false);
  assert.equal(withKeyMapped(state, 39, 9).some((m) => m.key === 39), false, 'nothing past the set');
});

test('the progression wins over following for keys in its range', () => {
  const state = fx({ chord: 'triad', chordProgression: true, progression: [0], progressionLow: 36, progressionHigh: 59,
                     chordSet: [{ notes: [57, 60, 64] }] });
  assert.deepEqual(chordForKey(state, 48), { source: 'progression', notes: [57, 60, 64] });
  assert.deepEqual(chordForKey(state, 60).notes, [60, 64, 67], 'above the range, following again');
});
