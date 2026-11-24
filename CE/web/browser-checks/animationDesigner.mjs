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

if (failures.length) {
  console.error('\nconsole/page errors:\n' + failures.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
console.log('\nanimation designer: all checks passed');
await browser.close();
server.close();
