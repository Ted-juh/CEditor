// Uses a dev server and the real components; no native compilation or app bundle.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-layers-check', import.meta.url)),
  optimizeDeps: { entries: ['layers.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18766 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 940 } });
  page.setDefaultTimeout(10000);
  const errors = [];page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/layers.html`);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Select Vanguard range', exact: true }).click();
  const inspector = page.getByTestId('layer-inspector');
  await inspector.getByText('02 · Vanguard', { exact: true }).waitFor();
  const input = name => inspector.getByLabel(name, { exact: true });
  const lastEdit = () => page.evaluate(() => window.layerCommands.findLast(c => c.cmd === 'setLayerMember'));
  await input('Minimum').fill('50');await input('Minimum').press('Tab');
  assert.equal((await lastEdit()).minimum, 50 / 127);
  const handle = page.getByRole('button', { name: 'Vanguard minimum range', exact: true });
  const before = await page.evaluate(() => window.layerCommands.filter(c => c.cmd === 'setLayerMember').length);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 12);await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 12, { steps: 6 });
  assert.equal(await page.evaluate(() => window.layerCommands.filter(c => c.cmd === 'setLayerMember').length), before,
    'drag previews do not save every pointer movement');
  assert.ok(Number(await input('Minimum').inputValue()) > 50);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.layerCommands.filter(c => c.cmd === 'setLayerMember').length), before + 1);
  const accepted = await input('Minimum').inputValue();
  const b = await handle.boundingBox();await page.mouse.move(b.x + 5, b.y + 12);await page.mouse.down();
  await page.mouse.move(b.x + 50, b.y + 12);await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await input('Minimum').inputValue(), accepted, 'Escape discards a drag');
  await handle.focus();await page.keyboard.press('ArrowLeft');
  assert.equal(Number(await input('Minimum').inputValue()), Number(accepted) - 1);
  const fade = page.getByRole('button', { name: 'Vanguard upper crossfade', exact: true });
  const fb = await fade.boundingBox();await page.mouse.move(fb.x + 10, fb.y + 10);await page.mouse.down();
  await page.mouse.move(fb.x + 40, fb.y + 10);await page.mouse.up();
  assert.ok((await lastEdit()).crossfade > .1);
  await input('Crossfade').fill('0');await input('Crossfade').press('Tab');
  assert.equal((await lastEdit()).crossfade, 0);
  await input('Minimum').fill('127');await input('Minimum').press('Tab');
  assert.equal(await input('Minimum').inputValue(), await input('Maximum').inputValue(), 'bounds cannot cross');
  const sameLow = await handle.boundingBox();
  const sameHigh = await page.getByRole('button', { name: 'Vanguard maximum range', exact: true }).boundingBox();
  assert.ok(sameLow.y + sameLow.height <= sameHigh.y, 'zero-width ranges keep both handles reachable');
  await input('Minimum').fill('42');await input('Minimum').press('Tab');
  await input('Crossfade').fill('10');await input('Crossfade').press('Tab');
  const source = page.getByLabel('Source', { exact: true });
  await source.selectOption('key');await inspector.getByText('F#2', { exact: true }).waitFor();
  await source.selectOption('macro');assert.equal(await input('Maximum').getAttribute('max'), '100');
  await input('Minimum').fill('25');await input('Minimum').press('Tab');assert.equal((await lastEdit()).minimum, .25);
  assert.equal(await page.getByLabel('Macro', { exact: true }).inputValue(), 'blend');
  await source.selectOption('cc');await page.getByLabel('Controller', { exact: true }).fill('74');
  await page.getByLabel('Controller', { exact: true }).press('Tab');
  assert.equal(await page.evaluate(() => window.getLayersState().rack.layerGroups[0].controller), 74);
  await page.getByLabel('Voice mode').selectOption('roundRobin');await page.getByText(/New notes rotate/).waitFor();
  await page.getByLabel('Voice mode').selectOption('all');await source.selectOption('velocity');
  await page.getByRole('switch', { name: 'Enable Velocity blend', exact: true }).click();
  assert.equal(await page.evaluate(() => window.getLayersState().rack.layerGroups[0].enabled), false);
  await page.getByRole('switch', { name: 'Enable Velocity blend', exact: true }).click();
  await page.evaluate(() => window.unresolveLayerMember());await inspector.getByText('Unavailable routing').waitFor();
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 940 });
    assert.equal(await page.getByTestId('host-layer-groups').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `no overflow at ${width}`);
    await input('Minimum').scrollIntoViewIfNeeded();
    if (process.env.LAYERS_SCREENSHOT && width === 900)
      await page.screenshot({ path: process.env.LAYERS_SCREENSHOT.replace('.png', '-900.png') });
  }
  await page.setViewportSize({ width: 1280, height: 940 });
  if (process.env.LAYERS_SCREENSHOT) await page.screenshot({ path: process.env.LAYERS_SCREENSHOT });
  await page.getByLabel('Add instrument').selectOption('part-3');assert.equal(await page.getByTestId('layer-member-select').count(), 4);
  await page.getByRole('button', { name: 'Remove instrument', exact: true }).click();
  assert.equal(await page.getByTestId('layer-member-select').count(), 4, 'first click only arms removal');
  await page.getByRole('button', { name: 'Confirm: Remove instrument', exact: true }).press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Remove instrument', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'Remove instrument', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm: Remove instrument', exact: true }).click();
  assert.equal(await page.getByTestId('layer-member-select').count(), 3);
  await page.getByRole('button', { name: 'Remove group', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm: Remove group', exact: true }).click();
  await page.getByText('No layer groups yet').waitFor();await page.getByTestId('add-layer-group').click();
  await page.getByTestId('layer-group').waitFor();
  assert.deepEqual(errors, []);
  console.log('Layers browser checks passed: drag commit/cancel, keyboard, numerical bounds, crossfade, sources, modes, missing routing, responsive layout, add/remove.');
} finally { await browser.close(); await server.close(); }
