/**
 * turnedParts.mjs — the component designer's handles and aids on a part that is turned and scaled.
 *
 * test/surfaceTransforms.test.js holds the geometry. This drives the designer with a real pointer on a
 * bar turned 30° and scaled 1.5 about an off-centre pivot, and an arc turned a quarter, and reads what
 * is drawn:
 *
 *   resize     dragging the right handle moves the drawn right edge with the pointer; the left stays
 *   rotate     the rotate handle turns the part about its pivot, following the pointer's angle
 *   arc        the arc's handles sit on its drawn ends; dragging one sets the angle it is dropped at
 *   pivot      typing a pivot leaves the part where it is drawn
 *   align      "align left" puts the drawn left edge on the artboard's
 *   zone       a hit zone that follows the bar is drawn turned with it
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/turnedParts.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const page = kit.page;
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const px = (x, y, width, height, extra = {}) => ({ _type: 'PartLayout', mode: 'absolute', x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50, ...extra });
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} against ${b}`);

/** Artboard point (part's own coordinates) → screen pixel, through the part's current transform. */
const toPage = (id, name, local) => page.evaluate(async ({ id, name, local }) => {
  const { partTransform } = await import('/src/CE_Application/utils/bezierPath.js');
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const control = get(panels).find((p) => p.id === get(activePanelId)).controls.find((c) => c._children.Core.id === id);
  const part = control._children.Parts._children[name];
  const board = document.querySelector('.surface-shell .artboard');
  const rect = board.getBoundingClientRect();
  const zoom = rect.width / board.offsetWidth;
  const t = partTransform(part, board.offsetWidth, board.offsetHeight);
  const L = part._children.Layout;
  const p = t.toScreen({ x: L.x + local.fx * L.width, y: L.y + local.fy * L.height });
  return { x: rect.left + p.x * zoom, y: rect.top + p.y * zoom, zoom };
}, { id, name, local });
const centreOf = (selector) => page.evaluate((selector) => {
  const r = document.querySelector(selector)?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}, selector);
