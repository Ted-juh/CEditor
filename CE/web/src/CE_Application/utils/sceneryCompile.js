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
import { anchoredPositions, fitSettings, fitsAnyAxis, fittedSizeDeep } from './containerFit.js';
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

  const background = whyBackgroundNotDrawable(children.Background);
  if (background) return background;

  // Fitted size, anchored children and clipping are all HANDLED, not refused — see the drawing
  // section below. The first cut refused a container that sizes itself from its contents on the
  // grounds that measuring it would be a second implementation of CanvasControl's fit. That was
  // the wrong conclusion from a right premise: the fit is not implemented in CanvasControl, it is
  // implemented in containerFit.js, which CanvasControl calls. Calling the same functions is not a
  // second implementation — writing new ones would have been.
  for (const child of getChildControls(control)) {
    const why = whyControlNotScenery(child);
    if (why) return `child "${child?._children?.Core?.name ?? '?'}": ${why}`;
  }

  return null;
}

export const isSceneryControl = (control) => whyControlNotScenery(control) === null;

/* ------------------------------------------------------------------ drawing */

/**
 * One control and its descendants, emitted at an absolute offset in panel space.
 *
 * `position` is the child's already-resolved x/y when its parent anchored it; null means read
 * Transform, which is every top-level control and every child at the default topLeft anchor.
 */
function controlElements(control, offsetX, offsetY, defs, keySeed, position = null) {
  const children = control._children;
  if (children.Core?.visible === false) return '';

  const transform = children.Transform ?? {};
  const x = offsetX + (position ? position.x : num(transform.x));
  const y = offsetY + (position ? position.y : num(transform.y));

  // The SAME size the canvas draws. fittedSizeDeep is what CanvasControl calls; calling it here
  // rather than re-deriving it is the whole reason a fitted container can be compiled at all.
  const size = fitsAnyAxis(control) ? fittedSizeDeep(control) : null;
  const width = size ? size.width : num(transform.width);
  const height = size ? size.height : num(transform.height);

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
  // recursing — the same origin containment.contentOrigin hands the canvas. Anchored children are
  // resolved against the content box for the same reason: an anchor is only meaningful once the
  // parent's own size is known, which one line above is where it becomes known.
  const origin = contentOrigin(control);
  const pad = fitSettings(control).padding;
  const anchored = anchoredPositions(kids, width - pad.left - pad.right, height - pad.top - pad.bottom);

  let inner = '';
  kids.forEach((child, index) => {
    inner += controlElements(
      child, x + origin.x, y + origin.y, defs, `${keySeed}_${index}`,
      anchored?.get(child?._children?.Core?.id) ?? null,
    );
  });

  if (children.Children?.clip !== true) return self + inner;

  // Clipping. A <clipPath> holding the same rounded rect the box drew, so a child that overhangs
  // is cut exactly where the container's own edge is — including its corner radius, which is why
  // the rect is rebuilt here rather than a plain rectangle being good enough.
  const id = `clip${keySeed}`;
  const radius = Math.min(num(children.Background?._children?.Corners?.radius, 0), Math.min(width, height) / 2);
  defs.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}"`
    + (radius > 0 ? ` rx="${radius}" ry="${radius}"` : '') + '/></clipPath>');
  return `${self}<g clip-path="url(#${id})">${inner}</g>`;
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
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'anchor', 'affectsFit']) h = fold(h, t[key] ?? '');

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
    // Fit and clip are read by the emitter now, so a change to either has to change the key. The
    // painful version of this bug: switch a section to fit-contents, watch nothing happen, and
    // have no invalidation to reach for because the key never moved.
    for (const key of [
      'padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
      'fitWidth', 'fitHeight', 'minWidth', 'minHeight', 'clip',
    ]) h = fold(h, c[key] ?? '');
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
