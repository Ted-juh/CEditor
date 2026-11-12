/**
 * The Device Profile Designer, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 *   - a profile generated from its maker's document (arturia-microfreak) opens as the DPD model
 *     converted from it when its source arrives (the page hands it over as the engine would): its
 *     label in the title, its parameters on the Parameters screen, the CC each is sent on
 *   - a 14-bit pair and an NRPN profile open the same way (moog-sub-37, sequential-prophet-6), every
 *     parameter counted as addressed: an NRPN wire is an address as much as a CC
 *   - the Parameters screen draws only the rows in view (a FANTOM's 7,710), scrolls to the last, and
 *     finds parameters by search; a row standing for a scope's instances says how many (JD-Xi ×37)
 *   - a hand-made DPD profile (roland-gaia-dpd) still opens from the bundled library
 *   - a profile with no model opens empty and says so, without an error
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
// The engine profiles, served where the page asks for them (./profiles/<id>.ceditor-device.json).
const PROFILES = join(dirname(fileURLToPath(import.meta.url)), '../../profiles/test');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const body = await readFile(path.startsWith('/profiles/') ? join(PROFILES, path.slice('/profiles/'.length)) : join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(req.url.split('?')[0])] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, resolve));

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
const base = `http://127.0.0.1:${server.address().port}/profileDesigner.html`;

async function open(profile) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  const requested = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404 \(Not Found\)/i.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => requested.push(r.url()));
  await page.goto(`${base}?profile=${encodeURIComponent(profile)}`);
  await page.waitForFunction(() => window.__designerMounted === true);
  return { page, errors, requested };
}

async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); } catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

for (const [profile, label, param, wire] of [
  ['arturia-microfreak', 'Arturia MicroFreak', 'Spice', 'CC 2'],
  ['moog-sub-37', null, null, null],
  ['sequential-prophet-6', null, null, null],
  ['waldorf-blofeld', 'Waldorf Blofeld', null, null],
  ['roland-jd-xi', null, null, null],
]) {
  await check(`${profile}: opens its converted DPD model`, async () => {
    const { page, errors } = await open(profile);
    await page.waitForFunction(() => !/No profile/.test(document.querySelector('.crumb')?.textContent ?? 'No profile'), null, { timeout: 15000 });
    const crumb = await page.textContent('.crumb');
    if (label) assert.match(crumb, new RegExp(label), 'its label in the title');
    // Only the rows in view are drawn: search for the parameter, as a person would.
    if (param) { await page.fill('.screen.active .psearch', param); await page.waitForTimeout(100); }
    const text = await page.textContent('.dpd-app');
    if (param) assert.match(text, new RegExp(param), `${param} on the Parameters screen`);
    if (wire) assert.match(text.replace(/\s+/g, ' '), new RegExp(wire.replace(' ', '\\s*')), `${param} sent on ${wire}`);
    // Every parameter has a write wire the Designer counts (CC, CC pair, NRPN): none "needs a write address".
    const [, clean, all] = /(\d+) of (\d+)\s*round-trip cleanly/.exec(text.replace(/\s+/g, ' ')) ?? [];
    assert.ok(all && clean === all, `${clean} of ${all} round-trip cleanly`);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

// Profiles that read a dump back: the Bulk dumps screen shows their layouts, without an error, even a
// KRONOS's (1,662 fields of 2,862 parameters, bit fields carried for the engine) and a Yamaha's
// collection. Its rows once each held a <select> of every parameter, which hung the designer; and a
// KRONOS drum kit's dump (20,352 fields, 43,921 bytes) is drawn a part at a time.
for (const [profile, dumps] of [['waldorf-blofeld', 1], ['korg-kronos', 1], ['yamaha-reface-dx', 2], ['korg-kronos-drum-kit', 1]]) {
  await check(`${profile}: its dumps on the Bulk dumps screen`, async () => {
    const { page, errors } = await open(profile);
    await page.waitForFunction(() => !/No profile/.test(document.querySelector('.crumb')?.textContent ?? 'No profile'), null, { timeout: 20000 });
    const summary = await page.textContent('.dpd-app');
    const [, count] = /(\d+)\s*dumps?/.exec(summary.replace(/\s+/g, ' ')) ?? [];
    assert.ok(Number(count) >= dumps, `${count} dumps listed`);
    // On the Bulk dumps screen itself: the first dump's layout, a row a field.
    await page.locator('.tnode', { hasText: 'Bulk dumps' }).click();
    await page.waitForSelector('.screen.active .dlrow', { timeout: 30000 });
    assert.ok(await page.locator('.screen.active .dlrow').count() >= 1, 'its layout rows');
    assert.deepEqual(errors, []);
    await page.close();
  });
}

const shown = (page, timeout) => page.waitForFunction(() => !/No profile/.test(document.querySelector('.crumb')?.textContent ?? 'No profile'), null, { timeout });

await check('roland-fantom: 7,710 parameters, only the rows in view drawn, and the last reached by scrolling', async () => {
  const { page, errors } = await open('roland-fantom');
  await shown(page, 30000);
  await page.waitForSelector('.screen.active tr.prow');
  const total = Number(/Search (\d+) parameters/.exec(await page.getAttribute('.screen.active .psearch', 'placeholder'))?.[1]);
  assert.ok(total > 7000, `${total} parameters`);
  const drawn = await page.locator('.screen.active tr.prow').count();
  assert.ok(drawn > 5 && drawn < 120, `${drawn} rows drawn of ${total}`);
  // Every row one height, so the scroller is as tall as all of them.
  const { scrollHeight, rowHeight } = await page.$eval('.screen.active .vlist', (el) => ({ scrollHeight: el.scrollHeight, rowHeight: el.querySelector('tr.prow').getBoundingClientRect().height }));
  assert.ok(Math.abs(scrollHeight - total * rowHeight) < rowHeight * 4, `scroller ${scrollHeight}px for ${total} rows of ${rowHeight}px`);
  await page.$eval('.screen.active .vlist', (el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('.screen.active tr.prow:last-of-type ~ tr.vspace'));
  const after = await page.$eval('.screen.active .vlist tbody', (tb) => {
    const rows = [...tb.querySelectorAll('tr.prow')];
    return { drawn: rows.length, nextIsAddRow: rows.at(-1)?.nextElementSibling?.classList.contains('emptyrow') };
  });
  assert.ok(after.drawn < 120 && after.nextIsAddRow, `at the end: ${JSON.stringify(after)}`);
  assert.deepEqual(errors, []);
  await page.close();
});

await check('roland-jd-xi: search finds a drum key\'s parameters, a row standing for its 37 keys', async () => {
  const { page, errors } = await open('roland-jd-xi');
  await shown(page, 20000);
  await page.fill('.screen.active .psearch', 'drums partial name');
  await page.waitForFunction(() => /\d+ of \d+/.test(document.querySelector('.screen.active .pcount')?.textContent ?? ''));
  const [, found, all] = /(\d+) of (\d+)/.exec(await page.textContent('.screen.active .pcount'));
  assert.ok(Number(found) >= 1 && Number(found) < Number(all), `${found} of ${all}`);
  const tags = await page.locator('.screen.active tr.prow .inst').allTextContents();
  assert.ok(tags.includes('×37'), `instance tags: ${tags.join(', ')}`);
  await page.fill('.screen.active .psearch', 'no parameter is called this');
  await page.waitForSelector('.screen.active tr.vnone');
  assert.deepEqual(errors, []);
  await page.close();
});

await check('roland-gaia-dpd: a hand-made DPD profile opens from the bundled library', async () => {
  const { page, errors } = await open('roland-gaia-dpd');
  await page.waitForFunction(() => !/No profile/.test(document.querySelector('.crumb')?.textContent ?? 'No profile'), null, { timeout: 15000 });
  assert.match(await page.textContent('.crumb'), /GAIA/);
  assert.deepEqual(errors, []);
  await page.close();
});

await check('a profile with no model opens empty, without an error', async () => {
  const { page, errors } = await open('no-such-profile');
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  await page.close();
});

await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nprofileDesigner: all checks passed');
