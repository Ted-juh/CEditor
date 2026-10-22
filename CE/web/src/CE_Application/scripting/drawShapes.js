// drawShapes.js — where a ce.draw shape lands on the control it is drawn on, in one place: the
// runtime (panelRuntime.js) says when one lies wholly outside the control, and the script editor's
// Values tab draws the shape on the control's outline and says the same.
//
// A drawing is clipped at the control's own box (ScriptDrawOverlay.svelte), so a rectangle at
// 5000, 5000 on a 120 x 80 knob is drawn and shows nothing, without a word; and a coordinate that is
// not a number was read with Number(x) || 0, so "fast" was 0 and true was 1, without a word either.
// A coordinate is read now as every other number a script gives, a number or text that is one, and
// one that is neither is 0 and said, once per call and argument, since drawing runs every frame.
//
// Four more are read the same way since: a clip, a line of the pixel font, and the points and the
// curve the bulk primitives draw. Their numbers were read with Number(x) || 0 too; an item of a
// point list that is not a point was dropped; a radius not above 0 was 1.5, and a pixel scale not a
// whole number above 0 the nearest one, without a word; a tension outside 0 to 1 was its nearest
// end and one that is not a number NaN, which drew no curve at all; a clip with no width or height,
// or one wholly off the control, hid everything drawn after it; and a character the pixel font has
// no glyph for left a gap. Each is said, once, and a tension that is not a number is 0.5.

import { realNumber } from './scriptColours.js';
import { shownValue as shown } from './shownValue.js';
import { glyphRows, FONT_W, FONT_H, FONT_ADVANCE } from '../utils/pixelFont.js';

// Each shape: the call as a script writes it and its coordinate arguments, in order.
export const DRAW_SHAPES = {
  drawRect: { verb: 'ce.draw.rect', nums: ['x', 'y', 'w', 'h', 'radius'] },
  drawCircle: { verb: 'ce.draw.circle', nums: ['cx', 'cy', 'r'] },
  drawEllipse: { verb: 'ce.draw.ellipse', nums: ['cx', 'cy', 'rx', 'ry'] },
  drawArc: { verb: 'ce.draw.arc', nums: ['x', 'y', 'radius', 'from', 'to'] },
  drawLine: { verb: 'ce.draw.line', nums: ['x1', 'y1', 'x2', 'y2'] },
  drawPolygon: { verb: 'ce.draw.polygon', nums: ['cx', 'cy', 'radius'] },
  drawImage: { verb: 'ce.draw.image', nums: ['x', 'y', 'w', 'h'] },
  drawText: { verb: 'ce.draw.text', nums: ['x', 'y'] },
  drawPath: { verb: 'ce.draw.path', nums: [] },
  drawClip: { verb: 'ce.draw.clip', nums: ['x', 'y', 'w', 'h'] },
  drawPixelText: { verb: 'ce.draw.pixelText', nums: ['x', 'y'] },
  drawPoints: { verb: 'ce.draw.points', nums: [] },
  drawCurve: { verb: 'ce.draw.curve', nums: [] },
};

/** A coordinate as a shape reads it: `n`, and `said` for one that is not a number (left out is 0). */
export function drawNumber(memberId, name, value) {
  if (value === undefined || value === null) return { n: 0, said: null };
  const n = realNumber(value);
  if (n !== undefined) return { n, said: null };
  return { n: 0, said: `${DRAW_SHAPES[memberId]?.verb ?? 'ce.draw'}: ${name} is ${shown(value)}, which is not a number, so 0 was used.` };
}

/**
 * A list of points as ce.draw.points and ce.draw.curve read it: `points`, each [x, y], from a list of
 * pairs or of { x, y } tables, and `said` for the first item that is not a point, which is left out.
 */
