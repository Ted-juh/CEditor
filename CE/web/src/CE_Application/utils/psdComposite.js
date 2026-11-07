/**
 * psdComposite.js — Photoshop's layers flattened the way Photoshop flattens them, closely enough for
 * a panel background.
 *
 * What it draws:
 *
 *   - Every blend mode Photoshop has. The separable modes use Photoshop's own formulas, which match the
 *     W3C compositing spec except for Soft Light, where Photoshop's curve differs and is the one used.
 *     Hue, Saturation, Color and Luminosity use the spec's SetLum/SetSat, which is how Photoshop
 *     describes them. Dissolve is random by design: its grain here is a fixed noise of its own, as
 *     dense as Photoshop's, not Photoshop's pixels (reported).
 *   - Opacity and Fill opacity, a group's on everything inside it.
 *   - Knockout (Blending Options): where a knockout layer or group covers, what is under it gives way,
 *     by its opacity, to the backdrop its group began with (Shallow: clear in a group drawn on its own,
 *     what was under a Pass Through group) or to the Background layer (Deep: through Pass Through groups
 *     only, a group drawn on its own stopping it as Shallow; clear without a Background), and it is
 *     drawn there with its Fill opacity. A Fill of 0 cuts a hole.
 *   - Layer masks, from their own pixels, with the mask's default colour outside its rectangle and its
 *     density; vector masks, their paths filled and joined by their operations. A disabled mask is
 *     ignored, as Photoshop ignores it. (A shape layer's pixels are already its shape: its vector mask
 *     is not applied to them twice.)
 *   - Clipping masks: a clipped layer is drawn only where the layer it clips to is, and blends with
 *     that layer rather than with what lies under it (Photoshop's default, "Blend Clipped Layers as
 *     Group"). The base's shape clips, not its Fill: over a base at Fill 0% a clipped layer shows in
 *     full. What is clipped to an adjustment layer goes wherever that layer's masks let it.
 *   - Groups: Pass Through paints its layers straight onto what is below, and its opacity and mask
 *     say how far what is below goes toward that; any other mode, Normal included, composites the
 *     group on its own first and then blends the result, as Photoshop does, and so does Pass Through
 *     below 100% Fill. An artboard draws its background colour.
 *
 *   - A fill layer saved without pixels (a shape, a Color, Gradient or Pattern Fill): its colour,
 *     gradient (Photoshop's styles and angle, across the layer's box) or pattern (tiled from the
 *     document's corner, the pattern the file keeps) inside its vector mask.
 *   - Adjustment layers: what each does (utils/psdAdjustments.js) to everything under it in its group,
 *     or to the layer it is clipped to, by its opacity, its masks and its blend mode.
 *   - Layer styles, when the caller passes them (`styles`: utils/psdLayerStyles.js LAYER_STYLES, which
 *     draws with this module's blend modes and so cannot be imported here): Drop Shadows and Outer
 *     Glow cast under the layer, the rest drawn into it, from its shape. Close to Photoshop's, not its
 *     exact contours (reported).
 *
 * What it does not, and says so by layer name (`notDrawn`): an adjustment it has no formula for
 * (utils/psdAdjustments.js unappliedAdjustment says which), and layer styles when not given `styles`.
 *
 * Compositing is the W3C model, which is Photoshop's: the colour is blended with the backdrop first,
 * in proportion to the backdrop's coverage, and the result composited source-over:
 *
 *   Cs' = (1 - ab)·Cs + ab·B(Cb, Cs)
 *   ao  = as + ab·(1 - as)
 *   Co  = (as·Cs' + ab·Cb·(1 - as)) / ao
 *
 * Buffers are straight (not premultiplied) RGBA as Float32 0..1; the result is 8-bit RGBA.
 * Pure and canvas-free, so node tests it exactly as the editor runs it.
 */

