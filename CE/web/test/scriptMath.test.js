// scriptMath.test.js — ce.math beyond the scalar helpers (design doc §30).
//
// ce.math was eight verbs and every one of them was scalar and stateless: one number in, one number
// out. Everything a panel actually wrangles — a range that comes back round, a taper of its own
// shape, a set of settings rather than a step, a weighted pick — had to be hand-rolled per panel in
// five languages, and the hand-rolled version is where the runtimes drift.
//
// The values here are asserted against the C++ preludes, which are the reference: a script doing
// this arithmetic in the editor and in the shipped plugin has to get the same number.
// CE/tests/ScriptRuntimeTests.cpp §35 runs the same cases in Lua and JavaScript.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { MEMBER_BY_ID, memberPath } from '../src/CE_Application/scripting/panelApi.js';

const api = scriptApiForTesting();
const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* -------------------------------------------------------------------------- the contract */

test('the six new members are declared and namespaced', () => {
  for (const [id, path] of [
    ['wrap', 'ce.math.wrap'],
    ['mapCurve', 'ce.math.map'],
    ['quantizeTo', 'ce.math.quantize'],
    ['randomChoice', 'ce.math.choice'],
    ['dbToGain', 'ce.math.dbToGain'],
    ['gainToDb', 'ce.math.gainToDb'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    assert.equal(typeof api[id], 'function', `${id} is not bound`);
  }
  // The namespaced spellings are the readable ones; flat they keep a prefix, because a bare global
  // `map` or `choice` is the collision the module rules warn about.
  assert.equal(api.ce.math.map, api.mapCurve);
  assert.equal(api.ce.math.choice, api.randomChoice);
  assert.equal(api.ce.math.wrap, api.wrap);
});

/* ---------------------------------------------------------------------------------- wrap */

test('wrap brings a value round into a half-open range', () => {
  assert.equal(api.wrap(0, 0, 12), 0);
  assert.equal(api.wrap(5, 0, 12), 5);
  // Half-open: the top of the range IS the bottom, which is what makes it a pitch class.
  assert.equal(api.wrap(12, 0, 12), 0);
  assert.equal(api.wrap(13, 0, 12), 1);
  assert.equal(api.wrap(25, 0, 12), 1);
});

test('wrap is the reason it exists: negatives come back positive', () => {
  // (-1) % 12 is 11 in Lua and Python and -1 in JavaScript, C++, C# and Java. A panel writing the
  // ordinary pitch-class expression already gets two different answers depending on which engine
  // it is running in, and nothing said so. wrap() is the same number everywhere.
  assert.equal((-1) % 12, -1, 'the language still does the wrong thing — that is the point');
  assert.equal(api.wrap(-1, 0, 12), 11);
  assert.equal(api.wrap(-12, 0, 12), 0);
  assert.equal(api.wrap(-13, 0, 12), 11);
});

test('wrap works on a range that does not start at zero, and on floats', () => {
  assert.equal(api.wrap(64, -64, 64), -64);
  assert.equal(api.wrap(-65, -64, 64), 63);
  assert.ok(Math.abs(api.wrap(1.25, 0, 1) - 0.25) < 1e-9);
});

test('an empty or inverted range has one answer, not NaN', () => {
  assert.equal(api.wrap(5, 3, 3), 3);
  assert.equal(api.wrap(5, 12, 0), 12);
});

/* ----------------------------------------------------------------------------------- map */

const KNEE = [[0, 0], [0.5, 0.9], [1, 1]];

test('map draws straight lines through the breakpoints', () => {
  assert.equal(api.mapCurve(0, KNEE), 0);
  assert.equal(api.mapCurve(0.5, KNEE), 0.9);
  assert.equal(api.mapCurve(1, KNEE), 1);
  // Halfway along the first segment.
  assert.ok(Math.abs(api.mapCurve(0.25, KNEE) - 0.45) < 1e-9);
  // …and along the second, which has a different slope — the thing a single named curve cannot do.
  assert.ok(Math.abs(api.mapCurve(0.75, KNEE) - 0.95) < 1e-9);
});

test('outside the outermost points the value is held, not extrapolated', () => {
  // A curve drawn between 0 and 1 that suddenly runs away past 1 is never what the author drew.
  assert.equal(api.mapCurve(-5, KNEE), 0);
  assert.equal(api.mapCurve(5, KNEE), 1);
});

test('points are sorted, so the order they are written in does not matter', () => {
  assert.equal(api.mapCurve(0.25, [[1, 1], [0, 0], [0.5, 0.9]]), api.mapCurve(0.25, KNEE));
});

test('two points sharing an x are a step, and the later one wins', () => {
  // The alternative is a divide by zero, which is a NaN travelling into a control's value. The
  // breakpoint itself belongs to the value the step goes TO — otherwise "a step at 0.5" would
  // mean the old value at exactly 0.5 and the new one a millionth above it.
  const step = [[0, 0], [0.5, 0.2], [0.5, 0.8], [1, 1]];
  assert.ok(Math.abs(api.mapCurve(0.4, step) - 0.16) < 1e-9);
  assert.equal(api.mapCurve(0.5, step), 0.8);
  assert.ok(Math.abs(api.mapCurve(0.6, step) - 0.84) < 1e-9);
});

test('map accepts { x, y } points as well as pairs', () => {
  const asObjects = [{ x: 0, y: 0 }, { x: 0.5, y: 0.9 }, { x: 1, y: 1 }];
  assert.equal(api.mapCurve(0.25, asObjects), api.mapCurve(0.25, KNEE));
});

test('map with no usable points hands the value straight back', () => {
  assert.equal(api.mapCurve(0.4, []), 0.4);
});

/* ------------------------------------------------------------------------------ quantize */

test('quantizeTo snaps to the nearest value in a list', () => {
  assert.equal(api.quantizeTo(9, [0, 8, 16]), 8);
  assert.equal(api.quantizeTo(13, [0, 8, 16]), 16);
  assert.equal(api.quantizeTo(-4, [0, 8, 16]), 0);
  // snap() covers evenly spaced settings; a synth's actual settings are rarely evenly spaced.
  assert.equal(api.quantizeTo(30, [0, 12, 24, 48]), 24);
});

test('a tie goes to the lower value, so the answer never depends on rounding', () => {
  assert.equal(api.quantizeTo(4, [0, 8]), 0);
  assert.equal(api.quantizeTo(4, [8, 0]), 0, 'and not on the order the list was written in');
});

/* -------------------------------------------------------------------------------- choice */

test('choice picks from the list using the seeded generator', () => {
  api.randomSeed(7);
  const first = Array.from({ length: 8 }, () => api.randomChoice(['a', 'b', 'c']));
  api.randomSeed(7);
  const second = Array.from({ length: 8 }, () => api.randomChoice(['a', 'b', 'c']));
  // The same seed replays the same sequence — which is what makes a "random" patch reproducible.
  assert.deepEqual(first, second);
  for (const v of first) assert.ok(['a', 'b', 'c'].includes(v));
});

test('weights bias the pick without changing what comes after it', () => {
  // Exactly one number is drawn either way. A weighted pick consuming a different amount of the
  // sequence would change everything downstream of it, and "the same seed replays" would quietly
  // stop being true — so this asserts the DRAW COUNT, not just the distribution.
  api.randomSeed(11);
  api.randomChoice(['a', 'b'], [1, 3]);
  const afterWeighted = api.random();
  api.randomSeed(11);
  api.randomChoice(['a', 'b']);
  assert.equal(api.random(), afterWeighted);

  // A weight of zero is never picked.
  api.randomSeed(3);
  for (let i = 0; i < 24; i += 1) assert.equal(api.randomChoice(['never', 'always'], [0, 1]), 'always');
});

test('all-zero or missing weights fall back to an even pick, and an empty list to nothing', () => {
  api.randomSeed(5);
  assert.ok(['a', 'b'].includes(api.randomChoice(['a', 'b'], [0, 0])));
  assert.equal(api.randomChoice([]), undefined);
});

/* ------------------------------------------------------------------------------ decibels */

test('dB and linear gain convert both ways', () => {
  assert.equal(api.dbToGain(0), 1);
  assert.ok(Math.abs(api.dbToGain(-6) - 0.5011872336) < 1e-9);
  assert.ok(Math.abs(api.gainToDb(1)) < 1e-9);
  for (const db of [-40, -12, -6, 0, 6]) {
    assert.ok(Math.abs(api.gainToDb(api.dbToGain(db)) - db) < 1e-9, `round-trip failed at ${db} dB`);
  }
});

test('silence is the noise floor, not negative infinity', () => {
  // -inf is a number half the runtimes cannot carry through a value and none can put on a label.
  assert.equal(api.gainToDb(0), -144);
  assert.equal(api.gainToDb(-1), -144);
  assert.ok(Number.isFinite(api.gainToDb(0)));
});

/* --------------------------------------------------------------------------------- curve */

test('curve still does what it did for the names it knows', () => {
  assert.equal(api.curve(0.5, 'linear'), 0.5);
  assert.equal(api.curve(0.5, 'exp'), 0.25);
  assert.equal(api.curve(0.25, 'log'), 0.5);
  assert.equal(api.curve(0.5, 's'), 0.5);
});

test('a shape curve does not know is reported rather than silently linear', () => {
  clearScriptTrace();
  // Returning the input in silence reads as a curve that does nothing, rather than as a name that
  // was never applied — and the author has no way to tell those apart.
  assert.equal(api.curve(0.5, 'sine'), 0.5);
  assert.match(traced(), /unknown shape/);
  assert.match(traced(), /use map\(v, points\)/);

  clearScriptTrace();
  api.curve(0.5, 'linear');
  api.curve(0.5);
  assert.equal(traced(), '', 'the names it knows stay quiet');
});