export function pointList(memberId, value) {
  const list = value ? (Array.isArray(value) ? value : Object.values(value)) : [];
  const points = [];
  let said = null;
  list.forEach((item, i) => {
    const pair = Array.isArray(item) ? item : (item && typeof item === 'object' ? [item.x, item.y] : null);
    const [px, py] = pair ? pair.map((n) => Number(n)) : [NaN, NaN];
    if (Number.isFinite(px) && Number.isFinite(py)) { points.push([px, py]); return; }
    said ??= `${DRAW_SHAPES[memberId]?.verb ?? 'ce.draw'}: ${shown(item)} at position ${i + 1} of points is not a point, so it was left out.`;
  });
  return { points, said };
}

/** ce.draw.points' radius as it reads it: `r`, and `said` for one not used as given (left out is 1.5). */
export function pointRadius(value) {
  if (value === undefined || value === null) return { r: 1.5, said: null };
  const n = realNumber(value);
  if (n > 0) return { r: n, said: null };
  return { r: 1.5, said: `ce.draw.points: radius ${shown(value)} is ${n === undefined ? 'not a number' : 'not above 0'}, so 1.5 was used.` };
}

/** ce.draw.curve's tension as it reads it: `t`, and `said` for one not used as given (left out is 0.5). */
export function curveTension(value) {
  if (value === undefined || value === null) return { t: 0.5, said: null };
  const n = realNumber(value);
  if (n === undefined) return { t: 0.5, said: `ce.draw.curve: tension ${shown(value)} is not a number, so 0.5 was used.` };
  if (n >= 0 && n <= 1) return { t: n, said: null };
  const t = n < 0 ? 0 : 1;
  return { t, said: `ce.draw.curve: tension ${shown(value)} is outside 0 to 1, so ${t} was used.` };
}

/** ce.draw.pixelText's scale as it reads it: `scale`, a whole number from 1, and `said` for one not
 *  used as given (left out is 1). */
export function pixelScale(value) {
  if (value === undefined || value === null) return { scale: 1, said: null };
  const n = realNumber(value);
  if (n === undefined) return { scale: 1, said: `ce.draw.pixelText: scale ${shown(value)} is not a number, so 1 was used.` };
  const scale = Math.max(1, Math.round(n));
  if (scale === n) return { scale, said: null };
  return { scale, said: n < 1 ? `ce.draw.pixelText: scale ${shown(value)} is below 1, so 1 was used.`
    : `ce.draw.pixelText: scale ${shown(value)} is not a whole number, so ${scale} was used.` };
}

/** What ce.draw.pixelText says of the characters its font has no glyph for, which draw nothing, or null. */
export function pixelGapWords(text) {
  const gaps = [...new Set([...String(text ?? '')].filter((ch) => ch !== ' ' && glyphRows(ch) === null))];
  if (!gaps.length) return null;
  return `ce.draw.pixelText: the pixel font has no glyph for ${gaps.map((ch) => JSON.stringify(ch)).join(', ')}, `
    + `so nothing is drawn in ${gaps.length === 1 ? 'its' : 'their'} place.`;
}

/** What ce.draw.clip says of a clip that leaves nothing of the control to draw in, or null. `box` is
 *  the control's { w, h }. */
export function clipWords(rect, box) {
  const round = (v) => Math.round(v * 100) / 100;
  const tail = 'so nothing drawn after it shows until ce.draw.clip() clears it.';
  if (!(rect.w > 0) || !(rect.h > 0)) return `ce.draw.clip: the clip is ${round(rect.w)} × ${round(rect.h)}, ${tail}`;
  if (!box || !(box.w > 0) || !(box.h > 0)) return null;
  if (rect.x < box.w && rect.y < box.h && rect.x + rect.w > 0 && rect.y + rect.h > 0) return null;
  return `ce.draw.clip: the clip at ${round(rect.x)}, ${round(rect.y)}, ${round(rect.w)} × ${round(rect.h)} lies wholly outside `
    + `the control, which is ${round(box.w)} × ${round(box.h)}, ${tail}`;
}

