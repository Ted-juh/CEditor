// sceneMidi.test.js — MIDI in as a scene trigger (utils/sceneMidi.js): a note played, a controller
// pushed past a point, a program change, on one channel or any.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanTrigger } from '../src/CE_Application/utils/sceneFormat.js';
import { midiTriggerEvents, midiTriggerMatches, midiTriggerText, createMidiTriggerReader } from '../src/CE_Application/utils/sceneMidi.js';
import { createSceneRuntime, sceneWaitsFor } from '../src/CE_Application/utils/sceneRuntime.js';

test('a MIDI trigger is read with what it needs, and defaults for the rest', () => {
  assert.deepEqual(cleanTrigger({ type: 'midi' }), { type: 'midi', message: 'note', channel: 0, note: -1 });
  assert.deepEqual(cleanTrigger({ type: 'midi', message: 'cc', channel: 3, cc: 64, above: 63 }), { type: 'midi', message: 'cc', channel: 3, cc: 64, above: 63 });
  assert.deepEqual(cleanTrigger({ type: 'midi', message: 'program', channel: 99, program: 500 }), { type: 'midi', message: 'program', channel: 0, program: 127 });
  assert.equal(cleanTrigger({ type: 'midi', message: 'sysex' }).message, 'note', 'what it does not know is a note');
});

test('the messages a trigger hears: a note-on, a controller, a program change; nothing else', () => {
  assert.deepEqual(midiTriggerEvents('90 3C 64'), [{ kind: 'note', channel: 1, note: 60, velocity: 100 }]);
  assert.deepEqual(midiTriggerEvents('92 3C 00'), [], 'a note-on at velocity 0 is a release');
  assert.deepEqual(midiTriggerEvents('B0 40 7F C3 05'), [{ kind: 'cc', channel: 1, cc: 64, value: 127 }, { kind: 'program', channel: 4, program: 5 }]);
  assert.deepEqual(midiTriggerEvents('E0 00 40 80 3C 00'), [], 'a bend, a note-off');
});

test('a note trigger hears its note, or any; on its channel, or any', () => {
  const c3 = cleanTrigger({ type: 'midi', message: 'note', note: 60, channel: 1 });
  assert.equal(midiTriggerMatches(c3, { kind: 'note', channel: 1, note: 60, velocity: 90 }), true);
  assert.equal(midiTriggerMatches(c3, { kind: 'note', channel: 2, note: 60, velocity: 90 }), false);
  assert.equal(midiTriggerMatches(c3, { kind: 'note', channel: 1, note: 61, velocity: 90 }), false);
  const any = cleanTrigger({ type: 'midi', message: 'note' });
  assert.equal(midiTriggerMatches(any, { kind: 'note', channel: 9, note: 36, velocity: 1 }), true);
  assert.equal(midiTriggerMatches(any, { kind: 'cc', channel: 1, cc: 1, value: 1 }), false);
});

test('a controller trigger fires when the controller passes its point going up, not while it stays there', () => {
  const sustain = cleanTrigger({ type: 'midi', message: 'cc', cc: 64, above: 63 });
  const reader = createMidiTriggerReader();
  const fired = (hex) => reader.read(hex).filter((event) => midiTriggerMatches(sustain, event)).length;
  assert.equal(fired('B0 40 7F'), 1, 'down: past 63 from nothing');
  assert.equal(fired('B0 40 7F'), 0, 'still down');
  assert.equal(fired('B0 40 00'), 0, 'up');
  assert.equal(fired('B0 40 50'), 1, 'down again');
  assert.equal(fired('B1 40 7F'), 1, 'any channel, its own history');
});

test('in words, for the Designer\'s scene list', () => {
  assert.equal(midiTriggerText(cleanTrigger({ type: 'midi', message: 'note', note: 60, channel: 1 })), 'Note C4 on channel 1');
  assert.equal(midiTriggerText(cleanTrigger({ type: 'midi', message: 'note' })), 'Any note');
  assert.equal(midiTriggerText(cleanTrigger({ type: 'midi', message: 'cc', cc: 64, above: 63 })), 'CC 64 past 63');
  assert.equal(midiTriggerText(cleanTrigger({ type: 'midi', message: 'program', program: 4, channel: 2 })), 'Program 5 on channel 2');
});

test('the runtime plays the scene a MIDI message starts, and only that one', () => {
  const runtime = createSceneRuntime({ timers: { set: () => 1, clear: () => {} } });
  const kick = { id: 'kick', name: 'Kick', length: 500, clips: [], trigger: cleanTrigger({ type: 'midi', message: 'note', note: 36 }) };
  const pad = { id: 'pad', name: 'Pad', length: 500, clips: [], trigger: cleanTrigger({ type: 'midi', message: 'program' }) };
  runtime.setScenes([kick, pad]);
  assert.equal(sceneWaitsFor(kick, { type: 'midi', event: { kind: 'note', channel: 10, note: 36, velocity: 100 } }), true);
  for (const event of midiTriggerEvents('99 24 7F')) runtime.fire({ type: 'midi', event });
  assert.deepEqual(runtime.plays().map((play) => play.scene.id), ['kick']);
});
