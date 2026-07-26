import test from 'node:test';
import assert from 'node:assert/strict';
import {
  macroSlots, macroWarp, macroSlotValue, macroPortValues, macroPorts,
  macroSlotPortId, parseMacroSlotPort, macroGeometry, macroKnobHit, macroKnobAngle,
} from '../src/CE_Application/utils/macroLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function mac(macro) { return { _children: { Core: { controlType: 'Macro' }, Macro: macro } }; }

const SLOTS = [
  { id: 'a', label: 'Filter Cutoff', depth: 1.0, curve: 'linear' },
  { id: 'b', label: 'Reverb Mix', depth: 0.6, curve: 'linear' },
  { id: 'c', label: 'Osc Detune', depth: -0.4, curve: 'linear' },
  { id: 'd', label: 'Drive', depth: 1.0, curve: 'exp' },
];

test('curve warp shapes', () => {
  assert.ok(near(macroWarp(0.5, 'linear'), 0.5));
  assert.ok(near(macroWarp(0.5, 'exp'), 0.25));    // t²
  assert.ok(near(macroWarp(0.5, 'log'), 0.75));    // 1-(1-t)²
  assert.ok(near(macroWarp(0.5, 'scurve'), 0.5));
});

test('slot value: depth, inverse, curve, range (matches the concept)', () => {
  const [cut, verb, det, drv] = SLOTS;
  // At macro 0.28: cutoff 0.28, reverb 0.168, detune inverse 0.288, drive 0.28²=0.0784.
  assert.ok(near(macroSlotValue(0.28, cut), 0.28));
  assert.ok(near(macroSlotValue(0.28, verb), 0.6 * 0.28));
  assert.ok(near(macroSlotValue(0.28, det), 0.4 * (1 - 0.28)));  // negative depth → inverse
  assert.ok(near(macroSlotValue(0.28, drv), 0.28 * 0.28));
  // Ends.
  assert.ok(near(macroSlotValue(1, cut), 1) && near(macroSlotValue(0, cut), 0));
  assert.ok(near(macroSlotValue(0, det), 0.4) && near(macroSlotValue(1, det), 0)); // inverse: high→low
});

test('per-slot output range maps the amount into [min,max]', () => {
  const s = { depth: 1, curve: 'linear', min: 0.2, max: 0.8 };
  assert.ok(near(macroSlotValue(0, s), 0.2));   // amount 0 → min
  assert.ok(near(macroSlotValue(1, s), 0.8));   // amount 1 → max
  assert.ok(near(macroSlotValue(0.5, s), 0.5)); // 0.2 + 0.6*0.5
});

test('portValues + dynamic ports: one per slot, disabled → 0', () => {
  const c = mac({ value: 0.28, slots: [...SLOTS, { label: 'Off', depth: 1, enabled: false }] });
  const v = macroPortValues(c);
  assert.equal(Object.keys(v).length, 5);
  assert.equal(macroSlotPortId(0), 'slot_0');
  assert.deepEqual(parseMacroSlotPort('slot_3'), 3);
  assert.ok(near(v.slot_0, 0.28));
  assert.equal(v.slot_4, 0);                     // disabled slot emits 0
  const ports = macroPorts(c);
  assert.equal(ports.length, 5);
  assert.equal(ports[0].label, 'Filter Cutoff');
  assert.equal(ports[0].id, 'slot_0');
});

test('geometry places the knob left of the lanes + hit-test', () => {
  const c = mac({ slots: SLOTS });
  const g = macroGeometry(360, 150, c);
  assert.ok(g.showLanes && g.knobCX < g.lanesX0);
  assert.equal(macroKnobHit(g, g.knobCX, g.knobCY), true);
  assert.equal(macroKnobHit(g, g.lanesX0 + 40, g.knobCY), false);
  // Knob-only when no lanes: centred.
  const g2 = macroGeometry(120, 120, mac({ slots: [], showLanes: false }));
  assert.ok(near(g2.knobCX, 60));
  // Angle sweep.
  assert.equal(macroKnobAngle(0), 135);
  assert.equal(macroKnobAngle(1), 405);
});
