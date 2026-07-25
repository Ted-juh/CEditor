import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMidiHex, splitMidiMessages, noteEvent, noteEventsFromHex,
  EMPTY_NOTE_STATE, applyNoteEvent, applyNoteEvents, applyMidiHex,
  heldNotes, heldNoteEntries, isNoteHeld,
  EMPTY_EXPRESSION_STATE, expressionEvent, applyExpressionHex,
  ccValue, aftertouchValue, velocityValue,
  polyAftertouchValue, polyPressureEntries, POLY_PRESSURE_MODES,
  notePressure, noteLevels,
  EMPTY_LEARN_STATE, applyLearnHex, learnCandidates, learnBest, learnCandidateLabel,
} from '../src/CE_Application/utils/midiNoteInput.js';

test('hex parsing accepts the shapes the bridge and humans produce', () => {
  assert.deepEqual(parseMidiHex('90 3C 60'), [0x90, 0x3C, 0x60]);
  assert.deepEqual(parseMidiHex('903C60'), [0x90, 0x3C, 0x60]);
  assert.deepEqual(parseMidiHex('0x90,0x3c,0x60'), [0x90, 0x3C, 0x60]);
  assert.deepEqual(parseMidiHex('  90   3c  '), [0x90, 0x3C]);
  assert.deepEqual(parseMidiHex(''), []);
  assert.deepEqual(parseMidiHex(null), []);
  assert.deepEqual(parseMidiHex('zz 90'), [0x90]);      // junk dropped, not NaN
});

test('message splitting: multiple messages, running status, sysex, realtime', () => {
  assert.deepEqual(splitMidiMessages([0x90, 60, 96]), [[0x90, 60, 96]]);
  // two complete messages in one blob
  assert.deepEqual(splitMidiMessages([0x90, 60, 96, 0x80, 60, 0]),
    [[0x90, 60, 96], [0x80, 60, 0]]);
  // running status: the second note omits its status byte
  assert.deepEqual(splitMidiMessages([0x90, 60, 96, 64, 100]),
    [[0x90, 60, 96], [0x90, 64, 100]]);
  // one-data-byte messages
  assert.deepEqual(splitMidiMessages([0xC0, 5]), [[0xC0, 5]]);
  assert.deepEqual(splitMidiMessages([0xD0, 40]), [[0xD0, 40]]);
  // sysex is skipped whole, and the note after it still parses
  assert.deepEqual(splitMidiMessages([0xF0, 0x43, 0x10, 0xF7, 0x90, 60, 96]),
    [[0x90, 60, 96]]);
  // realtime bytes come through as single-byte messages
  assert.deepEqual(splitMidiMessages([0xF8]), [[0xF8]]);
  // a truncated tail is dropped rather than emitting a half message
  assert.deepEqual(splitMidiMessages([0x90, 60]), []);
  // an orphan data byte with no running status is ignored
  assert.deepEqual(splitMidiMessages([60, 96]), []);
});

test('note events, including velocity-0 as a note off', () => {
  assert.deepEqual(noteEvent([0x90, 60, 96]), { kind: 'noteOn', channel: 1, note: 60, velocity: 96 });
  assert.deepEqual(noteEvent([0x99, 36, 100]), { kind: 'noteOn', channel: 10, note: 36, velocity: 100 });
  assert.deepEqual(noteEvent([0x80, 60, 0]), { kind: 'noteOff', channel: 1, note: 60, velocity: 0 });
  // note-on with velocity 0 IS a note off — how hardware releases under running status
  assert.deepEqual(noteEvent([0x90, 60, 0]), { kind: 'noteOff', channel: 1, note: 60, velocity: 0 });
  assert.equal(noteEvent([0xB0, 7, 100]), null);                     // ordinary CC
  assert.equal(noteEvent([0xB0, 123, 0]).kind, 'allNotesOff');
  assert.equal(noteEvent([0xB0, 120, 0]).kind, 'allNotesOff');
  assert.equal(noteEvent([0xFF]).kind, 'reset');
  assert.equal(noteEvent([]), null);
});

