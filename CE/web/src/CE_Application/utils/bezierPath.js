/**
 * bezierPath.js — editing a path part's compound form (`meta.pathData`) anchor by anchor.
 *
 * Flatten and Smooth (utils/partBooleans.js) leave a part whose outline is SVG path data in 0..1 of
 * its box: curves, holes, islands. The Pen's point editor (penPath.js) edits polygons and cannot touch
 * it. This is the model for editing it the way every vector tool does:
 *
 *   subpaths   [{ closed, nodes: [{ x, y, in, out }] }]  — `in` / `out` are the cubic handles on
 *              either side of the anchor ({ x, y }), or null for a sharp, straight-sided corner
 *
 * in the part's own (unturned) artboard coordinates. Every edit is a pure function from one model to
 * the next; `patchFromModel` turns a model back into the part: the box becomes the outline's exact
 * bounds (the curves', not just the anchors'), the path data is re-expressed in 0..1 of it, and — for a
 * part that is turned or scaled — the pivot is moved to stay on the same spot, so re-fitting the box
 * never swings the rest of the shape round.
 *
 * Parsing accepts any SVG path: absolute and relative commands, the shorthands (H V S T), quadratics
 * (raised to cubics exactly) and arcs (as cubics). Writing emits absolute M / L / C / Z.
 */
import { partFrame } from './customDesignSurfaceGeometry.js';
import { numberOr } from './primitives.js';

const EPSILON = 1e-6;
const ARG_COUNTS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

const same = (a, b, eps = 1e-5) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
const pt = (x, y) => ({ x, y });

// --- Parsing --------------------------------------------------------------------------------------

/** An SVG arc as cubic Béziers (endpoint parameterisation → centre, split into ≤ 90° pieces). */
function arcToCubics(from, rx, ry, angle, largeArc, sweep, to) {
  if (same(from, to)) return [];
  if (!rx || !ry) return [[from, to, to]];
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  const lambda = (x1 * x1) / (rxa * rxa) + (y1 * y1) / (rya * rya);
  if (lambda > 1) { rxa *= Math.sqrt(lambda); rya *= Math.sqrt(lambda); }
  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rxa * rxa * rya * rya - rxa * rxa * y1 * y1 - rya * rya * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, numerator / (rxa * rxa * y1 * y1 + rya * rya * x1 * x1)));
  const cx1 = coef * ((rxa * y1) / rya);
  const cy1 = coef * (-(rya * x1) / rxa);
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angleOf = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angleOf(1, 0, (x1 - cx1) / rxa, (y1 - cy1) / rya);
  let delta = angleOf((x1 - cx1) / rxa, (y1 - cy1) / rya, (-x1 - cx1) / rxa, (-y1 - cy1) / rya);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const onEllipse = (t) => pt(cx + rxa * Math.cos(t) * cos - rya * Math.sin(t) * sin, cy + rxa * Math.cos(t) * sin + rya * Math.sin(t) * cos);
  const derivative = (t) => pt(-rxa * Math.sin(t) * cos - rya * Math.cos(t) * sin, -rxa * Math.sin(t) * sin + rya * Math.cos(t) * cos);
  const out = [];
  for (let i = 0; i < pieces; i += 1) {
    const a = theta1 + i * step;
    const b = a + step;
    const p0 = onEllipse(a);
    const p3 = i === pieces - 1 ? to : onEllipse(b);
    const d0 = derivative(a);
    const d3 = derivative(b);
    out.push([pt(p0.x + k * d0.x, p0.y + k * d0.y), pt(p3.x - k * d3.x, p3.y - k * d3.y), p3]);
  }
  return out;
}

