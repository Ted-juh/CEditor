import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-part-issues-check', import.meta.url)),
  optimizeDeps: { entries: ['targetContext.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: 18771 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/targetContext.html`);
  await page.evaluate(() => window.setPartIssueScenario('healthy'));
  assert.equal(await page.locator('.part-issue-icon').count(), 0);

  await page.evaluate(() => window.setPartIssueScenario('missing'));
  assert.equal(await page.getByText('Missing', { exact: true }).count(), 1);
  assert.equal(await page.locator('.part-issue-icon').count(), 0, 'existing missing badge stays sufficient');

  await page.evaluate(() => window.setPartIssueScenario('off'));
  await page.getByTestId('host-utility-health').click();
  await page.getByTestId('health-part-issues').getByRole('button', { name: 'Rack', exact: true }).click();
  assert.equal(await page.locator('[data-rack-part-id="part-0"] [data-testid="part-active"]')
    .evaluate(el => el === document.activeElement), true);

  await page.evaluate(() => window.setPartIssueScenario('zero'));
  const zero = page.getByTestId('part-issue-level-zero');
  await zero.waitFor();
  assert.equal(await zero.innerText(), '', 'rack diagnostics are icons only');
  assert.equal(await zero.getAttribute('title'), 'Part audio fader is at zero.');
  await zero.focus();
  await page.locator('.issue-tip').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.issue-tip').count(), 0);
  await page.keyboard.press('Enter');
  await page.getByTestId('host-mixer').waitFor();
  assert.equal(await page.locator('[data-part-id="part-0"] .fader').evaluate(el => el === document.activeElement), true);

  await page.getByRole('button', { name: 'Rack', exact: true }).click();
  await page.getByTestId('host-utility-health').click();
  await page.getByTestId('health-part-issues').getByText('Part audio fader is at zero.', { exact: false }).waitFor();
  await page.getByTestId('health-part-issues').getByRole('button', { name: 'Mixer', exact: true }).click();
  await page.getByTestId('host-mixer').waitFor();

  await page.getByRole('button', { name: 'Rack', exact: true }).click();
  await page.evaluate(() => window.setPartIssueScenario('zone'));
  await page.evaluate(() => window.sendIssueNote());
  const zone = page.getByTestId('part-issue-zone');
  await zone.waitFor();
  assert.equal(await zone.count(), 1, 'only the selected part gets the input observation');
  await zone.click();
  assert.match(await page.getByTestId('dock-tab-zone').getAttribute('class'), /\bon\b/);
  assert.equal(await page.locator('.midi-zone select').evaluate(el => el === document.activeElement), true);
  await zone.waitFor({ state: 'detached', timeout: 4000 });
  await page.evaluate(() => window.sendIssueNote(72));
  assert.equal(await zone.count(), 0, 'accepted note is quiet');
  await page.evaluate(() => window.sendIssueNote(48, 0));
  assert.equal(await zone.count(), 0, 'note-off is quiet');

  await page.evaluate(() => window.setPartIssueScenario('output'));
  await page.getByTestId('part-issue-midi-output').click();
  await page.getByTestId('host-hardware').waitFor();
  assert.equal(await page.locator('.hw-config select').first().evaluate(el => el === document.activeElement), true);

  await page.evaluate(() => window.setPartIssueScenario('solo'));
  assert.equal(await page.getByTestId('part-issue-solo-other').count(), 2);
  await page.getByTestId('rack-view-canvas').click();
  const canvasIcon = page.getByTestId('canvas-node-part-0').getByTestId('part-issue-solo-other');
  await canvasIcon.waitFor();
  assert.equal(await page.getByTestId('canvas-node-part-0').getAttribute('draggable'), 'true');
  await canvasIcon.focus();
  const tooltip = page.locator('.issue-tip');
  await tooltip.waitFor({ state: 'visible' });
  const tipBox = await tooltip.boundingBox();
  assert.ok(tipBox.x >= 0 && tipBox.x + tipBox.width <= 1280);
  await page.keyboard.press('Enter');
  await page.getByTestId('host-mixer').waitFor();

  await page.getByRole('button', { name: 'Rack', exact: true }).click();
  await page.getByTestId('rack-view-list').click();
  await page.getByTestId('dock-tab-sounds').click();
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const icon = page.getByTestId('part-issue-solo-other').first();
    await icon.focus();
    const box = await page.locator('.issue-tip').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `tooltip fits at ${width}`);
    assert.equal(await icon.locator('svg').evaluate(el => el.getBoundingClientRect().width), 15);
    if (process.env.ISSUES_SCREENSHOT && width === 1280) await page.screenshot({ path: process.env.ISSUES_SCREENSHOT });
  }
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.targetCommands.some(c =>
    ['setPartMixer', 'setPartMidiRules', 'openEditor', 'loadInstrument'].includes(c.cmd))), false,
    'inspecting issues never changes the rig or opens a vendor editor');
  console.log('Part issue browser checks passed: icons, keyboard tooltips, direct navigation, Health details, expiry, canvas and responsive sizing.');
} finally { await browser.close(); await server.close(); }
