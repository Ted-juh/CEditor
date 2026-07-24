// Envelope / curve editor — pure math for a draggable multi-point breakpoint
// editor over a 2D area with per-segment curve shapes. One engine, many presets
// (ADSR / AR / AD / DAHDSR / MSEG / free). Points are normalized (x,y ∈ [0,1]);
// x is time/input (left→right), y is level/output (0 bottom → 1 top). Each point
// carries the curve shape of the segment ENDING at it. No DOM/store deps, so the
// renderer (draw), the hit-test (preview drag) and tests all share it.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function envelopeConfig(control) {
  return control?._children?.Envelope ?? {};
}

// The point list, normalized + sorted by x (defensive; the model keeps them ordered).
export function envelopePoints(control) {
  const pts = envelopeConfig(control).points;
  return normalizePoints(Array.isArray(pts) ? pts : []);
}

export function normalizePoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((p, i) => ({
      id: p?.id ?? `p${i}`,
      x: clamp01(num(p?.x, 0)),
      y: clamp01(num(p?.y, 0)),
      curve: String(p?.curve ?? 'linear'),
      tension: num(p?.tension, 0),
    }))
    .sort((a, b) => a.x - b.x);
}

// Inner drawing rect (px) inside the control, honoring padding.
export function envelopeGeometry(width, height, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  return { x0: p, y0: p, w, h };
}

// Normalized point → pixel (y is flipped: y=1 is the top).
export function envToPx(pt, geom) {
  return {
    px: geom.x0 + clamp01(num(pt?.x, 0)) * geom.w,
    py: geom.y0 + (1 - clamp01(num(pt?.y, 0))) * geom.h,
  };
}
// Pixel → normalized point (clamped 0..1).
export function envFromPx(px, py, geom) {
  return {
    x: clamp01((num(px, 0) - geom.x0) / geom.w),
    y: clamp01(1 - (num(py, 0) - geom.y0) / geom.h),
  };
}

// Ease t∈[0,1] by the segment's curve shape (warps how y moves across the
// segment). exp = slow→fast (convex), log = fast→slow (concave), scurve = eased
// both ends. `tension` (≥0) sharpens exp/log.
export function envWarp(t, curve, tension = 0) {
  const tt = clamp01(num(t, 0));
  const k = 1 + Math.max(0, num(tension, 0) || 1.6);
  switch (String(curve)) {
    case 'exp': return Math.pow(tt, k);
    case 'log': return 1 - Math.pow(1 - tt, k);
    case 'scurve': return tt * tt * (3 - 2 * tt);
    case 'hold': return tt >= 1 ? 1 : 0; // step at the end
    default: return tt; // linear
  }
}

// Sample the segment from p0→p1 into `steps` normalized {x,y} points (inclusive
// of p1). The curve/tension come from p1 (the segment ending at it).
export function envSegmentSample(p0, p1, steps = 16) {
  const n = Math.max(1, Math.round(num(steps, 16)));
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const w = envWarp(t, p1?.curve, p1?.tension);
    out.push({ x: num(p0.x, 0) + (num(p1.x, 0) - num(p0.x, 0)) * t, y: num(p0.y, 0) + (num(p1.y, 0) - num(p0.y, 0)) * w });
  }
  return out;
}

// SVG path string tracing the whole curve in pixel space.
export function envPath(points, geom, stepsPerSeg = 16) {
  const pts = normalizePoints(points);
  if (!pts.length) return '';
  const start = envToPx(pts[0], geom);
  let d = `M ${start.px.toFixed(2)} ${start.py.toFixed(2)}`;
  for (let i = 1; i < pts.length; i += 1) {
    for (const s of envSegmentSample(pts[i - 1], pts[i], stepsPerSeg)) {
      const q = envToPx(s, geom);
      d += ` L ${q.px.toFixed(2)} ${q.py.toFixed(2)}`;
    }
  }
  return d;
}

// Closed path from the curve down to the baseline (for the fill under the curve).
export function envFillPath(points, geom, stepsPerSeg = 16) {
  const pts = normalizePoints(points);
  if (pts.length < 2) return '';
  const line = envPath(pts, geom, stepsPerSeg);
  const last = envToPx(pts[pts.length - 1], geom);
  const first = envToPx(pts[0], geom);
  const base = geom.y0 + geom.h;
  return `${line} L ${last.px.toFixed(2)} ${base.toFixed(2)} L ${first.px.toFixed(2)} ${base.toFixed(2)} Z`;
}

