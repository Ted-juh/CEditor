// sceneryCompile.js — a whole layer of background shapes, drawn as one element.
//
// WHAT THIS IS FOR. staticPartBaking folds the unchanging PARTS inside one custom component. This
// folds the unchanging CONTROLS on one layer. On a real panel those are the section boxes, dividers,
// plates and rules that make up the chassis: geometry that is authored once and then never moves,
// but that costs a DOM element each, forever, in every render.
//
// DECLARED, NOT INFERRED, and that is the whole design. The part bake has to work out for itself
// whether something can move, because it runs on every component whether or not anyone asked. Here
// the author says "this layer is scenery" — `kind: 'scenery'` on the layer — and that declaration is
// what makes an aggressive fold safe. It also gives the refusals somewhere to go: a control the
// compiler does not understand stays live and SAYS SO in the dock, rather than silently costing
// performance nobody can account for.
//
// WHEN IT COMPILES. In the editor: when the scenery layer is LOCKED. Lock already means "I am done
// with this, stop me touching it", the dock already has the button, and unlocking decompiles
// instantly — so the compiled and editable states are one click apart and neither is a mode you can
// get stuck in. In preview and export: always, lock or not, because there is nothing to edit there.
// That is the answer to "what happens in preview" that the whole background-designer discussion kept
// running aground on.
//
// TEXT STAYS LIVE. Not a policy choice — see the header of partsToSvg.js. The compiled SVG is drawn
// through an `<img>`, an image document cannot see the page's fonts, and a caption in a stored face
// would silently render in a default one. A control carrying text is refused by name.
//
// DERIVED, NEVER STORED, for the same reasons as the part bake: a document holding both the shapes
// and a picture of the shapes can disagree with itself, needs invalidation, and breaks older builds.
// The cache is keyed by a digest of exactly what was drawn.

import { boxElement, svgToDataUrl, whyBackgroundNotDrawable } from './partsToSvg.js';
import { fitsAnyAxis } from './containerFit.js';
import { getChildControls, contentOrigin } from './containment.js';
import { numberOr } from './primitives.js';

export const SCENERY_KIND = 'scenery';
export const LAYER_KINDS = ['controls', SCENERY_KIND];

export const isSceneryLayer = (layer) => String(layer?.kind ?? 'controls') === SCENERY_KIND;

/** A scenery layer draws as one image when it is locked; in preview, always. See the header. */
export const sceneryLayerIsCompiled = (layer, { preview = false } = {}) =>
  isSceneryLayer(layer) && (preview || layer?.locked === true);

const num = (value, fallback = 0) => numberOr(value, fallback);

// Sections a scenery control may carry. An allowlist rather than a blocklist: a section added to the
// app next year is refused by default, which is the failure that costs a render and not the one that
// bakes a control whose behaviour nobody here knew about.
//
// Grid is on the list because a container's Grid is snapping, not paint — CanvasControl reads it
// only from the drag path. Effects is on the list but checked, because its DEFAULT is inert and
// refusing every control that merely has the section would refuse the Background type itself.
const SCENERY_SECTIONS = new Set(['Core', 'Transform', 'Background', 'Effects', 'Grid', 'Children']);

/** Does this Effects section actually draw anything? Its defaults are all off. */
function effectsAreOn(effects) {
  const children = effects?._children;
  if (!children) return false;
  if (children.Bevel?.enabled === true) return true;
  if ((children.Shadows?.items ?? []).some((item) => item?.enabled === true)) return true;
  const filters = children.Filters ?? {};
  return Object.entries(filters).some(([key, value]) =>
    key !== '_type' && typeof value === 'number' && value !== 0 && value !== 100);
}

/**
 * Why this control cannot be folded into the scenery image, or null if it can.
 *
 * Prose, like `whyNotBakeable`, so "why is this layer still 40 elements" has an answer a person can
 * read. Every branch here is a thing the compiler does not draw — none of them is a judgement about
 * whether folding is worth it, which is the caller's business.
 */
export function whyControlNotScenery(control) {
  const children = control?._children;
  if (!children || typeof children !== 'object') return 'not a control';
  if (children.Core?.visible === false) return null;      // nothing to draw: safe to drop

  for (const name of Object.keys(children)) {
    if (!SCENERY_SECTIONS.has(name)) {
      // Named individually where the name is the interesting part. A Range on the scenery layer is
      // a mistake worth reading; a Turing section is just "not scenery".
      return name === 'Text' ? "carries text (an <img> cannot see the page's fonts)" : `has a ${name} section`;
    }
  }

  if (effectsAreOn(children.Effects)) return 'effects are enabled';

  const transform = children.Transform ?? {};
  if (num(transform.scale, 1) !== 1) return 'transform scale';
  if (String(transform.anchor ?? 'topLeft') !== 'topLeft') return 'anchored to a parent edge';

  const background = whyBackgroundNotDrawable(children.Background);
  if (background) return background;

  const kids = getChildControls(control);
  if (kids.length > 0) {
    // A container whose size is derived from its contents would have to be measured the way
    // CanvasControl measures it, and a second implementation of that is a second thing to keep
    // agreeing. Refused by name until there is a reason to build it.
    if (fitsAnyAxis(control)) return 'container sizes itself from its contents';
    if (children.Children?.clip === true) return 'container clips its children';
    for (const child of kids) {
      const why = whyControlNotScenery(child);
      if (why) return `child "${child?._children?.Core?.name ?? '?'}": ${why}`;
    }
  }

  return null;
}

