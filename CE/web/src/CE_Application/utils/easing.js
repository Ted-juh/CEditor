/**
 * easing.js — every easing curve in the app, as numbers and as CSS, in one file with no imports.
 *
 * Three consumers read these and they have to agree to the pixel:
 *
 *   - the component runtime, which hands an Animation's easing to CSS as a transition or a
 *     keyframe timing function (`easingToCss`);
 *   - ce.anim, which writes values rather than stylesheets and so has to EVALUATE the curve
 *     (`cubicBezierEase`, re-exported from panelRuntime.js, and the generated C++ preludes);
 *   - the renderers' value glide, which tweens a slider's drawn position in JS because an SVG
 *     attribute cannot be transitioned by CSS (`easeAt`).
 *
 * Before this file existed, the bezier table lived in interactionRuntime.js and the solver in
 * panelRuntime.js, and anything else that wanted a number out of a named easing had to import one
 * of two very large modules to get it. interactionRuntime.js still re-exports the table, so the
 * identity `EASING_BEZIERS === <the panel's table>` that scriptAnim.test.js pins still holds.
 */

/**
 * The named easings, as their cubic-bezier control points [x1, y1, x2, y2].
 *
 * The C++, Lua, JavaScript and Python preludes are GENERATED from this table by
 * tools/scripts/gen-script-modules.mjs, so a name added here reaches ce.anim in every runtime the
 * next time the generator runs — and panelApiParity.test.js fails until it has.
 *
 * The three "back" curves overshoot: their y leaves [0, 1] for a moment. That is the point of them
 * (a press that squashes past its rest size and settles), and it is why OVERSHOOTING_EASINGS
 * exists — a test that asserts "never goes backwards" has to know which curves are meant to.
 */
export const EASING_BEZIERS = {
  inQuad:     [0.55,  0.085, 0.68,  0.53],
  outQuad:    [0.25,  0.46,  0.45,  0.94],
  inOutQuad:  [0.455, 0.03,  0.515, 0.955],
  inCubic:    [0.55,  0.055, 0.675, 0.19],
  outCubic:   [0.215, 0.61,  0.355, 1],
  inOutCubic: [0.645, 0.045, 0.355, 1],
  inBack:     [0.6,   -0.28, 0.735, 0.045],
  outBack:    [0.175, 0.885, 0.32,  1.275],
  inOutBack:  [0.68,  -0.55, 0.265, 1.55],
};

export const EASING_NAMES = ['linear', ...Object.keys(EASING_BEZIERS)];

/** Named easings whose curve deliberately leaves [0, 1] before it lands. */
export const OVERSHOOTING_EASINGS = ['inBack', 'outBack', 'inOutBack'];

/** The two easings that are not a named bezier: one you draw, and one that bounces. */
export const CUSTOM_EASING = 'custom';
export const SPRING_EASING = 'spring';

export const SPRING_DEFAULTS = Object.freeze({ damping: 6, frequency: 12 });
export const CUSTOM_DEFAULT = Object.freeze([0.25, 0.1, 0.25, 1]);

// --- The solver -------------------------------------------------------------------------------
// The iteration counts are FIXED rather than "until it converges". Four runtimes have to produce
// the same double from the same input, and a loop that stops on a tolerance stops after a
// different number of steps the moment one of them rounds differently. ScriptRuntime.cpp's
// cubicBezierEase is the same eight Newton steps and the same 24-step bisection fallback.

const bezierAt = (s, a, b) => (((1 - 3 * b + 3 * a) * s + (3 * b - 6 * a)) * s + (3 * a)) * s;
const bezierSlope = (s, a, b) => 3 * (1 - 3 * b + 3 * a) * s * s + 2 * (3 * b - 6 * a) * s + 3 * a;

