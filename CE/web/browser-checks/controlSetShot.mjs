/**
 * The specimen panel under each built-in control set, rendered in a browser and photographed.
 *
 * The node suite proves what a set writes into the resolved tree; it cannot prove that a
 * chicken-head is drawn where the tree says, that a bead-blast filter lights a cap rather than
 * turning it black, or that the panel's material does not swallow the controls. Those are
 * pictures. This renders the same specimen under every set, asserts the page rendered without
 * throwing and every control got a size, and writes one PNG per set when CONTROL_SET_SHOT_DIR
 * names a directory.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const OUT_DIR = process.env.CONTROL_SET_SHOT_DIR ?? '';
const SCALE = Number(process.env.CONTROL_SET_SHOT_SCALE ?? 2) || 2;
const SETS = (process.env.CONTROL_SET_SHOT_SETS ?? 'graphite,ivory,tolex,machined').split(',').map((s) => s.trim()).filter(Boolean);
// A set file (the contents of a .ceditor-controlset.json, or any set object) rendered instead of
// the built-ins — the way to look at a set before it is one.
const SET_FILE = process.env.CONTROL_SET_SHOT_FILE ?? '';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, url));
    res.writeHead(200, { 'content-type': TYPES[extname(url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 940, height: 240 }, deviceScaleFactor: SCALE });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/controlSetShot.html`);
  await page.waitForFunction(() => !!window.__controlSetShot, null, { timeout: 30000 });
  if (OUT_DIR) await mkdir(OUT_DIR, { recursive: true });
  for (const setId of SETS) {
    const shown = SET_FILE
      ? await page.evaluate((set) => window.__controlSetShot.showSet(set), JSON.parse(await readFile(SET_FILE, 'utf8')))
      : await page.evaluate((id) => window.__controlSetShot.show(id), setId);
    await page.waitForFunction((n) => document.querySelectorAll('[data-control-id]').length >= n, shown.controls, { timeout: 60000 });
    await page.evaluate(() => window.__controlSetShot.fontsReady());
    await page.waitForTimeout(1200);
    const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-control-id]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { id: el.getAttribute('data-control-id'), w: rect.width, h: rect.height };
    }));
    assert.equal(boxes.length, shown.controls, `${setId}: every control reaches the DOM`);
    assert.deepEqual(boxes.filter((b) => b.w < 1 || b.h < 1), [], `${setId}: every control has a size`);
    const filters = await page.evaluate(() => document.querySelectorAll('filter[id^="part-material"], filter[id^="surface-material"], filter[id^="panel-material"]').length);
    const caps = await page.evaluate(() => document.querySelectorAll('mask[id$="bodyCapCircle"]').length);
    if (OUT_DIR) await page.screenshot({ path: join(OUT_DIR, `${setId}.png`), clip: { x: 0, y: 0, width: shown.width, height: shown.height } });
    console.log(`controlSetShot: ${setId} — ${shown.controls} controls, ${caps} knob caps, ${filters} material filters`);
  }
  assert.deepEqual(errors, [], 'the page must render without throwing');
} finally {
  await browser.close();
  server.close();
}
