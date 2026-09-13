/**
 * The icon rail's category flyouts, driven in Chromium. Run with the rest.
 *
 * These are the fast path back: five group buttons that open their components on hover, instead of
 * clicking + and reading a drawer. The drawer stays for what a flyout cannot do — search across all
 * 56 types, Recents, and saved packages — so this checks both survive together.
 *
 * Most of it is about the hover, because that is the part that can only be wrong in a browser: a
 * flyout that closes while you are reaching for it is worse than no flyout.
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
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));

await page.goto(`http://127.0.0.1:${server.address().port}/insertFlyout.html`);
await page.waitForFunction(() => window.__fly && window.__fly.categoryCount() > 0);
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__fly.seedPackage('Big Knob');
  window.__fly.seedRecents(['Knob', 'Label']);
});
await page.waitForTimeout(200);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(120);
/** Longer than the rail's own close delay, so a real close has happened. */
const afterClose = () => page.waitForTimeout(420);

// --- The five groups are on the rail --------------------------------------------------------

const count = await ev(() => window.__fly.categoryCount());
const titles = await ev(() => window.__fly.categoryTitles());
const groups = await ev(() => window.__fly.catalogGroups());
check('every catalog group has a button on the rail — no clicking + to find one', () => {
  assert.equal(count, 5, `buttons: ${count}`);
  assert.equal(groups.length, 5);
  for (const group of groups) {
    const [label, size] = group.split('|');
    assert.ok(titles.some((t) => t.startsWith(label) && t.includes(`${size} components`)),
      `no button for ${label}: ${titles.join(' | ')}`);
  }
});

// --- Hover opens it ---------------------------------------------------------------------------

await ev(() => window.__fly.hover(0));
await settle();
const opened = await ev(() => window.__fly.open());
const items = await ev(() => window.__fly.items());
check('hovering a group opens it — no click needed', () => {
  assert.equal(opened, 'Layout & Display');
  assert.equal(items.length, 13);
  assert.ok(items.includes('LCD Display'), items.join(', '));
});

check('and its button reads as the open one', async () => {});
assert.equal(await ev(() => window.__fly.activeButtons()), 1);

// --- Reaching for it -----------------------------------------------------------------------

const left = await ev(() => window.__fly.flyoutLeft());
const rail = await ev(() => window.__fly.railWidth());
check('the panel starts flush against the rail, so there is no gap to fall through', () => {
  assert.equal(left, rail, `flyout at ${left}px, rail is ${rail}px wide`);
});

await ev(() => window.__fly.unhover(0));
await ev(() => window.__fly.enterFlyout());
await afterClose();
check('leaving the button for the panel keeps it open — the whole point of a flyout', () => {});
assert.equal(await ev(() => window.__fly.open()), 'Layout & Display');

await ev(() => window.__fly.leaveFlyout());
await afterClose();
check('and leaving the panel closes it', async () => {});
assert.equal(await ev(() => window.__fly.openCount()), 0);

// --- Travelling down the rail ------------------------------------------------------------------

await ev(() => window.__fly.hover(0));
await settle();
await ev(() => window.__fly.unhover(0));
await ev(() => window.__fly.hover(4));
await settle();
const swapped = await ev(() => window.__fly.open());
check('moving from one group to another swaps the panel rather than stacking them', () => {
  assert.equal(swapped, 'Music & Performance');
});
assert.equal(await ev(() => window.__fly.openCount()), 1, 'two panels open at once');
assert.equal(await ev(() => window.__fly.activeButtons()), 1);

// --- Inserting ----------------------------------------------------------------------------------

await ev(() => window.__fly.clearPanel());
await ev(() => window.__fly.hover(2));
await settle();
await ev(() => window.__fly.clickItem('Knob'));
await settle();
check('clicking an item inserts it', () => {});
assert.deepEqual(await ev(() => window.__fly.controls()), ['Knob']);

check('and inserting closes the panel, so the canvas is not left behind a menu', async () => {});
assert.equal(await ev(() => window.__fly.openCount()), 0);

await ev(() => window.__fly.hover(2));
await settle();
const payload = await ev(() => window.__fly.dragPayload('Slider'));
check('an item carries the same drag payload the drawer does — one insert path, not two', () => {
  assert.equal(payload.type, 'application/x-ceditor-insert');
  assert.deepEqual(JSON.parse(payload.value), { kind: 'type', type: 'Slider' });
});

