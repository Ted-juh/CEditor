import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BPM, MAX_BPM, PPQN, DIVISIONS, DIVISION_IDS, beatsPerStep,
  transportBpm, transportSource, transportSignature,
  beatsAt, startedAtFor, secondsPerBeat, barBeat, formatBarBeat,
  stepAtBeat, crossedSteps, swungBeatOffset,
  transportEvent, clockPulsesBetween, estimateTempoFromPulses, tapTempo,
  transportGeometry, hitTransportButton,
} from '../src/CE_Application/utils/transportLayout.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function tp(c) { return { _children: { Core: { controlType: 'Transport' }, Transport: c } }; }

test('config clamps to a sane tempo range', () => {
  assert.equal(transportBpm(tp({})), 120);
  assert.equal(transportBpm(tp({ bpm: 5 })), MIN_BPM);
  assert.equal(transportBpm(tp({ bpm: 9999 })), MAX_BPM);
  assert.equal(transportSource(tp({ source: 'nope' })), 'internal');
  assert.equal(transportSource(tp({ source: 'external' })), 'external');
  assert.deepEqual(transportSignature(tp({ beatsPerBar: 3 })), { beats: 3, unit: 4 });
});

test('position is exact, and does NOT drift over long runs', () => {
  // 120bpm = 2 beats/sec
  assert.ok(near(beatsAt(0, 1000, 120), 2));
  assert.ok(near(beatsAt(0, 500, 120), 1));
  assert.ok(near(beatsAt(0, 0, 120), 0));
  assert.ok(near(beatsAt(1000, 2000, 120), 2));       // start offset honoured
  assert.equal(beatsAt(1000, 0, 120), 0);             // never negative

  // The whole point. Accumulating 60fps deltas for an hour drifts; recomputing
  // from the start instant is exact however you slice the interval.
  const HOUR = 3600_000;
  const exact = beatsAt(0, HOUR, 120);
  assert.ok(near(exact, 7200));
  let accumulated = 0;
  for (let t = 0; t < HOUR; t += 16.6667) accumulated += (16.6667 / 60000) * 120;
  assert.ok(Math.abs(accumulated - exact) > 0.01, 'the accumulating version should visibly diverge');
  // …and sampling the exact one at irregular intervals still lands dead on
  for (const t of [1, 33, 5000, 123456, HOUR]) {
    assert.ok(near(beatsAt(0, t, 140), (t / 60000) * 140));
  }
});

test('startedAtFor round-trips, so setting the position keeps it drift-free', () => {
  const now = 1_000_000;
  const started = startedAtFor(16, now, 120);
  assert.ok(near(beatsAt(started, now, 120), 16));
  assert.ok(near(beatsAt(started, now + 500, 120), 17));
  assert.ok(near(secondsPerBeat(120), 0.5));
  assert.ok(near(secondsPerBeat(60), 1));
});

test('bar and beat count from 1, the way musicians do', () => {
  assert.deepEqual(barBeat(0), { bar: 1, beat: 1, tick: 0 });
  assert.deepEqual(barBeat(1), { bar: 1, beat: 2, tick: 0 });
  assert.deepEqual(barBeat(4), { bar: 2, beat: 1, tick: 0 });
  assert.deepEqual(barBeat(9.5), { bar: 3, beat: 2, tick: 12 });
  assert.deepEqual(barBeat(3, { beats: 3, unit: 4 }), { bar: 2, beat: 1, tick: 0 });
  assert.equal(formatBarBeat(0), '1.1.00');
  assert.equal(formatBarBeat(9.5), '3.2.12');
});

test('divisions cover straight, dotted and triplet', () => {
  assert.equal(beatsPerStep('1/4'), 1);
  assert.equal(beatsPerStep('1/8'), 0.5);
  assert.equal(beatsPerStep('1/16'), 0.25);
  assert.equal(beatsPerStep('1/8D'), 0.75);        // dotted 8th = 3 sixteenths
  assert.ok(near(beatsPerStep('1/8T'), 1 / 3));    // 3 per beat
  assert.equal(beatsPerStep('nonsense'), 0.25);    // falls back to 16ths
  assert.equal(DIVISION_IDS.length, Object.keys(DIVISIONS).length);
  assert.equal(stepAtBeat(0, '1/4'), 0);
  assert.equal(stepAtBeat(2.5, '1/4'), 2);
  assert.equal(stepAtBeat(2.5, '1/8'), 5);
});

