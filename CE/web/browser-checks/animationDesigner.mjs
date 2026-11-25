/**
 * The Animation Designer in Chromium (step 5a). Run with the rest: `npm run test:browser`.
 *
 *   - the stage draws the panel, and a click on it picks the control under the pointer
 *   - an effect from the library becomes a clip, on the picked control's track
 *   - the ruler scrubs, and the stage is posed there: paused animations, a negative delay
 *   - a clip dragged along its track is retimed, a copy made with Alt, and one undo puts it back
 *   - Play moves the playhead; a control's own animation, shown as a scene, is retimed in place
 *   - the scene is in the saved document
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

const browser = await chromium.launch({ ...chromiumLaunchOptions(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/404 \(Not Found\)/.test(message.text())) failures.push(message.text());
});

await page.goto(`http://127.0.0.1:${server.address().port}/animationDesigner.html`);
await page.waitForFunction(() => window.__designerMounted && document.querySelectorAll('.board .canvas-control').length >= 3);
await page.waitForTimeout(300);

const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const d = (name, ...args) => ev(([n, a]) => window.__designer[n](...a), [name, args]);
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

const cards = await d('cards');
check('the editor opens with its library, the panel on the stage, and the controls\' own animations as scenes', () => {
  assert.ok(cards.includes('text:typewriter:in') && cards.includes('move:fadeIn') && cards.includes('paint:sheen'), cards.join(','));
  assert.ok(cards.length >= 20);
});
assert.equal(await d('stageControls'), 3);
assert.deepEqual(await d('sceneRows'), ['Start · blink']);

await d('addScene');
await wait(100);
const [first] = await d('scenes');
check('+ Scene makes the panel\'s first scene, played when the panel opens', () => {
  assert.equal(first.name, 'Scene 1');
  assert.deepEqual(first.trigger, { type: 'panelOpen' });
});

await d('pickAt', 100, 70);
await wait(50);
check('a click on the stage picks the control under the pointer', async () => {});
assert.equal(await d('pickedLabel'), 'Wave');
await d('clickEffect', 'text:typewriter:in');
await wait(100);
await d('pickAt', 380, 90);
await wait(50);
assert.equal(await d('pickedLabel'), 'Cutoff');
await d('clickEffect', 'move:fadeIn');
await wait(150);
const [withClips] = await d('scenes');
check('an effect from the library becomes a clip on the picked control, at the playhead', () => {
  assert.deepEqual(withClips.clips.map((clip) => [clip.controlId, clip.target, clip.start]), [['wave', 'Text', 0], ['cutoff', 'Transform', 0]]);
});
assert.deepEqual(await d('tracks'), ['wave|Text', 'cutoff|Transform']);
const fadeId = withClips.clips[1].id;
assert.equal(await d('settingsFor'), fadeId, 'and its settings are open');
check('a text effect on a knob, which has no words of its own, is refused with the reason', async () => {});
await d('clickEffect', 'text:roll:in');
await wait(50);
assert.match(await d('note'), /has no words of its own/);

// Scrub to a tenth of the way into the scene: 240 ms of 2400, half-way through the knob's fade.
const ruler = await d('rulerRect');
await page.mouse.click(ruler.x + ruler.w * 0.1, ruler.y + ruler.h / 2);
await wait(150);
const time = await d('time');
const knob = await d('stagePose', 'cutoff');
const words = await d('stagePose', 'wave');
check('the ruler scrubs, and the stage is posed at the playhead: paused, the delay moved back', () => {
  assert.match(time, /^0\.24 \/ 2\.40 s$/, time);
  assert.match(knob.rootAnimation.name, /ce-kf-/, JSON.stringify(knob));
  assert.match(knob.rootAnimation.state, /paused/);
  assert.match(knob.rootAnimation.delay, /^-0\.24s/);
  assert.ok(Number(knob.opacity) > 0.2 && Number(knob.opacity) < 1, `half-faded: ${knob.opacity}`);
  assert.equal(words.pieces, 4, 'the words cut into letters');
  assert.match(words.pieceAnimation.name, /^ce-tx-/);
  assert.equal(words.pieceAnimation.state, 'paused');
});

// Drag the knob's clip a fifth of the timeline to the right: about 480 ms.
const clip = await d('clipRect', fadeId);
await page.mouse.move(clip.x + 10, clip.y + clip.h / 2);
await page.mouse.down();
await page.mouse.move(clip.x + 10 + ruler.w * 0.2, clip.y + clip.h / 2, { steps: 6 });
await page.mouse.up();
await wait(150);
const moved = (await d('scenes'))[0].clips.find((c) => c.id === fadeId);
check('a clip dragged along its track is retimed, on the 10 ms grid', () => {
  assert.ok(moved.start >= 430 && moved.start <= 530, `${moved.start}`);
  assert.equal(moved.start % 10, 0);
});
await d('undo');
await wait(150);
const undone = (await d('scenes'))[0].clips.find((c) => c.id === fadeId);
check('one undo puts it back', () => assert.equal(undone.start, 0));

const again = await d('clipRect', fadeId);
await page.keyboard.down('Alt');
await page.mouse.move(again.x + 10, again.y + again.h / 2);
await page.mouse.down();
await page.mouse.move(again.x + 10 + ruler.w * 0.4, again.y + again.h / 2, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Alt');
await wait(150);
const copied = (await d('scenes'))[0].clips.filter((c) => c.controlId === 'cutoff');
check('Alt+drag copies it instead', () => {
  assert.equal(copied.length, 2, JSON.stringify(copied.map((c) => [c.id, c.start])));
  assert.ok(copied.some((c) => c.start === 0) && copied.some((c) => c.start > 800));
});

await d('play');
await wait(400);
const playing = await d('time');
await d('play');
check('Play moves the playhead, and only the playhead moves the stage', () => {
  const seconds = Number(playing.split(' / ')[0]);
  assert.ok(seconds > 0.24, playing);
});

await d('clickScene', 'own:start:blink');
await wait(150);
assert.deepEqual(await d('tracks'), ['start|Transform']);
const ownClip = await d('clipRect', 'own:blink');
await page.mouse.move(ownClip.x + 10, ownClip.y + ownClip.h / 2);
await page.mouse.down();
await page.mouse.move(ownClip.x + 10 + ruler.w * 0.1, ownClip.y + ownClip.h / 2, { steps: 5 });
await page.mouse.up();
await wait(150);
const blink = await d('ownAnimation');
check('a control\'s own animation, shown as a scene, is retimed in place: one animation, two views', () => {
  assert.ok(blink.delay > 0, JSON.stringify(blink));
  assert.equal(blink.kind, 'keyframes');
});

const saved = await d('saved');
check('the scene is in the saved document', () => {
  assert.equal(saved.length, 1);
  assert.equal(saved[0].clips.length, 3);
});

// Step 5c: a hand on a control drives the scene instead of time.
await d('clickScene', saved[0].id);
await wait(150);
await page.selectOption('[data-scene-clock]', 'drag');
await wait(100);
const triggerWhileDriven = await page.$('[aria-label="Scene trigger"]');
await page.locator('[data-clock-span]').fill('200');
await page.locator('[data-clock-span]').dispatchEvent('change');
await page.selectOption('[data-clock-release]', 'carry');
await wait(150);
const driven = (await d('saved'))[0];
const listed = await page.evaluate((id) => document.querySelector(`[data-scene="${id}"] .st`)?.textContent ?? '', saved[0].id);
await page.selectOption('[data-scene-clock]', 'time');
await wait(150);
const timedAgain = (await d('saved'))[0];
check('a scene can be driven by a drag on a control instead of time, and set back', () => {
  assert.equal(driven.clock?.source, 'drag', JSON.stringify(driven.clock));
  assert.equal(driven.clock.span, 200);
  assert.equal(driven.clock.release, 'carry');
  assert.ok(driven.clock.controlId, 'on a control');
  assert.equal(triggerWhileDriven, null, 'no trigger to pick while a hand drives it');
  assert.match(listed, /^Drag on /, listed);
  assert.equal('clock' in timedAgain, false, 'back to time, and the clock is gone');
  assert.equal(timedAgain.clips.length, 3, 'with its clips as they were');
});

// Step 6: a value effect on what the knob's value draws, in a scene of its own.
await d('addScene');
await wait(150);
await d('pickAt', 380, 90);
await wait(50);
const liveDrawn = await d('stageDrawn', 'cutoff');
await d('clickEffect', 'value:sweep');
await wait(150);
const swept = (await d('scenes')).at(-1);
const frameRows = await d('valueFrameRows');
await page.mouse.click(ruler.x + ruler.w * 0.1, ruler.y + ruler.h / 2);
await wait(150);
const sweepTime = Number((await d('time')).split(' / ')[0]) * 1000;
const posedDrawn = await d('stageDrawn', 'cutoff');
await d('pickAt', 100, 70);
await wait(50);
await d('clickEffect', 'value:sweep');
await wait(50);
const valueNote = await d('note');
const expected = await d('sweepAt', sweepTime / 1200, liveDrawn);
check('a ring sweep on a knob plays on what its value draws, and the stage is posed at the playhead', () => {
  assert.deepEqual(swept.clips.map((c) => [c.controlId, c.target, c.effect.kind]), [['cutoff', 'Value', 'value']]);
  assert.equal(frameRows, 3, 'its three frames: from nothing, to full, back to the value');
  assert.ok(Math.abs(posedDrawn - expected) < 0.002, `${sweepTime} ms in: drawn ${posedDrawn}, the engine says ${expected}`);
  assert.notEqual(posedDrawn, liveDrawn, 'not the value itself');
  assert.match(valueNote, /Wave draws no value to move: a value effect plays on a knob, a slider, a Macro or a meter/);
});

// Pattern clips: refused on a control with no pattern, placed on Wave's.
await d('addScene');
await wait(150);
await d('showCategory', 'Pattern');
await wait(100);
await d('pickAt', 380, 90);
await wait(50);
await d('clickEffect', 'pattern:pulse');
await wait(80);
const noPatternNote = await d('note');
await d('pickAt', 100, 70);
await wait(50);
await d('clickEffect', 'pattern:pulse');
await wait(150);
const pulsed = (await d('scenes')).at(-1);
check('a Pattern effect goes on the picked control\'s pattern, and is refused on one with none', () => {
  assert.match(noPatternNote, /Cutoff has no pattern: add one on its Background tab/);
  assert.deepEqual(pulsed.clips.map((c) => [c.controlId, c.target]), [['wave', 'Patterns.pattern1']]);
});
await d('showCategory', 'All');
await wait(50);

// Scene presets: a built-in one repeated over every knob, and the first scene kept and put back.
const scenesBefore = (await d('scenes')).length;
await d('showCategory', 'Scenes');
await wait(100);
const builtIns = await d('presetCards');
await d('clickPreset', 'builtin:knobsSweepIn');
await wait(100);
const applyText = await d('presetApplyText');
await d('addFromPreset');
await wait(150);
const scenesAfter = await d('scenes');
const swept2 = scenesAfter.at(-1);
check('a built-in scene preset repeats over every knob on the panel, as a new scene', () => {
  assert.deepEqual(builtIns.map(([id]) => id), ['builtin:knobsSweepIn', 'builtin:labelsTypeIn']);
  assert.match(applyText, /On every knob, slider, Macro or meter that fits \(1\)/, applyText);
  assert.equal(scenesAfter.length, scenesBefore + 1);
  assert.equal(swept2.name, 'Knobs sweep in');
  assert.deepEqual(swept2.clips.map((c) => [c.controlId, c.target]), [['cutoff', 'Value']]);
  assert.deepEqual(swept2.trigger, { type: 'panelOpen' });
});
await d('clickScene', saved[0].id);
await wait(150);
await d('saveScenePreset');
await wait(100);
const savedNote = await d('note');
await d('showCategory', 'Scenes');
await wait(100);
const withMine = await d('presetCards');
const mineId = withMine.find(([id]) => !id.startsWith('builtin:'))?.[0];
await d('clickPreset', mineId);
await wait(100);
const slots = await d('presetSlots');
await d('addFromPreset');
await wait(150);
const putBack = (await d('scenes')).at(-1);
const original = saved[0];
check('a scene kept as a preset goes back on the panel, each part on the control the Designer offers', () => {
  assert.match(savedNote, /is in your scene presets/, savedNote);
  assert.ok(mineId, JSON.stringify(withMine));
  assert.deepEqual(slots, ['wave', 'cutoff'], 'its two controls, the same types first');
  assert.equal(putBack.clips.length, original.clips.length);
  assert.deepEqual(putBack.clips.map((c) => [c.controlId, c.target, c.start]).sort(), original.clips.map((c) => [c.controlId, c.target, c.start]).sort());
  assert.notEqual(putBack.id, original.id, 'a new scene, not the old one');
});

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
console.log('\nanimation designer: all checks passed');
await browser.close();
server.close();