/** SVG path data → subpaths of anchors with handles. */
export function parsePathData(data) {
  const tokens = String(data ?? '').match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths = [];
  let current = null;
  let cursor = pt(0, 0);
  let start = pt(0, 0);
  let lastCubic = null;   // the previous command's second control point, for S
  let lastQuad = null;    // the previous command's control point, for T
  let command = '';
  let index = 0;

  const begin = (point) => {
    current = { closed: false, nodes: [{ x: point.x, y: point.y, in: null, out: null }] };
    subpaths.push(current);
    start = point;
  };
  const curveTo = (c1, c2, end) => {
    if (!current) begin(cursor);
    const last = current.nodes[current.nodes.length - 1];
    last.out = same(c1, last) ? null : c1;
    current.nodes.push({ x: end.x, y: end.y, in: same(c2, end) ? null : c2, out: null });
  };
  const lineTo = (end) => {
    if (!current) begin(cursor);
    current.nodes.push({ x: end.x, y: end.y, in: null, out: null });
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-z]$/i.test(token)) {
      command = token;
      index += 1;
      if (command.toLowerCase() === 'z') {
        if (current) {
          current.closed = true;
          // A closing segment drawn out to the start point merges into the first anchor.
          const nodes = current.nodes;
          if (nodes.length > 1 && same(nodes[nodes.length - 1], nodes[0])) {
            const last = nodes.pop();
            nodes[0].in = last.in;
          }
        }
        cursor = start;
        current = null;
        lastCubic = null;
        lastQuad = null;
        continue;
      }
    } else if (!command) {
      index += 1;
      continue;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const args = tokens.slice(index, index + ARG_COUNTS[lower]).map(Number);
    if (args.length < ARG_COUNTS[lower] || args.some((value) => !Number.isFinite(value))) break;
    index += ARG_COUNTS[lower];
    const abs = (x, y) => (relative ? pt(cursor.x + x, cursor.y + y) : pt(x, y));
    let nextCubic = null;
    let nextQuad = null;

    if (lower === 'm') {
      const point = abs(args[0], args[1]);
      begin(point);
      cursor = point;
      command = relative ? 'l' : 'L';
    } else if (lower === 'l') {
      const point = abs(args[0], args[1]);
      lineTo(point);
      cursor = point;
    } else if (lower === 'h') {
      const point = pt(relative ? cursor.x + args[0] : args[0], cursor.y);
      lineTo(point);
      cursor = point;
    } else if (lower === 'v') {
      const point = pt(cursor.x, relative ? cursor.y + args[0] : args[0]);
      lineTo(point);
      cursor = point;
    } else if (lower === 'c') {
      const c1 = abs(args[0], args[1]);
      const c2 = abs(args[2], args[3]);
      const end = abs(args[4], args[5]);
      curveTo(c1, c2, end);
      cursor = end;
      nextCubic = c2;
    } else if (lower === 's') {
      const c1 = lastCubic ? pt(2 * cursor.x - lastCubic.x, 2 * cursor.y - lastCubic.y) : cursor;
      const c2 = abs(args[0], args[1]);
      const end = abs(args[2], args[3]);
      curveTo(c1, c2, end);
      cursor = end;
      nextCubic = c2;
    } else if (lower === 'q' || lower === 't') {
      const control = lower === 'q'
        ? abs(args[0], args[1])
        : (lastQuad ? pt(2 * cursor.x - lastQuad.x, 2 * cursor.y - lastQuad.y) : cursor);
      const end = lower === 'q' ? abs(args[2], args[3]) : abs(args[0], args[1]);
      // A quadratic is exactly the cubic whose controls sit two thirds of the way to its one.
      curveTo(
        pt(cursor.x + (2 / 3) * (control.x - cursor.x), cursor.y + (2 / 3) * (control.y - cursor.y)),
        pt(end.x + (2 / 3) * (control.x - end.x), end.y + (2 / 3) * (control.y - end.y)),
        end,
      );
      cursor = end;
      nextQuad = control;
    } else if (lower === 'a') {
      const end = abs(args[5], args[6]);
      for (const [c1, c2, p] of arcToCubics(cursor, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, end)) curveTo(c1, c2, p);
      cursor = end;
    }
    lastCubic = nextCubic;
    lastQuad = nextQuad;
  }
  return subpaths.filter((subpath) => subpath.nodes.length >= 2);
}

// --- Writing --------------------------------------------------------------------------------------

