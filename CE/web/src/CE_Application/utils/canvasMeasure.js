/**
 * Alt-hover measuring — the distance between what is selected and what the
 * pointer is over.
 *
 * The canvas already measures distances, but only to the NEAREST neighbour
 * and only while something is being dragged (canvasSnapping.computeDistances).
 * There was no way to ask "how far apart are these two?" without moving one of
 * them, and the only `altKey` read anywhere on the canvas was drag-duplicate.
 * Alt-hover is the gesture every design tool uses for exactly this question,
 * and it is non-destructive: nothing moves, nothing is committed.
 *
 * All rects are { x, y, w, h } in panel coordinates.
 */

/** Overlap of two 1-D spans, or null when they are disjoint. */
function overlap(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? { start, end } : null;
}

/**
 * The measurement segments between two rects: up to one horizontal and one
 * vertical.
 *
 * A rect directly below another has a vertical gap and no horizontal one, so
 * it gets one line. A rect diagonally away has both, so it gets two — which
 * together read as "over by this much, down by this much", the answer people
 * are actually after. Rects that overlap on an axis have no gap on that axis
 * and it is left out rather than reported as zero, because a zero-length line
 * drawn on the canvas is a smudge, not information.
 *
 * Each segment is drawn where it is true: a horizontal gap sits at the middle
 * of the band the two rects share vertically (or at the selected rect's centre
 * when they share none), so the line is between the two edges it measures.
 *
 * @returns [{ axis: 'x' | 'y', dist, x1, y1, x2, y2 }]
 */
export function measureBetweenRects(from, to) {
  if (!from || !to) return [];
  const a = { x1: from.x, y1: from.y, x2: from.x + from.w, y2: from.y + from.h };
  const b = { x1: to.x, y1: to.y, x2: to.x + to.w, y2: to.y + to.h };
  const out = [];

  const spanY = overlap(a.y1, a.y2, b.y1, b.y2);
  const spanX = overlap(a.x1, a.x2, b.x1, b.x2);

  // Horizontal gap: only when they do NOT overlap horizontally.
  if (!spanX) {
    const rightwards = b.x1 >= a.x2;
    const x1 = rightwards ? a.x2 : a.x1;
    const x2 = rightwards ? b.x1 : b.x2;
    const y = spanY ? (spanY.start + spanY.end) / 2 : (a.y1 + a.y2) / 2;
    out.push({ axis: 'x', dist: Math.round(Math.abs(x2 - x1)), x1, y1: y, x2, y2: y });
  }

  // Vertical gap: same, the other way round.
  if (!spanY) {
    const downwards = b.y1 >= a.y2;
    const y1 = downwards ? a.y2 : a.y1;
    const y2 = downwards ? b.y1 : b.y2;
    const x = spanX ? (spanX.start + spanX.end) / 2 : (a.x1 + a.x2) / 2;
    out.push({ axis: 'y', dist: Math.round(Math.abs(y2 - y1)), x1: x, y1, x2: x, y2 });
  }

  return out;
}
