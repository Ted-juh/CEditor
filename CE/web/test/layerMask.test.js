// Layer masks: the model helpers the Mask tab and the Layers list write with (utils/partMask.js),
// Mask With Layer (utils/layerMaskOutline.js), and how the tab finds the layer it edits
// (stores/layerMaskActions.js designerMaskTarget).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_ALL_MASK_SRC, brightnessToAlpha, fitMaskToLayer, maskActive, maskLinked, newMask, partMaskCSS, relinkMask,
} from '../src/CE_Application/utils/partMask.js';
import { layerOutlineMask } from '../src/CE_Application/utils/layerMaskOutline.js';
import { designerMaskTarget } from '../src/CE_Application/stores/layerMaskActions.js';

const box = (x, y, width, height, extra = {}) => ({
  kind: 'rectangle',
  _children: {
    Layout: { mode: 'absolute', x, y, width, height, anchorX: 'left', anchorY: 'top', ...extra },
    Background: { mode: 'solid', _children: { Fill: { colour: 'FFFFFFFF' } } },
  },
});

const ellipse = (x, y, width, height) => ({ ...box(x, y, width, height), kind: 'ellipse' });

const svgOf = (src) => Buffer.from(src.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');

test('Add Mask makes a linked mask over the whole layer that shows all of it', () => {
  const mask = newMask();
  assert.deepEqual(mask, { enabled: true, src: REVEAL_ALL_MASK_SRC, x: 0, y: 0, width: 100, height: 100, invert: false, linked: true });
  assert.equal(maskActive(mask), true);
  assert.equal(maskLinked(mask), true);
  // Stretches to any box: a view box and no fixed aspect.
  assert.match(decodeURIComponent(REVEAL_ALL_MASK_SRC), /viewBox='0 0 16 16' preserveAspectRatio='none'/);
  assert.equal(maskLinked({ ...mask, linked: undefined }), true, 'a mask from before linking existed is linked');
});

test('unlinking a mask keeps it where it was, in % of the artboard, and linking it again brings it back', () => {
  const frame = { left: 50, top: 20, width: 100, height: 40 };
  const artboard = { width: 200, height: 100 };
  const mask = { ...newMask('x'), x: 10, y: 25, width: 50, height: 50 };
  const loose = relinkMask(mask, frame, artboard, false);
  // Box: left 50 + 10% of 100 = 60 px, 60/200 = 30 %; top 20 + 25% of 40 = 30 px = 30 %;
  // width 50 px = 25 %; height 20 px = 20 %.
  assert.deepEqual({ x: loose.x, y: loose.y, width: loose.width, height: loose.height, linked: loose.linked },
    { x: 30, y: 30, width: 25, height: 20, linked: false });
  const back = relinkMask(loose, frame, artboard, true);
  assert.deepEqual({ x: back.x, y: back.y, width: back.width, height: back.height, linked: back.linked },
    { x: 10, y: 25, width: 50, height: 50, linked: true });
  assert.equal(relinkMask(mask, frame, artboard, true), mask, 'already linked: unchanged');
});

test('Fit to Layer covers the layer\'s box, linked or not', () => {
  const frame = { left: 50, top: 20, width: 100, height: 40 };
  const artboard = { width: 200, height: 100 };
  const linked = fitMaskToLayer({ ...newMask('x'), x: 5, y: 5, width: 10, height: 10 }, frame, artboard);
  assert.deepEqual([linked.x, linked.y, linked.width, linked.height], [0, 0, 100, 100]);
  const loose = fitMaskToLayer({ ...newMask('x'), linked: false, x: 5, y: 5, width: 10, height: 10 }, frame, artboard);
  assert.deepEqual([loose.x, loose.y, loose.width, loose.height], [25, 20, 50, 40]);
});

test('an opaque picture becomes a mask by its brightness; one with transparency is its own mask', () => {
  const opaque = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255]);
  assert.equal(brightnessToAlpha(opaque), true);
  assert.deepEqual([...opaque], [255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 128]);
  const clear = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 100]);
  assert.equal(brightnessToAlpha(clear), false);
  assert.deepEqual([...clear], [10, 20, 30, 255, 10, 20, 30, 100], 'left alone');
});

