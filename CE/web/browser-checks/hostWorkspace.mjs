// The HoSTage workspace itself, in a real browser: the dock between the rack and the part editor
// has a visible grip that resizes it, and every text field selects all its text on click.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-host-workspace-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18773, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();

  // The dock: a grip you can see, which drags the editor taller.
  const dock = page.getByTestId('host-dock');
  const grip = dock.getByRole('separator', { name: 'Resize the dock' });
  const gripBg = await grip.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(gripBg, 'rgba(0, 0, 0, 0)', 'the grip is visible, not a transparent strip');
  await page.getByTestId('dock-tab-zone').click();
  const before = (await dock.boundingBox()).height;
  const g = await grip.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  // In steps, with a pause: a state push mid-drag used to re-fit the dock and snap it back.
  for (let i = 1; i <= 10; i++) { await page.mouse.move(g.x + g.width / 2, g.y - 50 * i); await page.waitForTimeout(60); }
  await page.mouse.up();
  const after = (await dock.boundingBox()).height;
  assert.ok(after > before + 300, `dragging the grip up gives the editor room (${before} -> ${after})`);
  assert.ok(after > 600, 'past the old 520 px cap, in a tall window');

  // Select all on click, anywhere in HoSTage.
  await page.getByTestId('dock-tab-sounds').click();
  const search = page.getByPlaceholder(/Search sounds/);
  await search.fill('warm pad');
  await page.getByTestId('dock-tab-zone').click();
  await page.getByTestId('dock-tab-sounds').click();
  await search.click();
  const selected = await search.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  assert.deepEqual(selected, [0, 8, 8], 'clicking a text field selects all of it');
  await search.click();
  const caret = await search.evaluate((el) => el.selectionEnd - el.selectionStart);
  assert.equal(caret, 0, 'a second click places the caret, as usual');

  const state = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    return value;
  });

  // Transport: drag-or-type tempo, tap tempo, beats per bar and the beat unit as toggles.
  const tempo = page.getByTestId('host-tempo');
  await tempo.press('ArrowUp');
  assert.equal((await state()).performance.transport.tempo, 121, 'the tempo steps with the arrow keys');
  await tempo.press('Shift+ArrowUp');
  assert.equal((await state()).performance.transport.tempo, 121.1, 'and in tenths with Shift');
  await tempo.click();
  await page.keyboard.type('98');
  await page.keyboard.press('Enter');
  assert.equal((await state()).performance.transport.tempo, 98, 'or is typed');
  const tap = page.getByTestId('host-tap-tempo');
  for (let i = 0; i < 4; i++) { await tap.click(); await page.waitForTimeout(500); }
  const tapped = (await state()).performance.transport.tempo;
  assert.ok(tapped > 100 && tapped < 125, `four taps half a second apart set about 120 (${tapped})`);
  await page.locator('[data-testid=host-ts-denominator] [data-value="8"]').click();
  await page.getByTestId('host-ts-numerator').press('ArrowUp');
  const ts = (await state()).performance.transport;
  assert.deepEqual([ts.numerator, ts.denominator], [5, 8], 'beats per bar and the beat unit');
  assert.equal(await page.getByTestId('host-beat-dots').locator('i').count(), 5, 'one beat dot per beat');

  // Params: bars you drag, numbers you click to type, and where each parameter sits.
  await page.getByTestId('dock-tab-params').click();
  const params = page.getByTestId('host-parameters');
  await params.getByRole('button', { name: /Filter/ }).click().catch(() => {});
  const cutoff = params.getByRole('slider', { name: 'Cutoff' });
  await cutoff.waitFor();
  const cbox = await cutoff.boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width / 2 + cbox.width * 0.3, cbox.y + cbox.height / 2, { steps: 6 });
  await page.mouse.up();
  const moved = Number(await cutoff.getAttribute('aria-valuenow'));
  assert.ok(moved > 0.7, `dragging the bar right raises the value (${moved})`);
  await cutoff.dblclick();
  assert.ok(Math.abs(Number(await cutoff.getAttribute('aria-valuenow')) - 0.5) < 0.02, 'a double-click resets to the default');
  await params.getByTestId('param-bar-value').first().click();
  assert.equal(await params.getByLabel('Type a value for Cutoff').count(), 1, 'one click on the number opens typing');
  await page.keyboard.press('Escape');

  // Zone: the range on a keyboard, the velocity band, channel and transpose.
  await page.getByTestId('dock-tab-zone').click();
  const zone = page.getByTestId('host-zone');
  const keys = zone.getByTestId('zone-keys');
  const kbox = await keys.boundingBox();
  const low = zone.getByTestId('zone-low');
  const lbox = await low.boundingBox();
  await page.mouse.move(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(kbox.x + kbox.width * 0.4, lbox.y + lbox.height / 2, { steps: 8 });
  await page.mouse.up();
  const part0 = () => state().then((st) => st.rack.parts[0]);
  const afterLow = await part0();
  assert.ok(afterLow.keyLow > 40 && afterLow.keyLow < 60, `dragging the low edge sets the lowest key (${afterLow.keyLow})`);
  const vhigh = zone.getByTestId('zone-vel-high');
  const vbox = await vhigh.boundingBox();
  const vtrack = await zone.getByTestId('zone-velocity').boundingBox();
  await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(vtrack.x + vtrack.width * 0.5, vbox.y + vbox.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterVel = await part0();
  assert.ok(afterVel.velocityHigh > 55 && afterVel.velocityHigh < 72, `the velocity band's top edge drags (${afterVel.velocityHigh})`);
  await zone.getByTestId('zone-channel').press('ArrowUp');
  await zone.getByTestId('zone-transpose').press('ArrowDown');
  const afterRules = await part0();
  assert.deepEqual([afterRules.channel, afterRules.transpose], [1, -1], 'channel and transpose step');
  assert.match(await zone.getByTestId('zone-summary').innerText(), /channel 1 · -1 st/);
  await zone.getByTestId('zone-all').click();
  assert.equal((await part0()).keyLow, 0, '"every key" puts the range back');

  // Part rows: the level in dB, the pan as a knob that a double-click centres.
  const partRow = page.locator('[data-testid=part-volume]').first();
  await partRow.click();
  await page.keyboard.type('-6');
  await page.keyboard.press('Enter');
  const vol = (await part0()).volume;
  assert.ok(Math.abs(vol - 0.501) < 0.01, `typing -6 dB sets half the level (${vol})`);
  const pan = page.getByTestId('part-pan').first();
  await pan.press('ArrowRight');
  await pan.press('ArrowRight');
  assert.ok((await part0()).pan > 0, 'the pan knob turns');
  await pan.dblclick();
  assert.equal((await part0()).pan, 0, 'and a double-click centres it');

  // Mixer: pan and sends as knobs.
  await page.getByRole('button', { name: 'Mixer', exact: true }).first().click();
  const mixerPan = page.getByTestId('mixer-pan').first();
  await mixerPan.press('ArrowLeft');
  assert.ok((await part0()).pan < 0, 'the mixer pan knob turns');
  await mixerPan.dblclick();
  assert.equal((await part0()).pan, 0);

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('hostWorkspace: the dock, select-all, transport, Params, Zone, part rows and mixer work as drawn');
} finally {
  await browser.close();
  await server.close();
}