export const isSceneryControl = (control) => whyControlNotScenery(control) === null;

/* ------------------------------------------------------------------ drawing */

/** One control and its descendants, emitted at an absolute offset in panel space. */
function controlElements(control, offsetX, offsetY, defs, keySeed) {
  const children = control._children;
  if (children.Core?.visible === false) return '';

  const transform = children.Transform ?? {};
  const x = offsetX + num(transform.x);
  const y = offsetY + num(transform.y);
  const width = num(transform.width);
  const height = num(transform.height);

  const self = boxElement({
    x, y, width, height,
    rotation: transform.rotation,
    // Controls rotate about their centre — there is no per-control pivot in the model, and
    // CanvasControl's transform-origin is the default 50% 50%.
    pivotX: 50, pivotY: 50,
    opacity: transform.opacity,
  }, children.Background?._children, defs, keySeed);

  const kids = getChildControls(control);
  if (kids.length === 0) return self;

  // Children are positioned inside the parent's CONTENT box, so the padding has to be added before
  // recursing — the same origin containment.contentOrigin hands the canvas.
  const origin = contentOrigin(control);
  let out = self;
  kids.forEach((child, index) => {
    out += controlElements(child, x + origin.x, y + origin.y, defs, `${keySeed}_${index}`);
  });
  return out;
}

/**
 * Split a layer's controls into the ones that fold and the ones that stay live.
 *
 * Pure. `foldable` keeps the caller's order, which IS paint order — the caller has already sorted.
 */
export function classifySceneryControls(controls) {
  const foldable = [];
  const live = [];
  const refusals = [];

  for (const control of controls ?? []) {
    const why = whyControlNotScenery(control);
    if (why) {
      live.push(control);
      refusals.push({ id: control?._children?.Core?.id ?? null, name: control?._children?.Core?.name ?? '', why });
    } else {
      foldable.push(control);
    }
  }

  return { foldable, live, refusals };
}

/* ------------------------------------------------------------------ the cache */

// One image per distinct drawing, keyed by a digest over exactly the fields that reach the SVG.
// Same reasoning as staticPartBaking: JSON.stringify is exact and honest and costs more than the
// work it is guarding. A collision draws the wrong picture, so the walk below covers every field
// `controlElements` and `boxElement` read, and nothing is left implicit about which those are.
const CACHE_LIMIT = 64;
const byContent = new Map();

function fold(hash, value) {
  const text = typeof value === 'string' ? value : String(value);
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ 0x2c) >>> 0;
}

function foldControl(h, control) {
  const children = control._children;
  h = fold(h, children.Core?.visible === false ? 0 : 1);

  const t = children.Transform ?? {};
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) h = fold(h, t[key] ?? '');

  const bg = children.Background?._children ?? {};
  const fill = bg.Fill ?? {};
  h = fold(h, fill.colour ?? '');
  h = fold(h, fill.gradientEnabled === true ? 1 : 0);
  if (fill.gradientEnabled === true && fill.gradient) {
    const g = fill.gradient;
    for (const key of ['type', 'angle', 'centerX', 'centerY', 'radiusX', 'radiusY']) h = fold(h, g[key] ?? '');
    for (const stop of g.stops ?? []) h = fold(fold(h, stop.color ?? ''), stop.position ?? '');
  }
  const border = bg.Border ?? {};
  h = fold(fold(fold(h, border.enabled === true ? 1 : 0), border.thickness ?? 0), border.colour ?? '');
  h = fold(h, bg.Corners?.radius ?? 0);

  const kids = getChildControls(control);
  if (kids.length) {
    const c = children.Children ?? {};
    for (const key of ['padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) h = fold(h, c[key] ?? '');
    for (const child of kids) h = foldControl(h, child);
  }
  return fold(h, ']');
}

function digestOf(controls, width, height) {
  let h = fold(fold(0x811c9dc5, width), height);
  for (const control of controls) h = foldControl(h, control);
  return h >>> 0;
}

export const sceneryCacheSize = () => byContent.size;
export const clearSceneryCache = () => byContent.clear();

/**
 * The render-time entry point: a layer's controls in, one data URL plus the ones left live, out.
 *
 * Returns `url: null` whenever there is nothing to fold, so a caller can render the layer normally
 * on a falsy check and never needs to know the rules.
 */
export function compileScenery(controls, width, height) {
  const { foldable, live, refusals } = classifySceneryControls(controls);
  if (foldable.length === 0 || !(width > 0 && height > 0)) {
    return { url: null, folded: 0, live: controls ?? [], refusals };
  }

  const key = `${digestOf(foldable, width, height)}`;
  let url = byContent.get(key);
  if (url === undefined) {
    const defs = [];
    const body = foldable.map((control, index) => controlElements(control, 0, 0, defs, index)).join('');
    url = body
      ? svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
        + (defs.length ? `<defs>${defs.join('')}</defs>` : '')
        + `${body}</svg>`)
      : null;
    if (byContent.size >= CACHE_LIMIT) byContent.delete(byContent.keys().next().value);
    byContent.set(key, url);
  }

  if (!url) return { url: null, folded: 0, live: controls ?? [], refusals };
  return { url, folded: foldable.length, live, refusals };
}
