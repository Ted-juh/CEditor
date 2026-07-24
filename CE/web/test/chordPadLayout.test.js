import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALES, scalePitchClasses, inScale, useFlats, noteName,
  stackedChord, chordQuality, romanNumeral, degreeChord, chordNotes,
  chordPadPads, padNotes, wheelSlots, CIRCLE_PCS,
  gridGeometry, gridCell, gridHit, wheelGeometry, wheelSlotCenter, wheelHit,
  noteOnBytes, noteOffBytes, bytesToHex, chordPadVelocity, chordPadChannel,
} from '../src/CE_Application/utils/chordPadLayout.js';

function cp(c) { return { _children: { Core: { controlType: 'ChordPad' }, ChordPad: c } }; }

test('scale pitch classes + membership', () => {
  // C major → C D E F G A B
  assert.deepEqual(scalePitchClasses(0, SCALES.major), [0, 2, 4, 5, 7, 9, 11]);
  // A minor → same pitch classes as C major
  assert.deepEqual([...scalePitchClasses(9, SCALES.minor)].sort((a, b) => a - b), [0, 2, 4, 5, 7, 9, 11]);
  assert.equal(inScale(1, 0, SCALES.major), false);   // C♯ not in C major
  assert.equal(inScale(11, 0, SCALES.major), true);
});

test('spelling picks flats for flat keys', () => {
  assert.equal(useFlats(0, 'major'), false);          // C major → naturals/sharps
  assert.equal(useFlats(5, 'major'), true);           // F major → flats
  assert.equal(useFlats(0, 'minor'), true);           // C minor (rel E♭) → flats
  assert.equal(noteName(3, true), 'E♭');
  assert.equal(noteName(3, false), 'D♯');
});

test('stacked thirds build triads and sevenths', () => {
  // C major, degree 0 → C E G (0,4,7); degree 1 → D F A (2,5,9)
  assert.deepEqual(stackedChord(SCALES.major, 0, 3), [0, 4, 7]);
  assert.deepEqual(stackedChord(SCALES.major, 1, 3), [2, 5, 9]);
  assert.deepEqual(stackedChord(SCALES.major, 0, 4), [0, 4, 7, 11]);   // Cmaj7
  // degree 6 wraps an octave: B D F → 11, 14, 17
  assert.deepEqual(stackedChord(SCALES.major, 6, 3), [11, 14, 17]);
});

test('chord quality classification', () => {
  assert.equal(chordQuality([0, 4, 7]), 'maj');
  assert.equal(chordQuality([0, 3, 7]), 'min');
  assert.equal(chordQuality([0, 3, 6]), 'dim');
  assert.equal(chordQuality([0, 4, 8]), 'aug');
  assert.equal(chordQuality([0, 4, 7, 11]), 'maj7');
  assert.equal(chordQuality([0, 4, 7, 10]), 'dom7');
  assert.equal(chordQuality([0, 3, 7, 10]), 'min7');
  assert.equal(chordQuality([0, 3, 6, 10]), 'm7b5');
});

test('roman numerals, incl. borrowed ♭ degrees', () => {
  assert.equal(romanNumeral(0, 'maj'), 'I');
  assert.equal(romanNumeral(2, 'min'), 'ii');
  assert.equal(romanNumeral(11, 'dim'), 'vii°');
  assert.equal(romanNumeral(3, 'maj'), '♭III');       // E♭ in C minor
  assert.equal(romanNumeral(10, 'maj'), '♭VII');
});

