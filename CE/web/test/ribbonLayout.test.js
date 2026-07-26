import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ribbonSnap, ribbonGeometry, ribbonIndicator, ribbonValueFromPx,
  ribbonReturnTarget, ribbonGlide, ribbonPortValues, wheelRidges,
} from '../src/CE_Application/utils/ribbonLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ctrl(ribbon) { return { _children: { Ribbon: ribbon } }; }

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

test('return target by mode', () => {
  assert.equal(ribbonReturnTarget(ctrl({ returnMode: 'none' })), null);   // latch
  assert.equal(ribbonReturnTarget(ctrl({ returnMode: 'center' })), 0.5);  // pitch wheel
  assert.equal(ribbonReturnTarget(ctrl({ returnMode: 'min' })), 0);
  assert.equal(ribbonReturnTarget(ctrl({ returnMode: 'max' })), 1);
  assert.ok(near(ribbonReturnTarget(ctrl({ returnMode: 'rest', returnValue: 0.3 })), 0.3));
});

test('glide steps, clamps, and snaps instantly when rate ≤ 0', () => {
  let s = ribbonGlide(0, 0.5, 8, 0.05); // step 0.4
  assert.ok(near(s.value, 0.4) && s.settled === false);
  s = ribbonGlide(0.45, 0.5, 100, 1);   // overshoot-safe → settle
  assert.ok(near(s.value, 0.5) && s.settled === true);
  s = ribbonGlide(0.1, 0.5, 0, 1);      // rate 0 → instant snap
  assert.ok(near(s.value, 0.5) && s.settled === true);
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
