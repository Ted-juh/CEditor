// Exercise the actual Svelte view with bridge-shaped events; no application build.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-control-pages-check', import.meta.url)),
  optimizeDeps: { entries: ['controlPages.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18770 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/controlPages.html`);
  await page.getByTestId('sounds-show-plugins').click();
  const panel = page.getByTestId('host-pages');
  await panel.scrollIntoViewIfNeeded();
  const rows = panel.getByTestId('control-slot');
  assert.equal(await rows.count(), 8);
  assert.equal(await panel.locator('.slot-actions svg').count(), 16);
  assert.equal(await rows.nth(0).getByRole('button', { name: 'Learn MIDI for slot 1', exact: true }).getAttribute('title'),
    'Learn MIDI — move a hardware control');
  assert.deepEqual(await rows.nth(0).locator('.slot-actions button').first().evaluate(el => {
    const { width, height } = el.getBoundingClientRect(); return { width, height };
  }), { width: 28, height: 28 });
  assert.equal(await rows.nth(0).locator('input[type=range]').inputValue(), '0.62');
  assert.equal(await rows.nth(0).locator('output').innerText(), '62%');
  assert.match(await rows.nth(2).innerText(), /03 · Spire › 01 · Delay/);
  assert.match(await rows.nth(0).locator('img').getAttribute('src'), /^data:image/);
  assert.equal(await rows.nth(6).locator('input[type=range]').count(), 0);
  assert.match(await rows.nth(6).innerText(), /Assignment unavailable/);
  for (const width of [1800, 1500, 1280, 900, 640, 360]) {
    await page.setViewportSize({ width, height: 3000 });
    await panel.scrollIntoViewIfNeeded();
    assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `panel fits at ${width}`);
    for (const button of await panel.locator('.slot-actions button').all()) assert.equal(await button.isVisible(), true);
    assert.equal(await rows.evaluateAll(elements => elements.some(row => {
      const actions = row.querySelector('.slot-actions').getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return actions.right > bounds.right + 1 || actions.left < bounds.left - 1;
    })), false, `actions fit at ${width}`);
    if (process.env.CONTROL_SCREENSHOT) await panel.screenshot({ path: process.env.CONTROL_SCREENSHOT.replace('.png', `-${width}.png`) });
  }
  await page.setViewportSize({ width: 1800, height: 1400 });
  const lastCommand = cmd => page.evaluate(cmd => window.controlCommands.findLast(c => c.cmd === cmd), cmd);
  // Values update immediately and then reconcile external plug-in changes for any target.
  await rows.nth(0).locator('input[type=range]').fill('0.8');
  assert.equal(await rows.nth(0).locator('output').innerText(), '80%');
  assert.deepEqual(await lastCommand('setControlSlotValue'), { cmd: 'setControlSlotValue', pageId: 'page-1', slotId: 's1', value: .8 });
  await page.evaluate(() => window.controlEvent('instrumentHostParamValues', { partId: 'part-1', changes: [{ id: 'resonance', value: .44, text: '44%' }] }));
  assert.equal(await rows.nth(1).locator('output').innerText(), '44%');
  // Both learning actions stay visible. Page IDs distinguish identical slot IDs.
  await rows.nth(0).getByRole('button', { name: 'Pick parameter for slot 1', exact: true }).click();
  await rows.nth(0).getByRole('button', { name: 'Cancel pick for slot 1', exact: true }).waitFor();
  assert.equal(await rows.nth(0).getByTestId('param-learn-armed').getAttribute('title'), 'Cancel parameter pick');
  await panel.getByLabel('Control page name').nth(1).click();
  assert.equal(await panel.getByTestId('param-learn-armed').count(), 0);
  await panel.getByLabel('Control page name').nth(0).click();
  await rows.nth(0).getByRole('button', { name: 'Cancel pick for slot 1', exact: true }).click();
  assert.ok(await lastCommand('cancelLearnControlSlotParameter'));
  await rows.nth(3).getByRole('button', { name: 'Learn MIDI for slot 4', exact: true }).click();
  assert.equal(await rows.nth(3).getByRole('button', { name: 'Pick parameter for slot 4', exact: true }).isVisible(), true);
  assert.equal(await rows.nth(3).getByTestId('midi-learn-armed').getAttribute('title'), 'Cancel MIDI learn');
  assert.match(await rows.nth(3).innerText(), /CC 21/);
  await panel.getByLabel('Control page name').nth(1).click();
  assert.equal(await panel.getByTestId('midi-learn-armed').count(), 0);
  await panel.getByLabel('Control page name').nth(0).click();
  await rows.nth(3).getByRole('button', { name: 'Cancel MIDI for slot 4', exact: true }).click();
  assert.ok(await lastCommand('cancelMidiLearn'));
  // Clear assignment and clear MIDI remain separate and require the existing second click.
  const clear = panel.getByLabel('Clear slot 1', { exact: true });
  await clear.click();
  assert.equal(await lastCommand('clearControlSlot'), undefined);
  await clear.click();
  assert.match(await rows.nth(0).innerText(), /Unassigned/);
  assert.match(await rows.nth(0).innerText(), /CC 74/);
  const unbind = panel.getByLabel('Clear MIDI binding for slot 1', { exact: true });
  await unbind.click();
  assert.equal(await lastCommand('clearControlSlotMidi'), undefined);
  await unbind.click();
  assert.match(await rows.nth(0).innerText(), /Unbound/);
  const name = panel.getByLabel('Control page name').nth(1);
  await name.fill('Live controls');
  await name.press('Tab');
  assert.deepEqual(await lastCommand('renameControlPage'), { cmd: 'renameControlPage', pageId: 'page-2', name: 'Live controls' });
  // Params assignment still uses the selected page's first free slot.
  await page.getByTestId('dock-tab-params').click();
  const assign = page.getByTitle(/Assign to Live controls/).first();
  await assign.click();
  assert.equal((await lastCommand('assignControlSlot')).pageId, 'page-2');
  await panel.getByTestId('host-add-page').click();
  assert.ok(await lastCommand('addControlPage'));
  const remove = panel.getByLabel('Remove Live controls', { exact: true });
  await remove.click();
  assert.equal(await lastCommand('removeControlPage'), undefined);
  await remove.click();
  assert.equal((await lastCommand('removeControlPage')).pageId, 'page-2');
  await panel.getByTestId('host-auto-pages').click();
  assert.equal((await lastCommand('generateControlPages')).partId, 'part-2');
  assert.deepEqual(errors, []);
  console.log('Control pages browser checks passed: layout, artwork, values, page-scoped learning, visible actions, guarded clears, page editing and Params assignment.');
} finally { await browser.close(); await server.close(); }
