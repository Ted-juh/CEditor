// scriptMusic.test.js — ce.music: scales, chords, and snapping a note to a key.
//
// The verbs §2 defined the module as and phases 1–7 never delivered. Cross-runtime and pure, so
// these fixtures are the SAME ones CE/tests/ScriptRuntimeTests.cpp §25 runs through Lua, JavaScript
// and Python. If a number here changes, it has to change there too — that is the point of pinning
// the answers rather than the implementation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { get } from 'svelte/store';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
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

/* ================================================================ key, degree and voicing */
// Phase 12. Everything above answers a question about a note or a shape ON ITS OWN; everything
// below answers a question about a note IN A KEY — which is what the Chord Pad, the Harmoniser and
// the Arpeggiator each compute for themselves and no script could reach.
//
// These assert against the COMPONENTS' OWN FUNCTIONS, imported, not against numbers copied out of
// them. Copied numbers pin what the panel did on the day the test was written; an imported call
// pins what the panel does. The failure this exists to catch is a script labelling a pad "D♯m" next
// to a Chord Pad drawing "E♭m" — which no amount of cross-runtime agreement would notice, because
// all five runtimes would be equally wrong together.

import {
  useFlats, noteName as padNoteName, stackedChord, chordQuality as padChordQuality,
  romanNumeral, degreeChord as padDegreeChord, QUALITY_SUFFIX, scalePitchClasses,
  inScale as padInScale, NOTE_FLAT, NOTE_SHARP,
} from '../src/CE_Application/utils/chordPadLayout.js';
import { leadVoicing } from '../src/CE_Application/utils/harmoniserLayout.js';
import { orderNotes, expandOctaves as arpExpandOctaves, ARP_PATTERNS } from '../src/CE_Application/utils/arpLayout.js';

/* ------------------------------------------------------------------ the contract, again */

