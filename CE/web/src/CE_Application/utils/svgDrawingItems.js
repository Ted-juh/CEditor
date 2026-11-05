// svgDrawingItems.js — a drawing's SVG markup read into the items utils/formDrawingLayers.js makes
// into layers: what a classic form draws (editor/PhysicalAnatomy.svelte and the two series after it),
// written out once as markup (utils/synthKnobDrawings.js) and read here shape by shape.
//
// It reads what those drawings use and nothing more: circle, ellipse, rect, path, polygon and text,
// groups, `rotate` and `translate`, fill, stroke and their opacities, and gradients by id. A fill and
// a stroke are each an item of their own, the stroke the band it paints (formDrawingLayers' bands:
// square ends, mitred corners). Four marks say what the value does, where the drawing used code:
//
//   <g data-turn="x y">     turns with the value about (x, y), as rotate(angle x y) did
//   <g data-lit="t">        shows from `t` of the travel on, as a tick lit up to the value did
//   <valuearc r w stroke>   the arc from the start of the sweep to the value
//   <text data-readout>     the value, as the knob's readout writes it
//
// and two what an SVG filter did: `filter="shadow"` on a group or a shape (a drop shadow: its
// silhouette, lower, blurred, under it, in the group's own turned space as the filter was) and
// `filter="glow"` on a shape (a blurred copy under it). A group's silhouette is the shapes in it
// marked `data-cast`, or an outline drawn for it alone (`data-castonly`); several are hulled.

import { flattenPath } from './svgPathScale.js';

const NAMED = { white: 'FFFFFFFF', black: 'FF000000', none: '' };

function attributes(text) {
  const out = {};
  for (const match of String(text).matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[match[1]] = match[2];
  for (const match of String(text).matchAll(/\s([\w:-]+)(?=\s|\/|$)/g)) if (!(match[1] in out)) out[match[1]] = '';
  return out;
}

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// --- transforms ----------------------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 1, 0, 0];
function multiply([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}
function parseTransform(text) {
  let m = IDENTITY;
  for (const [, op, args] of String(text ?? '').matchAll(/(rotate|translate|scale)\s*\(([^)]*)\)/g)) {
    const n = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (op === 'translate') m = multiply(m, [1, 0, 0, 1, n[0] || 0, n[1] || 0]);
    else if (op === 'scale') m = multiply(m, [n[0], 0, 0, n[1] ?? n[0], 0, 0]);
    else {
      const a = ((n[0] || 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] || 0, n[2] || 0];
      m = multiply(m, [1, 0, 0, 1, cx, cy]);
      m = multiply(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
      m = multiply(m, [1, 0, 0, 1, -cx, -cy]);
    }
  }
  return m;
}
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];
const plainMatrix = (m) => Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[0] - m[3]) < 1e-9 && m[0] > 0;

// --- outlines ------------------------------------------------------------------------------------

function sampleEllipse(cx, cy, rx, ry, n = 96) {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rx, cy + Math.sin((i / n) * 2 * Math.PI) * ry]);
}
function roundedRect(x, y, w, h, rx) {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (!r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const pts = [];
  const corner = (cx, cy, from) => { for (let i = 0; i <= 8; i += 1) { const a = ((from + (i * 90) / 8) * Math.PI) / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x + w - r, y + r, -90); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, 90); corner(x + r, y + r, 180);
  return pts;
}
const dedupe = (pts) => {
  const out = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 1e-9) out.pop();
  return out;
};

