import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createPanel, addPanel, panels, activePanel, restoreSessionFromPreferences } from '../src/CE_Application/stores/panels.js';
import { autosaveEnabled, reopenLastSession, restoreUnsavedWork } from '../src/CE_Application/stores/runtimePreferences.js';

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
  const next = addPanel();
  assert.notEqual(recovered.id, next.id, 'duplicate tab keys stop the canvas rendering');
  assert.equal(new Set(get(panels).map((panel) => panel.id)).size, get(panels).length);
});
