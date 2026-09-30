/**
 * partBooleans.js — combine component parts into one shape (unite, subtract, intersect, exclude), and
 * smooth a drawn path, with Paper.js as the geometry engine.
 *
 * A pro vector tool builds silhouettes by combining shapes: a knob cap is a circle minus a notch, a
 * bezel is a rounded box minus a smaller one. The designer drew boxes, stadiums, polygons and Pen
 * paths, and could not combine any of them. Paper.js does the boolean maths — curves, holes and
 * several islands included — and is used headless, only for geometry: nothing here draws.
 *
 * THE RESULT is a `path` part in its compound form (see penPath.js for the point form):
 *
 *   meta.pathData   SVG path data in 0..1 of the part's box, y downward — the scheme the polygons and
 *                   the point form use, so it scales with the part — drawn with an even-odd fill,
 *                   so a subtracted hole is a hole
 *   meta.closed     true
 *
 * It is not vertex-editable (the Pen edits points, and this has curves); it moves, scales and styles
 * like any part. The result keeps one operand's name, style and effects — the front-most, or for
 * subtract the back-most, the shape the others are cut from, as in every drawing tool — so what
 * refers to that part still does. Every other operand is removed, so one anything refers to is
 * refused, by name.
 *
 * WHAT CAN BE AN OPERAND: what has an exact outline — a box (with rounded corners, one radius or four),
 * a circle / ring / capsule (the stadium the renderer draws), the fixed polygons, a closed Pen path, a
 * combined path; turned and scaled as the part is. Text, arcs, lines and open paths have no area to
 * combine and are refused by name, as is a result-bearing operand whose fill the vector renderer
 * cannot draw (a gradient or image draws as a solid fill on a vector shape).
 *
 * Paper.js is loaded when first needed (a dynamic import), so neither the editor's start-up nor the
 * exported plug-in's player carries it.
 */
import { partFrame } from './customDesignSurfaceGeometry.js';
import { polygonPoints } from './shapeGeometry.js';
import { hasCompoundPath, pathIsClosed, pathVectorPoints } from './penPath.js';
import { numberOr } from './primitives.js';

