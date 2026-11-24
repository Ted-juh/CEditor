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

// --- Keyframes ------------------------------------------------------------------------------------

const pulse = await ev(() => window.__motion.keyframes('pulser'));
await wait(500);
const pulseLater = await ev(() => window.__motion.keyframes('pulser'));
check('an always-on pulse plays as a CSS animation, and composes with the control\'s own turn', () => {
  assert.match(pulse.name, /^ce-kf-[0-9a-z]+-a$/, pulse.name);
  assert.notEqual(pulse.scale, pulseLater.scale, `the scale moves: ${pulse.scale} then ${pulseLater.scale}`);
  assert.notEqual(pulseLater.scale, 'none');
  // The control's 20° lives in `transform`; the pulse writes `scale`, so the turn is untouched.
  assert.equal(pulse.transform, pulseLater.transform);
  assert.match(pulse.transform, /^matrix\(/, `still turned: ${pulse.transform}`);
});

check('a beat animation waits for the transport', async () => {});
assert.equal((await ev(() => window.__motion.keyframes('beater'))).name, 'none');
await ev(() => window.__motion.startTransport(240));
await wait(700);
const onBeat = await ev(() => window.__motion.keyframes('beater'));
const beatFired = await ev(() => window.__motion.activity().beater?.names ?? []);
await ev(() => window.__motion.stopTransport());
check('and flashes on the beat once it runs', () => {
  assert.match(onBeat.name, /^ce-kf-[0-9a-z]+-[ab]$/, onBeat.name);
  assert.deepEqual(beatFired, ['flash']);
});

const played = await ev(() => window.__motion.scriptPlay('beater', 'wink'));
await wait(80);
const winking = await ev(() => window.__motion.keyframes('beater'));
check('a script\'s ce.anim.play starts a keyframe animation on the control', () => {
  assert.equal(played, true);
  assert.match(winking.name, /ce-kf-[0-9a-z]+-a/, winking.name);
});

// --- Colour frames --------------------------------------------------------------------------------

const glowA = await ev(() => window.__motion.colours('glow'));
await wait(450);
const glowB = await ev(() => window.__motion.colours('glow'));
check('a colour frame repaints the control\'s fill and its label, not just the element that moves', () => {
  // The fill is painted by .control-content and the label by its own span, each with an inline
  // colour; a keyframe on the control could not reach either.
  assert.match(glowA.fillAnimation, /^ce-kf-paint-[0-9a-z]+-a$/, JSON.stringify(glowA));
  assert.match(glowA.textAnimation, /^ce-kf-text-[0-9a-z]+-a$/, JSON.stringify(glowA));
  assert.notEqual(glowA.fill, glowB.fill, `the fill moves: ${glowA.fill} then ${glowB.fill}`);
  assert.notEqual(glowA.text, glowB.text, `and the label: ${glowA.text} then ${glowB.text}`);
});

const lampPart = await ev(() => window.__motion.partPaint('lamp', 'lamp'));
await wait(450);
const lampLater = await ev(() => window.__motion.partPaint('lamp', 'lamp'));
const caption = await ev(() => window.__motion.partPaint('lamp', 'caption'));
check('on a part, it paints that part and leaves the control\'s other parts alone', () => {
  assert.ok(lampPart?.layers.some((layer) => /ce-kf-paint-/.test(layer.animation)), JSON.stringify(lampPart));
  const paintOf = (part) => part.layers.find((layer) => /ce-kf-paint-/.test(layer.animation)).background;
  assert.notEqual(paintOf(lampPart), paintOf(lampLater), `the lamp moves: ${paintOf(lampPart)} then ${paintOf(lampLater)}`);
  assert.equal(caption.channel, 'none', 'the caption is told there is nothing to paint');
  assert.deepEqual(caption.layers.filter((layer) => /ce-kf-/.test(layer.animation)), []);
});

const pointerA = await ev(() => window.__motion.shapePaint('tinted'));
await wait(450);
const pointerB = await ev(() => window.__motion.shapePaint('tinted'));
check('a knob\'s drawn pointer takes the colour in the property it paints with', () => {
  assert.ok(pointerA.length > 0, 'no pointer shape is playing a colour channel');
  const paint = (shapes) => shapes.map((shape) => (/stroke/.test(shape.animation) ? shape.stroke : shape.fill)).join(' ');
  assert.notEqual(paint(pointerA), paint(pointerB), `it moves: ${paint(pointerA)} then ${paint(pointerB)}`);
});

// --- A state that swaps which part is visible (phase-5 item K) ----------------------------------

const pageTwoAtRest = await ev(() => window.__motion.part('tabs', 'pageTwo'));
check('a page a state can fade in is there while hidden: invisible, transparent, not gone', () => {
  assert.ok(pageTwoAtRest, 'pageTwo is not in the DOM at all, so it would pop in');
  assert.equal(pageTwoAtRest.visibility, 'hidden');
  assert.equal(pageTwoAtRest.opacity, 0);
});
await ev(() => window.__motion.setTab('two'));
await wait(300);
const midOne = await ev(() => window.__motion.part('tabs', 'pageOne'));
const midTwo = await ev(() => window.__motion.part('tabs', 'pageTwo'));
await wait(900);
const endOne = await ev(() => window.__motion.part('tabs', 'pageOne'));
const endTwo = await ev(() => window.__motion.part('tabs', 'pageTwo'));
check('switching tabs cross-fades the pages instead of popping them', () => {
  assert.match(midTwo.transition, /opacity, visibility/, midTwo.transition);
  assert.ok(midTwo.opacity > 0 && midTwo.opacity < 1, `page two 300ms into an 800ms fade: ${midTwo.opacity}`);
  assert.ok(midOne.opacity > 0 && midOne.opacity < 1, `page one on its way out: ${midOne.opacity}`);
  assert.equal(midOne.visibility, 'visible', 'the page going away stays visible for the whole fade');
  assert.equal(endTwo.opacity, 1);
  assert.equal(endOne.visibility, 'hidden');
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
const reducedPulse = await ev(() => window.__motion.keyframes('pulser'));
check('with the operating system set to reduce motion, nothing transitions, glides or pulses', () => {
  assert.equal(reducedHover.duration, '0s', JSON.stringify(reducedHover));
  assert.equal(reducedHover.colourVar, 'none');
  assert.equal(reducedNow, reducedLater);
  assert.equal(reducedPulse.name, 'none');
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

// --- Gestures: the States tab's Events row, played by a real mouse ------------------------------
// Each gesture is pointed at the control as a person would (utils/gestureEvents.js recognises it on
// the preview surface) and must start exactly its own animation, which the fired lamps record.

const clickerBox = await page.locator('.canvas-control[data-control-id="clicker"]').boundingBox();
const cx = clickerBox.x + clickerBox.width / 2;
const cy = clickerBox.y + clickerBox.height / 2;
const firedOn = async (id) => (await ev(() => window.__motion.activity()))[id] ?? { names: [], seq: 0 };
async function gestureFires(label, act) {
  const before = (await firedOn('clicker')).seq;
  await act();
  await wait(120);
  const after = await firedOn('clicker');
  return { names: after.seq !== before ? after.names : [], playing: (await ev(() => window.__motion.keyframes('clicker'))).name };
}

const clicked = await gestureFires('click', () => page.mouse.click(cx, cy));
check('a click plays the click animation, and only that one', () => {
  assert.deepEqual(clicked.names, ['bump'], JSON.stringify(clicked));
  assert.match(clicked.playing, /ce-kf-/, clicked.playing);
});
await wait(1000);

const held = await gestureFires('long press', async () => {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await wait(650);
});
await page.mouse.up();
check('holding still for half a second plays the long-press animation before the button is let go', () => {
  assert.deepEqual(held.names, ['hold'], JSON.stringify(held));
});
await wait(1000);

const flung = await gestureFires('flick', async () => {
  await page.mouse.move(cx, cy + 10);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 10, { steps: 2 });
  await page.mouse.move(cx, cy - 40, { steps: 2 });
  await page.mouse.up();
});
check('a fast release upwards plays the upward flick; it is not a click', () => {
  assert.deepEqual(flung.names, ['fling'], JSON.stringify(flung));
});
await wait(1000);

const wheeled = await gestureFires('wheel', async () => {
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -120);
});
check('turning the wheel up plays the wheel-up animation', () => {
  assert.deepEqual(wheeled.names, ['spin'], JSON.stringify(wheeled));
});
const wheeledDown = await gestureFires('wheel down', () => page.mouse.wheel(0, 120));
check('and turning it down plays nothing: no animation answers it', () => {
  assert.deepEqual(wheeledDown.names, [], JSON.stringify(wheeledDown));
});

// --- The Text engine: real words, a piece at a time ------------------------------------------------

const playedText = await ev(() => window.__motion.scriptPlay('caption', 'typeIn'));
await wait(120);
const typing = await ev(() => window.__motion.words('caption'));
check('a script plays a typewriter on a Label: its words become ten letters, each animated', () => {
  assert.equal(playedText, true);
  assert.equal(typing.text, 'Typewriter');
  assert.equal(typing.pieces, 10, JSON.stringify(typing));
  assert.ok(typing.animations.length && typing.animations.every((name) => /^ce-tx-/.test(name)), JSON.stringify(typing));
});

const resting = await ev(() => window.__motion.words('knobName'));
check('the name Label shows the knob\'s name at rest, as plain words', () => {
  assert.equal(resting.text, 'knob', JSON.stringify(resting));
  assert.equal(resting.ghostText, '');
});
await set('knob', { pressed: true, dragging: true });
await wait(100);
const pressed = await ev(() => window.__motion.words('knobName'));
check('pressing the knob swaps in its value, pushed in, while the name leaves on a ghost of itself', () => {
  assert.notEqual(pressed.text, 'knob', JSON.stringify(pressed));
  assert.ok(pressed.animations.some((name) => /^ce-tx-/.test(name)), JSON.stringify(pressed));
  assert.equal(pressed.ghostText, 'knob', JSON.stringify(pressed));
  assert.ok(pressed.ghostAnimations.some((name) => /^ce-tx-/.test(name)), JSON.stringify(pressed));
});
await wait(900);
const settled = await ev(() => window.__motion.words('knobName'));
check('and the ghost is gone once its effect has run', () => {
  assert.equal(settled.ghostText, '', JSON.stringify(settled));
});
await set('knob', { pressed: false, dragging: false });
await wait(100);
const released = await ev(() => window.__motion.words('knobName'));
check('letting go brings the name back, typed in letter by letter, the value leaving on its ghost', () => {
  assert.equal(released.text, 'knob', JSON.stringify(released));
  assert.equal(released.pieces, 4, JSON.stringify(released));
  assert.equal(released.ghostText, pressed.text, JSON.stringify(released));
});

// --- Pattern and Paint: a gradient that eases, one that spins, and a wave -----------------------

const restingChrome = await ev(() => window.__motion.gradient('chrome'));
check('a gradient fill is written to ease: its angle is a registered property the gradient reads', () => {
  assert.ok(restingChrome, 'the chrome button paints a gradient');
  assert.equal(restingChrome.angle, '90deg', JSON.stringify(restingChrome));
  assert.match(restingChrome.image, /^linear-gradient\(90deg, /, JSON.stringify(restingChrome));
});
await set('chrome', { hover: true });
await wait(450);
const midChrome = await ev(() => window.__motion.gradient('chrome'));
check('on hover it turns and recolours over a second instead of jumping: mid-way it is between', () => {
  const angle = parseFloat(midChrome.angle);
  assert.ok(angle > 120 && angle < 240, JSON.stringify(midChrome));
  assert.doesNotMatch(midChrome.colour1, /rgb\(255, 0, 0\)|rgb\(232, 238, 243\)/, `the middle stop is on its way to red: ${midChrome.colour1}`);
});
await wait(800);
const endChrome = await ev(() => window.__motion.gradient('chrome'));
check('and arrives where the Hover state put it', () => {
  assert.equal(endChrome.angle, '270deg', JSON.stringify(endChrome));
  assert.equal(endChrome.colour1, 'rgb(255, 0, 0)', JSON.stringify(endChrome));
});
await set('chrome', { hover: false });

const spinA = await ev(() => window.__motion.gradient('spinner'));
await wait(300);
const spinB = await ev(() => window.__motion.gradient('spinner'));
check('a keyframe loop turns a conic gradient while the control stays where it is', () => {
  assert.match(spinA.image, /^conic-gradient/, JSON.stringify(spinA));
  assert.notEqual(spinA.turn, spinB.turn, `${spinA.turn} then ${spinB.turn}`);
  assert.match(spinB.turn, /deg$/);
});

const waveA = await ev(() => window.__motion.patterns('wave'));
await wait(250);
const waveB = await ev(() => window.__motion.patterns('wave'));
check('the Wave label draws a sine row behind its words and dots in front of them', () => {
  assert.deepEqual(waveA.map((layer) => `${layer.name}:${layer.place}`), ['pattern1:behind', 'pattern2:front']);
  const [behind, front] = waveA;
  assert.equal(behind.afterText, false, 'behind is before the words');
  assert.equal(front.afterText, true, 'in front is after them');
  assert.equal(behind.tint, 'rgb(20, 184, 166)');
  assert.match(behind.mask, /^url\("data:image\/svg\+xml/);
  assert.equal(behind.moveY, null, 'a row only moves along itself');
  assert.ok(front.moveX !== null && front.moveY !== null, 'the diagonal has a mover on each axis');
});
check('and both move on their own, a tile at a time', () => {
  assert.notEqual(waveA[0].moveX, waveB[0].moveX, `${waveA[0].moveX} then ${waveB[0].moveX}`);
  assert.notEqual(waveA[1].moveY, waveB[1].moveY, `${waveA[1].moveY} then ${waveB[1].moveY}`);
});

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}

console.log('\npanel motion: all checks passed');
await browser.close();
server.close();
