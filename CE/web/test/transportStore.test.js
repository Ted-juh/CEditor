import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  transport, startTransport, stopTransport, toggleTransport, rewindTransport,
  setTransportBpm, setTransportSource, transportBeatsNow, isTransportRunning,
  feedTransportMidiForTest, resetTransportForTest,
} from '../src/CE_Application/stores/transport.js';

test('start / stop / rewind', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  assert.equal(isTransportRunning(), false);
  startTransport();
  assert.equal(isTransportRunning(), true);
  assert.equal(get(transport).running, true);
  toggleTransport();
  assert.equal(isTransportRunning(), false);
  startTransport(8);                       // start from a position
  assert.ok(transportBeatsNow() >= 8);
  rewindTransport();
  assert.ok(transportBeatsNow() < 0.1);
});

test('changing tempo does not jump the position', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  startTransport(16);
  const before = transportBeatsNow();
  setTransportBpm(180);
  const after = transportBeatsNow();
  // the beat you are on must not move when the tempo changes — only the rate
  // ahead of it. Re-anchoring the start instant is what buys this.
  assert.ok(Math.abs(after - before) < 0.05, `${before} -> ${after}`);
  assert.equal(get(transport).bpm, 180);
  setTransportBpm(9999);
  assert.equal(get(transport).bpm, 300);   // clamped
});

test('a stopped transport holds its position', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  startTransport(4);
  stopTransport();
  const held = transportBeatsNow();
  assert.ok(Math.abs(transportBeatsNow() - held) < 1e-9);
  assert.equal(get(transport).running, false);
});

test('external clock: start, pulses advance the position, stop', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('external');
  assert.equal(get(transport).source, 'external');
  feedTransportMidiForTest('FA');                       // start
  assert.equal(isTransportRunning(), true);
  // 24 pulses is one quarter note
  feedTransportMidiForTest('F8 '.repeat(24).trim());
  assert.ok(Math.abs(transportBeatsNow() - 1) < 1e-9);
  feedTransportMidiForTest('F8 '.repeat(12).trim());
  assert.ok(Math.abs(transportBeatsNow() - 1.5) < 1e-9);
  feedTransportMidiForTest('FC');                       // stop
  assert.equal(isTransportRunning(), false);
});

test('external clock ignores note traffic on the same wire', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('external');
  feedTransportMidiForTest('FA');
  const at = transportBeatsNow();
  feedTransportMidiForTest('90 3C 64 B0 01 40 80 3C 00');   // notes + a CC
  assert.ok(Math.abs(transportBeatsNow() - at) < 1e-9);
});

test('a system reset stops and rewinds', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('external');
  feedTransportMidiForTest('FA');
  feedTransportMidiForTest('F8 '.repeat(24).trim());
  assert.ok(transportBeatsNow() > 0.9);
  feedTransportMidiForTest('FF');
  assert.equal(isTransportRunning(), false);
  assert.equal(transportBeatsNow(), 0);
});
