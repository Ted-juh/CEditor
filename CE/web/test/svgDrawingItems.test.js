// A drawing's markup read into the items formDrawingLayers makes into layers (utils/svgDrawingItems.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingItems } from '../src/CE_Application/utils/svgDrawingItems.js';

const colour = (token) => ({ $face: '{surface}', $accent: '{accent}', white: 'FFFFFFFF', none: '' }[token] ?? `FF${String(token).replace('#', '').toUpperCase()}`);

test('a fill and a stroke are an item each, the stroke the band it paints', () => {
  const [fill, edge] = drawingItems('<circle cx="80" cy="76" r="40" fill="$face" stroke="#102030" stroke-width="2" stroke-opacity=".5"/>', { colour });
  assert.deepEqual(fill.shape, [{ ellipse: [80, 76, 40, 40] }]);
  assert.equal(fill.colour, '{surface}');
  assert.equal(edge.colour, 'FF102030');
  assert.equal(edge.opacity, 0.5);
  // The band: a ring 2 wide on the circle (outer and inner outlines, filled even-odd).
  const radii = edge.shape.map((pts) => Math.max(...pts.map(([x, y]) => Math.hypot(x - 80, y - 76))));
  assert.ok(Math.abs(radii[0] - 41) < 0.05 && Math.abs(radii[1] - 39) < 0.05, JSON.stringify(radii));
});

test('what turns, lights and follows the value is marked, and a static turn is applied', () => {
  const items = drawingItems([
    '<path d="M80 10v5" transform="rotate(90 80 76)" stroke="#000000"/>',
    '<g data-turn="80 76"><path d="M78 30h4v20h-4Z" fill="$accent"/></g>',
    '<g data-lit="0.5"><path d="M80 13v7" stroke="$accent" stroke-width="3"/></g>',
    '<valuearc r="59" w="4" stroke="$accent"/>',
    '<text data-readout x="80" y="163" font-size="12"></text>',
  ].join(''), { colour });
  const [tick, pointer, lit, arc, readout] = items;
  // rotate(90 80 76) carries (80, 10) to (146, 76).
  assert.ok(tick.shape[0].some(([x, y]) => Math.abs(x - 146) < 0.6 && Math.abs(y - 76) < 0.6));
  assert.deepEqual(pointer.turn, [80, 76]);
  assert.equal(lit.lit, 0.5);
  assert.deepEqual(arc.arc, { radius: 59, thickness: 4, start: -135, sweep: 0, follows: 270 });
  assert.equal(readout.readout, true);
});

test('a group\'s drop shadow is its silhouette, lower, blurred, under it and turning with it', () => {
  const items = drawingItems('<g data-turn="80 76" filter="shadow"><circle data-cast cx="80" cy="76" r="40" fill="$face"/><path d="M78 30h4v20h-4Z" fill="$accent"/></g>', {
    colour, shadow: { dy: 8, blur: 4, colour: 'FF000000', opacity: 0.7 },
  });
  assert.equal(items.length, 3);
  const [shadow] = items;
  assert.deepEqual(shadow.shape, [{ ellipse: [80, 84, 40, 40] }]);
  assert.equal(shadow.blur, 4);
  assert.deepEqual(shadow.turn, [80, 76]);
});

test('a scale\'s ticks share a layer where they do not cross', () => {
  const ticks = Array.from({ length: 11 }, (_, i) => `<path d="M80 14v5" transform="rotate(${-135 + i * 27} 80 76)" stroke="#000000" stroke-width="${i % 2 ? 0.75 : 1.4}"/>`).join('');
  const items = drawingItems(ticks, { colour });
  assert.equal(items.length, 1);
  assert.equal(items[0].shape.length, 11);
});