import { adjustmentFunction, cmykToRgb, gradientRamp, inkPlaneColours, psdRgb, unappliedAdjustment } from './psdAdjustments.js';
import { gradientField } from './psdVectors.js';
import { blur } from './gaussianBlur.js';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const colorDodge = (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const colorBurn = (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const screen = (b, s) => b + s - b * s;
const hardLight = (b, s) => (s <= 0.5 ? b * 2 * s : screen(b, 2 * s - 1));

/** Separable modes: one channel at a time, backdrop `b`, source `s`. */
const SEPARABLE = {
  normal: (b, s) => s,
  darken: (b, s) => Math.min(b, s),
  multiply: (b, s) => b * s,
  'color burn': colorBurn,
  'linear burn': (b, s) => Math.max(0, b + s - 1),
  lighten: (b, s) => Math.max(b, s),
  screen,
  'color dodge': colorDodge,
  'linear dodge': (b, s) => Math.min(1, b + s),
  overlay: (b, s) => hardLight(s, b),
  // Photoshop's curve, not the W3C one: they differ in the light half.
  'soft light': (b, s) => (s <= 0.5 ? 2 * b * s + b * b * (1 - 2 * s) : 2 * b * (1 - s) + Math.sqrt(b) * (2 * s - 1)),
  'hard light': hardLight,
  // Inside Vivid Light the source's extremes win (0 burns to 0, 1 dodges to 1, whatever the backdrop),
  // where plain Color Burn and Dodge keep the backdrop's: pinned by psd-tools against Photoshop (#189).
  'vivid light': (b, s) => (s <= 0 ? 0 : s >= 1 ? 1 : s <= 0.5 ? 1 - Math.min(1, (1 - b) / (2 * s)) : Math.min(1, b / (2 * (1 - s)))),
  'linear light': (b, s) => clamp(b + 2 * s - 1),
  'pin light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  // On an exact tie (b + s = 1) Photoshop answers 1 only where the backdrop is above half (psd-tools).
  'hard mix': (b, s) => { const t = b + s; return t > 1 + 1e-7 || (Math.abs(t - 1) <= 1e-7 && b > 0.5) ? 1 : 0; },
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  subtract: (b, s) => Math.max(0, b - s),
  divide: (b, s) => (s <= 0 ? (b <= 0 ? 0 : 1) : Math.min(1, b / s)),
};

// --- the non-separable modes, after the W3C compositing spec ---------------------------------------

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

function clipColor(c) {
  const l = lum(c[0], c[1], c[2]);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  if (n < 0) for (let i = 0; i < 3; i += 1) c[i] = l + ((c[i] - l) * l) / (l - n);
  if (x > 1) for (let i = 0; i < 3; i += 1) c[i] = l + ((c[i] - l) * (1 - l)) / (x - l);
  return c;
}

function setLum(c, l) {
  const d = l - lum(c[0], c[1], c[2]);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function setSat(c, s) {
  const out = [0, 0, 0];
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [lo, mid, hi] = order;
  if (c[hi] > c[lo]) {
    out[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]);
    out[hi] = s;
  }
  return out;
}

/** Non-separable modes: whole colours, backdrop `cb`, source `cs`, each [r, g, b]. */
const NON_SEPARABLE = {
  hue: (cb, cs) => setLum(setSat(cs, sat(cb)), lum(cb[0], cb[1], cb[2])),
  saturation: (cb, cs) => setLum(setSat(cb, sat(cs)), lum(cb[0], cb[1], cb[2])),
  color: (cb, cs) => setLum(cs, lum(cb[0], cb[1], cb[2])),
  luminosity: (cb, cs) => setLum(cb, lum(cs[0], cs[1], cs[2])),
  'darker color': (cb, cs) => (lum(cs[0], cs[1], cs[2]) < lum(cb[0], cb[1], cb[2]) ? cs : cb),
  'lighter color': (cb, cs) => (lum(cs[0], cs[1], cs[2]) > lum(cb[0], cb[1], cb[2]) ? cs : cb),
};

/** The blend modes this draws exactly. Dissolve and Pass Through are handled by the caller. */
export const SUPPORTED_BLEND_MODES = [...Object.keys(SEPARABLE), ...Object.keys(NON_SEPARABLE)];

/** The functions `blendPixel` takes for `mode`. */
function modeFunctions(mode) {
  const separable = SEPARABLE[mode];
  return { separable, nonSeparable: separable ? null : NON_SEPARABLE[mode] ?? SEPARABLE.normal };
}

/**
 * Dissolve's grain: a fixed noise, 0..1 by pixel index, so a file flattens the same every time. A
 * pixel is drawn whole where the noise is under its alpha, and not at all where it is not.
 */
function dissolveNoise(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Composite one straight-RGBA source pixel over the backdrop buffer at `d`, with the source's alpha
 * already including opacity and masks. `mode` is a SEPARABLE or NON_SEPARABLE name.
 */
function blendPixel(dst, d, sr, sg, sb, sa, mode, separable, nonSeparable) {
  if (sa <= 0) return;
  const ab = dst[d + 3];
  const br = dst[d], bg = dst[d + 1], bb = dst[d + 2];
  let mr = sr, mg = sg, mb = sb;
  if (ab > 0 && mode !== 'normal') {
    let r, g, b;
    if (separable) {
      r = separable(br, sr); g = separable(bg, sg); b = separable(bb, sb);
    } else {
      [r, g, b] = nonSeparable([br, bg, bb], [sr, sg, sb]);
    }
    mr = (1 - ab) * sr + ab * r;
    mg = (1 - ab) * sg + ab * g;
    mb = (1 - ab) * sb + ab * b;
  }
  const ao = sa + ab * (1 - sa);
  const k = ab * (1 - sa);
  dst[d] = (sa * mr + k * br) / ao;
  dst[d + 1] = (sa * mg + k * bg) / ao;
  dst[d + 2] = (sa * mb + k * bb) / ao;
  dst[d + 3] = ao;
}

/** Composite a whole buffer `src` (same size as `dst`) over `dst` with `mode` and `opacity`. */
function compositeBuffer(dst, src, mode, opacity) {
  const dissolve = mode === 'dissolve';
  const blend = dissolve ? 'normal' : mode;
  const { separable, nonSeparable } = modeFunctions(blend);
  for (let d = 0; d < dst.length; d += 4) {
    let sa = src[d + 3] * opacity;
    if (dissolve && sa > 0) sa = dissolveNoise(d >> 2) < sa ? 1 : 0;
    if (sa > 0) blendPixel(dst, d, src[d], src[d + 1], src[d + 2], sa, blend, separable, nonSeparable);
  }
}

/**
 * The layer's mask (0..1) at document pixel (x, y), or null when it has none to apply: its pixel
 * mask, and with the document's size its vector mask too.
 */
export function layerMaskSampler(layer, size = null) {
  return size ? layerCoverage(layer, size.width, size.height) : maskSampler(layer);
}

const vectorMasks = new WeakMap();
/**
 * A layer's vector mask as coverage of the document, or null where it has none to apply: none, one
 * switched off, or a shape's or fill layer's (its pixels, or fillPicture, are already its shape).
 */
function vectorMaskOf(layer, width, height) {
  const vectorMask = layer.vectorMask;
  // Not over a real mask, which already holds it, nor over the mask Photoshop rendered from it.
  if (!vectorMask || vectorMask.disable || layer.vectorFill || layer.mask?.real || (layer.mask?.fromVectorData && layer.mask.imageData && !layer.mask.disabled)) return null;
  const key = `${width}x${height}`;
  const known = vectorMasks.get(vectorMask);
  if (known?.key === key) return known.coverage;
  const coverage = vectorCoverage(vectorMask, width, height);
  vectorMasks.set(vectorMask, { key, coverage });
  return coverage;
}

/** Both of a layer's masks at document pixel (x, y), or null when it has neither to apply. */
function layerCoverage(layer, width, height) {
  const pixel = maskSampler(layer);
  const vector = vectorMaskOf(layer, width, height);
  if (!vector) return pixel;
  // A vector mask's density below 100% lets what it hides show through by that much.
  const density = layer.mask?.vectorMaskDensity ?? 1;
  return (x, y) => (1 - density * (1 - (x < 0 || y < 0 || x >= width || y >= height ? 0 : vector[y * width + x]))) * (pixel ? pixel(x, y) : 1);
}

function maskSampler(layer) {
  const mask = layer.mask;
  if (!mask || mask.disabled) return null;
  // A mask rendered from the vector mask with nothing stored: the vector mask's paths stand for it. On
  // a shape layer whose pixels are its shape already, it would square their edges (psd-tools, #885).
  if (mask.fromVectorData && !mask.real && (!mask.imageData || (layer.vectorFill && layer.imageData?.width > 0))) return null;
  // The mask Photoshop stored, as psd-tools reads it: the "real" one (user and vector masks together)
  // where it is valid, else the user mask, even one rendered from the vector mask.
  const source = mask.real ?? mask;
  const outside = (source.defaultColor ?? mask.defaultColor ?? 0) / 255;
  // Its density: a mask rendered from the vector mask has the vector mask's.
  const density = mask.real ? 1 : mask.fromVectorData ? (mask.vectorMaskDensity ?? mask.userMaskDensity ?? 1) : (mask.userMaskDensity ?? 1);
  // Its feather, a Gaussian blur as wide as the feather is.
  const feather = mask.real ? 0 : Number((mask.fromVectorData ? mask.vectorMaskFeather : mask.userMaskFeather) ?? 0);
  const plane = maskPlane(source, outside, feather);
  // A density below 100% lets the hidden part show through by that much.
  const shape = (v) => 1 - density * (1 - v);
  return (x, y) => {
    const mx = x - plane.left;
    const my = y - plane.top;
    if (mx < 0 || my < 0 || mx >= plane.width || my >= plane.height) return shape(outside);
    return shape(plane.values[my * plane.width + mx]);
  };
}

const maskPlanes = new WeakMap();
/** A stored mask as values 0..1 over its rectangle, feathered (and grown by the feather) when it is. */
function maskPlane(source, outside, feather) {
  const known = maskPlanes.get(source);
  if (known?.feather === feather) return known.plane;
  const data = source.imageData;
  const width = data?.width ?? 0;
  const height = data?.height ?? 0;
  const sigma = feather > 0 ? feather * FEATHER_SIGMA : 0;
  const margin = sigma > 0 ? Math.ceil(3 * sigma) + 1 : 0;
  const plane = { left: Math.round(source.left ?? 0) - margin, top: Math.round(source.top ?? 0) - margin, width: width + 2 * margin, height: height + 2 * margin };
  plane.values = new Float32Array(plane.width * plane.height).fill(outside);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) plane.values[(y + margin) * plane.width + x + margin] = data.data[(y * width + x) * 4] / 255;
  }
  if (sigma > 0) {
    // Blurred about the outside value, so the edge of the rectangle fades into it, not into nothing.
    for (let i = 0; i < plane.values.length; i += 1) plane.values[i] -= outside;
    blur(plane.values, plane.width, plane.height, sigma);
    for (let i = 0; i < plane.values.length; i += 1) plane.values[i] += outside;
  }
  maskPlanes.set(source, { feather, plane });
  return plane;
}
// A mask's Feather as a Gaussian's deviation, for each pixel of feather.
const FEATHER_SIGMA = globalThis.__featherSigma ?? 0.5;

/** Paint a raster layer's pixels into `dst` (document-sized) with `mode` at `alpha`. */
function paintLayer(dst, width, height, layer, mode, alpha) {
  // A fill layer saved without its pixels (a shape, a Color or Gradient Fill): drawn from its fill and
  // its vector mask, over the whole document.
  const own = layer.imageData?.data?.length ? layer.imageData : null;
  const src = own ?? fillPicture(layer, width, height);
  if (!src?.data?.length || alpha <= 0) return false;
  const mask = layerCoverage(layer, width, height);
  const dissolve = mode === 'dissolve';
  const blend = dissolve ? 'normal' : mode;
  const { separable, nonSeparable } = modeFunctions(blend);
  const left = own ? Math.round(layer.left ?? 0) : 0;
  const top = own ? Math.round(layer.top ?? 0) : 0;
  for (let sy = 0; sy < src.height; sy += 1) {
    const y = top + sy;
    if (y < 0 || y >= height) continue;
    for (let sx = 0; sx < src.width; sx += 1) {
      const x = left + sx;
      if (x < 0 || x >= width) continue;
      const s = (sy * src.width + sx) * 4;
      let sa = (src.data[s + 3] / 255) * alpha;
      if (mask) sa *= mask(x, y);
      if (dissolve && sa > 0) sa = dissolveNoise(y * width + x) < sa ? 1 : 0;
      if (sa <= 0) continue;
      blendPixel(dst, (y * width + x) * 4, src.data[s] / 255, src.data[s + 1] / 255, src.data[s + 2] / 255,
        sa, blend, separable, nonSeparable);
    }
  }
  return true;
}

const isGroup = (layer) => Array.isArray(layer?.children);

// --- Fill layers without pixels ------------------------------------------------------------------

const drawnFills = new WeakMap();
/** A fill layer with no pixels of its own, drawn: `{ width, height, data }` over the document, or null. */
function fillPicture(layer, width, height) {
  if (!layer?.vectorFill || layer.imageData?.width > 0) return null;
  const key = `${width}x${height}`;
  if (drawnFills.get(layer)?.key === key) return drawnFills.get(layer).picture;
  let picture = null;
  const coverage = vectorCoverage(layer.vectorMask, width, height);
  const box = coverage ? coverageBounds(coverage, width, height) : { x: 0, y: 0, width, height };
  // The gradient is laid over the shape's own box, its paths' (or the document's, for a fill of it all).
  const shapeBox = pathsBounds(layer.vectorMask) ?? { x: 0, y: 0, width, height };
  const paint = box ? fillPaint(layer.vectorFill, shapeBox, width, height) : null;
  if (paint) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = box.y; y < box.y + box.height; y += 1) {
      for (let x = box.x; x < box.x + box.width; x += 1) {
        const c = coverage ? coverage[y * width + x] : 1;
        if (c <= 0) continue;
        // Photoshop works its fills at whole pixel coordinates.
        const [r, g, b, a] = paint(x, y);
        const i = (y * width + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(255 * a * Math.min(1, c));
      }
    }
    picture = { width, height, data };
  }
  drawnFills.set(layer, { key, picture });
  return picture;
}

