// penPath.js — custom vector shapes for component parts: the Pen tool's geometry.
//
// The designer already draws boxes, ellipses, rings, arcs, lines and eleven fixed polygons. What
// it could not draw is a shape of your own — a tapered knob pointer, a notch, a logo mark — because
// every polygon's outline was fixed in shapeGeometry.js. A `path` part carries its own outline:
//
//   kind              'path'
//   meta.vectorPoints [[x, y], ...] in 0..1 of the part's box, y downward — the same scheme the
//                     built-in polygons use, so it scales with the part like they do
//   meta.closed       true: a filled polygon; false: an open polyline, stroked
//
// The part's box is always the tight bounding box of its points, in px, anchored top-left. Points
// are placed and edited in artboard coordinates and converted here, so the Pen and the vertex
// handles never do box arithmetic of their own.

import { partFrame } from './customDesignSurfaceGeometry.js';
import { numberOr } from './primitives.js';

export const PATH_KIND = 'path';
export const MIN_CLOSED_POINTS = 3;
export const MIN_OPEN_POINTS = 2;
/** How near, in screen pixels, a click must land on a point to count as clicking it. */
export const POINT_HIT_RADIUS = 6;

export function isPathPart(part) {
  return String(part?.kind ?? '') === PATH_KIND && Array.isArray(part?.meta?.vectorPoints);
}

/** The part's points, validated: finite, clamped to 0..1, or null if there are too few. */
export function pathVectorPoints(part) {
  if (String(part?.kind ?? '') !== PATH_KIND) return null;
  const raw = Array.isArray(part?.meta?.vectorPoints) ? part.meta.vectorPoints : [];
  const points = raw
    .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map(([x, y]) => [Math.max(0, Math.min(1, Number(x))), Math.max(0, Math.min(1, Number(y)))]);
  return points.length >= MIN_OPEN_POINTS ? points : null;
}

export function pathIsClosed(part) {
  return part?.meta?.closed !== false;
}

const round = (value) => Math.round(value * 100) / 100;

/**
 * Artboard points → the part's box and its relative points. The box is the points' bounding box;
 * a flat run (every point on one line) gets a 1px thickness so it still has a box, and its points
 * sit on the line through the middle of it.
 */
export function pathGeometryFromPoints(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const width = Math.max(1, spanX);
  const height = Math.max(1, spanY);
  const unit = (value) => Math.round(value * 1e4) / 1e4;
  const vectorPoints = points.map(([x, y]) => [
    spanX > 0 ? unit((x - minX) / spanX) : 0.5,
    spanY > 0 ? unit((y - minY) / spanY) : 0.5,
  ]);
  return {
    // A flat run's 1px box is centred on the line, so its points (at 0.5) land exactly on it.
    layout: {
      x: round(spanX > 0 ? minX : minX - 0.5),
      y: round(spanY > 0 ? minY : minY - 0.5),
      width: round(width),
      height: round(height),
    },
    vectorPoints,
  };
}

/** The part's points in artboard coordinates, wherever and however its box is laid out. */
export function pathPointsInArtboard(part, artboardWidth, artboardHeight) {
  const points = pathVectorPoints(part);
  if (!points) return [];
  const frame = partFrame(part, artboardWidth, artboardHeight);
  return points.map(([x, y]) => [frame.left + x * frame.width, frame.top + y * frame.height]);
}

/** The Layout patch that puts a path part's box where `layout` says, in px from the top-left. */
function layoutPatch(layout) {
  return {
    'Layout.x': layout.x,
    'Layout.y': layout.y,
    'Layout.width': layout.width,
    'Layout.height': layout.height,
    'Layout.xUnit': 'px',
    'Layout.yUnit': 'px',
    'Layout.widthUnit': 'px',
    'Layout.heightUnit': 'px',
    'Layout.anchorX': 'left',
    'Layout.anchorY': 'top',
    'Layout.offsetX': 0,
    'Layout.offsetY': 0,
  };
}

