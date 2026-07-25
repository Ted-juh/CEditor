import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMidiHex, splitMidiMessages, noteEvent, noteEventsFromHex,
  EMPTY_NOTE_STATE, applyNoteEvent, applyNoteEvents, applyMidiHex,
  heldNotes, heldNoteEntries, isNoteHeld,
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
  assert.deepEqual(heldNoteEntries(s, 10), [
    { note: 36, channel: 10, velocity: 118 },
    { note: 42, channel: 10, velocity: 60 },
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
