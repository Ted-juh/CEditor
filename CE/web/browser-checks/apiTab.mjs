/**
 * The API tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - the whole contract is on screen at once, which the properties panel has never shown
 *   - a row a consumer will never see is marked ON THE ROW, and says which of the faults it is
 *   - the offered repair writes the channel AND clears the stale variable it replaces
 *   - package warnings sit on the row they name instead of in a list you match by reading
 *   - sorting a column really reorders the table
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
const page = await browser.newPage({ viewport: { width: 1320, height: 520 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${server.address().port}/apiTab.html`);
await page.waitForFunction(() => window.__api && document.querySelectorAll('.tr').length > 0);
await page.waitForTimeout(400);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(320);

// --- One table --------------------------------------------------------------------------------

assert.equal((await ev(() => window.__api.target())).controlId, 'ctrl_api_1');

const names = await ev(() => window.__api.names());
check('inputs, outputs and properties are one table, not three dropdowns', () => {
  assert.equal(names.length, 7, `rows: ${names.join(', ')}`);
  for (const wanted of ['gain', 'accentColour', 'ghost', 'muted', 'level', 'caption', 'bogus']) {
    assert.ok(names.includes(wanted), `missing ${wanted} — got ${names.join(', ')}`);
  }
});

const head = await ev(() => window.__api.head());
check('the header counts the contract by direction', () => {
  assert.match(head, /4 in/);
  assert.match(head, /1 out/);
  assert.match(head, /2 props/);
});

// --- The finding ------------------------------------------------------------------------------

const alarm = await ev(() => window.__api.alarm());
const bad = await ev(() => window.__api.badRows());
check('the rows a consumer will never see are marked, and counted', () => {
  // gain, muted (disabled), level and caption are fine. accentColour, ghost and bogus are not.
  assert.equal(bad.length, 3, `marked rows: ${bad.join(', ')}`);
  assert.match(alarm, /3 entries never reach a consumer/);
});

await ev(() => window.__api.select('bogus'));
await page.waitForTimeout(200);
const bogusIssue = await ev(() => window.__api.issueText());
check('a path that resolves on its first segment and nowhere after is called out', () => {
  assert.match(bogusIssue, /never reaches a consumer/);
  assert.match(bogusIssue, /does not resolve/);
  assert.match(bogusIssue, /nonsenseKey/);
});

await ev(() => window.__api.select('ghost'));
await page.waitForTimeout(200);
const ghostIssue = await ev(() => window.__api.issueText());
check('a channel that does not exist reads differently from a path that does not resolve', () => {
  assert.match(ghostIssue, /noSuchChannel/);
  assert.match(ghostIssue, /does not have/);
});

await ev(() => window.__api.select('muted'));
await page.waitForTimeout(200);
check('a withheld entry is not called broken — it is switched off on purpose', async () => {});
assert.equal(await ev(() => window.__api.hasIssue()), false);

// --- The repair -------------------------------------------------------------------------------

await ev(() => window.__api.select('accentColour'));
await page.waitForTimeout(250);
const variableIssue = await ev(() => window.__api.issueText());
const fixLabel = await ev(() => window.__api.fixLabel());
check('a variable target is called out, with the channel that would replace it', () => {
  assert.match(variableIssue, /variable "mainValue"/);
  assert.match(variableIssue, /nothing reads/);
  assert.match(fixLabel, /mainValue/);
});

const beforeFix = await ev(() => window.__api.entry('input', 'accentColour'));
await ev(() => window.__api.applyFix());
await page.waitForTimeout(300);
const afterFix = await ev(() => window.__api.entry('input', 'accentColour'));
const afterFixIssue = await ev(() => window.__api.hasIssue());
check('the repair writes the channel and clears the stale variable beside it', () => {
  assert.equal(beforeFix.variable, 'mainValue');
  assert.equal(afterFix.channel, 'mainValue');
  assert.equal(afterFix.variable, '', 'a stale spelling left in place is the next reader trusting it');
  assert.equal(afterFixIssue, false, 'and the banner clears');
});

const alarmAfter = await ev(() => window.__api.alarm());
check('and the count comes down', () => {
  assert.match(alarmAfter, /2 entries never reach a consumer/);
});

// --- Warnings on their row --------------------------------------------------------------------

await ev(() => window.__api.select('level'));
await page.waitForTimeout(250);
const warnings = await ev(() => window.__api.warnings());
check('a package warning sits on the row it names', () => {
  // The validator says: Published output "level" has no package default value. In the panel that
  // is a sentence in a list of eight, matched to its row by reading the quoted name.
  assert.ok(warnings.length >= 1, `warnings on level: ${warnings.join(' | ')}`);
  assert.ok(warnings.every((text) => text.includes('level')), `should all be about this row: ${warnings.join(' | ')}`);
});

await ev(() => window.__api.select('gain'));
await page.waitForTimeout(250);
check('and a row the validator has nothing to say about carries nothing', async () => {});
assert.deepEqual(await ev(() => window.__api.warnings()), []);

// --- Editing ----------------------------------------------------------------------------------

const labels = await ev(() => window.__api.settingLabels());
check('the settings column offers the entry, its target and what a consumer gets', () => {
  for (const wanted of ['Name', 'Label', 'Type', 'Publish', 'Channel', 'Min', 'Max', 'Default']) {
    assert.ok(labels.includes(wanted), `missing "${wanted}" — got ${labels.join(', ')}`);
  }
});

await ev(() => window.__api.setText('Label', 'Output Gain'));
await page.waitForTimeout(250);
check('editing a field writes through to the contract', async () => {});
assert.equal((await ev(() => window.__api.entry('input', 'gain'))).label, 'Output Gain');

await ev(() => window.__api.toggleRow('gain'));
await page.waitForTimeout(250);
check('the row dot publishes and withholds without leaving the table', async () => {});
assert.equal((await ev(() => window.__api.entry('input', 'gain'))).enabled, false);
await ev(() => window.__api.toggleRow('gain'));
await page.waitForTimeout(200);

// --- Sorting ----------------------------------------------------------------------------------

await ev(() => window.__api.sortBy('Name'));
await page.waitForTimeout(250);
const byName = await ev(() => window.__api.names());
check('sorting by name really reorders the table', () => {
  assert.deepEqual(byName, [...byName].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
});

await ev(() => window.__api.sortBy('Name'));
await page.waitForTimeout(250);
const byNameDesc = await ev(() => window.__api.names());
check('clicking the same column again reverses it', () => {
  assert.deepEqual(byNameDesc, [...byName].reverse());
});

await ev(() => window.__api.sortBy('Dir'));
await page.waitForTimeout(250);
const byDir = await ev(() => window.__api.names());
check('and sorting by direction groups inputs, then outputs, then properties', () => {
  assert.equal(byDir.indexOf('level') > byDir.indexOf('gain'), true);
  assert.equal(byDir.indexOf('caption') > byDir.indexOf('level'), true);
});

const kept = await ev(() => window.__api.selected());
check('sorting keeps the row you were editing selected', () => {
  assert.equal(kept, 'gain');
});

// --- The rule ---------------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__api.sliderCount()), 0);

// --- Making and unmaking an entry ---------------------------------------------------------------
// Adding and removing used to stay in the properties panel. It is a gap the moment the panel's rows
// come out, and unlike the panel's three Add functions a duplicate name is suffixed here rather
// than silently doing nothing.

const inputsBefore = await ev(() => window.__api.storedNames('inputs'));
await ev(() => window.__api.pickKind('input'));
await settle();
await ev(() => window.__api.typeName('bright'));
await settle();
await ev(() => window.__api.clickAdd());
await settle();
const inputsAfter = await ev(() => window.__api.storedNames('inputs'));
check('an entry can be added here — it used to need the properties panel', () => {
  assert.deepEqual(inputsAfter, [...inputsBefore, 'bright']);
});

await ev(() => window.__api.typeName('bright'));
await settle();
await ev(() => window.__api.clickAdd());
await settle();
check('and a duplicate name is suffixed rather than silently doing nothing', async () => {});
assert.deepEqual(await ev(() => window.__api.storedNames('inputs')), [...inputsBefore, 'bright', 'bright2']);

await ev(() => window.__api.pickKind('property'));
await settle();
await ev(() => window.__api.typeName('caption'));
await settle();
await ev(() => window.__api.clickAdd());
await settle();
check('a property lands in its own map, not with the inputs', async () => {});
assert.ok((await ev(() => window.__api.storedNames('editableProperties'))).includes('caption'));
assert.ok(!(await ev(() => window.__api.storedNames('inputs'))).includes('caption'));

await ev(() => window.__api.removeRow('bright2'));
await settle();
await ev(() => window.__api.removeRow('bright'));
await settle();
await ev(() => window.__api.removeRow('caption'));
await settle();
check('and removing takes them back off the contract', async () => {});
assert.deepEqual(await ev(() => window.__api.storedNames('inputs')), inputsBefore);
assert.ok(!(await ev(() => window.__api.storedNames('editableProperties'))).includes('caption'));

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\napi tab: all checks passed');
await browser.close();
server.close();
