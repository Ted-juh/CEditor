// designerViewState.test.js — looking at a custom component in the designer is not an edit.
//
// Clicking a layer in the Component Designer, or Preview and Edit, wrote the selection and the
// stage mode onto the component (Designer.selectedLayer, Designer.preview.mode, …). Each click
// marked the panel modified and put "Edit designer of …" on the undo stack, so undo stepped
// through clicks. Those fields are view state now: they are kept, and they are not changes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { applyControlPatch, updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { initHistory, pushSnapshot, undo, canUndo } from '../src/CE_Application/stores/history.js';
import {
  isDesignerViewPath, isDesignerViewPatch, withoutDesignerView,
} from '../src/CE_Application/utils/designerViewState.js';
import { jsonEqual } from '../src/CE_Application/utils/jsonEqual.js';

initHistory();

/** Longer than history's burst grace, so the next change counts as a separate edit. */
const apart = () => new Promise((resolve) => setTimeout(resolve, 35));

function livePanel(tag) {
  const panel = createPanel(`designer-view-${tag}`);
  panel.controls = [createControl('CustomComponent', { Core: { id: `${tag}_cc` } })];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `designer-view-${tag}`);
  setActivePanel(live.id);
  activeEditorTab.set({ type: 'panel', id: live.id });
  panels.update((list) => list.map((p) => (p.id === live.id ? { ...p, modified: false } : p)));
  pushSnapshot();
  return live.id;
}

const panelOf = (panelId) => get(panels).find((p) => p.id === panelId);
const designerOf = (panelId, id) => panelOf(panelId).controls
  .find((c) => c._children.Core.id === id)._children.Designer;

test('the view fields are the selection, the focus requests and the stage settings', () => {
  for (const path of ['Designer.selectedLayer', 'Designer.selectedLayers', 'Designer.selectedSurfaceKind',
    'Designer.focusSection', 'Designer.preview.mode', 'Designer.preview.showHitZones', 'Designer._children.preview']) {
    assert.equal(isDesignerViewPath(path), true, path);
  }
  for (const path of ['Designer.activeVariant', 'Designer.patternEditing', 'Designer.arpeggiator.blocks',
    'Designer.packageId', 'Parts.face.Background.Fill.colour', 'Core.selectedLayer']) {
    assert.equal(isDesignerViewPath(path), false, path);
  }
  assert.equal(isDesignerViewPatch({ 'Designer.selectedLayer': 'face', 'Designer.selectedSurfaceKind': 'layer' }), true);
  assert.equal(isDesignerViewPatch({ 'Designer.selectedLayer': 'face', 'Transform.x': 4 }), false);
  assert.equal(isDesignerViewPatch({}), false);
});

test('two controls that differ only in what the designer shows compare equal, and only then', () => {
  const a = createControl('CustomComponent', { Core: { id: 'eq_cc' } });
  const b = structuredClone(a);
  b._children.Designer.selectedLayer = 'face';
  b._children.Designer.preview = { ...b._children.Designer.preview, mode: 'preview', showHitZones: true };
  assert.equal(jsonEqual(a, b), false);
  assert.equal(jsonEqual(a, b, withoutDesignerView), true);
  b._children.Designer.activeVariant = 'other';
  assert.equal(jsonEqual(a, b, withoutDesignerView), false);
});

test('selecting a layer or switching to Preview leaves the panel unmodified and undo empty', async () => {
  const panelId = livePanel('click');
  assert.equal(canUndo(), false);

  applyControlPatch('click_cc', { 'Designer.selectedLayer': 'face', 'Designer.selectedLayers': ['face'], 'Designer.selectedSurfaceKind': 'layer' });
  await apart();
  updateControlProperty('click_cc', 'Designer.selectedHitZone', 'grab');
  await apart();
  applyControlPatch('click_cc', { 'Designer.preview.mode': 'preview', 'Designer.preview.showBounds': false, 'Designer.preview.showHitZones': false });
  pushSnapshot();

  assert.equal(designerOf(panelId, 'click_cc').selectedLayer, 'face', 'the selection is kept');
  assert.equal(designerOf(panelId, 'click_cc').preview.mode, 'preview', 'and so is the stage mode');
  assert.equal(panelOf(panelId).modified, false, 'the panel is not modified');
  assert.equal(canUndo(), false, 'and there is nothing to undo');
});

test('a real edit still marks the panel and undoes, and undo keeps the view it was made in', async () => {
  const panelId = livePanel('edit');
  applyControlPatch('edit_cc', { 'Designer.selectedLayer': 'face' });
  pushSnapshot();
  await apart();

  applyControlPatch('edit_cc', { 'Designer.activeVariant': 'hover' });
  pushSnapshot();
  assert.equal(panelOf(panelId).modified, true);
  assert.equal(canUndo(), true);

  undo();
  assert.equal(designerOf(panelId, 'edit_cc').activeVariant, 'default', 'the edit is undone');
  assert.equal(designerOf(panelId, 'edit_cc').selectedLayer, 'face', 'the layer selected before it stays selected');
  assert.equal(canUndo(), false, 'the click before it was never a step');
});

test('a patch that mixes a view field with a change is a change', () => {
  const panelId = livePanel('mixed');
  applyControlPatch('mixed_cc', { 'Designer.selectedLayer': 'face', 'Transform.x': 40 });
  pushSnapshot();
  assert.equal(panelOf(panelId).modified, true);
  assert.equal(canUndo(), true);
});