test('noteEventsFromHex runs the whole chain', () => {
  const evs = noteEventsFromHex('90 3C 60 40 64');   // running status: C4 then E4
  assert.equal(evs.length, 2);
  assert.deepEqual(evs.map((e) => e.note), [60, 64]);
  assert.ok(evs.every((e) => e.kind === 'noteOn'));
});

test('the reducer tracks held notes and is pure', () => {
  let s = EMPTY_NOTE_STATE;
  s = applyMidiHex(s, '90 3C 60');
  const afterFirst = s;
  assert.deepEqual(heldNotes(s), [60]);
  s = applyMidiHex(s, '90 40 60');
  assert.deepEqual(heldNotes(s), [60, 64]);
  assert.deepEqual(heldNotes(afterFirst), [60]);        // the old state is untouched
  s = applyMidiHex(s, '80 3C 00');
  assert.deepEqual(heldNotes(s), [64]);
  // releasing something that isn't held returns the SAME object (no churn)
  assert.equal(applyMidiHex(s, '80 24 00'), s);
  // and so does re-sending an identical note-on
  assert.equal(applyMidiHex(s, '90 40 60'), s);
  // …but a new velocity on the same note does update
  assert.notEqual(applyMidiHex(s, '90 40 20'), s);
});

test('the same pitch on two channels stays distinct', () => {
  let s = applyMidiHex(EMPTY_NOTE_STATE, '90 3C 60');   // ch 1
  s = applyMidiHex(s, '99 3C 64');                      // ch 10
  assert.equal(heldNoteEntries(s).length, 2);
  assert.deepEqual(heldNotes(s), [60]);                 // deduped for display
  assert.deepEqual(heldNotes(s, 1), [60]);
  assert.deepEqual(heldNotes(s, 10), [60]);
  assert.deepEqual(heldNotes(s, 2), []);
  // releasing on channel 1 leaves channel 10 sounding
  s = applyMidiHex(s, '80 3C 00');
  assert.deepEqual(heldNoteEntries(s).map((v) => v.channel), [10]);
});

test('all-notes-off clears just its channel; reset clears everything', () => {
  let s = applyMidiHex(EMPTY_NOTE_STATE, '90 3C 60');
  s = applyMidiHex(s, '99 24 64');
  s = applyMidiHex(s, 'B0 7B 00');                      // all notes off, ch 1
  assert.deepEqual(heldNoteEntries(s).map((v) => v.channel), [10]);
  s = applyMidiHex(s, 'FF');
  assert.deepEqual(heldNotes(s), []);
  // an all-notes-off with nothing held on that channel is a no-op
  const empty = applyMidiHex(EMPTY_NOTE_STATE, 'B0 7B 00');
  assert.equal(empty, EMPTY_NOTE_STATE);
});

test('velocity + channel survive into the entries, and isNoteHeld filters', () => {
  const s = applyNoteEvents(EMPTY_NOTE_STATE, [
    { kind: 'noteOn', channel: 10, note: 36, velocity: 118 },
    { kind: 'noteOn', channel: 10, note: 42, velocity: 60 },
  ]);
  // `at` is the arrival stamp — 0 here because no clock was passed in. The
  // Phrase Recorder uses it to place a note where it happened rather than where
  // the frame that noticed it happened to be.
  assert.deepEqual(heldNoteEntries(s, 10), [
    { note: 36, channel: 10, velocity: 118, at: 0 },
    { note: 42, channel: 10, velocity: 60, at: 0 },
  ]);
  assert.equal(isNoteHeld(s, 36), true);
  assert.equal(isNoteHeld(s, 36, 10), true);
  assert.equal(isNoteHeld(s, 36, 1), false);
  assert.equal(isNoteHeld(s, 99), false);
  // a null event / null state never throws
  assert.equal(applyNoteEvent(null, null), EMPTY_NOTE_STATE);
  assert.deepEqual(heldNotes(null), []);
});

