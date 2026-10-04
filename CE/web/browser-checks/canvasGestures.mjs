/**
 * Canvas gestures with a real pointer — resize, drag and group resize, and the snapping under them.
 *
 * Until this, no browser check dragged a resize handle, a rotated control or the group box; the
 * maths was unit-tested (test/canvasSnapPolish.test.js) and the handlers were not. Each case here is
 * the gesture a defect lived in:
 *
 *   - resizing a right edge up to a neighbour snaps by WIDENING, not by shoving the box sideways;
 *   - an edge handle honours the control's own aspect lock;
 *   - a control rotated 90° snaps by its visible edge while being dragged;
 *   - a group resize grows a 90° member along the axis it lies on.
 *
 * Run: node browser-checks/canvasGestures.mjs  (starts the dev server, like the behaviour checks)
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failed = [];
/** Every case runs and reports, so a run against old code shows each defect, not just the first. */
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failed.push(name); console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`); }
};

async function shape(patch) {
  const id = await kit.make('Shape', {});
  await kit.set(id, { 'Shape.kind': 'rectangle', 'Shape.strokeEnabled': false, ...patch });
  return id;
}
const transform = async (id) => ({
  x: await kit.read(id, 'Transform.x'),
  y: await kit.read(id, 'Transform.y'),
  w: await kit.read(id, 'Transform.width'),
  h: await kit.read(id, 'Transform.height'),
});
const select = (ids) => kit.page.evaluate(async (list) => {
  const { selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
  selectedComponentIds.set(new Set(list));
}, ids);
async function pointerDrag(from, to) {
  await kit.page.mouse.move(from.x, from.y);
  await kit.page.mouse.down();
  await kit.settle(60);
  await kit.page.mouse.move(to.x, to.y, { steps: 12 });
  await kit.settle(60);
  await kit.page.mouse.up();
  await kit.settle(200);
}

try {
  await kit.fresh();
  await kit.preview(false);

  // --- Resize snaps by widening ------------------------------------------------------------------
  const a = await shape({ 'Transform.x': 150, 'Transform.y': 100, 'Transform.width': 100, 'Transform.height': 60 });
  // Off the 10px grid on purpose: grid snapping alone must not be able to land the edge on it.
  // Clear of the panel's centre (300) and edges too, which are snap targets of their own and win ties.
  await shape({ 'Transform.x': 403, 'Transform.y': 320, 'Transform.width': 50, 'Transform.height': 50 });
  await select([a]);
  await kit.settle(200);
  const boxA = await kit.box(a);
  const scale = boxA.w / 100;
  // Right handle: middle of the right edge. Drag it to 397; the grid makes that 400, 3px short of the
  // neighbour's left edge at 403 — only alignment snapping can close the gap.
  await pointerDrag({ x: boxA.x + boxA.w, y: boxA.y + boxA.h / 2 }, { x: boxA.x + boxA.w + 147 * scale, y: boxA.y + boxA.h / 2 });
  const resized = await transform(a);
  check('resizing a right edge up to a neighbour widens the box to it and leaves the left edge alone', () => {
    assert.equal(resized.x, 150, `the box was moved: ${JSON.stringify(resized)}`);
    assert.equal(resized.w, 253, `the edge did not land on the neighbour: ${JSON.stringify(resized)}`);
  });

  // --- Aspect lock on an edge ---------------------------------------------------------------------
  const b = await shape({ 'Transform.x': 100, 'Transform.y': 500, 'Transform.width': 200, 'Transform.height': 100, 'Transform.aspectLock': true });
  await select([b]);
  await kit.settle(200);
  const boxB = await kit.box(b);
  await pointerDrag({ x: boxB.x + boxB.w, y: boxB.y + boxB.h / 2 }, { x: boxB.x + boxB.w + 60 * scale, y: boxB.y + boxB.h / 2 + 40 });
  const locked = await transform(b);
  check('an edge handle honours the control\'s aspect lock', () => {
    assert.ok(Math.abs(locked.w / locked.h - 2) < 0.03, `ratio broke: ${JSON.stringify(locked)}`);
    assert.ok(locked.w > 200, 'and it did resize');
  });

  // --- A rotated control snaps by what is on screen -------------------------------------------------
  const bar = await shape({ 'Transform.x': 600, 'Transform.y': 100, 'Transform.width': 100, 'Transform.height': 20, 'Transform.rotation': 90 });
  await shape({ 'Transform.x': 703, 'Transform.y': 360, 'Transform.width': 30, 'Transform.height': 30 });
  await select([bar]);
  await kit.settle(200);
  const boxBar = await kit.box(bar);
  // Visible right edge is at 660 (the bar is 20 wide on screen, centred on 650). Drag it 37 right;
  // the grid makes x 640, putting the visible edge at 700, 3px short of the neighbour at 703.
  const grab = { x: boxBar.x + boxBar.w / 2, y: boxBar.y + boxBar.h / 2 };
  await pointerDrag(grab, { x: grab.x + 37 * scale, y: grab.y });
  const moved = await transform(bar);
  check('a control rotated 90° snaps by its visible edge while dragged', () => {
    assert.equal(moved.x, 643, `visible right edge should meet 703 (x = 643): ${JSON.stringify(moved)}`);
  });

  // --- Group resize with a rotated member ----------------------------------------------------------
  await kit.fresh();
  await kit.preview(false);
  const plain = await shape({ 'Transform.x': 100, 'Transform.y': 100, 'Transform.width': 60, 'Transform.height': 100 });
  const turned = await shape({ 'Transform.x': 140, 'Transform.y': 140, 'Transform.width': 100, 'Transform.height': 20, 'Transform.rotation': 90 });
  await select([plain, turned]);
  await kit.settle(300);
  const handles = await kit.page.evaluate(() => [...document.querySelectorAll('.group-handle')]
    .map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  assert.ok(handles.length >= 4, 'the group box shows its handles');
  const midY = handles.reduce((sum, h) => sum + h.y, 0) / handles.length;
  const right = handles.filter((h) => Math.abs(h.y - midY) < 4).sort((p, q) => q.x - p.x)[0];
  const before = await transform(turned);
  await kit.page.keyboard.down('Control');       // no snapping: this case is about the scale, not the snap
  await pointerDrag(right, { x: right.x + 100 * scale, y: right.y });
  await kit.page.keyboard.up('Control');
  const after = await transform(turned);
  check('a group resize grows a 90° member along the axis it lies on', () => {
    // The group is 100 wide (100..200); +100 doubles it. The bar is 20 wide ON SCREEN — its own height.
    assert.equal(after.w, before.w, `its length runs along the unchanged height: ${JSON.stringify(after)}`);
    assert.equal(after.h, before.h * 2, `its thickness runs along the doubled width: ${JSON.stringify(after)}`);
  });

  assert.deepEqual(kit.failures, []);
  assert.deepEqual(failed, [], `${failed.length} gesture check(s) failed`);
  console.log('canvas gestures: all checks passed');
} finally {
  await kit.close();
}
