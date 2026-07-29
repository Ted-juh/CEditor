// scriptTime.test.js — ce.time's grid, clock and transport arithmetic (design doc §38).
//
// The three layers, and the third is the one that matters:
//
//   1. scriptPreludeAgreement.test.js proves the four runtimes agree WITH EACH OTHER.
//   2. ScriptRuntimeTests.cpp §38 proves each engine gets there through its own prelude.
//   3. This file proves they agree with THE PANEL — by importing utils/transportLayout.js, the
//      master clock every synced component in the app runs on, and asserting the verbs equal it.
//
// Four runtimes can be consistently wrong together. A script stepping a sequence at "1/8T" while
// the Arpeggiator beside it steps at a different third of a beat is the failure this exists for,
// and only layer 3 can see it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY } from '../src/CE_Application/scripting/panelApi.js';
import { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, PPQN } from '../src/CE_Application/scripting/timeTables.js';
import {
  DIVISIONS as PANEL_DIVISIONS, beatsPerStep, barBeat, formatBarBeat, stepAtBeat, crossedSteps,
  swungBeatOffset, cyclePhaseAt, cycleCountAt, cycleBeats, loopedBeats, loopCycleIndex,
  tapTempo, estimateTempoFromPulses, MIN_BPM, MAX_BPM,
} from '../src/CE_Application/utils/transportLayout.js';

const api = scriptApiForTesting('', 'time-script');

/* ------------------------------------------------------------------ the table itself */

test('the division table IS the transport\'s, not a copy of it', () => {
  // A script asking for "1/8T" and an Arpeggiator set to "1/8T" have to mean the same third of a
  // beat. Two tables that agree today are two tables that disagree after the next edit.
  assert.equal(DIVISIONS, PANEL_DIVISIONS, 'ce.time must read the transport table, not restate it');
});

test('every division is a positive fraction of a beat, and the names line up', () => {
  for (const id of DIVISION_NAMES) {
    assert.ok(DIVISIONS[id] > 0, `${id} must be a positive number of beats`);
    assert.equal(typeof DIVISION_LABELS[id], 'string', `${id} must have a label`);
  }
  assert.deepEqual(DIVISION_NAMES, Object.keys(DIVISIONS), 'the name list must be the table\'s keys');
});

test('the divisions that have one right answer have it', () => {
  assert.equal(DIVISIONS['1/4'], 1, 'a quarter note IS a beat');
  assert.equal(DIVISIONS['1/16'], 0.25);
  assert.equal(DIVISIONS['1/8D'], 0.75, 'a dotted eighth is one and a half eighths');
  assert.equal(DIVISIONS['1/8T'], 1 / 3, 'a triplet eighth is a third of a beat');
  assert.equal(PPQN, 24, 'MIDI clock resolution');
});

/* ------------------------------------------------------------------------ the contract */

