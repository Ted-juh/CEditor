/**
 * partBooleans.mjs — Unite / Subtract / Intersect / Exclude and Smooth, in the real component designer.
 *
 * test/partBooleans.test.js holds the geometry. This drives the designer: a component with a box and a
 * circle in front of it, both selected, Subtract pressed on the selection toolbar. One part is left,
 * drawn as one path with a hole where the circle was — the artboard shows through it — and one undo
 * brings both parts back. Then a Pen path is smoothed into a curve.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/partBooleans.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const px = (x, y, width, height) => ({ _type: 'PartLayout', mode: 'absolute', x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50 });

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 80, 'Transform.width': 200, 'Transform.height': 140 });
  await kit.page.evaluate(async ({ id, box, dot, pen }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: {
      Fill: { _type: 'Fill', solidEnabled: true, colour },
      Border: { _type: 'Border', enabled: false, thickness: 0 },
      Corners: { _type: 'Corners', linked: true, radius: 0, style: 'rounded' },
    } } });
    applyControlPatch(id, { 'Parts._children': {
      plate: createPartNode('plate', { kind: 'rectangle', zIndex: 1, layout: box, sections: fill('FFE0443A') }),
      hole: createPartNode('hole', { kind: 'circle', zIndex: 2, layout: dot, sections: fill('FF3A8BE0') }),
      mark: createPartNode('mark', { kind: 'path', zIndex: 3, layout: pen, sections: fill('FFF0C040'), meta: { vectorPoints: [[0, 1], [0.5, 0], [1, 1]], closed: true } }),
    } });
  }, { id, box: px(10, 10, 120, 100), dot: px(40, 30, 60, 60), pen: px(145, 30, 45, 40) });
  await kit.settle(300);

  // Open the designer on it, select plate + hole.
  const box = await kit.box(id);
  await kit.page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(600);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  // Select the way a user does, on the designer's artboard: the plate by its corner, the hole with Shift.
  const spot = (name, fx, fy) => kit.page.evaluate(({ name, fx, fy }) => {
    const el = document.querySelector(`.artboard [data-part-name="${name}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * fx, y: r.top + r.height * fy };
  }, { name, fx, fy });
  const corner = await spot('plate', 0.06, 0.06);
  await kit.page.mouse.click(corner.x, corner.y);
  await kit.settle(300);
  // The plate's own selection frame covers the circle, so the second one is added from the Layers list.
  await kit.page.locator('[aria-label="Add hole to selection"]').first().click();
  await kit.settle(600);
  if (process.env.PB_DEBUG) {
    console.log(JSON.stringify(await kit.page.evaluate(() => ({
      artboards: document.querySelectorAll('.artboard').length,
      parts: [...document.querySelectorAll('.artboard [data-part-name]')].map((e) => e.dataset.partName),
      multi: document.querySelectorAll('.multi-selection-bound').length,
      toolbars: document.querySelectorAll('.align-toolbar').length,
    }))), JSON.stringify({ corner }));
    await kit.page.screenshot({ path: '/tmp/claude-0/-home-user-CEditor/f92f5fc3-3793-5de3-8a44-de0b92cf6dea/scratchpad/pb.png' });
  }
  const subtract = kit.page.locator('[data-boolean="subtract"]');
  const shown = await subtract.count();
  check('with two shapes selected, Subtract is on the toolbar', () => assert.ok(shown >= 1, 'no Subtract button'));
  await subtract.first().click();
  await kit.settle(900);

  const after = await kit.read(id, 'Parts');
  const names = Object.keys(after?._children ?? {});
  const plate = after?._children?.plate;
  check('one part is left, the back one, as a path with the circle cut out', () => {
    assert.deepEqual(names.sort(), ['mark', 'plate']);
    assert.equal(plate.kind, 'path');
    assert.match(plate.meta.pathData, /^M0,0/);
    assert.equal((plate.meta.pathData.match(/M/g) ?? []).length, 2, 'an outline and a hole');
  });

  await kit.page.evaluate(async () => { const { undo } = await import('/src/CE_Application/stores/history.js'); undo(); });
  await kit.settle(600);
  const undone = await kit.read(id, 'Parts');
  check('one undo brings both shapes back as they were', () => {
    assert.deepEqual(Object.keys(undone?._children ?? {}).sort(), ['hole', 'mark', 'plate']);
    assert.equal(undone._children.plate.kind, 'rectangle');
  });

  await kit.page.evaluate(async () => { const { redo } = await import('/src/CE_Application/stores/history.js'); redo(); });
  await kit.settle(600);
  const redone = await kit.read(id, 'Parts');
  check('and redo combines them again', () => assert.deepEqual(Object.keys(redone?._children ?? {}).sort(), ['mark', 'plate']));
  // The hole shows what is behind it; the plate round it keeps its red. Read off the screen, with the
  // selection's own frame and handles out of the way.
  await kit.page.keyboard.press('Escape');
  await kit.settle(400);
  const rect = await kit.page.evaluate(() => {
    const r = document.querySelector('.artboard [data-part-name="plate"]').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const png = await kit.page.screenshot({ clip: rect });
  const colour = (fx, fy) => kit.page.evaluate(async ({ src, fx, fy }) => {
    const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = src; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return [...x.getImageData(Math.floor(img.width * fx), Math.floor(img.height * fy), 1, 1).data].slice(0, 3);
  }, { src: `data:image/png;base64,${png.toString('base64')}`, fx, fy });
  const drawn = await kit.page.evaluate(() => document.querySelectorAll('.artboard [data-part-name="plate"] svg path').length);
  const edge = await colour(0.08, 0.5);
  const middle = await colour(0.5, 0.5);
  const red = ([r, g, b]) => r > 180 && g < 110 && b < 110;
  check('it is drawn as one SVG path: red at the edge, the artboard showing through the hole', () => {
    assert.ok(drawn >= 1, 'no path drawn');
    assert.ok(red(edge), `edge ${edge}`);
    assert.ok(!red(middle), `the hole is filled: ${middle}`);
  });

  // Smooth the Pen triangle.
  const markSpot = await spot('mark', 0.5, 0.7);
  await kit.page.mouse.click(markSpot.x, markSpot.y);
  await kit.settle(600);
  const smooth = kit.page.locator('[data-path-smooth]');
  const smoothShown = await smooth.count();
  if (smoothShown) await smooth.first().click();
  await kit.settle(900);
  const mark = await kit.read(id, 'Parts.mark');
  check('a Pen path smooths into a curve through its points', () => {
    assert.ok(smoothShown >= 1, 'no Smooth button for a selected Pen path');
    assert.match(mark?.meta?.pathData ?? '', /c/, 'curves');
    assert.equal(mark.meta.vectorPoints, undefined, 'no longer a point list');
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('part booleans: all checks passed');
