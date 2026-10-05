// historySaveAsIdentity.test.js — release audit C-09.
//
// Save As, then one undo, used to point the tab back at the ORIGINAL file: the undo snapshot carried
// `filePath` and `name`, and restoring it put the old path back, so the next Save overwrote the file
// the user had just saved away from. Reproduced in the running app before the fix. A file's path is
// where the document lives, not what it says; and a save's rename is a fact about the file, not an
// edit. Undo must leave both alone and still take back the content edit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, activeEditorTab, applyPanelSavedPayload } from '../src/CE_Application/stores/panels.js';
import { mutatePanelControlsByIdsInList } from '../src/CE_Application/stores/panelDocumentHelpers.js';
import { initHistory, flushHistory, undo, redo } from '../src/CE_Application/stores/history.js';

initHistory();

const apart = () => new Promise((resolve) => setTimeout(resolve, 35));
const panelOf = (panelId) => get(panels).find((p) => p.id === panelId);
const xOf = (panelId) => panelOf(panelId).controls[0]._children.Transform.x;

function openFromFile(tag) {
  const panel = createPanel(`Original-${tag}`);
  panel.filePath = `/docs/${tag}-A.cepanel`;
  panel.controls = [createControl('Knob', { Core: { id: `${tag}_k` }, Transform: { x: 10, y: 5 } })];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `Original-${tag}`);
  panels.update((list) => list.map((p) => (p.id === live.id ? { ...p, filePath: panel.filePath, modified: false } : p)));
  setActivePanel(live.id);
  activeEditorTab.set({ type: 'panel', id: live.id });
  return live.id;
}

function moveControl(panelId, x) {
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, [panelOf(panelId).controls[0]._children.Core.id], (draft) => {
    draft._children.Transform.x = x;
    return true;
  }));
}

test('Save As then undo keeps the new file and name, and takes back the edit', async () => {
  const id = openFromFile('saveas');
  await apart();
  moveControl(id, 50);
  await apart();
  flushHistory();

  applyPanelSavedPayload({ panelId: String(id), filePath: '/docs/saveas-B.cepanel', name: 'Variant B', ok: true });
  await apart();
  flushHistory();
  assert.equal(panelOf(id).filePath, '/docs/saveas-B.cepanel');

  undo();
  const after = panelOf(id);
  assert.equal(after.filePath, '/docs/saveas-B.cepanel', 'undo pointed the tab back at the original file');
  assert.equal(after.name, 'Variant B', 'undo renamed the tab back to the original file');
  assert.equal(xOf(id), 10, 'undo did not take back the content edit');

  redo();
  assert.equal(xOf(id), 50);
  assert.equal(panelOf(id).filePath, '/docs/saveas-B.cepanel');
});

test('a rename typed into the panel is still undoable', async () => {
  const id = openFromFile('rename');
  await apart();
  panels.update((list) => list.map((p) => (p.id === id ? { ...p, name: 'Typed name', modified: true } : p)));
  await apart();
  flushHistory();
  undo();
  assert.equal(panelOf(id).name, 'Original-rename');
  assert.equal(panelOf(id).filePath, '/docs/rename-A.cepanel');
});
