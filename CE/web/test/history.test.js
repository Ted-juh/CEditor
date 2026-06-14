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
});