// The index of the node within `radius` px of a point (nearest wins), or -1.
export function envHitNode(points, geom, px, py, radius = 10) {
  const pts = normalizePoints(points);
  let best = -1; let bestD = num(radius, 10) ** 2;
  for (let i = 0; i < pts.length; i += 1) {
    const q = envToPx(pts[i], geom);
    const d = (q.px - px) ** 2 + (q.py - py) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

// Move node `index` to normalized (x,y) with constraints: x stays between its
// neighbors; ends keep their x (0 / 1) unless lockEndsX is false; y clamps 0..1
// (or to 0 when the point is y-locked, e.g. an envelope start/end). Returns a
// new points array.
export function envDragNode(points, index, x, y, opts = {}) {
  const pts = normalizePoints(points).map((p) => ({ ...p }));
  if (index < 0 || index >= pts.length) return pts;
  const lockEndsX = opts.lockEndsX !== false;
  const isFirst = index === 0;
  const isLast = index === pts.length - 1;
  const lockedY = Array.isArray(opts.lockYIndices) && opts.lockYIndices.includes(index);

  let nx = clamp01(num(x, 0));
  if (lockEndsX && isFirst) nx = 0;
  else if (lockEndsX && isLast) nx = 1;
  else {
    const lo = pts[index - 1] ? pts[index - 1].x : 0;
    const hi = pts[index + 1] ? pts[index + 1].x : 1;
    nx = Math.max(lo, Math.min(hi, nx));
  }
  pts[index].x = nx;
  pts[index].y = lockedY ? pts[index].y : clamp01(num(y, 0));
  return pts;
}

// Insert a new point at normalized (x,y), keeping the list x-sorted. Inherits the
// curve of the segment it splits. Returns { points, index }.
export function envAddNode(points, x, y, curve) {
  const pts = normalizePoints(points).map((p) => ({ ...p }));
  const nx = clamp01(num(x, 0));
  let at = pts.findIndex((p) => p.x > nx);
  if (at < 0) at = pts.length;
  const inherit = curve ?? pts[at]?.curve ?? pts[at - 1]?.curve ?? 'linear';
  pts.splice(at, 0, { id: `p${Date.now()}_${at}`, x: nx, y: clamp01(num(y, 0)), curve: String(inherit), tension: 0 });
  return { points: pts, index: at };
}

// Remove a point (never the two endpoints — an envelope needs a start and end).
export function envRemoveNode(points, index) {
  const pts = normalizePoints(points).map((p) => ({ ...p }));
  if (pts.length <= 2 || index <= 0 || index >= pts.length - 1) return pts;
  pts.splice(index, 1);
  return pts;
}

// The output level at normalized time x (walks segments + applies the curve) —
// what the envelope "reads" at a given phase.
export function envValueAt(points, x) {
  const pts = normalizePoints(points);
  if (!pts.length) return 0;
  const nx = clamp01(num(x, 0));
  if (nx <= pts[0].x) return pts[0].y;
  for (let i = 1; i < pts.length; i += 1) {
    if (nx <= pts[i].x) {
      const span = pts[i].x - pts[i - 1].x;
      const t = span <= 0 ? 1 : (nx - pts[i - 1].x) / span;
      const w = envWarp(t, pts[i].curve, pts[i].tension);
      return pts[i - 1].y + (pts[i].y - pts[i - 1].y) * w;
    }
  }
  return pts[pts.length - 1].y;
}

// Fan-out mapping: derive the ADSR stage values (normalized 0..1) that the
// envelope's `attack`/`decay`/`sustain`/`release` ports emit to device
// parameters. Times are fractions of the total time axis (attack + decay +
// release + any hold = 1); sustain is the sustain node's level. The "peak" is
// the highest point up to (and including) the sustain node.
export function envelopeStageValues(control) {
  const pts = envelopePoints(control);
  if (pts.length < 2) return { attack: 0, decay: 0, sustain: 0, release: 0, peakIndex: 0, sustainIndex: -1 };
  const cfg = envelopeConfig(control);
  const last = pts.length - 1;
  let sustainIndex = Math.round(num(cfg.sustainIndex, -1));
  if (sustainIndex < 0 || sustainIndex > last) sustainIndex = -1;

  // Peak = highest point at/ before the sustain node (else the global max).
  const peakLimit = sustainIndex >= 0 ? sustainIndex : last;
  let peakIndex = 0;
  for (let i = 1; i <= peakLimit; i += 1) { if (pts[i].y > pts[peakIndex].y) peakIndex = i; }

  const startX = pts[0].x;
  const peakX = pts[peakIndex].x;
  const susX = sustainIndex >= 0 ? pts[sustainIndex].x : peakX;
  const endX = pts[last].x;

  return {
    attack: clamp01(peakX - startX),
    decay: clamp01(susX - peakX),
    sustain: clamp01(sustainIndex >= 0 ? pts[sustainIndex].y : pts[peakIndex].y),
    release: clamp01(endX - susX),
    peakIndex,
    sustainIndex,
  };
}

// Preset shapes → { points, sustainIndex, lockYIndices }. Envelope presets lock
// the start (and one-shot end) to y=0 so they always begin/settle at zero.
export function envelopePreset(name) {
  const P = (x, y, curve = 'linear') => ({ x, y, curve });
  switch (String(name)) {
    case 'ar':
      return { points: [P(0, 0), P(0.45, 1, 'exp'), P(1, 0, 'exp')], sustainIndex: -1, lockYIndices: [0, 2] };
    case 'ad':
      return { points: [P(0, 0), P(0.3, 1, 'exp'), P(1, 0, 'log')], sustainIndex: -1, lockYIndices: [0, 2] };
    case 'dahdsr':
      return {
        points: [P(0, 0), P(0.1, 0), P(0.25, 1, 'exp'), P(0.38, 1, 'linear'), P(0.6, 0.6, 'exp'), P(1, 0, 'exp')],
        sustainIndex: 4, lockYIndices: [0, 1, 5],
      };
    case 'mseg':
    case 'free':
      return { points: [P(0, 0), P(0.25, 0.85), P(0.5, 0.35), P(0.75, 0.95), P(1, 0)], sustainIndex: -1, lockYIndices: [] };
    case 'adsr':
    default:
      return { points: [P(0, 0), P(0.25, 1, 'exp'), P(0.5, 0.6, 'exp'), P(1, 0, 'exp')], sustainIndex: 2, lockYIndices: [0, 3] };
  }
}
