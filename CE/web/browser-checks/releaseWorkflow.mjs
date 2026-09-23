import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const file = new URL(req.url, 'http://localhost').pathname;
    const body = await readFile(join(root, decodeURIComponent(file)));
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROMIUM_PATH ?? (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
let browser;
try {
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/releaseWorkflow.html`);
  await page.waitForFunction(() => !!window.__workflow);
  const waitStatus = (text) => page.waitForFunction((wanted) => document.querySelector('.bindings [role="status"]')?.textContent.includes(wanted), text);
  await waitStatus('Add a binding');
  assert.match(await page.locator('.bindings').innerText(), /No MIDI input selected/);
  await page.getByRole('button', { name: 'MIDI out: Preview Only' }).click();
  await page.getByLabel('MIDI output', { exact: true }).waitFor();
  // Toolbar binding must configure the control, not merely claim metadata adoption.
  await page.evaluate(() => window.__workflow.prepareToolbar());
  await page.locator('.insight').getByRole('button', { name: 'Bind…', exact: true }).click();
  await page.locator('.dev-picker-item').filter({ hasText: 'cutoff' }).click();
  const adopted = await page.evaluate(() => window.__workflow.control()._children);
  assert.equal(adopted.Behavior.min, 0);
  assert.equal(adopted.Behavior.max, 127);
  assert.equal(adopted.Behavior.defaultCurrentValue, 64);
  assert.equal(adopted.Behavior.valueType, 'int');
  assert.equal(adopted.DeviceBindings.bindings[0].dryRun, false);

  // These controls previously only changed the dropdown stores, leaving the backend untouched.
  await page.getByLabel('MIDI output', { exact: true }).selectOption('test-output');
  await page.getByLabel('MIDI input', { exact: true }).selectOption('test-input');
  const mapping = await page.evaluate(() => window.__workflow.mapping());
  assert.equal(mapping.midiDestination.id, 'test-output');
  assert.equal(mapping.midiInput.id, 'test-input');
  assert.ok(await page.evaluate(() => window.__workflow.emitted.some((event) =>
    event.name === 'setDeviceRoleMapping' && event.payload.midiInput?.id === 'test-input')));
  assert.match(await page.locator('.midi-status').innerText(), /Test Synth Output/);
  await page.evaluate(() => window.__workflow.bind({ dryRun: true }));
  await waitStatus('Dry Run is on');
  await page.evaluate(() => window.__workflow.bind({ dryRun: false }));
  await waitStatus('Edit mode');
  await page.evaluate(() => window.__workflow.preview(true));
  await waitStatus('Ready to send');
  await page.evaluate(() => window.__workflow.enabled(false));
  await waitStatus('Bindings are disabled');
  await page.evaluate(() => window.__workflow.enabled(true));
  await page.evaluate(() => { window.__workflow.input('B0 4A 60'); window.__workflow.input('FE'); });
  await page.waitForFunction(() => document.querySelector('.bindings')?.textContent.includes('CC 74 · ch 1 · value 96'));
  await page.getByRole('button', { name: 'MIDI learn', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ports .studio-tab.active')?.textContent.includes('MIDI'));
  await page.locator('.midi-status').click();
  await page.getByLabel('MIDI output', { exact: true }).waitFor();

  // A send request uses the role configured above and reports the backend's outcome.
  await page.locator('.ports textarea').first().fill('B0 4A 60');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const send = await page.evaluate(() => window.__workflow.emitted.findLast((event) => event.name === 'triggerRawMidiAction'));
  assert.equal(send.payload.deviceRole, 'mainSynth');
  await page.evaluate((requestId) => window.__workflow.reply('rawMidiActionTriggered', { requestId, ok: true, status: 'Not sent: MIDI output unavailable' }), send.payload.requestId);
  await page.waitForFunction(() => document.querySelector('.ports')?.textContent.includes('Not sent: MIDI output unavailable'));
  // A real panel can call its synth "primary". Port changes must preserve that role's profile/values.
  await page.evaluate(() => { window.__workflow.customDevice(); window.__workflow.bind({ dryRun: false, deviceRole: 'primary' }); });
  await page.waitForFunction(() => document.querySelector('[aria-label="MIDI device"]').value === 'primary');
  await page.getByLabel('MIDI output', { exact: true }).selectOption('previewOnly');
  await waitStatus('Choose a MIDI output');
  await page.getByLabel('MIDI output', { exact: true }).selectOption('test-output');
  assert.equal((await page.evaluate(() => window.__workflow.mapping('primary'))).profileId, 'custom-profile');
  assert.equal((await page.evaluate(() => window.__workflow.values())).primary.cutoff, 73);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__workflow.emitted.findLast((event) => event.name === 'triggerRawMidiAction').payload.deviceRole), 'primary');
  await page.evaluate(() => window.__workflow.dropMidi(true));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ports')?.textContent.includes('dropped by an outgoing MIDI filter'));
  // These three tabs used to import successfully but never render their loaded component.
  await page.locator('.ports').getByRole('tab', { name: 'Routes', exact: true }).click();
  await page.getByText('No routes yet.', { exact: false }).waitFor();
  await page.locator('.ports').getByRole('tab', { name: 'Snapshots', exact: true }).click();
  await page.getByPlaceholder('Snapshot name').waitFor();
  await page.locator('.midi-status').click();
  await page.getByLabel('MIDI output', { exact: true }).waitFor();
  await page.evaluate(() => window.__workflow.unmappedDevice());
  await waitStatus('No profile is mapped to primary');
  assert.equal(await page.getByLabel('MIDI output', { exact: true }).isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
  assert.match(await page.locator('.ports').innerText(), /Generic MIDI CC/);
  await page.getByLabel('MIDI output', { exact: true }).selectOption('test-output');
  assert.equal((await page.evaluate(() => window.__workflow.mapping('primary'))).profileId, 'generic-cc-dpd');
  assert.deepEqual(errors, []);
  if (process.env.CEDITOR_WORKFLOW_SCREENSHOT) await page.screenshot({ path: process.env.CEDITOR_WORKFLOW_SCREENSHOT });
  console.log('PASS first-use binding guidance, port mapping, MIDI readout, navigation and actual send result');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
