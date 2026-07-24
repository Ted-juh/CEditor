// Preset Constellation — your sound library as a navigable 2D map. Each preset is
// a star placed on the field, carrying a value per morph target (its patch = its
// "feature vector"). A probe moves over the map; in SNAP mode the nearest star is
// recalled (discrete), in BLEND mode the stars are interpolated by inverse
// distance (morph). Nearest-neighbour links (by sonic similarity) draw the
// constellation; auto-arrange lays the stars out by similarity; a wander drifts
// the probe on the clock. Every target is a bindable port (the fan-out). Pure
// math (x,y,values ∈ [0,1]); shared by the renderer, the preview surface,
// componentPorts and controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function constellationConfig(control) {
  return control?._children?.Constellation ?? {};
}

// Morph targets (bindable dimensions). id is stable for value lookup.
export function constellationTargets(control) {
  const raw = constellationConfig(control).targets;
  return (Array.isArray(raw) ? raw : []).map((t, i) => ({
    id: String(t?.id ?? `t${i}`),
    label: String(t?.label ?? `Target ${i + 1}`),
    colour: String(t?.colour ?? ''),
  }));
}

// The preset stars: a named patch at (x,y) storing a value per target id.
export function constellationPresets(control) {
  const raw = constellationConfig(control).presets;
  return (Array.isArray(raw) ? raw : []).map((p, i) => ({
    id: String(p?.id ?? `p${i}`),
    label: String(p?.label ?? `Preset ${i + 1}`),
    x: clamp01(num(p?.x, 0.5)),
    y: clamp01(num(p?.y, 0.5)),
    colour: String(p?.colour ?? ''),
    values: (p && typeof p.values === 'object' && p.values) ? p.values : {},
  }));
}

// The probe position 0..1 (live __probeX/__probeY override the resting position).
export function constellationProbe(control) {
  const cfg = constellationConfig(control);
  return {
    x: clamp01(num(cfg.__probeX !== undefined ? cfg.__probeX : cfg.probeX, 0.5)),
    y: clamp01(num(cfg.__probeY !== undefined ? cfg.__probeY : cfg.probeY, 0.5)),
  };
}

// A preset's feature vector (its values in target order) — used for similarity.
export function featureVector(preset, targets) {
  return (Array.isArray(targets) ? targets : []).map((t) => clamp01(num(preset?.values?.[t.id], 0)));
}
function featureDist2(a, b, targets) {
  const va = featureVector(a, targets);
  const vb = featureVector(b, targets);
  let s = 0;
  for (let i = 0; i < va.length; i += 1) { const d = va[i] - vb[i]; s += d * d; }
  return s;
}
function pos2(preset, x, y) { const dx = clamp01(num(preset?.x, 0.5)) - x; const dy = clamp01(num(preset?.y, 0.5)) - y; return dx * dx + dy * dy; }

// The preset nearest the probe by SCREEN position (for snap / selection), or -1.
export function nearestPreset(presets, x, y) {
  const list = Array.isArray(presets) ? presets : [];
  let best = -1; let bestD = Infinity;
  list.forEach((p, i) => { const d = pos2(p, clamp01(num(x, 0.5)), clamp01(num(y, 0.5))); if (d < bestD) { bestD = d; best = i; } });
  return best;
}

// Inverse-distance blend weights for a point over the stars (normalized to 1).
export function blendWeights(presets, x, y, power = 2) {
  const list = Array.isArray(presets) ? presets : [];
  if (!list.length) return [];
  const eps = 1e-6;
  const ws = list.map((p) => 1 / (Math.pow(pos2(p, clamp01(num(x, 0.5)), clamp01(num(y, 0.5))), Math.max(0.5, num(power, 2)) / 2) + eps));
  const sum = ws.reduce((s, w) => s + w, 0) || 1;
  return ws.map((w) => w / sum);
}

// The selected preset index (nearest to the probe), or -1.
export function selectedPreset(control) {
  const probe = constellationProbe(control);
  return nearestPreset(constellationPresets(control), probe.x, probe.y);
}

// All target outputs at the probe: snap → nearest star's values; blend → weighted.
export function constellationOutputs(control) {
  const cfg = constellationConfig(control);
  const presets = constellationPresets(control);
  const targets = constellationTargets(control);
  const probe = constellationProbe(control);
  const out = {};
  if (!presets.length) { for (const t of targets) out[t.id] = 0; return out; }
  if (String(cfg.mode ?? 'blend') === 'snap') {
    const idx = nearestPreset(presets, probe.x, probe.y);
    const p = presets[idx] ?? presets[0];
    for (const t of targets) out[t.id] = clamp01(num(p?.values?.[t.id], 0));
    return out;
  }
  const w = blendWeights(presets, probe.x, probe.y, num(cfg.blendPower, 2));
  for (const t of targets) {
    let v = 0;
    for (let i = 0; i < presets.length; i += 1) v += (w[i] ?? 0) * clamp01(num(presets[i]?.values?.[t.id], 0));
    out[t.id] = clamp01(v);
  }
  return out;
}

