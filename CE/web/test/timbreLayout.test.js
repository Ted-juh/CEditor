import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timbreTargets, timbreAnchors, timbrePuck, anchorWeights, targetValue,
  timbreOutputs, timbreGeometry, timbreToPx, timbreFromPx, timbreHitAnchor,
  timbreTargetPortId, parseTimbreTargetPort, timbrePorts, timbrePortValues,
  timbreAddressableCount,
} from '../src/CE_Application/utils/timbreLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ts(timbre, bindings) {
  return { _children: { Core: { controlType: 'Timbre' }, Timbre: timbre, DeviceBindings: { bindings } } };
}

const TARGETS = [{ id: 'cut', label: 'Cutoff' }, { id: 'res', label: 'Reso' }];
// Two anchors: dark (bottom-left) cutoff 0.1, bright (top-right) cutoff 0.9.
const ANCHORS = [
  { id: 'dark', label: 'Deep Pad', x: 0, y: 0, values: { cut: 0.1, res: 0.2 } },
  { id: 'bright', label: 'Lead', x: 1, y: 1, values: { cut: 0.9, res: 0.8 } },
];

test('targets + anchors + puck normalize', () => {
  const c = ts({ x: 0.3, y: 0.7, targets: TARGETS, anchors: ANCHORS });
  assert.equal(timbreTargets(c).length, 2);
  assert.equal(timbreAnchors(c)[0].label, 'Deep Pad');
  assert.ok(near(timbrePuck(c).x, 0.3) && near(timbrePuck(c).y, 0.7));
  assert.ok(near(timbrePuck(ts({ x: 0.3, __x: 0.9, targets: [], anchors: [] })).x, 0.9)); // live override
});

test('anchorWeights: sums to 1 + snaps to the nearest anchor', () => {
  const w = anchorWeights(ANCHORS, 0.5, 0.5);
  assert.ok(near(w[0] + w[1], 1));
  assert.ok(near(w[0], 0.5) && near(w[1], 0.5));    // equidistant → equal
  const wDark = anchorWeights(ANCHORS, 0, 0);        // on the dark anchor
  assert.ok(wDark[0] > 0.999);
});

test('targetValue blends across weighted anchors', () => {
  const w = anchorWeights(ANCHORS, 0.5, 0.5);
  assert.ok(near(targetValue(ANCHORS, w, 'cut'), 0.5));   // midpoint of 0.1 and 0.9
  const wBright = anchorWeights(ANCHORS, 1, 1);
  assert.ok(near(targetValue(ANCHORS, wBright, 'cut'), 0.9, 1e-3));
});

test('timbreOutputs keyed by target id', () => {
  const c = ts({ x: 0.5, y: 0.5, targets: TARGETS, anchors: ANCHORS });
  const o = timbreOutputs(c);
  assert.ok(near(o.cut, 0.5) && near(o.res, 0.5));
});

test('geometry round-trips px (y flipped)', () => {
  const g = timbreGeometry(220, 220, 10);
  const q = timbreToPx({ x: 0, y: 1 }, g);           // top-left
  assert.ok(near(q.px, 10) && near(q.py, 10));
  const back = timbreFromPx(q.px, q.py, g);
  assert.ok(near(back.x, 0) && near(back.y, 1));
  const hit = timbreHitAnchor(ts({ targets: TARGETS, anchors: ANCHORS }), g, timbreToPx({ x: 0, y: 0 }, g).px, timbreToPx({ x: 0, y: 0 }, g).py, 12);
  assert.equal(hit, 0);
});

test('dynamic ports + fan-out keyed by port id', () => {
  const c = ts({ x: 0.5, y: 0.5, targets: TARGETS, anchors: ANCHORS });
  assert.equal(timbreTargetPortId(1), 'target_1');
  assert.equal(parseTimbreTargetPort('target_0'), 0);
  assert.equal(parseTimbreTargetPort('dest_0'), null);
  const ports = timbrePorts(c);
  assert.equal(ports.length, 2);
  assert.equal(ports[0].id, 'target_0');
  assert.equal(ports[0].label, 'Cutoff');
  const v = timbrePortValues(c);
  assert.ok(near(v.target_0, 0.5) && near(v.target_1, 0.5));
});

test('addressable count reflects bound target ports', () => {
  const c = ts({ targets: TARGETS, anchors: ANCHORS }, [
    { kind: 'deviceParameter', parameterId: 'filter.cutoff', port: 'target_0' },
  ]);
  const r = timbreAddressableCount(c);
  assert.equal(r.total, 2);
  assert.equal(r.addressable, 1);
});
