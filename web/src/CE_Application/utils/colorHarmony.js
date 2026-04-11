/**
 * Color harmony calculations — produce related colors in HSL space.
 * All functions take base HSL values (already extracted from the current
 * color) and return an array of uppercase RRGGBB hex strings, not
 * including the base color itself.
 */

import { hslToHex } from './colorMath.js';

/** Shift a hue value by `deg` degrees, wrapped into [0, 360). */
export function hueShift(h, deg) {
  return ((h + deg) % 360 + 360) % 360;
}

/**
 * Return the harmony colors for the given base (h, s, l) and harmony type.
 * Supported types:
 *   'complementary' — 1 color at +180°
 *   'analogous'     — 2 colors at ±30°
 *   'triadic'       — 2 colors at +120° / +240°
 *   'split'         — 2 colors at +150° / +210° (split complementary)
 *   'tetradic'      — 3 colors at +90° / +180° / +270°
 */
export function computeHarmony(h, s, l, type) {
  const at = (deg) => hslToHex(hueShift(h, deg), s, l);
  switch (type) {
    case 'complementary': return [at(180)];
    case 'analogous':     return [at(-30), at(30)];
    case 'triadic':       return [at(120), at(240)];
    case 'split':         return [at(150), at(210)];
    case 'tetradic':      return [at(90), at(180), at(270)];
    default:              return [];
  }
}