/**
 * What a fill paints at a point: a colour; a pattern, tiled from the document's corner (moved by its
 * phase); or a gradient across `box` as Photoshop draws one.
 */
function fillPaint(fill, box, width, height) {
  if (fill.type === 'color') {
    const [r, g, b] = psdRgb(fill.color);
    return () => [r, g, b, 1];
  }
  if (fill.type === 'pattern') {
    if (!fill.picture) return null;
    const { width: pw, height: ph, data } = fill.picture;
    const px = Number(fill.phase?.x) || 0;
    const py = Number(fill.phase?.y) || 0;
    const wrap = (v, n) => ((v % n) + n) % n;
    return (x, y) => {
      const i = (wrap(Math.floor(y - py), ph) * pw + wrap(Math.floor(x - px), pw)) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3] / 255];
    };
  }
  // A gradient as Photoshop lays one over the shape's box (utils/psdVectors.js gradientField), or over
  // the document where it is not aligned with the layer.
  const field = gradientField(fill, fill.align === false ? { x: 0, y: 0, width, height } : box);
  const ramp = gradientRamp(fill);
  return (x, y) => ramp(field(x, y));
}

/**
 * A vector mask as coverage of the document's pixels (0 to 1), or null where it shows everything.
 * Its paths come in shapes: a path with an operation of its own starts one, and the paths after it
 * with none are the same shape (one outline, filled by its fill rule, so a hole in it stays a hole).
 * The shapes are joined in order by their operations, from nothing, or from everything where the
 * first one subtracts or intersects. With no paths it hides everything, or shows everything where
 * it starts with all pixels (Photoshop's Hide All and Reveal All).
 */
