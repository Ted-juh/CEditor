/**
 * The inspector's swatches show the colour the canvas draws, and say when it is the set's.
 * See setSwatches.entry.js.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try { const body = await readFile(join(ROOT, url)); res.writeHead(200, { 'content-type': TYPES[extname(url)] ?? 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
const rgb = (argb) => `rgb(${[2, 4, 6].map((i) => parseInt(argb.slice(i, i + 2), 16)).join(', ')})`;

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/setSwatches.html`);
  await page.waitForFunction(() => !!window.__swatches, null, { timeout: 30000 });

  const tolex = await page.evaluate(() => window.__swatches.show('tolex'));
  await page.waitForFunction(() => !!window.__swatches.bars());
  const onTolex = await page.evaluate(() => window.__swatches.bars());
  assert.equal(onTolex.background, rgb(tolex.series), 'on Tolex the Bars swatch is the tan the bars are drawn in');
  assert.equal(onTolex.fromSet, true);
  assert.match(onTolex.title, /from the control set/);
  console.log('  ok  Tolex: the Bars swatch shows the set\'s colour, marked as the set\'s');

  const graphite = await page.evaluate(() => window.__swatches.show('graphite'));
  const onGraphite = await page.evaluate(() => window.__swatches.bars());
  assert.equal(onGraphite.background, rgb(graphite.factory));
  assert.equal(onGraphite.fromSet, false, 'Graphite draws the factory colour: nothing to mark');
  console.log('  ok  Graphite: the factory colour, unmarked');

  await page.evaluate(() => window.__swatches.show('tolex', { barColour: 'FF123456' }));
  const chosen = await page.evaluate(() => window.__swatches.bars());
  assert.equal(chosen.background, rgb('FF123456'));
  assert.equal(chosen.fromSet, false, 'an author\'s colour is theirs');
  console.log('  ok  an author\'s colour shows as written, unmarked');

  assert.deepEqual(errors, [], 'the page must render without throwing');
  console.log('setSwatches: the inspector shows what the canvas draws');
} finally {
  await browser.close();
  server.close();
}