test('every phase-12b verb is declared, cross-runtime, and namespaced under ce.time', () => {
  for (const [id, path] of [
    ['nowMs', 'ce.time.now'], ['beatsPerDivision', 'ce.time.division'],
    ['divisionNames', 'ce.time.divisions'], ['barBeatAt', 'ce.time.position'],
    ['stepAt', 'ce.time.step'], ['stepsBetween', 'ce.time.steps'],
    ['swingOffset', 'ce.time.swing'], ['cycleAt', 'ce.time.cycle'],
    ['loopedBeats', 'ce.time.looped'], ['tapTempo', 'ce.time.tap'],
    ['clockTempo', 'ce.time.clockTempo'], ['afterBeats', 'ce.time.afterBeats'],
    ['runningTimers', 'ce.time.timers'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // Grid arithmetic is arithmetic. Gating it to the open window would stop every sequencing idea
    // at the edge of the editor, which is why ce.time is RUNTIME_ANY.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});

test('the flat aliases keep a qualifier where a bare global would collide', () => {
  // §1's rule. `now`, `step`, `swing`, `position` and `division` are exactly the words a panel
  // author reaches for, so flat they are nowMs, stepAt, swingOffset, barBeatAt, beatsPerDivision.
  for (const bare of ['now', 'step', 'steps', 'swing', 'position', 'division', 'divisions', 'cycle',
                      'looped', 'tap', 'timers']) {
    assert.equal(MEMBER_BY_ID[bare], undefined, `"${bare}" must not be a flat global`);
  }
});

/* ------------------------------------------------------------------------------ now */

test('now is monotonic and measured in milliseconds', () => {
  const a = api.nowMs();
  const b = api.nowMs();
  assert.equal(typeof a, 'number');
  assert.ok(Number.isFinite(a), 'a reading must be a real number');
  assert.ok(b >= a, 'time must not go backwards between two reads');
  // The unit is the one every other timer verb takes, which is the whole point: after(now2 - now1)
  // has to mean something.
  assert.ok(b - a < 1000, 'two consecutive reads cannot be a second apart');
});

/* ------------------------------------------------------------------------- divisions */

test('division converts every name the panel uses, and agrees with the transport', () => {
  for (const id of DIVISION_NAMES) {
    assert.equal(api.beatsPerDivision(id), beatsPerStep(id), id);
  }
});

test('an unknown division returns nothing — the ONE place this differs from the component', () => {
  // beatsPerStep falls back to 1/16 because a component has to keep running with a bad property.
  // A script has no such obligation, and a sequencer silently running at a sixteenth because the
  // name was mistyped is worse than one that stops.
  assert.equal(beatsPerStep('1/3'), DIVISIONS['1/16'], 'the component falls back…');
  assert.equal(api.beatsPerDivision('1/3'), undefined, '…and the verb deliberately does not');
  assert.equal(api.beatsPerDivision(''), undefined);
});

test('divisions lists every one, in picker order, with its label and length', () => {
  const list = api.divisionNames();
  assert.deepEqual(list.map((d) => d.id), DIVISION_NAMES, 'order must be the table\'s');
  for (const d of list) {
    assert.equal(d.label, DIVISION_LABELS[d.id]);
    assert.equal(d.beats, beatsPerStep(d.id));
  }
});

/* -------------------------------------------------------------------------- position */

test('position is the Transport component\'s own reading, over a whole song', () => {
  for (const perBar of [3, 4, 5, 7]) {
    for (let i = 0; i < 400; i += 1) {
      const beats = i * 0.37;
      const mine = api.barBeatAt(beats, perBar);
      const theirs = barBeat(beats, { beats: perBar, unit: 4 });
      assert.equal(mine.bar, theirs.bar, `${beats}/${perBar} bar`);
      assert.equal(mine.beat, theirs.beat, `${beats}/${perBar} beat`);
      assert.equal(mine.tick, theirs.tick, `${beats}/${perBar} tick`);
      assert.equal(mine.text, formatBarBeat(beats, { beats: perBar, unit: 4 }),
        'the readout must match the component character for character');
    }
  }
});

test('bars and beats count from 1, and ticks from 0 at 24 PPQN', () => {
  assert.deepEqual(
    { bar: api.barBeatAt(0).bar, beat: api.barBeatAt(0).beat, tick: api.barBeatAt(0).tick },
    { bar: 1, beat: 1, tick: 0 }, 'the very start is 1.1.00, not 0.0.00');
  assert.equal(api.barBeatAt(4).text, '2.1.00', 'four beats in 4/4 is the top of bar 2');
  assert.equal(api.barBeatAt(4.5).text, '2.1.12', 'half a beat is twelve ticks of twenty-four');
  assert.equal(api.barBeatAt(4.5, 3).text, '2.2.12', 'in 3/4 the same position is a beat later');
});

test('position defaults to 4/4 and never goes negative', () => {
  assert.deepEqual(api.barBeatAt(4.5), api.barBeatAt(4.5, 4));
  assert.equal(api.barBeatAt(-10).text, '1.1.00', 'before the start is the start');
});

/* ----------------------------------------------------------------------- step / steps */

test('step is the transport\'s own step index, for every division', () => {
  for (const id of DIVISION_NAMES) {
    for (let i = 0; i < 200; i += 1) {
      const beats = i * 0.17;
      assert.equal(api.stepAt(beats, id), stepAtBeat(beats, id), `${id} @ ${beats}`);
    }
  }
  assert.equal(api.stepAt(2.5, 'nope'), undefined, 'and an unknown division steps nowhere');
});

test('steps is the transport\'s crossedSteps — the rule that never loses an event', () => {
  for (const id of ['1/16', '1/4', '1/8T']) {
    for (let i = 0; i < 60; i += 1) {
      const from = i * 0.31;
      const to = from + (i % 7) * 0.43;
      assert.deepEqual(api.stepsBetween(from, to, id), crossedSteps(from, to, id, 16),
        `${id}: ${from} → ${to}`);
    }
  }
});

test('a stalled frame FIRES the steps it slept through rather than dropping them', () => {
  // The difference between a stutter and a hole in the bar.
  const r = api.stepsBetween(0, 1, '1/16');
  assert.deepEqual(r.steps, [1, 2, 3, 4], 'a whole beat of sixteenths is four steps');
  assert.equal(r.dropped, 0);
});

test('the catch-up is capped, and what was dropped is REPORTED rather than swallowed', () => {
  const r = api.stepsBetween(0, 100, '1/16');
  assert.equal(r.steps.length, 16, 'the default cap');
  assert.equal(r.dropped, 400 - 16, 'and the rest is counted, not hidden');
  // The MOST RECENT steps are kept: catching up to now matters more than replaying where you were.
  assert.equal(r.steps[r.steps.length - 1], 400);
  assert.deepEqual(api.stepsBetween(0, 100, '1/16', 4).steps, [397, 398, 399, 400]);
});

test('no time passing crosses no steps', () => {
  assert.deepEqual(api.stepsBetween(1, 1, '1/16'), { steps: [], dropped: 0 });
  assert.deepEqual(api.stepsBetween(5, 1, '1/16'), { steps: [], dropped: 0 }, 'and neither does going back');
  assert.equal(api.stepsBetween(0, 1, 'nope'), undefined);
});

/* ------------------------------------------------------------------------------ swing */

test('swing is the transport\'s own shuffle, for every division and amount', () => {
  for (const id of DIVISION_NAMES) {
    for (const amount of [0, 0.25, 0.5, 1]) {
      for (let step = -4; step <= 8; step += 1) {
        assert.equal(api.swingOffset(step, amount, id), swungBeatOffset(step, amount, id),
          `${id} @ ${amount} step ${step}`);
      }
    }
  }
});

test('even steps are never pushed, odd ones by up to half a step', () => {
  assert.equal(api.swingOffset(0, 1, '1/16'), 0, 'the downbeat never moves');
  assert.equal(api.swingOffset(2, 1, '1/16'), 0);
  assert.equal(api.swingOffset(1, 1, '1/16'), 0.125, 'full swing is half a sixteenth');
  assert.equal(api.swingOffset(1, 0.5, '1/16'), 0.0625);
  assert.equal(api.swingOffset(1, 0, '1/16'), 0, 'no swing is no offset');
  assert.equal(api.swingOffset(1, 5, '1/16'), 0.125, 'and the amount is clamped to 0..1');
  assert.equal(api.swingOffset(1, 0.5, 'nope'), undefined);
});

/* ------------------------------------------------------------------------------ cycle */

test('cycle is the transport\'s own bar-length loop maths', () => {
  for (const bars of [0.25, 0.5, 1, 2, 4, 7.5]) {
    for (const perBar of [3, 4]) {
      for (let i = 0; i < 120; i += 1) {
        const beats = i * 0.63;
        const mine = api.cycleAt(beats, bars, perBar);
        assert.equal(mine.phase, cyclePhaseAt(beats, bars, perBar), `${bars}b/${perBar} @ ${beats}`);
        assert.equal(mine.count, cycleCountAt(beats, bars, perBar));
        assert.equal(mine.length, cycleBeats(bars, perBar));
      }
    }
  }
});

test('a cycle is derived from the position, so it is still exact after an hour', () => {
  const oneHourAt120 = 120 * 60;                 // beats
  const late = api.cycleAt(oneHourAt120, 1, 4);
  assert.equal(late.phase, 0, 'exactly on the bar line, not a rounding error away from it');
  assert.equal(late.count, oneHourAt120 / 4);
});

test('cycle clamps its length rather than dividing by nothing', () => {
  assert.equal(api.cycleAt(6, 0).length, cycleBeats(0, 4), 'zero bars is the minimum, not zero');
  assert.ok(Number.isFinite(api.cycleAt(6, 0).phase));
  assert.equal(api.cycleAt(6, 1000).length, cycleBeats(1000, 4), 'and a huge one is capped');
  assert.deepEqual(api.cycleAt(6, 1), api.cycleAt(6, 1, 4), '4/4 is the default');
});

/* ----------------------------------------------------------------------------- looped */

test('looped is the transport\'s own folding, position and pass together', () => {
  for (const [start, length] of [[0, 8], [4, 8], [4, 0.5], [12, 3]]) {
    for (let i = 0; i < 200; i += 1) {
      const beats = i * 0.29;
      const mine = api.loopedBeats(beats, start, length);
      assert.equal(mine.beats, loopedBeats(beats, start, length), `${beats} in [${start}, +${length}]`);
      assert.equal(mine.pass, loopCycleIndex(beats, start, length));
    }
  }
});

test('you can run IN to a loop from earlier in the song', () => {
  // Untouched before the start — what every DAW does, and what a count-in needs.
  assert.deepEqual(api.loopedBeats(0, 4, 8), { beats: 0, pass: -1 });
  assert.deepEqual(api.loopedBeats(3.9, 4, 8), { beats: 3.9, pass: -1 });
  assert.deepEqual(api.loopedBeats(4, 4, 8), { beats: 4, pass: 0 }, 'and the loop starts at the start');
});

test('the fold is a FUNCTION of the timeline, so a wrap cannot be missed', () => {
  assert.deepEqual(api.loopedBeats(13, 4, 8), { beats: 5, pass: 1 });
  assert.deepEqual(api.loopedBeats(21, 4, 8), { beats: 5, pass: 2 }, 'same place, next time round');
  // A script watching `pass` for a CHANGE sees every wrap, however long the frame was — there is no
  // counter to reset and no handler that can be skipped.
  let passes = 0;
  let previous = api.loopedBeats(4, 4, 8).pass;
  for (let b = 4; b < 100; b += 3.7) {
    const p = api.loopedBeats(b, 4, 8).pass;
    if (p !== previous) { passes += 1; previous = p; }
  }
  assert.equal(passes, 11, 'ninety-six beats of an eight-beat loop is eleven more passes');
});

/* --------------------------------------------------------------------- tap / clock */

test('tap is the transport\'s own tap tempo', () => {
  for (const times of [[0, 500, 1000, 1500], [0, 500, 5000, 5500], [1000], [], [0, 10], [100, 50]]) {
    assert.equal(api.tapTempo(times) ?? null, tapTempo(times, 2000), JSON.stringify(times));
  }
});

test('four taps half a second apart is 120 BPM', () => {
  assert.equal(api.tapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(api.tapTempo([0, 250, 500, 750]), 240);
});

test('a PAUSE starts a new measurement — the thing a hand-rolled tap gets wrong', () => {
  // Without the reset the 3500ms gap averages in and the answer is nonsense.
  assert.equal(api.tapTempo([0, 500, 5000, 5500]), 120, 'only the taps after the break count');
  assert.equal(api.tapTempo([0, 500, 1000], 100), undefined, 'and a short reset discards them all');
});

test('tap needs two usable taps and stays inside the tempo range', () => {
  assert.equal(api.tapTempo([1000]), undefined);
  assert.equal(api.tapTempo([]), undefined);
  assert.equal(api.tapTempo(null), undefined);
  assert.equal(api.tapTempo([1000, 1010]), MAX_BPM, 'ten milliseconds apart is not 6000 BPM');
  // A gap slow enough to clamp at the bottom is also longer than the default reset, so reaching
  // MIN_BPM at all takes a longer window — which is itself the reset rule working.
  assert.equal(api.tapTempo([1000, 5000]), undefined, 'four seconds apart is a new measurement');
  assert.equal(api.tapTempo([1000, 5000], 10000), MIN_BPM);
});

test('a timestamp of exactly 0 is discarded, which is worth knowing about now()', () => {
  // The transport's filter is `> 0`, because its timestamps come from a wall clock and 0 means "no
  // reading". now() is monotonic-from-an-arbitrary-origin, and in the WebView that origin is close
  // to zero — so the very first tap of a session can be dropped. Pinned rather than papered over:
  // it costs one tap, and changing the filter would change the component's behaviour too.
  assert.equal(api.tapTempo([0, 500]), undefined, 'one tap survives the filter, which is not enough');
  assert.equal(api.tapTempo([0, 500, 1000]), 120, 'the two after it are a measurement');
});

test('clockTempo is the transport\'s own pulse estimate, and takes the MEDIAN', () => {
  for (const gaps of [[20.8, 20.8, 20.8], [20, 21, 100, 20], [], [0, -1], [20.8]]) {
    assert.equal(api.clockTempo(gaps) ?? null, estimateTempoFromPulses(gaps), JSON.stringify(gaps));
  }
  // 24 pulses per quarter note: 20.833ms between pulses is 120 BPM.
  assert.ok(Math.abs(api.clockTempo([20.8333, 20.8333, 20.8333]) - 120) < 0.01);
});

test('one late pulse does not drag the reading — that is why it is not a mean', () => {
  const steady = api.clockTempo([20.8, 20.8, 20.8, 20.8, 20.8]);
  const hiccup = api.clockTempo([20.8, 20.8, 400, 20.8, 20.8]);
  assert.equal(hiccup, steady, 'a USB stall must not move the BPM readout at all');
  assert.equal(api.clockTempo([]), undefined);
});

/* ---------------------------------------------------------------------------- timers */

test('timers lists what was started by name, and forgets it when stopped', () => {
  api.startTimer('a', 1000);
  api.startTimer('b', 1000);
  try {
    assert.deepEqual(api.runningTimers(), ['a', 'b'], 'sorted, so the answer is stable');
    api.stopTimer('a');
    assert.deepEqual(api.runningTimers(), ['b']);
  } finally {
    api.stopTimer('a');
    api.stopTimer('b');
  }
  assert.deepEqual(api.runningTimers(), []);
});

test('one-shots are not listed — after() already handed you its id', () => {
  const id = api.after(60000, () => {});
  try {
    assert.ok(id, 'after returns an id');
    assert.deepEqual(api.runningTimers(), [], 'and it is not in the list');
    // …but it IS cancellable, which is what makes the id worth returning.
    api.stopTimer(id);
  } finally {
    api.stopTimer(id);
  }
});

test('afterBeats refuses rather than firing immediately when there is no tempo', () => {
  // The editor's own clock always reports one, so this is the honest branch: with no tempo there is
  // no delay to compute, and scheduling "now" would play the note at the wrong moment rather than
  // not at all.
  const beats = api.msToBeats(500);
  if (beats === null) {
    assert.equal(api.afterBeats(1, () => {}), undefined);
    return;
  }
  const id = api.afterBeats(1, () => {});
  assert.ok(id, 'with a tempo it schedules and hands back an id');
  api.stopTimer(id);
});

test('afterBeats and after agree about how long a beat is', () => {
  // Both go through beatsToMs, so this pins that afterBeats did not grow a second opinion.
  const ms = api.beatsToMs(1);
  assert.ok(ms > 0, 'the test clock reports a tempo');
  assert.equal(ms, api.msToBeats(ms) * ms / api.msToBeats(ms), 'sanity: the conversions are inverses');
  const id = api.afterBeats(1, () => {});
  assert.deepEqual(api.runningTimers(), [], 'a one-shot is still not a named timer');
  api.stopTimer(id);
});

/* ------------------------------------------------------- syncTimer follows the tempo */
// The behaviour change this phase makes to a shipped verb, so it is pinned rather than described.
// The first version computed the interval once and then fired at that rate for the rest of the
// session: a syncTimer("step", 0.25) armed at 120 BPM stayed a 500ms timer at 60 BPM, which is not
// a sixteenth of anything. Nobody deliberately relies on that, so following is now the default.

import { get } from 'svelte/store';
import { transport as transportStore } from '../src/CE_Application/stores/transport.js';

/** Publish a transport state, run fn, and put the store back however fn ended. */
function withTransport(state, fn) {
  const before = get(transportStore);
  transportStore.set({ ...before, ...state });
  try { return fn(); } finally { transportStore.set(before); }
}

/** Record the interval every timer is armed with. The period is not readable from the API — it is
    the runtime's business — so the only honest way to assert a re-arm HAPPENED is to watch the
    call the runtime makes. */
function recordingIntervals(fn) {
  const real = globalThis.setInterval;
  const periods = [];
  globalThis.setInterval = (cb, ms) => { periods.push(ms); return real(cb, 1e9); };
  try { fn(periods); } finally { globalThis.setInterval = real; }
  return periods;
}

test('a sync timer re-times itself when the tempo changes', () => {
  const periods = recordingIntervals(() => {
    withTransport({ running: true, bpm: 120, beats: 0, beatsPerBar: 4, seq: 1 }, () => {
      api.syncTimer('follower', 1);                    // one beat = 500ms at 120
      assert.deepEqual(api.runningTimers(), ['follower']);
    });
    // Halve the tempo: a beat is now a second, so the timer must become a one-second timer.
    withTransport({ running: true, bpm: 60, beats: 1, beatsPerBar: 4, seq: 2 }, () => {
      assert.deepEqual(api.runningTimers(), ['follower'], 'and it is still running');
    });
  });
  api.stopTimer('follower');
  // Three, not two: withTransport puts the tempo back when it leaves, and going back to 120 is
  // itself a tempo change — which is the behaviour following in both directions, not a leak.
  assert.deepEqual(periods, [500, 1000, 500],
    'armed at 500ms for 120 BPM, RE-armed at 1000ms when the tempo halved, and back again');
});

test('the re-arm happens once per tempo change, not once per transport publish', () => {
  // The store ticks at ~30Hz. Re-arming on every publish is a timer that never reaches its period.
  const periods = recordingIntervals(() => {
    withTransport({ running: true, bpm: 120, beats: 0, seq: 1 }, () => api.syncTimer('once', 1));
    for (let i = 0; i < 20; i += 1) {
      withTransport({ running: true, bpm: 120, beats: i * 0.03, seq: i + 2 }, () => {});
    }
  });
  api.stopTimer('once');
  assert.deepEqual(periods, [500], 'twenty publishes at an unchanged tempo re-arm nothing at all');
});

test('{ follow = false } keeps the old behaviour, and startTimer cancels the following', () => {
  try {
    withTransport({ running: true, bpm: 120, beats: 0, beatsPerBar: 4, seq: 3 }, () => {
      api.syncTimer('frozen', 1, { follow: false });
      api.syncTimer('thawed', 1);
      // An explicit millisecond interval REPLACES a musical one — a script asking for milliseconds
      // is not asking for beats, so this stops following too.
      api.startTimer('thawed', 250);
      assert.deepEqual(api.runningTimers(), ['frozen', 'thawed']);
    });
  } finally {
    api.stopTimer('frozen');
    api.stopTimer('thawed');
  }
  assert.deepEqual(api.runningTimers(), [], 'and stopping forgets both');
});

test('with no tempo, syncTimer starts nothing rather than guessing an interval', () => {
  try {
    withTransport({ running: false, bpm: null, beats: 0, beatsPerBar: 4, seq: 4 }, () => {
      api.syncTimer('nope', 1);
      assert.deepEqual(api.runningTimers(), [],
        'a timer at an invented tempo is worse than no timer, and the log says which');
    });
  } finally {
    api.stopTimer('nope');
  }
});
