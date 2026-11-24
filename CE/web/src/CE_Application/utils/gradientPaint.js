/**
 * gradientPaint.js — a gradient that eases instead of jumping: the Paint engine (Animation Designer,
 * step 3; docs/design/animation-designer.md).
 *
 * WHY A GRADIENT JUMPED. A fill's gradient is drawn as one `background: linear-gradient(…)`, and CSS
 * cannot blend one gradient image into another: a state that turned the angle or changed a stop
 * swapped the picture at the end of the colour timing, while a solid colour beside it faded. The
 * Animation tab said so on the row (animationModel.js, COLOUR_NOTE).
 *
 * WHAT EASES NOW. The same gradient written with its numbers and colours in registered custom
 * properties — `linear-gradient(var(--ce-ga), var(--ce-gc0) var(--ce-gp0), …)`, the values set beside
 * it — and those properties registered with a type (`<angle>`, `<color>`, `<percentage>`). A typed
 * custom property interpolates, so a transition or an animation on it moves the angle, the centre,
 * each stop's colour and each stop's place, and the gradient is redrawn from them every frame.
 * Checked mid-transition in WebKitGTK 2.52 and Chromium 158 (both report the interpolated gradient as
 * the computed `background-image`), 2026-11-24. Where registration is missing (WebKitGTK before 2.40,
 * Safari 16.4's engine) the same CSS draws the same gradient and jumps, which is what it did before.
 *
 * WHAT STILL JUMPS. A change of type (linear to radial is a different function), a mesh or a square
 * ramp (layered images and a raster, not a list of stops), and a gradient with more stops than there
 * are registered slots. Each is drawn as gradientToCSS draws it.
 *
 * THE SLOTS. Two gradients ease into each other only if they are written with the same number of
 * stops, because the declaration itself must not change, only the properties it reads. So the stop
 * list is padded to 4, 8 or 12 with copies of its last stop, which draw nothing new: a three-stop
 * state easing to a four-stop one meet at four.
 *
 * TWO MORE, FOR LOOPS. `--ce-g-turn` (an angle added to the gradient's own) and `--ce-g-shift` (a
 * percentage added to every stop) are what a keyframe animation's `turn` and `shift` frames move
 * (keyframeAnimation.js, the `gradient` channel): a sheen sweeping across, a conic gradient
 * spinning. They default to nothing, so a gradient no animation touches is drawn as it was.
 */
import { gradientStopCSS, gradientToCSS } from './gradientCSS.js';

/** The custom properties a gradient is written with. Exported for the transition list and tests. */
export const GRADIENT_VARS = Object.freeze({
  angle: '--ce-ga',
  centreX: '--ce-gcx',
  centreY: '--ce-gcy',
  radiusX: '--ce-grx',
  radiusY: '--ce-gry',
  turn: '--ce-g-turn',
  shift: '--ce-g-shift',
});

/** How many stops are registered: a gradient with more is drawn as before, and jumps. */
export const GRADIENT_STOP_SLOTS = 12;
const SLOT_SIZES = [4, 8, 12];

export const stopColourVar = (index) => `--ce-gc${index}`;
export const stopPositionVar = (index) => `--ce-gp${index}`;

/**
 * The properties a colour timing eases on a layer that paints a gradient: the geometry and every
 * slot. Not `turn` and `shift`, which only a keyframe animation moves.
 */
export const GRADIENT_EASED_PROPERTIES = Object.freeze([
  GRADIENT_VARS.angle, GRADIENT_VARS.centreX, GRADIENT_VARS.centreY, GRADIENT_VARS.radiusX, GRADIENT_VARS.radiusY,
  ...Array.from({ length: GRADIENT_STOP_SLOTS }, (_, i) => stopColourVar(i)),
  ...Array.from({ length: GRADIENT_STOP_SLOTS }, (_, i) => stopPositionVar(i)),
]);

