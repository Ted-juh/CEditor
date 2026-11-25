// scenePresetFiles.test.js — scene presets as files of their own (.cescene) and carried by a panel,
// as animation presets are: through the real panel stores, history and save/open.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { initHistory, flushHistory, undo } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel } from '../src/CE_Application/stores/panels.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import {
  scenePresetLibrary, panelScenePresets, scenePresetEntries, scenePresetsOf, saveScenePreset, removeScenePreset, carryScenePreset,
  removeScenePresetFromPanel, keepPanelScenePreset, importScenePresetText, resetScenePresetLibraryForTesting,
} from '../src/CE_Application/stores/scenePresetLibrary.js';
import { scenePresetFileText, readScenePresetFile, SCENE_PRESET_FORMAT } from '../src/CE_Application/utils/scenePresetFormat.js';
import { buildScenePreset, BUILT_IN_SCENE_PRESETS } from '../src/CE_Application/utils/scenePreset.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';
import { TYPED_DOCUMENT_SUFFIX, typedDocumentFileName } from '../src/CE_Application/stores/typedDocuments.js';

/** A panel with a knob and a Label, and a scene sweeping the knob: what a preset is made from. */
function setUp() {
  componentWorkspaceMode.set('panel'); panels.set([]); activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null }); selectedComponentIds.set(new Set());
  resetScenePresetLibraryForTesting();
  initHistory(); addPanel(createPanel('Scenes')); flushHistory();
  const knob = addControl('Knob');
  const label = addControl('Label');
  const scene = {
    id: 'sc_1', name: 'Wake up', trigger: { type: 'panelOpen' }, length: 1200, loop: false,
    clips: [{ id: 'c1', controlId: knob._children.Core.id, target: 'Value', start: 0, length: 1200, effect: sceneEffect('value:sweep').effect }],
  };
  return { knob, label, scene, panel: () => get(panels)[0] };
}

test('a scene preset is a .cescene file: it reads back as it was written, and anything else is refused with a reason', () => {
  const { knob, label, scene } = setUp();
  const preset = buildScenePreset(scene, [knob, label]);
  const text = scenePresetFileText(preset);
  assert.match(text, new RegExp(`"format": "${SCENE_PRESET_FORMAT.replace('.', '\\.')}"`));
  assert.deepEqual(readScenePresetFile(text).preset, preset);
  assert.equal(TYPED_DOCUMENT_SUFFIX.scenePreset, '.cescene');
  assert.equal(typedDocumentFileName('scenePreset', 'Wake up / slow'), 'Wake up slow.cescene');
  assert.match(readScenePresetFile('{ not json').error, /not JSON/);
  assert.match(readScenePresetFile('{"format":"ceditor.animationPreset"}').error, /not a scene preset/);
  assert.match(readScenePresetFile(JSON.stringify({ ...preset, version: 99 })).error, /newer CEditor/);
  assert.match(readScenePresetFile(JSON.stringify({ ...preset, clips: [] })).error, /nothing in it/);
  assert.match(readScenePresetFile('x'.repeat(3 * 1024 * 1024)).error, /too large/);
});

test('a panel carries scene presets: one undo step each way, through a save and an open, and a broken one is dropped', () => {
  const { knob, label, scene, panel } = setUp();
  const preset = buildScenePreset(scene, [knob, label]);
  flushHistory();
  assert.deepEqual(carryScenePreset(preset), { carried: true });
  assert.deepEqual(get(panelScenePresets).map((entry) => entry.id), [preset.id]);
  flushHistory();
  undo();
  assert.equal(panel().scenePresets?.length ?? 0, 0, 'carrying it was one undo step');
  carryScenePreset(preset);
  flushHistory();
  const saved = JSON.parse(serializePanel(panel()));
  assert.equal(saved.scenePresets.length, 1);
  const reopened = deserializePanel(JSON.stringify({ ...saved, scenePresets: [...saved.scenePresets, { format: SCENE_PRESET_FORMAT, id: 'broken' }] }), '', 'Scenes');
  assert.deepEqual(scenePresetsOf(reopened).map((entry) => entry.id), [preset.id], 'read as it is opened: the broken one ignored');
  assert.deepEqual(JSON.parse(serializePanel(reopened)).scenePresets.map((entry) => entry.id), [preset.id], 'and dropped when it is saved');
  assert.deepEqual(removeScenePresetFromPanel(preset.id), { removed: true });
  assert.equal(JSON.parse(serializePanel(panel())).scenePresets, undefined, 'none left, no key');
});

test('the library shows built-in, mine, then what only the panel has; a panel you were sent offers its presets to keep', () => {
  const { knob, label, scene } = setUp();
  const { preset: mine } = saveScenePreset(scene, [knob, label], { name: 'Mine' });
  const theirs = buildScenePreset({ ...scene, id: 'sc_2' }, [knob, label], { name: 'Theirs' });
  carryScenePreset(theirs);
  carryScenePreset(mine);
  const entries = scenePresetEntries(get(scenePresetLibrary), get(panelScenePresets));
  assert.deepEqual(entries.map((entry) => [entry.preset.name, entry.where, entry.carried]), [
    ...BUILT_IN_SCENE_PRESETS.map((preset) => [preset.name, 'builtin', false]),
    ['Mine', 'mine', true],
    ['Theirs', 'panel', true],
  ]);
  assert.equal(keepPanelScenePreset(theirs.id).preset.name, 'Theirs');
  assert.deepEqual(get(scenePresetLibrary).map((entry) => entry.name), ['Mine', 'Theirs']);
  removeScenePreset(mine.id);
  assert.deepEqual(get(panelScenePresets).map((entry) => entry.name).sort(), ['Mine', 'Theirs'], 'the panel keeps its copy when you remove yours');
});

test('a .cescene file comes into your library or only this panel; one you have is replaced, not doubled', () => {
  const { knob, label, scene } = setUp();
  const preset = buildScenePreset(scene, [knob, label], { name: 'Sent' });
  const first = importScenePresetText(scenePresetFileText(preset));
  assert.deepEqual([first.preset.name, first.replaced], ['Sent', false]);
  const again = importScenePresetText(scenePresetFileText(preset));
  assert.equal(again.replaced, true);
  assert.equal(get(scenePresetLibrary).length, 1);
  const here = importScenePresetText(scenePresetFileText(preset), { where: 'panel' });
  assert.equal(here.preset.name, 'Sent');
  assert.equal(get(panelScenePresets).length, 1);
  assert.match(importScenePresetText('{}').error, /not a scene preset/);
});
