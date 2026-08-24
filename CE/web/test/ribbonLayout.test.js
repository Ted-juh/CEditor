import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ribbonSnap, ribbonGeometry, ribbonIndicator, ribbonValueFromPx,
  ribbonPortValues, wheelRidges,
} from '../src/CE_Application/utils/ribbonLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ctrl(ribbon) { return { _children: { Ribbon: ribbon } }; }

import {
  normalizeReturnBehavior, restValueFor, returnStep, returnStep2DAxes,
} from '../src/CE_Application/utils/returnToRest.js';

test('snap rounds to the step (0 = continuous)', () => {
  assert.ok(near(ribbonSnap(0.53, ctrl({ snap: 0.25 })), 0.5));
  assert.ok(near(ribbonSnap(0.53, ctrl({ snap: 0 })), 0.53));
  assert.equal(ribbonSnap(2, ctrl({})), 1);   // clamp
});

test('indicator px round-trips (vertical: value 0 at bottom)', () => {
  const g = ribbonGeometry(40, 120, 10); // travel 100px tall at y0=10
  const p = ribbonIndicator(0.25, g, true);
  assert.ok(near(p.py, 10 + 0.75 * 100)); // 85
  assert.ok(near(ribbonValueFromPx(20, 85, g, true), 0.25));
  // Horizontal: value 0 at left.
  const gh = ribbonGeometry(120, 40, 10);
  assert.ok(near(ribbonIndicator(0.25, gh, false).px, 35));
  assert.ok(near(ribbonValueFromPx(35, 20, gh, false), 0.25));
});

// The ribbon's own `ribbonReturnTarget` and `ribbonGlide` are gone: the joystick, crossfader and
// ribbon each had their own spring and now share one. These are the SAME assertions through the
// shared path, kept rather than deleted — the point of unifying is that the behaviour survives, and
// deleting the evidence would be the one way not to know.
const ribbonReturn = (cfg) => normalizeReturnBehavior(cfg, { defaultRate: 8 });

test('return target by mode, through the shared resolver', () => {
  assert.equal(restValueFor(ribbonReturn({ returnMode: 'none' })), null);   // latch
  assert.equal(restValueFor(ribbonReturn({ returnMode: 'center' })), 0.5);  // pitch wheel
  assert.equal(restValueFor(ribbonReturn({ returnMode: 'min' })), 0);
  assert.equal(restValueFor(ribbonReturn({ returnMode: 'max' })), 1);
  assert.ok(near(restValueFor(ribbonReturn({ returnMode: 'rest', returnValue: 0.3 })), 0.3));
});

test('the old rate becomes a time, exactly rather than by feel', () => {
  // The old glide walked at `rate` units per second across 0..1, so it crossed the range in
  // 1000/rate ms. Rate 8 was 125ms. The curve is linear, because the old walk was constant-speed —
  // handing these three the default `exp` spring would change the feel of existing panels silently.
  const spec = ribbonReturn({ returnMode: 'center', returnRate: 8 });
  assert.equal(spec.returnTime, 125);
  assert.equal(spec.returnCurve, 'linear');

  // Half way through that time is half way there, as the constant-speed walk was.
  const half = returnStep(0, 0.5, 62.5, spec);
  assert.ok(near(half.value, 0.25) && half.done === false);
  // ...and it lands exactly, with no overshoot.
  assert.deepEqual(returnStep(0, 0.5, 125, spec), { value: 0.5, done: true });
});

test('rate 0 still snaps instantly', () => {
  const spec = ribbonReturn({ returnMode: 'center', returnRate: 0 });
  assert.equal(spec.returnTime, 0);
  assert.deepEqual(returnStep(0.1, 0.5, 0, spec), { value: 0.5, done: true });
});

test('wheelRidges project + scroll like a rotating cylinder', () => {
  const r = wheelRidges(0.5, 16);
  assert.equal(r.length, 16);
  assert.ok(r.every((x) => x.pos >= 0 && x.pos <= 1 && x.shade >= 0 && x.shade <= 1));
  // Sorted top→bottom; ridges bunch near the ends (smaller gaps than the middle).
  const gaps = r.slice(1).map((x, i) => x.pos - r[i].pos);
  const midGap = gaps[Math.floor(gaps.length / 2)];
  assert.ok(gaps[0] < midGap); // top edge denser than the centre
  // Shading is brightest mid-face, dim at the edges.
  assert.ok(r[0].shade < 0.5 && r[Math.floor(r.length / 2)].shade > 0.7);
  // Rotating (changing value) moves the ridge set.
  const a = wheelRidges(0.2, 16).map((x) => x.pos.toFixed(3)).join();
  const b = wheelRidges(0.35, 16).map((x) => x.pos.toFixed(3)).join();
  assert.notEqual(a, b);
});

test('portValues: value (bipolar) + touch gate', () => {
  assert.deepEqual(Object.keys(ribbonPortValues(ctrl({ value: 0.5 }))).sort(), ['touch', 'value']);
  assert.ok(near(ribbonPortValues(ctrl({ value: 0.5 })).value, 0.5));           // unipolar
  assert.ok(near(ribbonPortValues(ctrl({ value: 0.75, bipolar: true })).value, 0.5)); // bipolar
  assert.equal(ribbonPortValues(ctrl({ value: 0.5 })).touch, 0);
  assert.equal(ribbonPortValues(ctrl({ __value: 0.2, __touch: true, bipolar: true })).touch, 1);
  assert.ok(near(ribbonPortValues(ctrl({ __value: 0.2, __touch: true, bipolar: true })).value, -0.6)); // live value wins
});
