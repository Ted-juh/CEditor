// glyphAtlas.test.js — a combined shape's text outlined where only the document travels.
//
// The player loads the bundled panel faces and nothing else, so text in a font the user imported
// could not be re-outlined there when a binding changed it. The shape's cache now carries a glyph
// atlas of that face (utils/fontSources.js); outlining from it must land where the font file does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FontUnavailableError, clearFontCache, glyphAtlas, needsAtlas, registerGlyphAtlas, resolveFont, setFontSources,
} from '../src/CE_Application/utils/fontSources.js';
import { textOutline } from '../src/CE_Application/utils/textOutline.js';
import { cacheScaledTo } from '../src/CE_Application/utils/booleanGroups.js';

const bytes = readFileSync(new URL('../src/assets/fonts/liberation-sans-regular.woff2', import.meta.url));
const imported = [{ id: 'imp', family: 'Imported Sans', enabled: true, localDataUrl: `data:font/woff2;base64,${bytes.toString('base64')}` }];
const label = (content) => ({
  kind: 'rectangle',
  _children: { Text: { content, _children: { Font: { family: 'Imported Sans', size: 24 }, Position: { justification: 'centred' } } } },
});
const numbers = (pathData) => pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);

test('an imported face travels as an atlas, and outlines from it where the file does', async () => {
  clearFontCache();
  setFontSources({ storedFonts: () => imported });
  const resolved = await resolveFont('Imported Sans', { weight: 400 });
  assert.equal(needsAtlas(resolved), true, 'the player cannot read an imported face for itself');
  assert.equal(needsAtlas(await resolveFont('Rubik', { weight: 400 })), false, 'a bundled face needs no atlas');

  const started = performance.now();
  const atlas = glyphAtlas(resolved, { family: 'Imported Sans', weight: 400, style: 'normal' });
  const took = performance.now() - started;
  const size = JSON.stringify(atlas).length;
  assert.ok(size < 120_000, `the atlas is small enough to live in a document: ${size} bytes`);
  assert.ok(took < 5000, `and quick to build: ${Math.round(took)} ms`);
  assert.ok(Object.keys(atlas.kern).length > 0, "it keeps the face's kerning");

  // "AVA Tower 42" has kerned pairs (AV, VA, To) and no ligatures.
  const withFile = await textOutline(label('AVA Tower 42'), 240, 40);

  // The player: no stored fonts, only what the shape carried.
  clearFontCache();
  setFontSources({ storedFonts: () => [] });
  await assert.rejects(resolveFont('Imported Sans', { weight: 400 }), FontUnavailableError);
  registerGlyphAtlas(JSON.parse(JSON.stringify(atlas)));
  const fromAtlas = await textOutline(label('AVA Tower 42'), 240, 40);
  const a = numbers(withFile.pathData);
  const b = numbers(fromAtlas.pathData);
  assert.equal(b.length, a.length, 'the same glyphs');
  const worst = Math.max(...a.map((value, i) => Math.abs(value - b[i])));
  assert.ok(worst < 0.01, `and in the same places: worst ${worst} px`);

  // A run-time change is outlined too; a character the atlas lacks is refused, as before.
  assert.ok((await textOutline(label('Élan 7'), 240, 40)).pathData.length > 0);
  await assert.rejects(textOutline(label('日本'), 240, 40), FontUnavailableError);
  clearFontCache();
});

test('a cached outline drawn at another size is shown scaled while its own is computed', () => {
  const cache = { width: 200, height: 100, shape: { pathData: 'M0 0L50 0L50 20Z', bounds: { x: 10, y: 20, width: 50, height: 20 }, insets: {}, empty: false } };
  assert.equal(cacheScaledTo(cache, 200, 100), cache.shape, 'at its own size it is the cache itself');
  const scaled = cacheScaledTo(cache, 400, 50);
  assert.deepEqual(scaled.bounds, { x: 20, y: 10, width: 100, height: 10 });
  assert.deepEqual(numbers(scaled.pathData), [0, 0, 100, 0, 100, 10]);
});

