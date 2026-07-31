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
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY } from '../src/CE_Application/scripting/panelApi.js';

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

/* ==========================================================================================
   The rest of the arithmetic a synth panel does (design doc §32).

   ce.math was still only the scalar half. Everything below had to be hand-rolled per panel in
   five languages, and the hand-rolled version is where the runtimes drift. The values are pinned
   against the C++ preludes, which were executed side by side to produce them.
   ========================================================================================== */

test('the new members are declared, bound and namespaced', () => {
  for (const [id, path] of [
    ['norm', 'ce.math.norm'], ['denorm', 'ce.math.denorm'],
    ['bipolar', 'ce.math.bipolar'], ['unipolar', 'ce.math.unipolar'],
    ['fold', 'ce.math.fold'], ['indexOfRange', 'ce.math.index'],
    ['crossfade', 'ce.math.crossfade'], ['approach', 'ce.math.approach'],
    ['roundTo', 'ce.math.roundTo'], ['almost', 'ce.math.almost'],
    ['minOf', 'ce.math.min'], ['maxOf', 'ce.math.max'],
    ['sumOf', 'ce.math.sum'], ['meanOf', 'ce.math.mean'], ['blend', 'ce.math.blend'],
    ['randomFloat', 'ce.math.randomFloat'], ['randomGaussian', 'ce.math.gaussian'],
    ['randomWalk', 'ce.math.walk'], ['randomBool', 'ce.math.chance'], ['shuffle', 'ce.math.shuffle'],
    ['toDegrees', 'ce.math.degrees'], ['toRadians', 'ce.math.radians'],
    ['distance', 'ce.math.distance'], ['angleOf', 'ce.math.angle'], ['polar', 'ce.math.polar'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    assert.equal(typeof api[id], 'function', `${id} is not bound`);
  }
  // Flat spellings keep a qualifier wherever a bare global is a name a panel author reaches for
  // first — `index`, `min`, `max`, `sum`, `mean`, `degrees` — and drop it where none would.
  assert.equal(api.ce.math.index, api.indexOfRange);
  assert.equal(api.ce.math.min, api.minOf);
  assert.equal(api.ce.math.fold, api.fold);
});

/* ------------------------------------------------------------------ range and normalisation */

test('norm and denorm CLAMP, which is the whole reason they exist beside scale', () => {
  assert.equal(api.norm(50, 0, 100), 0.5);
  // scale() does not clamp, so this is what a panel was getting instead — past the end and
  // still wrong all the way down the chain.
  assert.equal(api.scale(150, 0, 100, 0, 1), 1.5);
  assert.equal(api.norm(150, 0, 100), 1);
  assert.equal(api.norm(-50, 0, 100), 0);
  assert.equal(api.denorm(0.25, 0, 200), 50);
  assert.equal(api.denorm(2, 0, 200), 200, 'clamped at the top too');
  for (const v of [0, 33, 100]) assert.ok(Math.abs(api.denorm(api.norm(v, 0, 100), 0, 100) - v) < 1e-9);
  // A zero-width range has one answer rather than a division by zero.
  assert.equal(api.norm(5, 3, 3), 0);
});

test('bipolar and unipolar are the two shapes a modulation source is in', () => {
  assert.equal(api.bipolar(0), -1);
  assert.equal(api.bipolar(0.5), 0);
  assert.equal(api.bipolar(1), 1);
  assert.equal(api.unipolar(-1), 0);
  assert.equal(api.unipolar(0), 0.5);
  for (const t of [0, 0.25, 1]) assert.ok(Math.abs(api.unipolar(api.bipolar(t)) - t) < 1e-9);
});

test('fold reflects where wrap jumps', () => {
  // wrap is right for a pitch class; fold is right for a depth, because the movement stays
  // continuous instead of snapping from the top to the bottom.
  assert.equal(api.wrap(13, 0, 12), 1);
  assert.equal(api.fold(13, 0, 12), 11);
  assert.equal(api.fold(-1, 0, 12), 1);
  assert.equal(api.fold(25, 0, 12), 1, 'and keeps reflecting past the second bounce');
  assert.equal(api.fold(6, 0, 12), 6, 'inside the range it is the identity');
  assert.equal(api.fold(5, 3, 3), 3, 'an empty range has one answer, not NaN');
});

test('index never returns one past the end, which is the bug it exists to stop', () => {
  assert.equal(api.indexOfRange(0, 8), 0);
  assert.equal(api.indexOfRange(0.99, 8), 7);
  // The hand-rolled floor(t * count) returns 8 here — one past the end of an eight-item list,
  // and only when the knob is turned fully up.
  assert.equal(Math.floor(1 * 8), 8);
  assert.equal(api.indexOfRange(1, 8), 7);
  assert.equal(api.indexOfRange(0.5, 4), 2);
  assert.equal(api.indexOfRange(0.5, 0), 0, 'an empty range addresses nothing');
});

/* -------------------------------------------------------------------------------- shaping */

test('crossfade offers the laws the Crossfader component has', () => {
  assert.equal(api.crossfade(0, 1, 0.5, 'linear'), 0.5);
  // equalPower is the one that matters: a linear fade between two sounds dips in the middle.
  assert.ok(Math.abs(api.crossfade(0, 1, 0.5, 'equalPower') - Math.SQRT1_2) < 1e-9);
  assert.equal(api.crossfade(0, 1, 0.5, 'sharp'), 0.5);
  // Every law still lands exactly on the ends.
  for (const law of ['linear', 'equalPower', 'sharp']) {
    assert.ok(Math.abs(api.crossfade(10, 20, 0, law) - 10) < 1e-9, law);
    assert.ok(Math.abs(api.crossfade(10, 20, 1, law) - 20) < 1e-9, law);
  }
  assert.equal(api.crossfade(0, 1, 2, 'linear'), 1, 't is clamped');
});

test('approach is a rate limit with no state of its own', () => {
  assert.equal(api.approach(0, 10, 3), 3);
  assert.equal(api.approach(10, 0, 3), 7);
  // Never overshoots: within one step it arrives exactly.
  assert.equal(api.approach(0, 1, 3), 1);
  assert.equal(api.approach(5, 5, 3), 5);
  // Repeated application converges rather than oscillating around the target.
  let v = 0;
  for (let i = 0; i < 20; i += 1) v = api.approach(v, 10, 3);
  assert.equal(v, 10);
});

/* ------------------------------------------------------------------ rounding and comparison */

test('roundTo gives a number, not a string', () => {
  assert.equal(api.roundTo(1.23456, 2), 1.23);
  assert.equal(api.roundTo(1.23456, 0), 1);
  assert.equal(api.roundTo(-1.236, 2), -1.24);
  assert.equal(api.roundTo(2.5, 0), 3, 'half rounds up, matching round()');
  // Deliberately NOT asserted: an exact .5 tie after scaling. -1.235 * 100 is -123.50000000000001
  // in binary floating point, so it rounds away from zero — in every one of the five runtimes,
  // identically, because they all scale and round the same way. Pinning it would be pinning IEEE
  // 754, not this function.
  assert.equal(api.roundTo(1.005, 2), api.roundTo(1.005, 2));
  // toFixed returns a string, which is why every panel wrote this itself.
  assert.equal(typeof (1.23456).toFixed(2), 'string');
  assert.equal(typeof api.roundTo(1.23456, 2), 'number');
});

test('almost is what == is assumed to mean', () => {
  assert.equal(0.1 + 0.2 === 0.3, false, 'the language still does the wrong thing');
  assert.equal(api.almost(0.1 + 0.2, 0.3), true);
  assert.equal(api.almost(1, 1.5), false);
  assert.equal(api.almost(1, 1.4, 0.5), true, 'the tolerance is honoured');
});

/* ---------------------------------------------------------------------------------- lists */

test('the list reductions answer over a table, which the language cannot', () => {
  assert.equal(api.minOf([3, 1, 2]), 1);
  assert.equal(api.maxOf([3, 1, 2]), 3);
  assert.equal(api.sumOf([1, 2, 3]), 6);
  assert.equal(api.meanOf([1, 2, 3]), 2);
  // A sum of nothing is nothing; an average of nothing does not exist. The two empties differ.
  assert.equal(api.sumOf([]), 0);
  assert.equal(api.meanOf([]), undefined);
  assert.equal(api.minOf([]), undefined);
  assert.equal(api.maxOf([]), undefined);
  // Non-numbers are skipped rather than poisoning the result with NaN.
  assert.equal(api.sumOf([1, 'x', 2]), 3);
});

test('blend morphs two value sets, and the shorter one decides the length', () => {
  assert.deepEqual(api.blend([0, 10], [10, 20], 0.5), [5, 15]);
  assert.deepEqual(api.blend([0, 10], [10, 20], 0), [0, 10]);
  assert.deepEqual(api.blend([0, 10], [10, 20], 1), [10, 20]);
  // Padding with zeros would drag the missing entries to nothing — on a patch, a set of
  // parameters slammed to their minimum.
  assert.deepEqual(api.blend([0, 10], [10, 20, 30], 0.5), [5, 15]);
});

/* ----------------------------------------------------------------------------- randomness */

test('randomFloat is the seeded float that did not exist', () => {
  // random(lo, hi) returns whole numbers — the form a note or a step wants.
  api.randomSeed(4);
  assert.ok(Number.isInteger(api.random(0, 10)));
  api.randomSeed(4);
  const f = api.randomFloat(0, 10);
  assert.ok(f >= 0 && f < 10);
  assert.ok(!Number.isInteger(f * 1000) || f !== Math.floor(f), 'a float, not a rounded one');
  // …and it replays.
  api.randomSeed(4);
  assert.equal(api.randomFloat(0, 10), f);
});

test('gaussian clusters near the mean and always draws exactly twice', () => {
  api.randomSeed(21);
  const values = Array.from({ length: 400 }, () => api.randomGaussian(0, 1));
  const mean = api.meanOf(values);
  assert.ok(Math.abs(mean) < 0.2, `mean drifted: ${mean}`);
  const near = values.filter((v) => Math.abs(v) <= 1).length / values.length;
  // ~68% inside one standard deviation is the whole point — a uniform random would give ~50%.
  assert.ok(near > 0.6 && near < 0.76, `inside 1sd: ${near}`);

  // The draw count is fixed, so what comes AFTER a gaussian is the same as after two plain draws.
  // Caching Box-Muller's second value — the textbook version — would make it alternate.
  api.randomSeed(21); api.randomGaussian(); const afterG = api.random();
  api.randomSeed(21); api.random(); api.random(); const afterTwo = api.random();
  assert.equal(afterG, afterTwo);
});

test('a walk drifts and folds rather than sticking to an end', () => {
  api.randomSeed(2);
  let v = 5;
  for (let i = 0; i < 200; i += 1) {
    v = api.randomWalk(v, 2, 0, 10);
    assert.ok(v >= 0 && v <= 10, `left the range: ${v}`);
  }
  // Unbounded when no range is given.
  api.randomSeed(2);
  assert.equal(typeof api.randomWalk(5, 2), 'number');
  // A walk that CLAMPED would pile up on the ends; folding keeps it moving.
  api.randomSeed(7);
  let atEnd = 0;
  let w = 0;
  for (let i = 0; i < 300; i += 1) { w = api.randomWalk(w, 3, 0, 10); if (w === 0 || w === 10) atEnd += 1; }
  assert.ok(atEnd < 15, `stuck at an end ${atEnd} times`);
});

test('chance is a weighted coin', () => {
  api.randomSeed(5);
  assert.equal(api.randomBool(1), true);
  assert.equal(api.randomBool(0), false);
  api.randomSeed(5);
  const hits = Array.from({ length: 400 }, () => api.randomBool(0.25)).filter(Boolean).length / 400;
  assert.ok(hits > 0.18 && hits < 0.32, `chance drifted: ${hits}`);
});

test('shuffle is seeded, returns a new list, and keeps every element', () => {
  const source = [1, 2, 3, 4, 5];
  api.randomSeed(9);
  const a = api.shuffle(source);
  api.randomSeed(9);
  const b = api.shuffle(source);
  assert.deepEqual(a, b, 'the same seed shuffles the same way');
  assert.deepEqual(source, [1, 2, 3, 4, 5], 'the original is untouched');
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5], 'every element survived');
  // Pinned against the C++ preludes, which were executed side by side to produce this.
  assert.deepEqual(a, [3, 2, 4, 5, 1]);
  assert.deepEqual(api.shuffle([]), []);
});

