// midiControlBindings.test.js — binding a control to a message instead of to a name.
//
// Every binding in this app was a `deviceParameter`: a semantic id from a profile, compiled by the
// engine into whatever bytes that instrument wants. Right for an editor built around device
// profiles, and with one hard edge — a controller the profile does not describe could not be bound
// to anything at all. The learn chips made that edge visible by having to grey half of themselves
// out: a generic fader box, any CC a profile author never mapped, and a keyboard's own pressure and
// dynamics could all be SEEN moving and had nowhere to go.
//
// What is pinned here is the contract that makes the second kind safe to have:
//
//   MATCHING, which decides whether an arriving message belongs to a binding. Too loose and one
//   knob drives two controls, or a note-on is mistaken for pressure; too tight and a controller
//   moved to another channel goes silently dead.
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
  MIDI_CONTROL_MESSAGES,
  activeMidiControlBindings,
  canSendMidiControl,
  isMidiControlBinding,
  matchesMidiControl,
  midiControlBindingFrom,
  midiControlLabel,
  midiControlMessage,
  midiControlParameterShape,
  midiControlValue,
} from '../src/CE_Application/utils/midiControlBindings.js';
import { EMPTY_NRPN_STATE, applyNrpnEvents } from '../src/CE_Application/utils/nrpn.js';
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
  assert.equal(isMidiControlBinding({ ...binding(), message: 'rpn' }), false,
    'an unimplemented message must be refused, not half-handled');
  assert.equal(isMidiControlBinding({ ...binding(), message: 'nrpn' }), false,
    'a CC binding relabelled as an NRPN has a controller but no parameter number');
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

test('every message the learn reducer can produce is bindable', () => {
  // The gap this closes. Aftertouch, velocity and poly pressure were candidates the chips could see
  // and nothing could accept; a keyboard's pressure and dynamics had no way to reach a control.
  const learnable = MIDI_CONTROL_MESSAGES.filter((m) => m.learnable).map((m) => m.eventKind);
  assert.deepEqual(learnable.sort(), ['aftertouch', 'cc', 'nrpn', 'polyAftertouch', 'velocity'],
    'the kinds learnKey() produces, plus nrpn which midiLearnChips reassembles for itself');
});

test('each message matches its own kind and no other', () => {
  // The bytes that would confuse a looser check: channel pressure D0 and poly pressure A0 both
  // carry a level, and a note-on carries a velocity that is not either of them.
  const cases = [
    ['aftertouch', 'D0 40', 64],
    ['velocity', '90 3C 5A', 90],
    ['polyAftertouch', 'A0 3C 20', 32],
    ['bend', 'E0 00 40', 64],
  ];
  for (const [message, hex, value] of cases) {
    const b = midiControlBindingFrom({ message });
    const event = ccEvent(hex);
    assert.equal(matchesMidiControl(b, event), true, `${message} did not match its own message`);
    assert.equal(event.value, value, `${message} decoded to ${event.value}`);
    for (const [other] of cases) {
      if (other === message) continue;
      assert.equal(matchesMidiControl(midiControlBindingFrom({ message: other }), event), false,
        `a ${other} binding matched a ${message} message`);
    }
    assert.equal(matchesMidiControl(binding(), event), false, `a CC binding matched a ${message} message`);
  }
});

test('a binding with no controller is fine unless it is a CC', () => {
  // A controller number identifies a CC and means nothing for the rest. Requiring it everywhere
  // would refuse a perfectly good aftertouch binding for lacking a field it has no use for.
  assert.equal(isMidiControlBinding(midiControlBindingFrom({ message: 'aftertouch' })), true);
  assert.equal(midiControlBindingFrom({ message: 'aftertouch' }).controller, undefined,
    'and the field should not be there at all, rather than sitting at a meaningless 0');
  assert.equal(midiControlBindingFrom({ message: 'velocity' }).controller, undefined);
  assert.equal(midiControlBindingFrom({ message: 'cc' }), null, 'a CC still needs its number');
  assert.equal(midiControlBindingFrom({ message: 'nrpn', controller: 1 }), null, 'unimplemented is refused');
});

test('only the messages a control could honestly send are sendable', () => {
  // The asymmetry is real, not unfinished. Velocity belongs to a note and poly pressure needs a note
  // number — a fader emitting note-ons to move either would be a surprising thing. Bend is 14 bits
  // centred at 8192, so a 0-127 control could never sit exactly at no-bend.
  assert.equal(midiControlMessage(binding(), 90), 'B0 4A 5A');
  assert.equal(midiControlMessage(midiControlBindingFrom({ message: 'aftertouch' }), 90), 'D0 5A',
    'channel pressure is two bytes, not three');
  assert.equal(midiControlMessage(midiControlBindingFrom({ message: 'aftertouch', channel: 3 }), 90), 'D0 5A');

  for (const message of ['velocity', 'polyAftertouch', 'bend']) {
    const b = midiControlBindingFrom({ message });
    assert.equal(canSendMidiControl(b), false, `${message} should be inbound-only`);
    assert.equal(midiControlMessage(b, 90), null, `${message} produced bytes it has no business sending`);
  }
});

