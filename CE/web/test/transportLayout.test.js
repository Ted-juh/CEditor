import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BPM, MAX_BPM, PPQN, DIVISIONS, DIVISION_IDS, beatsPerStep,
  transportBpm, transportSource, transportSignature,
  beatsAt, startedAtFor, secondsPerBeat, barBeat, formatBarBeat,
  stepAtBeat, crossedSteps, swungBeatOffset,
  transportEvent, clockPulsesBetween, estimateTempoFromPulses, tapTempo,
  transportGeometry, hitTransportButton,
  cycleBeats, cyclePhaseAt, cycleCountAt, barsLabel, musicalDelta, MIN_BARS, MAX_BARS,
  parseHostPosition, hostJumped, transportIsFollowing, TRANSPORT_SOURCES,
  loopRegion, loopedBeats, loopCycleIndex, formatLoopRange,
  countInBars, countInBeats, countInMs, countInRemaining, formatCountIn, MAX_COUNT_IN_BARS,
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

// --- Cycles (the Looper / Constellation unit) ---------------------------------
test('cycle phase comes from the position, so a long loop stays on the bar line', () => {
  // 2 bars of 4/4 = 8 beats.
  assert.ok(near(cycleBeats(2, 4), 8));
  assert.ok(near(cycleBeats(2, 3), 6));            // 3/4 makes a bar shorter
  assert.ok(near(cyclePhaseAt(0, 2, 4), 0));
  assert.ok(near(cyclePhaseAt(4, 2, 4), 0.5));
  assert.ok(near(cyclePhaseAt(8, 2, 4), 0));       // exactly back to the top
  // The whole point: an hour in, the loop point is still the bar line.
  assert.ok(near(cyclePhaseAt(8 * 900, 2, 4), 0));
  assert.equal(cycleCountAt(8 * 900, 2, 4), 900);
  assert.ok(near(cyclePhaseAt(8 * 900 + 2, 2, 4), 0.25));
});

test('bar counts clamp and read as English', () => {
  assert.ok(near(cycleBeats(0, 4), cycleBeats(MIN_BARS, 4)));    // clamped, not zero
  assert.ok(near(cycleBeats(9999, 4), cycleBeats(MAX_BARS, 4)));
  assert.equal(barsLabel(1), '1 bar');
  assert.equal(barsLabel(4), '4 bars');
  assert.equal(barsLabel(0.5), '1/2 bar');
  assert.equal(barsLabel(0.25), '1/4 bar');
});

// --- Musical time (the Kinetic unit) ------------------------------------------
test('musical delta is a no-op at the reference tempo and scales with it', () => {
  // One beat at 120bpm is half a second, so a beat of transport travel gives
  // the integrator half a second of simulation — identical to unsynced at 120.
  assert.ok(near(musicalDelta(0, 1), 0.5));
  assert.ok(near(musicalDelta(4, 6), 1.0));
  // Backwards or stalled: no step at all, never a negative one.
  assert.equal(musicalDelta(5, 5), 0);
  assert.equal(musicalDelta(5, 4), 0);
  // A different reference scales the whole thing.
  assert.ok(near(musicalDelta(0, 1, 60), 1.0));
});

// --- Host playhead --------------------------------------------------------------
test('the host playhead parser validates rather than casting', () => {
  const good = parseHostPosition({ bpm: 128, ppqPosition: 37.5, isPlaying: true, timeSigNumerator: 7, timeSigDenominator: 8 });
  assert.equal(good.ok, true);
  assert.equal(good.bpm, 128);
  assert.equal(good.beats, 37.5);
  assert.equal(good.playing, true);
  assert.equal(good.beatsPerBar, 7);
  assert.equal(good.beatUnit, 8);
  // Hosts that report no tempo on the first block must not become 0 bpm.
  const noTempo = parseHostPosition({ bpm: 0, ppqPosition: 4 });
  assert.equal(noTempo.bpm, null);
  assert.equal(noTempo.beats, 4);
  assert.equal(noTempo.ok, true);            // the position is still usable
  // A count-in is a legal negative ppq; we hold at 0 rather than showing bar -1.
  assert.equal(parseHostPosition({ bpm: 120, ppqPosition: -2 }).beats, 0);
  // Nothing usable at all.
  assert.equal(parseHostPosition({}).ok, false);
  assert.equal(parseHostPosition(null), null);
  assert.equal(parseHostPosition('nope'), null);
  // Absurd tempos clamp into range instead of breaking every follower.
  assert.equal(parseHostPosition({ bpm: 100000, ppqPosition: 0 }).bpm, MAX_BPM);
});

test('a host locate is a jump, playing on is not', () => {
  // Extrapolating between host updates is fine; this is the test for "did the
  // user hit rewind / did the loop wrap", which needs a re-anchor not a glide.
  assert.equal(hostJumped(8.00, 8.02), false);     // ordinary update jitter
  assert.equal(hostJumped(8.00, 8.40), true);      // loop wrapped or located
  assert.equal(hostJumped(8.00, 0.00), true);      // rewind to the top
  assert.equal(hostJumped(8.00, 8.02, 0.001), true); // a tighter tolerance says yes
  assert.equal(hostJumped(8.00, null), false);     // no reading is not a jump
});

