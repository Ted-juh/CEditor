// deviceShapes.js — the outline of a button's or a switch's part, as an SVG path.
//
// The button and switch forms drew their keys, housings and levers in code
// (editor/ControlAnatomy.svelte). As the control's own parts (models/buttonDeviceParts.js) each is a
// shape in a box, its kind and one depth a property, editable and set by a control set like any
// other (docs/design/changeable-control-sets.md, piece B).
//
//   rect       a rectangle, its corners rounded by `radius`
//   ellipse    the ellipse in the box
//   diamond    a square set on its corner, stretched to the box
//   hexagon    a flat hexagon, its ends cut `depth` % of the width in
//   flap       a sheet with its top right corner folded, the fold `depth` % of the height
//   corner     the fold itself: a right triangle, its square corner at the bottom left
//   pillow     a soft cushion: bulging sides, rounded corners
//   bracket    a guard: two legs and a bar across the top, `depth` % of the box thick
//   crosshair  a cross of hairlines, open `depth` % in the middle
//   pair       two halves side by side, `depth` % of the width apart
//   ribbon     a bookmark: a strip with a notch cut into its foot, `depth` % of the height
//   ring       a ring `depth` % of the radius wide, round a hole
//   arch       a radio's cabinet: straight sides, a curved top, its shoulders `depth` % down
//   ticket     a paper tally: its top edge pinked in teeth `depth` % of the height high
//   pointer    a cursor: a triangle pointing down
//
// `pattern` repeats the shape in its box: 'lines' as `count` bars across, 'grid' as `count` by
// `rows` cells, 'columns' as `count` bars side by side. The grooves of a rubber pad, the dots of a
// pixel key, a binary cell, the strokes of a tally. In 'grid' and 'columns' the first cell starts
// at the box's left edge and the last ends at its right; `cellWidth` and `cellHeight` say how much
// of its pitch a cell fills, in %.

export const DEVICE_SHAPES = ['rect', 'ellipse', 'diamond', 'hexagon', 'flap', 'corner', 'pillow', 'bracket', 'crosshair', 'pair', 'ribbon', 'ring', 'arch', 'ticket', 'pointer'];
export const DEVICE_PATTERNS = ['solid', 'lines', 'grid', 'columns'];

const f = (value) => Number(Number(value).toFixed(2));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function polygon(points) {
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ')} Z`;
}

function rect(x, y, w, h, r = 0) {
  const radius = clamp(r, 0, Math.min(w, h) / 2);
  if (!radius) return polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  return `M${f(x + radius)} ${f(y)} H${f(x + w - radius)} A${f(radius)} ${f(radius)} 0 0 1 ${f(x + w)} ${f(y + radius)}`
    + ` V${f(y + h - radius)} A${f(radius)} ${f(radius)} 0 0 1 ${f(x + w - radius)} ${f(y + h)}`
    + ` H${f(x + radius)} A${f(radius)} ${f(radius)} 0 0 1 ${f(x)} ${f(y + h - radius)}`
    + ` V${f(y + radius)} A${f(radius)} ${f(radius)} 0 0 1 ${f(x + radius)} ${f(y)} Z`;
}

function ellipse(x, y, w, h) {
  const rx = w / 2;
  const ry = h / 2;
  return `M${f(x)} ${f(y + ry)} A${f(rx)} ${f(ry)} 0 1 0 ${f(x + w)} ${f(y + ry)} A${f(rx)} ${f(ry)} 0 1 0 ${f(x)} ${f(y + ry)} Z`;
}

// The soft cushion's drawing (the form's), in a unit box: quadratic bulges on every side.
const PILLOW = [
  ['M', 0.056, 0.348], ['Q', 0.113, -0.043, 0.5, 0.087], ['Q', 0.887, -0.043, 0.944, 0.348],
  ['Q', 1.049, 0.942, 0.746, 1], ['L', 0.254, 1], ['Q', -0.049, 0.957, 0.056, 0.348],
];

function pillow(x, y, w, h) {
  const px = (u) => f(x + u * w);
  const py = (v) => f(y + v * h);
  return `${PILLOW.map(([op, ...n]) => (op === 'Q'
    ? `Q${px(n[0])} ${py(n[1])} ${px(n[2])} ${py(n[3])}`
    : `${op}${px(n[0])} ${py(n[1])}`)).join(' ')} Z`;
}

