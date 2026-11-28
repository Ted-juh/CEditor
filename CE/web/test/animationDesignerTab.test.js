// animationDesignerTab.test.js — the Animation Designer is a document tab of its own (step 5a).
//
// One per panel, as the script workspace is: it opens from the panel in front, shows in the tab strip
// as "Animation · <panel>", owns its chrome as the device profile designer does, is never the active
// panel (so paste, insert and delete never reach a panel nobody can see), and goes when its panel
// goes — which the script workspace does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  panels, activePanelId, activeEditorTab, activePanel, editorTabs, addPanel, createPanel, closePanel,
  animationDesignerTabs, openAnimationDesigner, closeAnimationDesigner, setActiveEditorTab, selectedComponentIds,
  saveActiveEditorDocument,
} from '../src/CE_Application/stores/panels.js';
import { classifyWorkspace, workspaceOwnsChrome } from '../src/CE_Application/utils/workspaceChrome.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { newScene, newClip, addClip, sceneEffect } from '../src/CE_Application/utils/sceneModel.js';

function setUp() {
  componentWorkspaceMode.set('panel');
  panels.set([]);
  activePanelId.set(null);
  animationDesignerTabs.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
  selectedComponentIds.set(new Set());
  addPanel(createPanel('Wave Demo'));
  return get(panels)[0].id;
}

test('it opens on the panel in front, in a tab of its own, named for the panel', () => {
  const id = setUp();
  assert.equal(openAnimationDesigner(), true);
  assert.deepEqual(get(activeEditorTab), { type: 'animation', id });
  assert.deepEqual(get(animationDesignerTabs), [id]);
  const tab = get(editorTabs).find((entry) => entry.tabType === 'animation');
  assert.equal(tab.name, 'Animation · Wave Demo');
  assert.equal(tab.id, id);
  // Opened again, it goes to the same tab.
  setActiveEditorTab({ type: 'panel', id });
  openAnimationDesigner(id);
  assert.deepEqual(get(animationDesignerTabs), [id]);
  assert.equal(openAnimationDesigner('no such panel'), false);
});

test('in front, it is not the active panel, and it owns the window\'s chrome', () => {
  const id = setUp();
  openAnimationDesigner(id);
  assert.equal(get(activePanel), null, 'paste, insert and delete reach no panel while it is in front');
  assert.equal(classifyWorkspace({ activeTab: get(activeEditorTab) }), 'animation');
  assert.equal(workspaceOwnsChrome('animation'), true);
});

test('Save, with it in front, saves its panel — the one nobody can see behind it', () => {
  const id = setUp();
  panels.update((list) => list.map((panel) => ({ ...panel, filePath: '/tmp/wave.cepanel', animationScenes: [newScene('Intro', { type: 'panelOpen' }, { id: 'sc_intro' })] })));
  openAnimationDesigner(id);
  const emitted = [];
  const previousWindow = globalThis.window;
  globalThis.window = { __JUCE__: { backend: { emitEvent: (name, payload) => emitted.push({ name, payload }) } } };
  try {
    saveActiveEditorDocument();
    saveActiveEditorDocument({ saveAs: true });
  } finally {
    globalThis.window = previousWindow;
  }
  assert.deepEqual(emitted.map((entry) => [entry.name, entry.payload.panelId]), [['savePanel', String(id)], ['savePanelAs', String(id)]]);
  assert.equal(JSON.parse(emitted[0].payload.data).animationScenes[0].name, 'Intro');
});

test('closing it brings its panel back; closing the panel closes it', () => {
  const id = setUp();
  openAnimationDesigner(id);
  closeAnimationDesigner(id);
  assert.deepEqual(get(activeEditorTab), { type: 'panel', id });
  assert.deepEqual(get(animationDesignerTabs), []);
  openAnimationDesigner(id);
  setActiveEditorTab({ type: 'panel', id });
  closePanel(id);
  assert.deepEqual(get(animationDesignerTabs), [], 'a designer of a panel that is not open edits nothing');
  assert.equal(get(editorTabs).some((entry) => entry.tabType === 'animation'), false);
});

test('a panel\'s scenes go into its document as animationScenes, and come back', () => {
  const id = setUp();
  let scene = newScene('Intro', { type: 'panelOpen' }, { id: 'sc_intro' });
  scene = addClip(scene, newClip({ controlId: 'wave', target: 'Text', start: 200, length: 900, effect: sceneEffect('text:explode:in').effect, label: 'Explode in' }, { id: 'cl_1' }));
  panels.update((list) => list.map((panel) => (panel.id === id ? { ...panel, animationScenes: [scene, { nonsense: true }] } : panel)));
  const text = serializePanel(get(panels)[0]);
  const saved = JSON.parse(text);
  assert.equal(saved.animationScenes.length, 1, 'what does not read as a scene is not written');
  assert.equal(saved.animationScenes[0].clips[0].label, 'Explode in');
  const opened = deserializePanel(text, '/tmp/wave.cepanel', 'Wave Demo');
  assert.equal(opened.animationScenes[0].clips[0].start, 200);
  const empty = JSON.parse(serializePanel({ ...get(panels)[0], animationScenes: [] }));
  assert.equal('animationScenes' in empty, false, 'a panel with none writes no key');
});
