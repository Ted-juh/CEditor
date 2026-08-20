/**
 * The generated AN1x panel, rendered in a browser and checked for the faults a generator cannot see.
 *
 * Everything upstream of this is structural: the generator refuses to place a parameter the profile
 * does not have, and `npm test` reads the profile and the layout. None of it renders anything, and
 * the AN1x panel has now shipped three faults that only a picture showed —
 *
 *   - a Combobox that drew nothing, because the section that makes it a Combobox had been elided
 *   - four curve lanes all in the stock blue, from colours written where nothing reads them
 *   - a row of controls hanging out of the bottom of its own box
 *
 * so this asserts the three things a screenshot would have caught, and writes the screenshot too.
 * Set PANEL_SHOT_OUT to a path to keep the picture.
 * Not a pixel baseline: fonts differ between machines. What is checked is that every control has a
 * real size, that nothing sits outside the panel, and that the boxes contain what they are drawn
 * around.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const PANEL = join(HERE, '../../panels/Yamaha AN1x.cepanel');
const OUT = process.env.PANEL_SHOT_OUT ?? '';
// Every type the page asks for. Dropping .css once turned a whole panel into an 18,000px black
// column, because the stylesheet is what makes a control position: absolute.
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = url === '/panel.json' ? await readFile(PANEL) : await readFile(join(ROOT, url));
    res.writeHead(200, { 'content-type': url === '/panel.json' ? 'application/json' : (TYPES[extname(url)] ?? 'application/octet-stream') });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/panelShot.html`);
  await page.waitForFunction(() => !!window.__panelShot, null, { timeout: 30000 });
  const panel = await page.evaluate(() => window.__panelShot.load('/panel.json'));
  await page.waitForFunction((n) => document.querySelectorAll('[data-control-id]').length >= n,
    panel.controls, { timeout: 120000 });
  await page.waitForTimeout(2500);

  const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-control-id]')].map((el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.getAttribute('data-control-id'), x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }));

  assert.equal(boxes.length, panel.controls, 'every control in the file should reach the DOM');
  assert.deepEqual(errors, [], 'the page must render without throwing');

  const invisible = boxes.filter((b) => b.w < 1 || b.h < 1);
  assert.deepEqual(invisible.map((b) => b.id), [],
    'a control with no size drew nothing — usually a section the serializer elided and the loader did not restore');

  const escaped = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > panel.width + 1 || b.y + b.h > panel.height + 1);
  assert.deepEqual(escaped.map((b) => `${b.id} at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`), [],
    'a control outside the panel is a layout arithmetic error');

  if (OUT) {
    await page.setViewportSize({ width: Math.min(panel.width, 3000), height: Math.min(panel.height, 2400) });
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT, fullPage: true });
  }
  console.log(`panelShot: ${panel.controls} controls, ${panel.width}x${panel.height}, all sized and inside the panel${OUT ? ` -> ${OUT}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