/** Every registered property: its name, its type and where it starts. Not inherited — see below. */
export const GRADIENT_PROPERTY_DEFINITIONS = Object.freeze([
  { name: GRADIENT_VARS.angle, syntax: '<angle>', initialValue: '0deg' },
  { name: GRADIENT_VARS.turn, syntax: '<angle>', initialValue: '0deg' },
  { name: GRADIENT_VARS.shift, syntax: '<percentage>', initialValue: '0%' },
  { name: GRADIENT_VARS.centreX, syntax: '<percentage>', initialValue: '50%' },
  { name: GRADIENT_VARS.centreY, syntax: '<percentage>', initialValue: '50%' },
  { name: GRADIENT_VARS.radiusX, syntax: '<percentage>', initialValue: '50%' },
  { name: GRADIENT_VARS.radiusY, syntax: '<percentage>', initialValue: '50%' },
  ...Array.from({ length: GRADIENT_STOP_SLOTS }, (_, i) => ({ name: stopColourVar(i), syntax: '<color>', initialValue: 'transparent' })),
  ...Array.from({ length: GRADIENT_STOP_SLOTS }, (_, i) => ({ name: stopPositionVar(i), syntax: '<percentage>', initialValue: '0%' })),
]);

let registered = false;

/**
 * Register the properties, once per page. `inherits: false` because each is set on the element that
 * paints with it, and a gradient inside a gradient (a part drawn inside its control) must not borrow
 * its parent's stops. A property already registered — a hot reload, a second bundle on the page —
 * throws, and is left as it is. Returns how many this call registered.
 */
export function registerGradientProperties(css = (typeof CSS !== 'undefined' ? CSS : null)) {
  if (registered || !css || typeof css.registerProperty !== 'function') return 0;
  registered = true;
  let count = 0;
  for (const definition of GRADIENT_PROPERTY_DEFINITIONS) {
    try {
      css.registerProperty({ ...definition, inherits: false });
      count += 1;
    } catch {
      // Registered already, or a syntax this engine does not know: either way it draws, unregistered.
    }
  }
  return count;
}

/** For tests: forget that registration ran. */
export function resetGradientRegistrationForTesting() {
  registered = false;
}

// Registered on first use of this module in a page: the renderers that paint gradients import it.
registerGradientProperties();

const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);
const tidy = (value) => Number(Number(value).toFixed(3)).toString();
const SAFE_COLOUR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

/**
 * gradientCSS.js buildStops, as a list rather than text: the stops after edge hardness has turned each
 * transition into a hold, a short ramp and the next hold.
 */
function hardStops(stops, edge) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  let hardness = typeof edge === 'number' ? edge : (edge === 'hard' ? 100 : 0);
  hardness = Math.max(0, Math.min(100, hardness));
  if (hardness === 0) return sorted.map((stop) => ({ color: stop.color, position: stop.position }));
  const t = hardness / 100;
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    out.push({ color: cur.color, position: cur.position });
    if (!next) continue;
    const mid = (cur.position + next.position) / 2;
    out.push({ color: cur.color, position: cur.position + (mid - cur.position) * t });
    out.push({ color: next.color, position: next.position - (next.position - mid) * t });
  }
  return out;
}

/**
 * A gradient as a function, its geometry and its final stops — what gradientToCSS writes, taken
 * apart. Null for what cannot be written as one list of stops (a mesh, a square ramp), for a gradient
 * gradientToCSS would not draw, and for a type it does not know.
 */
export function gradientStopList(gradient, shape = 'rectangle') {
  if (!gradient || !Array.isArray(gradient.stops) || gradient.stops.length < 2) return null;
  const stops = gradient.stops.map((stop) => ({ color: stop?.color, position: Number(stop?.position) }));
  if (stops.some((stop) => !Number.isFinite(stop.position))) return null;
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const angle = finite(gradient.angle, 90);
  const centreX = finite(gradient.centerX, 50);
  const centreY = finite(gradient.centerY, 50);
  const radiusX = finite(gradient.radiusX, 50);
  const radiusY = shape === 'circle' || shape === 'square' ? radiusX : finite(gradient.radiusY, 50);
  const geometry = { angle, centreX, centreY, radiusX, radiusY };
  const edge = gradient.edge ?? 'soft';
  const scaled = (cycle) => sorted.map((stop) => ({ ...stop, position: parseFloat((stop.position / 100 * cycle).toFixed(1)) }));

  switch (gradient.type) {
    case 'linear': return { fn: 'linear-gradient', geometry, stops: hardStops(stops, edge) };
    case 'radial': return { fn: 'radial-gradient', geometry, stops: hardStops(stops, edge) };
    case 'conical': return { fn: 'conic-gradient', geometry, stops: hardStops(stops, edge) };
    case 'radialRamp': return { fn: 'repeating-radial-gradient', geometry, stops: hardStops(scaled(radiusX), gradient.edge ?? 0) };
    case 'linearRamp': return { fn: 'repeating-linear-gradient', geometry, stops: hardStops(scaled(radiusX), gradient.edge ?? 0) };
    case 'duotone': return {
      fn: 'linear-gradient', geometry,
      stops: [{ color: sorted[0]?.color || '000000', position: 0 }, { color: sorted[sorted.length - 1]?.color || 'FFFFFF', position: 100 }],
    };
    case 'tricolor': return {
      fn: 'linear-gradient', geometry,
      stops: [
        { color: sorted[0]?.color || '000000', position: 0 },
        { color: sorted[Math.floor(sorted.length / 2)]?.color || '888888', position: 50 },
        { color: sorted[sorted.length - 1]?.color || 'FFFFFF', position: 100 },
      ],
    };
    case 'banding': return { fn: 'linear-gradient', geometry, stops: hardStops(stops, 'hard') };
    case 'reflected': {
      const out = [];
      for (let i = sorted.length - 1; i >= 0; i -= 1) out.push({ color: sorted[i].color, position: 50 - (sorted[i].position / 100) * 50 });
      for (let i = 1; i < sorted.length; i += 1) out.push({ color: sorted[i].color, position: 50 + (sorted[i].position / 100) * 50 });
      return { fn: 'linear-gradient', geometry, stops: out };
    }
    default:
      return null;
  }
}

