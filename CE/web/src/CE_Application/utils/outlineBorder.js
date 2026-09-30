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
  if (!settings) return { solid: false, gradient: null, image: null, overlay: null };
  return {
    solid: settings.fillSolid !== false,
    gradient: settings.fillGradient && settings.gradient ? settings.gradient : null,
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