// Nearest-neighbour links by FEATURE (sonic) similarity: for each preset, its k
// closest others, deduped into unique { a, b } index pairs (the constellation).
export function constellationLinks(control, k = 2) {
  const presets = constellationPresets(control);
  const targets = constellationTargets(control);
  const kk = Math.max(0, Math.round(num(k, 2)));
  const seen = new Set();
  const links = [];
  presets.forEach((p, i) => {
    const order = presets
      .map((q, j) => ({ j, d: j === i ? Infinity : featureDist2(p, q, targets) }))
      .sort((m, n) => m.d - n.d)
      .slice(0, kk);
    for (const { j } of order) {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (seen.has(key) || !Number.isFinite(order[0]?.d)) continue;
      seen.add(key);
      links.push({ a: Math.min(i, j), b: Math.max(i, j) });
    }
  });
  return links;
}

// Auto-arrange positions from feature similarity (best-effort pivot projection):
// x = projection onto the longest preset axis (poles A,B); y = off-axis residual.
// Deterministic + pure — identical presets land together, poles at the extremes.
export function autoArrange(control) {
  const presets = constellationPresets(control);
  const targets = constellationTargets(control);
  const n = presets.length;
  if (n < 2) return presets.map((p) => ({ ...p }));
  const D2 = (i, j) => featureDist2(presets[i], presets[j], targets);
  // Pole A = farthest from preset 0; Pole B = farthest from A.
  let A = 0; { let best = -1; for (let i = 0; i < n; i += 1) { const d = D2(0, i); if (d > best) { best = d; A = i; } } }
  let B = 0; { let best = -1; for (let i = 0; i < n; i += 1) { const d = D2(A, i); if (d > best) { best = d; B = i; } } }
  const dAB2 = Math.max(1e-9, D2(A, B));
  const lenAB = Math.sqrt(dAB2);
  const xs = presets.map((_, i) => (D2(i, A) - D2(i, B) + dAB2) / (2 * dAB2)); // scalar projection / |AB|
  const ys = presets.map((_, i) => { const proj = xs[i] * lenAB; return Math.sqrt(Math.max(0, D2(i, A) - proj * proj)); });
  const normalize = (arr) => {
    const lo = Math.min(...arr); const hi = Math.max(...arr); const span = (hi - lo) || 1;
    return arr.map((v) => 0.1 + 0.8 * ((v - lo) / span));
  };
  const nx = normalize(xs); const ny = normalize(ys);
  return presets.map((p, i) => ({ ...p, x: clamp01(nx[i]), y: clamp01(ny[i]) }));
}

// Wander drift: a Lissajous over the field so the probe explores it smoothly.
export function wanderPos(phase, ratio = 1.37) {
  const ph = ((num(phase, 0) % 1) + 1) % 1;
  return {
    x: 0.5 + 0.42 * Math.sin(ph * Math.PI * 2),
    y: 0.5 + 0.42 * Math.sin(ph * Math.PI * 2 * num(ratio, 1.37) + 1.1),
  };
}

// --- Geometry ----------------------------------------------------------------
export function constellationGeometry(width, height, pad = 10) {
  const p = Math.max(0, num(pad, 10));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  return { x0: p, y0: p, w, h };
}
export function constellationToPx(pt, geom) {
  return { px: geom.x0 + clamp01(num(pt?.x, 0.5)) * geom.w, py: geom.y0 + (1 - clamp01(num(pt?.y, 0.5))) * geom.h };
}
export function constellationFromPx(px, py, geom) {
  return { x: clamp01((num(px, 0) - geom.x0) / Math.max(1, geom.w)), y: clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h)) };
}
export function constellationHitPreset(control, geom, px, py, radiusPx = 12) {
  const presets = constellationPresets(control);
  let best = -1; let bestD = num(radiusPx, 12) ** 2;
  presets.forEach((p, i) => {
    const q = constellationToPx(p, geom);
    const d = (q.px - px) ** 2 + (q.py - py) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

// --- Dynamic per-target ports (fan-out) -------------------------------------
export function constellationTargetPortId(i) { return `target_${i}`; }
export function parseConstellationTargetPort(id) {
  const m = String(id ?? '').match(/^target_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function constellationPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return constellationTargets(control).map((t, i) => ({
    id: constellationTargetPortId(i), label: t.label || `Target ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
export function constellationPortValues(control) {
  const outputs = constellationOutputs(control);
  const out = {};
  constellationTargets(control).forEach((t, i) => { out[constellationTargetPortId(i)] = outputs[t.id] ?? 0; });
  return out;
}

// Targets paired with the device parameter their port is bound to (capture).
export function constellationTargetBindings(control) {
  const bindings = control?._children?.DeviceBindings?.bindings;
  const byPort = {};
  (Array.isArray(bindings) ? bindings : []).forEach((b) => {
    if (b?.kind === 'deviceParameter' && b?.parameterId) byPort[String(b.port ?? '')] = { parameterId: String(b.parameterId) };
  });
  return constellationTargets(control).map((t, i) => ({ ...t, index: i, binding: byPort[constellationTargetPortId(i)] ?? null }));
}
// Capture-from-patch: map a { parameterId: value } snapshot onto the bound
// targets (unbound / absent targets are left out).
export function captureConstellationValues(control, paramValues) {
  const src = paramValues && typeof paramValues === 'object' ? paramValues : {};
  const out = {};
  constellationTargetBindings(control).forEach((t) => {
    if (t.binding && Object.prototype.hasOwnProperty.call(src, t.binding.parameterId)) out[t.id] = clamp01(num(src[t.binding.parameterId], 0));
  });
  return out;
}
