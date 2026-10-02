import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createPanel, addPanel, panels, activePanel, restoreSessionFromPreferences } from '../src/CE_Application/stores/panels.js';
import { autosaveEnabled, reopenLastSession, restoreUnsavedWork } from '../src/CE_Application/stores/runtimePreferences.js';
import { DEFAULT_CONTROL_SET_ID, NEW_PANEL_CONTROL_SET_ID } from '../src/CE_Application/models/controlSets.js';

test('recovered panels cannot collide with the next newly opened panel', (t) => {
  const originalStorage = globalThis.localStorage;
  const oldId = createPanel().id + 2;
  const values = new Map([
    ['ce.unsavedPanels', JSON.stringify([{ id: oldId, name: 'Recovered work', panelGuid: 'keep-this-guid', controls: [], modified: true }])],
    ['ce.unsavedActiveEditorTab', JSON.stringify({ type: 'panel', id: oldId })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  t.after(() => { globalThis.localStorage = originalStorage; });
  autosaveEnabled.set(false);
  reopenLastSession.set(false);
  restoreUnsavedWork.set(true);
  restoreSessionFromPreferences();

  const recovered = get(activePanel);
  assert.equal(recovered.name, 'Recovered work');
  assert.equal(recovered.panelGuid, 'keep-this-guid', 'plugin identity is document state and must survive');
  assert.equal(recovered.modified, true);
  // Recovered work is a document: with no set in it, it is on the base set, as a .cepanel is,
  // not on the set a new panel starts on.
  assert.deepEqual(recovered.controlSet, { id: DEFAULT_CONTROL_SET_ID });
  const next = addPanel();
  assert.deepEqual(next.controlSet, { id: NEW_PANEL_CONTROL_SET_ID }, 'a new panel is on the new-panel default');
  assert.notEqual(recovered.id, next.id, 'duplicate tab keys stop the canvas rendering');
  assert.equal(new Set(get(panels).map((panel) => panel.id)).size, get(panels).length);
});
