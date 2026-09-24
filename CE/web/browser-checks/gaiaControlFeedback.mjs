import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__gaia.feedbackConnect());
  const ctl = async name => page.locator(`[data-control-id="${await page.evaluate(n => window.__gaia.id(n), name)}"]`).first();
  const incoming = values => page.evaluate(values => window.__gaia.feedbackEvent('dumpMessageParsed', { ok: true, requestId: 'incoming_control_feedback', deviceRole: 'Roland GAIA SH-01', values }), values);
  const lamps = c => c.locator('.interactive-part').evaluateAll(parts => parts.filter(p => p.style.zIndex === '3').map(p => getComputedStyle(p).backgroundColor));
  const value = name => page.evaluate(n => {
    const session = window.__gaia.session(n);
    return session.customValues?.value ?? session.valueOverride;
  }, name);
  const sends = () => page.evaluate(() => window.__gaia.feedbackSent().filter(e => e.name === 'setDeviceParameter'));
  const until = async (check, context = '') => { for (let i = 0; i < 40; i++) { if (await check()) return; await page.waitForTimeout(50); } assert.fail(`Control feedback timed out: ${context}`); };
  const selectors = await page.evaluate(() => window.__gaia.controls.filter(c =>
    /^tone[123]\./.test(c._children.Core.name) && c._children.Behaviors?._children?.drive?.type === 'selector'
  ).map(c => ({ name: c._children.Core.name, zones: Object.values(c._children.HitZones._children) })));
  assert.equal(selectors.length, 18);
  let choicesChecked = 0;
  for (const { name, zones } of selectors) {
    const control = await ctl(name), rect = await control.boundingBox();
    await incoming({ [name]: zones.at(-1).payload });
    await until(async () => await value(name) === zones.at(-1).payload);
    for (const [index, zone] of zones.entries()) {
      const expected = zone.payload?.value ?? zone.payload;
      const b = zone.bounds;
      await page.mouse.click(rect.x + rect.width * (b.x + b.width * .2) / 100,
        rect.y + rect.height * (b.y + b.height / 2) / 100, { delay: 50 });
      await until(async () => await value(name) === expected, `${name} click ${expected}, actual ${await value(name)}`);
      assert.deepEqual(await lamps(control), zones.map((_, i) => i === index ? 'rgb(255, 59, 48)' : 'rgb(43, 23, 24)'), name);
      try { await until(async () => (await sends()).some(e => e.payload.parameterId === name && e.payload.value === expected)); }
      catch (error) { console.log('missing send', name, expected, (await sends()).slice(-3)); throw error; }
      choicesChecked++;
    }
    // Return to zero after a nonzero selection; zero must not fall through to pointer position.
    await incoming({ [name]: zones[0].payload });
    await until(async () => await value(name) === zones[0].payload);
    assert.equal((await lamps(control))[0], 'rgb(255, 59, 48)', `${name}: incoming MIDI`);
  }
  console.log(`Passed ${choicesChecked} selector choices, including visible lamps and outbound values.`);
  // Editing the Status Display also updates the original selector's lamp.
  await (await ctl('tone1.osc.wave')).click();
  const lower = await (await ctl('bottom_pages')).boundingBox();
  await page.mouse.click(lower.x + lower.width / 8, lower.y + 16);
  await page.locator('.status-editor').getByRole('combobox', {name:'Parameter choice',exact:true}).selectOption('4');
  assert.equal((await lamps(await ctl('tone1.osc.wave')))[4], 'rgb(255, 59, 48)');
  // Check all tone knobs/faders, with the graph layer hidden so the faders can be reached.
  for (let tone = 1; tone <= 3; tone++) for (const section of ['osc.pitchEnv', 'filter.env', 'amp.env']) {
    const button = await ctl(`tone${tone}.${section}.viewButton`);
    if ((await button.innerText()).trim() === 'Graph') await button.click();
  }
  const ranges = await page.evaluate(() => window.__gaia.controls.filter(c =>
    /^tone[123]\./.test(c._children.Core.name) && ['slider', 'knob'].includes(c._children.Behaviors?._children?.drive?.role)
  ).map(c => ({ name: c._children.Core.name, channel: c._children.ValueChannels._children.value,
    meta: c._children.Designer?.lcdReadout ?? {} })));
  assert.ok(ranges.length > 50);
  for (const { name, channel, meta } of ranges) {
    const lo = meta.display?.min ?? channel.format?.displayMin ?? channel.min + (meta.offset ?? 0);
    const hi = meta.display?.max ?? channel.format?.displayMax ?? channel.max + (meta.offset ?? 0);
    const expected = lo < 0 && hi > 0 ? channel.min + (-lo / (hi - lo)) * (channel.max - channel.min) : channel.defaultValue;
    await incoming({ [name]: expected === channel.max ? channel.min : channel.max });
    const before = (await sends()).length;
    await (await ctl(name)).dblclick({ delay: 70 });
    await until(async () => await value(name) === expected, `${name} reset ${expected}, actual ${await value(name)}`);
    await until(async () => (await sends()).slice(before).some(e => e.payload.parameterId === name && e.payload.value === expected));
    assert.equal(await value(name), expected, `${name}: reset survives pointer-up`);
    assert.equal(await page.evaluate(n => window.__gaia.session(n).dragging, name), false);
  }
  console.log(`Passed double-click reset for ${ranges.length} tone knobs/faders.`);
  // Native ranges use display units too: master tuning is 1024 on the wire at zero cents.
  await page.mouse.click(lower.x + lower.width * 7 / 8, lower.y + 16);
  await incoming({ 'system.masterTune': 1500 });
  // The number field itself retains normal text selection; reset its surrounding control.
  await (await ctl('system.masterTune')).dblclick({ delay: 70, position: { x: 3, y: 3 } });
  await until(async () => await value('system.masterTune') === 1024);
  await until(async () => (await sends()).at(-1)?.payload.parameterId === 'system.masterTune' && (await sends()).at(-1)?.payload.value === 1024);
  assert.deepEqual(errors, []);
  console.log(`${selectors.length} selectors / ${choicesChecked} choices: lamps, click values, MIDI writes and incoming updates passed. ${ranges.length} tone knobs/faders plus native tuning: double-click reset and MIDI passed.`);
} finally { await browser.close(); await server.close(); }