/** A CSS cubic-bezier, evaluated numerically — P0 (0,0), P3 (1,1), the two control points given. */
export function cubicBezierEase(t, x1, y1, x2, y2) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  if (x1 === y1 && x2 === y2) return x;            // the identity curve is a straight line
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Newton-Raphson on the x polynomial: eight steps, then bisection to finish. Newton alone can
  // wander when the slope is near zero (an ease-out's tail), and bisection alone is slow.
  let s = x;
  for (let i = 0; i < 8; i += 1) {
    const slope = bezierSlope(s, x1, x2);
    if (slope === 0) break;
    s -= (bezierAt(s, x1, x2) - x) / slope;
  }
  if (!(s >= 0) || !(s <= 1)) {
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 24; i += 1) {
      if (bezierAt(s, x1, x2) < x) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
  }
  return bezierAt(s, y1, y2);
}

/** A damped oscillation, pinned to exactly 1 at the end — ce.anim.spring's formula, unchanged. */
export function springEase(t, damping = SPRING_DEFAULTS.damping, frequency = SPRING_DEFAULTS.frequency) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  if (x >= 1) return 1;
  return 1 - Math.exp(-damping * x) * Math.cos(frequency * x);
}

// --- Reading an animation's easing ------------------------------------------------------------

/**
 * Four numbers that make a usable cubic-bezier, or null.
 *
 * CSS requires both x values in [0, 1] (time cannot run backwards); y is free, which is how a
 * curve overshoots. Anything else is refused rather than clamped, so a typo is visible as "not a
 * curve" instead of quietly becoming a different one.
 */
export function cleanBezier(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  const nums = points.map(Number);
  if (!nums.every(Number.isFinite)) return null;
  if (nums[0] < 0 || nums[0] > 1 || nums[2] < 0 || nums[2] > 1) return null;
  if (nums[1] < -2 || nums[1] > 3 || nums[3] < -2 || nums[3] > 3) return null;
  return nums;
}

/**
 * The curve an Animation node asks for, as one normalised description.
 *
 * `easing` is a name; "custom" reads its points from `bezier`, "spring" its feel from `spring`.
 * An unknown name is reported as such (`known: false`) and drawn as the runtime has always drawn
 * it — CSS `ease` — so nothing that loaded yesterday moves differently today.
 */
export function readEasing(animation) {
  const name = String(animation?.easing ?? 'outQuad');
  if (name === 'linear') return { name, kind: 'linear', known: true };
  if (EASING_BEZIERS[name]) return { name, kind: 'bezier', points: EASING_BEZIERS[name], known: true };
  if (name === CUSTOM_EASING) {
    const points = cleanBezier(animation?.bezier);
    return points
      ? { name, kind: 'bezier', points, known: true }
      : { name, kind: 'bezier', points: [...CUSTOM_DEFAULT], known: false };
  }
  if (name === SPRING_EASING) {
    const damping = Number(animation?.spring?.damping);
    const frequency = Number(animation?.spring?.frequency);
    return {
      name,
      kind: 'spring',
      damping: Number.isFinite(damping) && damping > 0 ? damping : SPRING_DEFAULTS.damping,
      frequency: Number.isFinite(frequency) && frequency > 0 ? frequency : SPRING_DEFAULTS.frequency,
      known: true,
    };
  }
  return { name, kind: 'ease', known: false };
}

/** The eased position at time t (0..1) for a readEasing() description. */
export function easeAt(description, t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  const d = description ?? { kind: 'linear' };
  if (d.kind === 'linear') return x;
  if (d.kind === 'bezier') return cubicBezierEase(x, d.points[0], d.points[1], d.points[2], d.points[3]);
  if (d.kind === 'spring') return springEase(x, d.damping, d.frequency);
  // CSS `ease` is cubic-bezier(0.25, 0.1, 0.25, 1).
  return cubicBezierEase(x, 0.25, 0.1, 0.25, 1);
}

/**
 * How many points a spring is sampled at for CSS `linear()`. A spring at the default feel crosses
 * 1 about four times; 40 points draws each lobe with ten, which is finer than a 60Hz frame can
 * show over the default 600ms.
 */
