// scriptMusic.test.js — ce.music: scales, chords, and snapping a note to a key.
//
// The verbs §2 defined the module as and phases 1–7 never delivered. Cross-runtime and pure, so
// these fixtures are the SAME ones CE/tests/ScriptRuntimeTests.cpp §25 runs through Lua, JavaScript
// and Python. If a number here changes, it has to change there too — that is the point of pinning
// the answers rather than the implementation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { SCALES, CHORDS, SCALE_NAMES, CHORD_NAMES } from '../src/CE_Application/scripting/musicTheory.js';
import { SCALES as PANEL_SCALES } from '../src/CE_Application/utils/chordPadLayout.js';
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY } from '../src/CE_Application/scripting/panelApi.js';

const api = scriptApiForTesting('', 'music-script');

/* ------------------------------------------------------------------ the tables themselves */

test('the scale table IS the panel\'s, not a copy of it', () => {
  // A script asking for "dorian" and a Chord Pad set to "dorian" have to mean the same seven notes.
  // Two tables that agree today are two tables that disagree after the next edit.
  assert.equal(SCALES, PANEL_SCALES, 'ce.music must read the component table, not restate it');
});

test('every scale is ascending, starts on the root, and stays inside an octave', () => {
  for (const [name, steps] of Object.entries(SCALES)) {
    assert.equal(steps[0], 0, `${name} must start on the root`);
    assert.ok(steps.every((x, i) => i === 0 || x > steps[i - 1]), `${name} must ascend`);
    assert.ok(steps[steps.length - 1] < 12, `${name} must not repeat the octave`);
  }
});

test('every chord is ascending and starts on the root', () => {
  for (const [name, steps] of Object.entries(CHORDS)) {
    assert.equal(steps[0], 0, `${name} must start on the root`);
    assert.ok(steps.every((x, i) => i === 0 || x > steps[i - 1]), `${name} must ascend`);
  }
});

