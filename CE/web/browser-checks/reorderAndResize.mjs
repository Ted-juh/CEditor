/**
 * reorderAndResize.mjs — the workspace's splitters and reorderable lists, from the keyboard and by drag.
 *
 *   splitters   a focused splitter resizes its panel with the arrows (Ctrl for bigger steps) and goes
 *               to its limits with Home / End, and says its size to assistive tech
 *   tabs        Ctrl+Shift+PageDown / PageUp move the focused editor tab, as a browser's do
 *   operands    in the Component Designer's layer list, dragging a combined shape's operand onto
 *               another reorders the shape (for Subtract, which one is cut); dragging a layer into
 *               the shape is refused by name, not quietly done to the stacking order
 *
 * (The animation target list's Alt+Up / Alt+Down is checked in animationTab.mjs.)
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/reorderAndResize.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1600, height: 900 });
const page = kit.page;
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const px = (x, y, width, height) => ({ _type: 'PartLayout', mode: 'absolute', x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50 });

try {
  await kit.fresh();
  await kit.preview(false);

  // --- Splitters ------------------------------------------------------------------------------------
  const handle = page.locator('.resize-handle[role="separator"]').first();
  const width = async () => Number(await handle.getAttribute('aria-valuenow'));
  const panelWidth = () => page.evaluate(() => document.querySelector('.properties-area')?.getBoundingClientRect().width ?? 0);
  await handle.focus();
  const w0 = await width();
  await page.keyboard.press('ArrowLeft');
  await kit.settle(200);
  const w1 = await width();
  await page.keyboard.press('Control+ArrowLeft');
  await kit.settle(200);
  const w2 = await width();
  const drawn = await panelWidth();
  await page.keyboard.press('End');
  await kit.settle(200);
  const max = await width();
  await page.keyboard.press('Home');
  await kit.settle(200);
  const min = await width();
  check('a focused splitter resizes its panel from the keyboard, and reports the size', () => {
    assert.equal(w1, w0 + 16, `ArrowLeft widens the panel on the right by 16: ${[w0, w1, w2, max, min]}`);
    assert.ok(w2 > w1 + 16, `Ctrl takes a bigger step, as on every scrub: ${w1} → ${w2}`);
    assert.ok(Math.abs(drawn - w2) < 2, `the panel is drawn that wide: ${drawn} vs ${w2}`);
    assert.ok(max > w2, `End goes to the maximum: ${max}`);
    assert.equal(min, 600, 'Home goes to the minimum');
  });

  // --- Tabs -----------------------------------------------------------------------------------------
  await page.evaluate(async () => { (await import('/src/CE_Application/stores/panels.js')).openSettingsTab(); });
  await kit.settle(500);
  const tabNames = () => page.evaluate(() => [...document.querySelectorAll('.tab[draggable="true"]')].map((tab) => tab.textContent.replace(/\s+/g, ' ').trim()));
  const before = await tabNames();
  await page.locator('.tab[draggable="true"]').first().focus();
  await page.keyboard.press('Control+Shift+PageDown');
  await kit.settle(300);
  const after = await tabNames();
  await page.keyboard.press('Control+Shift+PageUp');
  await kit.settle(300);
  const back = await tabNames();
  check('Ctrl+Shift+PageDown / PageUp move the focused tab, as in a browser', () => {
    assert.ok(before.length >= 2, `tabs: ${before.join(' | ')}`);
    assert.deepEqual(after.slice(0, 2), [before[1], before[0]], `${before.join(' | ')} → ${after.join(' | ')}`);
    assert.deepEqual(back, before, `back: ${back.join(' | ')}`);
  });

  // --- Operands dragged in the layer list -------------------------------------------------------------
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 80, 'Transform.width': 220, 'Transform.height': 160 });
  await page.evaluate(async ({ id, box, dot, tag }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const { planBooleanGroup } = await import('/src/CE_Application/utils/booleanGroups.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: { Fill: { _type: 'Fill', solidEnabled: true, colour } } } });
    const plate = createPartNode('plate', { kind: 'rectangle', zIndex: 1, layout: box, sections: fill('FFE0443A') });
    const hole = createPartNode('hole', { kind: 'circle', zIndex: 2, layout: dot, sections: fill('FF3A8BE0') });
    const badge = createPartNode('badge', { kind: 'rectangle', zIndex: 3, layout: tag, sections: fill('FF44E03A') });
    const group = await planBooleanGroup({ plate, hole }, [['plate', plate, plate], ['hole', hole, hole]], 'subtract', { artboardWidth: 220, artboardHeight: 160 });
    applyControlPatch(id, { 'Parts._children': { ...group.parts, badge } });
  }, { id, box: px(20, 20, 120, 100), dot: px(50, 40, 60, 60), tag: px(160, 10, 40, 20) });
  await kit.settle(400);
  const box = await kit.box(id);
  await page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(600);
  await page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  const groupName = await page.evaluate(async (id) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const control = get(panels).find((p) => p.id === get(activePanelId)).controls.find((c) => c._children.Core.id === id);
    return Object.entries(control._children.Parts._children).find(([, part]) => part.kind === 'boolean')[0];
  }, id);
  const row = (name) => page.locator(`.list-row[aria-label="${name} layer controls"]`).first();
  const operands = () => kit.read(id, `Parts.${groupName}.meta.boolean.operands`);
  const before2 = await operands();
  await row('hole').dragTo(row('plate'));
  await kit.settle(700);
  const after2 = await operands();
  await row('badge').dragTo(row('hole'));
  await kit.settle(700);
  const notice = await page.evaluate(() => document.body.innerText.match(/Can't move badge[^\n]*/)?.[0] ?? '');
  const badgeGroup = await kit.read(id, 'Parts.badge.meta.booleanGroup');
  check('dragging an operand onto another reorders the combined shape', () => {
    assert.deepEqual(before2, ['plate', 'hole']);
    assert.deepEqual(after2, ['hole', 'plate'], 'the hole is now the back-most, the one Subtract cuts');
  });
  check('dragging a layer into a combined shape is refused by name, not done to the stacking order', () => {
    assert.match(notice, /Combine and Release/);
    assert.ok(!badgeGroup, 'the badge did not join the shape');
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('reorder and resize: all checks passed');
