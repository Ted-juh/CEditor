import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-soundcheck-check', import.meta.url)),
  optimizeDeps: { entries: ['performanceNavigation.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18772 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/performanceNavigation.html`);
  await page.evaluate(() => window.setupSoundcheck());
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await page.getByTestId('perf-group-setup').click();
  await page.getByTestId('perf-tab-setlist').click();
  const first = page.getByTestId('soundcheck-song0'), second = page.getByTestId('soundcheck-song1');
  assert.equal(await first.getByTestId('soundcheck-peak').textContent(), '—');
  assert.equal(await second.getByRole('button', { name: 'Measure', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Check setlist', exact: true }).click();
  assert.equal(await page.evaluate(() => window.performanceCommands.at(-1).cmd), 'checkSetlistSoundcheck');
  const now = Date.now();
  await page.evaluate(now => window.pushSoundcheck({ entries: [
    { itemId: 'song0', checkedAt: now, basis: 'Opening rig', issues: [], measured: true, measuredAt: now, peak: 0.5, rms: 0.25, seconds: 12 },
    { itemId: 'song1', checkedAt: now, basis: 'Ballad rig', issues: ['MIDI output unavailable: Stage piano'], measured: true, measuredAt: now, peak: 0, rms: 0, seconds: 5 },
  ] }), now);
  assert.equal(await first.getByTestId('soundcheck-peak').textContent(), '-6.0');
  assert.equal(await first.getByTestId('soundcheck-average').textContent(), '-12.0');
  assert.equal(await second.getByTestId('soundcheck-peak').textContent(), '−∞');
  await second.getByRole('button', { name: 'Soundcheck details for Ballad' }).click();
  assert.equal(await page.getByTestId('soundcheck-details').getByText('MIDI output unavailable: Stage piano', { exact: true }).isVisible(), true);
  await first.getByRole('button', { name: 'Measure', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.performanceCommands.at(-1)), { cmd: 'startSoundcheck', itemId: 'song0' });
  await page.evaluate(() => window.pushSoundcheck({ activeItemId: 'song0' }));
  await first.getByRole('button', { name: 'Stop', exact: true }).click();
  assert.equal(await page.evaluate(() => window.performanceCommands.at(-1).cmd), 'finishSoundcheck');
  await page.evaluate(() => window.pushSoundcheck({ activeItemId: '', blockedReason: 'Wait for the scene change to finish.' }));
  assert.equal(await first.getByRole('button', { name: 'Measure', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.pushSoundcheck({ blockedReason: '' }));
  for (const width of [1440, 900, 640]) {
    await page.setViewportSize({ width, height: 980 });
    assert.equal(await first.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `soundcheck fits ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  if (process.env.SOUNDCHECK_SCREENSHOT) await page.screenshot({ path: process.env.SOUNDCHECK_SCREENSHOT });
  await page.evaluate(() => window.pushSoundcheck({ activeItemId: 'song0' }));
  const stopCount = () => page.evaluate(() => window.performanceCommands.filter(c => c.cmd === 'finishSoundcheck').length);
  const before = await stopCount();
  await page.getByTestId('perf-setlist').getByRole('button', { name: 'Mixer', exact: true }).click();
  assert.ok(await stopCount() > before, 'opening Mixer stops measurement');
  assert.equal(await page.getByTestId('perf-setlist').count(), 0);
  await page.evaluate(() => window.pushSoundcheck({ activeItemId: '' }));
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  assert.equal(await first.getByTestId('soundcheck-peak').textContent(), '-6.0', 'reading retained on return');
  await page.evaluate(() => window.pushSoundcheck({ activeItemId: 'song0' }));
  const beforeTool = await stopCount();
  await page.getByTestId('perf-tab-tuning').click();
  assert.ok(await stopCount() > beforeTool, 'changing tools stops measurement');
  assert.deepEqual(errors, []);
  console.log('Soundcheck browser checks passed: command routing, reference details, dB readings, silence, load gating, responsive rows, Mixer and tool navigation.');
} finally { await browser.close(); await server.close(); }
