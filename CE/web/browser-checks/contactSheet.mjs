/**
 * contactSheet.mjs — the states × sizes sheet, opened from the design surface's state filmstrip.
 *
 * The unit tests (test/componentContactSheet.test.js) pin what each cell holds and which breaks it
 * reports. What they cannot show is that the sheet a person opens draws those cells at those sizes
 * with the canvas's own part renderer, and that picking a cell takes them to that state. So:
 *
 *   open     select a component, open the designer, press "Sizes…" on the filmstrip
 *   shape    a row per state, a column per size
 *   draw     a full-size part measures half in the Half cell and twice as wide in the Wide cell,
 *            and a 30px part keeps its 30px — the layout, not a scaled picture of it
 *   report   the one cell where a pixel-placed badge falls outside the box is marked, and only it
 *   pick     clicking a cell closes the sheet and makes that state the one being edited
 *
 * Run: node browser-checks/contactSheet.mjs   (SHEET_SHOT=sheet.png also saves a picture of it)
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const px = { xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0 };
const PARTS = {
  plate: { _type: 'Part', name: 'plate', zIndex: 0, _children: {
    Layout: { ...px, x: 0, y: 0, width: 100, height: 100, widthUnit: 'percent', heightUnit: 'percent' },
    Background: { _children: { Fill: { colour: 'FF2A3A44' } } } } },
  badge: { _type: 'Part', name: 'badge', zIndex: 1, _children: {
    Layout: { ...px, x: 120, y: 20, width: 30, height: 30 },
    Background: { _children: { Fill: { colour: 'FFE5A029' } } } } },
};
const STATES = { hover: { _type: 'State', name: 'hover', when: { hover: true }, patches: { parts: { plate: { opacity: 0.6 } } } } };

try {
  await kit.fresh();
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 100, 'Transform.width': 160, 'Transform.height': 80, 'Core.name': 'Sheet' });
  await kit.page.evaluate(async ({ id, PARTS, STATES }) => {
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, { 'Parts._children': PARTS, 'States._children': STATES });
  }, { id, PARTS, STATES });
  await kit.settle(500);

  const box = await kit.box(id);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  await kit.page.locator('.contact-sheet-btn').click();
  await kit.page.locator('[data-testid="contact-sheet"]').waitFor({ state: 'visible', timeout: 10000 });
  await kit.settle(400);

  if (process.env.SHEET_SHOT) await kit.page.locator('[data-testid="contact-sheet"]').screenshot({ path: process.env.SHEET_SHOT });

  const read = await kit.page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-testid="contact-sheet"] [data-cell]')];
    const size = (el) => { const r = el?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; };
    return Object.fromEntries(cells.map((cell) => [cell.dataset.cell, {
      issues: Number(cell.dataset.issues),
      frame: size(cell.querySelector('.frame')),
      plate: size(cell.querySelector('[data-part-name="plate"]')),
      badge: size(cell.querySelector('[data-part-name="badge"]')),
      plateOpacity: getComputedStyle(cell.querySelector('[data-part-name="plate"]')).opacity,
    }]));
  });

  const fits = await kit.page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="contact-sheet"]');
    return { scroll: sheet.scrollWidth, client: sheet.clientWidth };
  });
  check('the sheet is as wide as its grid, with no column cut off', () => {
    assert.ok(fits.scroll <= fits.client, JSON.stringify(fits));
  });

  check('a row per state and a column per size', () => {
    assert.deepEqual(Object.keys(read).sort(), [
      'base:current', 'base:double', 'base:half', 'base:tall', 'base:wide',
      'hover:current', 'hover:double', 'hover:half', 'hover:tall', 'hover:wide',
    ]);
  });

  check('cells are laid out at their size, not scaled pictures of one layout', () => {
    const cur = read['base:current'];
    assert.ok(cur.plate.w > 0, JSON.stringify(cur));
    assert.equal(read['base:half'].plate.w * 2, cur.plate.w, `the full-size plate halves: ${JSON.stringify(read['base:half'])}`);
    assert.equal(read['base:wide'].plate.w, cur.plate.w * 2, 'and doubles in width when stretched wide');
    assert.equal(read['base:wide'].plate.h, cur.plate.h, 'but not in height');
    assert.equal(read['base:half'].badge.w, cur.badge.w, 'a 30px part stays 30px — which is exactly how it comes to spill');
  });

  check('the state\'s patches are drawn in its row', () => {
    assert.equal(read['hover:half'].plateOpacity, '0.6');
    assert.equal(read['base:half'].plateOpacity, '1');
  });

  check('only the cells where the badge falls outside are marked', () => {
    const marked = Object.entries(read).filter(([, cell]) => cell.issues > 0).map(([key]) => key).sort();
    assert.deepEqual(marked, ['base:half', 'hover:half']);
  });

  await kit.page.locator('[data-cell="hover:double"]').click();
  await kit.settle(500);
  const after = await kit.page.evaluate(async (id) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    const control = (live?.controls ?? []).find((c) => c._children?.Core?.id === id);
    return { open: !!document.querySelector('[data-testid="contact-sheet"]'), state: control?._children?.Designer?.preview?.state };
  }, id);
  check('picking a cell closes the sheet and edits that state', () => {
    assert.deepEqual(after, { open: false, state: 'hover' });
  });

  // The sheet is modal: keys pressed while it is open belong to it, not to the designer behind it.
  // Escape used to close the sheet AND clear the designer's selection, and Delete reached the
  // designer and removed the selected part, out of sight under the sheet.
  await kit.set(id, { 'Designer.selectedSurfaceKind': 'layer', 'Designer.selectedLayer': 'badge', 'Designer.selectedLayers': ['badge'] });
  await kit.settle(400);
  await kit.page.locator('.contact-sheet-btn').click();
  await kit.page.locator('[data-testid="contact-sheet"]').waitFor({ state: 'visible', timeout: 10000 });
  await kit.page.keyboard.press('Delete');
  await kit.settle(300);
  await kit.page.keyboard.press('Escape');
  await kit.settle(400);
  const keys = await kit.page.evaluate(async (id) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    const control = (live?.controls ?? []).find((c) => c._children?.Core?.id === id);
    return {
      open: !!document.querySelector('[data-testid="contact-sheet"]'),
      badge: !!control?._children?.Parts?._children?.badge,
      selected: control?._children?.Designer?.selectedLayer ?? '',
    };
  }, id);
  check('Escape closes the sheet and nothing else; Delete does not reach the designer behind it', () => {
    assert.deepEqual(keys, { open: false, badge: true, selected: 'badge' });
  });

  const errors = [...kit.failures];
  check('no page errors', () => assert.deepEqual(errors, []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} contact sheet check(s) failed`);
console.log('contact sheet: all checks passed');
