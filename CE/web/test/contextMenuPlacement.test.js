// contextMenuPlacement.test.js — the canvas context menu stays inside the window.
//
// Review finding A12: "Context menu opens off-screen near window edges (no clamping/flip,
// CanvasContextMenu.svelte:100)", and its submenu was hard-coded to open rightward
// (`.ctx-submenu { left: 100% }`). Right-clicking the last control in a layout, or anything in
// the bottom row, put half the menu outside the window with no way to reach what had fallen off.
//
// The geometry is a pure module so it can be tested without a browser; the component measures
// itself and asks. The last test pins that it actually does ask — a placement helper nobody
// calls is the same bug with extra files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MENU_MARGIN, placeMenu, placeSubmenu } from '../src/CE_Application/utils/menuPlacement.js';

const viewport = { width: 1200, height: 800 };
const size = { width: 200, height: 300 };

test('with room to spare the menu opens down-and-right from the pointer, untouched', () => {
  const p = placeMenu(300, 200, size, viewport);
  assert.deepEqual([p.left, p.top], [300, 200]);
  assert.equal(p.flippedX, false);
  assert.equal(p.flippedY, false);
});

test('near the right edge it flips to the left of the pointer, fully on screen', () => {
  const p = placeMenu(1100, 200, size, viewport);
  assert.equal(p.flippedX, true);
  assert.equal(p.left, 900);
  assert.ok(p.left + size.width <= viewport.width - MENU_MARGIN);
});

test('near the bottom edge it flips above the pointer', () => {
  const p = placeMenu(300, 700, size, viewport);
  assert.equal(p.flippedY, true);
  assert.equal(p.top, 400);
  assert.ok(p.top + size.height <= viewport.height - MENU_MARGIN);
});

test('in the bottom-right corner it flips both ways at once', () => {
  const p = placeMenu(1190, 790, size, viewport);
  assert.equal(p.flippedX, true);
  assert.equal(p.flippedY, true);
  assert.ok(p.left >= MENU_MARGIN && p.left + size.width <= viewport.width - MENU_MARGIN);
  assert.ok(p.top >= MENU_MARGIN && p.top + size.height <= viewport.height - MENU_MARGIN);
});

test('it flips rather than slides, so the menu never lands under the cursor', () => {
  // Sliding would put the pointer inside the menu and the release would activate an item.
  const p = placeMenu(1100, 200, size, viewport);
  assert.ok(p.left + size.width <= 1100, 'the whole menu is to the LEFT of the pointer');
});

test('a menu with nowhere to flip is clamped to the edge and capped so it can scroll', () => {
  const tall = { width: 200, height: 900 };
  const p = placeMenu(300, 400, tall, viewport);
  assert.equal(p.top, MENU_MARGIN);
  assert.equal(p.clipped, true);
  assert.equal(p.maxHeight, viewport.height - MENU_MARGIN * 2);
});

test('a menu that fits is never marked as clipped — scrolling it would clip the submenus', () => {
  assert.equal(placeMenu(300, 200, size, viewport).clipped, false);
});

test('a submenu opens rightward, and flips left only when the right edge is genuinely closer', () => {
  // Room for a 150px submenu to the right of the item (1000 + 150 < 1200 - 6)…
  const roomy = { top: 200, left: 820, right: 1000, width: 180 };
  assert.equal(placeSubmenu(roomy, { width: 150, height: 120 }, viewport).side, 'right');
  // …and none at all once the item's right edge is 1080.
  const tight = { top: 200, left: 900, right: 1080, width: 180 };
  assert.equal(placeSubmenu(tight, { width: 150, height: 120 }, viewport).side, 'left');
  // A window too narrow for either side keeps the conventional direction rather than hopping.
  assert.equal(placeSubmenu({ top: 10, left: 10, right: 100, width: 90 }, { width: 150, height: 120 },
    { width: 160, height: 800 }).side, 'right');
});

test('a submenu near the bottom is lifted just enough to fit, and never above the top', () => {
  const item = { top: 700, left: 300, right: 480, width: 180 };
  const p = placeSubmenu(item, { width: 150, height: 300 }, viewport);
  assert.ok(item.top + p.top >= MENU_MARGIN);
  assert.ok(item.top + p.top + 300 <= viewport.height - MENU_MARGIN);

  const shortWindow = placeSubmenu({ top: 10, left: 20, right: 200, width: 180 }, { width: 150, height: 780 }, viewport);
  assert.ok(10 + shortWindow.top >= MENU_MARGIN, 'clamped at the top rather than lifted off-screen');
});

test('a submenu that fits keeps the -4px alignment with its parent item', () => {
  assert.equal(placeSubmenu({ top: 200, left: 300, right: 480, width: 180 }, { width: 150, height: 120 }, viewport).top, -4);
});

test('the component measures itself and uses the result for both menu and submenu', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    join(here, '..', 'src', 'CE_Application', 'editor', 'CanvasContextMenu.svelte'), 'utf8',
  );
  assert.match(source, /placeMenu\(/, 'the menu is placed, not pinned');
  assert.match(source, /placeSubmenu\(/, 'and so is the submenu');
  assert.match(source, /getBoundingClientRect\(\)/, 'measured first — the size depends on the selection');
  assert.ok(!/style="left:\{target\.screenX\}px; top:\{target\.screenY\}px;"/.test(source),
    'the unmeasured pin is gone');
  assert.match(source, /\.ctx-submenu\.flip-left[\s\S]*right: 100%/, 'the leftward submenu rule exists');
});
