/**
 * Google icons in Settings → Icons, driven in Chromium against Google's real server:
 * `node browser-checks/googleIcons.mjs` after `vite build --config browser-checks/vite.config.mjs`.
 *
 * Needs the internet (fonts.gstatic.com), which is why it is not in `npm run test:browser`. The unit
 * tests pin the addresses and the library entries with a fake server; this is the check that Google
 * still answers at those addresses, that the previews draw, and that what lands in the library is a
 * coloured SVG the page can show.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/googleIcons.html`);
  await page.waitForSelector('.google-tile');

  // The suggestions are drawn from Google before anything is typed.
  await page.waitForFunction(() => [...document.querySelectorAll('.google-tile img')]
    .slice(0, 6).every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 20000 });
  check('the suggestion previews load from fonts.gstatic.com', () => {});

  // Search, pick two, choose a look, add.
  await page.fill('.google-search', 'equal');
  await page.waitForFunction(() => document.querySelectorAll('.google-tile').length > 0
    && [...document.querySelectorAll('.google-name')].some((n) => n.textContent === 'equalizer'));
  const names = await page.$$eval('.google-name', (els) => els.map((e) => e.textContent));
  check('search finds equalizer', () => assert.ok(names.includes('equalizer'), names.join(', ')));

  await page.click('.google-tile:has(.google-name:text-is("equalizer"))');
  await page.fill('.google-search', 'tune');
  await page.click('.google-tile:has(.google-name:text-is("tune"))');
  await page.click('.seg[aria-label="Style"] button:text-is("Rounded")');
  await page.check('.google-check input');
  check('two icons are picked', async () => {});
  assert.match(await page.textContent('.google-count'), /2 selected/);

  await page.click('.google-footer .primary-btn');
  await page.waitForFunction(() => window.__icons().length === 2, null, { timeout: 20000 });
  const icons = await page.evaluate(() => window.__icons());
  check('both landed in the library as Google icons in the chosen look', () => {
    assert.deepEqual(icons.map((i) => i.name).sort(), ['equalizer (rounded, filled)', 'tune (rounded, filled)']);
    for (const icon of icons) {
      assert.equal(icon.sourceType, 'google');
      assert.equal(icon.google.style, 'rounded');
      assert.equal(icon.google.fill, true);
      const svg = Buffer.from(icon.dataUrl.split(',')[1], 'base64').toString('utf8');
      assert.match(svg, /^<svg fill="#FFFFFF"/, 'stored white');
    }
  });
  assert.match(await page.textContent('.google-card .status'), /Added 2 icon\(s\)/);

  // The library rows show them, from the stored data — not from Google.
  await page.waitForFunction(() => [...document.querySelectorAll('.icon-row img')]
    .every((img) => img.complete && img.naturalWidth > 0));
  const pills = await page.$$eval('.icon-row .pill', (els) => els.map((e) => e.textContent));
  check('the library marks them Google', () => assert.equal(pills.filter((p) => p === 'Google').length, 2));

  // Adding the same look again is refused before anything is fetched: the tile is disabled.
  await page.fill('.google-search', 'tune');
  check('an icon already in the library in this look cannot be picked again', async () => {});
  assert.equal(await page.$eval('.google-tile:has(.google-name:text-is("tune"))', (b) => b.disabled), true);

  // A name Google does not have is reported, not stored.
  await page.fill('.google-search', 'no_such_icon_at_all');
  await page.click('.link-btn');
  await page.waitForFunction(() => /Google has no icon called/.test(document.querySelector('.google-card .status')?.textContent ?? ''));
  check('an unknown name is reported and nothing is stored', async () => {});
  assert.equal((await page.evaluate(() => window.__icons())).length, 2);

  await page.fill('.google-search', '');
  await page.waitForFunction(() => [...document.querySelectorAll('.google-tile img')]
    .slice(0, 16).every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 20000 });
  await writeFile(join(ROOT, 'google-icons.png'), await page.screenshot({ fullPage: true }));
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log('google icons: all checks passed');
} finally {
  await browser.close();
  server.close();
}
