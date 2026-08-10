/**
 * Can you actually pick a chip up?
 *
 * The reducer is unit-tested; this is the part that only exists in a browser. The drag-to-bind path
 * in CanvasControl — the drop handler, the compatibility preview, the surface highlight, the
 * deviceParameterDrag store — was complete and unreachable, because nothing in the app ever set
 * `application/x-ceditor-device-parameter` on a dragstart. So what matters here is not that a chip
 * renders, but that dragging one produces exactly what that handler has always been waiting for.
 *
 * Run by `npm run test:browser`.
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
  await page.goto(`http://127.0.0.1:${server.address().port}/learnChips.html`);
  await page.waitForFunction(() => !!window.__chips, null, { timeout: 20000 });

  // A DT1 edit for distortion.parameter1 (four nibbles at 10 00 04 01) carrying 4095, then a CC the
  // profile has no parameter for. The first is the case the learn reducer cannot see at all.
  await page.evaluate(() => {
    window.__chips.sysex('F0 41 10 00 00 41 12 10 00 04 01 00 0F 0F 0F 3E F7');
    window.__chips.cc('B0 4A 60');
  });
  await page.waitForFunction(() => window.__chips.rendered().length === 2, null, { timeout: 10000 });

  const rendered = await page.evaluate(() => window.__chips.rendered());
  const named = rendered.find((chip) => chip.draggable);
  const unnamed = rendered.find((chip) => !chip.draggable);

  assert.ok(named, 'no chip was draggable — a sysex edit should resolve to a named parameter');
  assert.equal(named.value, '4095', `the four-nibble value did not reach the chip (${named.value})`);
  assert.equal(named.detail, 'SysEx');
  assert.ok(unnamed, 'an unresolvable CC should still be shown');
  assert.match(unnamed.label, /CC 74/, `expected the raw CC label, got ${unnamed.label}`);
  assert.match(unnamed.title, /no parameter in this profile/, 'an unbindable chip must say why');

  // THE point of the feature: what a dragstart hands to CanvasControl's drop handler.
  const drag = await page.evaluate((label) => window.__chips.drag(label), named.label);
  assert.ok(drag.types.includes('application/x-ceditor-device-parameter'),
    `dragstart set no device-parameter data (types: ${drag.types.join(', ')})`);

  const payload = JSON.parse(drag.payload);
  assert.equal(payload.kind, 'ceditor.deviceParameter', 'parseDeviceParameterDrag checks this exact kind');
  assert.equal(payload.parameter.id, 'distortion.parameter1');
  assert.equal(payload.deviceRole, 'Roland GAIA SH-01', 'the binding must name the configured device');
  assert.equal(drag.store?.parameter?.id, 'distortion.parameter1',
    'the drag store drives the drop highlight on every control — it was not set');

  const afterEnd = await page.evaluate((label) => window.__chips.dragEnd(label), named.label);
  assert.equal(afterEnd, null, 'the drag store was left set, so every control would stay highlighted');

  // An unbindable chip must not start a drag at all, or the surface would light up for something
  // that can never be dropped.
  const refused = await page.evaluate((label) => window.__chips.drag(label), unnamed.label);
  assert.equal(refused.started, false, 'an unbindable chip started a drag');
  assert.equal(refused.store, null);

  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  console.log('learn chips: ok (sysex named and valued, raw CC explained, dragstart feeds the drop path)');
} catch (error) {
  failed = true;
  console.error('learn chips: FAILED\n', error.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
