// The Songs page in a real browser: the set on the left, a song built from sections on a
// timeline you drag (a block to move it, its edge to change its bars), a section's own editor,
// playing a song from the top, and songs moved by dragging or with Alt+arrows.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-songs-page-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18780, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().waitFor();
  const perf = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    return value.performance;
  });
  await page.evaluate(async () => {
    const s = await import('/src/CE_Application/stores/instrumentHost.js');
    for (const name of ['Pad', 'Keys', 'Full']) s.addScene(name);
  });
  await page.getByRole('button', { name: 'Performance', exact: true }).first().click();
  await page.getByTestId('perf-tab-setlist').click();
  const songsPage = page.getByTestId('perf-setlist');
  await songsPage.getByText('No songs yet', { exact: false }).waitFor();

  // Songs: + Song adds one and picks it for writing.
  await page.getByTestId('setlist-add-song').click();
  await page.getByTestId('setlist-add-song').click();
  assert.equal(await page.getByTestId('song-row').count(), 2);
  assert.equal(await page.getByTestId('setlist-song-name').inputValue(), 'Song 2', 'the new song is the one being written');
  await page.getByTestId('song-row').first().click();
  await page.getByTestId('setlist-song-name').fill('Glass Harbour');
  await page.getByTestId('setlist-song-name').press('Tab');
  const songId = (await perf()).setlist.items[0].itemId;
  assert.equal((await perf()).setlist.items[0].name, 'Glass Harbour');

  // Sections from scenes, drawn to scale.
  for (const scene of ['Pad', 'Keys', 'Full']) await page.getByTestId('song-add-section').selectOption({ label: scene });
  const sections = async () => (await perf()).setlist.items[0].sections;
  assert.deepEqual((await sections()).map((s) => s.sceneName), ['Pad', 'Keys', 'Full']);
  assert.deepEqual((await sections()).map((s) => s.bars), [8, 8, 8], 'a new section is eight bars');
  const blocks = page.getByTestId('song-section');
  assert.equal(await blocks.count(), 3);
  const widths = await blocks.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  assert.ok(Math.abs(widths[0] - widths[2]) <= 2, 'equal bars, equal widths');

  // Drag the first block's edge right by about four bars' worth.
  const strip = await page.locator('.strip').boundingBox();
  const pxPerBar = strip.width / 24;
  const edge = await blocks.first().getByTestId('song-section-edge').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + pxPerBar * 4, edge.y + edge.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.equal((await sections())[0].bars, 12, 'dragging the edge four bars right makes it twelve');
  assert.match(await page.locator('.timeline-head .label').innerText(), /28 bars/i);

  // Drag the last block to the front.
  const last = await blocks.nth(2).boundingBox();
  const first = await blocks.first().boundingBox();
  await page.mouse.move(last.x + 20, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 5, first.y + first.height / 2, { steps: 10 });
  await page.mouse.up();
  assert.deepEqual((await sections()).map((s) => s.sceneName), ['Full', 'Pad', 'Keys'], 'a block dragged to the front moves there');

  // Click a block: its own editor.
  await blocks.nth(1).click();
  const editor = page.getByTestId('song-section-editor');
  await editor.waitFor();
  await editor.getByTestId('song-section-bars').press('ArrowUp');
  assert.equal((await sections())[1].bars, 13, 'the section editor steps its bars');
  await editor.getByLabel('Section name').fill('Verse');
  await editor.getByLabel('Section name').press('Tab');
  assert.equal((await sections())[1].name, 'Verse');
  if (process.env.SONGS_SCREENSHOT) await page.screenshot({ path: process.env.SONGS_SCREENSHOT });

  // Play from the top: it becomes the current song and its sections run.
  await page.getByTestId('song-play').click();
  let p = await perf();
  assert.equal(p.setlist.currentIndex, 0);
  assert.equal(p.arrangement.playing, true);
  assert.equal(p.arrangement.songId, songId, 'what plays is this song\'s sections');
  assert.equal(await blocks.first().evaluate((el) => el.classList.contains('playing')), true);
  assert.equal(await page.getByTestId('song-add-section').count(), 0, 'a song playing its sections is not edited mid-way');
  await page.getByTestId('song-stop').click();
  assert.equal((await perf()).arrangement.playing, false);

  // Songs move with Alt+arrows, and by their grip.
  await page.getByTestId('song-row').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  p = await perf();
  assert.equal(p.setlist.items[1].itemId, songId, 'Alt+Down moves the song down');
  assert.equal(p.setlist.currentIndex, 1, 'and it stays the current song');
  const grip = await page.getByTestId('song-row').nth(1).locator('.grip').boundingBox();
  const top = await page.getByTestId('song-row').first().boundingBox();
  await page.mouse.move(grip.x + 4, grip.y + 4);
  await page.mouse.down();
  await page.mouse.move(grip.x + 4, top.y + 2, { steps: 8 });
  await page.mouse.up();
  assert.equal((await perf()).setlist.items[0].itemId, songId, 'dragging the grip up moves it back to the top');

  // Remove a section.
  await page.getByTestId('song-row').first().click();
  await blocks.first().click();
  await page.getByTestId('song-section-remove').click();
  assert.equal((await sections()).length, 2);

  for (const width of [1280, 900, 700]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await songsPage.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, `the page fits ${width} px`);
  }
  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('songsPage: songs, sections drawn to scale, edge and block drags, the section editor, play from the top and moving songs work');
} finally {
  await browser.close();
  await server.close();
}
