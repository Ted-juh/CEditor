/**
 * Panel animations, played by the real renderers in Chromium. Run with the rest: `npm run test:browser`.
 *
 * The unit tests (transitionSelection.test.js) pin which transition is chosen for each change. This
 * checks that the choice reaches the screen, in order of how badly it would hurt:
 *   - hovering and pressing a control play their own animations, with their own timings
 *   - a colour animation really fades the fill, through the layer that paints it
 *   - a knob's pointer glides to a value that arrives from outside, and tracks a drag 1:1
 *   - the operating system's reduced-motion setting and the preview's own switch stop all of it
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

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
const page = await browser.newPage({ viewport: { width: 600, height: 300 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) {
    failures.push(message.text());
  }
});

await page.goto(`http://127.0.0.1:${server.address().port}/panelMotion.html`);
await page.waitForFunction(() => window.__motion && document.querySelector('.canvas-control[data-control-id="knob"] svg'));
await page.waitForTimeout(500);

const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const set = (id, patch) => ev(([i, p]) => window.__motion.set(i, p), [id, patch]);
const transition = (id) => ev((i) => window.__motion.rootTransition(i), id);
const fill = () => ev(() => window.__motion.fill('btn'));
const rgb = (css) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
const between = (x, a, b) => x > Math.min(a, b) && x < Math.max(a, b);

// --- Hover and press: two animations on one property, each with its own timing ---------------

const rest = await transition('btn');
const restFill = await fill();
check('at rest nothing is transitioning', () => {
  assert.equal(rest.duration, '0s');
  assert.equal(rest.colourVar, 'none');
});

await set('btn', { hover: true });
await wait(100);
const hover = await transition('btn');
const midFill = await fill();
await wait(600);
const hoverFill = await fill();
check('hovering plays hoverIn: 400ms on the scale, and on the colour', () => {
  assert.match(hover.property, /^transform, translate, rotate, scale, background-color/);
  assert.ok(hover.duration.split(', ').every((d) => d === '0.4s'), hover.duration);
  assert.match(hover.colourVar, /background-color 400ms/);
});
check('and the fill really fades — 100ms in it is between the two colours', () => {
  // The layer that paints the fill reads the control's colour timing through an inherited custom
  // property. Before the overhaul there was no colour bucket and the fill snapped.
  assert.match(midFill.property, /^background-color/, 'the painting layer took the timing');
  assert.equal(midFill.duration.split(', ')[0], '0.4s');
  const [a, m, b] = [rgb(restFill.background), rgb(midFill.background), rgb(hoverFill.background)];
  assert.notDeepEqual(a, b, `the Hover state should change the fill: ${restFill.background}`);
  const channel = a.findIndex((value, i) => value !== b[i]);
  assert.ok(between(m[channel], a[channel], b[channel]), `rest ${a}, at 100ms ${m}, hover ${b}`);
});

await set('btn', { hover: true, pressed: true });
await wait(40);
const press = await transition('btn');
const fired = await ev(() => window.__motion.activity().btn?.names ?? []);
check('pressing plays pressIn: 80ms, and the colour (which pressIn does not name) snaps', () => {
  assert.ok(press.duration.split(', ').every((d) => d === '0.08s'), press.duration);
  assert.ok(!/background-color/.test(press.property), press.property);
  assert.equal(press.colourVar, 'none');
});
check('and the Animation tab is told which animation fired', () => {
  assert.deepEqual(fired, ['pressIn']);
});

await set('btn', { hover: true, pressed: false });
await wait(200);
const release = await transition('btn');
check('letting go plays pressIn backwards', () => {
  assert.ok(release.duration.split(', ').every((d) => d === '0.08s'), release.duration);
});

// --- The easings CSS has no name for -----------------------------------------------------------

await set('springy', { hover: true });
await wait(60);
await set('springy', { hover: true, pressed: true });
await wait(60);
const spring = await transition('springy');
await set('drawn', { hover: true });
await wait(60);
await set('drawn', { hover: true, pressed: true });
await wait(60);
const drawn = await transition('drawn');
check('a spring reaches the browser as CSS linear(), so it overshoots and settles', () => {
  // The browser writes the stops back with their positions: linear(0 0%, 0.1777 2.5%, …, 1 100%).
  assert.match(spring.timing, /^linear\(0( 0%)?, /, spring.timing.slice(0, 60));
  assert.match(spring.timing, /, 1( 100%)?\)/, 'and it lands');
  const peak = Math.max(...[...spring.timing.matchAll(/(\d+\.\d+) \d/g)].map((m) => Number(m[1])));
  assert.ok(peak > 1.1, `a spring overshoots: its highest stop is ${peak}`);
  assert.match(spring.duration, /^0\.5s/);
});
check('and a hand-drawn curve as its own cubic-bezier', () => {
  assert.match(drawn.timing, /^cubic-bezier\(0\.1, 0\.7, 0\.2, 1\.3\)/, drawn.timing);
});

// --- The knob: glide for a value from outside, none for a drag -------------------------------

const markup = () => ev(() => window.__motion.knobMarkup());
await set('knob', { valueOverrideEnabled: true, valueOverride: 0.1 });
await wait(900);
const low = await markup();
await set('knob', { valueOverrideEnabled: true, valueOverride: 0.9 });
await wait(150);
const gliding = await markup();
await wait(900);
const high = await markup();
check('a value from outside glides the pointer: mid-way it is neither where it was nor where it lands', () => {
  // The pointer is drawn with SVG attributes, which CSS cannot transition, so the default
  // pointerSlide did nothing at all before the glide was written.
  assert.notEqual(low, high);
  assert.notEqual(gliding, low, 'it should have left');
  assert.notEqual(gliding, high, 'and not yet arrived');
});

await set('knob', { valueOverrideEnabled: true, valueOverride: 0.9, hover: true, pressed: true, dragging: true });
await wait(300);
await set('knob', { valueOverrideEnabled: true, valueOverride: 0.3, hover: true, pressed: true, dragging: true });
await wait(40);
const dragNow = await markup();
await wait(900);
const dragLater = await markup();
check('a drag is drawn where the mouse is, at once — a glide behind the mouse is lag', () => {
  assert.equal(dragNow, dragLater);
});
await set('knob', { valueOverrideEnabled: true, valueOverride: 0.3, hover: false, pressed: false, dragging: false });
await wait(300);

// --- Reduced motion -----------------------------------------------------------------------------

await page.emulateMedia({ reducedMotion: 'reduce' });
await set('btn', { hover: false, pressed: false });
await wait(100);
await set('btn', { hover: true });
await wait(60);
const reducedHover = await transition('btn');
await set('knob', { valueOverrideEnabled: true, valueOverride: 0.8 });
await wait(40);
const reducedNow = await markup();
await wait(900);
const reducedLater = await markup();
check('with the operating system set to reduce motion, nothing transitions and nothing glides', () => {
  assert.equal(reducedHover.duration, '0s', JSON.stringify(reducedHover));
  assert.equal(reducedHover.colourVar, 'none');
  assert.equal(reducedNow, reducedLater);
});

await page.emulateMedia({ reducedMotion: 'no-preference' });
await set('btn', { hover: false, reducedMotion: true });
await wait(100);
await set('btn', { hover: true, reducedMotion: true });
await wait(60);
const switchedHover = await transition('btn');
check('and the preview\'s own Reduced motion switch does the same', () => {
  assert.equal(switchedHover.duration, '0s', JSON.stringify(switchedHover));
});

await set('btn', { hover: false, reducedMotion: false });
await wait(100);
await set('btn', { hover: true, reducedMotion: false });
await wait(60);
check('and with both off, hover animates again', async () => {});
assert.match((await transition('btn')).duration, /^0\.4s/);

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\npanel motion: all checks passed');
await browser.close();
server.close();