test('every phase-12 verb is declared, cross-runtime, and namespaced under ce.music', () => {
  for (const [id, path] of [
    ['noteSpelling', 'ce.music.spelling'], ['inScale', 'ce.music.inScale'],
    ['scaleDegree', 'ce.music.degree'], ['degreeChord', 'ce.music.degreeChord'],
    ['chordQuality', 'ce.music.quality'], ['voiceLead', 'ce.music.lead'],
    ['expandOctaves', 'ce.music.octaves'], ['arpOrder', 'ce.music.arp'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // Key arithmetic is arithmetic. Gating it to the open window would stop every generative idea
    // at the edge of the editor, which is the whole reason ce.music is RUNTIME_ANY.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});

/* ------------------------------------------------------------------------- noteNumber */

test('a name the panel PRINTED can be read back — all four accidental spellings', () => {
  // The bug this closes: the panel writes E♭, the script could only read E#-nothing, and noteNumber
  // returned 0 for anything else. 0 is a real note (C-1), so a flat name played the bottom of the
  // keyboard in silence.
  assert.equal(api.noteNumber('Eb4'), 63);
  assert.equal(api.noteNumber('E♭4'), 63);
  assert.equal(api.noteNumber('D#4'), 63);
  assert.equal(api.noteNumber('D♯4'), 63);
  assert.equal(api.noteNumber('C4'), 60);
});

test('every name the panel can print round-trips through noteNumber', () => {
  // The catch-all, and the one that would have caught the original bug on the day it shipped:
  // both of the app's spelling tables, over the whole MIDI range.
  for (let n = 0; n < 128; n += 1) {
    for (const flats of [true, false]) {
      const printed = api.noteName(n, flats);
      assert.equal(api.noteNumber(printed), n, `${printed} did not read back as ${n}`);
      assert.equal(printed, padNoteName(n, flats) + (Math.floor(n / 12) - 1),
        'the flat/sharp spelling must be the panel\'s own table');
    }
    assert.equal(api.noteNumber(api.noteName(n)), n, 'and the plain-ASCII spelling still round-trips');
  }
});

test('a flat lowers below the LETTER, so Cb is the B underneath', () => {
  assert.equal(api.noteNumber('Cb4'), 59, 'Cb4 is B3, an octave below where naive maths puts it');
  assert.equal(api.noteNumber('Fb4'), 64, 'Fb4 is E4');
  assert.equal(api.noteNumber('Db-1'), 1);
});

test('a name it cannot read returns nothing, not note 0', () => {
  for (const bad of ['nonsense', 'H4', 'C', '4C', 'C##4', 'Cbb4', 'B#3', '', 'C4 ']) {
    assert.equal(api.noteNumber(bad), undefined, `${JSON.stringify(bad)} must be unreadable, not C-1`);
  }
});

test('sendNote still puts a byte on the wire when the name is unreadable', () => {
  // noteNumber is honest; the MIDI path cannot be — a message needs a NUMBER. This pins that the
  // honesty did not leak out as an undefined byte in a MIDI message.
  clearScriptTrace();
  api.sendNote(1, 'nonsense', 100);
  const line = get(scriptTrace).find((e) => e.kind === 'midi');
  assert.ok(line, 'sendNote should have traced a message');
  assert.match(line.message, /90 00 64/, 'an unreadable name sends note 0, not an undefined byte');
});

/* -------------------------------------------------------------------------- noteSpelling */

test('spelling is the Chord Pad\'s own rule, for every key and every scale', () => {
  for (const name of SCALE_NAMES) {
    for (let root = 60; root < 72; root += 1) {
      assert.equal(api.noteSpelling(root, name), useFlats(root % 12, name),
        `${name} on ${root} must spell the way the Chord Pad spells it`);
    }
  }
});

test('the spelling follows the RELATIVE major, which is why C minor is not D♯', () => {
  assert.equal(api.noteSpelling(60, 'minor'), true, 'C minor spells E♭ and A♭');
  assert.equal(api.noteSpelling(60, 'major'), false, 'C major spells neither');
  assert.equal(api.noteSpelling(65, 'major'), true, 'F major spells B♭');
  assert.equal(api.noteSpelling(69, 'minor'), false, 'A minor spells nothing either');
  assert.equal(api.noteName(63, api.noteSpelling(60, 'minor')), 'E♭4',
    'and composing the two is what a script actually does');
});

test('spelling is a key question, so the octave does not matter', () => {
  assert.equal(api.noteSpelling(60, 'minor'), api.noteSpelling(72, 'minor'));
  assert.equal(api.noteSpelling('C4', 'minor'), api.noteSpelling(60, 'minor'));
});

test('an unknown scale has no spelling rather than a default one', () => {
  assert.equal(api.noteSpelling(60, 'lokrian'), undefined);
  assert.equal(api.noteSpelling(60), api.noteSpelling(60, 'major'));
});

/* --------------------------------------------------------------------- inScale / degree */

test('inScale agrees with the Harmoniser\'s membership test, everywhere', () => {
  for (const name of SCALE_NAMES) {
    for (let root = 60; root < 72; root += 1) {
      for (let n = 48; n < 84; n += 1) {
        assert.equal(api.inScale(n, root, name), padInScale(n, root % 12, SCALES[name]),
          `${name}/${root}: ${n}`);
      }
    }
  }
});

test('degree is 1-based, so the tonic is 1 and the dominant is 5', () => {
  assert.equal(api.scaleDegree(60, 60, 'major'), 1);
  assert.equal(api.scaleDegree(67, 60, 'major'), 5);
  assert.equal(api.scaleDegree(71, 60, 'major'), 7);
  // The Harmoniser numbers its degrees from 0 internally; the API does not, because a musician
  // counting degrees starts at I. The two must differ by exactly one, always.
  for (const name of SCALE_NAMES) {
    const pcs = scalePitchClasses(0, SCALES[name]);
    for (let n = 60; n < 72; n += 1) {
      const i = pcs.indexOf(n % 12);
      assert.equal(api.scaleDegree(n, 60, name), i === -1 ? undefined : i + 1, `${name}: ${n}`);
    }
  }
});

test('a note outside the key has NO degree — it is not rounded to one', () => {
  assert.equal(api.scaleDegree(61, 60, 'major'), undefined);
  assert.equal(api.inScale(61, 60, 'major'), false);
  // quantizeNote is the verb that rounds. Asking "which degree" and getting an answer for a note
  // that is not in the key is how a wrong note becomes a plausible chord.
  assert.equal(api.scaleDegree(api.quantizeNote(61, 60, 'major'), 60, 'major'), 2);
});

test('inScale and degree are octave-blind and agree with each other', () => {
  for (let n = 0; n < 128; n += 1) {
    assert.equal(api.inScale(n, 60, 'minor'), api.scaleDegree(n, 60, 'minor') !== undefined);
  }
  assert.equal(api.inScale(12, 60, 'major'), true, 'C0 is still the tonic of C major');
});

test('an unknown scale answers neither question', () => {
  assert.equal(api.inScale(60, 60, 'nope'), undefined);
  assert.equal(api.scaleDegree(60, 60, 'nope'), undefined);
});

/* ------------------------------------------------------------------------ chordQuality */

test('quality names what the Chord Pad names, for every chord in the table', () => {
  for (const name of CHORD_NAMES) {
    assert.equal(api.chordQuality(api.chordNotes(60, name)), padChordQuality(CHORDS[name]), name);
  }
});

test('quality is the inverse of chord for the qualities that have a name', () => {
  // Not every entry round-trips — power has no third, add9/dom9 add tones above the octave that
  // fold back onto the triad — so this asserts the ones that DO, by name.
  for (const name of ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4', 'maj7', 'dom7', 'min7',
                      'minMaj7', 'dim7', 'm7b5']) {
    const expected = { major: 'maj', minor: 'min' }[name] ?? name;
    assert.equal(api.chordQuality(api.chordNotes(60, name)), expected, name);
  }
});

test('quality reads intervals above the LOWEST note, so order and inversion do not matter', () => {
  assert.equal(api.chordQuality([67, 60, 64]), 'maj');
  assert.equal(api.chordQuality([60, 64, 67]), 'maj');
  // An inversion is a different chord bottom-up and honestly gets a different name — E G C read
  // from E is a minor sixth, not a C major. Pinned so nobody "fixes" it into root detection.
  assert.equal(api.chordQuality([64, 67, 72]), 'min');
});

test('quality of nothing is nothing', () => {
  assert.equal(api.chordQuality([]), undefined);
  assert.equal(api.chordQuality(null), undefined);
});

/* ------------------------------------------------------------------------- degreeChord */

test('degreeChord builds what the Chord Pad builds, for every key, scale and degree', () => {
  for (const name of SCALE_NAMES) {
    const steps = SCALES[name];
    for (let keyPc = 0; keyPc < 12; keyPc += 1) {
      const flats = useFlats(keyPc, name);
      for (let d = 0; d < steps.length; d += 1) {
        for (const size of [3, 4]) {
          const mine = api.degreeChord(keyPc + 60, name, d + 1, size);
          const theirs = padDegreeChord(keyPc, steps, d, size, flats);
          assert.deepEqual(mine.offsets, stackedChord(steps, d, size), `${name}/${keyPc}/${d}`);
          assert.equal(mine.quality, theirs.quality, `${name}/${keyPc}/${d} quality`);
          assert.equal(mine.name, theirs.name, `${name}/${keyPc}/${d} name`);
          assert.equal(mine.roman, theirs.roman, `${name}/${keyPc}/${d} roman`);
          assert.deepEqual(mine.names, theirs.noteNames, `${name}/${keyPc}/${d} note names`);
          // …and the part the Chord Pad keeps to itself: the actual MIDI notes.
          assert.deepEqual(mine.notes, mine.offsets.map((o) => keyPc + 60 + o));
          assert.equal(mine.rootNote, mine.notes[0]);
        }
      }
    }
  }
});

test('the familiar answers, spelled out', () => {
  const five = api.degreeChord(60, 'major', 5);
  assert.deepEqual(five.notes, [67, 71, 74], 'the V of C major is G B D');
  assert.equal(five.name, 'G');
  assert.equal(five.roman, 'V');
  const two = api.degreeChord(60, 'major', 2, 4);
  assert.equal(two.name, 'Dm7');
  assert.equal(two.roman, 'ii');
  const seven = api.degreeChord(60, 'major', 7);
  assert.equal(seven.quality, 'dim');
  assert.equal(seven.roman, 'vii°');
  // A borrowed degree reads as ♭III, which is the Chord Pad's own convention.
  assert.equal(api.degreeChord(60, 'minor', 3).roman, '♭III');
  assert.equal(api.degreeChord(60, 'minor', 3).name, 'E♭');
});

test('a minor key spells its chords with flats, because the panel does', () => {
  const iv = api.degreeChord('F4', 'minor', 4);
  assert.equal(iv.name, 'B♭m');
  assert.deepEqual(iv.names, ['B♭', 'D♭', 'F']);
  // The whole point: a script labelling a pad and a Chord Pad drawing one agree character for
  // character. D♯m and E♭m are the same chord and different labels.
  assert.equal(iv.name, padDegreeChord(5, SCALES.minor, 3, 3, useFlats(5, 'minor')).name);
});

test('a degree past the end of the scale keeps going an octave up', () => {
  const one = api.degreeChord(60, 'major', 1);
  const eight = api.degreeChord(60, 'major', 8);
  assert.deepEqual(eight.notes, one.notes.map((n) => n + 12), 'degree 8 is the I an octave up');
  assert.equal(eight.quality, one.quality);
});

test('degreeChord is a chord ON a degree — chordNotes is a shape, and they differ', () => {
  // The distinction the module exists to make. chordNotes(62, "major") is D major; the ii of C is
  // D MINOR, because the key decides the third.
  assert.deepEqual(api.chordNotes(62, 'major'), [62, 66, 69]);
  assert.deepEqual(api.degreeChord(60, 'major', 2).notes, [62, 65, 69]);
});

test('size and degree default the same way in every runtime', () => {
  // `0 || 3` is 3 in JavaScript and Python and 0 in Lua, so neither argument may lean on falsiness.
  assert.deepEqual(api.degreeChord(60, 'major', 1).notes, api.degreeChord(60, 'major', 1, 3).notes);
  assert.equal(api.degreeChord(60, 'major', 1, 0).notes.length, 2, 'a size below two is two');
  assert.equal(api.degreeChord(60, 'major', 0).degree, 0, 'degree 0 is the degree below the tonic');
  assert.deepEqual(api.degreeChord(60, 'major', 0).notes, [59, 62, 65], 'which is the VII underneath');
});

test('an unknown scale builds nothing', () => {
  assert.equal(api.degreeChord(60, 'lokrian', 1), undefined);
});

/* -------------------------------------------------------------------------- voiceLead */

test('voiceLead is the Harmoniser\'s rule, over a run of chords', () => {
  // A real progression rather than one chord: voice leading is a function of what came BEFORE, so
  // a single call cannot show that the choice carries.
  const progression = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72], [67, 71, 74]];
  for (const mode of ['closest', 'smooth', 'off']) {
    let prev = [];
    for (const chord of progression) {
      const mine = api.voiceLead(chord, prev, mode);
      assert.deepEqual(mine, leadVoicing(chord, prev, mode), `${mode}: ${chord}`);
      prev = mine;
    }
  }
});

test('closest moves the voices least, and smooth holds the top one still', () => {
  const prev = [59, 62, 67];                       // G7-ish, top B
  const closest = api.voiceLead([60, 64, 67], prev, 'closest');
  const smooth = api.voiceLead([60, 64, 67], prev, 'smooth');
  assert.deepEqual(closest, leadVoicing([60, 64, 67], prev, 'closest'));
  assert.deepEqual(smooth, leadVoicing([60, 64, 67], prev, 'smooth'));
  const top = (c) => c[c.length - 1];
  assert.ok(Math.abs(top(smooth) - top(prev)) <= Math.abs(top(closest) - top(prev)),
    'smooth must not move the melody further than closest does');
});

test('the notes are the same chord — a voicing transposes voices by octaves only', () => {
  const led = api.voiceLead([60, 64, 67], [59, 62, 67]);
  assert.deepEqual([...new Set(led.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b),
                   [0, 4, 7], 'the pitch classes must not change');
  assert.equal(led.length, 3, 'and no voice may be gained or lost');
});

test('with nothing to lead from, the chord comes back untouched', () => {
  assert.deepEqual(api.voiceLead([67, 60, 64], []), [60, 64, 67], 'sorted, but not re-voiced');
  assert.deepEqual(api.voiceLead([60, 64, 67], [59, 62, 67], 'off'), [60, 64, 67]);
  assert.deepEqual(api.voiceLead([], [60, 64, 67]), []);
});

test('a voicing never leaves the MIDI range', () => {
  for (const chord of [[0, 4, 7], [120, 124, 127], [60, 64, 67]]) {
    for (const prev of [[0], [127], [64]]) {
      for (const n of api.voiceLead(chord, prev)) {
        assert.ok(n >= 0 && n <= 127, `${chord} after ${prev} produced ${n}`);
      }
    }
  }
});

/* ------------------------------------------------------- expandOctaves and arpOrder */

test('expandOctaves is the Arpeggiator\'s own expansion', () => {
  for (const notes of [[60, 64, 67], [67, 60, 64], [120, 124], [60]]) {
    for (const oc of [1, 2, 3, 4]) {
      assert.deepEqual(api.expandOctaves(notes, oc), arpExpandOctaves(notes, oc), `${notes} x${oc}`);
    }
  }
});

test('a note that would leave the range is dropped, not stacked on 127', () => {
  assert.deepEqual(api.expandOctaves([120, 124], 2), [120, 124],
    'clamping would give 127 twice, which sounds like a stuck key rather than like nothing');
});

test('arpOrder is the Arpeggiator\'s own walk, for every pattern it offers', () => {
  for (const pattern of ARP_PATTERNS) {
    for (const notes of [[60, 64, 67], [60, 64], [60], [67, 60, 64]]) {
      assert.deepEqual(api.arpOrder(notes, pattern), orderNotes(notes, pattern),
        `${pattern}: ${notes}`);
    }
  }
});

test('every step is a list, so chord mode has the same shape as the rest', () => {
  assert.deepEqual(api.arpOrder([60, 64, 67], 'up'), [[60], [64], [67]]);
  assert.deepEqual(api.arpOrder([60, 64, 67], 'chord'), [[60, 64, 67]], 'one step, three notes');
});

test('updown and downup do not repeat the endpoints', () => {
  assert.deepEqual(api.arpOrder([60, 64, 67], 'updown'), [[60], [64], [67], [64]]);
  assert.deepEqual(api.arpOrder([60, 64, 67], 'downup'), [[67], [64], [60], [64]]);
  assert.deepEqual(api.arpOrder([60, 64], 'updown'), [[60], [64]], 'two notes have no middle');
});

test('the notes are taken in the order given, which is what makes asPlayed mean anything', () => {
  assert.deepEqual(api.arpOrder([67, 60, 64], 'asPlayed'), [[67], [60], [64]]);
  assert.deepEqual(api.arpOrder([67, 60, 64], 'down'), [[64], [60], [67]], 'down reverses what it got');
  // Sorting first is the caller's job, and expandOctaves is how you ask for it.
  assert.deepEqual(api.arpOrder(api.expandOctaves([67, 60, 64]), 'up'), [[60], [64], [67]]);
});

test('random returns the input order — the panel draws its step at play time', () => {
  // Pinned rather than left implicit: a script expecting a shuffled WALK would otherwise get a
  // rising one and blame the seed. shuffle() is the verb that shuffles, and it is repeatable.
  assert.deepEqual(api.arpOrder([60, 64, 67], 'random'), api.arpOrder([60, 64, 67], 'up'));
});

test('no notes is no steps', () => {
  assert.deepEqual(api.arpOrder([], 'up'), []);
  assert.deepEqual(api.expandOctaves([], 2), []);
});
