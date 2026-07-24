import test from 'node:test';
import assert from 'node:assert/strict';
import {
  turingPhase, turingLength, turingSteps, turingStepIndex, stepOutput, gateAt,
  mutateStep, turingGeometry, stepRect, stepAtPoint, valueFromY,
  turingPorts, turingPortValues, turingStepsPerSecond,
} from '../src/CE_Application/utils/turingLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function tg(turing) { return { _children: { Core: { controlType: 'Turing' }, Turing: turing } }; }

const STEPS = [0, 0.25, 0.5, 0.75, 1, 0.6, 0.3, 0.9];

test('phase wraps + length clamps + steps padded to length', () => {
  assert.ok(near(turingPhase(tg({ phase: 1.25 })), 0.25));
  assert.ok(near(turingPhase(tg({ phase: 0.1, __phase: 0.7 })), 0.7));
  assert.equal(turingLength(tg({ steps: STEPS })), 8);
  assert.equal(turingLength(tg({ length: 4, steps: STEPS })), 4);
  assert.equal(turingSteps(tg({ length: 3, steps: STEPS })).length, 3);
  assert.equal(turingSteps(tg({ length: 4, steps: [0.5] })).length, 4); // padded with 0
});

test('step index tracks the clock', () => {
  assert.equal(turingStepIndex(tg({ phase: 0, steps: STEPS })), 0);
  assert.equal(turingStepIndex(tg({ phase: 0.5, steps: STEPS })), 4);   // 0.5*8=4
  assert.equal(turingStepIndex(tg({ phase: 0.99, steps: STEPS })), 7);
});

test('stepOutput quantizes to levels', () => {
  assert.ok(near(stepOutput(STEPS, 2), 0.5));
  assert.ok(near(stepOutput([0.6], 0, 2), 1));      // 2 levels → 0 or 1; 0.6 rounds to 1
  assert.ok(near(stepOutput([0.6], 0, 3), 0.5));    // 3 levels → 0/0.5/1; 0.6 → 0.5
});

test('gateAt thresholds the step value', () => {
  assert.equal(gateAt(STEPS, 4, 0.5), 1);           // 1 ≥ 0.5
  assert.equal(gateAt(STEPS, 1, 0.5), 0);           // 0.25 < 0.5
  assert.equal(gateAt(STEPS, 2, 0.5), 1);           // 0.5 ≥ 0.5
});

test('mutateStep: locked at 0, always rewrites at 1', () => {
  // roll 0.4: below randomness 0.5 → mutate
  assert.ok(near(mutateStep(STEPS, 1, 0.4, 0.8, 0.5)[1], 0.8));
  // roll 0.9: above randomness 0.5 → keep
  assert.ok(near(mutateStep(STEPS, 1, 0.9, 0.8, 0.5)[1], 0.25));
  // randomness 0 → never mutates whatever the roll
  assert.ok(near(mutateStep(STEPS, 1, 0, 0.8, 0)[1], 0.25));
  // randomness 1 → always mutates
  assert.ok(near(mutateStep(STEPS, 1, 0.99, 0.42, 1)[1], 0.42));
});

test('geometry: bars + column hit-test + value-from-y', () => {
  const g = turingGeometry(200, 100, 8, 8);
  assert.equal(g.count, 8);
  const r = stepRect(g, 0, 1);                       // full-height bar
  assert.ok(near(r.h, g.h) && near(r.y, g.y0));
  const r2 = stepRect(g, 0, 0);
  assert.ok(near(r2.h, 0));
  assert.equal(stepAtPoint(g, g.x0 + 1, 8), 0);
  assert.ok(near(valueFromY(g, g.y0), 1) && near(valueFromY(g, g.y0 + g.h), 0));
});

test('static ports + fan-out values (value / gate / inverse)', () => {
  const ports = turingPorts();
  assert.deepEqual(ports.map((p) => p.id), ['value', 'gate', 'inverse']);
  const c = tg({ phase: 0.5, steps: STEPS, gateThreshold: 0.5 });  // index 4 → value 1
  const v = turingPortValues(c);
  assert.ok(near(v.value, 1));
  assert.equal(v.gate, 1);
  assert.ok(near(v.inverse, 0));
  // quantized value
  const c2 = tg({ phase: 0.625, steps: STEPS, quantizeLevels: 2, gateThreshold: 0.5 }); // index 5 → 0.6 → q2 → 1
  assert.ok(near(turingPortValues(c2).value, 1));
});

test('steps-per-second guarded', () => {
  assert.ok(near(turingStepsPerSecond(tg({ rate: 4 })), 4));
  assert.ok(near(turingStepsPerSecond(tg({ rate: 0 })), 0.1));
  assert.ok(near(turingStepsPerSecond(tg({})), 2));
});