/* ------------------------------------------------------------------------------ geometry */

test('degrees and radians convert both ways', () => {
  assert.ok(Math.abs(api.toDegrees(Math.PI) - 180) < 1e-9);
  assert.ok(Math.abs(api.toRadians(180) - Math.PI) < 1e-9);
  for (const d of [0, 45, 270]) assert.ok(Math.abs(api.toDegrees(api.toRadians(d)) - d) < 1e-9);
});

test('distance is a plain hypotenuse', () => {
  assert.equal(api.distance(0, 0, 3, 4), 5);
  assert.equal(api.distance(1, 1, 1, 1), 0);
});

test('angleOf uses ce.draw\'s convention, which is the point of having it', () => {
  // DEGREES, 0 at twelve o'clock, increasing clockwise — the same convention drawArc documents.
  // Rebuilding this from atan2 is where a knob pointer ends up a quadrant out.
  assert.equal(api.angleOf(0, 0, 0, -1), 0, 'up is 0');
  assert.equal(api.angleOf(0, 0, 1, 0), 90, 'right is 90');
  assert.equal(api.angleOf(0, 0, 0, 1), 180, 'down is 180');
  assert.equal(api.angleOf(0, 0, -1, 0), 270, 'left is 270, not -90');
});

test('polar is angleOf inverted, in the same convention', () => {
  const up = api.polar(0, 10);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.y + 10) < 1e-9, 'up is negative y');
  const right = api.polar(90, 10);
  assert.ok(Math.abs(right.x - 10) < 1e-9 && Math.abs(right.y) < 1e-9);
  for (const deg of [0, 45, 90, 200, 359]) {
    const p = api.polar(deg, 7);
    assert.ok(Math.abs(api.angleOf(0, 0, p.x, p.y) - deg) < 1e-9, `round-trip failed at ${deg}`);
    assert.ok(Math.abs(api.distance(0, 0, p.x, p.y) - 7) < 1e-9);
  }
});

