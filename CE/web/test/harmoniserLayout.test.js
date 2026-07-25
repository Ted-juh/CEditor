import test from 'node:test';
import assert from 'node:assert/strict';
import {
  harmoniserMode, harmoniserKey, harmoniserScaleName, harmoniserChannel,
  harmoniserSize, harmoniserVoicing, harmoniserInversion, memoryShape,
  MEMORY_PRESETS, memoryPresetShape, HARMONY_MODES, VOICINGS, MAX_VOICES,
  degreeOfNote, outOfKeyMode, OUT_OF_KEY,
  chordForNote, chordLabel,
  EMPTY_HELD, pressHarmony, releaseHarmony, releaseAllHarmony,
  soundingPitches, heldInputNotes, reconcileHarmony,
  harmoniserRange, isBlackKey, harmoniserKeys,
  harmoniserScriptPatch, HARMONISER_SCRIPT_ACTIONS,
  overrideForDegree, voiceLeading, leadVoicing, VOICE_LEADING,
  strumDelays, harmoniserStrum,
} from '../src/CE_Application/utils/harmoniserLayout.js';

function hm(c) { return { _children: { Core: { controlType: 'Harmoniser' }, Harmoniser: c } }; }
// C major, triads, the played note kept.
const CMAJ = hm({ mode: 'diatonic', key: 0, scale: 'major', size: 3, channel: 1, keepPlayed: true });

test('config clamps and falls back', () => {
  assert.equal(harmoniserMode(hm({})), 'diatonic');
  assert.equal(harmoniserMode(hm({ mode: 'nope' })), 'diatonic');
  assert.equal(harmoniserKey(hm({ key: 14 })), 2, 'wraps');
  assert.equal(harmoniserScaleName(hm({ scale: 'nope' })), 'major');
  assert.equal(harmoniserChannel(hm({ channel: 0 })), 1);
  assert.equal(harmoniserSize(hm({ size: 99 })), 6);
  assert.equal(harmoniserVoicing(hm({ voicing: 'nope' })), 'close');
  assert.equal(harmoniserInversion(hm({ inversion: 9 })), 3);
  assert.equal(HARMONY_MODES.length, 2);
  assert.equal(VOICINGS.length, 3);
  assert.equal(OUT_OF_KEY.length, 3);
});

// --- Diatonic --------------------------------------------------------------------
test('diatonic harmony is correct by construction', () => {
  // Play C in C major → C E G. Play D → D F A, which is D MINOR, because that
  // is the chord on the second degree. That is the whole point: the harmony
  // follows the key, so it cannot be wrong.
  assert.deepEqual(chordForNote(CMAJ, 60), [60, 64, 67]);
  assert.deepEqual(chordForNote(CMAJ, 62), [62, 65, 69]);
  assert.deepEqual(chordForNote(CMAJ, 71), [71, 74, 77], 'the vii° comes out diminished');
  assert.equal(degreeOfNote(CMAJ, 60), 0);
  assert.equal(degreeOfNote(CMAJ, 62), 1);
  assert.equal(degreeOfNote(CMAJ, 61), null, 'C♯ is not in C major');
});

test('a bigger chord stacks further up the scale', () => {
  const sevenths = hm({ ...CMAJ._children.Harmoniser, size: 4 });
  assert.deepEqual(chordForNote(sevenths, 60), [60, 64, 67, 71], 'Cmaj7');
  const ninths = hm({ ...CMAJ._children.Harmoniser, size: 5 });
  assert.equal(chordForNote(ninths, 60).length, 5);
});

test('a note out of key is a stated rule, not a guess', () => {
  const base = CMAJ._children.Harmoniser;
  // Pass: you still hear what you played, with no harmony on it.
  assert.deepEqual(chordForNote(hm({ ...base, outOfKey: 'pass' }), 61), [61]);
  // Mute: silence.
  assert.deepEqual(chordForNote(hm({ ...base, outOfKey: 'mute' }), 61), []);
  // Nearest: harmonise the scale tone next door — C♯ rounds down to C.
  assert.deepEqual(chordForNote(hm({ ...base, outOfKey: 'nearest' }), 61), [60, 64, 67]);
  assert.equal(outOfKeyMode(hm({})), 'pass', 'the default keeps you audible');
  // Pass with the played note dropped is genuinely nothing.
  assert.deepEqual(chordForNote(hm({ ...base, outOfKey: 'pass', keepPlayed: false }), 61), []);
});

