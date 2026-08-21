import test from 'node:test';
import assert from 'node:assert/strict';

import { computeRotatedResizedRect, computeResizedRect } from '../src/CE_Application/utils/transformMath.js';
import { findControlAtPoint, findControlsInRect } from '../src/CE_Application/utils/canvasSelection.js';

const OPTS = { aspectLock: false, aspectRatio: 1, minW: 4, minH: 4, maxW: 0, maxH: 0 };

function rotatePoint(cx, cy, x, y, deg) {
  const t = (deg * Math.PI) / 180;
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) };
}

test('rotated resize matches the plain resize at 0°', () => {
  const start = { x: 10, y: 20, w: 100, h: 50 };
  const plain = computeResizedRect(start, 'br', 12, -6, OPTS);
  const rotated = computeRotatedResizedRect(start, 'br', 12, -6, 0, OPTS);
  assert.deepEqual(rotated, plain);
});

test('rotated resize keeps the opposite corner fixed in panel space', () => {
  const start = { x: 40, y: 40, w: 80, h: 40 };
  const deg = 30;
  const c0 = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
  // World position of the top-left corner (the anchor for a 'br' drag)
  const anchorBefore = rotatePoint(c0.x, c0.y, start.x, start.y, deg);

  const out = computeRotatedResizedRect(start, 'br', 20, 10, deg, OPTS);
  const c1 = { x: out.x + out.w / 2, y: out.y + out.h / 2 };
  const anchorAfter = rotatePoint(c1.x, c1.y, out.x, out.y, deg);

  assert.ok(Math.abs(anchorBefore.x - anchorAfter.x) < 1e-9, 'anchor x moved');
  assert.ok(Math.abs(anchorBefore.y - anchorAfter.y) < 1e-9, 'anchor y moved');
});

test('rotated resize follows the handle in the control frame', () => {
  // 90° rotation: dragging the pointer downward is a drag along the
  // control's LOCAL +x axis, so the 'r' handle should change the WIDTH.
  const start = { x: 0, y: 0, w: 60, h: 30 };
  const out = computeRotatedResizedRect(start, 'r', 0, 15, 90, OPTS);
  assert.equal(Math.round(out.w), 75);
  assert.equal(Math.round(out.h), 30);
});

function ctrl(id, t, children = null) {
  const c = { _children: { Core: { id }, Transform: t } };
  if (children) c._children.Children = { _children: Object.fromEntries(children.map((k, i) => [`c${i}`, k])) };
  return c;
}

test('clicking where a rotated control is drawn hits it', () => {
  // 40x10 bar centred at (50,50), rotated 90° → drawn as a vertical bar.
  const bar = ctrl('bar', { x: 30, y: 45, width: 40, height: 10, rotation: 90 });
  // A point above the centre lies on the DRAWN bar but outside the stored AABB.
  assert.equal(findControlAtPoint([bar], 50, 35)?._children.Core.id, 'bar');
  // A point inside the stored AABB but off the drawn bar must miss.
  assert.equal(findControlAtPoint([bar], 34, 49), null);
});

test('the marquee intersects the drawn footprint of a rotated control', () => {
  const bar = ctrl('bar', { x: 30, y: 45, width: 40, height: 10, rotation: 90 });
  const getSection = (c, name) => c._children?.[name];
  // Marquee over the drawn (vertical) top end — outside the stored AABB.
  assert.ok(findControlsInRect([bar], { x: 45, y: 30, w: 10, h: 8 }, getSection).has('bar'));
  // Marquee inside the stored AABB's left end — misses the drawn bar.
  assert.equal(findControlsInRect([bar], { x: 30, y: 45, w: 6, h: 4 }, getSection).size, 0);
});
