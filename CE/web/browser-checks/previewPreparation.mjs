import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Use the built harness: dependency discovery in a dev server can reload the second page in
// the middle of a measurement, destroying the execution context rather than testing a transition.
const server = process.env.PREVIEW_URL
  ? { resolvedUrls: { local: [process.env.PREVIEW_URL] }, httpServer: null }
  : await preview({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 2300 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}previewPreparation.html`);
  await page.waitForFunction(() => !!window.__preparation);
  const { groundCount } = await page.evaluate(() => window.__preparation.load());
  await page.evaluate(() => window.__preparation.render(true));
  const reference = await page.screenshot();
  await page.evaluate(() => window.__preparation.clear());
  const start = Date.now();
  await page.evaluate(() => window.__preparation.prepare());
  const prepareMs = Date.now() - start;
  const prepared = await page.evaluate(() => window.__preparation.stats());
  assert.equal(prepared.scenery.builds, groundCount);
  assert.ok(prepared.parts.builds > 0);
  await page.evaluate(() => window.__preparation.render());
  const preparedShot = await page.screenshot();
  if (process.env.PREPARATION_SHOT_DIR) {
    await writeFile(`${process.env.PREPARATION_SHOT_DIR}/scenery-live.png`, reference);
    await writeFile(`${process.env.PREPARATION_SHOT_DIR}/scenery-prepared.png`, preparedShot);
  }
  assert.ok(preparedShot.equals(reference), 'prepared scenery must paint exactly like the live controls');
  assert.equal((await page.evaluate(() => window.__preparation.stats())).scenery.builds, groundCount);
  const editedId = await page.evaluate(() => window.__preparation.editCaption());
  await page.evaluate(() => window.__preparation.prepare());
  await page.evaluate(() => window.__preparation.render());
  assert.match(await page.locator(`[data-control-id="${editedId}"]`).innerText(), /CACHE EDIT/);
  assert.equal((await page.evaluate(() => window.__preparation.stats())).scenery.builds, groundCount + 1);
  const beforeMidi = await page.evaluate(() => window.__preparation.stats());
  await page.evaluate(() => window.__preparation.editMidi());
  await page.evaluate(() => window.__preparation.prepare());
  const afterMidi = await page.evaluate(() => window.__preparation.stats());
  assert.equal(afterMidi.scenery.builds, beforeMidi.scenery.builds);
  assert.equal(afterMidi.parts.builds, beforeMidi.parts.builds, 'MIDI binding changes reuse static graphics');
  await page.evaluate(() => window.__preparation.undo());
  await page.evaluate(() => window.__preparation.render());
  assert.ok((await page.screenshot()).equals(reference), 'undo restores the cached original picture');
  assert.equal((await page.evaluate(() => window.__preparation.stats())).scenery.builds, groundCount + 1);
  await page.evaluate(() => window.__preparation.render(false, { scale: 2 }));
  assert.equal((await page.evaluate(() => window.__preparation.stats())).scenery.builds, groundCount * 2 + 1, 'zoom is part of markup cache context');
  assert.deepEqual(errors, []);
  const appPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  appPage.on('pageerror', error => errors.push(String(error)));
  await appPage.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await appPage.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await appPage.waitForFunction(() => !!window.__gaia);
  await appPage.evaluate(() => window.__gaia.load('/gaia-panel.json', { fullApp: true, preview: false }));
  await appPage.waitForFunction(count => window.__gaia.preparationStats().builds >= count, groundCount, { timeout: 15000 });
  // Let the remaining per-component jobs finish before measuring the transition.
  await appPage.waitForTimeout(2000);
  const warmBuilds = await appPage.evaluate(() => window.__gaia.preparationStats().builds);
  const warmTransitionMs = await appPage.evaluate(async () => {
    const start = performance.now();
    window.__gaia.preview(true);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
  assert.equal(await appPage.evaluate(() => window.__gaia.preparationStats().builds), warmBuilds,
    'the real EditorCanvas prepares the exact scenery consumed by preview');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ groundCount, prepareMs, warmTransitionMs, prepared, beforeMidi, afterMidi, errors }, null, 2));
} finally { await browser.close(); if (server.httpServer) await new Promise(resolve => server.httpServer.close(resolve)); }