// --- Chord memory ----------------------------------------------------------------
test('memory mode transposes a shape, in key or out of it', () => {
  // This is what a hardware chord-memory button does, parallel fifths and all —
  // and people expect exactly that.
  const mem = hm({ mode: 'memory', shape: [0, 4, 7], channel: 1, keepPlayed: true });
  assert.deepEqual(chordForNote(mem, 60), [60, 64, 67]);
  assert.deepEqual(chordForNote(mem, 61), [61, 65, 68], 'C♯ major — no key to be wrong about');
  assert.deepEqual(chordForNote(mem, 62), [62, 66, 69]);
  // The shape is normalised: deduped, sorted, clamped, capped.
  assert.deepEqual(memoryShape(hm({ shape: [7, 0, 4, 7] })), [0, 4, 7]);
  assert.deepEqual(memoryShape(hm({ shape: [] })), [0], 'never empty');
  assert.equal(memoryShape(hm({ shape: Array.from({ length: 20 }, (_, i) => i) })).length, MAX_VOICES);
  assert.deepEqual(memoryPresetShape('min7'), [0, 3, 7, 10]);
  assert.deepEqual(memoryPresetShape('nonsense'), MEMORY_PRESETS[0].shape, 'unknown falls back');
});

test('a shape can drop the note you played', () => {
  // 0 is in the list rather than implied, so "harmony only" is expressible.
  const mem = hm({ mode: 'memory', shape: [4, 7], keepPlayed: false });
  assert.deepEqual(chordForNote(mem, 60), [64, 67], 'the root is gone');
});

// --- Voicing ---------------------------------------------------------------------
test('inversions lift the lowest voice, one at a time', () => {
  const base = { mode: 'memory', shape: [0, 4, 7], keepPlayed: false };
  assert.deepEqual(chordForNote(hm({ ...base, inversion: 0 }), 60), [60, 64, 67]);
  assert.deepEqual(chordForNote(hm({ ...base, inversion: 1 }), 60), [64, 67, 72]);
  assert.deepEqual(chordForNote(hm({ ...base, inversion: 2 }), 60), [67, 72, 76]);
});

test('open lifts the middle and drop 2 drops the second from the top', () => {
  const base = { mode: 'memory', shape: [0, 4, 7], keepPlayed: false };
  assert.deepEqual(chordForNote(hm({ ...base, voicing: 'open' }), 60), [60, 67, 76]);
  assert.deepEqual(chordForNote(hm({ ...base, voicing: 'drop2' }), 60), [52, 60, 67]);
  // A two-note shape has no middle and no second-from-top to move.
  assert.deepEqual(chordForNote(hm({ mode: 'memory', shape: [0, 7], keepPlayed: false, voicing: 'open' }), 60), [60, 67]);
});

test('notes off the end are dropped, not clamped, and voices are capped', () => {
  // Clamping stacks strays on one pitch, which sounds like a stuck key.
  const high = hm({ mode: 'memory', shape: [0, 12, 24], keepPlayed: false });
  assert.deepEqual(chordForNote(high, 120), [120], '132 and 144 do not exist');
  const capped = hm({ mode: 'memory', shape: [0, 3, 5, 7, 9], keepPlayed: false, maxVoices: 3 });
  assert.equal(chordForNote(capped, 60).length, 3);
});

test('the label says what came out', () => {
  assert.match(chordLabel(CMAJ, 60), /^C/);
  assert.match(chordLabel(CMAJ, 62), /^D/);
  assert.match(chordLabel(CMAJ, 61), /out of key/);
  assert.match(chordLabel(hm({ mode: 'memory', shape: [0, 3, 7] }), 60), /^C/);
});

// --- The two rules that matter ------------------------------------------------
test('a note-off releases what its note-on sent, not what the settings say now', () => {
  // The trap that has now bitten the Splitter, the Sequencer and this. Change
  // the key while a finger is down and a re-derived release lets go of pitches
  // that were never started.
  const down = pressHarmony(EMPTY_HELD, CMAJ, 60, 100);
  assert.deepEqual(down.sends.map((s) => s.note), [60, 64, 67]);
  const moved = hm({ ...CMAJ._children.Harmoniser, key: 5 });   // now F major
  const up = releaseHarmony(down.held, moved, 60);
  assert.deepEqual(up.sends.map((s) => s.note), [60, 64, 67], 'still the right notes');
  assert.deepEqual(soundingPitches(up.held), []);
});

