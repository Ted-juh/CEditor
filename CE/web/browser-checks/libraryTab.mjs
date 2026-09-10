/**
 * The Library tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - each card is the REAL renderer, not the panel's fourteen coloured rectangles
 *   - a card says what the panel's own picture of that package leaves out
 *   - placing adds a component to the panel, which the library section cannot do at all
 *   - replacing overwrites the selected component and says whose sections it is about to take
 *   - a card carries the drag payload the canvas already reads
 *   - search, sort, tags and pinning behave
 *   - there is not a single slider in the tab
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
const page = await browser.newPage({ viewport: { width: 1320, height: 560 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${server.address().port}/libraryTab.html`);
await page.waitForFunction(() => window.__lib && document.querySelectorAll('.card').length > 0);
await page.waitForTimeout(600);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);

// --- The pictures -----------------------------------------------------------------------------

const names = await ev(() => window.__lib.names());
check('every saved component is a card, not six of them in a list', () => {
  assert.equal(names.length, 4, `cards: ${names.join(', ')}`);
  for (const wanted of ['Big Knob', 'Layered Knob', 'Slim Fader', 'Amber LED']) {
    assert.ok(names.includes(wanted), `missing ${wanted} — got ${names.join(', ')}`);
  }
});

const shots = await ev(() => window.__lib.shotControls());
const ink = await ev(() => window.__lib.shotInk());
check('each card is the real renderer, not a stack of coloured rectangles', () => {
  assert.equal(shots, 4, 'every card should have mounted a preview');
  assert.ok(ink.every((value) => value > 100), `previews drew: ${ink.join(', ')}`);
});

const losses = await ev(() => window.__lib.lossNotes());
check('and a card says what the panel\'s own picture of it leaves out', () => {
  // Only the 22-part component loses anything: 18 survive the envelope, 14 reach the card.
  assert.equal(losses.length, 1, `loss notes: ${losses.join(' | ')}`);
  assert.match(losses[0], /14 of 22/);
});

// --- Placing ----------------------------------------------------------------------------------

const before = await ev(() => window.__lib.panelControls());
await ev(() => window.__lib.select('Big Knob'));
await page.waitForTimeout(200);
await ev(() => window.__lib.place());
await page.waitForTimeout(350);
const after = await ev(() => window.__lib.panelControls());
check('placing adds a component to the panel — which the library section cannot do at all', () => {
  assert.equal(before.length, 1);
  assert.equal(after.length, 2, `panel now holds: ${after.join(', ')}`);
  assert.ok(after.includes('Big Knob'));
});

check('and the placement is counted against the package', async () => {});
assert.equal(await ev(() => window.__lib.useCount('Big Knob')), 1);

const payload = await ev(() => window.__lib.dragPayload('Slim Fader'));
check('a card carries the drag payload the canvas already reads', () => {
  assert.equal(payload.type, 'application/x-ceditor-insert');
  const parsed = JSON.parse(payload.value);
  assert.equal(parsed.kind, 'package');
  assert.ok(parsed.id, 'the payload needs the package id');
});

// --- Replacing --------------------------------------------------------------------------------

// Placing selects what it placed, so the replace target moved with it — which is the behaviour
// this tab wants and is worth pinning: unlike the editing tabs, this one FOLLOWS the selection,
// because the thing it would overwrite is the thing you are pointing at.
const followed = await ev(() => window.__lib.replaceLabel());
check('the destructive action follows the canvas selection', () => {
  assert.match(followed, /Replace Big Knob/, 'placing selected the new copy, so that is the target');
});

await ev(() => window.__lib.selectHost());
await page.waitForTimeout(250);
await ev(() => window.__lib.select('Layered Knob'));
await page.waitForTimeout(250);
const replaceLabel = await ev(() => window.__lib.replaceLabel());
check('and it names the component it is about to overwrite', () => {
  assert.match(replaceLabel, /Replace On Canvas/);
});

const partsBefore = await ev(() => window.__lib.hostParts());
await ev(() => window.__lib.replace());
await page.waitForTimeout(400);
const partsAfter = await ev(() => window.__lib.hostParts());
const hostName = await ev(() => window.__lib.hostName());
check('and it really does swap every section of that component', () => {
  assert.equal(partsBefore, 5, 'the canvas component started with the five default parts');
  assert.equal(partsAfter, 22, 'and now has the package\'s');
  assert.equal(hostName, 'Layered Knob', 'including its name');
});

// --- Search, sort, tags, pin ------------------------------------------------------------------

await ev(() => window.__lib.search('fader'));
await page.waitForTimeout(300);
check('search narrows to what matches', async () => {});
assert.deepEqual(await ev(() => window.__lib.names()), ['Slim Fader']);

await ev(() => window.__lib.search('sam'));
await page.waitForTimeout(300);
check('and it searches the author too', async () => {});
assert.deepEqual(await ev(() => window.__lib.names()), ['Slim Fader']);

await ev(() => window.__lib.search(''));
await page.waitForTimeout(300);

await ev(() => window.__lib.sortBy('Name'));
await page.waitForTimeout(300);
const byName = await ev(() => window.__lib.names());
check('sorting by name really reorders the grid', () => {
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
});

await ev(() => window.__lib.pin('Slim Fader'));
await page.waitForTimeout(350);
const pinnedFirst = await ev(() => window.__lib.names());
const pinnedList = await ev(() => window.__lib.pinned());
check('a pinned component leads, even against the sort', () => {
  assert.equal(pinnedFirst[0], 'Slim Fader');
  assert.deepEqual(pinnedList, ['Slim Fader']);
});

const chips = await ev(() => window.__lib.tagChips());
check('the tags in the library are offered as filters', () => {
  assert.ok(chips.some((chip) => chip.startsWith('knob')), `chips: ${chips.join(' | ')}`);
});

await ev(() => window.__lib.clickTag('led'));
await page.waitForTimeout(300);
check('clicking a tag filters by it', async () => {});
assert.deepEqual(await ev(() => window.__lib.names()), ['Amber LED']);
await ev(() => window.__lib.clickTag('led'));
await page.waitForTimeout(300);

// --- Forgetting -------------------------------------------------------------------------------

const sizeBefore = await ev(() => window.__lib.librarySize());
await ev(() => window.__lib.select('Amber LED'));
await page.waitForTimeout(200);
await ev(() => window.__lib.forget());
await page.waitForTimeout(350);
const sizeAfter = await ev(() => window.__lib.librarySize());
const remaining = await ev(() => window.__lib.names());
check('forgetting removes it from the library and the grid heals', () => {
  assert.equal(sizeAfter, sizeBefore - 1);
  assert.ok(!remaining.includes('Amber LED'), `still listed: ${remaining.join(', ')}`);
});

// --- The rule ---------------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__lib.sliderCount()), 0);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\nlibrary tab: all checks passed');
await browser.close();
server.close();