function vectorCoverage(vectorMask, width, height) {
  if (!vectorMask || vectorMask.disable) return null;
  const paths = (vectorMask.paths ?? []).filter((path) => (path.knots ?? []).length >= 2);
  let result;
  if (!paths.length) {
    if (vectorMask.fillStartsWithAllPixels && !vectorMask.invert) return null;
    result = new Float32Array(width * height).fill(vectorMask.fillStartsWithAllPixels ? 1 : 0);
  } else {
    const shapes = [];
    for (const path of paths) {
      if (path.operation === undefined && shapes.length) shapes[shapes.length - 1].push(path);
      else shapes.push([path]);
    }
    for (const shape of shapes) {
      const p = pathCoverage(shape, width, height);
      const operation = shape[0].operation ?? 'combine';
      if (!result) {
        if (operation !== 'subtract' && operation !== 'intersect') { result = p; continue; }
        result = new Float32Array(width * height).fill(1);
      }
      for (let i = 0; i < result.length; i += 1) {
        const a = result[i];
        const b = p[i];
        switch (operation) {
          case 'subtract': result[i] = a * (1 - b); break;
          case 'intersect': result[i] = a * b; break;
          case 'exclude': result[i] = a + b - 2 * a * b; break;
          default: result[i] = a + b - a * b;
        }
      }
    }
  }
  if (vectorMask.invert) for (let i = 0; i < result.length; i += 1) result[i] = 1 - result[i];
  return result;
}

/**
 * One shape of a vector mask (its paths) as coverage: the Béziers flattened, filled by the shape's
 * fill rule (non-zero or even-odd), four rows a pixel.
 */
function pathCoverage(paths, width, height) {
  const loops = paths.map((path) => {
    const knots = path.knots;
    const points = [];
    const segment = (a, b) => {
      // From a's anchor through a's outgoing and b's incoming handles to b's anchor.
      const p0 = [a.points[2], a.points[3]];
      const p1 = [a.points[4], a.points[5]];
      const p2 = [b.points[0], b.points[1]];
      const p3 = [b.points[2], b.points[3]];
      const reach = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const steps = Math.max(1, Math.min(64, Math.ceil(reach / 2)));
      for (let k = points.length ? 1 : 0; k <= steps; k += 1) {
        const t = k / steps;
        const u = 1 - t;
        points.push([
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ]);
      }
    };
    for (let i = 1; i < knots.length; i += 1) segment(knots[i - 1], knots[i]);
    segment(knots[knots.length - 1], knots[0]);
    return points;
  });
  const evenOdd = paths[0]?.fillRule === 'even-odd';
  const out = new Float32Array(width * height);
  const ys = loops.flat().map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const ROWS = 4;
  for (let y = top; y <= bottom; y += 1) {
    for (let k = 0; k < ROWS; k += 1) {
      const sy = y + (k + 0.5) / ROWS;
      const crossings = [];
      for (const points of loops) {
        for (let i = 0; i < points.length; i += 1) {
          const [x0, y0] = points[i];
          const [x1, y1] = points[(i + 1) % points.length];
          if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) crossings.push({ x: x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), w: y1 > y0 ? 1 : -1 });
        }
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i += 1) {
        winding += evenOdd ? 1 : crossings[i].w;
        if (evenOdd ? winding % 2 === 0 : !winding) continue;
        const xa = Math.max(0, crossings[i].x);
        const xb = Math.min(width, crossings[i + 1].x);
        for (let x = Math.floor(xa); x < Math.ceil(xb); x += 1) {
          out[y * width + x] += (Math.min(xb, x + 1) - Math.max(xa, x)) / ROWS;
        }
      }
    }
  }
  return out;
}

