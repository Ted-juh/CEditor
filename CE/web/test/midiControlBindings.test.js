// midiControlBindings.test.js — binding a control to a message instead of to a name.
//
// Every binding in this app was a `deviceParameter`: a semantic id from a profile, compiled by the
// engine into whatever bytes that instrument wants. Right for an editor built around device
// profiles, and with one hard edge — a controller the profile does not describe could not be bound
// to anything at all. The learn chips made that edge visible by having to grey half of themselves
// out: a generic fader box, or any CC a profile author never mapped, could be SEEN moving and had
// nowhere to go.
//
// What is pinned here is the contract that makes the second kind safe to have:
//
//   MATCHING, which decides whether an arriving CC belongs to a binding. Too loose and one knob
//   drives two controls; too tight and a controller moved to another channel goes silently dead.
//
//   NO SCALING. A CC carries 0-127 and the control receives 0-127, which is exactly what
//   deviceParameter bindings already do. Two binding kinds that mapped values differently would be
//   a difference nothing else in the app explains.
//
//   THE SHAPE ITSELF, because `isMidiControlBinding` is the gate every reader goes through. If it
//   accepted a half-built binding, a control would send malformed bytes rather than nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIDI_CONTROL_KIND,
  activeMidiControlBindings,
  isMidiControlBinding,
  matchesMidiControl,
  midiControlBindingFrom,
  midiControlLabel,
  midiControlMessage,
  midiControlParameterShape,
} from '../src/CE_Application/utils/midiControlBindings.js';
import { getBindingCompatibility } from '../src/CE_Application/models/componentPorts.js';
import { expressionEventsFromHex } from '../src/CE_Application/utils/midiNoteInput.js';

const binding = (over = {}) => ({ ...midiControlBindingFrom({ controller: 74, deviceRole: 'Fader box' }), ...over });
const ccEvent = (hex) => expressionEventsFromHex(hex)[0];

test('a binding is only usable when it can actually name a message', () => {
  // The gate every reader goes through. A half-built binding that passed would have a control
  // emitting malformed bytes instead of nothing.
  assert.equal(isMidiControlBinding(binding()), true);
  assert.equal(isMidiControlBinding({ ...binding(), controller: 128 }), false, 'a CC is 0-127');
  assert.equal(isMidiControlBinding({ ...binding(), controller: -1 }), false);
  assert.equal(isMidiControlBinding({ ...binding(), controller: undefined }), false);
  assert.equal(isMidiControlBinding({ ...binding(), message: 'nrpn' }), false,
    'only cc is implemented — an unimplemented message must be refused, not half-handled');
  assert.equal(isMidiControlBinding({ kind: 'deviceParameter', parameterId: 'filter.cutoff' }), false);
  assert.equal(isMidiControlBinding(null), false);
});

test('an arriving CC matches its binding, on any channel by default', () => {
  // Channel 0 = any, following polyPressureEntries(state, channel = 0) elsewhere in this codebase.
  // It is the default because it is what learn can honestly infer: that a controller happened to be
  // on channel 3 today is not a decision to bind it to channel 3 forever.
  const b = binding();
  assert.equal(matchesMidiControl(b, ccEvent('B0 4A 5A')), true);
  assert.equal(matchesMidiControl(b, ccEvent('B7 4A 5A')), true, 'channel 8, same knob');
  assert.equal(matchesMidiControl(b, ccEvent('B0 4B 5A')), false, 'a different CC is a different knob');
});

test('an explicit channel is exact, both ways', () => {
  const b = binding({ channel: 3 });
  assert.equal(matchesMidiControl(b, ccEvent('B2 4A 5A')), true, 'channel 3 is status B2');
  assert.equal(matchesMidiControl(b, ccEvent('B0 4A 5A')), false);
  assert.equal(midiControlMessage(b, 90), 'B2 4A 5A');
});

