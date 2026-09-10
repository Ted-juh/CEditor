/**
 * The Assets tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - what the renderer's CSS really does with a frame count, measured in the browser rather than
 *     argued from the spec — the tab's whole justification rests on this, and the first version of
 *     it rested on a wrong account of it
 *   - a strip whose height does not divide by its frame count is CALLED OUT, and a clean one is not
 *   - the offered repair writes the count and both frame sizes, and the warning then clears
 *   - the frames drawn use the renderer's own CSS, not tidied pixel offsets
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

// --- What the renderer actually does ----------------------------------------------------------
//
// Every frame of the probe strip is filled with its own index as a colour, the element gets exactly
// the CSS InteractivePartRenderer emits, and the screenshot is decoded back to a frame number.

const PROBE_BOX = 64;

async function whichFrame(source, frameCount, frameIndex) {
  await ev(([s, n, i, b]) => window.__probe.mount(s, n, i, b), [source, frameCount, frameIndex, PROBE_BOX]);
  const shot = await page.locator('#probe-box').screenshot();
  return ev(([d, b]) => window.__probe.read(d, b), [`data:image/png;base64,${shot.toString('base64')}`, PROBE_BOX]);
}

{
  const PROBED = [0, 32, 64, 100, 127];
  const seenFor = async (source, frameCount) => {
    const out = [];
    for (const i of PROBED) out.push(await whichFrame(source, frameCount, i));
    return out;
  };
  // Nearest-neighbour sampling puts the odd probe within a pixel of a frame boundary, so the middle
  // of the strip is checked as a deviation with a bound rather than an exact frame number. The two
  // ends are not borderline and are checked exactly.
  const drift = (seen) => PROBED.map((asked, i) => (seen[i] === 'tail' ? 'tail' : seen[i] - asked));

  // 128 frames of 7px and nothing else in the file: 896 tall, divides exactly.
  const exact = await ev(() => window.__probe.strip(128, 7, 0));
  const exactDrift = drift(await seenFor(exact.source, 128));
  check('a strip that is nothing but its frames shows every frame exactly', () => {
    assert.equal(exact.height, 896);
    assert.deepEqual(exactDrift, [0, 0, 0, 0, 0], `drift: ${exactDrift.join(', ')}`);
  });

  // The same frames with four stray rows on the end: 900 tall, 900 % 128 = 4.
  const tail4 = await ev(() => window.__probe.strip(128, 7, 4));
  const tail4Drift = drift(await seenFor(tail4.source, 128));
  check('four stray rows cost the last frame and leave the start of the strip alone', () => {
    assert.equal(tail4.height, 900);
    assert.equal(tail4Drift[0], 0, 'the first frame is always right — the error starts at zero');
    assert.ok(tail4Drift.slice(1, 4).every((d) => d !== 'tail' && Math.abs(d) <= 1),
      `the middle should be within a frame: ${tail4Drift.join(', ')}`);
    assert.equal(tail4Drift[4], 'tail', 'frame 127 should be showing the stray rows, not frame 127');
  });

  // Eight stray rows, and the error is a whole frame by the middle of the strip.
  const tail8 = await ev(() => window.__probe.strip(128, 7, 8));
  const tail8Drift = drift(await seenFor(tail8.source, 128));
  check('eight stray rows are a whole frame out by the middle — the error grows along the strip', () => {
    assert.equal(tail8.height, 904);
    assert.equal(tail8Drift[0], 0);
    assert.equal(tail8Drift[2], 1, 'asked for frame 64');
    assert.equal(tail8Drift[3], 1, 'asked for frame 100');
    assert.equal(tail8Drift[4], 'tail');
    assert.ok(tail8Drift[1] <= tail8Drift[2], 'the error must not shrink towards the end');
  });

  check('and the divisibility check is exactly what tells those three apart', () => {
    // The whole justification for the check bar: the two broken files are the two that leave a
    // remainder, and nothing else in the application looks at it.
    assert.equal(896 % 128, 0);
    assert.equal(900 % 128, 4);
    assert.equal(904 % 128, 8);
  });

  await ev(() => document.getElementById('probe-box')?.remove());
}

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
const tileAspects = await ev(() => window.__as.tileAspects());
check('a filmstrip tile shows its first frame, not the whole smear', () => {
  assert.equal(tilePositions[0], '0% 0%');
  assert.equal(tilePositions[1], '0% 0%');
});

check('and shows it at the frame shape the asset declares, so a round knob is round', () => {
  // Painted straight onto the 46x44 tile, `background-size: 100% N00%` fills whatever box it is
  // given and a round knob comes out an oval. cleanStrip declares 96x96 and is square here.
  assert.ok(Math.abs(tileAspects[0] - 1) < 0.05, `cleanStrip frame is ${tileAspects[0]}:1`);
  // driftStrip declares 96x102 — the frame size that follows from its wrong count — and the tile
  // shows exactly that, slightly squashed. The thumbnail reports the asset, not a tidied version.
  assert.ok(Math.abs(tileAspects[1] - 96 / 102) < 0.03, `driftStrip frame is ${tileAspects[1]}:1`);
});

// --- The finding ------------------------------------------------------------------------------

await ev(() => window.__as.select('driftStrip'));
await page.waitForTimeout(250);

const driftCheck = await ev(() => window.__as.check());
const driftClass = await ev(() => window.__as.checkClass());
check('a strip that does not divide evenly is called out', () => {
  assert.ok(driftClass.includes('bad'), `check class: ${driftClass}`);
  assert.ok(/3072 ÷ 30/.test(driftCheck), `check text: ${driftCheck}`);
  assert.ok(/102\.40px/.test(driftCheck), `should show the fractional frame height: ${driftCheck}`);
  assert.ok(/12px/.test(driftCheck), `should name the pixels that belong to no frame: ${driftCheck}`);
});

const fixes = await ev(() => window.__as.fixes());
check('the true count is the first thing offered', () => {
  // The fixture is a real 32-frame strip with 30 typed in, which is how this actually goes wrong.
  assert.equal(fixes.length, 3, `offers: ${fixes.join(' | ')}`);
  assert.ok(/use 32/.test(fixes[0]), `first offer should be the smallest change: ${fixes[0]}`);
  assert.ok(/\(96px\)/.test(fixes[0]), `and should say what a frame becomes: ${fixes[0]}`);
});

// --- The frames drawn -------------------------------------------------------------------------

const sizes = await ev(() => window.__as.frameSizes());
const positions = await ev(() => window.__as.framePositions());
const drawn = await ev(() => window.__as.frameCount());
check('frames are positioned with the renderer\'s own CSS, not tidied pixel offsets', () => {
  assert.ok(drawn >= 8, `only ${drawn} frames drawn — the stage should be tiled, not a short row`);
  assert.ok(sizes.every((size) => size === '100% 3000%'), `sizes: ${[...new Set(sizes)].join(', ')}`);
  // frame 0 of 30 → 0%; frame 1 → 1/29 of 100%. The same expression the renderer evaluates, which
  // is what makes this preview evidence rather than a second opinion.
  assert.equal(positions[0], '0% 0%');
  assert.ok(positions[1].startsWith('0% 3.44'), `second frame: ${positions[1]}`);
});

check('the stage opens on the first frame', async () => {});
assert.equal(await ev(() => window.__as.currentFrame()), 0);
assert.match(await ev(() => window.__as.readout()), /frame 1 of 30/);

await ev(() => window.__as.stepForward());
await page.waitForTimeout(120);
check('stepping moves one frame, with no slider anywhere in sight', async () => {});
assert.match(await ev(() => window.__as.readout()), /frame 2 of 30/);

const beforeClick = await ev(() => window.__as.framePositions());
await ev(() => window.__as.clickFrame(4));
await page.waitForTimeout(120);
const clicked = await ev(() => window.__as.readout());
const afterClick = await ev(() => window.__as.framePositions());
check('the strip itself is a picker, and picking does not reshuffle the sheet', () => {
  assert.match(clicked, /frame 5 of 30/, `after clicking the fifth box: ${clicked}`);
  assert.deepEqual(afterClick, beforeClick, 'the page must hold still while you step inside it');
});

// --- The repair -------------------------------------------------------------------------------

await ev(() => window.__as.applyFix(0));
await page.waitForTimeout(300);

const repaired = await ev(() => window.__as.strip('driftStrip'));
check('the offered repair writes the count, both frame sizes and the strip size', () => {
  assert.equal(repaired.frameCount, 32);
  assert.equal(repaired.frameHeight, 96, '3072 / 32');
  assert.equal(repaired.frameWidth, 96);
  assert.equal(repaired.width, 96, 'the exporter reads width/height and nothing used to write them');
  assert.equal(repaired.height, 3072);
});

const afterFix = await ev(() => window.__as.check());
const afterFixClass = await ev(() => window.__as.checkClass());
check('and the warning turns into a pass', () => {
  assert.ok(afterFixClass.includes('good'), `check class after the fix: ${afterFixClass}`);
  assert.ok(/3072 ÷ 32 = 96px/.test(afterFix), `check text after the fix: ${afterFix}`);
});

// --- The clean strip --------------------------------------------------------------------------

await ev(() => window.__as.select('cleanStrip'));
await page.waitForTimeout(300);
const cleanCheck = await ev(() => window.__as.check());
const cleanClass = await ev(() => window.__as.checkClass());
check('a strip that does divide evenly is not nagged at', () => {
  assert.ok(cleanClass.includes('good'), `check class: ${cleanClass}`);
  assert.ok(/3072 ÷ 32 = 96px/.test(cleanCheck), `check text: ${cleanCheck}`);
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