test('a pitch two fingers share is released by the LAST one, not the first', () => {
  // In C major, C and E a third apart both contain E and G. Naively releasing
  // C would silence notes E is still holding — the bug that only shows up when
  // you play more than one note, which is most of the time.
  const a = pressHarmony(EMPTY_HELD, CMAJ, 60, 100);   // C E G
  const b = pressHarmony(a.held, CMAJ, 64, 100);       // E G B
  // G and E are already sounding, so only B starts.
  assert.deepEqual(b.sends.map((s) => s.note), [71]);
  assert.deepEqual(soundingPitches(b.held), [60, 64, 67, 71]);
  const upC = releaseHarmony(b.held, CMAJ, 60);
  assert.deepEqual(upC.sends.map((s) => s.note), [60], 'only C stops — E and G are still held');
  assert.deepEqual(soundingPitches(upC.held), [64, 67, 71]);
  const upE = releaseHarmony(upC.held, CMAJ, 64);
  assert.deepEqual(upE.sends.map((s) => s.note), [64, 67, 71]);
  assert.deepEqual(soundingPitches(upE.held), []);
});

test('a retrigger with no release lets the old chord go first', () => {
  const a = pressHarmony(EMPTY_HELD, CMAJ, 60, 100);
  const b = pressHarmony(a.held, CMAJ, 60, 120);
  assert.deepEqual(heldInputNotes(b.held), [60], 'not two entries for one key');
  assert.deepEqual(soundingPitches(b.held), [60, 64, 67]);
  // A release with no press invents nothing.
  const none = releaseHarmony(EMPTY_HELD, CMAJ, 60);
  assert.equal(none.held, EMPTY_HELD);
  assert.deepEqual(none.sends, []);
});

test('release-all sends each sounding pitch exactly once', () => {
  const a = pressHarmony(EMPTY_HELD, CMAJ, 60, 100);
  const b = pressHarmony(a.held, CMAJ, 64, 100);
  const all = releaseAllHarmony(b.held);
  const notes = all.sends.map((s) => s.note).sort((x, y) => x - y);
  assert.deepEqual(notes, [60, 64, 67, 71], 'a doubled pitch is one sounding note');
  assert.deepEqual(soundingPitches(all.held), []);
});

test('reconcile sends nothing when nothing changed', () => {
  // Otherwise the input pump retriggers every held note on every frame.
  const first = reconcileHarmony(EMPTY_HELD, CMAJ, [{ note: 60, velocity: 100 }]);
  assert.equal(first.sends.length, 3);
  const same = reconcileHarmony(first.held, CMAJ, [{ note: 60, velocity: 100 }]);
  assert.deepEqual(same.sends, []);
  assert.equal(same.held, first.held, 'the same object, so no re-render');
  const gone = reconcileHarmony(first.held, CMAJ, []);
  assert.deepEqual(gone.sends.map((s) => s.note), [60, 64, 67]);
  // A note held by the mouse survives an input pump that doesn't know about it.
  const kept = reconcileHarmony(first.held, CMAJ, [], 60);
  assert.deepEqual(kept.sends, []);
});

// --- Geometry -------------------------------------------------------------------
test('the keyboard fits the chord', () => {
  const held = pressHarmony(EMPTY_HELD, CMAJ, 60, 100).held;
  const r = harmoniserRange(held, CMAJ);
  assert.ok(r.lo <= 60 && r.hi >= 67);
  const empty = harmoniserRange(EMPTY_HELD, CMAJ, 48, 24);
  assert.deepEqual(empty, { lo: 48, hi: 72 });
  // A wide chord is not cropped.
  const wide = harmoniserRange({ counts: { 36: 1, 96: 1 }, byNote: {} }, CMAJ);
  assert.ok(wide.lo <= 36 && wide.hi >= 96);
});

test('black keys sit on top of the whites, between their neighbours', () => {
  assert.equal(isBlackKey(61), true);
  assert.equal(isBlackKey(60), false);
  const keys = harmoniserKeys({ lo: 60, hi: 72 }, 300, 100, 8, 22);
  const whites = keys.filter((k) => !k.black);
  const blacks = keys.filter((k) => k.black);
  assert.equal(whites.length, 8, 'C to C is eight white keys');
  assert.equal(blacks.length, 5);
  // Drawn after, so they paint over.
  assert.ok(keys.indexOf(blacks[0]) > keys.indexOf(whites[whites.length - 1]));
  assert.ok(blacks.every((b) => b.h < whites[0].h), 'and they are shorter');
});