test('a chord arriving as one blob lands as one state', () => {
  // three note-ons under running status, as a keyboard would send a C major triad
  const s = applyMidiHex(EMPTY_NOTE_STATE, '90 3C 64 40 60 43 5E');
  assert.deepEqual(heldNotes(s), [60, 64, 67]);
});

// --- expression controllers ---------------------------------------------------

test('expression events: CC, channel aftertouch, note velocity', () => {
  assert.deepEqual(expressionEvent([0xB0, 1, 64]), { kind: 'cc', channel: 1, cc: 1, value: 64 });
  assert.deepEqual(expressionEvent([0xB9, 11, 100]), { kind: 'cc', channel: 10, cc: 11, value: 100 });
  assert.deepEqual(expressionEvent([0xD0, 40]), { kind: 'aftertouch', channel: 1, value: 40 });
  // a note-on doubles as the velocity source; a release carries no dynamics
  assert.deepEqual(expressionEvent([0x90, 60, 96]), { kind: 'velocity', channel: 1, value: 96 });
  assert.deepEqual(expressionEvent([0x90, 60, 0]), { kind: 'pressureClear', channel: 1, note: 60 });
  assert.deepEqual(expressionEvent([0x80, 60, 0]), { kind: 'pressureClear', channel: 1, note: 60 });
  // channel-mode messages aren't controllers, but 120/123 must still reach the
  // reducer so stale per-note pressure gets dropped
  assert.deepEqual(expressionEvent([0xB0, 123, 0]), { kind: 'pressureClearAll', channel: 1 });
  assert.deepEqual(expressionEvent([0xB0, 120, 0]), { kind: 'pressureClearAll', channel: 1 });
  assert.equal(expressionEvent([0xB0, 121, 0]), null);        // other channel-mode: ignored
  // Pitch bend USED to return null here — it wasn't a router source. The Zone
  // Splitter needs to forward it, so it's parsed now, with the 14-bit value
  // kept intact alongside a 0-127 scaling. It still reaches no expression
  // bucket: applyExpressionEvent ignores kinds it doesn't know.
  assert.deepEqual(expressionEvent([0xE0, 0, 64]), { kind: 'bend', channel: 1, value14: 8192, value: 64 });
  assert.deepEqual(expressionEvent([0xE2, 0x7F, 0x7F]), { kind: 'bend', channel: 3, value14: 16383, value: 127 });
  assert.equal(applyExpressionHex(EMPTY_EXPRESSION_STATE, 'E0 00 40'), EMPTY_EXPRESSION_STATE,
    'and it must not disturb the expression state the Router reads');
});

test('expression state tracks the last value per controller', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'B0 01 40');
  assert.equal(ccValue(s, 1), 64);
  assert.equal(ccValue(s, 2), undefined);                    // never seen ≠ zero
  s = applyExpressionHex(s, 'B0 01 7F');
  assert.equal(ccValue(s, 1), 127);
  // re-sending the same value returns the SAME object (no re-render churn)
  assert.equal(applyExpressionHex(s, 'B0 01 7F'), s);
  // …and a real zero is distinguishable from absent
  s = applyExpressionHex(s, 'B0 01 00');
  assert.equal(ccValue(s, 1), 0);
  assert.notEqual(ccValue(s, 1), undefined);
});

test('aftertouch and velocity have their own buckets', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'D0 28');
  assert.equal(aftertouchValue(s), 40);
  assert.equal(velocityValue(s), undefined);
  s = applyExpressionHex(s, '90 3C 60');
  assert.equal(velocityValue(s), 96);
  assert.equal(aftertouchValue(s), 40);                      // untouched
  // running status: two note-ons in one blob, the later velocity wins
  s = applyExpressionHex(s, '90 3C 20 40 70');
  assert.equal(velocityValue(s), 112);
});

