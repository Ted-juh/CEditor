/**
 * Hex color math helpers used by border/stroke rendering.
 * Accept "RRGGBB", "AARRGGBB", or "#RRGGBB" — only the last 6 chars matter.
 * All functions return "#RRGGBB".
 */

export function parseHexRGB(hex) {
  const h = hex.replace('#', '').slice(-6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Scale each channel toward 0 by `factor`. Default 0.55 matches the border groove shading. */
export function darken(hex, factor = 0.55) {
  const [r, g, b] = parseHexRGB(hex);
  return toHex(r * factor, g * factor, b * factor);
}

/** Scale each channel toward 255 by `factor`. Default 0.4 matches the border groove highlight. */
export function lighten(hex, factor = 0.4) {
  const [r, g, b] = parseHexRGB(hex);
  return toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}
