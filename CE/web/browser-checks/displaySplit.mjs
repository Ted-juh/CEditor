/**
 * displaySplit.mjs — a second tool beside the first in the display dock.
 *
 *   open      the split button opens a pane beside; the tool in it loads and works
 *   choose    the pane's own picker changes its tool; the main pane's tool is not offered
 *   swap      choosing the tool beside in the rail swaps the two panes
 *   alt       Alt+click (and right-click) on a tab opens it beside; Colors cannot go beside
 *   request   something asking the dock for the tool already beside leaves it there
 *   resize    the separator resizes the pane from the keyboard
 *   persist   the pane and its tool come back after a reload; closing it closes it
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/displaySplit.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1700, height: 1000 });
const page = kit.page;
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const dock = () => page.locator('.display-panel').first();
const railTab = (label) => dock().locator(`.studio-rail [role="tab"][aria-label="${label}"]`);
const state = () => page.evaluate(() => {
  const panel = document.querySelector('.display-panel');
  const pane = panel?.querySelector('[data-beside-tab]');
  return {
    main: panel?.querySelector('.studio-rail [role="tab"][aria-selected="true"]')?.getAttribute('aria-label') ?? '',
    beside: pane?.getAttribute('data-beside-tab') ?? '',
    besideLoaded: !!pane && !/Loading|Failed/.test(pane.querySelector('.beside-body')?.textContent ?? '') && (pane.querySelector('.beside-body')?.children.length ?? 0) > 0,
    options: [...(pane?.querySelectorAll('select option') ?? [])].map((o) => o.value),
    width: pane ? Math.round(pane.getBoundingClientRect().width) : 0,
    marked: [...panel.querySelectorAll('.studio-tab.beside')].map((t) => t.getAttribute('aria-label')),
  };
});

try {
  await kit.fresh();
  await page.evaluate(async () => {
    localStorage.removeItem('ce.displayPanel.besideTab');
    (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);
  });
  await kit.settle(400);
  await railTab('Effects').click();
  await kit.settle(400);

  await dock().locator('.split-toggle').click();
  await kit.settle(900);
  const opened = await state();
  check('the split button opens a second tool beside the first, loaded', () => {
    assert.equal(opened.main, 'Effects');
    assert.equal(opened.beside, 'type');
    assert.equal(opened.besideLoaded, true, JSON.stringify(opened));
    assert.deepEqual(opened.marked, ['Text'], 'the rail marks the tool beside');
    assert.ok(!opened.options.includes('effects'), 'the main pane\'s tool is not offered beside');
    assert.ok(!opened.options.includes('colors') && !opened.options.includes('notepad'), 'nor the tools that share the colour pick');
  });

  await dock().locator('[data-beside-tab] select').selectOption('midi');
  await kit.settle(700);
  const chosen = await state();
  check('the pane\'s picker changes its tool', () => {
    assert.equal(chosen.beside, 'midi');
    assert.equal(chosen.besideLoaded, true);
  });

  await railTab('MIDI').click();
  await kit.settle(700);
  const swapped = await state();
  check('choosing the tool beside in the rail swaps the two panes', () => {
    assert.equal(swapped.main, 'MIDI');
    assert.equal(swapped.beside, 'effects');
  });

  await railTab('Ports').click({ modifiers: ['Alt'] });
  await kit.settle(700);
  const alt = await state();
  await railTab('Colors').click({ button: 'right' });
  await kit.settle(300);
  const colours = await state();
  check('Alt+click opens a tool beside; Colors, which shares the colour pick, cannot go', () => {
    assert.equal(alt.main, 'MIDI');
    assert.equal(alt.beside, 'ports');
    assert.equal(colours.beside, 'ports');
  });

  await page.evaluate(async () => { (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'ports' }); });
  await kit.settle(500);
  const requested = await state();
  check('asking the dock for the tool already beside leaves both panes as they are', () => {
    assert.equal(requested.main, 'MIDI');
    assert.equal(requested.beside, 'ports');
  });

  await dock().locator('.beside-resize').focus();
  const w0 = (await state()).width;
  await page.keyboard.press('ArrowLeft');
  await kit.settle(300);
  const w1 = (await state()).width;
  check('the separator resizes the pane from the keyboard', () => assert.equal(w1, w0 + 16, `${w0} → ${w1}`));

  await page.reload();
  await kit.settle(4000);
  await page.evaluate(async () => { (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true); });
  await kit.settle(1200);
  const reloaded = await state();
  await dock().locator('.beside-close').click();
  await kit.settle(400);
  const closed = await state();
  check('the pane and its tool come back after a reload, and the close button closes it', () => {
    assert.equal(reloaded.beside, 'ports', JSON.stringify(reloaded));
    assert.equal(reloaded.width, w1, 'at the width it was left at');
    assert.equal(closed.beside, '');
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('display split: all checks passed');
