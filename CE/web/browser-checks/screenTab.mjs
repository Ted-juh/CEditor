/**
 * The Screen tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - a zone off the last row and a zone past the last column are BOTH called out, and differently
 *   - the offered repair writes the properties and the warning turns into a pass
 *   - dragging a zone box writes the same row/colStart/colEnd a number field would have
 *   - page rules can be reordered at all, which they never could
 *   - the live marker follows the selector value, and an unreachable rule is marked
 *   - a pixel display shows its own renderer rather than a second drag implementation
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

await page.goto(`http://127.0.0.1:${server.address().port}/screenTab.html`);
await page.waitForFunction(() => window.__sc && document.querySelectorAll('.prow').length > 0);
await page.waitForTimeout(400);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(320);

// --- Pages ------------------------------------------------------------------------------------

assert.equal((await ev(() => window.__sc.target())).controlId, 'ctrl_lcd_1');

const pages = await ev(() => window.__sc.pages());
check('every layout is a row, not a name in a dropdown', () => {
  assert.deepEqual(pages, ['Home', 'Edit', 'Meters']);
});

const thumbs = await ev(() => window.__sc.pageThumbs());
check('and each row shows what that page actually looks like', () => {
  assert.match(thumbs[0], /CUTOFF/, `Home thumbnail: ${thumbs[0]}`);
  assert.match(thumbs[1], /NAME: INIT/, `Edit thumbnail: ${thumbs[1]}`);
  // The ghost zone is on row 3 of a 2-row screen, so composeLayout must not put it in the picture.
  assert.doesNotMatch(thumbs[0], /GHOST/, 'the off-screen zone must not appear in the thumbnail');
});

// --- The finding ------------------------------------------------------------------------------

const marks = await ev(() => window.__sc.marks());
const bad = await ev(() => window.__sc.badBoxes());
const edges = await ev(() => window.__sc.edges());
check('every zone is represented, and the two broken ones are marked', () => {
  assert.equal(marks, 5, 'all five zones should be on the picture somehow');
  assert.equal(bad, 2, 'two of them are out of range');
  // The clamped zone gets a box, because the renderer really does paint it at the edge. The one on
  // row 3 gets an edge tab, because the renderer paints it nowhere and a box would be a lie.
  assert.equal(edges, 1, 'exactly one zone paints nowhere');
});

const checkText = await ev(() => window.__sc.check());
const checkClass = await ev(() => window.__sc.checkClass());
check('both failures are called out, and they read differently', () => {
  assert.ok(checkClass.includes('bad'), `check class: ${checkClass}`);
  assert.match(checkText, /2 zones are not where their numbers say/);
  assert.match(checkText, /never paints/, `the dropped zone: ${checkText}`);
  assert.match(checkText, /still paints, clamped/, `the clamped zone: ${checkText}`);
});

const fixes = await ev(() => window.__sc.fixes());
check('and each has a repair naming what it will do', () => {
  assert.equal(fixes.length, 2, `offers: ${fixes.join(' | ')}`);
  assert.ok(fixes.some((f) => /move to row 2/.test(f)), `offers: ${fixes.join(' | ')}`);
  assert.ok(fixes.some((f) => /fit to columns/.test(f)), `offers: ${fixes.join(' | ')}`);
});

await ev(() => window.__sc.applyFix(0));
await page.waitForTimeout(250);
await ev(() => window.__sc.applyFix(0));
await page.waitForTimeout(250);

const afterFix = await ev(() => window.__sc.check());
const afterClass = await ev(() => window.__sc.checkClass());
const repairedGhost = await ev(() => window.__sc.zone(3));
const repairedWide = await ev(() => window.__sc.zone(4));
check('the repairs write the properties and the warning turns into a pass', () => {
  assert.equal(repairedGhost.row, 2, 'the off-row zone moved onto the screen');
  // The zone was columns 20-28, nine cells wide. Fitting keeps the width and slides it left, so
  // 8..16 is the answer — not 9..16, which would silently shrink it.
  assert.equal(repairedWide.colStart, 8);
  assert.equal(repairedWide.colEnd, 16);
  assert.equal(repairedWide.colEnd - repairedWide.colStart + 1, 9, 'the repair must not change the width');
  assert.ok(afterClass.includes('good'), `check class after the fixes: ${afterClass}`);
  assert.match(afterFix, /Every zone is on the screen/);
});

// --- Dragging ---------------------------------------------------------------------------------

const beforeDrag = await ev(() => window.__sc.zone(0));
await ev(() => window.__sc.dragBox(0, 2, 1));
await page.waitForTimeout(250);
const afterDrag = await ev(() => window.__sc.zone(0));
check('dragging a zone writes the row and columns a number field would have', () => {
  assert.equal(beforeDrag.row, 1);
  assert.equal(afterDrag.row, 2, 'one row down');
  assert.equal(afterDrag.colStart, beforeDrag.colStart + 2, 'two cells right');
  assert.equal(afterDrag.colEnd, beforeDrag.colEnd + 2, 'and the same width');
});

await ev(() => window.__sc.dragBox(0, 2, 0, 'r'));
await page.waitForTimeout(250);
const afterResize = await ev(() => window.__sc.zone(0));
check('dragging the right end resizes without moving the left', () => {
  assert.equal(afterResize.colStart, afterDrag.colStart, 'the left edge must stay put');
  assert.equal(afterResize.colEnd, afterDrag.colEnd + 2);
});

const stillFine = await ev(() => window.__sc.checkClass());
check('and a drag can never put a zone off the screen', () => {
  assert.ok(stillFine.includes('good'), `check class after dragging: ${stillFine}`);
});

// --- Rules ------------------------------------------------------------------------------------

const rulesBefore = await ev(() => window.__sc.storedRules());
check('the rules start in the order they were written', () => {
  assert.deepEqual(rulesBefore, ['eq0', 'ge2', 'eq3']);
});

const shadowed = await ev(() => window.__sc.shadowedRules());
check('a rule an earlier one already claims is marked unreachable', () => {
  assert.deepEqual(shadowed, [2], '">= 2" above "= 3" makes the third rule dead');
});

await ev(() => window.__sc.dragRule(2, 1));
await page.waitForTimeout(300);
const rulesAfter = await ev(() => window.__sc.storedRules());
const shadowedAfter = await ev(() => window.__sc.shadowedRules());
check('rules can be reordered, which the properties panel has never allowed', () => {
  assert.deepEqual(rulesAfter, ['eq0', 'eq3', 'ge2']);
  assert.deepEqual(shadowedAfter, [], 'and moving it above the range rule makes it reachable again');
});

await ev(() => window.__sc.setTest('3'));
await page.waitForTimeout(250);
check('the live marker follows the selector value', async () => {});
assert.equal(await ev(() => window.__sc.liveRule()), 1, '"= 3" now wins');
await ev(() => window.__sc.setTest('9'));
await page.waitForTimeout(250);
assert.equal(await ev(() => window.__sc.liveRule()), 2, '">= 2" catches 9');
await ev(() => window.__sc.setTest(''));
await page.waitForTimeout(200);
assert.equal(await ev(() => window.__sc.liveRule()), -1, 'no value, no live rule');

// --- Switching page ---------------------------------------------------------------------------

await ev(() => window.__sc.pickPage('Meters'));
await page.waitForTimeout(300);
check('picking a page shows it here and tells the canvas too', async () => {});
assert.equal(await ev(() => window.__sc.designLayout()), 'l3');
assert.equal(await ev(() => window.__sc.boxes()), 1, 'Meters has one zone');
await ev(() => window.__sc.pickPage('Home'));
await page.waitForTimeout(300);

// --- The pixel half ---------------------------------------------------------------------------

check('the LCD stage carries the zone overlay', async () => {});
assert.equal(await ev(() => window.__sc.stageHasLcd()), true);

await ev(() => window.__sc.armPixel());
await page.waitForTimeout(500);
const pixelHead = await ev(() => window.__sc.head());
check('a pixel display arms in the same tab, in its own units', () => {
  assert.match(pixelHead, /OLED/);
  assert.match(pixelHead, /128 × 64 px/, `header: ${pixelHead}`);
});

check('and it uses its own renderer rather than a second drag implementation', async () => {});
assert.equal(await ev(() => window.__sc.stageHasLcd()), false, 'no LCD overlay on a pixel screen');

const pixelCheck = await ev(() => window.__sc.check());
check('the same check runs on pixel elements', () => {
  assert.match(pixelCheck, /element 2/i, `check: ${pixelCheck}`);
  assert.match(pixelCheck, /cut off|outside/, `check: ${pixelCheck}`);
});

await ev(() => window.__sc.applyFix(0));
await page.waitForTimeout(300);
const elements = await ev(() => window.__sc.elements());
check('and its repair writes the element back onto the screen', () => {
  assert.ok(elements[1].x + elements[1].w <= 128, `element 2 is at ${elements[1].x}+${elements[1].w}`);
});

// --- The rule ---------------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__sc.sliderCount()), 0);

// --- Making and unmaking an item ----------------------------------------------------------------
// Adding, removing and duplicating used to stay in the properties panel. It is a gap the moment the
// panel's rows come out, and it has to work in both units — a zone on an LCD, an element on a pixel
// screen — which is why it is checked on both.

// The pixel display is the one armed at this point.
const elementsBefore = await ev(() => window.__sc.storedElementIds());
await ev(() => window.__sc.itemTool('Add another element'));
await settle();
const elementsAdded = await ev(() => window.__sc.storedElementIds());
check('an element can be added here — it used to need the properties panel', () => {
  assert.equal(elementsAdded.length, elementsBefore.length + 1, `${elementsBefore.join(',')} -> ${elementsAdded.join(',')}`);
  assert.equal(new Set(elementsAdded).size, elementsAdded.length, 'and its id is its own');
});

await ev(() => window.__sc.itemTool('Duplicate element'));
await settle();
const elementsDuped = await ev(() => window.__sc.storedElementIds());
check('duplicating gives the copy an id of its own rather than sharing one', () => {
  assert.equal(elementsDuped.length, elementsAdded.length + 1);
  assert.equal(new Set(elementsDuped).size, elementsDuped.length);
});

await ev(() => window.__sc.itemTool('Remove element'));
await settle();
await ev(() => window.__sc.itemTool('Remove element'));
await settle();
check('and two Removes take off the two that were added, not two at the other end', () => {
  // Removing used to clear the selection, and a cleared selection falls back to the FIRST item —
  // so a second click deleted something the user never pointed at. It now selects what took the
  // removed one's place, the way a list does.
});
assert.deepEqual(await ev(() => window.__sc.storedElementIds()), elementsBefore);

// And the same three on the LCD half, where the item is a zone in a named layout.
await ev(() => window.__sc.armLcd());
await settle();
await ev(() => window.__sc.pickPage('Home'));
await settle();
const zonesBefore = await ev(() => window.__sc.storedZoneIds());
await ev(() => window.__sc.itemTool('Add another zone'));
await settle();
const zonesAdded = await ev(() => window.__sc.storedZoneIds());
check('a zone can be added to the layout on screen, not to whichever one is first', () => {
  assert.equal(zonesAdded.length, zonesBefore.length + 1, `${zonesBefore.join(',')} -> ${zonesAdded.join(',')}`);
  assert.equal(new Set(zonesAdded).size, zonesAdded.length);
});

await ev(() => window.__sc.itemTool('Remove zone'));
await settle();
check('and removing it leaves the layout as it was', async () => {});
assert.deepEqual(await ev(() => window.__sc.storedZoneIds()), zonesBefore);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\nscreen tab: all checks passed');
await browser.close();
server.close();
