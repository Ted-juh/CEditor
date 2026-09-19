// Real pointer sequences against both consumers of the custom arpeggio grid.
// Run: node browser-checks/arpGestures.mjs (CHROMIUM_PATH selects a local browser).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const original = { id: 'note', note: 65, step: 3, length: 4, velocity: 80 };
try {
  await page.goto(`${server.resolvedUrls.local[0]}arpGestures.html`);
  await page.waitForFunction(() => !!window.__arp, null, { timeout: 90000 });
  for (const surface of ['panel', 'bench']) {
    const target = page.locator(surface === 'panel' ? '#panel [data-control-id="arp_gestures"]' : '#bench .test-hitbox').first();
    await target.waitFor();
    const rect = await target.boundingBox();
    const scale = rect.width / 640;
    const sw = 588 / 16;
    const bx = 44 + 3 * sw + 1;
    const by = 24 + 6 * 20 + 10;
    const state = () => page.evaluate((s) => window.__arp.state(s), surface);
    const reset = async (length = 4) => { await page.evaluate((n) => window.__arp.reset(n), length); await page.waitForTimeout(80); };
    async function gesture(third, dx, dy, expected, length = 4) {
      await reset(length);
      const bw = length * sw - 2;
      const x = rect.x + (bx + bw * (third + 0.5) / 3) * scale;
      const y = rect.y + by * scale;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(40);
      assert.deepEqual((await state()).blocks[0], { ...original, length }, `${surface}: no jump on grab`);
      await page.mouse.move(x + dx * scale, y + dy * scale, { steps: 8 });
      await page.waitForTimeout(80);
      assert.deepEqual((await state()).blocks[0], expected, `${surface}: gesture remains locked while dragging`);
      await page.mouse.up();
      await page.waitForTimeout(40);
      assert.deepEqual((await state()).blocks[0], expected, `${surface}: release does not apply a second action`);
    }
    await gesture(1, sw * 3, -60, { ...original, velocity: 110 });
    await gesture(2, sw * 2, 60, { ...original, length: 6 });
    await gesture(0, sw * 2, -40, { ...original, step: 5, note: 67 });
    await gesture(1, sw * 3, -60, { ...original, length: 1, velocity: 110 }, 1);
    await gesture(2, sw * 2, 60, { ...original, length: 3 }, 1);
    await gesture(0, sw * 2, -40, { ...original, length: 1, step: 5, note: 67 }, 1);
    await reset();
    // Pointer movement within a blank cell must not toggle a block repeatedly.
    const x = rect.x + (44 + 10.5 * sw) * scale;
    const y = rect.y + 74 * scale;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2 * scale, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    assert.equal((await state()).blocks.length, 2, `${surface}: exactly one new note`);
    console.log(`${surface}: move / velocity / length / draw gestures passed`);
  }
  assert.deepEqual(errors, []);
  if (process.env.ARP_GESTURES_SHOT) await page.screenshot({ path: process.env.ARP_GESTURES_SHOT });
} finally {
  await browser.close();
  await server.close();
}
