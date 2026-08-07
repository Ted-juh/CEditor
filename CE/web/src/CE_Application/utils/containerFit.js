// containerFit.js — a section's size derived from what is inside it.
//
// THE PROBLEM THIS EXISTS FOR. A section box drawn independently of the controls it encloses is a
// second source of truth for the same layout: move a knob and the box is wrong, and keeping the two
// agreeing is manual work forever. Deriving the box from its contents makes "the section is the
// wrong size" not a bug you fix but a state that cannot occur.
//
// PER AXIS, because that is what instrument panels actually need. A row of sections wants equal
// heights and variable widths, so width fits and height is locked. Expressed as two independent
// modes rather than one enum, which makes the four useful configurations fall out of one rule:
//
//     width      height     what you get
//     locked     locked     today's behaviour, and the default — nothing existing changes
//     contents   contents   pure fit, with minimums at 0
//     contents   contents   fit but never smaller than min (minWidth / minHeight)
//     contents   locked     equal-height row, variable widths
//
// THE CIRCULARITY GUARD, which is the whole correctness story. A child's position is expressed
// inside its container's content box, and the container's size is derived from its children. Read
// those two facts in the wrong order and you get a loop: the container shrinks, which moves nothing
// (children are positioned from the content origin), but a naive implementation that measured
// children in PANEL space would see them move and resize again, and so on.
//
// So the rule, stated once and obeyed everywhere below: fit reads a child's INTRINSIC box — its own
// x, y, width, height in its parent's frame — and never anything derived from the parent. One
// bottom-up pass, deepest first, and the result cannot depend on itself.

import { numberOr } from './primitives.js';
import { getChildControls } from './containment.js';

/** Fit modes, per axis. */
export const FIT_LOCKED = 'locked';
export const FIT_CONTENTS = 'contents';

const num = (value, fallback = 0) => numberOr(value, fallback);

/** An explicitly-set side, or the shared padding. Unset means null/undefined, NOT zero. */
const sideOr = (value, fallback) => (value == null ? fallback : num(value, fallback));

/**
 * The Children section's fit settings, defaulted.
 *
 * `padding` stays a single number for backwards compatibility — every existing panel has it — and
 * the per-side values fall back to it when unset. A section header wants more room at the top than
 * at the sides, which one number cannot express.
 */
export function fitSettings(control) {
  const children = control?._children?.Children ?? {};
  const pad = num(children.padding, 0);
  return {
    width: children.fitWidth === FIT_CONTENTS ? FIT_CONTENTS : FIT_LOCKED,
    height: children.fitHeight === FIT_CONTENTS ? FIT_CONTENTS : FIT_LOCKED,
    minWidth: Math.max(0, num(children.minWidth, 0)),
    minHeight: Math.max(0, num(children.minHeight, 0)),
    // `?? pad` and not numberOr(value, pad): Number(null) is a finite 0, so numberOr accepts an
    // unset side as a real zero and the shared padding never applies. Caught by asserting that
    // padding 10 with the sides unset gives 10 on every side, which it did not.
    padding: {
      left: sideOr(children.paddingLeft, pad),
      right: sideOr(children.paddingRight, pad),
      top: sideOr(children.paddingTop, pad),
      bottom: sideOr(children.paddingBottom, pad),
    },
  };
}

export const fitsAnyAxis = (control) => {
  const fit = fitSettings(control);
  return fit.width === FIT_CONTENTS || fit.height === FIT_CONTENTS;
};

/** Does this control derive the given axis, so a drag on that edge would snap back? */
export function axisIsDerived(control, axis) {
  const fit = fitSettings(control);
  return (axis === 'width' ? fit.width : fit.height) === FIT_CONTENTS;
}

/**
 * The box a container's children occupy, in the container's own content frame.
 *
 * Measured from 0 rather than from the leftmost child: a child at x=40 means the author wants 40px
 * of space before it, and collapsing that would move every child the moment the container fitted.
 * Fitting must change the container's SIZE and nothing else — if it also shifted the contents, the
 * panel would drift a little every time you toggled it.
 *
 * `sizeOf` lets a caller substitute an already-fitted size for a nested container, which is how the
 * bottom-up pass works without mutating anything.
 */
export function contentExtent(children, sizeOf = null) {
  let right = 0;
  let bottom = 0;

  for (const child of children ?? []) {
    if (child?._children?.Core?.visible === false) continue;
    const transform = child?._children?.Transform;
    if (!transform) continue;

    const size = sizeOf?.(child) ?? null;
    const width = size ? size.width : num(transform.width);
    const height = size ? size.height : num(transform.height);

    right = Math.max(right, num(transform.x) + width);
    bottom = Math.max(bottom, num(transform.y) + height);
  }

  return { width: right, height: bottom };
}

/**
 * The size this control should be, given its children.
 *
 * A locked axis keeps whatever the Transform says, so a half-fitted container is exactly as
 * predictable as a fully locked one.
 */
export function fittedSize(control, children, sizeOf = null) {
  const fit = fitSettings(control);
  const transform = control?._children?.Transform ?? {};

  if (fit.width === FIT_LOCKED && fit.height === FIT_LOCKED) {
    return { width: num(transform.width), height: num(transform.height) };
  }

  const extent = contentExtent(children, sizeOf);

  return {
    width: fit.width === FIT_CONTENTS
      ? Math.max(fit.minWidth, extent.width + fit.padding.left + fit.padding.right)
      : num(transform.width),
    height: fit.height === FIT_CONTENTS
      ? Math.max(fit.minHeight, extent.height + fit.padding.top + fit.padding.bottom)
      : num(transform.height),
  };
}

/**
 * One container's fitted size, resolving nested fitted containers on the way.
 *
 * The tree-wide `resolveFittedSizes` below is the efficient form, but a Svelte component tree does
 * not render bottom-up — each CanvasControl derives its own size, and a parent has no way to ask a
 * child component what it decided. So a container that fits resolves its own subtree. Depth is one
 * or two in practice; the alternative is threading a precomputed map through every render prop,
 * which is a lot of wiring to save a walk over a handful of children.
 */
export function fittedSizeDeep(control) {
  const children = getChildControls(control);
  return fittedSize(control, children, (child) => (fitsAnyAxis(child) ? fittedSizeDeep(child) : null));
}

/**
 * Resolve every fitted container in a tree, deepest first.
 *
 * Returns a Map of control id -> { width, height } holding ONLY the controls whose size differs
 * from their Transform, so a panel with no fitted containers produces an empty map and every caller
 * can skip the whole mechanism on a cheap `.size === 0`.
 *
 * Inside-out is not a preference: a section that fits its contents cannot know its own size until
 * every nested section inside it knows its own. Doing it top-down would size the outer one against
 * stale inner sizes and settle a frame late, which reads as the layout "catching up" after a drag.
 */
export function resolveFittedSizes(controls) {
  const sizes = new Map();

  const visit = (control) => {
    const children = getChildControls(control);
    for (const child of children) visit(child);

    if (!fitsAnyAxis(control)) return;

    const size = fittedSize(control, children, (child) => sizes.get(child?._children?.Core?.id) ?? null);
    const transform = control?._children?.Transform ?? {};
    if (size.width === num(transform.width) && size.height === num(transform.height)) return;

    const id = control?._children?.Core?.id;
    if (id != null) sizes.set(id, size);
  };

  for (const control of controls ?? []) visit(control);
  return sizes;
}
