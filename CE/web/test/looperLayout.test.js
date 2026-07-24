import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looperLanes, looperPhase, normalizeGesture, laneValueAt, recordAppend,
  looperGeometry, laneRect, laneToPx, pxToLane, laneAtPoint,
  looperLanePortId, parseLooperLanePort, looperPorts, looperPortValues, looperLoopSeconds,
} from '../src/CE_Application/utils/looperLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function lp(looper) { return { _children: { Core: { controlType: 'Looper' }, Looper: looper } }; }

const G = [{ t: 0, v: 0 }, { t: 0.25, v: 1 }, { t: 0.5, v: 0 }, { t: 0.75, v: 1 }];

test('lanes normalize + phase wraps, prefers __phase', () => {
  const c = lp({ phase: 1.25, lanes: [{ label: 'A', points: G }, { enabled: false }] });
  const lanes = looperLanes(c);
  assert.equal(lanes.length, 2);
  assert.equal(lanes[0].label, 'A');
  assert.equal(lanes[1].enabled, false);
  assert.ok(near(looperPhase(c), 0.25));
  assert.ok(near(looperPhase(lp({ phase: 0.1, __phase: 0.6 })), 0.6));
});

test('normalizeGesture clamps + sorts by t', () => {
  const g = normalizeGesture([{ t: 0.9, v: 2 }, { t: 0.1, v: -1 }]);
  assert.ok(near(g[0].t, 0.1) && near(g[0].v, 0));
  assert.ok(near(g[1].t, 0.9) && near(g[1].v, 1));
});

test('laneValueAt interpolates within the span', () => {
  assert.ok(near(laneValueAt(G, 0), 0));
  assert.ok(near(laneValueAt(G, 0.125), 0.5));   // halfway 0→1
  assert.ok(near(laneValueAt(G, 0.25), 1));
  assert.ok(near(laneValueAt(G, 0.375), 0.5));   // halfway 1→0
});

test('laneValueAt wraps across the loop seam', () => {
  // last point t=0.75 v=1, first t=0 v=0; seam span = 0.25.
  assert.ok(near(laneValueAt(G, 0.875), 0.5));   // halfway across seam 1→0
  // empty → rest; single point → its value.
  assert.ok(near(laneValueAt([], 0.5, 0.3), 0.3));
  assert.ok(near(laneValueAt([{ t: 0.4, v: 0.7 }], 0.9), 0.7));
});

test('recordAppend adds samples + dedups near-identical t', () => {
  let pts = [];
  pts = recordAppend(pts, 0.1, 0.2);
  pts = recordAppend(pts, 0.1005, 0.9); // within minDt → replaces value, no new point
  assert.equal(pts.length, 1);
  assert.ok(near(pts[0].v, 0.9));
  pts = recordAppend(pts, 0.3, 0.5);
  assert.equal(pts.length, 2);
});

test('geometry stacks lanes + round-trips px', () => {
  const g = looperGeometry(300, 140, 2, 8);
  assert.equal(g.count, 2);
  const r0 = laneRect(g, 0);
  const r1 = laneRect(g, 1);
  assert.ok(r1.y > r0.y);
  const q = laneToPx(r0, 0.5, 1);                 // mid-x, top
  assert.ok(near(q.px, r0.x + r0.w / 2) && near(q.py, r0.y));
  const back = pxToLane(r0, q.px, q.py);
  assert.ok(near(back.t, 0.5) && near(back.v, 1));
  assert.equal(laneAtPoint(g, r1.y + 2, 2), 1);
});

test('dynamic ports + fan-out at phase, disabled → rest', () => {
  const c = lp({ phase: 0.25, lanes: [{ label: 'Cutoff', points: G }, { label: 'Off', points: G, enabled: false, rest: 0.2 }] });
  assert.equal(looperLanePortId(1), 'lane_1');
  assert.equal(parseLooperLanePort('lane_0'), 0);
  assert.equal(parseLooperLanePort('slot_0'), null);
  const ports = looperPorts(c);
  assert.equal(ports.length, 2);
  assert.equal(ports[0].id, 'lane_0');
  assert.equal(ports[0].label, 'Cutoff');
  const v = looperPortValues(c);
  assert.ok(near(v.lane_0, 1));                   // gesture peaks at t=0.25
  assert.ok(near(v.lane_1, 0.2));                 // disabled → rest
});

test('loop seconds guarded', () => {
  assert.ok(near(looperLoopSeconds(lp({ loopSeconds: 2 })), 2));
  assert.ok(near(looperLoopSeconds(lp({ loopSeconds: 0 })), 0.05));
  assert.ok(near(looperLoopSeconds(lp({})), 4));
});
