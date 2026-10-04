/**
 * The Source card, driven in Chromium: `node browser-checks/sourceLink.mjs` after
 * `vite build --config browser-checks/vite.config.mjs`. The harness entry has the scenario.
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
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 440, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${server.address().port}/sourceLink.html`);
await page.waitForFunction(() => window.__src && document.querySelector('.source-card'));
await page.waitForTimeout(300);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(250);

// --- An untouched copy ------------------------------------------------------------------------

check('an untouched copy with a newer library version offers the update', () => {});
assert.equal(await ev(() => window.__src.pill()), 'Update available');
assert.match(await ev(() => window.__src.line()), /Library 1\.1\.0 changes 1 thing in Parts/);
const buttons = await ev(() => window.__src.buttons());
assert.ok(buttons.some((label) => label.startsWith('Update to 1.1.0')), buttons.join(' | '));
assert.ok(buttons.some((label) => /Update 2 copies on panel/.test(label)), `a and b can update without loss: ${buttons.join(' | ')}`);

await ev(() => window.__src.press('1 design difference'));
await settle();
const rows = await ev(() => window.__src.diffRows());
await page.locator('.source-card').screenshot({ path: join(ROOT, 'sourceLink-update.png') });
check('and the diff names the one change and says the library made it', () => {
  assert.equal(rows.length, 1, rows.join(' | '));
  assert.match(rows[0], /opacity.*1.*→.*0\.5.*library/);
});

await ev(() => window.__src.press('Update 2 copies'));
await settle();
check('updating every copy that can be updated changes the panel, not just the card', async () => {});
assert.equal(await ev(() => window.__src.version('ctrl_a')), '1.1.0');
assert.equal(await ev(() => window.__src.opacity('ctrl_a')), 0.5);
assert.equal(await ev(() => window.__src.x('ctrl_a')), 20, 'and the copy did not move');
assert.equal(await ev(() => window.__src.version('ctrl_b')), '1.1.0');
assert.equal(await ev(() => window.__src.title('ctrl_b')), 'CUTOFF', 'the label b set survives');
assert.equal(await ev(() => window.__src.version('ctrl_c')), '1.0.0', 'the edited copy is left alone');
assert.match(await ev(() => window.__src.status()), /Updated 2 copies · 1 left alone/);
assert.equal(await ev(() => window.__src.pill()), 'Up to date');

await ev(() => window.__src.flush());
await ev(() => window.__src.undo());
await settle();
check('and updating two copies is one undo step', async () => {});
assert.equal(await ev(() => window.__src.version('ctrl_a')), '1.0.0');
assert.equal(await ev(() => window.__src.version('ctrl_b')), '1.0.0');

// --- A copy with its own published value, updated on its own ----------------------------------

await ev(() => window.__src.select('ctrl_b'));
await settle();
check('a copy with a published value set updates cleanly on its own', async () => {});
assert.equal(await ev(() => window.__src.pill()), 'Update available');
await ev(() => window.__src.press('Update to'));
await settle();
assert.equal(await ev(() => window.__src.title('ctrl_b')), 'CUTOFF');
assert.equal(await ev(() => window.__src.opacity('ctrl_b')), 0.5, 'and the library change arrived');
assert.match(await ev(() => window.__src.status()), /kept 1 value/);

// --- A copy with a design edit of its own -----------------------------------------------------

await ev(() => window.__src.select('ctrl_c'));
await settle();
check('a copy with its own design edit is marked, not offered a plain update', async () => {});
assert.equal(await ev(() => window.__src.pill()), 'Library changed · copy edited');
assert.ok((await ev(() => window.__src.buttons())).some((label) => label.startsWith('Update to 1.1.0…')));

await ev(() => window.__src.press('Update to'));
await settle();
check('and updating it asks first, saying what would be lost', async () => {});
assert.match(await ev(() => window.__src.confirmText()), /discards 1 design edit/);
await page.locator('.source-card').screenshot({ path: join(ROOT, 'sourceLink-diverged.png') });
assert.equal(await ev(() => window.__src.version('ctrl_c')), '1.0.0', 'nothing has changed yet');
assert.equal(await ev(() => window.__src.visible0('ctrl_c')), false);

await ev(() => window.__src.confirm());
await settle();
assert.equal(await ev(() => window.__src.version('ctrl_c')), '1.1.0');
assert.notEqual(await ev(() => window.__src.visible0('ctrl_c')), false, 'the edit was discarded, as it said');

// --- Undo -------------------------------------------------------------------------------------

await ev(() => window.__src.flush());
await ev(() => window.__src.undo());
await settle();
check('undo takes back only the last update', async () => {});
assert.equal(await ev(() => window.__src.version('ctrl_c')), '1.0.0');
assert.equal(await ev(() => window.__src.visible0('ctrl_c')), false);
assert.equal(await ev(() => window.__src.version('ctrl_b')), '1.1.0', 'and only the last one');

// --- Push -------------------------------------------------------------------------------------

await ev(() => window.__src.select('ctrl_b'));
await settle();
await ev(() => window.__src.editDesign('ctrl_b'));
await settle();
check('a copy edited while the library stands still offers to save its edit as the next version', async () => {});
assert.equal(await ev(() => window.__src.pill()), 'Edited on this copy');
assert.ok((await ev(() => window.__src.buttons())).some((label) => label.startsWith('Save to library as 1.2.0')));

await ev(() => window.__src.press('Save to library'));
await settle();
check('saving asks first, and says what stays with the copy', async () => {});
assert.match(await ev(() => window.__src.confirmText()), /Saves this copy's 1 design edit as Dial 1\.2\.0\. Its position, name, bindings and published values stay its own/);
assert.deepEqual(await ev(() => window.__src.libraryVersions()), ['1.0.0', '1.1.0'], 'nothing saved yet');

await ev(() => window.__src.confirm());
await settle();
check('saved: the library has 1.2.0, and this copy is up to date with it, legend and all', async () => {});
assert.deepEqual(await ev(() => window.__src.libraryVersions()), ['1.0.0', '1.1.0', '1.2.0']);
assert.equal(await ev(() => window.__src.version('ctrl_b')), '1.2.0');
assert.equal(await ev(() => window.__src.pill()), 'Up to date');
assert.equal(await ev(() => window.__src.title('ctrl_b')), 'CUTOFF', 'its own legend did not become the package default');

await ev(() => window.__src.select('ctrl_a'));
await settle();
check('and another copy is offered the pushed edit', async () => {});
assert.equal(await ev(() => window.__src.pill()), 'Update available');
assert.match(await ev(() => window.__src.line()), /Library 1\.2\.0 changes/);
await ev(() => window.__src.press('Update to 1.2.0'));
await settle();
assert.equal(await ev(() => window.__src.opacity2('ctrl_a')), 0.3, 'the edit made on b arrived on a');
assert.notEqual(await ev(() => window.__src.title('ctrl_a')), 'CUTOFF', 'and b\'s legend did not');

await ev(() => window.__src.select('ctrl_c'));
await settle();

// --- Detach -----------------------------------------------------------------------------------

await ev(() => window.__src.press('Detach'));
await settle();
check('detach asks, then drops the link and leaves the component as it is', async () => {});
assert.match(await ev(() => window.__src.confirmText()), /stays exactly as it is/);
await ev(() => window.__src.confirm());
await settle();
assert.equal(await ev(() => window.__src.linked('ctrl_c')), false);
assert.equal(await ev(() => window.__src.visible0('ctrl_c')), false, 'its own edit is still there');
assert.equal(await ev(() => window.__src.hasCard()), false, 'and there is no source to show');

await page.screenshot({ path: join(ROOT, 'sourceLink.png') });
await browser.close();
server.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('source link: all checks passed');
