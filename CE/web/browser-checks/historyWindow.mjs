/**
 * historyWindow.mjs — undo steps people can read, in the running editor.
 *
 * test/historyLabels.test.js pins the names and the timeline. This checks the three places they
 * are shown — the Edit menu's Undo row, the properties toolbar's tooltip, and Edit › History... —
 * and that clicking a row in the History window really puts the canvas back.
 *
 * Run: node browser-checks/historyWindow.mjs   (HISTORY_SHOT=h.png also saves a picture of the window)
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const commit = () => kit.page.evaluate(async () => {
  const { pushSnapshot } = await import('/src/CE_Application/stores/history.js');
  pushSnapshot();
});
const openEdit = async () => {
  await kit.page.locator('button.menu-item', { hasText: /^Edit$/ }).click();
  await kit.page.locator('#menu-Edit').waitFor({ state: 'visible' });
};
const editRows = () => kit.page.evaluate(() => [...document.querySelectorAll('#menu-Edit .dropdown-item .item-label')]
  .map((el) => el.textContent.trim()).slice(0, 3));

try {
  await kit.fresh();
  await kit.preview(false);
  const a = await kit.make('Knob', { 'Core.name': 'Cutoff', 'Transform.x': 60, 'Transform.y': 80 });
  const b = await kit.make('Knob', { 'Core.name': 'Drive', 'Transform.x': 200, 'Transform.y': 80 });
  await commit();
  await kit.set(a, { 'Transform.x': 140 });
  await commit();
  await kit.set(b, { 'Core.name': 'Overdrive' });
  await commit();

  await openEdit();
  const rows = await editRows();
  await kit.page.keyboard.press('Escape');
  check('the Edit menu names the step Undo would take back', () => {
    assert.deepEqual(rows, ['Undo Rename Drive to Overdrive', 'Redo', 'History...']);
  });

  const tip = await kit.page.locator('.props-toolbar button[aria-label="Undo"]').getAttribute('title').catch(() => null);
  check('and so does the toolbar\'s Undo tooltip', () => assert.equal(tip, 'Undo Rename Drive to Overdrive'));

  await openEdit();
  await kit.page.locator('#menu-Edit .dropdown-item', { hasText: 'History...' }).click();
  const win = kit.page.locator('[data-testid="history-window"]');
  await win.waitFor({ state: 'visible' });
  const listed = await win.locator('.step .label').allTextContents();
  check('the History window lists every step, oldest first', () => {
    // The two Add steps come from making the controls.
    assert.deepEqual(listed.slice(-2), ['Move Cutoff', 'Rename Drive to Overdrive'], JSON.stringify(listed));
    assert.equal(listed[0], 'Start');
  });

  if (process.env.HISTORY_SHOT) await win.screenshot({ path: process.env.HISTORY_SHOT });
  const steps = listed.length - 1;
  await win.locator(`[data-position="${steps - 2}"]`).click();      // just before "Move Cutoff"
  await kit.settle(300);
  const back = { x: await kit.read(a, 'Transform.x'), name: await kit.read(b, 'Core.name') };
  const marked = await win.evaluate((el) => ({
    current: el.querySelector('[data-current="true"]')?.dataset.position,
    undone: [...el.querySelectorAll('.step.undone .label')].map((n) => n.textContent),
  }));
  check('clicking a row goes back to that point, and marks what can be redone', () => {
    assert.deepEqual(back, { x: 60, name: 'Drive' });
    assert.equal(Number(marked.current), steps - 2);
    assert.deepEqual(marked.undone, ['Move Cutoff', 'Rename Drive to Overdrive']);
  });

  await win.locator(`[data-position="${steps}"]`).click();
  await kit.settle(300);
  const forward = { x: await kit.read(a, 'Transform.x'), name: await kit.read(b, 'Core.name') };
  check('and clicking the last row redoes up to it', () => assert.deepEqual(forward, { x: 140, name: 'Overdrive' }));

  await kit.page.keyboard.press('Escape');
  await kit.settle(200);
  const closed = await kit.page.locator('[data-testid="history-window"]').count();
  check('Escape closes the window', () => assert.equal(closed, 0));

  // Escape must close the window and not ALSO do the editor's own Escape. In the Component
  // Designer that clears the selected part, which is where the window's Escape used to leak.
  const cc = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 260, 'Transform.width': 160, 'Transform.height': 80 });
  await kit.page.evaluate(async (id) => {
    const { createCustomComponentPartsDefaults } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, { 'Parts._children': createCustomComponentPartsDefaults()._children });
  }, cc);
  const box = await kit.box(cc);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  await kit.set(cc, { 'Designer.selectedSurfaceKind': 'layer', 'Designer.selectedLayer': 'label', 'Designer.selectedLayers': ['label'] });
  await kit.settle(300);
  await openEdit();
  await kit.page.locator('#menu-Edit .dropdown-item', { hasText: 'History...' }).click();
  await kit.page.locator('[data-testid="history-window"]').waitFor({ state: 'visible' });
  await kit.page.keyboard.press('Escape');
  await kit.settle(300);
  const inDesigner = {
    open: await kit.page.locator('[data-testid="history-window"]').count(),
    selected: await kit.read(cc, 'Designer.selectedLayer'),
  };
  check('in the Component Designer, Escape closes the window and leaves the selected part selected', () => {
    assert.deepEqual(inDesigner, { open: 0, selected: 'label' });
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} history check(s) failed`);
console.log('history window: all checks passed');
