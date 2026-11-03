// meterParts.js — what a meter's part draws at a reading (models/meterDeviceParts.js).
//
// Pure: a part and the reading in, SVG instructions out, in the meter's 160 by 100 frame. The
// renderer (editor/MeterDeviceParts.svelte) only paints them, so what a part does with the value is
// tested here rather than in a browser.
//
// Returns { box, transform, paths, zoneFill, texts, labels }:
//   transform   the part's own turn and move: its rotation, and a swing or a slide with the value
//   paths       [{ d, role, colour? }], role 'base' (the part's own paint), 'lit' (a cell lit by the
//               value, or a clip lamp lit, in the active colour, moved by the part's travel) or
//               'zone' (a tick past zoneFrom, in the active colour); `colour` (AARRGGBB) where the
//               meter's colour zones decide it instead
//   zoneFill    a fill coloured by position: { x1, y1, x2, y2, stops } in the frame's units, the
//               zones along the fill's own direction across its whole box
//   texts       [{ x, y, text, size }]: a legend's words or figures, baseline at y, centred on x
//   labels      [{ x, y, text, size, anchor }]: a scale's numerals, centred on (x, y), upright and
//               already where the part's rotation puts them (drawn outside its transform)

import { deviceShapePath, devicePatternCells } from './deviceShapes.js';
import { meterFillColourAt, meterZones } from './meterLayout.js';
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

const trim = (value, places) => {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) return String(rounded);
  return value.toFixed(places).replace(/0+$/, '').replace(/\.$/, '');
};

/**
 * A numeral for the mark at `t` (0 to 1 along the scale): the reading there, its decibels, or the
 * percentage. A meter on a decibel scale (Meter.scale 'db') spreads dbFloor to dbCeil along it.
 */
export function meterScaleNumeral(t, units = 'reading', meter = {}) {
  const at = clamp01(t);
  const db = String(meter?.scale) === 'db';
  const floor = num(meter?.dbFloor, -60);
  const ceil = num(meter?.dbCeil, 6);
  if (units === 'percent') return String(Math.round(at * 100));
  if (units === 'db') {
    const value = db ? floor + at * (ceil - floor) : (at > 0 ? 20 * Math.log10(at) : -Infinity);
    if (!Number.isFinite(value)) return '-∞';
    const text = trim(value, Math.abs(value) >= 10 ? 0 : 1);
    return value > 0.05 ? `+${text}` : text;
  }
  const lo = num(meter?.valueMin, 0);
  const hi = num(meter?.valueMax, 1);
  const fraction = db ? 10 ** ((floor + at * (ceil - floor)) / 20) : at;
  return trim(lo + fraction * (hi - lo), 2);
}

/** A part's paint from the meter's zones at `pos`: stepped or blended as the meter says. */
export function meterZoneColour(pos, meter = {}) {
  return String(meterFillColourAt(clamp01(pos), meter ?? {}) ?? '').toUpperCase();
}

