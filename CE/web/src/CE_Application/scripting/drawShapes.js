// drawShapes.js — where a ce.draw shape lands on the control it is drawn on, in one place: the
// runtime (panelRuntime.js) says when one lies wholly outside the control, and the script editor's
// Values tab draws the shape on the control's outline and says the same.
//
// A drawing is clipped at the control's own box (ScriptDrawOverlay.svelte), so a rectangle at
// 5000, 5000 on a 120 x 80 knob is drawn and shows nothing, without a word; and a coordinate that is
// not a number was read with Number(x) || 0, so "fast" was 0 and true was 1, without a word either.
// A coordinate is read now as every other number a script gives, a number or text that is one, and
// one that is neither is 0 and said, once per call and argument, since drawing runs every frame.

import { realNumber } from './scriptColours.js';
import { shownValue as shown } from './shownValue.js';

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
};

/** A coordinate as a shape reads it: `n`, and `said` for one that is not a number (left out is 0). */
export function drawNumber(memberId, name, value) {
  if (value === undefined || value === null) return { n: 0, said: null };
  const n = realNumber(value);
  if (n !== undefined) return { n, said: null };
  return { n: 0, said: `${DRAW_SHAPES[memberId]?.verb ?? 'ce.draw'}: ${name} is ${shown(value)}, which is not a number, so 0 was used.` };
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
    case 'path': return boundsOfPoints(Array.isArray(c.points) ? c.points : []);
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
export function shapeOutline(memberId, nums, { points = [], sides = 3, rotation = 0 } = {}) {
  const v = nums;
  switch (memberId) {
    case 'drawRect': case 'drawImage': {
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