function offsetPolygon(points, distance) {
  const pts = dedupe(points);
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const outward = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = (outward * (q[1] - p[1])) / len;
    const ny = (outward * -(q[0] - p[0])) / len;
    return { a: [p[0] + nx * distance, p[1] + ny * distance], b: [q[0] + nx * distance, q[1] + ny * distance], d: [q[0] - p[0], q[1] - p[1]], n: [nx, ny] };
  });
  const out = [];
  lines.forEach((line, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cross = prev.d[0] * line.d[1] - prev.d[1] * line.d[0];
    if (Math.abs(cross) < 1e-9) { out.push(line.a); return; }
    const ratio = 1 / Math.sqrt(Math.max(1e-9, (1 + prev.n[0] * line.n[0] + prev.n[1] * line.n[1]) / 2));
    const outside = Math.sign(cross) * outward * Math.sign(distance) > 0;
    if (outside && ratio > 4) { out.push(prev.b, line.a); return; }
    const t = ((line.a[0] - prev.a[0]) * line.d[1] - (line.a[1] - prev.a[1]) * line.d[0]) / cross;
    out.push([prev.a[0] + prev.d[0] * t, prev.a[1] + prev.d[1] * t]);
  });
  return out;
}
const strokeClosed = (pts, w) => [offsetPolygon(pts, w / 2), offsetPolygon(pts, -w / 2)];
function strokeOpen(pts, w) {
  const p = dedupe(pts);
  if (p.length < 2) return [];
  const normal = (a, b) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]; };
  const left = [];
  const right = [];
  for (let i = 0; i < p.length; i += 1) {
    let n;
    let scale = 1;
    if (i === 0) n = normal(p[0], p[1]);
    else if (i === p.length - 1) n = normal(p[i - 1], p[i]);
    else {
      const n1 = normal(p[i - 1], p[i]);
      const n2 = normal(p[i], p[i + 1]);
      const sum = [n1[0] + n2[0], n1[1] + n2[1]];
      const len = Math.hypot(...sum) || 1;
      n = [sum[0] / len, sum[1] / len];
      scale = 1 / Math.max(0.25, n[0] * n1[0] + n[1] * n1[1]);
    }
    left.push([p[i][0] + n[0] * (w / 2) * scale, p[i][1] + n[1] * (w / 2) * scale]);
    right.push([p[i][0] - n[0] * (w / 2) * scale, p[i][1] - n[1] * (w / 2) * scale]);
  }
  return [[...left, ...right.reverse()]];
}

/** The convex hull of points (monotone chain). */
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// The geometry of one element, after its static transform: its fill's subpaths (closed), its
// stroke's centre line (subpaths with `closed`), and the box SVG measures a gradient on (its own
// geometry, not its stroke). Circles and plain ellipses stay exact where nothing turns them.
function geometry(tag, a, matrix) {
  const plain = plainMatrix(matrix);
  const map = (pts) => pts.map((p) => apply(matrix, p));
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(a.cx); const cy = num(a.cy);
    const rx = tag === 'circle' ? num(a.r) : num(a.rx);
    const ry = tag === 'circle' ? num(a.r) : num(a.ry);
    const outline = map(sampleEllipse(cx, cy, rx, ry));
    if (plain) {
      const [x, y] = apply(matrix, [cx, cy]);
      const k = matrix[0];
      return { fill: [{ ellipse: [x, y, rx * k, ry * k] }], line: [Object.assign(outline, { closed: true })], box: { x: x - rx * k, y: y - ry * k, w: 2 * rx * k, h: 2 * ry * k } };
    }
    return { fill: [outline], line: [Object.assign(outline, { closed: true })] };
  }
  if (tag === 'rect') {
    const pts = map(roundedRect(num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx, num(a.ry, 0))));
    return { fill: [pts], line: [Object.assign(pts, { closed: true })] };
  }
  if (tag === 'polygon') {
    const n = String(a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    const mapped = map(pts);
    return { fill: [mapped], line: [Object.assign(mapped, { closed: true })] };
  }
  if (tag === 'path' || tag === 'castonly') {
    const lists = flattenPath(a.d ?? '').map((pts) => Object.assign(map(dedupe(pts)), { closed: pts.closed === true }));
    return { fill: lists.filter((pts) => pts.length > 2), line: lists };
  }
  return null;
}

function boxOf(subpaths) {
  const xs = [];
  const ys = [];
  for (const sub of subpaths) {
    if (Array.isArray(sub)) for (const [x, y] of sub) { xs.push(x); ys.push(y); }
    else { const [cx, cy, rx, ry] = sub.ellipse ?? [...sub.circle, sub.circle[2]]; xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry); }
  }
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// The points of an outline, a circle's or an ellipse's sampled: for a silhouette.
const pointsOf = (subpaths) => subpaths.flatMap((sub) => (Array.isArray(sub) ? sub : sampleEllipse(...(sub.ellipse ?? [...sub.circle, sub.circle[2]]))));

/**
 * The items `markup` draws. `colour(token)` reads a fill or stroke ("#20282c", "white", "$face") as
 * a layer colour, or '' for none; `gradients` the drawing's gradients by id; `shadow` and `glow` its
 * two filters (`{ dy, blur, colour, opacity }`, `{ blur }`).
 */
