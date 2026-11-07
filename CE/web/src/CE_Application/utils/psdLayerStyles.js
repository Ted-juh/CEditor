// psdLayerStyles.js — Photoshop's layer styles, for the Photoshop component import.
//
// Photoshop keeps a layer style as settings and draws it when it shows the layer; the file holds no
// pixels for it. The import (utils/psdComponentImport.js) does two things with them:
//
//   kept, and editable    a Drop Shadow and an Outer Glow become the layer's own shadows, which a
//                         picture layer casts from its pixels (utils/partMask.js), a vector layer from
//                         its outline; their colour, offset and size stay settings
//   drawn into the pixels  Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay
//                         and Bevel & Emboss, from the layer's shape
//
// Drawn as Photoshop draws them, each measured against its own pictures of psd-tools' test files
// (layer_effects.psd holds one style a layer): the shadows, glows, Satin and Bevel are the shape
// blurred as Photoshop blurs it (SIZE_SIGMA below), a Stroke a band of the shape's signed distance
// (psd-tools' reading). What was not measured (Soften, a Contour on a Chisel bevel or an Emboss, a
// Precise glow, Noise) is drawn by the same readings and named after the style, in brackets, so the
// import can say so.
//
// Interior styles are drawn at full strength whatever the layer's Fill opacity, as Photoshop draws
// them; a layer at Fill 0% with a Color Overlay shows the overlay.
//
// The panel import's flattening (utils/psdComposite.js) draws them all: the shadows and glows cast
// under the layer (castShadows), the rest into its pixels (drawLayerStyles). It takes both as
// LAYER_STYLES, since this module draws with its blend modes.

import { blendChannel, neutralOf } from './psdComposite.js';
import { contourTable, gradientRamp, psdRgb } from './psdAdjustments.js';
import { blur } from './gaussianBlur.js';
import { gradientField, patternSampler, scaleOf } from './psdVectors.js';

const INF = 1e20;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A Photoshop length (`{ units, value }`) in pixels. */
export function pxOf(length, fallback = 0) {
  if (length == null) return fallback;
  if (typeof length === 'number') return length;
  const value = Number(length.value);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q += 1) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k -= 1; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k += 1; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}

/** The distance from each pixel to the nearest pixel where `seed(i)` holds (Felzenszwalb's exact EDT). */
function distanceTo(seed, width, height) {
  const out = new Float32Array(width * height);
  const n = Math.max(width, height);
  const f = new Float64Array(n); const d = new Float64Array(n); const v = new Int32Array(n); const z = new Float64Array(n + 1);
  for (let i = 0; i < out.length; i += 1) out[i] = seed(i) ? 0 : INF;
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = out[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y += 1) out[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) f[x] = out[y * width + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x += 1) out[y * width + x] = Math.sqrt(d[x]);
  }
  return out;
}

/**
 * The signed distance from each pixel to a shape's edge (negative inside), the edge read off the
 * shape's coverage as Photoshop reads it (psd-tools' finding, #799): a partly covered pixel says the
 * edge runs 0.5 − coverage from its centre, and a hard step from clear to covered puts it half a pixel
 * from each side. Every other pixel measures to the nearest of those across the edge from it (below),
 * found by a two-pass sweep that carries the nearest edge pixel along (Danielsson's), in time linear
 * in the pixels.
 */
function signedDistance(shape, width, height) {
  const n = width * height;
  const seedNear = new Float32Array(n);
  const owner = new Int32Array(n).fill(-1);
  const covered = (i) => shape[i] >= 0.5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const a = shape[i];
      if (a > 0 && a < 1) { owner[i] = i; seedNear[i] = 0.5 - a; continue; }
      // A hard step: this pixel and a neighbour on the other side of half.
      const inside = a >= 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const b = shape[ny * width + nx];
        if (inside ? b <= 0 : b >= 1) { owner[i] = i; seedNear[i] = inside ? -0.5 : 0.5; break; }
      }
    }
  }
  const dist2 = (i, j) => { const dx = (i % width) - (j % width); const dy = Math.floor(i / width) - Math.floor(j / width); return dx * dx + dy * dy; };
  const range = (a, b, step) => { const out = []; for (let v = a; step > 0 ? v < b : v > b; v += step) out.push(v); return out; };
  const forwardY = range(0, height, 1); const backwardY = range(height - 1, -1, -1);
  const forwardX = range(0, width, 1); const backwardX = range(width - 1, -1, -1);
  /** The nearest of the seeds `owner` starts with, propagated over the whole picture. */
  const spread = (owner) => {
    const pass = (ys, xs, offsets) => {
      for (const y of ys) {
        for (const x of xs) {
          const i = y * width + x;
          for (const [dx, dy] of offsets) {
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const o = owner[ny * width + nx];
            if (o < 0) continue;
            if (owner[i] < 0 || dist2(i, o) < dist2(i, owner[i])) owner[i] = o;
          }
        }
      }
    };
    pass(forwardY, forwardX, [[-1, 0], [0, -1], [-1, -1], [1, -1]]);
    pass(forwardY, backwardX, [[1, 0]]);
    pass(backwardY, backwardX, [[1, 0], [0, 1], [1, 1], [-1, 1]]);
    pass(backwardY, forwardX, [[-1, 0]]);
    return owner;
  };
  // An edge pixel is where it says. One outside is measured from the nearest edge pixel that is not
  // itself outside (one inside, or partly covered), one inside from the nearest that is not inside:
  // at a square's corner, from the corner pixel itself, as Photoshop measures it (outside-stroke.psd
  // 1.2 % of pixels off to 0.8, center-stroke-sizes.psd 0.5 to 0.2), where the nearest edge pixel of
  // either side was one outside it, a pixel further off.
  const fromInside = spread(owner.map((o, i) => (o >= 0 && shape[i] > 0 ? o : -1)));
  const fromOutside = spread(owner.map((o, i) => (o >= 0 && shape[i] < 1 ? o : -1)));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    if (owner[i] === i) { out[i] = seedNear[i]; continue; }
    const o = covered(i) ? fromOutside[i] : fromInside[i];
    if (o < 0) out[i] = covered(i) ? -INF : INF;
    else out[i] = seedNear[o] + (covered(i) ? -1 : 1) * Math.sqrt(dist2(i, o));
  }
  return out;
}