/* ==========================================================================================
   The transforms the Properties panel itself applies (design doc §33).

   The panel does not only store constants — it CONFIGURES value transforms: a Macro slot's curve,
   a Router's dead zone and transfer curve, an Envelope segment's curve and tension, a Timbre pad's
   blend power, a slider's tick stops, a Meter's dB scale. A script could reproduce none of them,
   so it could not compute what its own panel was about to display.

   These assert against the app's OWN functions rather than against numbers copied out of them, so
   the test fails if either side drifts — which is the only way "matched exactly" stays true.
   ========================================================================================== */

import { envWarp } from '../src/CE_Application/utils/envelopeLayout.js';
import { shapeInput } from '../src/CE_Application/utils/routerLayout.js';
import { buildSliderTickStops } from '../src/CE_Application/utils/sliderGeometry.js';
import { meterPosition } from '../src/CE_Application/utils/meterLayout.js';

test('the six panel-transform members are declared and namespaced', () => {
  for (const [id, path] of [
    ['shapeCurve', 'ce.math.shape'], ['deadzone', 'ce.math.deadzone'],
    ['weightsFor', 'ce.math.weights'], ['blendBy', 'ce.math.blendBy'],
    ['tickStops', 'ce.math.ticks'], ['dbPosition', 'ce.math.dbPosition'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    assert.equal(typeof api[id], 'function', `${id} is not bound`);
  }
});

test('curve() and shape() are DIFFERENT families, and that is why both exist', () => {
  // This is the defect the whole section came from. The panel spells its s-curve "scurve" and
  // computes exp/log from a tension exponent; curve() spells it "s" and uses v² / √v. So a script
  // reading a curve name straight out of a control and passing it to curve() got either an
  // unknown-shape notice or a different number.
  clearScriptTrace();
  api.curve(0.5, 'scurve');
  assert.match(traced(), /unknown shape/, 'curve() does not know the panel\'s spelling');
  assert.equal(api.shapeCurve(0.5, 'scurve'), 0.5, 'shape() does');

  assert.equal(api.curve(0.25, 'log'), 0.5, 'curve log is sqrt');
  assert.notEqual(api.shapeCurve(0.25, 'log'), api.curve(0.25, 'log'), 'the panel computes it differently');
  // hold exists only in the panel's family.
  assert.equal(api.shapeCurve(0.99, 'hold'), 0);
  assert.equal(api.shapeCurve(1, 'hold'), 1);
});

test('shape() matches the Envelope\'s own warp, for every curve and tension', () => {
  for (const curve of ['linear', 'exp', 'log', 'scurve', 'hold']) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      for (const tension of [0, 1, 3]) {
        assert.ok(Math.abs(api.shapeCurve(t, curve, tension) - envWarp(t, curve, tension)) < 1e-12,
          `shape(${t}, ${curve}, ${tension}) drifted from envWarp`);
      }
    }
  }
  // Including the odd bit: an unset tension is 1.6, not 0, so exp is not v². Matching that is the
  // point — a shape() that disagreed with the envelope it is named after would be worse than none.
  assert.ok(Math.abs(api.shapeCurve(0.5, 'exp') - 0.5 ** 2.6) < 1e-12);
});

