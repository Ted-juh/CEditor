/**
 * An exported panel's icons draw in the player, which has no icon library:
 * `node browser-checks/playerIcons.mjs` after `vite build --config browser-checks/vite.config.mjs`.
 * Run by `npm run test:browser`. See playerIcons.entry.js for what is mounted and why.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 600, height: 300 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/playerIcons.html`);
  await page.waitForFunction(() => !!window.__player, null, { timeout: 20000 });
  const carried = await page.evaluate(() => window.__player.exportAndLoad());
  assert.deepEqual(carried.map((icon) => icon.id), ['gicon_play'], 'the export carries the one icon in use');

  await page.waitForFunction(() => document.querySelectorAll('[data-control-id]').length >= 2, null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-control-id="withIcon"] img.icon-image');
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 10000 });
  const drawn = await page.evaluate(() => ({
    src: document.querySelector('[data-control-id="withIcon"] img.icon-image')?.getAttribute('src'),
    other: document.querySelectorAll('[data-control-id="noIcon"] img.icon-image').length,
    play: window.__player.play,
  }));
  assert.equal(drawn.src, drawn.play, 'the player draws the icon the document carries');
  assert.equal(drawn.other, 0, 'and nothing where the author chose no icon');
  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log('playerIcons: an exported panel draws its icon in the player with no library — ok');
} catch (error) {
  failed = true;
  console.error('playerIcons FAILED:', error.message);
  await page.screenshot({ path: join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery/playerIcons-failure.png') }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
