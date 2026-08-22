// backgroundLayerClipboard.test.js — moving a background layer between a control and the panel
// (finding E3, first clause).
//
// The layer clipboard existed, but only inside sections/BackgroundEditor.svelte — the CONTROL
// background editor. The panel background is a separate implementation over flat `panel.bgFoo`
// fields and had no copy or paste of any kind, so a gradient or an image built on a control could
// not be moved to the panel behind it, or back, by any route short of retyping every number.
//
// The clipboard is shared now, and the payload stays in the control's dialect because that is
// what BackgroundEditor already reads and writes. Everything interesting is therefore the
// translation, including the name mismatch nobody would guess: the panel's fourth layer is
// "texture" and the control's is "overlay", and they are the same layer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  backgroundLayerClipboard,
  canPastePanelBackgroundLayer,
  copyBackgroundLayer,
  copyPanelBackgroundLayer,
  getBackgroundLayerClipboard,
  panelBackgroundLayerPatch,
  panelBackgroundLayerPayload,
} from '../src/CE_Application/stores/backgroundLayerClipboard.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';

function panelWithImage() {
  return {
    ...createPanel('Bg'),
    bgImage: 'C:/art/plate.png',
    bgImageOpacity: 70,
    bgImageFit: 'contain',
    bgImageTint: '223344',
    bgImageRotation: 15,
    bgImageEnabled: true,
  };
}

test('a panel image layer copies out in the control editor\'s dialect', () => {
  const payload = copyPanelBackgroundLayer(panelWithImage(), 'image');

  assert.equal(payload.layerId, 'image');
  assert.equal(payload.data.imageSrc, 'C:/art/plate.png', 'bgImage is the control\'s imageSrc');
  assert.equal(payload.data.imageOpacity, 70);
  assert.equal(payload.data.imageFit, 'contain');
  assert.equal(payload.data.imageTint, '223344');
  assert.equal(payload.data.imageRotation, 15);
  assert.deepEqual(get(backgroundLayerClipboard), payload, 'copy must reach the shared clipboard');
});

test('the panel\'s texture layer and the control\'s overlay layer are the same layer', () => {
  const panel = { ...createPanel('Bg'), bgTexture: 'grain.png', bgTextureOpacity: 40, bgTextureTileScale: 2 };
  const payload = copyPanelBackgroundLayer(panel, 'texture');

  assert.equal(payload.layerId, 'overlay',
    'a texture copied from the panel must be pasteable onto a control\'s Overlay layer');
  assert.equal(payload.data.overlaySrc, 'grain.png');
  assert.equal(payload.data.overlayOpacity, 40);
  assert.equal(payload.data.overlayTileScale, 2);
});

test('a layer copied from a CONTROL pastes onto the panel', () => {
  // Exactly the payload sections/BackgroundEditor.svelte writes for its Image layer.
  copyBackgroundLayer({
    layerId: 'image',
    data: {
      imageSrc: 'from-control.png',
      imageOpacity: 55,
      imageBlend: 'multiply',
      imageBlur: 3,
      imageClipMode: 'shape',   // control-only; the panel has no such field
    },
  });

  const clip = getBackgroundLayerClipboard();
  assert.equal(canPastePanelBackgroundLayer(clip, 'image'), true);
  assert.equal(canPastePanelBackgroundLayer(clip, 'texture'), false, 'an image is not a texture');
  assert.equal(canPastePanelBackgroundLayer(clip, 'solid'), false);

  const patch = panelBackgroundLayerPatch(clip, 'image');
  assert.equal(patch.bgImage, 'from-control.png');
  assert.equal(patch.bgImageOpacity, 55);
  assert.equal(patch.bgImageBlend, 'multiply');
  assert.equal(patch.bgImageBlur, 3);
  assert.equal(patch.bgImageEnabled, true, 'pasting onto a hidden layer must switch it on');
  assert.ok(!('bgImageClipMode' in patch), 'a control-only property must not be invented on the panel');
});

test('a control overlay pastes onto the panel texture, and back again unchanged', () => {
  copyBackgroundLayer({ layerId: 'overlay', data: { overlaySrc: 'weave.png', overlayOpacity: 33, overlayFlipH: true } });

  const patch = panelBackgroundLayerPatch(getBackgroundLayerClipboard(), 'texture');
  assert.equal(patch.bgTexture, 'weave.png');
  assert.equal(patch.bgTextureOpacity, 33);
  assert.equal(patch.bgTextureFlipH, true);
  assert.equal(patch.bgTextureEnabled, true);

  // Round trip: apply the patch to a panel, copy it back out, and the control gets what it sent.
  const pasted = { ...createPanel('Bg'), ...patch };
  const back = panelBackgroundLayerPayload(pasted, 'texture');
  assert.equal(back.layerId, 'overlay');
  assert.equal(back.data.overlaySrc, 'weave.png');
  assert.equal(back.data.overlayOpacity, 33);
  assert.equal(back.data.overlayFlipH, true);
});

test('gradients travel, and the gradient object is not shared by reference', () => {
  const gradient = { type: 'radial', angle: 20, stops: [{ color: 'FF0000', position: 0 }] };
  copyBackgroundLayer({ layerId: 'gradient', data: { gradient, gradientOpacity: 80, gradientName: 'Sunset' } });

  const patch = panelBackgroundLayerPatch(getBackgroundLayerClipboard(), 'gradient');
  assert.equal(patch.bgGradientName, 'Sunset');
  assert.equal(patch.bgGradientOpacity, 80);
  assert.deepEqual(patch.bgGradient, gradient);
  assert.notEqual(patch.bgGradient, gradient, 'the pasted gradient must be a copy, not the clipboard\'s own object');
  assert.notEqual(patch.bgGradient.stops[0], gradient.stops[0], 'and a deep one');
  assert.equal(patch.bgGradientEnabled, true);
});

test('a solid colour crosses over, and nothing else does', () => {
  copyBackgroundLayer({ layerId: 'solid', data: { colour: 'FF102030', solidBlend: 'screen', solidClipMode: 'shape' } });
  const patch = panelBackgroundLayerPatch(getBackgroundLayerClipboard(), 'solid');

  assert.equal(patch.bgColour, 'FF102030');
  assert.equal(patch.bgSolid, true);
  assert.equal(Object.keys(patch).length, 2, `blend/clip have no panel field: ${Object.keys(patch).join(', ')}`);
});

test('an empty or mismatched clipboard produces no patch', () => {
  copyBackgroundLayer(null);
  assert.equal(panelBackgroundLayerPatch(getBackgroundLayerClipboard(), 'image'), null);
  assert.equal(canPastePanelBackgroundLayer(null, 'image'), false);
  assert.equal(panelBackgroundLayerPatch({ layerId: 'solid', data: {} }, 'image'), null);
  assert.equal(panelBackgroundLayerPayload(null, 'image'), null);
  assert.equal(panelBackgroundLayerPayload(createPanel('x'), 'nonsense'), null);
});
