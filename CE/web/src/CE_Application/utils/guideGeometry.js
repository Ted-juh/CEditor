/**
 * Geometry for ruler guides: pulling a new one out of a ruler, and drawing one across the
 * pasteboard instead of stopping it at the panel edge.
 *
 * Both halves exist because the guide layer had grown two blind spots that only showed up in use.
 *
 * PULLING ONE OUT. `EditorRuler` registered a mousemove handler that was literally `() => {}`, so
 * a create-drag drew nothing at all: you pressed on the ruler, dragged into the void, released,
 * and only then found out where the guide had landed. The fix is not local drag state — the ruler
 * is not the only thing that has to draw the pending guide. `GuideLines` has to paint the full
 * line across the canvas at the same time, and the OTHER ruler has to show its marker (drag down
 * out of the horizontal ruler and you create a *horizontal* guide, which is marked on the
 * vertical ruler). They stay in agreement by all reading the one `draggingGuide` store the
 * move-drag already publishes to, which is what that store's comment says it is for. A pending
 * guide is not in the document yet, so it cannot be addressed by index like a real one; it
 * carries `index: PENDING_GUIDE_INDEX` and `creating: true` so no existing guide ever matches it.
 *
 * DRAWING ONE. Guides were rendered `left:0; right:0` inside a wrapper with `inset: 0`, so a guide
 * spanned exactly the panel box and floated above the pasteboard. Every design tool runs its
 * guides across the whole visible canvas, and there is a concrete reason beyond looks: during
 * editing `.panel-surface` is `overflow: visible` (see the comment above that rule — selection
 * handles at x:0 were being clipped), so a control can legitimately sit half off the artboard and
 * there was no line to align it to out there. `pasteboardExtent` measures how far the viewport
 * reaches past the panel and the guides are stretched by exactly that, still positioned in panel
 * coordinates. Measured rather than a generous fixed overhang: overflow to the right and bottom
 * grows the scrollable area of an `overflow: auto` ancestor, and a guide with a 5000px tail would
 * hand the canvas scrollbars pointing at nothing.
 *
 * Everything here is pure — no Svelte, no stores, no DOM lookups; callers pass rects in.
 */

/** Index carried by a guide that is being dragged out of a ruler and does not exist yet. */
export const PENDING_GUIDE_INDEX = -1;

/** A panel with no pasteboard around it: guides span the panel box and nothing more. */
export const NO_PASTEBOARD = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });

/** Scale guard: a zero or missing scale would divide screen pixels into infinity. */
function safeScale(scale) {
  const s = Number(scale);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * State of a guide being dragged out of a ruler, from one pointer position.
 *
 * `orientation` is the orientation of the GUIDE, not of the ruler it came from. `outside` is the
 * whole cancel rule: while the pointer is still over the ruler the drag has not produced a guide
 * yet, and returning to the ruler takes it back — the boundary test is the same `> rect.bottom` /
 * `> rect.right` the commit path always used, kept identical so the preview cannot promise a
 * guide that mouseup then refuses to create.
 *
 * `pos` is rounded here because guides are stored rounded (`addGuide`/`updateGuide` both round);
 * previewing an unrounded position would shift the line by a fraction of a unit on release.
 */
export function rulerCreateDrag(orientation, point, rulerRect, surfaceRect, scale) {
  if (!point || !rulerRect || !surfaceRect) return null;
  const s = safeScale(scale);
  if (orientation === 'horizontal') {
    return {
      orientation,
      outside: point.clientY > rulerRect.bottom,
      pos: Math.round((point.clientY - surfaceRect.top) / s),
    };
  }
  return {
    orientation,
    outside: point.clientX > rulerRect.right,
    pos: Math.round((point.clientX - surfaceRect.left) / s),
  };
}

/**
 * The `draggingGuide` value for a create-drag, or null when there is nothing to preview.
 *
 * Null for a drag still inside the ruler is deliberate: publishing null clears the preview, so
 * the canvas shows exactly what releasing there would leave behind, which is nothing.
 */
export function pendingGuideOf(drag) {
  if (!drag || !drag.outside) return null;
  return {
    orientation: drag.orientation,
    index: PENDING_GUIDE_INDEX,
    pos: drag.pos,
    creating: true,
  };
}

/** The pending create-drag on this axis, if that is what `draggingGuide` currently holds. */
export function pendingGuideFor(dragging, orientation) {
  if (!dragging?.creating) return null;
  return dragging.orientation === orientation ? dragging : null;
}

/**
 * How far the visible canvas reaches past the panel on each side, in PANEL units.
 *
 * `surfaceRect` is the panel surface's on-screen box (already scaled by the zoom transform),
 * `viewRect` the scroll/clip box around it. Dividing by `scale` is the same zoom compensation the
 * rest of this layer does — sizes written inside the scaled surface must be panel units or they
 * change meaning with the zoom (review S1).
 *
 * Each side is inset by one screen pixel before the conversion. That pixel is the whole reason
 * the right and bottom edges do not add scrollable overflow: a guide that ended exactly on the
 * viewport edge can round outward by a sub-pixel and nudge `scrollWidth` up on every re-measure.
 */
export function pasteboardExtent(surfaceRect, viewRect, scale) {
  if (!surfaceRect || !viewRect) return NO_PASTEBOARD;
  const s = safeScale(scale);
  const side = (px) => (Number.isFinite(px) && px > 1 ? (px - 1) / s : 0);
  return {
    left: side(surfaceRect.left - viewRect.left),
    top: side(surfaceRect.top - viewRect.top),
    right: side(viewRect.right - surfaceRect.right),
    bottom: side(viewRect.bottom - surfaceRect.bottom),
  };
}

/** True when two extents are close enough that redrawing would not move anything. */
export function sameExtent(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
}

/**
 * Inline style for one guide line: positioned in panel coordinates, stretched over the pasteboard.
 *
 * The cross-axis offsets are negative because the guide wrapper is `inset: 0` on the panel box —
 * reaching into the pasteboard means going outside that box, which `.panel-surface`'s
 * `overflow: visible` allows and export/preview still clip away.
 */
export function guideLineStyle(orientation, pos, extent, lineWidth) {
  const e = extent ?? NO_PASTEBOARD;
  const px = (v) => `${Math.round(v * 100) / 100}px`;
  if (orientation === 'horizontal') {
    return `top:${px(pos)}; left:${px(-e.left)}; right:${px(-e.right)}; border-top-width:${lineWidth}px;`;
  }
  return `left:${px(pos)}; top:${px(-e.top)}; bottom:${px(-e.bottom)}; border-left-width:${lineWidth}px;`;
}
