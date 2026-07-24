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

// The rest value the ribbon returns to on release, or null when it latches.
export function ribbonReturnTarget(control) {
  const cfg = ribbonConfig(control);
  switch (String(cfg.returnMode ?? 'none')) {
    case 'center': return 0.5;
    case 'min': return 0;
    case 'max': return 1;
    case 'rest': return clamp01(num(cfg.returnValue, 0.5));
    default: return null; // none → latch/hold
  }
}

// One return glide step toward `target` at `rate` (units/sec) over `dtSec`;
// never overshoots. `rate` ≤ 0 snaps instantly. Returns { value, settled }.
export function ribbonGlide(value, target, rate, dtSec) {
  const from = clamp01(num(value, 0));
  const to = clamp01(num(target, 0.5));
  const r = num(rate, 8);
  if (r <= 0) return { value: to, settled: true };
  const step = r * Math.max(0, num(dtSec, 0));
  const d = to - from;
  if (Math.abs(d) <= step) return { value: to, settled: true };
  return { value: from + Math.sign(d) * step, settled: false };
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