// The zones along a fill: stops for a gradient across the whole box, stepped or blended.
function zoneStops(meter) {
  const zones = meterZones(meter ?? {});
  const blend = meter?.gradient !== false;
  const stops = [];
  zones.forEach((zone, i) => {
    const colour = String(zone.colour).toUpperCase();
    stops.push({ offset: f(zone.from), colour });
    const next = zones[i + 1];
    if (!blend && next) stops.push({ offset: f(next.from), colour });
  });
  return stops;
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

// A point turned `deg` about `pivot`, as the part's own rotation turns it.
function turned(x, y, deg, pivot) {
  if (!deg) return { x, y };
  const r = (deg * Math.PI) / 180;
  const dx = x - pivot.x;
  const dy = y - pivot.y;
  return { x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r), y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

// Paths grouped by colour: one per distinct colour, in the order the colours first appear.
function byColour(entries, role) {
  const groups = new Map();
  for (const { d, colour } of entries) {
    if (!d) continue;
    const key = colour ?? '';
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups].map(([colour, list]) => ({ d: list.join(' '), role, ...(colour ? { colour } : {}) }));
}

function scaleDrawing(part, box, pattern, meter, turn, pivot) {
  const majors = Math.max(2, Math.min(97, Math.round(num(part?.majorCount, 5))));
  const minors = Math.max(0, Math.min(20, Math.round(num(part?.minorCount, 0))));
  const steps = (majors - 1) * (minors + 1);
  const length = (major) => Math.max(0, Math.min(100, num(major ? part?.majorLength : part?.minorLength, major ? 100 : 50))) / 100;
  const width = (major) => Math.max(0.1, num(major ? part?.majorWidth : part?.minorWidth, 1));
  const zoneFrom = part?.zoneFrom == null || part.zoneFrom === '' ? null : num(part.zoneFrom, 1);
  const byPosition = String(part?.zoneColours ?? 'off') === 'position';
  const numerals = part?.numerals === true;
  const size = Math.max(1, num(part?.numeralSize, 7));
  const inside = String(part?.numeralPlacement ?? 'outside') === 'inside';
  const units = String(part?.numeralUnits ?? 'reading');
  const gap = Math.max(1, size * 0.35);
  const base = [];
  const zone = [];
  const labels = [];
  const arc = pattern === 'arc';
  const radius = Math.min(box.w, box.h) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const sweep = num(part?.swing, 270);
  const along = box.w >= box.h;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const major = i % (minors + 1) === 0;
    let d;
    let label = null;
    if (arc) {
      const len = radius * length(major);
      const a = t * sweep;
      d = radialTick(cx, cy, radius - len, radius, a, width(major));
      if (major && numerals) {
        const r = inside ? radius - length(true) * radius - gap - size / 2 : radius + gap + size / 2;
        const rad = ((a + turn) * Math.PI) / 180;
        // The centre the rotation turns about is the pivot; the numeral sits on the turned arc.
        const centre = turned(cx, cy, turn, pivot);
        label = { x: centre.x + Math.sin(rad) * r, y: centre.y - Math.cos(rad) * r, anchor: 'middle' };
      }
    } else if (along) {
      // Along the box, up from its foot.
      const len = box.h * length(major);
      const x = box.x + t * box.w;
      d = rectPath(x - width(major) / 2, box.y + box.h - len, width(major), len);
      if (major && numerals) {
        const y = inside ? box.y + box.h + gap + size / 2 : box.y + box.h - box.h * length(true) - gap - size / 2;
        label = { ...turned(x, y, turn, pivot), anchor: 'middle' };
      }
    } else {
      // Up the box, out from its left edge.
      const len = box.w * length(major);
      const y = box.y + box.h * (1 - t);
      d = rectPath(box.x, y - width(major) / 2, len, width(major));
      if (major && numerals) {
        const at = inside ? { x: box.x - gap, y, anchor: 'end' } : { x: box.x + box.w * length(true) + gap, y, anchor: 'start' };
        label = { ...turned(at.x, at.y, turn, pivot), anchor: at.anchor };
      }
    }
    if (d) {
      if (byPosition) base.push({ d, colour: meterZoneColour(t, meter) });
      else (zoneFrom != null && t > zoneFrom ? zone : base).push({ d });
    }
    if (label) labels.push({ x: f(label.x), y: f(label.y), text: meterScaleNumeral(t, units, meter), size: f(size), anchor: label.anchor });
  }
  return { paths: [...byColour(base, 'base'), ...byColour(zone, 'zone')], labels };
}

function legendText(part, p, figures) {
  const source = String(part?.textSource ?? 'fixed');
  if (source === 'percent') return String(Math.round(clamp01(p) * 100));
  if (source === 'value') return figures;
  return String(part?.legendText ?? '');
}

/**
 * What `part` (named `name`) draws when the meter reads `p` (0 to 1 along its scale) and holds
 * `peak`, `figures` being the reading as a counter shows it (meterFigures) and `meter` the meter's
 * own settings (its colour zones and scale).
 */
export function meterPartDrawing(name, part, { p = 0, peak = null, figures = '0', meter = {} } = {}) {
  const box = meterPartBox(part);
  const held = clamp01(peak == null ? p : Math.max(num(peak, 0), num(p, 0)));
  const reading = String(part?.source ?? 'reading') === 'peak' ? held : clamp01(p);
  const motion = String(part?.motion ?? 'none');
  const pattern = String(part?.pattern ?? 'solid');
  const zones = String(part?.zoneColours ?? 'off');
  const layout = part?._children?.Layout ?? {};
  const pivot = { x: box.x + (num(part?.pivotX, 50) / 100) * box.w, y: box.y + (num(part?.pivotY, 50) / 100) * box.h };
  const rest = num(layout.rotation, 0);
  const turn = rest + (motion === 'swing' ? num(part?.swing, 0) * reading : 0);
  const dx = motion === 'slide' ? (num(part?.travelX, 0) / 100) * W * reading : 0;
  const dy = motion === 'slide' ? (num(part?.travelY, 0) / 100) * H * reading : 0;
  const transform = [
    dx || dy ? `translate(${f(dx)} ${f(dy)})` : '',
    turn ? `rotate(${f(turn)} ${f(pivot.x)} ${f(pivot.y)})` : '',
  ].filter(Boolean).join(' ');
  const result = { box, transform, paths: [], zoneFill: null, texts: [], labels: [] };
  if (!(box.w > 0) || !(box.h > 0)) return result;
  // The colour of the reading's zone, for a part that takes it whole: by level, or by position on a
  // part with no positions of its own (a needle, a lamp). A scale and a fill or ladder have them.
  const scale = pattern === 'ticks' || pattern === 'arc';
  const levelColour = zones === 'level' || (zones === 'position' && !scale && !['fill', 'light'].includes(motion))
    ? meterZoneColour(motion === 'clip' ? held : reading, meter)
    : null;

  const shape = (x, y, w, h) => deviceShapePath(part?.shape, x, y, w, h, {
    depth: part?.shapeDepth,
    radius: num(part?._children?.Background?._children?.Corners?.radius, 0),
  });

  if (name === 'legend') {
    const text = legendText(part, reading, figures);
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
    if (levelColour) result.textColour = levelColour;
    return result;
  }

  if (scale) {
    const marks = scaleDrawing(part, box, pattern, meter, rest, pivot);
    result.paths = levelColour ? marks.paths.map((path) => ({ ...path, colour: levelColour })) : marks.paths;
    result.labels = marks.labels;
    return result;
  }

  // The box a fill has reached, from its edge.
  let area = box;
  const from = String(part?.fillFrom ?? 'left');
  if (motion === 'fill') {
    area = from === 'bottom' ? { x: box.x, y: box.y + box.h * (1 - reading), w: box.w, h: box.h * reading }
      : from === 'top' ? { x: box.x, y: box.y, w: box.w, h: box.h * reading }
        : from === 'right' ? { x: box.x + box.w * (1 - reading), y: box.y, w: box.w * reading, h: box.h }
          : { x: box.x, y: box.y, w: box.w * reading, h: box.h };
    if (!(area.w > 0.01) || !(area.h > 0.01)) return result;
    if (zones === 'position') {
      const axis = from === 'bottom' ? [box.x, box.y + box.h, box.x, box.y]
        : from === 'top' ? [box.x, box.y, box.x, box.y + box.h]
          : from === 'right' ? [box.x + box.w, box.y, box.x, box.y]
            : [box.x, box.y, box.x + box.w, box.y];
      result.zoneFill = { x1: f(axis[0]), y1: f(axis[1]), x2: f(axis[2]), y2: f(axis[3]), stops: zoneStops(meter) };
    }
  }

  const cells = pattern === 'digits'
    ? devicePatternCells('columns', area.x, area.y, area.w, area.h, { count: Math.max(1, figures.length), cellWidth: part?.cellWidth ?? 92 })
    : devicePatternCells(pattern, area.x, area.y, area.w, area.h, {
      count: part?.patternCount, rows: part?.patternRows, cellWidth: part?.cellWidth, cellHeight: part?.cellHeight,
    });
  if (motion === 'light') {
    // Counted from the left, or up from the foot; a cell lights at or below the reading.
    const bottom = String(part?.lightFrom ?? 'left') === 'bottom';
    const base = [];
    const lit = [];
    for (const cell of cells) {
      const index = bottom ? cell.rows - 1 - cell.row : cell.col;
      const count = bottom ? cell.rows : cell.cols;
      const d = shape(cell.x, cell.y, cell.w, cell.h);
      if (litAt(index / count, reading)) {
        lit.push({ d, colour: zones === 'position' ? meterZoneColour((index + 0.5) / count, meter) : (levelColour ?? undefined) });
      } else {
        base.push({ d });
      }
    }
    result.paths = [...byColour(base, 'base'), ...byColour(lit, 'lit')];
  } else if (motion === 'clip') {
    // The lamp lights at its level and holds with the meter's peak.
    const d = cells.map((cell) => shape(cell.x, cell.y, cell.w, cell.h)).filter(Boolean).join(' ');
    const on = held >= clamp01(part?.clipFrom ?? 0.9) - 1e-9;
    if (d) result.paths = [{ d, role: on ? 'lit' : 'base', ...(on && levelColour ? { colour: levelColour } : {}) }];
  } else {
    const d = cells.map((cell) => shape(cell.x, cell.y, cell.w, cell.h)).filter(Boolean).join(' ');
    if (d) result.paths = [{ d, role: 'base', ...(levelColour ? { colour: levelColour } : {}) }];
  }
  return result;
}

/** How far lit cells move: the part's travel, in the frame's units. */
export function meterLitOffset(part) {
  if (String(part?.motion ?? 'none') !== 'light') return { x: 0, y: 0 };
  return { x: f((num(part?.travelX, 0) / 100) * W), y: f((num(part?.travelY, 0) / 100) * H) };
}
