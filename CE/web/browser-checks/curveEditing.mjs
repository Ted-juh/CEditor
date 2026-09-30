/**
 * curveEditing.mjs — editing a flattened path anchor by anchor, in the real component designer.
 *
 * test/bezierPath.test.js holds the geometry. This drives SurfaceCurveEditor with a real pointer on a
 * part made the way users make one — a plate with a round hole, combined and flattened — and reads the
 * document after each gesture:
 *
 *   anchors      every anchor of the outline and the hole has a handle
 *   drag         dragging the plate's corner moves it and the box follows; one undo puts it back
 *   handles      selecting a hole anchor shows its Bézier handles; dragging one bends the curve and the
 *                smooth partner turns with it
 *   insert       double-clicking the outline adds an anchor there
 *   toggle       double-clicking a corner makes it smooth
 *   remove       Alt-clicking the hole's anchors removes them, and with the last ones, the hole
 *   turned       on a turned part the handles sit on the drawn shape, and an edit leaves the rest
 *                of it where it was
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/curveEditing.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const page = kit.page;
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
const px = (x, y, width, height) => ({ _type: 'PartLayout', mode: 'absolute', x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50 });

const centre = (selector) => page.evaluate((selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
const count = (selector) => page.evaluate((selector) => document.querySelectorAll(selector).length, selector);
const history = (verb) => page.evaluate(async (verb) => { (await import('/src/CE_Application/stores/history.js'))[verb](); }, verb);
async function dragBy(selector, dx, dy, modifiers = {}) {
  const from = await centre(selector);
  if (modifiers.alt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
  if (modifiers.alt) await page.keyboard.up('Alt');
  await kit.settle(500);
}

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 80, 'Transform.width': 220, 'Transform.height': 160 });
  await page.evaluate(async ({ id, box, dot }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const { planBooleanGroup } = await import('/src/CE_Application/utils/booleanGroups.js');
    const { planFlatten } = await import('/src/CE_Application/utils/partBooleans.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: { Fill: { _type: 'Fill', solidEnabled: true, colour } } } });
    const plate = createPartNode('plate', { kind: 'rectangle', zIndex: 1, layout: box, sections: fill('FFE0443A') });
    const hole = createPartNode('hole', { kind: 'circle', zIndex: 2, layout: dot, sections: fill('FF3A8BE0') });
    const size = { artboardWidth: 220, artboardHeight: 160 };
    const group = await planBooleanGroup({ plate, hole }, [['plate', plate, plate], ['hole', hole, hole]], 'subtract', size);
    const flat = await planFlatten({ _children: {} }, group.parts, group.parts, group.groupName, size);
    const [name] = Object.keys(flat.parts);
    applyControlPatch(id, { 'Parts._children': { shape: { ...flat.parts[name], name: 'shape' } } });
  }, { id, box: px(20, 20, 120, 100), dot: px(50, 40, 60, 60) });
  await kit.settle(400);

  const box = await kit.box(id);
  await page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(600);
  await page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  const zoom = await page.evaluate(() => {
    const el = document.querySelector('.surface-shell .artboard');
    return el.getBoundingClientRect().width / el.offsetWidth;
  });
  await page.locator('.list-row button.row-main:has-text("shape")').first().click();
  await kit.settle(600);

  const anchors = await count('[data-testid="curve-overlay"] [data-anchor]');
  check('a flattened path shows every anchor: four for the plate, four for the hole', () => assert.equal(anchors, 8));

  // The plate's bottom-right corner is anchor 0:2 (clockwise from the top-left).
  const layout0 = await kit.read(id, 'Parts.shape._children.Layout');
  await dragBy('[data-anchor="0:2"]', 20 * zoom, 10 * zoom);
  const layout1 = await kit.read(id, 'Parts.shape._children.Layout');
  check('dragging the corner moves it, and the box follows', () => {
    assert.ok(Math.abs(layout1.width - layout0.width - 20) < 1.5, `width ${layout0.width} → ${layout1.width}`);
    assert.ok(Math.abs(layout1.height - layout0.height - 10) < 1.5, `height ${layout0.height} → ${layout1.height}`);
    assert.equal(layout1.x, layout0.x);
  });
  await history('undo');
  await kit.settle(600);
  const layout2 = await kit.read(id, 'Parts.shape._children.Layout');
  check('one undo puts it back', () => assert.equal(layout2.width, layout0.width));

  // Select a hole anchor: its handles show; bend the curve.
  await page.locator('[data-anchor="1:0"]').click();
  await kit.settle(400);
  const handles = await count('[data-testid="curve-overlay"] [data-handle]');
  check('selecting a hole anchor shows its handles and its neighbours\'', () => assert.ok(handles >= 3, `${handles} handles`));
  const data0 = await kit.read(id, 'Parts.shape.meta.pathData');
  await dragBy('[data-handle="1:0:out"]', 0, 12 * zoom);
  const data1 = await kit.read(id, 'Parts.shape.meta.pathData');
  const smoothAfter = await page.evaluate(async (d) => {
    const { parsePathData, isSmooth } = await import('/src/CE_Application/utils/bezierPath.js');
    return isSmooth(parsePathData(d)[1].nodes[0]);
  }, data1);
  check('dragging a handle bends the curve, and its smooth partner turns with it', () => {
    assert.notEqual(data1, data0);
    assert.equal(smoothAfter, true);
  });

  // Double-click the plate's top edge, between its corners.
  const edge = await page.evaluate(() => {
    const a = document.querySelector('[data-anchor="0:0"]').getBoundingClientRect();
    const b = document.querySelector('[data-anchor="0:1"]').getBoundingClientRect();
    return { x: (a.left + a.width / 2 + b.left + b.width / 2) / 2, y: (a.top + a.height / 2 + b.top + b.height / 2) / 2 };
  });
  await page.mouse.dblclick(edge.x, edge.y);
  await kit.settle(500);
  const afterInsert = await count('[data-testid="curve-overlay"] [data-anchor^="0:"]');
  check('double-clicking the outline adds an anchor there', () => assert.equal(afterInsert, 5));

  // Double-click a corner: it turns smooth.
  const cornerSel = '[data-anchor="0:0"]';
  const corner = await centre(cornerSel);
  await page.mouse.dblclick(corner.x, corner.y);
  await kit.settle(500);
  const cornerSmooth = await page.evaluate(() => Number(document.querySelector('[data-anchor="0:0"]').getAttribute('rx')) > 0);
  check('double-clicking a corner makes it smooth', () => assert.equal(cornerSmooth, true));

  // Alt-click the hole's anchors away: at two left, the hole goes.
  for (let k = 0; k < 3; k += 1) {
    const at = await centre('[data-anchor="1:0"]');
    if (!at) break;
    await page.keyboard.down('Alt');
    await page.mouse.click(at.x, at.y);
    await page.keyboard.up('Alt');
    await kit.settle(400);
  }
  const holeGone = await count('[data-testid="curve-overlay"] [data-anchor^="1:"]');
  const subpaths = await page.evaluate(async (d) => {
    const { parsePathData } = await import('/src/CE_Application/utils/bezierPath.js');
    return parsePathData(d).length;
  }, await kit.read(id, 'Parts.shape.meta.pathData'));
  check('Alt-clicking the hole\'s anchors removes them, and with the last ones the hole', () => {
    assert.equal(holeGone, 0);
    assert.equal(subpaths, 1);
  });

  // A turned part: handles sit on the drawn shape, and an edit leaves the rest of it in place.
  await history('undo'); await history('undo'); await history('undo');
  await kit.settle(600);
  await page.evaluate(async (id) => {
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, { 'Parts.shape._children.Layout.rotation': 30 });
  }, id);
  await kit.settle(700);
  const onShape = await page.evaluate(() => {
    const anchor = document.querySelector('[data-anchor="0:0"]').getBoundingClientRect();
    const drawn = document.querySelector('.artboard [data-part-name="shape"] svg path, .artboard [data-part-name="shape"] .bg-fill-layer');
    const part = document.querySelector('.artboard [data-part-name="shape"]').getBoundingClientRect();
    return { anchor: { x: anchor.left + anchor.width / 2, y: anchor.top + anchor.height / 2 }, part: { left: part.left, top: part.top, right: part.right, bottom: part.bottom }, drawn: !!drawn };
  });
  const before = await centre('[data-anchor="0:2"]');
  await dragBy('[data-anchor="0:0"]', -10 * zoom, -6 * zoom);
  const after = await centre('[data-anchor="0:2"]');
  check('on a turned part, the handles sit on the drawn shape and an edit leaves the rest in place', () => {
    assert.ok(onShape.anchor.x >= onShape.part.left - 2 && onShape.anchor.x <= onShape.part.right + 2, JSON.stringify(onShape));
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1.5, `the far corner moved ${JSON.stringify({ before, after })}`);
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('curve editing: all checks passed');