/** A part patch (paths relative to the part) that reshapes it to these artboard points. */
export function pathPatchFromPoints(points, closed) {
  const { layout, vectorPoints } = pathGeometryFromPoints(points);
  return { ...layoutPatch(layout), 'meta.vectorPoints': vectorPoints, 'meta.closed': closed !== false };
}

/** Move one point to an artboard position. */
export function movePathPoint(part, index, point, artboardWidth, artboardHeight) {
  const points = pathPointsInArtboard(part, artboardWidth, artboardHeight);
  if (!points[index]) return null;
  points[index] = [point.x, point.y];
  return pathPatchFromPoints(points, pathIsClosed(part));
}

/** Remove one point, unless that would leave too few for the shape to exist. */
export function removePathPoint(part, index, artboardWidth, artboardHeight) {
  const points = pathPointsInArtboard(part, artboardWidth, artboardHeight);
  const closed = pathIsClosed(part);
  if (!points[index] || points.length - 1 < (closed ? MIN_CLOSED_POINTS : MIN_OPEN_POINTS)) return null;
  points.splice(index, 1);
  return pathPatchFromPoints(points, closed);
}

/** Add a point on the segment after `index` (for a closed path the last segment wraps round). */
export function insertPathPoint(part, index, point, artboardWidth, artboardHeight) {
  const points = pathPointsInArtboard(part, artboardWidth, artboardHeight);
  if (!points[index]) return null;
  points.splice(index + 1, 0, [point.x, point.y]);
  return pathPatchFromPoints(points, pathIsClosed(part));
}

/**
 * Where on the path's outline is nearest to `point`: the segment (by its first point's index), the
 * spot on it, and the distance — so a double-click on an edge can put a new point exactly there.
 */
export function nearestPathSegment(part, point, artboardWidth, artboardHeight) {
  const points = pathPointsInArtboard(part, artboardWidth, artboardHeight);
  const count = pathIsClosed(part) ? points.length : points.length - 1;
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSq)) : 0;
    const x = ax + t * dx;
    const y = ay + t * dy;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (!best || distance < best.distance) best = { index: i, x, y, distance };
  }
  return best;
}

/** The index of the point within `radius` of `point`, nearest first, or -1. */
export function pointNear(points, point, radius) {
  let found = -1;
  let bestDistance = Infinity;
  points.forEach(([x, y], index) => {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= radius && distance < bestDistance) { found = index; bestDistance = distance; }
  });
  return found;
}

/**
 * What a click does to a Pen drawing in progress. `radius` is POINT_HIT_RADIUS in artboard units.
 *   { action: 'add' }               a new point
 *   { action: 'close' }             on the first point, with enough points: finish, filled
 *   { action: 'finish' }            on the last point again (a double-click does this): finish open
 */
export function penClickAction(draftPoints, point, radius) {
  const count = draftPoints.length;
  if (count >= MIN_CLOSED_POINTS && pointNear([draftPoints[0]], point, radius) === 0) return { action: 'close' };
  if (count >= MIN_OPEN_POINTS && pointNear([draftPoints[count - 1]], point, radius) === 0) return { action: 'finish' };
  if (count >= 1 && pointNear([draftPoints[count - 1]], point, radius) === 0) return { action: 'ignore' };
  return { action: 'add' };
}

/** Shift held: the new point snaps to the nearest 45° from the previous one, as in every pen tool. */
export function constrainTo45(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...to };
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/** The new part's own fields for a finished Pen drawing (the caller names it and adds sections). */
export function pathPartSpec(points, closed) {
  const { layout, vectorPoints } = pathGeometryFromPoints(points);
  return {
    kind: PATH_KIND,
    layout: {
      ...layout,
      xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top',
    },
    meta: { vectorPoints, closed: closed !== false },
  };
}

/** Artboard size, clamped: a point may not be placed off the artboard. */
export function clampToArtboard(point, artboardWidth, artboardHeight) {
  return {
    x: Math.max(0, Math.min(numberOr(artboardWidth, 0), point.x)),
    y: Math.max(0, Math.min(numberOr(artboardHeight, 0), point.y)),
  };
}
