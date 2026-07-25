import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orbitNodes, orbitPhase, nodeAngle, nodePos,
  orbitGeometry, nodeToPx, pxToOrbit,
  nodeProjection, nodeOutput,
  orbitNodePortId, parseOrbitNodePort, orbitPorts, orbitPortValues,
  orbitHitNode,
  orbitSynced, orbitCycleBars, orbitRateAt,
} from '../src/CE_Application/utils/orbitLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function orb(orbit) { return { _children: { Core: { controlType: 'Orbit' }, Orbit: orbit } }; }

const NODES = [
  { id: 'a', label: 'LFO A', radius: 1, angle: 0, ratio: 1, output: 'y', depth: 1 },
  { id: 'b', label: 'LFO B', radius: 0.5, angle: 90, ratio: 2, output: 'x', depth: 0.6 },
  { id: 'c', label: 'LFO C', radius: 0.8, angle: 180, ratio: -1, output: 'sine', depth: 1, invert: true },
];

test('nodes normalize with defaults + clamps', () => {
  const ns = orbitNodes(orb({ nodes: [{ label: 'X' }, { radius: 5, depth: -2 }] }));
  assert.equal(ns.length, 2);
  assert.equal(ns[0].label, 'X');
  assert.ok(near(ns[0].radius, 0.6));       // default radius
  assert.equal(ns[0].enabled, true);        // default enabled
  assert.ok(near(ns[1].radius, 1));         // clamped to 1
  assert.ok(near(ns[1].depth, 0));          // clamped to 0
});

test('phase wraps into 0..1 and prefers __phase', () => {
  assert.ok(near(orbitPhase(orb({ phase: 0.25 })), 0.25));
  assert.ok(near(orbitPhase(orb({ phase: 1.25 })), 0.25));   // wrap
  assert.ok(near(orbitPhase(orb({ phase: -0.25 })), 0.75));  // wrap negative
  assert.ok(near(orbitPhase(orb({ phase: 0.1, __phase: 0.4 })), 0.4)); // live overrides
});

test('nodeAngle advances by ratio*phase*360', () => {
  const [a, b, c] = NODES;
  assert.ok(near(nodeAngle(a, 0), 0));
  assert.ok(near(nodeAngle(a, 0.25), 90));     // ratio 1 → quarter turn
  assert.ok(near(nodeAngle(b, 0.25), 90 + 180)); // ratio 2 → half turn added
  assert.ok(near(nodeAngle(c, 0.25), 180 - 90)); // ratio -1 → reverse
});

test('nodePos: math coords, y up', () => {
  const a = NODES[0]; // radius 1, angle 0
  let p = nodePos(a, 0);
  assert.ok(near(p.x, 1) && near(p.y, 0, 1e-9));     // east
  p = nodePos(a, 0.25);                               // 90° → north (y up positive)
  assert.ok(near(p.x, 0, 1e-9) && near(p.y, 1));
});

test('geometry + nodeToPx flips y (SVG down)', () => {
  const g = orbitGeometry(200, 200, 10);
  assert.ok(near(g.cx, 100) && near(g.cy, 100) && near(g.maxR, 90));
  const a = NODES[0]; // east, radius 1
  const q = nodeToPx(a, 0, g);
  assert.ok(near(q.px, 190) && near(q.py, 100));      // east edge
  const q2 = nodeToPx(a, 0.25, g);                    // north → smaller py
  assert.ok(near(q2.px, 100, 1e-6) && near(q2.py, 10));
});

test('pxToOrbit round-trips a placed node', () => {
  const g = orbitGeometry(200, 200, 10);
  const a = NODES[0];
  const q = nodeToPx(a, 0, g);
  const back = pxToOrbit(q.px, q.py, g);
  assert.ok(near(back.radius, 1) && near(back.angle, 0));
  // A north point → 90°, radius 0.5
  const north = { px: 100, py: 100 - 45 };
  const b = pxToOrbit(north.px, north.py, g);
  assert.ok(near(b.radius, 0.5) && near(b.angle, 90));
});

