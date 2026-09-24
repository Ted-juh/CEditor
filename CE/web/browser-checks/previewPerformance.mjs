// Actual preview rendering, pointer gestures and simulated native MIDI feedback.
// CHROMIUM_PATH selects the installed browser. Timings are reported; the stable
// regression check is that an unrelated knob's DOM is never rewritten.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = process.env.PREVIEW_URL
  ? { resolvedUrls: { local: [process.env.PREVIEW_URL] }, async listen() {}, async close() {} }
  : await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1600, height: 2300 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  const profiler = process.env.PREVIEW_CPU_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  const loadStart = Date.now();
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))));
  const loadMs = Date.now() - loadStart;
  await page.evaluate(() => window.__gaia.feedbackConnect());
  await page.evaluate(async () => {
    const values = {};
    for (const control of window.__gaia.controls) {
      for (const binding of control._children?.DeviceBindings?.bindings ?? []) {
        if (binding.deviceRole !== 'Roland GAIA SH-01') continue;
        const value = window.__gaia.session(control._children.Core.name)?.customValues?.[binding.port];
        if (typeof value === 'number') values[binding.parameterId] = value;
      }
    }
    window.__perfRuntimeState = { 'Roland GAIA SH-01': values };
    window.__gaia.feedbackEvent('deviceRuntimeState', structuredClone(window.__perfRuntimeState));
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  });
  await page.waitForTimeout(200);
  const result = await page.evaluate(async () => {
    const name = 'tone1.filter.envAttackTime';
    const other = 'tone2.filter.envAttackTime';
    const target = document.querySelector(`[data-control-id="${window.__gaia.id(name)}"]`);
    const sibling = document.querySelector(`[data-control-id="${window.__gaia.id(other)}"]`);
    const originalSibling = window.__gaia.session(other);
    let siblingMutations = 0;
    const observer = new MutationObserver(records => { siblingMutations += records.length; });
    observer.observe(sibling, { subtree: true, childList: true, attributes: true, characterData: true });
    const sentBefore = window.__gaia.feedbackSent().filter(event => event.name === 'setDeviceParameter').length;
    const samples = [];
    for (let value = 20; value < 52; value++) {
      const started = performance.now();
      window.__perfRuntimeState['Roland GAIA SH-01'][name] = value;
      // The native service includes its complete cache in the parse response,
      // then emits that cache again as deviceRuntimeState for the same message.
      window.__gaia.feedbackEvent('dumpMessageParsed', { ok: true, requestId: 'incoming_preview_perf', deviceRole: 'Roland GAIA SH-01', values: { [name]: value }, runtimeState: structuredClone(window.__perfRuntimeState) });
      window.__gaia.feedbackEvent('deviceRuntimeState', structuredClone(window.__perfRuntimeState));
      const syncMs = performance.now() - started;
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      samples.push({ syncMs, frameMs: performance.now() - started });
    }
    observer.disconnect();
    return {
      samples, siblingMutations,
      unchangedSibling: window.__gaia.session(other) === originalSibling,
      value: window.__gaia.session(name).customValues.value,
      capTop: parseFloat(target.querySelector('[data-part-name="cap"]')?.style.top),
      capHeight: parseFloat(target.querySelector('[data-part-name="cap"]')?.style.height),
      echoed: window.__gaia.feedbackSent().filter(event => event.name === 'setDeviceParameter').length - sentBefore,
      nodes: document.querySelectorAll('*').length,
    };
  });
  if (profiler) await writeFile(process.env.PREVIEW_CPU_PROFILE, JSON.stringify((await profiler.send('Profiler.stop')).profile));
  assert.equal(result.value, 51, 'incoming MIDI reaches the preview session');
  assert.ok(Math.abs(result.capTop - Math.round(89 - 87 * 51 / 127) * result.capHeight / 13) < 0.01,
    'incoming MIDI moves the fader cap, not just its stored value');
  assert.equal(result.echoed, 0, 'incoming MIDI must not echo back to the device');
  assert.equal(result.unchangedSibling, true);
  assert.equal(result.siblingMutations, 0, 'one MIDI parameter must not redraw unrelated knobs');
  const id = await page.evaluate(() => window.__gaia.id('tone1.filter.envAttackTime'));
  const knob = page.locator(`[data-control-id="${id}"]`).first();
  const rect = await knob.boundingBox();
  const before = result.value;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 - 25, { steps: 24 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__gaia.session('tone1.filter.envAttackTime'));
  assert.notEqual(after.customValues.value, before, 'pointer drag changes the value');
  assert.equal(after.dragging, false, 'pointer release clears the MIDI echo guard');
  const capTop = await knob.evaluate(target => parseFloat(target.querySelector('[data-part-name="cap"]')?.style.top));
  assert.ok(Math.abs(capTop - Math.round(89 - 87 * after.customValues.value / 127) * result.capHeight / 13) < 0.01);
  const stream = await page.evaluate(async () => {
    const name = 'tone1.filter.envAttackTime';
    const start = performance.now();
    let count = 0;
    await new Promise(resolve => {
      const timer = setInterval(() => {
        window.__perfRuntimeState['Roland GAIA SH-01'][name] = count;
        window.__gaia.feedbackEvent('dumpMessageParsed', { ok: true, requestId: 'incoming_stream', deviceRole: 'Roland GAIA SH-01', values: { [name]: count }, runtimeState: structuredClone(window.__perfRuntimeState) });
        window.__gaia.feedbackEvent('deviceRuntimeState', structuredClone(window.__perfRuntimeState));
        if (++count === 128) { clearInterval(timer); resolve(); }
      }, 8);
    });
    const sentMs = performance.now() - start;
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const target = document.querySelector(`[data-control-id="${window.__gaia.id(name)}"]`);
    return { count, sentMs, drainMs: performance.now() - start - sentMs,
      value: window.__gaia.session(name).customValues.value,
      capTop: parseFloat(target.querySelector('[data-part-name="cap"]')?.style.top),
      capHeight: parseFloat(target.querySelector('[data-part-name="cap"]')?.style.height) };
  });
  assert.equal(stream.value, 127, 'a sustained incoming stream reaches its latest value');
  assert.ok(Math.abs(stream.capTop - 2 * stream.capHeight / 13) < 0.01,
    'the fader paints the final stream value without a backlog');
  assert.deepEqual(errors, []);
  const sorted = result.samples.map(sample => sample.frameMs).sort((a, b) => a - b);
  console.log(JSON.stringify({ loadMs, nodes: result.nodes, midiFrameMedianMs: sorted[Math.floor(sorted.length / 2)], midiFrameP95Ms: sorted[Math.floor(sorted.length * 0.95)], midiFrameMaxMs: sorted.at(-1), midiSyncMeanMs: result.samples.reduce((sum, sample) => sum + sample.syncMs, 0) / result.samples.length, siblingMutations: result.siblingMutations, pointerValue: after.customValues.value, stream }, null, 2));
} finally { await browser.close(); await server.close(); }
