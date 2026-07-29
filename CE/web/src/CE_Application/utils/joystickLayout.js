// Vector Joystick — pure math for an XY pad: a puck at a normalized position
// (x,y ∈ [0,1], y=0 at the BOTTOM) that blends four corner sources by bilinear
// weight and drives X/Y axis ports. Also the spring-return glide step. No
// DOM/store deps — shared by the renderer (draw), the preview surface (drag +
// glide + fan-out) and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

// Which axes spring back. joystickGlide reads exactly these, and so does the editor's picker.
export const JOYSTICK_RETURN_AXES = ['both', 'x', 'y'];

export function joystickConfig(control) {
  return control?._children?.Joystick ?? {};
}

// The rest / current puck position (normalized), from config.
export function joystickPos(control) {
  const cfg = joystickConfig(control);
  return { x: clamp01(num(cfg.x, 0.5)), y: clamp01(num(cfg.y, 0.5)) };
}

// Inner pad rect (px) inside the control, honoring padding.
export function joystickGeometry(width, height, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  return { x0: p, y0: p, w: Math.max(1, num(width, 0) - p * 2), h: Math.max(1, num(height, 0) - p * 2) };
}
// Normalized → pixel (y flipped: y=1 is the top).
export function joyToPx(pos, geom) {
  return { px: geom.x0 + clamp01(num(pos?.x, 0)) * geom.w, py: geom.y0 + (1 - clamp01(num(pos?.y, 0))) * geom.h };
}
// Pixel → normalized (clamped 0..1).
export function joyFromPx(px, py, geom) {
  return { x: clamp01((num(px, 0) - geom.x0) / geom.w), y: clamp01(1 - (num(py, 0) - geom.y0) / geom.h) };
}

// Bilinear corner weights for a position — each 0..1, summing to 1. Corner keys
// are tl / tr / bl / br (top-left, top-right, bottom-left, bottom-right).
export function joystickWeights(x, y) {
  const px = clamp01(num(x, 0));
  const py = clamp01(num(y, 0));
  return {
    bl: (1 - px) * (1 - py),
    br: px * (1 - py),
    tl: (1 - px) * py,
    tr: px * py,
  };
}

// Map a normalized axis value to what its port emits: bipolar (-1..1) or 0..1.
export function joystickAxis(v, bipolar = true) {
  const n = clamp01(num(v, 0));
  return bipolar ? n * 2 - 1 : n;
}

// Every port value for the fan-out: the two axes + the four corner weights.
export function joystickPortValues(control) {
  const cfg = joystickConfig(control);
  const pos = joystickPos(control);
  const bip = cfg.bipolar !== false;
  const w = joystickWeights(pos.x, pos.y);
  return {
    x: joystickAxis(pos.x, bip),
    y: joystickAxis(pos.y, bip),
    cornerTL: w.tl, cornerTR: w.tr, cornerBL: w.bl, cornerBR: w.br,
  };
}

// One spring-return glide step toward `target` at `rate` (normalized units/sec)
// over `dtSec` seconds, on the configured axes. Never overshoots. Returns the
// next {x,y} and whether it has settled (within epsilon of the target).
export function joystickGlide(pos, target, rate, dtSec, axes = 'both') {
  const step = Math.max(0, num(rate, 4)) * Math.max(0, num(dtSec, 0));
  const move = (from, to, active) => {
    if (!active) return from;
    const d = to - from;
    if (Math.abs(d) <= step) return to;
    return from + Math.sign(d) * step;
  };
  const doX = axes === 'both' || axes === 'x';
  const doY = axes === 'both' || axes === 'y';
  const next = {
    x: move(clamp01(num(pos?.x, 0)), clamp01(num(target?.x, 0.5)), doX),
    y: move(clamp01(num(pos?.y, 0)), clamp01(num(target?.y, 0.5)), doY),
  };
  const settled = (!doX || Math.abs(next.x - clamp01(num(target?.x, 0.5))) < 1e-4)
    && (!doY || Math.abs(next.y - clamp01(num(target?.y, 0.5))) < 1e-4);
  return { pos: next, settled };
}

// The corner display labels [TL, TR, BL, BR] (defaults A/B/C/D).
export function joystickCornerLabels(control) {
  const c = joystickConfig(control).cornerLabels;
  const def = ['A', 'B', 'C', 'D'];
  return def.map((d, i) => String((Array.isArray(c) ? c[i] : undefined) ?? d));
}
