/**
 * CSS backgrounds for the colour chooser: the 2D saturation/brightness square
 * and the four 1-D band sliders under it.
 *
 * THESE ARE HSB NOW, AND THE "B" BAND MEANS IT. They used to be HSL, with the
 * lightness band labelled "B" — so the band ran black → colour → white and the
 * top half of it was pastel that no amount of dragging could turn into the
 * bright saturated colour the label promised. Every other design tool's "B" is
 * HSB value: black → colour, full stop. Each band is built from explicit hex
 * stops via `hsvToHex` rather than from CSS `hsl()`, because CSS has no hsb()
 * notation and translating each stop is the only way to draw the real axis.
 */

import { hsvToHex, hsvToHslaString } from './hsvMath.js';

const stop = (h, s, v) => `#${hsvToHex(h, s, v)}`;

/** Full hue spectrum (0° → 360° in 30° steps) at the given HSB saturation and value. */
export function hueBand(saturation, value) {
  const stops = [];
  for (let i = 0; i <= 360; i += 30) stops.push(stop(i, saturation, value));
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Saturation axis (100% → 0%) at the given hue and value. The band is drawn right-to-left. */
export function saturationBand(hue, value) {
  return `linear-gradient(to right, ${stop(hue, 100, value)}, ${stop(hue, 0, value)})`;
}

/**
 * Brightness axis (0% → 100%) at the given hue and saturation: black to the
 * colour itself. It does NOT end at white — that was the bug.
 */
export function brightnessBand(hue, saturation) {
  return `linear-gradient(to right, ${stop(hue, saturation, 0)}, ${stop(hue, saturation, 100)})`;
}

/** Alpha axis (1 → 0) at the given HSB colour. */
export function alphaBand(hue, saturation, value) {
  return `linear-gradient(to right, ${hsvToHslaString(hue, saturation, value, 1)}, ${hsvToHslaString(hue, saturation, value, 0)})`;
}

/**
 * The 2D saturation/brightness square for one hue: the pure hue, with white
 * washed in from the left and black from the bottom. Left-to-right is
 * saturation 0 → 100, bottom-to-top is brightness 0 → 100 — the arrangement
 * Photoshop, Figma and Illustrator all use, so the thumb lands where the hand
 * expects it to.
 */
export function svSquareBackground(hue) {
  return [
    'linear-gradient(to top, #000000, rgba(0, 0, 0, 0))',
    'linear-gradient(to right, #FFFFFF, rgba(255, 255, 255, 0))',
    `${stop(hue, 100, 100)}`,
  ].join(', ');
}
