/**
 * Pure geometry helpers for the CanvasControl drag / resize / rotate
 * handlers. Each function takes inputs and returns a result object —
 * no side effects, no store reads.
 */

/**
 * Apply a resize handle drag to a starting rect. Handles are 1-2 char
 * strings ('l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br') where each letter
 * names an edge that is being dragged.
 *
 *   startRect — { x, y, w, h } at mousedown
 *   handle    — resize handle id
 *   dx, dy    — mouse delta in panel-space (already divided by scale)
 *   opts      — { aspectLock, aspectRatio, minW, minH, maxW, maxH }
 *
 * Returns { x, y, w, h }. Min/max and aspect-ratio lock are applied in that
 * order so the result is always valid.
 */
export function computeResizedRect(startRect, handle, dx, dy, opts) {
  let { x, y, w, h } = startRect;

  // Apply deltas based on handle position
  if (handle.includes('r')) { w += dx; }
  if (handle.includes('l')) { x += dx; w -= dx; }
  if (handle.includes('b')) { h += dy; }
  if (handle.includes('t')) { y += dy; h -= dy; }

  // Aspect ratio lock applies only on corner handles (2 chars)
  if (opts.aspectLock && handle.length === 2) {
    const aspect = opts.aspectRatio ?? (startRect.w / startRect.h);
    if (Math.abs(dx) > Math.abs(dy)) {
      h = w / aspect;
      if (handle.includes('t')) y = startRect.y + startRect.h - h;
    } else {
      w = h * aspect;
      if (handle.includes('l')) x = startRect.x + startRect.w - w;
    }
  }

  // Enforce min/max size constraints. When a left/top edge is dragged and
  // the size clamps, the opposite edge must stay anchored — so x/y shift.
  if (w < opts.minW) {
    w = opts.minW;
    if (handle.includes('l')) x = startRect.x + startRect.w - opts.minW;
  }
  if (h < opts.minH) {
    h = opts.minH;
    if (handle.includes('t')) y = startRect.y + startRect.h - opts.minH;
  }
  if (opts.maxW > 0 && w > opts.maxW) {
    w = opts.maxW;
    if (handle.includes('l')) x = startRect.x + startRect.w - opts.maxW;
  }
  if (opts.maxH > 0 && h > opts.maxH) {
    h = opts.maxH;
    if (handle.includes('t')) y = startRect.y + startRect.h - opts.maxH;
  }

  return { x, y, w, h };
}

/**
 * Snap a rect's size to a grid. x/y are snapped via `snapX`/`snapY` callbacks
 * (which may account for a grid origin offset). w/h are rounded to the
 * nearest grid cell, with a minimum of one cell.
 */
export function snapRectToGrid(rect, gridSize, snapX, snapY) {
  if (gridSize <= 0) return rect;
  return {
    x: snapX(rect.x),
    y: snapY(rect.y),
    w: Math.round(rect.w / gridSize) * gridSize || gridSize,
    h: Math.round(rect.h / gridSize) * gridSize || gridSize,
  };
}

/**
 * Snap an (x, y) position to the grid, accounting for a non-zero origin.
 *   (val - origin) / gridSize, rounded, times gridSize, plus origin back.
 */
export function snapToGridAxis(val, gridSize, origin) {
  if (gridSize <= 0) return val;
  return Math.round((val - origin) / gridSize) * gridSize + origin;
}

/**
 * Convert a client point to panel-space coordinates relative to a surface
 * element. Returns { x, y } or null if the surface is missing.
 */
export function clientToPanelPoint(surfaceEl, clientX, clientY, scale) {
  const rect = surfaceEl?.getBoundingClientRect();
  if (!rect) return null;
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

/**
 * Angle from center (cx, cy) to a panel-space point, in radians.
 * Used by the rotate handler.
 */
export function angleFromCenter(cx, cy, x, y) {
  return Math.atan2(y - cy, x - cx);
}

/**
 * Compute a new rotation value from a rotate-drag.
 *
 *   startAngle     — angle at mousedown (radians)
 *   currentAngle   — angle now (radians)
 *   startRotation  — rotation in degrees at mousedown
 *   snap           — true to round to 15° increments (Shift key)
 *
 * Returns rotation in degrees.
 */
export function computeRotation(startAngle, currentAngle, startRotation, snap) {
  const delta = (currentAngle - startAngle) * (180 / Math.PI);
  let newRotation = startRotation + delta;
  if (snap) newRotation = Math.round(newRotation / 15) * 15;
  return newRotation;
}

/**
 * Normalise a rotation to 0-360° with one decimal place.
 * Used when writing the final rotation back to the store.
 */
export function normalizeRotation(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return Math.round(d * 10) / 10;
}

/**
 * CSS `style=""` fragment for a resize handle. The handle visual is an
 * 8×8 square centered on its target edge/corner; `-4px` offset on each
 * side anchors it across the border.
 */
const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;
const HANDLE_OFF  = -HANDLE_HALF;
const HANDLE_POSITIONS = {
  tl: `top:${HANDLE_OFF}px;left:${HANDLE_OFF}px;`,
  t:  `top:${HANDLE_OFF}px;left:calc(50% - ${HANDLE_HALF}px);`,
  tr: `top:${HANDLE_OFF}px;right:${HANDLE_OFF}px;`,
  l:  `top:calc(50% - ${HANDLE_HALF}px);left:${HANDLE_OFF}px;`,
  r:  `top:calc(50% - ${HANDLE_HALF}px);right:${HANDLE_OFF}px;`,
  bl: `bottom:${HANDLE_OFF}px;left:${HANDLE_OFF}px;`,
  b:  `bottom:${HANDLE_OFF}px;left:calc(50% - ${HANDLE_HALF}px);`,
  br: `bottom:${HANDLE_OFF}px;right:${HANDLE_OFF}px;`,
};

export function resizeHandleStyle(id) {
  return `width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;${HANDLE_POSITIONS[id]}`;
}
