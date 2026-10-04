/**
 * controlSpatialIndex.js — an R-tree (RBush) over a list of sibling controls, so the canvas asks "what is
 * near here" instead of walking every control on every pointer move.
 *
 * The Roland GAIA panel holds thousands of controls, and several canvas gestures scanned all of them
 * per mouse move: alignment snapping (every sibling's nine edges, per move, while dragging or resizing),
 * the distance labels, the Alt-hover and right-click hit test (which also re-sorted the whole list per
 * call), and the marquee. Each now asks this index first and runs its own exact test on what comes
 * back — the same test, in the same order, so every answer is the one the full scan gave. The index
 * only removes controls that cannot be the answer.
 *
 * ONE INDEX PER LIST. It is keyed by the siblings array itself (a WeakMap), which is how the rest of
 * the editor keys derived state: an edit replaces the array, so the old index is simply never asked
 * for again and is collected. A drag does not write the document until the mouse is released, so the
 * index built at the first move serves the whole gesture.
 *
 * Small lists are scanned as they always were: under INDEX_MIN_CONTROLS the tree costs more than it saves.
 */
import RBush from 'rbush';
import { rotatedRectBounds } from './transformMath.js';

export const INDEX_MIN_CONTROLS = 48;

const directSection = (control, name) => control?._children?.[name];
const cache = new WeakMap();

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function build(controls, getSection) {
  const entries = [];
  const boxes = [];
  const footprints = [];
  const xEdges = [];
  const yEdges = [];
  controls.forEach((control, order) => {
    const transform = getSection(control, 'Transform');
    if (!transform) return;
    const box = { x: num(transform.x), y: num(transform.y), w: num(transform.width), h: num(transform.height) };
    const footprint = rotatedRectBounds(box, transform.rotation);
    const entry = { control, order, box, footprint };
    entries.push(entry);
    boxes.push({ minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h, entry });
    footprints.push({ minX: footprint.x, minY: footprint.y, maxX: footprint.x + footprint.w, maxY: footprint.y + footprint.h, entry });
    // A control's snap edges, as points on each axis: left / centre / right, top / centre / bottom.
    for (const value of [footprint.x, footprint.x + footprint.w / 2, footprint.x + footprint.w]) {
      xEdges.push({ minX: value, maxX: value, minY: 0, maxY: 0, entry });
    }
    for (const value of [footprint.y, footprint.y + footprint.h / 2, footprint.y + footprint.h]) {
      yEdges.push({ minX: value, maxX: value, minY: 0, maxY: 0, entry });
    }
  });
  const tree = (items) => new RBush().load(items);
  return { entries, boxes: tree(boxes), footprints: tree(footprints), xEdges: tree(xEdges), yEdges: tree(yEdges) };
}

/** The index for this list of siblings, built on first use and kept while the list is unchanged. */
export function spatialIndexFor(controls, getSection = directSection) {
  if (!Array.isArray(controls)) return null;
  let byReader = cache.get(controls);
  if (!byReader) {
    byReader = new Map();
    cache.set(controls, byReader);
  }
  let index = byReader.get(getSection);
  if (!index) {
    index = build(controls, getSection);
    byReader.set(getSection, index);
  }
  return index;
}

let enabled = true;

/** Whether a list is big enough to be worth indexing. */
export function worthIndexing(controls) {
  return enabled && Array.isArray(controls) && controls.length >= INDEX_MIN_CONTROLS;
}

/**
 * Run `fn` with the index switched off — every caller scans as it did before the index — and return
 * what it returns. For the tests and the benchmark that hold the index to the full scan's answers.
 */
export function withoutIndex(fn) {
  const was = enabled;
  enabled = false;
  try { return fn(); } finally { enabled = was; }
}

const inOrder = (hits) => {
  const seen = new Set();
  const out = [];
  for (const { entry } of hits) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out.sort((a, b) => a.order - b.order).map((entry) => entry.control);
};

/**
 * The siblings that could give a snap within `threshold` of any of these edge values — any of their
 * footprint edges lies within the threshold of one — in their original order. Anything else cannot beat
 * a best distance that starts at the threshold.
 */
export function snapCandidates(index, xValues, yValues, threshold) {
  const hits = [];
  for (const value of xValues) hits.push(...index.xEdges.search({ minX: value - threshold, maxX: value + threshold, minY: 0, maxY: 0 }));
  for (const value of yValues) hits.push(...index.yEdges.search({ minX: value - threshold, maxX: value + threshold, minY: 0, maxY: 0 }));
  return inOrder(hits);
}

/**
 * The siblings a distance label could measure to: those overlapping the rect's own rows (to its left and
 * right) or its own columns (above and below), by their unrotated boxes, which is what the labels
 * measure. In their original order.
 */
export function distanceCandidates(index, rect) {
  const far = 1e12;
  const hits = [
    ...index.boxes.search({ minX: -far, maxX: far, minY: rect.y, maxY: rect.y + rect.h }),
    ...index.boxes.search({ minX: rect.x, maxX: rect.x + rect.w, minY: -far, maxY: far }),
  ];
  return inOrder(hits);
}

/** The siblings whose on-screen footprint touches this rect, in their original order. */
export function footprintCandidates(index, rect) {
  return inOrder(index.footprints.search({ minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h }));
}
