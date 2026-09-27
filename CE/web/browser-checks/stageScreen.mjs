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

  // Build: adding a scene to the setlist says so on the scene.
  await page.getByRole('button', { name: 'Performance', exact: true }).first().click();
  await page.getByRole('button', { name: 'Clips & scenes', exact: true }).click();
  const verseRow = page.getByTestId('perf-scene').first();
  assert.equal(await verseRow.getByTestId('scene-in-setlist').innerText(), 'in setlist');
  await verseRow.getByTestId('scene-add-song').click();
  assert.equal(await verseRow.getByTestId('scene-in-setlist').innerText(), 'in setlist ×2', '+ Song is acknowledged on the row');
  assert.equal((await state()).performance.setlist.items.at(-1).name, 'Song 4', 'a new song has its own name, not its scene');

  // Live setup: songs are made and named here, each with the scene it plays chosen beside it.
  await page.getByRole('button', { name: 'Live setup', exact: true }).click();
  await page.getByRole('button', { name: 'Setlist', exact: true }).click();
  await page.getByTestId('setlist-add-song').click();
  const added = (await state()).performance.setlist.items.at(-1);
  assert.equal(added.name, 'Song 5');
  assert.equal(added.sceneId, (await state()).performance.scenes[0].sceneId, 'a new song plays the scene of the song before it');
  await page.getByTestId('setlist-scene').last().selectOption({ label: 'Break' });
  assert.equal((await state()).performance.setlist.items.at(-1).sceneName, 'Break', 'and its scene is chosen by name');
  await shot('build-setlist');

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
  assert.match(await stage.getByTestId('stage-now').innerText(), /Now · song 1 of 5/i);
  assert.match(await stage.getByTestId('stage-now').innerText(), /scene\s+Verse/i, 'the scene the song recalled');
  assert.match(await stage.getByTestId('stage-song').first().innerText(), /scene Verse/, 'every song in the list says which scene it plays');
  assert.match(await stage.getByTestId('stage-next').innerText(), /scene Chorus/, 'and so does the next song');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state()).performance.setlist.currentIndex, 1, 'arrow right is the next song');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state()).performance.setlist.currentIndex, 0);
  await page.waitForTimeout(2100);
  assert.match(await stage.getByTestId('stage-song-timer').innerText(), /^0:0[1-9]$/, 'the song timer runs');
  assert.match(await stage.getByTestId('stage-now').evaluate((el) => el.closest('main').querySelector('.stage-status').innerText), /\/ 4:05/,
    'against its planned length');
  assert.match(await stage.getByTestId('stage-song-progress').innerText(), /^4:0\d left$/, 'and the Now panel shows how much of it is left');

  // Arm, then go: one tap never changes the song.
  const songs = stage.getByTestId('stage-song');
  await songs.nth(2).click();
  assert.equal((await state()).performance.setlist.currentIndex, 0, 'the first tap only arms');
  assert.match(await songs.nth(2).getAttribute('class'), /armed/);
  await songs.nth(2).click();
  assert.equal((await state()).performance.setlist.currentIndex, 2, 'the second goes');
  await page.keyboard.press('PageUp');

  // Numbers are songs, as the list numbers them: once arms, twice goes. Shift+number is a scene.
  await page.keyboard.press('2');
  assert.equal((await state()).performance.setlist.currentIndex, 1, 'from song 3, Page Up is song 2');
  await page.keyboard.press('3');
  assert.equal((await state()).performance.setlist.currentIndex, 1, 'one press of 3 only arms song 3');
  assert.match(await songs.nth(2).getAttribute('class'), /armed/);
  await page.keyboard.press('3');
  assert.equal((await state()).performance.setlist.currentIndex, 2, 'the second goes');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  assert.equal((await state()).performance.setlist.currentIndex, 0, 'Enter goes to the armed song');

  // Notes size, scenes on Shift+number, play on Space.
  const size = () => stage.getByTestId('stage-notes-text').evaluate((el) => parseFloat(el.style.fontSize));
  const before = await size();
  await page.keyboard.press('n');
  assert.equal(await size(), before + 2, 'N makes the notes bigger');
  await page.keyboard.press('Shift+Digit2');
  const scene2 = (await state()).performance.scenes[1].sceneId;
  assert.equal((await state()).performance.currentSceneId, scene2, 'Shift+number keys are scenes');
  assert.equal((await state()).performance.setlist.currentIndex, 0, 'and leave the song alone');
  assert.match(await stage.getByTestId('stage-now').innerText(), /scene\s+Chorus/i, 'the Now panel names the scene that changed');
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

  // PANIC says it fired, then lets go: no ring left behind that reads as "still on".
  const panicButton = stage.getByTestId('stage-panic');
  await panicButton.click();
  assert.equal(await panicButton.innerText(), 'ALL OFF');
  assert.equal(await panicButton.evaluate((el) => document.activeElement === el), false, 'a clicked button does not keep focus');
  await page.waitForTimeout(1400);
  assert.equal(await panicButton.innerText(), 'PANIC');

  // The clocks restart from here on a click.
  await page.waitForTimeout(1100);
  await stage.getByTestId('stage-reset-clock').click();
  const clocks = (await state()).performance.setlist;
  assert.ok(Date.now() - clocks.startedAtMs < 1000 && clocks.startedAtMs === clocks.songStartedAtMs, 'the set and song clocks restart together');

  // However long the audio device's name, PANIC stays at the top right.
  await page.evaluate(async () => {
    const s = await import('/src/CE_Application/stores/instrumentHost.js');
    s.hostState.update((st) => ({ ...st, audio: { ...st.audio, enabled: true, running: true,
      deviceName: 'SteelSeries Sonar - Gaming (SteelSeries Sonar Virtual Audio Device)' } }));
  });
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const [clockBox, panicBox] = [await stage.getByTestId('stage-clock').boundingBox(), await panicButton.boundingBox()];
    assert.ok(panicBox.y < clockBox.y + clockBox.height, `PANIC is on the clock's line at ${width} px`);
    assert.ok(panicBox.x + panicBox.width > width - 60, `at the right edge at ${width} px`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await shot('status-long-device');

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
