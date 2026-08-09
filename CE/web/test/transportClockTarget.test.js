// transportClockTarget.test.js — where the transport's MIDI actually goes.
//
// transport.js addressed all six of its messages — clock, start, stop, continue and two song
// positions — to the literal string 'mainSynth'. That is not a device; it is the name of the
// default one, and a panel whose controls name anything else never received a transport message.
// The GAIA panel names itself, so its clock went to a device that does not exist and was dropped
// with nothing said anywhere.
//
// Nothing is guessed now. The Transport control chooses, or the panel's own device is used when it
// names exactly one, or nothing is sent — and the last case is visible in the editor rather than
// silent. These tests cover the choosing and the addressing; the wiring between them is the
// preview surface's, and the editor's warning is what makes the empty case findable.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveClockDevice } from '../src/CE_Application/utils/deviceRoles.js';

test('the transport control\'s own choice wins', () => {
  assert.equal(resolveClockDevice('Elektron Digitakt', ['Roland GAIA SH-01']), 'Elektron Digitakt');
});

test('with no choice made, a panel that names one device clocks that device', () => {
  // The case that fixes the GAIA without anyone configuring anything: one device on the panel, so
  // there is nothing to choose between.
  assert.equal(resolveClockDevice('', ['Roland GAIA SH-01']), 'Roland GAIA SH-01');
  assert.equal(resolveClockDevice(undefined, ['Roland GAIA SH-01']), 'Roland GAIA SH-01');
  assert.equal(resolveClockDevice('   ', ['Roland GAIA SH-01']), 'Roland GAIA SH-01');
});

test('with two devices and no choice, nothing is sent', () => {
  // Guessing here would clock the wrong synth, which is worse than clocking none — and the editor
  // says so rather than leaving it quiet.
  assert.equal(resolveClockDevice('', ['Roland GAIA SH-01', 'Elektron Digitakt']), '');
});

test('a panel that names no device has nothing to clock', () => {
  assert.equal(resolveClockDevice('', []), '');
  assert.equal(resolveClockDevice('', undefined), '');
});

test('transport messages are addressed to the chosen device, and to no other', async () => {
  // Driven through the real store rather than asserted from the source: stopTransport sends FC
  // synchronously when clock-out is on, which is enough to see what the message was addressed to
  // without running the clock's timers.
  const sent = [];
  globalThis.window = {
    __JUCE__: { backend: { emitEvent: (name, payload) => sent.push({ name, payload }) } },
  };

  const transport = await import('../src/CE_Application/stores/transport.js');
  transport.setTransportClockOut(true);
  transport.setTransportClockDevice('Roland GAIA SH-01');
  transport.stopTransport();

  const stops = sent.filter((e) => e.payload?.actionId === 'midi_stop');
  assert.equal(stops.length, 1, 'clock-out was on and no stop was sent');
  assert.equal(stops[0].payload.deviceRole, 'Roland GAIA SH-01',
    'the transport addressed its message to something other than the chosen device');
  assert.equal(stops[0].payload.message, 'FC');

  // And with nowhere to send it, nothing goes out — rather than to a name nobody chose.
  sent.length = 0;
  transport.setTransportClockDevice('');
  transport.stopTransport();
  assert.deepEqual(sent.filter((e) => e.payload?.actionId === 'midi_stop'), [],
    'a transport with no device still sent something');

  delete globalThis.window;
});