test('a border gradient that follows the outline starts top-left and runs clockwise on every contour', async () => {
  const { outlineFlowPieces, stopsColourAt, outlineBorderPaints } = await import('../src/CE_Application/utils/outlineBorder.js');
  const square = (x, y, s, ccw = false) => {
    const pts = [];
    for (let i = 0; i < s; i += 1) pts.push({ x: x + i, y });
    for (let i = 0; i < s; i += 1) pts.push({ x: x + s, y: y + i });
    for (let i = 0; i < s; i += 1) pts.push({ x: x + s - i, y: y + s });
    for (let i = 0; i < s; i += 1) pts.push({ x, y: y + s - i });
    return ccw ? pts.reverse() : pts;
  };
  // An outer ring drawn clockwise from its middle, a hole drawn counter-clockwise.
  const outer = square(0, 0, 40);
  const pieces = outlineFlowPieces([...outer.slice(50), ...outer.slice(0, 50), ...square(10, 10, 10, true)], 1.5);
  const rings = [pieces.filter((p) => p.x1 <= 40 && (p.x1 < 10 || p.x1 > 20 || p.y1 < 10 || p.y1 > 20)), pieces.filter((p) => p.x1 >= 10 && p.x1 <= 20 && p.y1 >= 10 && p.y1 <= 20)];
  assert.equal(pieces.length, 160 + 40);
  assert.deepEqual([pieces[0].x1, pieces[0].y1], [0, 0], 'the outer contour starts at its top-left');
  assert.ok(pieces[1].x1 > pieces[0].x1, 'and runs clockwise: along the top first');
  const hole = pieces.slice(160);
  assert.deepEqual([hole[0].x1, hole[0].y1], [10, 10], 'a hole starts at its own top-left');
  assert.ok(hole[1].x1 > hole[0].x1, 'and is turned to run clockwise too');
  assert.ok(pieces[0].t < 0.01 && pieces[159].t > 0.99, 't runs 0 → 1 round each contour');
  assert.ok(rings[0].length && rings[1].length);

  const stops = [{ position: 0, color: 'FF0000' }, { position: 100, color: '0000FF' }];
  assert.equal(stopsColourAt(stops, 0), '#FF0000');
  assert.equal(stopsColourAt(stops, 0.5), '#800080');
  assert.equal(stopsColourAt(stops, 1), '#0000FF');
  const border = { enabled: true, linked: true, thickness: 3, style: 'solid', fillGradient: true, gradient: { stops }, gradientFlow: 'follow' };
  assert.equal(outlineBorderPaints(border).flow, 'follow');
  assert.equal(outlineBorderPaints({ ...border, gradientFlow: 'across' }).flow, 'across');
});

// --- The font worker builds the same atlas as the page ------------------------------------------
//
// There is no Worker in node, so glyphAtlasAsync takes its fallback — which is the worker's own
// function (fontWorkerApi.buildAtlas) run on the page, fed the face's bytes rather than the parsed
// font. Equality here is what lets an atlas from either side be stored in a document.

test('the worker\'s atlas is identical to the page\'s, for a static and a variable face', async () => {
  const { glyphAtlasAsync, glyphAtlas, clearFontCache, resolveFont } = await import('../src/CE_Application/utils/fontSources.js');
  for (const [family, weight] of [['Arial', 400], ['Rubik', 650]]) {
    clearFontCache();
    const page = glyphAtlas(await resolveFont(family, { weight }), { family, weight, style: 'normal' });
    clearFontCache();
    const viaWorkerCode = await glyphAtlasAsync(await resolveFont(family, { weight }), { family, weight, style: 'normal' });
    assert.ok(Object.keys(page.kern).length > 0, `${family}: the comparison should include kerning`);
    assert.deepEqual(viaWorkerCode, page, `${family} ${weight}`);
  }
});
