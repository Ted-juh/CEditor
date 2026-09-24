/**
 * What the exported Player does with the synth when it starts. The rules are unit-tested in
 * test/playerStartup.test.js; this checks the wiring in Player.svelte, which only runs in a browser:
 *
 *   - it connects under the role the panel binds, not the generic mainSynth;
 *   - a new instance reads the synth with the profile's startup chain, once;
 *   - a reopened project only identifies the synth, and the values the plugin restores move the
 *     controls without being sent — automation after that does send;
 *   - "Load from the synth" on the restore bar reads the synth and tells the plugin "load";
 *   - a host restoring state into an open window cancels a read that has not started.
 *
 * Run: node browser-checks/playerStartup.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions());
const ROLE = 'Roland GAIA SH-01';

async function open(restored) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.resolvedUrls.local[0]}playerStartup.html${restored ? '?restored=1' : ''}`);
  await page.waitForFunction(() => !!window.__startup, null, { timeout: 90000 });
  await page.evaluate(() => window.__startup.load());
  await page.waitForSelector('[data-control-id="cutoff"]', { timeout: 30000 });
  return { page, errors, sent: () => page.evaluate(() => window.__startup.sent()) };
}
const named = (events, name) => events.filter((e) => e.name === name);
const syncs = (events) => named(events, 'startDeviceSync').map((e) => e.payload);
// A full read is the profile's startup chain: a pull naming no single request. The identity check is
// a pull too, as far as the store is concerned, but it names 'identityRequest'.
const isFullRead = (s) => s.syncDirection === 'pull' && !s.request;

try {
  // --- A new instance -------------------------------------------------------------------------
  {
    const { page, errors, sent } = await open(false);
    await page.evaluate(() => window.__startup.plugIn());
    await page.waitForTimeout(1200);
    let events = await sent();
    // The device store keeps its own preview-only default for mainSynth; what matters is where the
    // hardware port goes.
    const mapped = named(events, 'setDeviceRoleMapping').map((e) => e.payload)
      .filter((m) => m.midiDestination?.type === 'hardwareOutput');
    assert.ok(mapped.length > 0, 'the port was never mapped');
    assert.ok(mapped.every((m) => m.role === ROLE), `the synth was mapped as ${[...new Set(mapped.map((m) => m.role))]}, not the panel's role`);
    assert.equal(mapped.at(-1).profileId, 'roland-gaia-sh01');
    assert.equal(mapped.at(-1).midiDestination.id, 'usb-gaia');
    assert.equal(mapped.at(-1).midiInput.id, 'usb-gaia-in', 'the input was not paired');
    const reads = syncs(events);
    assert.equal(reads.length, 1, `a new instance reads once: ${JSON.stringify(reads)}`);
    assert.ok(isFullRead(reads[0]), `not a full read: ${JSON.stringify(reads[0])}`);
    assert.equal(reads[0].deviceRole, ROLE);
    assert.equal(reads[0].profileId, 'roland-gaia-sh01');
    assert.equal(named(events, 'triggerRawMidiAction').length, 0, 'the profile chain replaces the per-parameter RQ1s');
    // The input list arriving again re-pairs the port; it must not read again.
    await page.evaluate(() => window.__startup.plugIn());
    await page.waitForTimeout(900);
    assert.equal(syncs(await sent()).length, 1, 're-pairing the input read the synth again');
    assert.deepEqual(errors, []);
    await page.close();
  }

  // --- A reopened project ----------------------------------------------------------------------
  {
    const { page, errors, sent } = await open(true);
    await page.evaluate(() => window.__startup.plugIn());
    await page.waitForTimeout(1200);
    const reads = syncs(await sent());
    assert.equal(reads.length, 1, `a restored project only identifies the synth: ${JSON.stringify(reads)}`);
    assert.equal(reads[0].request, 'identityRequest', 'a reopened project must not be read over');
    assert.equal(reads[0].deviceRole, ROLE);

    // The plugin pushes the restored value: the control moves, nothing goes to the synth.
    const before = named(await sent(), 'setDeviceParameter').length;
    await page.evaluate(() => window.__startup.fire('paramSync', { id: 'tone1.filter.cutoff.value', value: 99 }));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__startup.value('cutoff')), 99, 'the restored value did not reach the control');
    assert.equal(named(await sent(), 'setDeviceParameter').length, before, 'opening the window sent the restored value');
    // Automation after that is a real instruction and reaches the synth.
    await page.evaluate(() => window.__startup.fire('paramSync', { id: 'tone1.filter.cutoff.value', value: 40 }));
    await page.waitForTimeout(400);
    const automation = named(await sent(), 'setDeviceParameter').map((e) => e.payload);
    assert.ok(automation.some((p) => p.parameterId === 'tone1.filter.cutoff' && p.deviceRole === ROLE),
      `automation playback did not reach the synth: ${JSON.stringify(automation)}`);

    // The restore question, answered "Load from GAIA".
    await page.evaluate(() => window.__startup.fire('restorePrompt', { deviceName: 'GAIA' }));
    const load = page.getByRole('button', { name: 'Load from GAIA' });
    await load.waitFor();
    assert.ok(await page.getByRole('button', { name: 'Send saved sound' }).isVisible());
    assert.ok(await page.getByRole('button', { name: 'Not now' }).isVisible());
    await load.click();
    await page.waitForTimeout(300);
    const events = await sent();
    assert.deepEqual(named(events, 'restoreAnswer').map((e) => e.payload.answer), ['load']);
    const pulls = syncs(events).filter(isFullRead);
    assert.equal(pulls.length, 1, 'Load did not read the synth');
    assert.equal(await load.count(), 0, 'the bar stayed up');
    assert.deepEqual(errors, []);
    await page.close();
  }

  // --- A host restores state into a window that is already open --------------------------------
  {
    const { page, errors, sent } = await open(false);
    await page.evaluate(() => window.__startup.plugIn());
    await page.waitForTimeout(150);                       // inside the 600ms settle, before the read
    await page.evaluate(() => window.__startup.fire('sessionRestored', {}));
    await page.waitForTimeout(1200);
    const reads = syncs(await sent());
    assert.ok(!reads.some(isFullRead), 'the pending read ran over the restored state');
    assert.equal(reads.at(-1)?.request, 'identityRequest', 'and the device still has to be identified for the restore');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('player startup: ok (panel role, one read for a new instance, identify-only for a reopened project, restored values not sent, automation sent, Load from synth, restore into an open window)');
} catch (error) {
  console.error('player startup: FAILED\n', error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
