// meterParts.js — what a meter's part draws at a reading (models/meterDeviceParts.js).
//
// Pure: a part and the reading in, SVG instructions out, in the meter's 160 by 100 frame. The
// renderer (editor/MeterDeviceParts.svelte) only paints them, so what a part does with the value is
// tested here rather than in a browser.
//
// Returns { box, transform, paths, texts }:
//   transform   the part's own turn and move: its rotation, and a swing or a slide with the value
//   paths       [{ d, role }], role 'base' (the part's own colour), 'lit' (a cell lit by the value,
//               in the active colour, moved by the part's travel) or 'zone' (a tick past zoneFrom)
//   texts       [{ x, y, text, size }]: a legend's words or figures, baseline at y, centred on x

import { deviceShapePath, devicePatternCells } from './deviceShapes.js';
import { METER_FRAME } from '../models/meterDeviceParts.js';

const W = METER_FRAME.width;
const H = METER_FRAME.height;
const f = (value) => Number(Number(value).toFixed(2));
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp01 = (value) => Math.max(0, Math.min(1, num(value, 0)));
// A cell lit "at or below the value", as the forms lit them, with float noise forgiven.
const litAt = (fraction, p) => fraction <= p + 1e-9;

/** The part's box in the frame's units. */
export function meterPartBox(part) {
  const layout = part?._children?.Layout ?? {};
  return {
    x: (num(layout.x, 0) / 100) * W,
    y: (num(layout.y, 0) / 100) * H,
    w: Math.max(0, (num(layout.width, 0) / 100) * W),
    h: Math.max(0, (num(layout.height, 0) / 100) * H),
  };
}

/** The reading as a counter shows it: its figures to `precision` places (at most three). */
export function meterFigures(value, precision = 0) {
  return num(value, 0).toFixed(Math.max(0, Math.min(3, Math.round(num(precision, 0)))));
}

function rectPath(x, y, w, h) {
  if (!(w > 0) || !(h > 0)) return '';
  return `M${f(x)} ${f(y)} H${f(x + w)} V${f(y + h)} H${f(x)} Z`;
}

// A tick from `inner` to `outer` along the angle `a` (degrees, 0 up, clockwise), `width` thick.
function radialTick(cx, cy, inner, outer, a, width) {
  const r = (a * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const hx = (-uy * width) / 2;
  const hy = (ux * width) / 2;
  const p1 = [cx + ux * inner, cy + uy * inner];
  const p2 = [cx + ux * outer, cy + uy * outer];
  return `M${f(p1[0] + hx)} ${f(p1[1] + hy)} L${f(p2[0] + hx)} ${f(p2[1] + hy)} L${f(p2[0] - hx)} ${f(p2[1] - hy)} L${f(p1[0] - hx)} ${f(p1[1] - hy)} Z`;
}

function scalePaths(part, box, pattern) {
  const steps = Math.max(1, Math.min(96, Math.round(num(part?.patternCount, 10))));
  const width = Math.max(0.1, num(part?.tickWidth, 1));
  const depth = Math.max(0, Math.min(100, num(part?.shapeDepth, 50))) / 100;
  const every = Math.max(0, Math.round(num(part?.majorEvery, 0)));
  const zoneFrom = part?.zoneFrom == null || part.zoneFrom === '' ? null : num(part.zoneFrom, 1);
  const base = [];
  const zone = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const major = every > 0 && i % every === 0;
    let d;
    if (pattern === 'arc') {
      const radius = Math.min(box.w, box.h) / 2;
      const length = radius * (major ? Math.min(1, depth * 1.6) : depth);
      d = radialTick(box.x + box.w / 2, box.y + box.h / 2, radius - length, radius, t * num(part?.swing, 270), width);
    } else if (box.w >= box.h) {
      // Along the box, up from its foot.
      const length = box.h * (major ? 1 : depth);
      d = rectPath(box.x + t * box.w - width / 2, box.y + box.h - length, width, length);
    } else {
      // Up the box, out from its left edge.
      const length = box.w * (major ? 1 : depth);
      d = rectPath(box.x, box.y + box.h * (1 - t) - width / 2, length, width);
    }
    if (d) (zoneFrom != null && t > zoneFrom ? zone : base).push(d);
  }
  return [
    ...(base.length ? [{ d: base.join(' '), role: 'base' }] : []),
    ...(zone.length ? [{ d: zone.join(' '), role: 'zone' }] : []),
  ];
}