test('the mask CSS places the picture in the box it is given', () => {
  const css = partMaskCSS({ ...newMask('data:image/png;base64,AA'), x: 25, y: 50, width: 50, height: 50 }, 200, 100);
  assert.match(css, /mask-image:url\("data:image\/png;base64,AA"\)/);
  assert.match(css, /mask-size:100px 50px/);
  assert.match(css, /mask-position:50px 50px/);
  assert.equal(partMaskCSS({ ...newMask('x'), enabled: false }, 10, 10), '', 'off: nothing');
});

test('Mask With Layer: another layer\'s outline, placed in the masked layer\'s box', async () => {
  // A 100×100 layer at (50, 0); a circle 60 across at (70, 20) masks it.
  const target = box(50, 0, 100, 100);
  const made = await layerOutlineMask(ellipse(70, 20, 60, 60), target, 200, 100, { linked: true });
  assert.ok(made);
  assert.deepEqual([made.x, made.y, made.width, made.height, made.linked], [20, 20, 60, 60, true]);
  const svg = svgOf(made.src);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="60" height="60" viewBox="0 0 60 60" preserveAspectRatio="none">/);
  assert.match(svg, /<path fill="#fff" fill-rule="evenodd" d="M/);
});

test('Mask With Layer, not linked: placed on the artboard', async () => {
  const made = await layerOutlineMask(ellipse(70, 20, 60, 60), box(50, 0, 100, 100), 200, 100, { linked: false });
  assert.deepEqual([made.x, made.y, made.width, made.height, made.linked], [35, 20, 30, 60, false]);
});

test('Mask With Layer on a turned layer: the outline is turned back into its box', async () => {
  // The target is turned 90° about its centre; a bar across the artboard's top half then lies
  // along one side of the target's own box: its left.
  const target = box(0, 0, 100, 100, { rotation: 90 });
  const made = await layerOutlineMask(box(0, 0, 100, 50), target, 100, 100, { linked: true });
  // CSS turns the box's left half clockwise into the top half, so that is where the mask goes.
  assert.deepEqual([made.x, made.y, made.width, made.height], [0, 0, 50, 100]);
});

test('Mask With Layer has nothing to make from a layer with no area', async () => {
  assert.equal(await layerOutlineMask(box(0, 0, 0, 0), box(0, 0, 10, 10), 100, 100), null);
  assert.equal(await layerOutlineMask(null, box(0, 0, 10, 10), 100, 100), null);
});

test('the Mask tab edits the first selected layer of the control the designer holds', () => {
  const control = {
    _children: {
      Core: { id: 'c1' },
      Transform: { width: 200, height: 100 },
      Parts: { _children: {
        face: { ...box(50, 0, 100, 100), mask: { ...newMask('x') } },
        window: ellipse(70, 20, 60, 60),
        envelope: { kind: 'envelopePath', _children: { Layout: { x: 0, y: 0, width: 10, height: 10 } } },
      } },
    },
  };
  const status = { kind: 'Layer', controlId: 'c1', layers: ['face', 'window'] };
  const fromPanel = designerMaskTarget(status, [{ _children: { Core: { id: 'other' } } }, control]);
  assert.equal(fromPanel.layer, 'face');
  assert.equal(fromPanel.mask.src, 'x');
  assert.deepEqual(fromPanel.frame, { left: 50, top: 0, width: 100, height: 100 });
  assert.deepEqual(fromPanel.artboard, { width: 200, height: 100 });
  assert.deepEqual(fromPanel.layers, ['window'], 'only layers with an outline can mask');
  assert.equal(designerMaskTarget(status, [], control).layer, 'face', 'a component open on its own');
  assert.equal(designerMaskTarget({ ...status, kind: '' }, [control]), null, 'designer closed');
  assert.equal(designerMaskTarget({ ...status, layers: [] }, [control]), null, 'nothing selected');
  assert.equal(designerMaskTarget(status, [], null), null, 'control not found');
});
