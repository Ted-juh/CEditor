// Exercise the complete editor and its visible, full MIDI log. The preview-only
// fixture cannot catch log DOM churn or the raw SysEx receive path.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = process.env.PREVIEW_URL
  ? { resolvedUrls: { local: [process.env.PREVIEW_URL] }, async listen() {}, async close() {} }
  : await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1640, height: 1340 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => window.__gaia, null, { timeout: 120000 });
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json', { fullApp: true }));
  await page.evaluate(() => window.__gaia.feedbackConnect());
  // App and the display dock are lazy imports. A fixed delay races cold dependency optimization,
  // especially on the first run; wait for the monitor the probe is about instead.
  await page.locator('.midi-monitor .summary').waitFor({ timeout: 30000 });
  const result = await page.evaluate(async () => {
    const g = window.__gaia, role = 'Roland GAIA SH-01';
    const emit = (name, payload) => g.feedbackEvent(name, structuredClone(payload));
    const frame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const log = Array.from({ length: 500 }, (_, i) => ({ eventId: i + 1, timestamp: new Date(i).toISOString(), direction: 'in', deviceRole: role, messageType: 'sysex', semantic: 'dump parse', hex: 'F0 41 10 00 00 41 12 10 00 01 10 40 1F F7', status: 'Dump prefix did not match arpPattern16' }));
    emit('midiMonitorEvents', log);
    await frame();
    const existingRow = document.querySelector('.midi-monitor .row');
    const beforeSent = g.feedbackSent().filter(event => event.name === 'setDeviceParameter').length;
    const times = [];
    for (let i = 0; i < 64; i++) {
      const value = i + 20, body = [16, 0, 1, 16, value];
      const checksum = (128 - body.reduce((a, b) => a + b, 0) % 128) % 128;
      const hex = [240, 65, 16, 0, 0, 65, 18, ...body, checksum, 247].map(b => b.toString(16).padStart(2, '0')).join(' ');
      const payload = { ok: true, deviceRole: role, messageType: 'sysex', hex, timestampSeconds: i, origin: 'hardwareInput' };
      const start = performance.now();
      emit('midiInputMessage', payload);
      emit('sysexInputMessage', payload);
      emit('dumpMessageParsed', { ok: false, requestId: `incoming_${i}`, deviceRole: role, error: 'Dump prefix did not match arpPattern16' });
      log.push({ ...log.at(-1), eventId: 501 + i, timestamp: new Date(1000 + i).toISOString(), hex });
      log.shift();
      // Stress even old native hosts that send the whole log for EVERY message.
      emit('midiMonitorEvents', log);
      emit('deviceSessionState', { [role]: { state: 'linked', profileId: 'roland-gaia-sh01', lastInboundAtMs: i } });
      await frame();
      if (i === 0 && !existingRow.isConnected) throw new Error('appending one event replaced existing monitor rows');
      times.push(performance.now() - start);
    }
    const target = document.querySelector(`[data-control-id="${g.id('tone1.filter.envAttackTime')}"]`);
    const cap = target.querySelector('[data-part-name="cap"]');
    return { times, value: g.session('tone1.filter.envAttackTime').customValues.value, capTop: parseFloat(cap?.style.top), capHeight: parseFloat(cap?.style.height), rows: document.querySelectorAll('.midi-monitor .row').length, total: document.querySelector('.midi-monitor .summary').textContent, echoes: g.feedbackSent().filter(event => event.name === 'setDeviceParameter').length - beforeSent };
  });
  assert.equal(result.value, 83);
  assert.ok(Math.abs(result.capTop - Math.round(89 - 87 * 83 / 127) * result.capHeight / 13) < 0.01);
  assert.equal(result.echoes, 0);
  assert.ok(result.rows < 80, 'the monitor must only mount visible rows');
  assert.match(result.total, /500 events/);
  const receiveCoverage = await page.evaluate(async () => {
    const g = window.__gaia, role = 'Roland GAIA SH-01';
    const emit = (name, payload) => g.feedbackEvent(name, structuredClone(payload));
    const frame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const initial = { 'tone1.osc.pitch': 40, 'tone1.osc.detune': 14 };
    for (let tone = 1; tone <= 3; tone++) initial[`tone${tone}.lfo.tempoSyncSwitch`] = 0;
    emit('deviceRuntimeState', { [role]: initial });
    const groups = [[16, 'lfo.rate'], [19, 'lfo.fadeTime'], [22, 'lfo.pitchDepth'],
      [25, 'lfo.filterDepth'], [28, 'lfo.ampDepth'], [70, 'osc.pitch'], [73, 'osc.detune'],
      [76, 'osc.pulseWidthModDepth'], [79, 'osc.pulseWidth'], [85, 'osc.pitchEnvDepth'],
      [102, 'filter.cutoff'], [105, 'filter.resonance'], [108, 'filter.envDepth'],
      [111, 'filter.cutoffKeyfollow'], [114, 'amp.level']];
    for (const [base] of groups) for (let tone = 1; tone <= 3; tone++) {
      emit('midiInputMessage', { deviceRole: role, messageType: 'cc', hex: `B0 ${(base + tone - 1).toString(16)} 40` });
    }
    await frame();
    const failed = [];
    for (const [, leaf] of groups) for (let tone = 1; tone <= 3; tone++) {
      const id = `tone${tone}.${leaf}`;
      if (g.session(id)?.customValues?.value !== 64) failed.push([id, g.session(id)?.customValues]);
    }
    // A real dump contains the native cache too. Those older pitch values must
    // not undo the CCs above when an unrelated effect's readback arrives.
    const runtimeState = { [role]: { ...initial, 'reverb.parameter1': 32810 } };
    emit('dumpMessageParsed', { ok: true, requestId: 'incoming_reverb', deviceRole: role,
      values: { 'reverb.parameter1': 32810 }, runtimeState });
    emit('deviceRuntimeState', runtimeState);
    await frame();
    return { failed, pitch: g.session('tone1.osc.pitch').customValues.value,
      detune: g.session('tone1.osc.detune').customValues.value };
  });
  assert.deepEqual(receiveCoverage.failed, [], 'all three tones must follow all 15 hardware controls');
  assert.equal(receiveCoverage.pitch, 64);
  assert.equal(receiveCoverage.detune, 64);
  await page.locator('.midi-monitor .rows').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(100);
  assert.ok((await page.locator('.midi-monitor .row .time').allTextContents()).includes('00:00:00.064'), 'the oldest retained event is accessible by scrolling');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('no-event-matches-this');
  await page.getByText('Nothing matches these filters', { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  const sorted = result.times.sort((a, b) => a - b);
  console.log(JSON.stringify({ medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1), visibleMonitorRows: result.rows, finalValue: result.value, echoes: result.echoes }, null, 2));
} finally { await browser.close(); await server.close(); }