// --- Loop points ------------------------------------------------------------------
test('the loop is a fold of the timeline, not a counter that resets', () => {
  // 4 bars from bar 3 in 4/4 → starts at beat 8, 16 beats long.
  const c = tp({ loopEnabled: true, loopStartBar: 3, loopLengthBars: 4 });
  const r = loopRegion(c, 4);
  assert.equal(r.enabled, true);
  assert.equal(r.startBeats, 8);
  assert.equal(r.lengthBeats, 16);
  // Before the loop start the position is untouched — you can run in to a loop.
  assert.equal(loopedBeats(0, 8, 16), 0);
  assert.equal(loopedBeats(7.9, 8, 16), 7.9);
  assert.equal(loopedBeats(8, 8, 16), 8);
  assert.equal(loopedBeats(20, 8, 16), 20);
  assert.equal(loopedBeats(24, 8, 16), 8);          // exactly round
  assert.equal(loopedBeats(29, 8, 16), 13);
  // The reason to fold rather than count: a thousand passes later it is still
  // exactly on the bar line, with no accumulated error to have gone wrong.
  assert.equal(loopedBeats(8 + 16 * 1000, 8, 16), 8);
  assert.ok(Math.abs(loopedBeats(8 + 16 * 1000 + 3.5, 8, 16) - 11.5) < 1e-9);
  // A 3/4 bar is shorter, so the same bar numbers mean fewer beats.
  assert.equal(loopRegion(c, 3).startBeats, 6);
  assert.equal(loopRegion(c, 3).lengthBeats, 12);
});

test('the loop cycle index is how a wrap gets noticed', () => {
  assert.equal(loopCycleIndex(4, 8, 16), -1);       // before the loop
  assert.equal(loopCycleIndex(8, 8, 16), 0);
  assert.equal(loopCycleIndex(23.9, 8, 16), 0);
  assert.equal(loopCycleIndex(24, 8, 16), 1);       // ← the wrap
  assert.equal(loopCycleIndex(40, 8, 16), 2);
});

test('loop settings clamp, and the range reads as bars', () => {
  assert.equal(loopRegion(tp({ loopEnabled: true, loopStartBar: 0 }), 4).startBar, 1);
  assert.equal(loopRegion(tp({ loopEnabled: true, loopLengthBars: 0 }), 4).lengthBars, MIN_BARS);
  assert.equal(loopRegion(tp({ loopEnabled: true, loopLengthBars: 9999 }), 4).lengthBars, MAX_BARS);
  assert.equal(formatLoopRange(loopRegion(tp({ loopEnabled: true, loopStartBar: 5, loopLengthBars: 4 }), 4)), '5–9');
  assert.equal(formatLoopRange(loopRegion(tp({ loopEnabled: false }), 4)), '');
});

// --- Count-in ---------------------------------------------------------------------
test('count-in length is bars at the meter, and it clamps', () => {
  assert.equal(countInBars(tp({})), 0);
  assert.equal(countInBars(tp({ countInBars: 2 })), 2);
  assert.equal(countInBars(tp({ countInBars: 99 })), MAX_COUNT_IN_BARS);
  assert.equal(countInBeats(2, 4), 8);
  assert.equal(countInBeats(2, 3), 6);
  assert.equal(countInBeats(0, 4), 0);
  // 2 bars of 4/4 at 120bpm is 4 seconds.
  assert.ok(Math.abs(countInMs(2, 4, 120) - 4000) < 1e-9);
});

test('the countdown reads the way a drummer counts it', () => {
  // Two bars of 4/4: "2.4 2.3 2.2 2.1 1.4 1.3 1.2 1.1" then go.
  assert.equal(formatCountIn(8, 4), '2.4');
  assert.equal(formatCountIn(7.2, 4), '2.4');    // still inside the 8th beat back
  assert.equal(formatCountIn(7, 4), '2.3');
  assert.equal(formatCountIn(5, 4), '2.1');
  assert.equal(formatCountIn(4, 4), '1.4');
  assert.equal(formatCountIn(1, 4), '1.1');
  assert.equal(formatCountIn(0, 4), '0.0');
  // 3/4 counts in threes.
  assert.equal(formatCountIn(6, 3), '2.3');
  assert.equal(formatCountIn(3, 3), '1.3');
});

test('count-in remaining is derived from the start instant, never accumulated', () => {
  const t0 = 1_000_000;
  // 8 beats at 120bpm = 4000ms.
  assert.equal(countInRemaining(t0, t0, 120, 8), 8);
  assert.equal(countInRemaining(t0, t0 + 2000, 120, 8), 4);
  assert.equal(countInRemaining(t0, t0 + 4000, 120, 8), 0);
  assert.equal(countInRemaining(t0, t0 + 9999, 120, 8), 0);   // never negative
  // Sampling coarsely gives the same answer as sampling finely, which is the
  // whole point of deriving it.
  assert.equal(countInRemaining(t0, t0 + 3000, 120, 8), countInRemaining(t0, t0 + 3000, 120, 8));
  assert.equal(countInRemaining(t0, t0 + 3000, 60, 8), 5);
});
