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

  // Chords: the set, the builder, and the two layers
  await add.selectOption('chord');
  const chordRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: /^Chords/ });
  await chordRow.click();
  const editor = page.getByTestId('chords-editor');
  await editor.getByTestId('chord-add').click();
  const cards = editor.locator('[data-testid=chord-set] .set-card');
  assert.equal(await cards.count(), 1, 'a new chord joins the set');
  assert.match(await cards.first().innerText(), /^C\b/, 'a C major triad to start from');
  await editor.locator('[data-testid=chord-shape] [data-shape=m7]').click();
  await editor.getByTestId('chord-root').press('ArrowUp');
  await editor.getByTestId('chord-root').press('ArrowUp');
  assert.match(await cards.first().innerText(), /^Dm7/, 'shape and root rebuild the chord, and its name follows');
  assert.equal(await editor.getByTestId('chord-builder-keys').locator('rect.on').count(), 4,
    'the builder keyboard shows the four notes');
  await editor.getByTestId('chord-fill').click();
  assert.equal(await cards.count(), 8, 'the seven chords of the key join it');

  await editor.locator('[data-testid=follow-shape] [data-shape=minor]').click();
  assert.equal(await editor.getByTestId('layer-light-follow').getAttribute('aria-pressed'), 'true',
    'picking a follow shape lights the layer');
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C4 plays Cm/);
  await editor.getByTestId('follow-high').click();
  await editor.getByTestId('follow-high').fill('B3');
  await editor.getByTestId('follow-high').press('Enter');
  await editor.getByTestId('follow-keys').locator('rect[data-note="48"]').click();
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C3 plays Cm/);
  await editor.getByTestId('follow-keys').locator('rect[data-note="60"]').click();
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C4 plays itself/,
    'above the follow range a key plays alone');

  await editor.getByTestId('layer-tab-keys').click();
  await editor.getByTestId('chord-learn').click();
  const badges = editor.locator('[data-testid=key-chords] .key-badge');
  assert.equal(await badges.count(), 1, 'learning maps a key');
  assert.match(await badges.first().innerText(), /C4 → C/);
  assert.equal(await editor.getByTestId('layer-light-keys').getAttribute('aria-pressed'), 'true');
  await editor.getByTestId('keymap-keys').locator('rect[data-note="62"]').click();
  await editor.locator('[data-testid=keymap-assign] .tile[data-index="0"]').click();
  assert.equal(await badges.count(), 2, 'a clicked key can be pointed at any set chord');
  assert.match(await chordRow.innerText(), /follow min.*2 mapped keys/, 'the collapsed row names both layers');
  await editor.getByTestId('layer-light-follow').click();
  assert.doesNotMatch(await chordRow.innerText(), /follow/, 'the light switches following off');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('noteModules: strum, humanize and chords editors draw, change and summarise');
} finally {
  await browser.close();
  await server.close();
}