test('the qualities that have a standard shape have the standard shape', () => {
  // Spot-checks with one right answer. A transposed table would still pass the structural tests
  // above; these are what catch a wrong interval.
  assert.deepEqual(CHORDS.major, [0, 4, 7]);
  assert.deepEqual(CHORDS.minor, [0, 3, 7]);
  assert.deepEqual(CHORDS.dom7, [0, 4, 7, 10]);
  assert.deepEqual(CHORDS.maj7, [0, 4, 7, 11]);
  assert.deepEqual(CHORDS.m7b5, [0, 3, 6, 10]);
  assert.deepEqual(CHORDS.dim7, [0, 3, 6, 9]);
  assert.deepEqual(SCALES.major, [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(SCALES.minor, [0, 2, 3, 5, 7, 8, 10]);
});

/* ------------------------------------------------------------------------ the contract */

test('all three verbs are declared, cross-runtime, and namespaced under ce.music', () => {
  for (const [id, path] of [['scaleNotes', 'ce.music.scale'], ['chordNotes', 'ce.music.chord'],
                            ['quantizeNote', 'ce.music.quantize']]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // A scale is arithmetic. If it only worked with the window open, every generative idea would
    // stop at the edge of the editor.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});

/* --------------------------------------------------------------------------- scaleNotes */

test('scale returns one octave from the root, without repeating it', () => {
  assert.deepEqual(api.scaleNotes(60), [60, 62, 64, 65, 67, 69, 71], 'C major from middle C');
  assert.deepEqual(api.scaleNotes(60, 'minor'), [60, 62, 63, 65, 67, 68, 70]);
  assert.deepEqual(api.scaleNotes(60, 'pentatonicMin'), [60, 63, 65, 67, 70], 'five notes, not seven');
  assert.deepEqual(api.scaleNotes(60, 'blues'), [60, 63, 65, 66, 67, 70], 'six');
});

test('the root may be a note NAME, the way sendNote takes one', () => {
  assert.deepEqual(api.scaleNotes('C4'), api.scaleNotes(60));
  assert.deepEqual(api.scaleNotes('A3', 'minor'), [57, 59, 60, 62, 64, 65, 67]);
});

test('scale transposes rather than wrapping — the notes keep going up', () => {
  // A scale from B4 must not fold back into the octave below; a script arpeggiating it would
  // suddenly jump down a tenth in the middle.
  assert.deepEqual(api.scaleNotes(71), [71, 73, 75, 76, 78, 80, 82]);
});

test('an unknown scale returns nothing rather than quietly meaning major', () => {
  assert.equal(api.scaleNotes(60, 'lokrian'), undefined, 'a typo must be findable');
  assert.equal(api.scaleNotes(60, ''), undefined);
  // …but omitting it entirely is a documented default.
  assert.deepEqual(api.scaleNotes(60, null), api.scaleNotes(60, 'major'));
});

/* --------------------------------------------------------------------------- chordNotes */

test('chord builds an absolute shape from the root', () => {
  assert.deepEqual(api.chordNotes(60), [60, 64, 67], 'C major');
  assert.deepEqual(api.chordNotes(62, 'min7'), [62, 65, 69, 72], 'Dm7');
  assert.deepEqual(api.chordNotes(67, 'dom7'), [67, 71, 74, 77], 'G7');
  assert.deepEqual(api.chordNotes(60, 'power'), [60, 67]);
  assert.deepEqual(api.chordNotes(60, 'add9'), [60, 64, 67, 74], 'the 9th is above the octave');
});

test('a chord is not a scale degree — it does not depend on a key', () => {
  // chordNotes(root, "minor") is the same shape wherever it is built. Stacking thirds ON a scale
  // degree is a different question, and the Chord Pad answers it with stackedChord.
  const shape = (r) => api.chordNotes(r, 'minor').map((n) => n - r);
  assert.deepEqual(shape(60), shape(63));
  assert.deepEqual(shape(60), shape(71));
});

test('an unknown chord type returns nothing', () => {
  assert.equal(api.chordNotes(60, 'maj13sus'), undefined);
});

/* ------------------------------------------------------------------------- quantizeNote */

test('a note already in the scale is left exactly where it is', () => {
  for (const n of api.scaleNotes(60)) assert.equal(api.quantizeNote(n, 60), n);
});

test('a note outside the scale moves to the nearest one in it', () => {
  assert.equal(api.quantizeNote(63, 60, 'major'), 64, 'E♭ → E is one up, D is one down… ');
  assert.equal(api.quantizeNote(70, 60, 'major'), 71, 'B♭ → B');
  assert.equal(api.quantizeNote(61, 60, 'blues'), 60, 'and it can move DOWN when that is nearer');
});

test('a tie goes UP, always — the rule that keeps five runtimes agreeing', () => {
  // C# is one semitone from C and one from D. Without a stated rule each engine would pick its own,
  // and a panel would quantise differently with the window open and shut.
  assert.equal(api.quantizeNote(61, 60, 'major'), 62);
  assert.equal(api.quantizeNote(66, 60, 'major'), 67);
  assert.equal(api.quantizeNote(68, 60, 'major'), 69);
});

test('quantize keeps the octave it was given', () => {
  // pitch class, not pitch: snapping C#5 must not drop it to D4.
  assert.equal(api.quantizeNote(73, 60, 'major'), 74);
  assert.equal(api.quantizeNote(49, 60, 'major'), 50);
});

test('the key is a root, not a pitch — C major and C5 major are the same scale', () => {
  assert.equal(api.quantizeNote(61, 60, 'major'), api.quantizeNote(61, 72, 'major'));
  assert.equal(api.quantizeNote(61, 60, 'major'), api.quantizeNote(61, 'C4', 'major'));
});

test('every note in every scale quantises to itself, and everything else lands in the scale', () => {
  // The catch-all: 12 scales x 12 keys x 128 notes. A single wrong interval anywhere shows up here.
  for (const name of SCALE_NAMES) {
    for (let root = 60; root < 72; root += 1) {
      const pcs = new Set(SCALES[name].map((s) => (root + s) % 12));
      for (let n = 0; n < 128; n += 1) {
        const q = api.quantizeNote(n, root, name);
        assert.ok(pcs.has(((q % 12) + 12) % 12), `${name}/${root}: ${n} → ${q} is not in the scale`);
        assert.ok(Math.abs(q - n) <= 6, `${name}/${root}: ${n} → ${q} moved too far`);
      }
    }
  }
});

test('an unknown scale returns nothing rather than passing the note through', () => {
  // Passing it through would look like it worked. Nothing says it did not.
  assert.equal(api.quantizeNote(61, 60, 'nope'), undefined);
});

test('every declared chord and scale name is actually reachable', () => {
  for (const name of SCALE_NAMES) assert.ok(Array.isArray(api.scaleNotes(60, name)), name);
  for (const name of CHORD_NAMES) assert.ok(Array.isArray(api.chordNotes(60, name)), name);
});
