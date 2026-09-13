// Dev-server browser validation; no application bundle or native build.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-mixer-meter-check', import.meta.url)),
  optimizeDeps: { entries: ['mixerMeters.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18769 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/mixerMeters.html`);
  await page.getByRole('button', { name: 'Mixer', exact: true }).click();
  const meter = id => page.locator(`[data-meter-id="${id}"]`);
  const part = id => page.locator(`[data-part-id="${id}"]`);
  assert.equal(await page.getByTestId('stereo-meter').count(), 6);
  assert.equal(await meter('@master').getByRole('img').getAttribute('aria-label'), 'Master: no audio meter data');
  await page.evaluate(() => window.emitMixerFrame());
  await page.locator('.master').getByText('Peak +0.8 dBFS', { exact: true }).waitFor();
  assert.equal(await meter('@master').getByRole('button').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.mixerStatePushes), 0, 'meter frames do not push rack state');
  assert.ok(await meter('part-2').locator('.meter-fill').evaluateAll(els => parseFloat(els[0].style.height) > parseFloat(els[1].style.height)), 'stereo sides differ');
  const boxes = await page.locator('.level-control').evaluateAll(els => els.map(e => e.getBoundingClientRect().y));
  assert.ok(Math.max(...boxes) - Math.min(...boxes) < 1, 'part, bus, return and master faders align');
  assert.equal(await page.getByTestId('stereo-meter').evaluateAll(els => els.every(el =>
    el.querySelector('button').getBoundingClientRect().bottom < el.querySelector('.meter-bars').getBoundingClientRect().top)), true,
    'overload lamps stay above the meter scale');
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.getByTestId('host-mixer').evaluate(e => e.scrollWidth > e.clientWidth + 1), false,
      `mixer contains its channel scrolling at ${width}px`);
    await page.getByRole('slider', { name: 'Master level', exact: true }).scrollIntoViewIfNeeded();
    if (process.env.MIXER_SCREENSHOT) {
      await page.evaluate(() => window.emitMixerFrame());
      await page.screenshot({ path: process.env.MIXER_SCREENSHOT.replace('.png', `-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const gain = page.getByRole('slider', { name: 'Volume — 03 · Spire', exact: true });
  await gain.fill('0.5');
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setPartMixer').volume), .5);
  await gain.dblclick();
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setPartMixer').volume), 1);
  await page.getByRole('slider', { name: 'Bus level — Synths', exact: true }).fill('0.4');
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setBusLevel').level), .4);
  await page.getByRole('slider', { name: 'Return level — Space', exact: true }).fill('0.2');
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setReturnLevel').level), .2);
  await page.getByRole('slider', { name: 'Master level', exact: true }).fill('0.6');
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setMasterLevel').level), .6);
  await part('part-2').getByRole('button', { name: 'M', exact: true }).click();
  assert.equal(await page.evaluate(() => window.mixerCommands.findLast(c => c.cmd === 'setPartMixer').mute), true);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Mixer', exact: true }).click();
  assert.equal(await meter('@master').getByRole('button').getAttribute('aria-pressed'), 'true', 'overload memory survives navigation');
  await page.evaluate(() => window.reorderMixerParts());
  await part('part-2').getByText('Peak -6.0 dBFS', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Select 01 · Spire', exact: true }).click();
  assert.equal(await page.evaluate(() => window.getMixerState().rack.focusedPartId), 'part-2');
  const commandCount = await page.evaluate(() => window.mixerCommands.length);
  await meter('@master').getByRole('button').click();
  assert.equal(await meter('@master').getByRole('button').getAttribute('aria-pressed'), 'false');
  await page.evaluate(() => window.emitMixerFrame());
  assert.equal(await meter('@master').getByRole('button').getAttribute('aria-pressed'), 'true', 'new overload re-latches');
  await page.getByTestId('mixer-clear-peaks').click();
  assert.equal(await meter('@master').getByRole('button').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.mixerCommands.length), commandCount, 'clearing peaks never changes audio or the document');
  await page.waitForFunction(() => [...document.querySelectorAll('.meter-fill')].every(e => parseFloat(e.style.height) === 0), undefined, { timeout: 6000 });
  assert.deepEqual(errors, []);
  console.log('Mixer browser checks passed: native event bridge, stereo levels, overload/reset, stale decay, identity/navigation, fader commands, alignment and responsive scrolling.');
} finally { await browser.close(); await server.close(); }
