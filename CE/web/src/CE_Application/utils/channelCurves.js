// channelCurves.js — how far a control is turned, and the value that gives (docs/design/
// changeable-control-sets.md, piece D3).
//
// A value channel's Curve was stored and read by nothing. It is now the map between TRAVEL (how far
// the control is turned or slid, 0 to 1) and the value: half way round an Exponential 20 Hz to
// 20 kHz knob is 630 Hz, as on a synth, not 10 kHz. Everything a person moves works in travel (the
// drag, the wheel, the keys), and so does the artwork (a binding on `channel.x.normalized` turns a
// pointer by travel); the value, the readout and the device get the curved value. The plug-in's
// parameter range carries the same curve (CE/src/Player/PanelParameters.h), so a host's automation
// lane drawn half way sits where the knob does at half travel.
//
//   linear       value follows travel.
//   exponential  a power curve through the Centre value at half travel; by default the geometric
//   logarithmic  middle of the range (a range from 20 to 20,000 gives 632), or a tenth of it where
//                the range starts at zero or below. Logarithmic is the same curve bent the other
//                way: by default nine tenths. Centre decides the bend for both.
//   s-curve      slow at both ends, fast in the middle (smoothstep).
//   stepped      the travel clicks into Steps positions. Hysteresis holds a step until the travel
//                is that much of a step past its edge, so it does not flicker.
//   bipolar      value follows travel; the centre is the rest point (double-click returns there)
//                and a Dead Zone may hold it, as on a pitch wheel.
//   dead-zone    a band of Dead Zone width around the centre holds the centre value.
//
// Pure, and the same maths as the C++ (ce::CurveSpec in PanelParameters.h): keep the two together.

export const CURVE_MODES = ['linear', 'exponential', 'logarithmic', 's-curve', 'stepped', 'bipolar', 'dead-zone'];

