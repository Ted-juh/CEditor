// layerThumbnail.test.js — the little picture beside each layer, and the one thing that makes it
// usable rather than broken-looking.
//
// THE TRAP, and most of what is asserted here: 79% of the GAIA panel's controls have a fully
// transparent `Background.Fill`, because a knob keeps its appearance in `Parts` and a caption in
// `Text`. Colouring each control by its fill therefore draws 26 dark boxes on black — which nobody
// reads as "a sparse layer", they read it as "the thumbnail is broken". The silhouette fallback is
// the difference between a feature and a bug report, so it gets a test that fails if it is removed.
//
// The rest is the contract the dock relies on: null for an empty layer (so a row can say "empty"
// instead of showing a blank box), letterboxing rather than stretching (so a landscape panel does
// not thumbnail as a portrait one), and a cache keyed by what was drawn.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  clearThumbnailCache, layerThumbnailSvg, layerThumbnailUrl, thumbnailCacheSize,
} from '../src/CE_Application/utils/layerThumbnail.js';

/** A control at a position, with an explicit fill (or the type default when omitted). */
function at(x, y, w, h, colour = undefined) {
  const control = createControl('Background', { Core: { id: `c${x}_${y}` }, Transform: { x, y, width: w, height: h } });
  if (colour !== undefined) control._children.Background._children.Fill.colour = colour;
  return control;
}

const rects = (svg) => [...svg.matchAll(/<rect [^>]*\/>/g)].map((m) => m[0]).slice(1);  // skip the backdrop

/* ------------------------------------------------------------------ the trap */

test('a control with a transparent fill still draws', () => {
  // THE test. Without the fallback this panel thumbnails as an empty box, and an empty box is
  // indistinguishable from a failure. Most controls on a real panel are this case.
  const svg = layerThumbnailSvg([at(0, 0, 100, 100, '00000000')], 200, 200, 40).svg;
  const drawn = rects(svg);
  assert.equal(drawn.length, 1, 'a transparent control drew nothing at all');
  assert.match(drawn[0], /fill-opacity="0\.55"/, 'it should fall back to a silhouette, not vanish');
});

test('an opaque control keeps its own colour', () => {
  const svg = layerThumbnailSvg([at(0, 0, 100, 100, 'FFE0A030')], 200, 200, 40).svg;
  assert.match(rects(svg)[0], /fill="#E0A030"/);
  assert.ok(!rects(svg)[0].includes('fill-opacity'), 'a real colour should not be dimmed');
});

test('a nearly-transparent fill counts as no fill', () => {
  // 04 alpha is not a colour anyone sees; treating it as one would draw a near-invisible rect and
  // reintroduce the blank-thumbnail problem for panels that use faint washes.
  const svg = layerThumbnailSvg([at(0, 0, 100, 100, '04FF0000')], 200, 200, 40).svg;
  assert.match(rects(svg)[0], /fill-opacity="0\.55"/);
});

/* ------------------------------------------------------------------ the contract */

test('an empty layer has no thumbnail, rather than an empty one', () => {
  // The dock shows an "empty" badge on null. Returning a blank image instead would make a new
  // layer look like a broken one.
  assert.equal(layerThumbnailSvg([], 200, 200, 40), null);
  assert.equal(layerThumbnailUrl([], 200, 200, 40), null);
});

test('a panel with no size has no thumbnail', () => {
  assert.equal(layerThumbnailSvg([at(0, 0, 10, 10)], 0, 0, 40), null);
});

test('it letterboxes, it does not stretch', () => {
  // A thumbnail that lies about the panel's shape is worse at the one job it has.
  const wide = layerThumbnailSvg([at(0, 0, 10, 10)], 400, 100, 40);
  assert.equal(wide.width, 40);
  assert.equal(wide.height, 10, 'a 4:1 panel should thumbnail 4:1');

  const tall = layerThumbnailSvg([at(0, 0, 10, 10)], 100, 400, 40);
  assert.equal(tall.width, 10);
  assert.equal(tall.height, 40);
});

test('a sub-pixel control still leaves a mark', () => {
  // A panel of thin captions scaled to 40px would otherwise thumbnail as an empty rectangle.
  const svg = layerThumbnailSvg([at(0, 0, 1, 1)], 2000, 2000, 40).svg;
  const [drawn] = rects(svg);
  assert.match(drawn, /width="0\.6"/);
  assert.match(drawn, /height="0\.6"/);
});

test('positions are scaled, not copied', () => {
  const svg = layerThumbnailSvg([at(100, 50, 20, 20)], 200, 200, 40).svg;
  assert.match(rects(svg)[0], /x="20\.0" y="10\.0"/, 'a control halfway across should be halfway across');
});

/* ------------------------------------------------------------------ the cache */

test('the same layer twice is generated once', () => {
  clearThumbnailCache();
  const controls = [at(0, 0, 20, 20, 'FF112233')];
  const first = layerThumbnailUrl(controls, 200, 200, 40);
  const second = layerThumbnailUrl([at(0, 0, 20, 20, 'FF112233')], 200, 200, 40);
  assert.equal(first.url, second.url);
  assert.equal(thumbnailCacheSize(), 1);
});

test('moving a control misses the cache', () => {
  // The invalidation story: the geometry IS the key, so there is nothing to remember to expire.
  clearThumbnailCache();
  const before = layerThumbnailUrl([at(0, 0, 20, 20, 'FF112233')], 200, 200, 40);
  const after = layerThumbnailUrl([at(40, 0, 20, 20, 'FF112233')], 200, 200, 40);
  assert.notEqual(after.url, before.url);
  assert.equal(thumbnailCacheSize(), 2);
});

test('recolouring a control misses the cache', () => {
  clearThumbnailCache();
  const before = layerThumbnailUrl([at(0, 0, 20, 20, 'FF112233')], 200, 200, 40);
  const after = layerThumbnailUrl([at(0, 0, 20, 20, 'FFAA0000')], 200, 200, 40);
  assert.notEqual(after.url, before.url);
});

test('the two sizes are cached apart', () => {
  clearThumbnailCache();
  const controls = [at(0, 0, 20, 20, 'FF112233')];
  const small = layerThumbnailUrl(controls, 200, 200, 34);
  const large = layerThumbnailUrl(controls, 200, 200, 150);
  assert.notEqual(small.url, large.url, 'the dock size and the hover size must not share an entry');
  assert.equal(large.width, 150);
});

test('the data URL is base64, like every other one in the app', () => {
  const { url } = layerThumbnailUrl([at(0, 0, 20, 20)], 200, 200, 40);
  assert.match(url, /^data:image\/svg\+xml;base64,/);
});

test('a big layer thumbnails fast enough to sit in a drag', () => {
  // 0.41 ms measured for 409 controls. The budget is generous because this is about catching a
  // change of ALGORITHM — rendering controls for real, say — not about timing a fast machine.
  clearThumbnailCache();
  const controls = Array.from({ length: 400 }, (unused, i) => at((i * 7) % 1500, (i * 11) % 1700, 40, 40));
  const started = performance.now();
  for (let i = 0; i < 20; i++) layerThumbnailSvg(controls, 1600, 1778, 40);
  const per = (performance.now() - started) / 20;
  assert.ok(per < 8, `${per.toFixed(2)} ms per thumbnail for 400 controls — that is not a schematic any more`);
});