export function drawingItems(markup, { colour, gradients = {}, shadow = null, glow = null }) {
  const items = [];
  const stack = [{ matrix: IDENTITY, opacity: 1, turn: null, lit: null, group: null }];
  let counter = 0;
  const name = (tag) => `${tag}${++counter}`;
  const tokens = [...String(markup).matchAll(/<(\/?)([a-zA-Z]+)((?:[^>"]|"[^"]*")*?)(\/?)>|([^<]+)/g)];
  let openText = null;
  for (const [, close, tagRaw, attrText, selfClose, text] of tokens) {
    if (text !== undefined) {
      if (openText) openText.text += text;
      continue;
    }
    const tag = tagRaw.toLowerCase();
    const top = stack.at(-1);
    if (close) {
      if (tag === 'text' && openText) { items.push(openText.item(openText.text.trim())); openText = null; continue; }
      if (tag === 'g') {
        const group = stack.pop();
        // A group's drop shadow: its silhouette under what it drew, turned as it turns.
        if (group.filter === 'shadow' && shadow && group.cast.length) {
          const subpaths = group.cast.length === 1 && !group.castHull ? group.cast[0] : [hull(group.cast.flatMap(pointsOf))];
          items.splice(group.start, 0, shadowItem(name('shadow'), subpaths, group, group.castClear));
        }
      }
      continue;
    }
    const a = attributes(attrText);
    if (tag === 'g') {
      const turn = a['data-turn'] !== undefined ? a['data-turn'].split(/[\s,]+/).map(Number) : top.turn;
      const lit = a['data-lit'] !== undefined ? num(a['data-lit']) : top.lit;
      const group = {
        matrix: multiply(top.matrix, parseTransform(a.transform)),
        opacity: top.opacity * num(a.opacity, 1),
        turn, lit, filter: a.filter ?? '', cast: [], castHull: false, start: items.length,
        parent: top,
      };
      if (!selfClose) stack.push(group);
      continue;
    }
    const matrix = multiply(top.matrix, parseTransform(a.transform));
    const opacity = top.opacity * num(a.opacity, 1);
    const shapeGroup = [...stack].reverse().find((entry) => entry.filter === 'shadow');
    if (tag === 'text') {
      const [x, y] = apply(matrix, [num(a.x), num(a.y)]);
      const base = { x, y, size: num(a['font-size'], 12), colour: colour(a.fill ?? 'black'), anchor: a['text-anchor'] || 'start', family: a['font-family'] ?? '', opacity, turn: top.turn, lit: top.lit };
      if (a['data-readout'] !== undefined) {
        items.push({ name: 'readout', text: true, readout: true, ...base });
        if (!selfClose) openText = { text: '', item: () => null };
        continue;
      }
      openText = { text: '', item: (words) => (words ? { name: name('text'), text: words, ...base } : null) };
      continue;
    }
    if (tag === 'valuearc') {
      items.push({ name: name('arc'), arc: { radius: num(a.r), thickness: num(a.w, 1), start: -135, sweep: 0, follows: 270 }, colour: colour(a.stroke), opacity: opacity * num(a['stroke-opacity'], 1), lit: top.lit });
      continue;
    }
    const shape = geometry(tag, a, matrix);
    if (!shape) continue;
    if (tag === 'castonly') {
      if (shapeGroup) { shapeGroup.cast.push(shape.fill); shapeGroup.castHull = shapeGroup.cast.length > 1; }
      continue;
    }
    const strokeWidth = num(a['stroke-width'], 1);
    const fillToken = a.fill ?? 'black';
    const strokeToken = a.stroke ?? 'none';
    const common = { turn: top.turn, lit: top.lit };
    const made = [];
    const paint = (token) => {
      const ref = String(token).match(/^url\(#([\w-]+)\)$/);
      return ref ? { gradient: gradients[ref[1]] } : { colour: colour(token) };
    };
    if (fillToken !== 'none' && shape.fill.length) {
      const fill = paint(fillToken);
      if (fill.gradient || fill.colour) {
        made.push({ name: name(tag), shape: shape.fill, ...(fill.gradient ? { svgGradient: { def: fill.gradient, box: shape.box ?? boxOf(shape.fill) } } : { colour: fill.colour }), opacity: opacity * num(a['fill-opacity'], 1), ...common });
      }
    }
    let band = null;
    if (strokeToken !== 'none' && strokeWidth > 0) {
      const stroke = paint(strokeToken);
      band = shape.line.flatMap((pts) => (pts.closed ? strokeClosed(pts, strokeWidth) : strokeOpen(pts, strokeWidth)));
      if ((stroke.gradient || stroke.colour) && band.length) {
        // A plain line (a tick, a groove) may share a layer with the ones beside it (mergeRuns).
        const line = fillToken === 'none' || !shape.fill.length;
        made.push({ name: name(line ? 'mark' : `${tag}Edge`), shape: band, ...(stroke.gradient ? { svgGradient: { def: stroke.gradient, box: shape.box ?? boxOf(shape.fill.length ? shape.fill : band) } } : { colour: stroke.colour, mergeable: line && !a.filter }), opacity: opacity * num(a['stroke-opacity'], 1), ...common });
      }
    }
    // What it casts: its fill, grown by half its stroke, or the stroke's band alone.
    const silhouette = () => {
      if (shape.fill.length && fillToken !== 'none') {
        if (!(band && band.length)) return shape.fill;
        return shape.line.filter((pts) => pts.closed).map((pts) => offsetPolygon(pts, strokeWidth / 2));
      }
      return band ?? [];
    };
    // A fill in a gradient that is clear in places casts that much less: the shadow of a dish
    // whose rim lets the panel through is as clear there (the filter shades SourceAlpha).
    const clearIn = (() => {
      const ref = String(fillToken).match(/^url\(#([\w-]+)\)$/);
      const def = ref ? gradients[ref[1]] : null;
      if (!def || !(def.stops ?? []).some(([, , opacity]) => num(opacity, 1) < 1)) return null;
      return { def: { ...def, stops: def.stops.map(([offset, , opacity]) => [offset, '000000', opacity]) }, box: shape.box ?? boxOf(shape.fill) };
    })();
    if (a['data-cast'] !== undefined && shapeGroup) {
      shapeGroup.cast.push(silhouette());
      shapeGroup.castHull = shapeGroup.cast.length > 1;
      shapeGroup.castClear = shapeGroup.cast.length === 1 ? clearIn : null;
    }
    if (a.filter === 'shadow' && shadow) made.unshift(shadowItem(name('shadow'), silhouette(), { turn: top.turn, lit: top.lit, opacity }));
    if (a.filter === 'glow' && glow) made.slice().reverse().forEach((item) => made.unshift({ ...item, name: name('glow'), blur: glow.blur }));
    items.push(...made);
  }
  return mergeRuns(items.filter(Boolean));

  function shadowItem(itemName, subpaths, group, clear = null) {
    const moved = subpaths.map((sub) => (Array.isArray(sub) ? sub.map(([x, y]) => [x, y + shadow.dy])
      : sub.ellipse ? { ellipse: [sub.ellipse[0], sub.ellipse[1] + shadow.dy, sub.ellipse[2], sub.ellipse[3]] }
        : { circle: [sub.circle[0], sub.circle[1] + shadow.dy, sub.circle[2]] }));
    const paint = clear
      ? { svgGradient: { def: clear.def, box: { ...clear.box, y: clear.box.y + shadow.dy } } }
      : { colour: shadow.colour };
    return { name: itemName, shape: moved, ...paint, opacity: shadow.opacity * (group.opacity ?? 1), blur: shadow.blur, turn: group.turn, lit: group.lit };
  }
}

// Whether two convex outlines overlap (separating axes): two marks that do cannot share a layer,
// which fills even-odd, without a hole where they cross.
function overlaps(p, q) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i += 1) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const nx = by - ay;
      const ny = ax - bx;
      const project = (pts) => pts.map(([x, y]) => x * nx + y * ny);
      const pp = project(p);
      const qq = project(q);
      if (Math.max(...pp) <= Math.min(...qq) + 1e-9 || Math.max(...qq) <= Math.min(...pp) + 1e-9) return false;
    }
  }
  return true;
}

/**
 * Runs of plain lines drawn alike (a scale's ticks, a dial's grooves), each one layer: the same
 * colour, opacity and motion, side by side and not crossing. The layer list stays readable, and
 * what is drawn does not change.
 */
function mergeRuns(items) {
  const out = [];
  const key = (item) => JSON.stringify([item.colour, item.opacity, item.turn, item.lit, item.blur]);
  for (const item of items) {
    const last = out.at(-1);
    if (item.mergeable && last?.mergeable && key(item) === key(last)
      && item.shape.every((sub) => last.shape.every((other) => !overlaps(sub, other)))) {
      last.shape = [...last.shape, ...item.shape];
      continue;
    }
    out.push(item.mergeable ? { ...item, shape: [...item.shape] } : item);
  }
  return out.map(({ mergeable, ...item }) => item);
}

export const NAMED_COLOURS = NAMED;
