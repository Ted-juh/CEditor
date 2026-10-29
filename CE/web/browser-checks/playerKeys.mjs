/**
 * ce.keys in a real browser: who gets each key when a panel's scripts use the computer keyboard.
 *
 * The real Player on the playerInbound harness's faked bridge, with the 'keys' panel: knobs, a
 * Keyboard named Keys, and scripts that make two shortcuts (Ctrl+G, and Up without a modifier),
 * turn the piano on through Keys, keep Q from keyDown, and log keyDown and keyUp. Real key presses,
 * with the page's key forwarding to the DAW on (PlayerHost's word), and checked:
 *
 *   shortcut  Ctrl+G runs its shortcut with a knob focused, and names it; the DAW does not get it
 *   waits     Up on a focused knob turns the knob and the shortcut does not run; with nothing
 *             focused the shortcut runs
 *   piano     A plays C4 through Keys (its held notes show it) and letting go releases it; a held A
 *             plays one note however long the system repeats it
 *   keyDown   B reaches keyDown and keyUp, and then goes to the DAW, down and up; Q is kept by its
 *             handler and the DAW never sees it
 *   blur      the window losing focus with Q and A held raises Q's keyUp and lets A's note go
 *
 * Run by `npm run test:browser` (after the scenery build, as playerInbound is).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm' };

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

const trace = () => page.evaluate(() => window.__player.trace());
const sentKeys = () => page.evaluate(() => {
  const keys = window.__player.events('hostKey').map((k) => `${k.type} ${k.code}`);
  window.__player.forget();
  return keys;
});
const held = () => page.evaluate(() => window.__player.session('Keys')?.keyboardHeld ?? []);
const focusedId = () => page.evaluate(() => document.activeElement?.closest?.('[data-control-id]')?.getAttribute('data-control-id') ?? '');
const valueOf = (id) => page.evaluate((controlId) => window.__player.session(controlId)?.valueOverride ?? null, id);
const blurAll = () => page.evaluate(() => document.activeElement?.blur?.());
async function until(check, what) {
  for (let n = 0; n < 100; n += 1) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`${what}\n${(await trace()).join('\n')}`);
}
const said = async (line) => (await trace()).includes(line);

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/playerInbound.html`);
  await page.waitForFunction(() => !!window.__player, null, { timeout: 20000 });
  await page.evaluate(() => { window.__CE_PLAYER_SESSION__ = { ...(window.__CE_PLAYER_SESSION__ ?? {}), hostKeys: true }; });
  await page.evaluate(() => window.__player.load('keys'));
  await page.waitForFunction(() => document.querySelectorAll('[data-control-id]').length >= 7, null, { timeout: 30000 });
  await until(() => said('PIANO true'), 'the scripts ran and the piano is on through Keys');
  await sentKeys();

  // shortcut: with a knob focused (Tab moves the focus with the keyboard), Ctrl+G still runs.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+g');
  await until(async () => (await trace()).some((l) => /^SHORTCUT G \S+$/.test(l) && !l.endsWith(' -')), 'Ctrl+G ran, naming the focused control');
  assert.deepEqual((await sentKeys()).filter((k) => k.endsWith('KeyG')), [], 'the DAW did not get the shortcut');
  console.log('PASS shortcut');

  // waits: Up on the focused knob turns it; the bare shortcut waits for it and does not run.
  const knob = await focusedId();
  assert.ok(knob, 'Tab gave a knob the keyboard');
  const before = await valueOf(knob);
  await page.keyboard.press('ArrowUp');
  await until(async () => (await valueOf(knob)) !== before, 'Up turns the focused knob');
  assert.equal((await trace()).includes('UP'), false, 'the knob used Up, so the shortcut did not run');
  await blurAll();
  await page.keyboard.press('ArrowUp');
  await until(() => said('UP'), 'with nothing focused, Up runs its shortcut');
  console.log(`PASS waits (${knob} ${before} -> ${await valueOf(knob)})`);

  // piano: A plays C4 through Keys; holding it plays one note.
  await page.keyboard.down('a');
  await until(async () => (await held()).length === 1, 'A holds one key on Keys');
  assert.deepEqual(await held(), [60]);
  await page.keyboard.down('a');   // a repeat, as the system sends while a key is held
  assert.deepEqual(await held(), [60], 'one note per press');
  await page.keyboard.up('a');
  await until(async () => (await held()).length === 0, 'letting A go releases it');
  assert.deepEqual((await sentKeys()).filter((k) => k.endsWith('KeyA')), [], 'piano keys are the panel\'s');
  assert.equal((await trace()).some((l) => l.startsWith('KEYDOWN A')), false, 'and never reach keyDown');
  console.log('PASS piano');

  // keyDown: B is heard and then goes to the DAW; Q is kept.
  await page.keyboard.press('b');
  await until(() => said('KEYUP B'), 'B reaches keyDown and keyUp');
  assert.ok(await said('KEYDOWN B'));
  await until(async () => {
    const keys = await page.evaluate(() => window.__player.events('hostKey').map((k) => `${k.type} ${k.code}`));
    return keys.includes('down KeyB') && keys.includes('up KeyB');
  }, 'no handler kept B, so the DAW gets it, down and up');
  await sentKeys();
  await page.keyboard.press('q');
  await until(() => said('KEYUP Q'), 'Q reaches keyDown and keyUp');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual((await sentKeys()).filter((k) => k.endsWith('KeyQ')), [], 'Q was kept, so the DAW never sees it');
  console.log('PASS keyDown');

  // blur: Q and A held while the window loses focus.
  const ups = (await trace()).filter((l) => l === 'KEYUP Q').length;
  await page.keyboard.down('q');
  await page.keyboard.down('a');
  await until(async () => (await held()).length === 1, 'A is held');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await until(async () => (await trace()).filter((l) => l === 'KEYUP Q').length === ups + 1, 'Q gets its keyUp');
  await until(async () => (await held()).length === 0, 'A\'s note is let go');
  await page.keyboard.up('q');
  await page.keyboard.up('a');
  console.log('PASS blur');

  assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`);
} catch (error) {
  failed = true;
  console.error(String(error?.stack ?? error));
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
console.log('playerKeys: all checks passed');
