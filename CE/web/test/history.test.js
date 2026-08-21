import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  initHistory,
  undo,
  redo,
  pushSnapshot,
  canUndo,
  canRedo,
  undoAvailable,
  redoAvailable,
} from '../src/CE_Application/stores/history.js';
import {
  componentWorkspaceMode,
  componentDocuments,
  activeComponentDocumentId,
} from '../src/CE_Application/stores/componentWorkspace.js';
import { activeEditorTab } from '../src/CE_Application/stores/panels.js';

function makeDoc(id, value) {
  return {
    id,
    name: id,
    modified: false,
    control: {
      _children: {
        Core: { id, name: id, controlType: 'CustomComponent' },
        ValueChannels: { _children: { mainValue: { currentValue: value } } },
      },
    },
  };
}

function valueOf(id) {
  const doc = get(componentDocuments).find((entry) => entry.id === id);
  return doc?.control?._children?.ValueChannels?._children?.mainValue?.currentValue;
}

function mutate(id, value) {
  componentDocuments.update((list) =>
    list.map((doc) => {
      if (doc.id !== id) return doc;
      const control = structuredClone(doc.control);
      control._children.ValueChannels._children.mainValue.currentValue = value;
      return { ...doc, control, modified: true };
    })
  );
}

// history.js auto-snapshots on a 400ms debounce; flush it deterministically.
function commit() {
  pushSnapshot();
}

test('undo/redo operates on the active custom-component document', () => {
  initHistory();

  componentDocuments.set([makeDoc('docA', 0)]);
  activeComponentDocumentId.set('docA');
  componentWorkspaceMode.set('surface');

  // Baseline established for docA; no history yet.
  commit();
  assert.equal(canUndo(), false);

  mutate('docA', 1);
  commit();
  mutate('docA', 2);
  commit();
  assert.equal(valueOf('docA'), 2);
  assert.equal(canUndo(), true);
  assert.equal(get(undoAvailable), true);

  undo();
  assert.equal(valueOf('docA'), 1);
  undo();
  assert.equal(valueOf('docA'), 0);
  assert.equal(canUndo(), false);
  assert.equal(canRedo(), true);
  assert.equal(get(redoAvailable), true);

  redo();
  assert.equal(valueOf('docA'), 1);
  redo();
  assert.equal(valueOf('docA'), 2);
  assert.equal(canRedo(), false);
});

test('each document keeps an independent undo stack', () => {
  initHistory();

  componentDocuments.set([makeDoc('docA', 0), makeDoc('docB', 10)]);
  componentWorkspaceMode.set('surface');

  activeComponentDocumentId.set('docA');
  commit();
  mutate('docA', 5);
  commit();

  // Switch to docB — its history is untouched by docA's edits.
  activeComponentDocumentId.set('docB');
  commit();
  assert.equal(canUndo(), false, 'docB has no history yet');

  mutate('docB', 20);
  commit();
  undo();
  assert.equal(valueOf('docB'), 10);
  assert.equal(valueOf('docA'), 5, 'docA value untouched while editing docB');

  // Back to docA — its one-step history still undoes.
  activeComponentDocumentId.set('docA');
  commit();
  undo();
  assert.equal(valueOf('docA'), 0);

  // Reset the tab context for following tests.
  activeEditorTab.set({ type: 'panel', id: null });
});

test('undo works in a standalone component tab even when mode is not surface', () => {
  // Opening a standalone component tab resets componentWorkspaceMode back to
  // 'panel' (EditorCanvas closes the surface workspace), but the creator stays
  // live and keyed off the active editor tab. History must follow suit.
  initHistory();

  componentDocuments.set([makeDoc('docTab', 0)]);
  activeComponentDocumentId.set('docTab');
  componentWorkspaceMode.set('panel');
  activeEditorTab.set({ type: 'component', id: 'docTab' });

  commit();
  assert.equal(canUndo(), false);

  mutate('docTab', 7);
  commit();
  assert.equal(valueOf('docTab'), 7);
  assert.equal(canUndo(), true, 'component-tab edits must be captured');

  undo();
  assert.equal(valueOf('docTab'), 0, 'undo must revert a component-tab edit');

  redo();
  assert.equal(valueOf('docTab'), 7);

  activeEditorTab.set({ type: 'panel', id: null });
});

test('an edit made just before a context switch survives in history', () => {
  initHistory();

  componentDocuments.set([makeDoc('docX', 0), makeDoc('docY', 100)]);
  componentWorkspaceMode.set('surface');
  activeComponentDocumentId.set('docX');
  commit();

  // Edit docX, then switch context BEFORE the 400ms debounce fires.
  // The switch must flush the pending snapshot, not erase it.
  mutate('docX', 42);
  activeComponentDocumentId.set('docY');

  // Return to docX: the pre-switch edit is one undo step.
  activeComponentDocumentId.set('docX');
  assert.equal(canUndo(), true, 'pre-switch edit must be recorded');
  undo();
  assert.equal(valueOf('docX'), 0);

  activeEditorTab.set({ type: 'panel', id: null });
});

test('undo restores the selection that went with the state', async () => {
  const { panels, activePanelId, selectedComponentIds } = await import('../src/CE_Application/stores/panels.js');
  const { createPanel } = await import('../src/CE_Application/stores/panelModel.js');

  initHistory();
  componentWorkspaceMode.set('panel');
  componentDocuments.set([]);
  activeComponentDocumentId.set(null);

  const panel = createPanel('Selection Panel');
  panel.controls = [{ _children: { Core: { id: 'ctrl_a', name: 'A' }, Transform: { x: 0, y: 0, width: 10, height: 10 } } }];
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set(['ctrl_a']));
  commit();

  // Delete the control (selection clears with it), commit, then undo.
  panels.update((list) => list.map((p) => (p.id === panel.id ? { ...p, controls: [] } : p)));
  selectedComponentIds.set(new Set());
  commit();

  undo();
  const restored = get(panels).find((p) => p.id === panel.id);
  assert.equal(restored.controls.length, 1, 'undo restores the deleted control');
  assert.deepEqual([...get(selectedComponentIds)], ['ctrl_a'], 'undo restores the selection too');

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
});
