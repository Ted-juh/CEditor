// formDrawingLayers.js — a knob drawn in one of the twelve base forms (editor/ControlAnatomy.svelte),
// made into the layers that draw the same picture (Create Component from Selection, as layers).
//
// A form's parts (models/knobFormParts.js, Convert to Parts) are a new drawing of it in the knob's
// own parts: close in spirit, not in pixels. The tab's card is square where the drawing's is askew,
// the pebble has three lobes where the drawing's is one soft shape, the parts fill the box where
// the drawing keeps to its frame. A copy made to look like the control has to draw what the control
// shows, so here each drawing is written out shape by shape as ControlAnatomy draws it, in its own
// 160 by 170 frame fitted to the box as the SVG fits it:
//
//   every shape   a path layer filled in its colour; a stroke is the band it paints, a path of its
//                 own, its ends cut square and its corners mitred (bevelled past a mitre of four) as
//                 an SVG stroke's are, so a stroke's opacity lies over the fill as the drawing's did.
//   shading       the drawing's dome and metal gradients, on the shape's own box, as strong as the
//                 form's Depth.
//   text          the readout a text layer showing the channel's value as the knob's readout did;
//                 the tuning dial's ends the knob's minimum and maximum.
//   what moves    the group that turns with the value, about its centre; the disc's value arc; the
//                 roller's ribs and its marker; the tuning dial's needle; the encoder's segments,
//                 each lit from its own point of the travel.
//
// The colours are the form's five on Core (Face, Housing, Ink, Legends, Indicator), a colour role
// kept as a role; a gradient stop holds a colour, so the face in a gradient is its literal.

import { createPartNode } from './customComponentFactory.js';
import { deepClone } from './deepClone.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { unpremultipliedStops } from './gradientStops.js';
import { flattenPath } from './svgPathScale.js';
import { drawingItems } from './svgDrawingItems.js';
import { synthKnobDrawing } from './synthKnobDrawings.js';
import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';

/** The twelve base knob forms, drawn here item by item. */
export const BASE_DRAWN_KNOB_FORMS = ['disc', 'pointer', 'tab', 'pebble', 'halo', 'lens', 'skirt', 'roller', 'vernier', 'tuning', 'scallop', 'encoder'];
/** The forms drawn here: the twelve base knob forms and the 36 synth sets' (their markup, utils/synthKnobDrawings.js). */
export const DRAWN_KNOB_FORMS = [...BASE_DRAWN_KNOB_FORMS, ...PHYSICAL_DIRECTIONS.map((direction) => `new-${direction.id}`)];

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const RAD = Math.PI / 180;

// The drawing's own point on a circle: `a` degrees clockwise from the top (ControlAnatomy's point()).
const point = (a, r, cx = 80, cy = 76) => [cx + Math.sin(a * RAD) * r, cy - Math.cos(a * RAD) * r];

// --- shapes in the drawing's units --------------------------------------------------------------
//
// A shape is a list of subpaths, filled together even-odd: a polygon (a list of points) or a circle
// ({ circle: [cx, cy, r] }), which stays an exact arc.

const circle = (cx, cy, r) => [{ circle: [cx, cy, r] }];
/** The band a stroke of width `w` paints along a circle. */
const ring = (cx, cy, r, w) => [{ circle: [cx, cy, r + w / 2] }, { circle: [cx, cy, Math.max(0.01, r - w / 2)] }];

/** A rectangle, its corners rounded to `rx` (an SVG rect's). */
function rect(x, y, w, h, rx = 0) {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (!r) return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
  const pts = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= 8; i += 1) {
      const a = (from + i * 90 / 8) * RAD;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + r, -90);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, 90);
  corner(x + r, y + r, 180);
  return [pts];
}

function ellipse(cx, cy, rx, ry, n = 48) {
  return [Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rx, cy + Math.sin((i / n) * 2 * Math.PI) * ry])];
}

const path = (d) => flattenPath(d).map((pts) => dedupe(pts));
function dedupe(pts) {
  const out = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
  return out;
}

/** The band an SVG stroke of width `w` paints round a closed polygon: mitred corners, a mitre past four bevelled. */
function strokeClosed(pts, w) {
  return [offsetPolygon(pts, w / 2), offsetPolygon(pts, -w / 2)];
}

