// penPath.test.js — the Pen tool's geometry: any outline as a part that scales with its box.
//
// A path part stores its points relative to its own box (0..1), as the built-in polygons do, and
// its box is always the tight bounding box of the points. These pin that round trip — points in,
// part out, points back — and the edits the vertex handles make.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  constrainTo45, insertPathPoint, isPathPart, movePathPoint, nearestPathSegment, pathGeometryFromPoints,
  pathPartSpec, pathPatchFromPoints, pathPointsInArtboard, pathVectorPoints, penClickAction, removePathPoint,
} from '../src/CE_Application/utils/penPath.js';

/** A path part as the designer stores it, built from artboard points. */
function partFrom(points, closed = true) {
  const spec = pathPartSpec(points, closed);
  return { _type: 'Part', kind: spec.kind, meta: spec.meta, _children: { Layout: spec.layout } };
}

/** Apply a part-relative patch the way applyControlPatch would. */
function applied(part, patch) {
  const next = { ...part, meta: { ...part.meta }, _children: { ...part._children, Layout: { ...part._children.Layout } } };
  for (const [path, value] of Object.entries(patch)) {
    const [head, key] = path.split('.');
    if (head === 'Layout') next._children.Layout[key] = value;
    else next.meta[key] = value;
  }
  return next;
}

const near = (a, b) => a.every(([x, y], i) => Math.abs(x - b[i][0]) < 0.02 && Math.abs(y - b[i][1]) < 0.02);

test('points become a tight px box and relative points, and come back exactly', () => {
  const needle = [[100, 20], [104, 80], [96, 80]];       // a tapered pointer
  const part = partFrom(needle);
  assert.deepEqual(part._children.Layout, {
    x: 96, y: 20, width: 8, height: 60,
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top',
  });
  assert.deepEqual(part.meta.vectorPoints, [[0.5, 0], [1, 1], [0, 1]]);
  assert.equal(part.meta.closed, true);
  assert.ok(isPathPart(part));
  assert.ok(near(pathPointsInArtboard(part, 400, 200), needle));
});

test('an open run along one line keeps a 1px box centred on it', () => {
  const part = partFrom([[10, 50], [90, 50]], false);
  assert.deepEqual([part._children.Layout.y, part._children.Layout.height], [49.5, 1]);
  assert.ok(near(pathPointsInArtboard(part, 200, 100), [[10, 50], [90, 50]]), 'the points are still on the line');
  assert.equal(part.meta.closed, false);
});

test('it scales with its box, like a built-in polygon', () => {
  const part = partFrom([[0, 0], [100, 0], [50, 100]]);
  const doubled = applied(part, { 'Layout.width': 200, 'Layout.height': 200 });
  assert.ok(near(pathPointsInArtboard(doubled, 400, 400), [[0, 0], [200, 0], [100, 200]]));
  const percent = { ...part, _children: { Layout: { ...part._children.Layout, width: 50, widthUnit: 'percent' } } };
  assert.ok(near(pathPointsInArtboard(percent, 400, 400), [[0, 0], [200, 0], [100, 100]]), 'whatever units the box ends up in');
});

test('moving a point re-fits the box, and the other points stay where they were on the artboard', () => {
  const part = partFrom([[10, 10], [50, 10], [30, 40]]);
  const moved = applied(part, movePathPoint(part, 2, { x: 30, y: 90 }, 200, 200));
  assert.deepEqual([moved._children.Layout.height, moved._children.Layout.y], [80, 10]);
  assert.ok(near(pathPointsInArtboard(moved, 200, 200), [[10, 10], [50, 10], [30, 90]]));
});

test('removing and inserting points, never below the minimum for the shape', () => {
  const triangle = partFrom([[0, 0], [40, 0], [20, 30]]);
  assert.equal(removePathPoint(triangle, 0, 100, 100), null, 'a closed shape keeps three points');
  const square = partFrom([[0, 0], [40, 0], [40, 40], [0, 40]]);
  const fewer = applied(square, removePathPoint(square, 3, 100, 100));
  assert.equal(pathVectorPoints(fewer).length, 3);
  const nearest = nearestPathSegment(square, { x: 20, y: 42 }, 100, 100);
  assert.deepEqual([nearest.index, Math.round(nearest.x), Math.round(nearest.y)], [2, 20, 40], 'the bottom edge, at the click');
  const more = applied(square, insertPathPoint(square, nearest.index, nearest, 100, 100));
  assert.ok(near(pathPointsInArtboard(more, 100, 100), [[0, 0], [40, 0], [40, 40], [20, 40], [0, 40]]));
  const closedWraps = nearestPathSegment(square, { x: -2, y: 20 }, 100, 100);
  assert.equal(closedWraps.index, 3, 'a closed shape has an edge from its last point back to its first');
  const open = partFrom([[0, 0], [40, 0], [40, 40], [0, 40]], false);
  assert.notEqual(nearestPathSegment(open, { x: -2, y: 20 }, 100, 100).index, 3, 'an open one does not');
});

test('what a Pen click does', () => {
  const r = 6;
  assert.equal(penClickAction([], { x: 5, y: 5 }, r).action, 'add');
  const three = [[0, 0], [50, 0], [50, 50]];
  assert.equal(penClickAction(three, { x: 2, y: 1 }, r).action, 'close', 'the first point closes the shape');
  assert.equal(penClickAction(three, { x: 50, y: 52 }, r).action, 'finish', 'the last point again finishes it open');
  assert.equal(penClickAction([[0, 0], [50, 0]], { x: 1, y: 1 }, r).action, 'add', 'two points cannot close');
  assert.equal(penClickAction([[0, 0]], { x: 1, y: 1 }, r).action, 'ignore', 'a double-click on the first point adds nothing');
  assert.equal(penClickAction(three, { x: 25, y: 25 }, r).action, 'add');
});

test('Shift keeps a segment to 45° steps', () => {
  const p = constrainTo45({ x: 0, y: 0 }, { x: 100, y: 8 });
  assert.deepEqual([Math.round(p.x), Math.round(p.y)], [100, 0]);
  const d = constrainTo45({ x: 0, y: 0 }, { x: 50, y: 46 });
  assert.equal(Math.round(d.x), Math.round(d.y), 'a diagonal');
});

test('points that are not numbers are dropped, not drawn at NaN', () => {
  const part = { kind: 'path', meta: { vectorPoints: [[0, 0], ['x', 1], [1, 2], null] } };
  assert.deepEqual(pathVectorPoints(part), [[0, 0], [1, 1]]);
  assert.equal(pathVectorPoints({ kind: 'path', meta: { vectorPoints: [[0, 0]] } }), null, 'one point is not a shape');
  assert.equal(pathVectorPoints({ kind: 'triangle' }), null);
  assert.deepEqual(Object.keys(pathPatchFromPoints([[0, 0], [10, 10]], false)).sort().slice(0, 3), ['Layout.anchorX', 'Layout.anchorY', 'Layout.height']);
  assert.deepEqual(pathGeometryFromPoints([[5, 5], [5, 5]]).layout, { x: 4.5, y: 4.5, width: 1, height: 1 });
});