test('nodeProjection covers each output mode', () => {
  const y = { radius: 1, angle: 90, ratio: 0, output: 'y' };   // north → y=1 → proj 1
  const x = { radius: 1, angle: 0, ratio: 0, output: 'x' };    // east → x=1 → proj 1
  const r = { radius: 0.3, angle: 0, ratio: 0, output: 'radius' };
  const s = { radius: 1, angle: 90, ratio: 0, output: 'sine' }; // sin(90)=1 → proj 1
  assert.ok(near(nodeProjection(y, 0), 1));
  assert.ok(near(nodeProjection(x, 0), 1));
  assert.ok(near(nodeProjection(r, 0), 0.3));
  assert.ok(near(nodeProjection(s, 0), 1));
});

test('nodeOutput scales by depth and inverts', () => {
  const base = { radius: 1, angle: 90, ratio: 0, output: 'y', depth: 1 };  // proj 1
  assert.ok(near(nodeOutput(base, 0), 1));
  assert.ok(near(nodeOutput({ ...base, depth: 0.5 }, 0), 0.5));
  assert.ok(near(nodeOutput({ ...base, invert: true }, 0), 0));            // 1-1=0
  assert.ok(near(nodeOutput({ ...base, output: 'y', angle: 270, invert: true }, 0), 1)); // south proj 0 → inv 1
});

test('dynamic ports + fan-out values, disabled → 0', () => {
  const c = orb({ phase: 0, nodes: [...NODES, { label: 'Off', enabled: false }] });
  assert.equal(orbitNodePortId(2), 'node_2');
  assert.equal(parseOrbitNodePort('node_3'), 3);
  assert.equal(parseOrbitNodePort('slot_1'), null);
  const ports = orbitPorts(c);
  assert.equal(ports.length, 4);
  assert.equal(ports[0].id, 'node_0');
  assert.equal(ports[0].label, 'LFO A');
  const v = orbitPortValues(c);
  assert.equal(Object.keys(v).length, 4);
  assert.equal(v.node_3, 0);                        // disabled → 0
  // node_0: y output at phase 0, angle 0 → y=0 → proj 0.5
  assert.ok(near(v.node_0, 0.5));
});

test('orbitHitNode finds the nearest satellite', () => {
  const c = orb({ phase: 0, nodes: NODES });
  const g = orbitGeometry(200, 200, 10);
  const q = nodeToPx(NODES[0], 0, g);               // east edge px
  assert.equal(orbitHitNode(c, 0, g, q.px, q.py, 12), 0);
  assert.equal(orbitHitNode(c, 0, g, q.px + 100, q.py + 100, 12), -1); // nothing near
});

test('the global cycle can be a bar count, and every ratio inherits it', () => {
  const ob = (o) => ({ _children: { Core: { controlType: 'Orbit' }, Orbit: o } });
  assert.equal(orbitSynced(ob({})), false);
  assert.equal(orbitSynced(ob({ syncToTransport: true })), true);
  assert.equal(orbitCycleBars(ob({})), 4);
  assert.equal(orbitCycleBars(ob({ cycleBars: 0 })), 0.25);
  assert.equal(orbitCycleBars(ob({ cycleBars: 999 })), 64);
  // 4 bars of 4/4 at 120bpm = 16 beats = 8 seconds → 0.125 cycles/sec.
  const sync = ob({ syncToTransport: true, cycleBars: 4, rate: 0.25 });
  assert.ok(Math.abs(orbitRateAt(sync, 120, 4) - 0.125) < 1e-9);
  assert.ok(Math.abs(orbitRateAt(sync, 240, 4) - 0.25) < 1e-9);   // twice the tempo
  assert.ok(Math.abs(orbitRateAt(sync, 120, 3) - 1 / 6) < 1e-9);  // 3/4 bars are shorter
  // Unsynced ignores the tempo entirely.
  assert.ok(Math.abs(orbitRateAt(ob({ rate: 0.25 }), 240, 4) - 0.25) < 1e-9);
  // The point of not adding a per-satellite setting: a ratio is already turns
  // per cycle, so it becomes turns per phrase for free.
  const nodes = orbitNodes(ob({ syncToTransport: true, cycleBars: 4,
    nodes: [{ ratio: 2 }, { ratio: -3 }] }));
  assert.equal(nodeAngle(nodes[0], 1) - nodeAngle(nodes[0], 0), 720);   // 2 turns a cycle
  assert.equal(nodeAngle(nodes[1], 1) - nodeAngle(nodes[1], 0), -1080); // 3, the other way
});
