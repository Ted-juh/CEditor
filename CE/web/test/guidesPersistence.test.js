import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createPanel, serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { guides, addGuide, removeGuide, updateGuide, clearGuides, selectedGuide, deleteSelectedGuide } from '../src/CE_Application/stores/guides.js';

function freshPanel(name) {
  const panel = createPanel(name);
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedGuide.set(null);
  return panel;
}

test('guides live on the panel document and survive serialize/deserialize', () => {
  freshPanel('Guide Panel');
  addGuide('vertical', 120);
  addGuide('vertical', 300.4);
  addGuide('horizontal', 80);

  const panel = get(panels)[0];
  assert.deepEqual(panel.guides, { horizontal: [80], vertical: [120, 300] });
  assert.equal(panel.modified, true, 'adding a guide dirties the document');

  const restored = deserializePanel(serializePanel(panel), '', 'Restored');
  assert.deepEqual(restored.guides, { horizontal: [80], vertical: [120, 300] });

  // Old documents without a guides field open with the default.
  const legacy = JSON.parse(serializePanel(panel));
  delete legacy.guides;
  const opened = deserializePanel(JSON.stringify(legacy), '', 'Legacy');
  assert.deepEqual(opened.guides, { horizontal: [], vertical: [] });
});

test('removing a guide keeps the selection honest', () => {
  freshPanel('Selection Panel');
  addGuide('vertical', 50);
  addGuide('vertical', 100);
  addGuide('vertical', 150);

  // Select the guide at index 2 (pos 150); removing index 0 shifts it to index 1.
  selectedGuide.set({ orientation: 'vertical', index: 2 });
  removeGuide('vertical', 0);
  assert.deepEqual(get(selectedGuide), { orientation: 'vertical', index: 1 });
  assert.deepEqual(get(guides).vertical, [100, 150]);

  // Removing the selected guide itself clears the selection.
  removeGuide('vertical', 1);
  assert.equal(get(selectedGuide), null);

  // Delete with a live selection removes exactly that guide.
  selectedGuide.set({ orientation: 'vertical', index: 0 });
  assert.equal(deleteSelectedGuide(), true);
  assert.deepEqual(get(guides).vertical, []);
  assert.equal(deleteSelectedGuide(), false, 'no selection, nothing deleted');
});

test('update and clear write through to the document', () => {
  freshPanel('Update Panel');
  addGuide('horizontal', 40);
  updateGuide('horizontal', 0, 62.6);
  assert.deepEqual(get(guides).horizontal, [63]);
  clearGuides();
  assert.deepEqual(get(panels)[0].guides, { horizontal: [], vertical: [] });

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
});