/** Points as one path of full circles, the radius the point's own: two arcs a dot, since a single
 *  arc of 360° is degenerate in SVG. The overlay draws ce.draw.points with it. */
export function dotsPathData(points, radius) {
  const r = Math.max(0.01, Number(radius) || 1.5);
  return (points ?? []).map(([x, y]) => `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`).join(' ');
}

/** A Catmull-Rom spline through the points as cubic Béziers, tension 0 being straight lines. The
 *  overlay draws ce.draw.curve with it. */
export function curvePathData(points, tension, closed) {
  const pts = points ?? [];
  if (pts.length < 2) return '';
  const t = Math.max(0, Math.min(1, Number(tension ?? 0.5))) / 6;
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C ${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t}`
      + ` ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t}`
      + ` ${p2[0]} ${p2[1]}`;
  }
  return closed ? `${d} Z` : d;
}

/** The lit pixels of a line of the pixel font, each { x, y, s }, as the overlay draws them: a
 *  character with no glyph draws nothing and still takes its advance. */
export function pixelTextRects(text, x, y, scale) {
  const out = [];
  const s = Math.max(1, Math.round(scale || 1));
  let at = x;
  for (const ch of String(text ?? '')) {
    const rows = glyphRows(ch);
    if (rows) {
      for (let row = 0; row < FONT_H; row += 1) {
        const line = rows[row] ?? '';
        for (let col = 0; col < FONT_W; col += 1) if (line[col] === '#') out.push({ x: at + col * s, y: y + row * s, s });
      }
    }
    at += FONT_ADVANCE * s;
  }
  return out;
}

/** The points of a polygon, as the runtime draws it: 0 degrees at twelve o'clock, clockwise. */
export function polygonPoints(cx, cy, radius, sides, rotation = 0) {
  const n = Math.max(3, Math.round(Number(sides) || 3));
  const from = ((Number(rotation) || 0) - 90) * (Math.PI / 180);
  return Array.from({ length: n }, (_, i) => {
    const a = from + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
  });
}

const boundsOfPoints = (points) => {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** The box a runtime draw command covers, before any transform, or null for one that has none. */
export function commandBounds(command) {
  const c = command ?? {};
  const box = (x, y, w, h) => ({ x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) });
  switch (c.op) {
    case 'rect': case 'image': return box(c.x, c.y, c.w, c.h);
    // An arc's whole circle: the part drawn is inside it, so outside it is outside the arc too.
    case 'circle': case 'arc': return box(c.cx - c.r, c.cy - c.r, 2 * c.r, 2 * c.r);
    case 'ellipse': return box(c.cx - c.rx, c.cy - c.ry, 2 * c.rx, 2 * c.ry);
    case 'line': return boundsOfPoints([[c.x1, c.y1], [c.x2, c.y2]]);
    case 'path': case 'curve': return boundsOfPoints(Array.isArray(c.points) ? c.points : []);
    case 'dots': {
      const b = boundsOfPoints(Array.isArray(c.points) ? c.points : []);
      const r = Math.abs(Number(c.r) || 0);
      return b && { x: b.x - r, y: b.y - r, w: b.w + 2 * r, h: b.h + 2 * r };
    }
    case 'pixelText': {
      const n = [...String(c.text ?? '')].length;
      const s = Math.max(1, Math.round(c.scale || 1));
      return n ? { x: c.x, y: c.y, w: ((n - 1) * FONT_ADVANCE + FONT_W) * s, h: FONT_H * s } : null;
    }
    default: return null;
  }
}

/**
 * What the runtime says of a shape that lies wholly outside the control it is drawn on, or null.
 * `box` is the control's { w, h }; half the stroke width in force counts, as a stroke paints past
 * the shape's edge, and a line on the control's edge is half inside it.
 */
export function outsideWords(memberId, bounds, box, strokeWidth = 1) {
  if (!bounds || !box || !(box.w > 0) || !(box.h > 0)) return null;
  const m = Math.max(0, Number(strokeWidth) || 0) / 2;
  const left = bounds.x - m;
  const top = bounds.y - m;
  const right = bounds.x + bounds.w + m;
  const bottom = bounds.y + bounds.h + m;
  if (right > 0 && left < box.w && bottom > 0 && top < box.h) return null;
  const round = (v) => Math.round(v * 100) / 100;
  return `${DRAW_SHAPES[memberId]?.verb ?? 'ce.draw'}: the shape at ${round(bounds.x)}, ${round(bounds.y)}, `
    + `${round(bounds.w)} × ${round(bounds.h)} lies wholly outside the control, which is ${round(box.w)} × ${round(box.h)}, `
    + 'so none of it shows.';
}

/**
 * The shape a call draws, as SVG path data in the control's coordinates, and its box: what the
 * Values tab draws on the control's outline. `nums` are the call's coordinates as drawNumber reads
 * them, by name; `points` a path's flat list, read as the runtime reads it.
 */
export function shapeOutline(memberId, nums, { points = [], sides = 3, rotation = 0, text = '', scale = 1, radius = 1.5, tension = 0.5, closed = false } = {}) {
  const v = nums;
  switch (memberId) {
    case 'drawPoints': {
      if (!points.length) return null;
      return { d: dotsPathData(points, radius), bounds: commandBounds({ op: 'dots', points, r: radius }) };
    }
    case 'drawCurve': {
      if (points.length < 2) return null;
      return { d: curvePathData(points, tension, closed), bounds: commandBounds({ op: 'curve', points }) };
    }
    case 'drawPixelText': {
      const bounds = commandBounds({ op: 'pixelText', text, x: v.x, y: v.y, scale });
      if (!bounds) return null;
      return { d: pixelTextRects(text, v.x, v.y, scale).map((p) => `M${p.x} ${p.y}h${p.s}v${p.s}h${-p.s}Z`).join(''), bounds };
    }
    case 'drawRect': case 'drawImage': case 'drawClip': {
      const b = commandBounds({ op: 'rect', x: v.x, y: v.y, w: v.w, h: v.h });
      return { d: `M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z`, bounds: b };
    }
    case 'drawCircle': case 'drawEllipse': {
      const rx = Math.abs(memberId === 'drawCircle' ? v.r : v.rx);
      const ry = Math.abs(memberId === 'drawCircle' ? v.r : v.ry);
      const b = commandBounds({ op: 'ellipse', cx: v.cx, cy: v.cy, rx, ry });
      return { d: `M${v.cx - rx} ${v.cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`, bounds: b };
    }
    case 'drawArc': {
      const r = Math.abs(v.radius);
      const at = (deg) => [v.x + r * Math.sin((deg * Math.PI) / 180), v.y - r * Math.cos((deg * Math.PI) / 180)];
      const sweep = v.to - v.from;
      const [x0, y0] = at(v.from);
      const [x1, y1] = at(v.to);
      const d = Math.abs(sweep) >= 360
        ? `M${v.x - r} ${v.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
        : `M${x0} ${y0}A${r} ${r} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep >= 0 ? 1 : 0} ${x1} ${y1}`;
      return { d, bounds: commandBounds({ op: 'arc', cx: v.x, cy: v.y, r }) };
    }
    case 'drawLine':
      return { d: `M${v.x1} ${v.y1}L${v.x2} ${v.y2}`, bounds: commandBounds({ op: 'line', ...v }) };
    case 'drawPolygon': case 'drawPath': {
      const pts = memberId === 'drawPolygon' ? polygonPoints(v.cx, v.cy, Math.abs(v.radius), sides, rotation) : points;
      if (!pts.length) return null;
      const closed = memberId === 'drawPolygon' || nums.closed === true;
      return { d: `M${pts.map((p) => p.join(' ')).join('L')}${closed ? 'Z' : ''}`, bounds: boundsOfPoints(pts) };
    }
    default: return null;
  }
}