test('deadzone matches the Router\'s own input shaping', () => {
  for (const v of [0, 0.1, 0.2, 0.5, 0.9, 1]) {
    for (const dz of [0, 0.2, 0.5]) {
      for (const invert of [false, true]) {
        assert.ok(Math.abs(api.deadzone(v, dz, invert) - shapeInput(v, { invert, deadzone: dz })) < 1e-12,
          `deadzone(${v}, ${dz}, ${invert}) drifted`);
      }
    }
  }
  // The rescale is the part a hand-rolled version leaves out: past the zone the range still fills.
  assert.equal(api.deadzone(0.2, 0.2), 0);
  assert.equal(api.deadzone(1, 0.2), 1);
  assert.ok(Math.abs(api.deadzone(0.6, 0.2) - 0.5) < 1e-12);
});

test('mapCurve honours a per-point curve, so a breakpoint list evaluates like the panel\'s', () => {
  // A Router transfer curve and an Envelope both carry the shape on the point the segment ENDS at.
  const straight = [[0, 0], [1, 1]];
  const eased = [[0, 0], { x: 1, y: 1, curve: 'scurve' }];
  assert.equal(api.mapCurve(0.25, straight), 0.25);
  assert.equal(api.mapCurve(0.25, eased), envWarp(0.25, 'scurve'));
  // A plain pair list is unchanged — straight lines are still the default.
  assert.equal(api.mapCurve(0.75, straight), 0.75);
  // And tension rides along.
  const tense = [[0, 0], { x: 1, y: 1, curve: 'exp', tension: 3 }];
  assert.ok(Math.abs(api.mapCurve(0.5, tense) - envWarp(0.5, 'exp', 3)) < 1e-12);
});

test('tickStops matches the slider\'s own generator', () => {
  for (const [major, minor] of [[2, 0], [5, 0], [5, 3], [11, 1]]) {
    const mine = api.tickStops(major, minor);
    const app = buildSliderTickStops({ majorTickCount: major, minorTickCount: minor });
    assert.equal(mine.major.length, app.major.length, `major count for ${major}/${minor}`);
    assert.equal(mine.minor.length, app.minor.length, `minor count for ${major}/${minor}`);
    app.major.forEach((m, i) => assert.ok(Math.abs(mine.major[i] - m.normalized) < 1e-12));
    app.minor.forEach((m, i) => assert.ok(Math.abs(mine.minor[i] - m.normalized) < 1e-12));
  }
});

test('dbPosition matches the Meter\'s own scale', () => {
  for (const f of [0, 0.001, 0.1, 0.25, 0.5, 1]) {
    const app = meterPosition(f, { scale: 'db', valueMin: 0, valueMax: 1 });
    assert.ok(Math.abs(api.dbPosition(f) - app) < 1e-12, `dbPosition(${f}) drifted`);
  }
  // A different question from gainToDb: that one says how many dB, this says how far up the meter.
  assert.equal(api.gainToDb(0), -144);
  assert.equal(api.dbPosition(0), 0);
  // NOT 1: the Meter's ceiling is +6 dB, so full scale (0 dB) sits at 60/66 with headroom above
  // it. Getting that wrong by hand is a meter that reads pinned when it is not.
  assert.ok(Math.abs(api.dbPosition(1) - 60 / 66) < 1e-12);
  assert.equal(api.dbPosition(1, -60, 0), 1, 'with no headroom, 0 dB IS the top');
});

