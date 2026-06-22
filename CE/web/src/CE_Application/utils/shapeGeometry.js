// Shared geometry for vector "polygon" shape parts.
//
// Each shape is a list of [x, y] vertices in normalized 0..1 box space (y grows
// downward, matching screen coordinates). This single source of truth drives:
//   - the on-canvas / live SVG renderer (InteractivePartRenderer)
//   - the palette glyph icons (CSS clip-path)
//   - the drag draw-preview (CSS clip-path)
//
// Adding a new flat shape is just a new entry here — no renderer changes needed.

function regularPolygon(sides, rotationDeg = -90) {
  const points = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i += 1) {
    const a = rot + (i * 2 * Math.PI) / sides;
    points.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
  }
  return points;
}

function star(points = 5, innerRatio = 0.5, rotationDeg = -90) {
  const verts = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * innerRatio;
    const a = rot + (i * Math.PI) / points;
    verts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
  }
  return verts;
}

// camelCase keys match the draw-tool ids; lookups are case-insensitive.
export const SHAPE_POLYGONS = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  rightTriangle: [[0, 0], [0, 1], [1, 1]],
  parallelogram: [[0.28, 0], [1, 0], [0.72, 1], [0, 1]],
  trapezoid: [[0.22, 0], [0.78, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regularPolygon(5),
  hexagon: regularPolygon(6, 0),
  star: star(5, 0.5),
  chevron: [[0, 0], [0.62, 0], [1, 0.5], [0.62, 1], [0, 1], [0.38, 0.5]],
  arrow: [[0, 0.32], [0.58, 0.32], [0.58, 0.1], [1, 0.5], [0.58, 0.9], [0.58, 0.68], [0, 0.68]],
  plus: [
    [0.36, 0], [0.64, 0], [0.64, 0.36], [1, 0.36], [1, 0.64], [0.64, 0.64],
    [0.64, 1], [0.36, 1], [0.36, 0.64], [0, 0.64], [0, 0.36], [0.36, 0.36],
  ],
};

const LOWER_LOOKUP = Object.create(null);
for (const [key, value] of Object.entries(SHAPE_POLYGONS)) {
  LOWER_LOOKUP[key.toLowerCase()] = value;
}

// Lowercased kind ids, for callers that need to test membership.
export const POLYGON_SHAPE_KINDS = new Set(Object.keys(LOWER_LOOKUP));

// Returns the normalized vertex list for a shape kind, or null if not a polygon.
export function polygonPoints(kind) {
  return LOWER_LOOKUP[String(kind ?? '').toLowerCase()] ?? null;
}

export function isPolygonKind(kind) {
  return polygonPoints(kind) != null;
}

// CSS clip-path string for glyphs / draw previews.
export function polygonToClipPath(points) {
  if (!points || !points.length) return 'none';
  return `polygon(${points.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ')})`;
}

// `clip-path` for a kind id directly (or 'none' if it isn't a polygon).
export function clipPathForKind(kind) {
  return polygonToClipPath(polygonPoints(kind));
}

// SVG `points` attribute string, scaled into a width x height box. `inset`
// shrinks the shape uniformly so a stroke stays inside the part bounds.
export function polygonToSvgPoints(points, width, height, inset = 0) {
  if (!points || !points.length) return '';
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  return points
    .map(([x, y]) => `${(inset + x * w).toFixed(2)},${(inset + y * h).toFixed(2)}`)
    .join(' ');
}
