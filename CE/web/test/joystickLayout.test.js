import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joystickGeometry, joyToPx, joyFromPx, joystickWeights, joystickAxis,
  joystickPortValues,
} from '../src/CE_Application/utils/joystickLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

import {
  normalizeReturnBehavior, restValueFor, returnStep, returnStep2DAxes,
} from '../src/CE_Application/utils/returnToRest.js';

test('px round-trip (y flipped: y=1 is the top)', () => {
  const g = joystickGeometry(120, 100, 10); // inner 100x80 at (10,10)
  const top = joyToPx({ x: 0, y: 1 }, g);
  assert.ok(near(top.px, 10) && near(top.py, 10));
  const bottom = joyToPx({ x: 1, y: 0 }, g);
  assert.ok(near(bottom.px, 110) && near(bottom.py, 90));
  const back = joyFromPx(60, 50, g);
  assert.ok(near(back.x, 0.5) && near(back.y, 0.5));
});

test('bilinear corner weights sum to 1 and favour the near corner', () => {
  const c = joystickWeights(0.5, 0.5);
  assert.ok(near(c.tl + c.tr + c.bl + c.br, 1));
  assert.ok(near(c.tl, 0.25) && near(c.tr, 0.25) && near(c.bl, 0.25) && near(c.br, 0.25));
  // Fully bottom-left → all weight on bl.
  const bl = joystickWeights(0, 0);
  assert.ok(near(bl.bl, 1) && near(bl.tr, 0));
  // Top-right corner.
  const tr = joystickWeights(1, 1);
  assert.ok(near(tr.tr, 1));
});

test('axis mapping: bipolar vs unipolar', () => {
  assert.ok(near(joystickAxis(0.5, true), 0));    // center → 0 bipolar
  assert.ok(near(joystickAxis(1, true), 1));
  assert.ok(near(joystickAxis(0, true), -1));
  assert.ok(near(joystickAxis(0.5, false), 0.5)); // unipolar passthrough
});

test('portValues exposes both axes + four corners', () => {
  const ctrl = { _children: { Joystick: { x: 0.75, y: 0.25, bipolar: true } } };
  const v = joystickPortValues(ctrl);
  assert.deepEqual(Object.keys(v).sort(), ['cornerBL', 'cornerBR', 'cornerTL', 'cornerTR', 'x', 'y']);
  assert.ok(near(v.x, 0.5) && near(v.y, -0.5));   // 0.75→+0.5, 0.25→-0.5 bipolar
  const w = joystickWeights(0.75, 0.25);
  assert.ok(near(v.cornerBR, w.br));
});

// `joystickGlide` is gone — the three private springs are now one. These are the same assertions
// through the shared path, because the point of unifying is that the behaviour survived.
test('the puck springs to centre, lands exactly, and settles', () => {
  // returnToCenter + rate 4 normalises to 250ms linear; a quarter of the way in is a quarter there.
  const spec = normalizeReturnBehavior({ returnToCenter: true, returnRate: 4 });
  assert.equal(spec.returnMode, 'center');
  assert.equal(spec.returnTime, 250);

  const rest = { x: 0.5, y: 0.5 };
  let s = returnStep2DAxes({ x: 0, y: 1 }, rest, 100, spec, 'both');
  assert.ok(near(s.value.x, 0.2) && near(s.value.y, 0.8));
  assert.equal(s.done, false);

  s = returnStep2DAxes({ x: 0.45, y: 0.55 }, rest, 250, spec, 'both');
  assert.ok(near(s.value.x, 0.5) && near(s.value.y, 0.5));
  assert.equal(s.done, true);
});

test('a single-axis return leaves the other axis exactly where it was', () => {
  // Both axes travel on ONE progress, so the puck moves in a straight line; an axis that is not
  // returning holds its value and reports itself done, or the glide would never finish.
  const spec = normalizeReturnBehavior({ returnToCenter: true, returnRate: 4, returnAxes: 'x' });
  const s = returnStep2DAxes({ x: 0.2, y: 0.9 }, { x: 0.5, y: 0.5 }, 250, spec, spec.returnAxes);
  assert.ok(near(s.value.x, 0.5) && near(s.value.y, 0.9));
  assert.equal(s.done, true);
});
