/**
 * psdComposite.js — Photoshop's layers flattened the way Photoshop flattens them, closely enough for
 * a panel background.
 *
 * What it draws:
 *
 *   - Every blend mode Photoshop has but Dissolve, which is random by design (it is drawn as Normal and
 *     reported). The separable modes use Photoshop's own formulas, which match the W3C compositing
 *     spec except for Soft Light, where Photoshop's curve differs and is the one used. Hue, Saturation,
 *     Color and Luminosity use the spec's SetLum/SetSat, which is how Photoshop describes them.
 *   - Opacity and Fill opacity, a group's on everything inside it.
 *   - Knockout (Blending Options): where a knockout layer or group covers, what is under it gives way,
 *     by its opacity, to the backdrop its group began with (Shallow: clear in a group drawn on its own,
 *     what was under a Pass Through group) or to the Background layer (Deep: through Pass Through groups
 *     only, a group drawn on its own stopping it as Shallow; clear without a Background), and it is
 *     drawn there with its Fill opacity. A Fill of 0 cuts a hole.
 *   - Layer masks, from their own pixels, with the mask's default colour outside its rectangle and its
 *     density. A disabled mask is ignored, as Photoshop ignores it.
 *   - Clipping masks: a clipped layer is drawn only where the layer it clips to has pixels, and
 *     blends with that layer rather than with what lies under it (Photoshop's default, "Blend Clipped
 *     Layers as Group").
 *   - Groups: Pass Through paints its layers straight onto what is below; any other mode, Normal
 *     included, composites the group on its own first and then blends the result, as Photoshop does.
 *
 *   - A fill layer saved without pixels (a shape, a Color or Gradient Fill): its colour or gradient
 *     (Photoshop's styles and angle, across the layer's box) inside its vector mask, the mask's paths
 *     filled and joined by their operations.
 *
 * What it does not, and says so by layer name (`notDrawn`): layer effects (shadows, glows, strokes —
 * Photoshop does not store them as pixels), a vector mask on a layer of pixels, adjustment layers
 * (they have no pixels; they change the ones below), and Dissolve's noise.
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

import { psdRgb } from './psdAdjustments.js';
import { psdGradient } from './psdVectors.js';

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
  'vivid light': (b, s) => (s <= 0.5 ? colorBurn(b, 2 * s) : colorDodge(b, 2 * (s - 0.5))),
  'linear light': (b, s) => clamp(b + 2 * s - 1),
  'pin light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'hard mix': (b, s) => (b + s >= 1 ? 1 : 0),
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
  const separable = SEPARABLE[mode];
  const nonSeparable = separable ? null : NON_SEPARABLE[mode] ?? SEPARABLE.normal;
  for (let d = 0; d < dst.length; d += 4) {
    const sa = src[d + 3] * opacity;
    if (sa > 0) blendPixel(dst, d, src[d], src[d + 1], src[d + 2], sa, mode, separable, nonSeparable);
  }
}

/** The mask's value (0..1) at document pixel (x, y), or 1 when the layer has no usable mask. */
export function layerMaskSampler(layer) {
  return maskSampler(layer);
}

function maskSampler(layer) {
  const mask = layer.mask;
  if (!mask || mask.disabled || mask.fromVectorData) return null;
  const data = mask.imageData;
  const left = Math.round(mask.left ?? 0);
  const top = Math.round(mask.top ?? 0);
  const width = data?.width ?? 0;
  const height = data?.height ?? 0;
  const outside = (mask.defaultColor ?? 0) / 255;
  const density = mask.userMaskDensity ?? 1;
  // A density below 100% lets the hidden part show through by that much.
  const shape = (v) => 1 - density * (1 - v);
  return (x, y) => {
    const mx = x - left;
    const my = y - top;
    if (!data?.data || mx < 0 || my < 0 || mx >= width || my >= height) return shape(outside);
    return shape(data.data[(my * width + mx) * 4] / 255);
  };
}

/** Paint a raster layer's pixels into `dst` (document-sized) with `mode` at `alpha`. */
function paintLayer(dst, width, height, layer, mode, alpha) {
  // A fill layer saved without its pixels (a shape, a Color or Gradient Fill): drawn from its fill and
  // its vector mask, over the whole document.
  const own = layer.imageData?.data?.length ? layer.imageData : null;
  const src = own ?? fillPicture(layer, width, height);
  if (!src?.data?.length || alpha <= 0) return false;
  const mask = maskSampler(layer);
  const separable = SEPARABLE[mode];
  const nonSeparable = separable ? null : NON_SEPARABLE[mode] ?? SEPARABLE.normal;
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
      if (sa <= 0) continue;
      blendPixel(dst, (y * width + x) * 4, src.data[s] / 255, src.data[s + 1] / 255, src.data[s + 2] / 255,
        sa, mode, separable, nonSeparable);
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
  const paint = box ? fillPaint(layer.vectorFill, box) : null;
  if (paint) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = box.y; y < box.y + box.height; y += 1) {
      for (let x = box.x; x < box.x + box.width; x += 1) {
        const c = coverage ? coverage[y * width + x] : 1;
        if (c <= 0) continue;
        const [r, g, b, a] = paint(x + 0.5, y + 0.5);
        const i = (y * width + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(255 * a * Math.min(1, c));
      }
    }
    picture = { width, height, data };
  }
  drawnFills.set(layer, { key, picture });
  return picture;
}

