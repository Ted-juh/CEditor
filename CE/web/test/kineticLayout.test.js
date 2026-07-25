import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kineticParams, kineticInitial, stepKinetic, kineticKick, kineticSpeed,
  kineticGeometry, kineticToPx, kineticFromPx, kineticPorts, kineticPortValues,
  KINETIC_MAX_SPEED,
  kineticSynced,
} from '../src/CE_Application/utils/kineticLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function kn(kinetic) { return { _children: { Core: { controlType: 'Kinetic' }, Kinetic: kinetic } }; }

test('params + initial clamp', () => {
  const p = kineticParams(kn({ gravity: 9, restitution: 2, friction: -1 }));
  assert.ok(near(p.gravity, 4) && near(p.restitution, 1) && near(p.friction, 0));
  const s = kineticInitial(kn({ initial: { x: 2, y: -1, vx: 0.5 } }));
  assert.ok(near(s.x, 1) && near(s.y, 0) && near(s.vx, 0.5));
  // live __state overrides initial
  assert.ok(near(kineticInitial(kn({ initial: { x: 0.1 }, __state: { x: 0.9 } })).x, 0.9));
});

test('free drift integrates position (no gravity/drag)', () => {
  // dt is clamped to 0.05 (big-frame protection): x += 1 * 0.05 = 0.55.
  const s = stepKinetic({ x: 0.5, y: 0.5, vx: 1, vy: 0 }, 0.05, { gravity: 0, restitution: 1, friction: 0 });
  assert.ok(near(s.x, 0.55) && near(s.y, 0.5));
  assert.equal(s.bounced, false);
});

test('wall bounce reflects velocity with restitution', () => {
  // moving right past x=1 → reflects, vx becomes negative * restitution
  const s = stepKinetic({ x: 0.98, y: 0.5, vx: 1, vy: 0 }, 0.05, { gravity: 0, restitution: 0.5, friction: 0 });
  assert.equal(s.bounced, true);
  assert.ok(s.vx < 0);
  assert.ok(near(Math.abs(s.vx), 0.5));           // |vx| halved by restitution
  assert.ok(s.x <= 1 && s.x >= 0);
  // floor bounce (y=0)
  const f = stepKinetic({ x: 0.5, y: 0.02, vx: 0, vy: -1 }, 0.05, { gravity: 0, restitution: 1, friction: 0 });
  assert.equal(f.bounced, true);
  assert.ok(f.vy > 0);                            // now moving up
});

test('gravity pulls the ball down', () => {
  const s = stepKinetic({ x: 0.5, y: 0.5, vx: 0, vy: 0 }, 0.1, { gravity: 2, restitution: 1, friction: 0 });
  assert.ok(s.vy < 0 && s.y < 0.5);              // accelerated downward
});

test('speed clamps to max', () => {
  const s = stepKinetic({ x: 0.5, y: 0.5, vx: 100, vy: 0 }, 0.001, { gravity: 0, restitution: 1, friction: 0, maxSpeed: 2 });
  assert.ok(Math.hypot(s.vx, s.vy) <= 2 + 1e-6);
});

test('kick adds velocity; speed normalizes', () => {
  const k = kineticKick({ vx: 0, vy: 0 }, 1, 0, 1);   // angle 0 → +x, mag 1*(0.5+1)=1.5
  assert.ok(k.vx > 0);
  assert.ok(near(kineticSpeed({ vx: KINETIC_MAX_SPEED, vy: 0 }), 1));
  assert.ok(near(kineticSpeed({ vx: 0, vy: 0 }), 0));
});

test('geometry round-trips px (y flipped)', () => {
  const g = kineticGeometry(120, 120, 8);
  const q = kineticToPx({ x: 0, y: 1 }, g);        // top-left
  assert.ok(near(q.px, 8) && near(q.py, 8));
  const back = kineticFromPx(q.px, q.py, g);
  assert.ok(near(back.x, 0) && near(back.y, 1));
});

test('static ports + fan-out values from injected state', () => {
  const ports = kineticPorts();
  assert.deepEqual(ports.map((p) => p.id), ['x', 'y', 'speed', 'bounce']);
  const c = kn({ __state: { x: 0.3, y: 0.8, vx: KINETIC_MAX_SPEED, vy: 0 }, __bounce: true, maxSpeed: KINETIC_MAX_SPEED });
  const v = kineticPortValues(c);
  assert.ok(near(v.x, 0.3) && near(v.y, 0.8));
  assert.ok(near(v.speed, 1));
  assert.equal(v.bounce, 1);
});

test('sync is opt-in and does not change the physics itself', () => {
  const kc = (c) => ({ _children: { Core: { controlType: 'Kinetic' }, Kinetic: c } });
  assert.equal(kineticSynced(kc({})), false);
  assert.equal(kineticSynced(kc({ syncToTransport: true })), true);
  // The integrator is untouched by the flag — sync only changes what dt the
  // preview surface hands it, which is the honest scope of the feature.
  const params = kineticParams(kc({ syncToTransport: true, gravity: 1 }));
  const plain = kineticParams(kc({ gravity: 1 }));
  assert.deepEqual(params, plain);
});
