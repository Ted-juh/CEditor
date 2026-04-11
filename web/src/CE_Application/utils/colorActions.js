/**
 * "Quick action" color transformations for the Colors tab sidebar.
 * All functions return an uppercase RRGGBB hex string.
 *
 * HSL-space actions (lighten/darken/saturate/desaturate) take precomputed
 * h, s, l values so the caller can preserve a "last non-achromatic" hue/sat
 * when the current color is grey.
 */

import { hexToRgb, rgbToHex, hslToRgb } from './colorMath.js';

/** Channel-wise invert. */
export function invertColor(hex6) {
  const [r, g, b] = hexToRgb(hex6);
  return rgbToHex(255 - r, 255 - g, 255 - b);
}

/** Luminosity-weighted grayscale (Rec. 601 coefficients). */
export function grayscaleColor(hex6) {
  const [r, g, b] = hexToRgb(hex6);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return rgbToHex(gray, gray, gray);
}

/** Clamp a value to [0, 100]. */
const clampHsl = (v) => Math.max(0, Math.min(100, v));

/** Shift lightness by `delta` (in HSL % units), keeping hue and saturation. */
export function shiftLightness(h, s, l, delta) {
  const [r, g, b] = hslToRgb(h, s, clampHsl(l + delta));
  return rgbToHex(r, g, b);
}

/** Shift saturation by `delta` (in HSL % units), keeping hue and lightness. */
export function shiftSaturation(h, s, l, delta) {
  const [r, g, b] = hslToRgb(h, clampHsl(s + delta), l);
  return rgbToHex(r, g, b);
}
