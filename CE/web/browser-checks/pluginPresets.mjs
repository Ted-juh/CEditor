// The Library page's presets by plug-in, in a real browser: a plug-in with presets, one whose
// preset files were found in a folder of their own and pass a test load, one whose files the
// plug-in will not read, and one with nothing on disk. Only failures need attention.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-plugin-presets-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18778, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Library', exact: true }).first().click();
  const report = page.getByTestId('plugin-presets');
  await report.waitFor();
  const row = (name) => report.locator(`[data-plugin="${name}"]`);

  assert.match(await row('Massive X').innerText(), /4139 presets/);
  assert.doesNotMatch(await report.locator('.report-head').innerText(), /need attention/,
    'plug-ins whose presets are in a format of their own are not failures');

  // Found on disk, in a format the plug-in alone reads: offered for a test load.
  const transfigure = row('Transfigure');
  assert.match(await transfigure.getByTestId('plugin-presets-found').innerText(), /Found 262 \.sbtr files in …\\Documents\\Sugar Bytes\\Transfigure/);
  await transfigure.getByTestId('plugin-presets-test').click();
  assert.match(await transfigure.getByTestId('plugin-presets-folder').innerText(), /From …\\Documents\\Sugar Bytes\\Transfigure \(\.sbtr\) · 262 presets/);
  assert.match(await transfigure.locator('.row-title').innerText(), /262 presets/, 'the row counts them at once');

  // Found, but the plug-in will not take them: said plainly, with another folder to try.
  const tb = row('TB-303');
  await tb.getByTestId('plugin-presets-test').click();
  assert.match(await tb.getByTestId('plugin-presets-folder').innerText(), /can't read the \.bin files .* as it was/);
  assert.equal(await tb.getByRole('button', { name: 'Try another folder…' }).count(), 1);
  assert.match(await tb.locator('.row-title').innerText(), /no presets/);

  // Nothing on disk at all: only its own browser, with a way to point at an unusual folder.
  const wormhole = row('WORMHOLE');
  assert.match(await wormhole.getByTestId('plugin-presets-browser-only').innerText(), /only in its own browser/);
  assert.equal(await wormhole.getByTestId('plugin-presets-add').count(), 1);
  assert.equal(await wormhole.locator('.load-failed').count(), 0, 'and it is not shown as an error');
  await page.screenshot({ path: process.env.PRESETS_SCREENSHOT || 'C:/tmp/plugin-presets.png', fullPage: false });

  // Removing the folder asks once more, then the row is back to offering the files.
  await transfigure.getByRole('button', { name: 'Remove folder' }).click();
  await transfigure.getByRole('button', { name: 'Confirm' }).click();
  await transfigure.getByTestId('plugin-presets-found').waitFor();
  assert.match(await transfigure.locator('.row-title').innerText(), /no presets/);

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('pluginPresets: found folders are tested, refused plainly, and browser-only plug-ins are not errors');
} finally {
  await browser.close();
  await server.close();
}