test('omni lookup picks the most recently updated channel', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'B0 01 10');   // ch 1 → 16
  s = applyExpressionHex(s, 'B9 01 60');                            // ch 10 → 96
  assert.equal(ccValue(s, 1, 1), 16);
  assert.equal(ccValue(s, 1, 10), 96);
  assert.equal(ccValue(s, 1, 0), 96);        // omni → the newer one
  assert.equal(ccValue(s, 1, 5), undefined); // a channel that never sent
  s = applyExpressionHex(s, 'B0 01 20');     // ch 1 moves again
  assert.equal(ccValue(s, 1, 0), 32);        // omni follows it
  // the same for aftertouch
  let a = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'D0 10');
  a = applyExpressionHex(a, 'D9 60');
  assert.equal(aftertouchValue(a, 0), 96);
  assert.equal(aftertouchValue(a, 1), 16);
});

test('note and expression states are folded from the same bytes independently', () => {
  const hex = '90 3C 60';   // one note-on: a held note AND a velocity reading
  assert.deepEqual(heldNotes(applyMidiHex(EMPTY_NOTE_STATE, hex)), [60]);
  assert.equal(velocityValue(applyExpressionHex(EMPTY_EXPRESSION_STATE, hex)), 96);
  // …and a CC touches only the expression side
  assert.deepEqual(heldNotes(applyMidiHex(EMPTY_NOTE_STATE, 'B0 01 40')), []);
  assert.equal(ccValue(applyExpressionHex(EMPTY_EXPRESSION_STATE, 'B0 01 40'), 1), 64);
});

// --- MIDI learn ----------------------------------------------------------------

// A controller sweep, as a stream of CC messages.
function sweep(state, status, cc, from, to, step = 8) {
  let s = state;
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
    s = applyLearnHex(s, `${status} ${cc.toString(16).padStart(2, '0')} ${v.toString(16).padStart(2, '0')}`);
  }
  return s;
}

test('learn picks the controller that moved the most, not the first one seen', () => {
  let s = EMPTY_LEARN_STATE;
  // a stray note on the way to the wheel arrives FIRST…
  s = applyLearnHex(s, '90 3C 50');
  // …then the mod wheel sweeps
  s = sweep(s, 'B0', 1, 0, 120);
  const best = learnBest(s);
  assert.equal(best.kind, 'cc');
  assert.equal(best.cc, 1);
  assert.equal(best.channel, 1);
  assert.ok(best.span >= 112);
});

test('a single stray message can never win', () => {
  // one note-on: span 0, count 1 — below both thresholds
  const s = applyLearnHex(EMPTY_LEARN_STATE, '90 3C 50');
  assert.equal(learnBest(s), null);
  // a controller resting and jittering by 1 is also rejected
  let j = applyLearnHex(EMPTY_LEARN_STATE, 'B0 01 40');
  j = applyLearnHex(j, 'B0 01 41');
  j = applyLearnHex(j, 'B0 01 40');
  assert.equal(learnBest(j), null);
  assert.equal(learnCandidates(j)[0].span, 1);
});

test('the biggest sweep wins when two controllers move together', () => {
  let s = EMPTY_LEARN_STATE;
  s = sweep(s, 'B0', 1, 0, 30);      // mod wheel nudged a little
  s = sweep(s, 'B0', 74, 0, 127);    // cutoff swept fully
  const best = learnBest(s);
  assert.equal(best.cc, 74);
  // both are still listed, ordered by movement
  const all = learnCandidates(s);
  assert.equal(all.length, 2);
  assert.equal(all[0].cc, 74);
  assert.equal(all[1].cc, 1);
});

