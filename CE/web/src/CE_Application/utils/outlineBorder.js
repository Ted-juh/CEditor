/**
 * outlineBorder.js — a part's Border, drawn along an arbitrary outline instead of a box's four sides.
 *
 * BackgroundRenderer draws a box border as side and corner segments. A combined shape (booleanGroups.js)
 * or a flattened path has no sides, so its border is described here as BANDS: the ring of the shape
 * lying between two depths measured inward from the outline. That is what a box border is too — CSS
 * draws it inside the box — so every border style carries over by the same arithmetic the box uses
 * (utils/strokeResolver.js):
 *
 *   solid, dashed        one band [0, t], the dashes laid along the outline
 *   groove, ridge        two half bands, the outer darker (groove) or lighter (ridge)
 *   inset, outset        one band, shaded by which way the edge faces: edges facing up and left are
 *                        the dark ones for inset (a box's top and left sides), the light ones for outset
 *   dotted               round dots of the border's dot radius, centred one radius in, on the outline
 *                        pulled inward by that radius (computed with the outline: `insetDepths`)
 *   double               the same border again, `doubleGap` further in (as a box draws its inner ring)
 *
 * A border set per side has no sides to go to on an outline; the thickest enabled side is used.
 * A fill layer clipped "inside the border" (`<layer>ClipMode: 'border-inner'`) is clipped by the
 * outline pulled in by the border's full depth.
 */
import { resolveStroke } from './strokeResolver.js';

