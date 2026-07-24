import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routerConfig, routerInput, routerCurvePoints, shapeInput, routerCurveValue,
  routerDests, routerDestValue, routerPortValues, routerPorts,
  routerDestPortId, parseRouterDestPort, routerSourceLabel, ROUTER_INPUT_SOURCES,
} from '../src/CE_Application/utils/routerLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function rt(router) { return { _children: { Core: { controlType: 'Router' }, Router: router } }; }

const LINE = [{ x: 0, y: 0, curve: 'linear' }, { x: 1, y: 1, curve: 'linear' }]; // identity

test('input prefers __input, clamps', () => {
  assert.ok(near(routerInput(rt({ testInput: 0.4 })), 0.4));
  assert.ok(near(routerInput(rt({ testInput: 0.4, __input: 0.9 })), 0.9));
  assert.ok(near(routerInput(rt({ __input: 2 })), 1));
});

test('shapeInput: invert + dead-zone rescale', () => {
  assert.ok(near(shapeInput(0.3), 0.3));
  assert.ok(near(shapeInput(0.3, { invert: true }), 0.7));
  // dead-zone 0.2: below → 0; 0.6 rescales (0.6-0.2)/0.8 = 0.5
  assert.ok(near(shapeInput(0.1, { deadzone: 0.2 }), 0));
  assert.ok(near(shapeInput(0.6, { deadzone: 0.2 }), 0.5));
});

test('curve value: pass-through without a curve, sampled with one', () => {
  assert.ok(near(routerCurveValue(rt({ __input: 0.42 }), 0.42), 0.42));   // no curve → identity shaped
  // identity curve → same as shaped input
  assert.ok(near(routerCurveValue(rt({ __input: 0.3, curve: LINE })), 0.3));
  // with invert + identity curve → 0.7
  assert.ok(near(routerCurveValue(rt({ __input: 0.3, curve: LINE, invert: true })), 0.7));
});

test('destination mapping: depth, invert, range', () => {
  const d = { depth: 1, min: 0, max: 1 };
  assert.ok(near(routerDestValue(0.4, d), 0.4));
  assert.ok(near(routerDestValue(0.4, { depth: 0.5, min: 0, max: 1 }), 0.2));      // half depth
  assert.ok(near(routerDestValue(0.4, { depth: -1, min: 0, max: 1 }), 0.6));       // inverted
  assert.ok(near(routerDestValue(0, { depth: 1, min: 0.2, max: 0.8 }), 0.2));      // amount 0 → min
  assert.ok(near(routerDestValue(1, { depth: 1, min: 0.2, max: 0.8 }), 0.8));      // amount 1 → max
});

test('dynamic ports + fan-out, disabled → floor', () => {
  const c = rt({ __input: 0.5, curve: LINE, destinations: [
    { label: 'Filter', depth: 1, min: 0, max: 1 },
    { label: 'Off', depth: 1, min: 0.3, max: 1, enabled: false },
  ] });
  assert.equal(routerDestPortId(1), 'dest_1');
  assert.equal(parseRouterDestPort('dest_0'), 0);
  assert.equal(parseRouterDestPort('lane_0'), null);
  const ports = routerPorts(c);
  assert.equal(ports.length, 2);
  assert.equal(ports[0].id, 'dest_0');
  assert.equal(ports[0].label, 'Filter');
  const v = routerPortValues(c);
  assert.ok(near(v.dest_0, 0.5));                 // identity curve at input 0.5
  assert.ok(near(v.dest_1, 0.3));                 // disabled → its min floor
});

test('input source registry + labels', () => {
  assert.ok(ROUTER_INPUT_SOURCES.length >= 5);
  assert.equal(routerSourceLabel('modwheel'), 'Mod Wheel');
  assert.equal(routerSourceLabel('aftertouch'), 'Aftertouch (channel)');
});