const argb = (rgb, alpha = 1) => `${Math.round(clamp01(alpha) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Photoshop's light angle (0 from the right, counter-clockwise) as the direction a shadow falls. */
function shadowOffset(angle, distance) {
  const a = ((angle ?? 120) * Math.PI) / 180;
  return { x: -Math.cos(a) * distance, y: Math.sin(a) * distance };
}

const enabled = (effect) => effect && effect.enabled !== false;

// Photoshop's shadows and glows are its shape blurred. Measured against its own pictures of a Drop
// Shadow, an Inner Shadow and both Glows (psd-tools' layer_effects.psd, each alone on a flat ground),
// a Gaussian whose deviation is 0.42 of the style's Size fits every one to within a hundredth of its
// opacity; half the Size, as CSS reads a blur, spreads them a fifth too far.
const SIZE_SIGMA = 0.42;
// Its blur reaches no further than the Size (a glow's faint far end stops there, layer_params.psd), and
// is kept at 8 bits. Cut off at the Size, a Gaussian across a straight edge is the full one less its
// tail beyond, (b − t) / (1 − 2t), t the share of it past 1 / 0.42 = 2.38 deviations.
const TAIL = 0.0086;

/** A shadow's, glow's or satin's blur of `a` (`w` × `h`, 0..1) over `size` pixels, as Photoshop's. */
function styleBlur(a, w, h, size, { levels = true } = {}) {
  if (!(size > 0)) return;
  blur(a, w, h, SIZE_SIGMA * size);
  for (let i = 0; i < a.length; i += 1) {
    const v = clamp01((a[i] - TAIL) / (1 - 2 * TAIL));
    a[i] = levels ? Math.round(v * 255) / 255 : v;
  }
}

/** The style's contour as a function on 0..1 (its spline, as utils/psdAdjustments.js contourTable). */
function contourFunction(effect) {
  const table = contourTable(effect?.contour);
  return table ? (a) => table[Math.round(clamp01(a) * 255)] / 255 : clamp01;
}

/**
 * What of a style is drawn only close to Photoshop's, as a note after its name (" (Precise, noise)"),
 * or '': what was not measured against its pictures. The rest of a style is drawn as measured.
 */
function approximations(effect, glow = false, bevel = false) {
  const notes = [];
  if (glow && effect.technique === 'precise') notes.push('Precise');

  if (bevel && pxOf(effect.soften, 0) > 0) notes.push('Soften');
  // (A Gloss Contour is measured, and a Contour on a Smooth Inner or Outer Bevel: bevelShading.)
  const measuredContour = (effect.technique ?? 'smooth') === 'smooth' && ['inner bevel', 'outer bevel'].includes(effect.style ?? 'inner bevel');
  if (bevel && effect.useShape && contourTable(effect.shapeContour) && !measuredContour) notes.push('its Contour');
  if (bevel && effect.useTexture) notes.push('its Texture not drawn');

  if (Number(effect.noise) > 0 || Number(effect.jitter) > 0) notes.push('its Noise not drawn');
  if (glow && effect.gradient?.type === 'noise') notes.push('a Noise gradient: its average colour');
  return notes.length ? ` (${notes.join(', ')})` : '';
}

/** Grow coverage `alpha` (`w` × `h`) outward by `reach` pixels, its new edge antialiased. */
function grow(alpha, w, h, reach) {
  if (!(reach > 0)) return;
  const from = distanceTo((i) => alpha[i] >= 0.5, w, h);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = Math.max(alpha[i], clamp01(reach + 0.5 - from[i]));
}

/**
 * A glow's strength from how far the blurred shape reaches a pixel (`b`, 0.5 on the edge): the Range
 * says what part of that the contour spans, so at the default 50% the glow is full on the edge.
 */
const glowAmount = (b, range) => Math.min(1, b / Math.max(0.01, range ?? 0.5));

/**
 * `width` × `height` values worked on a copy padded by `pad` on every side, `sample(x, y)` read over
 * all of it (x and y from -pad), `work` given the padded array and its size, the middle cut back out.
 */
function padded(width, height, pad, sample, work) {
  const w = width + 2 * pad; const h = height + 2 * pad;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y * w + x] = sample(x - pad, y - pad);
  work(out, w, h);
  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) field[y * width + x] = out[(y + pad) * w + x + pad];
  return field;
}

const HALF_SIZE_BEVELS = new Set(['emboss', 'pillow emboss', 'stroke emboss']);

/**
 * Bevel & Emboss as Photoshop shades it, measured on psd-tools' layer_effects.psd: the shape blurred
 * by the same Gaussian as the shadows (0.42 of the Size) is a height, the Size times the Depth high,
 * lit from the style's angle and altitude; where the light falls on it more steeply than on the flat,
 * the highlight shows, (n·l − sin altitude) / (1 − sin altitude), and where less, the shadow,
 * (sin altitude − n·l) / sin altitude. An Emboss is the same at half the Size, on both sides of the
 * edge. That fits Photoshop's pictures to a few hundredths of the style's opacity. Chisel's straight
 * slopes, Soften and the contours are drawn by the same reading and not measured.
 *
 * Returns { hi, lo, hiFlip, loFlip } over `shape` (`width` × `height`, 0..1): highlight and shadow
 * amounts, and those of the height turned over (a Pillow Emboss outside its shape).
 */
function bevelShading(shape, width, height, bevel) {
  const style = bevel.style ?? 'inner bevel';
  const reach = Math.max(1, pxOf(bevel.size, 5)) * (HALF_SIZE_BEVELS.has(style) ? 0.5 : 1);
  let depth = Number(bevel.strength ?? 1);
  if (!Number.isFinite(depth)) depth = 1;
  if (depth > 10) depth /= 100; // a percent, where a reader gave one
  const dir = bevel.direction === 'down' ? -1 : 1;
  const soften = Math.max(0, pxOf(bevel.soften, 0));
  const technique = bevel.technique ?? 'smooth';
  // (A Linear Contour leaves the height as it is.)
  const shapeContour = bevel.useShape && contourTable(bevel.shapeContour) ? contourFunction({ contour: bevel.shapeContour }) : null;
  const pad = Math.ceil(2 * reach + soften) + 3;
  const heightOf = padded(width, height, pad, (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : shape[y * width + x]), (h, w, hh) => {
    if (technique === 'smooth') styleBlur(h, w, hh, reach, { levels: false });
    else {
      // Chisel, as PhotoCraft measured it in Photoshop (MIT OR Apache-2.0, effects/bevel.rs): straight
      // ramps of the distance to the edge, one step of 1 / (Size + 1) a pixel. Inner Hard rises from
      // half a pixel inside the edge to Size + ½, Inner Soft a pixel further out (a steeper edge
      // pixel); Outer Hard falls to nothing at Size + 1½ out, Outer Soft a pixel sooner; the emboss
      // styles straddle the edge, half the Size each way, a Soft one rounded by a quarter of it.
      const d = signedDistance(h, w, hh);
      const size = Math.max(1, pxOf(bevel.size, 5));
      const ramp = size + 1;
      const soft = technique === 'chisel soft';
      const paint = style === 'outer bevel' ? 'outer' : style === 'emboss' || style === 'pillow emboss' ? 'both' : 'inner';
      for (let i = 0; i < h.length; i += 1) {
        const din = -d[i]; const dout = d[i];
        if (paint === 'outer') {
          const top = (size + 2) / ramp;
          h[i] = dout > 0 ? (soft ? 1 - clamp01((dout + 0.5) / ramp) : Math.max(0, Math.min(top, (size + 1.5 - dout) / ramp))) : top;
        } else if (paint === 'both') {
          const half = size / 2 + 0.5;
          h[i] = din > 0 ? 0.5 + 0.5 * clamp01(din / half) : 0.5 - 0.5 * clamp01(dout / half);
        } else {
          h[i] = din > 0 ? (soft ? Math.max(0, Math.min((size + 2) / ramp, (din + 1.5) / ramp)) : clamp01((din + 0.5) / ramp)) : 0;
        }
      }
      if (soft && paint === 'both') blur(h, w, hh, Math.max(1, size / 4) / Math.sqrt(6));
    }
    // A chisel rises Depth × Size / 2 (PhotoCraft's measurement), a smooth bevel the Size × Depth.
    const scale = technique === 'smooth' ? reach * depth * dir : (Math.max(1, pxOf(bevel.size, 5)) / 2) * depth * dir;
    if (shapeContour && technique === 'smooth' && (style === 'inner bevel' || style === 'outer bevel')) {
      // A Contour runs over the bevel's own half of the blurred edge, the whole depth high: an Inner
      // Bevel's up from the edge (half-way up the blur) to the top, an Outer Bevel's from its foot to the
      // edge; its Range (ag-psd drops it: utils/psdRead.js) the share of that half it takes, measured down
      // from the top, 50 % by default (PhotoCraft's bevel-inner-contour-ramp-peak.psd and its
      // double-ring at 70 %: 15 and 13 % of pixels off to 3 and 6).
      const inner = style === 'inner bevel';
      const range = Math.max(0.01, Number(bevel.range ?? 0.5));
      for (let i = 0; i < h.length; i += 1) {
        const u = inner ? clamp01(1 - (1 - h[i]) / range) : clamp01(1 - (0.5 - h[i]) / range);
        h[i] = scale * (shapeContour(u) + (inner ? 1 : 0));
      }
    } else {
      for (let i = 0; i < h.length; i += 1) h[i] = scale * (shapeContour ? shapeContour(h[i]) : h[i]);
    }
    if (soften > 0) blur(h, w, hh, SIZE_SIGMA * soften);
  });
  const theta = ((bevel.angle ?? 120) * Math.PI) / 180;
  const alt = ((bevel.altitude ?? 30) * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.cos(theta); const ly = -Math.cos(alt) * Math.sin(theta); const lz = Math.sin(alt);
  // The Gloss Contour remaps how the light falls on each pixel, its cosine; the highlight and shadow
  // are then measured from the flat face's own cosine, not from the contour's value there, so a contour
  // that peaks there lights the flat face in full (PhotoCraft's bevel-inner-gloss-ramp-peak.psd: 31 % of
  // pixels off to 0.3, its double-ring 26 % to 4).
  const gloss = contourFunction(bevel);
  const flat = lz;
  const n = width * height;
  const hi = new Float32Array(n); const lo = new Float32Array(n); const hiFlip = new Float32Array(n); const loFlip = new Float32Array(n);
  const H = (x, y) => heightOf[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  const shade = (gx, gy) => {
    const len = Math.hypot(gx, gy, 1);
    return gloss((-gx * lx - gy * ly + lz) / len);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const gx = (H(x + 1, y) - H(x - 1, y)) / 2;
      const gy = (H(x, y + 1) - H(x, y - 1)) / 2;
      const l = shade(gx, gy);
      hi[i] = clamp01((l - flat) / Math.max(1e-6, 1 - flat));
      lo[i] = clamp01((flat - l) / Math.max(1e-6, flat));
      const f = shade(-gx, -gy);
      hiFlip[i] = clamp01((f - flat) / Math.max(1e-6, 1 - flat));
      loFlip[i] = clamp01((flat - f) / Math.max(1e-6, flat));
    }
  }
  return { hi, lo, hiFlip, loFlip };
}

/**
 * The styles kept as the layer's own shadows: `{ items, kept }`, items in the shape of
 * Effects.Shadows.items (models/sectionDefaults.js), kept the names of the styles they came from.
 */
export function editableShadows(effects) {
  const items = [];
  const kept = [];
  if (!effects || effects.disabled) return { items, kept };
  for (const shadow of effects.dropShadow ?? []) {
    if (!enabled(shadow)) continue;
    const offset = shadowOffset(shadow.angle, pxOf(shadow.distance, 5));
    items.push({ enabled: true, type: 'drop', offsetX: Math.round(offset.x * 10) / 10, offsetY: Math.round(offset.y * 10) / 10, blur: pxOf(shadow.size, 5), spread: 0, colour: argb(psdRgb(shadow.color), shadow.opacity ?? 0.75) });
    kept.push('Drop Shadow');
  }
  if (enabled(effects.outerGlow)) {
    const glow = effects.outerGlow;
    items.push({ enabled: true, type: 'outer-glow', offsetX: 0, offsetY: 0, blur: pxOf(glow.size, 5), spread: 0, colour: argb(glow.color ? psdRgb(glow.color) : [255, 255, 190], glow.opacity ?? 0.75) });
    kept.push('Outer Glow');
  }
  return { items, kept };
}

/**
 * The Drop Shadows and the Outer Glow a layer casts, bottom first, from `shape` (its alpha at full
 * Fill, 0..1, `width` × `height`): each `{ x, y, width, height, alpha, rgb, mode, opacity, name }`, its
 * alpha over that box of the document. A shadow is the shape moved by its distance, grown by its
 * spread and softened by the rest of its size (a Gaussian, the size twice its deviation, as the
 * layer's own shadows are drawn), and hidden under the layer ("Layer Knocks Out Drop Shadow").
 */
export function castShadows(shape, width, height, effects) {
  const casts = [];
  if (!effects || effects.disabled) return casts;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (shape[y * width + x] <= 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return casts;
  const cast = (effect, offset, rgb, mode, name, conceal, glow = false) => {
    const size = Math.max(0, pxOf(effect.size, 5));
    const spread = clamp01(pxOf(effect.choke, 0) / 100);
    const dx = Math.round(offset.x);
    const dy = Math.round(offset.y);
    const margin = Math.ceil(size) + 2;
    const left = Math.max(0, x0 + dx - margin);
    const top = Math.max(0, y0 + dy - margin);
    const w = Math.min(width - 1, x1 + dx + margin) - left + 1;
    const h = Math.min(height - 1, y1 + dy + margin) - top + 1;
    if (w <= 0 || h <= 0) return;
    const alpha = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const sy = top + y - dy;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < w; x += 1) {
        const sx = left + x - dx;
        if (sx >= 0 && sx < width) alpha[y * w + x] = shape[sy * width + sx];
      }
    }
    if (spread > 0 && size > 0) grow(alpha, w, h, spread * size);
    const contour = contourFunction(effect);
    let raw = null;
    if (glow && effect.technique === 'precise') {
      // Precise: straight out from the edge to the Size, not blurred.
      const from = distanceTo((i) => alpha[i] >= 0.5, w, h);
      const reach = Math.max(1, (1 - spread) * size);
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = contour(glowAmount(clamp01(1 - from[i] / reach) / 2, effect.range));
    } else {
      styleBlur(alpha, w, h, (1 - spread) * size);
      if (glow) raw = Float32Array.from(alpha);
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = contour(glow ? glowAmount(alpha[i], effect.range) : alpha[i]);
    }
    if (conceal) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) alpha[y * w + x] *= 1 - shape[(top + y) * width + left + x];
      }
    }
    // A glow with a gradient takes its colour along it, from the edge (its left end) outward.
    const ramp = glow && !effect.color && effect.gradient ? gradientRamp(effect.gradient) : null;
    casts.push({ x: left, y: top, width: w, height: h, alpha, raw: ramp ? raw : null, rgb, ramp, mode, opacity: effect.opacity ?? 0.75, name: name + approximations(effect, glow) });
  };
  for (const shadow of effects.dropShadow ?? []) {
    if (!enabled(shadow)) continue;
    cast(shadow, shadowOffset(shadow.angle, pxOf(shadow.distance, 5)), shadow.color ? psdRgb(shadow.color) : [0, 0, 0],
      String(shadow.blendMode ?? 'multiply'), 'Drop Shadow', shadow.layerConceals !== false);
  }
  if (enabled(effects.outerGlow)) {
    const glow = effects.outerGlow;
    const rgb = glow.color ? psdRgb(glow.color) : glow.gradient ? gradientRamp(glow.gradient)(0).slice(0, 3) : [255, 255, 190];
    cast(glow, { x: 0, y: 0 }, rgb, String(glow.blendMode ?? 'screen'), 'Outer Glow', false, true);
  }
  // An Outer Bevel, an Emboss and a Pillow Emboss light what is around the shape too: cast onto it in
  // their own modes, over the shadows and glows (a Pillow Emboss's outside is its height turned over),
  // and over the part of a Stroke outside the layer, which they shade (`overStroke`: layer_params.psd,
  // its caption's red stroke lit and shaded by its Pillow Emboss, 19 % of pixels off to 14).
  const bevel = effects.bevel;
  if (enabled(bevel) && ['outer bevel', 'emboss', 'pillow emboss'].includes(bevel.style ?? 'inner bevel')) {
    const reach = Math.max(1, pxOf(bevel.size, 5));
    const margin = Math.ceil(reach + pxOf(bevel.soften, 0)) + 2;
    const left = Math.max(0, x0 - margin); const top = Math.max(0, y0 - margin);
    const w = Math.min(width - 1, x1 + margin) - left + 1; const h = Math.min(height - 1, y1 + margin) - top + 1;
    const part = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) part[y * w + x] = shape[(top + y) * width + left + x];
    const shading = bevelShading(part, w, h, bevel);
    const flip = bevel.style === 'pillow emboss';
    const hi = flip ? shading.hiFlip : shading.hi;
    const lo = flip ? shading.loFlip : shading.lo;
    for (let i = 0; i < part.length; i += 1) { hi[i] *= 1 - part[i]; lo[i] *= 1 - part[i]; }
    const name = `Bevel & Emboss${approximations(bevel, false, true)}`;
    casts.push({ x: left, y: top, width: w, height: h, alpha: lo, rgb: bevel.shadowColor ? psdRgb(bevel.shadowColor) : [0, 0, 0], mode: String(bevel.shadowBlendMode ?? 'multiply'), opacity: bevel.shadowOpacity ?? 0.75, name, overStroke: true });
    casts.push({ x: left, y: top, width: w, height: h, alpha: hi, rgb: bevel.highlightColor ? psdRgb(bevel.highlightColor) : [255, 255, 255], mode: String(bevel.highlightBlendMode ?? 'screen'), opacity: bevel.highlightOpacity ?? 0.75, name, overStroke: true });
  }
  return casts;
}

/** How far outside its shape a layer's drawn styles reach (an outside or centred Stroke), in pixels. */
export function stylesReach(effects) {
  let reach = 0;
  for (const stroke of effects?.stroke ?? []) {
    if (!enabled(stroke)) continue;
    const size = pxOf(stroke.size, 3);
    const position = stroke.position ?? 'outside';
    reach = Math.max(reach, position === 'outside' ? size : position === 'center' ? size / 2 : 0);
  }
  return Math.ceil(reach) + 2;
}

/** How far from its shape any of a layer's styles reaches (a shadow's Distance and Size, a Stroke). */
export function stylesExtent(effects) {
  if (!effects || effects.disabled) return 0;
  let reach = stylesReach(effects);
  for (const value of Object.values(effects)) {
    for (const effect of Array.isArray(value) ? value : [value]) {
      if (!enabled(effect) || typeof effect !== 'object') continue;
      reach = Math.max(reach, pxOf(effect.size, 0) + pxOf(effect.distance, 0) + pxOf(effect.soften, 0) + 2);
    }
  }
  return Math.min(512, Math.ceil(reach));
}

/** Whether the layer has a style that must be drawn into its pixels. */
export function hasDrawnStyles(effects) {
  if (!effects || effects.disabled) return false;
  return (effects.stroke ?? []).some(enabled) || (effects.innerShadow ?? []).some(enabled) || enabled(effects.innerGlow)
    || enabled(effects.satin) || (effects.solidFill ?? []).some(enabled) || (effects.gradientOverlay ?? []).some(enabled)
    || enabled(effects.bevel) || enabled(effects.patternOverlay);
}


/**
 * Draw the layer's interior and stroke styles into `pixels` (RGBA 8-bit, document-sized), from
 * `shape` (its own alpha at full Fill, 0..1, document-sized). The pixels grow where an outside stroke
 * reaches. Returns the names of the styles drawn.
 *
 * Given a part of the document instead, `left` and `top` say where it is, and `anchor` (the layer's
 * top left) is where a Pattern Overlay linked with the layer starts.
 *
 * Given `beside` (an array), the part of a stroke outside the shape is not drawn but pushed onto it,
 * `{ x, y, width, height, alpha, rgb, mode, opacity, name }` (rgb three bytes a pixel), for the caller
 * to put under the layer.
 */
export function drawLayerStyles(pixels, shape, width, height, effects, { left = 0, top = 0, anchor = null, document = null, bounds = null, beside = null } = {}) {
  const drawn = [];
  if (!effects || effects.disabled || !hasDrawnStyles(effects)) return drawn;
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x);
  // Soft coverage of the shape's edge, for the styles that use its outline.
  const coverage = (i) => shape[i];

  /**
   * Composite colour `rgb` at `amount` (0..1) over pixel i, in Photoshop `mode`. With `within`, over
   * the part of the pixel the shape covers (that share of it): the content's alpha read as a share of
   * that, and the result put back at it.
   */
  const paint = (i, rgb, amount, mode = 'normal', within = 1) => {
    if (amount <= 0) return;
    const p = i * 4;
    const ba = Math.min(1, pixels[p + 3] / 255 / within);
    // Where the mode has a neutral colour, the strength moves the colour toward it before the blend,
    // as Photoshop draws a style (utils/psdComposite.js blendStylePixel).
    const neutral = neutralOf(mode);
    for (let c = 0; c < 3; c += 1) {
      const b = pixels[p + c] / 255;
      const s = rgb[c] / 255;
      let out;
      if (neutral !== undefined && ba > 0) {
        const k = Math.min(1, amount);
        const moved = neutral + k * (s - neutral);
        out = (k * (1 - ba) * s + ba * (blendChannel(mode, b, moved) ?? moved)) / (k + ba * (1 - k));
      } else {
        const blended = ba > 0 ? (blendChannel(mode, b, s) ?? s) : s;
        const mixed = (1 - ba) * s + ba * blended;
        out = ba + amount * (1 - ba) > 0 ? (amount * mixed + ba * b * (1 - amount)) / (amount + ba * (1 - amount)) : 0;
      }
      pixels[p + c] = Math.round(clamp01(out) * 255);
    }
    pixels[p + 3] = Math.round(clamp01(amount + ba * (1 - amount)) * within * 255);
  };
  // An interior style only where the shape is, over the content, whatever the content's Fill opacity
  // left of it: an edge pixel half covered takes it over its covered half, not at half strength on
  // top of the content's own half.
  const paintInside = (i, rgb, amount, mode) => {
    const cover = coverage(i);
    if (cover <= 0 || amount <= 0) return;
    paint(i, rgb, amount, mode, cover);
  };
  const modeOf = (effect, fallback) => String(effect?.blendMode ?? fallback);

  // Overlays first (bottom of the interior styles), as Photoshop stacks them: pattern, gradient, colour.
  const pattern = effects.patternOverlay;
  if (enabled(pattern) && pattern.picture) {
    // Linked with the layer, it starts at the layer's reference point; otherwise at the document's.
    const sample = patternSampler(pattern.picture, {
      scale: scaleOf(pattern.scale),
      ox: (pattern.align !== false && anchor ? anchor.x : 0) + (Number(pattern.phase?.x) || 0),
      oy: (pattern.align !== false && anchor ? anchor.y : 0) + (Number(pattern.phase?.y) || 0),
    });
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const [r, g, b, a] = sample(left + (i % width), top + Math.floor(i / width));
      paintInside(i, [r, g, b], a * (pattern.opacity ?? 1), modeOf(pattern, 'normal'));
    }
    drawn.push('Pattern Overlay');
  }
  // The layer's box (what its pixels cover), in the document, which an aligned gradient lies across.
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let i = 0; i < shape.length; i += 1) if (shape[i] > 0) { const x = i % width; const y = (i - x) / width; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  // (The layer's own bounds where the caller knows them: past the canvas, they reach past this part.)
  const layerBox = maxX < 0 ? null : bounds ?? { x: left + minX, y: top + minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const page = { x: 0, y: 0, width: document?.width ?? left + width, height: document?.height ?? top + height };
  for (const overlay of (effects.gradientOverlay ?? []).filter(enabled)) {
    if (!layerBox) continue;
    // As Photoshop lays a gradient (utils/psdVectors.js gradientField), at whole pixel coordinates.
    const field = gradientField({ style: overlay.type, angle: overlay.angle, scale: overlay.scale, reverse: overlay.reverse, offset: overlay.offset }, overlay.align === false ? page : layerBox);
    const ramp = gradientRamp(overlay.gradient, { mirrored: overlay.type === 'reflected' });
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = i % width; const y = (i - x) / width;
      const [r, g, b, alpha] = ramp(field(left + x, top + y));
      paintInside(i, [r, g, b], alpha * (overlay.opacity ?? 1), modeOf(overlay, 'normal'));
    }
    drawn.push('Gradient Overlay');
  }
  for (const fill of (effects.solidFill ?? []).filter(enabled)) {
    const rgb = psdRgb(fill.color);
    for (let i = 0; i < shape.length; i += 1) paintInside(i, rgb, fill.opacity ?? 1, modeOf(fill, 'normal'));
    drawn.push('Color Overlay');
  }
  if (enabled(effects.satin)) {
    // Satin: the shape twice, moved the Distance each way along the angle and blurred by the Size,
    // the difference of the two (inverted, as it usually is): measured on psd-tools' layer_effects.psd
    // to within a hundredth.
    const satin = effects.satin;
    const size = Math.max(0, pxOf(satin.size, 14));
    const off = shadowOffset(satin.angle ?? 19, pxOf(satin.distance, 11));
    const dx = Math.round(off.x); const dy = Math.round(off.y);
    const pad = Math.ceil(size) + 2 + Math.max(Math.abs(dx), Math.abs(dy));
    const moved = (sx, sy) => padded(width, height, pad, (x, y) => { const j = at(x - sx, y - sy); return j < 0 ? 0 : shape[j]; }, (h, w, hh) => styleBlur(h, w, hh, size));
    const one = moved(dx, dy); const two = moved(-dx, -dy);
    const contour = contourFunction(satin);
    const rgb = psdRgb(satin.color);
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      let amount = contour(Math.abs(one[i] - two[i]));
      if (satin.invert) amount = 1 - amount;
      paintInside(i, rgb, amount * (satin.opacity ?? 0.5), modeOf(satin, 'multiply'));
    }
    drawn.push('Satin');
  }
  // The inner styles blur what is outside the shape (an inner shadow's outside moved by its offset),
  // as the cast ones blur the shape: the same Gaussian, the same contours. Worked on a copy padded far
  // enough that the edge of this part of the document reads as outside, not as more of the shape.
  const outside = (dx, dy, choke, size, precise = 0) => {
    const pad = Math.ceil(size + choke + precise) + 2 + Math.max(Math.abs(dx), Math.abs(dy));
    return padded(width, height, pad, (x, y) => { const j = at(x - dx, y - dy); return j < 0 ? 1 : 1 - shape[j]; }, (out, w, h) => {
      if (choke > 0) grow(out, w, h, choke);
      if (precise > 0) {
        // Precise: straight in from the edge to the Size, not blurred (0.5 on the edge, as a blur is).
        const from = distanceTo((i) => out[i] >= 0.5, w, h);
        for (let i = 0; i < out.length; i += 1) out[i] = out[i] >= 0.5 ? 1 : clamp01(1 - from[i] / precise) / 2;
      } else styleBlur(out, w, h, size);
    });
  };
  if (enabled(effects.innerGlow)) {
    const glow = effects.innerGlow;
    const size = Math.max(1, pxOf(glow.size, 5));
    const choke = clamp01(pxOf(glow.choke, 0) / 100);
    const centre = glow.source === 'center';
    const contour = contourFunction(glow);
    const ramp = !glow.color && glow.gradient ? gradientRamp(glow.gradient) : null;
    const rgb = glow.color ? psdRgb(glow.color) : [255, 255, 190];
    const reach = outside(0, 0, choke * size, (1 - choke) * size, glow.technique === 'precise' ? Math.max(1, (1 - choke) * size) : 0);
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const edge = glowAmount(reach[i], glow.range);
      const amount = contour(centre ? 1 - edge : edge);
      if (ramp) {
        // Along a gradient, colour and opacity both from it, as the Outer Glow's (castShadows).
        if (amount <= 0) continue;
        const [r, g, b, a] = ramp(1 - amount);
        paintInside(i, [r, g, b], a * (glow.opacity ?? 0.75), modeOf(glow, 'screen'));
      } else paintInside(i, rgb, amount * (glow.opacity ?? 0.75), modeOf(glow, 'screen'));
    }
    drawn.push(`Inner Glow${approximations(glow, true)}`);
  }
  for (const shadow of (effects.innerShadow ?? []).filter(enabled)) {
    const size = Math.max(0, pxOf(shadow.size, 5));
    const choke = clamp01(pxOf(shadow.choke, 0) / 100);
    const off = shadowOffset(shadow.angle, pxOf(shadow.distance, 5));
    const rgb = psdRgb(shadow.color);
    const contour = contourFunction(shadow);
    const reach = outside(Math.round(off.x), Math.round(off.y), choke * size, (1 - choke) * size);
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      paintInside(i, rgb, contour(reach[i]) * (shadow.opacity ?? 0.75), modeOf(shadow, 'multiply'));
    }
    drawn.push(`Inner Shadow${approximations(shadow)}`);
  }
  // A Stroke Emboss bevels the stroke, drawn with it (below), where there is one.
  const strokeEmboss = enabled(effects.bevel) && effects.bevel.style === 'stroke emboss' && (effects.stroke ?? []).some(enabled) ? effects.bevel : null;
  if (enabled(effects.bevel)) {
    // Its inside (an Outer Bevel has none; what lies outside is cast, castShadows).
    const bevel = effects.bevel;
    if ((bevel.style ?? 'inner bevel') !== 'outer bevel' && !strokeEmboss) {
      const { hi, lo } = bevelShading(shape, width, height, bevel);
      const hiRgb = bevel.highlightColor ? psdRgb(bevel.highlightColor) : [255, 255, 255];
      const loRgb = bevel.shadowColor ? psdRgb(bevel.shadowColor) : [0, 0, 0];
      for (let i = 0; i < shape.length; i += 1) {
        if (shape[i] <= 0) continue;
        if (lo[i] > 0) paintInside(i, loRgb, lo[i] * (bevel.shadowOpacity ?? 0.75), String(bevel.shadowBlendMode ?? 'multiply'));
        if (hi[i] > 0) paintInside(i, hiRgb, hi[i] * (bevel.highlightOpacity ?? 0.75), String(bevel.highlightBlendMode ?? 'screen'));
      }
    }
    drawn.push(`Bevel & Emboss${approximations(bevel, false, true)}`);
  }
  const edgeDistance = (effects.stroke ?? []).some(enabled) ? signedDistance(shape, width, height) : null;
  for (const stroke of (effects.stroke ?? []).filter(enabled)) {
    const size = Math.max(0.5, pxOf(stroke.size, 3));
    const position = stroke.position ?? 'outside';
    // Its paint at each pixel: a colour; a gradient laid as Photoshop lays one, over the layer's box
    // (or the document); or a pattern tiled from the document's corner.
    const colour = psdRgb(stroke.color);
    let paintAt = () => [...colour, 1];
    if (stroke.fillType === 'gradient' && stroke.gradient && layerBox) {
      const g = stroke.gradient;
      // Aligned with the layer, an outside stroke's gradient lies across the layer's box grown by the
      // Size less a pixel: read back from Photoshop's colours row by row, a 4 px stroke on a 24 px shape
      // spans 30 (stroke-effects.psd), a 3 px one on 36 px of type 40 (effect-stroke-gradient.psd).
      const out = position === 'outside' ? Math.max(0, size - 1) : 0;
      const strokeBox = { x: layerBox.x - out, y: layerBox.y - out, width: layerBox.width + 2 * out, height: layerBox.height + 2 * out };
      const field = gradientField({ style: g.style, angle: g.angle, scale: g.scale, reverse: g.reverse, offset: g.offset }, g.align === false ? page : strokeBox);
      const ramp = gradientRamp(g, { mirrored: g.style === 'reflected' });
      paintAt = (x, y) => ramp(field(x, y));
    } else if (stroke.fillType === 'pattern' && stroke.pattern?.picture) {
      // Linked with the layer (as a Pattern Overlay is), from its reference point; else the document's
      // corner (stroke-effects.psd).
      const linked = (stroke.pattern.linked ?? stroke.linked) !== false && anchor;
      paintAt = patternSampler(stroke.pattern.picture, {
        scale: scaleOf(stroke.scale ?? stroke.pattern.scale),
        ox: (linked ? anchor.x : 0) + (Number(stroke.pattern.phase?.x?.value ?? stroke.pattern.phase?.x) || 0),
        oy: (linked ? anchor.y : 0) + (Number(stroke.pattern.phase?.y?.value ?? stroke.pattern.phase?.y) || 0),
      });
    }
    // The band between `lo` and `hi` of the signed distance to the edge, its two sides antialiased,
    // split where it crosses the edge (psd-tools' reading, #846): the part within the layer paints over
    // it, a share of its own coverage; the part beside it goes under it, in its own blend mode against
    // what is below, which `beside` collects for the caller (without one, it goes under the content
    // here). An outside band through a see-through part of a picture so shows beneath it.
    const lo = position === 'outside' ? 0 : position === 'center' ? -size / 2 : -size;
    const hi = position === 'outside' ? size : position === 'center' ? size / 2 : 0;
    const band = (d, a, b) => clamp01(b - d + 0.5) * clamp01(d - a + 0.5);
    const under = beside ? { x: left, y: top, width, height, alpha: new Float32Array(shape.length), rgb: new Uint8ClampedArray(shape.length * 3), mode: modeOf(stroke, 'normal'), opacity: stroke.opacity ?? 1, name: 'Stroke' } : null;
    // Stroke Emboss: the layer's shape bevelled as the stroke sits on it, an Outer Bevel under an
    // outside stroke, an Emboss under a centred one, an Inner Bevel under an inside one, its light and
    // shade laid on the stroke's own colour, so on the stroke alone (PhotoCraft's corpus: its
    // bevel-stroke files, the smooth one 7.7 % of pixels off to 0.3, the centred chisel 8.7 to 3.2).
    let embossed = null;
    if (strokeEmboss) {
      const style = position === 'outside' ? 'outer bevel' : position === 'center' ? 'emboss' : 'inner bevel';
      const { hi: light, lo: shade } = bevelShading(shape, width, height, { ...strokeEmboss, style });
      const hiRgb = (strokeEmboss.highlightColor ? psdRgb(strokeEmboss.highlightColor) : [255, 255, 255]).map((v) => v / 255);
      const loRgb = (strokeEmboss.shadowColor ? psdRgb(strokeEmboss.shadowColor) : [0, 0, 0]).map((v) => v / 255);
      const over = (c, s0, k, mode) => {
        const n = neutralOf(mode);
        return c.map((v, ch) => {
          if (n !== undefined) { const moved = n + k * (s0[ch] - n); return blendChannel(mode, v, moved) ?? moved; }
          const blended = blendChannel(mode, v, s0[ch]) ?? s0[ch];
          return v + (blended - v) * k;
        });
      };
      embossed = (i, rgb) => {
        let c = rgb.map((v) => v / 255);
        if (shade[i] > 0) c = over(c, loRgb, shade[i] * (strokeEmboss.shadowOpacity ?? 0.75), String(strokeEmboss.shadowBlendMode ?? 'multiply'));
        if (light[i] > 0) c = over(c, hiRgb, light[i] * (strokeEmboss.highlightOpacity ?? 0.75), String(strokeEmboss.highlightBlendMode ?? 'screen'));
        return c.map((v) => Math.round(clamp01(v) * 255));
      };
    }
    for (let i = 0; i < shape.length; i += 1) {
      const d = edgeDistance[i];
      const amount = band(d, lo, hi);
      if (amount <= 0) continue;
      let inner = 0;
      if (hi <= 0) inner = amount;
      else if (lo < 0) { const within = band(d, lo, 0); const beyond = band(d, 0, hi); inner = within + beyond > 0 ? (amount * within) / (within + beyond) : 0; }
      const outer = amount - inner;
      const x = i % width; const y = (i - x) / width;
      let [r, g, b, a] = paintAt(left + x, top + y);
      if (embossed) [r, g, b] = embossed(i, [r, g, b]);
      const cover = coverage(i);
      if (inner > 0 && cover > 0) paint(i, [r, g, b], Math.min(1, inner / cover) * a * (stroke.opacity ?? 1), modeOf(stroke, 'normal'), cover);
      if (outer <= 0) continue;
      if (under) {
        under.alpha[i] = outer * a;
        under.rgb[i * 3] = r; under.rgb[i * 3 + 1] = g; under.rgb[i * 3 + 2] = b;
      } else {
        // Under the content: what the pixel has over the band, the band at its share of what the
        // pixel leaves uncovered, as the flattening draws it beside the layer (compositePsd).
        const p = i * 4;
        const ca = pixels[p + 3] / 255;
        if (ca >= 1) continue;
        const t = Math.min(1, (outer * a) / (1 - ca)) * (stroke.opacity ?? 1);
        const oa = ca + t * (1 - ca);
        if (oa <= 0) continue;
        for (let k = 0; k < 3; k += 1) pixels[p + k] = Math.round((pixels[p + k] * ca + [r, g, b][k] * t * (1 - ca)) / oa);
        pixels[p + 3] = Math.round(oa * 255);
      }
    }
    if (under) beside.push(under);
    drawn.push(stroke.fillType === 'pattern' && !stroke.pattern?.picture ? 'Stroke (its pattern not in the file: its colour)'
      : stroke.fillType === 'gradient' && stroke.gradient?.type === 'noise' ? 'Stroke (a Noise gradient: its average colour)' : 'Stroke');
  }
  if (enabled(pattern) && !pattern.picture) drawn.push('Pattern Overlay (not drawn: the file does not keep its pattern)');
  return drawn;
}

/** What the panel flattening takes to draw layer styles (utils/psdComposite.js compositePsd). */
export const LAYER_STYLES = Object.freeze({ cast: castShadows, draw: drawLayerStyles, reach: stylesReach, extent: stylesExtent });
