// shapeClip.test.js — the clip a slider part's fill is cut by (utils/shapeClip.js).
//
// The fill used to be cut by an SVG mask, which WebKit (the Linux app and plug-ins) does not apply to
// the fill's positioned layers: the default knob drew as squares. A clip has no stroke, so a stroked
// shape is given as the outline its stroke covers. These hold the geometry; the browser check
// `shapeClip` holds it to what Chromium's own stroke covers, pixel for pixel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCircularArc, arcStrokeOutline, lineStrokeOutline, ringOutline, clipShapeFor } from '../src/CE_Application/utils/shapeClip.js';

const numbers = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
const close = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('an arc as the slider draws it reads back as its centre and radius', () => {
  // A knob's track: from 135° round 270° clockwise, radius 50 about (60, 60).
  const at = (deg) => [60 + 50 * Math.cos((deg * Math.PI) / 180), 60 + 50 * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = at(135);
  const [ex, ey] = at(45);
  const arc = parseCircularArc(`M ${sx.toFixed(3)} ${sy.toFixed(3)} A 50.000 50.000 0 1 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`);
  assert.ok(close(arc.centre.x, 60) && close(arc.centre.y, 60), JSON.stringify(arc.centre));
  assert.equal(arc.r, 50);
  // The short way round, counter-clockwise, about the same centre.
  const ccw = parseCircularArc(`M ${sx} ${sy} A 50 50 0 0 0 ${ex} ${ey}`);
  assert.ok(close(ccw.centre.x, 60) && close(ccw.centre.y, 60), JSON.stringify(ccw.centre));
  // What is not one circular arc is not read as one.
  assert.equal(parseCircularArc('M 0 0 L 10 10'), null);
  assert.equal(parseCircularArc('M 0 0 A 10 20 0 0 1 10 10'), null, 'an ellipse');
  assert.equal(parseCircularArc('M 0 0 A 10 10 0 0 1 10 10 A 10 10 0 0 1 20 20'), null, 'two arcs');
});

test('an arc stroked with round caps is its band: edges at r ± half the width, a half circle at each end', () => {
  const arc = parseCircularArc('M 30 110 A 50 50 0 1 1 110 110'); // centre (70, 80)
  assert.ok(close(arc.centre.x, 70) && close(arc.centre.y, 80));
  const { d, rule } = arcStrokeOutline(arc, 16, 'round');
  assert.equal(rule, 'nonzero');
  assert.match(d, /^M [\d.]+ [\d.]+ A 58 58 0 1 1 [\d.]+ [\d.]+ A 8 8 0 0 1 [\d.]+ [\d.]+ A 42 42 0 1 0 [\d.]+ [\d.]+ A 8 8 0 0 1 [\d.]+ [\d.]+ Z$/, d);
  // Every point it names is on the outer edge or the inner one.
  const n = numbers(d);
  const points = [[n[0], n[1]], [n[7], n[8]], [n[14], n[15]], [n[21], n[22]], [n[28], n[29]]];
  for (const [x, y] of points) {
    const r = Math.hypot(x - 70, y - 80);
    assert.ok(close(r, 58) || close(r, 42), `${x},${y} at ${r}`);
  }
  // Counter-clockwise, every turn the other way.
  const back = arcStrokeOutline(parseCircularArc('M 110 110 A 50 50 0 1 0 30 110'), 16, 'round');
  assert.match(back.d, /A 58 58 0 1 0 .* A 8 8 0 0 0 .* A 42 42 0 1 1 .* A 8 8 0 0 0 /);
});

test('a knob at zero: an arc with no length draws a dot with round caps, as the stroke did, and nothing with butt caps', () => {
  const arc = parseCircularArc('M 30 110 A 50 50 0 0 1 30 110');
  assert.equal(arc.empty, true);
  const dot = arcStrokeOutline(arc, 16, 'round');
  assert.match(dot.d, /^M 22 110 A 8 8 0 1 0 38 110 A 8 8 0 1 0 22 110 Z$/);
  assert.equal(arcStrokeOutline(arc, 16, 'butt').d, '');
});

test('butt and square caps, and a band too wide for its circle', () => {
  const arc = parseCircularArc('M 30 110 A 50 50 0 1 1 110 110');
  assert.doesNotMatch(arcStrokeOutline(arc, 16, 'butt').d, /A 8 8/);
  const square = arcStrokeOutline(arc, 16, 'square').d;
  assert.equal((square.match(/ L /g) ?? []).length, 6, 'two corners and a return at each end');
  assert.equal(arcStrokeOutline(arc, 120, 'round'), null, 'wider than the circle: left to the mask');
});

test('a line is a capsule; a ring is two circles, even-odd', () => {
  const line = lineStrokeOutline(0, 0, 10, 0, 4, 'round');
  assert.equal(line.d, 'M 0 2 L 10 2 A 2 2 0 0 0 10 -2 L 0 -2 A 2 2 0 0 0 0 2 Z');
  assert.equal(lineStrokeOutline(5, 5, 5, 5, 4, 'round').d, 'M 3 5 A 2 2 0 1 0 7 5 A 2 2 0 1 0 3 5 Z', 'no length: a dot');
  const ring = ringOutline(50, 50, 30, 10);
  assert.equal(ring.rule, 'evenodd');
  assert.equal((ring.d.match(/M /g) ?? []).length, 2);
  assert.match(ring.d, /^M 15 50 A 35 35 .* M 25 50 A 25 25 /);
  // Wider than the circle: the hole is what the stroke's folded inner edge leaves.
  assert.match(ringOutline(50, 50, 10, 26).d, /^M 27 50 A 23 23 .* M 47 50 A 3 3 /);
  assert.equal((ringOutline(50, 50, 10, 20).d.match(/M /g) ?? []).length, 1, 'exactly as wide: a disc');
});

test('every shape a slider masks with has a clip, and a shape that cannot be outlined has none', () => {
  assert.deepEqual(clipShapeFor({ kind: 'circle', cx: 1, cy: 2, r: 3 }), { kind: 'circle', cx: 1, cy: 2, r: 3 });
  assert.deepEqual(clipShapeFor({ kind: 'rect', x: 0, y: 0, width: 4, height: 8, rx: 2 }), { kind: 'rect', x: 0, y: 0, width: 4, height: 8, rx: 2 });
  assert.deepEqual(clipShapeFor({ kind: 'filled-path', d: 'M0 0 L4 0 L0 4 Z', transform: 'scale(1 0.5)' }), { kind: 'path', d: 'M0 0 L4 0 L0 4 Z', rule: 'evenodd', transform: 'scale(1 0.5)' });
  assert.equal(clipShapeFor({ kind: 'circle-stroke', cx: 50, cy: 50, r: 30, strokeWidth: 10 }).rule, 'evenodd');
  assert.equal(clipShapeFor({ kind: 'line', x1: 0, y1: 0, x2: 0, y2: 40, strokeWidth: 6, lineCap: 'round' }).kind, 'path');
  assert.equal(clipShapeFor({ kind: 'path', d: 'M 30 110 A 50 50 0 1 1 110 110', strokeWidth: 16, lineCap: 'round' }).kind, 'path');
  assert.equal(clipShapeFor({ kind: 'path', d: 'M 0 0 L 10 10 L 20 0', strokeWidth: 4 }), null, 'not one arc: the mask');
  assert.equal(clipShapeFor({ kind: 'filled-path', d: '' }), null);
  assert.equal(clipShapeFor(null), null);
});

test('the fill is built the way WebKit draws in order: no layer, and no opacity on the foreignObject', async () => {
  // Chromium, which the browser checks run, draws it right either way; WebKitGTK (Linux) did not.
  // These are the rules measured there (editor/SliderShapeFill.svelte says what each one cost).
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/CE_Application/editor/SliderShapeFill.svelte', import.meta.url), 'utf8');
  const clipped = source.slice(source.indexOf('{#if preparedBackground && shape && maskId && clip}'), source.indexOf('{:else if preparedBackground && shape && maskId}'));
  const objects = clipped.match(/<foreignObject\b[^>]*>/g);
  assert.equal(objects.length, 2, 'the plain or layered fill, and the fill under its effects');
  for (const tag of objects) assert.doesNotMatch(tag, /opacity=|style=/, 'none on the foreignObject itself');
  assert.equal(clipped.match(/<g opacity=\{numberOr\(opacity, 1\)\} style=\{style\}>/g).length, 2, 'opacity and style on a group around it');
  assert.match(objects[1], /clip-path=\{plainPaint \? `url\(#\$\{maskId\}\)` : undefined\}/, 'a plain fill is cut by an SVG clip');
  // Effects: one group per filter (WebKit ignores a list on one), and the clip round them all.
  assert.match(clipped, /<g filter=\{`url\(#\$\{effectFilters\[k\]\.id\}\)`\}>/);
  assert.match(clipped, /<g clip-path=\{`url\(#\$\{maskId\}\)`\}>\s*<g transform=\{`translate\(\$\{safeBounds\.x\} \$\{safeBounds\.y\}\)`\}>\s*\{@render filtered/);
  const plainRule = source.match(/\.shape-fill-plain \{([^}]*)\}/)[1];
  assert.doesNotMatch(plainRule, /position|overflow|opacity|transform|filter|will-change/, 'nothing that gives the plain fill a layer');
});
