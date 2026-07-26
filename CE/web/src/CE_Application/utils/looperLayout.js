// Gesture Looper — record your own control motion as a loopable clip that
// replays into a device parameter on the clock. Where the Orbit is geometric
// motion, this is HUMAN motion: you press-and-move inside a lane, it captures
// (phase, value) samples, and on the clock it plays them back around the loop.
// Each lane is a bindable port (the fan-out). Pure math: normalized time
// (phase ∈ [0,1] across one loop) and value (v ∈ [0,1]); shared by the renderer,
// the preview surface, componentPorts and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function wrap01(n) { return ((num(n, 0) % 1) + 1) % 1; }

export function looperConfig(control) {
  return control?._children?.Looper ?? {};
}
// Global loop phase 0..1 (the clock, injected as __phase in preview; else static).
export function looperPhase(control) {
  const cfg = looperConfig(control);
  return wrap01(cfg.__phase !== undefined ? cfg.__phase : cfg.phase);
}

// Normalized lanes. Each lane records value-over-loop as sorted (t,v) points.
export function looperLanes(control) {
  const raw = looperConfig(control).lanes;
  return (Array.isArray(raw) ? raw : []).map((l, i) => ({
    id: l?.id ?? `l${i}`,
    label: String(l?.label ?? `Lane ${i + 1}`),
    points: normalizeGesture(l?.points),
    rest: clamp01(num(l?.rest, 0)),
    enabled: l?.enabled !== false,
    colour: String(l?.colour ?? ''),
  }));
}

// Clean a gesture: keep finite {t,v}, clamp, sort by t.
export function normalizeGesture(points) {
  return (Array.isArray(points) ? points : [])
    .map((p) => ({ t: clamp01(num(p?.t, 0)), v: clamp01(num(p?.v, 0)) }))
    .sort((a, b) => a.t - b.t);
}

// The looped value at a phase, wrapping across the loop seam. Empty → rest.
export function laneValueAt(points, phase, rest = 0) {
  const pts = normalizeGesture(points);
  if (!pts.length) return clamp01(num(rest, 0));
  if (pts.length === 1) return pts[0].v;
  const p = wrap01(phase);
  // Inside the recorded span.
  for (let i = 1; i < pts.length; i += 1) {
    if (p >= pts[i - 1].t && p <= pts[i].t) {
      const span = pts[i].t - pts[i - 1].t;
      const f = span <= 0 ? 0 : (p - pts[i - 1].t) / span;
      return pts[i - 1].v + (pts[i].v - pts[i - 1].v) * f;
    }
  }
  // Outside [first.t, last.t]: wrap between last and first across the seam.
  const last = pts[pts.length - 1];
  const first = pts[0];
  const seam = (first.t + 1) - last.t;               // gap through phase 1→0
  if (seam <= 0) return first.v;
  const d = p >= last.t ? p - last.t : (p + 1) - last.t;
  const f = d / seam;
  return last.v + (first.v - last.v) * f;
}

// Append a recorded sample; drop near-duplicate timestamps to keep it lean.
export function recordAppend(points, t, v, minDt = 0.004) {
  const pts = Array.isArray(points) ? points.slice() : [];
  const nt = clamp01(num(t, 0));
  const nv = clamp01(num(v, 0));
  const prev = pts[pts.length - 1];
  if (prev && Math.abs(prev.t - nt) < num(minDt, 0.004)) { prev.v = nv; return pts; }
  pts.push({ t: nt, v: nv });
  return pts;
}

// --- Geometry: a stack of lane rows inside the control -----------------------
export function looperGeometry(width, height, laneCount, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  const n = Math.max(1, Math.round(num(laneCount, 1)));
  const gap = n > 1 ? 6 : 0;
  const laneH = Math.max(1, (h - gap * (n - 1)) / n);
  return { x0: p, y0: p, w, h, laneH, gap, count: n };
}
export function laneRect(geom, i) {
  return { x: geom.x0, y: geom.y0 + i * (geom.laneH + geom.gap), w: geom.w, h: geom.laneH };
}
// (t,v) → px within a lane rect (v flipped: v=1 top).
export function laneToPx(rect, t, v) {
  return { px: rect.x + clamp01(num(t, 0)) * rect.w, py: rect.y + (1 - clamp01(num(v, 0))) * rect.h };
}
// px → { t, v } within a lane rect.
export function pxToLane(rect, px, py) {
  return {
    t: clamp01((num(px, 0) - rect.x) / Math.max(1, rect.w)),
    v: clamp01(1 - (num(py, 0) - rect.y) / Math.max(1, rect.h)),
  };
}
// Which lane row contains a y (or -1).
export function laneAtPoint(geom, py, count) {
  const n = Math.max(1, Math.round(num(count, geom.count)));
  for (let i = 0; i < n; i += 1) {
    const r = laneRect(geom, i);
    if (py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

// --- Dynamic per-lane ports (fan-out) ---------------------------------------
export function looperLanePortId(i) { return `lane_${i}`; }
export function parseLooperLanePort(id) {
  const m = String(id ?? '').match(/^lane_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function looperPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return looperLanes(control).map((l, i) => ({
    id: looperLanePortId(i), label: l.label || `Lane ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
// Fan-out values at the current phase: { lane_i: value } (disabled → rest).
export function looperPortValues(control) {
  const phase = looperPhase(control);
  const out = {};
  looperLanes(control).forEach((l, i) => {
    out[looperLanePortId(i)] = l.enabled ? laneValueAt(l.points, phase, l.rest) : l.rest;
  });
  return out;
}

// The loop length in seconds (used by the preview clock; guarded ≥ 0.05s).
export function looperLoopSeconds(control) {
  return Math.max(0.05, num(looperConfig(control).loopSeconds, 4));
}

// Tempo sync. A gesture take is a LOOP, so its musical unit is bars, not a note
// division — you record a shape over two bars and want it back over two bars.
// The phase comes from the transport's position, so the loop point is the bar
// line rather than "wherever it happened to be when you hit record".
export function looperSynced(control) { return looperConfig(control).syncToTransport === true; }
export function looperLoopBars(control) {
  return clampBars(looperConfig(control).loopBars ?? 2);
}
function clampBars(v) {
  const n = num(v, 2);
  return n < 0.25 ? 0.25 : n > 64 ? 64 : n;
}
// The vertical grid inside a lane, as fractions 0..1 of the loop. Free-running
// there's nothing musical to mark, so it stays at quarters. Synced, the lines
// mean something: bar lines (major) and beat lines (minor), which is what makes
// a two-bar take readable as two bars.
export function looperGridLines(control, beatsPerBar = 4) {
  if (!looperSynced(control)) return [{ t: 0.25 }, { t: 0.5 }, { t: 0.75 }].map((g) => ({ ...g, major: false }));
  const perBar = Math.max(1, Math.round(num(beatsPerBar, 4)));
  const bars = looperLoopBars(control);
  const beats = Math.round(bars * perBar);
  if (beats < 2 || beats > 64) return [{ t: 0.5, major: false }];
  const out = [];
  for (let i = 1; i < beats; i += 1) out.push({ t: i / beats, major: i % perBar === 0 });
  return out;
}

// Loop length in seconds at a tempo — for the readout and for anything that
// still needs a duration (the recording resampler does).
export function looperLoopSecondsAt(control, bpm, beatsPerBar = 4) {
  const b = num(bpm, 120);
  if (!looperSynced(control) || !(b > 0)) return looperLoopSeconds(control);
  return looperLoopBars(control) * Math.max(1, num(beatsPerBar, 4)) * (60 / b);
}
