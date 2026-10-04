// fontSubset.test.js — carried fonts cut to what a panel can show, without changing how text lays out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decompress } from 'woff2-encoder';
import * as fontkitModule from 'fontkit';

import { panelCharacters, subsetFontDataUrl, subsetSfnt } from '../src/CE_Application/utils/fontSubset.js';

const fontkit = fontkitModule.default ?? fontkitModule;
const sfntOf = async (file) => decompress(readFileSync(new URL(`../src/assets/fonts/${file}.woff2`, import.meta.url)));
const advance = (font, text) => font.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0);

test('the characters kept: Latin, punctuation, and everything the panel itself contains', () => {
  const panel = { controls: [{ _children: { Text: { content: 'Ωmega ✓' } } }], scripts: [{ source: 'label.text = "日本"' }], bgImage: 'data:image/png;base64,QUJD' };
  const set = new Set(panelCharacters(panel));
  for (const char of 'AZaz09 !~éŁ€–…Ω✓日本') assert.ok(set.has(char.codePointAt(0)), char);
  assert.ok(!set.has('Ж'.codePointAt(0)), 'nothing the panel never contains beyond the base ranges');
});

test('a static face shrinks by an order of magnitude and lays text out exactly as before', async () => {
  const sfnt = await sfntOf('liberation-sans-regular');
  const cut = await subsetSfnt(sfnt, panelCharacters({ controls: [] }));
  assert.ok(cut.length < sfnt.length / 5, `${sfnt.length} → ${cut.length}`);
  const [before, after] = [fontkit.create(Buffer.from(sfnt)), fontkit.create(Buffer.from(cut))];
  for (const text of ['AVA To fi', 'Wave Tälk', 'Price: 1.250,00 €']) {
    assert.equal(advance(after, text), advance(before, text), `kerning and ligatures kept: ${text}`);
  }
  assert.equal(after.glyphForCodePoint(0x416).id, 0, 'a Cyrillic letter the panel never shows is gone');
});

test('a variable face keeps its axis', async () => {
  const sfnt = await sfntOf('dm-sans-var-latin');
  const cut = await subsetSfnt(sfnt, panelCharacters({ controls: [] }));
  const after = fontkit.create(Buffer.from(cut));
  assert.ok(after.variationAxes?.wght, 'the weight axis survives');
  const before = fontkit.create(Buffer.from(sfnt));
  assert.equal(advance(after.getVariation({ wght: 700 }), 'Bold'), advance(before.getVariation({ wght: 700 }), 'Bold'));
});

test('a data URL comes back subset and compressed, or unchanged when that would not help', async () => {
  const woff2 = readFileSync(new URL('../src/assets/fonts/liberation-sans-regular.woff2', import.meta.url));
  const dataUrl = `data:font/woff2;base64,${woff2.toString('base64')}`;
  const next = await subsetFontDataUrl(dataUrl, panelCharacters({ controls: [] }));
  assert.match(next, /^data:font\/woff2;base64,/);
  assert.ok(next.length < dataUrl.length / 2, `${dataUrl.length} → ${next.length}`);
  assert.equal(await subsetFontDataUrl('data:font/ttf;base64,AAAA', [65]), 'data:font/ttf;base64,AAAA', 'not a font: carried as it came');
});