test('aftertouch and velocity are learnable too', () => {
  let a = EMPTY_LEARN_STATE;
  for (const v of ['00', '20', '40', '60', '7F']) a = applyLearnHex(a, `D0 ${v}`);
  assert.equal(learnBest(a).kind, 'aftertouch');
  assert.equal(learnCandidateLabel(learnBest(a)), 'Aftertouch · ch 1');
  // several notes at different velocities
  let v = EMPTY_LEARN_STATE;
  v = applyLearnHex(v, '90 3C 10');
  v = applyLearnHex(v, '90 40 70');
  assert.equal(learnBest(v).kind, 'velocity');
  assert.equal(learnCandidateLabel(learnBest(v)), 'Note velocity · ch 1');
});

test('learn keeps channels apart and reports the one that moved', () => {
  let s = EMPTY_LEARN_STATE;
  s = sweep(s, 'B0', 1, 0, 40);    // ch 1, small move
  s = sweep(s, 'B5', 1, 0, 127);   // ch 6, full sweep
  const best = learnBest(s);
  assert.equal(best.cc, 1);
  assert.equal(best.channel, 6);
  assert.equal(learnCandidateLabel(best), 'CC 1 · ch 6');
  assert.equal(learnCandidates(s).length, 2);   // same CC, two channels, two candidates
});

test('learn thresholds are adjustable, and empty state is safe', () => {
  let s = applyLearnHex(EMPTY_LEARN_STATE, 'B0 01 40');
  s = applyLearnHex(s, 'B0 01 43');            // span 3
  assert.equal(learnBest(s), null);            // default minSpan 8
  assert.equal(learnBest(s, { minSpan: 2 }).cc, 1);
  assert.equal(learnBest(EMPTY_LEARN_STATE), null);
  assert.deepEqual(learnCandidates(null), []);
  assert.equal(learnCandidateLabel(null), '');
  assert.equal(applyLearnHex(EMPTY_LEARN_STATE, 'F8'), EMPTY_LEARN_STATE);   // realtime: nothing to learn
});

// --- polyphonic key pressure ---------------------------------------------------

test('poly aftertouch is tracked per note', () => {
  assert.deepEqual(expressionEvent([0xA0, 60, 90]),
    { kind: 'polyAftertouch', channel: 1, note: 60, value: 90 });
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, '90 3C 40');   // hold C4
  s = applyExpressionHex(s, '90 40 40');                            // hold E4
  s = applyExpressionHex(s, 'A0 3C 20');                            // C4 pressure 32
  s = applyExpressionHex(s, 'A0 40 64');                            // E4 pressure 100
  assert.equal(polyPressureEntries(s).length, 2);
  assert.equal(polyAftertouchValue(s), 100);                        // highest wins
  assert.equal(polyAftertouchValue(s, 0, 'last'), 100);             // E4 was also last
  s = applyExpressionHex(s, 'A0 3C 7F');                            // now lean on C4
  assert.equal(polyAftertouchValue(s, 0, 'highest'), 127);
  assert.equal(polyAftertouchValue(s, 0, 'last'), 127);
  s = applyExpressionHex(s, 'A0 3C 10');                            // ease off C4
  assert.equal(polyAftertouchValue(s, 0, 'highest'), 100);          // E4 is now hardest
  assert.equal(polyAftertouchValue(s, 0, 'last'), 16);              // …but C4 moved last
});

test('releasing a key drops its pressure — the stuck-finger bug', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 3C 7F');   // C4 pressed hard
  s = applyExpressionHex(s, 'A0 40 20');                            // E4 pressed lightly
  assert.equal(polyAftertouchValue(s), 127);
  s = applyExpressionHex(s, '80 3C 00');                            // let go of C4
  assert.equal(polyAftertouchValue(s), 32);                         // not still 127
  // note-on with velocity 0 releases too
  s = applyExpressionHex(s, '90 40 00');
  assert.equal(polyAftertouchValue(s), undefined);                  // nothing held
  // releasing a key that carried no pressure is a no-op
  const t = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 3C 40');
  assert.equal(applyExpressionHex(t, '80 41 00'), t);
});

