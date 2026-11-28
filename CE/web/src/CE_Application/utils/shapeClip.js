/**
 * The clip a slider's masked fill is cut by (editor/SliderShapeFill.svelte): a part's fill is HTML —
 * BackgroundRenderer, so a gradient, an image, a pattern or a colour that animates all work — in an
 * SVG `<foreignObject>`, cut to the part's shape.
 *
 * WHY NOT A MASK. It used to be cut by an SVG `<mask>` on the foreignObject. WebKit (WebKitGTK: the
 * Linux app and the Linux plug-ins) paints anything inside a foreignObject that has a layer of its
 * own — positioned, clipped or translucent — outside the SVG: past an SVG mask or clip on the
 * foreignObject (or on a `<g>` around it), and over whatever the SVG draws after it. Every fill
 * layer is absolutely positioned, so on Linux the default knob drew as squares, its cap a dark square
 * over its pointer. Measured in WebKitGTK 2.52 and Chromium, which applied the mask.
 *
 * So the fill is drawn with no layer where it can be (a plain background: SliderShapeFill) and cut
 * by an SVG clip on the foreignObject, which both engines apply and keep in order; where it cannot,
 * by a CSS `clip-path: url(#id)` on the positioned element inside, which WebKit does apply. Either
 * way it is a clip, and a clip has no stroke: a stroked shape — a knob's arc, a slider's track line,
 * a ring — is given here as the outline its stroke covers, the same set of pixels (the browser check
 * `shapeClip` holds them to it): an arc as its band with its caps, a line as a capsule, a ring as two
 * circles, even-odd. The shapes that were filled already (a circle, a rect, a plate's outline, with
 * its transform) are drawn by the clip as they are.
 *
 * `clipShapeFor(shape)` returns what the `<clipPath>` holds, or null when the shape cannot be
 * outlined here (a stroked path that is not one circular arc), and the caller keeps the mask.
 */

const fixed = (value) => Number(value.toFixed(3));
const num = '(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)';
const ARC = new RegExp(`^\\s*M\\s*${num}[\\s,]+${num}\\s*A\\s*${num}[\\s,]+${num}[\\s,]+${num}[\\s,]+([01])[\\s,]*([01])[\\s,]+${num}[\\s,]+${num}\\s*$`, 'i');

/** One circular arc, `M x y A r r rot large sweep x y`, as its centre, radius and ends; else null. */
export function parseCircularArc(d) {
  const m = ARC.exec(String(d ?? ''));
  if (!m) return null;
  const [x0, y0, rx, ry, , large, sweep, x1, y1] = [m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9]].map(Number);
  if (![x0, y0, rx, ry, x1, y1].every(Number.isFinite)) return null;
  if (Math.abs(Math.abs(rx) - Math.abs(ry)) > 1e-6) return null; // an ellipse: not drawn by sliders
  const start = { x: x0, y: y0 };
  const end = { x: x1, y: y1 };
  let r = Math.abs(rx);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const half = Math.hypot(dx, dy);
  // The same ends: the SVG spec leaves the arc out, and a stroke with round caps draws a dot there.
  if (half < 1e-9) return { start, end, centre: null, r, large, sweep, empty: true };
  if (r < 1e-9) return null;
  // A radius too small for the chord is scaled up until it fits (SVG 1.1 F.6.6).
  if (half > r) r = half;
  // The centre (SVG 1.1 F.6.5, with rx = ry and no rotation).
  const sign = large === sweep ? -1 : 1;
  const offset = sign * Math.sqrt(Math.max(0, (r * r) / (half * half) - 1));
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const centre = { x: mid.x + offset * dy, y: mid.y - offset * dx };
  return { start, end, centre, r, large, sweep, empty: false };
}

const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const at = (p) => `${fixed(p.x)} ${fixed(p.y)}`;
const unit = (v) => { const len = Math.hypot(v.x, v.y); return len ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 }; };
/** A whole circle as a path: two half arcs, so it can sit beside another in one even-odd path. */
const circlePath = (c, r) => `M ${fixed(c.x - r)} ${fixed(c.y)} A ${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(c.x + r)} ${fixed(c.y)} A ${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(c.x - r)} ${fixed(c.y)} Z`;

/**
 * What a stroke of `width` along a circular arc covers, as one closed path: the outer edge, the cap
 * at the end, the inner edge back, the cap at the start. A cap turns the way the arc does, so it
 * bulges past the end (a round cap) or squares it off (a square cap); a butt cap is a straight edge.
 */
