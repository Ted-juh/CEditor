/**
 * Pure canvas snapping + distance math for the CanvasControl drag/resize
 * handlers. No Svelte dependencies — all store values and section readers
 * are passed in by the caller.
 */

import { rotatedRectBounds } from './transformMath.js';

const SNAP_THRESHOLD = 5;

const ALL_X_EDGES = ['left', 'center', 'right'];
const ALL_Y_EDGES = ['top', 'center', 'bottom'];

/** What another control occupies on screen: its rotated footprint, not its unrotated box. */
function footprintOf(transform) {
  const box = { x: Number(transform.x) || 0, y: Number(transform.y) || 0, w: Number(transform.width) || 0, h: Number(transform.height) || 0 };
  return rotatedRectBounds(box, transform.rotation);
}

/**
 * Find alignment snap guides against other controls + ruler guides.
 * Returns { x, y, guides[] } — the snapped position plus the visual guide
 * lines to draw. `guides` contains at most one per axis.
 *
 *   rect          — { x, y, w, h } proposed position of the dragged object
 *   selfId        — id of the dragged control (excluded from matching)
 *   otherControls — array of control objects
 *   rulerGuides   — { horizontal: number[], vertical: number[] }
 *   getSection    — (ctrl, name) => section (injected so utility stays pure)
 *   panelSize     — { width, height } to also snap against panel edges/centre
 *   threshold     — snap distance in PANEL units. Pass screenPx / scale so the
 *                   sticky zone feels the same at every zoom level; a fixed
 *                   panel-unit threshold is a 20-screen-px magnet at 400% and
 *                   barely one pixel at 25%.
 */
export function findAlignmentSnap(rect, selfId, otherControls, rulerGuides, getSection, panelSize = null, threshold = SNAP_THRESHOLD, edges = null) {
  const { x, y, w, h } = rect;
  const result = { x, y, guides: [] };
  let xIsCenter = false;
  let yIsCenter = false;

  // Our edges by axis — all three unless the caller names which may snap. A resize names only the
  // edges being dragged (snapResizeRect): snapping the far edge of a box being resized would move
  // the box instead of resizing it.
  const xAllowed = edges?.x ?? ALL_X_EDGES;
  const yAllowed = edges?.y ?? ALL_Y_EDGES;
  const myXEdges = [
    { name: 'left', offset: 0,     val: x },
    { name: 'center', offset: w / 2, val: x + w / 2 },
    { name: 'right', offset: w,     val: x + w },
  ].filter((edge) => xAllowed.includes(edge.name));
  const myYEdges = [
    { name: 'top', offset: 0,     val: y },
    { name: 'center', offset: h / 2, val: y + h / 2 },
    { name: 'bottom', offset: h,     val: y + h },
  ].filter((edge) => yAllowed.includes(edge.name));

  let bestDx = threshold;
  let bestDy = threshold;
  let bestSnapX = null;
  let bestSnapY = null;
  let xGuidePos = null;
  let yGuidePos = null;

  if (otherControls) {
    for (const other of otherControls) {
      const otherCore = getSection(other, 'Core');
      const otherTransform = getSection(other, 'Transform');
      if (!otherTransform || otherCore?.id === selfId) continue;

      // A rotated neighbour is lined up with by what you can see of it.
      const { x: ox, y: oy, w: ow, h: oh } = footprintOf(otherTransform);

      const otherXEdges = [ox, ox + ow / 2, ox + ow];
      const otherYEdges = [oy, oy + oh / 2, oy + oh];

      // X-axis alignment (vertical guide lines)
      for (const myEdge of myXEdges) {
        for (const oval of otherXEdges) {
          const dist = Math.abs(myEdge.val - oval);
          if (dist < bestDx) {
            bestDx = dist;
            bestSnapX = oval - myEdge.offset;
            xGuidePos = oval;
          }
        }
      }

      // Y-axis alignment (horizontal guide lines)
      for (const myEdge of myYEdges) {
        for (const oval of otherYEdges) {
          const dist = Math.abs(myEdge.val - oval);
          if (dist < bestDy) {
            bestDy = dist;
            bestSnapY = oval - myEdge.offset;
            yGuidePos = oval;
          }
        }
      }
    }
  }

  // Snap to vertical ruler guides (X positions)
  const vGuides = rulerGuides?.vertical ?? [];
  for (const gx of vGuides) {
    for (const myEdge of myXEdges) {
      const dist = Math.abs(myEdge.val - gx);
      if (dist < bestDx) {
        bestDx = dist;
        bestSnapX = gx - myEdge.offset;
        xGuidePos = gx;
      }
    }
  }

  // Snap to horizontal ruler guides (Y positions)
  const hGuides = rulerGuides?.horizontal ?? [];
  for (const gy of hGuides) {
    for (const myEdge of myYEdges) {
      const dist = Math.abs(myEdge.val - gy);
      if (dist < bestDy) {
        bestDy = dist;
        bestSnapY = gy - myEdge.offset;
        yGuidePos = gy;
      }
    }
  }

  // Snap to the panel's own edges + center (parity with the component
  // editor's artboard targets). Panel targets are checked last so they win
  // ties; the center is tagged so callers can draw it distinctly.
  if (panelSize && panelSize.width > 0 && panelSize.height > 0) {
    const xTargets = [
      { pos: 0, center: false },
      { pos: panelSize.width / 2, center: true },
      { pos: panelSize.width, center: false },
    ];
    const yTargets = [
      { pos: 0, center: false },
      { pos: panelSize.height / 2, center: true },
      { pos: panelSize.height, center: false },
    ];
    for (const t of xTargets) {
      for (const myEdge of myXEdges) {
        const dist = Math.abs(myEdge.val - t.pos);
        if (dist < bestDx) { bestDx = dist; bestSnapX = t.pos - myEdge.offset; xGuidePos = t.pos; xIsCenter = t.center; }
      }
    }
    for (const t of yTargets) {
      for (const myEdge of myYEdges) {
        const dist = Math.abs(myEdge.val - t.pos);
        if (dist < bestDy) { bestDy = dist; bestSnapY = t.pos - myEdge.offset; yGuidePos = t.pos; yIsCenter = t.center; }
      }
    }
  }

  if (bestSnapX !== null) {
    result.x = bestSnapX;
    result.guides.push({ type: 'vertical', pos: xGuidePos, center: xIsCenter });
  }
  if (bestSnapY !== null) {
    result.y = bestSnapY;
    result.guides.push({ type: 'horizontal', pos: yGuidePos, center: yIsCenter });
  }

  return result;
}

