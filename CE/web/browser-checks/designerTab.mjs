/**
 * The Designer tab, driven in Chromium. Run with the rest: `npm run test:browser`.
 *
 * What it checks, in order of how badly it would hurt:
 *   - clicking the grid writes a Step Sequencer pattern, which nothing else in the app can do
 *   - the picture is the component's OWN renderer, not a second grid drawn for the dock
 *   - a drag paints a run of cells, and the first cell decides on or off for the whole drag
 *   - the row tools (fill, shift, invert, clear) reach the control
 *   - a cell's velocity can be set — the renderer has always drawn it and nothing could write it
 *   - dragging an envelope node moves it; clicking empty space adds one where you clicked
 *   - drawing on the Turing bars writes the register, and the gate threshold is on screen
 *   - the registry is visible: a component with no designer says so and names what has one
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

await page.goto(`http://127.0.0.1:${server.address().port}/designerTab.html`);
await page.waitForFunction(() => window.__des && document.querySelector('.stage'));
await page.waitForTimeout(600);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(280);

// --- The Step Sequencer, which could not be drawn at all --------------------------------------

const startCells = await ev(() => window.__des.seqCells());
check('a Step Sequencer starts with an empty pattern — its shipping state', () => {
  assert.equal(startCells, 0);
});

const blank = await ev(() => window.__des.seqBlank());
check('and the tab says so rather than showing an empty box', () => {
  assert.match(blank, /Nothing in the application could do this before/);
});

await ev(() => window.__des.clickCell(0, 0));
await settle();
await ev(() => window.__des.clickCell(4, 0));
await settle();
const written = await ev(() => window.__des.seqPattern());
check('clicking the grid writes the pattern — the first surface in the app that can', () => {
  assert.deepEqual(written, ['t0:0@100', 't0:4@100']);
});

await ev(() => window.__des.clickCell(4, 0));
await settle();
check('and clicking a lit cell puts it out', async () => {});
assert.deepEqual(await ev(() => window.__des.seqPattern()), ['t0:0@100']);

await ev(() => window.__des.dragCells(1, 2, 5));
await settle();
const painted = await ev(() => window.__des.seqPattern());
check('a drag paints a run of cells on one track', () => {
  assert.deepEqual(painted.filter((k) => k.startsWith('t1')), ['t1:2@100', 't1:3@100', 't1:4@100', 't1:5@100']);
});

await ev(() => window.__des.dragCells(1, 2, 4));
await settle();
const erased = await ev(() => window.__des.seqPattern());
check('and a drag that starts on a lit cell erases instead of alternating under the pointer', () => {
  assert.deepEqual(erased.filter((k) => k.startsWith('t1')), ['t1:5@100']);
});

// --- The picture is the shipped renderer -------------------------------------------------------

const svgClasses = await ev(() => window.__des.rendererClass());
const rects = await ev(() => window.__des.stageRects());
check('the stage is the component\'s own renderer, not a second grid', () => {
  assert.ok(svgClasses.some((name) => String(name).split(/\s+/).includes('seq')),
    `stage svgs: ${svgClasses.join(', ')}`);
  assert.ok(rects >= 48, `a 16 × 3 grid should be at least 48 cells, drew ${rects}`);
});

// --- Row tools ---------------------------------------------------------------------------------

await ev(() => window.__des.pickTrack('Hat'));
await settle();
await ev(() => window.__des.tool('/4'));
await settle();
const four = await ev(() => window.__des.seqPattern());
check('four on the floor is one click', () => {
  assert.deepEqual(four.filter((k) => k.startsWith('t2')), ['t2:0@100', 't2:12@100', 't2:4@100', 't2:8@100'].sort());
});

await ev(() => window.__des.tool('off'));
await settle();
check('and the off-beat fill lands between them', async () => {});
assert.deepEqual(
  (await ev(() => window.__des.seqPattern())).filter((k) => k.startsWith('t2')),
  ['t2:10@100', 't2:14@100', 't2:2@100', 't2:6@100'].sort()
);

const counts = await ev(() => window.__des.trackCounts());
check('the track list counts what each row holds', () => {
  assert.deepEqual(counts, ['1', '1', '4']);
});

// --- Velocity, which the renderer drew and nothing could set ------------------------------------

await ev(() => window.__des.clickCell(9, 2));
await settle();
const hasBox = await ev(() => window.__des.velocityBox());
check('clicking a cell offers its velocity', () => {
  assert.ok(hasBox >= 1, 'no velocity box appeared');
});

await ev(() => window.__des.setVelocity(48));
await settle();
const withVel = await ev(() => window.__des.seqPattern());
check('and setting it reaches the pattern — the renderer has always drawn this', () => {
  assert.ok(withVel.includes('t2:9@48'), `pattern: ${withVel.join(', ')}`);
});

await ev(() => window.__des.wipe());
await settle();
check('clearing wipes the whole pattern and the button then has nothing to do', async () => {});
assert.equal(await ev(() => window.__des.seqCells()), 0);
assert.equal(await ev(() => window.__des.wipeDisabled()), true);

// --- The Envelope ------------------------------------------------------------------------------

await ev(() => window.__des.aim('Envelope'));
await settle();
await page.waitForTimeout(250);

const handles = await ev(() => window.__des.envHandles());
const before = await ev(() => window.__des.envPoints());
check('the envelope arrives as four nodes with handles on the real curve', () => {
  assert.equal(handles, 4, 'one handle per node');
  assert.deepEqual(before, ['0.00,0.00', '0.25,1.00', '0.50,0.60', '1.00,0.00']);
});

await ev(() => window.__des.dragEnvNode(2, 400, 60));
await settle();
const dragged = await ev(() => window.__des.envPoints());
check('dragging a node moves it, and the panel could only do this as two number boxes', () => {
  assert.notDeepEqual(dragged, before);
  assert.equal(dragged[0], '0.00,0.00', 'the start is pinned');
  assert.equal(dragged[3], '1.00,0.00', 'and so is the end');
  assert.ok(Number(dragged[2].split(',')[1]) > 0.6, `node 3 should have moved up: ${dragged[2]}`);
});

const countBefore = (await ev(() => window.__des.envPoints())).length;
await ev(() => window.__des.addEnvNode(250, 150));
await settle();
const countAfter = (await ev(() => window.__des.envPoints())).length;
check('clicking empty space adds a node where you clicked', () => {
  assert.equal(countAfter, countBefore + 1);
});

await ev(() => window.__des.pickNode(0));
await settle();
check('and the two end nodes refuse to be removed — an envelope needs a start and an end', async () => {});
assert.equal(await ev(() => window.__des.removeDisabled()), true);

await ev(() => window.__des.pickNode(1));
await settle();
await ev(() => window.__des.removeNode());
await settle();
check('while a middle node goes', async () => {});
assert.equal((await ev(() => window.__des.envPoints())).length, countAfter - 1);

await ev(() => window.__des.preset('ar'));
await settle();
const ar = await ev(() => window.__des.envPoints());
check('a preset replaces the whole shape, from the shipped preset table', () => {
  assert.deepEqual(ar, ['0.00,0.00', '0.45,1.00', '1.00,0.00']);
  assert.equal(ar.length, 3);
});

const envHeader = await ev(() => window.__des.envHeader());
check('and the header reads out the stages in the component\'s own unit', () => {
  assert.match(envHeader, /A \d+ms/);
  assert.match(envHeader, /S \d+%/);
});

// --- The Turing register -----------------------------------------------------------------------

await ev(() => window.__des.aim('Turing'));
await settle();
await page.waitForTimeout(250);

const startSteps = await ev(() => window.__des.turSteps());
check('the register arrives as the eight steps the component ships with', () => {
  assert.deepEqual(startSteps, [0.2, 0.8, 0.5, 1, 0.35, 0.65, 0.1, 0.9]);
});

await ev(() => window.__des.drawTuring(0, 0.9));
await settle();
const drawn = await ev(() => window.__des.turSteps());
check('drawing on a bar writes that step and leaves the rest alone', () => {
  assert.ok(drawn[0] > 0.8, `step 1 should have gone up: ${drawn[0]}`);
  assert.deepEqual(drawn.slice(1), startSteps.slice(1));
});

const lines = await ev(() => window.__des.turThresholdLine());
check('the gate threshold is drawn — the panel sets it as a number and shows it nowhere', () => {
  assert.equal(lines, 1);
});

await ev(() => window.__des.tool('flat'));
await settle();
const flat = await ev(() => window.__des.turSteps());
check('flatten reaches every step', () => {
  assert.deepEqual(flat, new Array(8).fill(0.5));
});

const gates = await ev(() => window.__des.turGates());
check('and the step list marks which ones fire the gate', () => {
  assert.equal(gates, 8, 'every step at 0.5 is exactly at the 0.5 threshold');
});

// --- The registry is visible ---------------------------------------------------------------

await ev(() => window.__des.aim('Phrase'));
await settle();
const pendingTitle = await ev(() => window.__des.emptyTitle());
const pendingBody = await ev(() => window.__des.emptyBody());
check('a component with no designer yet says so, and names what does have one', () => {
  assert.match(pendingTitle, /No designer for a Phrase Sequencer yet/);
  assert.match(pendingBody, /Step Sequencer/);
  assert.match(pendingBody, /rehearsal/, 'and says why preview is not the answer');
});

await ev(() => window.__des.aim('Knob'));
await settle();
check('and a component with nothing to draw says that instead', async () => {});
assert.match(await ev(() => window.__des.emptyTitle()), /has nothing to draw/);

await ev(() => window.__des.aim('StepSequencer'));
await settle();
const head = await ev(() => window.__des.head());
check('the header names the control and the designer it opened', () => {
  assert.match(head, /designing The StepSequencer/);
  assert.match(head, /Step Sequencer/);
});

const foot = await ev(() => window.__des.foot());
check('and the footer names what else on this panel is still waiting', () => {
  assert.match(foot, /Phrase Sequencer/);
});

// --- The rules -----------------------------------------------------------------------------

check('there is not one slider in the tab', async () => {});
assert.equal(await ev(() => window.__des.sliderCount()), 0);

check('and not one JSON box', async () => {});
assert.equal(await ev(() => window.__des.jsonBoxes()), 0);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\ndesigner tab: all checks passed');
await browser.close();
server.close();
