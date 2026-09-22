import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  const status = page.locator('[data-control-id="gaia_hardware_sync_status"]').first();
  async function has(text) {
    try {
      for (let i = 0; i < 200; i++) {
        if ((await status.textContent()).includes(text)) { assert.ok(await status.isVisible()); return; }
        await page.waitForTimeout(100);
      }
      assert.fail(`Status did not show ${text}`);
    }
    catch (error) {
      console.log('Expected:', text, 'Actual:', await status.allTextContents(), 'Browser errors:', errors);
      console.log(await status.evaluate(el => ({ inner: el.innerText, text: el.textContent, rect: el.getBoundingClientRect().toJSON(), style: el.getAttribute('style'), root: el.getRootNode().nodeName, html: el.outerHTML.slice(0, 10000) })));
      if (process.env.GAIA_PAGES_OUT) await page.screenshot({ path: join(process.env.GAIA_PAGES_OUT, 'GAIA-sync-debug.png'), fullPage: true });
      throw error;
    }
  }
  async function emit(name, payload) { await page.evaluate(([n, p]) => window.__gaia.feedbackEvent(n, p), [name, payload]); }
  const role = 'Roland GAIA SH-01';
  await has('MIDI OFFLINE');
  await has('EDITOR PATTERN · NOT READ FROM GAIA');
  await page.evaluate(() => window.__gaia.feedbackConnect());
  await has('MIDI PORTS READY · NO REPLY YET');
  const expected = await page.evaluate(() => window.__gaia.expectedArp());
  // Local runtime snapshots and file parsing are deliberately NOT hardware evidence.
  await emit('deviceParameterSet', { ok: true, deviceRole: role, parameterId: 'arp.endStep', transaction: { semanticValue: 32 }, runtimeState: { [role]: expected } });
  await emit('deviceRuntimeState', { [role]: expected });
  await emit('dumpMessageParsed', { ok: true, requestId: 'manual_file_parse', deviceRole: role, values: expected });
  await has('NOT READ FROM GAIA');
  await emit('deviceSyncStarted', { deviceRole: role, requestId: 'read1', deviceRequestId: 'requestPattern', pending: true });
  await has('READING…');
  await emit('dumpMessageParsed', { ok: true, requestId: 'incoming_partial', deviceRole: role, values: Object.fromEntries(Object.entries(expected).slice(0, 528)) });
  await has('528/529 RECEIVED');
  await emit('deviceRequestTimedOut', { deviceRole: role, correlationId: 'read1', requestId: 'requestPattern' });
  await has('READ FAILED / TIMED OUT');
  await emit('deviceSyncStarted', { deviceRole: role, requestId: 'read2', deviceRequestId: 'requestPattern', pending: true });
  await has('READING…');
  await emit('dumpMessageParsed', { ok: true, requestId: 'incoming_full', deviceRole: role, values: expected });
  assert.doesNotMatch(await status.innerText(), /SYNCED/);
  await emit('deviceRequestResolved', { deviceRole: role, correlationId: 'read2', requestId: 'requestPattern' });
  await has('EDITOR PATTERN · SYNCED (READBACK)');
  const gridId = await page.evaluate(() => window.__gaia.id('arp_pattern_grid'));
  const grid = page.locator(`[data-control-id="${gridId}"]`).first();
  const box = await grid.boundingBox();
  if (process.env.GAIA_PAGES_OUT) {
    await mkdir(process.env.GAIA_PAGES_OUT, { recursive: true });
    await page.screenshot({ path: join(process.env.GAIA_PAGES_OUT, 'GAIA-sync-VERIFIED-SIMULATED.png'), clip: { x: 16, y: box.y - 44, width: 1560, height: box.height + 52 } });
  }
  await page.mouse.click(box.x + 44 + 15.5 * (box.width - 184) / 32, box.y + 12);
  assert.doesNotMatch(await status.innerText(), /SYNCED/);
  await page.mouse.click(box.x + 601, box.y + box.height - 15);
  await has('529 PENDING / UNVERIFIED');
  const send = await page.evaluate(() => window.__gaia.feedbackSent().filter(e => e.name === 'setDeviceParameter' && e.payload.parameterId === 'arp.endStep').at(-1));
  assert.equal(send.payload.value, 16);
  await emit('deviceParameterSet', { ...send.payload, ok: true, transaction: { semanticValue: 16 } });
  await has('529 PENDING / UNVERIFIED');
  // Matching echo is recorded as evidence BEFORE the hand-on-knob echo suppression guard.
  const body = [0x10, 0, 0x0c, 6, 1, 0];
  const bytes = [0xf0, 0x41, 0x10, 0, 0, 0x41, 0x12, ...body, (128 - body.reduce((a, b) => a + b, 0) % 128) % 128, 0xf7];
  await emit('sysexInputMessage', { deviceRole: role, hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' ') });
  await has('528 PENDING / UNVERIFIED');
  await emit('dumpMessageParsed', { ok: true, requestId: 'incoming_confirm_all', deviceRole: role, values: { ...expected, 'arp.endStep': 16 } });
  await has('EDITS CONFIRMED');
  await has('SYNCED (READBACK)');
  await emit('midiDestinationsListed', { destinations: [] });
  await has('MIDI OFFLINE');
  await page.evaluate(() => window.__gaia.feedbackEvent('midiDestinationsListed', { destinations: [window.__gaia.feedbackPorts.output] }));
  await has('529 PENDING / UNVERIFIED');
  assert.doesNotMatch(await status.innerText(), /SYNCED/);
  if (process.env.GAIA_PAGES_OUT) await page.screenshot({ path: join(process.env.GAIA_PAGES_OUT, 'GAIA-sync-editor-unverified.png'), clip: { x: 16, y: box.y - 44, width: 1560, height: box.height + 52 } });
  assert.deepEqual(errors, []);
  console.log('Sync UI: offline/ready, pending, partial/read/timeout/retry, real inbound decoder, echo confirmation, stale runtime/file data, and disconnect invalidation passed using an isolated simulated backend.');
} finally { await browser.close(); await server.close(); }
