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
 *     Glow cast under the layer, the rest drawn into it from its shape, a Stroke's outside part under
 *     it in its own mode; as Photoshop's pictures of them measure (what was not measured reported).
 *   - Masks with their Density and Feather; Advanced Blending's Channels and Blend If.
 *   - A 16- or 32-bit file at the precision its pixels keep (psdRead.js eightBit's `precise`), and a
 *     32-bit one (`linear`) put together in linear light, as Photoshop works one: an antialiased edge
 *     blends there (gradient-fill.psd, pen-text.psd, vector-mask.psd: 2 % of pixels off to none).
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

import { adjustmentFunction, cmykToRgb, gradientRamp, inkAdjustmentFunction, inkPlaneColours, labAdjustment, labPlaneColours, labToRgb, psdRgb, unappliedAdjustment, useCmykProfile } from './psdAdjustments.js';
import { gradientField, patternSampler, scaleOf } from './psdVectors.js';
import { blur } from './gaussianBlur.js';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Photoshop composites at the document's depth, so a backdrop within half a level of black is black
// and one within half a level of white is white: the cases where these modes divide by zero turn on
// that, and a backdrop left at 1e-6 by the float arithmetic here must not dodge to white.
const LEVEL = 0.5 / 255;
const colorDodge = (b, s) => (b < LEVEL ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const colorBurn = (b, s) => (b > 1 - LEVEL ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
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
  divide: (b, s) => (s <= 0 ? (b < LEVEL ? 0 : 1) : Math.min(1, b / s)),
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

/**
 * Where a layer's styles are laid, as Photoshop lays them: `anchor`, its reference point (Photoshop
 * keeps one for its styles), or else its corner, where a pattern linked with the layer starts; and
 * `bounds`, the layer's own box from its record, which an aligned gradient lies across (a group has
 * none, and its gradients lie across its pixels).
 */
export function styleGeometry(layer) {
  const anchor = layer.referencePoint && Number.isFinite(layer.referencePoint.x)
    ? { x: Math.round(layer.referencePoint.x), y: Math.round(layer.referencePoint.y) }
    : { x: Math.round(layer.left ?? 0), y: Math.round(layer.top ?? 0) };
  const bounds = !isGroup(layer) && layer.right > layer.left && layer.bottom > layer.top
    ? { x: layer.left, y: layer.top, width: layer.right - layer.left, height: layer.bottom - layer.top } : null;
  return { anchor, bounds };
}

// Each blend mode's neutral colour, where it has one: what blended in leaves the backdrop as it was.
const NEUTRAL = {
  multiply: 1, 'color burn': 1, 'linear burn': 1, darken: 1, 'darker color': 1, divide: 1,
  screen: 0, 'color dodge': 0, 'linear dodge': 0, lighten: 0, 'lighter color': 0, difference: 0, exclusion: 0, subtract: 0,
  overlay: 0.5, 'soft light': 0.5, 'hard light': 0.5, 'vivid light': 0.5, 'linear light': 0.5, 'pin light': 0.5,
};

/**
 * A layer style's paint over pixel `d`: as blendPixel, except that where the mode has a neutral
 * colour the style's strength `sa` moves the colour toward it before it is blended, rather than mixing
 * the blended result: B(b, n + sa·(s − n)). The two agree for Multiply and Screen and part for the
 * rest (layer_comps.psd: a bevel's Linear Burn shadow at 70% takes a channel to 0 where its other
 * channels have moved a quarter of the way; effects/blend-modes.psd, a shadow and a Color Overlay in
 * every mode, from 3.3% of pixels off to 0.1%). Not measured for a layer's own Fill, which no test
 * file has below 100% in such a mode.
 */
export function blendStylePixel(dst, d, sr, sg, sb, sa, mode, separable, nonSeparable) {
  const n = NEUTRAL[mode];
  if (n === undefined || !separable) { blendPixel(dst, d, sr, sg, sb, sa, mode, separable, nonSeparable); return; }
  if (sa <= 0) return;
  const ab = dst[d + 3];
  const k = Math.min(1, sa);
  const ao = k + ab * (1 - k);
  if (ao <= 0) return;
  const s = [sr, sg, sb];
  for (let c = 0; c < 3; c += 1) {
    const b = dst[d + c];
    const moved = n + k * (s[c] - n);
    dst[d + c] = (k * (1 - ab) * s[c] + ab * separable(b, moved)) / ao;
  }
  dst[d + 3] = ao;
}

/**
 * Composite a whole buffer `src` (same size as `dst`) over `dst` with `mode` and `opacity` (and the
 * layer's Blend If, `through`, where it has one).
 */
function compositeBuffer(dst, src, mode, opacity, through = null) {
  const dissolve = mode === 'dissolve';
  const blend = dissolve ? 'normal' : mode;
  const { separable, nonSeparable } = modeFunctions(blend);
  for (let d = 0; d < dst.length; d += 4) {
    let sa = src[d + 3] * opacity;
    if (through && sa > 0) sa *= through(src[d], src[d + 1], src[d + 2], dst[d], dst[d + 1], dst[d + 2]);
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
  if (!vectorMask || vectorMask.disable || layer.vectorFill || layer.mask?.real
    || (layer.mask?.fromVectorData && layer.mask.imageData && !layer.mask.disabled && !userMaskApart(layer))) return null;
  const key = `${width}x${height}`;
  const known = vectorMasks.get(vectorMask);
  if (known?.key === key) return known.coverage;
  let coverage = vectorCoverage(vectorMask, width, height);
  // Its Feather, as a mask's (FEATHER_SIGMA).
  const feather = Number(layer.mask?.vectorMaskFeather ?? 0);
  if (coverage && feather > 0) { coverage = Float32Array.from(coverage); blur(coverage, width, height, feather * FEATHER_SIGMA); }
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

/**
 * A layer with both masks where the record does not say its second one holds them together: its first
 * mask is the one Photoshop rendered from the vector mask, and its second is the user mask itself
 * (mask-density-layervectormask.psd: the user mask at its Density times the path at its own; on a
 * shape layer, layer_mask_data.psb, the user mask over the shape its path already draws).
 */
const userMaskApart = (layer) => Boolean(layer.mask?.fromVectorData && !layer.mask.real && layer.realMask?.imageData && !layer.realMask.disabled);

function maskSampler(layer) {
  const mask = layer.mask;
  if (!mask || mask.disabled) return null;
  if (userMaskApart(layer)) {
    const user = layer.realMask;
    const outside = (user.defaultColor ?? 0) / 255;
    const plane = maskPlane(user, outside, Number(mask.userMaskFeather ?? 0));
    const density = mask.userMaskDensity ?? 1;
    const shape = (v) => 1 - density * (1 - v);
    return (x, y) => {
      const mx = x - plane.left;
      const my = y - plane.top;
      return shape(mx < 0 || my < 0 || mx >= plane.width || my >= plane.height ? outside : plane.values[my * plane.width + mx]);
    };
  }
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
// A mask's Feather is a Gaussian's deviation, in pixels: measured on psd-tools' layer_mask_data.psd
// (a user mask feathered 6 px, a vector mask 2 px), where a deviation of the Feather itself fits best.
const FEATHER_SIGMA = 1;

/**
 * Blending Options' Blend If, or null where it lets everything through: how much of the layer shows
 * on a pixel, from its own colour (This Layer) and what is under it (Underlying Layer), in Gray and in
 * each channel. Each range is [black, black split, white split, white] (0..255): nothing below the
 * black or above the white, all of it between the splits, and a ramp across a split. All the ranges
 * multiply. Photoshop documents it so; no file in the test corpora uses it to compare against.
 */
export function blendIf(layer) {
  const ranges = layer?.blendingRanges;
  if (!ranges) return null;
  const scale = (r) => (Array.isArray(r) && r.length === 4 ? (r.some((v) => v > 255) ? r.map((v) => v / 257) : r).map(Number) : null);
  const open = (r) => !r || (r[0] <= 0 && r[1] <= 0 && r[2] >= 255 && r[3] >= 255);
  const gray = [scale(ranges.compositeGrayBlendSource), scale(ranges.compositeGraphBlendDestinationRange)];
  const channels = (ranges.ranges ?? []).slice(0, 3).map((r) => [scale(r?.sourceRange), scale(r?.destRange)]);
  if ([gray, ...channels].every(([a, b]) => open(a) && open(b))) return null;
  const weight = (r, v) => {
    if (open(r)) return 1;
    const [b0, b1, w0, w1] = r;
    let w = 1;
    if (v < b0) return 0;
    if (v < b1) w = (v - b0) / (b1 - b0);
    if (v > w1) return 0;
    if (v > w0) w = Math.min(w, (w1 - v) / Math.max(1e-6, w1 - w0));
    return w;
  };
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  return (sr, sg, sb, dr, dg, db) => {
    const s = [sr * 255, sg * 255, sb * 255];
    const d = [dr * 255, dg * 255, db * 255];
    let w = weight(gray[0], lum(...s)) * weight(gray[1], lum(...d));
    for (let c = 0; c < channels.length && w > 0; c += 1) w *= weight(channels[c][0], s[c]) * weight(channels[c][1], d[c]);
    return w;
  };
}

/** Paint a raster layer's pixels into `dst` (document-sized) with `mode` at `alpha`. */
function paintLayer(dst, width, height, layer, mode, alpha) {
  // A fill layer saved without its pixels (a shape, a Color or Gradient Fill): drawn from its fill and
  // its vector mask, over the whole document.
  const own = layer.imageData?.data?.length && !softShape(layer) ? layer.imageData : null;
  const src = own ?? fillPicture(layer, width, height);
  if (!src?.data?.length || alpha <= 0) return false;
  const mask = layerCoverage(layer, width, height);
  const dissolve = mode === 'dissolve';
  const blend = dissolve ? 'normal' : mode;
  const { separable, nonSeparable } = modeFunctions(blend);
  const left = own ? Math.round(layer.left ?? 0) : 0;
  const top = own ? Math.round(layer.top ?? 0) : 0;
  const through = blendIf(layer);
  // A 16- or 32-bit file's pixels at their full precision, where the reader kept it (psdRead.js eightBit).
  const fine = src.precise?.length === src.data.length ? src.precise : null;
  // Type in an 8- or 16-bit file blends at Photoshop's "Blend Text Colors Using Gamma: 1.45", on by
  // default: both colours taken to linear light and to a 1.45 gamma there, blended, and back (the
  // PhotoCraft corpus's 50 type files: edge pixels to 0.05 of a level, where plain blending was 30 off).
  // In another blend mode, the blend is worked as ever and its result mixed in at the edge's share in
  // that same space (PhotoCraft's text-on-gradient-blend-multiply.psd: 6.3 % of pixels off to none).
  const textGamma = Boolean(layer.text) && own && !inLinear && !inTextless;
  for (let sy = 0; sy < src.height; sy += 1) {
    const y = top + sy;
    if (y < 0 || y >= height) continue;
    for (let sx = 0; sx < src.width; sx += 1) {
      const x = left + sx;
      if (x < 0 || x >= width) continue;
      const s = (sy * src.width + sx) * 4;
      let sr = fine ? fine[s] / 65535 : src.data[s] / 255;
      let sg = fine ? fine[s + 1] / 65535 : src.data[s + 1] / 255;
      let sb = fine ? fine[s + 2] / 65535 : src.data[s + 2] / 255;
      if (inLinear) { sr = toLight(sr); sg = toLight(sg); sb = toLight(sb); }
      let sa = (fine ? fine[s + 3] / 65535 : src.data[s + 3] / 255) * alpha;
      if (mask) sa *= mask(x, y);
      const d = (y * width + x) * 4;
      if (through && sa > 0) sa *= through(sr, sg, sb, dst[d], dst[d + 1], dst[d + 2]);
      if (dissolve && sa > 0) sa = dissolveNoise(y * width + x) < sa ? 1 : 0;
      if (sa <= 0) continue;
      if (textGamma && sa < 1 && dst[d + 3] > 0 && blend !== 'normal') {
        const before = [dst[d], dst[d + 1], dst[d + 2], dst[d + 3]];
        blendPixel(dst, d, sr, sg, sb, 1, blend, separable, nonSeparable);
        for (let k = 0; k < 3; k += 1) dst[d + k] = fromTextSpace(toTextSpace(before[k]) + (toTextSpace(dst[d + k]) - toTextSpace(before[k])) * sa);
        dst[d + 3] = before[3] + (1 - before[3]) * sa;
        continue;
      }
      if (textGamma && sa < 1 && dst[d + 3] > 0) {
        for (let k = 0; k < 3; k += 1) dst[d + k] = toTextSpace(dst[d + k]);
        blendPixel(dst, d, toTextSpace(sr), toTextSpace(sg), toTextSpace(sb), sa, blend, separable, nonSeparable);
        for (let k = 0; k < 3; k += 1) dst[d + k] = fromTextSpace(dst[d + k]);
        continue;
      }
      blendPixel(dst, d, sr, sg, sb, sa, blend, separable, nonSeparable);
    }
  }
  return true;
}

const isGroup = (layer) => Array.isArray(layer?.children);

// --- Fill layers without pixels ------------------------------------------------------------------

const drawnFills = new WeakMap();

/**
 * A shape layer's vector mask at less than full Density, or feathered: its fill shows faintly past the
 * path, over the whole canvas, which the pixels Photoshop keeps for it (the path's box) do not reach;
 * so it is drawn from the path. `{ density, feather }`, or null for a plain one.
 */
function softShape(layer) {
  const mask = layer?.mask;
  if (!layer?.vectorFill || !layer.vectorMask || layer.vectorMask.disable || !mask) return null;
  const density = Number(mask.vectorMaskDensity ?? 1);
  const feather = Number(mask.vectorMaskFeather ?? 0);
  return density < 1 || feather > 0 ? { density: Math.max(0, Math.min(1, density)), feather: Math.max(0, feather) } : null;
}

/** A fill layer with no pixels of its own, drawn: `{ width, height, data }` over the document, or null. */
function fillPicture(layer, width, height) {
  const soft = softShape(layer);
  if (!layer?.vectorFill || (layer.imageData?.width > 0 && !soft)) return null;
  const key = `${width}x${height}`;
  if (drawnFills.get(layer)?.key === key) return drawnFills.get(layer).picture;
  let picture = null;
  let coverage = vectorCoverage(layer.vectorMask, width, height);
  if (coverage && soft) {
    // Feathered by its Feather, then at its Density: past the path, 1 − Density of the fill shows.
    coverage = Float32Array.from(coverage);
    if (soft.feather > 0) blur(coverage, width, height, soft.feather * FEATHER_SIGMA);
    for (let i = 0; i < coverage.length; i += 1) coverage[i] = 1 - soft.density * (1 - Math.min(1, coverage[i]));
  }
  const box = coverage ? coverageBounds(coverage, width, height) : { x: 0, y: 0, width, height };
  // The gradient is laid over the shape's own box, its paths'; without paths, its layer mask's (what
  // bounds the layer then, gradient-fill.psd); else the document's, for a fill of it all.
  const mask = layer.mask && !layer.mask.disabled && layer.mask.imageData?.width > 0 && layer.mask.right > layer.mask.left ? layer.mask : null;
  const shapeBox = pathsBounds(layer.vectorMask)
    ?? (mask ? { x: mask.left, y: mask.top, width: mask.right - mask.left, height: mask.bottom - mask.top } : { x: 0, y: 0, width, height });
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
    return patternSampler(fill.picture, { scale: scaleOf(fill.scale), ox: Number(fill.phase?.x) || 0, oy: Number(fill.phase?.y) || 0 });
  }
  // A gradient as Photoshop lays one over the shape's box (utils/psdVectors.js gradientField), or over
  // the document where it is not aligned with the layer.
  const field = gradientField(fill, fill.align === false ? { x: 0, y: 0, width, height } : box);
  const ramp = gradientRamp(fill, { mirrored: String(fill.style ?? fill.type) === 'reflected' });
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
    // A closed path returns to its start along its last curve; an open one is filled as if closed by
    // a straight line, no curve of its own ending there (psd-tools' reading; pen-text.psd's pen shape).
    if (!path.open) segment(knots[knots.length - 1], knots[0]);
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

// The blurred shape below which a gradient Outer Glow fades out (drawCast).
const GLOW_GRADIENT_FADE = 0.11;

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
 * adjustments }, styles, dissolve }`: `notDrawn` by layer name (an adjustment with what it is),
 * `closeTo` the styles and adjustments drawn only close to Photoshop's (a style with why, in brackets
 * after its name), `styles` every style drawn, `dissolve` the layers drawn with a Dissolve grain of
 * their own.
 */
export function compositePsd(layers, width, height, options = {}) {
  // A CMYK file's colours through its own profile while it is drawn (utils/iccProfile.js).
  const previous = options.cmykProfile ? useCmykProfile(options.cmykProfile) : undefined;
  try {
    // A 16- or 32-bit file's layers carry their colours at full precision (psdRead.js eightBit): it is
    // worked as a deep file unless the caller says.
    const linear = Boolean(options.linear);
    inLinear = linear;
    // (A Grayscale or CMYK file's type is blended plainly: not measured there.)
    inTextless = Boolean(options.grey || options.cmyk || options.lab || options.textGamma === false);
    return compositeLayers(layers, width, height, { ...options, deep: options.deep ?? hasPrecise(layers), linear });
  } finally {
    inLinear = false;
    inTextless = false;
    if (options.cmykProfile) useCmykProfile(previous);
  }
}

// A 32-bit file is put together in linear light, as Photoshop works one: its pixels taken there as they
// are drawn in, its styles' and adjustments' sRGB colours with them, and the whole taken back at the end.
let inLinear = false;
const toLight = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLight = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// Type's blending space (paintLayer): an sRGB colour in linear light, at a 1.45 gamma; and back.
const TEXT_GAMMA = 1.45;
const toTextSpace = (c) => toLight(clamp(c)) ** (1 / TEXT_GAMMA);
const fromTextSpace = (c) => fromLight(clamp(c) ** TEXT_GAMMA);
let inTextless = false;

const hasPrecise = (layers) => (layers ?? []).some((layer) => Boolean(layer.imageData?.precise) || hasPrecise(layer.children));

function compositeLayers(layers, width, height, { skip = () => false, styles = null, grey = false, cmyk = false, deep = false, linear = false, lab = false } = {}) {
  const notDrawn = { effects: [], adjustment: [] };
  // The styles drawn, by name; those only close to Photoshop's carry why after it, in brackets.
  const drawnStyles = new Set();
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
  // Advanced Blending's Channels: a layer that leaves a channel alone (blue unticked, say) is drawn in
  // full and that channel then put back as it was below it, the backdrop's share of it kept.
  const drawUnit = (dst, base, clipped, inherited, reach) => {
    const kept = (base.channelBlendingRestrictions ?? []).filter((c) => c >= 0 && c < 3);
    if (!kept.length) { drawUnitAll(dst, base, clipped, inherited, reach); return; }
    const before = Float32Array.from(dst);
    drawUnitAll(dst, base, clipped, inherited, reach);
    for (let d = 0; d < dst.length; d += 4) {
      const a = dst[d + 3];
      for (const c of kept) dst[d + c] = a > 0 ? Math.min(1, (before[d + c] * before[d + 3]) / a) : before[d + c];
    }
  };
  const drawUnitAll = (dst, base, clipped, inherited, reach) => {
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
        // An artboard (a group, Pass Through as Photoshop makes them) lays its background first.
        artboardBackground(dst, base);
        drawList(dst, base.children, 1, { shallow: knocksInside(base) ? Float32Array.from(dst) : null, deep: reach.deep });
        if (before) mix(dst, before, opacity, mask);
        return;
      }
      // Pass Through with layers clipped to it, or below 100% Fill: its layers still blend with what is
      // below, but its adjustments reach only the group's own pixels, and the group is then laid down as
      // a layer of its own, at its opacity and Fill, the layers clipped to it on it (psd-tools' reading,
      // which Photoshop's pictures of its test files bear out).
      if (mode === 'pass through') {
        // (Below 100% Fill, a group of layers in non-separable modes alone mixes its partly covered
        // pixels between the two readings: passThroughAlone.)
        const between = fill < 1 && !clipped.length && (base.children ?? []).every((child) => child.hidden || skip(child)
          || (!child.adjustment && !child.children && !child.clipping && Boolean(NON_SEPARABLE[String(child.blendMode ?? 'normal')])));
        const own = passThroughAlone(dst, base, between);
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
      compositeBuffer(dst, buffer, mode === 'pass through' ? 'normal' : mode, opacity * fill, blendIf(base));
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
    clipInto(buffer, shape, clipped, base);
    compositeBuffer(dst, buffer, mode, opacity, blendIf(base));
  };

  /**
   * A Pass Through group's layers drawn over what is below (`dst`, left as it is), their adjustments
   * kept to the group's own pixels so far, and the group then taken back off what is below: its own
   * colour and coverage, as a buffer to lay down as one layer.
   */
  const passThroughAlone = (dst, group, between = false) => {
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
      if (between && ag < 1) {
        // Where it only partly covers, Photoshop's colour is between that and the group's own colour
        // drawn on nothing, the second weighted by what the group leaves uncovered: (1 − α) / (2 − α)
        // of the way (passthrough_fill_blendmode.psd, a Lighter Color layer at 47 % Fill: every edge
        // pixel within its rounding, 4 % of pixels off to none).
        for (let k = 0; k < 3; k += 1) own[i + k] = (own[i + k] + (1 - ag) * solo[i + k]) / (2 - ag);
      }
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
  const clipInto = (buffer, shape, clipped, base = null) => {
    if (!clipped.length) return;
    for (let i = 0; i < shape.length; i += 1) buffer[i * 4 + 3] = shape[i] > 0 ? Math.min(1, buffer[i * 4 + 3] / shape[i]) : 0;
    for (const layer of clipped) drawClipped(buffer, layer);
    if (base) strokeOverClipped(buffer, base);
    for (let i = 0; i < shape.length; i += 1) buffer[i * 4 + 3] *= shape[i];
  };

  /**
   * A shape's own Stroke (not a layer style: the shape's stroke setting) stays over the layers clipped
   * to it, as a frame does round a picture clipped into it, and over its interior styles (overlays,
   * Satin, Inner Glow) (stroke-composite.psd). Its pixels hold the
   * stroke drawn over the fill; where both are one colour, each pixel's share of the stroke is how far
   * its colour has gone from the fill's toward the stroke's, Photoshop's own antialiasing, and the
   * stroke is laid back over what was clipped by that share.
   */
  const strokeOverClipped = (buffer, base) => {
    const stroke = base.vectorStroke;
    const data = base.imageData;
    if (!stroke || stroke.strokeEnabled === false || stroke.content?.type !== 'color' || base.vectorFill?.type !== 'color' || !data?.data?.length) return;
    const ink = psdRgb(stroke.content.color);
    const paint = psdRgb(base.vectorFill.color);
    const span = ink.map((v, k) => v - paint[k]);
    const across = span.reduce((sum, v) => sum + v * v, 0);
    if (across < 3 * 16 * 16) return; // too alike to tell apart
    const strength = Number(stroke.opacity ?? 1);
    const colour = ink.map((v) => (linear ? toLight(v / 255) : v / 255));
    const left = Math.round(base.left ?? 0); const top = Math.round(base.top ?? 0);
    for (let sy = 0; sy < data.height; sy += 1) {
      const y = top + sy;
      if (y < 0 || y >= height) continue;
      for (let sx = 0; sx < data.width; sx += 1) {
        const x = left + sx;
        if (x < 0 || x >= width) continue;
        const s = (sy * data.width + sx) * 4;
        if (!(data.data[s + 3] > 0)) continue;
        const share = clamp(((data.data[s] - paint[0]) * span[0] + (data.data[s + 1] - paint[1]) * span[1] + (data.data[s + 2] - paint[2]) * span[2]) / across) * strength;
        if (!(share > 0)) continue;
        const d = (y * width + x) * 4;
        for (let k = 0; k < 3; k += 1) buffer[d + k] += (colour[k] - buffer[d + k]) * share;
      }
    }
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
    // Its shape, which its styles are drawn from: its pixels' coverage, which for a shape layer filled
    // with a colour is Photoshop's own drawing of its path; a shape layer filled with a gradient or a
    // pattern, which may fade to nothing where the shape goes on, its path (Photoshop strokes that).
    const fadingFill = base.vectorFill && base.vectorFill.type !== 'color';
    const path = !isGroup(base) && fadingFill && !base.vectorMask?.disable ? vectorCoverage(base.vectorMask, width, height) : null;
    const pixelMask = path ? layerCoverage({ ...base, vectorMask: undefined }, width, height) : null;
    const shape = new Float32Array(width * height);
    let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const a = path ? Math.min(1, path[y * width + x]) * (pixelMask ? pixelMask(x, y) : 1) : own[(y * width + x) * 4 + 3];
        if (!(a > 0)) continue;
        shape[y * width + x] = a;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return;
    const fill = base.fillOpacity ?? 1;
    const effects = base.effects;

    // A layer's styles are worked on a frame reaching past the canvas as far as they reach, its shape
    // there its stored pixels and nothing beyond them. So a layer whose pixels stop at the canvas has an
    // edge there (an inside stroke on a layer the size of the canvas borders the picture, as Photoshop
    // draws it), and one whose pixels run on past it has none: an inside stroke on a shape bigger than
    // the canvas is seen along the shape's edge, past the canvas, and so not at all
    // (stroke-effect-transparent-shape.psd). A group's shape there is the union of its visible layers'
    // pixels (group-stroke-off-canvas.psd).
    const pictures = [];
    const gather = (layer) => {
      if (layer.hidden) return;
      if (isGroup(layer)) { for (const child of layer.children) gather(child); return; }
      if (layer.imageData?.data?.length && !layer.adjustment) pictures.push(layer);
    };
    gather(base);
    const over = pictures.length ? Math.ceil(styles.extent ? styles.extent(effects) : styles.reach(effects)) : 0;
    const ox = -over;
    const oy = -over;
    const frameWidth = width + 2 * over;
    const frameHeight = height + 2 * over;
    const framed = over > 0;
    /** Channel k of the stored pixels at document (X, Y), past the canvas: a layer's, or the union of a group's. */
    const stored = (X, Y, k) => {
      let alpha = 0; let colour = 0;
      for (const layer of pictures) {
        const data = layer.imageData;
        const sx = X - Math.round(layer.left ?? 0); const sy = Y - Math.round(layer.top ?? 0);
        if (sx < 0 || sy < 0 || sx >= data.width || sy >= data.height) continue;
        const a = data.data[(sy * data.width + sx) * 4 + 3] / 255;
        if (k < 3 && a > 0) colour = data.data[(sy * data.width + sx) * 4 + k] / 255;
        alpha = alpha + a - alpha * a;
      }
      return k === 3 ? alpha : colour;
    };
    let frame = shape;
    if (framed) {
      frame = new Float32Array(frameWidth * frameHeight);
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const X = x + ox; const Y = y + oy;
          const a = X >= 0 && Y >= 0 && X < width && Y < height ? shape[Y * width + X] : stored(X, Y, 3);
          frame[y * frameWidth + x] = a;
          if (a > 0) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
        }
      }
    }

    // Shadows and glows under it, each in its own blend mode, at the layer's opacity.
    const castsOver = [];
    const drawCast = (cast) => {
      const castMode = SEPARABLE[cast.mode] || NON_SEPARABLE[cast.mode] ? cast.mode : 'normal';
      const { separable, nonSeparable } = modeFunctions(castMode);
      const [r, g, b] = cast.rgb.map((v) => (linear ? toLight(v / 255) : v / 255));
      for (let y = 0; y < cast.height; y += 1) {
        for (let x = 0; x < cast.width; x += 1) {
          const a = cast.alpha[y * cast.width + x];
          if (!(a > 0)) continue;
          const X = cast.x + x + ox; const Y = cast.y + y + oy;
          if (X < 0 || Y < 0 || X >= width || Y >= height) continue;
          const d = (Y * width + X) * 4;
          if (cast.ramp) {
            // A glow along a gradient: its colour from the gradient, from the edge (the left end) out to
            // where the glow ends, at the gradient's opacity there (layer_params.psd: a faint far end
            // shows to the Size and stops there), and faded out where the blurred shape, before its
            // Range and Contour, falls below 0.11 (PhotoCraft's outer-glow-gradient.psd: read pixel by
            // pixel, full to there and then in proportion; 18 % of pixels off to 1.8).
            const [gr, gg, gb, ga] = cast.ramp(1 - a).map((v, k) => (k < 3 ? (linear ? toLight(v / 255) : v / 255) : v));
            const fade = cast.raw ? Math.min(1, cast.raw[y * cast.width + x] / GLOW_GRADIENT_FADE) : 1;
            blendStylePixel(dst, d, gr, gg, gb, fade * ga * cast.opacity * opacity, castMode, separable, nonSeparable);
          } else blendStylePixel(dst, d, r, g, b, a * cast.opacity * opacity, castMode, separable, nonSeparable);
        }
      }
      drawnStyles.add(cast.name);
    };
    for (const cast of styles.cast(frame, frameWidth, frameHeight, effects)) {
      // (A bevel's light outside the shape goes over the stroke's part beside it, below.)
      if (cast.overStroke) castsOver.push(cast); else drawCast(cast);
    }

    // The other styles into it, over its box and as far out as a stroke reaches.
    // (In the frame's coordinates, which are the document's moved by ox, oy.)
    const margin = styles.reach(effects);
    const box = { x: Math.max(0, x0 - ox - margin), y: Math.max(0, y0 - oy - margin) };
    box.width = Math.min(frameWidth - 1, x1 - ox + margin) - box.x + 1;
    box.height = Math.min(frameHeight - 1, y1 - oy + margin) - box.y + 1;
    const { anchor, bounds } = styleGeometry(base);
    const beside = [];
    const drawInto = (some) => {
      const pixels = new Uint8Array(box.width * box.height * 4);
      const part = new Float32Array(box.width * box.height);
      const onCanvas = (X, Y) => X >= 0 && Y >= 0 && X < width && Y < height;
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const X = box.x + x + ox; const Y = box.y + y + oy;
          const p = y * box.width + x;
          part[p] = frame[(box.y + y) * frameWidth + box.x + x];
          for (let k = 0; k < 4; k += 1) pixels[p * 4 + k] = Math.round(clamp(onCanvas(X, Y) ? (linear && k < 3 ? fromLight(clamp(own[(Y * width + X) * 4 + k])) : own[(Y * width + X) * 4 + k]) : stored(X, Y, k)) * 255);
        }
      }
      const drawn = styles.draw(pixels, part, box.width, box.height, some, { left: box.x + ox, top: box.y + oy, anchor, bounds, document: { width, height }, beside });
      if (!drawn.length) return;
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const X = box.x + x + ox; const Y = box.y + y + oy;
          if (!onCanvas(X, Y)) continue;
          const p = y * box.width + x;
          for (let k = 0; k < 4; k += 1) own[(Y * width + X) * 4 + k] = linear && k < 3 ? toLight(pixels[p * 4 + k] / 255) : pixels[p * 4 + k] / 255;
        }
      }
      for (const name of drawn) drawnStyles.add(name);
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
    // A shape's own Stroke over those, under the edge styles (stroke-composite.psd: its red stroke over
    // a Gradient Overlay, under a Stroke style).
    strokeOverClipped(own, base);
    drawInto(withOnly(effects, EDGE_STYLES));
    // A stroke's part beside the layer, before the layer goes on and in its own mode: at t / (1 −
    // covered), so that with the layer over it the two add up (psd-tools' reading; covered is the
    // layer's finished alpha, its Fill and inner styles in it).
    for (const band of beside) {
      const { separable, nonSeparable } = modeFunctions(SEPARABLE[band.mode] || NON_SEPARABLE[band.mode] ? band.mode : 'normal');
      const bandMode = SEPARABLE[band.mode] || NON_SEPARABLE[band.mode] ? band.mode : 'normal';
      for (let y = 0; y < band.height; y += 1) {
        for (let x = 0; x < band.width; x += 1) {
          const t = band.alpha[y * band.width + x];
          if (!(t > 0)) continue;
          const X = band.x + x; const Y = band.y + y;
          if (X < 0 || Y < 0 || X >= width || Y >= height) continue;
          const d = (Y * width + X) * 4;
          const covered = own[d + 3];
          if (covered >= 1) continue;
          const j = (y * band.width + x) * 3;
          const a = Math.min(1, t / (1 - covered)) * band.opacity * opacity;
          const lit = (v) => (linear ? toLight(v / 255) : v / 255);
          blendStylePixel(dst, d, lit(band.rgb[j]), lit(band.rgb[j + 1]), lit(band.rgb[j + 2]), a, bandMode, separable, nonSeparable);
        }
      }
    }
    for (const cast of castsOver) drawCast(cast);
    compositeBuffer(dst, own, mode === 'pass through' ? 'normal' : mode, opacity, blendIf(base));
  };

  /**
   * An adjustment layer: what it does to `dst` (everything under it in its group, or the layer it is
   * clipped to), by its opacity and Fill and its masks, its result blended in its own blend mode.
   */
  const adjustBelow = (dst, layer, inherited, within = null) => {
    const fn = adjustmentFunction(layer.adjustment, closeAdjustments, { grey, cmyk, deep, linear, lab });
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
        const direct = linear && !fn.encoded;
        const at = (v) => (linear && !direct ? fromLight(clamp(v)) : clamp(v));
        const r0 = Math.round(at(dst[d]) * 255);
        const g0 = Math.round(at(dst[d + 1]) * 255);
        const b0 = Math.round(at(dst[d + 2]) * 255);
        const key = (r0 << 16) | (g0 << 8) | b0;
        let out = fn.fine || direct ? null : known.get(key);
        if (direct) {
          const [r, g, b] = fn([at(dst[d]) * 255, at(dst[d + 1]) * 255, at(dst[d + 2]) * 255]);
          out = [clamp(r / 255), clamp(g / 255), clamp(b / 255)];
        } else if (fn.fine) {
          const [r, g, b] = fn([at(dst[d]) * 255, at(dst[d + 1]) * 255, at(dst[d + 2]) * 255]);
          out = [clamp(r / 255), clamp(g / 255), clamp(b / 255)].map((v) => (linear ? toLight(v) : v));
        } else if (!out) {
          const [r, g, b] = fn([r0, g0, b0]);
          out = [clamp(r / 255), clamp(g / 255), clamp(b / 255)].map((v) => (linear ? toLight(v) : v));
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
  for (let i = 0; i < canvas.length; i += 1) pixels[i] = Math.round(clamp(linear && i % 4 !== 3 ? fromLight(clamp(canvas[i])) : canvas[i]) * 255);
  for (const key of Object.keys(notDrawn)) notDrawn[key] = [...new Set(notDrawn[key])];
  return {
    pixels,
    painted,
    notDrawn,
    closeTo: { styles: [...drawnStyles].filter((name) => name.includes('(')), adjustments: [...closeAdjustments] },
    styles: [...drawnStyles],
    dissolve: [...new Set(dissolve)],
  };
}

/**
 * A Lab file flattened on its own L, a and b, as Photoshop flattens it: Normal layers mixed on the stored
 * values (a layer's opacity, its masks' and its edges' share mixing L, a and b each), the adjustments
 * Photoshop works there on them (psdAdjustments.js labAdjustment), then made RGB. The layers need their
 * stored values (utils/psdRead.js keeps them as `labPlanes`). As compositePsd, or null where the file has
 * something this does not work on L, a and b (another blend mode, a layer style, another adjustment),
 * which the RGB flattening draws instead.
 */
export function compositeLab(layers, width, height, options = {}) {
  let stored = false;
  const fits = (list) => (list ?? []).every((layer) => {
    if (layer.hidden || options.skip?.(layer)) return true;
    if (layer.labPlanes) stored = true;
    const mode = String(layer.blendMode ?? 'normal');
    if (mode !== 'normal' && !(mode === 'pass through' && layer.children)) return false;
    if (hasEffects(layer)) return false;
    if (layer.adjustment) return labAdjustment(layer.adjustment);
    if (layer.imageData && !layer.labPlanes) return false;
    return fits(layer.children);
  });
  const drawn = (list) => (list ?? []).some((layer) => !layer.hidden && !options.skip?.(layer) && (layer.vectorFill || drawn(layer.children)));
  if (!fits(layers) || !(stored || drawn(layers))) return null;
  const tree = (list) => (list ?? []).map((layer) => {
    const out = { ...layer };
    if (layer.children) out.children = tree(layer.children);
    if (layer.labPlanes && layer.imageData) out.imageData = { ...layer.imageData, data: layer.labPlanes.lab, precise: layer.labPlanes.precise };
    return out;
  });
  labPlaneColours(true);
  let flat;
  try {
    flat = compositePsd(tree(layers), width, height, { ...options, lab: true, linear: false });
  } finally {
    labPlaneColours(false);
  }
  const pixels = new Uint8Array(flat.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = labToRgb((flat.pixels[i] * 100) / 255, flat.pixels[i + 1] - 128, flat.pixels[i + 2] - 128);
    pixels[i] = Math.round(r); pixels[i + 1] = Math.round(g); pixels[i + 2] = Math.round(b); pixels[i + 3] = flat.pixels[i + 3];
  }
  return { ...flat, pixels };
}

// The adjustments that change each ink on its own, which is all Photoshop does with them in CMYK.
const INK_ADJUSTMENTS = new Set(['invert', 'posterize', 'levels', 'curves', 'brightness/contrast', 'hue/saturation', 'color balance']);
// Of those, the ones Photoshop works on cyan, magenta and yellow as an RGB colour's complement (the
// stored values), black left as it is: Hue/Saturation (not Colorize, which separates again) and Color
// Balance (PhotoCraft's finding, MIT OR Apache-2.0: its cmyk8 and cmyk16 hue-saturation.psd).
const CMY_ONLY = new Set(['hue/saturation', 'color balance']);

/**
 * A CMYK file flattened on its inks, as Photoshop flattens it: its cyan, magenta and yellow and its
 * black each flattened on their own, the blend modes and adjustments working on the stored inks, then
 * made RGB as a press profile shows them (cmykToRgb); an adjustment that works on the four inks
 * together, at the top of the file, on the flattened inks under it. The layers need their inks
 * (utils/psdRead.js keeps them as `inkPlanes`); a file of fills alone gives its colours as inks. As
 * compositePsd, or null where the file has something with no rule on the inks (a Photo Filter, or a
 * whole-colour adjustment inside a group), which the RGB flattening draws instead.
 */
export function compositeInks(layers, width, height, options = {}) {
  // An adjustment that works on a pixel's four inks together (Threshold, Channel Mixer, Gradient Map,
  // Selective Color, Colorize: psdAdjustments.js inkAdjustmentFunction), at the top level of the file:
  // what is under it flattened on the inks first, then each pixel's inks through it, as Photoshop works
  // it (threshold_cmyk.psd: 0.09% of pixels apart, where any profile's colours put 6-8% on the wrong
  // side); the rest drawn on over that, on the inks.
  const at = (layers ?? []).findIndex((layer) => !layer.hidden && !options.skip?.(layer) && inkAdjustmentFunction(layer.adjustment));
  if (at >= 0 && String(layers[at].blendMode ?? 'normal') === 'normal' && !layers[at].clipping) {
    const below = inkPlanesOf(layers.slice(0, at), width, height, options);
    if (!below) return null;
    const { cmy, k } = below;
    const layer = layers[at];
    const fn = inkAdjustmentFunction(layer.adjustment);
    const mask = layerCoverage(layer, width, height);
    const opacity = (layer.opacity ?? 1) * (layer.fillOpacity ?? 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const strength = opacity * (mask ? mask(x, y) : 1);
        if (!(strength > 0) || cmy[i + 3] === 0) continue;
        const inks = fn([1 - cmy[i] / 255, 1 - cmy[i + 1] / 255, 1 - cmy[i + 2] / 255, 1 - k[i] / 255]);
        for (let c = 0; c < 3; c += 1) cmy[i + c] += (255 * (1 - inks[c]) - cmy[i + c]) * strength;
        k[i] += (255 * (1 - inks[3]) - k[i]) * strength;
      }
    }
    const flat = { name: 'flattened', left: 0, top: 0, right: width, bottom: height, blendMode: 'normal', opacity: 1,
      imageData: { width, height, data: Uint8ClampedArray.from(cmy) },
      inkPlanes: { cmy: Uint8ClampedArray.from(cmy), k: Uint8ClampedArray.from(k) } };
    return compositeInks([flat, ...layers.slice(at + 1)], width, height, options);
  }
  const planes = inkPlanesOf(layers, width, height, options);
  if (!planes) return null;
  const pixels = new Uint8Array(planes.cmy.length);
  const convert = options.cmykProfile ?? cmykToRgb;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = convert(1 - planes.cmy[i] / 255, 1 - planes.cmy[i + 1] / 255, 1 - planes.cmy[i + 2] / 255, 1 - planes.k[i] / 255);
    pixels[i] = Math.round(r); pixels[i + 1] = Math.round(g); pixels[i + 2] = Math.round(b); pixels[i + 3] = planes.cmy[i + 3];
  }
  return { ...planes.result, pixels };
}

/**
 * The layers flattened on their inks: `{ cmy, k, result }`, cyan, magenta and yellow as stored (255 no
 * ink, alpha in the fourth byte) and black likewise in its first, `result` compositePsd's report; or
 * null where something works on whole colours.
 */
function inkPlanesOf(layers, width, height, options = {}) {
  let inks = false;
  const fits = (list) => (list ?? []).every((layer) => {
    if (layer.hidden || options.skip?.(layer)) return true;
    if (layer.inkPlanes) inks = true;
    if (layer.adjustment && !INK_ADJUSTMENTS.has(layer.adjustment.type)) return false;
    if (layer.adjustment?.type === 'hue/saturation' && layer.adjustment.master?.a) return false;
    // (Blend modes all work on the inks, Hue to Luminosity too: on black alone they keep its value or
    // take the layer's, as Photoshop's CMYK test file shows.)
    return fits(layer.children);
  });
  // (A file of fills alone works on the inks too: its colours given as inks, its gradients mixing them.)
  const drawn = (list) => (list ?? []).some((layer) => !layer.hidden && !options.skip?.(layer) && (layer.vectorFill || drawn(layer.children)));
  if (!fits(layers) || !(inks || drawn(layers))) return null;
  const tree = (list, plane) => (list ?? []).map((layer) => {
    const out = { ...layer };
    if (layer.children) out.children = tree(layer.children, plane);
    if (layer.inkPlanes && layer.imageData) {
      let data = layer.inkPlanes.cmy;
      // (A 16-bit file's inks at their full precision too, where the reader kept them.)
      let precise = layer.inkPlanes.cmyPrecise ?? null;
      if (plane === 'k') {
        data = new Uint8ClampedArray(data.length);
        const k = layer.inkPlanes.k;
        const fine = layer.inkPlanes.kPrecise;
        precise = precise && fine ? new Uint16Array(data.length) : null;
        for (let i = 0; i < data.length; i += 4) {
          const v = k ? k[i] : 255;
          data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = layer.inkPlanes.cmy[i + 3];
          if (precise) { precise[i] = fine[i]; precise[i + 1] = fine[i]; precise[i + 2] = fine[i]; precise[i + 3] = layer.inkPlanes.cmyPrecise[i + 3]; }
        }
      }
      out.imageData = { ...layer.imageData, data, precise: precise ?? undefined };
    }
    // Curves and Levels: cyan, magenta and yellow as red, green and blue; black on its own.
    const adjustment = layer.adjustment;
    if (plane === 'k' && (adjustment?.type === 'curves' || adjustment?.type === 'levels')) {
      out.adjustment = { type: adjustment.type, rgb: adjustment.rgb, red: adjustment.black, green: adjustment.black, blue: adjustment.black };
    }
    if (plane === 'k' && CMY_ONLY.has(adjustment?.type)) out.adjustment = { type: 'curves' };
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
  return { cmy: Float32Array.from(cmy.pixels), k: Float32Array.from(black), result: cmy };
}

/** A blend mode's neutral colour (0..1), where it has one; for layer styles (blendStylePixel). */
export function neutralOf(mode) {
  return SEPARABLE[mode] ? NEUTRAL[mode] : undefined;
}

/** One channel of `mode` (for tests and for anybody checking a formula). */
export function blendChannel(mode, backdrop, source) {
  return SEPARABLE[mode]?.(backdrop, source);
}

/** A whole colour through `mode` (0..1 each), separable or not; undefined for a mode this has not. */
export function blendColour(mode, backdrop, source) {
  if (SEPARABLE[mode]) return backdrop.map((b, c) => SEPARABLE[mode](b, source[c]));
  return NON_SEPARABLE[mode]?.(backdrop, source);
}
