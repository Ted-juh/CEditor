import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constraintMembers, constraintMode, applyConstraint, constraintSatisfied,
  constraintModeLabel, constraintGeometry, barRect, barAtPoint, valueFromY,
  constraintMemberPortId, parseConstraintMemberPort, constraintPorts, constraintPortValues,
} from '../src/CE_Application/utils/constraintLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function cc(c) { return { _children: { Core: { controlType: 'Constraint' }, Constraint: c } }; }
const sum = (a) => a.reduce((s, x) => s + x, 0);

test('members + mode normalize', () => {
  const c = cc({ mode: 'order', members: [{ label: 'Cutoff', value: 0.8 }, { value: 2 }] });
  assert.equal(constraintMode(c), 'order');
  assert.equal(constraintMembers(c).length, 2);
  assert.equal(constraintMembers(c)[0].label, 'Cutoff');
  assert.ok(near(constraintMembers(c)[1].value, 1)); // clamped
});

test('SUM: members always total 1, others redistribute proportionally', () => {
  // [0.5, 0.3, 0.2] change index 0 → 0.7 : remaining 0.3 split 0.3:0.2 → 0.18:0.12
  const r = applyConstraint([0.5, 0.3, 0.2], 'sum', 0, 0.7);
  assert.ok(near(sum(r), 1));
  assert.ok(near(r[0], 0.7) && near(r[1], 0.18) && near(r[2], 0.12));
  // all-zero others split equally
  const r2 = applyConstraint([0.4, 0, 0], 'sum', 0, 0.6);
  assert.ok(near(sum(r2), 1) && near(r2[1], 0.2) && near(r2[2], 0.2));
});

test('ORDER: keeps non-decreasing (reso ≤ cutoff)', () => {
  // raise member 0 above its neighbour → neighbour is pushed up
  const r = applyConstraint([0.3, 0.5, 0.9], 'order', 0, 0.7);
  assert.ok(r[0] <= r[1] + 1e-9 && r[1] <= r[2] + 1e-9);
  assert.ok(near(r[0], 0.7) && r[1] >= 0.7);
  // lower a high member → the ones above clamp down
  const r2 = applyConstraint([0.2, 0.5, 0.8], 'order', 2, 0.3);
  assert.ok(r2[0] <= r2[1] + 1e-9 && r2[1] <= r2[2] + 1e-9);
  assert.ok(near(r2[2], 0.3) && r2[1] <= 0.3);
  // minGap enforced
  const r3 = applyConstraint([0.4, 0.4, 0.4], 'order', 0, 0.4, { minGap: 0.1 });
  assert.ok(r3[1] >= r3[0] + 0.1 - 1e-9 && r3[2] >= r3[1] + 0.1 - 1e-9);
});

test('RATIO: preserves proportions by scaling the gang', () => {
  // [0.2, 0.4] change 0 → 0.4 (×2) → [0.4, 0.8]
  const r = applyConstraint([0.2, 0.4], 'ratio', 0, 0.4);
  assert.ok(near(r[0], 0.4) && near(r[1], 0.8));
});

test('MIRROR: first two members complement', () => {
  const r = applyConstraint([0.3, 0.7, 0.5], 'mirror', 0, 0.6);
  assert.ok(near(r[0], 0.6) && near(r[1], 0.4));
  assert.ok(near(r[2], 0.5)); // extra untouched
});

test('FREE: only the changed member moves', () => {
  const r = applyConstraint([0.2, 0.5], 'free', 1, 0.9);
  assert.ok(near(r[0], 0.2) && near(r[1], 0.9));
});

test('satisfied check', () => {
  assert.equal(constraintSatisfied([0.5, 0.3, 0.2], 'sum'), true);
  assert.equal(constraintSatisfied([0.5, 0.3, 0.3], 'sum'), false);
  assert.equal(constraintSatisfied([0.2, 0.5, 0.8], 'order'), true);
  assert.equal(constraintSatisfied([0.8, 0.5], 'order'), false);
  assert.equal(constraintModeLabel('sum'), 'Σ = 100%');
});

test('geometry: bars + hit-test + value-from-y', () => {
  const g = constraintGeometry(200, 120, 3, 8, 16);
  assert.equal(g.count, 3);
  const r = barRect(g, 0, 1);
  assert.ok(near(r.h, g.h) && near(r.y, g.y0));
  assert.equal(barAtPoint(g, g.x0 + 1, 3), 0);
  assert.ok(near(valueFromY(g, g.y0), 1) && near(valueFromY(g, g.y0 + g.h), 0));
});

test('dynamic ports + fan-out values', () => {
  const c = cc({ mode: 'sum', members: [{ label: 'Osc 1', value: 0.6 }, { label: 'Osc 2', value: 0.4 }] });
  assert.equal(constraintMemberPortId(1), 'member_1');
  assert.equal(parseConstraintMemberPort('member_0'), 0);
  assert.equal(parseConstraintMemberPort('slot_0'), null);
  const ports = constraintPorts(c);
  assert.equal(ports.length, 2);
  assert.equal(ports[0].id, 'member_0');
  assert.equal(ports[0].label, 'Osc 1');
  const v = constraintPortValues(c);
  assert.ok(near(v.member_0, 0.6) && near(v.member_1, 0.4));
});
