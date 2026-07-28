// scriptNoteIn.test.js — onNoteIn / onNoteOffIn.
//
// The most common message on the wire had no event of its own. A panel reacting to played notes had
// to take onMidiIn and decode status nibbles by hand, in every language — including the case below,
// which is the one everybody gets wrong.
//
// Classification is derived from the STATUS BYTE, not from the host's messageType, so this and the
// C++ player (PluginProcessor, pinned in ScriptRuntimeTests §25) cannot decide differently.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_EVENTS, EVENT_BY_ID, handlerNamesForRuntime, RUNTIME_ANY, RUNTIME_PLAYER, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';
import { noteEventForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const ev = (bytes) => noteEventForTesting(bytes);

/* -------------------------------------------------------------------------- the contract */

test('both events are declared, and raised in BOTH runtimes', () => {
  // A synth is played in a DAW with the window shut far more often than in the editor.
  for (const name of ['onNoteIn', 'onNoteOffIn']) {
    assert.ok(ALL_EVENTS.some((e) => e.fn === name), `${name} is not declared`);
    assert.ok(handlerNamesForRuntime(RUNTIME_WEBVIEW).includes(name));
    assert.ok(handlerNamesForRuntime(RUNTIME_PLAYER).includes(name));
  }
});

test('the summaries say which way the channel is counted', () => {
  // onCcIn reports 0-based and sendCC takes 1-based — a real, older inconsistency. These two match
  // sendNote instead, and both summaries say so, because a silent disagreement about channel
  // numbering is a bug somebody debugs for an hour.
  const noteIn = ALL_EVENTS.find((e) => e.fn === 'onNoteIn');
  assert.match(noteIn.summary, /1-16/);
  assert.match(ALL_EVENTS.find((e) => e.fn === 'onCcIn').summary, /0-based/);
});

/* ------------------------------------------------------------------------ classification */

test('a note-on becomes onNoteIn, with the channel counted the way sendNote counts it', () => {
  assert.deepEqual(ev([0x90, 60, 100]), {
    event: 'onNoteIn', payload: { channel: 1, note: 60, velocity: 100 },
  });
  assert.deepEqual(ev([0x9F, 72, 1]), {
    event: 'onNoteIn', payload: { channel: 16, note: 72, velocity: 1 },
  }, 'channel nibble 15 is channel 16, not 15');
});

test('an explicit note-off becomes onNoteOffIn, carrying its release velocity', () => {
  assert.deepEqual(ev([0x80, 60, 64]), {
    event: 'onNoteOffIn', payload: { channel: 1, note: 60, velocity: 64 },
  });
  assert.deepEqual(ev([0x83, 48, 0]), {
    event: 'onNoteOffIn', payload: { channel: 4, note: 48, velocity: 0 },
  });
});

test('a note-on with velocity 0 IS a note-off — the case everybody gets wrong', () => {
  // Devices using running status send these constantly. A panel that treated one as a note-on would
  // hang a voice on every key release, and it is exactly the decoding this event removes.
  assert.deepEqual(ev([0x90, 60, 0]), {
    event: 'onNoteOffIn', payload: { channel: 1, note: 60, velocity: 0 },
  });
});

test('what is not a note message raises neither', () => {
  assert.equal(ev([0xB0, 7, 100]), null, 'a CC');
  assert.equal(ev([0xC0, 5]), null, 'a program change');
  assert.equal(ev([0xE0, 0, 64]), null, 'pitch bend');
  assert.equal(ev([0xA0, 60, 90]), null, 'poly aftertouch is not a note on or off');
  assert.equal(ev([0xF8]), null, 'clock');
  assert.equal(ev([]), null);
  assert.equal(ev([0x90, 60]), null, 'a truncated note-on is not guessed at');
});

test('the echo case works — what onNoteIn reports can be handed straight to sendNote', () => {
  // The whole reason the channel is 1-based here. If it were 0-based like onCcIn, the single most
  // obvious thing to do with this event would be off by one.
  const { payload } = ev([0x95, 64, 96]);
  assert.equal(payload.channel, 6);
  assert.ok(payload.channel >= 1 && payload.channel <= 16, 'sendNote clamps 1..16');
});
