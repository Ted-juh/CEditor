import { sortControlsForHitTest } from './controlOrder.js';
import { contentOrigin, getChildControls } from './containment.js';

/**
 * Return a Set of control IDs whose Transform AABB intersects the given rect
 * (partial overlap counts). `rect` is { x, y, w, h } in panel coordinates.
 *
 * Marquee scope: a marquee started on the panel surface selects TOP-LEVEL
 * controls only — nested children are selected by clicking into their
 * container, matching every design tool.
 */
export function findControlsInRect(controls, rect, getSection) {
  const ids = new Set();
  for (const ctrl of controls) {
    const t = getSection(ctrl, 'Transform');
    const c = getSection(ctrl, 'Core');
    if (!t || !c) continue;
    if (t.x < rect.x + rect.w && t.x + t.width > rect.x &&
        t.y < rect.y + rect.h && t.y + t.height > rect.y) {
      ids.add(c.id);
    }
  }
  return ids;
}

/**
 * Find the control whose AABB contains the given point in panel coordinates,
 * descending into containers to return the DEEPEST hit — right-clicking a
 * knob inside a container selects the knob, not the container. Sibling order
 * uses hit-test order (front-most first) at every level.
 */
export function findControlAtPoint(controls, x, y) {
  const hit = sortControlsForHitTest(controls).find(c => {
    const t = c._children?.Transform;
    if (!t) return false;
    return x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height;
  }) ?? null;

  if (!hit) return null;

  const kids = getChildControls(hit);
  if (kids.length) {
    const t = hit._children.Transform;
    const origin = contentOrigin(hit);
    const deeper = findControlAtPoint(kids, x - (t.x ?? 0) - origin.x, y - (t.y ?? 0) - origin.y);
    if (deeper) return deeper;
  }

  return hit;
}
