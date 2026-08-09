/**
 * The scenery bake, in a real browser.
 *
 * Everything else about the fold is tested under server rendering, where SceneryGround deliberately
 * takes the other path and draws the scenery as controls. The bake itself — mount into a detached
 * node, read its innerHTML, throw the components away, replay the markup as one element — only ever
 * runs in a browser, so nothing in `npm test` touches it. This does.
 *
 * Separate from `npm test` because it needs a bundle and a browser:
 *
 *     npm run test:browser
 *
 * What it is checking, in order of how badly it would hurt:
 *   - the frozen markup still contains every control, its text, its borders and its position
 *   - the ground does not take pointer events, or it would swallow clicks meant for the surface
 *   - hiding a held control does NOT re-bake, which is the property the whole design rests on
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
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/sceneryGround.html`);
  await page.waitForFunction(() => !!window.__scenery, null, { timeout: 20000 });
  await page.waitForTimeout(300);

  const baked = await page.evaluate(() => {
    const ground = document.querySelector('.scenery-ground');
    const nodes = [...ground.querySelectorAll('[data-control-id]')];
    const heading = nodes.find((n) => n.getAttribute('data-control-id') === 'heading');
    const box = heading.getBoundingClientRect();
    return {
      expected: window.__scenery.groundIds,
      rendered: nodes.map((n) => n.getAttribute('data-control-id')),
      text: ground.textContent.replace(/\s+/g, ' ').trim(),
      svgCount: ground.querySelectorAll('svg').length,
      pointerEvents: getComputedStyle(ground).pointerEvents,
      cacheSize: window.__scenery.cacheSize(),
      headingBox: [box.x, box.y, box.width, box.height],
    };
  });

  assert.deepEqual(baked.rendered, baked.expected, 'the baked ground lost or reordered a control');
  assert.equal(baked.text, 'OSCILLATOR CUTOFF', `the labels did not survive the freeze: ${baked.text}`);
  assert.ok(baked.svgCount >= 3, `borders did not survive the freeze (${baked.svgCount} svg elements)`);
  assert.equal(baked.pointerEvents, 'none', 'the ground would swallow clicks meant for the surface');
  assert.deepEqual(baked.headingBox, [20, 10, 120, 16], 'a folded control is not where its Transform puts it');
  assert.equal(baked.cacheSize, 1, 'expected exactly one baked ground');

  await page.evaluate(() => window.__scenery.hide('heading'));
  await page.waitForTimeout(120);
  const hidden = await page.evaluate(() => ({
    cacheSize: window.__scenery.cacheSize(),
    heading: document.querySelector('[data-control-id="heading"]').style.visibility,
    legend: document.querySelector('[data-control-id="legend"]').style.visibility,
  }));
  assert.equal(hidden.heading, 'hidden', 'a held control was not hidden inside the ground');
  assert.equal(hidden.legend, '', 'hiding one control hid another');
  assert.equal(hidden.cacheSize, 1,
    're-baked on hide — this is the whole design: holding a control live must not change the ground');

  await page.evaluate(() => window.__scenery.unhide());
  await page.waitForTimeout(120);
  const restored = await page.evaluate(() => document.querySelector('[data-control-id="heading"]').style.visibility);
  assert.equal(restored, '', 'a control stayed hidden after it stopped being held');

  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  console.log('scenery bake: ok (markup, geometry, pointer-events, and no re-bake on hide)');
} catch (error) {
  failed = true;
  console.error('scenery bake: FAILED\n', error.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