function legendText(part, p, figures) {
  const source = String(part?.textSource ?? 'fixed');
  if (source === 'percent') return String(Math.round(clamp01(p) * 100));
  if (source === 'value') return figures;
  return String(part?.legendText ?? '');
}

/**
 * What `part` (named `name`) draws when the meter reads `p` (0 to 1 along its scale), `figures`
 * being the reading as a counter shows it (meterFigures).
 */
export function meterPartDrawing(name, part, { p = 0, figures = '0' } = {}) {
  const box = meterPartBox(part);
  const at = clamp01(p);
  const motion = String(part?.motion ?? 'none');
  const pattern = String(part?.pattern ?? 'solid');
  const layout = part?._children?.Layout ?? {};
  const pivot = { x: box.x + (num(part?.pivotX, 50) / 100) * box.w, y: box.y + (num(part?.pivotY, 50) / 100) * box.h };
  const turn = num(layout.rotation, 0) + (motion === 'swing' ? num(part?.swing, 0) * at : 0);
  const dx = motion === 'slide' ? (num(part?.travelX, 0) / 100) * W * at : 0;
  const dy = motion === 'slide' ? (num(part?.travelY, 0) / 100) * H * at : 0;
  const transform = [
    dx || dy ? `translate(${f(dx)} ${f(dy)})` : '',
    turn ? `rotate(${f(turn)} ${f(pivot.x)} ${f(pivot.y)})` : '',
  ].filter(Boolean).join(' ');
  const result = { box, transform, paths: [], texts: [] };
  if (!(box.w > 0) || !(box.h > 0)) return result;

  const shape = (x, y, w, h) => deviceShapePath(part?.shape, x, y, w, h, {
    depth: part?.shapeDepth,
    radius: num(part?._children?.Background?._children?.Corners?.radius, 0),
  });

  if (name === 'legend') {
    const text = legendText(part, at, figures);
    const size = Math.max(1, num(part?.fontSize, 10));
    if (pattern === 'digits') {
      const chars = text.split('');
      for (const cell of devicePatternCells('columns', box.x, box.y, box.w, box.h, { count: chars.length, cellWidth: part?.cellWidth ?? 92 })) {
        const pitch = cell.cols > 1 ? (box.w - cell.w) / (cell.cols - 1) : box.w;
        result.texts.push({ x: f(cell.x + cell.w / 2), y: f(box.y + box.h), text: chars[cell.col], size: f(Math.min(size, pitch)) });
      }
    } else if (text) {
      result.texts.push({ x: f(box.x + box.w / 2), y: f(box.y + box.h), text, size: f(size) });
    }
    return result;
  }

  if (pattern === 'ticks' || pattern === 'arc') {
    result.paths = scalePaths(part, box, pattern);
    return result;
  }

  // The box a fill has reached.
  let area = box;
  if (motion === 'fill') {
    area = String(part?.fillFrom ?? 'left') === 'bottom'
      ? { x: box.x, y: box.y + box.h * (1 - at), w: box.w, h: box.h * at }
      : { x: box.x, y: box.y, w: box.w * at, h: box.h };
    if (!(area.w > 0.01) || !(area.h > 0.01)) return result;
  }

  const cells = pattern === 'digits'
    ? devicePatternCells('columns', area.x, area.y, area.w, area.h, { count: Math.max(1, figures.length), cellWidth: part?.cellWidth ?? 92 })
    : devicePatternCells(pattern, area.x, area.y, area.w, area.h, {
      count: part?.patternCount, rows: part?.patternRows, cellWidth: part?.cellWidth, cellHeight: part?.cellHeight,
    });
  if (motion === 'light') {
    const base = [];
    const lit = [];
    for (const cell of cells) (litAt(cell.col / cell.cols, at) ? lit : base).push(shape(cell.x, cell.y, cell.w, cell.h));
    if (base.length) result.paths.push({ d: base.filter(Boolean).join(' '), role: 'base' });
    if (lit.length) result.paths.push({ d: lit.filter(Boolean).join(' '), role: 'lit' });
  } else {
    const d = cells.map((cell) => shape(cell.x, cell.y, cell.w, cell.h)).filter(Boolean).join(' ');
    if (d) result.paths.push({ d, role: 'base' });
  }
  return result;
}

/** How far lit cells move: the part's travel, in the frame's units. */
export function meterLitOffset(part) {
  return { x: f((num(part?.travelX, 0) / 100) * W), y: f((num(part?.travelY, 0) / 100) * H) };
}
