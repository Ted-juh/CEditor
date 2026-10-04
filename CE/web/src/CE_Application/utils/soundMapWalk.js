/**
 * Walking the sound map with the arrow keys: from the sound you are on, the nearest one that
 * lies in that direction: within a cone around the arrow first, and anything ahead only when the
 * cone is empty. Inside it, a sound off to the side costs more than one straight ahead, so Right
 * goes right rather than to the closest dot that is a little to the right and far below.
 */
export function nearestInDirection(points, fromId, [dx, dy], sideCost = 2.2) {
  const from = points.find((p) => p.id === fromId);
  if (!from) return null;
  // First within a cone either side of the arrow (a sound barely lower but far to the right is
  // not "down"); only when the cone is empty, anything ahead at all.
  for (const cone of [0.5, 0]) {
    let best = null;
    let bestScore = Infinity;
    for (const p of points) {
      if (p.id === fromId) continue;
      const vx = p.x - from.x, vy = p.y - from.y;
      const ahead = vx * dx + vy * dy;
      const side = Math.abs(vx * dy - vy * dx);
      if (ahead <= 1e-6 || ahead < side * cone) continue;
      const score = ahead + side * sideCost;
      if (score < bestScore) { bestScore = score; best = p.id; }
    }
    if (best) return best;
  }
  return null;
}
