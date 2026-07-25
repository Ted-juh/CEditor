// Expression Router — take an INCOMING signal (mod wheel, aftertouch, breath, a
// linked control…), shape it through a drawable transfer curve (with a dead-zone,
// optional invert), then fan the shaped value out to many device parameters, each
// with its own depth and output range. Makes an external controller feel bespoke
// to the patch. Pure math: input/output are normalized 0..1; the transfer curve
// reuses the Envelope's breakpoint engine. Shared by the renderer, the preview
// surface, componentPorts and controlPortValues, and unit-tested.
import {
  normalizePoints, envValueAt, envelopeGeometry, envToPx, envFromPx, envHitNode,
} from './envelopeLayout.js';
import { ccValue, aftertouchValue, velocityValue } from './midiNoteInput.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

// The MIDI-style input sources the Router can listen to. `cc` (when present) is
// the controller number the Player decodes; profile gating happens in the editor.
export const ROUTER_INPUT_SOURCES = [
  { id: 'modwheel', label: 'Mod Wheel', cc: 1 },
  { id: 'aftertouch', label: 'Aftertouch (channel)', cc: null, kind: 'aftertouch' },
  { id: 'breath', label: 'Breath', cc: 2 },
  { id: 'expression', label: 'Expression', cc: 11 },
  { id: 'foot', label: 'Foot Pedal', cc: 4 },
  { id: 'velocity', label: 'Note Velocity', cc: null, kind: 'velocity' },
  { id: 'link', label: 'Linked control…', cc: null, kind: 'link' },
];
export function routerSourceSpec(id) {
  return ROUTER_INPUT_SOURCES.find((s) => s.id === String(id)) ?? null;
}
export function routerSourceLabel(id) {
  return routerSourceSpec(id)?.label ?? String(id ?? '');
}
// Is this source fed by the hardware MIDI input (rather than an on-panel link)?
export function routerSourceIsMidi(id) {
  const spec = routerSourceSpec(id);
  return !!spec && spec.kind !== 'link';
}

// The live 0..1 value for a source, read out of the shared MIDI expression
// state. Returns UNDEFINED when that controller has never been seen — the
// caller has to tell "no hardware yet" (fall back to the test value) from
// "arrived, and it's zero". `channel` 0 = omni.
export function routerLiveInput(expressionState, sourceId, channel = 0) {
  const spec = routerSourceSpec(sourceId);
  if (!spec || spec.kind === 'link') return undefined;
  let raw;
  if (spec.kind === 'aftertouch') raw = aftertouchValue(expressionState, channel);
  else if (spec.kind === 'velocity') raw = velocityValue(expressionState, channel);
  else if (spec.cc !== null && spec.cc !== undefined) raw = ccValue(expressionState, spec.cc, channel);
  return raw === undefined ? undefined : clamp01(num(raw, 0) / 127);
}

export function routerConfig(control) {
  return control?._children?.Router ?? {};
}
// The live input 0..1 (injected as __input in preview / player; else the test value).
export function routerInput(control) {
  const cfg = routerConfig(control);
  return clamp01(num(cfg.__input !== undefined ? cfg.__input : cfg.testInput, 0));
}
// The transfer-curve breakpoints (normalized, sorted).
export function routerCurvePoints(control) {
  return normalizePoints(routerConfig(control).curve);
}

// Pre-shape the raw input: invert, then dead-zone (below the threshold → 0, and
// the remaining range rescales to fill 0..1 so response starts at the edge).
export function shapeInput(input, { invert = false, deadzone = 0 } = {}) {
  let x = clamp01(num(input, 0));
  if (invert) x = 1 - x;
  const dz = clamp01(num(deadzone, 0));
  if (dz > 0) x = x <= dz ? 0 : (x - dz) / (1 - dz);
  return clamp01(x);
}
// The transfer-curve output for a given raw input (shape → sample the curve).
export function routerCurveValue(control, input) {
  const cfg = routerConfig(control);
  const shaped = shapeInput(input !== undefined ? input : routerInput(control), {
    invert: cfg.invert === true, deadzone: num(cfg.deadzone, 0),
  });
  const pts = routerCurvePoints(control);
  if (pts.length < 2) return shaped;           // no curve → pass-through
  return clamp01(envValueAt(pts, shaped));
}

// Normalized destinations.
export function routerDests(control) {
  const raw = routerConfig(control).destinations;
  return (Array.isArray(raw) ? raw : []).map((d, i) => ({
    id: d?.id ?? `d${i}`,
    label: String(d?.label ?? `Destination ${i + 1}`),
    depth: Math.max(-1, Math.min(1, num(d?.depth, 1))),   // ± = direction
    min: clamp01(num(d?.min, 0)),
    max: clamp01(num(d?.max, 1)),
    enabled: d?.enabled !== false,
    colour: String(d?.colour ?? ''),
  }));
}
// A destination's output: curve value scaled by |depth| (inverted for negative
// depth), then mapped into [min,max]. Mirrors the Macro's per-slot mapping.
export function routerDestValue(curveOut, dest) {
  const amt = clamp01(num(curveOut, 0));
  const depth = Math.max(-1, Math.min(1, num(dest?.depth, 1)));
  const signed = depth < 0 ? 1 - amt : amt;
  const scaled = Math.abs(depth) * signed;
  const min = clamp01(num(dest?.min, 0));
  const max = clamp01(num(dest?.max, 1));
  return clamp01(min + (max - min) * scaled);
}

// --- Geometry: reuse the Envelope's drawing rect + node hit-test --------------
export function routerGeometry(width, height, pad = 8) {
  return envelopeGeometry(width, height, pad);
}
export function routerNodeToPx(pt, geom) { return envToPx(pt, geom); }
export function routerNodeFromPx(px, py, geom) { return envFromPx(px, py, geom); }
export function routerHitNode(points, geom, px, py, radius = 10) {
  return envHitNode(points, geom, px, py, radius);
}
// The live input→output crosshair position in px.
export function routerCrosshairPx(control, geom) {
  const cfg = routerConfig(control);
  const shaped = shapeInput(routerInput(control), { invert: cfg.invert === true, deadzone: num(cfg.deadzone, 0) });
  const out = routerCurveValue(control);
  return { ix: envToPx({ x: shaped, y: 0 }, geom).px, oy: envToPx({ x: 0, y: out }, geom).py, shaped, out };
}

// --- Dynamic per-destination ports (fan-out) --------------------------------
export function routerDestPortId(i) { return `dest_${i}`; }
export function parseRouterDestPort(id) {
  const m = String(id ?? '').match(/^dest_(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function routerPorts(control, parameterTypes = null) {
  const accepts = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  return routerDests(control).map((d, i) => ({
    id: routerDestPortId(i), label: d.label || `Destination ${i + 1}`, accepts, defaultBindingMode: 'continuous',
  }));
}
// Fan-out values at the current input: { dest_i: value } (disabled → its floor).
export function routerPortValues(control) {
  const curveOut = routerCurveValue(control);
  const out = {};
  routerDests(control).forEach((d, i) => {
    out[routerDestPortId(i)] = d.enabled ? routerDestValue(curveOut, d) : clamp01(num(d.min, 0));
  });
  return out;
}