/** The border settings that apply to an outline, or null when it draws none. */
export function outlineBorderSettings(border) {
  if (!border?.enabled) return null;
  if (border.linked) return (border.thickness ?? 0) > 0 && border.style !== 'none' ? border : null;
  const sides = ['top', 'right', 'bottom', 'left']
    .map((side) => border[side])
    .filter((side) => side && side.style !== 'none' && (side.thickness ?? 0) > 0);
  if (!sides.length) return null;
  return { ...border, ...sides.sort((a, b) => (b.thickness ?? 0) - (a.thickness ?? 0))[0], linked: true };
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * The bands to paint for a border along an outline:
 *   [{ from, to, colour, dasharray, linecap, facing: 'upLeft' | 'downRight' | null, dots: { radius, gap } | null }]
 * `from` / `to` are depths inward from the outline; a dotted band carries `dots` and is drawn on the
 * outline inset by `dots.depth` instead.
 */
export function outlineBorderBands(border) {
  const settings = outlineBorderSettings(border);
  if (!settings) return [];
  const thickness = Math.max(0, Number(settings.thickness) || 2);
  const style = settings.style ?? 'solid';
  const colour = `#${String(settings.colour ?? 'FFFFFFFF').slice(-6)}`;
  const dotRadius = settings.dotRadius || 2;
  const rings = [0];
  if (style === 'double') rings.push(settings.doubleGap ?? 2);

  const bands = [];
  for (const ringOffset of rings) {
    if (style === 'dotted') {
      const resolved = resolveStroke('dotted', thickness, colour, 'top', dotRadius);
      const layer = resolved.layers[0];
      const radius = layer.thick / 2;
      bands.push({
        from: ringOffset,
        to: ringOffset + layer.thick,
        colour,
        dasharray: layer.dasharray,
        linecap: 'round',
        facing: null,
        dots: { radius, depth: round3(ringOffset + radius) },
      });
      continue;
    }
    if (style === 'inset' || style === 'outset') {
      const upLeft = resolveStroke(style, thickness, colour, 'top', dotRadius).layers[0];
      const downRight = resolveStroke(style, thickness, colour, 'bottom', dotRadius).layers[0];
      bands.push({ from: ringOffset, to: ringOffset + thickness, colour: upLeft.colour, dasharray: 'none', linecap: 'butt', facing: 'upLeft', dots: null });
      bands.push({ from: ringOffset, to: ringOffset + thickness, colour: downRight.colour, dasharray: 'none', linecap: 'butt', facing: 'downRight', dots: null });
      continue;
    }
    const resolved = resolveStroke(style === 'double' ? 'solid' : style, thickness, colour, 'top', dotRadius);
    const centre = resolved.totalThick / 2;
    for (const layer of resolved.layers) {
      // A layer's offset is from the band's centreline, negative outward (strokeResolver's convention).
      const middle = centre + layer.offset;
      bands.push({
        from: ringOffset + Math.max(0, middle - layer.thick / 2),
        to: ringOffset + middle + layer.thick / 2,
        colour: layer.colour,
        dasharray: layer.dasharray,
        linecap: layer.linecap || 'butt',
        facing: null,
        dots: null,
      });
    }
  }
  return bands;
}

/** How far in a border reaches (the depth a 'border-inner' fill is clipped at). */
export function outlineBorderDepth(border) {
  const bands = outlineBorderBands(border);
  return bands.reduce((depth, band) => Math.max(depth, band.to), 0);
}

/** Border paint flags, as the box border reads them from its settings. */
export function outlineBorderPaints(border) {
  const settings = outlineBorderSettings(border);
  if (!settings) return { solid: false, gradient: null, flow: 'across', image: null, overlay: null };
  return {
    solid: settings.fillSolid !== false,
    gradient: settings.fillGradient && settings.gradient ? settings.gradient : null,
    // 'across' — straight across the shape at the gradient's angle; 'follow' — along the outline.
    flow: settings.gradientFlow === 'follow' ? 'follow' : 'across',
    image: settings.fillImage && settings.imageSrc ? settings.imageSrc : null,
    overlay: settings.fillOverlay && settings.overlaySrc ? settings.overlaySrc : null,
  };
}

/**
 * Every inward offset of the outline a renderer needs for this background: dotted borders' dot lines,
 * and the inner clip of fill layers set to stay inside the border.
 */
export function outlineInsetDepths(background) {
  const border = background?._children?.Border;
  const fill = background?._children?.Fill;
  const depths = new Set();
  for (const band of outlineBorderBands(border)) if (band.dots) depths.add(band.dots.depth);
  const inner = outlineBorderDepth(border);
  if (inner > 0 && ['solid', 'gradient', 'image', 'overlay'].some((layer) => fill?.[`${layer}ClipMode`] === 'border-inner')) {
    depths.add(round3(inner));
  }
  return [...depths].sort((a, b) => a - b);
}

// --- A gradient that follows the outline -----------------------------------------------------------
//
// A box border's gradient can flow ALONG the border ("follow": top, right, bottom, left, clockwise
// from the top-left corner). An outline has no sides, but it has contours, and the same rule reads
// on them: each contour starts at its top-left-most point and runs clockwise, and the gradient
// runs from 0 at the start to 1 back at it. The renderer samples the outline's path (the browser's
// own path geometry) and draws short stroked pieces coloured by where they fall.

/**
 * Split sampled points into contours (a jump longer than `gap` starts a new one), orient each as the
 * box border runs, and return pieces `{ x1, y1, x2, y2, t }` with `t` in 0..1 along the contour.
 */
export function outlineFlowPieces(points, gap) {
  const contours = [];
  let current = [];
  for (const point of points) {
    const last = current[current.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) > gap) {
      contours.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) contours.push(current);

  const pieces = [];
  for (let ring of contours) {
    if (ring.length < 3) continue;
    // Clockwise on screen (y down) is a positive shoelace sum.
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) ring = [...ring].reverse();
    let start = 0;
    for (let i = 1; i < ring.length; i += 1) {
      if (ring[i].x + ring[i].y < ring[start].x + ring[start].y - 1e-9) start = i;
    }
    ring = [...ring.slice(start), ...ring.slice(0, start)];
    const lengths = [0];
    for (let i = 1; i <= ring.length; i += 1) {
      const a = ring[i - 1];
      const b = ring[i % ring.length];
      lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = lengths[ring.length] || 1;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: (lengths[i] + lengths[i + 1]) / 2 / total });
    }
  }
  return pieces;
}

/** The colour of sorted stops `[{ position: 0..100, color: 'RRGGBB' }]` at `t` in 0..1, as `#RRGGBB`. */
export function stopsColourAt(stops, t) {
  if (!stops.length) return '#000000';
  const at = Math.max(0, Math.min(100, t * 100));
  let i = stops.findIndex((stop) => stop.position >= at);
  if (i <= 0) return `#${stops[i < 0 ? stops.length - 1 : 0].color}`;
  const a = stops[i - 1];
  const b = stops[i];
  const f = (at - a.position) / Math.max(1e-9, b.position - a.position);
  const channel = (hex, k) => parseInt(hex.slice(k, k + 2), 16);
  const mix = (k) => Math.round(channel(a.color, k) + (channel(b.color, k) - channel(a.color, k)) * f).toString(16).padStart(2, '0');
  return `#${mix(0)}${mix(2)}${mix(4)}`.toUpperCase();
}
