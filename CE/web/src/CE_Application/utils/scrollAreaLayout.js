// scrollAreaLayout.js — a container that clips, and a scrollbar for what is past the edge.
//
// The last of the backlog's container components. Mechanically small; what it has to get right is
// the CONTENT EXTENT, because everything else follows from it and getting it wrong is silent.
//
// The extent is the bounding box of the children, NOT the container's own size and not a number the
// author sets. An author-set extent goes stale the moment a control moves — the scrollbar then
// stops short of a control that is really there, or scrolls past the end into nothing, and both
// look like the scroll area is broken rather than like the number is.
//
// PURE. The renderer applies the offset and the clip; this decides how far there is to go.

import { getChildControls } from './containment.js';

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, num(value, lo)));

export function scrollConfig(control) {
  return control?._children?.ScrollArea ?? {};
}

/**
 * How far the children reach.
 *
 * Measured from the children's own transforms, so it is right by construction. A child at a
 * negative position extends the extent BACKWARDS, which the scrollbar has to be able to reach:
 * a control dragged above the top of a scroll area is not deleted, and refusing to scroll to it
 * would strand it.
 */
export function contentExtent(control) {
  // `getChildControls`, not `control.children`. A container's children live in the model at
  // `_children.Children._children`, as a MAP keyed by id — there is no `children` array on a
  // control and never was. Reading one returned an empty list for every real scroll area, so the
  // extent was always zero, `scrollGeometry` never saw anything past the edge, and the scrollbar
  // never appeared. Which is the exact failure this file's header warns about, arrived at from the
  // other side: the extent was wrong and nothing looked wrong.
  //
  // It passed its tests because they built `{ children: [...] }` by hand. A fixture that invents a
  // shape the model does not use tests the fixture.
  const children = getChildControls(control);
  if (children.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const t = child?._children?.Transform ?? {};
    const x = num(t.x, 0);
    const y = num(t.y, 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + num(t.width, 0));
    maxY = Math.max(maxY, y + num(t.height, 0));
  }

  // The visible origin is 0, so an extent that starts below it still has to include it — otherwise
  // scrolling to the top would land somewhere in the middle of the content.
  minX = Math.min(0, minX);
  minY = Math.min(0, minY);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Geometry: the viewport, minus whichever scrollbars are actually needed. */
export function scrollGeometry(width, height, control) {
  const config = scrollConfig(control);
  const bar = Math.max(0, num(config.scrollbarSize, 10));
  const extent = contentExtent(control);
  const w = Math.max(1, num(width, 0));
  const h = Math.max(1, num(height, 0));

  const mode = String(config.direction ?? 'vertical');
  const wantsX = (mode === 'horizontal' || mode === 'both') && extent.width > w;
  const wantsY = (mode === 'vertical' || mode === 'both') && extent.height > h;

  // A scrollbar takes space, which can make the OTHER axis overflow when it did not before. Checked
  // once rather than iterated: one pass is enough for two axes, and a loop here would be a loop
  // that can oscillate.
  const showY = wantsY || ((mode === 'vertical' || mode === 'both') && wantsX && extent.height > h - bar);
  const showX = wantsX || ((mode === 'horizontal' || mode === 'both') && showY && extent.width > w - bar);

  return {
    viewport: { x: 0, y: 0, w: w - (showX ? 0 : 0) - (showY ? bar : 0), h: h - (showX ? bar : 0) },
    showX,
    showY,
    bar,
    extent,
  };
}

/** The furthest the content can be scrolled. Never negative — content that fits does not scroll. */
export function maxScroll(width, height, control) {
  const geom = scrollGeometry(width, height, control);
  return {
    x: Math.max(0, geom.extent.width - geom.viewport.w),
    y: Math.max(0, geom.extent.height - geom.viewport.h),
  };
}

/** Clamp a scroll position into range. */
export function clampScroll(offset, width, height, control) {
  const max = maxScroll(width, height, control);
  return {
    x: clamp(num(offset?.x, 0), 0, max.x),
    y: clamp(num(offset?.y, 0), 0, max.y),
  };
}

/**
 * Where a wheel notch takes it.
 *
 * `line` mode moves by a stated step so a wheel notch is a predictable distance; `smooth` passes
 * the raw delta through, which is what a trackpad wants. Clamped both ways, because a wheel event
 * arriving after the content shrank must not leave the view past the end.
 */
export function scrollByWheel(offset, delta, width, height, control) {
  const config = scrollConfig(control);
  const smooth = String(config.scrollMode ?? 'line') === 'smooth';
  const step = smooth
    ? Math.max(-120, Math.min(120, num(delta?.y, 0)))
    : num(config.lineHeight, 24) * Math.sign(num(delta?.y, 0));
  const stepX = smooth
    ? Math.max(-120, Math.min(120, num(delta?.x, 0)))
    : num(config.lineHeight, 24) * Math.sign(num(delta?.x, 0));

  return clampScroll({ x: num(offset?.x, 0) + stepX, y: num(offset?.y, 0) + step }, width, height, control);
}

/**
 * The scrollbar thumb.
 *
 * A minimum length, because a thumb proportional to a very long content is a few pixels tall and
 * cannot be grabbed — at which point the scrollbar is decoration.
 */
export function thumbRect(axis, offset, width, height, control, { minLength = 24 } = {}) {
  const geom = scrollGeometry(width, height, control);
  const vertical = axis === 'y';
  const track = vertical ? geom.viewport.h : geom.viewport.w;
  const content = vertical ? geom.extent.height : geom.extent.width;
  if (content <= track) return null;

  const length = Math.max(minLength, (track * track) / content);
  const max = Math.max(1, content - track);
  const position = (clamp(num(vertical ? offset?.y : offset?.x, 0), 0, max) / max) * (track - length);

  return vertical
    ? { x: geom.viewport.w, y: position, w: geom.bar, h: length }
    : { x: position, y: geom.viewport.h, w: length, h: geom.bar };
}

/** Is this child visible at the current offset? Used to skip drawing what is off-screen. */
export function isChildVisible(child, offset, width, height) {
  const t = child?._children?.Transform ?? {};
  const x = num(t.x, 0) - num(offset?.x, 0);
  const y = num(t.y, 0) - num(offset?.y, 0);
  return x + num(t.width, 0) > 0 && y + num(t.height, 0) > 0
    && x < num(width, 0) && y < num(height, 0);
}

export function scrollPorts(control, parameterTypes = null) {
  const types = parameterTypes ?? {};
  const numeric = [types.INTEGER ?? 'integer', types.FLOAT ?? 'float', types.NORMALIZED ?? 'normalized'].filter(Boolean);
  return [
    { id: 'scrollX', label: 'Scroll X', accepts: numeric, defaultBindingMode: 'continuous' },
    { id: 'scrollY', label: 'Scroll Y', accepts: numeric, defaultBindingMode: 'continuous' },
  ];
}
