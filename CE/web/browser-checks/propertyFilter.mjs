/**
 * The properties panel's search, driven in Chromium. Run with the rest.
 *
 * Every check here is on ONE bare section editor with nothing else on the page, because that is all
 * it took: a partial match used to kill the panel.
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
const check = (name) => console.log(`  ok  ${name}`);

/** A fresh page per query: a loop poisons the page, so reusing one would hide the next failure. */
async function withFilter(query) {
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/propertyFilter.html`);
  await page.waitForFunction(() => window.__f);
  await page.waitForTimeout(300);
  if (query !== null) await page.evaluate((value) => window.__f.search(value), query);
  await page.waitForTimeout(600);
  const state = {
    errors,
    cells: await page.evaluate(() => window.__f.cells()),
    shown: await page.evaluate(() => window.__f.shownCells()),
    sections: await page.evaluate(() => window.__f.sections()),
  };
  await page.close();
  return state;
}

// --- The bug ----------------------------------------------------------------------------------

// Typing "glow" passes through "g", "gl" and "glo". Every one of those is a partial match, and a
// partial match is what looped: some cells matching and some not is the case the counter churns on.
for (const query of ['x', 'gl', 't', 'to', 'mod']) {
  const state = await withFilter(query);
  assert.deepEqual(state.errors, [], `filtering on "${query}" threw: ${state.errors[0]}`);
}
check('a partial match does not blow the effect depth — every keystroke of a real search is one');

const whole = await withFilter('mode');
assert.deepEqual(whole.errors, []);
check('and neither does a whole word that matches nothing');

// --- What the counter is for -------------------------------------------------------------------

const unfiltered = await withFilter(null);
check('with no filter every section and every row is shown');
assert.equal(unfiltered.shown, unfiltered.cells);
assert.equal(unfiltered.sections.filter((s) => s.hidden).length, 0);

const partial = await withFilter('to');
check('a filter hides the rows that do not match');
assert.ok(partial.shown > 0 && partial.shown < partial.cells, `${partial.shown} of ${partial.cells} shown`);

check('and hides the header of any section left with nothing');
assert.ok(partial.sections.some((s) => s.hidden), 'no section hid');
assert.ok(partial.sections.some((s) => !s.hidden), 'every section hid');

const nothing = await withFilter('zzzznothing');
check('a filter that matches nothing at all hides every section');
assert.equal(nothing.shown, 0);
assert.equal(nothing.sections.filter((s) => s.hidden).length, nothing.sections.length);

console.log('\nproperty filter: all checks passed');
await browser.close();
server.close();
