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
