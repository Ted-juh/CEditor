// envelopePointEdit.js — what the Values tab's envelope editor does to ce.anim.envelope's points, as
// pure functions over them: where a dragged point may go, where a new one is written, what is left
// when one is taken out, and the line the shape is drawn with. EnvelopePointsEditor.svelte is the
// surface; scripting/scriptValueWrite.js's writeEnvelope writes the result in the script's form.
//
// A point here is { x, y, from }: its place in the shape and `from`, the index of the written point
// it is (none for one added). The list is in the order the points are written, which need not be
// the order of x: the runtime sorts them, so the editor keeps each point between the two it sits
// between in x, and the order of x, and so which written point is which, never changes under a drag.

/** Three places: what the editor writes, and what a drag can tell apart in a 248-pixel view. */
export const round3 = (n) => Number(Number(n).toFixed(3));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The points as the editor holds them, from the core's reading (readEnvelope's meaning.points). */
export function editablePoints(meaningPoints) {
  return (meaningPoints ?? []).map((p) => ({ x: p.x, y: p.y, from: p.index }));
}

/** The levels the view shows: 0 to 1, and wider when a written level passes either end. */
export function levelRange(points) {
  const ys = (points ?? []).map((p) => p.y).filter(Number.isFinite);
  return { lo: Math.min(0, ...ys), hi: Math.max(1, ...ys) };
}

/** Indices of `points` in order of x, ties in the order written (the runtime's sort is stable). */
function orderOfX(points) {
  return points.map((_, i) => i).sort((a, b) => points[a].x - points[b].x || a - b);
}

/**
 * The points with the one at `at` moved to (x, y): x kept between the points either side of it in x
 * (and in 0 to 1), y in 0 to 1, both to three places. A level the script wrote past 0 to 1 stays
 * where it is until it is moved, and is moved back toward 0 to 1 only: the editor puts no point
 * outside it, and does not take one written there in when only its x is changed. A new list; the
 * others are as they were.
 */
export function movePoint(points, at, x, y) {
  if (at < 0 || at >= points.length) return points;
  const order = orderOfX(points);
  const k = order.indexOf(at);
  const lo = k > 0 ? points[order[k - 1]].x : 0;
  const hi = k < order.length - 1 ? points[order[k + 1]].x : 1;
  const { x: wasX, y: wasY } = points[at];
  // A coordinate given as it was is kept as it was: the y field changes the y alone, even of a point
  // written to more than three places.
  const nx = Number(x) === wasX ? wasX : round3(clamp(clamp(Number(x), 0, 1), Math.min(lo, hi), Math.max(lo, hi)));
  const ny = Number(y) === wasY ? wasY : round3(clamp(Number(y), Math.min(0, wasY), Math.max(1, wasY)));
  return points.map((p, i) => (i === at ? { ...p, x: nx, y: ny } : p));
}

/**
 * The points with a new one at (x, y), written after the last point at or before it in x (before the
 * first when there is none), so the written order stays the order of x where it was. `at` is where
 * it went in the list.
 */
export function addPoint(points, x, y) {
  const nx = round3(clamp(Number(x), 0, 1));
  const ny = round3(clamp(Number(y), 0, 1));
  const order = orderOfX(points);
  let before = -1;
  for (const i of order) if (points[i].x <= nx) before = i;
  const at = before >= 0 ? before + 1 : (order[0] ?? 0);
  const next = [...points.slice(0, at), { x: nx, y: ny }, ...points.slice(at)];
  return { points: next, at };
}

/** The points without the one at `at`, or null when that would leave fewer than two: an envelope
 *  needs two, and the runtime starts nothing with fewer. */
export function removePoint(points, at) {
  if (points.length <= 2 || at < 0 || at >= points.length) return null;
  return points.filter((_, i) => i !== at);
}

/**
 * The written points with their x and y from `points`, for the runtime's sampler: each keeps the
 * form it was written in and what else it carries (a curve), so the line drawn while a point is held
 * is the line the runtime will play. A point added is a plain { x, y }.
 */
export function shapeOf(written, points) {
  return points.map((p) => {
    const was = p.from !== undefined && p.from !== null ? written?.[p.from] : undefined;
    if (Array.isArray(was)) { const copy = [...was]; copy[0] = p.x; copy[1] = p.y; return copy; }
    if (was && typeof was === 'object') return { ...was, x: p.x, y: p.y };
    return { x: p.x, y: p.y };
  });
}

/**
 * An SVG path through the sampled shape (panelRuntime's sampleEnvelope: one level per step from 0
 * to 1), in a box of `width` by `height` inside `pad`, levels from `lo` (at the bottom) to `hi`.
 * Every `every`th sample is enough for a picture this size.
 */
export function shapeLine(samples, { width, height, pad = 0, lo = 0, hi = 1, every = 4 }) {
  if (!Array.isArray(samples) || samples.length < 2) return '';
  const w = width - pad * 2;
  const h = height - pad * 2;
  const span = hi - lo || 1;
  const last = samples.length - 1;
  const parts = [];
  for (let i = 0; i <= last; i += every) parts.push(i);
  if (parts[parts.length - 1] !== last) parts.push(last);
  return parts.map((i, k) => {
    const px = pad + (i / last) * w;
    const py = pad + ((hi - samples[i]) / span) * h;
    return `${k ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`;
  }).join(' ');
}