export function arcStrokeOutline(arc, width, cap = 'round') {
  const h = width / 2;
  if (!(h > 0)) return null;
  if (arc.empty) return cap === 'butt' ? { d: '', rule: 'nonzero' } : dotOrSquare(arc.start, h, cap);
  const { centre, r, large, sweep } = arc;
  const inner = r - h;
  if (inner <= 0) return null; // wider than the arc's circle: not a band, and not drawn by sliders
  const radial = (p) => unit({ x: p.x - centre.x, y: p.y - centre.y });
  const n0 = radial(arc.start);
  const n1 = radial(arc.end);
  // The direction of travel: the radial turned a quarter the way the arc sweeps (y points down).
  const travel = (n) => (sweep ? { x: -n.y, y: n.x } : { x: n.y, y: -n.x });
  const o0 = add(centre, n0, r + h);
  const o1 = add(centre, n1, r + h);
  const i0 = add(centre, n0, inner);
  const i1 = add(centre, n1, inner);
  const R = fixed(r + h);
  const Ri = fixed(inner);
  let d = `M ${at(o0)} A ${R} ${R} 0 ${large} ${sweep} ${at(o1)} `;
  d += capPath(o1, i1, travel(n1), h, cap, sweep);
  d += `A ${Ri} ${Ri} 0 ${large} ${sweep ? 0 : 1} ${at(i0)} `;
  d += capPath(i0, o0, travel(n0), -h, cap, sweep);
  return { d: `${d}Z`, rule: 'nonzero' };
}

/** From one corner of a stroke's end to the other: a half circle, a square, or straight across. */
function capPath(from, to, travel, h, cap, sweep) {
  if (cap === 'round') { const a = fixed(Math.abs(h)); return `A ${a} ${a} 0 0 ${sweep} ${at(to)} `; }
  if (cap === 'square') return `L ${at(add(from, travel, h))} L ${at(add(to, travel, h))} L ${at(to)} `;
  return `L ${at(to)} `;
}

function dotOrSquare(p, h, cap) {
  if (cap === 'square') return { d: `M ${fixed(p.x - h)} ${fixed(p.y - h)} H ${fixed(p.x + h)} V ${fixed(p.y + h)} H ${fixed(p.x - h)} Z`, rule: 'nonzero' };
  return { d: circlePath(p, h), rule: 'nonzero' };
}

/** What a stroke of `width` along a straight line covers: a capsule for round caps. */
export function lineStrokeOutline(x1, y1, x2, y2, width, cap = 'round') {
  const h = width / 2;
  if (!(h > 0)) return null;
  const p1 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  const u = unit({ x: x2 - x1, y: y2 - y1 });
  if (!u.x && !u.y) return cap === 'butt' ? { d: '', rule: 'nonzero' } : dotOrSquare(p1, h, cap);
  const n = { x: -u.y, y: u.x };
  const a = add(p1, n, h);
  const b = add(p2, n, h);
  const c = add(p2, n, -h);
  const e = add(p1, n, -h);
  // With `n` a quarter turn on from the direction of travel, each cap turns back the other way.
  let d = `M ${at(a)} L ${at(b)} ${capPath(b, c, u, h, cap, 0)}L ${at(e)} ${capPath(e, a, u, -h, cap, 0)}`;
  return { d: `${d}Z`, rule: 'nonzero' };
}

/**
 * A ring: a stroke of `width` around a circle, as its two edges, even-odd. A stroke wider than the
 * circle still leaves a hole, of radius `width / 2 - r`: its inner edge folds through the centre,
 * and that is what Chromium draws (the browser check `shapeClip` measured it).
 */
export function ringOutline(cx, cy, r, width) {
  const h = width / 2;
  if (!(h > 0) || !(r > 0)) return null;
  const c = { x: cx, y: cy };
  const inner = Math.abs(r - h);
  return { d: inner > 1e-9 ? `${circlePath(c, r + h)} ${circlePath(c, inner)}` : circlePath(c, r + h), rule: 'evenodd' };
}

/**
 * What a slider part's `<clipPath>` holds: `{ kind: 'circle', cx, cy, r }`, `{ kind: 'rect', … }`
 * or `{ kind: 'path', d, rule, transform }` — or null, and the caller keeps the mask.
 */
export function clipShapeFor(shape) {
  if (!shape) return null;
  const width = Number(shape.strokeWidth);
  const cap = shape.lineCap ?? 'round';
  switch (shape.kind) {
    case 'circle':
      return { kind: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r };
    case 'rect':
      return { kind: 'rect', x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx ?? 0 };
    case 'filled-path':
      return shape.d ? { kind: 'path', d: shape.d, rule: 'evenodd', transform: shape.transform } : null;
    case 'circle-stroke': {
      const ring = ringOutline(Number(shape.cx), Number(shape.cy), Number(shape.r), width);
      return ring ? { kind: 'path', ...ring } : null;
    }
    case 'line': {
      const line = lineStrokeOutline(Number(shape.x1), Number(shape.y1), Number(shape.x2), Number(shape.y2), width, cap);
      return line ? { kind: 'path', ...line } : null;
    }
    case 'path': {
      const arc = parseCircularArc(shape.d);
      const band = arc ? arcStrokeOutline(arc, width, cap) : null;
      return band ? { kind: 'path', ...band } : null;
    }
    default:
      return null;
  }
}
