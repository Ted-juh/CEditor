// Serve the actual UI in a dev browser; no application build or native plug-ins.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-target-context-check', import.meta.url)),
  optimizeDeps: { entries: ['targetContext.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18768 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/targetContext.html`);
  const picker = page.getByLabel('Sounds target part');
  await picker.selectOption('part-2');
  const artwork = await page.getByTestId('dock-target-context').locator('img').getAttribute('src');
  assert.ok(artwork.startsWith('data:image/svg+xml,'));
  await page.getByRole('button', { name: 'Mixer', exact: true }).click();
  const third = page.getByRole('button', { name: 'Select 03 · Spire', exact: true });
  assert.equal(await third.getAttribute('aria-pressed'), 'true');
  assert.equal(await third.locator('img').getAttribute('src'), artwork);
  if (process.env.TARGET_SCREENSHOT) await page.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', '-mixer.png') });
  await page.getByRole('button', { name: 'Select 02 · Spire', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  assert.equal(await page.getByTestId('layer-member-select').nth(1).getAttribute('aria-pressed'), 'true');
  await page.getByTestId('layer-member-select').nth(2).click();
  if (process.env.TARGET_SCREENSHOT) await page.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', '-layers.png') });
  await page.getByRole('button', { name: 'Controller', exact: true }).click();
  assert.equal(await page.getByLabel('Parameter source instrument').inputValue(), 'part-2');
  await page.getByTestId('surface-param').filter({ hasText: 'Cutoff for part-2' }).waitFor();
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('.part-picker').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    if (process.env.TARGET_SCREENSHOT && width === 1280)
      await page.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', '-controller.png') });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Delayed native replies must not leave the old source's draggable parameters visible.
  await page.evaluate(() => window.deferParameters = true);
  await page.getByLabel('Parameter source instrument').selectOption('part-1');
  assert.equal(await page.getByTestId('surface-param').count(), 0);
  await page.evaluate(() => { window.deferParameters = false; window.deliverParameters('part-1'); });
  await page.getByTestId('surface-param').filter({ hasText: 'Cutoff for part-1' }).waitFor();
  await page.getByRole('button', { name: 'Rack', exact: true }).click();
  assert.equal(await picker.inputValue(), 'part-1');
  assert.equal(await page.evaluate(() => window.targetCommands.some(c => ['openEditor', 'openEffectEditor'].includes(c.cmd))), false);
  await picker.selectOption('part-2');
  await page.getByTestId('dock-tab-params').click();
  await page.getByLabel('Parameter target').selectOption('fx-2-1');
  const path = page.getByTestId('target-context-path');
  await path.filter({ hasText: '03 · Spire › 02 · Delay' }).waitFor();
  await page.getByRole('button', { name: 'Open editor', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.targetCommands.findLast(c => c.cmd === 'openEffectEditor')),
    { cmd: 'openEffectEditor', effectId: 'fx-2-1' });
  await page.evaluate(() => window.mutateTargets('push'));
  assert.equal(await page.getByLabel('Parameter target').inputValue(), 'fx-2-1');
  await page.evaluate(() => window.mutateTargets('reorder'));
  await path.filter({ hasText: '03 · Spire › 01 · Delay' }).waitFor();
  await page.getByRole('button', { name: 'Controller', exact: true }).click();
  await page.getByTestId('surface-param').filter({ hasText: 'Cutoff for part-2' }).waitFor();
  await page.getByRole('button', { name: 'Rack', exact: true }).click();
  await page.getByText('Cutoff for fx-2-1', { exact: true }).waitFor();
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.getByTestId('dock-target-context').evaluate(el => el.scrollWidth > el.clientWidth + 1), false,
      `target bar fits at ${width}px`);
    if (process.env.TARGET_SCREENSHOT) await page.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', `-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.mutateTargets('remove'));
  assert.equal(await page.getByLabel('Parameter target').inputValue(), 'part-2');
  for (const [testId, owner, effectId] of [['host-master-fx', 'Master', 'master-fx'], ['host-return-fx', 'Return · Space', 'return-fx']]) {
    await page.getByTestId('dock-tab-rack').click();
    await page.getByTestId(testId).getByLabel('Inspect insert 1 Delay parameters').click();
    assert.equal(await page.getByTestId('target-owner').innerText(), owner);
    assert.equal(await page.getByLabel('Parameter target').inputValue(), effectId);
    assert.equal(await page.getByLabel('Editing part', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Back to part', exact: true }).click();
    assert.equal(await page.getByLabel('Editing part', { exact: true }).inputValue(), 'part-2');
  }
  await page.evaluate(() => window.setStageController());
  const profileRequests = await page.evaluate(() => window.targetCommands.filter(c => c.cmd === 'getSurfaceLayout').length);
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  const stage = page.getByTestId('host-stage-view');
  assert.equal(await stage.getByTestId('stage-controller-name').innerText(), 'Controls · My fader controller');
  assert.equal(await stage.getByTestId('stage-midi-status').innerText(), 'MIDI · USB MIDI keyboard');
  assert.equal(await stage.getByTestId('stage-display-status').count(), 0);
  assert.equal(await stage.getByText('Looking for CTRL49', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.targetCommands.some(c => c.cmd === 'getAudioDevices')), true);
  assert.equal(await page.evaluate(() => window.targetCommands.filter(c => c.cmd === 'getSurfaceLayout').length), profileRequests,
    'Stage reuses the selected profile without requesting a default that could replace it');
  await page.evaluate(() => window.setStageController('failed'));
  assert.equal(await stage.getByTestId('stage-midi-status').getAttribute('class').then(c => c.includes('good')), true);
  assert.equal(await stage.getByTestId('stage-display-status').innerText(), 'Hardware display · Unavailable · CTRL49');
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await stage.locator('.stage-status').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    assert.equal(await stage.locator('.controls-panel .panel-head').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    if (process.env.TARGET_SCREENSHOT) await page.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', `-stage-${width}.png`) });
  }
  await page.evaluate(() => window.setStageController('searching', false));
  assert.equal(await stage.getByTestId('stage-midi-status').innerText(), 'MIDI · From host');
  await page.setViewportSize({ width: 1280, height: 900 });
  const readiness = stage.getByTestId('stage-next-readiness');
  for (const [state, label] of [['none', 'Loads on selection'], ['loading', 'Loading rig… 2/3'], ['ready', 'Rig preloaded'], ['degraded', 'Needs attention']]) {
    await page.evaluate(state => window.setStagePreload(state), state);
    assert.equal(await readiness.innerText(), label);
    assert.equal(await readiness.isVisible(), true);
    assert.equal(await stage.getByRole('button', { name: 'Start setlist', exact: true }).isEnabled(), true);
  }
  assert.equal(await readiness.getAttribute('title'), 'Spire could not be loaded.');
  if (process.env.TARGET_SCREENSHOT) await stage.screenshot({ path: process.env.TARGET_SCREENSHOT.replace('.png', '-next-readiness.png') });
  await page.evaluate(() => window.setStagePreload('scene'));
  assert.equal(await readiness.count(), 0);
  assert.deepEqual(errors, []);
  console.log('Target context browser checks passed: shared artwork, view continuity, duplicate names, delayed parameters, effect ownership and removal, editor commands, responsive layout.');
} finally { await browser.close(); await server.close(); }