export const CURVE_LABELS = {
  linear: 'Linear', exponential: 'Exponential', logarithmic: 'Logarithmic', 's-curve': 'S-Curve',
  stepped: 'Stepped', bipolar: 'Bipolar', 'dead-zone': 'Dead Zone',
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const finite = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The channel's curve mode, 'linear' for none or one this does not know. */
export function curveMode(channel) {
  const mode = String(channel?.curve?.mode ?? 'linear').trim().toLowerCase();
  return CURVE_MODES.includes(mode) ? mode : 'linear';
}

/** The value at half travel a curve uses when the author gave none. */
export function defaultCurveCentre(channel, mode = curveMode(channel)) {
  const min = finite(channel?.min, 0);
  const max = finite(channel?.max, 1);
  const span = max - min;
  if (mode === 'exponential') {
    if (min > 0 && max > min) return Math.sqrt(min * max);
    return min + span * 0.1;
  }
  if (mode === 'logarithmic') {
    if (min > 0 && max > min) return max - (Math.sqrt(min * max) - min);
    return min + span * 0.9;
  }
  return min + span / 2;
}

/** How many positions a Stepped curve has when the author gave none: the channel's steps, up to 33, else 5. */
export function defaultCurveSteps(channel) {
  const min = finite(channel?.min, 0);
  const max = finite(channel?.max, 1);
  const step = Math.abs(finite(channel?.step, 0));
  const count = step > 0 ? Math.round(Math.abs(max - min) / step) + 1 : 0;
  return count >= 2 && count <= 33 ? count : 5;
}

/**
 * A channel's curve as numbers: `{ mode, centre, steps, deadZone, hysteresis }`, `centre` as a
 * fraction of the range (kept off 0 and 1, where a power curve has no shape).
 */
export function curveSpec(channel) {
  const mode = curveMode(channel);
  const min = finite(channel?.min, 0);
  const max = finite(channel?.max, 1);
  const span = max - min;
  const centreValue = finite(channel?.curve?.centre, defaultCurveCentre(channel, mode));
  const centre = Math.abs(span) < 1e-9 ? 0.5 : Math.max(0.001, Math.min(0.999, (centreValue - min) / span));
  const steps = Math.max(2, Math.round(finite(channel?.curve?.steps, defaultCurveSteps(channel))));
  const deadZone = Math.max(0, Math.min(0.9, finite(channel?.curve?.deadZone, mode === 'dead-zone' ? 0.1 : 0)));
  const hysteresis = Math.max(0, Math.min(0.49, finite(channel?.curve?.hysteresis, 0)));
  return { mode, centre, steps, deadZone, hysteresis };
}

const powerOf = (centre) => Math.log(centre) / Math.log(0.5);

// The dead band around the centre, for Bipolar and Dead Zone.
function bandTravelToFraction(p, d) {
  if (d <= 0) return p;
  const half = d / 2;
  if (Math.abs(p - 0.5) <= half) return 0.5;
  const reach = 0.5 - half;
  return p < 0.5 ? (p / reach) * 0.5 : 0.5 + ((p - 0.5 - half) / reach) * 0.5;
}
function bandFractionToTravel(v, d) {
  if (d <= 0) return v;
  const half = d / 2;
  const reach = 0.5 - half;
  if (v === 0.5) return 0.5;
  return v < 0.5 ? (v / 0.5) * reach : 0.5 + half + ((v - 0.5) / 0.5) * reach;
}

/** Travel (0..1) to the fraction of the range it gives. */
export function travelToFraction(spec, travel) {
  const p = clamp01(finite(travel, 0));
  switch (spec?.mode) {
    case 'exponential':
    case 'logarithmic':
      return clamp01(p ** powerOf(spec.centre));
    case 's-curve':
      return p * p * (3 - 2 * p);
    case 'stepped': {
      const last = spec.steps - 1;
      return Math.round(p * last) / last;
    }
    case 'bipolar':
    case 'dead-zone':
      return bandTravelToFraction(p, spec.deadZone);
    default:
      return p;
  }
}

/** The fraction of the range (0..1) to the travel that gives it: where the control is drawn. */
export function fractionToTravel(spec, fraction) {
  const v = clamp01(finite(fraction, 0));
  switch (spec?.mode) {
    case 'exponential':
    case 'logarithmic':
      return clamp01(v ** (1 / powerOf(spec.centre)));
    case 's-curve':
      return clamp01(0.5 - Math.sin(Math.asin(1 - 2 * v) / 3));
    case 'stepped': {
      const last = spec.steps - 1;
      return Math.round(v * last) / last;
    }
    case 'bipolar':
    case 'dead-zone':
      return bandFractionToTravel(v, spec.deadZone);
    default:
      return v;
  }
}

/**
 * A Stepped curve's step for `travel`, held on `previousFraction`'s step until the travel is
 * Hysteresis of a step past its edge. Returns the fraction of the range.
 */
export function steppedFractionWithHysteresis(spec, travel, previousFraction) {
  const last = spec.steps - 1;
  const p = clamp01(finite(travel, 0)) * last;
  const nearest = Math.round(p);
  if (!(spec.hysteresis > 0) || !Number.isFinite(Number(previousFraction))) return nearest / last;
  const held = Math.round(clamp01(Number(previousFraction)) * last);
  if (nearest === held) return held / last;
  // Past the edge between `held` and its neighbour by the hysteresis, or it stays.
  const edge = nearest > held ? held + 0.5 + spec.hysteresis : held - 0.5 - spec.hysteresis;
  const past = nearest > held ? p >= edge : p <= edge;
  return (past ? nearest : held) / last;
}

/** Whether the curve changes anything: linear, and Bipolar with no dead zone, do not. */
export function curveIsIdentity(spec) {
  return spec.mode === 'linear' || (spec.mode === 'bipolar' && !(spec.deadZone > 0));
}

/** Points of the curve for a graph, travel across and value up, in a 100 by 100 box (y down). */
export function curveGraphPoints(spec, count = 64) {
  const out = [];
  for (let i = 0; i <= count; i += 1) {
    const p = i / count;
    out.push([p * 100, 100 - travelToFraction(spec, p) * 100]);
  }
  return out;
}

/**
 * What the plug-in needs to give its parameter the same curve, or null for none:
 * `{ mode, centre, steps, deadZone }` with centre as a fraction of the range.
 */
export function curveExportSpec(channel) {
  const spec = curveSpec(channel);
  if (curveIsIdentity(spec)) return null;
  const out = { mode: spec.mode };
  if (spec.mode === 'exponential' || spec.mode === 'logarithmic') out.centre = Math.round(spec.centre * 1e6) / 1e6;
  if (spec.mode === 'stepped') out.steps = spec.steps;
  if (spec.mode === 'bipolar' || spec.mode === 'dead-zone') out.deadZone = spec.deadZone;
  return out;
}