function offsetPolygon(points, distance) {
  const pts = dedupe(points);
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const outward = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = (outward * (q[1] - p[1])) / len;
    const ny = (outward * -(q[0] - p[0])) / len;
    return { a: [p[0] + nx * distance, p[1] + ny * distance], b: [q[0] + nx * distance, q[1] + ny * distance], d: [q[0] - p[0], q[1] - p[1]], n: [nx, ny] };
  });
  const out = [];
  lines.forEach((line, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cross = prev.d[0] * line.d[1] - prev.d[1] * line.d[0];
    if (Math.abs(cross) < 1e-9) { out.push(line.a); return; }
    // The corner's mitre: how far its point lies from the corner, against half the stroke.
    const cosTurn = (prev.n[0] * line.n[0] + prev.n[1] * line.n[1]);
    const ratio = 1 / Math.sqrt(Math.max(1e-9, (1 + cosTurn) / 2));
    // Only the outside of a corner is mitred; inside, the two edges simply meet.
    const outside = Math.sign(cross) * outward * Math.sign(distance) > 0;
    if (outside && ratio > 4) { out.push(prev.b, line.a); return; }
    const t = ((line.a[0] - prev.a[0]) * line.d[1] - (line.a[1] - prev.a[1]) * line.d[0]) / cross;
    out.push([prev.a[0] + prev.d[0] * t, prev.a[1] + prev.d[1] * t]);
  });
  return out;
}

/** The band an SVG stroke of width `w` paints along an open polyline, its ends cut square. */
function strokeOpen(pts, w) {
  const p = dedupe(pts);
  const normal = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const left = [];
  const right = [];
  for (let i = 0; i < p.length; i += 1) {
    let nx;
    let ny;
    let scale = 1;
    if (i === 0) [nx, ny] = normal(p[0], p[1]);
    else if (i === p.length - 1) [nx, ny] = normal(p[i - 1], p[i]);
    else {
      const n1 = normal(p[i - 1], p[i]);
      const n2 = normal(p[i], p[i + 1]);
      const sum = [n1[0] + n2[0], n1[1] + n2[1]];
      const len = Math.hypot(sum[0], sum[1]) || 1;
      [nx, ny] = [sum[0] / len, sum[1] / len];
      scale = 1 / Math.max(0.25, nx * n1[0] + ny * n1[1]);
    }
    left.push([p[i][0] + nx * (w / 2) * scale, p[i][1] + ny * (w / 2) * scale]);
    right.push([p[i][0] - nx * (w / 2) * scale, p[i][1] - ny * (w / 2) * scale]);
  }
  return [[...left, ...right.reverse()]];
}

/** A straight line's stroke: a quad, its ends square. */
const line = (x1, y1, x2, y2, w) => strokeOpen([[x1, y1], [x2, y2]], w);

/**
 * The dashes of a circle's dashed stroke, each the piece of the band it paints: SVG starts a
 * circle's outline at its rightmost point and goes clockwise.
 */
function dashedCircle(cx, cy, r, w, dash, gap) {
  const length = 2 * Math.PI * r;
  const out = [];
  for (let at = 0; at < length - 1e-6; at += dash + gap) {
    const end = Math.min(length, at + dash);
    const steps = Math.max(2, Math.ceil(((end - at) / r) / (3 * RAD)));
    const arc = [];
    for (let s = 0; s <= steps; s += 1) arc.push(point(90 + ((at + ((end - at) * s) / steps) / r) / RAD, r, cx, cy));
    out.push(...strokeOpen(arc, w));
  }
  return out;
}

// --- the drawings -------------------------------------------------------------------------------
//
// Each returns its items, in drawing order. An item is a shape `{ name, shape, colour, opacity,
// gradient, turn, moveX, moveY, lit }` or a text `{ name, text, x, y, size, colour, anchor, family,
// readout }`, or an arc `{ name, arc }`. `turn` turns it with the value about a point; `moveX` and
// `moveY` move it that far over the travel; `lit` shows it from that point of the travel. `out` keeps
// it outside the group the form's Size scales.

function ticks(c, radius = 62, cy = 76) {
  const shape = [];
  for (let i = 0; i <= c.detail; i += 1) {
    const a = -135 + (i * 270) / c.detail;
    const q = point(a, radius, 80, cy);
    const z = point(a, radius - (i % 3 ? 4 : 9), 80, cy);
    shape.push(...line(q[0], q[1], z[0], z[1], i % 3 ? 1 : 2));
  }
  return { name: 'ticks', shape, colour: c.legend };
}

const AROUND = [80, 76];