test('weights and blendBy reproduce a morph pad', () => {
  const anchors = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }];
  const w = api.weightsFor(anchors, 0, 0, 2);
  assert.equal(w.length, 3);
  assert.ok(Math.abs(api.sumOf(w) - 1) < 1e-9, 'weights are normalised');
  assert.ok(w[0] > 0.99, 'sitting on an anchor gives it almost all the weight');

  // Dead centre between two of them is an even split between those two.
  const mid = api.weightsFor([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], 0.5, 0.5, 2);
  assert.ok(Math.abs(mid[0] - mid[1]) < 1e-9);

  // Higher power = the nearest anchor dominates sooner, which is what "blend sharpness" means.
  const soft = api.weightsFor(anchors, 0.2, 0.2, 1);
  const sharp = api.weightsFor(anchors, 0.2, 0.2, 6);
  assert.ok(sharp[0] > soft[0]);

  assert.ok(Math.abs(api.blendBy([0, 100], [0.25, 0.75]) - 75) < 1e-9);
  assert.equal(api.blendBy([], []), 0);
});

/* ==========================================================================================
   Taming what arrives on the wire (design doc §34).

   A controller does not send tidy numbers: it jitters, crosses a threshold repeatedly, spikes
   once, and has already been through a taper. None of these four composes out of what was here.
   ========================================================================================== */

test('the four wire-taming members are declared and bound', () => {
  for (const id of ['smooth', 'hysteresis', 'median', 'unshape']) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    // All four stay bare flat: unlike min/max/sum/mean, none is a name a panel author would give
    // their own helper, so a qualifier would only be noise.
    assert.equal(memberPath(id), `ce.math.${id}`);
    assert.equal(typeof api[id], 'function');
  }
});

test('smooth settles fast then creeps, and ARRIVES', () => {
  // A proportion of what is left, not a fixed step — the difference from approach().
  assert.equal(api.smooth(0, 10, 0.5), 5);
  assert.equal(api.smooth(5, 10, 0.5), 7.5);
  assert.equal(api.approach(0, 10, 0.5), 0.5, 'approach moves a fixed step instead');

  // The reason it is a member rather than a lerp: a one-pole is asymptotic, so without the snap a
  // control smoothed with it transmits forever. 200 steps must land exactly.
  let v = 0;
  for (let i = 0; i < 200; i += 1) v = api.smooth(v, 10, 0.3);
  assert.equal(v, 10);

  // The coefficient is clamped, so a caller's stray 1.5 cannot overshoot.
  assert.equal(api.smooth(0, 10, 1.5), 10);
  assert.equal(api.smooth(0, 10, -1), 0);
  // A wider epsilon arrives sooner.
  assert.equal(api.smooth(9.9, 10, 0.5, 0.5), 10);
});

test('hysteresis holds between the thresholds, which is what stops the chatter', () => {
  // Off below `high`, on at `high`, and it does not drop out until below `low`.
  assert.equal(api.hysteresis(0.5, false, 0.4, 0.6), false);
  assert.equal(api.hysteresis(0.6, false, 0.4, 0.6), true);
  assert.equal(api.hysteresis(0.5, true, 0.4, 0.6), true, 'it HOLDS in the middle');
  assert.equal(api.hysteresis(0.4, true, 0.4, 0.6), false);
  // Thresholds the other way round mean the same thing rather than being an error.
  assert.equal(api.hysteresis(0.6, false, 0.6, 0.4), true);

  // The point, measured: a value dithering on a single threshold flips constantly, and with two it
  // does not. On a bound control every one of those flips is a MIDI message.
  const dither = Array.from({ length: 40 }, (_, i) => 0.5 + (i % 2 ? 0.01 : -0.01));
  let plainFlips = 0;
  let plain = false;
  for (const v of dither) { const next = v >= 0.5; if (next !== plain) plainFlips += 1; plain = next; }
  let hystFlips = 0;
  let on = false;
  for (const v of dither) { const next = api.hysteresis(v, on, 0.4, 0.6); if (next !== on) hystFlips += 1; on = next; }
  assert.ok(plainFlips > 30, `a plain threshold flipped ${plainFlips} times`);
  assert.equal(hystFlips, 0);
});

test('median rejects a spike where mean smears it', () => {
  assert.equal(api.median([1, 2, 3]), 2);
  assert.equal(api.median([3, 1, 2]), 2, 'order does not matter');
  assert.equal(api.median([1, 2, 3, 4]), 2.5, 'even counts average the middle pair');
  assert.equal(api.median([]), undefined, 'like mean, an empty list has none');
  assert.equal(api.median([5]), 5);

  // One bad reading in a steady stream: the median ignores it, the mean does not.
  const spiked = [50, 50, 127, 50, 50];
  assert.equal(api.median(spiked), 50);
  assert.ok(api.meanOf(spiked) > 65, `the mean was dragged to ${api.meanOf(spiked)}`);
  // The original is not reordered underneath the caller.
  assert.deepEqual(spiked, [50, 50, 127, 50, 50]);
});

