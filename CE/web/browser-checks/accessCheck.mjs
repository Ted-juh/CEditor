/**
 * The dock's Access tool measures text against what is drawn behind it (stores/accessibilityCheckRun.js).
 *
 * Grey on a light plate is too faint; black on white is fine; large pale text passes at 3:1 where
 * small text would not; dark text on the panel's own dark colour is too faint even though the
 * label has no plate of its own — the background is measured as drawn, not read from the CSS.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const body = await readFile(join(ROOT, url));
    res.writeHead(200, { 'content-type': TYPES[extname(url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/accessCheck.html`);
  await page.waitForFunction(() => !!window.__access, null, { timeout: 30000 });
  await page.evaluate(() => window.__access.load());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => window.__access.measure());
  console.log(JSON.stringify(result.results));
  assert.equal(result.ok, true);
  const by = Object.fromEntries(result.results.map((entry) => [entry.id, entry]));
  assert.ok(by.faint && by.strong && by.large && by.onPanel, 'every label was measured');
  assert.ok(by.faint.ratio < 4.5 && by.faint.ratio > 1.5, `grey on a light plate is too faint (${by.faint.ratio})`);
  assert.ok(by.strong.ratio > 15, `black on white is plainly readable (${by.strong.ratio})`);
  assert.equal(by.large.large, true);
  assert.ok(by.large.ratio >= 3 && by.large.ratio < 4.5, `large pale text: between 3 and 4.5 (${by.large.ratio})`);
  assert.ok(by.onPanel.ratio < 2, `dark on the panel's own dark colour, though it has no plate (${by.onPanel.ratio})`);
  assert.deepEqual(result.failing.map((entry) => entry.id).sort(), ['faint', 'onPanel']);
  assert.deepEqual(errors, []);
  console.log('accessCheck: ok');
} finally {
  await browser.close();
  server.close();
}
