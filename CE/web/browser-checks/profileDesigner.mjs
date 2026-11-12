/**
 * The Device Profile Designer, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 *   - a profile generated from its maker's document (arturia-microfreak) opens the DPD model
 *     converted from it: its label in the title, its parameters on the Parameters screen, the CC
 *     each is sent on — fetched as a chunk of its own, not bundled with the editor
 *   - a 14-bit pair and an NRPN profile open the same way (moog-sub-37, sequential-prophet-6), every
 *     parameter counted as addressed: an NRPN wire is an address as much as a CC
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
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
]) {
  await check(`${profile}: opens its converted DPD model`, async () => {
    const { page, errors, requested } = await open(profile);
    await page.waitForFunction(() => !/No profile/.test(document.querySelector('.crumb')?.textContent ?? 'No profile'), null, { timeout: 15000 });
    const crumb = await page.textContent('.crumb');
    if (label) assert.match(crumb, new RegExp(label), 'its label in the title');
    const text = await page.textContent('.dpd-app');
    if (param) assert.match(text, new RegExp(param), `${param} on the Parameters screen`);
    if (wire) assert.match(text.replace(/\s+/g, ' '), new RegExp(wire.replace(' ', '\\s*')), `${param} sent on ${wire}`);
    assert.ok(requested.some((u) => /\/assets\/.+\.js/.test(u) && !/profileDesigner/.test(u)), 'the model arrives as a chunk of its own');
    // Every parameter has a write wire the Designer counts (CC, CC pair, NRPN): none "needs a write address".
    const [, clean, all] = /(\d+) of (\d+)\s*round-trip cleanly/.exec(text.replace(/\s+/g, ' ')) ?? [];
    assert.ok(all && clean === all, `${clean} of ${all} round-trip cleanly`);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

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
