// The Strum and Humanize editors in the HoSTage MIDI chain, in a real browser: the pictures draw
// what the engines would play, the controls change the module, and the collapsed row names it.
// (The arithmetic itself is pinned to the engine in test/noteModuleViews.test.js.)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-note-modules-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18772, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();
  await page.getByRole('button', { name: 'MIDI', exact: true }).first().click();
  const add = page.getByLabel('Add a MIDI module');
  await add.selectOption('strum');
  await add.selectOption('humanize');

  // Strum
  const strumRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: 'Strum' });
  await strumRow.click();
  const picture = page.getByTestId('strum-picture');
  assert.equal(await picture.locator('rect.note').count(), 6, 'the example chord has six notes');
  const spread = page.getByTestId('strum-spread');
  assert.equal(await spread.innerText(), 'off');
  for (let i = 0; i < 3; i++) await spread.press('ArrowUp');
  assert.equal(await spread.innerText(), '1/16', 'arrow keys step the spread through the beat values');
  await page.locator('[data-testid=strum-stroke] [data-value=descending]').click();
  const onsets = async () => (await picture.locator('rect.onset').evaluateAll((rs) => rs.map((r) => ({
    y: Number(r.getAttribute('y')), x: Number(r.getAttribute('x')) }))));
  const down = await onsets();
  const highest = down.reduce((a, b) => (b.y < a.y ? b : a));
  const lowest = down.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok(highest.x < lowest.x, 'a down-stroke plays the highest note first');
  await page.locator('[data-testid=strum-stroke] [data-value=ascending]').click();
  const up = await onsets();
  assert.ok(up.reduce((a, b) => (b.y > a.y ? b : a)).x < up.reduce((a, b) => (b.y < a.y ? b : a)).x,
    'and an up-stroke the lowest');
  assert.equal(await picture.locator('circle.handle').count(), 1, 'the feel has a handle on the curve');
  assert.match(await strumRow.innerText(), /1\/16/, 'the collapsed row says what the strum does');

  // Humanize
  const humanRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: 'Humanize' });
  await humanRow.click();
  await page.locator('[data-testid=humanize-feel] [data-value=human]').click();
  assert.equal(await page.locator('[data-testid=humanize-feel] [aria-pressed=true]').innerText(), 'Human');
  assert.equal(await page.getByTestId('humanize-velocity').innerText(), '±18', 'a feel sets its amounts');
  assert.match(await humanRow.innerText(), /Human/, 'and the collapsed row names it');
  await page.getByTestId('humanize-velocity').press('ArrowUp');
  assert.equal(await page.locator('[data-testid=humanize-feel] [aria-pressed=true]').count(), 0,
    'changing an amount by hand leaves the named feels');
  assert.equal(await page.getByTestId('humanize-picture').locator('rect.stem').count(), 16, 'a bar of sixteen notes');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('noteModules: strum and humanize editors draw, change and summarise');
} finally {
  await browser.close();
  await server.close();
}
