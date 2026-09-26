// The HoSTage CTRL49 screen preview, in a real browser: the embedded display page
// (tools/ctrl49/Hostage_MultiKnob.lua) runs under wasmoon for every scene, draws something, and
// reports a Lua failure where you can read it instead of leaving a black screen.
//
// Served by the app's own Vite config, because the preview reads the page from tools/ctrl49 and
// that permission lives there. CTRL49_SCREENSHOT=dir/ saves one PNG per scene.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root,
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-ctrl49-screen-check', import.meta.url)),
  optimizeDeps: { entries: ['ctrl49.html'] },
  server: { host: '127.0.0.1', port: 18771, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ctrl49.html`);

  // The canvas, as numbers: how many pixels are lit at all, and how many are the page's orange.
  const measure = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid=ctrl49-canvas]');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let lit = 0, orange = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r + g + b > 120) lit++;
      if (r > 200 && g > 100 && g < 190 && b < 60) orange++;
    }
    return { lit, orange };
  });
  const sentCalls = () => page.getByTestId('ctrl49-sent').locator('.call b').allInnerTexts();

  // The first draw lands once wasmoon has loaded; wait for it rather than for a timer.
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=ctrl49-sent] .call').length > 2);

  const scenes = {
    splash: ['init', 'set_mode', 'draw'],
    control: ['init', 'set_mode', 'set_labels', 'set_values', 'draw'],
    performance: ['init', 'set_mode', 'set_labels', 'set_values', 'draw'],
    browse: ['init', 'set_mode', 'set_labels', 'set_values', 'draw'],
    custom: ['init', 'set_mode', 'set_labels', 'set_values', 'draw'],
  };
  const drawn = {};
  for (const [scene, calls] of Object.entries(scenes)) {
    await page.locator(`[data-scene=${scene}]`).click();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid=ctrl49-sent] .call').length === n, calls.length);
    assert.deepEqual(await sentCalls(), calls, `${scene}: the calls the host makes, in its order`);
    assert.equal(await page.getByTestId('ctrl49-error').count(), 0, `${scene}: the page ran without a Lua error`);
    drawn[scene] = await measure();
    assert.ok(drawn[scene].lit > 2000, `${scene}: the page drew something (${drawn[scene].lit} lit pixels)`);
    assert.ok(drawn[scene].orange > 300, `${scene}: in the page's own colours (${drawn[scene].orange} orange)`);
    if (process.env.CTRL49_SCREENSHOT)
      await page.getByTestId('ctrl49-canvas').screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-${scene}.png` });
  }
  assert.ok(drawn.splash.orange > drawn.control.orange, 'the splash is the logo, not the knob page');

  // A value change redraws: the knob under slot 1 fills as its value rises.
  await page.locator('[data-scene=control]').click();
  const slotValue = page.getByLabel('Slot 1 value');
  await slotValue.fill('0');
  const empty = await measure();
  await slotValue.fill('127');
  const full = await measure();
  assert.ok(full.orange > empty.orange + 100, `turning slot 1 up fills its knob (${empty.orange} -> ${full.orange})`);

  // A call the page does not define is named, where it can be read.
  await page.locator('[data-scene=custom]').click();
  await page.getByTestId('ctrl49-calls').fill('set_labels s"X"\nset_meters 1 2 3');
  await page.getByTestId('ctrl49-error').waitFor();
  assert.match(await page.getByTestId('ctrl49-error').innerText(), /no function 'set_meters'/);

  // The same page, inside HoSTage: the Controller workspace's screen card draws with no keyboard
  // (the browser has no broker, so the store's stand-in feeds it), and its Page buttons page.
  const host = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  host.setDefaultTimeout(20000);
  host.on('pageerror', (e) => errors.push(e.message));
  await host.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await host.getByRole('button', { name: 'Controller', exact: true }).click();
  const card = host.getByTestId('ctrl49-screen-card');
  await card.scrollIntoViewIfNeeded();
  await host.waitForFunction(() => {
    const c = document.querySelector('[data-testid=ctrl49-screen-canvas]');
    if (!c) return false;
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let orange = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 100 && data[i + 1] < 190 && data[i + 2] < 60) orange++;
    return orange > 300;
  });
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the card ran the display page');
  assert.match(await host.getByTestId('ctrl49-screen-status').innerText(), /No keyboard connected/);
  assert.match(await host.getByTestId('ctrl49-page').innerText(), /1\s*\/\s*1\s*Performance/,
    'a rack with no control pages shows the performance page, as the keyboard would');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-card.png` });

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('ctrl49Screen: every scene runs the embedded page and draws, in the preview and in HoSTage');
} finally {
  await browser.close();
  await server.close();
}
