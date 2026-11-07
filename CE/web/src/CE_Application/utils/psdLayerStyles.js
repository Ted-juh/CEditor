// psdLayerStyles.js — Photoshop's layer styles, for the Photoshop component import.
//
// Photoshop keeps a layer style as settings and draws it when it shows the layer; the file holds no
// pixels for it. The import (utils/psdComponentImport.js) does two things with them:
//
//   kept, and editable    a Drop Shadow and an Outer Glow become the layer's own shadows, which a
//                         picture layer casts from its pixels (utils/partMask.js), a vector layer from
//                         its outline; their colour, offset and size stay settings
//   drawn into the pixels  Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay
//                         and Bevel & Emboss, from the layer's shape: a distance map of it (how far
//                         each pixel is from its edge), shaded by the style's settings
//
// The second are close to Photoshop's, not identical: its exact contours, its Bevel's chisel and
// Satin's shape are its own. The import says which were drawn so.
//
// Interior styles are drawn at full strength whatever the layer's Fill opacity, as Photoshop draws
// them; a layer at Fill 0% with a Color Overlay shows the overlay.
//
// The panel import's flattening (utils/psdComposite.js) draws them all: the shadows and glows cast
// under the layer (castShadows), the rest into its pixels (drawLayerStyles). It takes both as
// LAYER_STYLES, since this module draws with its blend modes.

import { blendChannel } from './psdComposite.js';
import { psdRgb } from './psdAdjustments.js';
import { scaleOf } from './psdVectors.js';

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
 * A Gaussian blur of `a` (`w` × `h`, one value a pixel) in place, as three box blurs (Wells), nothing
 * outside it.
 */
function blur(a, w, h, sigma) {
  if (!(sigma > 0.25)) return;
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const m = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  const line = new Float32Array(Math.max(w, h));
  const pass = (start, step, n, r) => {
    let sum = 0;
    for (let k = 0; k <= Math.min(r, n - 1); k += 1) sum += a[start + k * step];
    const scale = 1 / (2 * r + 1);
    for (let i = 0; i < n; i += 1) {
      line[i] = sum * scale;
      if (i + r + 1 < n) sum += a[start + (i + r + 1) * step];
      if (i - r >= 0) sum -= a[start + (i - r) * step];
    }
    for (let i = 0; i < n; i += 1) a[start + i * step] = line[i];
  };
  for (let k = 0; k < 3; k += 1) {
    const r = ((k < m ? lower : lower + 2) - 1) / 2;
    if (r < 1) continue;
    for (let y = 0; y < h; y += 1) pass(y * w, 1, w, r);
    for (let x = 0; x < w; x += 1) pass(x, w, h, r);
  }
}

