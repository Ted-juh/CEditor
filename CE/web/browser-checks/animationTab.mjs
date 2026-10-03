/**
 * The Animation tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - a target that animates nothing is marked on screen, and says which kind of nothing
 *   - two animations tying for one property are marked as a clash, and the loser says it loses
 *   - a trigger naming a state the control does not have is marked, and one click removes it
 *   - From/To are chips of the control's own states; Leaving and Origin write the trigger
 *   - removing a target writes the control, instead of asking you to hand-edit JSON
 *   - every easing is drawn as a real curve, and picking one writes it
 *   - the counts in the header and the list agree with the control
 *   - a rename is one undo step
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
  assert.equal(verdicts.length, 5, `rows: ${verdicts.join(' | ')}`);
  assert.equal(dead.length, 2, `marked dead: ${dead.join(' | ')}`);
  assert.equal(verdicts.filter((v) => /does nothing/.test(v)).length, 2, verdicts.join(' | '));
});

check('and the two dead ones are the missing part and the text path', () => {
  assert.ok(dead.some((row) => /Text\.content/.test(row)), dead.join(' | '));
  assert.ok(dead.some((row) => /nosuchpart/.test(row)), dead.join(' | '));
});

const working = verdicts.filter((v) => !/does nothing/.test(v));
check('and a target that works names what it animates — colour among them now', () => {
  // The fill colour target was this check's first dead one; the runtime animates colour now.
  assert.deepEqual(working.sort(), ['colour', 'opacity', 'transform']);
});

const notes = await ev(() => window.__anim.targetNotes());
check('and a colour target says what a fade cannot do', () => {
  assert.equal(notes.length, 1, notes.join(' | '));
  assert.match(notes[0], /gradient, an image or a material switches/);
});

const alarm = await ev(() => window.__anim.alarm());
check('the header counts the dead targets across every animation', () => {
  assert.match(alarm, /2 targets do nothing/);
});

// --- Editing the target list, which is a JSON box in the panel --------------------------------

const before = await ev(() => window.__anim.storedTargets('pressMotion'));
await ev(() => window.__anim.removeTarget(4));
await page.waitForTimeout(350);
const after = await ev(() => window.__anim.storedTargets('pressMotion'));
const rowsNow = await ev(() => window.__anim.targetCount());
check('removing a target writes the control — no JSON editing', () => {
  assert.equal(before.length, 5);
  assert.equal(after.length, 4, `left: ${after.join(', ')}`);
  assert.ok(!after.some((path) => /Text\.content/.test(path)), after.join(', '));
  assert.equal(rowsNow, 4, 'and the list redrew');
});

const alarmAfter = await ev(() => window.__anim.alarm());
check('and the dead count follows it down', () => {
  assert.match(alarmAfter, /1 target does nothing/);
});

// --- The easing curves ------------------------------------------------------------------------

const easings = await ev(() => window.__anim.easingNames());
const curves = await ev(() => window.__anim.easingCurves());
check('every easing is drawn, and there are ten of them — the panel offers four', () => {
  assert.equal(easings.length, 10, `offered: ${easings.join(', ')}`);
  assert.ok(easings.includes('inQuad'), `the panel never offers inQuad: ${easings.join(', ')}`);
  assert.ok(easings.includes('outBack'), `the overshooting curves are drawn too: ${easings.join(', ')}`);
  assert.equal(curves, 10, 'each one should have drawn a curve');
});

const linear = await ev(() => window.__anim.easingPathData('linear'));
const outCubic = await ev(() => window.__anim.easingPathData('outCubic'));
check('and the curves really differ — they are not ten copies of one picture', () => {
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
check('Fill colour, which this tab used to warn about before you added it, no longer warns', () => {
  // It was the reason the warning existed: the runtime had no colour bucket. It has one now.
  assert.equal(warning, '', `warning: ${warning}`);
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
check('every animation is listed, not one at a time in a dropdown', () => {
  assert.deepEqual(names, ['pressMotion', 'hoverGlow', 'pressEcho']);
});

const meta = await ev(() => window.__anim.animationMeta());
check('and each row says how long it runs', () => {
  assert.match(meta[0], /^90ms/);
  assert.match(meta[1], /^140ms/);
  assert.match(meta[2], /^60ms/);
});

// --- Clashes and unknown states, which triggers being real made possible ----------------------

const clashAlarm = await ev(() => window.__anim.clashAlarm());
const unknownAlarm = await ev(() => window.__anim.unknownAlarm());
const pressMarkers = await ev(() => window.__anim.rowMarkers('pressMotion'));
const echoMarkers = await ev(() => window.__anim.rowMarkers('pressEcho'));
const clashNotes = await ev(() => window.__anim.clashWarnings());
check('two animations tying for one part\'s scale on a press are a clash, and the earlier one loses', () => {
  assert.match(clashAlarm, /^1 clash$/);
  assert.ok(pressMarkers.includes('clash'), `pressMotion markers: ${pressMarkers.join(', ')}`);
  assert.ok(!echoMarkers.includes('clash'), 'the winner is not marked as losing');
  assert.equal(clashNotes.length, 1, clashNotes.join(' | '));
  assert.match(clashNotes[0], /Never plays on .* transform: pressEcho is later in the list and both answer pressed/);
});
check('a state the control does not have is counted in the header and marked on its row', () => {
  assert.match(unknownAlarm, /^1 unknown state$/);
  assert.ok(echoMarkers.includes('unknown'), `pressEcho markers: ${echoMarkers.join(', ')}`);
});

const toChips = await ev(() => window.__anim.chips('To'));
const fromChips = await ev(() => window.__anim.chips('From'));
check('From and To are chips of the control\'s own states, plus any and default', () => {
  assert.deepEqual(fromChips, ['any*', 'default', 'hover', 'pressed']);
  assert.deepEqual(toChips, ['any', 'default', 'hover', 'pressed*']);
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

// --- The stage: the control, live, with Play ----------------------------------------------------

check('the stage draws the armed control with the real renderer', async () => {});
assert.equal(await ev(() => window.__anim.stageControls()), 1);
check('and Play says what it will do', async () => {});
assert.match(await ev(() => window.__anim.playTitle()), /Play hoverGlow: default → hover → default again/);

await ev(() => window.__anim.clickPlay());
await page.waitForTimeout(450);
const playingLabel = await ev(() => window.__anim.stepLabel());
const playingTransition = await ev(() => window.__anim.stageTransition());
check('Play performs the trigger: the stage hovers, and hoverGlow\'s 140ms is on the control', () => {
  assert.equal(playingLabel, 'hover');
  assert.match(playingTransition.property, /opacity/);
  assert.ok(playingTransition.duration.split(', ').every((d) => d === '0.14s'), playingTransition.duration);
});
const lit = await ev(() => window.__anim.lamps());
check('and the lamp beside it lights as it fires', () => {
  assert.deepEqual(lit, ['hoverGlow']);
});
await page.waitForTimeout(1300);
check('and when it is done the stage is back where it started', async () => {});
assert.equal(await ev(() => window.__anim.stepLabel()), '');

await ev(() => window.__anim.toggleSlow());
await settle();
await ev(() => window.__anim.clickPlay());
await page.waitForTimeout(450);
const slowTransition = await ev(() => window.__anim.stageTransition());
check('Slow plays it at a quarter speed on the stage', () => {
  assert.ok(slowTransition.duration.split(', ').every((d) => d === '0.56s'), slowTransition.duration);
});
await ev(() => window.__anim.clickPlay());
await ev(() => window.__anim.toggleSlow());
await settle();

await ev(() => window.__anim.selectAnimation('pressEcho'));
await settle();
const echoTo = await ev(() => window.__anim.chips('To'));
const echoWarning = await ev(() => window.__anim.unknownWarning());
check('a misspelt state is shown as typed, marked, and explained', () => {
  assert.deepEqual(echoTo, ['any', 'default', 'hover', 'pressed*', 'presed*!']);
  assert.match(echoWarning, /“presed” is not a state of Big Knob/);
  assert.match(echoWarning, /\(hover, pressed\)/, 'and it lists the states there are');
});

await ev(() => window.__anim.clickChip('To', 'presed'));
await settle();
check('one click on it removes it', async () => {});
assert.deepEqual((await ev(() => window.__anim.storedTrigger('pressEcho'))).to, ['pressed']);
assert.equal(await ev(() => window.__anim.unknownAlarm()), '', 'and the header stops counting it');

await ev(() => window.__anim.clickChip('To', 'hover'));
await settle();
await ev(() => window.__anim.clickChip('To', 'pressed'));
await settle();
check('moving pressEcho to hover ends the clash', async () => {});
assert.deepEqual((await ev(() => window.__anim.storedTrigger('pressEcho'))).to, ['hover']);
assert.equal(await ev(() => window.__anim.clashAlarm()), '');
assert.ok(!(await ev(() => window.__anim.rowMarkers('pressMotion'))).includes('clash'));

await ev(() => window.__anim.clickChip('To', 'any'));
await settle();
check('choosing any clears the named states', async () => {});
assert.deepEqual((await ev(() => window.__anim.storedTrigger('pressEcho'))).to, ['*']);

await ev(() => window.__anim.clickSegment('Also when leaving', 'Snap back'));
await settle();
check('"Snap back" switches the reverse play off', async () => {});
assert.equal((await ev(() => window.__anim.storedTrigger('pressEcho'))).reverse, false);

await ev(() => window.__anim.clickSegment('Trigger', 'Value'));
await settle();
await ev(() => window.__anim.clickSegment('Origin', 'Outside'));
await settle();
check('a value trigger offers Origin, and Outside writes external', async () => {});
assert.equal((await ev(() => window.__anim.storedTrigger('pressEcho'))).type, 'valueChange');
assert.equal((await ev(() => window.__anim.storedTrigger('pressEcho'))).origin, 'external');
check('and Play says plainly when it cannot sweep a value', async () => {});
assert.equal(await ev(() => window.__anim.playDisabled()), true);
assert.match(await ev(() => window.__anim.stageWhy()), /cannot set this control's value/);

// --- Making and unmaking an animation ----------------------------------------------------------

const namesBefore = await ev(() => window.__anim.storedNames());
await ev(() => window.__anim.typeNewName('fadeOut'));
await settle();
await ev(() => window.__anim.clickAdd());
await settle();
check('an animation can be created here — it used to need the properties panel', () => {
  assert.deepEqual(namesBefore, ['pressMotion', 'hoverGlow', 'pressEcho']);
});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut']);
assert.deepEqual(await ev(() => window.__anim.animationNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut']);

await ev(() => window.__anim.typeNewName('fadeOut'));
await settle();
await ev(() => window.__anim.clickAdd());
await settle();
check('and a duplicate name is suffixed rather than silently doing nothing', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut', 'fadeOut2']);

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
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut', 'fadeSlow']);

// A rename is two writes (new key, drop old key). One undo has to take back both, or Ctrl+Z leaves
// the animation under both names, or under neither.
await ev(() => window.__anim.undo());
await settle();
check('one undo takes a rename back whole', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut', 'fadeOut2']);
await ev(() => window.__anim.beginRename('fadeOut2'));
await settle();
await ev(() => window.__anim.typeRename('fadeSlow'));
await settle();
await ev(() => window.__anim.clickRename());
await settle();
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut', 'fadeSlow']);

await ev(() => window.__anim.beginRename('fadeSlow'));
await settle();
await ev(() => window.__anim.typeRename('fade.slower'));
await settle();
await ev(() => window.__anim.clickRename());
await settle();
check('rename sanitizes path punctuation instead of nesting and deleting the animation', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho', 'fadeOut', 'fadeslower']);

await ev(() => window.__anim.removeAnimation('fadeslower'));
await settle();
await ev(() => window.__anim.removeAnimation('fadeOut'));
await settle();
check('and deleting takes them back off', async () => {});
assert.deepEqual(await ev(() => window.__anim.storedNames()), ['pressMotion', 'hoverGlow', 'pressEcho']);

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
