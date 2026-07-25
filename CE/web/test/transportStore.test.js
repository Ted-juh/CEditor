import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  transport, startTransport, stopTransport, toggleTransport, rewindTransport,
  setTransportBpm, setTransportSource, transportBeatsNow, isTransportRunning,
  feedTransportMidiForTest, resetTransportForTest,
  applyHostTransport, transportJumpSeq, transportBpmNow, transportBeatsPerBar,
  setTransportLoop, transportLoopNow, startTransportWithCountIn, isCountingIn, countInBeatsLeft,
  setTransportSignature,
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

// --- Loop points ------------------------------------------------------------------
test('the position folds into the loop and a wrap counts as a jump', async (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  // A very short loop at a very high tempo so a real wrap happens fast:
  // 300bpm = 5 beats/sec, so a 1-beat loop comes round every 200ms.
  setTransportBpm(300);
  setTransportLoop(true, 0, 1);
  assert.equal(transportLoopNow().enabled, true);
  startTransport(0);
  const jumps0 = transportJumpSeq();

  await sleep(450);                       // ~2.25 beats: at least two wraps
  const b = transportBeatsNow();
  assert.ok(b >= 0 && b < 1, `folded position must stay inside the loop, got ${b}`);
  assert.ok(transportJumpSeq() > jumps0, 'a wrap must register as a discontinuity');
  stopTransport();
});

test('a loop that starts later lets the clock run in to it', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportLoop(true, 8, 16);
  startTransport(0);
  // Immediately after starting we are before the loop start, so untouched.
  assert.ok(transportBeatsNow() < 1);
  stopTransport();
});

test('loop settings are inert while following a master', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportLoop(true, 0, 1);
  setTransportSource('host');
  // The DAW owns the position; folding it into our loop would put the panel
  // somewhere the master isn't.
  assert.equal(transportLoopNow().enabled, false);
  applyHostTransport({ bpm: 120, ppqPosition: 40, isPlaying: true });
  assert.ok(Math.abs(transportBeatsNow() - 40) < 0.05, 'the host position must pass through unfolded');
});

// --- Count-in ---------------------------------------------------------------------
test('the count-in holds every follower silent, then starts for real', async (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  setTransportBpm(300);                   // 5 beats/sec
  setTransportSignature(1);               // …and 1 beat per bar, so 1 bar = 200ms
  startTransportWithCountIn(1, 0);

  assert.equal(isCountingIn(), true);
  // The crucial bit: NOT running. Every synced component already holds and
  // stays quiet when the transport is stopped, so the count-in needs no change
  // in any of them.
  assert.equal(isTransportRunning(), false);
  assert.ok(countInBeatsLeft() > 0);
  assert.equal(get(transport).countingIn, true);

  await sleep(120);
  assert.equal(isCountingIn(), true, 'still counting in half way through');
  assert.equal(isTransportRunning(), false);

  await sleep(200);
  assert.equal(isCountingIn(), false, 'the count-in must end on its own');
  assert.equal(isTransportRunning(), true);
  assert.equal(countInBeatsLeft(), 0);
  stopTransport();
});

test('pressing stop during a count-in aborts it', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  startTransportWithCountIn(2, 0);
  assert.equal(isCountingIn(), true);
  toggleTransport();                      // the play button again
  assert.equal(isCountingIn(), false);
  assert.equal(isTransportRunning(), false);
});

test('zero bars is an ordinary start, and a follower never counts itself in', (t) => {
  t.after(() => resetTransportForTest());
  resetTransportForTest();
  startTransportWithCountIn(0, 0);
  assert.equal(isCountingIn(), false);
  assert.equal(isTransportRunning(), true);
  stopTransport();

  resetTransportForTest();
  setTransportSource('external');
  startTransportWithCountIn(4, 0);
  // Following someone else's clock, when the music starts is their decision.
  assert.equal(isCountingIn(), false);
});
