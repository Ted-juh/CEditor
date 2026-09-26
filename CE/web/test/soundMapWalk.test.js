import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestInDirection } from '../src/CE_Application/utils/soundMapWalk.js';

const points = [
  { id: 'here', x: 0.5, y: 0.5 },
  { id: 'right', x: 0.7, y: 0.52 },
  { id: 'rightFarBelow', x: 0.55, y: 0.9 },
  { id: 'left', x: 0.3, y: 0.5 },
  { id: 'up', x: 0.5, y: 0.2 },
];

test('each arrow goes to the nearest sound that way, straight ahead preferred', () => {
  assert.equal(nearestInDirection(points, 'here', [1, 0]), 'right');
  assert.equal(nearestInDirection(points, 'here', [-1, 0]), 'left');
  assert.equal(nearestInDirection(points, 'here', [0, -1]), 'up');
  assert.equal(nearestInDirection(points, 'here', [0, 1]), 'rightFarBelow');
});

test('with nothing in the cone, anything ahead will do', () => {
  const sparse = [{ id: 'a', x: 0.5, y: 0.5 }, { id: 'b', x: 0.9, y: 0.55 }];
  assert.equal(nearestInDirection(sparse, 'a', [0, 1]), 'b', 'a sound off to the side still counts when it is the only one below');
});

test('at the edge there is nowhere to go, and an unknown start goes nowhere', () => {
  assert.equal(nearestInDirection(points, 'right', [1, 0]), null);
  assert.equal(nearestInDirection(points, 'missing', [1, 0]), null);
});
