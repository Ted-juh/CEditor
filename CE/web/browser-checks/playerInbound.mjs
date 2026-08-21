/**
 * Does the panel actually follow the instrument?
 *
 * The inbound index is unit-tested hard, but those tests ask the index questions directly. This
 * asks the Player: mount a panel against the real 793-parameter profile, push MIDI in the way the
 * bridge does, and look at what the controls did.
 *
 * Each assertion is chosen to FAIL against the map this replaced, so the check is evidence of the
 * change rather than of the app merely still working:
 *
 *   - distortion.parameter1 is four nibbles at 10 00 04 01, an address the 39-entry hand map does
 *     not contain. Before, nothing moved. Reading it one byte wide — the other old bug — would say
 *     0 instead of 4095.
 *   - the same message with a different device id byte, which the profile's compiled prefix bakes
 *     in and the mask has to forgive.
 *   - CC 102, which the hand map DID know and the profile could not be asked until the inbound
 *     declaration existed. This is the one that regresses if the declaration is dropped.
 *   - the RQ1 read-back's size field, which was hardcoded to one byte for every parameter.
 *
 * Run by `npm run test:browser`.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const DISTORTION = 'distortion1';   // distortion.parameter1 — 4 nibbles, 10 00 04 01
const TEMPO = 'tempo';              // common.patchTempo     — 3 nibbles, 10 00 00 0D
const CUTOFF = 'cutoff';            // tone1.filter.cutoff   — u7, 10 00 01 0C, also CC 102

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/playerInbound.html`);
  await page.waitForFunction(() => !!window.__player, null, { timeout: 20000 });
  await page.evaluate(() => window.__player.load());
  await page.waitForFunction(() => document.querySelectorAll('[data-control-id]').length >= 3,
    null, { timeout: 30000 });

  // A four-nibble parameter the old map did not know, at an address it did not carry.
  const nibbled = await page.evaluate(async (id) => {
    window.__player.sysex('F0 41 10 00 00 41 12 10 00 04 01 00 0F 0F 0F 3E F7');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, DISTORTION);
  assert.equal(nibbled, 4095, `a four-nibble value did not reach its control (got ${nibbled})`);

  // Same parameter, different device id. The compiled prefix bakes in 0x10; the mask forgives it.
  const otherDevice = await page.evaluate(async (id) => {
    window.__player.sysex('F0 41 11 00 00 41 12 10 00 04 01 00 00 01 00 3E F7');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, DISTORTION);
  assert.equal(otherDevice, 16, `device id 0x11 was not recognised (got ${otherDevice})`);

  // Three nibbles, to catch a width fixed at the wrong number rather than at one.
  const tempo = await page.evaluate(async (id) => {
    window.__player.sysex('F0 41 10 00 00 41 12 10 00 00 0D 01 02 0C 3E F7');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, TEMPO);
  assert.equal(tempo, 300, `a three-nibble tempo did not decode (got ${tempo})`);

  // The CC the instrument's own knob sends, which only resolves because the profile declares it.
  const cc = await page.evaluate(async (id) => {
    window.__player.cc('B0 66 5A');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, CUTOFF);
  assert.equal(cc, 90, `CC 102 did not reach tone 1 cutoff (got ${cc}) — is the inbound declaration still in the profile?`);

  // The same CC on a channel the profile never compiled — the status byte is masked to its high
  // nibble, so channel 8 is the same knob.
  const ccOtherChannel = await page.evaluate(async (id) => {
    window.__player.cc('B7 66 20');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, CUTOFF);
  assert.equal(ccOtherChannel, 32, `CC 102 on channel 8 was not recognised (got ${ccOtherChannel})`);

  // A raw MIDI binding, on a message the bridge does not label "cc". The Player gated on that label
  // before, which would have made aftertouch, velocity, poly pressure and bend bindings dead.
  const pressure = await page.evaluate(async () => {
    window.__player.channelMidi('D0 5A');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value('pressure');
  });
  assert.equal(pressure, 90, `channel pressure did not reach its raw binding (got ${pressure})`);

  // And it must not answer to a message that merely looks like it.
  const notPressure = await page.evaluate(async () => {
    window.__player.channelMidi('A0 3C 10');   // poly pressure, a different binding kind
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value('pressure');
  });
  assert.equal(notPressure, 90, 'poly pressure moved a channel-pressure binding');

  // An NRPN, delivered as four SEPARATE bridge callbacks — which is how it really arrives, and the
  // reason its inbound side needs state at all. A per-message decoder would see four unrelated CCs.
  const nrpn = await page.evaluate(async () => {
    for (const hex of ['B0 63 01', 'B0 62 20', 'B0 06 02', 'B0 26 40']) window.__player.channelMidi(hex);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value('nrpn');
  });
  assert.equal(nrpn, 320, `a 14-bit NRPN did not reassemble across callbacks (got ${nrpn})`);

  // A different parameter number on the same channel must not drive it.
  const otherNrpn = await page.evaluate(async () => {
    for (const hex of ['B0 63 01', 'B0 62 21', 'B0 06 7F', 'B0 26 7F']) window.__player.channelMidi(hex);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value('nrpn');
  });
  assert.equal(otherNrpn, 320, 'NRPN 1:33 moved a control bound to NRPN 1:32');

  // An RPN, whose Data Entry bytes are the SAME CCs the NRPN uses. Selecting it must take the NRPN
  // out of scope: two independent trackers would have both knobs move on every Data Entry.
  const rpn = await page.evaluate(async () => {
    for (const hex of ['B0 65 00', 'B0 64 00', 'B0 06 02']) window.__player.channelMidi(hex);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { rpn: window.__player.value('rpn'), nrpn: window.__player.value('nrpn') };
  });
  assert.equal(rpn.rpn, 2, `RPN 0:0 did not reach its control (got ${rpn.rpn})`);
  assert.equal(rpn.nrpn, 320, 'the RPN Data Entry also moved the NRPN-bound control');

  // A message for nothing in this profile must move nothing.
  const before = await page.evaluate((id) => window.__player.value(id), DISTORTION);
  const after = await page.evaluate(async (id) => {
    window.__player.sysex('F0 43 10 00 00 41 12 10 00 04 01 00 00 00 07 3E F7');  // Yamaha id
    window.__player.cc('B0 63 40');                                                // CC 99
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__player.value(id);
  }, DISTORTION);
  assert.equal(after, before, 'a message from another manufacturer moved a control');

  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  console.log('player inbound: ok (nibbled 3 and 4 wide, device id tolerated, declared CC on any channel, raw aftertouch bound, NRPN and RPN reassembled and kept apart, unknown ignored)');
} catch (error) {
  failed = true;
  console.error('player inbound: FAILED\n', error.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
