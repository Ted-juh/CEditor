// canvasSnapPolish.test.js — snapping that does what the gesture means.
//
// Three defects, each pinned by the case that used to go wrong:
//
//   RESIZE SNAPPED LIKE A MOVE. Resizing called the move snap, which shifts the whole box until SOME
//   edge meets a guide. Dragging a right edge to a neighbour could shove the box sideways instead of
//   widening it. snapResizeRect snaps only the dragged edges, and a snap changes the size.
//
//   ROTATION WAS INVISIBLE TO SNAPPING. A rotated control snapped by its unrotated box, and lined up
//   with rotated neighbours' unrotated boxes — edges nobody could see. Both now use the rotated
//   footprint.
//
//   ASPECT LOCK WAS A CORNERS-ONLY PROMISE. Transform.aspectLock was ignored on edge handles.

import test from 'node:test';
import assert from 'node:assert/strict';

import { findAlignmentSnap, snapMovingRect, snapResizeRect } from '../src/CE_Application/utils/canvasSnapping.js';
import { computeResizedRect } from '../src/CE_Application/utils/transformMath.js';

const getSection = (control, name) => control?._children?.[name];
const neighbour = (x, y, width, height, rotation = 0) => ({
  _children: { Core: { id: `n${x}_${y}` }, Transform: { x, y, width, height, rotation } },
});

/** The snap a canvas would do, against the given neighbours, with the default 5px stickiness. */
const snapperFor = (...others) => (rect, edges = null) => findAlignmentSnap(rect, 'me', others, null, getSection, null, 5, edges);

// --- Resize --------------------------------------------------------------------------------------

test('dragging a right edge to a neighbour widens the box; the left edge stays put', () => {
  // Neighbour's left edge at x=200. Our box 100..197 wide-dragged near it.
  const out = snapResizeRect({ x: 100, y: 50, w: 97, h: 40 }, 'r', snapperFor(neighbour(200, 300, 50, 50)));
  assert.equal(out.x, 100, 'the held edge does not move');
  assert.equal(out.w, 100, 'the dragged edge lands on the guide');
  assert.deepEqual(out.guides.map((g) => [g.type, g.pos]), [['vertical', 200]]);
});

test('dragging a left edge snaps it and keeps the right edge fixed', () => {
  const out = snapResizeRect({ x: 103, y: 50, w: 97, h: 40 }, 'l', snapperFor(neighbour(40, 300, 60, 50)));
  assert.equal(out.x, 100, 'left edge meets the neighbour\'s right edge');
  assert.equal(out.x + out.w, 200, 'right edge unchanged');
});

test('the edge not being dragged never snaps — the old bug', () => {
  // Our LEFT edge (100) is 2px from a guide at 98, but we are dragging the RIGHT edge.
  const moveSnap = snapperFor(neighbour(0, 300, 98, 20));
  const asMove = moveSnap({ x: 100, y: 50, w: 150, h: 40 });
  assert.equal(asMove.x, 98, 'as a move, the box would have been shoved 2px left');
  const out = snapResizeRect({ x: 100, y: 50, w: 150, h: 40 }, 'r', moveSnap);
  assert.deepEqual([out.x, out.w], [100, 150], 'as a resize, nothing happens');
  assert.deepEqual(out.guides, []);
});

test('with the aspect locked, one axis snaps and the other follows the ratio', () => {
  const out = snapResizeRect({ x: 0, y: 0, w: 98, h: 49 }, 'br',
    snapperFor(neighbour(100, 400, 10, 10), neighbour(400, 52, 10, 10)),
    { aspectLock: true, aspectRatio: 2 });
  assert.equal(out.w / out.h, 2, 'the ratio survives the snap');
  assert.equal(out.guides.length, 1);
});

test('a snap that would collapse the box below its minimum is ignored', () => {
  // Right edge at 111; the nearest guide is a left edge at 108, which would make the box 8 wide.
  const out = snapResizeRect({ x: 100, y: 0, w: 11, h: 40 }, 'r', snapperFor(neighbour(108, 300, 60, 10)), { minW: 10 });
  assert.equal(out.w, 11);
  assert.deepEqual(out.guides, []);
});

// --- Rotation ------------------------------------------------------------------------------------

test('a rotated control snaps by what is on screen, not its unrotated box', () => {
  // A 100×20 bar rotated 90° is visually 20 wide and 100 tall: its visible left edge is at x+40.
  const bar = { x: 100, y: 100, w: 100, h: 20 };
  const snap = snapperFor(neighbour(142, 400, 30, 30));      // a left edge at 142, 2px from the bar's visible left
  const out = snapMovingRect(bar, 90, (box) => snap(box));
  assert.equal(out.x, 102, 'the whole control moved 2px so its visible left edge meets 142');
  assert.equal(snapMovingRect(bar, 0, (box) => snap(box)).x, 100, 'unrotated, 142 is nowhere near it');
});

