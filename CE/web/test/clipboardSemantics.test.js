import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addControl, duplicateControl } from '../src/CE_Application/stores/controls.js';
import { copySelection, pasteSelection, cutSelection } from '../src/CE_Application/stores/clipboard.js';
import { findControlById, findParentOfControl, flatControls, getChildControls, uniqueCopyName } from '../src/CE_Application/utils/containment.js';
import { viewportPanelCenter } from '../src/CE_Application/stores/editorView.js';

function freshPanel(name) {
  const panel = createPanel(name);
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  viewportPanelCenter.set(null);
  return panel;
}

function activeControls() {
  return get(panels)[0].controls;
}

test('uniqueCopyName never collides and never stacks suffixes', () => {
  const names = new Set(['knob', 'knob_copy', 'knob_copy2']);
  assert.equal(uniqueCopyName(names, 'knob'), 'knob_copy3');
  assert.equal(uniqueCopyName(names, 'knob_copy'), 'knob_copy3', 'suffix is stripped before retrying');
  assert.equal(uniqueCopyName(new Set(), 'fader'), 'fader_copy');
});

test('paste returns a copied child to its container, like duplicate', () => {
  freshPanel('Paste Parent');
  const container = addControl('Container');
  const containerId = container._children.Core.id;
  selectedComponentIds.set(new Set([containerId]));
  const label = addControl('Label');            // inserts INTO the selected container
  const labelId = label._children.Core.id;

  selectedComponentIds.set(new Set([labelId]));
  copySelection();
  pasteSelection();

  const pastedId = [...get(selectedComponentIds)][0];
  assert.notEqual(pastedId, labelId);
  const parent = findParentOfControl(activeControls(), pastedId);
  assert.equal(parent?._children?.Core?.id, containerId, 'paste must land back in the source container');

  // Duplicate agrees.
  selectedComponentIds.set(new Set([labelId]));
  duplicateControl(new Set([labelId]));
  const dupId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(activeControls(), dupId)?._children?.Core?.id, containerId);

  // And every name in the panel is unique.
  const names = flatControls(activeControls()).map((c) => c._children.Core.name);
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names.join(', ')}`);
});

test('repeated paste keeps names unique with numbered suffixes', () => {
  freshPanel('Suffix Panel');
  const knob = addControl('Knob', { name: 'Cutoff' });
  selectedComponentIds.set(new Set([knob._children.Core.id]));
  copySelection();
  pasteSelection();
  pasteSelection();
  pasteSelection();

  const names = flatControls(activeControls()).map((c) => c._children.Core.name).sort();
  assert.deepEqual(names, ['Cutoff', 'Cutoff_copy', 'Cutoff_copy2', 'Cutoff_copy3']);
});

test('cut removes the selection roots once, and paste restores the subtree', () => {
  freshPanel('Cut Panel');
  const container = addControl('Container');
  const containerId = container._children.Core.id;
  selectedComponentIds.set(new Set([containerId]));
  const child = addControl('Label');
  const childId = child._children.Core.id;

  // Select container AND its child — cut must treat it as one subtree.
  selectedComponentIds.set(new Set([containerId, childId]));
  cutSelection();
  assert.equal(activeControls().length, 0, 'cut removed the container subtree');

  pasteSelection();
  const restoredId = [...get(selectedComponentIds)][0];
  const restored = findControlById(activeControls(), restoredId);
  assert.equal(getChildControls(restored).length, 1, 'child rode along in the pasted subtree');

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
});