export const SPRING_SAMPLES = 40;

/** A spring as a CSS `linear()` timing function — the same samples ce.anim.spring would land on. */
export function springToCssLinear(damping, frequency, samples = SPRING_SAMPLES) {
  const n = Math.max(2, Math.round(samples));
  const stops = [];
  for (let i = 0; i <= n; i += 1) {
    const v = springEase(i / n, damping, frequency);
    stops.push(Number(v.toFixed(4)).toString());
  }
  return `linear(${stops.join(', ')})`;
}

let linearSupportCache = null;

/**
 * Whether this browser understands CSS `linear()`. WebView2 has since Chromium 113 and WebKit since
 * Safari 17.2; an older WebKitGTK may not, and an unsupported timing function makes the whole
 * `transition` declaration invalid — which would silently switch the animation OFF. So a spring
 * falls back to the overshooting bezier closest to it rather than to nothing.
 */
export function cssLinearSupported() {
  if (linearSupportCache !== null) return linearSupportCache;
  try {
    linearSupportCache = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? CSS.supports('transition-timing-function', 'linear(0, 1)')
      : true;   // no CSS object means no browser: tests and SSR read the full form
  } catch {
    linearSupportCache = true;
  }
  return linearSupportCache;
}

/** For tests: forget what cssLinearSupported() found. */
export function resetCssLinearSupportForTesting(value = null) {
  linearSupportCache = value;
}

/** The CSS timing function for a readEasing() description. */
export function easingDescriptionToCss(description) {
  const d = description ?? { kind: 'ease' };
  if (d.kind === 'linear') return 'linear';
  if (d.kind === 'bezier') return `cubic-bezier(${d.points[0]}, ${d.points[1]}, ${d.points[2]}, ${d.points[3]})`;
  if (d.kind === 'spring') {
    if (cssLinearSupported()) return springToCssLinear(d.damping, d.frequency);
    const b = EASING_BEZIERS.outBack;
    return `cubic-bezier(${b[0]}, ${b[1]}, ${b[2]}, ${b[3]})`;
  }
  return 'ease';
}

/** The CSS timing function for an Animation node. */
export function easingToCss(animation) {
  return easingDescriptionToCss(readEasing(animation));
}

/**
 * A CSS timing function read back into numbers: `cubic-bezier(…)`, `linear(…)` (evenly spaced
 * stops, which is all this file writes), `linear` or `ease`. Used where something has to move
 * in JS on exactly the curve CSS would have used — a slider's drawn value, which lives in SVG
 * attributes CSS cannot transition.
 */
export function easeFromCss(css) {
  const text = String(css ?? '').trim();
  if (text === 'linear') return (t) => Math.min(1, Math.max(0, t));
  const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(text);
  if (bezier) {
    const points = cleanBezier(bezier[1].split(',').map((part) => Number(part.trim())));
    if (points) return (t) => cubicBezierEase(t, points[0], points[1], points[2], points[3]);
  }
  const linear = /^linear\(([^)]*)\)$/.exec(text);
  if (linear) {
    const stops = linear[1].split(',').map((part) => Number.parseFloat(part.trim())).filter(Number.isFinite);
    if (stops.length >= 2) {
      return (t) => {
        const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(x));
        return stops[i] + (stops[i + 1] - stops[i]) * (x - i);
      };
    }
  }
  return (t) => cubicBezierEase(t, 0.25, 0.1, 0.25, 1);
}

/** "140ms cubic-bezier(…) 0ms" → { duration, delay, ease }, or null for anything else. */
export function parseTiming(timing) {
  const match = /^(\d+(?:\.\d+)?)ms (.+) (\d+(?:\.\d+)?)ms$/.exec(String(timing ?? '').trim());
  if (!match) return null;
  return { duration: Number(match[1]), delay: Number(match[3]), ease: easeFromCss(match[2]) };
}
