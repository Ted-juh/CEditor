// exportParametersRawMidi.test.js — a raw-MIDI-bound control, automated with the window closed.
//
// THE BUG. The exported plugin's automation list carried `deviceParameterId` and nothing else, and
// PluginProcessor's send loop skipped any entry whose id was empty. That is every control bound to a
// raw message rather than to a profile parameter: a CC, an aftertouch, an NRPN, an RPN, a program
// change. Those parameters showed up in the DAW, automated, and saved with the session — and sent
// NOTHING to the synth with the window closed. Silent, and indistinguishable from a cable problem.
//
// Window-OPEN they worked, because the preview surface has its own path
// (PanelPreviewSurface -> midiControlMessage -> triggerRawMidiAction). So the failure was also
// intermittent-looking: the same automation lane moved the synth while you were looking at the
// plugin and stopped when you closed it.
//
// The fix carries the binding's fields — not pre-built bytes, since the value is not known until the
// host moves the parameter — and the C++ builds the message at send time. PanelParametersTests.cpp
// pins the reading; this pins the writing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveExportParameters, normalizeExportParameter } from '../src/CE_Application/utils/exportParameters.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

/** A knob carrying whichever bindings are given. */
function knobWith(bindings, name = 'mod') {
  const control = createControl('Knob', {
    Core: { id: name, name },
    Value: { value: 0, min: 0, max: 127 },
  });
  control._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, bindings };
  return control;
}

const panelOf = (...controls) => ({ name: 'p', controls });
const paramFor = (control) => deriveExportParameters(panelOf(control))
  .find((p) => p.controlName === control._children.Core.name);

const rawCc = { kind: 'midiControl', message: 'cc', channel: 3, controller: 74, deviceRole: 'mainSynth' };
const rawNrpn = {
  kind: 'midiControl', message: 'nrpn', channel: 1,
  parameterMsb: 1, parameterLsb: 32, valueResolution: 14, nullAfterSend: true, deviceRole: 'mainSynth',
};
const deviceBound = { kind: 'deviceParameter', parameterId: 'filter.cutoff', deviceRole: 'mainSynth' };

/* --------------------------------------------------------------- the gap it closes */

test('a raw CC binding produces a parameter that knows how to send', () => {
  const param = paramFor(knobWith([rawCc]));
  assert.ok(param, 'the control produced no export parameter at all');
  assert.equal(param.deviceParameterId, '', 'a raw binding has no profile parameter');
  assert.ok(param.midiControl, 'without this the plugin skips it and sends nothing window-closed');
  assert.equal(param.midiControl.kind, 'cc');
  assert.equal(param.midiControl.channel, 3);
  assert.equal(param.midiControl.controller, 74);
});

test('an NRPN binding carries its parameter number, width and null', () => {
  // Every field sendParamRawMidi reads. A missing one is a message built wrong rather than not sent,
  // which is worse.
  const param = paramFor(knobWith([rawNrpn]));
  assert.equal(param.midiControl.kind, 'nrpn');
  assert.equal(param.midiControl.parameterMsb, 1);
  assert.equal(param.midiControl.parameterLsb, 32);
  assert.equal(param.midiControl.valueResolution, 14);
  assert.equal(param.midiControl.nullAfterSend, true);
});

/* -------------------------------------------------------------- which binding wins */

test('a profile-backed binding beats a raw one on the same control', () => {
  // The profile parameter carries range, encoding and send policy; a raw binding carries three
  // bytes. Preferring the raw one would throw all of that away.
  const param = paramFor(knobWith([rawCc, deviceBound]));
  assert.equal(param.deviceParameterId, 'filter.cutoff');
  assert.equal(param.midiControl, undefined, 'both wires would be two messages per move');
});

test('an inbound-only binding produces no wire at all', () => {
  // Velocity, poly pressure and pitch bend are sources, not destinations. Carrying one would put a
  // parameter in the plugin that silently does nothing — which is the bug being fixed, restated.
  for (const message of ['velocity', 'polyAftertouch', 'bend']) {
    const param = paramFor(knobWith([{ kind: 'midiControl', message, channel: 1, controller: 1 }]));
    assert.equal(param?.midiControl, undefined, `${message} is inbound-only and must not claim a wire`);
    assert.equal(param?.deviceParameterId, '', `${message} has no device parameter either`);
  }
});

test('a disabled DeviceBindings section carries nothing', () => {
  const control = knobWith([rawCc]);
  control._children.DeviceBindings.enabled = false;
  const param = paramFor(control);
  assert.equal(param.midiControl, undefined);
  assert.equal(param.deviceParameterId, '');
});

test('a malformed raw binding is refused rather than exported half-built', () => {
  // A CC with no controller number is not a CC. Exporting it would send CC 0 — Bank Select MSB — on
  // every automation move.
  const param = paramFor(knobWith([{ kind: 'midiControl', message: 'cc', channel: 1 }]));
  assert.equal(param.midiControl, undefined);
});

/* ------------------------------------------------------------- the author-defined path */

test('an author-defined parameter keeps its midiControl through normalization', () => {
  const entry = normalizeExportParameter({
    id: 'x', path: 'x.value', min: 0, max: 127,
    midiControl: { kind: 'cc', channel: 2, controller: 7, valueResolution: 7 },
  });
  assert.equal(entry.midiControl.kind, 'cc');
  assert.equal(entry.midiControl.controller, 7);
});

test('an entry with no midiControl omits the field rather than writing an empty one', () => {
  // The C++ branches on the object's PRESENCE. An empty object would read as a raw binding with
  // every number zeroed — a CC 0 on every move of every parameter in the panel.
  const entry = normalizeExportParameter({ id: 'x', path: 'x.value', min: 0, max: 127 });
  assert.ok(!('midiControl' in entry), 'an empty midiControl would be CC 0 on every move');
});

test('a mixed panel exports both kinds side by side', () => {
  const params = deriveExportParameters(panelOf(
    knobWith([deviceBound], 'cutoff'),
    knobWith([rawCc], 'mod'),
    knobWith([rawNrpn], 'depth'),
  ));
  const byName = new Map(params.map((p) => [p.controlName, p]));
  assert.equal(byName.get('cutoff').deviceParameterId, 'filter.cutoff');
  assert.equal(byName.get('mod').midiControl.kind, 'cc');
  assert.equal(byName.get('depth').midiControl.kind, 'nrpn');
});
