// psdVectors.js — Photoshop's vector shapes, for the Photoshop component import.
//
// A shape layer (Photoshop's Rectangle, Ellipse, Polygon, Pen) is a path filled with a colour or a
// gradient and maybe stroked; a vector mask on a pixel layer is a path that cuts it. ag-psd reads the
// paths as knots in document pixels: each `[inX, inY, x, y, outX, outY]`, the control point coming
// in, the anchor and the control point going out. The paths of one shape are combined in order by
// their operation (combine, subtract, intersect, exclude), as Photoshop's path operations do: with
// Paper.js when it is loaded, otherwise as one even-odd outline, which is the same for the usual
// shape with holes.

import { gradientRamp, psdRgb } from './psdAdjustments.js';

const f = (v) => Number(Number(v).toFixed(3));

/** One path's knots as SVG path data, in document pixels. */
export function knotsPathData(path) {
  const knots = path?.knots ?? [];
  if (knots.length < 2) return '';
  const p = (k, i) => `${f(k.points[i])} ${f(k.points[i + 1])}`;
  let d = `M${p(knots[0], 2)}`;
  for (let i = 1; i < knots.length; i += 1) d += ` C${p(knots[i - 1], 4)} ${p(knots[i], 0)} ${p(knots[i], 2)}`;
  if (!path.open) d += ` C${p(knots[knots.length - 1], 4)} ${p(knots[0], 0)} ${p(knots[0], 2)} Z`;
  return d;
}

/**
 * A shape's paths as one outline, `{ d, fillRule }` in document pixels, or null. `everything` is the
 * document as a rectangle, for a vector mask that starts with all pixels shown.
 */
export function combinedPathData(vectorMask, { geometry = null, everything = null } = {}) {
  const paths = (vectorMask?.paths ?? []).filter((path) => (path.knots ?? []).length >= 2);
  const startsFull = vectorMask?.fillStartsWithAllPixels === true && everything;
  if (!paths.length) return startsFull ? { d: everything, fillRule: 'nonzero' } : null;
  if (!geometry) {
    const d = [startsFull ? everything : '', ...paths.map(knotsPathData)].filter(Boolean).join(' ');
    return { d, fillRule: 'evenodd' };
  }
  const { scope } = geometry;
  const shape = (d) => new scope.CompoundPath({ pathData: d, insert: false });
  let result = startsFull ? shape(everything) : null;
  for (const path of paths) {
    const next = shape(knotsPathData(path));
    if (!result) { result = path.operation === 'subtract' && !startsFull ? null : next; continue; }
    switch (path.operation) {
      case 'subtract': result = result.subtract(next, { insert: false }); break;
      case 'intersect': result = result.intersect(next, { insert: false }); break;
      case 'exclude': result = result.exclude(next, { insert: false }); break;
      default: result = result.unite(next, { insert: false });
    }
  }
  return result && result.pathData ? { d: result.pathData, fillRule: 'nonzero' } : null;
}

const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const argb = (rgb, alpha = 1) => `${hex2(alpha * 255)}${rgb.map(hex2).join('')}`.toUpperCase();

export { stopScale } from './psdAdjustments.js';

/**
 * A gradient's or pattern's Scale as a fraction: ag-psd gives 1 for 100% (it was read as a percent,
 * which drew every gradient at a hundredth of its size); a percent, if given as one, still reads.
 */
export function scaleOf(value) {
  const v = Number(value);
  if (!(v > 0)) return 1;
  return v > 20 ? v / 100 : v;
}

/**
 * Where on a gradient each document pixel is (0..1), as Photoshop lays it over `box` ({ x, y, width,
 * height }: the layer's, or the document's where the gradient is not aligned with the layer): from the
 * box's centre (moved by its offset, a fraction of the box, as ag-psd reads it), at its angle; a Linear one from one edge
 * of the box to the other along that angle, the others reaching half that, all times the scale.
 * Photoshop works it at whole pixel coordinates. Measured on psd-tools' files, Linear, Radial and Angle
 * within its dither; Reflected and Diamond a degree or so off where it snaps the line to pixels.
 */
export function gradientField(content, box) {
  const angle = Number(content?.angle ?? 90) || 0;
  const theta = (angle * Math.PI) / 180;
  const ux = Math.cos(theta);
  const uy = -Math.sin(theta);
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  const cx = box.x + width / 2 + (Number(content?.offset?.x) || 0) * width;
  const cy = box.y + height / 2 + (Number(content?.offset?.y) || 0) * height;
  const edge = Math.min(Math.abs(ux) > 1e-9 ? width / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? height / Math.abs(uy) : Infinity);
  const length = Math.max(1e-6, edge * scaleOf(content?.scale));
  const style = String(content?.style ?? content?.type ?? 'linear');
  const reverse = Boolean(content?.reverse);
  return (x, y) => {
    const px = x - cx;
    const py = y - cy;
    const along = px * ux + py * uy;
    let u;
    if (style === 'reflected') u = Math.abs(along) / (length / 2);
    else if (style === 'radial') u = Math.hypot(px, py) / (length / 2);
    else if (style === 'diamond') u = (Math.abs(along) + Math.abs(-px * uy + py * ux)) / (length / 2);
    else if (style === 'angle') u = ((((theta - Math.atan2(-py, px)) / (2 * Math.PI)) % 1) + 1) % 1;
    else u = along / length + 0.5;
    u = Math.max(0, Math.min(1, u));
    return reverse ? 1 - u : u;
  };
}

