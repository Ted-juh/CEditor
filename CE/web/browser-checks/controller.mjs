// Serves the actual Svelte UI for browser checks; does not compile an application bundle.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-controller-check', import.meta.url)),
  optimizeDeps: { entries: ['controller.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18765 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.stack); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/controller.html`);
  await page.getByRole('button', { name: 'Controller', exact: true }).click();
  const target = page.getByTestId('surface-encoder-2');
  await target.waitFor();
  const before = await target.boundingBox();
  assert.ok(before.width > 25 && before.height > 25, 'controller has usable drop targets');
  await page.getByTestId('surface-param').filter({ hasText: 'Resonance' }).dragTo(target);
  assert.deepEqual(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'assignSurfaceControl')),
    { cmd: 'assignSurfaceControl', pageId: 'page-1', kind: 'encoder', index: 1,
      partId: 'mock-part-1', parameterId: 'param-1' });
  assert.equal(await target.getAttribute('aria-pressed'), 'true', 'dropping selects its assignment');
  assert.deepEqual(await target.boundingBox(), before, 'drag feedback never moves the target');
  await page.getByTestId('surface-param').filter({ hasText: 'Filter cutoff' }).click();
  await page.getByTestId('surface-assign-selected').click();
  assert.equal(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'assignSurfaceControl').parameterId), 'cutoff');
  await page.getByTestId('surface-learn-selected').click();
  await page.getByText('Listening for MIDI…').waitFor();
  assert.equal(await target.evaluate(el => el.classList.contains('learning')), true);
  await page.getByTestId('surface-encoder-3').click();
  assert.equal(await page.getByTestId('surface-encoder-3').evaluate(el => el.classList.contains('learning')), false,
    'selecting another control does not move the listening indicator');
  await page.getByTestId('surface-learn-selected').click();
  assert.equal(await page.getByText('Listening for MIDI…').count(), 0);
  assert.equal(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'cancelMidiLearn');
  await page.getByTestId('surface-encoder-1').click();
  const pickup = page.getByRole('switch', { name: 'MIDI pickup', exact: true });
  assert.equal(await pickup.getAttribute('aria-checked'), 'false');
  assert.equal(await page.getByTestId('pickup-direction').count(), 0);
  await pickup.click();
  assert.deepEqual(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'setControlSlotOptions')),
    { cmd: 'setControlSlotOptions', pageId: 'page-1', slotId: 'encoder-1', midiPickup: true });
  assert.equal(await pickup.getAttribute('aria-checked'), 'true');
  await page.evaluate(() => window.setPickupDirection(1));
  assert.equal(await page.getByTestId('surface-encoder-1').getByTestId('pickup-direction').innerText(), '↑');
  if (process.env.CONTROLLER_SCREENSHOT)
    await page.screenshot({ path: process.env.CONTROLLER_SCREENSHOT.replace('.png', '-pickup.png') });
  await page.evaluate(() => window.setPickupDirection(-1));
  assert.equal(await page.getByTestId('surface-encoder-1').getByTestId('pickup-direction').innerText(), '↓');
  await page.getByLabel('MIDI control mode').selectOption('relative');
  assert.equal(await pickup.count(), 0, 'relative controls have no pickup setting to wait on');
  assert.equal(await page.getByTestId('pickup-direction').count(), 0);
  await page.getByLabel('MIDI control mode').selectOption('absolute');
  assert.equal(await pickup.getAttribute('aria-checked'), 'true', 'absolute pickup preference is retained');
  await pickup.click();
  assert.equal(await pickup.getAttribute('aria-checked'), 'false');
  await page.getByLabel('Minimum', { exact: true }).fill('0.2');
  await page.getByLabel('Minimum', { exact: true }).press('Tab');
  assert.equal(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'setControlSlotOptions').rangeMin), .2);
  await page.getByRole('button', { name: 'Clear MIDI binding', exact: true }).click();
  assert.notEqual(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'clearControlSlotMidi');
  await page.getByRole('button', { name: 'Confirm: Clear MIDI binding', exact: true }).click();
  assert.equal(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'clearControlSlotMidi');
  await page.getByTestId('surface-clear-selected').click();
  assert.notEqual(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'clearControlSlot');
  await page.getByTestId('surface-clear-selected').click();
  assert.equal(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'clearControlSlot');
  await page.getByLabel("Search this instrument's parameters").fill('release');
  assert.equal(await page.getByTestId('surface-param').count(), 1);
  await page.getByLabel("Search this instrument's parameters").fill('');
  const filters = page.getByRole('group', { name: 'Parameter filter', exact: true });
  assert.equal(await filters.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  await filters.getByRole('button', { name: 'Favourites', exact: true }).click();
  assert.deepEqual(await page.getByTestId('surface-param').allTextContents(), ['Filter cutoff', 'Envelope release']);
  await page.getByLabel("Search this instrument's parameters").fill('release');
  assert.equal(await page.getByTestId('surface-param').count(), 1);
  await filters.getByRole('button', { name: 'Recently touched', exact: true }).click();
  assert.equal(await page.getByTestId('surface-param').count(), 0, 'search stays active within the selected filter');
  await page.getByLabel("Search this instrument's parameters").fill('');
  assert.deepEqual(await page.getByTestId('surface-param').allTextContents(), ['Resonance', 'Filter cutoff'],
    'recent parameters retain touch order and include favourites');
  await page.evaluate(() => window.controllerEvent('instrumentHostParamValues', {
    partId: 'mock-part-1', touched: ['param-2', 'param-1', 'cutoff'], changes: [{ id: 'param-2', value: .7 }],
  }));
  assert.equal(await page.getByTestId('surface-param').first().innerText(), 'Envelope attack');
  await page.getByTestId('surface-param').first().dragTo(page.getByTestId('surface-encoder-2'));
  assert.equal(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'assignSurfaceControl').parameterId), 'param-2');
  await page.evaluate(() => window.controllerEvent('instrumentHostParamValues', {
    partId: 'another-part', touched: ['param-3'], changes: [],
  }));
  assert.equal(await page.getByTestId('surface-param').first().innerText(), 'Envelope attack', 'other targets cannot change this list');
  await filters.getByRole('button', { name: 'All', exact: true }).click();
  assert.equal(await page.getByTestId('surface-param').count(), 104);
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.getByTestId('host-surface-panel').evaluate(el => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, `no horizontal overflow at ${width}px`);
    for (const button of await filters.getByRole('button').all()) assert.equal(await button.isVisible(), true);
    await page.getByTestId('surface-learn-selected').scrollIntoViewIfNeeded();
    assert.equal(await page.getByTestId('surface-learn-selected').isVisible(), true);
    if (process.env.CONTROLLER_SCREENSHOT && width === 900)
      await page.screenshot({ path: process.env.CONTROLLER_SCREENSHOT.replace('.png', '-900.png') });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  if (process.env.CONTROLLER_SCREENSHOT) await page.screenshot({ path: process.env.CONTROLLER_SCREENSHOT });
  await page.getByTestId('surface-region-pads').click();
  await page.getByTestId('surface-pad-1').click();
  await page.getByTestId('surface-param').first().dragTo(page.getByTestId('surface-pad-1'));
  assert.equal(await page.evaluate(() => window.controllerCommands.findLast(c => c.cmd === 'assignSurfaceControl').kind), 'pad');
  await page.getByTestId('surface-back').click();
  await page.getByTestId('surface-keys').click();
  assert.equal(await page.getByTestId('surface-assign-selected').count(), 0, 'unavailable controls cannot assign');
  await page.evaluate(() => window.showEmptyController());
  await page.getByTestId('surface-describe').click();
  await page.getByTestId('surface-describe-form').waitFor();
  await page.getByTestId('surface-sweep').click();
  assert.equal(await page.evaluate(() => window.controllerCommands.at(-1).cmd), 'learnUserSurface');
  assert.deepEqual(errors, []);
  console.log('Controller browser checks passed: drag/drop, click assignment, learn/cancel, mapping options, clear, search, responsive layout, description.');
} finally { await browser.close(); await server.close(); }
