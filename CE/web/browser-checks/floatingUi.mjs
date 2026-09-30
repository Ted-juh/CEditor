/**
 * floatingUi.mjs — menus and popovers stay on screen, at the edges where they used not to.
 *
 * Every popup that hangs off something is placed by utils/floatingUi.js (Floating UI). This opens the
 * ones people meet most, at the window edges and in the layouts that used to break them, and checks each
 * lands wholly inside the window, on the side of its anchor that has room, without sliding under the
 * pointer:
 *
 *   - the canvas right-click menu in the bottom-right corner (flips up and left), and after a resize;
 *   - its submenu at the window's right edge (flips left);
 *   - a menu-bar submenu on a narrow window;
 *   - the layer tree's menu opened on its lowest row (it used to clamp against a guessed 200×330);
 *   - a combobox in the bottom row of a panel in preview — the one popup that also ships in the plug-in —
 *     which used to open off the panel's bottom.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/floatingUi.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1280, height: 800 });
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const page = kit.page;

const boxOf = (selector) => page.evaluate((selector) => {
  const el = [...document.querySelectorAll(selector)].find((node) => getComputedStyle(node).visibility !== 'hidden');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight };
}, selector);
const inside = (box, margin = 0) => box && box.left >= margin - 0.5 && box.top >= margin - 0.5 && box.right <= box.vw - margin + 0.5 && box.bottom <= box.vh - margin + 0.5;
const waitPlaced = () => kit.settle(250);

try {
  await kit.fresh();
  await kit.preview(false);
  await kit.make('Knob', { 'Transform.x': 40, 'Transform.y': 40 });

  // --- Canvas context menu, bottom-right corner -----------------------------------------------------
  // The canvas does not reach the window's corner (the side panels do), so the menu is opened the way
  // the canvas opens it — a contextmenu event on the viewport — at a point in the window's corner.
  const openCanvasMenu = (x, y) => page.evaluate(({ x, y }) => {
    const viewport = [...document.querySelectorAll('.canvas-viewport')].pop();
    viewport.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, { x, y });
  const closeMenus = async () => {
    await page.keyboard.press('Escape');
    // The menus close on a click on their backdrop, as a click anywhere else does.
    const backdrop = page.locator('.ctx-backdrop');
    if (await backdrop.count()) await backdrop.first().click({ position: { x: 2, y: 2 } });
    await kit.settle(300);
  };
  const corner = { x: 1268, y: 788 };
  await openCanvasMenu(corner.x, corner.y);
  await waitPlaced();
  const menu = await boxOf('.ctx-menu');
  check('the canvas menu opened in the bottom-right corner is wholly on screen, above and left of the pointer', () => {
    assert.ok(inside(menu, 6), JSON.stringify(menu));
    assert.ok(menu.bottom <= corner.y + 1 && menu.right <= corner.x + 1, `flipped, not slid under the pointer: ${JSON.stringify(menu)} vs ${JSON.stringify(corner)}`);
  });

  await page.setViewportSize({ width: 1000, height: 600 });
  await kit.settle(400);
  const resized = await boxOf('.ctx-menu');
  check('and it follows a window resize', () => assert.ok(inside(resized, 6), JSON.stringify(resized)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await closeMenus();

  // --- Its submenu at the right edge ----------------------------------------------------------------
  // With the knob selected, the menu offers Order ▸; opened near the right edge, it has to go left.
  await page.locator('.canvas-control[data-control-id]').first().click();
  await kit.settle(200);
  await openCanvasMenu(1200, 150);
  await waitPlaced();
  const opener = page.locator('.ctx-menu .ctx-sub-wrapper').last();
  if (await opener.count()) {
    await opener.hover();
    await waitPlaced();
    const sub = await boxOf('.ctx-submenu');
    const parent = await boxOf('.ctx-menu');
    check('a submenu at the right edge flips to the left of its menu, on screen', () => {
      assert.ok(inside(sub, 6), JSON.stringify(sub));
      assert.ok(sub.right <= parent.left + 6, `left of the menu: ${JSON.stringify(sub)} vs ${JSON.stringify(parent)}`);
    });
  } else {
    check('a submenu at the right edge flips to the left of its menu, on screen', () => assert.fail('no submenu offered'));
  }
  await closeMenus();

  // --- Menu bar, narrow window ------------------------------------------------------------------------
  await page.setViewportSize({ width: 520, height: 600 });
  await kit.settle(400);
  await page.locator('.menubar .menu-item', { hasText: /^File$/ }).first().click().catch(() => {});
  await waitPlaced();
  const dropdown = await boxOf('.dropdown:not(.submenu)');
  const subRow = page.locator('.dropdown:not(.submenu) [aria-haspopup="menu"]').first();
  let submenu = null;
  if (await subRow.count()) {
    await subRow.hover();
    await waitPlaced();
    submenu = await boxOf('.dropdown.submenu');
  }
  check('on a narrow window the menu-bar dropdown and its submenu stay on screen', () => {
    assert.ok(inside(dropdown, 0), `dropdown ${JSON.stringify(dropdown)}`);
    assert.ok(submenu, 'a submenu opened');
    assert.ok(inside(submenu, 6), `submenu ${JSON.stringify(submenu)}`);
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  await kit.settle(400);

  // --- Layer tree, lowest row -------------------------------------------------------------------------
  for (let i = 0; i < 3; i += 1) await kit.make('Label', { 'Transform.x': 200 + i * 10, 'Transform.y': 200 + i * 10 });
  const rows = page.locator('[role="treeitem"]');
  if (await rows.count()) {
    const last = rows.last();
    const row = await last.boundingBox();
    // Open it as if from the window's bottom edge: the ordinary case for a tree's last row.
    await page.evaluate(({ x, y }) => {
      const target = [...document.querySelectorAll('[role="treeitem"]')].pop();
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, { x: row.x + 20, y: 780 });
    await waitPlaced();
    const tree = await boxOf('[role="menu"].ctx-menu');
    check('the layer tree menu opened near the bottom opens upward, on screen', () => {
      assert.ok(inside(tree, 6), JSON.stringify(tree));
      assert.ok(tree.bottom <= 781, `above the pointer, not under it: ${JSON.stringify(tree)}`);
    });
    await closeMenus();
  }

  // --- Plug-in combobox in the bottom row ------------------------------------------------------------
  await kit.fresh();
  const combo = await kit.make('Combobox', { 'Transform.x': 40, 'Transform.y': 20 });
  const panelHeight = await page.evaluate(async () => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    return get(panels).find((p) => p.id === get(activePanelId))?.height ?? 600;
  });
  await kit.set(combo, { 'Transform.y': panelHeight - 40 });
  await kit.preview(true);
  await kit.settle(800);
  const element = page.locator(`.canvas-control[data-control-id="${combo}"]`).first();
  await element.scrollIntoViewIfNeeded();
  const b = await element.boundingBox();
  const control = { x: b.x, y: b.y, w: b.width, h: b.height };
  await element.click();
  await waitPlaced();
  const list = await boxOf('.panel-combobox-menu');
  check('a combobox in the panel\'s bottom row opens its list above itself, on screen', () => {
    assert.ok(list, 'the list opened');
    assert.ok(inside(list, 0), JSON.stringify(list));
    assert.ok(list.bottom <= control.y + 1, `above the control: ${JSON.stringify(list)} vs ${JSON.stringify(control)}`);
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('floating ui: all checks passed');
