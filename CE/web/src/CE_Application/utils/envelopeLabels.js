// envelopeLabels.js — where an envelope node's stage letter goes.
//
// The letters (A, D, S, R) used to sit a fixed 8px above their node, or below it when the node was
// at the top. The curve leaves and enters each node at whatever angle the stage times make, so the
// fixed spot was often right on the line — the same colour family, and a letter drawn over a line
// of its own colour is simply gone. A letter is now placed in whichever of eight directions round
// its node is furthest from the two segments that meet there, and kept inside the plot.

/** Distance from point p to the segment a–b. */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Straight up first, so a tie (a node with nothing near it) keeps the old, familiar spot.
const DIRECTIONS = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-0.7071, -0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [0.7071, 0.7071],
];

/**
 * The centre of a node's letter, in the same pixel space as the nodes.
 *
 * @param node      { x, y } the node
 * @param segments  [[{x,y},{x,y}], …] the line segments that meet at it (one or two)
 * @param bounds    { x0, y0, x1, y1 } where a letter may be drawn
 * @param distance  how far from the node's centre the letter sits
 * @param half      { w, h } half the letter's box, so its whole box — not just its centre — stays
 *                  inside the bounds and clear of the line
 */
export function envelopeLabelPosition(node, segments, bounds, { distance = 11, half = { w: 3.5, h: 4.5 } } = {}) {
  let best = null;
  for (const [ux, uy] of DIRECTIONS) {
    const c = { x: node.x + ux * distance, y: node.y + uy * distance };
    if (c.x - half.w < bounds.x0 || c.x + half.w > bounds.x1 || c.y - half.h < bounds.y0 || c.y + half.h > bounds.y1) continue;
    // Clearance of the letter's box: the centre's distance, less the box's reach towards the line.
    const clearance = Math.min(...segments.map(([a, b]) => distanceToSegment(c, a, b))) - Math.hypot(half.w, half.h);
    if (!best || clearance > best.clearance + 0.01) best = { x: c.x, y: c.y, clearance };
  }
  return best ? { x: best.x, y: best.y } : { x: node.x, y: node.y - distance };
}
