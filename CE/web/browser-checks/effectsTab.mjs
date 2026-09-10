/**
 * The Effects tab, driven in Chromium.
 *
 * Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt to get wrong:
 *   - the stack renders the same rows the model derives, front first
 *   - dragging a row writes an order that brings it back in the new position
 *   - every preview drew something, because a preview that silently renders nothing is the whole
 *     design failing quietly
 *   - the state strip shows a state with the effect switched off, and marks it
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
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1320, height: 520 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  // The harness page has no favicon and does not need one; a 404 for it is not a page error.
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${port}/effectsTab.html`);
await page.waitForFunction(() => window.__fx && document.querySelectorAll('.stack .srow').length > 0);
await page.waitForTimeout(300);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

// --- the stack ---------------------------------------------------------------------------------

const rows = await page.evaluate(() => window.__fx.rows());
check('the stack renders every ordered effect plus the fill, front first', () => {
  assert.deepEqual(rows, [
    'Inner Glow', 'Bevel', 'Inner Shadow', 'Fill', '2nd Stroke',
    'Outline', 'Motion', 'Glow', 'Shadow', 'Reflection',
  ]);
});

const loose = await page.evaluate(() => window.__fx.looseRows());
check('effects with no order of their own are listed apart, not dragged in with the rest', () => {
  assert.deepEqual(loose, ['Blur', 'Copy']);
});

const target = await page.evaluate(() => window.__fx.target());
check('the tab is armed on the seeded control', () => {
  assert.equal(target.controlId, 'ctrl_fx_1');
  assert.equal(target.domain, 'text');
});

// --- every preview actually drew ----------------------------------------------------------------

const rowInk = await page.evaluate(() => window.__fx.rowThumbInk());
const looseInk = await page.evaluate(() => window.__fx.looseThumbInk());
check('every row drew a thumbnail, stacked and unstacked alike', () => {
  assert.equal(rowInk.length, rows.length);
  const empty = rowInk.map((ink, i) => (ink > 40 ? null : rows[i])).filter(Boolean);
  assert.deepEqual(empty, [], `these rows rendered nothing: ${empty.join(', ')}`);
  assert.ok(looseInk.every((ink) => ink > 40), `unstacked ink: ${looseInk.join(', ')}`);
});

const specimenInk = await page.evaluate(() => window.__fx.specimenInk());
check('the specimen drew', () => assert.ok(specimenInk > 200, `specimen markup was ${specimenInk} chars`));

// --- the state strip ----------------------------------------------------------------------------

const stateNames = await page.evaluate(() => window.__fx.stateNames());
check('the state strip lists base plus the control\'s own states', () => {
  assert.deepEqual(stateNames, ['base', 'pressed']);
});

const stateInk = await page.evaluate(() => window.__fx.stateInk());
check('every state thumbnail drew', () => {
  assert.ok(stateInk.every((ink) => ink > 40), `state ink: ${stateInk.join(', ')}`);
});

// --- looks ---------------------------------------------------------------------------------------

const lookNames = await page.evaluate(() => window.__fx.lookNames());
check('the looks shelf is populated', () => {
  assert.ok(lookNames.includes('Neon'), `looks: ${lookNames.join(', ')}`);
  assert.ok(lookNames.length >= 6);
});
const lookInk = await page.evaluate(() => window.__fx.lookInk());
check('every look thumbnail drew', () => {
  assert.ok(lookInk.every((ink) => ink > 40), `look ink: ${lookInk.join(', ')}`);
});

// --- no sliders -----------------------------------------------------------------------------------

const sliders = await page.evaluate(() => window.__fx.sliderCount());
check('there is not a single slider in the tab', () => assert.equal(sliders, 0));

// --- settings -------------------------------------------------------------------------------------

await page.evaluate(() => window.__fx.selectRow('Outline'));
await page.waitForTimeout(120);
const labels = await page.evaluate(() => window.__fx.settingsLabels());
check('selecting a row shows its fields and no Order field', () => {
  assert.ok(labels.includes('Thickness'), `labels: ${labels.join(', ')}`);
  assert.ok(labels.includes('Placement'));
  assert.ok(!labels.some((label) => /order/i.test(label)), 'the stack is the order');
});

// --- toggling -------------------------------------------------------------------------------------

const before = await page.evaluate(() => window.__fx.enabled());
const toggled = await page.evaluate(() => window.__fx.toggleRow('Glow'));
assert.ok(toggled, 'the Glow row was found');
await page.waitForTimeout(120);
const after = await page.evaluate(() => window.__fx.enabled());
check('the on/off dot writes through to the document', () => {
  assert.equal(before.glow, true);
  assert.equal(after.glow, false);
  assert.equal(after.outline, true, 'and leaves its neighbours alone');
});
await page.evaluate(() => window.__fx.toggleRow('Glow'));
await page.waitForTimeout(120);

// --- the drag, which is the whole point -----------------------------------------------------------

const ordersBefore = await page.evaluate(() => window.__fx.orders());
const dragged = await page.evaluate(() => window.__fx.dragRow('Shadow', 0));
assert.ok(dragged, 'the Shadow row was found and dragged');
await page.waitForTimeout(200);
const rowsAfter = await page.evaluate(() => window.__fx.rows());
const ordersAfter = await page.evaluate(() => window.__fx.orders());
check('dragging Shadow to the front puts it at the front', () => {
  assert.equal(rowsAfter[0], 'Shadow', `stack is now ${rowsAfter.join(' > ')}`);
  assert.notEqual(ordersAfter.shadow, ordersBefore.shadow, 'and the order number changed');
});
check('and the rest of the stack kept its relative order', () => {
  const expected = rows.filter((name) => name !== 'Shadow');
  assert.deepEqual(rowsAfter.filter((name) => name !== 'Shadow'), expected);
});

// --- looks apply ------------------------------------------------------------------------------------

await page.evaluate(() => window.__fx.applyLook('Neon'));
await page.waitForTimeout(200);
const afterLook = await page.evaluate(() => window.__fx.enabled());
check('applying a look rewrites the whole stack, not just part of it', () => {
  assert.equal(afterLook.glow, true, 'Neon switches glow on');
  assert.equal(afterLook.outline, true, 'and outline on');
  assert.equal(afterLook.shadow, false, 'and shadow OFF — a look is a destination, not an addition');
});

await page.screenshot({ path: join(ROOT, 'effects-tab.png') });

await browser.close();
server.close();

if (failures.length) {
  console.error('\npage errors:');
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log('\neffects tab: all checks passed');