test('degreeChord names the diatonic chords of C major', () => {
  const names = SCALES.major.map((_, d) => degreeChord(0, SCALES.major, d, 3, false).name);
  assert.deepEqual(names, ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
  const romans = SCALES.major.map((_, d) => degreeChord(0, SCALES.major, d, 3, false).roman);
  assert.deepEqual(romans, ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
});

test('C minor pads spell the flat degrees', () => {
  const pads = chordPadPads(cp({ key: 0, scale: 'minor', mode: 'chords' }));
  assert.equal(pads.length, 7);
  assert.equal(pads[0].name, 'Cm');
  assert.equal(pads[0].roman, 'i');
  assert.equal(pads[2].name, 'E♭');
  assert.equal(pads[2].roman, '♭III');
});

test('chordNotes: octave, inversion, voicing', () => {
  // C major triad at octave 4 → 60, 64, 67 (middle C)
  assert.deepEqual(chordNotes(0, [0, 4, 7], { baseOctave: 4 }), [60, 64, 67]);
  // first inversion moves the root up an octave → 64, 67, 72
  assert.deepEqual(chordNotes(0, [0, 4, 7], { baseOctave: 4, inversion: 1 }), [64, 67, 72]);
  // drop2 lowers the 2nd-from-top by an octave
  assert.deepEqual(chordNotes(0, [0, 4, 7], { baseOctave: 4, voicing: 'drop2' }), [52, 60, 67]);
  // all notes stay in MIDI range
  for (const n of chordNotes(0, [0, 4, 7], { baseOctave: 8 })) assert.ok(n >= 0 && n <= 127);
});

test('padNotes honours the control octave offset', () => {
  const c = cp({ key: 0, scale: 'major', mode: 'chords', baseOctave: 4, octave: 0 });
  const pads = chordPadPads(c);
  assert.deepEqual(padNotes(c, pads[0]), [60, 64, 67]);
  const up = cp({ key: 0, scale: 'major', mode: 'chords', baseOctave: 4, octave: 1 });
  assert.deepEqual(padNotes(up, chordPadPads(up)[0]), [72, 76, 79]);
});

test('notes mode gives one pad per scale note across octaves', () => {
  const c = cp({ key: 0, scale: 'major', mode: 'notes', noteSpan: 2 });
  const pads = chordPadPads(c);
  assert.equal(pads.length, 14);
  assert.equal(pads[0].name, 'C');
  assert.equal(pads[0].isRoot, true);
  assert.deepEqual(padNotes(c, pads[0]), [60]);        // single note
  assert.deepEqual(padNotes(c, pads[7]), [72]);        // next octave's C
});

test('wheel: circle of fifths order + the in-key wedge', () => {
  assert.deepEqual(CIRCLE_PCS.slice(0, 4), [0, 7, 2, 9]);   // C G D A
  const slots = wheelSlots(cp({ key: 0, scale: 'major' }));
  assert.equal(slots.length, 12);
  // C major: the in-key majors are F (slot 11), C (0), G (1) — one connected wedge
  const inKeyMajors = slots.filter((s) => s.major.inKey).map((s) => s.index).sort((a, b) => a - b);
  assert.deepEqual(inKeyMajors, [0, 1, 11]);
  // their relative minors are in key too (Dm, Am, Em)
  assert.deepEqual(slots.filter((s) => s.minor.inKey).map((s) => s.index).sort((a, b) => a - b), [0, 1, 11]);
  // the tonic slot is C, its inner ring is Am (vi)
  assert.equal(slots[0].major.name, 'C');
  assert.equal(slots[0].major.isTonic, true);
  assert.equal(slots[0].minor.name, 'Am');
  assert.equal(slots[0].minor.roman, 'vi');
  // V is one step clockwise, IV one step anti-clockwise
  assert.equal(slots[1].major.roman, 'V');
  assert.equal(slots[11].major.roman, 'IV');
});

test('wheel spells conventionally: sharps CW from C, flats on the flat side', () => {
  // A printed circle of fifths shows G♭ D♭ A♭ E♭ B♭ F — not F♯ C♯ G♯ …
  const slots = wheelSlots(cp({ key: 0, scale: 'major' }));
  assert.deepEqual(slots.map((s) => s.major.name), ['C', 'G', 'D', 'A', 'E', 'B', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F']);
  // …and it stays conventional whatever the key (C minor lights B♭ E♭ A♭).
  const min = wheelSlots(cp({ key: 0, scale: 'minor' }));
  assert.deepEqual(min.filter((s) => s.major.inKey).map((s) => s.major.name).sort(), ['A♭', 'B♭', 'E♭']);
});

test('wheel wedge follows the key (A minor lights the same pitch set)', () => {
  const slots = wheelSlots(cp({ key: 9, scale: 'minor' }));
  const lit = slots.filter((s) => s.major.inKey).map((s) => s.index).sort((a, b) => a - b);
  assert.deepEqual(lit, [0, 1, 11]);                  // C, G, F — same as C major
  const tonic = slots.find((s) => s.minor.isTonic);
  assert.equal(tonic.minor.name, 'Am');
  assert.equal(tonic.minor.roman, 'i');
});

test('grid geometry + hit-test', () => {
  const g = gridGeometry(400, 240, 8, 4, 10, 34, 0);
  assert.equal(g.cols === 4 && g.rows === 2, true);
  const c0 = gridCell(g, 0);
  assert.equal(gridHit(g, c0.x + 2, c0.y + 2, 8), 0);
  const c5 = gridCell(g, 5);
  assert.equal(gridHit(g, c5.x + 2, c5.y + 2, 8), 5);
  assert.equal(gridHit(g, 0, 0, 8), -1);              // header area
});

test('wheel geometry + hit-test', () => {
  const g = wheelGeometry(400, 400, 10, 34);
  const top = wheelSlotCenter(g, 0, 'major');
  assert.ok(Math.abs(top.x - g.cx) < 1e-6 && top.y < g.cy);   // slot 0 at the top
  const hit = wheelHit(g, top.x, top.y);
  assert.deepEqual(hit, { index: 0, ring: 'major' });
  const inner = wheelSlotCenter(g, 3, 'minor');
  assert.deepEqual(wheelHit(g, inner.x, inner.y), { index: 3, ring: 'minor' });
  assert.equal(wheelHit(g, g.cx, g.cy), null);                 // hub is not a pad
});

test('MIDI note bytes', () => {
  assert.deepEqual(noteOnBytes(1, 60, 96), [0x90, 60, 96]);
  assert.deepEqual(noteOnBytes(10, 60, 96), [0x99, 60, 96]);   // channel 10
  assert.deepEqual(noteOffBytes(1, 60), [0x80, 60, 0]);
  assert.equal(bytesToHex([0x90, 60, 96]), '90 3C 60');
  assert.equal(chordPadVelocity(cp({ velocity: 200 })), 127);  // clamped
  assert.equal(chordPadChannel(cp({ channel: 0 })), 1);
});
