/**
 * The Assets tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - a strip whose height does not divide by its frame count is CALLED OUT, and a clean one is not
 *   - the offered repair writes the count and both frame sizes, and the warning then clears
 *   - the frames drawn use the renderer's own proportional CSS, not tidied pixel offsets
 *   - an image whose recorded size no longer matches what is on disk says so
 *   - both kinds of asset appear in one library, and picking one changes the stage
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

await page.goto(`http://127.0.0.1:${server.address().port}/assetsTab.html`);
await page.waitForFunction(() => window.__as && document.querySelectorAll('.tile').length > 0);
await page.waitForTimeout(400);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);

// --- One library ------------------------------------------------------------------------------

assert.equal((await ev(() => window.__as.target())).controlId, 'ctrl_as_1');

const tiles = await ev(() => window.__as.tiles());
const kinds = await ev(() => window.__as.tileKinds());
check('images and filmstrips share one library, sorted by name', () => {
  assert.deepEqual(tiles, ['cleanStrip', 'driftStrip', 'knobFace']);
  assert.deepEqual(kinds, ['film', 'film', 'img']);
});

const tileInk = await ev(() => window.__as.tileInk());
check('every tile drew a picture', () => {
  assert.ok(tileInk.every((ink) => ink > 40), `tile backgrounds: ${tileInk.join(', ')}`);
});

const tilePositions = await ev(() => window.__as.tilePositions());
check('a filmstrip tile shows its first frame, not the whole smear', () => {
  assert.equal(tilePositions[0], '0% 0%');
  assert.equal(tilePositions[1], '0% 0%');
});

// --- The finding ------------------------------------------------------------------------------

await ev(() => window.__as.select('driftStrip'));
await page.waitForTimeout(250);

const driftCheck = await ev(() => window.__as.check());
const driftClass = await ev(() => window.__as.checkClass());
check('a strip that does not divide evenly is called out', () => {
  assert.ok(driftClass.includes('bad'), `check class: ${driftClass}`);
  assert.ok(/900 ÷ 128/.test(driftCheck), `check text: ${driftCheck}`);
  assert.ok(/7\.03/.test(driftCheck), `should show the fractional frame height: ${driftCheck}`);
});

const fixes = await ev(() => window.__as.fixes());
check('the nearest counts that do divide are offered', () => {
  assert.equal(fixes.length, 3, `offers: ${fixes.join(' | ')}`);
  assert.ok(/use 150/.test(fixes[0]), `first offer should be the smallest change: ${fixes[0]}`);
  assert.ok(/\(6px\)/.test(fixes[0]), `and should say what a frame becomes: ${fixes[0]}`);
});

// --- The frames drawn -------------------------------------------------------------------------

const sizes = await ev(() => window.__as.frameSizes());
const positions = await ev(() => window.__as.framePositions());
check('frames are positioned the way the renderer positions them', () => {
  assert.ok(sizes.length > 3, `only ${sizes.length} frames drawn`);
  assert.ok(sizes.every((size) => size === '100% 12800%'), `sizes: ${[...new Set(sizes)].join(', ')}`);
  // frame 0 of 128 → 0%; frame 1 → 1/127 of 100%. Proportional, exactly as InteractivePartRenderer
  // does it, which is why the strip above is wrong on screen and not merely wrong on paper.
  assert.equal(positions[0], '0% 0%');
  assert.ok(positions[1].startsWith('0% 0.78'), `second frame: ${positions[1]}`);
});

check('the stage opens on the first frame', async () => {});
assert.equal(await ev(() => window.__as.currentFrame()), 0);
assert.match(await ev(() => window.__as.readout()), /frame 1 of 128/);

await ev(() => window.__as.stepForward());
await page.waitForTimeout(120);
check('stepping moves one frame, with no slider anywhere in sight', async () => {});
assert.match(await ev(() => window.__as.readout()), /frame 2 of 128/);

await ev(() => window.__as.clickFrame(4));
await page.waitForTimeout(120);
const clicked = await ev(() => window.__as.readout());
check('the strip itself is a picker', () => {
  assert.ok(/frame (5|6) of 128/.test(clicked), `after clicking the fifth box: ${clicked}`);
});

// --- The repair -------------------------------------------------------------------------------

await ev(() => window.__as.applyFix(0));
await page.waitForTimeout(300);

const repaired = await ev(() => window.__as.strip('driftStrip'));
check('the offered repair writes the count, both frame sizes and the strip size', () => {
  assert.equal(repaired.frameCount, 150);
  assert.equal(repaired.frameHeight, 6, '900 / 150');
  assert.equal(repaired.frameWidth, 34);
  assert.equal(repaired.width, 34, 'the exporter reads width/height and nothing used to write them');
  assert.equal(repaired.height, 900);
});

const afterFix = await ev(() => window.__as.check());
const afterFixClass = await ev(() => window.__as.checkClass());
check('and the warning turns into a pass', () => {
  assert.ok(afterFixClass.includes('good'), `check class after the fix: ${afterFixClass}`);
  assert.ok(/900 ÷ 150 = 6px/.test(afterFix), `check text after the fix: ${afterFix}`);
});

// --- The clean strip --------------------------------------------------------------------------

await ev(() => window.__as.select('cleanStrip'));
await page.waitForTimeout(300);
const cleanCheck = await ev(() => window.__as.check());
const cleanClass = await ev(() => window.__as.checkClass());
check('a strip that does divide evenly is not nagged at', () => {
  assert.ok(cleanClass.includes('good'), `check class: ${cleanClass}`);
  assert.ok(/896 ÷ 128 = 7px/.test(cleanCheck), `check text: ${cleanCheck}`);
});

// --- The image half ---------------------------------------------------------------------------

await ev(() => window.__as.select('knobFace'));
await page.waitForTimeout(300);
const imageCheck = await ev(() => window.__as.check());
const imageClass = await ev(() => window.__as.checkClass());
check('an image whose recorded size no longer matches says so', () => {
  assert.ok(imageClass.includes('bad'), `stale size should warn: ${imageClass}`);
  assert.ok(/96×48 measured/.test(imageCheck), `check text: ${imageCheck}`);
  assert.ok(/64×64/.test(imageCheck), `should name what is recorded: ${imageCheck}`);
});

await ev(() => window.__as.applyFix(0));
await page.waitForTimeout(250);
check('recording the measured size writes both dimensions', async () => {});
assert.deepEqual(await ev(() => window.__as.image('knobFace')), { width: 96, height: 48 });

// --- Settings ---------------------------------------------------------------------------------

await ev(() => window.__as.select('cleanStrip'));
await page.waitForTimeout(250);

const labels = await ev(() => window.__as.settingLabels());
check('the settings column holds the asset fields and the packaging policy', () => {
  for (const wanted of ['Name', 'Source', 'Count', 'Axis', 'Frame W', 'Value', 'Interp', 'Embed', 'Embed assets']) {
    assert.ok(labels.includes(wanted), `missing "${wanted}" — got ${labels.join(', ')}`);
  }
});

await ev(() => window.__as.setSegment('Axis', 'Horizontal'));
await page.waitForTimeout(200);
check('a segmented choice writes through to the asset', async () => {});
assert.equal((await ev(() => window.__as.strip('cleanStrip'))).orientation, 'horizontal');
await ev(() => window.__as.setSegment('Axis', 'Vertical'));
await page.waitForTimeout(200);

await ev(() => window.__as.setSegment('Embed assets', 'No'));
await page.waitForTimeout(200);
check('the packaging policy is written on the section, not on an asset', async () => {});
assert.equal((await ev(() => window.__as.policy())).embedAssets, false);

// --- Bake -------------------------------------------------------------------------------------

await ev(() => window.__as.openBake());
await page.waitForTimeout(200);
check('the bake form opens in the settings column with a live size estimate', async () => {});
assert.equal(await ev(() => window.__as.bakeVisible()), true);
assert.match(await ev(() => window.__as.bakeEstimate()), /\d+×\d+/);
await ev(() => window.__as.openBake());
await page.waitForTimeout(150);

// --- Removal ----------------------------------------------------------------------------------

await ev(() => window.__as.select('driftStrip'));
await page.waitForTimeout(200);
await ev(() => window.__as.removeSelected());
await page.waitForTimeout(250);
const remaining = await ev(() => window.__as.names());
const healed = await ev(() => window.__as.selected());
check('removing an asset takes it out of the component and the library heals', () => {
  assert.deepEqual(remaining.filmstrips, ['cleanStrip']);
  assert.equal(healed, 'cleanStrip');
});

// --- The rule ---------------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__as.sliderCount()), 0);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\nassets tab: all checks passed');
await browser.close();
server.close();
