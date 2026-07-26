import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looperLanes, looperPhase, normalizeGesture, laneValueAt, recordAppend,
  looperGeometry, laneRect, laneToPx, pxToLane, laneAtPoint,
  looperLanePortId, parseLooperLanePort, looperPorts, looperPortValues, looperLoopSeconds,
  looperSynced, looperLoopBars, looperLoopSecondsAt, looperGridLines,
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

test('synced loop length is bars at a tempo', () => {
  assert.equal(looperSynced(lp({})), false);
  assert.equal(looperSynced(lp({ syncToTransport: true })), true);
  assert.ok(near(looperLoopBars(lp({ loopBars: 4 })), 4));
  assert.ok(near(looperLoopBars(lp({ loopBars: 0 })), 0.25));      // clamped
  const sync = lp({ syncToTransport: true, loopBars: 2, loopSeconds: 4 });
  assert.ok(near(looperLoopSecondsAt(sync, 120, 4), 4));           // 8 beats at 120bpm
  assert.ok(near(looperLoopSecondsAt(sync, 60, 4), 8));            // half the tempo
  assert.ok(near(looperLoopSecondsAt(sync, 120, 3), 3));           // 3/4 → 6 beats
  // Unsynced ignores the tempo entirely.
  assert.ok(near(looperLoopSecondsAt(lp({ loopSeconds: 4 }), 240, 4), 4));
});

test('the lane grid marks bars and beats only when synced', () => {
  const free = looperGridLines(lp({}), 4);
  assert.deepEqual(free.map((g) => g.t), [0.25, 0.5, 0.75]);
  assert.equal(free.every((g) => g.major === false), true);
  // 2 bars of 4/4 = 8 beats → 7 interior lines, the bar line at halfway major.
  const sync = looperGridLines(lp({ syncToTransport: true, loopBars: 2 }), 4);
  assert.equal(sync.length, 7);
  assert.deepEqual(sync.filter((g) => g.major).map((g) => g.t), [0.5]);
  // 1 bar of 3/4 → 2 interior beat lines, no interior bar line.
  const waltz = looperGridLines(lp({ syncToTransport: true, loopBars: 1 }), 3);
  assert.equal(waltz.length, 2);
  assert.equal(waltz.some((g) => g.major), false);
});
