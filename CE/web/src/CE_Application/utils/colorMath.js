/**
 * Color space conversions + quantization used across the color editor.
 *
 * All hex values are 6-character uppercase RRGGBB unless explicitly noted.
 * `rgbToHsl` returns raw floats so callers can preserve drag precision;
 * consumers that need display-stable integers should round at the call site.
 *
 * This module is distinct from `colorHelpers.js` (which handles RGB-channel
 * darken/lighten for border stroke shading) — different semantics, different
 * use cases.
 */

export function hexToRgb(hex) {
  const h = hex.replace(/^#/, '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Split a stored colour — AARRGGBB or RRGGBB, optional leading # — into a
 * 6-char RRGGBB and a 0-1 alpha. Panel/control colours are stored AARRGGBB;
 * feeding one to a 6-char consumer without this reads AA RR GG as the colour
 * (the "default panel shows bright red" bug).
 */
export function splitColourAlpha(hex, fallback = '333333') {
  const h = String(hex ?? fallback).replace(/^#/, '');
  if (h.length >= 8) {
    return { color: h.slice(2, 8).toUpperCase(), alpha: parseInt(h.slice(0, 2), 16) / 255 };
  }
  return { color: h.slice(0, 6).toUpperCase().padEnd(6, '0'), alpha: 1 };
}

/** Uppercase RRGGBB, with clamp + round so fractional/out-of-range inputs are safe. */
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  return c(r) + c(g) + c(b);
}

/**
 * Convert RGB (0-255) to HSL (h: 0-360, s/l: 0-100). Returns floats.
 * When the input is achromatic (r === g === b), h and s are 0 — callers that
 * want to "preserve" a previous hue/sat should guard on that themselves.
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return [h, s * 100, l * 100];
}

/** HSL → RGB. Returns rounded 0-255 integers. */
export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** HSL → uppercase RRGGBB hex (convenience wrapper). */
export function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** Alpha (0-1 float) → 2-char uppercase hex. */
export function alphaToHex(alpha) {
  return Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Quantize a 0-255 channel value to `bits` levels. bits=3 → 8 levels,
 * bits=5 → 32 levels, bits=6 → 64 levels, etc.
 */
export function quantizeChannel(value, bits) {
  const levels = (1 << bits) - 1;
  return Math.round(value / 255 * levels) * 255 / levels;
}

/**
 * Quantize an RGB triple to a standard bit depth. '8' is 3-3-2 (RRRGGGBB);
 * '16' is 5-6-5 (RRRRRGGGGGGBBBBB). Any other depth passes through.
 */
export function quantizeColor(r, g, b, depth) {
  switch (depth) {
    case '8':  return [quantizeChannel(r, 3), quantizeChannel(g, 3), quantizeChannel(b, 2)];
    case '16': return [quantizeChannel(r, 5), quantizeChannel(g, 6), quantizeChannel(b, 5)];
    default:   return [r, g, b];
  }
}
