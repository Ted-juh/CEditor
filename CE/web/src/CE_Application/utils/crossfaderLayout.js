// Crossfader — pure math for a 1-D A/B blend: a handle at a normalized mix
// (0 = full A, 1 = full B) that resolves per-side gains under a curve law, with
// a centre detent, geometry for the track/handle, and a return glide. No
// DOM/store deps — shared by the renderer, the preview surface (drag + detent +
// return + fan-out) and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function crossfaderConfig(control) {
  return control?._children?.Crossfader ?? {};
}
export function crossfaderMix(control) {
  return clamp01(num(crossfaderConfig(control).mix, 0.5));
}
export function crossfaderVertical(control) {
  return String(crossfaderConfig(control).orientation) === 'vertical';
}

// Per-side gains (0..1) for a mix under the curve law:
//  - linear:      A = 1−m, B = m         (sums to 1; −6 dB at centre)
//  - equalPower:  A = cos, B = sin        (constant power; −3 dB at centre)
//  - sharp:       A = min(1, 2(1−m)), B = min(1, 2m)  (full either side, cut only near the far end)
export function crossfaderGains(mix, law = 'equalPower') {
  const m = clamp01(num(mix, 0.5));
  switch (String(law)) {
    case 'linear': return { a: 1 - m, b: m };
    case 'sharp': return { a: Math.min(1, 2 * (1 - m)), b: Math.min(1, 2 * m) };
    case 'equalPower':
    default: return { a: Math.cos(m * Math.PI / 2), b: Math.sin(m * Math.PI / 2) };
  }
}

// Snap toward the centre when within `threshold` of 0.5 (0 disables the detent).
export function crossfaderDetent(mix, threshold = 0) {
  const t = Math.max(0, num(threshold, 0));
  const m = clamp01(num(mix, 0.5));
  return t > 0 && Math.abs(m - 0.5) <= t ? 0.5 : m;
}

// Track geometry (px): the groove the handle travels along, inset by padding.
export function crossfaderGeometry(width, height, control, pad = 10) {
  const p = Math.max(0, num(pad, 10));
  const vertical = crossfaderVertical(control);
  if (vertical) {
    return { vertical: true, x0: p, y0: p, w: Math.max(1, num(width, 0) - p * 2), h: Math.max(1, num(height, 0) - p * 2) };
  }
  return { vertical: false, x0: p, y0: p, w: Math.max(1, num(width, 0) - p * 2), h: Math.max(1, num(height, 0) - p * 2) };
}
// Handle-centre position (px) along the track for a mix. Horizontal: left = A
// (mix 0). Vertical: bottom = A (mix 0).
export function crossfaderHandlePos(mix, geom) {
  const m = clamp01(num(mix, 0.5));
  if (geom.vertical) return { px: geom.x0 + geom.w / 2, py: geom.y0 + (1 - m) * geom.h };
  return { px: geom.x0 + m * geom.w, py: geom.y0 + geom.h / 2 };
}
// Pointer px → mix (0..1) along the track.
export function crossfaderMixFromPx(px, py, geom) {
  if (geom.vertical) return clamp01(1 - (num(py, 0) - geom.y0) / geom.h);
  return clamp01((num(px, 0) - geom.x0) / geom.w);
}

// The port values for the fan-out: the two gains + the raw mix (bipolar −1..1
// or 0..1). A → gain of source A, B → gain of source B, Mix → the position.
export function crossfaderPortValues(control) {
  const cfg = crossfaderConfig(control);
  const m = crossfaderMix(control);
  const { a, b } = crossfaderGains(m, cfg.law);
  const mix = cfg.bipolar === true ? m * 2 - 1 : m;
  return { a, b, mix };
}

// One return glide step toward `target` mix at `rate` (units/sec) over `dtSec`;
// never overshoots. Returns { mix, settled }.
export function crossfaderGlide(mix, target, rate, dtSec) {
  const step = Math.max(0, num(rate, 4)) * Math.max(0, num(dtSec, 0));
  const from = clamp01(num(mix, 0.5));
  const to = clamp01(num(target, 0.5));
  const d = to - from;
  if (Math.abs(d) <= step) return { mix: to, settled: true };
  return { mix: from + Math.sign(d) * step, settled: false };
}
