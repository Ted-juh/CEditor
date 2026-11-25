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
 *   - a drag on a control moves the scene it drives, and stays where it was let go (step 5c)
 *   - a control's value moves the scene it drives, from where the value was at the start (step 5c)
 *   - a ring sweep moves what a knob's value draws round to full and hands back to the value (step 6)
 *   - a knob's own value animation loops while it is hovered, and hands back when the pointer leaves
 *   - the Macro's ring and a meter sweep with the scene, and a meter's own needle test plays from a script
 *   - a pattern clip pulses a control's pattern while its scroll goes on underneath
 *   - MIDI in starts scenes: a kick drum's note, and the sustain pedal as it goes down, once
 *   - a drag heard on one part: on a button's key it moves the scene, on its margin it does not
 *   - a state that changes a pattern eases its opacity, size and speed, and its scroll keeps its place
 *   - a scene drifts a background image — zoomed and panned inside its clip — and not the control
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
  await page.mouse.move(680, 5);

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

  // A drag drives a scene (step 5c): 100 px up is the whole of it; this one follows exactly.
  const padAt = async () => kf(await s('box', 'pad'))[0];
  const padStart = await padAt();
  const pad = await s('rect', 'pad');
  await page.mouse.move(pad.x + pad.w / 2, pad.y + pad.h - 10);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.w / 2, pad.y + pad.h - 50, { steps: 4 });
  await page.waitForTimeout(80);
  const padHalf = await padAt();
  await page.mouse.up();
  await page.waitForTimeout(80);
  const padLetGo = await padAt();
  check('a drag on a control moves the scene it drives, and it stays where it was let go', () => {
    assert.equal(padStart?.state, 'paused', JSON.stringify(padStart));
    assert.match(padStart.delay, /^0s$/, `held at its start before the hand moves it: ${padStart.delay}`);
    assert.equal(padHalf.state, 'paused');
    assert.match(padHalf.delay, /^-0\.4s$/, `40 px of 100: 400 ms into the scene: ${padHalf.delay}`);
    assert.equal(padLetGo.delay, padHalf.delay);
  });

  // A value drives a scene: the Level knob's, turned up by dragging it up and to the right.
  const gaugeAt = async () => kf(await s('box', 'gauge'))[0];
  const gaugeStart = await gaugeAt();
  const level = await s('rect', 'level');
  await page.mouse.move(level.x + level.w / 2, level.y + level.h / 2);
  await page.mouse.down();
  await page.mouse.move(level.x + level.w * 0.95, level.y + level.h * 0.05 - 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const gaugeTurned = await gaugeAt();
  const seconds = (delay) => -parseFloat(delay);
  check('a control\'s value moves the scene it drives, from where the value was at the start', () => {
    assert.equal(gaugeStart?.state, 'paused', JSON.stringify(gaugeStart));
    assert.equal(gaugeTurned?.state, 'paused');
    assert.ok(seconds(gaugeTurned.delay) > seconds(gaugeStart.delay) + 0.05,
      `turned up, further into the scene: ${gaugeStart.delay} -> ${gaugeTurned.delay}`);
  });

  // A value effect (step 6): the Level knob's ring swept round to full, then handed back to its value.
  const level0 = await s('drawn', 'level');
  const dial0 = await s('drawn', 'dial');
  const fader0 = await s('drawn', 'fader');
  const macro0 = await s('drawn', 'macro');
  const vu0 = await s('drawn', 'vu');
  await page.evaluate(() => window.__scenes.script('animatePlay', ['Sweep', {}], 'sweep'));
  await page.waitForTimeout(90);
  const sweepEarly = await s('drawn', 'level');
  await page.waitForTimeout(560);
  const sweepPeak = await s('drawn', 'level');
  const dialPeak = await s('drawn', 'dial');
  const faderPeak = await s('drawn', 'fader');
  const macroPeak = await s('drawn', 'macro');
  const vuPeak = await s('drawn', 'vu');
  await page.waitForTimeout(800);
  const sweepAfter = await s('drawn', 'level');
  const dialAfter = await s('drawn', 'dial');
  const faderAfter = await s('drawn', 'fader');
  const macroAfter = await s('drawn', 'macro');
  const vuAfter = await s('drawn', 'vu');
  const sweepDone = await page.evaluate(() => window.__scenes.dones.sweep);
  check('a ring sweep moves what a knob\'s value draws round to full, then hands back to the value', () => {
    assert.ok(level0.drawn > 0.3 && level0.drawn < 0.95, `the knob's own value first: ${JSON.stringify(level0)}`);
    assert.ok(sweepEarly.drawn < level0.drawn - 0.2, `starting from nothing: ${sweepEarly.drawn}`);
    assert.ok(sweepPeak.drawn > 0.9, `round to full: ${sweepPeak.drawn}`);
    assert.ok(Math.hypot(sweepPeak.x - level0.x, sweepPeak.y - level0.y) > 5, 'the pointer moved with it');
    assert.equal(sweepAfter.drawn, level0.drawn, 'and back on the value exactly');
    assert.deepEqual([sweepAfter.x, sweepAfter.y], [level0.x, level0.y]);
    assert.equal(sweepDone, true);
  });
  check('a knob drawn as a form, and a linear slider, sweep the same way', () => {
    assert.ok(Number.isFinite(dial0?.drawn), JSON.stringify(dial0));
    assert.ok(dialPeak.drawn > 0.9, `round to full: ${dialPeak.drawn}`);
    assert.equal(dialAfter.drawn, dial0.drawn);
    assert.ok(Number.isFinite(fader0?.drawn), JSON.stringify(fader0));
    assert.ok(faderPeak.drawn > 0.9, `the slider to the top: ${faderPeak.drawn}`);
    assert.ok(Math.hypot(faderPeak.x - fader0.x, faderPeak.y - fader0.y) > 5, 'its handle moved with it');
    assert.equal(faderAfter.drawn, fader0.drawn);
  });
  await page.evaluate(() => window.__scenes.script('animateSeek', ['Sweep', 0.55]));
  await page.waitForTimeout(60);
  const sweepHeld = await s('drawn', 'level');
  await page.evaluate(() => window.__scenes.script('animateSeek', ['Sweep', 1]));
  await page.waitForTimeout(60);
  const sweepEnd = await s('drawn', 'level');
  check('the Macro\'s ring and a meter sweep with the scene, and hand back to their own values', () => {
    assert.ok(Number.isFinite(macro0?.drawn) && Number.isFinite(vu0?.drawn), JSON.stringify({ macro0, vu0 }));
    assert.ok(macroPeak.drawn > 0.9, `the Macro round to full: ${macroPeak.drawn}`);
    assert.ok(vuPeak.drawn > 0.9, `the meter to the top: ${vuPeak.drawn}`);
    assert.equal(macroAfter.drawn, macro0.drawn);
    assert.equal(macroPeak.reading, macro0.reading, `its number still says what it is: ${macro0.reading}`);
    assert.equal(vuAfter.drawn, vu0.drawn);
  });
  check('held by a script mid-sweep, the knob draws full; at the end, its value', () => {
    assert.equal(sweepHeld.drawn, 1);
    assert.equal(sweepEnd.drawn, level0.drawn);
  });

  // A pattern clip: Wave's pattern pulsed by a scene a script starts; its scroll keeps going.
  const patternBefore = await s('pattern', 'wave', 'pattern1');
  await page.evaluate(() => window.__scenes.script('animatePlay', ['Shimmer', {}]));
  await page.waitForTimeout(120);
  const patternPulsing = await s('pattern', 'wave', 'pattern1');
  await page.evaluate(() => window.__scenes.script('animateSeek', ['Shimmer', 0.5]));
  await page.waitForTimeout(80);
  const patternHeld = await s('pattern', 'wave', 'pattern1');
  check('a pattern clip pulses a control\'s pattern, and its scroll goes on underneath', () => {
    assert.equal(patternBefore?.clip.name, 'none', JSON.stringify(patternBefore));
    assert.match(patternBefore.scroll?.name ?? '', /ce-pattern-x$/, 'it scrolls (the name is Svelte\'s, scoped)');
    assert.match(patternPulsing.clip.name, /^ce-kf-/, JSON.stringify(patternPulsing));
    assert.equal(patternPulsing.clip.state, 'running');
    assert.equal(patternPulsing.scroll.name, patternBefore.scroll.name);
    assert.equal(patternPulsing.scroll.state, 'running', 'still scrolling');
    assert.equal(patternHeld.clip.state, 'paused');
    assert.match(patternHeld.clip.delay, /^-0\.4s$/, `held half way: ${patternHeld.clip.delay}`);
  });

  // A drag heard on Knock's key only. Its margin (the outer tenth) is the button but not its key.
  const knockAt = async () => kf(await s('box', 'knock'))[0]?.delay;
  await page.setViewportSize({ width: 700, height: 1100 });
  const knock = await s('rect', 'knock');
  const dragFrom = async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  const knockStart = await knockAt();
  await dragFrom(knock.x + 4, knock.y + knock.h - 3);
  const afterMargin = await knockAt();
  await dragFrom(knock.x + knock.w / 2, knock.y + knock.h / 2 + 10);
  const afterKey = await knockAt();
  await page.setViewportSize({ width: 700, height: 640 });
  check('a drag heard on one part: on a button\'s key it moves the scene, on its margin it does not', () => {
    assert.match(knockStart ?? '', /^0s$/, `held at its start: ${knockStart}`);
    assert.equal(afterMargin, knockStart, 'pressed on the margin: nothing');
    assert.match(afterKey ?? '', /^-0\.4s$/, `40 px of 100 on the key: ${afterKey}`);
  });

  // A state that changes Glow's pattern: fainter, larger, faster, eased over 600 ms; no jump.
  await page.setViewportSize({ width: 700, height: 1200 });
  const glowBox = await s('rect', 'glow');
  const glowRest = await s('patternDrawn', 'glow', 'pattern1');
  await page.mouse.move(glowBox.x + glowBox.w / 2, glowBox.y + glowBox.h / 2, { steps: 2 });
  const glowAtOnce = await s('patternDrawn', 'glow', 'pattern1');
  await page.waitForTimeout(260);
  const glowMid = await s('patternDrawn', 'glow', 'pattern1');
  await page.waitForTimeout(700);
  const glowHover = await s('patternDrawn', 'glow', 'pattern1');
  await page.mouse.move(680, 5);
  await page.setViewportSize({ width: 700, height: 640 });
  const placeGap = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  check('a state that changes a pattern eases its opacity, size and speed, and its scroll keeps its place', () => {
    assert.equal(glowRest.opacity, 1, JSON.stringify(glowRest));
    assert.ok(glowMid.opacity < 0.95 && glowMid.opacity > 0.35, `fading: ${glowMid.opacity}`);
    assert.ok(Math.abs(glowHover.opacity - 0.3) < 0.02, `faded to 30 %: ${glowHover.opacity}`);
    assert.ok(glowMid.tile > glowRest.tile * 1.05 && glowMid.tile < glowHover.tile * 0.98, `growing: ${glowRest.tile} ${glowMid.tile} ${glowHover.tile}`);
    assert.ok(Math.abs(glowHover.tile - glowRest.tile * 2) < 1, 'to twice the size');
    assert.ok(placeGap(glowAtOnce.place, glowRest.place) < 0.08, `the scroll kept its place: ${glowRest.place} -> ${glowAtOnce.place}`);
    assert.ok(glowMid.rate > 0.3 && glowMid.rate < 0.98, `its speed easing to the new: rate ${glowMid.rate}`);
    assert.equal(glowHover.rate, 1, 'at the new speed');
  });

  // An image drift: the picture inside the Photo label's fill moves, the label does not.
  const photoBefore = await s('imageMotion', 'photo');
  await page.evaluate(() => window.__scenes.script('animatePlay', ['Drift', {}]));
  await page.waitForTimeout(150);
  const photoDrifting = await s('imageMotion', 'photo');
  await page.evaluate(() => window.__scenes.script('animateSeek', ['Drift', 0.5]));
  await page.waitForTimeout(80);
  const photoHeld = await s('imageMotion', 'photo');
  check('a scene drifts a background image, zoomed and panned inside its clip, and not the control', () => {
    assert.ok(!photoBefore.picture || photoBefore.picture.name === 'none', `still before: ${JSON.stringify(photoBefore)}`);
    assert.match(photoDrifting.picture?.name ?? '', /^ce-kf-image-/, JSON.stringify(photoDrifting));
    assert.equal(photoDrifting.picture.state, 'running');
    assert.ok(!/ce-kf-/.test(photoDrifting.control), `the label itself does not move: ${photoDrifting.control}`);
    assert.equal(photoHeld.picture.state, 'paused');
    assert.match(photoHeld.picture.delay, /^-3s$/, `held half way: ${photoHeld.picture.delay}`);
    assert.ok(Number(photoHeld.picture.scale) > 1.05 && Number(photoHeld.picture.scale) < 1.15, `zoomed part way: ${photoHeld.picture.scale}`);
  });

  // MIDI in: the kick's note starts its scene; the pedal starts its own going down, not while held.
  const kickBefore = kf(await s('box', 'kick')).length;
  await page.evaluate(() => window.__scenes.midiIn('90 26 64'));
  await page.waitForTimeout(60);
  const afterOtherNote = kf(await s('box', 'kick')).length;
  await page.evaluate(() => window.__scenes.midiIn('99 24 7F'));
  await page.waitForTimeout(60);
  const kicked = kf(await s('box', 'kick'));
  await page.evaluate(() => window.__scenes.midiIn('B0 40 7F'));
  await page.waitForTimeout(60);
  const pedalDown = kf(await s('box', 'pedal'))[0]?.name;
  await page.evaluate(() => window.__scenes.midiIn('B0 40 7F'));
  await page.waitForTimeout(60);
  const pedalHeld = kf(await s('box', 'pedal'))[0]?.name;
  await page.evaluate(() => window.__scenes.midiIn('B0 40 00'));
  await page.evaluate(() => window.__scenes.midiIn('B0 40 7F'));
  await page.waitForTimeout(60);
  const pedalAgain = kf(await s('box', 'pedal'))[0]?.name;
  check('MIDI in starts scenes: a kick drum\'s note, and the sustain pedal as it goes down, once', () => {
    assert.equal(kickBefore, 0);
    assert.equal(afterOtherNote, 0, 'another note starts nothing');
    assert.equal(kicked.length, 1, JSON.stringify(kicked));
    assert.equal(kicked[0].state, 'running');
    assert.match(pedalDown ?? '', /^ce-kf-/);
    assert.equal(pedalHeld, pedalDown, 'held down: not started again');
    assert.notEqual(pedalAgain, pedalDown, 'up and down again: started again');
  });

  // A meter's own value animation, from a script: the needle test.
  const vuBefore = (await s('drawn', 'vu')).drawn;
  const needlePlayed = await page.evaluate(() => window.__scenes.script('animatePlay', ['VU', 'needle']));
  await page.waitForTimeout(560);
  const vuNeedle = (await s('drawn', 'vu')).drawn;
  await page.waitForTimeout(700);
  const vuRested = (await s('drawn', 'vu')).drawn;
  check('a meter\'s own value animation plays from a script: the needle up and back to its reading', () => {
    assert.equal(needlePlayed, true);
    assert.ok(vuNeedle > 0.9, `up: ${vuNeedle}`);
    assert.equal(vuRested, vuBefore);
  });

  // A knob's own value animation: the wiggle loops while Cutoff is hovered.
  const cutoffValue = (await s('drawn', 'cutoff')).drawn;
  const cutoffBox = await s('rect', 'cutoff');
  await page.mouse.move(cutoffBox.x + cutoffBox.w / 2, cutoffBox.y + cutoffBox.h / 2, { steps: 3 });
  const wiggled = [];
  for (let i = 0; i < 10; i += 1) { await page.waitForTimeout(90); wiggled.push((await s('drawn', 'cutoff')).drawn); }
  await page.mouse.move(680, 5);
  await page.waitForTimeout(150);
  const cutoffAfter = (await s('drawn', 'cutoff')).drawn;
  check('a knob\'s own value animation loops while it is hovered, and hands back when the pointer leaves', () => {
    assert.ok(wiggled.some((value) => Math.abs(value - cutoffValue) > 0.02), `wiggling about ${cutoffValue}: ${wiggled.join(' ')}`);
    assert.ok(wiggled.every((value) => Math.abs(value - cutoffValue) <= 0.061), 'by no more than the wiggle\'s 6 %');
    assert.equal(cutoffAfter, cutoffValue);
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
  const reducedLevel = await reduced.evaluate(() => window.__scenes.drawn('level'));
  await reduced.evaluate(() => window.__scenes.script('animatePlay', ['Sweep', {}]));
  await reduced.waitForTimeout(80);
  const reducedSweep = await reduced.evaluate(() => window.__scenes.drawn('level'));
  check('with reduced motion a scene goes straight to its last frame, and a ring sweep to the value', () => {
    assert.equal(posed.length, 1, JSON.stringify(posed));
    assert.equal(posed[0].state, 'paused');
    assert.match(posed[0].delay, /^-0\.8s/);
    assert.equal(reducedSweep.drawn, reducedLevel.drawn);
  });

  assert.deepEqual(failures, [], 'the page must run without errors');
  console.log('scene playback: all checks passed');
} finally {
  await browser.close();
  server.close();
}
