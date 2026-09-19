import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

test('unchanged scripted captions do not publish document edits, and lookup follows rename/undo', () => {
  const control = createControl('Label', { Core: { id: 'caption', name: 'Caption' }, Text: { content: 'Ready' } });
  const panel = { id: 'script-perf', controls: [control], scripting: { modules: ['ce.core'] } };
  setRuntimeHost(null);
  panels.set([panel]); activePanelId.set(panel.id); activeEditorTab.set({ type: 'panel', id: panel.id });
  const api = scriptApiForTesting('', 'script-perf');
  let publications = 0;
  const stop = panels.subscribe(() => publications++);
  try {
    publications = 0;
    api.set('caption.text.content', 'Ready');
    assert.equal(publications, 0);
    assert.equal(get(panels)[0], panel);
    api.set('caption.text.content', 'Reading');
    assert.equal(publications, 1);
    assert.equal(api.get('CAPTION.text.content'), 'Reading');
    api.set('caption.name', 'Renamed');
    assert.equal(api.get('renamed.text.content'), 'Reading');
    panels.set([panel]); // undo restores the original immutable tree
    assert.equal(api.get('Caption.text.content'), 'Ready');
  } finally { stop(); panels.set([]); activePanelId.set(null); activeEditorTab.set(null); }
});
