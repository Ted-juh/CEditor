/**
 * floatingUi.js — every popup that has to stay on screen next to something, positioned by one engine
 * (Floating UI).
 *
 * The editor had about twenty menus, popovers and dropdowns, each keeping itself on screen its own way:
 * a shared placeMenu for some context menus, constants for another (the layer tree's menu assumed every
 * menu was 200×330), `top: 100%` and hope for the menu bar, nothing at all for others. None of them
 * followed its anchor when the window was resized or its container scrolled. `use:floating` replaces
 * all of it with one rule, the one every desktop menu follows:
 *
 *   - open on the preferred side of the anchor (for a context menu: down and right of the pointer);
 *   - FLIP to the other side when there is not room — never merely slide under the pointer, which would
 *     put an item under the cursor and swallow the first click;
 *   - slide along an edge only when neither side fits;
 *   - scroll only when the popup is taller than the whole window (a menu that merely does not fit on one
 *     side flips instead, and a scrolling menu would also clip the submenus hanging outside it);
 *   - follow the anchor while it is open: a resize, a scroll, the anchor moving.
 *
 * The anchor is an element, or a point in viewport coordinates `{ x, y }` (a pointer). The popup is
 * `position: fixed`, so it escapes every scrolling ancestor; it is hidden until it has been placed, so it
 * never visibly jumps into position.
 */
import { autoUpdate, computePosition, flip, offset as offsetMiddleware, shift } from '@floating-ui/dom';

export const FLOAT_MARGIN = 6;

function referenceFor(anchor, node) {
  if (!anchor) return null;
  // A submenu hangs off the item it is nested in.
  if (anchor === 'parent') return node.parentElement;
  if (typeof anchor.getBoundingClientRect === 'function') return anchor;
  const x = Number(anchor.x) || 0;
  const y = Number(anchor.y) || 0;
  const width = Number(anchor.width) || 0;
  const height = Number(anchor.height) || 0;
  return {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height }),
  };
}

/**
 * The action. Options:
 *   anchor      Element | a point { x, y } | a box { x, y, width, height } (a caret's line, say) |
 *               'parent' (the element it is nested in) | null — null leaves it hidden
 *   placement   Floating UI placement, default 'bottom-start' (below, left edges aligned)
 *   offset      gap from the anchor: a number, or { mainAxis, crossAxis }
 *   padding     how close to the window edge it may come (default 6px)
 *   fallbackPlacements   where to flip to, in order (default: the opposite side)
 *   fit         cap the height to the window and scroll when taller (default true)
 *   slide       when neither side fits, slide across the anchor into the window (default true); a menu
 *               bar's dropdown says false, because sliding up would cover the bar
 *   track       follow the anchor on resize / scroll (default true)
 *   onplace     called with { x, y, placement, clipped } after each placement
 */
export function floating(node, options = {}) {
  let current = options;
  let stop = null;
  let generation = 0;

  node.style.position = 'fixed';
  node.style.visibility = 'hidden';
  node.style.left = '0px';
  node.style.top = '0px';

  function fitHeight(padding) {
    // Measured uncapped, so a popup that has grown back below the window stops scrolling.
    node.style.maxHeight = '';
    node.style.overflowY = '';
    const room = window.innerHeight - padding * 2;
    const clipped = node.scrollHeight > room;
    if (clipped) {
      node.style.maxHeight = `${Math.max(0, room)}px`;
      node.style.overflowY = 'auto';
    }
    return clipped;
  }

  async function place() {
    const reference = referenceFor(current.anchor, node);
    if (!reference) {
      node.style.visibility = 'hidden';
      return;
    }
    const mine = ++generation;
    const padding = current.padding ?? FLOAT_MARGIN;
    const clipped = current.fit === false ? false : fitHeight(padding);
    const result = await computePosition(reference, node, {
      strategy: 'fixed',
      placement: current.placement ?? 'bottom-start',
      middleware: [
        offsetMiddleware(current.offset ?? 0),
        flip({ padding, fallbackPlacements: current.fallbackPlacements }),
        // Along the edge, and — only once flipping has failed — across it too.
        shift({ padding, crossAxis: current.slide !== false }),
      ],
    });
    if (mine !== generation) return;
    node.style.left = `${Math.round(result.x)}px`;
    node.style.top = `${Math.round(result.y)}px`;
    node.style.visibility = 'visible';
    node.dataset.placement = result.placement;
    current.onplace?.({ x: result.x, y: result.y, placement: result.placement, clipped });
  }

  function start() {
    stop?.();
    stop = null;
    const reference = referenceFor(current.anchor, node);
    if (!reference) {
      place();
      return;
    }
    if (current.track === false) {
      place();
      return;
    }
    // A point has no element to watch; it still follows the window.
    stop = typeof Element !== 'undefined' && reference instanceof Element
      ? autoUpdate(reference, node, place)
      : autoUpdate(reference, node, place, { ancestorScroll: false, elementResize: true, layoutShift: false });
  }

  start();
  return {
    update(next) {
      current = next ?? {};
      start();
    },
    destroy() {
      generation += 1;
      stop?.();
    },
  };
}

/** Place once, now — for a popup that is not a Svelte element (or a test). Resolves with the placement. */
export function placeFloating(node, anchor, options = {}) {
  return new Promise((resolve) => {
    const handle = floating(node, { ...options, anchor, track: false, onplace: (placed) => { handle.destroy(); resolve(placed); } });
  });
}