test('a fixed velocity overrides the played one; 0 means follow', () => {
  // One number rather than a flag plus a number, which could disagree.
  const organ = hm({ ...CMAJ._children.Harmoniser, velocity: 90 });
  assert.deepEqual(pressHarmony(EMPTY_HELD, organ, 60, 30).sends.map((s) => s.velocity), [90, 90, 90]);
  assert.deepEqual(pressHarmony(EMPTY_HELD, CMAJ, 60, 30).sends.map((s) => s.velocity), [30, 30, 30]);
});

// --- the script API ------------------------------------------------------------------

test('a harmoniser script patch only names what it changes', () => {
  const cfg = { mode: 'diatonic', key: 0, scale: 'major', size: 3, voicing: 'close', keepPlayed: true };
  assert.deepEqual(harmoniserScriptPatch(cfg, 'scale', { scale: 'dorian' }), { scale: 'dorian' });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'mode', { mode: 'memory' }), { mode: 'memory' });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'size', { size: 4 }), { size: 4 });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'voicing', { voicing: 'drop2' }), { voicing: 'drop2' });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'octave', { octave: -1 }), { octaveSpread: -1 });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'outOfKey', { outOfKey: 'mute' }), { outOfKey: 'mute' });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'keepPlayed', { keepPlayed: false }), { keepPlayed: false });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'keepPlayed', { keepPlayed: true }), {}, 'already so');
  for (const action of HARMONISER_SCRIPT_ACTIONS) {
    assert.ok(Object.keys(harmoniserScriptPatch(cfg, action, {})).length <= 1);
  }
});

test('the key wraps rather than clamping', () => {
  // Twelve steps of one semitone come back to where they started.
  let key = 0;
  for (let i = 0; i < 12; i += 1) key = harmoniserScriptPatch({ key }, 'key', { key: key + 1 }).key;
  assert.equal(key, 0);
  assert.equal(harmoniserScriptPatch({}, 'key', { key: -1 }).key, 11);
});

test('a shape comes from a preset name or an explicit list', () => {
  assert.deepEqual(harmoniserScriptPatch({}, 'shape', { shape: 'min7' }).shape, [0, 3, 7, 10]);
  assert.deepEqual(harmoniserScriptPatch({}, 'shape', { shape: [0, 5, 7] }).shape, [0, 5, 7]);
  // An unknown preset is a NO-OP, not silently the first preset. The UI falls
  // back for a dropdown; a script typo must not quietly rewrite the shape.
  assert.deepEqual(harmoniserScriptPatch({}, 'shape', { shape: 'majorr' }), {});
  assert.deepEqual(harmoniserScriptPatch({}, 'shape', { shape: [] }), {});
});