/** What a fill paints at a point: a colour, or a gradient across `box` as CEditor draws one. */
function fillPaint(fill, box) {
  if (fill.type === 'color') {
    const [r, g, b] = psdRgb(fill.color);
    return () => [r, g, b, 1];
  }
  const gradient = fill.type === 'pattern' ? null : psdGradient(fill);
  if (!gradient) return null;
  const stops = gradient.stops.map((stop) => ({
    t: stop.position / 100,
    a: parseInt(stop.color.slice(0, 2), 16) / 255,
    rgb: [2, 4, 6].map((i) => parseInt(stop.color.slice(i, i + 2), 16)),
  }));
  const at = (t) => {
    if (t <= stops[0].t) return [...stops[0].rgb, stops[0].a];
    for (let i = 1; i < stops.length; i += 1) {
      if (t <= stops[i].t) {
        const k = (t - stops[i - 1].t) / Math.max(1e-6, stops[i].t - stops[i - 1].t);
        return [...stops[i - 1].rgb.map((v, c) => v + (stops[i].rgb[c] - v) * k), stops[i - 1].a + (stops[i].a - stops[i - 1].a) * k];
      }
    }
    const last = stops[stops.length - 1];
    return [...last.rgb, last.a];
  };
  // Photoshop's geometry, aligned with the layer: the line through the box's centre at the angle
  // (counter-clockwise from the right), as long as the box is across it, times the scale.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const theta = ((Number(fill.angle) || 0) * Math.PI) / 180;
  const ux = Math.cos(theta);
  const uy = -Math.sin(theta);
  const length = ((Math.abs(box.width * ux) + Math.abs(box.height * uy)) || 1) * ((Number(fill.scale) || 100) / 100);
  const half = length / 2;
  const style = String(fill.style ?? 'linear');
  return (x, y) => {
    const px = x - cx;
    const py = y - cy;
    const along = px * ux + py * uy;
    const across = -px * uy + py * ux;
    let t;
    if (style === 'reflected') t = Math.abs(along) / half;
    else if (style === 'radial') t = Math.hypot(px, py) / half;
    else if (style === 'diamond') t = (Math.abs(along) + Math.abs(across)) / half;
    else if (style === 'angle') t = (((Math.atan2(-py, px) - theta) / (2 * Math.PI)) % 1 + 1) % 1;
    else t = along / length + 0.5;
    const [r, g, b, a] = at(Math.max(0, Math.min(1, t)));
    return [r, g, b, a];
  };
}

/**
 * A vector mask as coverage of the document's pixels (0 to 1), or null where it shows everything: each
 * path filled (non-zero), joined to those before by its operation, as Photoshop combines them.
 */
function vectorCoverage(vectorMask, width, height) {
  const paths = (vectorMask?.paths ?? []).filter((path) => (path.knots ?? []).length >= 2);
  if (!paths.length) {
    if (vectorMask?.invert) return new Float32Array(width * height);
    return null;
  }
  let result = vectorMask.fillStartsWithAllPixels ? new Float32Array(width * height).fill(1) : null;
  for (const path of paths) {
    const p = pathCoverage(path, width, height);
    if (!result) { result = path.operation === 'subtract' ? new Float32Array(width * height) : p; continue; }
    for (let i = 0; i < result.length; i += 1) {
      const a = result[i];
      const b = p[i];
      switch (path.operation) {
        case 'subtract': result[i] = a * (1 - b); break;
        case 'intersect': result[i] = a * b; break;
        case 'exclude': result[i] = a + b - 2 * a * b; break;
        default: result[i] = a + b - a * b;
      }
    }
  }
  if (vectorMask.invert) for (let i = 0; i < result.length; i += 1) result[i] = 1 - result[i];
  return result;
}