test('unshape inverts shape, which is what a taper needs on the way back', () => {
  for (const curve of ['linear', 'exp', 'log', 'scurve', 's']) {
    for (const tension of [0, 1, 3]) {
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const there = api.shapeCurve(t, curve, tension);
        const back = api.unshape(there, curve, tension);
        assert.ok(Math.abs(back - t) < 1e-9, `${curve}/${tension} round-trip failed at ${t}: got ${back}`);
      }
    }
  }
});

test('unshape says the honest thing about hold, which has no true inverse', () => {
  // A step maps many inputs to one output, so this returns the EARLIEST input that produces it —
  // the only answer that is a function.
  assert.equal(api.unshape(0, 'hold'), 0);
  assert.equal(api.unshape(0.5, 'hold'), 0);
  assert.equal(api.unshape(1, 'hold'), 1);
  assert.equal(api.shapeCurve(api.unshape(1, 'hold'), 'hold'), 1);
});

test('shape() reproduces the Macro family too, at tension 1', () => {
  // The doc gap this closes: all three curve families in the app are reachable, but nothing said
  // that a Macro slot's curve is shape(v, curve, 1). What is pinned is that FACT — the summary
  // must still say Macro and still show the call — not the wording, which was in capitals and has
  // since been rewritten to read like the rest of the manual.
  assert.match(MEMBER_BY_ID.shapeCurve.summary, /Macro/i);
  assert.match(MEMBER_BY_ID.shapeCurve.summary, /shape\(v, curve, 1\)/);
});

/* ==========================================================================================
   One generator per (script, stream) (design doc §35).

   A single runtime-wide state was wrong in two directions. ACROSS scripts it was a cross-runtime
   divergence — the C++ JavaScript and Python engines give each script its own engine or namespace,
   so they were already per script, while Lua's prelude runs once into shared globals and the web
   runtime kept one module variable. A panel with two generative scripts therefore behaved
   differently in the editor than in the export, and differently again by language. WITHIN a script
   it was coupling: shuffle() advanced the state gaussian() read.
   ========================================================================================== */

test('two scripts no longer share a generator', () => {
  const a = scriptApiForTesting('', 'scriptA');
  const b = scriptApiForTesting('', 'scriptB');

  a.randomSeed(42);
  const first = a.random();
  a.randomSeed(42);
  b.random();                       // a DIFFERENT script draws in between
  assert.equal(a.random(), first, 'another script drawing must not move this one along');

  // …and reseeding one must not reseed the other.
  a.randomSeed(7);
  b.randomSeed(999);
  const aNext = a.random();
  a.randomSeed(7);
  assert.equal(a.random(), aNext);
});

test('the same seed still means the same sequence within a script', () => {
  const a = scriptApiForTesting('', 'seedCheck');
  a.randomSeed(3);
  const run1 = [a.random(), a.random(), a.random()];
  a.randomSeed(3);
  assert.deepEqual([a.random(), a.random(), a.random()], run1);
});

test('a stream is independent of the script default, and of other streams', () => {
  const s = scriptApiForTesting('', 'streams');
  s.randomSeed(5);
  const plain = [s.random(), s.random()];

  s.randomSeed(5);
  const first = s.random();
  // The coupling this closes: drawing inside a stream must not move the default along.
  s.randomStream('lfo', () => { s.random(); s.shuffle([1, 2, 3, 4]); s.randomGaussian(); });
  assert.equal(s.random(), plain[1], 'the default sequence carried on untouched');
  assert.equal(first, plain[0]);

  // Two streams do not share either.
  let inA;
  let inB;
  s.randomStream('a', () => { s.randomSeed(9); inA = s.random(); });
  s.randomStream('b', () => { s.randomSeed(9); s.random(); });
  s.randomStream('a', () => { inB = s.random(); });
  s.randomStream('a', () => { s.randomSeed(9); assert.equal(s.random(), inA, 'stream a replays its own seed'); });
  assert.ok(inB !== undefined);
});

test('a stream is per script too, so the same name in two scripts is two generators', () => {
  const a = scriptApiForTesting('', 'one');
  const b = scriptApiForTesting('', 'two');
  a.randomStream('shared', () => a.randomSeed(11));
  let fromA;
  let fromB;
  a.randomStream('shared', () => { fromA = a.random(); });
  b.randomStream('shared', () => { b.randomSeed(11); fromB = b.random(); });
  // Same name, same seed, but they are still separate generators — so B drawing cannot disturb A.
  assert.equal(fromA, fromB, 'the same seed in the same-named stream still replays the same');
  a.randomStream('shared', () => { a.randomSeed(11); });
  b.randomStream('shared', () => { b.random(); b.random(); });
  a.randomStream('shared', () => { assert.equal(a.random(), fromA, 'B running ahead did not move A'); });
});

test('the stream is restored even when the block throws', () => {
  const s = scriptApiForTesting('', 'thrower');
  s.randomSeed(4);
  const expected = s.random();
  s.randomSeed(4);
  assert.throws(() => s.randomStream('boom', () => { throw new Error('nope'); }));
  // A throw inside must not leave every later draw in the session pointed at the wrong stream.
  assert.equal(s.random(), expected);
});

