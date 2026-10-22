// scriptTimerIntervals.test.js — an interval or a delay a script got wrong starts nothing.
//
// startTimer(id, "fast"), startTimer(id) and startTimer(id, -100) all became `Number(ms) || 0`: a
// timer firing every millisecond in the editor and every 5 in the player, a script flooding the
// panel because of a typo. syncTimer("step", "1/16") was the same, and after("1s", fn) and
// afterBeats("1/4", fn) ran at once. Now a repeating interval has to be a number above 0, a
// one-shot's delay a number from 0 (0 is "as soon as the handler has returned"), and a musical
// length may also be a division's name, which has one meaning and is read.
//
// The words are compared across the four engines in scriptPreludeAgreement.test.js; this pins what
// happens in the editor: no timer is armed, nothing is scheduled, and what is accepted still runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  resetScriptStateForTesting, scriptApiForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { transport } from '../src/CE_Application/stores/transport.js';

const api = scriptApiForTesting('', 'timer-probe');
const errorsOf = (fn) => {
  clearScriptTrace();
  const out = fn();
  return { out, errors: get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message) };
};

test.afterEach(() => resetScriptStateForTesting());

test('a repeating timer with an interval that is not a number above 0 is not started', () => {
  const cases = [
    [['t', 'fast'], 'ce.time.startTimer("t"): "fast" is not a number of milliseconds, so no timer was started.'],
    [['t'], 'ce.time.startTimer("t"): no interval was given, so no timer was started.'],
    [['t', -100], 'ce.time.startTimer("t"): -100 is not more than 0 milliseconds, so no timer was started.'],
    [['t', 0], 'ce.time.startTimer("t"): 0 is not more than 0 milliseconds, so no timer was started.'],
    [['t', NaN], 'ce.time.startTimer("t"): the interval is not a finite number of milliseconds, so no timer was started.'],
    [['t', '250'], 'ce.time.startTimer("t"): "250" is not a number of milliseconds, so no timer was started.'],
    [['t', true], 'ce.time.startTimer("t"): the interval is not a number of milliseconds, so no timer was started.'],
  ];
  for (const [args, line] of cases) {
    assert.deepEqual(errorsOf(() => api.ce.time.startTimer(...args)).errors, [line]);
    assert.deepEqual(api.ce.time.timers(), [], `startTimer(${JSON.stringify(args)}) armed a timer`);
  }
  assert.deepEqual(errorsOf(() => api.ce.time.startTimer('t', 250)).errors, []);
  assert.deepEqual(api.ce.time.timers(), ['t']);
});

test('a refused interval leaves an existing timer of that name as it was', () => {
  api.ce.time.startTimer('t', 250);
  api.ce.time.startTimer('t', 'fast');
  assert.deepEqual(api.ce.time.timers(), ['t'], 'the typo neither stopped nor re-timed it');
});

test('a one-shot with a delay that is not a number from 0 schedules nothing; 0 is the next tick', async () => {
  let ran = 0;
  const fn = () => { ran += 1; };
  assert.deepEqual(errorsOf(() => api.ce.time.after('1s', fn)), {
    out: undefined,
    errors: ['ce.time.after: "1s" is not a number of milliseconds, so nothing was scheduled.'],
  });
  assert.deepEqual(errorsOf(() => api.ce.time.after(-5, fn)).errors,
    ['ce.time.after: -5 is less than 0 milliseconds, so nothing was scheduled.']);
  assert.deepEqual(errorsOf(() => api.ce.time.after(null, fn)).errors,
    ['ce.time.after: no delay was given, so nothing was scheduled.']);
  const { out, errors } = errorsOf(() => api.ce.time.after(0, fn));
  assert.deepEqual(errors, []);
  assert.match(String(out), /^__after:/);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ran, 1, 'the refused ones never ran, and the one at 0 ran once');
});

