// musicalCapabilities.test.js — the shared key/scale, and the shared spring-back.
//
// Two capabilities in one file because they are the same shape of thing: a rule several components
// were each about to reinvent, factored out once. The chord generator, pad grid, note ribbon and
// arpeggiator all need a key; the pitch wheel, ribbon, joystick and spring fader all need a return.
// Four private copies of either is four chances to drift.
//
// TWELVE-TONE, stated rather than assumed. Microtonal and non-12-TET are real and are not here; a
// scale is an interval set within twelve semitones. Leaving that implicit is how a future attempt
// at 24-TET would find the assumption everywhere at once.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHORD_SHAPES, NOTE_NAMES, SCALES, contextLabel, diatonicChord, intervalsFor,
  isInScale, normalizeContext, quantizeToScale, rootFrom, scaleDegrees,
} from '../src/CE_Application/utils/musicalContext.js';
import {
  RETURN_CURVE, RETURN_MODE, restValueFor, returnFrames, returnStep, returnStep2D, shapeProgress,
} from '../src/CE_Application/utils/returnToRest.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const C_MAJOR = { root: 0, scale: 'major' };
const A_MINOR = { root: 9, scale: 'minor' };

// --- musical context ------------------------------------------------------------------------------

test('a root reads from a number or a note name, sharps and flats alike', () => {
  // A user types Eb; no lookup table of sharps carries it.
  assert.equal(rootFrom(0), 0);
  assert.equal(rootFrom('C'), 0);
  assert.equal(rootFrom('F#'), 6);
  assert.equal(rootFrom('Gb'), 6);
  assert.equal(rootFrom('Bb'), 10);
  assert.equal(rootFrom(14), 2, 'a root past an octave wraps');
  assert.equal(rootFrom(-1), 11, 'and so does a negative one');
  assert.equal(rootFrom('nonsense'), 0);
});

test('every named scale is a set of ascending intervals inside one octave', () => {
  for (const [name, intervals] of Object.entries(SCALES)) {
    assert.ok(intervals.length > 0, name);
    assert.equal(intervals[0], 0, `${name} does not start on its root`);
    assert.ok(intervals.every((n) => n >= 0 && n < 12), `${name} leaves the octave`);
    assert.deepEqual(intervals, [...intervals].sort((a, b) => a - b), `${name} is not ascending`);
    assert.equal(new Set(intervals).size, intervals.length, `${name} repeats a degree`);
  }
});

test('a custom interval set is accepted, cleaned and sorted', () => {
  assert.deepEqual(intervalsFor([7, 0, 4, 4, 14]), [0, 2, 4, 7], 'duplicates out, wrapped, sorted');
  assert.deepEqual(intervalsFor([]), SCALES.chromatic, 'an empty custom scale is not a scale');
  assert.deepEqual(intervalsFor('no-such-scale'), SCALES.chromatic);
});

test('in-key is judged relative to the root, not to C', () => {
  assert.equal(isInScale(60, C_MAJOR), true, 'C is in C major');
  assert.equal(isInScale(61, C_MAJOR), false, 'C# is not');
  assert.equal(isInScale(61, { root: 1, scale: 'major' }), true, 'but it is the root of C# major');
  assert.equal(isInScale(57, A_MINOR), true);
});

test('a disabled context puts everything in key, and quantises nothing', () => {
  // The local-override case the design calls for: a chromatic component ignores the panel's key.
  const off = { root: 0, scale: 'major', enabled: false };
  assert.equal(isInScale(61, off), true);
  assert.equal(quantizeToScale(61, off), 61);
});

test('quantising moves a note to the nearest scale tone, and ties go down', () => {
  // A note exactly between two scale tones has to go somewhere. The same way every time is a
  // musical decision a player can learn; a different way each approach is a bug they cannot.
  assert.equal(quantizeToScale(60, C_MAJOR), 60, 'an in-key note does not move');
  assert.equal(quantizeToScale(61, C_MAJOR), 60, 'C# falls to C');
  assert.equal(quantizeToScale(66, C_MAJOR), 65, 'F# is equidistant from F and G — ties go down');
  assert.equal(quantizeToScale(70, C_MAJOR), 69, 'Bb falls to A');
});

test('a chromatic scale quantises nothing, cheaply', () => {
  for (const note of [60, 61, 62, 63]) {
    assert.equal(quantizeToScale(note, { root: 0, scale: 'chromatic' }), note);
  }
});

test('scale degrees walk up and keep walking past the octave', () => {
  assert.deepEqual(scaleDegrees(C_MAJOR, 60), [60, 62, 64, 65, 67, 69, 71]);
  assert.deepEqual(scaleDegrees(C_MAJOR, 60, 9), [60, 62, 64, 65, 67, 69, 71, 72, 74],
    'the eighth degree is the octave, not a repeat of the root');
  assert.deepEqual(scaleDegrees({ root: 9, scale: 'pentatonicMinor' }, 60, 5), [69, 72, 74, 76, 79]);
});

test('a diatonic chord takes its quality from the scale, not from a table', () => {
  // Built by stacking scale degrees, which is what makes degree ii minor and vii diminished
  // without either being written down. Change the scale and the qualities change with it.
  assert.deepEqual(diatonicChord(0, C_MAJOR), [60, 64, 67], 'I is major: 0, 4, 7');
  assert.deepEqual(diatonicChord(1, C_MAJOR), [62, 65, 69], 'ii is minor: 0, 3, 7 from D');
  assert.deepEqual(diatonicChord(6, C_MAJOR), [71, 74, 77], 'vii is diminished: 0, 3, 6 from B');
});

