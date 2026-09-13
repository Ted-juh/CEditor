// Run directly with node; Vite serves test modules without building an app bundle.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, plugins: [svelte()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-sounds-check', import.meta.url)),
  optimizeDeps: { entries: ['sounds.html'] },
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', time: '', version: '0.0.0' }) },
  server: { host: '127.0.0.1', port: Number(process.env.SOUNDS_TEST_PORT ?? 18764) }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
                                 : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 940 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sounds.html`);
  await page.getByTestId('preset-row').first().waitFor();
  assert.equal(await page.getByTestId('host-undo').isDisabled(), true);
  await page.evaluate(() => window.setEditHistory({ canUndo: true, canRedo: true, undoLabel: 'Remove part', redoLabel: 'Move part' }));
  await page.getByTestId('host-undo').click();
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'undoHostEdit');
  await page.getByTestId('host-redo').click();
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'redoHostEdit');
  await page.getByTestId('host-undo').focus();
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'undoHostEdit');
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'redoHostEdit');
  const historyCommands = await page.evaluate(() => window.soundCommands.filter(c => /^(undo|redo)HostEdit$/.test(c.cmd)).length);
  await page.getByTestId('browser-search').focus();
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => window.soundCommands.filter(c => /^(undo|redo)HostEdit$/.test(c.cmd)).length), historyCommands, 'text fields retain native text undo');
  await page.evaluate(() => window.setEditHistory({ blockedReason: 'Wait for plug-in loading to finish.' }));
  assert.equal(await page.getByTestId('host-undo').isDisabled(), true);
  assert.match(await page.getByTestId('host-undo').getAttribute('title'), /loading/);
  assert.ok(await page.getByTestId('preset-row').count() < 40, 'large library only mounts visible rows');
  assert.equal(await page.getByTestId('host-utility-drawer').count(), 0);
  assert.equal(await page.getByTestId('browser-inspector').count(), 0);
  assert.equal(await page.getByTestId('sounds-rack-part').count(), 3);
  assert.equal(await page.evaluate(() => window.soundCommands.some(c => c.cmd === 'scanLibrary')), false,
    'opening Sounds reads the saved library without scanning');
  await page.getByTestId('sounds-show-plugins').click();
  assert.equal(await page.getByRole('region', { name: 'Instrument browser' }).isVisible(), true);
  await page.getByTestId('sounds-show-plugins').click();
  assert.equal(await page.getByRole('button', { name: /^More controls for/ }).count(), 0);
  assert.equal(await page.getByLabel('Collapse part controls').count(), 0);
  for (const row of await page.getByTestId('sounds-rack-part').all()) {
    for (const action of ['part-move-up', 'part-move-down', 'part-open-editor', 'part-float-editor', 'part-unload', 'part-remove', 'part-range'])
      assert.equal(await row.getByTestId(action).isVisible(), true, `${action} is directly available`);
    for (const name of ['Active', 'Mute', 'Solo'])
      assert.equal(await row.getByRole('button', { name, exact: true }).isVisible(), true);
    assert.equal(await row.getByLabel('Pan', { exact: true }).isVisible(), true);
    assert.equal(await row.getByLabel('Volume', { exact: true }).isVisible(), true);
  }
  await page.getByLabel('Sounds target part').selectOption('part-1');
  await page.getByTestId('rack-view-canvas').click();
  await page.getByTestId('canvas-node-part-1').hover();
  const removeCanvas = page.getByTestId('canvas-node-part-1').getByTestId('canvas-remove-part');
  const removedBefore = await page.evaluate(() => window.soundCommands.filter(c => c.cmd === 'removePart').length);
  await removeCanvas.click();
  assert.equal(await page.evaluate(() => window.soundCommands.filter(c => c.cmd === 'removePart').length), removedBefore);
  await removeCanvas.press('Escape');
  assert.notEqual(await removeCanvas.innerText(), 'Confirm');
  await removeCanvas.click();
  await removeCanvas.click();
  assert.deepEqual(await page.evaluate(() => window.soundCommands.findLast(c => c.cmd === 'removePart')), { cmd: 'removePart', partId: 'part-1' });
  await page.getByTestId('rack-view-list').click();
  await page.getByTestId('sound-load').click();
  assert.deepEqual(await page.evaluate(() => window.soundCommands.findLast(c => c.cmd === 'loadLibraryRecord')),
    { cmd: 'loadLibraryRecord', recordId: 'preset-0', action: 'focused', partId: 'part-1' });
  assert.equal(await page.getByTestId('sound-load').isDisabled(), true);
  await page.getByTestId('sound-load-result').filter({ hasText: 'Loading selected preset' }).waitFor();
  await page.evaluate(() => window.finishSoundsLoad('failed', 'The plug-in refused Abandoned.'));
  await page.getByTestId('sound-load-result').filter({ hasText: 'The plug-in refused Abandoned.' }).waitFor();
  assert.equal(await page.getByTestId('sound-load').isDisabled(), false, 'a failed load can be retried');
  await page.getByTestId('sound-load').click();
  await page.evaluate(() => window.finishSoundsLoad('loaded', 'Loaded Abandoned'));
  await page.getByTestId('sound-load-result').filter({ hasText: 'Loaded Abandoned' }).waitFor();
  await page.getByTestId('browser-search').fill('Preset 7853');
  await page.getByRole('button', { name: /Preset 7853/ }).first().waitFor();
  assert.equal(await page.getByTestId('preset-row').count(), 1);
  await page.getByTestId('host-utility-library').click();
  assert.equal(await page.getByTestId('host-library-panel').getByRole('searchbox').count(), 0, 'one results browser');
  assert.equal(await page.getByTestId('browser-search').inputValue(), 'Preset 7853');
  assert.equal(await page.getByTestId('preset-row').count(), 1);
  const bounds = await page.evaluate(() => {
    const library = document.querySelector('[data-testid="host-library-sidebar"]').getBoundingClientRect();
    const rack = document.querySelector('.rack-column').getBoundingClientRect();
    const dock = document.querySelector('[data-testid="host-dock"]').getBoundingClientRect();
    return { libraryLeft: library.left, libraryBottom: library.bottom, rackRight: rack.right, dockTop: dock.top };
  });
  assert.ok(bounds.libraryLeft >= bounds.rackRight, 'management is beside the rack');
  assert.ok(bounds.libraryBottom <= bounds.dockTop, 'management never overlays Sounds');
  for (const id of ['host-save-preset', 'host-save-chain', 'host-save-rack'])
    assert.equal(await page.getByTestId(id).isVisible(), true, 'save stays directly available');
  assert.equal(await page.getByTestId('audition-bar').isVisible(), true);
  await page.getByTestId('host-library-close').click();
  assert.equal(await page.getByTestId('browser-search').inputValue(), 'Preset 7853');
  await page.getByTestId('browser-search').fill('');
  await page.getByTestId('host-start-sound-comparison').click();
  const comparison = await page.evaluate(() => window.soundCommands.findLast(c => c.cmd === 'startSoundComparison'));
  assert.equal(comparison.partId, 'part-1');
  assert.ok(comparison.recordIds.length >= 2 && comparison.recordIds.every(id => Number(id.split('-')[1]) % 3 === 1));
  await page.evaluate(() => window.setSoundsComparison(true));
  await page.getByTestId('host-sound-comparison').getByRole('button', { name: 'Next ›' }).click();
  assert.deepEqual(await page.evaluate(() => window.soundCommands.at(-1)), { cmd: 'stepSoundComparison', delta: 1 });
  await page.getByRole('button', { name: 'Cancel · restore original' }).click();
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'cancelSoundComparison');
  await page.evaluate(() => window.setSoundsComparison(false));
  await page.getByTestId('host-audition').check();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByTestId('host-audition-config').locator('select').selectOption('riff');
  assert.deepEqual(await page.evaluate(() => window.soundCommands.at(-1)), { cmd: 'setPresetAudition', phrase: 'riff' });
  assert.ok(await page.getByTestId('preset-list').evaluate(el => el.clientHeight) >= 32);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByTestId('host-audition').uncheck();
  await page.evaluate(() => window.setSoundsMorph());
  await page.getByTestId('browser-search').fill('no-such-preset');
  await page.getByTestId('sound-selection-bar').getByText('No preset selected', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('sound-load').isDisabled(), true);
  await page.getByTestId('browser-details').click();
  assert.equal(await page.getByTestId('host-morph').isVisible(), true, 'morph remains reachable without matching results');
  await page.getByTestId('browser-details').click();
  await page.getByTestId('browser-search').fill('');
  await page.getByLabel('Preset type').selectOption('effect');
  await page.getByRole('button', { name: 'Load effect', exact: true }).waitFor();
  await page.getByTestId('sound-add').click();
  assert.deepEqual(await page.evaluate(() => window.soundCommands.findLast(c => c.cmd === 'loadLibraryRecord')),
    { cmd: 'loadLibraryRecord', recordId: 'effect', action: 'add', partId: 'part-1' });
  await page.evaluate(() => window.finishSoundsLoad('loaded', 'Loaded Room'));
  await page.getByLabel('Preset type').selectOption('all');
  await page.locator('.preset-pick').first().focus();
  await page.keyboard.press('End');
  await page.getByTestId('sound-load').filter({ hasText: 'Load effect' }).waitFor();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Browser view').selectOption('map');
  await page.getByLabel('Browser view').selectOption('list');
  assert.ok(await page.getByTestId('preset-list').evaluate(el => el.scrollTop) > 100000,
    'list restores its virtual scroll window after changing views');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.locator('.preset-pick[aria-pressed="true"]').focus();
  await page.keyboard.press('Home');
  await page.getByTestId('sound-load').filter({ hasText: /^Load$/ }).waitFor();
  await page.getByTestId('browser-details').click();
  await page.getByTestId('browser-inspector').waitFor();
  await page.getByTestId('browser-details').click();
  const small = await page.getByTestId('host-dock').evaluate(el => el.clientHeight);
  await page.getByTestId('dock-expand').click();
  assert.ok(await page.getByTestId('host-dock').evaluate(el => el.clientHeight) > small);
  await page.getByTestId('dock-expand').click();
  await page.getByTestId('dock-collapse').click();
  assert.equal(await page.getByTestId('host-sound-browser').count(), 0);
  await page.getByTestId('dock-tab-sounds').click();
  await page.getByTestId('preset-row').first().waitFor();
  await page.getByTestId('sounds-manage-library').click();
  await page.getByTestId('host-scan-library').waitFor();
  await page.getByTestId('host-library-panel').getByTestId('host-scan').click();
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'scan');
  await page.getByTestId('host-library-panel').getByRole('button', { name: 'Add folder…' }).click();
  assert.equal(await page.evaluate(() => window.soundCommands.at(-1).cmd), 'browseLibraryPath');
  await page.getByTitle('Remove this library folder').click();
  assert.equal(await page.evaluate(() => window.soundCommands.some(c => c.cmd === 'removeLibraryPath')), false);
  await page.getByTitle('Click again to confirm', { exact: true }).click();
  assert.ok(await page.evaluate(() => window.soundCommands.some(c => c.cmd === 'removeLibraryPath' && c.path === 'D:/Sounds/Presets')));
  assert.equal(await page.getByTestId('host-scan-library').innerText(), 'Update library');
  await page.getByTestId('host-scan-library').click();
  assert.equal(await page.getByTestId('host-scan-library').isDisabled(), true);
  assert.ok(await page.getByTestId('preset-row').count() > 0, 'saved sounds remain usable during the update');
  await page.evaluate(() => window.finishSoundsUpdate());
  await page.getByTestId('library-update-result').filter({ hasText: '1 plug-in needs attention' }).waitFor();
  assert.equal(await page.locator('.scan-report').evaluate(el => el.open), true, 'issues are expanded in the update results');
  await page.locator('.scan-report').getByText('Preset files are missing.', { exact: false }).waitFor();
  assert.ok((await page.locator('.scan-report').innerText()).includes('4139 usable presets'));
  await page.getByTestId('host-library-close').click();
  await page.getByTestId('library-update-result').click();
  await page.getByTestId('duplicate-set').click();
  assert.equal(await page.getByTestId('browser-search').inputValue(), 'Abandoned', 'duplicates use the Sounds results');
  await page.getByTestId('browser-search').fill('');
  await page.getByTestId('host-library-close').click();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Preset row spacing').selectOption('comfortable');
  assert.equal(Math.round(await page.getByTestId('preset-row').first().evaluate(el => el.getBoundingClientRect().height)), 42);
  await page.getByLabel('Preset row spacing').selectOption('compact');
  await page.getByRole('button', { name: /^Filters/ }).click();
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 940 });
    const geometry = await page.getByTestId('host-sound-browser').evaluate(el => ({
      width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight,
      list: el.querySelector('.preset-list').clientHeight,
    }));
    assert.ok(geometry.scroll <= geometry.width + 1, `no browser overflow at ${width}`);
    assert.ok(geometry.list >= 32, `visible list remains at ${width}`);
    await page.getByTestId('sounds-manage-library').click();
    assert.ok(await page.getByTestId('host-library-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `management fits at ${width}`);
    await page.getByTestId('host-library-close').click();
  }
  if (process.env.SOUNDS_SCREENSHOT) {
    await page.setViewportSize({ width: 1280, height: 940 });
    await page.getByTestId('sounds-manage-library').click();
    await page.screenshot({ path: process.env.SOUNDS_SCREENSHOT });
    await page.getByTestId('host-library-close').click();
  }
  await page.setViewportSize({ width: 1280, height: 940 });
  for (const [id, command] of [['host-save-preset', 'saveUserPreset'], ['host-save-chain', 'saveChainToLibrary'], ['host-save-rack', 'saveRackToLibrary']]) {
    const save = page.getByTestId('host-dock').getByTestId(id);
    assert.match(await save.getAttribute('title'), /library/);
    await save.click();
    assert.equal(await page.getByTestId('host-save-notice').count(), 0, 'sending a command is not confirmation');
    assert.ok(await page.evaluate(command => window.soundCommands.some(c => c.cmd === command), command));
    await page.evaluate(() => window.soundEvent('instrumentHostLibrarySaved', { name: 'Warm lead' }));
    assert.equal(await page.getByTestId('host-save-notice').innerText(), 'Saved “Warm lead” to library.');
  }
  await page.getByTestId('host-save-notice').waitFor({ state: 'detached', timeout: 6500 });
  await page.getByTestId('host-dock').getByTestId('host-save-rack').click();
  await page.evaluate(() => window.soundEvent('instrumentHostError', { message: 'Could not save the rack: library is not writable.' }));
  assert.equal(await page.getByTestId('host-save-notice').count(), 0);
  await page.getByRole('alert').filter({ hasText: 'library is not writable' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Sounds dock: virtual rows, keyboard, filters, target commands, effect add, details, sizing and collapse passed.');
} finally { await browser.close(); await server.close(); }
