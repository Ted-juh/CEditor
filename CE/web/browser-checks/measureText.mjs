// Dump every case's glyph rect as JSON, so a change to the text markup can be diffed against it.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/textPlacement.html`);
await page.waitForFunction(() => !!window.__textPlacement, null, { timeout: 30000 });
await page.waitForTimeout(600);   // the placement loop measures then repositions; let it settle

const data = await page.evaluate(() => ({
  rects: window.__textPlacement(),
  nodes: window.__nodeCount(),
  anchors: window.__anchorCount(),
}));
const out = process.argv[2] ?? join(HERE, 'text-placement.json');
await writeFile(out, JSON.stringify(data, null, 1) + '\n');
console.log(`${Object.keys(data.rects).length} cases, ${data.nodes} nodes, ${data.anchors} anchors -> ${out}`);
if (errors.length) console.log('page errors:', errors.join(' | '));
await browser.close();
server.close();