/** The geometry part of the function, written with the properties. */
function geometryText(fn) {
  const v = GRADIENT_VARS;
  const turned = `calc(var(${v.angle}) + var(${v.turn}, 0deg))`;
  if (fn === 'linear-gradient' || fn === 'repeating-linear-gradient') return turned;
  if (fn === 'radial-gradient') return `ellipse var(${v.radiusX}) var(${v.radiusY}) at var(${v.centreX}) var(${v.centreY})`;
  if (fn === 'repeating-radial-gradient') return `ellipse at var(${v.centreX}) var(${v.centreY})`;
  return `from ${turned} at var(${v.centreX}) var(${v.centreY})`;
}

/**
 * A gradient written to ease: `{ image, vars, slots }` — `image` the background image reading the
 * properties, `vars` the declarations that set them — or null when it can only be drawn as
 * gradientToCSS draws it (see WHAT STILL JUMPS). Colours and numbers only reach `vars`, each checked,
 * so the text is safe to put in a style attribute.
 */
export function gradientPaint(gradient, shape = 'rectangle') {
  const list = gradientStopList(gradient, shape);
  if (!list) return null;
  const slots = SLOT_SIZES.find((size) => size >= list.stops.length);
  if (!slots) return null;
  const colours = list.stops.map((stop) => gradientStopCSS(stop.color));
  if (colours.some((colour) => !SAFE_COLOUR.test(colour))) return null;
  const positions = list.stops.map((stop) => stop.position);
  while (colours.length < slots) {
    colours.push(colours[colours.length - 1]);
    positions.push(positions[positions.length - 1]);
  }
  const v = GRADIENT_VARS;
  const stopText = colours
    .map((_, i) => `var(${stopColourVar(i)}) calc(var(${stopPositionVar(i)}) + var(${v.shift}, 0%))`)
    .join(', ');
  const { angle, centreX, centreY, radiusX, radiusY } = list.geometry;
  const declarations = [
    `${v.angle}:${tidy(angle)}deg`,
    `${v.centreX}:${tidy(centreX)}%`,
    `${v.centreY}:${tidy(centreY)}%`,
    `${v.radiusX}:${tidy(radiusX)}%`,
    `${v.radiusY}:${tidy(radiusY)}%`,
    ...colours.map((colour, i) => `${stopColourVar(i)}:${colour}`),
    ...positions.map((position, i) => `${stopPositionVar(i)}:${tidy(position)}%`),
  ];
  return {
    image: `${list.fn}(${geometryText(list.fn)}, ${stopText})`,
    vars: `${declarations.join(';')};`,
    slots,
  };
}

/**
 * A gradient fill as a `background` and the properties it reads: the eased form where there is one,
 * gradientToCSS's otherwise. What every renderer that paints a fill's gradient writes.
 */
export function gradientBackgroundCSS(gradient, shape = 'rectangle') {
  const paint = gradientPaint(gradient, shape);
  return paint ? `background: ${paint.image}; ${paint.vars}` : `background: ${gradientToCSS(gradient, shape)};`;
}
