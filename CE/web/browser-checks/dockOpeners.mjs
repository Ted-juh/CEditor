/**
 * The properties panel → dock tab handoff, driven in Chromium. Run with the rest.
 *
 * The properties panel sits on the left and the real dock on the right, so this is the whole route
 * end to end: click the button in a section header, and the dock has to switch to that tab and the
 * tab has to arrive already pointed at the control the button was in.
 *
 * What it checks:
 *   - every opener switches the dock to its tab
 *   - and arms the right control, with the right domain where there is one
 *   - the Type tab's two halves really are two — Flow arms a different domain from Typography
 *   - the Library opener arms nothing, because it edits the library rather than a control
 *   - the tab arrives usable, not on its "nothing armed" empty state
 *   - clicking the button does not collapse the section it sits in
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
const page = await browser.newPage({ viewport: { width: 1320, height: 820 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${server.address().port}/dockOpeners.html`);
await page.waitForFunction(() => window.__ho && window.__ho.count() > 0);
await page.waitForTimeout(700);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(500);

// --- Every section that has a tab has a way in ------------------------------------------------

const titles = await ev(() => window.__ho.titles());
check('every covered section carries an opener, and each names its tab', () => {
  assert.equal(titles.length, 8, `openers: ${titles.join(' | ')}`);
  for (const tab of ['Animation tab', 'Designer tab', 'Type tab', 'Effects tab', 'Library tab']) {
    assert.ok(titles.some((t) => t.includes(tab)), `nothing opens the ${tab}: ${titles.join(' | ')}`);
  }
});

// --- Animation --------------------------------------------------------------------------------

await ev(() => window.__ho.clearTarget());
await ev(() => window.__ho.clickByTitle('animations in the Animation tab'));
await settle();
check('the Animations section opens the Animation tab, on its own control', () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Animation');
assert.equal(await ev(() => window.__ho.target()), 'animation:ctrl_custom:-');

const animPane = await ev(() => window.__ho.dockPaneText());
check('and the tab arrives usable, not on its "nothing armed" screen', () => {
  assert.ok(!/Nothing armed/.test(animPane), `tab said: ${animPane}`);
  assert.match(animPane, /Big Knob/, `tab said: ${animPane}`);
  assert.match(animPane, /pressMotion/);
});

// --- Designer ---------------------------------------------------------------------------------

await ev(() => window.__ho.clickByTitle('this pattern in the Designer tab'));
await settle();
check('the Sequence section opens the Designer tab, on the sequencer', () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Designer');
assert.equal(await ev(() => window.__ho.target()), 'designer:ctrl_seq:-');

const desPane = await ev(() => window.__ho.dockPaneText());
check('and lands on the sequencer grid rather than the empty state', () => {
  assert.match(desPane, /designing Big Drums/);
  assert.match(desPane, /Step Sequencer/);
});

// --- Type, and its two halves -----------------------------------------------------------------

await ev(() => window.__ho.clickByTitle("typography in the Type tab"));
await settle();
check('a typography section opens the Type tab in its "type" half', () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Type');
assert.equal(await ev(() => window.__ho.target()), 'typography:ctrl_label:type');

await ev(() => window.__ho.clickByTitle("flow in the Type tab"));
await settle();
check('and Flow opens the same tab in its other half — the domain really travels', () => {});
assert.equal(await ev(() => window.__ho.target()), 'typography:ctrl_label:flow');
assert.equal(await ev(() => window.__ho.activeTab()), 'Type');

// --- Effects ----------------------------------------------------------------------------------

await ev(() => window.__ho.clickByTitle('text effects in the Effects tab'));
await settle();
check('the text Effects section opens the Effects tab in its text domain', () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Effects');
assert.equal(await ev(() => window.__ho.target()), 'effects:ctrl_label:text');

// --- Library, which arms nothing ---------------------------------------------------------------

const beforeLibrary = await ev(() => window.__ho.target());
await ev(() => window.__ho.clickByTitle('Open the Library tab'));
await settle();
const afterLibrary = await ev(() => window.__ho.target());
check('the Library opener switches the tab and arms no control — it edits the library', () => {
  assert.equal(afterLibrary, beforeLibrary, `it armed: ${afterLibrary}`);
});
assert.equal(await ev(() => window.__ho.activeTab()), 'Library');

// A tab that IS armed from the selection may only do so when nothing at all is armed. Clearing the
// target and reopening a tab is the one case where that is right, and it is worth pinning both ways.
await ev(() => window.__ho.clearTarget());
await ev(() => window.__ho.clickByTitle('this pattern in the Designer tab'));
await settle();
check('and a tab opened onto an empty target still arms the control the button named', async () => {});
assert.equal(await ev(() => window.__ho.target()), 'designer:ctrl_seq:-');

// --- The request is consumed, not left lying around --------------------------------------------

check('the dock clears the tab request once it has acted on it', async () => {});
assert.equal(await ev(() => window.__ho.pendingRequest()), 'null');

// --- It must not fight the section header ------------------------------------------------------

const before = await ev(() => window.__ho.count());
await ev(() => window.__ho.clickByTitle('this pattern in the Designer tab'));
await settle();
const after = await ev(() => window.__ho.count());
check('clicking the button does not collapse the section it sits in', () => {
  assert.equal(after, before, 'an opener vanished, so its section collapsed under the click');
});

// --- The search index -----------------------------------------------------------------------

await ev(() => window.__ho.clearSearch());
await settle();
check('with no search there are no search results', async () => {});
assert.deepEqual(await ev(() => window.__ho.hitRows()), []);

await ev(() => window.__ho.search('x'));
await settle();
check('and a one-character search still has none — it would match half the index', async () => {});
assert.deepEqual(await ev(() => window.__ho.hitRows()), []);

await ev(() => window.__ho.search('glow'));
await settle();
const glowRows = await ev(() => window.__ho.hitRows());
const glowTabs = await ev(() => window.__ho.hitTabs());
check('searching for a property a tab owns says which tab, and what it matched', () => {
  assert.equal(glowRows.length, 1, `rows: ${glowRows.join(' | ')}`);
  assert.match(glowRows[0], /^Effects/);
  assert.match(glowRows[0], /Glow/);
  assert.deepEqual(glowTabs, ['effects']);
});

await ev(() => window.__ho.clearTarget());
await ev(() => window.__ho.clickHit('effects'));
await settle();
check('and the result opens that tab on the control the panel is showing', () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Effects');
assert.equal(await ev(() => window.__ho.target()), 'effects:ctrl_label:-');

await ev(() => window.__ho.search('nothingcalledthis'));
await settle();
check('a search that matches nothing offers nothing', async () => {});
assert.deepEqual(await ev(() => window.__ho.hitRows()), []);
await ev(() => window.__ho.clearSearch());
await settle();

// --- And the dock still works by hand -----------------------------------------------------------

await ev(() => window.__ho.clickDockTab('Colors'));
await settle();
check('the dock strip still switches tabs on its own', async () => {});
assert.equal(await ev(() => window.__ho.activeTab()), 'Colors');

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\ndock openers: all checks passed');
await browser.close();
server.close();
