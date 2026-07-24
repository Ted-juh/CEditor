// Orbit Modulator — a spatial poly-LFO. Satellites sit at a radius + angle in a
// circular field and orbit the centre at their own rate; each emits a live 0..1
// modulation value derived from its position (a bindable port — the fan-out).
// It's a modulation SOURCE that animates itself, so `phase` (0..1, looping) is
// the clock — driven by a rAF ticker in preview and injected as `Orbit.__phase`.
// Pure math, no DOM/store deps; shared by the renderer, the preview surface,
// componentPorts and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
const TAU = Math.PI * 2;

export function orbitConfig(control) {
  return control?._children?.Orbit ?? {};
}
export function orbitPhase(control) {
  const cfg = orbitConfig(control);
  const p = num(cfg.__phase !== undefined ? cfg.__phase : cfg.phase, 0);
  return ((p % 1) + 1) % 1; // wrap 0..1
}

// Normalized satellites.
export function orbitNodes(control) {
  const raw = orbitConfig(control).nodes;
  return (Array.isArray(raw) ? raw : []).map((s, i) => ({
    id: s?.id ?? `o${i}`,
    label: String(s?.label ?? `Node ${i + 1}`),
    radius: clamp01(num(s?.radius, 0.6)),
    angle: num(s?.angle, 0),                 // base angle (deg), math sense (0 = east, CCW+)
    ratio: num(s?.ratio, 1),                 // orbits per global cycle (± = direction)
    output: String(s?.output ?? 'y'),        // y | x | sine | radius
    depth: clamp01(num(s?.depth, 1)),
    invert: s?.invert === true,
    enabled: s?.enabled !== false,
    colour: String(s?.colour ?? ''),
  }));
}

// A satellite's live angle (deg) at a global phase.
export function nodeAngle(node, phase) {
  return num(node?.angle, 0) + num(node?.ratio, 1) * clamp01(num(phase, 0)) * 360;
}
// Live position in math coords, normalized to [-1,1] (y up).
export function nodePos(node, phase) {
  const r = clamp01(num(node?.radius, 0.6));
  const a = nodeAngle(node, phase) * Math.PI / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

// Field geometry (px): centre + max orbit radius.
export function orbitGeometry(width, height, pad = 10) {
  const p = Math.max(0, num(pad, 10));
  const w = Math.max(1, num(width, 0));
  const h = Math.max(1, num(height, 0));
  return { cx: w / 2, cy: h / 2, maxR: Math.max(2, Math.min(w, h) / 2 - p) };
}
// Satellite pixel position (SVG coords: y down, so math-y is flipped).
export function nodeToPx(node, phase, geom) {
  const p = nodePos(node, phase);
  return { px: geom.cx + p.x * geom.maxR, py: geom.cy - p.y * geom.maxR };
}
// A pixel point → { radius (0..1), angle (deg, math) } for dragging a satellite.
export function pxToOrbit(px, py, geom) {
  const dx = (num(px, 0) - geom.cx) / geom.maxR;
  const dy = -(num(py, 0) - geom.cy) / geom.maxR; // flip to math-y
  const radius = clamp01(Math.hypot(dx, dy));
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  return { radius, angle };
}

// The satellite's raw projection 0..1 for its output mode at a phase.
export function nodeProjection(node, phase) {
  const p = nodePos(node, phase);
  switch (String(node?.output)) {
    case 'x': return clamp01((p.x + 1) / 2);
    case 'radius': return clamp01(num(node?.radius, 0.6));
    case 'sine': return clamp01((Math.sin(nodeAngle(node, phase) * Math.PI / 180) + 1) / 2);
    case 'y':
    default: return clamp01((p.y + 1) / 2);
  }
}
// The emitted value (projection, optionally inverted, scaled by depth).
export function nodeOutput(node, phase) {
  const proj = nodeProjection(node, phase);
  return clamp01(num(node?.depth, 1) * (node?.invert === true ? 1 - proj : proj));
}

// --- Dynamic per-satellite ports (fan-out) ---------------------------------
export function orbitNodePortId(i) { return `node_${i}`; }
export function parseOrbitNodePort(id) {
  const m = String(id ?? '').match(/^node_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function orbitPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return orbitNodes(control).map((s, i) => ({
    id: orbitNodePortId(i), label: s.label || `Node ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
// Fan-out values at the current phase: { node_i: value } (disabled → 0).
export function orbitPortValues(control) {
  const phase = orbitPhase(control);
  const out = {};
  orbitNodes(control).forEach((s, i) => { out[orbitNodePortId(i)] = s.enabled ? nodeOutput(s, phase) : 0; });
  return out;
}

// Nearest satellite within `radiusPx` of a point (at the given phase), or -1.
export function orbitHitNode(control, phase, geom, px, py, radiusPx = 12) {
  const nodes = orbitNodes(control);
  let best = -1; let bestD = num(radiusPx, 12) ** 2;
  nodes.forEach((s, i) => {
    const q = nodeToPx(s, phase, geom);
    const d = (q.px - px) ** 2 + (q.py - py) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

export const ORBIT_TAU = TAU;