const DRAWINGS = {
  disc: (c) => [
    { name: 'track', arc: { radius: 58, thickness: 5, start: -135, sweep: 270 }, colour: c.ink, opacity: 0.2 },
    { name: 'arc', arc: { radius: 58, thickness: 5, start: -135, sweep: 0, follows: 270 }, colour: c.accent },
    { name: 'face', shape: circle(80, 76, 43), colour: c.face },
    { name: 'pointer', shape: rect(77, 36, 6, 25, 3), colour: c.accent, turn: AROUND },
    c.readout,
  ],
  pointer: (c) => [
    ticks(c),
    { name: 'ring', shape: dashedCircle(80, 76, 45, 1, 2, 5), colour: c.ink },
    { name: 'crosshair', shape: [...line(10, 76, 150, 76, 1), ...line(80, 6, 80, 146, 1)], colour: c.ink, opacity: 0.2 },
    { name: 'needle', shape: path('M80 16L85 87H75Z'), colour: c.accent, turn: AROUND },
    { name: 'needleEdge', shape: strokeClosed(path('M80 16L85 87H75Z')[0], 1), colour: c.ink, turn: AROUND },
    { name: 'tail', shape: line(80, 88, 80, 108, 3), colour: c.ink, turn: AROUND },
    { name: 'hub', shape: circle(80, 76, 7), colour: c.face },
    { name: 'hubEdge', shape: ring(80, 76, 7, 1), colour: c.ink },
    c.readout,
  ],
  tab: (c) => [
    { name: 'shadow', shape: path('M27 20L128 25 137 128 21 120Z'), colour: c.ink },
    { name: 'card', shape: path('M22 14L123 19 132 122 16 114Z'), colour: c.face },
    { name: 'cardEdge', shape: strokeClosed(path('M22 14L123 19 132 122 16 114Z')[0], 2), colour: c.ink },
    { name: 'dots', shape: dashedCircle(75, 72, 43, 4, 1, 9), colour: c.ink },
    { name: 'blade', shape: path('M69 102L62 55 80 26 98 55 91 102Z'), colour: c.accent, turn: AROUND },
    { name: 'bladeEdge', shape: strokeClosed(path('M69 102L62 55 80 26 98 55 91 102Z')[0], 3), colour: c.ink, turn: AROUND },
    { name: 'bladeShade', shape: path('M62 55H98L80 64Z'), colour: c.ink, opacity: 0.18, turn: AROUND },
    { name: 'hub', shape: circle(80, 76, 5), colour: c.face },
    c.readout,
  ],
  pebble: (c) => [
    { name: 'shadow', shape: path('M22 64Q25 16 80 18Q138 18 137 80Q141 140 79 136Q14 137 22 64'), colour: c.ink, opacity: 0.15 },
    { name: 'pebble', shape: path('M43 45Q77 10 109 41Q137 65 107 110Q78 142 43 111Q18 78 43 45'), colour: c.face, gradient: c.dome, turn: AROUND },
    { name: 'dot', shape: ellipse(80, 42, 6, 10), colour: c.accent, turn: AROUND },
    c.readout,
  ],
  halo: (c) => [
    ticks(c, 69),
    { name: 'glass', shape: ring(80, 76, 47, 19), colour: c.face, opacity: 0.55 },
    { name: 'outerLine', shape: ring(80, 76, 58, 1), colour: c.ink },
    { name: 'innerLine', shape: ring(80, 76, 36, 1), colour: c.ink, opacity: 0.45 },
    { name: 'glint', shape: strokeOpen(path('M46 34A54 54 0 0 1 111 31')[0], 4), colour: 'FFFFFFFF', turn: AROUND },
    { name: 'bead', shape: circle(80, 29, 9), colour: c.accent, turn: AROUND },
    { name: 'beadEdge', shape: ring(80, 29, 9, 1), colour: c.ink, turn: AROUND },
    c.readout,
  ],
  lens: (c) => [
    { name: 'housing', shape: path('M30 12H130L148 30V123L130 140H30L12 123V30Z'), colour: c.housing },
    { name: 'housingEdge', shape: strokeClosed(path('M30 12H130L148 30V123L130 140H30L12 123V30Z')[0], 1), colour: c.ink, opacity: 0.35 },
    { name: 'rim', shape: circle(80, 76, 58), colour: c.face },
    { name: 'dome', shape: circle(80, 76, 49), gradient: c.dome },
    { name: 'glass', shape: circle(80, 76, 30), colour: c.housing },
    { name: 'glassEdge', shape: ring(80, 76, 30, 1), colour: c.ink, opacity: 0.35 },
    { name: 'arc', shape: strokeOpen(path('M48 35A52 52 0 0 1 112 35')[0], 5), colour: c.accent, turn: AROUND },
    { name: 'index', shape: path('M79 21H81V38H79Z'), colour: 'FFFFFFFF', turn: AROUND },
    c.showValue ? { name: 'readout', text: true, readout: true, x: 80, y: 80, size: 12, colour: c.accent, family: c.family } : null,
  ],
  skirt: (c) => [
    ticks(c, 70),
    { name: 'skirt', shape: circle(80, 76, 52), colour: c.housing },
    { name: 'skirtEdge', shape: ring(80, 76, 52, 1), colour: c.ink, opacity: 0.35 },
    { name: 'face', shape: circle(80, 76, 45), colour: c.face },
    { name: 'grip', shape: path('M69 26H91L101 90 87 109H73L59 90Z'), colour: c.ink, turn: AROUND },
    { name: 'pointer', shape: rect(76, 32, 8, 44, 2), colour: c.accent, turn: AROUND },
    { name: 'base', shape: line(43, 133, 117, 133, 2), colour: c.ink },
    c.readout,
  ],
  roller: (c) => [
    { name: 'housing', shape: rect(27, 9, 106, 132, 34), colour: c.housing },
    { name: 'housingEdge', shape: strokeClosed(rect(27, 9, 106, 132, 34)[0], 1), colour: c.ink, opacity: 0.35 },
    { name: 'wheel', shape: rect(39, 15, 82, 120, 29), colour: c.face, gradient: c.metal },
    // The ribs scroll down a rib's spacing over the travel. The thirteenth stands on the first, and
    // the twelfth goes back to the top at the very end, as the drawing's modulo puts them.
    ...Array.from({ length: 13 }, (_, i) => ({
      name: `rib${i + 1}`, shape: line(45, 23 + ((i * 9) % 108), 115, 23 + ((i * 9) % 108), 3), colour: c.ink, opacity: 0.55, moveY: 9,
      ...(i === 11 ? { wrapY: -108 } : {}),
    })),
    { name: 'arrows', shape: path('M21 75L32 69V81Z M139 75L128 69V81Z'), colour: c.accent },
    { name: 'marker', shape: rect(63, 28, 34, 5, 2), colour: c.accent, moveY: 84 },
    c.readout,
  ],
  vernier: (c) => [
    ticks(c, 71),
    { name: 'dial', shape: circle(80, 76, 55), colour: c.face },
    { name: 'dialEdge', shape: ring(80, 76, 55, 3), colour: c.ink },
    { name: 'metal', shape: circle(80, 76, 48), gradient: c.metal },
    { name: 'dots', shape: Array.from({ length: 24 }, (_, i) => point(i * 15, 47)).flatMap(([x, y]) => circle(x, y, 2)), colour: c.ink },
    { name: 'centre', shape: circle(80, 76, 32), colour: c.housing, turn: AROUND },
    { name: 'centreEdge', shape: ring(80, 76, 32, 1), colour: c.ink, opacity: 0.35, turn: AROUND },
    { name: 'index', shape: rect(76, 45, 8, 30), colour: c.accent, turn: AROUND },
    ...(c.showValue ? [
      { name: 'leader', shape: line(111, 35, 139, 18, 1), colour: c.ink },
      { name: 'window', shape: rect(110, 12, 39, 19, 2), colour: c.ink },
      { name: 'readout', text: true, readout: true, x: 130, y: 26, size: 11, colour: c.face, family: c.family },
    ] : []),
  ],
  tuning: (c) => [
    { name: 'bezel', shape: path('M10 100V59A70 48 0 0 1 150 59V100Z'), colour: c.housing },
    { name: 'bezelEdge', shape: strokeClosed(path('M10 100V59A70 48 0 0 1 150 59V100Z')[0], 1), colour: c.ink, opacity: 0.35 },
    { name: 'window', shape: path('M18 91V60A62 40 0 0 1 142 60V91Z'), colour: c.face },
    { name: 'scale', shape: Array.from({ length: c.detail + 1 }, (_, i) => line(23 + (i * 114) / c.detail, 47, 23 + (i * 114) / c.detail, i % 3 ? 53 : 60, 1)).flat(), colour: c.ink },
    { name: 'min', text: String(c.min), x: 28, y: 76, size: 9, colour: c.ink, anchor: 'start', family: c.family },
    { name: 'max', text: String(c.max), x: 121, y: 76, size: 9, colour: c.ink, anchor: 'start', family: c.family },
    { name: 'needle', shape: line(24, 31, 24, 89, 3), colour: c.accent, moveX: 112 },
    { name: 'knob', shape: circle(80, 121, 23), colour: c.housing, turn: [80, 121] },
    { name: 'knobEdge', shape: ring(80, 121, 23, 1), colour: c.ink, opacity: 0.35, turn: [80, 121] },
    { name: 'knobIndex', shape: rect(76, 99, 8, 23, 3), colour: c.face, turn: [80, 121] },
    c.readout,
  ],
  scallop: (c) => [
    ticks(c, 72),
    { name: 'base', shape: [star(8, 55, 43)], colour: c.housing },
    { name: 'selector', shape: [star(8, 48, 39)], colour: c.face, gradient: c.dome, turn: AROUND },
    { name: 'blade', shape: path('M73 110V44L80 26 87 44V110Z'), colour: c.ink, turn: AROUND },
    { name: 'pointer', shape: line(80, 31, 80, 60, 5), colour: c.accent, turn: AROUND },
    c.readout,
  ],
  encoder: (c) => {
    const segments = Array.from({ length: c.detail }, (_, i) => {
      const a = -135 + (i * 270) / (c.detail - 1);
      const [qx, qy] = point(a, 58);
      const corners = [[-3, -6], [3, -6], [3, 6], [-3, 6]].map(([dx, dy]) => [
        qx + dx * Math.cos(a * RAD) - dy * Math.sin(a * RAD),
        qy + dx * Math.sin(a * RAD) + dy * Math.cos(a * RAD),
      ]);
      return { corners, at: i / (c.detail - 1) };
    });
    return [
      // Unlit, every segment in the ink, faint; lit, each in the indicator over it from its point on.
      { name: 'segments', shape: segments.map((s) => s.corners), colour: c.ink, opacity: 0.25 },
      ...segments.map((s, i) => ({ name: `segment${i + 1}`, shape: [s.corners], colour: c.accent, lit: s.at })),
      { name: 'body', shape: path('M50 37H110L128 76 110 115H50L32 76Z'), colour: c.housing },
      { name: 'bodyEdge', shape: strokeClosed(path('M50 37H110L128 76 110 115H50L32 76Z')[0], 1), colour: c.ink, opacity: 0.35 },
      c.showValue ? { name: 'readout', text: true, readout: true, x: 80, y: 83, size: 18, colour: c.accent, family: 'monospace' } : null,
      { name: 'line', shape: line(68, 102, 92, 102, 1), colour: c.face },
    ];
  },
};