test('a bad harmoniser argument is a no-op, not a throw', () => {
  const cfg = { mode: 'diatonic', key: 0, scale: 'major' };
  assert.deepEqual(harmoniserScriptPatch(cfg, 'scale', { scale: 'dorain' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'mode', { mode: 'telepathic' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'voicing', { voicing: 'wide' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'outOfKey', { outOfKey: 'panic' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'key', { key: 'up' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'nonsense', {}), {});
  assert.deepEqual(harmoniserScriptPatch(null, 'nonsense', {}), {});
});

// --- overrides, voice leading, strum --------------------------------------------

test('an override replaces one degree and leaves the other six alone', () => {
  // Diatonic mode is "in key by construction"; an override is a named exception
  // you asked for, not a hole in the rule.
  const c = hm({ ...CMAJ._children.Harmoniser, degreeChords: { 5: [0, 5, 7] } });
  assert.deepEqual(chordForNote(c, 69), [69, 74, 76], 'the vi is now A sus4');
  assert.deepEqual(chordForNote(c, 60), [60, 64, 67], 'the I is untouched');
  assert.deepEqual(chordForNote(c, 62), [62, 65, 69]);
  assert.equal(overrideForDegree(c, 5).length, 3);
  assert.equal(overrideForDegree(c, 0), null);
  assert.equal(overrideForDegree(CMAJ, 5), null, 'no overrides at all');
  assert.equal(overrideForDegree(hm({ degreeChords: { 5: [] } }), 5), null, 'an empty list is not an override');
});

test('voice leading is off by default and needs something to lead from', () => {
  // It makes the harmony depend on what you played BEFORE, which is a real
  // behavioural change rather than a refinement — so it is opt-in.
  assert.equal(voiceLeading(hm({})), 'off');
  assert.equal(voiceLeading(hm({ voiceLeading: 'nonsense' })), 'off');
  assert.deepEqual(leadVoicing([65, 69, 72], [], 'closest'), [65, 69, 72], 'no previous chord');
  assert.deepEqual(leadVoicing([65, 69, 72], [60, 64, 67], 'off'), [65, 69, 72]);
  assert.deepEqual(leadVoicing([], [60], 'closest'), []);
});

test('closest moves least overall; smooth holds the top voice still', () => {
  const prev = [60, 64, 67];                        // C major
  const f = [65, 69, 72];                           // F major, root position
  const closest = leadVoicing(f, prev, 'closest');
  assert.ok(closest.length === 3);
  // Whatever it picks must move less than root position did.
  const motion = (ch) => ch.reduce((sum, n) => sum + Math.min(...prev.map((m) => Math.abs(n - m))), 0);
  assert.ok(motion(closest) <= motion(f));
  // Smooth judges the TOP voice only, so its top note is at least as close.
  const smooth = leadVoicing(f, prev, 'smooth');
  assert.ok(Math.abs(smooth[smooth.length - 1] - prev[prev.length - 1])
    <= Math.abs(f[f.length - 1] - prev[prev.length - 1]));
  // Deterministic: the same input always gives the same answer.
  assert.deepEqual(leadVoicing(f, prev, 'closest'), closest);
});

test('voice leading never moves the note you played', () => {
  // Otherwise the harmoniser would be transposing your own performance.
  const c = hm({ ...CMAJ._children.Harmoniser, voiceLeading: 'closest' });
  let h = pressHarmony(EMPTY_HELD, c, 60, 100);
  h = releaseHarmony(h.held, c, 60);
  const next = pressHarmony(h.held, c, 65, 100);
  assert.ok(next.sends.map((s) => s.note).includes(65), 'the played F is still an F');
  // `last` survives a release, so one-note-at-a-time playing still leads.
  assert.deepEqual(h.held.last, [60, 64, 67]);
});

test('strum spreads the chord and reverses on the way down', () => {
  assert.deepEqual(strumDelays(hm({ strumMs: 60 }), 3), [0, 30, 60]);
  assert.deepEqual(strumDelays(hm({ strumMs: 60, strumDirection: 'down' }), 3), [60, 30, 0]);
  assert.deepEqual(strumDelays(hm({ strumMs: 0 }), 3), [0, 0, 0], 'together by default');
  assert.deepEqual(strumDelays(hm({ strumMs: 60 }), 0), []);
  assert.equal(harmoniserStrum(hm({ strumMs: 9999 })), 400, 'capped');
});

test('a scripted degree override sets and clears', () => {
  const cfg = { mode: 'diatonic', key: 0, scale: 'major', degreeChords: {} };
  const set = harmoniserScriptPatch(cfg, 'degree', { degree: 6, chord: [0, 5, 7] });
  assert.deepEqual(set.degreeChords['5'], [0, 5, 7], '1-based in, 0-based stored');
  const cleared = harmoniserScriptPatch({ ...cfg, degreeChords: { 5: [0, 5, 7] } }, 'degree', { degree: 6, chord: null });
  assert.deepEqual(cleared.degreeChords, {});
  // A degree the scale doesn't have, or a chord that isn't one: no-ops.
  assert.deepEqual(harmoniserScriptPatch(cfg, 'degree', { degree: 9, chord: [0, 4, 7] }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'degree', { degree: 0, chord: [0, 4, 7] }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'degree', { degree: 2, chord: 'major' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'voiceLeading', { voiceLeading: 'smooth' }), { voiceLeading: 'smooth' });
  assert.deepEqual(harmoniserScriptPatch(cfg, 'voiceLeading', { voiceLeading: 'psychic' }), {});
  assert.deepEqual(harmoniserScriptPatch(cfg, 'strum', { ms: 40 }), { strumMs: 40 });
});