/** The box a vector mask's paths span (their anchors), or null without paths. */
function pathsBounds(vectorMask) {
  const points = (vectorMask?.paths ?? []).flatMap((path) => (path.knots ?? []).map((knot) => [knot.points[2], knot.points[3]]));
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function coverageBounds(coverage, width, height) {
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (coverage[y * width + x] <= 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
/** A buffer's alpha, one value a pixel. */
function alphaOf(buffer) {
  const alpha = new Float32Array(buffer.length / 4);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = buffer[i * 4 + 3];
  return alpha;
}

function scaleAlpha(buffer, k) {
  if (k >= 1) return;
  for (let i = 3; i < buffer.length; i += 4) buffer[i] *= k;
}

// The styles Photoshop calls interior (under the Fill with "Blend Interior Effects as Group"), and the
// ones drawn over the layers clipped to the layer.
const INTERIOR_STYLES = ['solidFill', 'gradientOverlay', 'patternOverlay', 'satin', 'innerGlow'];
const EDGE_STYLES = ['innerShadow', 'bevel', 'stroke'];
/** A layer's effects with only the `keys` styles in them. */
function withOnly(effects, keys) {
  const out = { ...effects };
  for (const key of [...INTERIOR_STYLES, ...EDGE_STYLES, 'dropShadow', 'outerGlow']) if (!keys.includes(key)) delete out[key];
  return out;
}

// Inside a group drawn on its own, a knockout reaches only its clear start.
const CLEAR = Object.freeze({ shallow: null, deep: null });

function hasEffects(layer) {
  return Boolean(layer.effects && !layer.effects.disabled && Object.values(layer.effects).some((effect) =>
    effect && typeof effect === 'object'
    && (Array.isArray(effect) ? effect.some((e) => e?.enabled !== false) : effect.enabled !== false)));
}

/**
 * Flatten `layers` (ag-psd's `children`, bottom first) into a `width` × `height` image.
 * `skip(layer)` leaves a layer and everything in it out (the importer's placeholder group); `styles`
 * (utils/psdLayerStyles.js LAYER_STYLES) draws layer styles, which are otherwise left out and named.
 *
 * `{ pixels: Uint8Array RGBA, painted, notDrawn: { effects, adjustment }, closeTo: { styles,
 * adjustments }, dissolve }`: `notDrawn` by layer name (an adjustment with what it is), `closeTo` the
 * styles and adjustments drawn close to Photoshop's rather than exactly, `dissolve` the layers drawn
 * with a Dissolve grain of their own.
 */
export function compositePsd(layers, width, height, { skip = () => false, styles = null, grey = false } = {}) {
  const notDrawn = { effects: [], adjustment: [] };
  const closeStyles = new Set();
  const closeAdjustments = new Set();
  const dissolve = [];
  let painted = 0;

  const modeOf = (layer) => {
    const mode = String(layer.blendMode ?? 'normal');
    if (mode === 'dissolve') { dissolve.push(layer.name || 'unnamed'); return 'dissolve'; }
    return SEPARABLE[mode] || NON_SEPARABLE[mode] || mode === 'pass through' ? mode : 'normal';
  };

  const styled = (layer) => Boolean(styles) && hasEffects(layer);
  const note = (layer) => {
    if (!styles && hasEffects(layer)) notDrawn.effects.push(layer.name || 'unnamed');
  };

  /**
   * One layer (or group) and the clipped layers riding on it, into `dst`, scaled by `inherited`.
   * `reach`: what a knockout gives way to, `{ shallow, deep }` (null: clear).
   */
  const drawUnit = (dst, base, clipped, inherited, reach) => {
    const opacity = inherited * (base.opacity ?? 1);
    const fill = base.fillOpacity ?? 1;
    const mode = modeOf(base);
    const level = Number(base.knockoutLevel ?? (base.knockout ? 1 : 0));
    if (level > 0) {
      // Where it covers (its pixels and masks, at full fill), what is under it gives way.
      const shape = new Float32Array(dst.length);
      drawUnit(shape, { ...base, opacity: 1, fillOpacity: 1, blendMode: 'normal', knockoutLevel: 0, knockout: false, effects: undefined }, [], 1, CLEAR);
      knock(dst, shape, opacity, level >= 2 ? reach.deep : reach.shallow);
    }
    if (styled(base)) {
      drawStyled(dst, base, clipped, opacity, mode);
      return;
    }

    if (isGroup(base)) {
      // Pass Through: its layers straight onto what is below; a shallow knockout inside gives way to what
      // was there. Below 100% opacity, or masked, what is below goes only that far toward the group drawn
      // on it in full (its adjustments too), as Photoshop mixes it.
      if (mode === 'pass through' && fill >= 1 && !clipped.length) {
        const mask = layerCoverage(base, width, height);
        const before = opacity < 1 || mask ? Float32Array.from(dst) : null;
        drawList(dst, base.children, 1, { shallow: knocksInside(base) ? Float32Array.from(dst) : null, deep: reach.deep });
        if (before) mix(dst, before, opacity, mask);
        return;
      }
      // Pass Through with layers clipped to it, or below 100% Fill: its layers still blend with what is
      // below, but its adjustments reach only the group's own pixels, and the group is then laid down as
      // a layer of its own, at its opacity and Fill, the layers clipped to it on it (psd-tools' reading,
      // which Photoshop's pictures of its test files bear out).
      if (mode === 'pass through') {
        const own = passThroughAlone(dst, base);
        applyMask(own, base);
        clipInto(own, alphaOf(own), clipped);
        compositeBuffer(dst, own, 'normal', opacity * fill);
        return;
      }
      // Isolated: the group on its own, then blended in as one layer would be.
      const buffer = new Float32Array(dst.length);
      artboardBackground(buffer, base);
      drawList(buffer, base.children, 1, CLEAR);
      applyMask(buffer, base);
      clipInto(buffer, alphaOf(buffer), clipped);
      compositeBuffer(dst, buffer, mode === 'pass through' ? 'normal' : mode, opacity * fill);
      return;
    }

    if (!clipped.length) {
      if (paintLayer(dst, width, height, base, mode, opacity * fill)) painted += 1;
      return;
    }
    // A clipping group: the base on its own, the clipped layers blended into it where it is, then the
    // whole blended in with the base's mode and opacity.
    const buffer = new Float32Array(dst.length);
    if (paintLayer(buffer, width, height, base, 'normal', 1)) painted += 1;
    const shape = alphaOf(buffer);
    scaleAlpha(buffer, fill);
    clipInto(buffer, shape, clipped);
    compositeBuffer(dst, buffer, mode, opacity);
  };

  /**
   * A Pass Through group's layers drawn over what is below (`dst`, left as it is), their adjustments
   * kept to the group's own pixels so far, and the group then taken back off what is below: its own
   * colour and coverage, as a buffer to lay down as one layer.
   */
  const passThroughAlone = (dst, group) => {
    const work = Float32Array.from(dst);
    const solo = new Float32Array(dst.length);
    const within = (x, y) => solo[(y * width + x) * 4 + 3];
    const all = group.children ?? [];
    for (let i = 0; i < all.length; i += 1) {
      const base = all[i];
      const clipped = [];
      while (i + 1 < all.length && all[i + 1].clipping) clipped.push(all[(i += 1)]);
      if (base.hidden || skip(base) || base.clipping) continue;
      note(base);
      if (base.adjustment) {
        adjustBelow(work, base, 1, within);
        continue;
      }
      drawUnit(work, base, clipped, 1, CLEAR);
      drawUnit(solo, { ...base, blendMode: 'normal' }, clipped, 1, CLEAR);
    }
    // Off what is below: the group's straight colour, where it covers.
    const own = new Float32Array(dst.length);
    for (let i = 0; i < dst.length; i += 4) {
      const ag = solo[i + 3];
      if (!(ag > 0)) continue;
      const ab = dst[i + 3] * (1 - ag);
      const aw = work[i + 3];
      for (let k = 0; k < 3; k += 1) own[i + k] = clamp((work[i + k] * aw - dst[i + k] * ab) / ag);
      own[i + 3] = ag;
    }
    return own;
  };

  /**
   * The layers clipped to a base, into `buffer`, which holds the base at its Fill; `shape` is the
   * base's coverage at full Fill. They go over the base's colour as if it were opaque wherever it is
   * at all, and the whole is then cut to its shape: a clipped layer shows in full over a base at Fill
   * 0% (Fill is the base's own pixels, not its shape), and blends with the base as far as its Fill.
   */
  const clipInto = (buffer, shape, clipped) => {
    if (!clipped.length) return;
    for (let i = 0; i < shape.length; i += 1) buffer[i * 4 + 3] = shape[i] > 0 ? Math.min(1, buffer[i * 4 + 3] / shape[i]) : 0;
    for (const layer of clipped) drawClipped(buffer, layer);
    for (let i = 0; i < shape.length; i += 1) buffer[i * 4 + 3] *= shape[i];
  };

  /** An artboard's own background colour, over its rectangle (white, black, or its colour). */
  const artboardBackground = (buffer, group) => {
    const board = group.artboard;
    const type = Number(board?.backgroundType ?? 3);
    if (!board?.rect || type === 3) return;
    const [r, g, b] = type === 1 ? [255, 255, 255] : type === 2 ? [0, 0, 0] : psdRgb(board.color ?? { r: 255, g: 255, b: 255 });
    const { left = 0, top = 0, right = 0, bottom = 0 } = board.rect;
    for (let y = Math.max(0, Math.round(top)); y < Math.min(height, Math.round(bottom)); y += 1) {
      for (let x = Math.max(0, Math.round(left)); x < Math.min(width, Math.round(right)); x += 1) {
        buffer.set([r / 255, g / 255, b / 255, 1], (y * width + x) * 4);
      }
    }
  };

  /**
   * A layer or group with layer styles: drawn on its own, its shadows and glows cast under it and its
   * other styles drawn into it from its shape (at full Fill, as Photoshop draws them whatever the
   * Fill), then blended in as the layer.
   */
  const drawStyled = (dst, base, clipped, opacity, mode) => {
    const own = new Float32Array(dst.length);
    if (isGroup(base)) {
      artboardBackground(own, base);
      drawList(own, base.children, 1, CLEAR);
      applyMask(own, base);
    } else if (paintLayer(own, width, height, base, 'normal', 1)) {
      painted += 1;
    }
    const shape = new Float32Array(width * height);
    let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const a = own[(y * width + x) * 4 + 3];
        if (!(a > 0)) continue;
        shape[y * width + x] = a;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return;
    const fill = base.fillOpacity ?? 1;
    const effects = base.effects;

    // Shadows and glows under it, each in its own blend mode, at the layer's opacity.
    for (const cast of styles.cast(shape, width, height, effects)) {
      const castMode = SEPARABLE[cast.mode] || NON_SEPARABLE[cast.mode] ? cast.mode : 'normal';
      const { separable, nonSeparable } = modeFunctions(castMode);
      const [r, g, b] = cast.rgb.map((v) => v / 255);
      for (let y = 0; y < cast.height; y += 1) {
        for (let x = 0; x < cast.width; x += 1) {
          const sa = cast.alpha[y * cast.width + x] * cast.opacity * opacity;
          if (sa > 0) blendPixel(dst, ((cast.y + y) * width + cast.x + x) * 4, r, g, b, sa, castMode, separable, nonSeparable);
        }
      }
      closeStyles.add(cast.name);
    }

    // The other styles into it, over its box and as far out as a stroke reaches.
    const margin = styles.reach(effects);
    const box = { x: Math.max(0, x0 - margin), y: Math.max(0, y0 - margin) };
    box.width = Math.min(width - 1, x1 + margin) - box.x + 1;
    box.height = Math.min(height - 1, y1 + margin) - box.y + 1;
    const anchor = { x: Math.round(base.left ?? 0), y: Math.round(base.top ?? 0) };
    const drawInto = (some) => {
      const pixels = new Uint8Array(box.width * box.height * 4);
      const part = new Float32Array(box.width * box.height);
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const i = (box.y + y) * width + box.x + x;
          const p = y * box.width + x;
          part[p] = shape[i];
          for (let k = 0; k < 4; k += 1) pixels[p * 4 + k] = Math.round(clamp(own[i * 4 + k]) * 255);
        }
      }
      const bounds = !isGroup(base) && base.right > base.left && base.bottom > base.top
        ? { x: base.left, y: base.top, width: base.right - base.left, height: base.bottom - base.top } : null;
      const drawn = styles.draw(pixels, part, box.width, box.height, some, { left: box.x, top: box.y, anchor, bounds, document: { width, height } });
      if (!drawn.length) return;
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const i = (box.y + y) * width + box.x + x;
          const p = y * box.width + x;
          for (let k = 0; k < 4; k += 1) own[i * 4 + k] = pixels[p * 4 + k] / 255;
        }
      }
      for (const name of drawn) closeStyles.add(name);
    };
    // The overlays, Satin and Inner Glow: with "Blend Interior Effects as Group" part of its own pixels,
    // under its Fill and under the layers clipped to it (advanced-blending.psd); otherwise over those
    // layers, at full strength whatever its Fill (clipping-mask2.psd: a Gradient Overlay on the base
    // over its clipped layers). Its Inner Shadow, Bevel and Stroke over everything.
    const interior = withOnly(effects, INTERIOR_STYLES);
    if (base.blendInteriorElements) {
      drawInto(interior);
      scaleAlpha(own, fill);
      clipInto(own, shape, clipped);
    } else {
      scaleAlpha(own, fill);
      clipInto(own, shape, clipped);
      drawInto(interior);
    }
    drawInto(withOnly(effects, EDGE_STYLES));
    compositeBuffer(dst, own, mode === 'pass through' ? 'normal' : mode, opacity);
  };

  /**
   * An adjustment layer: what it does to `dst` (everything under it in its group, or the layer it is
   * clipped to), by its opacity and Fill and its masks, its result blended in its own blend mode.
   */
  const adjustBelow = (dst, layer, inherited, within = null) => {
    const fn = adjustmentFunction(layer.adjustment, closeAdjustments, { grey });
    if (!fn) {
      notDrawn.adjustment.push(`${layer.name || 'unnamed'} (${unappliedAdjustment(layer.adjustment)})`);
      return;
    }
    const strength = inherited * (layer.opacity ?? 1) * (layer.fillOpacity ?? 1);
    if (!(strength > 0)) return;
    const mode = modeOf(layer);
    const blend = mode === 'pass through' || mode === 'dissolve' ? 'normal' : mode;
    const { separable, nonSeparable } = modeFunctions(blend);
    const own = layerCoverage(layer, width, height);
    const mask = own && within ? (x, y) => own(x, y) * within(x, y) : own ?? within;
    const known = new Map();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const d = (y * width + x) * 4;
        if (!(dst[d + 3] > 0)) continue;
        const k = strength * (mask ? mask(x, y) : 1);
        if (!(k > 0)) continue;
        const r0 = Math.round(clamp(dst[d]) * 255);
        const g0 = Math.round(clamp(dst[d + 1]) * 255);
        const b0 = Math.round(clamp(dst[d + 2]) * 255);
        const key = (r0 << 16) | (g0 << 8) | b0;
        let out = known.get(key);
        if (!out) {
          const [r, g, b] = fn([r0, g0, b0]);
          out = [clamp(r / 255), clamp(g / 255), clamp(b / 255)];
          if (known.size < 1 << 18) known.set(key, out);
        }
        let [r, g, b] = out;
        if (blend !== 'normal') {
          if (separable) { r = separable(dst[d], r); g = separable(dst[d + 1], g); b = separable(dst[d + 2], b); }
          else [r, g, b] = nonSeparable([dst[d], dst[d + 1], dst[d + 2]], [r, g, b]);
        }
        dst[d] += (r - dst[d]) * k;
        dst[d + 1] += (g - dst[d + 1]) * k;
        dst[d + 2] += (b - dst[d + 2]) * k;
      }
    }
  };

  /** A clipped layer into its base's buffer, in its own mode (clipInto cuts it to the base). */
  const drawClipped = (buffer, layer) => {
    if (layer.hidden || skip(layer)) return;
    note(layer);
    if (layer.adjustment) {
      // It changes the layer it is clipped to, and only that.
      adjustBelow(buffer, layer, 1);
      return;
    }
    const mode = modeOf(layer);
    const opacity = (layer.opacity ?? 1);
    if (styled(layer)) {
      drawStyled(buffer, layer, [], opacity, mode);
    } else if (isGroup(layer)) {
      const inner = new Float32Array(buffer.length);
      drawList(inner, layer.children, 1, CLEAR);
      applyMask(inner, layer);
      compositeBuffer(buffer, inner, mode === 'pass through' ? 'normal' : mode, opacity);
    } else if (paintLayer(buffer, width, height, layer, mode, opacity * (layer.fillOpacity ?? 1))) {
      painted += 1;
    }
  };

  /** A layer stack, bottom first, gathering each base with the clipped layers above it. */
  const drawList = (dst, list, inherited, reach) => {
    // Bases and their clipped layers are matched on the whole list, hidden layers included: a
    // layer clipped to a hidden one is hidden with it, not re-attached to the next one down.
    const all = list ?? [];
    for (let i = 0; i < all.length; i += 1) {
      const base = all[i];
      const clipped = [];
      while (i + 1 < all.length && all[i + 1].clipping) clipped.push(all[(i += 1)]);
      // A clipped layer with nothing under it to clip to is drawn as Photoshop does: not at all.
      if (base.hidden || skip(base) || base.clipping) continue;
      note(base);
      if (base.adjustment) {
        adjustBelow(dst, base, inherited);
        // What is clipped to an adjustment layer goes where it goes: wherever its masks let it.
        const within = layerCoverage(base, width, height);
        for (const layer of clipped) {
          if (layer.hidden || skip(layer)) continue;
          note(layer);
          if (layer.adjustment) { adjustBelow(dst, layer, inherited, within); continue; }
          const buffer = new Float32Array(dst.length);
          drawUnit(buffer, { ...layer, clipping: false, blendMode: 'normal', opacity: 1 }, [], 1, CLEAR);
          if (within) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) buffer[(y * width + x) * 4 + 3] *= within(x, y);
          compositeBuffer(dst, buffer, modeOf(layer) === 'pass through' ? 'normal' : modeOf(layer), inherited * (layer.opacity ?? 1));
        }
        continue;
      }
      drawUnit(dst, base, clipped, inherited, reach);
    }
  };

  /** Whether anything in a group knocks out (a pass-through group keeps what it began on, for them). */
  const knocksInside = (group) => (group.children ?? []).some((layer) => !layer.hidden
    && (Number(layer.knockoutLevel ?? (layer.knockout ? 1 : 0)) > 0 || (isGroup(layer) && knocksInside(layer))));

  /** `dst` giving way to `to` (null: clear) where `shape` covers, by `strength`. Straight colour. */
  const knock = (dst, shape, strength, to) => {
    for (let i = 0; i < dst.length; i += 4) {
      const t = shape[i + 3] * strength;
      if (!(t > 0)) continue;
      const ad = dst[i + 3] * (1 - t);
      const ak = to ? to[i + 3] * t : 0;
      const a = ad + ak;
      for (let k = 0; k < 3; k += 1) dst[i + k] = a > 0 ? (dst[i + k] * ad + (to ? to[i + k] * ak : 0)) / a : 0;
      dst[i + 3] = a;
    }
  };

  /** `dst` only `amount` (times `mask` at each pixel) of the way from `before` to what it is now. */
  const mix = (dst, before, amount, mask = null) => {
    for (let i = 0; i < dst.length; i += 4) {
      const p = i >> 2;
      const k = mask ? amount * mask(p % width, Math.floor(p / width)) : amount;
      const ab = before[i + 3] * (1 - k);
      const an = dst[i + 3] * k;
      const a = ab + an;
      for (let k = 0; k < 3; k += 1) dst[i + k] = a > 0 ? (before[i + k] * ab + dst[i + k] * an) / a : 0;
      dst[i + 3] = a;
    }
  };

  const applyMask = (buffer, layer) => {
    const mask = layerCoverage(layer, width, height);
    if (!mask) return;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) buffer[(y * width + x) * 4 + 3] *= mask(x, y);
    }
  };

  // The Background layer (the bottom one, its transparency locked), for a deep knockout to reach.
  const bottom = (layers ?? [])[0];
  let background = null;
  if (bottom && !isGroup(bottom) && bottom.transparencyProtected && !bottom.hidden && !skip(bottom)) {
    background = new Float32Array(width * height * 4);
    paintLayer(background, width, height, bottom, 'normal', 1);
  }
  const canvas = new Float32Array(width * height * 4);
  // At the top, a shallow knockout reaches the Background too.
  drawList(canvas, layers, 1, { shallow: background, deep: background });

  const pixels = new Uint8Array(canvas.length);
  for (let i = 0; i < canvas.length; i += 1) pixels[i] = Math.round(clamp(canvas[i]) * 255);
  for (const key of Object.keys(notDrawn)) notDrawn[key] = [...new Set(notDrawn[key])];
  return {
    pixels,
    painted,
    notDrawn,
    closeTo: { styles: [...closeStyles], adjustments: [...closeAdjustments] },
    dissolve: [...new Set(dissolve)],
  };
}

