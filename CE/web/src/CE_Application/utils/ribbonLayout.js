// Ribbon / touch-strip / pitch-mod wheel — pure math for a 1-D absolute-touch
// controller: touch anywhere and the value jumps there, with a configurable
// return-to-rest on release (none / center / min / max / rest). One model, two
// styles (flat strip vs 3-D wheel). No DOM/store deps — shared by the renderer,
// the preview surface (touch drag + return + fan-out) and controlPortValues,
// and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function ribbonConfig(control) {
  return control?._children?.Ribbon ?? {};
}
export function ribbonValue(control) {
  return clamp01(num(ribbonConfig(control).value, 0.5));
}
export function ribbonVertical(control) {
  return String(ribbonConfig(control).orientation ?? 'vertical') === 'vertical';
}

// Snap a value to the config's step (0 = continuous).
export function ribbonSnap(value, control) {
  const step = num(ribbonConfig(control).snap, 0);
  const v = clamp01(num(value, 0));
  return step > 0 ? clamp01(Math.round(v / step) * step) : v;
}

// The strip/wheel travel rect (px), inset by padding.
export function ribbonGeometry(width, height, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  return { x0: p, y0: p, w: Math.max(1, num(width, 0) - p * 2), h: Math.max(1, num(height, 0) - p * 2) };
}
// The indicator position (px along the travel axis) for a value. Vertical:
// value 0 at the BOTTOM. Horizontal: value 0 at the LEFT.
export function ribbonIndicator(value, geom, vertical) {
  const v = clamp01(num(value, 0));
  if (vertical) return { px: geom.x0 + geom.w / 2, py: geom.y0 + (1 - v) * geom.h, axis: geom.y0 + (1 - v) * geom.h };
  return { px: geom.x0 + v * geom.w, py: geom.y0 + geom.h / 2, axis: geom.x0 + v * geom.w };
}
// Pointer px → value (0..1).
export function ribbonValueFromPx(px, py, geom, vertical) {
  if (vertical) return clamp01(1 - (num(py, 0) - geom.y0) / geom.h);
  return clamp01((num(px, 0) - geom.x0) / geom.w);
}

// Where a ribbon springs back to on release. Exported as a table because the script verb
// ce.components.ribbon.returnMode has to offer exactly these and no others — a verb that accepts a
// mode the switch below has no case for writes a setting that silently does nothing.
// The ribbon, the joystick and the crossfader share one spring, so they share its vocabulary.
// Re-exported under the old name because the picker imports it that way, and because a second
// list of the same five strings is a second list that can drift.
export { RETURN_MODES as RIBBON_RETURN_MODES } from './returnToRest.js';

// Realistic-wheel grip ridges: positions (0..1 along the visible face, 0 = top)
// of the grip lines on a cylinder rotated by `value`. Projected so ridges bunch
// toward the ends (foreshortening) and scroll as the value changes — the
// rotating-cylinder illusion. Each ridge also carries a `shade` 0..1 (1 = facing
// the viewer / brightest, 0 = grazing at the edge) for embossed shading.
export function wheelRidges(value, count = 16) {
  const v = clamp01(num(value, 0.5));
  const n = Math.max(2, Math.round(num(count, 16)));
  const phase = v; // one full value sweep scrolls the surface one ridge-set
  const out = [];
  for (let k = 0; k < n; k += 1) {
    let u = (k / n) - phase;          // surface coordinate around the front face
    u = ((u % 1) + 1) % 1;            // wrap 0..1
    const pos = (1 - Math.cos(u * Math.PI)) / 2; // project: bunches near 0 and 1
    const shade = Math.sin(u * Math.PI);          // 1 at centre, →0 at the edges
    out.push({ pos, shade });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

// The port values for the fan-out: the value (bipolar −1..1 or 0..1) and a
// touch gate (1 while held, else 0 — surface injects `__touch`).
export function ribbonPortValues(control) {
  const cfg = ribbonConfig(control);
  const v = clamp01(num(cfg.__value !== undefined ? cfg.__value : cfg.value, 0.5));
  return {
    value: cfg.bipolar === true ? v * 2 - 1 : v,
    touch: cfg.__touch === true ? 1 : 0,
  };
}
