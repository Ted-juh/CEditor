// The Sounds page in a real browser: the library with the whole screen. The rail, sortable
// columns, several sounds selected and acted on at once, collections filled by dragging, notes,
// "more like this, but brighter", the side-by-side comparison, the map walked with the arrow
// keys, history, one audition bar, and the way back to the rack.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-sounds-page-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18775, strictPort: true },
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
  const shot = async (name) => {
    if (process.env.SOUNDS_SCREENSHOTS) await page.screenshot({ path: `${process.env.SOUNDS_SCREENSHOTS}/${name}.png` });
  };
  const library = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostLibrary.subscribe((v) => { value = v; })();
    return value;
  });
  const record = async (name) => (await library()).records.find((r) => r.name === name);
  const browserState = () => page.evaluate(async () => {
    const { sounds } = await import('/src/CE_Application/sections/sounds/soundsBrowser.svelte.js');
    return { history: [...sounds.history], at: sounds.historyAt, selection: [...sounds.selection], sort: sounds.query.sort,
             descending: sounds.query.sortDescending, selected: sounds.selected?.name ?? '' };
  });
  const rowNames = () => page.getByTestId('preset-row').locator('.preset-name').allInnerTexts();

  // From the dock to the page, and the page's three columns.
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();
  // The dock opens on Sounds; clicking the tab you are on would fold it away.
  if (await page.getByTestId('host-sound-browser').count() === 0) await page.getByTestId('dock-tab-sounds').click();
  await page.getByTestId('preset-row').first().waitFor();
  await shot('dock');
  await page.getByTestId('sounds-open-page').click();
  const sounds = page.getByTestId('host-primary-sounds');
  await sounds.waitFor();
  assert.equal(await sounds.getByTestId('rail-plugins').isVisible(), true, 'the rail is always there');
  assert.equal(await sounds.getByTestId('browser-inspector').isVisible(), true, 'and so is the inspector');
  assert.equal(await sounds.getByTestId('audition-bar').isVisible(), true);
  assert.equal(await page.getByLabel('Sounds target part').count(), 1, 'the part it loads into is named');

  // Paging: the page asks for the library a slice at a time and fetches the next slice as the
  // list nears the end of what it holds. Four rows a page makes the demo library take three.
  const paged = await page.evaluate(async () => {
    const { sounds } = await import('/src/CE_Application/sections/sounds/soundsBrowser.svelte.js');
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    sounds.pageSize = 4;
    sounds.ask(sounds.query);
    await new Promise((resolve) => setTimeout(resolve, 400));
    let value; store.hostLibrary.subscribe((v) => { value = v; })();
    sounds.pageSize = 400;
    return { held: value.records.length, matched: value.counts.matched, ids: new Set(value.records.map((r) => r.recordId)).size };
  });
  assert.deepEqual(paged, { held: 12, matched: 12, ids: 12 }, 'three pages of four join into the whole list, once each');

  // Sorting: by the column, and the same column again turns it round.
  await sounds.getByTestId('sort-name').click();
  let names = await rowNames();
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), `sorted by name (${names})`);
  await sounds.getByTestId('sort-name').click();
  const descending = await rowNames();
  assert.equal(descending[0], names[names.length - 1], 'the same column again sorts the other way');
  assert.deepEqual([(await browserState()).sort, (await browserState()).descending], ['name', true]);
  await sounds.getByTestId('sort-name').click();
  names = await rowNames();

  // Several at once: click, shift-click, act on all of them.
  const rows = sounds.getByTestId('preset-row');
  await rows.nth(0).locator('.preset-pick').click();
  await rows.nth(2).locator('.preset-pick').click({ modifiers: ['Shift'] });
  assert.equal((await browserState()).selection.length, 3, 'shift takes the run');
  await rows.nth(4).locator('.preset-pick').click({ modifiers: ['Control'] });
  assert.equal((await browserState()).selection.length, 4, 'ctrl adds one');
  const bulk = sounds.getByTestId('sounds-bulk');
  assert.match(await bulk.innerText(), /4 selected/);
  await bulk.getByTestId('bulk-rate').click();
  await bulk.getByTestId('bulk-rate-value').nth(3).click();
  for (const name of names.slice(0, 3)) assert.equal((await record(name)).rating, 4, `${name} rated four`);
  await bulk.getByTestId('bulk-tag').click();
  await bulk.getByTestId('bulk-tag-name').fill('warm');
  await bulk.getByTestId('bulk-tag-name').press('Enter');
  assert.ok((await record(names[0])).tags.includes('Warm'), 'tagged, in the vocabulary\'s spelling');
  await shot('bulk');

  // The side by side.
  await rows.nth(0).locator('.preset-pick').click();
  const measured = (await library()).records.filter((r) => r.sonic).map((r) => r.name);
  for (const [i, name] of measured.slice(0, 3).entries()) {
    await sounds.getByTestId('preset-row').filter({ hasText: name }).first().locator('.preset-pick')
      .click({ modifiers: i === 0 ? [] : ['Control'] });
  }
  await sounds.getByTestId('bulk-compare').click();
  const shootout = sounds.getByTestId('sounds-shootout');
  await shootout.waitFor();
  assert.equal(await shootout.getByTestId('shootout-card').count(), 3);
  assert.equal(await shootout.getByTestId('shootout-envelopes').locator('path').count(), 3, 'the envelopes over each other');
  await page.keyboard.press('2');
  assert.match(await shootout.getByTestId('shootout-card').nth(1).getAttribute('class'), /\bon\b/, 'key 2 plays the second');
  await shot('shootout');
  await page.keyboard.press('Escape');
  assert.equal(await shootout.count(), 0, 'Esc closes the comparison, not the page');
  assert.equal(await sounds.count(), 1);

  // Collections: a new one, filled by dragging a row onto it.
  await sounds.getByTestId('bulk-clear').click();
  await sounds.getByTestId('new-collection').click();
  await sounds.getByTestId('new-collection-name').fill('Tonight');
  await sounds.getByTestId('new-collection-name').press('Enter');
  const tonight = sounds.locator('[data-testid=collection][data-collection="Tonight"]');
  assert.match(await tonight.innerText(), /drop here/);
  const dragged = names[1];
  await sounds.getByTestId('preset-row').filter({ hasText: dragged }).first().dragTo(tonight);
  assert.ok((await record(dragged)).collections.includes('Tonight'), 'dropping a row files it');

  // The inspector: notes, collections, and more like this but brighter.
  const rowFor = (name) => sounds.getByTestId('preset-row').filter({ has: page.locator('.preset-name', { hasText: new RegExp(`^${name}$`) }) }).first();
  const warm = rowFor('Warm Pad');
  await warm.locator('.preset-pick').click();
  const notes = sounds.getByTestId('record-notes');
  await notes.fill('Under the verse vocal');
  await notes.blur();
  assert.equal((await record('Warm Pad')).notes, 'Under the verse vocal', 'notes are kept when you leave the box');
  await sounds.getByTestId('record-collection').filter({ hasText: 'Friday' }).click();
  assert.ok((await record('Warm Pad')).collections.includes('Friday'));
  await sounds.getByTestId('nudge-brighter').click();
  assert.match(await sounds.getByTestId('browser-inspector').innerText(), /More like this, but brighter/i);
  await shot('inspector');

  // History: load two, go back to the first.
  await sounds.getByTestId('sound-load').click();
  await rowFor('My Growl').locator('.preset-pick').click();
  await sounds.getByTestId('sound-load').click();
  const before = await browserState();
  assert.deepEqual(before.history.slice(-2).length, 2);
  await sounds.getByTestId('sounds-back').click();
  const after = await browserState();
  assert.equal(after.at, before.at - 1, 'back steps through what you loaded');
  assert.equal(after.selected, 'Warm Pad', 'and shows it');

  // One audition bar, with the root on a keyboard.
  const bar = sounds.getByTestId('audition-bar');
  assert.equal(await bar.locator('[data-testid=audition-phrase] button').count(), 5, 'note, chord, scale, riff, your last bars');
  await bar.locator('[data-testid=audition-phrase] [data-value=chord]').click();
  assert.equal(await bar.getByTestId('audition-root-keys').isVisible(), true, 'a phrase of your own has a root, picked on a keyboard');
  await bar.getByTestId('audition-root-keys').locator('rect').nth(10).click();
  const settings = await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    let audition; store.hostAudition.subscribe((v) => { audition = v; })();
    return { phrase: value.rack.presetAudition.phrase, root: value.rack.presetAudition.rootNote, mode: audition.phrase };
  });
  assert.deepEqual([settings.phrase, settings.mode], ['chord', 'phrase'], 'the preview plays the same phrase as the load');

  // The map fills the page and walks with the arrow keys.
  await sounds.locator('[data-testid=browser-view] [data-value=map]').click();
  const map = sounds.getByTestId('map-surface');
  assert.ok((await map.boundingBox()).height > 300, 'the map takes the height it has');
  assert.ok(await sounds.getByTestId('map-dot').count() >= 5);
  const start = (await browserState()).selected;
  await sounds.getByTestId('map-dot').first().click();
  await map.focus();
  const was = (await browserState()).selected;
  let moved = false;
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    if ((await browserState()).selected !== was) { moved = true; break; }
  }
  assert.ok(moved, `an arrow walks to a neighbour (from ${was}, started at ${start})`);
  await shot('map');
  await sounds.locator('[data-testid=browser-view] [data-value=list]').click();
  await shot('page');

  // Esc goes back to the rack.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByTestId('host-primary-sounds').count(), 0, 'Esc returns to the rack');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('soundsPage: rail, sort, several at once, collections, notes, nudges, side by side, history, map walk and Esc work');
} finally {
  await browser.close();
  await server.close();
}