test('a stream without a block is reported rather than silently doing nothing', () => {
  const s = scriptApiForTesting('', 'nofn');
  clearScriptTrace();
  s.randomStream('x');
  assert.match(traced(), /needs a block to run/);
});

/* ==========================================================================================
   The last two (design doc §36): an algorithm the app had and scripts could not reach, and a
   behaviour that was correct by construction and pinned by nothing.
   ========================================================================================== */

import { euclid as appEuclid } from '../src/CE_Application/utils/arpLayout.js';
import { envValueAt } from '../src/CE_Application/utils/envelopeLayout.js';

test('euclid matches the app\'s own Euclidean rhythm', () => {
  assert.equal(memberPath('euclid'), 'ce.math.euclid');
  // Against the app's function rather than against copied output, so the test fails if either
  // side drifts — the same discipline the panel-transform members follow.
  for (const steps of [1, 4, 8, 12, 16, 32]) {
    for (let pulses = 0; pulses <= steps; pulses += 1) {
      for (const rotation of [0, 1, 3, -2]) {
        assert.deepEqual(api.euclid(steps, pulses, rotation), appEuclid(steps, pulses, rotation),
          `euclid(${steps}, ${pulses}, ${rotation}) drifted`);
      }
    }
  }
});

test('euclid spreads the hits evenly, and rotation only turns the pattern', () => {
  // The classic tresillo: 3 over 8.
  assert.deepEqual(api.euclid(8, 3), [false, false, true, false, false, true, false, true]);
  assert.equal(api.euclid(16, 5).filter(Boolean).length, 5, 'exactly as many hits as asked for');
  assert.deepEqual(api.euclid(8, 0), new Array(8).fill(false));
  assert.deepEqual(api.euclid(8, 8), new Array(8).fill(true));
  // Rotation preserves the hit count and is cyclic.
  const base = api.euclid(8, 3);
  assert.equal(api.euclid(8, 3, 3).filter(Boolean).length, 3);
  assert.deepEqual(api.euclid(8, 3, 8), base, 'a full turn is no turn');
  assert.deepEqual(api.euclid(8, 3, -1), api.euclid(8, 3, 7), 'negative rotation wraps');
  // Out-of-range arguments are clamped rather than producing a broken list.
  assert.equal(api.euclid(0, 5).length, 1);
  assert.equal(api.euclid(200, 5).length, 64);
});

test('map reproduces the Envelope/Router sampler over a real transfer curve', () => {
  // Correct by construction since map gained per-point curves, and pinned by nothing until now.
  // These are the Router's own default breakpoints, straight out of the section defaults.
  const pts = [
    { x: 0, y: 0, curve: 'linear' },
    { x: 0.5, y: 0.4, curve: 'scurve' },
    { x: 1, y: 1, curve: 'linear' },
  ];
  for (let i = 0; i <= 40; i += 1) {
    const x = i / 40;
    assert.ok(Math.abs(api.mapCurve(x, pts) - envValueAt(pts, x)) < 1e-12,
      `map drifted from envValueAt at ${x}`);
  }
  // And an envelope with tension on a segment.
  const env = [
    { x: 0, y: 0, curve: 'linear', tension: 0 },
    { x: 0.25, y: 1, curve: 'exp', tension: 2 },
    { x: 1, y: 0, curve: 'log', tension: 1 },
  ];
  for (let i = 0; i <= 40; i += 1) {
    const x = i / 40;
    assert.ok(Math.abs(api.mapCurve(x, env) - envValueAt(env, x)) < 1e-12,
      `map drifted from envValueAt at ${x} with tension`);
  }
});

/* ============================================================= §41: colour arithmetic */
// In ce.math rather than ce.draw because it is PURE and cross-runtime: a script setting a control's
// colour from a value works with the panel shut, and the exported plugin does it.
//
// Worth writing down how this got missed. §36 swept utils/*Layout.js and concluded ce.math was
// complete. colorMath.js and colorHelpers.js do not match that glob — the sweep had a blind spot
// exactly the shape of its own search pattern, which is the failure mode of any sweep.

import {
  lighten as panelLighten, darken as panelDarken,
} from '../src/CE_Application/utils/colorHelpers.js';
import {
  hexToRgb as panelHexToRgb, rgbToHex as panelRgbToHex, rgbToHsl as panelRgbToHsl,
  hslToHex as panelHslToHex,
} from '../src/CE_Application/utils/colorMath.js';

/** Hex is case-insensitive everywhere it is read; the API normalises to upper and the app's two
 *  colour modules disagree with each other about case. Compare the COLOUR, not the spelling. */
const sameColour = (a, b) => String(a).replace('#', '').toUpperCase() === String(b).replace('#', '').toUpperCase();

