// Real Svelte components served locally, without building an application bundle.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PERFORMANCE_GROUPS } from '../src/CE_Application/utils/performanceNavigation.js';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-performance-navigation-check', import.meta.url)),
  optimizeDeps: { entries: ['performanceNavigation.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18767 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 940 } });
  page.setDefaultTimeout(10000);
  const errors = [];page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/performanceNavigation.html`);
  const goGroup = id => page.getByTestId(`perf-group-${id}`).click();
  const goTool = id => page.getByTestId(`perf-tab-${id}`).click();
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  for (const group of PERFORMANCE_GROUPS) {
    await goGroup(group.id);
    for (const tool of group.tools) {
      await goTool(tool.id);
      assert.equal(await page.getByTestId(`perf-tab-${tool.id}`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByTestId('perf-location').textContent(), `Performance / ${group.label} / ${tool.label}`);
      assert.equal(await page.getByTestId('perf-capture-recent').isVisible(), true);
    }
  }
  await goGroup('modulation');await goTool('lfos');
  assert.equal(await page.getByTestId('perf-midi-lfos').getByText(/No LFOs yet|No MIDI LFOs yet/).count(), 0);
  await goGroup('capture');await goTool('recorder');
  await goGroup('modulation');assert.equal(await page.getByTestId('perf-tab-lfos').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '+ LFO', exact: true }).click();
  await page.getByLabel('LFO name').fill('Filter movement');await page.getByLabel('LFO name').press('Tab');
  assert.equal(await page.evaluate(() => window.getNavigationState().rack.midiLfos[0].name), 'Filter movement');
  await page.getByRole('button', { name: 'Route in matrix →', exact: true }).click();
  assert.equal(await page.getByTestId('perf-tab-modulation').getAttribute('aria-pressed'), 'true');
  await goGroup('capture');await page.getByTestId('perf-capture-recent').click();
  assert.equal(await page.evaluate(() => window.performanceCommands.findLast(c => c.cmd === 'captureRecentMidi').seconds), 30);
  await page.evaluate(() => window.finishNavigationCapture());
  assert.equal(await page.getByTestId('perf-group-playback').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('perf-tab-patterns').getAttribute('aria-pressed'), 'true');
  await goGroup('modulation');await goTool('lfos');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  assert.equal(await page.getByTestId('perf-tab-lfos').getAttribute('aria-pressed'), 'true', 'old capture does not override restored tool');
  await page.reload();await page.getByTestId('perf-tab-lfos').waitFor();
  assert.equal(await page.getByTestId('perf-tab-lfos').getAttribute('aria-pressed'), 'true');
  await goGroup('capture');assert.equal(await page.getByTestId('perf-tab-recorder').getAttribute('aria-pressed'), 'true');
  await goGroup('modulation');
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 940 });
    assert.equal(await page.locator('.performance-navigation').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `navigation fits ${width}`);
    assert.equal(await page.locator('.perf-toolbar').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `capture fits ${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 940 });
  if (process.env.PERFORMANCE_SCREENSHOT) await page.screenshot({ path: process.env.PERFORMANCE_SCREENSHOT });
  assert.deepEqual(errors, []);
  console.log('Performance navigation browser checks passed: 13 tools, group memory, remount/reload, LFO add/edit/routing, capture jump, responsive navigation.');
} finally { await browser.close(); await server.close(); }