/** The shape's path in its box. `depth` is a percentage; `radius` is in the drawing's units. */
export function deviceShapePath(kind, x, y, w, h, { depth = 20, radius = 0 } = {}) {
  const width = Math.max(0, Number(w) || 0);
  const height = Math.max(0, Number(h) || 0);
  if (!width || !height) return '';
  const d = clamp(depth, 0, 95) / 100;
  switch (String(kind ?? 'rect')) {
    case 'ellipse':
      return ellipse(x, y, width, height);
    case 'diamond':
      return polygon([[x + width / 2, y], [x + width, y + height / 2], [x + width / 2, y + height], [x, y + height / 2]]);
    case 'hexagon': {
      const cut = width * Math.min(0.5, d);
      return polygon([[x + cut, y], [x + width - cut, y], [x + width, y + height / 2], [x + width - cut, y + height], [x + cut, y + height], [x, y + height / 2]]);
    }
    case 'flap': {
      const fold = Math.min(width, height) * d;
      return polygon([[x, y], [x + width - fold, y], [x + width, y + fold], [x + width, y + height], [x, y + height]]);
    }
    case 'corner':
      return polygon([[x, y], [x, y + height], [x + width, y + height]]);
    case 'pillow':
      return pillow(x, y, width, height);
    case 'bracket': {
      const t = Math.max(0.5, Math.min(width / 2, height) * d);
      return polygon([[x, y + height], [x, y], [x + width, y], [x + width, y + height], [x + width - t, y + height], [x + width - t, y + t], [x + t, y + t], [x + t, y + height]]);
    }
    case 'crosshair': {
      // Hairlines one unit wide; the gap in the middle is `depth` % of each side.
      const cx = x + width / 2;
      const cy = y + height / 2;
      const gx = (width * d) / 2;
      const gy = (height * d) / 2;
      const t = 0.5;
      return [
        rect(cx - t, y, t * 2, Math.max(0, height / 2 - gy)),
        rect(cx - t, cy + gy, t * 2, Math.max(0, height / 2 - gy)),
        rect(x, cy - t, Math.max(0, width / 2 - gx), t * 2),
        rect(cx + gx, cy - t, Math.max(0, width / 2 - gx), t * 2),
      ].join(' ');
    }
    case 'pair': {
      const gap = width * Math.min(0.9, d);
      const half = (width - gap) / 2;
      return `${rect(x, y, half, height, radius)} ${rect(x + half + gap, y, half, height, radius)}`;
    }
    case 'ribbon': {
      const notch = height * Math.min(0.5, d);
      return polygon([[x, y], [x + width, y], [x + width, y + height], [x + width / 2, y + height - notch], [x, y + height]]);
    }
    case 'ring': {
      const inner = 1 - Math.max(0.02, d);
      const iw = width * inner;
      const ih = height * inner;
      // The hole drawn the other way round: the even-odd hole of an annulus.
      return `${ellipse(x, y, width, height)} M${f(x + (width - iw) / 2)} ${f(y + height / 2)}`
        + ` A${f(iw / 2)} ${f(ih / 2)} 0 1 1 ${f(x + (width + iw) / 2)} ${f(y + height / 2)}`
        + ` A${f(iw / 2)} ${f(ih / 2)} 0 1 1 ${f(x + (width - iw) / 2)} ${f(y + height / 2)} Z`;
    }
    case 'arch': {
      // A quadratic top through the box's top edge, from shoulders `depth` % down each side.
      const shoulder = y + height * d;
      const control = 2 * y - shoulder;
      return `M${f(x)} ${f(y + height)} V${f(shoulder)} Q${f(x + width / 2)} ${f(control)} ${f(x + width)} ${f(shoulder)} V${f(y + height)} Z`;
    }
    case 'ticket': {
      // Pinked: teeth `depth` % of the height high and 3.2 times as wide, from the left, the last
      // half tooth running out to the right edge (as the paper tally was drawn).
      const tooth = Math.max(0.5, height * d);
      const half = tooth * 1.6;
      const points = [];
      for (let i = 0; x + i * half <= x + width - half + 1e-6; i += 1) points.push([x + i * half, y + (i % 2 ? 0 : tooth)]);
      if (points.length > 2 && points.length % 2 === 1) points.pop();
      return polygon([...points, [x + width, y + tooth], [x + width, y + height], [x, y + height]]);
    }
    case 'pointer':
      return polygon([[x, y], [x + width, y], [x + width / 2, y + height]]);
    default:
      return rect(x, y, width, height, radius);
  }
}

// A cell's share of its pitch, from a % (a grid's default: two thirds, the gap half a cell).
const share = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(1, n / 100) : fallback;
};

/**
 * The cells a pattern repeats the shape into: one box for 'solid', `count` bars across the box
 * for 'lines' (each half the pitch high), `count` by `rows` cells for 'grid', `count` bars side by
 * side for 'columns'. Each cell says its column, `col`, of `cols`: a meter lights its cells by it.
 */
export function devicePatternCells(pattern, x, y, w, h, { count = 4, rows = 3, cellWidth = null, cellHeight = null } = {}) {
  const n = Math.max(1, Math.min(64, Math.round(Number(count) || 1)));
  if (pattern === 'lines') {
    const pitch = h / n;
    const ch = pitch * share(cellHeight, 0.5);
    return Array.from({ length: n }, (_, i) => ({ x, y: y + i * pitch + (pitch - ch) / 2, w, h: ch, col: 0, cols: 1 }));
  }
  if (pattern === 'grid' || pattern === 'columns') {
    const r = pattern === 'columns' ? 1 : Math.max(1, Math.min(64, Math.round(Number(rows) || 1)));
    const sx = share(cellWidth, pattern === 'columns' ? 0.5 : 2 / 3);
    const sy = pattern === 'columns' ? 1 : share(cellHeight, 2 / 3);
    const px = w / (n - 1 + sx);
    const py = h / (r - 1 + sy);
    const cells = [];
    for (let j = 0; j < r; j += 1) {
      for (let i = 0; i < n; i += 1) cells.push({ x: x + i * px, y: y + j * py, w: px * sx, h: py * sy, col: i, cols: n });
    }
    return cells;
  }
  return [{ x, y, w, h, col: 0, cols: 1 }];
}
