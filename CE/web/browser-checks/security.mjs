// Run with: node browser-checks/security.mjs (Edge on Windows, or CHROMIUM_PATH).
import { createServer, preview } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const executablePath = process.env.CHROMIUM_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
let built;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.stack); });
  page.on('console', message => { if (message.type() === 'error') console.error('BROWSER:', message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.waitForSelector('.statusbar-area', { timeout: 20000 }).catch(async error => {
    console.error('BODY:', (await page.locator('body').innerText()).slice(0, 1200));
    throw error;
  });
  await page.evaluate(async () => {
    const panelStore = await import('/src/CE_Application/stores/panels.js');
    const runtime = await import('/src/CE_Application/scripting/panelRuntime.js');
    const { get } = await import('/node_modules/svelte/src/store/index-client.js');
    const { scriptTrace } = await import('/src/CE_Application/stores/scriptConsole.js');
    const { serializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    window.__securityCheck = {
      fixture: () => {
        const panel = panelStore.createPanel('Production security check');
        panel.scripts = [{ id: 'production-check', name: 'Check', language: 'javascript', event: 'onClick',
          scope: 'panel', enabled: true, source: `uiNotify('Production interpreter ready'); function onClick() {}` }];
        return serializePanel(panel);
      },
      traces: () => get(scriptTrace).map(t => t.message),
      midi: () => runtime.deliverSysexForTesting({ hex: 'F07D01F7' }),
      setSource: source => panelStore.panels.update(list => list.map(panel => ({ ...panel,
        scripts: (panel.scripts ?? []).map(s => ({ ...s, source })) }))),
      changeSource: () => panelStore.panels.update(list => list.map(panel => ({ ...panel,
        scripts: (panel.scripts ?? []).map(s => ({ ...s,
          source: `log(typeof window + ':' + typeof document + ':' + typeof fetch + ':' + typeof __JUCE__); function onClick() {}` })) }))),
    };
    const panel = panelStore.createPanel('Security browser check');
    panel.scripts = [{ id: 'browser-security', name: 'Check', language: 'javascript',
      event: 'onClick', scope: 'panel', enabled: true,
      source: `log('browser-security-ran'); function onClick() {}` }];
    panelStore.addPanel(panel);
    runtime.deliverSysexForTesting({ hex: 'F07D01F7' });
  });
  const enable = page.getByRole('button', { name: 'Enable scripts for this session' });
  await enable.waitFor();
  const traces = () => page.evaluate(() => window.__securityCheck.traces());
  assert.equal((await traces()).some(t => t.includes('browser-security-ran')), false);
  await enable.click();
  await page.evaluate(() => window.__securityCheck.midi());
  await page.waitForFunction(() => window.__securityCheck.traces().some(t => t.includes('browser-security-ran')), null,
    { timeout: 15000 }).catch(async error => { console.error('TRACES:', await traces()); throw error; });
  await page.evaluate(() => window.__securityCheck.changeSource());
  await enable.waitFor();
  await enable.click();
  await page.evaluate(() => window.__securityCheck.midi());
  await page.waitForFunction(() => window.__securityCheck.traces().some(t => t.includes('undefined:undefined:undefined:undefined')), null,
    { timeout: 15000 }).catch(async error => { console.error('TRACES:', await traces()); throw error; });
  assert.deepEqual(errors, [], 'development UI has no uncaught JavaScript errors');

  await page.evaluate(() => window.__securityCheck.setSource('while (true) {}'));
  await enable.waitFor();
  await enable.click();
  await page.evaluate(() => window.__securityCheck.midi());
  await page.waitForFunction(() => window.__securityCheck.traces().some(t => /Script stopped.*limit exceeded/.test(t)), null,
    { timeout: 15000 });
  assert.equal(await page.locator('.statusbar-area').isVisible(), true, 'editor remains responsive after a runaway script');
  await page.evaluate(() => window.__securityCheck.setSource('log("recovered-after-timeout"); function onClick() {}'));
  await enable.waitFor();
  await enable.click();
  await page.evaluate(() => window.__securityCheck.midi());
  await page.waitForFunction(() => window.__securityCheck.traces().some(t => t.includes('recovered-after-timeout')), null,
    { timeout: 15000 });

  built = await preview({ root, preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  const production = await browser.newPage();
  production.setDefaultTimeout(15000);
  await production.addInitScript(() => {
    const listeners = new Map();
    window.__securityDeliver = (name, payload) => {
      for (const callback of listeners.get(name) ?? []) callback(payload);
    };
    window.__JUCE__ = { backend: {
      emitEvent() {}, removeEventListener() {},
      addEventListener(name, callback) {
        const group = listeners.get(name) ?? []; group.push(callback); listeners.set(name, group);
        return [name, group.length - 1];
      },
    } };
  });
  production.on('pageerror', error => { errors.push(error.message); console.error('PRODUCTION PAGE:', error.stack); });
  production.on('console', message => { if (message.type() === 'error') console.error('PRODUCTION:', message.text()); });
  await production.goto(`http://127.0.0.1:${built.httpServer.address().port}/`);
  await production.waitForSelector('.statusbar-area', { timeout: 20000 });
  const fixture = await page.evaluate(() => window.__securityCheck.fixture());
  await production.evaluate(data => window.__securityDeliver('panelOpened', {
    filePath: 'C:/security-test/fixture.cepanel', name: 'Production security check', data,
  }), fixture);
  await production.getByRole('button', { name: 'Enable scripts for this session' }).click()
    .catch(async error => { console.error('PRODUCTION BODY:', (await production.locator('body').innerText()).slice(-4000)); throw error; });
  await production.evaluate(() => window.__securityDeliver('sysexInputMessage', { hex: 'F07D01F7' }));
  await production.keyboard.press('F5');
  await production.getByText('Production interpreter ready', { exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(errors, [], 'production bundle has no uncaught JavaScript errors');
  console.log('PASS: blocked MIDI, explicit approval, code-change revocation, isolated globals, runaway interruption/recovery, dev and production startup');
} finally {
  await browser.close();
  await server.close();
  if (built) await new Promise(resolve => built.httpServer.close(resolve));
}
