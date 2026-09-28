/**
 * Group transform maths for the multi-selection bounding box.
 *
 * The gesture itself lives in SelectionBoundsOverlay.svelte; the arithmetic
 * lives out here because the web suite has no DOM to drive a component with —
 * mousedown/mousemove cannot be replayed, so anything left inside the handler
 * can only ever be tested by reading the source back. "Every member's own
 * rotation advances while its centre orbits the group centre" is exactly the
 * part that has to be pinned by numbers instead.
 */

import { computeOrbitedTransform } from './transformMath.js';

/**
 * Store patches for one frame of a group rotation.
 *
 *   members — captured at mousedown, in the shape SelectionBoundsOverlay's
 *             captureMembers() produces:
 *             { id, kind, local: { x, y, w, h }, rotation, parentOffset }
 *   cx, cy  — the group's rotation centre, panel space
 *   delta   — degrees turned so far. Always measured from the gesture start,
 *             never accumulated frame to frame: the store rounds x/y to
 *             integers, and re-orbiting the rounded result would walk the
 *             selection off its centre over a long drag.
 *
 * Returns Map<id, { 'Transform.x', 'Transform.y', 'Transform.rotation' }>.
 *
 * Only selection ROOTS are patched. A selected container's descendants are
 * drawn inside it and already inherit its rotation, so turning them as well
 * would double their angle and throw them out of the box.
 *
 * x/y come back out of panel space through each member's parentOffset,
 * because Transform.x/y for a nested control is parent-relative. That offset
 * is treated as constant for the gesture — the same simplification the group
 * resize makes, and it holds for the same reason: the unselected parent chain
 * does not move. It does NOT compose an ancestor container's own rotation;
 * neither does controlPanelRect, so the whole editor shares that limit.
 */
export function groupRotationPatches(members, cx, cy, delta) {
  const patches = new Map();
  for (const member of members ?? []) {
    if (member?.kind !== 'root') continue;
    const offset = member.parentOffset ?? { x: 0, y: 0 };
    const next = computeOrbitedTransform(
      {
        x: member.local.x + offset.x,
        y: member.local.y + offset.y,
        w: member.local.w,
        h: member.local.h,
      },
      member.rotation,
      cx,
      cy,
      delta,
    );
    patches.set(member.id, {
      // `+ 0` folds the negative zero away: Math.round(-1e-16) is -0, which
      // survives into the document and reads back as "-0" in the properties
      // panel for a control that did not move at all.
      'Transform.x': Math.round(next.x - offset.x) + 0,
      'Transform.y': Math.round(next.y - offset.y) + 0,
      'Transform.rotation': next.rotation,
    });
  }
  return patches;
}

/**
 * The per-member scale a group resize applies, in the member's OWN frame.
 *
 * The box scales by (sx, sy) along the panel's axes. A member at 0° or 180° takes that as it is; at
 * 90° or 270° its width runs along the panel's y, so the two swap. At any other angle a non-uniform
 * panel-axis scale is a shear the member cannot represent, so it scales uniformly (the geometric mean)
 * and keeps its shape — its centre still follows the box exactly.
 */
export function memberScale(rotation, sx, sy) {
  const half = (((Number(rotation) || 0) % 180) + 180) % 180;     // 0 ≤ half < 180
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (near(half, 0) || near(half, 180)) return { fx: sx, fy: sy };
  if (near(half, 90)) return { fx: sy, fy: sx };
  const uniform = Math.sqrt(Math.abs(sx * sy));
  return { fx: uniform, fy: uniform };
}

/**
 * Store patches for one frame of a group resize: the box went from `startBounds` to `rect`.
 *
 *   members — captureMembers(): roots { id, kind: 'root', local, rotation, parentOffset } and the
 *             descendants of a selected container { id, kind: 'descendant', local, rootId }.
 *
 * A ROOT's CENTRE maps linearly from the old box to the new one — correct at any rotation, where
 * mapping its unrotated top-left (as the overlay used to) drifted a rotated member off the box. Its
 * size scales by memberScale. A DESCENDANT's local geometry scales by its container's factors, so
 * a container's contents keep filling it.
 *
 * Returns Map<id, { 'Transform.x', 'Transform.y', 'Transform.width', 'Transform.height' }>.
 */
export function groupResizePatches(members, startBounds, rect) {
  const sx = startBounds.w ? rect.w / startBounds.w : 1;
  const sy = startBounds.h ? rect.h / startBounds.h : 1;
  const factors = new Map();
  const patches = new Map();
  for (const m of members) {
    if (m.kind !== 'root') continue;
    const { fx, fy } = memberScale(m.rotation, sx, sy);
    factors.set(m.id, { fx, fy });
    const cx = m.local.x + m.parentOffset.x + m.local.w / 2;
    const cy = m.local.y + m.parentOffset.y + m.local.h / 2;
    const ncx = rect.x + (cx - startBounds.x) * sx;
    const ncy = rect.y + (cy - startBounds.y) * sy;
    const w = Math.max(1, Math.round(m.local.w * fx));
    const h = Math.max(1, Math.round(m.local.h * fy));
    patches.set(m.id, {
      'Transform.x': Math.round(ncx - w / 2 - m.parentOffset.x),
      'Transform.y': Math.round(ncy - h / 2 - m.parentOffset.y),
      'Transform.width': w,
      'Transform.height': h,
    });
  }
  for (const m of members) {
    if (m.kind === 'root') continue;
    const { fx, fy } = factors.get(m.rootId) ?? { fx: sx, fy: sy };
    patches.set(m.id, {
      'Transform.x': Math.round(m.local.x * fx),
      'Transform.y': Math.round(m.local.y * fy),
      'Transform.width': Math.max(1, Math.round(m.local.w * fx)),
      'Transform.height': Math.max(1, Math.round(m.local.h * fy)),
    });
  }
  return patches;
}
