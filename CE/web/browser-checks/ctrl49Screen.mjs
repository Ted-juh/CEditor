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
    layers: ['init', 'set_mode', 'set_layers', 'draw'],
    soundcheck: ['init', 'set_mode', 'set_check', 'draw'],
    discover: ['init', 'set_mode', 'set_discover', 'draw'],
    cue: ['init', 'set_mode', 'set_cue', 'draw'],
    changes: ['init', 'set_mode', 'set_changes', 'draw'],
    custom: ['init', 'set_mode', 'set_labels', 'set_values', 'draw'],
  };
  const drawn = {};
  for (const [scene, calls] of Object.entries(scenes)) {
    await page.locator(`[data-scene=${scene}]`).click();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    // Wait for this scene's calls, not just as many calls: two scenes can send the same number.
    await page.waitForFunction((want) => [...document.querySelectorAll('[data-testid=ctrl49-sent] .call b')]
      .map((b) => b.innerText).join() === want, calls.join()).catch(() => {});
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
  assert.match(await host.getByTestId('ctrl49-screen-status').innerText(), /No CTRL49 connected — shown here only/);
  assert.match(await host.getByTestId('ctrl49-page').innerText(), /1\s*\/\s*1\s*Performance/,
    'a rack with no control pages shows the performance page, as the keyboard would');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-card.png` });

  // The two stage pages are not there until asked for, and then follow the performance page.
  const canvasLit = () => host.evaluate(() => {
    const c = document.querySelector('[data-testid=ctrl49-screen-canvas]');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
    return lit;
  });
  const pageLabel = () => host.getByTestId('ctrl49-page').innerText();
  assert.equal(await host.getByTestId('ctrl49-layers-toggle').getAttribute('aria-pressed'), 'false', 'Layers starts off');
  await host.getByTestId('ctrl49-layers-toggle').click();
  // The stand-in is the Free edition, which has no setlists to check, so SOUNDCHECK is offered
  // and refused in one place: the switch says why it is off. The licence a paid edition would
  // carry is then put into the store, as the native side reports one it has verified.
  const soundcheckToggle = host.getByTestId('ctrl49-soundcheck-toggle');
  assert.equal(await soundcheckToggle.isDisabled(), true, 'without setlists, SOUNDCHECK cannot be turned on');
  assert.equal(await soundcheckToggle.getAttribute('title'), 'Needs scenes and setlists');
  await host.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostState.update((s) => ({ ...s, licence: { ...s.licence,
      features: s.licence.features.map((f) => ({ ...f, allowed: true })) } }));
  });
  await soundcheckToggle.click();
  await host.waitForFunction(() => /1\s*\/\s*3/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  const performanceLit = await canvasLit();
  await host.getByTestId('ctrl49-page-right').click();
  await host.waitForFunction(() => /Layers/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  assert.match(await pageLabel(), /2\s*\/\s*3\s*Layers/, 'Page Right walks on to LAYERS once it is on');
  assert.match(await host.getByTestId('ctrl49-hint').innerText(), /Encoder 1 picks the part/);
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the page draws set_layers');
  await host.waitForFunction((before) => {
    const c = document.querySelector('[data-testid=ctrl49-screen-canvas]');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
    return lit > 2000 && lit !== before;
  }, performanceLit);
  const encoderOne = card.locator('.encoder').first();
  assert.equal(await encoderOne.locator('.label').innerText(), 'Part', 'encoder 1 is named for what it does here');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-layers.png` });

  await host.getByTestId('ctrl49-page-right').click();
  await host.waitForFunction(() => /Soundcheck/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  assert.match(await pageLabel(), /3\s*\/\s*3\s*Soundcheck/, 'and on to SOUNDCHECK');
  assert.equal(await card.locator('.encoder').nth(7).locator('.label').innerText(), 'Check again');
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the page draws set_check');
  assert.ok(await canvasLit() > 2000, 'and draws something');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-soundcheck.png` });

  await host.getByTestId('ctrl49-soundcheck-toggle').click();
  await host.getByTestId('ctrl49-layers-toggle').click();
  await host.waitForFunction(() => /1\s*\/\s*1\s*Performance/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));

  // DISCOVER: the demo library has a taste in it, so the page lists what it would suggest, and
  // its pads are live (each auditions its row) where the other two pages' are not.
  await host.getByTestId('ctrl49-discover-toggle').click();
  await host.getByTestId('ctrl49-page-right').click();
  await host.waitForFunction(() => /2\s*\/\s*2\s*Discover/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the page draws set_discover');
  assert.equal(await encoderOne.locator('.label').innerText(), 'Pick');
  assert.match(await encoderOne.locator('.value').innerText(), /^1 \/ \d+$/, 'and says where in the list it is');
  const firstPad = card.locator('.pad').first();
  assert.equal(await firstPad.isDisabled(), false, 'on DISCOVER the pads play');
  assert.equal(await firstPad.getAttribute('title'), 'Audition row 1');
  // The demo library has one sound never opened, a pad: E3 keeps the list to its kind.
  const kindValue = card.locator('.encoder').nth(2).locator('.value');
  assert.equal(await kindValue.innerText(), 'Every kind');
  await card.locator('.encoder').nth(2).getByRole('button', { name: 'Encoder 3 up' }).click();
  await host.waitForFunction(() => document.querySelectorAll('[data-testid=ctrl49-screen-card] .encoder .value')[2].innerText === 'Pad');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-discover.png` });
  await host.getByTestId('ctrl49-discover-toggle').click();
  await host.waitForFunction(() => /1\s*\/\s*1\s*Performance/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));

  // CUE: the setlist read mid-show (the licence above allows setlists). Encoder 1 is the pick.
  await host.getByTestId('ctrl49-cue-toggle').click();
  await host.getByTestId('ctrl49-page-right').click();
  await host.waitForFunction(() => /2\s*\/\s*2\s*Cue/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the page draws set_cue');
  assert.equal(await encoderOne.locator('.label').innerText(), 'Pick a song');
  assert.ok(await canvasLit() > 2000, 'and draws something');
  if (process.env.CTRL49_SCREENSHOT) await card.screenshot({ path: `${process.env.CTRL49_SCREENSHOT}ctrl49-host-cue.png` });
  await host.getByTestId('ctrl49-cue-toggle').click();
  await host.waitForFunction(() => /1\s*\/\s*1\s*Performance/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));

  // CHANGES: the preview has no plug-in to read changes through, and the page says so.
  await host.getByTestId('ctrl49-changes-toggle').click();
  await host.getByTestId('ctrl49-page-right').click();
  await host.waitForFunction(() => /2\s*\/\s*2\s*Changes/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));
  assert.equal(await host.getByTestId('ctrl49-screen-failure').count(), 0, 'the page draws set_changes');
  assert.ok(await canvasLit() > 1000, 'and draws why there is nothing to compare');
  await host.getByTestId('ctrl49-changes-toggle').click();
  await host.waitForFunction(() => /1\s*\/\s*1\s*Performance/.test(document.querySelector('[data-testid=ctrl49-page]').innerText));

  // The rest of the firmware's Lua surface, through the real runtime: padding and the font table,
  // draw_system_text, clear_errors, asset_get_valid, and the note hook (hook 2 calls note(args)).
  const surface = await page.evaluate(async () => {
    const { createCtrl49Screen } = await import('/src/CE_Application/screen/ctrl49Runtime.js');
    const canvas = Object.assign(document.createElement('canvas'), { width: 480, height: 272 });
    const lua = `
      local T = text_data.new()
      local heard = -1
      function init(args)
        text_data.set(T, { text = "PADDED", color = 0xFFFFFFFF, font = 2, font_size = 30,
          just_hor = 0, just_ver = 0, padding_hor = 40, padding_ver = 20, bk_color = 0xFF203040,
          border_color = 0xFFFF9408, border_width_left = 2, border_width_top = 2,
          border_width_right = 2, border_width_bottom = 2 })
        set_hook_enabled(2, 1)
      end
      function note(args) heard = get_byte(args, 1) end
      function draw(args)
        clear_errors()
        draw_rect(0, 0, 480, 272, 0xFF000000)
        draw_text(T, 0, 0, 480, 100)
        draw_system_text(T)
        if asset_get_valid(0x0200) then draw_rect(0, 260, 10, 10, 0xFF00FF00) end
        if heard == 60 then draw_rect(470, 260, 10, 10, 0xFFFF0000) end
      end`;
    const screen = await createCtrl49Screen(canvas, { lua, assets: {} });
    screen.call('init', []);
    const listened = screen.note(0x90, 60, 100);
    screen.call('draw', []);
    const px = (x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
    screen.dispose();
    return { listened, border: px(1, 50), fill: px(20, 50), inset: px(30, 10), heard: px(475, 265), noAsset: px(5, 265) };
  });
  // The real HoSTage page's performance extras: beat dots from bytes 9..11, and held notes from
  // the note hook, drawn as a strip along the bottom.
  const pagePath = fileURLToPath(new URL('../../../tools/ctrl49/Hostage_MultiKnob.lua', import.meta.url)).split('\\').join('/');
  const perf = await page.evaluate(async (luaPath) => {
    const { createCtrl49Screen } = await import('/src/CE_Application/screen/ctrl49Runtime.js');
    const lua = (await import(`/@fs/${luaPath.replace(/^\//, '')}?raw`).catch(() => null))?.default;
    if (!lua) return { skipped: true };
    const canvas = Object.assign(document.createElement('canvas'), { width: 480, height: 272 });
    const screen = await createCtrl49Screen(canvas, { lua, assets: {} });
    const labels = [5, 62, 32, 49, 46, 49, 0, 0, 0, 0, 0, 0, 0, 0];   // "> 1.1" and no clips
    const px = (x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
    screen.call('init', []);
    screen.call('set_mode', [1]);
    screen.call('set_labels', labels);
    screen.call('set_values', [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 4]);   // performance, beat 1 of 4
    const heard = screen.note(0x90, 60, 110);
    screen.call('draw', []);
    const beatOne = px(470 - 4 * 11 + 2, 15), beatTwo = px(470 - 3 * 11 + 2, 15);
    const noteAt = px(Math.floor((60 - 36) * (480 / 61)) + 1, 260);
    screen.note(0x80, 60, 0);
    screen.call('set_values', [0, 0, 0, 0, 0, 0, 0, 0, 0]);         // a control page's nine bytes
    screen.call('draw', []);
    const noDotsOnControlPage = px(470 - 4 * 11 + 2, 15);
    screen.dispose();
    return { heard, beatOne, beatTwo, noteAt, noDotsOnControlPage };
  }, pagePath);
  assert.ok(!perf.skipped, 'the HoSTage page was loaded for the performance check');
  {
    assert.equal(perf.heard, true, 'the HoSTage page turns the note hook on');
    assert.deepEqual(perf.beatOne, [255, 148, 8], 'beat one of the bar is lit orange');
    assert.deepEqual(perf.beatTwo, [89, 98, 115], 'the other beats are dim');
    assert.deepEqual(perf.noteAt, [255, 148, 8], 'a held note shows in the strip, orange when played hard');
    assert.notDeepEqual(perf.noDotsOnControlPage, [89, 98, 115], 'a control page draws no beat dots');
  }

  assert.equal(surface.listened, true, 'a page that enabled hook 2 hears notes');
  assert.deepEqual(surface.heard.slice(0, 3), [255, 0, 0], 'and its note() saw note 60');
  assert.deepEqual(surface.border.slice(0, 3), [255, 148, 8], 'text borders draw in border_color');
  assert.deepEqual(surface.fill.slice(0, 3), [32, 48, 64], 'bk_color fills the text box');
  assert.deepEqual(surface.noAsset.slice(0, 3), [0, 0, 0], 'asset_get_valid is false for an asset never uploaded');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('ctrl49Screen: every scene runs the embedded page and draws, in the preview and in HoSTage');
} finally {
  await browser.close();
  await server.close();
}
