import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crossfaderGains, crossfaderDetent, crossfaderGeometry, crossfaderHandlePos,
  crossfaderMixFromPx, crossfaderPortValues,
} from '../src/CE_Application/utils/crossfaderLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

import {
  normalizeReturnBehavior, restValueFor, returnStep, returnStep2DAxes,
} from '../src/CE_Application/utils/returnToRest.js';

test('gain laws: linear / equal-power / sharp', () => {
  // Ends are always full A / full B.
  assert.ok(near(crossfaderGains(0, 'linear').a, 1) && near(crossfaderGains(0, 'linear').b, 0));
  assert.ok(near(crossfaderGains(1, 'equalPower').b, 1) && near(crossfaderGains(1, 'equalPower').a, 0));
  // Linear centre = 0.5/0.5 (−6 dB).
  const lin = crossfaderGains(0.5, 'linear');
  assert.ok(near(lin.a, 0.5) && near(lin.b, 0.5));
  // Equal-power centre = √0.5 each (−3 dB); constant power a²+b²=1.
  const ep = crossfaderGains(0.5, 'equalPower');
  assert.ok(near(ep.a, Math.SQRT1_2) && near(ep.b, Math.SQRT1_2));
  assert.ok(near(ep.a * ep.a + ep.b * ep.b, 1));
  // Sharp: both full across the middle.
  const sh = crossfaderGains(0.5, 'sharp');
  assert.ok(near(sh.a, 1) && near(sh.b, 1));
  assert.ok(near(crossfaderGains(0.75, 'sharp').a, 0.5));
});

test('centre detent snaps within threshold only', () => {
  assert.equal(crossfaderDetent(0.52, 0.05), 0.5);   // inside → snap
  assert.equal(crossfaderDetent(0.6, 0.05), 0.6);    // outside → keep
  assert.equal(crossfaderDetent(0.52, 0), 0.52);     // detent off
});

test('handle px round-trips (horizontal + vertical)', () => {
  const h = crossfaderGeometry(120, 40, { _children: { Crossfader: { orientation: 'horizontal' } } }, 10);
  const p = crossfaderHandlePos(0.25, h);            // 10 + 0.25*100 = 35
  assert.ok(near(p.px, 35));
  assert.ok(near(crossfaderMixFromPx(35, 20, h), 0.25));
  const v = crossfaderGeometry(40, 120, { _children: { Crossfader: { orientation: 'vertical' } } }, 10);
  const pv = crossfaderHandlePos(0.25, v);           // bottom = A: 10 + (1-0.25)*100 = 85
  assert.ok(near(pv.py, 85));
  assert.ok(near(crossfaderMixFromPx(20, 85, v), 0.25));
});

test('portValues expose gains + mix (bipolar option)', () => {
  const uni = { _children: { Crossfader: { mix: 0.75, law: 'linear' } } };
  const v = crossfaderPortValues(uni);
  assert.deepEqual(Object.keys(v).sort(), ['a', 'b', 'mix']);
  assert.ok(near(v.a, 0.25) && near(v.b, 0.75) && near(v.mix, 0.75));
  const bip = { _children: { Crossfader: { mix: 0.75, bipolar: true } } };
  assert.ok(near(crossfaderPortValues(bip).mix, 0.5)); // 0.75 → +0.5 bipolar
});

// `crossfaderGlide` is gone — the three private springs are now one. Same assertions, shared path.
test('the fader returns to centre, lands exactly, and settles', () => {
  const spec = normalizeReturnBehavior({ returnToCenter: true, returnRate: 4 });
  assert.equal(spec.returnTime, 250, 'rate 4 across 0..1 was 250ms, and still is');

  let s = returnStep(0, 0.5, 100, spec);
  assert.ok(near(s.value, 0.2) && s.done === false);
  s = returnStep(0.45, 0.5, 250, spec);
  assert.ok(near(s.value, 0.5) && s.done === true);
});

test('a crossfader can now return somewhere other than the middle', () => {
  // It gained the whole vocabulary by joining the shared spring: `returnToCenter` was a boolean and
  // `returnMode` is a choice, so springing to an end is expressible where it was not before.
  assert.equal(restValueFor(normalizeReturnBehavior({ returnMode: 'max' })), 1);
  assert.equal(restValueFor(normalizeReturnBehavior({ returnMode: 'none' })), null);
});
