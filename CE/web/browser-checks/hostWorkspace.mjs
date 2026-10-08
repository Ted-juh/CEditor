// The HoSTage workspace itself, in a real browser: the dock between the rack and the part editor
// has a visible grip that resizes it, and every text field selects all its text on click.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-host-workspace-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18773, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();

  // The dock: a grip you can see, which drags the editor taller.
  const dock = page.getByTestId('host-dock');
  const grip = dock.getByRole('separator', { name: 'Resize the dock' });
  const gripBg = await grip.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(gripBg, 'rgba(0, 0, 0, 0)', 'the grip is visible, not a transparent strip');
  await page.getByTestId('dock-tab-zone').click();
  const before = (await dock.boundingBox()).height;
  const g = await grip.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  // In steps, with a pause: a state push mid-drag used to re-fit the dock and snap it back.
  for (let i = 1; i <= 10; i++) { await page.mouse.move(g.x + g.width / 2, g.y - 50 * i); await page.waitForTimeout(60); }
  await page.mouse.up();
  const after = (await dock.boundingBox()).height;
  assert.ok(after > before + 300, `dragging the grip up gives the editor room (${before} -> ${after})`);
  assert.ok(after > 600, 'past the old 520 px cap, in a tall window');

  // Select all on click, anywhere in HoSTage.
  await page.getByTestId('dock-tab-sounds').click();
  const search = page.getByPlaceholder(/Search sounds/);
  await search.fill('warm pad');
  await page.getByTestId('dock-tab-zone').click();
  await page.getByTestId('dock-tab-sounds').click();
  await search.click();
  const selected = await search.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  assert.deepEqual(selected, [0, 8, 8], 'clicking a text field selects all of it');
  await search.click();
  const caret = await search.evaluate((el) => el.selectionEnd - el.selectionStart);
  assert.equal(caret, 0, 'a second click places the caret, as usual');

  const state = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    return value;
  });

  // Transport: drag-or-type tempo, tap tempo, beats per bar and the beat unit as toggles.
  const tempo = page.getByTestId('host-tempo');
  await tempo.press('ArrowUp');
  assert.equal((await state()).performance.transport.tempo, 121, 'the tempo steps with the arrow keys');
  await tempo.press('Shift+ArrowUp');
  assert.equal((await state()).performance.transport.tempo, 121.1, 'and in tenths with Shift');
  await tempo.click();
  await page.keyboard.type('98');
  await page.keyboard.press('Enter');
  assert.equal((await state()).performance.transport.tempo, 98, 'or is typed');
  const tap = page.getByTestId('host-tap-tempo');
  for (let i = 0; i < 4; i++) { await tap.click(); await page.waitForTimeout(500); }
  const tapped = (await state()).performance.transport.tempo;
  assert.ok(tapped > 100 && tapped < 125, `four taps half a second apart set about 120 (${tapped})`);
  await page.getByTestId('host-ts-denominator').press('ArrowUp');
  // The command area is aligned to the end, so when it is too wide it runs left, under Build and
  // Stage, where the scroll width does not see it. Measure that too.
  for (const width of [1280, 1200, 1121]) {
    await page.setViewportSize({ width, height: 1400 });
    const header = await page.locator('.host-header').evaluate((el) => {
      const mode = el.querySelector('.host-mode').getBoundingClientRect();
      const first = el.querySelector('.host-command-area').firstElementChild.getBoundingClientRect();
      const apart = first.left >= mode.right || first.top >= mode.bottom;
      return { scroll: el.scrollWidth, client: el.clientWidth, apart };
    });
    assert.ok(header.scroll <= header.client, `the header fits a ${width} px window (${header.scroll} > ${header.client})`);
    assert.ok(header.apart, `at ${width} px, Undo does not sit on top of Build and Stage`);
  }
  await page.setViewportSize({ width: 1400, height: 1400 });
  await page.getByTestId('host-ts-numerator').press('ArrowUp');
  const ts = (await state()).performance.transport;
  assert.deepEqual([ts.numerator, ts.denominator], [5, 8], 'beats per bar and the beat unit');
  assert.equal(await page.getByTestId('host-beat-dots').locator('i').count(), 5, 'one beat dot per beat');

  // Params: bars you drag, numbers you click to type, and where each parameter sits.
  await page.getByTestId('dock-tab-params').click();
  const params = page.getByTestId('host-parameters');
  await params.getByRole('button', { name: /Filter/ }).click().catch(() => {});
  const cutoff = params.getByRole('slider', { name: 'Cutoff' });
  await cutoff.waitFor();
  const cbox = await cutoff.boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width / 2 + cbox.width * 0.3, cbox.y + cbox.height / 2, { steps: 6 });
  await page.mouse.up();
  const moved = Number(await cutoff.getAttribute('aria-valuenow'));
  assert.ok(moved > 0.7, `dragging the bar right raises the value (${moved})`);
  await cutoff.dblclick();
  assert.ok(Math.abs(Number(await cutoff.getAttribute('aria-valuenow')) - 0.5) < 0.02, 'a double-click resets to the default');
  await params.getByTestId('param-bar-value').first().click();
  assert.equal(await params.getByLabel('Type a value for Cutoff').count(), 1, 'one click on the number opens typing');
  await page.keyboard.press('Escape');

  // Zone: the range on a keyboard, the velocity band, channel and transpose.
  await page.getByTestId('dock-tab-zone').click();
  const zone = page.getByTestId('host-zone');
  const keys = zone.getByTestId('zone-keys');
  const kbox = await keys.boundingBox();
  const low = zone.getByTestId('zone-low');
  const lbox = await low.boundingBox();
  await page.mouse.move(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(kbox.x + kbox.width * 0.4, lbox.y + lbox.height / 2, { steps: 8 });
  await page.mouse.up();
  const part0 = () => state().then((st) => st.rack.parts[0]);
  const afterLow = await part0();
  assert.ok(afterLow.keyLow > 40 && afterLow.keyLow < 60, `dragging the low edge sets the lowest key (${afterLow.keyLow})`);
  const vhigh = zone.getByTestId('zone-vel-high');
  const vbox = await vhigh.boundingBox();
  const vtrack = await zone.getByTestId('zone-velocity').boundingBox();
  await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(vtrack.x + vtrack.width * 0.5, vbox.y + vbox.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterVel = await part0();
  assert.ok(afterVel.velocityHigh > 55 && afterVel.velocityHigh < 72, `the velocity band's top edge drags (${afterVel.velocityHigh})`);
  await zone.getByTestId('zone-channel').press('ArrowUp');
  await zone.getByTestId('zone-transpose').press('ArrowDown');
  const afterRules = await part0();
  assert.deepEqual([afterRules.channel, afterRules.transpose], [1, -1], 'channel and transpose step');
  assert.match(await zone.getByTestId('zone-summary').innerText(), /channel 1 · -1 st/);
  await zone.getByTestId('zone-all').click();
  assert.equal((await part0()).keyLow, 0, '"every key" puts the range back');

  // Part rows: the level in dB, the pan as a knob that a double-click centres.
  const partRow = page.locator('[data-testid=part-volume]').first();
  await partRow.click();
  await page.keyboard.type('-6');
  await page.keyboard.press('Enter');
  const vol = (await part0()).volume;
  assert.ok(Math.abs(vol - 0.501) < 0.01, `typing -6 dB sets half the level (${vol})`);
  const pan = page.getByTestId('part-pan').first();
  await pan.press('ArrowRight');
  await pan.press('ArrowRight');
  assert.ok((await part0()).pan > 0, 'the pan knob turns');
  await pan.dblclick();
  assert.equal((await part0()).pan, 0, 'and a double-click centres it');

  // Mixer: pan and sends as knobs.
  await page.getByRole('button', { name: 'Mixer', exact: true }).first().click();
  const mixerPan = page.getByTestId('mixer-pan').first();
  await mixerPan.press('ArrowLeft');
  assert.ok((await part0()).pan < 0, 'the mixer pan knob turns');
  await mixerPan.dblclick();
  assert.equal((await part0()).pan, 0);

  // Macros and returns: the macro is a knob, each target a band whose ends you drag.
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();
  await page.getByTestId('dock-tab-rack').click();
  await page.getByTestId('host-add-macro').click();
  const macroId = (await state()).rack.macros.at(-1).macroId;
  const partId = (await state()).rack.parts[0].partId;
  await page.evaluate(async ([id, part]) => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.addMacroTarget(id, part, 'cutoff');
  }, [macroId, partId]);
  const macro = async () => (await state()).rack.macros.find((m) => m.macroId === macroId);
  const band = page.getByTestId('macro-band').last();
  await band.scrollIntoViewIfNeeded();
  const track = await band.locator('.track').boundingBox();
  const start = await band.getByTestId('macro-band-start').boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.3, start.y + start.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(Math.abs((await macro()).targets[0].rangeMin - 0.3) < 0.03, 'dragging the start end sets where the macro at 0 puts it');
  const end = await band.getByTestId('macro-band-end').boundingBox();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.1, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
  const reversed = (await macro()).targets[0];
  assert.equal(reversed.inverted, true, 'dragging the ends past each other reverses the target');
  assert.ok(reversed.rangeMin < 0.15 && reversed.rangeMax > 0.25, `and keeps both ends (${reversed.rangeMin}-${reversed.rangeMax})`);
  assert.match(await band.innerText(), /reversed/);
  if (process.env.HOST_SCREENSHOTS) await page.getByTestId('host-macros').screenshot({ path: `${process.env.HOST_SCREENSHOTS}/macros.png` });
  await page.getByTestId('macro-knob').last().press('ArrowUp');
  assert.ok((await macro()).value > 0, 'the macro knob turns');
  await page.getByTestId('host-add-return').click();
  const returnLevel = page.getByTestId('return-level').last();
  const level = (await state()).rack.returns.at(-1).level;
  await returnLevel.press('ArrowDown');
  assert.ok((await state()).rack.returns.at(-1).level < level, 'a return level is a knob');

  // A bus's effects, in the same tab: added, reordered, bypassed and removed. Effects dropped on a
  // bus in the canvas used to be out of reach once they were there — the mixer only counted them.
  await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.addBus('Synths');
  });
  const busFx = page.getByTestId('host-bus-fx').last();
  await busFx.scrollIntoViewIfNeeded();
  const busEffects = async () => (await state()).rack.buses.at(-1).effects;
  // Wait for the state to agree rather than read it the instant after a click.
  const busNames = async (want) => {
    let names = [];
    for (let i = 0; i < 40; i += 1) {
      names = (await busEffects()).map((e) => e.pluginName);
      if (JSON.stringify(names) === JSON.stringify(want)) break;
      await page.waitForTimeout(50);
    }
    return names;
  };
  await busFx.locator('select').selectOption('mock-reverb');
  await busFx.locator('select').selectOption('mock-comp');
  assert.deepEqual(await busNames(['Sweet Reverb', 'Big Comp']), ['Sweet Reverb', 'Big Comp'], 'effects are added to the bus');
  await busFx.getByRole('button', { name: 'Move Big Comp earlier in the chain' }).click();
  assert.deepEqual(await busNames(['Big Comp', 'Sweet Reverb']), ['Big Comp', 'Sweet Reverb'], 'and reordered');
  await busFx.getByLabel('Bypass Sweet Reverb').click();
  assert.equal((await busEffects()).find((e) => e.pluginName === 'Sweet Reverb').bypassed, true, 'and bypassed');
  const removeComp = busFx.locator('.fx-row').first().getByTitle('Remove this effect');
  await removeComp.click();
  await busFx.locator('.fx-row').first().getByTitle('Click again to confirm').click();
  assert.deepEqual(await busNames(['Sweet Reverb']), ['Sweet Reverb'], 'and removed, after the second click');

  // Try as player: the editor runs its show the way a player will. Making pages, describing a
  // controller and the Project utility go; playing stays; and all of it comes back.
  const tryPlayer = page.getByTestId('host-try-player');
  const addPage = page.getByTestId('host-add-page');
  await addPage.scrollIntoViewIfNeeded();
  await addPage.click();
  const pageCount = async () => (await state()).rack.pages.length;
  const made = await pageCount();
  assert.ok(made >= 1, 'the editor makes a control page');
  await tryPlayer.click();
  assert.equal(await tryPlayer.innerText(), 'Back to editor');
  assert.equal((await state()).player, true);
  assert.equal(await addPage.count(), 0, 'trying the player, the rack offers no + Page');
  assert.equal(await page.getByTestId('host-utility-project').count(), 0, 'and no Project utility');
  await page.getByTestId('host-workspace-controller').click();
  await page.getByTestId('surface-page').waitFor();
  for (const id of ['surface-describe', 'surface-page-add', 'surface-page-auto', 'surface-page-remove', 'surface-parameters']) {
    assert.equal(await page.getByTestId(id).count(), 0, `the controller hides ${id} in a player`);
  }
  await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.addControlPage();
  });
  assert.equal(await pageCount(), made, 'a page asked for anyway is refused');
  const refusal = await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostLastError.subscribe((v) => { value = v; })();
    return value;
  });
  assert.match(refusal, /made in the HoSTage editor/, 'and says where pages are made');
  await page.getByTestId('host-try-player').click();
  assert.equal((await state()).player, false);
  await page.getByTestId('surface-describe').waitFor();
  assert.equal(await page.getByTestId('host-utility-project').count(), 1, 'back in the editor, everything returns');

  // Shows: the rig saved with everything its songs need, changed, gone back to, and switched.
  await page.getByTestId('host-utility-shows').click();
  await page.getByTestId('host-shows-panel').waitFor();
  assert.ok(await page.getByTestId('show-import').isDisabled(), 'importing a file is the host\'s, not the preview\'s');
  await page.getByTestId('show-new-name').fill('Friday: Paradiso');
  await page.getByTestId('show-save-as').click();
  assert.equal(await page.getByTestId('show-current-name').innerText(), 'Friday: Paradiso');
  const partCount = async () => (await state()).rack.parts.length;
  const addPartFromStore = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.addRackPart();
  });
  const savedParts = await partCount();
  await addPartFromStore();
  await page.getByTestId('show-changed').waitFor();
  const revert = page.getByTestId('show-revert');
  await revert.click();
  assert.equal(await partCount(), savedParts + 1, 'Back to the show asks before it throws changes away');
  await revert.click();
  assert.equal(await partCount(), savedParts, 'and on the second click it does');
  assert.equal(await page.getByTestId('show-changed').count(), 0);

  await page.getByTestId('show-new-name').fill('Rehearsal');
  await page.getByTestId('show-save-as').click();
  assert.equal(await page.getByTestId('show-row').count(), 2);
  await page.getByTestId('show-row').filter({ hasText: 'Friday' }).getByTestId('show-open').click();
  assert.match(await page.getByTestId('show-current-name').innerText(), /Friday/, 'switching opens the other show');
  await addPartFromStore();
  await page.getByTestId('show-changed').waitFor();
  const openRehearsal = page.getByTestId('show-row').filter({ hasText: 'Rehearsal' }).getByTestId('show-open');
  await openRehearsal.click();
  assert.match(await page.getByTestId('show-current-name').innerText(), /Friday/,
    'opening another show over unsaved changes asks first');
  await openRehearsal.click();
  assert.equal(await page.getByTestId('show-current-name').innerText(), 'Rehearsal');
  await page.getByTestId('show-changes-save').check();
  await addPartFromStore();
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId('show-changed').count(), 0, 'saving as it goes, the show never falls behind');
  await page.getByTestId('show-changes-keep').check();

  // Make a player: the editor's, starting from the open show. The preview has no program to
  // copy and says so; given one, the form appears, and the copying itself is the host's.
  assert.equal(await page.getByTestId('player-nothing').count(), 1, 'nothing to copy is said, not offered');
  await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostState.update((s) => ({ ...s, players: { ...s.players, standalone: true, vst3: true } }));
  });
  const createButton = page.getByTestId('player-create');
  assert.ok(await createButton.isDisabled(), 'no name, no player');
  await page.getByTestId('player-name').fill('Friday Rig');
  const ticks = page.getByTestId('player-show');
  assert.deepEqual(await ticks.evaluateAll((boxes) => boxes.map((b) => b.checked)), [false, true],
    'the open show (Rehearsal) is ticked, the other not');
  const portable = page.getByTestId('player-portable');
  assert.ok(await portable.isChecked(), 'made for a USB stick to begin with');
  await page.getByTestId('player-standalone').uncheck();
  assert.ok(await portable.isDisabled(), 'which only the standalone can be');
  await page.getByTestId('player-standalone').check();
  await createButton.click();
  assert.match(await page.locator('.host-error').innerText(), /browser preview/, 'the copying is the host\'s');
  await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostLastError.set('');
  });
  await page.getByTestId('host-try-player').click();
  assert.equal(await page.getByTestId('player-maker').count(), 0, 'and a player does not make players');
  await page.getByTestId('host-try-player').click();
  await page.getByTestId('host-utility-close').click();

  // A product in a folder of its own is asked, once, about the rig an earlier build kept in the
  // folder every product shared. The preview has no such folder, so the host's answer is set.
  await page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostState.update((s) => ({ ...s, product: { ...s.product, data: {
      ...s.product.data, legacy: 'offered', folder: '/home/me/.config/CEditorInstrumentHost/products/8F3A6C2E',
    } } }));
  });
  const legacyPrompt = page.getByTestId('host-legacy-prompt');
  await legacyPrompt.waitFor();
  await page.getByTestId('host-legacy-adopt').click();
  assert.match(await legacyPrompt.innerText(), /Restart it to finish/, 'bringing it over waits for a restart, and says so');
  await page.getByTestId('host-legacy-decline').click();
  assert.equal(await legacyPrompt.count(), 0, 'answered, the question goes');
  await page.getByTestId('host-utility-product').click();
  assert.match(await page.getByTestId('product-data-folder').innerText(), /products\/8F3A6C2E/,
    'and the Product utility says where this product keeps its data');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('hostWorkspace: the dock, select-all, transport, Params, Zone, part rows, mixer, macros, returns, bus effects, Try as player, shows, making a player and the data folder work as drawn');
} finally {
  await browser.close();
  await server.close();
}