test('a late frame fires the steps it slept through — no holes in the bar', () => {
  // one 16th crossed
  assert.deepEqual(crossedSteps(0, 0.25, '1/16').steps, [1]);
  // a normal frame crosses nothing
  assert.deepEqual(crossedSteps(0.10, 0.12, '1/16').steps, []);
  // a 200ms stall at 16ths crosses several, and ALL of them fire
  const stalled = crossedSteps(0, 1.0, '1/16');
  assert.deepEqual(stalled.steps, [1, 2, 3, 4]);
  assert.equal(stalled.dropped, 0);
  // exact boundaries are crossed once, not twice
  assert.deepEqual(crossedSteps(0.25, 0.5, '1/16').steps, [2]);
  assert.deepEqual(crossedSteps(0, 0, '1/16').steps, []);
  assert.deepEqual(crossedSteps(1, 0.5, '1/16').steps, []);   // time never runs back
});

test('returning from a long stall catches up rather than dumping the backlog', () => {
  // a minute asleep at 16ths is 240 steps; firing them all would be a burst of
  // noise, so the cap keeps the most RECENT ones and says how many it dropped
  const r = crossedSteps(0, 60, '1/16', 16);
  assert.equal(r.steps.length, 16);
  assert.equal(r.dropped, 240 - 16);
  assert.equal(r.steps[r.steps.length - 1], 240);   // ends at now, not at the start
  assert.equal(r.steps[0], 225);
});

test('swing delays the odd steps', () => {
  assert.equal(swungBeatOffset(0, 0.5, '1/16'), 0);
  assert.ok(near(swungBeatOffset(1, 0.5, '1/16'), 0.0625));   // half of half a 16th
  assert.equal(swungBeatOffset(1, 0, '1/16'), 0);
  assert.ok(near(swungBeatOffset(3, 1, '1/8'), 0.25));
});

test('MIDI realtime bytes are recognised', () => {
  assert.deepEqual(transportEvent(0xF8), { kind: 'clock' });
  assert.deepEqual(transportEvent([0xFA]), { kind: 'start' });
  assert.deepEqual(transportEvent([0xFB]), { kind: 'continue' });
  assert.deepEqual(transportEvent([0xFC]), { kind: 'stop' });
  assert.deepEqual(transportEvent([0xFF]), { kind: 'reset' });
  assert.equal(transportEvent([0x90, 60, 100]), null);
  assert.equal(transportEvent(null), null);
});

test('clock-out emits 24 pulses per quarter note', () => {
  assert.equal(PPQN, 24);
  assert.equal(clockPulsesBetween(0, 1), 24);
  assert.equal(clockPulsesBetween(0, 0.5), 12);
  assert.equal(clockPulsesBetween(1, 2), 24);
  assert.equal(clockPulsesBetween(0, 0.01), 0);      // nothing due yet
  assert.equal(clockPulsesBetween(2, 1), 0);         // never negative
});

test('external tempo uses the median, so one late pulse cannot yank it', () => {
  // 120bpm at 24ppqn = a pulse every 20.833ms
  const steady = new Array(24).fill(20.8333);
  assert.ok(Math.abs(estimateTempoFromPulses(steady) - 120) < 0.5);
  // a single USB hiccup among steady pulses barely moves it
  const hiccup = [...steady]; hiccup[10] = 300;
  assert.ok(Math.abs(estimateTempoFromPulses(hiccup) - 120) < 0.5);
  // …whereas a mean would have been dragged well off
  const mean = hiccup.reduce((a, b) => a + b, 0) / hiccup.length;
  assert.ok(Math.abs(60000 / (mean * PPQN) - 120) > 5);
  assert.equal(estimateTempoFromPulses([]), null);
  assert.equal(estimateTempoFromPulses(null), null);
});

test('tap tempo averages recent taps and forgets stale ones', () => {
  assert.ok(Math.abs(tapTempo([0, 500, 1000, 1500]) - 120) < 0.001);
  assert.ok(Math.abs(tapTempo([0, 1000, 2000]) - 60) < 0.001);
  assert.equal(tapTempo([100]), null);
  assert.equal(tapTempo([]), null);
  // a long pause starts a fresh measurement instead of averaging across it
  assert.ok(Math.abs(tapTempo([0, 500, 60000, 60500, 61000]) - 120) < 0.001);
  // …and a lone tap after a pause is not yet a tempo
  assert.equal(tapTempo([0, 500, 60000]), null);
});

test('geometry + the play button hit box', () => {
  const g = transportGeometry(220, 56, 8);
  assert.equal(g.x, 8);
  assert.equal(g.w, 204);
  assert.equal(hitTransportButton(g, 12, 20), true);
  assert.equal(hitTransportButton(g, 200, 20), false);
  assert.equal(hitTransportButton(g, 12, 2), false);
});
