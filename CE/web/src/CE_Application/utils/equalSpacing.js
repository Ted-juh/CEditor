/**
 * Equal-gap detection — the pink Figma indicators.
 *
 * WHY THIS IS NOT IN canvasSnapping.js. That module answers a different
 * question, one rect at a time: for each side of the moving control, which
 * single nearest neighbour is it closest to, and how far. Equal spacing is a
 * property of a WHOLE ROW — you cannot see it by looking at one neighbour,
 * because the fact worth showing is that gap A equals gap B equals gap C. It
 * needs the run, so it gets its own pass over the siblings.
 *
 * Making the drag SNAP to an equal gap (rather than merely reporting one) does
 * belong next to the other snap candidates in canvasSnapping.js, and is not
 * done here: this module detects and draws.
 *
 * All rects are { id, x, y, w, h } in one shared coordinate frame — panel
 * space at the top level, the container's content space inside one. Mixing
 * the two is the bug canvasDragFrame.js exists to prevent; pass one frame.
 */

const centreX = (r) => r.x + r.w / 2;
const centreY = (r) => r.y + r.h / 2;

/** Rects that share a band with `target` on the perpendicular axis — the ones
 *  a human would call "in the same row" (axis 'x') or "in the same column". */
function bandMates(target, others, axis) {
  return (others ?? []).filter((r) => {
    if (!r || r.id === target.id) return false;
    return axis === 'x'
      ? r.y < target.y + target.h && r.y + r.h > target.y
      : r.x < target.x + target.w && r.x + r.w > target.x;
  });
}

/**
 * The longest run of consecutive equal gaps that the target takes part in.
 * Returns { gap, from, to } over gap indices, or null.
 *
 * "Takes part in" means one of the two gaps touching the target is inside the
 * run — a row of evenly spaced controls somewhere else on the panel is true
 * but not news, and drawing it would turn the canvas pink for no reason.
 */
function equalRun(gaps, targetIndex, tolerance) {
  const touches = [targetIndex - 1, targetIndex].filter((i) => i >= 0 && i < gaps.length);
  let best = null;

  for (let start = 0; start < gaps.length; start++) {
    let end = start;
    while (end + 1 < gaps.length && Math.abs(gaps[end + 1] - gaps[start]) <= tolerance) end++;
    const length = end - start + 1;
    if (length >= 2 && touches.some((i) => i >= start && i <= end)) {
      if (!best || length > best.to - best.from + 1) best = { gap: gaps[start], from: start, to: end };
    }
  }
  return best;
}

/**
 * Equal-spacing indicators for one axis.
 *
 * @param target     the rect being dragged or measured
 * @param others     its siblings in the same frame
 * @param axis       'x' for a row (horizontal gaps), 'y' for a column
 * @param tolerance  panel units of slop; gaps within it count as equal
 * @returns { axis, gap, count, segments: [{ x, y, length }] } | null
 *          Segments are the gaps themselves: for axis 'x' each is a horizontal
 *          bar of `length` starting at x, centred between the two boxes.
 */
export function detectEqualSpacingOnAxis(target, others, axis, tolerance = 1) {
  if (!target) return null;
  const mates = bandMates(target, others, axis);
  if (mates.length < 2) return null;   // three boxes minimum makes two gaps

  const size = axis === 'x' ? ((r) => r.w) : ((r) => r.h);
  const start = axis === 'x' ? ((r) => r.x) : ((r) => r.y);
  const boxes = [target, ...mates].sort((a, b) => start(a) - start(b));

  const gaps = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    gaps.push(start(boxes[i + 1]) - (start(boxes[i]) + size(boxes[i])));
  }
  // Overlapping boxes make negative gaps; "equally overlapping" is not a
  // layout anyone is aiming for, so they disqualify the run.
  if (gaps.some((g) => g < 0)) return null;

  const targetIndex = boxes.findIndex((r) => r.id === target.id);
  const run = equalRun(gaps, targetIndex, tolerance);
  if (!run) return null;

  const segments = [];
  for (let i = run.from; i <= run.to; i++) {
    const a = boxes[i];
    const b = boxes[i + 1];
    const from = start(a) + size(a);
    const length = start(b) - from;
    segments.push(axis === 'x'
      ? { x: from, y: (centreY(a) + centreY(b)) / 2, length }
      : { x: (centreX(a) + centreX(b)) / 2, y: from, length });
  }

  return { axis, gap: Math.round(run.gap), count: segments.length, segments };
}

/** Both axes at once; either may be absent. */
export function detectEqualSpacing(target, others, tolerance = 1) {
  return [
    detectEqualSpacingOnAxis(target, others, 'x', tolerance),
    detectEqualSpacingOnAxis(target, others, 'y', tolerance),
  ].filter(Boolean);
}
