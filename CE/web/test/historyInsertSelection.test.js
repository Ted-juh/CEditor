import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { initHistory, flushHistory, undo, redo } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel } from '../src/CE_Application/stores/panels.js';
import { addControl, renameControl, removeControl } from '../src/CE_Application/stores/controls.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';

test('insert, edit and delete retain the selection belonging to each history state', () => {
  componentWorkspaceMode.set('panel');panels.set([]);activePanelId.set(null);
  activeEditorTab.set({type:'panel',id:null});selectedComponentIds.set(new Set());
  initHistory();addPanel(createPanel('Selection regression'));flushHistory();
  const control=addControl('Knob');const id=control._children.Core.id;
  const originalName=control._children.Core.name;
  flushHistory();
  renameControl(id,'Edited knob');flushHistory();
  undo();
  assert.deepEqual([...get(selectedComponentIds)],[id],'undoing the first edit keeps the inserted component selected');
  assert.equal(get(panels)[0].controls[0]._children.Core.name,originalName);
  undo();assert.equal(get(panels)[0].controls.length,0);assert.deepEqual([...get(selectedComponentIds)],[]);
  redo();assert.deepEqual([...get(selectedComponentIds)],[id],'redo insertion selects the new component');
  removeControl(id);flushHistory();undo();
  assert.deepEqual([...get(selectedComponentIds)],[id],'undo delete restores the previous selection');
});
