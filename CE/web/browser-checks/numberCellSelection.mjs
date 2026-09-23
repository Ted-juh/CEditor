import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': types[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/numberCellSelection.html`);
await page.waitForFunction(() => window.__numberCellSelection);

const input = page.getByLabel('Selected value');
await input.fill('77');
await page.locator('[data-row="second"]').click();
await page.waitForTimeout(50);

assert.equal(await page.evaluate(() => window.__numberCellSelection.selected()), 'second');
assert.deepEqual(await page.evaluate(() => window.__numberCellSelection.values()), { first: 77, second: 20 },
  'the draft must commit to the control that owned it before pointer selection changes');

console.log('number cell selection: all checks passed');
await browser.close();
server.close();
