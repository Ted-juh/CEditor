/**
 * booleanRuntime.mjs — a combined shape at run time: on the panel, in preview, as the plug-in draws it.
 *
 * The designer check (partBooleans.mjs) edits shapes. This one plays one: a component whose hole is
 * bound to its value, drawn by CanvasControl through resolveInteractiveControl — the path the panel
 * preview and the exported player share. Turning the value moves the hole, and the cut moves with it,
 * which means the operands reached the shape after bindings and the outline was recomputed on demand.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/booleanRuntime.mjs
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
const red = ([r, g, b]) => r > 170 && g < 120 && b < 120;

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 60, 'Transform.width': 200, 'Transform.height': 100 });
  const groupName = await page.evaluate(async ({ id, plateBox, holeBox }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const { planBooleanGroup } = await import('/src/CE_Application/utils/booleanGroups.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: { Fill: { _type: 'Fill', solidEnabled: true, colour } } } });
    const plate = createPartNode('plate', { kind: 'rectangle', zIndex: 1, layout: plateBox, sections: fill('FFE0443A') });
    const hole = createPartNode('hole', { kind: 'circle', zIndex: 2, layout: holeBox, sections: fill('FF3A8BE0') });
    const parts = { plate, hole };
    const plan = await planBooleanGroup(parts, [['plate', plate, plate], ['hole', hole, hole]], 'subtract', { artboardWidth: 200, artboardHeight: 100 });
    applyControlPatch(id, {
      'Parts._children': plan.parts,
      'Bindings._children': { slide: { _type: 'Binding', enabled: true, source: 'value.normalized', inputMin: 0, inputMax: 1, outputMin: 10, outputMax: 130, target: 'Parts.hole.Layout.x' } },
    });
    return plan.groupName;
  }, { id, plateBox: px(0, 0, 200, 100), holeBox: px(10, 20, 60, 60) });
  await kit.settle(500);

  const setValue = (value) => page.evaluate(async ({ id, value }) => {
    const { updatePanelPreviewSession, updateInteractionPreviewSession } = await import('/src/CE_Application/stores/interactionPreview.js');
    const patch = { valueOverrideEnabled: true, valueOverride: value, customNormalizedValue: value };
    updatePanelPreviewSession(id, patch);
    updateInteractionPreviewSession(id, patch);
  }, { id, value });

  await kit.preview(true);
  await setValue(0);
  await kit.settle(900);
  const left = await kit.livePixels(id, [[0.2, 0.5], [0.8, 0.5]]);
  await setValue(1);
  await kit.settle(900);
  const right = await kit.livePixels(id, [[0.2, 0.5], [0.8, 0.5]]);
  check('on the panel, the value moves the hole and the cut goes with it', () => {
    assert.ok(left && right, 'drawn');
    assert.ok(!red(left[0]) && red(left[1]), `value 0: hole on the left ${JSON.stringify(left)}`);
    assert.ok(red(right[0]) && !red(right[1]), `value 1: hole on the right ${JSON.stringify(right)}`);
  });
  const drawn = await page.evaluate(({ id, groupName }) => ({
    group: document.querySelectorAll(`[data-control-id="${id}"] [data-part-name="${groupName}"]`).length,
    operands: document.querySelectorAll(`[data-control-id="${id}"] [data-part-name="plate"], [data-control-id="${id}"] [data-part-name="hole"]`).length,
  }), { id, groupName });
  check('the panel draws the shape, not its operands', () => assert.deepEqual(drawn, { group: 1, operands: 0 }));
  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('boolean runtime: all checks passed');
