/**
 * penTool.mjs — the Component Designer's Pen, driven with a real pointer.
 *
 * test/penPath.test.js pins the geometry. This checks the gestures in the running designer:
 *
 *   draw     P, three clicks, click the first point: a closed `path` part, drawn as an SVG polygon
 *            by the part renderer, with its box tight round the points
 *   open     two clicks and Enter: an open path, drawn as a polyline
 *   escape   Escape mid-drawing abandons it and makes nothing
 *   edit     the selected path shows a handle per point; dragging one moves that point,
 *            Alt-clicking one removes it, double-clicking the outline adds one
 *   undo     Undo takes the last edit back
 *
 * Run: node browser-checks/penTool.mjs   (PEN_SHOT=pen.png also saves a picture of the artboard)
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

/** The component's parts, straight from the document. */
const partsOf = (id) => kit.page.evaluate(async (id) => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const control = (live?.controls ?? []).find((c) => c._children?.Core?.id === id);
  return JSON.parse(JSON.stringify(control?._children?.Parts?._children ?? {}));
}, id);
const paths = async (id) => Object.entries(await partsOf(id)).filter(([, part]) => part.kind === 'path');

try {
  await kit.fresh();
  const id = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 90, 'Transform.width': 240, 'Transform.height': 160, 'Core.name': 'Pen' });
  await kit.set(id, { 'Parts._children': {} });   // an empty artboard: only what the Pen makes
  await kit.settle(500);
  const box = await kit.box(id);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);

  const artboard = kit.page.locator('.surface-shell .artboard');
  const zoom = await kit.page.evaluate(() => {
    const el = document.querySelector('.surface-shell .artboard');
    return el.getBoundingClientRect().width / el.offsetWidth;
  });
  const board = await artboard.boundingBox();
  // Artboard units → page pixels.
  const at = (x, y) => ({ x: board.x + x * zoom, y: board.y + y * zoom });
  const click = async (x, y, opts = {}) => { const p = at(x, y); await kit.page.mouse.click(p.x, p.y, opts); await kit.settle(120); };

  // --- Draw a closed shape: a tapered knob pointer ----------------------------------------------
  await kit.page.keyboard.press('p');
  await kit.settle(200);
  await click(120, 20);
  await click(130, 100);
  await click(110, 100);
  const preview = await kit.page.locator('[data-testid="pen-overlay"] .pen-draft').count();
  await click(120, 20);                                     // the first point again: close it
  await kit.settle(400);
  let made = await paths(id);
  const rendered = await kit.page.evaluate(() => document.querySelectorAll('.surface-shell .artboard .interactive-vector-shape polygon').length);
  check('three clicks and the first point again make a closed path part, drawn as a polygon', () => {
    assert.equal(preview, 1, 'a dashed preview follows the drawing');
    assert.equal(made.length, 1, JSON.stringify(made.map(([n]) => n)));
    const [, part] = made[0];
    assert.equal(part.meta.closed, true);
    assert.equal(part.meta.vectorPoints.length, 3);
    assert.deepEqual([part._children.Layout.x, part._children.Layout.y, part._children.Layout.width, part._children.Layout.height], [110, 20, 20, 80]);
    assert.equal(rendered, 1);
  });

  // --- Edit it -----------------------------------------------------------------------------------
  const [name] = made[0];
  const handles = await kit.page.locator('[data-testid="pen-overlay"] .pen-handle').count();
  check('the selected path shows a handle per point', () => assert.equal(handles, 3));

  const tip = at(120, 20);
  await kit.page.mouse.move(tip.x, tip.y);
  await kit.page.mouse.down();
  const to = at(120, 10);
  await kit.page.mouse.move(to.x, to.y, { steps: 6 });
  await kit.page.mouse.up();
  await kit.settle(500);
  made = await paths(id);
  check('dragging a handle moves that point, and the box follows', () => {
    const layout = made[0][1]._children.Layout;
    assert.deepEqual([layout.y, layout.height], [10, 90]);
  });

  // Double-click the left edge, between (120,10) and (110,100): somewhere near (115, 55).
  const edge = at(115, 55);
  await kit.page.mouse.dblclick(edge.x, edge.y);
  await kit.settle(400);
  made = await paths(id);
  const afterInsert = made[0][1].meta.vectorPoints.length;
  check('double-clicking the outline adds a point there', () => assert.equal(afterInsert, 4));

  const handle = kit.page.locator('[data-testid="pen-overlay"] .pen-handle[data-point="3"]');
  const hb = await handle.boundingBox();
  await kit.page.keyboard.down('Alt');
  await kit.page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await kit.page.keyboard.up('Alt');
  await kit.settle(400);
  made = await paths(id);
  check('Alt-clicking a handle removes that point', () => assert.equal(made[0][1].meta.vectorPoints.length, 3));

  if (process.env.PEN_SHOT) await artboard.screenshot({ path: process.env.PEN_SHOT });

  // --- Undo -------------------------------------------------------------------------------------
  await kit.page.evaluate(async () => { (await import('/src/CE_Application/stores/history.js')).pushSnapshot(); });
  await kit.page.evaluate(async () => { (await import('/src/CE_Application/stores/history.js')).undo(); });
  await kit.settle(400);
  made = await paths(id);
  check('Undo takes the last edit back', () => assert.equal(made[0]?.[1]?.meta?.vectorPoints?.length, 4));

  // A plain press on the outline still moves the whole part, as it would without the Pen's hit area.
  const beforeMove = (await paths(id))[0][1];
  const outline = at(125, 60);                              // on the right edge, (120,10)→(130,100)
  await kit.page.mouse.move(outline.x, outline.y);
  await kit.page.mouse.down();
  const dest = at(155, 60);
  await kit.page.mouse.move(dest.x, dest.y, { steps: 8 });
  await kit.page.mouse.up();
  await kit.settle(500);
  const afterMove = (await paths(id))[0][1];
  check('dragging the outline moves the whole shape, points unchanged', () => {
    assert.equal(afterMove._children.Layout.x - beforeMove._children.Layout.x, 30);
    assert.deepEqual(afterMove.meta.vectorPoints, beforeMove.meta.vectorPoints);
  });

  // --- An open path, and Escape -----------------------------------------------------------------
  await kit.page.keyboard.press('p');
  await kit.settle(200);
  await click(20, 140);
  await click(80, 140);
  await kit.page.keyboard.press('Escape');
  await kit.settle(300);
  const afterEscape = (await paths(id)).length;
  check('Escape abandons a drawing and makes nothing', () => assert.equal(afterEscape, 1));

  await kit.page.keyboard.press('p');
  await kit.settle(200);
  await click(20, 140);
  await click(60, 120);
  await click(100, 140);
  await kit.page.keyboard.press('Enter');
  await kit.settle(400);
  made = await paths(id);
  const open = made.find(([n]) => n !== name)?.[1];
  const polylines = await kit.page.evaluate(() => document.querySelectorAll('.surface-shell .artboard .interactive-vector-shape polyline').length);
  check('Enter finishes an open path, drawn as a stroked polyline', () => {
    assert.equal(open?.meta?.closed, false);
    assert.equal(open?.meta?.vectorPoints?.length, 3);
    assert.equal(polylines, 1);
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} pen check(s) failed`);
console.log('pen tool: all checks passed');
