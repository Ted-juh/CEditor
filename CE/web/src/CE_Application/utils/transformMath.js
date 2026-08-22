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
 *   opts      — { aspectLock, aspectRatio, minW, minH, maxW, maxH, fromCenter }
 *
 * `fromCenter` (Alt/Option held) grows and shrinks the rect about its own
 * centre instead of about the opposite edge/corner: the dragged edge follows
 * the pointer and the opposite edge mirrors it, so a corner dragged 10 units
 * out widens the box by 20 and the centre never moves.
 *
 * Returns { x, y, w, h }. The aspect-ratio lock runs first and the min/max
 * clamp second, so the clamp always has the last word on the size (a corner
 * drag that hits maxW therefore stops obeying the ratio — long-standing
 * behaviour, deliberately preserved).
 *
 * The size is computed first and the box is *positioned last*, from whichever
 * point the gesture holds fixed. That ordering is the whole trick. This used
 * to move x/y with the deltas and then patch them back up inside each clamp
 * ("if the handle has an 'l', shift x by however much the clamp ate"); adding
 * a second anchor to that shape would have meant one fixup per handle per
 * mode, and the from-centre half of them would have been wrong the moment the
 * aspect lock also changed the size. The restructure was checked against the
 * old arithmetic over 200k random handle/delta/constraint combinations and
 * agrees on every one of them; the awkward corners are pinned in
 * test/groupRotationAndCentreResize.test.js.
 */
export function computeResizedRect(startRect, handle, dx, dy, opts) {
  const fromCenter = opts?.fromCenter === true;
  // From-centre moves both edges, so the dragged edge still tracks the
  // pointer exactly while the size changes twice as fast.
  const gain = fromCenter ? 2 : 1;

  let w = startRect.w;
  let h = startRect.h;

  // Apply deltas based on handle position
  if (handle.includes('r')) { w += gain * dx; }
  if (handle.includes('l')) { w -= gain * dx; }
  if (handle.includes('b')) { h += gain * dy; }
  if (handle.includes('t')) { h -= gain * dy; }

  // Aspect ratio lock applies only on corner handles (2 chars). It works on
  // the size alone — the anchor is applied below and holds either way.
  if (opts.aspectLock && handle.length === 2) {
    const aspect = opts.aspectRatio ?? (startRect.w / startRect.h);
    if (Math.abs(dx) > Math.abs(dy)) h = w / aspect;
    else w = h * aspect;
  }

  // Enforce min/max size constraints.
  if (w < opts.minW) w = opts.minW;
  if (h < opts.minH) h = opts.minH;
  if (opts.maxW > 0 && w > opts.maxW) w = opts.maxW;
  if (opts.maxH > 0 && h > opts.maxH) h = opts.maxH;

  // Place the box against its anchor: the centre for from-centre, otherwise
  // the edge opposite the one being dragged (an untouched edge stays put).
  let x;
  let y;
  if (fromCenter) {
    x = startRect.x + startRect.w / 2 - w / 2;
    y = startRect.y + startRect.h / 2 - h / 2;
  } else {
    x = handle.includes('l') ? startRect.x + startRect.w - w : startRect.x;
    y = handle.includes('t') ? startRect.y + startRect.h - h : startRect.y;
  }

  return { x, y, w, h };
}

/** The point a resize keeps fixed, as an offset from the rect centre in the
 *  control's local (unrotated) frame: the opposite corner, or the opposite
 *  edge's midpoint for edge handles — or the centre itself when the gesture
 *  is a from-centre resize, which by definition holds nothing else still. */
function resizeAnchorOffset(rect, handle, fromCenter = false) {
  if (fromCenter) return { x: 0, y: 0 };
  let ax = 0;
  let ay = 0;
  if (handle.includes('l')) ax = rect.w / 2;
  else if (handle.includes('r')) ax = -rect.w / 2;
  if (handle.includes('t')) ay = rect.h / 2;
  else if (handle.includes('b')) ay = -rect.h / 2;
  return { x: ax, y: ay };
}

/**
 * Resize a ROTATED rect from a handle drag. The pointer delta arrives in
 * panel space; it is rotated into the control's local frame, the plain
 * resize math runs there, and the box is repositioned so the anchor point
 * (opposite corner/edge midpoint) stays fixed **in panel space** — which is
 * what the user sees. Without this, dragging a handle on a 45°-rotated
 * control resized along the wrong axis while the box slid away.
 *
 * With `opts.fromCenter` the fixed point is the centre instead — and the
 * centre is the one point a rotation cannot move, so the rotated case needs
 * nothing beyond handing the anchor lookup the flag.
 *
 * Falls through to computeResizedRect for unrotated controls.
 * Returns { x, y, w, h } (x/y are the unrotated box position, as stored).
 */
