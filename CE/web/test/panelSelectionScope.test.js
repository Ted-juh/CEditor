import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import {
  activeEditorTab, activePanelId, clearSelection, keyObjectId, panels,
  selectComponent, selectedComponentIds, setActivePanel,
} from '../src/CE_Application/stores/panels.js';

test('switching panel tabs clears selection and key object from the previous document', () => {
  const first = createPanel('First');
  const second = createPanel('Second');
  panels.set([first, second]);
  try {
    setActivePanel(first.id);
    selectComponent('same-control-id');
    setActivePanel(first.id);
    assert.deepEqual([...get(selectedComponentIds)], ['same-control-id']);

    setActivePanel(second.id);
    assert.deepEqual([...get(selectedComponentIds)], []);
    assert.equal(get(keyObjectId), null);
  } finally {
    clearSelection();
    panels.set([]);
    activePanelId.set(null);
    activeEditorTab.set({ type: 'panel', id: null });
  }
});
