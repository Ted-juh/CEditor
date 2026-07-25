import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  transport, startTransport, stopTransport, toggleTransport, rewindTransport,
  setTransportBpm, setTransportSource, transportBeatsNow, isTransportRunning,
  feedTransportMidiForTest, resetTransportForTest,
  applyHostTransport, transportJumpSeq, transportBpmNow, transportBeatsPerBar,
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

// --- Host / DAW playhead ---------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('the host playhead sets tempo, position, meter and play state', async (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('host');

  applyHostTransport({ bpm: 140, ppqPosition: 12, isPlaying: true, timeSigNumerator: 3, timeSigDenominator: 4 });
  assert.equal(isTransportRunning(), true);
  assert.equal(transportBpmNow(), 140);
  assert.equal(transportBeatsPerBar(), 3);           // the meter reached the store
  assert.ok(Math.abs(transportBeatsNow() - 12) < 0.02);
  assert.equal(get(transport).hostAvailable, true);

  // Between host updates the position keeps moving — the DAW only speaks ~30
  // times a second and a readout that only moved then would be visibly steppy.
  await sleep(120);
  const drifted = transportBeatsNow();
  assert.ok(drifted > 12, `expected extrapolation past 12, got ${drifted}`);
  assert.ok(drifted < 12.5, `extrapolated far too fast: ${drifted}`);

  // The host stopping stops us, and holds position rather than snapping to 0.
  applyHostTransport({ bpm: 140, ppqPosition: 12.3, isPlaying: false });
  assert.equal(isTransportRunning(), false);
  await sleep(60);
  assert.ok(Math.abs(transportBeatsNow() - 12.3) < 1e-9, 'a stopped host must not keep counting');
});

test('a host locate bumps the jump counter, playing on does not', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('host');

  applyHostTransport({ bpm: 120, ppqPosition: 8, isPlaying: true });
  const base = transportJumpSeq();
  // An ordinary next update, a few ms of music later: not a jump.
  applyHostTransport({ bpm: 120, ppqPosition: 8.02, isPlaying: true });
  assert.equal(transportJumpSeq(), base);
  // The user drags the locator to bar 40. This MUST read as a jump, or the Arp
  // would fire every step between here and there.
  applyHostTransport({ bpm: 120, ppqPosition: 160, isPlaying: true });
  assert.equal(transportJumpSeq(), base + 1);
  // A loop wrapping back to the top is the same thing.
  applyHostTransport({ bpm: 120, ppqPosition: 0, isPlaying: true });
  assert.equal(transportJumpSeq(), base + 2);
});

test('a host that reports nothing holds position instead of rewinding', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('host');
  applyHostTransport({ bpm: 120, ppqPosition: 20, isPlaying: true });
  assert.equal(get(transport).hostAvailable, true);

  applyHostTransport({});                       // offline render / no playhead
  assert.equal(get(transport).hostAvailable, false);
  assert.equal(isTransportRunning(), false);
  assert.ok(Math.abs(transportBeatsNow() - 20) < 0.05, 'must hold, not snap to 0');
});

test('a host with no tempo yet does not become 0 bpm', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportSource('host');
  applyHostTransport({ ppqPosition: 4, isPlaying: true });   // position but no bpm
  assert.equal(transportBpmNow(), 120);                      // the default, not 0
  assert.ok(Math.abs(transportBeatsNow() - 4) < 0.05);
});

test('host updates are ignored while the source is internal', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  startTransport(0);
  applyHostTransport({ bpm: 200, ppqPosition: 99, isPlaying: true });
  assert.equal(transportBpmNow(), 120);
  assert.ok(transportBeatsNow() < 1, 'the DAW must not move an internal clock');
  stopTransport();
});
