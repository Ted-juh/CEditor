/**
 * The editor's offer to read a synth when it connects (stores/deviceReadOffer.js), in the full app:
 * nothing is asked before a synth is on a hardware port; connecting one asks once, naming it;
 * "Read now" runs the profile's full read for that role; the same port again does not ask twice.
 * The rules are unit-tested in test/playerStartup.test.js. Simulated backend, no real MIDI.
 *
 * Run: node browser-checks/deviceReadOffer.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const SESSION = '/@fs' + fileURLToPath(new URL('../src/CE_Application/stores/deviceProfileSession.js', import.meta.url));
const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const connect = (id) => page.evaluate(async ({ url, id }) => {
  const session = await import(url);
  session.mapDeviceRole('Roland GAIA SH-01', 'roland-gaia-sh01', {
    midiDestination: { type: 'hardwareOutput', id, name: 'GAIA' },
    midiInput: { type: 'hardwareInput', id: `${id}-in`, name: 'GAIA' },
  });
}, { url: SESSION, id });
const reads = () => page.evaluate(() => window.__gaia.feedbackSent()
  .filter((e) => e.name === 'startDeviceSync').map((e) => e.payload));

try {
  await page.route('**/gaia-panel.json', async (route) => route.fulfill({ contentType: 'application/json',
    body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json', { fullApp: true }));
  await page.waitForTimeout(3000);
  assert.equal(await page.getByRole('dialog').count(), 0, 'asked before any synth was connected');

  await connect('usb-gaia');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  const text = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /Read the current patch from Roland GAIA SH-01\?/);
  assert.match(text, /on GAIA/, 'the port is not named');
  assert.match(text, /changes nothing on the synth/);
  assert.equal((await reads()).length, 0, 'read before the answer');
  await dialog.getByRole('button', { name: 'Read now' }).click();
  await page.waitForTimeout(300);
  const sent = await reads();
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].deviceRole, sent[0].profileId, sent[0].syncDirection, sent[0].request],
    ['Roland GAIA SH-01', 'roland-gaia-sh01', 'pull', ''], 'not the profile\'s full read for this role');

  await connect('usb-gaia');
  await page.waitForTimeout(800);
  assert.equal(await page.getByRole('dialog').count(), 0, 'asked twice about the same port');
  assert.deepEqual(errors, []);
  console.log('device read offer: ok (none before a synth, asked once naming it, Read now runs the full read, same port not asked again)');
} catch (error) {
  console.error('device read offer: FAILED\n', error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
