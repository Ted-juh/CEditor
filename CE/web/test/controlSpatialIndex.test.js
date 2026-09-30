// controlSpatialIndex.test.js — the canvas's R-tree (RBush) never changes an answer, only how fast
// it comes.
//
// Every canvas search that uses the index runs its own exact test on the candidates the index returns,
// in the original order. So the claim to hold is exact: for any rect or point, snapping, distance
// labels, hit testing, the marquee and equal spacing give the same result with the index as without it.
// Random panels big enough to be indexed, rotated controls among them, and the Roland GAIA sheet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { computeDistances, findAlignmentSnap } from '../src/CE_Application/utils/canvasSnapping.js';
import { findControlAtPoint, findControlsInRect } from '../src/CE_Application/utils/canvasSelection.js';
import { detectEqualSpacing } from '../src/CE_Application/utils/equalSpacing.js';
import {
  INDEX_MIN_CONTROLS, distanceCandidates, spatialIndexFor, withoutIndex, worthIndexing,
} from '../src/CE_Application/utils/controlSpatialIndex.js';

const getSection = (control, name) => control?._children?.[name];

// A small deterministic generator, so a failure names a case that can be replayed.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomPanel(count, seed) {
  const rnd = random(seed);
  const grid = (value) => Math.round(value / 5) * 5;   // shared edges, so snaps and ties happen
  return Array.from({ length: count }, (_, i) => createControl('Label', {
    Core: { id: `c${i}`, name: `c${i}`, layer: rnd() < 0.2 ? 'Scenery' : 'Main', zIndex: Math.floor(rnd() * 3) },
    Transform: {
      x: grid(rnd() * 2000), y: grid(rnd() * 1200), width: grid(10 + rnd() * 150), height: grid(10 + rnd() * 80),
      rotation: rnd() < 0.15 ? Math.round(rnd() * 90) : 0,
    },
  }));
}

function randomRect(rnd) {
  return { x: Math.round(rnd() * 2000), y: Math.round(rnd() * 1200), w: 5 + Math.round(rnd() * 200), h: 5 + Math.round(rnd() * 120) };
}

const both = (fn) => ({ indexed: fn(), scanned: withoutIndex(fn) });

test('small lists are scanned as before; big ones are indexed', () => {
  assert.equal(worthIndexing(randomPanel(INDEX_MIN_CONTROLS - 1, 1)), false);
  assert.equal(worthIndexing(randomPanel(INDEX_MIN_CONTROLS, 1)), true);
  const list = randomPanel(60, 2);
  assert.equal(spatialIndexFor(list), spatialIndexFor(list), 'one index per list, kept');
  assert.notEqual(spatialIndexFor(list), spatialIndexFor([...list]), 'a new list is a new document revision');
});

test('snapping finds exactly the snap the full scan finds', () => {
  const controls = randomPanel(400, 7);
  const rnd = random(11);
  const guides = { vertical: [300, 1000], horizontal: [600] };
  for (let i = 0; i < 400; i += 1) {
    const rect = randomRect(rnd);
    const threshold = [1.25, 5, 12][i % 3];
    const edges = i % 4 === 0 ? { x: ['right'], y: ['top'] } : null;
    const { indexed, scanned } = both(() => findAlignmentSnap(rect, `c${i}`, controls, guides, getSection, { width: 2000, height: 1200 }, threshold, edges));
    assert.deepEqual(indexed, scanned, `case ${i}: ${JSON.stringify(rect)}`);
  }
});