export const BOOLEAN_OPERATIONS = ['unite', 'subtract', 'intersect', 'exclude'];
export const BOOLEAN_LABELS = { unite: 'Unite', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' };

const RECT_KINDS = new Set(['rectangle', 'roundedrectangle']);
const STADIUM_KINDS = new Set(['circle', 'ring', 'capsule']);

let scopePromise = null;

/** One headless Paper.js scope for the editor's lifetime. */
export function loadPaper() {
  if (!scopePromise) {
    scopePromise = import('paper/dist/paper-core.js').then((module) => {
      const paper = module.default ?? module;
      const scope = new paper.PaperScope();
      scope.setup(new scope.Size(1, 1));
      return scope;
    });
  }
  return scopePromise;
}

export { hasCompoundPath };

function fillOf(part) {
  return part?._children?.Background?._children?.Fill ?? {};
}

/** Why this part cannot be combined, or ''. `styled`: its style would become the result's. */
export function whyNotCombinable(part, { styled = false } = {}) {
  if (!part) return 'not found';
  if (part.visible === false) return 'hidden';
  const kind = String(part.kind ?? 'rectangle').toLowerCase();
  if (part._children?.Text) return 'text';
  if (kind === 'path') {
    if (!hasCompoundPath(part)) {
      if (!pathVectorPoints(part)) return 'a path with too few points';
      if (!pathIsClosed(part)) return 'an open path — it has no inside';
    }
  } else if (!RECT_KINDS.has(kind) && !STADIUM_KINDS.has(kind) && !polygonPoints(kind)) {
    return `a ${part.kind} part, which has no outline to combine`;
  }
  if (RECT_KINDS.has(kind)) {
    const corners = part._children?.Background?._children?.Corners ?? {};
    const styles = corners.linked === false
      ? ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((key) => corners[key]?.style ?? 'rounded')
      : [corners.style ?? 'rounded'];
    const odd = styles.find((style) => String(style) !== 'rounded');
    if (odd && cornerRadii(part, 1e9, 1e9).some((radius) => radius > 0)) return `${odd} corners`;
  }
  if (styled) {
    const fill = fillOf(part);
    if (fill.gradientEnabled === true || fill.imageEnabled === true || fill.textureEnabled === true || fill.overlayEnabled === true) {
      return 'a gradient or image fill — a combined shape draws a solid fill';
    }
    const border = part._children?.Background?._children?.Border ?? {};
    if (border.enabled === true && String(border.style ?? 'solid') !== 'solid') return `a ${border.style} border`;
  }
  return '';
}

function cornerRadii(part, width, height) {
  const corners = part?._children?.Background?._children?.Corners ?? {};
  const limit = Math.min(width, height) / 2;
  const one = (value) => Math.max(0, Math.min(limit, numberOr(value, 0)));
  if (corners.linked === false) {
    return ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((key) => one(corners[key]?.radius));
  }
  const r = one(corners.radius);
  return [r, r, r, r];
}

/** A rounded rectangle with a radius per corner (top-left, top-right, bottom-right, bottom-left). */
function roundedBox(scope, left, top, width, height, radii) {
  const [tl, tr, br, bl] = radii;
  const path = new scope.Path({ insert: false, closed: true });
  const k = Math.SQRT1_2;
  path.moveTo(new scope.Point(left + tl, top));
  path.lineTo(new scope.Point(left + width - tr, top));
  if (tr > 0) path.arcTo(new scope.Point(left + width - tr + tr * k, top + tr - tr * k), new scope.Point(left + width, top + tr));
  path.lineTo(new scope.Point(left + width, top + height - br));
  if (br > 0) path.arcTo(new scope.Point(left + width - br + br * k, top + height - br + br * k), new scope.Point(left + width - br, top + height));
  path.lineTo(new scope.Point(left + bl, top + height));
  if (bl > 0) path.arcTo(new scope.Point(left + bl - bl * k, top + height - bl + bl * k), new scope.Point(left, top + height - bl));
  path.lineTo(new scope.Point(left, top + tl));
  if (tl > 0) path.arcTo(new scope.Point(left + tl - tl * k, top + tl - tl * k), new scope.Point(left + tl, top));
  path.closePath();
  return path;
}

/** The part's outline in artboard coordinates, as the renderer draws its box, turned and scaled. */
export function partOutline(scope, part, artboardWidth, artboardHeight) {
  const frame = partFrame(part, artboardWidth, artboardHeight);
  const { left, top, width, height } = frame;
  const kind = String(part.kind ?? 'rectangle').toLowerCase();
  let item;
  if (hasCompoundPath(part)) {
    item = new scope.CompoundPath({ pathData: part.meta.pathData, insert: false });
    item.transform(new scope.Matrix(width, 0, 0, height, left, top));
  } else if (kind === 'path' || polygonPoints(kind)) {
    const points = kind === 'path' ? pathVectorPoints(part) : polygonPoints(kind);
    item = new scope.Path({
      segments: points.map(([x, y]) => [left + x * width, top + y * height]),
      closed: true,
      insert: false,
    });
  } else if (STADIUM_KINDS.has(kind)) {
    const r = Math.min(width, height) / 2;
    item = roundedBox(scope, left, top, width, height, [r, r, r, r]);
  } else {
    item = roundedBox(scope, left, top, width, height, cornerRadii(part, width, height));
  }
  const layout = part._children?.Layout ?? {};
  const pivot = new scope.Point(left + width * numberOr(layout.pivotX, 50) / 100, top + height * numberOr(layout.pivotY, 50) / 100);
  // CSS `rotate(r) scale(s)` about the pivot: the scale applies first.
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  if (Math.abs(scale - 1) > 1e-6) item.scale(scale, pivot);
  const rotation = numberOr(layout.rotation, 0);
  if (Math.abs(rotation) > 1e-6) item.rotate(rotation, pivot);
  return item;
}

/** Everything in the component that names a part: the reason a removed operand would break it. */
export function partReferences(control, name) {
  const kids = control?._children ?? {};
  const found = [];
  const mentions = (value) => {
    const text = JSON.stringify(value ?? null);
    return text.includes(`"Parts.${name}.`) || text.includes(`"part:${name}"`) || text.includes(`Parts.${name}.`);
  };
  for (const [zoneName, zone] of Object.entries(kids.HitZones?._children ?? {})) {
    if (String(zone?.source ?? '') === `part:${name}`) found.push(`hit zone ${zoneName}`);
  }
  for (const [bindingName, binding] of Object.entries(kids.Bindings?._children ?? {})) {
    if (String(binding?.target ?? '').startsWith(`Parts.${name}.`)) found.push(`binding ${bindingName}`);
  }
  for (const [stateName, state] of Object.entries(kids.States?._children ?? {})) {
    if (state?.patches?.parts && Object.hasOwn(state.patches.parts, name)) found.push(`state ${stateName}`);
  }
  for (const [propertyName, entry] of Object.entries(kids.PublishedProperties?.editableProperties ?? {})) {
    if (String(entry?.path ?? '').startsWith(`Parts.${name}.`)) found.push(`published property ${propertyName}`);
  }
  for (const [variantName, variant] of Object.entries(kids.Variants?._children ?? {})) {
    if (mentions(variant?.patches)) found.push(`variant ${variantName}`);
  }
  return found;
}

function unitPathData(scope, item, bounds) {
  const clone = item.clone({ insert: false });
  clone.transform(new scope.Matrix(1 / bounds.width, 0, 0, 1 / bounds.height, -bounds.x / bounds.width, -bounds.y / bounds.height));
  return clone.getPathData(null, 5);
}

const round2 = (value) => Math.round(value * 100) / 100;

/** The part patch (paths relative to the part) that makes it this compound shape, laid out in px. */
function compoundPatch(scope, item) {
  const bounds = item.bounds;
  const box = { x: bounds.x, y: bounds.y, width: Math.max(1e-6, bounds.width), height: Math.max(1e-6, bounds.height) };
  return {
    kind: 'path',
    'meta.pathData': unitPathData(scope, item, box),
    'meta.closed': true,
    'meta.vectorPoints': null,
    'Layout.mode': 'absolute',
    'Layout.x': round2(box.x),
    'Layout.y': round2(box.y),
    'Layout.width': round2(Math.max(1, box.width)),
    'Layout.height': round2(Math.max(1, box.height)),
    'Layout.xUnit': 'px',
    'Layout.yUnit': 'px',
    'Layout.widthUnit': 'px',
    'Layout.heightUnit': 'px',
    'Layout.anchorX': 'left',
    'Layout.anchorY': 'top',
    'Layout.offsetX': 0,
    'Layout.offsetY': 0,
    // The turn and scale are in the outline now.
    'Layout.rotation': 0,
    'Layout.scale': 1,
    'Layout.pivotX': 50,
    'Layout.pivotY': 50,
  };
}

/**
 * Plan a boolean operation on parts of a component.
 *
 * `entries` are `[name, authoredPart, renderedPart]` (the rendered part is what is on screen: its frame
 * after generators and variants). `control` is the component, for the reference check.
 * Returns `{ ok: false, refused: [{ name, reason }] }` or `{ ok: true, keep, remove, patch }` where
 * `patch` is relative to the kept part.
 */
export async function planPartBoolean(control, entries, operation, { artboardWidth, artboardHeight }) {
  if (!BOOLEAN_OPERATIONS.includes(operation)) return { ok: false, refused: [{ name: '', reason: `no operation ${operation}` }] };
  if (entries.length < 2) return { ok: false, refused: [{ name: '', reason: 'select two or more shapes' }] };
  // Paint order: back to front, as the renderer stacks them (zIndex, then document order).
  const order = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => numberOr(a.entry[2]?.zIndex, 0) - numberOr(b.entry[2]?.zIndex, 0) || a.index - b.index)
    .map(({ entry }) => entry);
  const keepEntry = operation === 'subtract' ? order[0] : order[order.length - 1];
  const refused = [];
  for (const [name, authored, rendered] of order) {
    if (!authored) {
      refused.push({ name, reason: 'made by a generator, so it has no part of its own to change' });
      continue;
    }
    const why = whyNotCombinable(rendered, { styled: name === keepEntry[0] });
    if (why) refused.push({ name, reason: why });
    else if (name !== keepEntry[0]) {
      const references = partReferences(control, name);
      if (references.length) refused.push({ name, reason: `used by ${references.join(', ')} — combining removes it` });
    }
  }
  if (refused.length) return { ok: false, refused };

  const scope = await loadPaper();
  const outlines = order.map(([, , rendered]) => partOutline(scope, rendered, artboardWidth, artboardHeight));
  let result;
  if (operation === 'subtract') {
    const cutters = outlines.slice(1).reduce((sum, outline) => sum.unite(outline, { insert: false }));
    result = outlines[0].subtract(cutters, { insert: false });
  } else {
    result = outlines.slice(1).reduce((sum, outline) => sum[operation](outline, { insert: false }), outlines[0]);
  }
  if (!result || result.isEmpty() || Math.abs(result.area) < 0.5) {
    return { ok: false, refused: [{ name: '', reason: operation === 'intersect' ? 'the shapes do not overlap — nothing is left' : 'nothing would be left' }] };
  }
  return {
    ok: true,
    keep: keepEntry[0],
    remove: order.map(([name]) => name).filter((name) => name !== keepEntry[0]),
    patch: compoundPatch(scope, result),
  };
}