/** One path of a vector mask as coverage: its Béziers flattened, filled non-zero, four rows a pixel. */
function pathCoverage(path, width, height) {
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
  const out = new Float32Array(width * height);
  const ys = points.map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const ROWS = 4;
  for (let y = top; y <= bottom; y += 1) {
    for (let k = 0; k < ROWS; k += 1) {
      const sy = y + (k + 0.5) / ROWS;
      const crossings = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) crossings.push({ x: x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), w: y1 > y0 ? 1 : -1 });
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i += 1) {
        winding += crossings[i].w;
        if (!winding) continue;
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
// Inside a group drawn on its own, a knockout reaches only its clear start.
const CLEAR = Object.freeze({ shallow: null, deep: null });

function hasEffects(layer) {
  return Boolean(layer.effects && !layer.effects.disabled && Object.values(layer.effects).some((effect) =>
    effect && typeof effect === 'object'
    && (Array.isArray(effect) ? effect.some((e) => e?.enabled !== false) : effect.enabled !== false)));
}

/**
 * Flatten `layers` (ag-psd's `children`, bottom first) into a `width` × `height` image.
 * `skip(layer)` leaves a layer and everything in it out (the importer's placeholder group).
 *
 * `{ pixels: Uint8Array RGBA, painted, notDrawn: { effects, vectorMask, adjustment, dissolve } }`,
 * each `notDrawn` list holding layer names.
 */
export function compositePsd(layers, width, height, { skip = () => false } = {}) {
  const notDrawn = { effects: [], vectorMask: [], adjustment: [], dissolve: [] };
  let painted = 0;

  const modeOf = (layer) => {
    const mode = String(layer.blendMode ?? 'normal');
    if (mode === 'dissolve') { notDrawn.dissolve.push(layer.name || 'unnamed'); return 'normal'; }
    return SEPARABLE[mode] || NON_SEPARABLE[mode] || mode === 'pass through' ? mode : 'normal';
  };

  const note = (layer) => {
    const name = layer.name || 'unnamed';
    if (hasEffects(layer)) notDrawn.effects.push(name);
    // (A fill layer with no pixels is drawn from its vector mask: fillPicture.)
    const drawnFromVectors = layer.vectorFill && !(layer.imageData?.width > 0) && layer.vectorFill.type !== 'pattern';
    if (layer.vectorMask && !drawnFromVectors && !(layer.mask?.imageData && !layer.mask.fromVectorData)) notDrawn.vectorMask.push(name);
    if (layer.adjustment) notDrawn.adjustment.push(name);
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
      drawUnit(shape, { ...base, opacity: 1, fillOpacity: 1, blendMode: 'normal', knockoutLevel: 0, knockout: false }, [], 1, CLEAR);
      knock(dst, shape, opacity, level >= 2 ? reach.deep : reach.shallow);
    }

    if (isGroup(base)) {
      if (mode === 'pass through' && !clipped.length && !maskSampler(base)) {
        // Straight onto what is below; a shallow knockout inside gives way to what was there.
        drawList(dst, base.children, opacity * fill, { shallow: knocksInside(base) ? Float32Array.from(dst) : null, deep: reach.deep });
        return;
      }
      // Isolated: the group on its own, then blended in as one layer would be.
      const buffer = new Float32Array(dst.length);
      drawList(buffer, base.children, 1, CLEAR);
      applyMask(buffer, base);
      for (const layer of clipped) drawClipped(buffer, layer);
      compositeBuffer(dst, buffer, mode === 'pass through' ? 'normal' : mode, opacity * fill);
      return;
    }

    if (!clipped.length) {
      if (paintLayer(dst, width, height, base, mode, opacity * (base.fillOpacity ?? 1))) painted += 1;
      return;
    }
    // A clipping group: the base on its own, the clipped layers blended into it where it has pixels,
    // then the whole blended in with the base's mode and opacity.
    const buffer = new Float32Array(dst.length);
    if (paintLayer(buffer, width, height, base, 'normal', base.fillOpacity ?? 1)) painted += 1;
    for (const layer of clipped) drawClipped(buffer, layer);
    compositeBuffer(dst, buffer, mode, opacity);
  };

  /** A clipped layer into its base's buffer: its own mode, but never beyond the base's coverage. */
  const drawClipped = (buffer, layer) => {
    if (layer.hidden || skip(layer)) return;
    note(layer);
    const coverage = new Float32Array(buffer.length / 4);
    for (let i = 0; i < coverage.length; i += 1) coverage[i] = buffer[i * 4 + 3];
    const mode = modeOf(layer);
    const opacity = (layer.opacity ?? 1);
    if (isGroup(layer)) {
      const inner = new Float32Array(buffer.length);
      drawList(inner, layer.children, 1, CLEAR);
      applyMask(inner, layer);
      compositeBuffer(buffer, inner, mode === 'pass through' ? 'normal' : mode, opacity);
    } else if (paintLayer(buffer, width, height, layer, mode, opacity * (layer.fillOpacity ?? 1))) {
      painted += 1;
    }
    // Source-atop: whatever the clipped layer added outside the base, or added to its alpha, goes.
    for (let i = 0; i < coverage.length; i += 1) buffer[i * 4 + 3] = coverage[i];
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

  const applyMask = (buffer, layer) => {
    const mask = maskSampler(layer);
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
  return { pixels, painted, notDrawn };
}

/** One channel of `mode` (for tests and for anybody checking a formula). */
export function blendChannel(mode, backdrop, source) {
  return SEPARABLE[mode]?.(backdrop, source);
}
