import { sortControlsForHitTest } from './controlOrder.js';
import { normalizeLayerName } from './panelLayers.js';
import { contentOrigin, getChildControls } from './containment.js';

/** Rotate a panel-space point into a control's local (unrotated) frame,
 *  about the control's centre. Rotation-aware hit testing: the DOM rotates
 *  the box via CSS, so clicking where the control *looks* like it is must
 *  test where it *actually* is. */
function toUnrotatedPoint(t, rotation, x, y) {
  const rot = Number(rotation ?? 0) % 360;
  if (!rot) return { x, y };
  const theta = (-rot * Math.PI) / 180;
  const cx = t.x + (t.width ?? 0) / 2;
  const cy = t.y + (t.height ?? 0) / 2;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(theta) - dy * Math.sin(theta),
    y: cy + dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}

/** Axis-aligned marquee rect vs a possibly-rotated control rect, via SAT on
 *  the four candidate separating axes (marquee's x/y + the control's two
 *  edge directions). Convex-vs-convex, so SAT is exact. */
function marqueeIntersects(t, rotation, rect) {
  const rot = Number(rotation ?? 0) % 360;
  if (!rot) {
    return t.x < rect.x + rect.w && t.x + t.width > rect.x &&
           t.y < rect.y + rect.h && t.y + t.height > rect.y;
  }

  const theta = (rot * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const hw = t.width / 2;
  const hh = t.height / 2;
  const controlCorners = [
    [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
  ].map(([ox, oy]) => [cx + ox * cos - oy * sin, cy + ox * sin + oy * cos]);
  const marqueeCorners = [
    [rect.x, rect.y], [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h],
  ];

  const axes = [
    [1, 0], [0, 1],           // marquee edges
    [cos, sin], [-sin, cos],  // control edges
  ];

  for (const [ax, ay] of axes) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [px, py] of controlCorners) {
      const p = px * ax + py * ay;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [px, py] of marqueeCorners) {
      const p = px * ax + py * ay;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA < minB || maxB < minA) return false;   // separating axis found
  }
  return true;
}

/**
 * Return a Set of control IDs whose rendered rect (rotation included)
 * intersects the given rect (partial overlap counts). `rect` is
 * { x, y, w, h } in panel coordinates.
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
    if (marqueeIntersects(t, t.rotation, rect)) {
      ids.add(c.id);
    }
  }
  return ids;
}

/**
 * Find the control whose rendered rect (rotation included) contains the
 * given point in panel coordinates, descending into containers to return the
 * DEEPEST hit — right-clicking a knob inside a container selects the knob,
 * not the container. Sibling order uses hit-test order (front-most first) at
 * every level. Descent carries the point through each rotated frame, so
 * children of a rotated container hit-test where they are drawn.
 */
export function findControlAtPoint(controls, x, y, layers = null) {
  // A locked or hidden layer is not pickable. This is the point of locking scenery: you stop
  // grabbing the section box when you meant the knob drawn on top of it, and the fix has to be
  // here rather than in the click handler, because every selection route comes through this.
  const blocked = new Set((layers ?? [])
    .filter((layer) => layer?.locked === true || layer?.visible === false)
    .map((layer) => layer.name));

  let hit = null;
  let localX = x;
  let localY = y;
  for (const c of sortControlsForHitTest(controls, (layers ?? []).map((l) => l.name))) {
    if (blocked.size && blocked.has(normalizeLayerName(c?._children?.Core?.layer))) continue;
    const t = c._children?.Transform;
    if (!t) continue;
    const p = toUnrotatedPoint(t, t.rotation, x, y);
    if (p.x >= t.x && p.x <= t.x + t.width && p.y >= t.y && p.y <= t.y + t.height) {
      hit = c;
      localX = p.x;
      localY = p.y;
      break;
    }
  }

  if (!hit) return null;

  const kids = getChildControls(hit);
  if (kids.length) {
    const t = hit._children.Transform;
    const origin = contentOrigin(hit);
    const deeper = findControlAtPoint(kids, localX - (t.x ?? 0) - origin.x, localY - (t.y ?? 0) - origin.y, layers);
    if (deeper) return deeper;
  }

  return hit;
}
