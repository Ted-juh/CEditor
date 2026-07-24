// Turing Modulator — a looping shift-register of stepped values you can LOCK or
// let MUTATE. Where the Orbit is geometric motion and the Looper is human motion,
// this is ALGORITHMIC, evolving motion: a step sequence advances on the clock,
// and a "randomness" amount controls how much each step mutates as it recycles —
// from a frozen loop (0) to pure chaos (1). Outputs the current step's value, a
// gate, and its inverse (the fan-out). Pure math (values ∈ [0,1]); the mutation
// itself is stateful and lives in the preview surface, but every transform here
// is a deterministic function (randomness is passed IN), so it's unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function wrap01(n) { return ((num(n, 0) % 1) + 1) % 1; }

export function turingConfig(control) {
  return control?._children?.Turing ?? {};
}
// Global loop phase 0..1 (the clock, injected as __phase in preview; else static).
export function turingPhase(control) {
  const cfg = turingConfig(control);
  return wrap01(cfg.__phase !== undefined ? cfg.__phase : cfg.phase);
}
// Loop length in steps (2..64). The live __steps override the stored register.
export function turingLength(control) {
  const cfg = turingConfig(control);
  const steps = Array.isArray(cfg.__steps) ? cfg.__steps : cfg.steps;
  const fromArray = Array.isArray(steps) ? steps.length : 0;
  return Math.max(2, Math.min(64, Math.round(num(cfg.length, fromArray || 8))));
}
// The register: `length` step values 0..1 (padded / trimmed to length).
export function turingSteps(control) {
  const cfg = turingConfig(control);
  const raw = Array.isArray(cfg.__steps) ? cfg.__steps : (Array.isArray(cfg.steps) ? cfg.steps : []);
  const len = turingLength(control);
  const out = [];
  for (let i = 0; i < len; i += 1) out.push(clamp01(num(raw[i], 0)));
  return out;
}

// The current step index from the clock phase.
export function turingStepIndex(control) {
  const len = turingLength(control);
  const idx = Math.floor(wrap01(turingPhase(control)) * len);
  return Math.max(0, Math.min(len - 1, idx));
}

// A step's output value, optionally quantized to `levels` discrete steps.
export function stepOutput(steps, index, quantizeLevels = 0) {
  const v = clamp01(num((Array.isArray(steps) ? steps : [])[index], 0));
  const levels = Math.round(num(quantizeLevels, 0));
  if (levels >= 2) return Math.round(v * (levels - 1)) / (levels - 1);
  return v;
}
// The gate at a step: 1 when the step value is at/above the threshold, else 0.
export function gateAt(steps, index, threshold = 0.5) {
  return clamp01(num((Array.isArray(steps) ? steps : [])[index], 0)) >= clamp01(num(threshold, 0.5)) ? 1 : 0;
}

// Mutation: with the incoming die-roll below `randomness`, replace the step with
// `newValue`; else keep it. Pure — the caller supplies fresh randoms per advance,
// so a locked loop (randomness 0) never changes and chaos (1) always rewrites.
export function mutateStep(steps, index, roll, newValue, randomness) {
  const out = (Array.isArray(steps) ? steps : []).map((s) => clamp01(num(s, 0)));
  if (index < 0 || index >= out.length) return out;
  if (num(roll, 1) < clamp01(num(randomness, 0))) out[index] = clamp01(num(newValue, 0));
  return out;
}

// --- Geometry: a row of step bars --------------------------------------------
export function turingGeometry(width, height, length, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  const n = Math.max(1, Math.round(num(length, 1)));
  const gap = n > 24 ? 1 : 2;
  const stepW = Math.max(1, (w - gap * (n - 1)) / n);
  return { x0: p, y0: p, w, h, stepW, gap, count: n };
}
export function stepRect(geom, i, value) {
  const x = geom.x0 + i * (geom.stepW + geom.gap);
  const barH = clamp01(num(value, 0)) * geom.h;
  return { x, y: geom.y0 + geom.h - barH, w: geom.stepW, h: barH, fullH: geom.h, topY: geom.y0 };
}
// Which step column contains an x, or -1.
export function stepAtPoint(geom, px, count) {
  const n = Math.max(1, Math.round(num(count, geom.count)));
  for (let i = 0; i < n; i += 1) {
    const x = geom.x0 + i * (geom.stepW + geom.gap);
    if (px >= x && px <= x + geom.stepW) return i;
  }
  return -1;
}
// A y within the field → a value 0..1 (top = 1).
export function valueFromY(geom, py) {
  return clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h));
}

// --- Static ports (fan-out): value / gate / inverse --------------------------
export function turingPorts(parameterTypes = null) {
  const cont = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  const gate = parameterTypes
    ? [parameterTypes.BOOLEAN, parameterTypes.NORMALIZED].filter(Boolean)
    : ['boolean', 'normalized'];
  return [
    { id: 'value', label: 'Value', accepts: cont, defaultBindingMode: 'continuous' },
    { id: 'gate', label: 'Gate', accepts: gate, defaultBindingMode: 'continuous' },
    { id: 'inverse', label: 'Inverse', accepts: cont, defaultBindingMode: 'continuous' },
  ];
}
// The current fan-out values: { value, gate, inverse } at the live step.
export function turingPortValues(control) {
  const cfg = turingConfig(control);
  const steps = turingSteps(control);
  const idx = turingStepIndex(control);
  const value = stepOutput(steps, idx, num(cfg.quantizeLevels, 0));
  return { value, gate: gateAt(steps, idx, num(cfg.gateThreshold, 0.5)), inverse: clamp01(1 - value) };
}

// Steps per second implied by the loop rate (rate = loops/sec × length).
export function turingStepsPerSecond(control) {
  return Math.max(0.1, num(turingConfig(control).rate, 2));
}
