/**
 * Return a Set of control IDs whose Transform AABB intersects the given rect
 * (partial overlap counts). `rect` is { x, y, w, h } in panel coordinates.
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
 * Find a control whose AABB contains the given point in panel coordinates,
 * or null if none. Used by right-click to auto-select before showing the
 * context menu. Preserves array order (first match wins) to match existing
 * behavior — do not reverse without verifying hit-test semantics.
 */
export function findControlAtPoint(controls, x, y) {
  return controls.find(c => {
    const t = c._children?.Transform;
    if (!t) return false;
    return x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height;
  }) ?? null;
}