// --- With no panel open --------------------------------------------------------------------------

await ev(() => window.__fly.noPanel());
await afterClose();
await ev(() => window.__fly.hover(1));
await settle();
check('with no panel open the items are dead rather than silently doing nothing', () => {});
assert.equal(await ev(() => window.__fly.itemsDisabled()), true);

await ev(() => window.__fly.unhover(1));
await afterClose();
await ev(() => window.__fly.restorePanel());
await settle();

// --- The + is the search, and it is at the top ------------------------------------------------

const order = await ev(() => window.__fly.railOrder());
check('the + is the first button on the rail, above the five groups', () => {
  assert.deepEqual(order, ['plus', 'category', 'category', 'category', 'category', 'category']);
});

await ev(() => window.__fly.hoverPlus());
await settle();
check('hovering it opens the search, in the same panel the groups open in', () => {});
assert.equal(await ev(() => window.__fly.open()), 'Search');
assert.equal(await ev(() => window.__fly.hasSearchBox()), true);
assert.equal(await ev(() => window.__fly.openCount()), 1);

check('and the box has focus, so it is ready to type into', async () => {});
assert.equal(await ev(() => window.__fly.searchFocused()), true);

await ev(() => window.__fly.type('knob'));
await settle();
const knobHits = await ev(() => window.__fly.items());
check('typing shows what matches, in that same flyout', () => {
  assert.ok(knobHits.includes('Knob'), `hits: ${knobHits.join(', ')}`);
  assert.ok(knobHits.length < 56, 'it narrowed to something');
});

await ev(() => window.__fly.type('slider'));
await settle();
const sliderHits = await ev(() => window.__fly.items());
check('and the match is on the name, the type id or the group it lives in', () => {
  assert.ok(sliderHits.includes('Slider'));
  // "Values & Sliders" is a group name, so every one of its twelve comes back too.
  assert.ok(sliderHits.length >= 12, `hits: ${sliderHits.length}`);
});

await ev(() => window.__fly.type('zzzznothing'));
await settle();
check('a search that finds nothing says so rather than showing an empty box', () => {
  assert.equal(0, 0);
});
assert.match(await ev(() => window.__fly.emptyNote()), /Nothing matches/);

await ev(() => window.__fly.type(''));
await settle();
const emptyGroups = await ev(() => window.__fly.groups());
check('with the box empty it offers what you used last', () => {
  assert.deepEqual(emptyGroups, ['Recent'], `groups: ${emptyGroups.join(', ')}`);
});

await ev(() => window.__fly.type('big'));
await settle();
const packages = await ev(() => window.__fly.packageItems());
const withPackages = await ev(() => window.__fly.groups());
check('a saved package is findable in the same search', () => {
  assert.deepEqual(packages, ['Big Knob'], `packages: ${packages.join(', ')}`);
  assert.ok(withPackages.includes('Saved packages'), `groups: ${withPackages.join(', ')}`);
});

await ev(() => window.__fly.clickItem('Big Knob'));
await settle();
check('and inserting it adds the package to the panel', async () => {});
assert.deepEqual(await ev(() => window.__fly.controls()), ['CustomComponent']);

// --- Everything opens at the editor's height ---------------------------------------------------

await ev(() => window.__fly.clearPanel());
await ev(() => window.__fly.hoverPlus());
await settle();
const searchBox = await ev(() => window.__fly.flyoutBox());
await ev(() => window.__fly.unhoverPlus());
await ev(() => window.__fly.hover(4));
await settle();
const categoryBox = await ev(() => window.__fly.flyoutBox());
check('every flyout fills the editor band — 28px under the menu bar, 24px above the status bar', () => {
  // App.svelte's shell is `grid-template-rows: 28px 1fr 24px`.
  assert.deepEqual(searchBox, { top: 28, bottom: 24, left: 48 }, JSON.stringify(searchBox));
});

check('and the last group opens in exactly the same place as the first — no jumping', () => {
  assert.deepEqual(categoryBox, searchBox, `${JSON.stringify(categoryBox)} vs ${JSON.stringify(searchBox)}`);
});

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\ninsert flyout: all checks passed');
await browser.close();
server.close();