/**
 * Smooth a Pen path: a curve through the same points (Catmull-Rom), so a polygon drawn with a few
 * clicks becomes the rounded shape it was sketching. The result is the compound form: it scales and
 * styles like before, and is no longer edited point by point.
 */
export async function planPathSmooth(rendered, { artboardWidth, artboardHeight }) {
  const points = pathVectorPoints(rendered);
  if (!points) return { ok: false, reason: 'only a path drawn with the Pen can be smoothed' };
  const scope = await loadPaper();
  const frame = partFrame(rendered, artboardWidth, artboardHeight);
  const closed = pathIsClosed(rendered);
  const path = new scope.Path({
    segments: points.map(([x, y]) => [frame.left + x * frame.width, frame.top + y * frame.height]),
    closed,
    insert: false,
  });
  path.smooth({ type: 'catmull-rom', factor: 0.5 });
  const patch = compoundPatch(scope, path);
  patch['meta.closed'] = closed;
  return { ok: true, patch };
}

/**
 * The component's Parts after a combine, as ONE write, so one undo puts every operand back: the kept
 * part patched (paths relative to it: `Layout.x` is its Layout section, `meta.x` its meta, anything
 * else a field of its own; null deletes), the others gone.
 */
export function partsAfterBoolean(partsChildren, plan) {
  const next = {};
  for (const [name, part] of Object.entries(partsChildren ?? {})) {
    if (plan.remove.includes(name)) continue;
    next[name] = name === plan.keep ? applyPartPatch(part, plan.patch) : part;
  }
  return next;
}

export function applyPartPatch(part, patch) {
  const out = { ...part, meta: { ...(part?.meta ?? {}) }, _children: { ...(part?._children ?? {}) } };
  for (const [path, value] of Object.entries(patch)) {
    const [head, ...rest] = path.split('.');
    if (!rest.length) {
      if (value === null) delete out[head]; else out[head] = value;
    } else if (head === 'meta') {
      if (value === null) delete out.meta[rest.join('.')]; else out.meta[rest.join('.')] = value;
    } else {
      out._children[head] = { ...(out._children[head] ?? { _type: head }) };
      if (value === null) delete out._children[head][rest.join('.')]; else out._children[head][rest.join('.')] = value;
    }
  }
  return out;
}
