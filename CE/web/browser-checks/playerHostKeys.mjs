/**
 * Do the keys an exported plug-in's page does not use go to the DAW, and only those?
 *
 * The page half of docs/known-issues.md's "keyboard shortcuts in a DAW": the real Player, mounted on
 * the playerInbound harness's faked bridge, with a panel loaded, so the panel's own window handler
 * (the panic key, Escape) is there and was registered after the forwarding was, which is the order
 * the forwarding must not depend on. Real key presses, and what the page sends as 'hostKey':
 *
 *   off       without PlayerHost's word (window.__CE_PLAYER_SESSION__.hostKeys) the page keeps every
 *             key, as it does in the CEditor Player app and off Windows
 *   space     Space, with nothing focused, goes to the host as a key-down and a key-up, and the
 *             page does nothing with it
 *   shortcut  Ctrl+S goes, with Ctrl
 *   panic     Escape is the panel's panic key: the panel keeps it
 *   typing    a key typed into a field stays in the field
 *   focus     Tab moves the focus around the page; a bare Shift is the host's to read itself
 *   later     a window handler added after the forwarding, which uses its key, still keeps it; so
 *             does one that stops the key on the way out
 *   lists     Enter on an option of an open list stays with the list
 *   pairs     a key-up goes only after the key-down it belongs to went
 *   clicked   a click gives a control the focus, and the panel presses the focused control on Space:
 *             after a click Space is the host's all the same, and the control is not pressed; the
 *             arrows still turn the clicked knob; after Tab, Space presses the control again
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

// What the page sent the host since the last call, as "down Space" / "up KeyS+ctrl".
const sentKeys = () => page.evaluate(() => {
  const keys = window.__player.events('hostKey').map((k) => `${k.type} ${k.code}${k.ctrl ? '+ctrl' : ''}`);
  window.__player.forget();
  return keys;
});
// Whether the last key-down was left alone by the page (its default action not prevented).
const lastDownPrevented = () => page.evaluate(() => window.__lastKeyDown?.defaultPrevented === true);
const setForwarding = (on) => page.evaluate((value) => { window.__CE_PLAYER_SESSION__ = { ...(window.__CE_PLAYER_SESSION__ ?? {}), hostKeys: value }; }, on);
const blurAll = () => page.evaluate(() => document.activeElement?.blur?.());

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/playerInbound.html`);
  await page.waitForFunction(() => !!window.__player, null, { timeout: 20000 });
  await page.evaluate(() => window.__player.load());
  await page.waitForFunction(() => document.querySelectorAll('[data-control-id]').length >= 3, null, { timeout: 30000 });
  await page.evaluate(() => {
    // Every key-down, kept to read its outcome once the page is done with it.
    document.addEventListener('keydown', (event) => { window.__lastKeyDown = event; }, true);
    window.__player.forget();
  });

  // ---- off ---------------------------------------------------------------------------------------
  await blurAll();
  await page.keyboard.press('Space');
  assert.deepEqual(await sentKeys(), [], 'without PlayerHost saying so, a key went to the host');
  assert.equal(await lastDownPrevented(), false, 'without PlayerHost saying so, the page still swallowed Space');

  // ---- space and a shortcut ----------------------------------------------------------------------
  await setForwarding(true);
  await page.keyboard.press('Space');
  assert.deepEqual(await sentKeys(), ['down Space', 'up Space'], 'Space did not go to the host as a key-down and a key-up');
  assert.equal(await lastDownPrevented(), true, 'the page also acted on the Space it handed over');
  await page.keyboard.press('Control+KeyS');
  const shortcut = await page.evaluate(() => {
    const keys = window.__player.events('hostKey');
    window.__player.forget();
    return keys;
  });
  assert.deepEqual(shortcut.map((k) => [k.type, k.code, k.keyCode, k.ctrl]), [['down', 'KeyS', 83, true], ['up', 'KeyS', 83, true]],
    'Ctrl+S did not go to the host with its key code and Ctrl');

  // ---- the panel's own key -----------------------------------------------------------------------
  await page.keyboard.press('Escape');
  assert.deepEqual(await sentKeys(), [], 'the panic key went to the host instead of staying with the panel');
  assert.equal(await lastDownPrevented(), true, 'the panel did not take its panic key');

  // ---- typing, focus, modifiers ------------------------------------------------------------------
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probe-input';
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.type('a b');
  assert.deepEqual(await sentKeys(), [], 'keys typed into a field went to the host');
  assert.equal(await page.inputValue('#probe-input'), 'a b', 'the field did not get what was typed into it');
  await blurAll();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift');
  assert.deepEqual(await sentKeys(), [], 'Tab or a bare Shift went to the host');
  await blurAll();

  // ---- handlers the forwarding cannot know the order of ------------------------------------------
  await page.evaluate(() => {
    // Added after the forwarding was, as a panel mounted later adds its window handlers.
    window.addEventListener('keydown', (event) => { if (event.code === 'KeyQ') event.preventDefault(); });
    document.addEventListener('keydown', (event) => { if (event.code === 'KeyW') event.stopPropagation(); });
  });
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyW');
  assert.deepEqual(await sentKeys(), [], 'a key a later handler used, or stopped, still went to the host');
  await page.keyboard.press('KeyE');
  assert.deepEqual(await sentKeys(), ['down KeyE', 'up KeyE'], 'a key nobody used did not go to the host');

  // ---- an open list ------------------------------------------------------------------------------
  await page.evaluate(() => {
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.innerHTML = '<button role="option" id="probe-option">one</button>';
    document.body.appendChild(list);
    document.getElementById('probe-option').focus();
  });
  await page.keyboard.press('Enter');
  assert.deepEqual(await sentKeys(), [], 'Enter on an option of an open list went to the host');
  await blurAll();

  // ---- key-ups only after their key-downs --------------------------------------------------------
  await setForwarding(false);
  await page.keyboard.down('KeyZ');
  await setForwarding(true);
  await page.keyboard.up('KeyZ');
  assert.deepEqual(await sentKeys(), [], 'a key-up went to the host without its key-down');

  // ---- a control a click gave the focus ----------------------------------------------------------
  const knob = await page.locator('[data-control-id="cutoff"]').first().boundingBox();
  await page.mouse.click(knob.x + knob.width / 2, knob.y + knob.height / 2);
  const clickedFocus = await page.evaluate(() => document.activeElement?.closest?.('[data-control-id]')?.getAttribute('data-control-id'));
  assert.equal(clickedFocus, 'cutoff', 'the click did not give the knob the focus, so this proves nothing');
  await page.evaluate(() => window.__player.forget());
  await page.keyboard.down('Space');
  const pressedWhileDown = await page.evaluate(() => window.__player.pressed('cutoff'));
  await page.keyboard.up('Space');
  assert.deepEqual(await sentKeys(), ['down Space', 'up Space'], 'after a click on a knob, Space did not go to the host');
  assert.equal(pressedWhileDown, false, 'after a click on a knob, Space pressed the knob as well');
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await sentKeys(), [], 'the arrows on a clicked knob went to the host instead of turning it');
  await page.keyboard.press('Tab');
  const tabbedTo = await page.evaluate(() => document.activeElement?.closest?.('[data-control-id]')?.getAttribute('data-control-id') ?? null);
  assert.ok(tabbedTo, 'Tab did not move the focus to a control, so this proves nothing');
  await page.keyboard.down('Space');
  const pressedAfterTab = await page.evaluate((id) => window.__player.pressed(id), tabbedTo);
  await page.keyboard.up('Space');
  assert.deepEqual(await sentKeys(), [], 'after Tab, Space went to the host instead of pressing the control');
  assert.equal(pressedAfterTab, true, 'after Tab, Space did not press the focused control');

  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  console.log('player host keys: ok (kept without the word; Space and Ctrl+S handed over and not acted on; panic key, typing, Tab, Shift, used and stopped keys, an open list and an orphan key-up kept; Space the host\'s after a click and the control\'s after Tab)');
} catch (error) {
  failed = true;
  console.error('player host keys: FAILED\n', error.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
