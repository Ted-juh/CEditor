/**
 * Convert a CSS-style gradient angle to absolute linear-gradient coordinates
 * spanning a box of WxH.
 *
 * Angle convention matches CSS: 0° = up, 90° = right, 180° = down, 270° = left.
 * Intended for use with SVG `gradientUnits="userSpaceOnUse"` so gradients
 * still paint correctly on zero-area paths like horizontal/vertical lines.
 *
 * Returns { x1, y1, x2, y2 }.
 */
export function gradientCoords(angle, W, H) {
  const a = (angle ?? 0) * Math.PI / 180;
  const cx = W / 2, cy = H / 2;
  const dx = Math.sin(a) * W / 2;
  const dy = -Math.cos(a) * H / 2;
  return {
    x1: cx - dx,
    y1: cy - dy,
    x2: cx + dx,
    y2: cy + dy,
  };
}