test('a CC describes itself to the binding-compatibility check', () => {
  // getBindingCompatibility decides whether a control accepts a drop and drives the highlight on
  // every control during a drag. It reads type and range, so a CC has to answer in those terms —
  // which it can, honestly: it is a 0-127 integer.
  const shape = midiControlParameterShape({ message: 'cc', controller: 74 });
  assert.deepEqual(shape, { id: 'cc74', name: 'CC 74', type: 'integer', range: { min: 0, max: 127 } });
  assert.deepEqual(midiControlParameterShape({ message: 'aftertouch' }),
    { id: 'aftertouch', name: 'Aftertouch', type: 'integer', range: { min: 0, max: 127 } },
    'the others are 0-127 too, so a knob takes them the same way');
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

const nrpn = (over = {}) => ({
  ...midiControlBindingFrom({ message: 'nrpn', parameterMsb: 1, parameterLsb: 32 }), ...over,
});
const assemble = (hex) => applyNrpnEvents(EMPTY_NRPN_STATE, expressionEventsFromHex(hex)).assembled.at(-1);

test('an NRPN binding needs its parameter number, in both halves', () => {
  assert.equal(isMidiControlBinding(nrpn()), true);
  assert.equal(isMidiControlBinding({ ...nrpn(), parameterLsb: undefined }), false,
    'half a parameter number would bind to a parameter nobody selected');
  assert.equal(isMidiControlBinding({ ...nrpn(), parameterMsb: 128 }), false);
  assert.equal(midiControlBindingFrom({ message: 'nrpn', parameterMsb: 1 }), null);
  assert.equal(nrpn().controller, undefined, 'an NRPN has no controller number');
});

test('an NRPN matches its own parameter number and no other', () => {
  const event = assemble('B0 63 01 B0 62 20 B0 06 02 B0 26 40');
  assert.equal(matchesMidiControl(nrpn(), event), true);
  assert.equal(matchesMidiControl(nrpn({ parameterLsb: 33 }), event), false);
  assert.equal(matchesMidiControl(nrpn({ parameterMsb: 2 }), event), false);
  assert.equal(matchesMidiControl(binding(), event), false, 'a CC binding must not take an NRPN');
  assert.equal(matchesMidiControl(nrpn({ channel: 2 }), event), false, 'wrong channel');
  assert.equal(matchesMidiControl(nrpn({ channel: 1 }), event), true);
});

test('the binding decides the resolution, because the wire cannot', () => {
  // A 7-bit and a 14-bit NRPN are byte-identical up to the optional CC 38, so the same reassembled
  // event has to serve both. Getting this backwards is a value 128x out.
  const event = assemble('B0 63 01 B0 62 20 B0 06 02 B0 26 40');
  assert.equal(midiControlValue(nrpn(), event), 2, 'default is 7-bit, mirroring the C++ recipe');
  assert.equal(midiControlValue(nrpn({ valueResolution: 14 }), event), 320);
  assert.equal(midiControlValue(binding(), { value: 90 }), 90, 'every other kind is just its value');
});

test('an NRPN sends the four CCs the engine sends, in that order', () => {
  // Mirrors DeviceProfileEngine.cpp's recipe builder: 99, 98, then 6 (+38 when 14-bit). C++ splits a
  // multi-message run on the way out, so one hex string is what the send path expects.
  assert.equal(midiControlMessage(nrpn(), 64), 'B0 63 01 B0 62 20 B0 06 40');
  assert.equal(midiControlMessage(nrpn({ valueResolution: 14 }), 320),
    'B0 63 01 B0 62 20 B0 06 02 B0 26 40');
  assert.equal(midiControlMessage(nrpn({ valueResolution: 14, channel: 3 }), 320),
    'B2 63 01 B2 62 20 B2 06 02 B2 26 40');
});

test('a 14-bit NRPN clamps at 16383, a 7-bit one at 127', () => {
  assert.equal(midiControlMessage(nrpn({ valueResolution: 14 }), 99999), 'B0 63 01 B0 62 20 B0 06 7F B0 26 7F');
  assert.equal(midiControlMessage(nrpn(), 99999), 'B0 63 01 B0 62 20 B0 06 7F');
});

test('null-after-send deselects the parameter, when asked', () => {
  // The optional tail C++ writes for nullAfterSend, so a later Data Entry from anything else cannot
  // land on this parameter. Off by default, because most gear does not need it and it doubles the
  // traffic of a knob sweep.
  assert.equal(midiControlMessage(nrpn({ nullAfterSend: true }), 64),
    'B0 63 01 B0 62 20 B0 06 40 B0 63 7F B0 62 7F');
  assert.equal(nrpn().nullAfterSend, undefined);
});

test('an NRPN round-trips: what a control sends, a control can read', () => {
  // The property that matters most and is easiest to get subtly wrong — the sender and the reader
  // were written from the same C++ source but not from each other.
  for (const [resolution, value] of [[7, 100], [14, 9001], [14, 0], [7, 0], [14, 16383]]) {
    const b = nrpn({ valueResolution: resolution });
    const event = assemble(midiControlMessage(b, value));
    assert.equal(matchesMidiControl(b, event), true, `${resolution}-bit ${value} did not match itself`);
    assert.equal(midiControlValue(b, event), value, `${resolution}-bit ${value} read back wrong`);
  }
});

test('the label reads the way a synth manual writes it', () => {
  assert.equal(midiControlLabel(binding()), 'CC 74');
  assert.equal(midiControlLabel(binding({ channel: 3 })), 'CC 74 · ch 3');
  assert.equal(midiControlLabel(midiControlBindingFrom({ message: 'aftertouch' })), 'Aftertouch');
  assert.equal(midiControlLabel(midiControlBindingFrom({ message: 'velocity', port: 'value' })), 'Note velocity');
  assert.equal(midiControlLabel(nrpn()), 'NRPN 1:32', 'MSB:LSB, as manuals print it');
  assert.equal(midiControlLabel(nrpn({ channel: 3 })), 'NRPN 1:32 · ch 3');
  assert.equal(midiControlLabel({ kind: 'deviceParameter' }), '');
});
