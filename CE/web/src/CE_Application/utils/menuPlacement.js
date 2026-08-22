/**
 * Where a floating menu actually fits.
 *
 * A context menu is positioned at the pointer, and a pointer near the right
 * or bottom edge of the window is the ordinary case, not the exotic one —
 * right-clicking the last control in a layout, or anything in the bottom row,
 * put the menu half outside the window with no way to reach the items that
 * had fallen off. `position: fixed` does not clamp, and neither did we.
 *
 * The rule every desktop menu uses: open down-and-right from the pointer when
 * there is room, FLIP to the other side of it when there is not (never merely
 * slide, which would put the menu under the cursor and swallow the first
 * click), and only clamp when even the flipped side overflows — which means
 * the menu is taller than the window and has to scroll.
 *
 * Pure geometry, so it can be tested without a browser: the component
 * measures, this decides.
 */

export const MENU_MARGIN = 6;

/**
 * @param anchorX/anchorY  the pointer, in viewport coordinates
 * @param size             { width, height } of the measured menu
 * @param viewport         { width, height }
 * @returns { left, top, maxHeight, clipped, flippedX, flippedY }
 */
export function placeMenu(anchorX, anchorY, size, viewport, margin = MENU_MARGIN) {
  const vw = Math.max(0, viewport?.width ?? 0);
  const vh = Math.max(0, viewport?.height ?? 0);
  const w = Math.max(0, size?.width ?? 0);
  const h = Math.max(0, size?.height ?? 0);

  const flippedX = anchorX + w > vw - margin && anchorX - w >= margin;
  const flippedY = anchorY + h > vh - margin && anchorY - h >= margin;

  let left = flippedX ? anchorX - w : anchorX;
  let top = flippedY ? anchorY - h : anchorY;

  // Neither side fits: park it against the edge. The height cap turns the
  // overflow into a scroll rather than items nobody can reach.
  left = Math.min(Math.max(margin, left), Math.max(margin, vw - margin - w));
  top = Math.min(Math.max(margin, top), Math.max(margin, vh - margin - h));

  // `clipped` only when the menu is taller than the whole window. The caller
  // must not scroll it otherwise: `overflow-y: auto` computes overflow-x to
  // `auto` too, which would clip the submenus that hang outside the menu box.
  const maxHeight = Math.max(0, vh - margin * 2);
  return { left, top, maxHeight, clipped: h > maxHeight, flippedX, flippedY };
}

/**
 * A submenu opens rightward out of its parent item, and flips leftward when
 * the window's right edge is closer than the submenu is wide. Vertically it
 * starts level with its parent item and is only pushed up far enough to fit.
 *
 * `top` is returned relative to the parent ITEM (the positioning context is
 * the `.ctx-sub-wrapper`), which is why the default is the -4 that lines the
 * submenu's padding up with the item rather than 0.
 *
 * @param itemRect  the parent item's viewport rect { top, left, right, width }
 * @param size      { width, height } of the measured submenu
 * @param viewport  { width, height }
 * @returns { side: 'right' | 'left', top }
 */
export function placeSubmenu(itemRect, size, viewport, margin = MENU_MARGIN) {
  const vw = Math.max(0, viewport?.width ?? 0);
  const vh = Math.max(0, viewport?.height ?? 0);
  const w = Math.max(0, size?.width ?? 0);
  const h = Math.max(0, size?.height ?? 0);
  const itemTop = itemRect?.top ?? 0;
  const itemRight = itemRect?.right ?? 0;
  const itemLeft = itemRect?.left ?? 0;

  // Flip only when the far side is genuinely better, so a submenu on a narrow
  // window does not hop to a side that overflows just as badly.
  const side = (itemRight + w > vw - margin && itemLeft - w >= margin) ? 'left' : 'right';

  let top = -4;
  const overflow = (itemTop + top + h) - (vh - margin);
  if (overflow > 0) top -= overflow;
  if (itemTop + top < margin) top = margin - itemTop;

  return { side, top };
}
