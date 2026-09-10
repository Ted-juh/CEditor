/**
 * The Animation tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - a target that animates nothing is marked on screen, and says which kind of nothing
 *   - removing a target writes the control, instead of asking you to hand-edit JSON
 *   - every easing is drawn as a real curve, and picking one writes it
 *   - the tab warns you about a dead property BEFORE you add it
 *   - the counts in the header and the list agree with the control
 *   - there is no slider and no JSON box in the tab
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

await page.goto(`http://127.0.0.1:${server.address().port}/animationTab.html`);
await page.waitForFunction(() => window.__anim && document.querySelectorAll('.trow').length > 0);
await page.waitForTimeout(500);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(320);

// --- The dead targets, which is why the tab exists --------------------------------------------

const verdicts = await ev(() => window.__anim.targetVerdicts());
const dead = await ev(() => window.__anim.deadRows());
check('a target that animates nothing says so on the row', () => {
  assert.equal(verdicts.length, 4, `rows: ${verdicts.join(' | ')}`);
  assert.equal(dead.length, 2, `marked dead: ${dead.join(' | ')}`);
  assert.equal(verdicts.filter((v) => /does nothing/.test(v)).length, 2, verdicts.join(' | '));
});

check('and the two dead ones are the colour target and the missing part', () => {
  assert.ok(dead.some((row) => /Background\.Fill\.colour/.test(row)), dead.join(' | '));
  assert.ok(dead.some((row) => /nosuchpart/.test(row)), dead.join(' | '));
});

const working = verdicts.filter((v) => !/does nothing/.test(v));
check('and a target that works names what it animates', () => {
  assert.deepEqual(working.sort(), ['opacity', 'transform']);
});

const alarm = await ev(() => window.__anim.alarm());
check('the header counts the dead targets across every animation', () => {
  assert.match(alarm, /2 targets do nothing/);
});

// --- Editing the target list, which is a JSON box in the panel --------------------------------

const before = await ev(() => window.__anim.storedTargets('pressMotion'));
await ev(() => window.__anim.removeTarget(1));
await page.waitForTimeout(350);
const after = await ev(() => window.__anim.storedTargets('pressMotion'));
const rowsNow = await ev(() => window.__anim.targetCount());
check('removing a target writes the control — no JSON editing', () => {
  assert.equal(before.length, 4);
  assert.equal(after.length, 3, `left: ${after.join(', ')}`);
  assert.ok(!after.some((path) => /Background\.Fill\.colour/.test(path)), after.join(', '));
  assert.equal(rowsNow, 3, 'and the list redrew');
});

const alarmAfter = await ev(() => window.__anim.alarm());
check('and the dead count follows it down', () => {
  assert.match(alarmAfter, /1 target does nothing/);
});

// --- The easing curves ------------------------------------------------------------------------

const easings = await ev(() => window.__anim.easingNames());
const curves = await ev(() => window.__anim.easingCurves());
check('every easing is drawn, and there are five of them — the panel offers four', () => {
  assert.equal(easings.length, 5, `offered: ${easings.join(', ')}`);
  assert.ok(easings.includes('inQuad'), `the panel never offers inQuad: ${easings.join(', ')}`);
  assert.equal(curves, 5, 'each one should have drawn a curve');
});

const linear = await ev(() => window.__anim.easingPathData('linear'));
const outCubic = await ev(() => window.__anim.easingPathData('outCubic'));
check('and the curves really differ — they are not five copies of one picture', () => {
  assert.equal(linear.length, 1);
  assert.notEqual(linear[0], outCubic[0], 'linear and outCubic drew the same path');
});

await ev(() => window.__anim.pickEasing('inQuad'));
await page.waitForTimeout(300);
check('picking a curve writes it to the control', async () => {});
assert.equal(await ev(() => window.__anim.storedEasing('pressMotion')), 'inQuad');
assert.equal(await ev(() => window.__anim.activeEasing()), 'inQuad');

// --- Adding a change, with the warning before the click ---------------------------------------

await ev(() => window.__anim.chooseChange('Fill colour'));
await page.waitForTimeout(300);
const warning = await ev(() => window.__anim.addWarning());
check('the tab warns about a dead property before you add it, not after', () => {
  assert.match(warning, /Fill colour does nothing/i, `warning: ${warning}`);
  assert.match(warning, /does not animate/i, `warning: ${warning}`);
});

await ev(() => window.__anim.chooseChange('Width'));
await page.waitForTimeout(300);
const noWarning = await ev(() => window.__anim.addWarning());
check('and it says nothing about a property that works', () => {
  assert.equal(noWarning, '', `unexpected warning: ${noWarning}`);
});

const countBefore = await ev(() => window.__anim.storedTargets('pressMotion'));
await ev(() => window.__anim.add());
await page.waitForTimeout(350);
const countAfter = await ev(() => window.__anim.storedTargets('pressMotion'));
check('adding writes a target the runtime accepts', () => {
  assert.equal(countAfter.length, countBefore.length + 1);
  assert.match(countAfter.at(-1), /Layout\.width$/);
});

// --- The animation list -----------------------------------------------------------------------

const names = await ev(() => window.__anim.animationNames());
check('both animations are listed, not one at a time in a dropdown', () => {
  assert.deepEqual(names, ['pressMotion', 'hoverGlow']);
});

const meta = await ev(() => window.__anim.animationMeta());
check('and each row says how long it runs', () => {
  assert.match(meta[0], /^90ms/);
  assert.match(meta[1], /^140ms/);
});

await ev(() => window.__anim.toggleAnimation('hoverGlow'));
await page.waitForTimeout(300);
check('the dot switches one animation on without opening it', async () => {});
assert.equal(await ev(() => window.__anim.storedEnabled('hoverGlow')), true);

await ev(() => window.__anim.selectAnimation('hoverGlow'));
await page.waitForTimeout(350);
const rootTargets = await ev(() => window.__anim.targetVerdicts());
check('selecting the other animation shows its own targets', () => {
  assert.deepEqual(rootTargets, ['opacity'], `rows: ${rootTargets.join(' | ')}`);
});

// --- Making and unmaking an animation ----------------------------------------------------------

const namesBefore = await ev(() => window.__anim.storedNames());
await ev(() => window.__anim.typeNewName('fadeOut'));
await settle();
await ev(() => window.__anim.clickAdd());
await settle();
check('an animation can be created here — it used to need the properties panel', () => {
  assert.deepEqual(namesBefore, ['pressMotion', 'hoverGlow']);
});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'fadeOut']);
assert.deepEqual(await ev(() => window.__anim.animationNames()), ['pressMotion', 'hoverGlow', 'fadeOut']);

await ev(() => window.__anim.typeNewName('fadeOut'));
await settle();
await ev(() => window.__anim.clickAdd());
await settle();
check('and a duplicate name is suffixed rather than silently doing nothing', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'fadeOut', 'fadeOut2']);

check('the Add button is dead until something is typed', async () => {});
assert.equal(await ev(() => window.__anim.addDisabled()), true);

await ev(() => window.__anim.beginRename('fadeOut2'));
await settle();
await ev(() => window.__anim.typeRename('fadeOut'));
await settle();
const clash = await ev(() => window.__anim.renameError());
check('a rename onto a name in use says so instead of losing one', () => {
  assert.match(clash, /already an animation called fadeOut/);
});

await ev(() => window.__anim.typeRename('fadeSlow'));
await settle();
await ev(() => window.__anim.clickRename());
await settle();
check('and a rename that works moves the animation, keeping what was in it', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'fadeOut', 'fadeSlow']);

await ev(() => window.__anim.removeAnimation('fadeSlow'));
await settle();
await ev(() => window.__anim.removeAnimation('fadeOut'));
await settle();
check('and deleting takes them back off', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow']);

// --- The rules --------------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__anim.sliderCount()), 0);

check('and not one JSON box either — that is the thing this tab replaces', async () => {});
assert.equal(await ev(() => window.__anim.jsonBoxes()), 0);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\nanimation tab: all checks passed');
await browser.close();
server.close();
