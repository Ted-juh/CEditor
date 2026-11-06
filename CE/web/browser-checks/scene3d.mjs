/**
 * A 3D part in the Component Designer (stores/scene3dActions.js; docs/design/import-formats.md, 3):
 * drawn with the 3D tool, rendered by three.js into the Blender add-on's layers and merged into the
 * component; its objects listed under it in the Layers list and edited in the dock's 3D tab; given a
 * grab area on the component's value; its colour changed at once, its box moved with what it made, and
 * its shape changed by a render.
 *
 *   node browser-checks/scene3d.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1600, height: 1000 });
const { page } = kit;

async function pixelAt(x, y) {
  const box = await page.locator('.artboard').first().boundingBox();
  const shot = await page.screenshot({ clip: { x: box.x + x - 1, y: box.y + y - 1, width: 3, height: 3 } });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(1, 1, 1, 1).data.slice(0, 3));
  }, shot.toString('base64'));
}

const control = () => page.evaluate(async () => {
  const { standaloneComponentControl } = await window.__ceImport('/src/CE_Application/stores/controls.js');
  let value; standaloneComponentControl.subscribe((v) => { value = v; })();
  return JSON.parse(JSON.stringify(value?._children ?? {}));
});

async function waitRendered(label) {
  let status = '';
  for (let i = 0; i < 360; i += 1) {
    status = await page.locator('[data-testid="scene3d-status"]').first().innerText().catch(() => '');
    if (/could not|WebGL/.test(status)) break;
    if (/^Rendered/.test(status)) return status;
    await kit.settle(500);
  }
  throw new Error(`${label}: not rendered (${status})`);
}

try {
  await kit.fresh();
  await page.evaluate(async () => {
    const { createComponentDocument } = await window.__ceImport('/src/CE_Application/stores/componentWorkspace.js');
    const { setActiveEditorTab } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    setActiveEditorTab({ type: 'component', id: createComponentDocument().id });
  });
  await page.waitForSelector('.artboard', { timeout: 30000 });
  await kit.settle(800);

  // Drawn with the 3D tool: a knob to start from, rendered, its objects under it.
  await page.click('[data-testid="tool-scene3d"]');
  const board = await page.locator('.artboard').first().boundingBox();
  const scale = board.width / 200;
  const at = (x, y) => [board.x + x * scale, board.y + y * scale];
  await page.mouse.move(...at(60, 50));
  await page.mouse.down();
  await page.mouse.move(...at(90, 80), { steps: 3 });
  await page.mouse.move(...at(140, 130), { steps: 3 });
  await page.mouse.up();
  const first = await waitRendered('drawn');
  assert.deepEqual(await page.locator('[data-testid="scene3d-object"]').allInnerTexts(), ['skirt\nstays', 'body\nturns · round', 'top\nturns · round', 'pointer\nturns']);
  let children = await control();
  const parts = children.Parts._children;
  assert.equal(parts.knob.kind, 'scene3d');
  const made = Object.keys(parts).filter((name) => parts[name]?.meta?.scene3dOf === 'knob');
  assert.ok(made.includes('knob__pointer') && made.includes('knob__body_rotor'), made.join(', '));
  assert.equal(parts.knob__pointer._children.Image.mode, 'frames');
  assert.ok(Object.values(children.Bindings._children).some((binding) => binding.target === 'Parts.knob__pointer.Image.frameIndex'));
  const zone = Object.values(children.HitZones._children)[0];
  assert.ok(zone && zone.targetValueChannel === 'mainValue', 'a grab area on the component\'s value');
  assert.doesNotMatch((await page.locator('.list-row .row-text strong').allInnerTexts()).join(' '), /knob__/, 'what it made is not listed layer by layer');
  console.log(`  ok  drawn with the 3D tool: ${first}, ${made.length} parts, its objects listed under it, a grab area on the value`);

  // Its colour, at once: the body red without a render.
  const bodyAt = [100 - 26 + 4, 90];
  const before = await pixelAt(bodyAt[0] * scale, bodyAt[1] * scale);
  await page.evaluate(async () => {
    const { setScene3dColour } = await window.__ceImport('/src/CE_Application/stores/scene3dActions.js');
    const { standaloneComponentControl } = await window.__ceImport('/src/CE_Application/stores/controls.js');
    let value; standaloneComponentControl.subscribe((v) => { value = v; })();
    setScene3dColour(value._children.Core.id, 'knob', 1, 'FFB22222');
  });
  let after = before;
  for (let i = 0; i < 20 && after[0] - after[2] < 30; i += 1) { await kit.settle(250); after = await pixelAt(bodyAt[0] * scale, bodyAt[1] * scale); }
  assert.ok(after[0] - after[2] > 30, `the body red: ${after} (was ${before})`);
  assert.equal(await page.locator('[data-testid="scene3d-status"]').first().innerText(), first, 'no render for a colour');
  children = await control();
  assert.equal(children.Parts._children.knob.meta.scene3d.objects[1].material.colour, 'FFB22222', 'and the recipe keeps it');
  console.log(`  ok  its colour at once, no render: the body ${after} where it was ${before}`);

  // Moved: what it made moves with it.
  const pointerX = children.Parts._children.knob__pointer._children.Layout.x;
  await page.evaluate(async () => {
    const { updateControlProperty, standaloneComponentControl } = await window.__ceImport('/src/CE_Application/stores/controls.js');
    let value; standaloneComponentControl.subscribe((v) => { value = v; })();
    updateControlProperty(value._children.Core.id, 'Parts.knob.Layout.x', value._children.Parts._children.knob._children.Layout.x + 20);
  });
  let moved = pointerX;
  for (let i = 0; i < 20 && Math.abs(moved - pointerX - 20) > 0.5; i += 1) { await kit.settle(200); moved = (await control()).Parts._children.knob__pointer._children.Layout.x; }
  assert.ok(Math.abs(moved - pointerX - 20) < 0.5, `the pointer moved with it: ${pointerX} to ${moved}`);
  console.log('  ok  moved: what it made moves with it, no render');

  // Its shape: a render.
  await page.evaluate(async () => {
    const { setScene3dObject } = await window.__ceImport('/src/CE_Application/stores/scene3dActions.js');
    const { standaloneComponentControl } = await window.__ceImport('/src/CE_Application/stores/controls.js');
    let value; standaloneComponentControl.subscribe((v) => { value = v; })();
    setScene3dObject(value._children.Core.id, 'knob', 2, { shape: { top: 'dome' } });
  });
  await kit.settle(300);
  const second = await waitRendered('reshaped');
  children = await control();
  assert.equal(children.Parts._children.knob.meta.scene3d.objects[2].shape.top, 'dome');
  assert.equal(Object.keys(children.Parts._children).filter((name) => name.startsWith('knob__')).length, made.length, 'replaced, not added');
  console.log(`  ok  its shape: rendered again (${second}), its parts replaced`);
  assert.deepEqual(kit.failures, [], 'the page must not throw');
  console.log('scene3d: a 3D part is drawn, rendered, listed, recoloured, moved and reshaped');
} finally {
  await kit.close();
}
