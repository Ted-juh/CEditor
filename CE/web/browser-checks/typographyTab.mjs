/**
 * The Typography tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - a flow mode shows its own parameters and NOT the other modes'
 *   - dragging a bezier point writes the same property a number field would have
 *   - every family row, weight cell and mode thumbnail actually drew
 *   - one decoration editor really does serve all three lines
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

await page.goto(`http://127.0.0.1:${server.address().port}/typographyTab.html`);
await page.waitForFunction(() => window.__ty && document.querySelectorAll('.fam').length > 0);
await page.waitForTimeout(350);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn) => page.evaluate(fn);

// --- Type half ------------------------------------------------------------------------------------

check('the tab opens on Type, armed on the seeded control', async () => {});
assert.equal(await ev(() => window.__ty.half()), 'Type');
assert.equal((await ev(() => window.__ty.target())).controlId, 'ctrl_ty_1');

const families = await ev(() => window.__ty.families());
check('families are listed', () => assert.ok(families.length >= 3, `families: ${families.join(', ')}`));

const faces = await ev(() => window.__ty.familyFaces());
check('each family row is set in its own face, not one shared face', () => {
  assert.equal(faces.length, families.length);
  assert.ok(new Set(faces).size > 1, `every row rendered in the same face: ${faces[0]}`);
});

const weights = await ev(() => window.__ty.weights());
const weightInk = await ev(() => window.__ty.weightInk());
check('the weight ramp drew a specimen per weight', () => {
  assert.ok(weights.length >= 2, `weights: ${weights.join(', ')}`);
  assert.ok(weightInk.every((ink) => ink > 40), `weight ink: ${weightInk.join(', ')}`);
});

const beforeWeight = await ev(() => window.__ty.weight());
await ev(() => window.__ty.pickWeight(400));
await page.waitForTimeout(150);
check('picking a weight writes it through', async () => {});
assert.equal(beforeWeight, 700);
assert.equal(await ev(() => window.__ty.weight()), 400);

check('the specimen drew', async () => {});
assert.ok(await ev(() => window.__ty.specimenInk()) > 200);

// --- one decoration editor --------------------------------------------------------------------

const labelsUnder = await ev(() => window.__ty.settingLabels());
check('the settings column offers one decoration editor, not three blocks', () => {
  const lineRows = labelsUnder.filter((l) => l === 'Line').length;
  assert.equal(lineRows, 1, 'exactly one "which line" picker');
  assert.ok(labelsUnder.includes('Thickness'), `labels: ${labelsUnder.join(', ')}`);
  // Three separate blocks would mean three of each of these.
  assert.equal(labelsUnder.filter((l) => l === 'Thickness').length, 1);
  assert.equal(labelsUnder.filter((l) => l === 'Inset L').length, 1);
});

await ev(() => window.__ty.setDecorationKind('Over'));
await page.waitForTimeout(200);
const overLabels = await ev(() => window.__ty.settingLabels());
check('switching to a line that is off offers its switch rather than dead fields', () => {
  // The seed turns underline on and leaves overline off. Showing overline's seven fields while it
  // is switched off would be the same fault the Flow half exists to fix, so they are not there.
  assert.ok(overLabels.includes('Show'), `labels: ${overLabels.join(', ')}`);
  assert.equal(overLabels.filter((l) => l === 'Thickness').length, 0);
});

await ev(() => {
  const row = [...document.querySelectorAll('.setbox .r')]
    .find((r) => r.querySelector('.rl')?.textContent?.trim() === 'Show');
  [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'On')?.click();
});
await page.waitForTimeout(200);
const overOn = await ev(() => window.__ty.settingLabels());
check('switching it on brings up ONE set of fields, not a third block', () => {
  assert.equal(overOn.filter((l) => l === 'Thickness').length, 1, `labels: ${overOn.join(', ')}`);
  assert.equal(overOn.filter((l) => l === 'Inset L').length, 1);
  assert.equal(overOn.filter((l) => l === 'Line').length, 1, 'still one picker');
});

const fontKeys = await ev(() => window.__ty.fontKeys());
check('and it wrote the overline property, not the underline one', () => {
  assert.ok(fontKeys.includes('overline') && fontKeys.includes('underline'));
});

// --- Flow half --------------------------------------------------------------------------------

await ev(() => window.__ty.setHalf('flow'));
await page.waitForTimeout(400);

const modes = await ev(() => window.__ty.modes());
check('all thirteen modes are offered', () => assert.equal(modes.length, 13, modes.join(', ')));

const modeInk = await ev(() => window.__ty.modeInk());
check('every mode drew a thumbnail of itself', () => {
  const empty = modeInk.map((ink, i) => (ink > 40 ? null : modes[i])).filter(Boolean);
  assert.deepEqual(empty, [], `these modes rendered nothing: ${empty.join(', ')}`);
});

await ev(() => window.__ty.pickMode('Circle'));
await page.waitForTimeout(250);
const circleParams = await ev(() => window.__ty.paramLabels());
check('circle shows its own parameters and none of the other modes\'', () => {
  assert.ok(circleParams.includes('Radius'), `params: ${circleParams.join(', ')}`);
  assert.ok(circleParams.includes('Angle'));
  for (const dead of ['Amplitude', 'Frequency', 'Turns', 'Unit', 'Inset']) {
    assert.ok(!circleParams.includes(dead), `${dead} belongs to another mode and should not be shown`);
  }
});
check('and it says how much it is holding back', async () => {});
assert.match(await ev(() => window.__ty.paramCount()), /8 of 26/);
assert.match(await ev(() => window.__ty.hiddenNote()), /18/);

await ev(() => window.__ty.pickMode('Wave'));
await page.waitForTimeout(250);
const waveParams = await ev(() => window.__ty.paramLabels());
check('switching to wave swaps the parameters over', () => {
  assert.ok(waveParams.includes('Amplitude'));
  assert.ok(waveParams.includes('Frequency'));
  assert.ok(!waveParams.includes('Radius'), 'radius is not a wave parameter');
});

// --- the shape modes ---------------------------------------------------------------------------

await ev(() => window.__ty.pickMode('Bezier'));
await page.waitForTimeout(300);
check('bezier offers four draggable points and a shelf of curves', async () => {});
assert.equal(await ev(() => window.__ty.handles()), 4);
const presets = await ev(() => window.__ty.presets());
assert.ok(presets.includes('Arch'), `presets: ${presets.join(', ')}`);

const beforeDrag = await ev(() => window.__ty.bezier());
await ev(() => window.__ty.dragHandle(1, 70, 20));
await page.waitForTimeout(250);
const afterDrag = await ev(() => window.__ty.bezier());
check('dragging a control point writes the property a number field would have', () => {
  assert.notEqual(afterDrag.c1x, beforeDrag.c1x, 'flowPathC1X changed');
  assert.ok(Math.abs(afterDrag.c1x - 70) < 6, `landed at ${afterDrag.c1x}, expected near 70`);
  assert.ok(Math.abs(afterDrag.c1y - 20) < 6, `landed at ${afterDrag.c1y}, expected near 20`);
  assert.equal(afterDrag.startX, beforeDrag.startX, 'and left the other points alone');
});

await ev(() => window.__ty.applyPreset('Arch'));
await page.waitForTimeout(200);
check('a preset replaces the whole curve', () => {});
const arched = await ev(() => window.__ty.bezier());
assert.equal(arched.c1x, 30);
assert.equal(arched.c1y, 5);

await ev(() => window.__ty.pickMode('Polyline'));
await page.waitForTimeout(300);
const beforeAdd = await ev(() => window.__ty.polyline());
await ev(() => window.__ty.addPoint());
await page.waitForTimeout(200);
const afterAdd = await ev(() => window.__ty.polyline());
check('a polyline can gain a point', () => {
  assert.equal(afterAdd.length, beforeAdd.length + 1, `${beforeAdd.length} → ${afterAdd.length}`);
});

// --- the rule ------------------------------------------------------------------------------------

check('there is not a single slider in the tab', async () => {});
assert.equal(await ev(() => window.__ty.sliderCount()), 0);

await page.evaluate(() => window.__ty.setHalf('type'));
await page.waitForTimeout(300);
await page.screenshot({ path: join(ROOT, 'typography-tab-type.png') });
await page.evaluate(() => window.__ty.setHalf('flow'));
await page.waitForTimeout(400);
await page.screenshot({ path: join(ROOT, 'typography-tab-flow.png') });

await browser.close();
server.close();

if (failures.length) {
  console.error('\npage errors:');
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log('\ntypography tab: all checks passed');