export function computeRotatedResizedRect(startRect, handle, dx, dy, rotationDeg, opts) {
  const rot = Number(rotationDeg ?? 0) % 360;
  if (Math.abs(rot) < 0.001) return computeResizedRect(startRect, handle, dx, dy, opts);

  const theta = (rot * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Pointer delta in the control's local frame
  const dxl = dx * cos + dy * sin;
  const dyl = -dx * sin + dy * cos;

  // World position of the anchor before the resize
  const c0 = { x: startRect.x + startRect.w / 2, y: startRect.y + startRect.h / 2 };
  const fromCenter = opts?.fromCenter === true;
  const a0 = resizeAnchorOffset(startRect, handle, fromCenter);
  const anchorWorld = {
    x: c0.x + a0.x * cos - a0.y * sin,
    y: c0.y + a0.x * sin + a0.y * cos,
  };

  // Plain resize in local space, then recentre so the anchor stays put
  const local = computeResizedRect(startRect, handle, dxl, dyl, opts);
  const a1 = resizeAnchorOffset(local, handle, fromCenter);
  const c1 = {
    x: anchorWorld.x - (a1.x * cos - a1.y * sin),
    y: anchorWorld.y - (a1.x * sin + a1.y * cos),
  };

  return { x: c1.x - local.w / 2, y: c1.y - local.h / 2, w: local.w, h: local.h };
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
 * Orbit a panel-space point about a centre by `deltaDeg`.
 *
 * Panel space has y growing downward, so a positive angle turns clockwise on
 * screen — which is the same sense as `Transform.rotation` and as the atan2
 * that `angleFromCenter` returns. Keeping all three in one sense is why the
 * sine terms below are not negated.
 */
export function orbitPointAround(x, y, cx, cy, deltaDeg) {
  const theta = (Number(deltaDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * Axis-aligned bounds of a rect after it is rotated about its own centre.
 *
 * A selection box has to wrap what is DRAWN. Taking the AABB over the stored
 * boxes instead leaves a just-rotated member sticking out of the very box
 * that is supposed to contain it — most visible the instant a group rotation
 * ends, which is exactly when the user is looking at it.
 */
export function rotatedRectBounds(rect, rotationDeg) {
  const rot = Number(rotationDeg ?? 0) % 360;
  if (Math.abs(rot) < 0.001) return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ].map(([px, py]) => orbitPointAround(px, py, cx, cy, rot));

  // Quantised to a micro-unit first. Math.cos(90°) is 6.1e-17, not 0, so the
  // raw AABB of a quarter-turned box comes out at y = -3.06e-16 — which is
  // invisible in a number but survives into a style string as
  // `top:-3.06e-16px`, and floors to -1 for anyone rounding outward.
  // The `+ 0` is not decoration: rounding a tiny negative gives -0, which
  // compares unequal to 0 under Object.is and shows up as "-0" in a readout.
  const q = (v) => Math.round(v * 1e6) / 1e6 + 0;
  const xs = corners.map((p) => q(p.x));
  const ys = corners.map((p) => q(p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/**
 * One member of a group rotation.
 *
 * Turning a multi-selection about its bounding-box centre does two things to
 * every member at once: the member's own rotation advances by the gesture's
 * delta, AND the member's centre orbits the group centre by that same delta.
 * Either half alone looks broken — advancing only the rotations spins each
 * control on the spot while the arrangement stays put, and orbiting only the
 * positions swings them round a circle without ever turning them, which reads
 * as a carousel rather than a rotation.
 *
 *   rect        — the member's panel-space UNROTATED box { x, y, w, h }
 *   rotationDeg — the member's own rotation at gesture start
 *   cx, cy      — the group's rotation centre, panel space
 *   deltaDeg    — how far the gesture has turned so far
 *
 * Returns { x, y, rotation }: x/y are the new top-left of the unrotated box
 * (what `Transform.x/y` store — the renderer rotates about the box centre),
 * rotation is normalised to 0-360. Width and height are untouched: rotating a
 * selection never resizes its members.
 *
 * Always call this against the geometry captured at mousedown, never against
 * the last frame's output — accumulating per-frame orbits would compound the
 * integer rounding the store does on x/y and walk the selection off centre.
 */
export function computeOrbitedTransform(rect, rotationDeg, cx, cy, deltaDeg) {
  const centre = orbitPointAround(
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    cx,
    cy,
    deltaDeg,
  );
  return {
    x: centre.x - rect.w / 2,
    y: centre.y - rect.h / 2,
    rotation: normalizeRotation(Number(rotationDeg ?? 0) + Number(deltaDeg ?? 0)),
  };
}

/**
 * CSS `style=""` fragment for a resize handle. The handle visual is an
 * 8×8 *screen*-pixel square centered on its target edge/corner. The handles
 * live inside the CSS-scaled panel surface, so every length is multiplied by
 * `invScale` (1/zoom) to stay the same size on screen — at 25% zoom an
 * uncompensated handle is a 2-px speck, at 400% a 32-px slab.
 */
const HANDLE_SIZE = 8;

export function resizeHandleStyle(id, invScale = 1) {
  const size = HANDLE_SIZE * invScale;
  const half = size / 2;
  const off = -half;
  const positions = {
    tl: `top:${off}px;left:${off}px;`,
    t:  `top:${off}px;left:calc(50% - ${half}px);`,
    tr: `top:${off}px;right:${off}px;`,
    l:  `top:calc(50% - ${half}px);left:${off}px;`,
    r:  `top:calc(50% - ${half}px);right:${off}px;`,
    bl: `bottom:${off}px;left:${off}px;`,
    b:  `bottom:${off}px;left:calc(50% - ${half}px);`,
    br: `bottom:${off}px;right:${off}px;`,
  };
  return `width:${size}px;height:${size}px;border-width:${invScale}px;border-radius:${2 * invScale}px;${positions[id]}`;
}