test('all-notes-off clears pressure on its channel only', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 3C 7F');   // ch 1
  s = applyExpressionHex(s, 'A5 3C 40');                            // ch 6
  assert.equal(polyAftertouchValue(s), 127);
  s = applyExpressionHex(s, 'B0 7B 00');                            // all notes off, ch 1
  assert.equal(polyAftertouchValue(s, 1), undefined);
  assert.equal(polyAftertouchValue(s, 6), 64);
  assert.equal(polyAftertouchValue(s, 0), 64);                      // omni sees what's left
  // and a clear-all with nothing to clear returns the same object
  const t = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 3C 40');
  assert.equal(applyExpressionHex(t, 'B9 7B 00'), t);               // different channel
});

test('poly pressure keeps channels apart and does not leak into channel AT', () => {
  let s = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 3C 50');   // poly, ch 1
  s = applyExpressionHex(s, 'D0 10');                               // channel AT, ch 1
  assert.equal(polyAftertouchValue(s, 1), 80);
  assert.equal(aftertouchValue(s, 1), 16);                          // separate buckets
  assert.equal(polyAftertouchValue(s, 2), undefined);
  assert.deepEqual(POLY_PRESSURE_MODES, ['highest', 'last']);
  // re-sending the same pressure is a no-op
  assert.equal(applyExpressionHex(s, 'A0 3C 50'), s);
});

test('poly pressure is learnable as one candidate, not one per note', () => {
  let l = EMPTY_LEARN_STATE;
  // lean on two different keys — that's ONE controller as far as learn is concerned
  for (const v of ['10', '30', '50', '70']) l = applyLearnHex(l, `A0 3C ${v}`);
  l = applyLearnHex(l, 'A0 40 60');
  const cands = learnCandidates(l);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].kind, 'polyAftertouch');
  assert.equal(learnCandidateLabel(learnBest(l)), 'Poly pressure · ch 1');
});

// --- note levels (dynamics for the echo displays) ------------------------------

test('note levels fall back to velocity, and pressure takes over when it arrives', () => {
  const notes = applyMidiHex(applyMidiHex(EMPTY_NOTE_STATE, '90 3C 20'), '90 40 70');
  let x = applyExpressionHex(applyExpressionHex(EMPTY_EXPRESSION_STATE, '90 3C 20'), '90 40 70');
  // no pressure yet → struck velocity
  assert.deepEqual(noteLevels(notes, x), { 60: 32 / 127, 64: 112 / 127 });
  // lean on C4 and it overtakes its own soft velocity
  x = applyExpressionHex(x, 'A0 3C 7F');
  assert.equal(notePressure(x, 1, 60), 127);
  assert.equal(noteLevels(notes, x)[60], 1);
  assert.equal(noteLevels(notes, x)[64], 112 / 127);   // E4 untouched
  // easing off follows it back down — pressure is continuous, velocity was not
  x = applyExpressionHex(x, 'A0 3C 10');
  assert.ok(Math.abs(noteLevels(notes, x)[60] - 16 / 127) < 1e-9);
});

test('note levels only cover notes actually held, and honour the channel', () => {
  const notes = applyMidiHex(EMPTY_NOTE_STATE, '99 24 64');           // ch 10
  const x = applyExpressionHex(EMPTY_EXPRESSION_STATE, '99 24 64');
  assert.deepEqual(Object.keys(noteLevels(notes, x)), ['36']);
  assert.deepEqual(noteLevels(notes, x, 10), { 36: 100 / 127 });
  assert.deepEqual(noteLevels(notes, x, 1), {});                      // wrong channel
  assert.deepEqual(noteLevels(EMPTY_NOTE_STATE, x), {});              // nothing held
  // pressure for a key that isn't down doesn't invent a level
  const stray = applyExpressionHex(EMPTY_EXPRESSION_STATE, 'A0 47 7F');
  assert.deepEqual(noteLevels(EMPTY_NOTE_STATE, stray), {});
  assert.equal(notePressure(stray, 1, 99), undefined);
});
