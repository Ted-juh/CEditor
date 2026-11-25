/**
 * Panel scenes playing on their triggers in Chromium (step 5b). Run with the rest: `npm run test:browser`.
 *
 *   - a live surface — Preview, the plug-in — plays the panel's opening scene by itself: the words
 *     type in, the knob fades, running, from the start
 *   - a scene that ends holds its last frame: posed there and paused, nothing left running
 *   - a click on a button starts the scene waiting on it; a second click starts it again
 *   - the pointer over the knob — the knob entering Hover — starts the scene waiting on that
 *   - a looping scene starts again each time its length has passed
 *   - a script plays a scene, holds it at a point, plays a library effect and swaps words (step 5c)
 *   - inside the Designer's stage nothing plays by itself
 *   - with reduced motion a scene goes straight to its last frame
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

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
const url = `http://127.0.0.1:${server.address().port}/scenePlayback.html`;

const browser = await chromium.launch({ ...chromiumLaunchOptions(), args: ['--no-sandbox'] });
const failures = [];
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 640 } });
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|404 \(Not Found\)/i.test(message.text())) failures.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__scenesMounted && window.__scenes.ready());
  const s = (name, ...args) => page.evaluate(([n, a]) => window.__scenes[n](...a), [name, args]);
  const kf = (list) => (list ?? []).filter((a) => /^ce-kf-/.test(a.name));

  // At once: the opening scene runs.
  const knobEarly = kf(await s('box', 'cutoff'));
  const lettersEarly = await s('letters', 'wave');
  check('a live surface plays the panel\'s opening scene by itself: running, from the start', () => {
    assert.equal(knobEarly.length, 1, JSON.stringify(knobEarly));
    assert.equal(knobEarly[0].state, 'running');
    assert.match(knobEarly[0].delay, /^0\.1s/, 'the clip starts 100 ms in');
    assert.match(lettersEarly?.name ?? '', /^ce-tx-/, JSON.stringify(lettersEarly));
    assert.equal(lettersEarly.state, 'running');
  });

  // After its length: held at the last frame.
  await page.waitForTimeout(1300);
  const knobLate = kf(await s('box', 'cutoff'));
  const lettersLate = await s('letters', 'wave');
  check('a scene that ends holds its last frame: posed there and paused', () => {
    assert.equal(knobLate.length, 1);
    assert.equal(knobLate[0].state, 'paused');
    assert.match(knobLate[0].delay, /^-0\.8s/, `posed at 900 ms, 800 into a clip starting at 100: ${knobLate[0].delay}`);
    assert.equal(lettersLate.state, 'paused');
  });

  // A click on Start.
  assert.equal(kf(await s('box', 'start')).length, 0, 'nothing on Start before it is clicked');
  const start = await s('rect', 'start');
  await page.mouse.click(start.x + start.w / 2, start.y + start.h / 2);
  await page.waitForTimeout(120);
  const clicked = kf(await s('box', 'start'));
  await page.waitForTimeout(150);
  await page.mouse.click(start.x + start.w / 2, start.y + start.h / 2);
  await page.waitForTimeout(120);
  const again = kf(await s('box', 'start'));
  check('a click starts the scene waiting on it, and a second click starts it again', () => {
    assert.equal(clicked.length, 1, JSON.stringify(clicked));
    assert.equal(clicked[0].state, 'running');
    assert.equal(again.length, 1);
    assert.notEqual(again[0].name, clicked[0].name, 'the phase flipped, so the animation restarted');
  });

  // The pointer over the knob: the lamp's Glow (its Blink loops on the lamp too).
  const lampBefore = kf(await s('box', 'lamp')).length;
  const knob = await s('rect', 'cutoff');
  await page.mouse.move(knob.x + knob.w / 2, knob.y + knob.h / 2, { steps: 3 });
  await page.waitForTimeout(150);
  const lampHover = kf(await s('box', 'lamp'));
  check('the knob entering Hover starts the scene waiting on it', () => {
    assert.equal(lampBefore, 1, 'the loop only, before');
    assert.equal(lampHover.length, 2, JSON.stringify(lampHover));
    assert.ok(lampHover.every((a) => a.state === 'running'));
  });
  await page.mouse.move(5, 600);

  // The loop: its animation name flips every 500 ms.
  const loopNames = [];
  for (let i = 0; i < 4; i += 1) {
    const box = kf(await s('box', 'lamp'));
    loopNames.push(box[box.length - 1]?.name ?? box[0]?.name);
    await page.waitForTimeout(260);
  }
  check('a looping scene starts again each time its length has passed', () => {
    assert.ok(new Set(loopNames).size >= 2, loopNames.join(' '));
    assert.ok(loopNames.every((name) => /^ce-kf-/.test(name)));
  });

  // A script (step 5c): it finds the surface's runtime by the panel it belongs to.
  const knobBefore = kf(await s('box', 'cutoff'))[0];
  const played = await page.evaluate(() => window.__scenes.script('animatePlay', ['Intro', {}], 'intro'));
  await page.waitForTimeout(100);
  const knobPlayed = kf(await s('box', 'cutoff'))[0];
  await page.waitForTimeout(1000);
  const introDone = await page.evaluate(() => window.__scenes.dones.intro);
  check('a script plays a panel scene by its name, and hears done(true) at its end', () => {
    assert.equal(played, true);
    assert.equal(knobPlayed.state, 'running');
    assert.notEqual(knobPlayed.name, knobBefore.name, 'started again');
    assert.equal(introDone, true);
  });
  await page.evaluate(() => window.__scenes.script('animateSeek', ['Intro', 0.5]));
  await page.waitForTimeout(100);
  const sought = kf(await s('box', 'cutoff'))[0];
  check('a script holds a scene at a point of its length', () => {
    assert.equal(sought.state, 'paused');
    assert.match(sought.delay, /^-0\.35s/, `450 ms into the scene, 350 into a clip starting at 100: ${sought.delay}`);
  });
  const startBefore = kf(await s('box', 'start')).length;
  await page.evaluate(() => window.__scenes.script('animateEffect', ['Start', 'Spin']));
  await page.waitForTimeout(100);
  const spun = kf(await s('box', 'start'));
  check('a script plays a library effect on a control, without a scene', () => {
    assert.equal(spun.length, startBefore + 1, JSON.stringify(spun));
    assert.equal(spun.at(-1).state, 'running');
  });
  await page.evaluate(() => window.__scenes.script('animateSwap', ['Wave', 'Hi', 'roll', {}], 'swap'));
  await page.waitForTimeout(80);
  const leaving = await s('letters', 'wave');
  await page.waitForTimeout(1600);
  const writes = await page.evaluate(() => window.__scenes.writes());
  const swapDone = await page.evaluate(() => window.__scenes.dones.swap);
  check('a script swaps a control\'s words: the old ones roll out, then the new ones are written and roll in', () => {
    assert.match(leaving?.name ?? '', /^ce-tx-/);
    assert.deepEqual(writes, [['Wave', 'Text.content', 'Hi']]);
    assert.equal(swapDone, true);
  });

  const still = { wave: await s('letters', 'still_wave'), cutoff: kf(await s('box', 'still_cutoff')) };
  check('inside the Designer\'s stage nothing plays by itself', () => {
    assert.ok(!still.wave || !/^ce-tx-/.test(still.wave.name), JSON.stringify(still.wave));
    assert.equal(still.cutoff.length, 0);
  });

  // Reduced motion: straight to the last frame.
  const reduced = await browser.newPage({ viewport: { width: 700, height: 640 }, reducedMotion: 'reduce' });
  reduced.on('pageerror', (error) => failures.push(String(error)));
  await reduced.goto(url);
  await reduced.waitForFunction(() => window.__scenesMounted && window.__scenes.ready());
  await reduced.waitForTimeout(150);
  const posed = kf(await reduced.evaluate(() => window.__scenes.box('cutoff')));
  check('with reduced motion a scene goes straight to its last frame', () => {
    assert.equal(posed.length, 1, JSON.stringify(posed));
    assert.equal(posed[0].state, 'paused');
    assert.match(posed[0].delay, /^-0\.8s/);
  });

  assert.deepEqual(failures, [], 'the page must run without errors');
  console.log('scene playback: all checks passed');
} finally {
  await browser.close();
  server.close();
}