test('syncTimer and afterBeats read a division by name and refuse anything else that is not beats', () => {
  transport.update((t) => ({ ...t, bpm: 120 }));
  // At 120 bpm a sixteenth is 125 ms, so "1/16" is read rather than becoming 1 ms.
  assert.deepEqual(errorsOf(() => api.ce.time.syncTimer('step', '1/16')).errors, []);
  assert.deepEqual(errorsOf(() => api.ce.time.syncTimer('step8', '1/8t')).errors, [], 'any case, as ce.time.division reads it');
  assert.deepEqual(api.ce.time.timers(), ['step', 'step8']);

  const divisions = '1/1, 1/2, 1/4, 1/8, 1/16, 1/32, 1/2D, 1/4D, 1/8D, 1/16D, 1/2T, 1/4T, 1/8T, 1/16T';
  assert.deepEqual(errorsOf(() => api.ce.time.syncTimer('bad', '1/6')).errors, [
    `ce.time.syncTimer("bad"): "1/6" is neither a number of beats nor a division, so no timer was started. The divisions are ${divisions}.`,
  ]);
  assert.deepEqual(errorsOf(() => api.ce.time.syncTimer('bad', 0)).errors,
    ['ce.time.syncTimer("bad"): 0 is not more than 0 beats, so no timer was started.']);
  assert.deepEqual(errorsOf(() => api.ce.time.syncTimer('bad')).errors,
    ['ce.time.syncTimer("bad"): no number of beats was given, so no timer was started.']);
  assert.deepEqual(api.ce.time.timers(), ['step', 'step8'], 'none of the refused ones started');

  assert.deepEqual(errorsOf(() => api.ce.time.afterBeats('1/4', () => {})).errors, []);
  assert.deepEqual(errorsOf(() => api.ce.time.afterBeats(-1, () => {})).errors,
    ['ce.time.afterBeats: -1 is less than 0 beats, so nothing was scheduled.']);
  assert.deepEqual(errorsOf(() => api.ce.time.afterBeats('soon', () => {})).errors, [
    `ce.time.afterBeats: "soon" is neither a number of beats nor a division, so nothing was scheduled. The divisions are ${divisions}.`,
  ]);
});

test('the runtime\'s own one-shots are not held to the script\'s rule', () => {
  // sendNote's duration and requestDump's timeout work out their own delays, and a note-off that a
  // check refused would be a hung voice. A string duration is what sendNote has always read.
  assert.deepEqual(errorsOf(() => api.ce.midi.sendNote(1, 60, 100, '500')).errors, []);
});

test('a timer with no id, and a one-off with no function, are refused by name', () => {
  // startTimer and syncTimer with no id started nothing (syncTimer a timer called ""), stopTimer
  // with none stopped nothing, and after with no function said so as a plain line in after's
  // words whichever call it was. Each is an error now, in the call's own name.
  transport.update((t) => ({ ...t, bpm: 120 }));
  for (const [call, line] of [
    [() => api.ce.time.startTimer(undefined, 250), 'ce.time.startTimer: no id was given, so no timer was started.'],
    [() => api.ce.time.startTimer('', 250), 'ce.time.startTimer: no id was given, so no timer was started.'],
    [() => api.ce.time.syncTimer(null, 1), 'ce.time.syncTimer: no id was given, so no timer was started.'],
    [() => api.ce.time.stopTimer(), 'ce.time.stopTimer: no id was given, so nothing was stopped.'],
    [() => api.ce.time.after(10, 'x'), 'ce.time.after: fn is "x", not a function, so nothing was scheduled.'],
    [() => api.ce.time.after(10), 'ce.time.after: fn is nothing, not a function, so nothing was scheduled.'],
    [() => api.ce.time.afterBeats(1, 'x'), 'ce.time.afterBeats: fn is "x", not a function, so nothing was scheduled.'],
  ]) {
    assert.deepEqual(errorsOf(call), { out: undefined, errors: [line] });
  }
  assert.deepEqual(api.ce.time.timers(), [], 'none of them started a timer');
  assert.deepEqual(errorsOf(() => api.ce.time.stopTimer('nosuch')).errors, [], 'an id that is not running is not a mistake');
});
