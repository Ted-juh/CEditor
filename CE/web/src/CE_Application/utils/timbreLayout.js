// Timbre Space — control a synth by MEANING, not by parameter. A 2D field whose
// axes are musical intentions (dark↔bright, soft↔aggressive). You drop patch
// "anchors" on the pad, each storing a value per morph target; the puck's
// position blends the anchors by inverse-distance weighting, and every target is
// a bindable port (the fan-out). One gesture sculpts dozens of parameters along
// perceptual directions. Pure math (x,y,values ∈ [0,1]); shared by the renderer,
// the preview surface, componentPorts and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function timbreConfig(control) {
  return control?._children?.Timbre ?? {};
}

// The morph targets (each a bindable "dimension"). id is stable for value lookup.
export function timbreTargets(control) {
  const raw = timbreConfig(control).targets;
  return (Array.isArray(raw) ? raw : []).map((t, i) => ({
    id: String(t?.id ?? `t${i}`),
    label: String(t?.label ?? `Target ${i + 1}`),
    colour: String(t?.colour ?? ''),
  }));
}

// The anchors: named patches at (x,y) storing a value per target id.
export function timbreAnchors(control) {
  const raw = timbreConfig(control).anchors;
  return (Array.isArray(raw) ? raw : []).map((a, i) => ({
    id: String(a?.id ?? `a${i}`),
    label: String(a?.label ?? `Anchor ${i + 1}`),
    x: clamp01(num(a?.x, 0.5)),
    y: clamp01(num(a?.y, 0.5)),
    colour: String(a?.colour ?? ''),
    values: (a && typeof a.values === 'object' && a.values) ? a.values : {},
  }));
}

// The puck position 0..1 (live __x/__y override the stored resting position).
export function timbrePuck(control) {
  const cfg = timbreConfig(control);
  return {
    x: clamp01(num(cfg.__x !== undefined ? cfg.__x : cfg.x, 0.5)),
    y: clamp01(num(cfg.__y !== undefined ? cfg.__y : cfg.y, 0.5)),
  };
}

// Inverse-distance weights for a point over the anchors (normalized to sum 1).
// power=2 → smooth blends; near an anchor its weight → ~1 (that patch wins).
export function anchorWeights(anchors, x, y, power = 2) {
  const list = Array.isArray(anchors) ? anchors : [];
  if (!list.length) return [];
  const eps = 1e-6;
  const px = clamp01(num(x, 0.5));
  const py = clamp01(num(y, 0.5));
  const ws = list.map((a) => {
    const dx = clamp01(num(a?.x, 0.5)) - px;
    const dy = clamp01(num(a?.y, 0.5)) - py;
    const d2 = dx * dx + dy * dy;
    return 1 / (Math.pow(d2, Math.max(0.5, num(power, 2)) / 2) + eps);
  });
  const sum = ws.reduce((s, w) => s + w, 0) || 1;
  return ws.map((w) => w / sum);
}

// Blend one target's value across the weighted anchors (missing value → 0).
export function targetValue(anchors, weights, targetId) {
  const list = Array.isArray(anchors) ? anchors : [];
  let v = 0;
  for (let i = 0; i < list.length; i += 1) {
    v += (weights[i] ?? 0) * clamp01(num(list[i]?.values?.[targetId], 0));
  }
  return clamp01(v);
}

// All target outputs at the current puck: { targetId: value }.
export function timbreOutputs(control) {
  const anchors = timbreAnchors(control);
  const puck = timbrePuck(control);
  const power = num(timbreConfig(control).power, 2);
  const weights = anchorWeights(anchors, puck.x, puck.y, power);
  const out = {};
  for (const t of timbreTargets(control)) out[t.id] = targetValue(anchors, weights, t.id);
  return out;
}

// --- Geometry ----------------------------------------------------------------
export function timbreGeometry(width, height, pad = 10) {
  const p = Math.max(0, num(pad, 10));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  return { x0: p, y0: p, w, h };
}
// Normalized (x,y) → px (y flipped: y=1 is the top).
export function timbreToPx(pt, geom) {
  return { px: geom.x0 + clamp01(num(pt?.x, 0.5)) * geom.w, py: geom.y0 + (1 - clamp01(num(pt?.y, 0.5))) * geom.h };
}
// px → normalized (x,y).
export function timbreFromPx(px, py, geom) {
  return { x: clamp01((num(px, 0) - geom.x0) / Math.max(1, geom.w)), y: clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h)) };
}
// Nearest anchor within radiusPx of a point (for dragging), or -1.
export function timbreHitAnchor(control, geom, px, py, radiusPx = 12) {
  const anchors = timbreAnchors(control);
  let best = -1; let bestD = num(radiusPx, 12) ** 2;
  anchors.forEach((a, i) => {
    const q = timbreToPx(a, geom);
    const d = (q.px - px) ** 2 + (q.py - py) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

// --- Dynamic per-target ports (fan-out) -------------------------------------
export function timbreTargetPortId(i) { return `target_${i}`; }
export function parseTimbreTargetPort(id) {
  const m = String(id ?? '').match(/^target_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function timbrePorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return timbreTargets(control).map((t, i) => ({
    id: timbreTargetPortId(i), label: t.label || `Target ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
// Fan-out values at the current puck: { target_i: value }, keyed by port id.
export function timbrePortValues(control) {
  const outputs = timbreOutputs(control);
  const out = {};
  timbreTargets(control).forEach((t, i) => { out[timbreTargetPortId(i)] = outputs[t.id] ?? 0; });
  return out;
}

// Targets paired with the device parameter their port is bound to (or null).
// Used by capture-from-patch to know which parameter each target follows.
export function timbreTargetBindings(control) {
  const bindings = control?._children?.DeviceBindings?.bindings;
  const byPort = {};
  (Array.isArray(bindings) ? bindings : []).forEach((b) => {
    if (b?.kind === 'deviceParameter' && b?.parameterId) {
      byPort[String(b.port ?? '')] = { parameterId: String(b.parameterId), deviceRole: String(b.deviceRole ?? 'mainSynth') };
    }
  });
  return timbreTargets(control).map((t, i) => ({ ...t, index: i, binding: byPort[timbreTargetPortId(i)] ?? null }));
}

// Capture-from-patch: given a { parameterId: normalizedValue } snapshot of the
// current device/panel state, produce { targetId: value } for every target whose
// bound parameter is present. Targets with no binding (or no snapshot value) are
// left out so the caller can keep their existing anchor value.
export function captureAnchorValues(control, paramValues) {
  const src = paramValues && typeof paramValues === 'object' ? paramValues : {};
  const out = {};
  timbreTargetBindings(control).forEach((t) => {
    if (t.binding && Object.prototype.hasOwnProperty.call(src, t.binding.parameterId)) {
      out[t.id] = clamp01(num(src[t.binding.parameterId], 0));
    }
  });
  return out;
}

// Honesty readout: how many targets are actually MIDI-addressable (i.e. have a
// device-parameter binding on their port) out of the total.
export function timbreAddressableCount(control) {
  const targets = timbreTargets(control);
  const bindings = control?._children?.DeviceBindings?.bindings;
  const bound = new Set(
    (Array.isArray(bindings) ? bindings : [])
      .filter((b) => b?.kind === 'deviceParameter' && b?.parameterId)
      .map((b) => String(b.port ?? '')),
  );
  let n = 0;
  targets.forEach((t, i) => { if (bound.has(timbreTargetPortId(i))) n += 1; });
  return { addressable: n, total: targets.length };
}
