// knobOutlines.js — the outline of a knob's cap or housing plate, as an SVG path.
//
// The control forms drew these shapes in code (editor/ControlAnatomy.svelte: the scalloped
// selector's star, the lens's octagon, the encoder's hexagon). As outlines of the knob's own parts
// they are properties (`outline`, `outlineCount`, `outlineDepth`), editable on the Knob tab and set
// by a control set like any other (docs/design/changeable-control-sets.md, piece B).
//
//   circle   the default: no path, the part draws a circle
//   polygon  a regular polygon with `count` corners, a corner at the top
//   scallop  a star: `count` points, the notches `depth` % of the radius in
//   flutes   a round grip: `count` rounded flutes `depth` % deep
//   ring     an annulus: a hole `depth` % of the radius wide (100 - depth is the hole's radius)
// `rotation` turns the outline, in degrees clockwise: a part that turns with the value passes it.

export const KNOB_OUTLINES = ['circle', 'polygon', 'scallop', 'flutes', 'ring'];

const fixed = (value) => Number(value.toFixed(2));

function point(cx, cy, r, degrees) {
  const a = (degrees - 90) * Math.PI / 180;
  return [fixed(cx + Math.cos(a) * r), fixed(cy + Math.sin(a) * r)];
}

function closed(points) {
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')} Z`;
}

/** The outline's path, or '' for a circle (the part draws its own). */
export function knobOutlinePath(kind, cx, cy, r, { count = 8, depth = 20, rotation = 0 } = {}) {
  const n = Math.max(3, Math.min(96, Math.round(Number(count) || 8)));
  const d = Math.max(0, Math.min(95, Number(depth) || 0)) / 100;
  const radius = Math.max(0, Number(r) || 0);
  if (!radius) return '';
  if (kind === 'polygon') {
    return closed(Array.from({ length: n }, (_, i) => point(cx, cy, radius, rotation + (i * 360) / n)));
  }
  if (kind === 'scallop') {
    return closed(Array.from({ length: n * 2 }, (_, i) => point(cx, cy, i % 2 ? radius * (1 - d) : radius, rotation + (i * 180) / n)));
  }
  if (kind === 'flutes') {
    const steps = n * 12;
    return closed(Array.from({ length: steps }, (_, i) => {
      const t = i / steps;
      const wave = 0.5 - 0.5 * Math.cos(t * n * 2 * Math.PI);
      return point(cx, cy, radius * (1 - d * Math.pow(wave, 0.6)), rotation + t * 360);
    }));
  }
  if (kind === 'ring') {
    const inner = radius * (1 - Math.max(0.05, d));
    // Two circles, the inner drawn the other way round: the even-odd hole of an annulus.
    return `M${fixed(cx - radius)} ${fixed(cy)} a${fixed(radius)} ${fixed(radius)} 0 1 0 ${fixed(radius * 2)} 0 a${fixed(radius)} ${fixed(radius)} 0 1 0 ${fixed(-radius * 2)} 0 Z `
      + `M${fixed(cx - inner)} ${fixed(cy)} a${fixed(inner)} ${fixed(inner)} 0 1 1 ${fixed(inner * 2)} 0 a${fixed(inner)} ${fixed(inner)} 0 1 1 ${fixed(-inner * 2)} 0 Z`;
  }
  return '';
}