test('a note is not a CC', () => {
  // The reason matching takes decoded events rather than raw bytes: 0x9A 0x4A is a note-on whose
  // second byte equals the controller number, and a looser check would bind it.
  assert.equal(matchesMidiControl(binding(), ccEvent('9A 4A 5A') ?? null), false);
  assert.equal(matchesMidiControl(binding(), ccEvent('D0 4A')), false, 'aftertouch is not a CC either');
});

test('the message a control sends is the value it holds', () => {
  // No scaling, matching what deviceParameter bindings already do — deviceBindingSync and the
  // Player both hand the wire value straight to the control's session.
  assert.equal(midiControlMessage(binding(), 0), 'B0 4A 00');
  assert.equal(midiControlMessage(binding(), 127), 'B0 4A 7F');
  assert.equal(midiControlMessage(binding(), 64), 'B0 4A 40');
});

test('an out-of-range value is clamped, and a non-number sends nothing', () => {
  // Clamped rather than refused: a control whose range overshoots is a configuration mistake, and
  // the last thing a fader should do at the top of its travel is stop sending. A non-number is a
  // different case — there is no honest byte for it.
  assert.equal(midiControlMessage(binding(), 200), 'B0 4A 7F');
  assert.equal(midiControlMessage(binding(), -5), 'B0 4A 00');
  assert.equal(midiControlMessage(binding(), 'loud'), null);
  assert.equal(midiControlMessage(binding(), undefined), null);
  assert.equal(midiControlMessage({ ...binding(), controller: 999 }, 10), null, 'a broken binding sends nothing');
});

test('channel 0 sends on 1, because a message needs one number', () => {
  assert.equal(midiControlMessage(binding({ channel: 0 }), 90), 'B0 4A 5A');
  assert.equal(midiControlMessage(binding({ channel: 16 }), 90), 'BF 4A 5A');
});

test('bindings are read off a control the same way device parameters are', () => {
  // Including the enabled gate: switching a component's bindings off has to switch off BOTH kinds,
  // not just the one the reader happened to know about.
  const control = { _children: { DeviceBindings: { enabled: true, bindings: [
    { kind: 'deviceParameter', parameterId: 'filter.cutoff', port: 'value' },
    binding(),
    { kind: MIDI_CONTROL_KIND, message: 'cc', controller: 200 },   // malformed, must not survive
  ] } } };
  assert.equal(activeMidiControlBindings(control).length, 1);

  const off = { _children: { DeviceBindings: { enabled: false, bindings: [binding()] } } };
  assert.deepEqual(activeMidiControlBindings(off), [], 'disabled bindings must not still receive');
  assert.deepEqual(activeMidiControlBindings({}), []);
});

test('a CC describes itself to the binding-compatibility check', () => {
  // getBindingCompatibility decides whether a control accepts a drop and drives the highlight on
  // every control during a drag. It reads type and range, so a CC has to answer in those terms —
  // which it can, honestly: it is a 0-127 integer.
  const shape = midiControlParameterShape(74);
  assert.deepEqual(shape, { id: 'cc74', name: 'CC 74', type: 'integer', range: { min: 0, max: 127 } });
  const knob = getBindingCompatibility('Knob', shape);
  assert.notEqual(knob.status, 'incompatible');
  assert.equal(knob.port.id, 'value');
});

test('a learned binding keeps the controller and forgets the channel', () => {
  const learned = midiControlBindingFrom({ controller: 74, deviceRole: 'Fader box' });
  assert.equal(learned.kind, MIDI_CONTROL_KIND);
  assert.equal(learned.controller, 74);
  assert.equal(learned.channel, 0, 'learn should not pin a channel it merely observed');
  assert.equal(learned.port, 'value');
  assert.equal(learned.deviceRole, 'Fader box');
  assert.equal(learned.dryRun, true, 'same default as a dropped device parameter');
  assert.equal(midiControlBindingFrom({ controller: 300 }), null);
});

test('the label reads the way a synth manual writes it', () => {
  assert.equal(midiControlLabel(binding()), 'CC 74');
  assert.equal(midiControlLabel(binding({ channel: 3 })), 'CC 74 · ch 3');
  assert.equal(midiControlLabel({ kind: 'deviceParameter' }), '');
});
