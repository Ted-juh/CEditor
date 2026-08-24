// shapePrimitives.js — the placeable Shape component's path.
//
// A Background can already be a rectangle and, with a corner radius past half its width, a stadium.
// What it cannot be is an ellipse at an arbitrary aspect ratio, a line at an angle, or a polygon —
// and those are the shapes somebody means when they say "shape". Those need a path, which is this.
//
// THE POLYGONS ARE NOT REDEFINED HERE. `shapeGeometry.js` already holds twelve of them as
// normalized vertex lists — triangle, diamond, pentagon, hexagon, star, chevron, arrow, plus and
// the rest — because the custom-component designer's draw tools and palette glyphs needed them
// first. A second table would be twelve shapes that can drift from the twelve in the palette, and
// the placeable Shape gets all of them for free by reading that one.
//
// EVERY SHAPE FILLS ITS BOX. Resizing the control is how the shape is drawn: an ellipse in an
// oblong box is an oblong ellipse, and a line runs corner to corner. That is why there is no angle
// field on a line and no radius on a circle — they would be a second way to say what the box
// already says, and two ways to say one thing is two ways to disagree.
//
// PURE, and no DOM: the renderer prints the string, the tests read it.

import { POLYGON_SHAPE_KINDS, polygonPoints } from './shapeGeometry.js';

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** The two kinds that are not polygons, plus the polygon library. `rectangle` is the fallback. */
export const SHAPE_KINDS = ['rectangle', 'ellipse', 'line', ...POLYGON_SHAPE_KINDS];

export function shapeConfig(control) {
  return control?._children?.Shape ?? {};
}

export function shapeKind(config) {
  const kind = String(config?.kind ?? 'rectangle').toLowerCase();
  return SHAPE_KINDS.includes(kind) ? kind : 'rectangle';
}

/** Round a coordinate. A path with sixteen decimal places is unreadable and no more accurate. */
const r = (n) => Math.round(n * 100) / 100;

function pathFromPoints(points) {
  if (!points?.length) return '';
  return `M ${points[0][0]} ${points[0][1]} ${points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ')} Z`;
}

/**
 * The path for a shape in a box.
 *
 * The stroke width is subtracted and the path inset by half of it, so a stroked shape sits INSIDE
 * its own bounds. Without that a control with a 4px stroke paints two pixels outside the box,
 * overlaps whatever is beside it, and makes alignment lie.
 */
export function shapePath(config, width, height) {
  const kind = shapeKind(config);
  const stroke = config?.strokeEnabled === false ? 0 : Math.max(0, num(config?.strokeWidth, 1));
  const inset = stroke / 2;

  const w = Math.max(0.1, num(width, 0) - stroke);
  const h = Math.max(0.1, num(height, 0) - stroke);
  const x = inset;
  const y = inset;

  const polygon = polygonPoints(kind);
  if (polygon) {
    return pathFromPoints(polygon.map(([px, py]) => [r(x + px * w), r(y + py * h)]));
  }

  if (kind === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    // Two arcs rather than one: a single 360° arc starts and ends at the same point, and most
    // renderers draw nothing at all for it.
    return `M ${r(cx - rx)} ${r(cy)} `
      + `A ${r(rx)} ${r(ry)} 0 1 0 ${r(cx + rx)} ${r(cy)} `
      + `A ${r(rx)} ${r(ry)} 0 1 0 ${r(cx - rx)} ${r(cy)} Z`;
  }

  if (kind === 'line') {
    // Corner to corner, so dragging the box is how the line is aimed.
    return `M ${r(x)} ${r(y)} L ${r(x + w)} ${r(y + h)}`;
  }

  // A radius past half the smaller side folds the corners into each other, so it is clamped rather
  // than trusted.
  const radius = clamp(num(config?.cornerRadius, 0), 0, Math.min(w, h) / 2);
  if (radius <= 0) {
    return `M ${r(x)} ${r(y)} L ${r(x + w)} ${r(y)} L ${r(x + w)} ${r(y + h)} L ${r(x)} ${r(y + h)} Z`;
  }
  return `M ${r(x + radius)} ${r(y)} `
    + `L ${r(x + w - radius)} ${r(y)} A ${r(radius)} ${r(radius)} 0 0 1 ${r(x + w)} ${r(y + radius)} `
    + `L ${r(x + w)} ${r(y + h - radius)} A ${r(radius)} ${r(radius)} 0 0 1 ${r(x + w - radius)} ${r(y + h)} `
    + `L ${r(x + radius)} ${r(y + h)} A ${r(radius)} ${r(radius)} 0 0 1 ${r(x)} ${r(y + h - radius)} `
    + `L ${r(x)} ${r(y + radius)} A ${r(radius)} ${r(radius)} 0 0 1 ${r(x + radius)} ${r(y)} Z`;
}

/**
 * The dash pattern, or null for a solid stroke.
 *
 * A dotted stroke is a zero-length dash with a round cap — the only way to get actual dots rather
 * than very short dashes. It needs that cap, so `shapeNeedsRoundCap` says so rather than leaving
 * the renderer to work it out.
 */
export function shapeStrokeDash(config) {
  const style = String(config?.strokeStyle ?? 'solid');
  const width = Math.max(0.1, num(config?.strokeWidth, 1));
  const gap = Math.max(1, num(config?.strokeDash, 6));
  if (style === 'dashed') return `${gap} ${Math.max(1, gap * 0.6)}`;
  if (style === 'dotted') return `0.01 ${Math.max(1, width * 2)}`;
  return null;
}

export function shapeNeedsRoundCap(config) {
  return String(config?.strokeStyle ?? 'solid') === 'dotted';
}

/** A line has no interior, so filling it would paint the triangle between its ends. */
export function shapeTakesFill(config) {
  return shapeKind(config) !== 'line' && config?.fillEnabled !== false;
}
