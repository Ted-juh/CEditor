// Constraint Cell — a set of linked parameters that always preserve a musical
// relationship the synth itself can't express. Drag one member and the others
// move so the rule stays true: SUM (they always total 100%), ORDER (each ≤ the
// next, e.g. resonance never exceeds cutoff), RATIO (a locked gang scaled
// together), MIRROR (one up, one down), or FREE (no rule). Each member is a
// bindable port (the fan-out). The constraint solver is a pure, deterministic
// function, so it's unit-tested; only the drag loop is stateful. Values ∈ [0,1].

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export function constraintConfig(control) {
  return control?._children?.Constraint ?? {};
}
export function constraintMode(control) {
  return String(constraintConfig(control).mode ?? 'sum');
}

// Normalized members. A live `__values` array (injected while dragging in
// preview) overrides each member's stored value so the fan-out follows the drag.
export function constraintMembers(control) {
  const cfg = constraintConfig(control);
  const raw = cfg.members;
  const live = Array.isArray(cfg.__values) ? cfg.__values : null;
  return (Array.isArray(raw) ? raw : []).map((m, i) => {
    const val = live && live[i] !== undefined ? live[i] : m?.value;
    return {
      id: String(m?.id ?? `m${i}`),
      label: String(m?.label ?? `Member ${i + 1}`),
      value: clamp01(num(val, 0.5)),
      colour: String(m?.colour ?? ''),
    };
  });
}

// --- The constraint solver ---------------------------------------------------
// Given the current member VALUES (array of 0..1), a mode, the index that just
// changed and its new value, return a new values array that satisfies the rule.
// Pure — same inputs always give the same result.
// The modes applyConstraint implements. ce.components.constraint.mode offers exactly these.
export const CONSTRAINT_MODES = ['sum', 'order', 'ratio', 'mirror', 'free'];

export function applyConstraint(values, mode, index, newValue, opts = {}) {
  const v = (Array.isArray(values) ? values : []).map((x) => clamp01(num(x, 0)));
  const n = v.length;
  if (index < 0 || index >= n) return v;
  const nv = clamp01(num(newValue, 0));
  const gap = clamp01(num(opts.minGap, 0));

  switch (String(mode)) {
    case 'sum': {
      // Members always total 1. The changed one takes nv; the rest share the
      // remaining budget in proportion to their current values (else equally).
      v[index] = nv;
      const others = [];
      let sumOthers = 0;
      for (let i = 0; i < n; i += 1) if (i !== index) { others.push(i); sumOthers += v[i]; }
      const remaining = clamp01(1 - nv);
      if (!others.length) return v;
      if (sumOthers > 1e-9) { for (const i of others) v[i] = clamp01(v[i] / sumOthers * remaining); }
      else { for (const i of others) v[i] = remaining / others.length; }
      return v;
    }
    case 'order': {
      // Keep non-decreasing with a minimum gap: reso ≤ cutoff and friends.
      v[index] = nv;
      for (let j = index + 1; j < n; j += 1) v[j] = clamp01(Math.max(v[j], v[j - 1] + gap));
      for (let j = index - 1; j >= 0; j -= 1) v[j] = clamp01(Math.min(v[j], v[j + 1] - gap));
      return v;
    }
    case 'ratio': {
      // Locked gang: scale everyone by the same factor so ratios are preserved.
      const old = v[index];
      if (old <= 1e-6) { v[index] = nv; return v; } // can't scale from zero
      const scale = nv / old;
      for (let i = 0; i < n; i += 1) v[i] = clamp01(v[i] * scale);
      return v;
    }
    case 'mirror': {
      // The first two members are complements; extras are free.
      v[index] = nv;
      if (n >= 2) { const other = index === 0 ? 1 : index === 1 ? 0 : -1; if (other >= 0) v[other] = clamp01(1 - nv); }
      return v;
    }
    case 'free':
    default:
      v[index] = nv;
      return v;
  }
}

// Whether the current values satisfy the rule (for a live "OK / off" badge).
export function constraintSatisfied(values, mode, opts = {}) {
  const v = (Array.isArray(values) ? values : []).map((x) => clamp01(num(x, 0)));
  const gap = clamp01(num(opts.minGap, 0));
  switch (String(mode)) {
    case 'sum': return Math.abs(v.reduce((s, x) => s + x, 0) - 1) < 1e-3;
    case 'order': { for (let i = 1; i < v.length; i += 1) if (v[i] < v[i - 1] + gap - 1e-6) return false; return true; }
    case 'mirror': return v.length < 2 ? true : Math.abs(v[0] + v[1] - 1) < 1e-3;
    default: return true;
  }
}

// A short human label for the mode (for the renderer badge).
export function constraintModeLabel(mode) {
  switch (String(mode)) {
    case 'sum': return 'Σ = 100%';
    case 'order': return 'a ≤ b ≤ c';
    case 'ratio': return 'ratio lock';
    case 'mirror': return 'mirror';
    default: return 'free';
  }
}

// --- Geometry: a row of vertical value bars ----------------------------------
export function constraintGeometry(width, height, count, pad = 8, labelH = 16) {
  const p = Math.max(0, num(pad, 8));
  const lh = Math.max(0, num(labelH, 16));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2 - lh);
  const n = Math.max(1, Math.round(num(count, 1)));
  const gap = 8;
  const barW = Math.max(2, (w - gap * (n - 1)) / n);
  return { x0: p, y0: p, w, h, barW, gap, count: n, labelH: lh };
}
export function barRect(geom, i, value) {
  const x = geom.x0 + i * (geom.barW + geom.gap);
  const barH = clamp01(num(value, 0)) * geom.h;
  return { x, y: geom.y0 + geom.h - barH, w: geom.barW, h: barH, fullH: geom.h, topY: geom.y0, cx: x + geom.barW / 2 };
}
export function barAtPoint(geom, px, count) {
  const n = Math.max(1, Math.round(num(count, geom.count)));
  for (let i = 0; i < n; i += 1) {
    const x = geom.x0 + i * (geom.barW + geom.gap);
    if (px >= x && px <= x + geom.barW) return i;
  }
  return -1;
}
export function valueFromY(geom, py) {
  return clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h));
}

// --- Dynamic per-member ports (fan-out) --------------------------------------
export function constraintMemberPortId(i) { return `member_${i}`; }
export function parseConstraintMemberPort(id) {
  const m = String(id ?? '').match(/^member_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function constraintPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return constraintMembers(control).map((m, i) => ({
    id: constraintMemberPortId(i), label: m.label || `Member ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
export function constraintPortValues(control) {
  const out = {};
  constraintMembers(control).forEach((m, i) => { out[constraintMemberPortId(i)] = m.value; });
  return out;
}