/**
 * Photoshop's gradient as the fill's own gradient, which CEditor draws (utils/gradientCSS.js) over a
 * shape `box` wide and high: its ramp sampled into stops (CEditor joins stops by straight lines, so
 * Photoshop's midpoints, Smoothness and interpolation come through), placed on CEditor's axis where
 * Photoshop's lie. Linear and Reflected on a linear gradient, Radial on a radial one, Angle on a conic
 * one; null for a Diamond, which CEditor has no gradient for (the importer draws it as a picture).
 */
export function psdGradient(content, box = { width: 100, height: 100 }) {
  const colours = content?.colorStops ?? [];
  if (colours.length < 1) return null;
  const style = String(content.style ?? content.type ?? 'linear');
  if (style === 'diamond') return null;
  const ramp = gradientRamp(content);
  const reverse = Boolean(content.reverse);
  const width = Math.max(1, box.width ?? 100);
  const height = Math.max(1, box.height ?? 100);
  const angle = Number(content.angle ?? 90) || 0;
  const theta = (angle * Math.PI) / 180;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const edge = Math.min(Math.abs(ux) > 1e-9 ? width / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? height / Math.abs(uy) : Infinity);
  const length = edge * scaleOf(content.scale);
  const SAMPLES = 24;
  const stopAt = (u, position) => {
    const [r, g, b, a] = ramp(reverse ? 1 - u : u);
    return { color: argb([r, g, b], a), position: Math.round(position * 1000) / 10 };
  };
  if (style === 'radial') {
    const reachX = (100 * (length / 2)) / width;
    const reachY = (100 * (length / 2)) / height;
    const stops = Array.from({ length: SAMPLES + 1 }, (_, i) => stopAt(i / SAMPLES, i / SAMPLES));
    return { type: 'radial', centerX: 50, centerY: 50, radiusX: Math.round(reachX * 100) / 100, radiusY: Math.round(reachY * 100) / 100, edge: 0, stops };
  }
  // CSS angles run clockwise from the top, Photoshop's counter-clockwise from the right.
  const cssAngle = ((90 - angle) % 360 + 360) % 360;
  if (style === 'angle') {
    const stops = Array.from({ length: SAMPLES + 1 }, (_, i) => stopAt(i / SAMPLES, i / SAMPLES));
    return { type: 'conical', angle: cssAngle, centerX: 50, centerY: 50, edge: 0, stops };
  }
  // CSS's line is as long as the box is across the angle; Photoshop's from edge to edge. A point
  // `u` of Photoshop's (0..1 across its line) is at CSS position 0.5 + (u − 0.5)·length / cssLength.
  const cssLength = Math.abs(width * ux) + Math.abs(height * uy) || 1;
  const stops = [];
  const at = (p) => 0.5 + ((p - 0.5) * length) / cssLength;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const p = i / SAMPLES;
    const u = style === 'reflected' ? Math.abs(2 * p - 1) : p;
    stops.push(stopAt(u, at(p)));
  }
  // Past Photoshop's line its end colours hold, as CSS holds its end stops.
  return { type: 'linear', angle: cssAngle, edge: 0, stops };
}

/** A shape layer's fill: `{ colour, gradient }`, or null for a pattern (drawn as its picture). */
export function vectorFillOf(content, box) {
  if (!content) return { colour: '00000000', gradient: null };
  if (content.type === 'color') return { colour: argb(psdRgb(content.color)), gradient: null };
  // A pattern, and a gradient laid over the document rather than the shape, are drawn as pictures.
  if (content.type === 'pattern' || content.align === false) return null;
  const gradient = psdGradient(content, box);
  return gradient ? { colour: '00000000', gradient } : null;
}

/** A shape layer's stroke: `{ colour, width, gradient }`, or null. */
export function vectorStrokeOf(stroke, box) {
  if (!stroke || stroke.strokeEnabled === false) return null;
  const width = Number(stroke.lineWidth?.value ?? 1);
  if (!(width > 0)) return null;
  const content = stroke.content;
  const alpha = stroke.opacity ?? 1;
  if (content?.type === 'color') return { colour: argb(psdRgb(content.color), alpha), width, gradient: null };
  const gradient = psdGradient(content, box);
  return { colour: gradient?.stops?.[0]?.color ?? 'FF000000', width, gradient };
}
