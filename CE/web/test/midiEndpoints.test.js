// midiEndpoints.test.js — "is it hardware" and "does it send" are two questions.
//
// They were one while hardware was the only thing that sent. The internal cables and the simulated
// device send and are not hardware, and each place that asked the old question has to get the
// right one of the new two: the status bar warns when nothing is sent, a script's ports() marks
// what is a real device, and the read offer asks of hardware and the simulated device only.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHardwareEndpoint, outputSends, inputReceives, repliesCanArrive,
} from '../src/CE_Application/utils/midiEndpoints.js';
import { readOfferKey } from '../src/CE_Application/stores/deviceReadOffer.js';

const port = (type, id = type) => ({ type, id, name: id });

test('what sends, what receives, and what is hardware', () => {
  for (const type of ['hardwareOutput', 'internalCable', 'simulatedDevice']) assert.ok(outputSends(port(type)), type);
  for (const type of ['previewOnly', 'none', undefined]) assert.ok(!outputSends(type ? port(type) : null), String(type));

  assert.ok(inputReceives(port('hardwareInput')) && inputReceives(port('internalCable')));
  assert.ok(!inputReceives(port('none')) && !inputReceives(null));

  assert.ok(isHardwareEndpoint(port('hardwareOutput')) && isHardwareEndpoint(port('hardwareInput')));
  for (const type of ['internalCable', 'simulatedDevice', 'previewOnly', 'none']) assert.ok(!isHardwareEndpoint(port(type)), type);
});

test('the simulated device needs no input to be answered', () => {
  assert.ok(repliesCanArrive({ midiDestination: port('simulatedDevice'), midiInput: port('none') }));
  assert.ok(repliesCanArrive({ midiDestination: port('hardwareOutput'), midiInput: port('internalCable', 'cable1') }));
  assert.ok(!repliesCanArrive({ midiDestination: port('hardwareOutput'), midiInput: port('none') }));
});

test('a read is offered for hardware and the simulated device, not for a cable', () => {
  assert.equal(readOfferKey('sh201', { midiDestination: port('simulatedDevice') }), 'sh201\u0000simulatedDevice');
  assert.equal(readOfferKey('sh201', { midiDestination: port('hardwareOutput', 'usb1') }), 'sh201\u0000usb1');
  assert.equal(readOfferKey('sh201', { midiDestination: port('internalCable', 'cable1') }), null);
  assert.equal(readOfferKey('sh201', { midiDestination: port('previewOnly') }), null);
});
