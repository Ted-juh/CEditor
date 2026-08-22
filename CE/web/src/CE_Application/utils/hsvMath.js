/**
 * HSB (a.k.a. HSV) conversions — the space every design tool's colour picker
 * actually speaks.
 *
 * WHY THIS EXISTS ALONGSIDE `colorMath.js`. The chooser used to hold its state
 * in HSL and label the lightness band "B". They are not the same axis: HSL
 * lightness runs black → colour → WHITE, so the band whited out at the top and
 * the top half of it was unreachable pastel rather than brightness. HSB value
 * runs black → colour and stops there, which is what "B" means in Photoshop,
 * Figma, Illustrator and every eyedropper readout a user has ever seen.
 *
 * `colorMath.js` keeps the HSL pair because other callers (band shading, the
 * hsla() strings) still want it — these two modules are deliberately separate
 * conversions rather than one "colour" grab bag.
 *
 * Ranges: h 0-360, s 0-100, v 0-100, r/g/b 0-255. Conversions return floats
 * for h/s/v (drag precision) and rounded integers for r/g/b.
 */

import { hexToRgb, rgbToHex } from './colorMath.js';

/** RGB (0-255) → HSB. Achromatic input returns h = 0, s = 0 — guard at the call site. */
export function rgbToHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60; break;
      case gn: h = ((bn - rn) / d + 2) * 60; break;
      default: h = ((rn - gn) / d + 4) * 60; break;
    }
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  return [h, s, max * 100];
}

/** HSB → RGB, rounded 0-255. */
export function hsvToRgb(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const vn = Math.max(0, Math.min(100, v)) / 100;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vn - c;

  let rp = 0, gp = 0, bp = 0;
  if (hh < 60)       { rp = c; gp = x; }
  else if (hh < 120) { rp = x; gp = c; }
  else if (hh < 180) { gp = c; bp = x; }
  else if (hh < 240) { gp = x; bp = c; }
  else if (hh < 300) { rp = x; bp = c; }
  else               { rp = c; bp = x; }

  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

/** HSB → uppercase RRGGBB. */
export function hsvToHex(h, s, v) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/**
 * HSB → HSL. Used for the `hsl()`/`hsla()` strings the band gradients and the
 * live preview still hand to CSS — CSS has no hsb() notation, so the colour
 * has to be translated rather than relabelled.
 */
export function hsvToHsl(h, s, v) {
  const sn = s / 100, vn = v / 100;
  const l = vn * (1 - sn / 2);
  const sl = (l === 0 || l === 1) ? 0 : (vn - l) / Math.min(l, 1 - l);
  return [h, sl * 100, l * 100];
}

/** HSL → HSB, for reading a colour that arrived in the older space. */
export function hslToHsv(h, s, l) {
  const sn = s / 100, ln = l / 100;
  const v = ln + sn * Math.min(ln, 1 - ln);
  const sv = v === 0 ? 0 : 2 * (1 - ln / v);
  return [h, sv * 100, v * 100];
}

/** `hsla(...)` string for a HSB triple plus alpha — CSS cannot take HSB directly. */
export function hsvToHslaString(h, s, v, alpha = 1) {
  const [hh, sl, l] = hsvToHsl(h, s, v);
  return `hsla(${hh}, ${sl}%, ${l}%, ${alpha})`;
}

/**
 * RRGGBB → HSB, keeping the axes the colour cannot pin down.
 *
 * Black is (any hue, any saturation, 0) and grey is (any hue, 0, v): the
 * conversion has to report zeroes, but a picker that OBEYS them throws the
 * square's thumb into a corner the instant someone drags brightness to the
 * bottom, and the hue they were working in is gone. So the ambiguous axes come
 * from `prev` — the position the user last put the thumb in.
 */
export function hexToHsvPreserving(hex, prev = { h: 0, s: 0, v: 0 }) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v === 0) return { h: prev.h ?? 0, s: prev.s ?? 0, v: 0 };
  if (s === 0) return { h: prev.h ?? 0, s: 0, v };
  return { h, s, v };
}