// The adjustments that change each ink on its own, which is all Photoshop does with them in CMYK.
const INK_ADJUSTMENTS = new Set(['invert', 'posterize', 'levels', 'curves', 'brightness/contrast']);

/**
 * A CMYK file flattened on its inks, as Photoshop flattens it: its cyan, magenta and yellow and its
 * black each flattened on their own, the blend modes and adjustments working on the stored inks, then
 * made RGB as a press profile shows them (cmykToRgb). The layers need their inks (utils/psdRead.js
 * keeps them as `inkPlanes`). As compositePsd, or null where the file has something that works on
 * whole colours, not ink by ink (an adjustment such as Hue/Saturation or Threshold), which
 * the RGB flattening draws instead.
 */
export function compositeInks(layers, width, height, options = {}) {
  let inks = false;
  const fits = (list) => (list ?? []).every((layer) => {
    if (layer.hidden || options.skip?.(layer)) return true;
    if (layer.inkPlanes) inks = true;
    if (layer.adjustment && !INK_ADJUSTMENTS.has(layer.adjustment.type)) return false;
    // (Blend modes all work on the inks, Hue to Luminosity too: on black alone they keep its value or
    // take the layer's, as Photoshop's CMYK test file shows.)
    return fits(layer.children);
  });
  if (!fits(layers) || !inks) return null;
  const tree = (list, plane) => (list ?? []).map((layer) => {
    const out = { ...layer };
    if (layer.children) out.children = tree(layer.children, plane);
    if (layer.inkPlanes && layer.imageData) {
      let data = layer.inkPlanes.cmy;
      if (plane === 'k') {
        data = new Uint8ClampedArray(data.length);
        const k = layer.inkPlanes.k;
        for (let i = 0; i < data.length; i += 4) {
          const v = k ? k[i] : 255;
          data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = layer.inkPlanes.cmy[i + 3];
        }
      }
      out.imageData = { ...layer.imageData, data };
    }
    // Curves and Levels: cyan, magenta and yellow as red, green and blue; black on its own.
    const adjustment = layer.adjustment;
    if (plane === 'k' && (adjustment?.type === 'curves' || adjustment?.type === 'levels')) {
      out.adjustment = { type: adjustment.type, rgb: adjustment.rgb, red: adjustment.black, green: adjustment.black, blue: adjustment.black };
    }
    return out;
  });
  const flatten = (plane) => {
    inkPlaneColours(plane);
    try {
      return compositePsd(tree(layers, plane), width, height, options);
    } finally {
      inkPlaneColours(null);
    }
  };
  const cmy = flatten('cmy');
  const black = flatten('k').pixels;
  const pixels = new Uint8Array(cmy.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = cmykToRgb(1 - cmy.pixels[i] / 255, 1 - cmy.pixels[i + 1] / 255, 1 - cmy.pixels[i + 2] / 255, 1 - black[i] / 255);
    pixels[i] = Math.round(r); pixels[i + 1] = Math.round(g); pixels[i + 2] = Math.round(b); pixels[i + 3] = cmy.pixels[i + 3];
  }
  return { ...cmy, pixels };
}

/** One channel of `mode` (for tests and for anybody checking a formula). */
export function blendChannel(mode, backdrop, source) {
  return SEPARABLE[mode]?.(backdrop, source);
}