const fmt = (value, digits) => {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

function segmentCommand(from, to, digits) {
  const p = (point) => `${fmt(point.x, digits)} ${fmt(point.y, digits)}`;
  if (!from.out && !to.in) return `L ${p(to)}`;
  return `C ${p(from.out ?? from)} ${p(to.in ?? to)} ${p(to)}`;
}

/** Subpaths → absolute SVG path data. */
export function serializePathData(subpaths, digits = 5) {
  const parts = [];
  for (const { closed, nodes } of subpaths) {
    if (nodes.length < 2) continue;
    parts.push(`M ${fmt(nodes[0].x, digits)} ${fmt(nodes[0].y, digits)}`);
    for (let i = 1; i < nodes.length; i += 1) parts.push(segmentCommand(nodes[i - 1], nodes[i], digits));
    if (closed) {
      const last = nodes[nodes.length - 1];
      if (last.out || nodes[0].in) parts.push(segmentCommand(last, nodes[0], digits));
      parts.push('Z');
    }
  }
  return parts.join(' ');
}

// --- Geometry -------------------------------------------------------------------------------------

/** Every segment of the model: [subpathIndex, segmentIndex, p0, c1, c2, p3]. */
export function segments(model) {
  const out = [];
  model.forEach(({ closed, nodes }, s) => {
    const count = closed ? nodes.length : nodes.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      out.push([s, i, pt(a.x, a.y), a.out ?? pt(a.x, a.y), b.in ?? pt(b.x, b.y), pt(b.x, b.y)]);
    }
  });
  return out;
}

const cubicAt = (p0, c1, c2, p3, t) => {
  const u = 1 - t;
  return pt(
    u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  );
};

