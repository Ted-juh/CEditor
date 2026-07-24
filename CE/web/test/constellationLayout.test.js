import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constellationTargets, constellationPresets, constellationProbe,
  nearestPreset, blendWeights, selectedPreset, constellationOutputs,
  constellationLinks, autoArrange, wanderPos,
  constellationGeometry, constellationToPx, constellationFromPx, constellationHitPreset,
  constellationTargetPortId, parseConstellationTargetPort, constellationPorts, constellationPortValues,
  captureConstellationValues,
} from '../src/CE_Application/utils/constellationLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function cn(c) { return { _children: { Core: { controlType: 'Constellation' }, Constellation: c } }; }

const TARGETS = [{ id: 'cut', label: 'Cutoff' }, { id: 'res', label: 'Reso' }];
const PRESETS = [
  { id: 'a', label: 'Dark', x: 0, y: 0, values: { cut: 0.1, res: 0.2 } },
  { id: 'b', label: 'Bright', x: 1, y: 1, values: { cut: 0.9, res: 0.8 } },
  { id: 'c', label: 'Mid', x: 0.5, y: 0.5, values: { cut: 0.5, res: 0.5 } },
];

test('targets/presets/probe normalize', () => {
  const c = cn({ probeX: 0.3, probeY: 0.7, targets: TARGETS, presets: PRESETS });
  assert.equal(constellationTargets(c).length, 2);
  assert.equal(constellationPresets(c)[0].label, 'Dark');
  assert.ok(near(constellationProbe(c).x, 0.3));
  assert.ok(near(constellationProbe(cn({ probeX: 0.3, __probeX: 0.9 })).x, 0.9)); // live override
});

test('nearestPreset by screen position', () => {
  assert.equal(nearestPreset(PRESETS, 0.05, 0.05), 0);  // near Dark
  assert.equal(nearestPreset(PRESETS, 0.95, 0.95), 1);  // near Bright
  assert.equal(nearestPreset(PRESETS, 0.5, 0.5), 2);    // on Mid
  assert.equal(selectedPreset(cn({ probeX: 0.95, probeY: 0.95, targets: TARGETS, presets: PRESETS })), 1);
});

test('snap mode recalls the nearest preset exactly', () => {
  const c = cn({ mode: 'snap', probeX: 0.05, probeY: 0.05, targets: TARGETS, presets: PRESETS });
  const o = constellationOutputs(c);
  assert.ok(near(o.cut, 0.1) && near(o.res, 0.2));      // Dark, verbatim
});

test('blend mode interpolates by inverse distance', () => {
  // probe exactly on Mid → Mid dominates (weight ~1)
  const c = cn({ mode: 'blend', probeX: 0.5, probeY: 0.5, targets: TARGETS, presets: PRESETS, blendPower: 2 });
  const o = constellationOutputs(c);
  assert.ok(near(o.cut, 0.5, 1e-3));
  // weights sum to 1
  const w = blendWeights(PRESETS, 0.3, 0.6);
  assert.ok(near(w.reduce((s, x) => s + x, 0), 1));
});

test('links connect sonically-nearest presets (deduped pairs)', () => {
  const links = constellationLinks(cn({ targets: TARGETS, presets: PRESETS }), 1);
  // each preset's single nearest neighbour, deduped
  assert.ok(links.length >= 1);
  for (const l of links) assert.ok(l.a < l.b);
  // no duplicate pairs
  const keys = new Set(links.map((l) => `${l.a}_${l.b}`));
  assert.equal(keys.size, links.length);
});

test('autoArrange: identical presets coincide; poles spread to extremes', () => {
  const c = cn({ targets: TARGETS, presets: [
    { id: 'a', values: { cut: 0, res: 0 } },
    { id: 'a2', values: { cut: 0, res: 0 } },   // identical feature vector
    { id: 'b', values: { cut: 1, res: 1 } },
  ] });
  const arranged = autoArrange(c);
  assert.equal(arranged.length, 3);
  // identical presets land at the same x
  assert.ok(near(arranged[0].x, arranged[1].x, 1e-6));
  // the two extremes differ on x
  assert.ok(Math.abs(arranged[0].x - arranged[2].x) > 0.5);
  // all within [0,1]
  for (const p of arranged) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
});

test('wanderPos stays in the field + wraps', () => {
  const p0 = wanderPos(0);
  assert.ok(p0.x >= 0 && p0.x <= 1 && p0.y >= 0 && p0.y <= 1);
  assert.deepEqual(wanderPos(1.25), wanderPos(0.25));
});

test('geometry round-trips px + hit-test', () => {
  const g = constellationGeometry(220, 220, 10);
  const q = constellationToPx({ x: 0, y: 1 }, g);
  assert.ok(near(q.px, 10) && near(q.py, 10));
  const back = constellationFromPx(q.px, q.py, g);
  assert.ok(near(back.x, 0) && near(back.y, 1));
  const hit = constellationHitPreset(cn({ targets: TARGETS, presets: PRESETS }), g, constellationToPx({ x: 0, y: 0 }, g).px, constellationToPx({ x: 0, y: 0 }, g).py, 12);
  assert.equal(hit, 0);
});

test('capture maps bound targets from a param snapshot', () => {
  const c = { _children: { Core: { controlType: 'Constellation' }, Constellation: { targets: TARGETS, presets: PRESETS },
    DeviceBindings: { bindings: [{ kind: 'deviceParameter', parameterId: 'filter.cutoff', port: 'target_0' }] } } };
  const captured = captureConstellationValues(c, { 'filter.cutoff': 0.66, other: 0.2 });
  assert.ok(near(captured.cut, 0.66));
  assert.equal(captured.res, undefined);                  // unbound target skipped
});

test('dynamic ports + fan-out keyed by port id', () => {
  const c = cn({ mode: 'blend', probeX: 0.5, probeY: 0.5, targets: TARGETS, presets: PRESETS });
  assert.equal(constellationTargetPortId(1), 'target_1');
  assert.equal(parseConstellationTargetPort('target_0'), 0);
  assert.equal(parseConstellationTargetPort('slot_0'), null);
  const ports = constellationPorts(c);
  assert.equal(ports.length, 2);
  assert.equal(ports[0].id, 'target_0');
  assert.equal(ports[0].label, 'Cutoff');
  const v = constellationPortValues(c);
  assert.ok(near(v.target_0, 0.5, 1e-3));
});