test('a seventh adds the next stacked degree, and a shape past the scale wraps an octave up', () => {
  assert.deepEqual(diatonicChord(0, C_MAJOR, { shape: 'seventh' }), [60, 64, 67, 71]);
  const ninth = diatonicChord(0, C_MAJOR, { shape: 'ninth' });
  assert.equal(ninth.length, 5);
  assert.equal(ninth[4], 74, 'the ninth is a D an octave up, not the D below');
  assert.ok(Object.keys(CHORD_SHAPES).includes('sus4'));
});

test('the context has a name a label can show', () => {
  assert.equal(contextLabel(C_MAJOR), 'C Major');
  assert.equal(contextLabel(A_MINOR), 'A Natural minor');
  assert.equal(contextLabel({ root: 0, scale: [0, 3, 7] }), 'C Custom');
  assert.equal(NOTE_NAMES.length, 12);
});

test('a missing context normalises to something usable', () => {
  assert.deepEqual(normalizeContext(undefined), { root: 0, scale: 'major', enabled: true });
  assert.equal(normalizeContext({ enabled: false }).enabled, false);
});

// --- return to rest ---------------------------------------------------------------------------------

test('the Behavior section carries the return fields, defaulting to no return', () => {
  // Nothing existing should start springing because this landed.
  assert.equal(SECTION_DEFAULTS.Behavior.returnMode, 'none');
  assert.equal(SECTION_DEFAULTS.Behavior.returnCurve, 'exp');
  assert.equal(SECTION_DEFAULTS.Behavior.returnTime, 120);
});

test('"does not return" is distinguishable from "returns to zero"', () => {
  // Opposite behaviours for a fader whose minimum is zero, so null rather than 0.
  assert.equal(restValueFor({ returnMode: 'none', min: 0, max: 127 }), null);
  assert.equal(restValueFor({ returnMode: 'min', min: 0, max: 127 }), 0);
});

test('each rest mode lands where it says', () => {
  const range = { min: 0, max: 127 };
  assert.equal(restValueFor({ ...range, returnMode: RETURN_MODE.center }), 63.5);
  assert.equal(restValueFor({ ...range, returnMode: RETURN_MODE.max }), 127);
  assert.equal(restValueFor({ ...range, returnMode: RETURN_MODE.rest, returnValue: 40 }), 40);
  assert.equal(restValueFor({ ...range, returnMode: RETURN_MODE.rest, returnValue: 900 }), 127,
    'a rest value outside the range is clamped, not sent');
});

test('a curve starts at 0 and finishes at 1, whichever it is', () => {
  for (const curve of Object.values(RETURN_CURVE)) {
    assert.equal(shapeProgress(0, curve), 0, curve);
    assert.equal(shapeProgress(1, curve), 1, curve);
    assert.ok(shapeProgress(0.5, curve) > 0 && shapeProgress(0.5, curve) < 1, curve);
  }
  // A spring covers most of the distance early; that is what makes it read as sprung.
  assert.ok(shapeProgress(0.5, RETURN_CURVE.exp) > shapeProgress(0.5, RETURN_CURVE.linear));
});

test('a zero return time snaps and emits nothing on the way', () => {
  // Exactly zero rather than "very fast": a control configured to snap should not emit an
  // intermediate value at all.
  const step = returnStep(100, 0, 0, { returnTime: 0 });
  assert.deepEqual(step, { value: 0, done: true });
  assert.deepEqual(returnFrames(100, 0, { returnTime: 0 }), [0]);
});

test('a glide reaches the rest value and reports that it is done', () => {
  // `done` is part of the answer rather than re-derived from the value: a curve can land on the
  // rest before its time is up, and a caller comparing floats would tick a finished glide forever.
  const behavior = { returnTime: 100, returnCurve: RETURN_CURVE.linear };
  assert.equal(returnStep(0, 100, 50, behavior).value, 50);
  assert.equal(returnStep(0, 100, 50, behavior).done, false);
  assert.deepEqual(returnStep(0, 100, 100, behavior), { value: 100, done: true });
  assert.deepEqual(returnStep(0, 100, 5000, behavior), { value: 100, done: true });
});

test('the glide emits a handful of values, not a flood', () => {
  // A spring-back that moves the control and tells the device nothing leaves the synth bent, so it
  // emits — and at 60fps a 120ms return is about eight values, which a synth can follow.
  const frames = returnFrames(127, 64, { returnTime: 120, returnCurve: RETURN_CURVE.exp });
  assert.ok(frames.length >= 6 && frames.length <= 10, `got ${frames.length} frames`);
  assert.equal(frames.at(-1), 64, 'and the last one is exactly the rest value');
  assert.ok(frames[0] < 127 && frames[0] > 64, 'the first is already on the way');
});

test('a 2D return travels in a straight line', () => {
  // One progress for both axes. Per-axis timing would make the puck curve, which looks like a bug
  // in a control whose whole job is to be a position.
  const behavior = { returnTime: 100, returnCurve: RETURN_CURVE.linear };
  const half = returnStep2D({ x: 0, y: 0 }, { x: 1, y: 0.5 }, 50, behavior);
  assert.equal(half.value.x, 0.5);
  assert.equal(half.value.y, 0.25, 'both axes are half way, so the path is straight');
  assert.equal(half.done, false);
  assert.equal(returnStep2D({ x: 0, y: 0 }, { x: 1, y: 1 }, 100, behavior).done, true);
});

test('a return with nowhere to go is already finished', () => {
  assert.deepEqual(returnStep(50, null, 10, { returnTime: 100 }), { value: 50, done: true });
  assert.deepEqual(returnStep(undefined, 20, 10, { returnTime: 100 }), { value: 20, done: true });
});
