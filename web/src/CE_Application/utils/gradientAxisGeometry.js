/**
 * Geometry helpers for GradientEditor's draggable axis preview.
 *
 * All coordinates are in container-percent (0-100) so they can feed
 * CSS/SVG attributes directly. Radial gradients draw their axis from
 * center → center+radius; linear types extend through the center to
 * the rectangle edge (ray-cast).
 */

const RADIAL_TYPES    = new Set(['radial', 'radialRamp']);
const CENTERED_TYPES  = new Set(['radial', 'radialRamp', 'conical']);
const WITH_RADIUS     = new Set(['radial', 'radialRamp']);

/**
 * Compute the axis angle (degrees, CSS convention) for a gradient type.
 * - radial/radialRamp → 90 (horizontal)
 * - conical           → gradient.angle ?? 0
 * - linear + others   → gradient.angle ?? 90
 */
export function axisAngleFor(gradient) {
  switch (gradient.type) {
    case 'radial':
    case 'radialRamp':
      return 90;
    case 'conical':
      return gradient.angle ?? 0;
    default:
      return gradient.angle ?? 90;
  }
}

/**
 * Ray-cast from (cx, cy) along direction `rad` (radians) to find the
 * distance to the nearest edge of a 100×100 box. Result is multiplied by
 * 0.95 to keep the axis line inside the container visually, and clamped
 * to 50 (half the box) as an upper bound.
 */
export function rectangleHalfLength(cx, cy, rad) {
  const dx = Math.cos(rad), dy = Math.sin(rad);
  let tMin = Infinity;
  if (Math.abs(dx) > 0.001) tMin = Math.min(tMin, Math.abs((dx > 0 ? 100 - cx : cx) / dx));
  if (Math.abs(dy) > 0.001) tMin = Math.min(tMin, Math.abs((dy > 0 ? 100 - cy : cy) / dy));
  return Math.min(tMin * 0.95, 50);
}

/**
 * Build all derived axis geometry needed by GradientEditor's template.
 *
 *   gradient — gradient data (needs .type and .angle)
 *   shape    — preview shape: 'rectangle' | 'circle' | 'ellipse' | 'square' | 'triangle'
 *   internal — live drag state: { centerX, centerY, radiusX, radiusY }
 *
 * Returns a flat object with every derived value the template reads:
 *   axisAngle, axisRad, axisCenterX, axisCenterY,
 *   isRadialAxis, hasCenterControl, hasRadiusControl,
 *   linearHalfLen, axisStart, axisEnd,
 *   showPerpAxis, perpAxisEnd.
 */
export function computeAxisGeometry(gradient, shape, internal) {
  const { centerX, centerY, radiusX, radiusY } = internal;
  const isRadialAxis    = RADIAL_TYPES.has(gradient.type);
  const hasCenterControl = CENTERED_TYPES.has(gradient.type);
  const hasRadiusControl = WITH_RADIUS.has(gradient.type);

  const axisAngle = axisAngleFor(gradient);
  // CSS angle convention: 0° = up, 90° = right, clockwise.
  const axisRad = (axisAngle - 90) * Math.PI / 180;

  const axisCenterX = hasCenterControl ? centerX : 50;
  const axisCenterY = hasCenterControl ? centerY : 50;

  const linearHalfLen = shape === 'rectangle'
    ? rectangleHalfLength(axisCenterX, axisCenterY, axisRad)
    : 48;

  let axisStart, axisEnd;
  if (isRadialAxis) {
    // 0% = center, 100% = center + radius (horizontal)
    axisStart = { x: axisCenterX, y: axisCenterY };
    axisEnd   = { x: axisCenterX + radiusX, y: axisCenterY };
  } else {
    const dx = Math.cos(axisRad), dy = Math.sin(axisRad);
    axisStart = { x: axisCenterX - dx * linearHalfLen, y: axisCenterY - dy * linearHalfLen };
    axisEnd   = { x: axisCenterX + dx * linearHalfLen, y: axisCenterY + dy * linearHalfLen };
  }

  const showPerpAxis = hasRadiusControl && (shape === 'rectangle' || shape === 'ellipse');
  const perpAxisEnd = hasRadiusControl
    ? { x: axisCenterX, y: axisCenterY + radiusY }
    : { x: axisCenterX, y: axisCenterY };

  return {
    axisAngle, axisRad,
    axisCenterX, axisCenterY,
    isRadialAxis, hasCenterControl, hasRadiusControl,
    linearHalfLen,
    axisStart, axisEnd,
    showPerpAxis, perpAxisEnd,
  };
}

/**
 * Interpolate a stop thumb position (0-100 percent) to an (x, y) point
 * along the axis. Returns { x, y } in container percent.
 */
export function stopThumbPoint(axisStart, axisEnd, stopPosition) {
  const t = stopPosition / 100;
  return {
    x: axisStart.x + (axisEnd.x - axisStart.x) * t,
    y: axisStart.y + (axisEnd.y - axisStart.y) * t,
  };
}

/**
 * Project a container-percent point onto the axis line. Returns a stop
 * position in [0, 100], rounded to an integer. Used by click-to-add and
 * drag-a-stop interactions.
 */
export function projectOntoAxis(px, py, axisStart, axisEnd) {
  const ax = axisEnd.x - axisStart.x;
  const ay = axisEnd.y - axisStart.y;
  const len2 = ax * ax + ay * ay;
  if (len2 < 0.001) return 0;
  const t = ((px - axisStart.x) * ax + (py - axisStart.y) * ay) / len2;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}
