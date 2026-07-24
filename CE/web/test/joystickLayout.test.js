import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joystickGeometry, joyToPx, joyFromPx, joystickWeights, joystickAxis,
  joystickPortValues, joystickGlide,
} from '../src/CE_Application/utils/joystickLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

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

test('glide steps toward center, clamps, and settles', () => {
  // rate 4/s, dt 0.1s → step 0.4 toward the target.
  let s = joystickGlide({ x: 0, y: 1 }, { x: 0.5, y: 0.5 }, 4, 0.1, 'both');
  assert.ok(near(s.pos.x, 0.4) && near(s.pos.y, 0.6));
  assert.equal(s.settled, false);
  // A big step lands exactly on target (no overshoot) + settles.
  s = joystickGlide({ x: 0.45, y: 0.55 }, { x: 0.5, y: 0.5 }, 100, 1, 'both');
  assert.ok(near(s.pos.x, 0.5) && near(s.pos.y, 0.5));
  assert.equal(s.settled, true);
  // Single-axis return leaves the other axis put.
  s = joystickGlide({ x: 0.2, y: 0.9 }, { x: 0.5, y: 0.5 }, 100, 1, 'x');
  assert.ok(near(s.pos.x, 0.5) && near(s.pos.y, 0.9));
  assert.equal(s.settled, true);
});
