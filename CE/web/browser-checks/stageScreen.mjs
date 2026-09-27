// The stage screen in a real browser: the whole set with arm-then-go, keys and a page turner's
// Page Down, the song's notes in full, the timers against a planned length, scenes on number
// keys, macro faders, trouble with a targeted fix, hold-to-panic, and the three layouts.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-stage-screen-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18776, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().waitFor();
  const shot = async (name) => {
    if (process.env.STAGE_SCREENSHOTS) await page.screenshot({ path: `${process.env.STAGE_SCREENSHOTS}/${name}.png` });
  };
  const state = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    return value;
  });

  // A three-song set with notes and planned lengths, made in Build before locking.
  await page.evaluate(async () => {
    const s = await import('/src/CE_Application/stores/instrumentHost.js');
    let st; s.hostState.subscribe((v) => { st = v; })();
    for (const name of ['Verse', 'Chorus', 'Break']) s.addScene(name);
    s.hostState.subscribe((v) => { st = v; })();
    const scenes = st.performance.scenes;
    s.addSetlistItem(scenes[0].sceneId, 'Glass Harbour');
    s.addSetlistItem(scenes[1].sceneId, 'Northern Lines');
    s.addSetlistItem(scenes[2].sceneId, 'Paper Moon');
    s.hostState.subscribe((v) => { st = v; })();
    const items = st.performance.setlist.items;
    s.setSetlistItem(items[0].itemId, { notes: 'INTRO: pad only.\nCHORUS: scene 2, strings in.', plannedSeconds: 245 });
    s.setSetlistItem(items[1].itemId, { tempo: 124, plannedSeconds: 300 });
    s.addMacro();
  });

  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  const stage = page.getByTestId('host-stage-view');
  await stage.waitFor();
  for (const id of ['stage-setlist', 'stage-now', 'stage-next', 'stage-notes', 'stage-controls', 'stage-parts', 'stage-macros'])
    assert.equal(await stage.getByTestId(id).count(), 1, `${id} is on the Full layout`);
  assert.equal(await stage.getByTestId('stage-panic').isVisible(), true, 'panic is always on screen');
  assert.match(await stage.getByTestId('stage-clock').innerText(), /\d{1,2}:\d{2}/);

  // The keys a foot switch or page turner sends run the set.
  await page.keyboard.press('PageDown');
  assert.equal((await state()).performance.setlist.currentIndex, 0, 'Page Down starts the set');
  assert.equal(await stage.getByTestId('stage-song-name').innerText(), 'Glass Harbour');
  assert.match(await stage.getByTestId('stage-notes-text').innerHTML(), /<mark[^>]*>INTRO<\/mark>/, 'cues in capitals stand out');
  assert.match(await stage.getByTestId('stage-now').innerText(), /Scene\s+Verse/, 'the scene the song recalled');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state()).performance.setlist.currentIndex, 1, 'arrow right is the next song');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state()).performance.setlist.currentIndex, 0);
  await page.waitForTimeout(2100);
  assert.match(await stage.getByTestId('stage-song-timer').innerText(), /^0:0[1-9]$/, 'the song timer runs');
  assert.match(await stage.getByTestId('stage-now').evaluate((el) => el.closest('main').querySelector('.stage-status').innerText), /\/ 4:05/,
    'against its planned length');

  // Arm, then go: one tap never changes the song.
  const songs = stage.getByTestId('stage-song');
  await songs.nth(2).click();
  assert.equal((await state()).performance.setlist.currentIndex, 0, 'the first tap only arms');
  assert.match(await songs.nth(2).getAttribute('class'), /armed/);
  await songs.nth(2).click();
  assert.equal((await state()).performance.setlist.currentIndex, 2, 'the second goes');
  await page.keyboard.press('PageUp');

  // Notes size, scenes on number keys, play on Space.
  const size = () => stage.getByTestId('stage-notes-text').evaluate((el) => parseFloat(el.style.fontSize));
  const before = await size();
  await page.keyboard.press('n');
  assert.equal(await size(), before + 2, 'N makes the notes bigger');
  await page.keyboard.press('2');
  const scene2 = (await state()).performance.scenes[1].sceneId;
  assert.equal((await state()).performance.currentSceneId, scene2, 'number keys are scenes');
  await page.keyboard.press(' ');
  assert.equal((await state()).performance.transport.playing, true, 'Space plays');
  await page.keyboard.press(' ');

  // A macro fader.
  const fader = stage.getByTestId('stage-macro').first();
  const box = await fader.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2, { steps: 6 });
  await page.mouse.up();
  assert.ok((await state()).rack.macros[0].value > 0.7, 'a finger moves the macro');

  // Trouble with the fix aimed at the part: the demo keyboard has a stuck note on Stage Keys.
  const trouble = stage.getByTestId('stage-trouble');
  assert.match(await trouble.innerText(), /Stuck note/);
  await shot('full');
  await trouble.getByTestId('stage-trouble-fix').filter({ hasText: 'Silence' }).first().click();
  assert.equal(await stage.getByTestId('stage-trouble').count(), 0, 'silencing the part clears it');

  // Hold P to panic; a tap does nothing.
  // A held note with no part named, which only a full panic clears in the mock as natively.
  await page.evaluate(async () => {
    const s = await import('/src/CE_Application/stores/instrumentHost.js');
    s.hostState.update((st) => ({ ...st, reliability: { ...st.reliability, midi: { ...st.reliability.midi,
      issues: [...st.reliability.midi.issues, { kind: 'heldNote', key: 'held-e2', noteName: 'E2', text: 'E2 has been held a while.', parts: [] }] } } }));
  });
  await stage.getByTestId('stage-trouble').waitFor();
  const heldNotes = async () => (await state()).reliability.midi.issues.filter((i) => i.kind === 'heldNote').length;
  await page.keyboard.down('p');
  await page.waitForTimeout(150);
  await page.keyboard.up('p');
  assert.equal(await heldNotes(), 1, 'a tap on P does nothing');
  await page.keyboard.down('p');
  await page.waitForTimeout(700);
  await page.keyboard.up('p');
  assert.equal(await heldNotes(), 0, 'holding P is a panic');

  // The layouts, and daylight contrast.
  await stage.getByTestId('stage-layout-minimal').click();
  assert.equal(await stage.getByTestId('stage-setlist').count(), 0, 'Minimal leaves out the rail');
  assert.equal(await stage.getByTestId('stage-controls').count(), 0);
  const big = await stage.getByTestId('stage-song-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(big >= 90, `and the song is very large (${big}px)`);
  await shot('minimal');
  await stage.getByTestId('stage-layout-controls').click();
  assert.equal(await stage.getByTestId('stage-controls').count(), 1);
  assert.equal(await stage.getByTestId('stage-notes').count(), 0, 'Controls leaves out the notes');
  await stage.getByTestId('stage-daylight').click();
  assert.match(await stage.getAttribute('class'), /daylight/);
  await shot('controls-daylight');
  await stage.getByTestId('stage-daylight').click();
  await stage.getByTestId('stage-layout-full').click();

  // Narrow: one column, nothing wider than the window.
  await page.setViewportSize({ width: 700, height: 1000 });
  assert.equal(await stage.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, 'no sideways scroll at 700 px');
  await page.setViewportSize({ width: 1600, height: 1000 });

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('stageScreen: the set, keys, notes, timers, scenes, macros, trouble, panic and layouts work on stage');
} finally {
  await browser.close();
  await server.close();
}
