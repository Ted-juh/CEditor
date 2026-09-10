/**
 * The properties panel after a section's rows moved into its tab. Run with the rest.
 *
 * Step 4 of the panel cleanup, one section at a time. The first is `Text` → Effects, which was the
 * single tallest section in the application. What has to hold is that what remains is enough to
 * work with: every effect can still be switched on and off from here, the one thing the tab does
 * not cover (Hollow) is still here, and there is a way into the tab from the header.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

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
const page = await browser.newPage({ viewport: { width: 420, height: 2400 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));

await page.goto(`http://127.0.0.1:${server.address().port}/panelStrip.html`);
await page.waitForFunction(() => window.__m);
await page.waitForTimeout(500);
await page.evaluate(() => window.__m.open('Effects'));
await page.waitForTimeout(700);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);

// --- What it costs now --------------------------------------------------------------------------

const height = await ev(() => window.__m.height('Effects'));
const cells = await ev(() => window.__m.cells('Effects'));
check('the tallest section in the application is two rows now, not fifty-eight', () => {
  // Measured with every text effect on, in a 340px panel: 1,127px before, and this after.
  assert.equal(cells, 2, `cells: ${cells}`);
  assert.ok(height < 260, `the section is ${height}px, which is not stripped`);
});

// --- And it still does its job -------------------------------------------------------------------

const toggles = await ev(() => window.__m.toggles('Effects'));
check('every effect can still be switched on and off from the panel', () => {
  assert.deepEqual(toggles, [
    'Outline', '2nd Stroke', 'Shadow', 'Glow', 'Inner Glow', 'Inner Shadow',
    'Bevel', 'Blur', 'Motion', 'Reflection', 'Hollow',
  ]);
});

const active = await ev(() => window.__m.activeToggles('Effects'));
check('and the toggles read the control, rather than being eleven dead buttons', () => {
  // The fixture turns every one of them on.
  assert.ok(active.length >= 10, `only ${active.length} read as on: ${active.join(', ')}`);
});

check('Hollow is still here, because it is the one thing the Effects tab does not cover', () => {
  assert.ok(toggles.includes('Hollow'));
});

const opener = await ev(() => window.__m.opener('Effects'));
check('and the header carries the way into the tab that took the rest', () => {
  assert.equal(opener, 'effects:ctrl_m:text');
});

const note = await ev(() => window.__m.note('Effects'));
check('with a line saying where the settings went', () => {
  assert.match(note, /Effects/);
  assert.match(note, /settings are in/);
});

// --- What was deliberately not stripped ----------------------------------------------------------

const titles = await ev(() => window.__m.titles());
check('the other Text sections are untouched — this is one section at a time', () => {
  for (const title of ['Text', 'Font Settings', 'Typography', 'Multiline', 'Position', 'Fill', 'Flow', 'Line']) {
    assert.ok(titles.includes(title), `${title} is gone: ${titles.join(', ')}`);
  }
});

const flowCells = await ev(() => window.__m.cells('Typography'));
check('and Typography still draws its rows, even though the Type tab covers them', () => {
  assert.ok(flowCells > 3, `Typography has ${flowCells} cells`);
});

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\npanel strip: all checks passed');
await browser.close();
server.close();