function star(n, r1, r2) {
  return Array.from({ length: n * 2 }, (_, i) => point((i * 180) / n, i % 2 ? r2 : r1));
}

// --- colours ------------------------------------------------------------------------------------

/** An SVG gradient's stops, `[position, RRGGBB, opacity]`, as a layer gradient draws them the SVG way. */
function svgStops(stops) {
  const hex2 = (n) => Math.round(clamp(n, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  return unpremultipliedStops(stops.map(([position, rgb, opacity]) => ({ color: `${hex2(opacity)}${rgb}`, position })));
}

const ROLE = /^\{[^{}]+\}$/;
/** A colour as ControlAnatomy's css() reads it, as AARRGGBB; null where it reads none. */
function literal(value) {
  const hex = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(hex)) return `FF${hex.toUpperCase()}`;
  return null;
}

// --- layers -------------------------------------------------------------------------------------

function background(colour, gradient) {
  const bg = deepClone(SECTION_DEFAULTS.Background);
  const fill = bg._children.Fill;
  fill.solidEnabled = !!colour;
  fill.colour = colour || '00000000';
  if (gradient) {
    fill.gradientEnabled = true;
    fill.gradientOpacity = 100;
    fill.gradient = deepClone(gradient);
  } else {
    fill.gradientEnabled = false;
  }
  bg._children.Border.enabled = false;
  bg._children.Border.thickness = 0;
  bg._children.Corners.radius = 0;
  return bg;
}

function rangeBinding(name, source, target, outputMin, outputMax, inputMin = 0, inputMax = 1) {
  return {
    _type: 'Binding', name, enabled: true, source, target,
    mapMode: 'range', inputMin, inputMax, outputMin: r3(outputMin), outputMax: r3(outputMax), clamp: true,
  };
}

// --- the synth sets' knobs: their markup (utils/synthKnobDrawings.js) read into items --------------

/** A markup colour ("$face", "#20282c", "white") as a layer's colour: a role kept, else AARRGGBB. */
function markupColour(token, c) {
  const text = String(token ?? '').trim();
  if (!text || text === 'none') return '';
  if (text.startsWith('$')) return c[text.slice(1)] ?? '';
  if (text === 'white') return 'FFFFFFFF';
  if (text === 'black') return 'FF000000';
  return literal(text) ?? '';
}

/** A gradient stop's colour, "$face" or "RRGGBB", as RRGGBB: a stop holds a colour, not a role. */
function gradientColour(token, c) {
  const text = String(token ?? '');
  if (text.startsWith('$')) return String(c.literals?.[text.slice(1)] ?? 'FF808080').slice(2);
  return text.replace(/^#/, '').toUpperCase();
}

function synthItems(direction, c) {
  const drawing = synthKnobDrawing(direction, { detail: c.detail, depth: c.depthShare, showValue: c.showValue });
  if (!drawing) return [];
  const items = drawingItems(drawing.markup, {
    colour: (token) => markupColour(token, c),
    gradients: drawing.gradients,
    shadow: drawing.shadow ?? null,
    glow: drawing.glow ?? null,
  });
  if (drawing.readout) items.push({ name: 'readout', text: true, readout: true, x: 80, y: drawing.readout.y, size: 12, colour: c.legend, family: 'monospace', out: true });
  return items;
}

/**
 * An SVG gradient (`{ type, x1, y1, x2, y2 | cx, cy, r, stops: [[offset, colour, opacity]] }`, its
 * coordinates fractions of `on`, the shape's box) as a layer's gradient over `layer`, its own box:
 * both in the component's pixels. A linear one's value is linear across the shape's box however
 * long or tall that is, so it is a CSS gradient at the angle its value rises fastest, its stops
 * placed where the CSS line meets them; a radial one an ellipse in the layer's percentages. Its
 * stops are blended as SVG blends them (unpremultipliedStops).
 */
function layerGradient(def, on, layer, colourOf) {
  const stops = (def.stops ?? []).map(([offset, colour, opacity]) => {
    const alpha = Math.round(clamp(opacity, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
    return { offset, color: `${alpha}${colourOf(colour)}` };
  });
  const placed = (positionOf) => unpremultipliedStops(stops.map((stop) => ({ color: stop.color, position: r3(positionOf(stop.offset)) })));
  if (def.type === 'radial') {
    const cx = on.x + num(def.cx, 0.5) * on.w;
    const cy = on.y + num(def.cy, 0.5) * on.h;
    return {
      type: 'radial', edge: 0, angle: 90,
      centerX: r3(((cx - layer.x) / layer.w) * 100), centerY: r3(((cy - layer.y) / layer.h) * 100),
      radiusX: r3(((num(def.r, 0.5) * on.w) / layer.w) * 100), radiusY: r3(((num(def.r, 0.5) * on.h) / layer.h) * 100),
      stops: placed((offset) => offset * 100),
    };
  }
  const x1 = num(def.x1, 0); const y1 = num(def.y1, 0);
  const dx = num(def.x2, 1) - x1; const dy = num(def.y2, 0) - y1;
  const l2 = dx * dx + dy * dy || 1;
  const valueAt = ([x, y]) => (((x - on.x) / on.w - x1) * dx + ((y - on.y) / on.h - y1) * dy) / l2;
  const gx = dx / (on.w * l2);
  const gy = dy / (on.h * l2);
  const theta = Math.atan2(gx, -gy);
  const dir = [Math.sin(theta), -Math.cos(theta)];
  const length = Math.abs(layer.w * dir[0]) + Math.abs(layer.h * dir[1]);
  const centre = [layer.x + layer.w / 2, layer.y + layer.h / 2];
  const t0 = valueAt([centre[0] - (dir[0] * length) / 2, centre[1] - (dir[1] * length) / 2]);
  const t1 = valueAt([centre[0] + (dir[0] * length) / 2, centre[1] + (dir[1] * length) / 2]);
  const span = t1 - t0 || 1;
  return {
    type: 'linear', edge: 0, angle: r3((theta * 180) / Math.PI), centerX: 50, centerY: 50, radiusX: 50, radiusY: 50,
    stops: placed((offset) => ((offset - t0) / span) * 100),
  };
}

/**
 * The layers that draw `resolved`'s form, or null when it names none drawn here. `drag` is the
 * knob's drag as its parts would give it (knobLayers' `behavior`): the panel turns a knob in a form
 * as it turns the same knob in parts. Returns knobLayers' shape: `{ parts, bindings, partNames,
 * behavior, handles }`.
 */
export function knobFormDrawingLayers({ resolved, styled = resolved, rect: box, channel, prefix, zIndex, uniqueName, drag = null }) {
  const core = resolved?._children?.Core ?? {};
  const styledCore = styled?._children?.Core ?? core;
  const form = String(core.controlForm ?? '');
  const direction = form.startsWith('new-') ? PHYSICAL_DIRECTIONS.find((entry) => `new-${entry.id}` === form) : null;
  const draw = DRAWINGS[form] ?? (direction ? (c) => synthItems(direction, c) : null);
  if (!draw) return null;
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  const origin = { x: box.x, y: box.y };
  const source = `channel.${channel}.normalized`;

  // The frame fitted to the box as the SVG fits its viewBox (xMidYMid meet); the form's Size scales
  // the drawing about the knob's centre, not its readout.
  const s = Math.min(width / 160, height / 170);
  const ox = (width - 160 * s) / 2;
  const oy = (height - 170 * s) / 2;
  const size = clamp(num(core.formSize, 100) / 100, 0.6, 1.15);
  const depth = clamp(num(core.formDepth, 60) / 100, 0, 1);
  const detail = clamp(Math.round(num(core.formDivisions, 0) || 12), 4, 48);
  const at = ([x, y], scaled) => {
    const k = scaled ? size : 1;
    return [ox + s * (80 + k * (x - 80)), oy + s * (76 + k * (y - 76))];
  };

  // The five colours as ControlAnatomy reads them; a role kept as the role where it reads one.
  const colour = (key, fallback) => {
    const shown = literal(core[key]);
    if (!shown) return fallback;
    return ROLE.test(String(styledCore[key] ?? '').trim()) ? String(styledCore[key]).trim() : shown;
  };
  const shownLiteral = (key, fallback) => literal(core[key]) ?? fallback;
  const ink = colour('formInkColour', 'FF20282C');
  const c = {
    detail,
    face: colour('formFaceColour', 'FFDEDBD2'),
    housing: colour('formHousingColour', 'FF171A20'),
    ink,
    legend: literal(core.formLabelColour) ? colour('formLabelColour', ink) : ink,
    accent: colour('formAccentColour', 'FF40BCCC'),
    showValue: core.formShowValue !== false,
    family: String(resolved?._children?.Text?._children?.Font?.family ?? '').trim() || 'sans-serif',
    min: resolved?._children?.Behavior?.min ?? 0,
    max: resolved?._children?.Behavior?.max ?? 1,
  };
  const faceLiteral = shownLiteral('formFaceColour', 'FFDEDBD2');
  const housingLiteral = shownLiteral('formHousingColour', 'FF171A20');
  c.literals = { face: faceLiteral, housing: housingLiteral, ink: shownLiteral('formInkColour', 'FF20282C'), accent: shownLiteral('formAccentColour', 'FF40BCCC') };
  c.literals.legend = literal(core.formLabelColour) ?? c.literals.ink;
  c.depthShare = depth;
  // The drawing's dome (radial, lit from the upper left) and brushed metal (top to bottom), over
  // the shape's own box: SVG's objectBoundingBox, the gradient's own percentages.
  c.dome = {
    type: 'radial', centerX: 32, centerY: 25, radiusX: 80, radiusY: 80, edge: 0, angle: 90,
    stops: svgStops([[0, 'FFFFFF', 0.85 * depth], [45, faceLiteral.slice(2), 1], [100, '000000', 0.6 * depth]]),
  };
  c.metal = {
    type: 'linear', angle: 180, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, edge: 0,
    stops: svgStops([[0, 'FFFFFF', 0.8 * depth], [42, faceLiteral.slice(2), 1], [55, faceLiteral.slice(2), 1], [100, '000000', 0.65 * depth]]),
  };
  // The readout under the knob, outside the group the Size scales.
  c.readout = c.showValue ? { name: 'readout', text: true, readout: true, x: 80, y: 164, size: 12, colour: c.legend, family: 'monospace', out: true } : null;

  const out = { parts: [], bindings: {}, partNames: {}, behavior: drag ? { ...drag } : { geometry: 'circular', dragMode: 'circular', startAngle: -135, sweepAngle: 270, direction: 'cw', centerX: 50, centerY: 50 }, handles: [{ role: 'current', channel, pointer: 'pointerCurrent', label: 'labelCurrent' }] };
  let depthIndex = zIndex;
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const pxBox = (b) => ({
    x: r3(origin.x + b.x), y: r3(origin.y + b.y), width: r3(Math.max(0.5, b.width)), height: r3(Math.max(0.5, b.height)),
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', align: 'left', rotation: 0,
  });
  const pivotIn = (b, p) => ({ pivotX: r3(((p[0] - b.x) / b.width) * 100), pivotY: r3(((p[1] - b.y) / b.height) * 100) });

  const shapeLayer = (item) => {
    const scaled = !item.out;
    const k = s * (scaled ? size : 1);
    // Each subpath in the box's pixels: a polygon's points, a circle's centre and radius.
    const subpaths = item.shape.map((sub) => {
      if (Array.isArray(sub)) return { pts: sub.map((p) => at(p, scaled)) };
      if (sub.ellipse) return { ellipse: [...at([sub.ellipse[0], sub.ellipse[1]], scaled), sub.ellipse[2] * k, sub.ellipse[3] * k] };
      return { ellipse: [...at([sub.circle[0], sub.circle[1]], scaled), sub.circle[2] * k, sub.circle[2] * k] };
    });
    const xs = [];
    const ys = [];
    for (const sub of subpaths) {
      if (sub.pts) for (const [x, y] of sub.pts) { xs.push(x); ys.push(y); }
      else { const [cx, cy, rx, ry] = sub.ellipse; xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry); }
    }
    const b = { x: Math.min(...xs), y: Math.min(...ys) };
    b.width = Math.max(0.001, Math.max(...xs) - b.x);
    b.height = Math.max(0.001, Math.max(...ys) - b.y);
    const ux = (x) => r3((x - b.x) / b.width);
    const uy = (y) => r3((y - b.y) / b.height);
    const pathData = subpaths.map((sub) => {
      if (sub.pts) return `${sub.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${ux(x)} ${uy(y)}`).join(' ')} Z`;
      const [cx, cy, ex, ey] = sub.ellipse;
      const rx = r3(ex / b.width);
      const ry = r3(ey / b.height);
      return `M${ux(cx - ex)} ${uy(cy)} A${rx} ${ry} 0 1 0 ${ux(cx + ex)} ${uy(cy)} A${rx} ${ry} 0 1 0 ${ux(cx - ex)} ${uy(cy)} Z`;
    }).join(' ');
    // A drawing's gradient, on the box SVG measured it on (the shape's own), redrawn on this layer's.
    let gradient = item.gradient ?? null;
    if (item.svgGradient) {
      const g = item.svgGradient.box;
      const [gx, gy] = at([g.x, g.y], scaled);
      gradient = layerGradient(item.svgGradient.def, { x: gx, y: gy, w: Math.max(0.001, g.w * k), h: Math.max(0.001, g.h * k) }, { x: b.x, y: b.y, w: b.width, h: b.height }, (token) => gradientColour(token, c));
    }
    const layout = pxBox(b);
    if (item.turn) Object.assign(layout, pivotIn(b, at(item.turn, scaled)));
    const layer = createPartNode(named(item.name), {
      role: item.turn || item.moveX || item.moveY || item.lit != null ? 'indicator' : 'custom',
      kind: 'path', zIndex: depthIndex, opacity: num(item.opacity, 1),
      layout, meta: { pathData, closed: true },
      sections: { Background: background(item.colour ?? null, gradient) },
    });
    // A blur: a drop shadow's or a glow's, in the drawing's units.
    if (item.blur) {
      const effects = deepClone(SECTION_DEFAULTS.Effects);
      effects._children.Shadows.items = [];
      effects._children.Filters.blur = r3(item.blur * k);
      layer._children.Effects = effects;
    }
    if (item.turn) out.bindings[`${layer.name}Turn`] = rangeBinding(`${layer.name}Turn`, source, `Parts.${layer.name}.Layout.rotation`, -135, 135);
    if (item.moveX) out.bindings[`${layer.name}MoveX`] = rangeBinding(`${layer.name}MoveX`, source, `Parts.${layer.name}.Layout.offsetX`, 0, item.moveX * k);
    if (item.moveY) out.bindings[`${layer.name}MoveY`] = rangeBinding(`${layer.name}MoveY`, source, `Parts.${layer.name}.Layout.offsetY`, 0, item.moveY * k);
    if (item.wrapY) {
      // Back to the top at the very end of the travel, on top of the move.
      out.bindings[`${layer.name}Wrap`] = { ...rangeBinding(`${layer.name}Wrap`, source, `Parts.${layer.name}.Layout.offsetY`, 0, item.wrapY * k, 0.9995, 1), add: true };
    }
    if (item.lit != null) {
      layer.opacity = 0;
      out.bindings[`${layer.name}Lit`] = rangeBinding(`${layer.name}Lit`, source, `Parts.${layer.name}.opacity`, 0, num(item.opacity, 1), item.lit - 0.0005, item.lit);
    }
    return layer;
  };

  const arcLayer = (item) => {
    const k = s * size;
    const radius = item.arc.radius * k;
    const thickness = Math.max(1, item.arc.thickness * k);
    const centre = at(AROUND, true);
    const extent = 2 * radius + thickness;
    const b = { x: centre[0] - extent / 2, y: centre[1] - extent / 2, width: extent, height: extent };
    const layer = createPartNode(named(item.name), {
      role: item.arc.follows ? 'indicator' : 'track', kind: 'arcTrack', zIndex: depthIndex, opacity: num(item.opacity, 1), layout: pxBox(b),
      meta: { arcTrack: { startAngle: item.arc.start, sweepAngle: item.arc.sweep, direction: 'cw', thickness: r3(thickness), cap: 'butt', colour: item.colour } },
      sections: { Background: background('00000000', null) },
    });
    if (item.arc.follows) out.bindings[`${layer.name}Sweep`] = rangeBinding(`${layer.name}Sweep`, source, `Parts.${layer.name}.meta.arcTrack.sweepAngle`, 0, item.arc.follows);
    return layer;
  };

  const textLayer = (item) => {
    const scaled = !item.out;
    const k = s * (scaled ? size : 1);
    const [x, y] = at([item.x, item.y], scaled);
    const fontSize = item.size * k;
    const text = deepClone(SECTION_DEFAULTS.Text);
    text.content = item.readout ? '' : String(item.text);
    text._children.Fill.colour = item.colour;
    text._children.Font.size = r3(fontSize);
    text._children.Font.weightValue = 400;
    text._children.Font.weight = 'Regular';
    text._children.Font.family = item.family || c.family || 'sans-serif';
    const anchor = item.anchor ?? 'middle';
    text._children.Position.justification = anchor === 'start' ? 'left' : (anchor === 'end' ? 'right' : 'centred');
    // A baseline at y: the glyphs' middle about a third of the size above it.
    const middle = y - fontSize * 0.36;
    const span = Math.max(fontSize * 6, width);
    const b = anchor === 'start' ? { x: x - 8, y: middle - fontSize, width: span, height: fontSize * 2 }
      : anchor === 'end' ? { x: x - span + 8, y: middle - fontSize, width: span, height: fontSize * 2 }
        : { x: x - span / 2, y: middle - fontSize, width: span, height: fontSize * 2 };
    const layer = createPartNode(named(item.name), { role: 'label', kind: 'rectangle', zIndex: depthIndex, opacity: num(item.opacity, 1), layout: pxBox(b), sections: { Text: text } });
    if (item.readout) {
      out.bindings[`${layer.name}Text`] = { _type: 'Binding', name: `${layer.name}Text`, enabled: true, source: `channel.${channel}.display`, mapMode: 'direct', target: `Parts.${layer.name}.Text.content` };
      out.partNames.labelValue = [...(out.partNames.labelValue ?? []), layer.name];
    }
    return layer;
  };

  for (const item of draw(c)) {
    if (!item) continue;
    const layer = item.text ? textLayer(item) : item.arc ? arcLayer(item) : shapeLayer(item);
    out.parts.push(layer);
    depthIndex += 1;
  }
  return out;
}