test('distance labels and equal spacing measure to the same neighbours', () => {
  const controls = randomPanel(400, 21);
  const rnd = random(23);
  const rects = (list) => list.map((c) => ({ id: c._children.Core.id, x: c._children.Transform.x, y: c._children.Transform.y, w: c._children.Transform.width, h: c._children.Transform.height }));
  for (let i = 0; i < 300; i += 1) {
    const rect = randomRect(rnd);
    const { indexed, scanned } = both(() => computeDistances(rect, 'self', new Set(['c3']), controls, { width: 2000, height: 1200 }, getSection));
    assert.deepEqual(indexed, scanned, `distances ${i}`);
    const target = { id: 'self', ...rect };
    const pool = distanceCandidates(spatialIndexFor(controls), rect);
    assert.deepEqual(detectEqualSpacing(target, rects(pool)), detectEqualSpacing(target, rects(controls)), `spacing ${i}`);
  }
});

test('the hit test and the marquee pick exactly what the full scan picks', () => {
  const controls = randomPanel(400, 31);
  const layers = [{ name: 'Scenery' }, { name: 'Main' }];
  const rnd = random(37);
  for (let i = 0; i < 400; i += 1) {
    const x = Math.round(rnd() * 2100);
    const y = Math.round(rnd() * 1300);
    const hit = both(() => findControlAtPoint(controls, x, y, layers)?._children?.Core?.id ?? null);
    assert.equal(hit.indexed, hit.scanned, `point ${x},${y}`);
    const rect = randomRect(rnd);
    const marquee = both(() => [...findControlsInRect(controls, rect, getSection)]);
    assert.deepEqual(marquee.indexed, marquee.scanned, `marquee ${JSON.stringify(rect)}`);
  }
  // A locked layer is still not pickable through the index.
  const locked = [{ name: 'Scenery', locked: true }, { name: 'Main' }];
  for (let i = 0; i < 100; i += 1) {
    const x = Math.round(rnd() * 2100);
    const y = Math.round(rnd() * 1300);
    const hit = both(() => findControlAtPoint(controls, x, y, locked)?._children?.Core?.id ?? null);
    assert.equal(hit.indexed, hit.scanned);
  }
});

test('on the Roland GAIA sheet: the same answers, and how much faster', () => {
  const panel = deserializePanel(readFileSync(new URL('../../qa/QA-06-roland-gaia.cepanel', import.meta.url), 'utf8'), 'gaia.cepanel', 'qa');
  const controls = panel.controls;
  assert.ok(worthIndexing(controls), `${controls.length} top-level controls`);
  const rnd = random(41);
  const drags = Array.from({ length: 300 }, () => randomRect(rnd));
  const size = { width: panel.width, height: panel.height };
  for (const [i, rect] of drags.entries()) {
    const { indexed, scanned } = both(() => findAlignmentSnap(rect, 'none', controls, null, getSection, size, 5));
    assert.deepEqual(indexed, scanned, `drag ${i}`);
    const point = both(() => findControlAtPoint(controls, rect.x, rect.y, panel.layers)?._children?.Core?.id ?? null);
    assert.equal(point.indexed, point.scanned, `point ${i}`);
  }
  // Per pointer move, as a drag does it: the index is built once, then asked.
  spatialIndexFor(controls, getSection);
  const time = (fn) => {
    const start = performance.now();
    for (let round = 0; round < 5; round += 1) for (const rect of drags) fn(rect);
    return (performance.now() - start) / (5 * drags.length);
  };
  const snapIndexed = time((rect) => findAlignmentSnap(rect, 'none', controls, null, getSection, size, 5));
  const snapScanned = withoutIndex(() => time((rect) => findAlignmentSnap(rect, 'none', controls, null, getSection, size, 5)));
  const hitIndexed = time((rect) => findControlAtPoint(controls, rect.x, rect.y, panel.layers));
  const hitScanned = withoutIndex(() => time((rect) => findControlAtPoint(controls, rect.x, rect.y, panel.layers)));
  console.log(`# GAIA, ${controls.length} controls: snap ${snapScanned.toFixed(3)} → ${snapIndexed.toFixed(3)} ms per move; hit test ${hitScanned.toFixed(3)} → ${hitIndexed.toFixed(3)} ms`);
  assert.ok(snapIndexed < snapScanned, 'the index is faster per move');
});