const argb = (rgb, alpha = 1) => `${Math.round(clamp01(alpha) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Photoshop's light angle (0 from the right, counter-clockwise) as the direction a shadow falls. */
function shadowOffset(angle, distance) {
  const a = ((angle ?? 120) * Math.PI) / 180;
  return { x: -Math.cos(a) * distance, y: Math.sin(a) * distance };
}

const enabled = (effect) => effect && effect.enabled !== false;

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
  const cast = (effect, offset, rgb, mode, name, conceal) => {
    const size = Math.max(0, pxOf(effect.size, 5));
    const spread = clamp01(pxOf(effect.choke, 0) / 100);
    const sigma = ((1 - spread) * size) / 2;
    const dx = Math.round(offset.x);
    const dy = Math.round(offset.y);
    const margin = Math.ceil(spread * size + 3 * sigma) + 2;
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
    if (spread > 0 && size > 0) {
      const reach = spread * size;
      const from = distanceTo((i) => alpha[i] >= 0.5, w, h);
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = Math.max(alpha[i], clamp01(reach + 0.5 - from[i]));
    }
    blur(alpha, w, h, sigma);
    if (conceal) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) alpha[y * w + x] *= 1 - shape[(top + y) * width + left + x];
      }
    }
    casts.push({ x: left, y: top, width: w, height: h, alpha, rgb, mode, opacity: effect.opacity ?? 0.75, name });
  };
  for (const shadow of effects.dropShadow ?? []) {
    if (!enabled(shadow)) continue;
    cast(shadow, shadowOffset(shadow.angle, pxOf(shadow.distance, 5)), shadow.color ? psdRgb(shadow.color) : [0, 0, 0],
      String(shadow.blendMode ?? 'multiply'), 'Drop Shadow', shadow.layerConceals !== false);
  }
  if (enabled(effects.outerGlow)) {
    const glow = effects.outerGlow;
    const rgb = glow.color ? psdRgb(glow.color) : glow.gradient ? gradientAt(glow.gradient, 0).rgb : [255, 255, 190];
    cast(glow, { x: 0, y: 0 }, rgb, String(glow.blendMode ?? 'screen'), 'Outer Glow', false);
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

/** Whether the layer has a style that must be drawn into its pixels. */
export function hasDrawnStyles(effects) {
  if (!effects || effects.disabled) return false;
  return (effects.stroke ?? []).some(enabled) || (effects.innerShadow ?? []).some(enabled) || enabled(effects.innerGlow)
    || enabled(effects.satin) || (effects.solidFill ?? []).some(enabled) || (effects.gradientOverlay ?? []).some(enabled)
    || enabled(effects.bevel) || enabled(effects.patternOverlay);
}

function gradientAt(gradient, t) {
  const colours = [...(gradient?.colorStops ?? [])].sort((a, b) => a.location - b.location);
  const opacities = [...(gradient?.opacityStops ?? [])].sort((a, b) => a.location - b.location);
  // Stops 0..1 as ag-psd gives them (0..4096 as the file writes them, if given so).
  const at = clamp01(t) * ([...colours, ...opacities].some((stop) => stop.location > 1) ? 4096 : 1);
  const lerpStops = (stops, get, fallback) => {
    if (!stops.length) return fallback;
    if (at <= stops[0].location) return get(stops[0]);
    for (let i = 1; i < stops.length; i += 1) {
      if (at <= stops[i].location) {
        const k = (at - stops[i - 1].location) / Math.max(1e-9, stops[i].location - stops[i - 1].location);
        const a = get(stops[i - 1]); const b = get(stops[i]);
        return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * k) : a + (b - a) * k;
      }
    }
    return get(stops[stops.length - 1]);
  };
  return { rgb: lerpStops(colours, (s) => psdRgb(s.color), [0, 0, 0]), alpha: lerpStops(opacities, (s) => s.opacity ?? 1, 1) };
}

/**
 * Draw the layer's interior and stroke styles into `pixels` (RGBA 8-bit, document-sized), from
 * `shape` (its own alpha at full Fill, 0..1, document-sized). The pixels grow where an outside stroke
 * reaches. Returns the names of the styles drawn.
 *
 * Given a part of the document instead, `left` and `top` say where it is, and `anchor` (the layer's
 * top left) is where a Pattern Overlay linked with the layer starts.
 */
export function drawLayerStyles(pixels, shape, width, height, effects, { left = 0, top = 0, anchor = null } = {}) {
  const drawn = [];
  if (!effects || effects.disabled || !hasDrawnStyles(effects)) return drawn;
  const inside = (i) => shape[i] >= 0.5;
  const fromEdgeInside = distanceTo((i) => !inside(i), width, height);
  const fromEdgeOutside = distanceTo(inside, width, height);
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x);
  // Soft coverage of the shape's edge, for the styles that use its outline.
  const coverage = (i) => shape[i];

  /** Composite colour `rgb` at `amount` (0..1) over pixel i, in Photoshop `mode`. */
  const paint = (i, rgb, amount, mode = 'normal') => {
    if (amount <= 0) return;
    const p = i * 4;
    const ba = pixels[p + 3] / 255;
    for (let c = 0; c < 3; c += 1) {
      const b = pixels[p + c] / 255;
      const s = rgb[c] / 255;
      const blended = ba > 0 ? (blendChannel(mode, b, s) ?? s) : s;
      const mixed = (1 - ba) * s + ba * blended;
      const out = ba + amount * (1 - ba) > 0 ? (amount * mixed + ba * b * (1 - amount)) / (amount + ba * (1 - amount)) : 0;
      pixels[p + c] = Math.round(clamp01(out) * 255);
    }
    pixels[p + 3] = Math.round(clamp01(amount + ba * (1 - amount)) * 255);
  };
  // An interior style only where the shape is, at the shape's coverage, over the content.
  const paintInside = (i, rgb, amount, mode) => {
    const cover = coverage(i);
    if (cover <= 0 || amount <= 0) return;
    // At the shape's coverage, whatever the content's Fill opacity left of it.
    paint(i, rgb, amount * cover, mode);
  };
  const modeOf = (effect, fallback) => String(effect?.blendMode ?? fallback);

  // Overlays first (bottom of the interior styles), as Photoshop stacks them: pattern, gradient, colour.
  const pattern = effects.patternOverlay;
  if (enabled(pattern) && pattern.picture) {
    const { width: pw, height: ph, data } = pattern.picture;
    const scale = scaleOf(pattern.scale);
    // Linked with the layer, it starts at the layer's corner; otherwise at the document's.
    const ox = (pattern.align !== false && anchor ? anchor.x : 0) + (Number(pattern.phase?.x) || 0);
    const oy = (pattern.align !== false && anchor ? anchor.y : 0) + (Number(pattern.phase?.y) || 0);
    const wrap = (v, n) => ((v % n) + n) % n;
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = left + (i % width);
      const y = top + Math.floor(i / width);
      const j = (wrap(Math.floor((y - oy) / scale), ph) * pw + wrap(Math.floor((x - ox) / scale), pw)) * 4;
      paintInside(i, [data[j], data[j + 1], data[j + 2]], (data[j + 3] / 255) * (pattern.opacity ?? 1), modeOf(pattern, 'normal'));
    }
    drawn.push('Pattern Overlay');
  }
  for (const overlay of (effects.gradientOverlay ?? []).filter(enabled)) {
    let minX = width; let minY = height; let maxX = -1; let maxY = -1;
    for (let i = 0; i < shape.length; i += 1) if (shape[i] > 0) { const x = i % width; const y = (i - x) / width; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (maxX < 0) continue;
    const a = ((overlay.angle ?? 90) * Math.PI) / 180;
    const dir = { x: Math.cos(a), y: -Math.sin(a) };
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    const half = (Math.abs((maxX - minX) * dir.x) + Math.abs((maxY - minY) * dir.y)) / 2 * scaleOf(overlay.scale) || 1;
    const radius = Math.max(maxX - minX, maxY - minY) / 2 * scaleOf(overlay.scale) || 1;
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = i % width; const y = (i - x) / width;
      const along = ((x - cx) * dir.x + (y - cy) * dir.y) / half;
      let t;
      switch (overlay.type) {
        case 'radial': t = Math.hypot(x - cx, y - cy) / radius; break;
        case 'reflected': t = Math.abs(along); break;
        case 'angle': t = ((Math.atan2(-(y - cy), x - cx) - a) / (2 * Math.PI) + 2) % 1; break;
        case 'diamond': t = (Math.abs(x - cx) + Math.abs(y - cy)) / radius; break;
        default: t = (along + 1) / 2;
      }
      if (overlay.reverse) t = 1 - t;
      const { rgb, alpha } = gradientAt(overlay.gradient, t);
      paintInside(i, rgb, alpha * (overlay.opacity ?? 1), modeOf(overlay, 'normal'));
    }
    drawn.push('Gradient Overlay');
  }
  for (const fill of (effects.solidFill ?? []).filter(enabled)) {
    const rgb = psdRgb(fill.color);
    for (let i = 0; i < shape.length; i += 1) paintInside(i, rgb, fill.opacity ?? 1, modeOf(fill, 'normal'));
    drawn.push('Color Overlay');
  }
  if (enabled(effects.satin)) {
    const satin = effects.satin;
    const size = Math.max(1, pxOf(satin.size, 14));
    const off = shadowOffset(satin.angle ?? 19, pxOf(satin.distance, 11));
    const rgb = psdRgb(satin.color);
    const soft = (x, y) => { const j = at(Math.round(x), Math.round(y)); return j < 0 ? 0 : clamp01(fromEdgeInside[j] / size); };
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = i % width; const y = (i - x) / width;
      let amount = Math.abs(soft(x + off.x, y + off.y) - soft(x - off.x, y - off.y));
      if (satin.invert) amount = 1 - amount;
      paintInside(i, rgb, amount * (satin.opacity ?? 0.5), modeOf(satin, 'multiply'));
    }
    drawn.push('Satin');
  }
  if (enabled(effects.innerGlow)) {
    const glow = effects.innerGlow;
    const size = Math.max(1, pxOf(glow.size, 5));
    const choke = (pxOf(glow.choke, 0) / 100);
    const rgb = glow.color ? psdRgb(glow.color) : [255, 255, 190];
    const centre = glow.source === 'center';
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const t = fromEdgeInside[i] / size;
      let amount = clamp01((1 - t) / Math.max(0.01, 1 - choke));
      if (centre) amount = 1 - amount;
      paintInside(i, rgb, amount * (glow.opacity ?? 0.75), modeOf(glow, 'screen'));
    }
    drawn.push('Inner Glow');
  }
  for (const shadow of (effects.innerShadow ?? []).filter(enabled)) {
    const size = Math.max(1, pxOf(shadow.size, 5));
    const off = shadowOffset(shadow.angle, pxOf(shadow.distance, 5));
    const rgb = psdRgb(shadow.color);
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = i % width; const y = (i - x) / width;
      // The shadow of the outside, moved by the offset and softened by the size.
      const j = at(Math.round(x - off.x), Math.round(y - off.y));
      const amount = j < 0 ? 1 : clamp01(1 - fromEdgeInside[j] / size);
      paintInside(i, rgb, amount * (shadow.opacity ?? 0.75), modeOf(shadow, 'multiply'));
    }
    drawn.push('Inner Shadow');
  }
  if (enabled(effects.bevel)) {
    const bevel = effects.bevel;
    const size = Math.max(1, pxOf(bevel.size, 5));
    const depth = (bevel.strength ?? 100) / 100;
    const angle = ((bevel.angle ?? 120) * Math.PI) / 180;
    const altitude = ((bevel.altitude ?? 30) * Math.PI) / 180;
    const light = { x: Math.cos(altitude) * Math.cos(angle), y: -Math.cos(altitude) * Math.sin(angle), z: Math.sin(altitude) };
    const down = bevel.direction === 'down' ? -1 : 1;
    const height = (j) => (j < 0 ? 0 : clamp01(fromEdgeInside[j] / size));
    const hi = bevel.highlightColor ? psdRgb(bevel.highlightColor) : [255, 255, 255];
    const lo = bevel.shadowColor ? psdRgb(bevel.shadowColor) : [0, 0, 0];
    for (let i = 0; i < shape.length; i += 1) {
      if (shape[i] <= 0) continue;
      const x = i % width; const y = (i - x) / width;
      const dx = (height(at(x + 1, y)) - height(at(x - 1, y))) / 2;
      const dy = (height(at(x, y + 1)) - height(at(x, y - 1))) / 2;
      const k = size * depth * down;
      const n = { x: -dx * k, y: -dy * k, z: 1 };
      const len = Math.hypot(n.x, n.y, n.z);
      const shade = (n.x * light.x + n.y * light.y + n.z * light.z) / len - light.z;
      if (shade > 0) paintInside(i, hi, clamp01(shade * 2) * (bevel.highlightOpacity ?? 0.75), String(bevel.highlightBlendMode ?? 'screen'));
      else if (shade < 0) paintInside(i, lo, clamp01(-shade * 2) * (bevel.shadowOpacity ?? 0.75), String(bevel.shadowBlendMode ?? 'multiply'));
    }
    drawn.push('Bevel & Emboss');
  }
  for (const stroke of (effects.stroke ?? []).filter(enabled)) {
    const size = Math.max(0.5, pxOf(stroke.size, 3));
    const position = stroke.position ?? 'outside';
    const rgb = stroke.fillType === 'gradient' ? gradientAt(stroke.gradient, 0.5).rgb : psdRgb(stroke.color);
    for (let i = 0; i < shape.length; i += 1) {
      const outerReach = position === 'outside' ? size : position === 'center' ? size / 2 : 0;
      const innerReach = position === 'inside' ? size : position === 'center' ? size / 2 : 0;
      let amount = 0;
      if (shape[i] < 0.5) amount = clamp01(outerReach + 0.5 - fromEdgeOutside[i]);
      else amount = clamp01(innerReach + 0.5 - fromEdgeInside[i]);
      if (amount > 0) paint(i, rgb, amount * (stroke.opacity ?? 1), modeOf(stroke, 'normal'));
    }
    drawn.push(stroke.fillType === 'gradient' ? 'Stroke (its gradient as one colour)' : 'Stroke');
  }
  if (enabled(pattern) && !pattern.picture) drawn.push('Pattern Overlay (not drawn: the file does not keep its pattern)');
  return drawn;
}

/** What the panel flattening takes to draw layer styles (utils/psdComposite.js compositePsd). */
export const LAYER_STYLES = Object.freeze({ cast: castShadows, draw: drawLayerStyles, reach: stylesReach });