/** Where a cubic's derivative is zero on one axis, within 0..1. */
function extremaOnAxis(a, b, c, d) {
  // B'(t)/3 = (b-a)(1-t)² + 2(c-b)(1-t)t + (d-c)t², a quadratic in t.
  const qa = -a + 3 * b - 3 * c + d;
  const qb = 2 * (a - 2 * b + c);
  const qc = b - a;
  const roots = [];
  if (Math.abs(qa) < EPSILON) {
    if (Math.abs(qb) > EPSILON) roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      roots.push((-qb + root) / (2 * qa), (-qb - root) / (2 * qa));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** The exact bounding box of the model's outline (curves included, handles excluded). */
export function modelBounds(model) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const take = ({ x, y }) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const [, , p0, c1, c2, p3] of segments(model)) {
    take(p0);
    take(p3);
    for (const t of [...extremaOnAxis(p0.x, c1.x, c2.x, p3.x), ...extremaOnAxis(p0.y, c1.y, c2.y, p3.y)]) take(cubicAt(p0, c1, c2, p3, t));
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The point on the outline nearest `point`: { subpath, segment, t, x, y, distance }. */
export function nearestOnOutline(model, point) {
  let best = null;
  for (const [s, i, p0, c1, c2, p3] of segments(model)) {
    const samples = 48;
    let bestT = 0;
    let bestD = Infinity;
    for (let k = 0; k <= samples; k += 1) {
      const t = k / samples;
      const q = cubicAt(p0, c1, c2, p3, t);
      const d = Math.hypot(q.x - point.x, q.y - point.y);
      if (d < bestD) { bestD = d; bestT = t; }
    }
    // Refine by bisection round the best sample.
    let low = Math.max(0, bestT - 1 / samples);
    let high = Math.min(1, bestT + 1 / samples);
    for (let k = 0; k < 24; k += 1) {
      const a = low + (high - low) / 3;
      const b = high - (high - low) / 3;
      const qa = cubicAt(p0, c1, c2, p3, a);
      const qb = cubicAt(p0, c1, c2, p3, b);
      if (Math.hypot(qa.x - point.x, qa.y - point.y) < Math.hypot(qb.x - point.x, qb.y - point.y)) high = b; else low = a;
    }
    const t = (low + high) / 2;
    const q = cubicAt(p0, c1, c2, p3, t);
    const distance = Math.hypot(q.x - point.x, q.y - point.y);
    if (!best || distance < best.distance) best = { subpath: s, segment: i, t, x: q.x, y: q.y, distance };
  }
  return best;
}

// --- Edits (pure: model in, model out) ------------------------------------------------------------

const cloneModel = (model) => model.map(({ closed, nodes }) => ({
  closed,
  nodes: nodes.map((node) => ({ x: node.x, y: node.y, in: node.in ? { ...node.in } : null, out: node.out ? { ...node.out } : null })),
}));

/** Whether an anchor is smooth: both handles present and pointing straight away from each other. */
export function isSmooth(node) {
  if (!node?.in || !node?.out) return false;
  const ax = node.in.x - node.x; const ay = node.in.y - node.y;
  const bx = node.out.x - node.x; const by = node.out.y - node.y;
  const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
  if (la < EPSILON || lb < EPSILON) return false;
  return (ax * bx + ay * by) / (la * lb) < -0.999;
}

/** Move an anchor to `point`; its handles come with it. */
export function moveAnchor(model, s, i, point) {
  const next = cloneModel(model);
  const node = next[s]?.nodes[i];
  if (!node) return model;
  const dx = point.x - node.x;
  const dy = point.y - node.y;
  node.x = point.x;
  node.y = point.y;
  if (node.in) { node.in.x += dx; node.in.y += dy; }
  if (node.out) { node.out.x += dx; node.out.y += dy; }
  return next;
}

/**
 * Move one handle (`side` 'in' | 'out') to `point`. On a smooth anchor the other handle turns with it,
 * keeping its own length, so the curve stays smooth through the anchor — unless `independent`
 * (Alt), which breaks the anchor into a corner.
 */
export function moveHandle(model, s, i, side, point, { independent = false } = {}) {
  const next = cloneModel(model);
  const node = next[s]?.nodes[i];
  if (!node || !['in', 'out'].includes(side)) return model;
  const other = side === 'in' ? 'out' : 'in';
  const wasSmooth = isSmooth(model[s].nodes[i]);
  node[side] = same(point, node, 1e-9) ? null : { x: point.x, y: point.y };
  if (wasSmooth && !independent && node[other] && node[side]) {
    const length = Math.hypot(node[other].x - node.x, node[other].y - node.y);
    const dx = node.x - node[side].x;
    const dy = node.y - node[side].y;
    const d = Math.hypot(dx, dy);
    if (d > EPSILON) node[other] = { x: node.x + (dx / d) * length, y: node.y + (dy / d) * length };
  }
  return next;
}

/**
 * Remove an anchor, joining its neighbours. A subpath that would be left with fewer than two anchors
 * goes altogether — which is how a hole is deleted — unless it is the only one, when nothing happens.
 */
export function removeAnchor(model, s, i) {
  const subpath = model[s];
  if (!subpath?.nodes[i]) return model;
  if (subpath.nodes.length <= 2) {
    if (model.length <= 1) return model;
    return cloneModel(model).filter((_, index) => index !== s);
  }
  const next = cloneModel(model);
  next[s].nodes.splice(i, 1);
  return next;
}

/** Insert an anchor at `t` along a segment, splitting the curve so the outline does not change. */
export function insertAnchor(model, s, segment, t) {
  const next = cloneModel(model);
  const nodes = next[s]?.nodes;
  if (!nodes) return model;
  const a = nodes[segment];
  const b = nodes[(segment + 1) % nodes.length];
  if (!a || !b) return model;
  const p0 = pt(a.x, a.y);
  const c1 = a.out ?? p0;
  const p3 = pt(b.x, b.y);
  const c2 = b.in ?? p3;
  const lerp = (p, q) => pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
  // de Casteljau
  const q0 = lerp(p0, c1); const q1 = lerp(c1, c2); const q2 = lerp(c2, p3);
  const r0 = lerp(q0, q1); const r1 = lerp(q1, q2);
  const mid = lerp(r0, r1);
  const straight = !a.out && !b.in;
  if (!straight) {
    a.out = q0;
    b.in = q2;
  }
  nodes.splice(segment + 1, 0, { x: mid.x, y: mid.y, in: straight ? null : r0, out: straight ? null : r1 });
  return next;
}

/**
 * Double-click on an anchor: a smooth anchor becomes a sharp corner (its handles withdrawn); a corner
 * becomes smooth, its handles along the line between its neighbours, a third of the way to each.
 */
export function toggleAnchor(model, s, i) {
  const next = cloneModel(model);
  const nodes = next[s]?.nodes;
  const node = nodes?.[i];
  if (!node) return model;
  if (node.in || node.out) {
    node.in = null;
    node.out = null;
    return next;
  }
  const closed = next[s].closed;
  const prev = nodes[i - 1] ?? (closed ? nodes[nodes.length - 1] : null);
  const after = nodes[i + 1] ?? (closed ? nodes[0] : null);
  const from = prev ?? node;
  const to = after ?? node;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < EPSILON) return model;
  dx /= d; dy /= d;
  const lenIn = prev ? Math.hypot(node.x - prev.x, node.y - prev.y) / 3 : 0;
  const lenOut = after ? Math.hypot(after.x - node.x, after.y - node.y) / 3 : 0;
  node.in = lenIn > EPSILON ? { x: node.x - dx * lenIn, y: node.y - dy * lenIn } : null;
  node.out = lenOut > EPSILON ? { x: node.x + dx * lenOut, y: node.y + dy * lenOut } : null;
  return next;
}

// --- Between the part and the model ---------------------------------------------------------------

function mapModel(model, fn) {
  return model.map(({ closed, nodes }) => ({
    closed,
    nodes: nodes.map((node) => ({ ...fn(node), in: node.in ? fn(node.in) : null, out: node.out ? fn(node.out) : null })),
  }));
}

/** The part's outline as an editable model, in its own (unturned) artboard coordinates. */
export function modelFromPart(part, artboardWidth, artboardHeight) {
  const frame = partFrame(part, artboardWidth, artboardHeight);
  return mapModel(parsePathData(part?.meta?.pathData), (p) => pt(frame.left + p.x * frame.width, frame.top + p.y * frame.height));
}

/**
 * How the part's box is turned and scaled on screen: `toScreen` maps its own artboard coordinates to
 * where they are drawn, `fromScreen` maps a pointer back. (Layout scale, then rotation, about the pivot,
 * as the renderer's CSS transform does.)
 */
export function partTransform(part, artboardWidth, artboardHeight) {
  const frame = partFrame(part, artboardWidth, artboardHeight);
  const layout = part?._children?.Layout ?? {};
  const px = frame.left + frame.width * numberOr(layout.pivotX, 50) / 100;
  const py = frame.top + frame.height * numberOr(layout.pivotY, 50) / 100;
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  const angle = (numberOr(layout.rotation, 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    toScreen: (p) => {
      const x = (p.x - px) * scale;
      const y = (p.y - py) * scale;
      return pt(px + x * cos - y * sin, py + x * sin + y * cos);
    },
    fromScreen: (p) => {
      const x = p.x - px;
      const y = p.y - py;
      return pt(px + (x * cos + y * sin) / scale, py + (-x * sin + y * cos) / scale);
    },
    pivot: pt(px, py),
    turned: Math.abs(angle) > 1e-9 || Math.abs(scale - 1) > 1e-9,
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * The part patch (paths relative to the part) that makes it this model: the box fitted to the outline,
 * the path data in 0..1 of it, and — for a turned or scaled part — the pivot kept on the same spot.
 */
export function patchFromModel(part, model, artboardWidth, artboardHeight) {
  const bounds = modelBounds(model);
  if (!bounds) return null;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  // A flat outline gets a 1px box centred on it, as the Pen's flat runs do.
  const left = bounds.width >= 1 ? bounds.x : bounds.x - (1 - bounds.width) / 2;
  const top = bounds.height >= 1 ? bounds.y : bounds.y - (1 - bounds.height) / 2;
  const unit = mapModel(model, (p) => pt((p.x - left) / width, (p.y - top) / height));
  const patch = {
    'meta.pathData': serializePathData(unit),
    'Layout.x': round2(left),
    'Layout.y': round2(top),
    'Layout.width': round2(width),
    'Layout.height': round2(height),
    'Layout.xUnit': 'px',
    'Layout.yUnit': 'px',
    'Layout.widthUnit': 'px',
    'Layout.heightUnit': 'px',
    'Layout.anchorX': 'left',
    'Layout.anchorY': 'top',
    'Layout.offsetX': 0,
    'Layout.offsetY': 0,
  };
  const { pivot, turned } = partTransform(part, artboardWidth, artboardHeight);
  if (turned) {
    patch['Layout.pivotX'] = Math.round(((pivot.x - round2(left)) / round2(width)) * 100 * 1000) / 1000;
    patch['Layout.pivotY'] = Math.round(((pivot.y - round2(top)) / round2(height)) * 100 * 1000) / 1000;
  }
  return patch;
}

/** Every anchor and handle of the model, flattened for hit-testing and drawing. */
export function modelHandles(model) {
  const out = [];
  model.forEach(({ nodes }, s) => nodes.forEach((node, i) => {
    out.push({ s, i, kind: 'anchor', x: node.x, y: node.y, smooth: isSmooth(node) });
    if (node.in) out.push({ s, i, kind: 'in', x: node.in.x, y: node.in.y, from: pt(node.x, node.y) });
    if (node.out) out.push({ s, i, kind: 'out', x: node.out.x, y: node.out.y, from: pt(node.x, node.y) });
  }));
  return out;
}