/**
 * Compute distance labels from the dragged object to:
 *   - Nearest non-selected neighbor on each side (if any, with perpendicular overlap)
 *   - Panel edge as fallback when no neighbor exists on that side
 *
 *   rect          — { x, y, w, h } dragged object's current position
 *   selfId        — id of the dragged control
 *   selectedIds   — Set of all selected ids (to exclude siblings that move together)
 *   otherControls — array of control objects
 *   panelSize     — { width, height }
 *   getSection    — (ctrl, name) => section
 */
/**
 * Snap a control being MOVED, by what is on screen. A rotated control's visible edges are its rotated
 * footprint's; snapping its unrotated box lined up edges nobody can see. `snap(box)` is the caller's
 * findAlignmentSnap; the footprint is snapped and the same shift applied to the control.
 */
export function snapMovingRect(rect, rotation, snap) {
  const footprint = rotatedRectBounds(rect, rotation);
  const snapped = snap(footprint);
  return { x: rect.x + (snapped.x - footprint.x), y: rect.y + (snapped.y - footprint.y), guides: snapped.guides };
}

/**
 * Snap a control being RESIZED: only the edges the handle drags may snap, and a snap changes the
 * size, never the position of the edge held still. Before this, a resize snapped like a move — the
 * whole box jumped so that SOME edge met the guide, so dragging a right edge to a neighbour could
 * shove the box sideways instead of widening it.
 *
 *   handle   'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br'
 *   snap     (rect, { x: [edge], y: [edge] }) => findAlignmentSnap result
 *   opts     { aspectLock, aspectRatio, minW, minH } — with the aspect locked only one axis snaps,
 *            and the other follows the ratio, so a snap cannot break it.
 *
 * Returns { x, y, w, h, guides }.
 */
