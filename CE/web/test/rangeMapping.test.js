import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindingEnds, bindingFromEnds, mapPosition, snapPosition, stepPositions,
} from '../src/CE_Application/utils/rangeMapping.js';

test('a binding reads as two ends, and two ends store as a binding', () => {
  assert.deepEqual(bindingEnds({ rangeMin: 0.2, rangeMax: 0.8, inverted: false }), { start: 0.2, end: 0.8 });
  assert.deepEqual(bindingEnds({ rangeMin: 0.2, rangeMax: 0.8, inverted: true }), { start: 0.8, end: 0.2 },
    'inverted means the parameter is at the top of its range when the control is at the bottom');
  assert.deepEqual(bindingFromEnds(0.1, 0.9), { rangeMin: 0.1, rangeMax: 0.9, inverted: false });
  assert.deepEqual(bindingFromEnds(0.9, 0.1), { rangeMin: 0.1, rangeMax: 0.9, inverted: true },
    'dragging the ends past each other inverts');
  assert.deepEqual(bindingFromEnds(-1, 2), { rangeMin: 0, rangeMax: 1, inverted: false }, 'ends are clamped');
});

test('the mapping is the host formula, steps included', () => {
  const binding = { rangeMin: 0.2, rangeMax: 0.6, inverted: false };
  assert.ok(Math.abs(mapPosition(binding, 0.5) - 0.4) < 1e-9);
  assert.ok(Math.abs(mapPosition({ ...binding, inverted: true }, 0.25) - 0.5) < 1e-9, 'rangeMin + (1 - p) * span');
  assert.equal(snapPosition(0.4, 3), 0.5, 'three steps land on 0, 1/2 and 1');
  assert.equal(snapPosition(0.2, 3), 0);
  assert.equal(snapPosition(0.4, 0), 0.4, 'smooth is unchanged');
  assert.ok(Math.abs(mapPosition({ ...binding, steps: 3 }, 0.8) - 0.6) < 1e-9);
  assert.deepEqual(stepPositions(3), [0, 0.5, 1]);
  assert.deepEqual(stepPositions(1), []);
});
