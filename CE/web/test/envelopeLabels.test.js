// envelopeLabels.test.js — a stage letter is placed where the line is not.
//
// The letters used to sit a fixed 8px above their node, and the curve often ran straight through
// that spot, hiding the letter under a line of its own colour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { envelopeLabelPosition } from '../src/CE_Application/utils/envelopeLabels.js';

const bounds = { x0: 0, y0: 0, x1: 200, y1: 100 };

function clearance(p, [a, b]) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

test('a node with nothing near it keeps the familiar spot above', () => {
  const node = { x: 100, y: 50 };
  const at = envelopeLabelPosition(node, [[{ x: 60, y: 90 }, node], [node, { x: 140, y: 90 }]], bounds);
  assert.equal(at.x, 100);
  assert.ok(at.y < node.y);
});

test('a letter moves off a line that runs through the spot above it', () => {
  // Decay leaving A straight upward-left and falling away steeply: "above" is on the line.
  const node = { x: 100, y: 60 };
  const segments = [[{ x: 100, y: 5 }, node], [node, { x: 140, y: 95 }]];
  const at = envelopeLabelPosition(node, segments, bounds);
  for (const segment of segments) assert.ok(clearance(at, segment) > 6, `letter at ${JSON.stringify(at)} sits on the line`);
});

test('a letter stays inside the plot', () => {
  // A at the top-left corner: above and left are both outside.
  const node = { x: 3, y: 3 };
  const at = envelopeLabelPosition(node, [[{ x: 3, y: 95 }, node], [node, { x: 60, y: 95 }]], bounds);
  assert.ok(at.x - 3.5 >= bounds.x0 && at.y - 4.5 >= bounds.y0, `letter left the plot: ${JSON.stringify(at)}`);
});