export function snapResizeRect(rect, handle, snap, opts = {}) {
  const xEdge = handle.includes('l') ? 'left' : handle.includes('r') ? 'right' : null;
  const yEdge = handle.includes('t') ? 'top' : handle.includes('b') ? 'bottom' : null;
  const found = snap(rect, { x: xEdge ? [xEdge] : [], y: yEdge ? [yEdge] : [] });
  let vertical = found.guides.find((guide) => guide.type === 'vertical') ?? null;
  let horizontal = found.guides.find((guide) => guide.type === 'horizontal') ?? null;
  if (opts.aspectLock && vertical && horizontal) {
    // One axis only: keep the nearer snap.
    const dx = Math.abs(found.x - rect.x);
    const dy = Math.abs(found.y - rect.y);
    if (dx <= dy) horizontal = null; else vertical = null;
  }

  let { x, y, w, h } = rect;
  const right = x + w;
  const bottom = y + h;
  if (vertical) {
    if (xEdge === 'right') w = vertical.pos - x;
    else { x = vertical.pos; w = right - x; }
  }
  if (horizontal) {
    if (yEdge === 'bottom') h = horizontal.pos - y;
    else { y = horizontal.pos; h = bottom - y; }
  }
  if (opts.aspectLock && (vertical || horizontal)) {
    const ratio = opts.aspectRatio || (rect.w / Math.max(1, rect.h));
    if (vertical) {
      h = w / ratio;
      if (yEdge === 'top') y = bottom - h;
      else if (!yEdge) y = rect.y + rect.h / 2 - h / 2;
    } else {
      w = h * ratio;
      if (xEdge === 'left') x = right - w;
      else if (!xEdge) x = rect.x + rect.w / 2 - w / 2;
    }
  }
  // A snap that would collapse the box below its minimum is no snap.
  if (w < (opts.minW ?? 1) || h < (opts.minH ?? 1)) return { ...rect, guides: [] };
  return { x, y, w, h, guides: [vertical, horizontal].filter(Boolean) };
}

export function computeDistances(rect, selfId, selectedIds, otherControls, panelSize, getSection) {
  const labels = [];
  if (!otherControls) return labels;

  const { x, y, w, h } = rect;
  const myL = x, myR = x + w, myT = y, myB = y + h;
  const myCX = x + w / 2, myCY = y + h / 2;

  let nearestLeft = null;
  let nearestRight = null;
  let nearestTop = null;
  let nearestBottom = null;

  for (const other of otherControls) {
    const oc = getSection(other, 'Core');
    const ot = getSection(other, 'Transform');
    if (!ot || oc?.id === selfId) continue;
    // Skip components in the same selection — they move together
    if (selectedIds.has(oc?.id)) continue;

    const oL = ot.x, oR = ot.x + ot.width, oT = ot.y, oB = ot.y + ot.height;

    const vOverlap = myB > oT && myT < oB;
    const hOverlap = myR > oL && myL < oR;

    if (vOverlap && oR <= myL) {
      const gap = myL - oR;
      if (!nearestLeft || gap < nearestLeft.gap) nearestLeft = { gap };
    }
    if (vOverlap && oL >= myR) {
      const gap = oL - myR;
      if (!nearestRight || gap < nearestRight.gap) nearestRight = { gap };
    }
    if (hOverlap && oB <= myT) {
      const gap = myT - oB;
      if (!nearestTop || gap < nearestTop.gap) nearestTop = { gap };
    }
    if (hOverlap && oT >= myB) {
      const gap = oT - myB;
      if (!nearestBottom || gap < nearestBottom.gap) nearestBottom = { gap };
    }
  }

  // Fall back to panel edges when no neighbor on that side
  const leftGap   = nearestLeft   ? nearestLeft.gap   : myL;
  const rightGap  = nearestRight  ? nearestRight.gap  : panelSize.width - myR;
  const topGap    = nearestTop    ? nearestTop.gap    : myT;
  const bottomGap = nearestBottom ? nearestBottom.gap : panelSize.height - myB;

  if (leftGap > 0)
    labels.push({ axis: 'h', side: 'left',   dist: Math.round(leftGap),   x: myL - leftGap,   y: myCY, length: leftGap });
  if (rightGap > 0)
    labels.push({ axis: 'h', side: 'right',  dist: Math.round(rightGap),  x: myR,             y: myCY, length: rightGap });
  if (topGap > 0)
    labels.push({ axis: 'v', side: 'top',    dist: Math.round(topGap),    x: myCX,            y: myT - topGap, length: topGap });
  if (bottomGap > 0)
    labels.push({ axis: 'v', side: 'bottom', dist: Math.round(bottomGap), x: myCX,            y: myB, length: bottomGap });

  return labels;
}