async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await kit.settle(500);
}
const layoutOf = (id, name) => kit.read(id, `Parts.${name}._children.Layout`);

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 60, 'Transform.width': 260, 'Transform.height': 200 });
  await page.evaluate(async ({ id, bar, dial }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: { Fill: { _type: 'Fill', solidEnabled: true, colour } } } });
    const dialPart = createPartNode('dial', { kind: 'arcTrack', zIndex: 2, layout: dial, sections: fill('00000000') });
    dialPart.meta = { arcTrack: { thickness: 8, startAngle: 0, sweepAngle: 90 } };
    applyControlPatch(id, {
      'Parts._children': { bar: createPartNode('bar', { kind: 'rectangle', zIndex: 1, layout: bar, sections: fill('FFE0443A') }), dial: dialPart },
      'HitZones._children': { grab: { _type: 'HitZone', name: 'grab', source: 'part:bar', shape: 'rect', enabled: true } },
      'Designer.preview.showHitZones': true,
    });
  }, { id, bar: px(60, 70, 80, 24, { rotation: 30, scale: 1.5, pivotX: 30, pivotY: 50 }), dial: px(170, 40, 70, 70, { rotation: 90 }) });
  await kit.settle(400);
  const box = await kit.box(id);
  await page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(600);
  await page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  const selectRow = async (name) => {
    await page.locator('.list-row button.row-main', { has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).first().click();
    await kit.settle(500);
  };

  // --- Resize: the drawn right edge follows the pointer, the drawn left edge stays -------------------
  await selectRow('bar');
  const leftBefore = await toPage(id, 'bar', { fx: 0, fy: 0.5 });
  const rightBefore = await toPage(id, 'bar', { fx: 1, fy: 0.5 });
  const handle = await centreOf('.part-bound.selected [data-resize="r"]');
  // Along the bar's own axis (30° down to the right), 30 screen px.
  const axis = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  await drag(handle, { x: handle.x + axis.x * 30, y: handle.y + axis.y * 30 });
  const leftAfter = await toPage(id, 'bar', { fx: 0, fy: 0.5 });
  const rightAfter = await toPage(id, 'bar', { fx: 1, fy: 0.5 });
  check('resizing a turned, scaled part: the drawn edge follows the pointer and the far edge stays', () => {
    near(Math.hypot(leftAfter.x - leftBefore.x, leftAfter.y - leftBefore.y), 0, 2, 'left edge moved');
    near(Math.hypot(rightAfter.x - rightBefore.x, rightAfter.y - rightBefore.y), 30, 3, 'right edge travel');
  });

  // --- Rotate about the pivot -----------------------------------------------------------------------
  const pivot = await toPage(id, 'bar', { fx: 0.3, fy: 0.5 });
  const rot = await centreOf('.part-bound.selected .rotate-handle');
  const turnBy = 40 * Math.PI / 180;
  const vx = rot.x - pivot.x;
  const vy = rot.y - pivot.y;
  const target = { x: pivot.x + vx * Math.cos(turnBy) - vy * Math.sin(turnBy), y: pivot.y + vx * Math.sin(turnBy) + vy * Math.cos(turnBy) };
  const pivotBefore = pivot;
  await drag(rot, target);
  const rotated = await layoutOf(id, 'bar');
  const pivotAfter = await toPage(id, 'bar', { fx: 0.3, fy: 0.5 });
  check('the rotate handle turns the part about its pivot by the pointer\'s angle', () => {
    near(rotated.rotation, 70, 1.5, 'rotation');
    near(Math.hypot(pivotAfter.x - pivotBefore.x, pivotAfter.y - pivotBefore.y), 0, 1, 'the pivot stayed put');
  });

  // --- Pivot field: the part stays where it is drawn --------------------------------------------------
  const cornerBefore = await toPage(id, 'bar', { fx: 1, fy: 1 });
  await page.evaluate(async (id) => {
    const input = [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith('Pivot X'))?.querySelector('input');
    input.focus(); input.select();
  }, id);
  await page.keyboard.type('80');
  await page.keyboard.press('Enter');
  await kit.settle(600);
  const pivoted = await layoutOf(id, 'bar');
  const cornerAfter = await toPage(id, 'bar', { fx: 1, fy: 1 });
  check('typing a pivot leaves the part where it is drawn', () => {
    near(pivoted.pivotX, 80, 0.6, 'pivotX');
    near(Math.hypot(cornerAfter.x - cornerBefore.x, cornerAfter.y - cornerBefore.y), 0, 1.5, 'corner moved');
  });

  // --- Align left: the drawn left edge on the artboard's ----------------------------------------------
  await page.locator('.dock-inspector button, button').filter({ hasText: /^Left$/ }).first().click();
  await kit.settle(600);
  const drawnLeft = await page.evaluate(async (id) => {
    const { partTransform } = await import('/src/CE_Application/utils/bezierPath.js');
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const part = get(panels).find((p) => p.id === get(activePanelId)).controls.find((c) => c._children.Core.id === id)._children.Parts._children.bar;
    const L = part._children.Layout;
    const t = partTransform(part, 260, 200);
    return Math.min(...[[0, 0], [1, 0], [1, 1], [0, 1]].map(([fx, fy]) => t.toScreen({ x: L.x + fx * L.width, y: L.y + fy * L.height }).x));
  }, id);
  check('"align left" puts the drawn left edge on the artboard\'s', () => near(drawnLeft, 0, 1, 'drawn left'));

  // --- The follow zone is drawn turned ----------------------------------------------------------------
  // The overlay shows the selected zone only, so select it.
  await page.evaluate(async (id) => {
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, { 'Designer.selectedSurfaceKind': 'hitZone', 'Designer.selectedHitZone': 'grab' });
  }, id);
  await kit.settle(400);
  const zoneTransform = await page.evaluate(() => [...document.querySelectorAll('.hit-zone.follow')].map((z) => z.style.transform)[0] ?? '');
  check('a hit zone that follows the bar is drawn turned with it', () => {
    const [, turn, scale] = zoneTransform.match(/rotate\(([-\d.]+)deg\) scale\(([-\d.]+)\)/) ?? [];
    near(Number(turn), 70, 0.6, `zone turn in "${zoneTransform}"`);
    near(Number(scale), 1.5, 1e-6, 'zone scale');
  });

  // --- Arc handles on the drawn ends of a quarter-turned arc -------------------------------------------
  await selectRow('dial');
  const startHandle = await centreOf('.part-bound.selected .arc-start');
  const endHandle = await centreOf('.part-bound.selected .arc-end');
  // Compass 0° (up) turned a quarter is drawn to the right of centre; 90° (right) is drawn below.
  const r = (70 / 2 - 8 / 2) / 70;
  const drawnStart = await toPage(id, 'dial', { fx: 0.5, fy: 0.5 - r });
  const drawnEnd = await toPage(id, 'dial', { fx: 0.5 + r, fy: 0.5 });
  check('an arc\'s handles sit on its drawn ends', () => {
    near(Math.hypot(startHandle.x - drawnStart.x, startHandle.y - drawnStart.y), 0, 2, 'start handle');
    near(Math.hypot(endHandle.x - drawnEnd.x, endHandle.y - drawnEnd.y), 0, 2, 'end handle');
  });
  // Drag the start handle to the drawn left of the centre. Undo the quarter turn and that direction is
  // straight down in the arc's own frame: its own 180°.
  const centre = await toPage(id, 'dial', { fx: 0.5, fy: 0.5 });
  await drag(startHandle, { x: centre.x - 30, y: centre.y });
  const arc = await kit.read(id, 'Parts.dial.meta.arcTrack');
  check('dragging an arc handle sets the angle it is dropped at, through the turn', () => near(((arc.startAngle % 360) + 360) % 360, 180, 2, 'startAngle'));

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('turned parts: all checks passed');