test('a rotated neighbour is lined up with by its visible edges', () => {
  // Neighbour: 100×20 at (300,100) rotated 90° → visible from x=340 to 360.
  const rotated = neighbour(300, 100, 100, 20, 90);
  const out = findAlignmentSnap({ x: 342, y: 400, w: 30, h: 30 }, 'me', [rotated], null, getSection, null, 5);
  assert.equal(out.x, 340);
});

// --- Aspect lock on edges ------------------------------------------------------------------------

test('an edge handle keeps the aspect lock, growing the other side about its centre', () => {
  const start = { x: 100, y: 100, w: 200, h: 100 };
  const out = computeResizedRect(start, 'r', 100, 0, { aspectLock: true, aspectRatio: 2, minW: 4, minH: 4, maxW: 0, maxH: 0 });
  assert.deepEqual(out, { x: 100, y: 75, w: 300, h: 150 });
  const down = computeResizedRect(start, 'b', 0, 50, { aspectLock: true, aspectRatio: 2, minW: 4, minH: 4, maxW: 0, maxH: 0 });
  assert.deepEqual(down, { x: 50, y: 100, w: 300, h: 150 });
});

test('unlocked edge handles are exactly as before', () => {
  const out = computeResizedRect({ x: 0, y: 0, w: 200, h: 100 }, 'r', 50, 30, { aspectLock: false, minW: 4, minH: 4, maxW: 0, maxH: 0 });
  assert.deepEqual(out, { x: 0, y: 0, w: 250, h: 100 });
});

// --- Group resize --------------------------------------------------------------------------------
//
// Lived inline in SelectionBoundsOverlay, untested. Moved to utils/groupTransform.js, where it also
// stopped shearing rotated members: sizes scale in the member's own frame, centres follow the box.

import { groupResizePatches, memberScale } from '../src/CE_Application/utils/groupTransform.js';

const root = (id, x, y, w, h, rotation = 0) => ({ id, kind: 'root', local: { x, y, w, h }, rotation, parentOffset: { x: 0, y: 0 } });

test('unrotated members scale and move with the box exactly as before', () => {
  const members = [root('a', 0, 0, 50, 50), root('b', 50, 0, 50, 50)];
  const patches = groupResizePatches(members, { x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual(patches.get('a'), { 'Transform.x': 0, 'Transform.y': 0, 'Transform.width': 100, 'Transform.height': 100 });
  assert.deepEqual(patches.get('b'), { 'Transform.x': 100, 'Transform.y': 0, 'Transform.width': 100, 'Transform.height': 100 });
});

test('a member at 90° grows along the axes it actually lies on', () => {
  // A 100×20 bar at 90° is 20 wide on screen. Widening the box 2× must double what is on screen —
  // its own HEIGHT — not its own width, which on screen is its height.
  const bar = root('bar', 0, 40, 100, 20, 90);            // centre (50,50); on screen 40..60 × 0..100
  const patches = groupResizePatches([bar], { x: 40, y: 0, w: 20, h: 100 }, { x: 40, y: 0, w: 40, h: 100 });
  const p = patches.get('bar');
  assert.equal(p['Transform.width'], 100, 'its length is along the box\'s height, which did not change');
  assert.equal(p['Transform.height'], 40, 'its thickness is along the box\'s width, which doubled');
  assert.equal(p['Transform.x'] + p['Transform.width'] / 2, 60, 'its centre followed the box');
});

test('a member at an odd angle scales uniformly, keeping its shape, with its centre on the box', () => {
  assert.deepEqual(memberScale(30, 2, 0.5), { fx: 1, fy: 1 });
  assert.deepEqual(memberScale(-90, 2, 3), { fx: 3, fy: 2 });
  assert.deepEqual(memberScale(180, 2, 3), { fx: 2, fy: 3 });
  const tilted = root('t', 0, 0, 40, 40, 30);
  const p = groupResizePatches([tilted], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 200 }).get('t');
  assert.equal(p['Transform.width'], p['Transform.height'], 'still square');
  assert.equal(p['Transform.x'] + p['Transform.width'] / 2, 40, 'centre (20,20) mapped to (40,40)');
});

test('a selected container\'s contents scale with their container\'s factors', () => {
  const box = root('box', 0, 0, 100, 100, 90);
  const child = { id: 'child', kind: 'descendant', local: { x: 10, y: 20, w: 30, h: 40 }, rootId: 'box' };
  const p = groupResizePatches([box, child], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 100 }).get('child');
  // The container at 90° takes the box's 2× along its own height, so its contents do too.
  assert.deepEqual(p, { 'Transform.x': 10, 'Transform.y': 40, 'Transform.width': 30, 'Transform.height': 80 });
});
