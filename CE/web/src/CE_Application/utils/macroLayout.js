// Macro — pure math for a "super-knob": one macro position (0..1) drives N
// assignments, each with its own depth (−100..+100%), response curve and output
// range. Each assignment resolves to a 0..1 value and is a bindable port (the
// fan-out). No DOM/store deps — shared by the renderer, the preview surface
// (knob drag + fan-out), componentPorts (dynamic per-slot ports) and
// controlPortValues, and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

export function macroConfig(control) {
  return control?._children?.Macro ?? {};
}
export function macroValue(control) {
  return clamp01(num(macroConfig(control).value, 0.5));
}

// Normalized assignment slots (depth −1..1, curve, output range, enabled).
export function macroSlots(control) {
  const raw = macroConfig(control).slots;
  return (Array.isArray(raw) ? raw : []).map((s, i) => ({
    id: s?.id ?? `s${i}`,
    label: String(s?.label ?? `Dest ${i + 1}`),
    depth: clamp(num(s?.depth, 1), -1, 1),
    curve: String(s?.curve ?? 'linear'),
    min: clamp01(num(s?.min, 0)),
    max: clamp01(num(s?.max, 1)),
    enabled: s?.enabled !== false,
    colour: String(s?.colour ?? ''),
  }));
}

// Shape a 0..1 macro position by an assignment's curve.
export function macroWarp(t, curve) {
  const x = clamp01(num(t, 0));
  switch (String(curve)) {
    case 'exp': return x * x;                 // slow start
    case 'log': return 1 - (1 - x) * (1 - x); // fast start
    case 'scurve': return x * x * (3 - 2 * x);
    default: return x;                        // linear
  }
}

// The 0..1 value an assignment emits for a macro position: curve-shaped,
// inverted for negative depth, scaled by |depth|, then mapped into [min,max].
export function macroSlotValue(macro, slot) {
  const phase = macroWarp(macro, slot?.curve);
  const signed = num(slot?.depth, 1) >= 0 ? phase : 1 - phase;
  const amount = Math.abs(clamp(num(slot?.depth, 1), -1, 1)) * signed;
  const lo = clamp01(num(slot?.min, 0));
  const hi = clamp01(num(slot?.max, 1));
  return clamp01(lo + (hi - lo) * amount);
}

// --- Dynamic per-slot binding ports (fan-out) ------------------------------
export function macroSlotPortId(i) { return `slot_${i}`; }
export function parseMacroSlotPort(id) {
  const m = String(id ?? '').match(/^slot_(\d+)$/);
  return m ? Number(m[1]) : null;
}
// One bindable port per slot (labelled by its destination name).
export function macroPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.INTEGER, parameterTypes.FLOAT, parameterTypes.BIPOLAR, parameterTypes.NORMALIZED].filter(Boolean)
    : ['int', 'float', 'bipolar', 'normalized'];
  return macroSlots(control).map((s, i) => ({
    id: macroSlotPortId(i), label: s.label || `Dest ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
// Fan-out values: { slot_i: value } for every slot (disabled → 0).
export function macroPortValues(control) {
  const m = macroValue(control);
  const out = {};
  macroSlots(control).forEach((s, i) => { out[macroSlotPortId(i)] = s.enabled ? macroSlotValue(m, s) : 0; });
  return out;
}

// --- Layout: knob on the left, assignment lanes on the right ---------------
export function macroGeometry(width, height, control) {
  const pad = 14;
  const w = Math.max(1, num(width, 0));
  const h = Math.max(1, num(height, 0));
  const showLanes = macroConfig(control).showLanes !== false && macroSlots(control).length > 0;
  const knobBox = showLanes ? Math.min(h - pad * 2, w * 0.44) : Math.max(8, Math.min(w, h) - pad * 2);
  const knobCX = showLanes ? pad + knobBox / 2 : w / 2;
  const knobCY = showLanes ? h / 2 - 4 : h / 2 - 2;
  const knobR = Math.max(6, knobBox * 0.4);
  const lanesX0 = pad * 2 + knobBox;
  return { pad, knobBox, knobCX, knobCY, knobR, lanesX0, lanesW: Math.max(1, w - lanesX0 - pad), showLanes };
}
// Is a control-local point on the knob (a generous grab radius)?
export function macroKnobHit(geom, px, py) {
  return Math.hypot(num(px, 0) - geom.knobCX, num(py, 0) - geom.knobCY) <= geom.knobR * 1.5;
}
// Pointer angle (deg) of the knob for a value: 135° start, 270° sweep clockwise.
export function macroKnobAngle(value) {
  return 135 + clamp01(num(value, 0)) * 270;
}
