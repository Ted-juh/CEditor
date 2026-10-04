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
 *   - Opacity and Fill opacity, and a group's opacity on everything inside it.
 *   - Layer masks, from their own pixels, with the mask's default colour outside its rectangle and its
 *     density. A disabled mask is ignored, as Photoshop ignores it.
 *   - Clipping masks: a clipped layer is drawn only where the layer it clips to has pixels, and
 *     blends with that layer rather than with what lies under it (Photoshop's default, "Blend Clipped
 *     Layers as Group").
 *   - Groups: Pass Through paints its layers straight onto what is below; any other mode, Normal
 *     included, composites the group on its own first and then blends the result, as Photoshop does.
 *
 * What it does not, and says so by layer name (`notDrawn`): layer effects (shadows, glows, strokes —
 * Photoshop does not store them as pixels), vector masks (paths, not pixels), adjustment layers (they
 * have no pixels; they change the ones below), and Dissolve's noise.
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
  const src = layer.imageData;
  if (!src?.data?.length || alpha <= 0) return false;
  const mask = maskSampler(layer);
  const separable = SEPARABLE[mode];
  const nonSeparable = separable ? null : NON_SEPARABLE[mode] ?? SEPARABLE.normal;
  const left = Math.round(layer.left ?? 0);
  const top = Math.round(layer.top ?? 0);
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
    if (layer.vectorMask && !(layer.mask?.imageData && !layer.mask.fromVectorData)) notDrawn.vectorMask.push(name);
    if (layer.adjustment) notDrawn.adjustment.push(name);
  };

  /** One layer (or group) and the clipped layers riding on it, into `dst`, scaled by `inherited`. */
  const drawUnit = (dst, base, clipped, inherited) => {
    const opacity = inherited * (base.opacity ?? 1);
    const mode = modeOf(base);

    if (isGroup(base)) {
      if (mode === 'pass through' && !clipped.length && !maskSampler(base)) {
        drawList(dst, base.children, opacity);   // straight onto what is below
        return;
      }
      // Isolated: the group on its own, then blended in as one layer would be.
      const buffer = new Float32Array(dst.length);
      drawList(buffer, base.children, 1);
      applyMask(buffer, base);
      for (const layer of clipped) drawClipped(buffer, layer);
      compositeBuffer(dst, buffer, mode === 'pass through' ? 'normal' : mode, opacity);
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
      drawList(inner, layer.children, 1);
      applyMask(inner, layer);
      compositeBuffer(buffer, inner, mode === 'pass through' ? 'normal' : mode, opacity);
    } else if (paintLayer(buffer, width, height, layer, mode, opacity * (layer.fillOpacity ?? 1))) {
      painted += 1;
    }
    // Source-atop: whatever the clipped layer added outside the base, or added to its alpha, goes.
    for (let i = 0; i < coverage.length; i += 1) buffer[i * 4 + 3] = coverage[i];
  };

  /** A layer stack, bottom first, gathering each base with the clipped layers above it. */
  const drawList = (dst, list, inherited) => {
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
      drawUnit(dst, base, clipped, inherited);
    }
  };

  const applyMask = (buffer, layer) => {
    const mask = maskSampler(layer);
    if (!mask) return;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) buffer[(y * width + x) * 4 + 3] *= mask(x, y);
    }
  };

  const canvas = new Float32Array(width * height * 4);
  drawList(canvas, layers, 1);

  const pixels = new Uint8Array(canvas.length);
  for (let i = 0; i < canvas.length; i += 1) pixels[i] = Math.round(clamp(canvas[i]) * 255);
  for (const key of Object.keys(notDrawn)) notDrawn[key] = [...new Set(notDrawn[key])];
  return { pixels, painted, notDrawn };
}

/** One channel of `mode` (for tests and for anybody checking a formula). */
export function blendChannel(mode, backdrop, source) {
  return SEPARABLE[mode]?.(backdrop, source);
}
