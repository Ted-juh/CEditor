import { sortControlsForHitTest } from './controlOrder.js';
import { normalizeLayerName } from './panelLayers.js';
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
export function findControlAtPoint(controls, x, y, layers = null) {
  // A locked or hidden layer is not pickable. This is the point of locking scenery: you stop
  // grabbing the section box when you meant the knob drawn on top of it, and the fix has to be
  // here rather than in the click handler, because every selection route comes through this.
  const blocked = new Set((layers ?? [])
    .filter((layer) => layer?.locked === true || layer?.visible === false)
    .map((layer) => layer.name));

  const hit = sortControlsForHitTest(controls, (layers ?? []).map((l) => l.name)).find(c => {
    if (blocked.size && blocked.has(normalizeLayerName(c?._children?.Core?.layer))) return false;
    const t = c._children?.Transform;
    if (!t) return false;
    return x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height;
  }) ?? null;

  if (!hit) return null;

  const kids = getChildControls(hit);
  if (kids.length) {
    const t = hit._children.Transform;
    const origin = contentOrigin(hit);
    const deeper = findControlAtPoint(kids, x - (t.x ?? 0) - origin.x, y - (t.y ?? 0) - origin.y, layers);
    if (deeper) return deeper;
  }

  return hit;
}
