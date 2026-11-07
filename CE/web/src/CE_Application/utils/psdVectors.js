// psdVectors.js — Photoshop's vector shapes, for the Photoshop component import.
//
// A shape layer (Photoshop's Rectangle, Ellipse, Polygon, Pen) is a path filled with a colour or a
// gradient and maybe stroked; a vector mask on a pixel layer is a path that cuts it. ag-psd reads the
// paths as knots in document pixels: each `[inX, inY, x, y, outX, outY]`, the control point coming
// in, the anchor and the control point going out. The paths of one shape are combined in order by
// their operation (combine, subtract, intersect, exclude), as Photoshop's path operations do: with
// Paper.js when it is loaded, otherwise as one even-odd outline, which is the same for the usual
// shape with holes.

import { psdRgb } from './psdAdjustments.js';

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

/**
 * Where a gradient's stops run to: ag-psd gives them 0..1 (the file's 0..4096 divided out); 4096 for
 * stops given as the file writes them.
 */
export function stopScale(...lists) {
  return lists.flat().some((stop) => Number(stop?.location) > 1) ? 4096 : 1;
}

/**
 * A gradient's or pattern's Scale as a fraction: ag-psd gives 1 for 100% (it was read as a percent,
 * which drew every gradient at a hundredth of its size); a percent, if given as one, still reads.
 */
export function scaleOf(value) {
  const v = Number(value);
  if (!(v > 0)) return 1;
  return v > 20 ? v / 100 : v;
}

/** Photoshop's gradient (colour and opacity stops) as the fill's gradient. */
export function psdGradient(content) {
  const colours = [...(content?.colorStops ?? [])].sort((a, b) => a.location - b.location);
  if (colours.length < 2) return null;
  const opacities = [...(content?.opacityStops ?? [])].sort((a, b) => a.location - b.location);
  const scale = stopScale(colours, opacities);
  const opacityAt = (location) => {
    if (!opacities.length) return 1;
    if (location <= opacities[0].location) return opacities[0].opacity ?? 1;
    for (let i = 1; i < opacities.length; i += 1) {
      if (location <= opacities[i].location) {
        const k = (location - opacities[i - 1].location) / Math.max(1e-9, opacities[i].location - opacities[i - 1].location);
        return (opacities[i - 1].opacity ?? 1) + ((opacities[i].opacity ?? 1) - (opacities[i - 1].opacity ?? 1)) * k;
      }
    }
    return opacities[opacities.length - 1].opacity ?? 1;
  };
  let stops = colours.map((stop) => ({ color: argb(psdRgb(stop.color), opacityAt(stop.location)), position: Math.round((stop.location / scale) * 1000) / 10 }));
  if (content.reverse) stops = stops.map((stop) => ({ ...stop, position: Math.round((100 - stop.position) * 10) / 10 })).reverse();
  const style = String(content.style ?? content.type ?? 'linear');
  if (style === 'radial') {
    const reach = 50 * scaleOf(content.scale);
    return { type: 'radial', centerX: 50, centerY: 50, radiusX: reach, radiusY: reach, edge: 0, stops };
  }
  // Photoshop's angle runs counter-clockwise from the right; CSS's clockwise from the top.
  const angle = ((90 - (content.angle ?? 90)) % 360 + 360) % 360;
  return { type: 'linear', angle, edge: 0, stops };
}

/** A shape layer's fill: `{ colour, gradient }`, or null for a pattern (drawn as its picture). */
export function vectorFillOf(content) {
  if (!content) return { colour: '00000000', gradient: null };
  if (content.type === 'color') return { colour: argb(psdRgb(content.color)), gradient: null };
  if (content.type === 'pattern') return null;
  const gradient = psdGradient(content);
  return gradient ? { colour: '00000000', gradient } : null;
}

/** A shape layer's stroke: `{ colour, width, gradient }`, or null. */
export function vectorStrokeOf(stroke) {
  if (!stroke || stroke.strokeEnabled === false) return null;
  const width = Number(stroke.lineWidth?.value ?? 1);
  if (!(width > 0)) return null;
  const content = stroke.content;
  const alpha = stroke.opacity ?? 1;
  if (content?.type === 'color') return { colour: argb(psdRgb(content.color), alpha), width, gradient: null };
  const gradient = psdGradient(content);
  return { colour: gradient?.stops?.[0]?.color ?? 'FF000000', width, gradient };
}