test('lighten and darken ARE the border renderer\'s, over the whole cube', () => {
  for (let r = 0; r < 256; r += 37) {
    for (let g = 0; g < 256; g += 41) {
      for (let b = 0; b < 256; b += 43) {
        const hex = panelRgbToHex(r, g, b);
        for (const f of [0, 0.25, 0.4, 0.55, 1]) {
          assert.ok(sameColour(api.lighten(hex, f), panelLighten(hex, f)), `lighten ${hex} ${f}`);
          assert.ok(sameColour(api.darken(hex, f), panelDarken(hex, f)), `darken ${hex} ${f}`);
        }
        // The defaults matter as much as the maths: 0.4 and 0.55 ARE the groove highlight and
        // shading, so a script-drawn bevel matches the one the panel draws beside it.
        assert.ok(sameColour(api.lighten(hex), panelLighten(hex)), `lighten default ${hex}`);
        assert.ok(sameColour(api.darken(hex), panelDarken(hex)), `darken default ${hex}`);
      }
    }
  }
});

test('the conversions are the colour editor\'s, in both directions', () => {
  for (let r = 0; r < 256; r += 29) {
    for (let g = 0; g < 256; g += 31) {
      for (let b = 0; b < 256; b += 37) {
        const hex = panelRgbToHex(r, g, b);
        assert.deepEqual(api.hexToRgb(hex), { r, g, b }, `rgb ${hex}`);
        assert.ok(sameColour(api.rgbToHex(r, g, b), panelRgbToHex(r, g, b)), `hex ${r},${g},${b}`);
        const mine = api.hexToHsl(hex);
        const theirs = panelRgbToHsl(...panelHexToRgb(hex));
        assert.ok(Math.abs(mine.h - theirs[0]) < 1e-9, `hue ${hex}`);
        assert.ok(Math.abs(mine.s - theirs[1]) < 1e-9, `sat ${hex}`);
        assert.ok(Math.abs(mine.l - theirs[2]) < 1e-9, `light ${hex}`);
        assert.ok(sameColour(api.hslToHex(mine.h, mine.s, mine.l), panelHslToHex(...theirs)),
          `round trip ${hex}`);
      }
    }
  }
});

test('every input form the app accepts, because a stored colour is AARRGGBB', () => {
  // "66FFFFFF" is a 40%-opaque white in every panel document. The parser reads the last six
  // characters, so a stored colour goes straight in without being unpacked first.
  assert.equal(api.lighten('336699'), api.lighten('#336699'));
  assert.equal(api.lighten('66336699'), api.lighten('336699'));
  assert.deepEqual(api.hexToRgb('FF336699'), { r: 51, g: 102, b: 153 });
});

test('a colour it cannot read is NOTHING, which is what tells a typo from black', () => {
  for (const bad of ['nope', '', '#12345', 'GGHHII', null, undefined]) {
    assert.equal(api.lighten(bad), undefined, `lighten ${bad}`);
    assert.equal(api.darken(bad), undefined);
    assert.equal(api.hexToRgb(bad), undefined);
    assert.equal(api.hexToHsl(bad), undefined);
    assert.equal(api.colourAlpha(bad, 0.5), undefined);
  }
  assert.equal(api.mixColour('000000', 'nope', 0.5), undefined, 'and a mix needs both ends');
});

test('mix is lerp per channel — not an app algorithm, and not pretending to be', () => {
  assert.equal(api.mixColour('000000', 'FFFFFF', 0), '#000000');
  assert.equal(api.mixColour('000000', 'FFFFFF', 1), '#FFFFFF');
  assert.equal(api.mixColour('000000', 'FFFFFF', 0.5), '#808080');
  // The same thing lerp() does, one channel at a time, which is what makes it predictable.
  const t = 0.25;
  assert.equal(api.mixColour('000000', 'FF0000', t),
    api.rgbToHex(api.lerp(0, 255, t), 0, 0));
  assert.equal(api.mixColour('000000', 'FFFFFF', 5), '#FFFFFF', 'and it clamps rather than extrapolating');
});

test('alpha returns the PANEL\'s form, which is the one asymmetry here', () => {
  // AARRGGBB, no leading #, because that is the only form a STORED colour can carry an alpha in.
  // CSS's #RRGGBBAA is the same four bytes the other way round, and mixing them up is silent.
  assert.equal(api.colourAlpha('336699', 0.4), '66336699');
  assert.equal(api.colourAlpha('336699', 0), '00336699');
  assert.equal(api.colourAlpha('336699', 1), 'FF336699');
  assert.equal(api.colourAlpha('336699', 5), 'FF336699', 'clamped, not wrapped');
  // …and it round-trips back through the same parser, which is what makes the pair usable.
  assert.deepEqual(api.hexToRgb(api.colourAlpha('336699', 0.4)), { r: 51, g: 102, b: 153 });
});

test('rgbToHex clamps out-of-range channels rather than wrapping them', () => {
  assert.equal(api.rgbToHex(300, -5, 128), '#FF0080', '300 is white, not 44');
});

test('the colour verbs are cross-runtime, because setting a colour works with the window shut', () => {
  for (const [id, path] of [
    ['lighten', 'ce.math.lighten'], ['darken', 'ce.math.darken'], ['mixColour', 'ce.math.mix'],
    ['colourAlpha', 'ce.math.alpha'], ['hexToRgb', 'ce.math.rgb'], ['rgbToHex', 'ce.math.hex'],
    ['hexToHsl', 'ce.math.hsl'], ['hslToHex', 'ce.math.fromHsl'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});
