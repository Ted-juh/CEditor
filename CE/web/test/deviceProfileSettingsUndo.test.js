// deviceProfileSettingsUndo.test.js — the last clause of E1/S6: "two of five
// workspaces cannot undo anything".
//
// The Device Profile Designer mutated `let model = $state(null)` in place and
// contained no undo of any kind; the settings workspace had none either. Both
// now register against the context registry in stores/history.js, so Ctrl+Z and
// Ctrl+Y reach them the way they reach a panel.
//
// What is tested here is the wiring, not the markup: .svelte files compile to
// their SSR form under `node --test`, where no $effect ever runs, which is
// exactly why the decisions live in dpd/dpdHistory.js and
// settings/generalSettingsHistory.js instead of in the components.
//
// Timing note (same as historyDirtyTagsContexts.test.js): changes arriving in
// one synchronous burst are one logical edit, with a 20 ms grace. Two edits that
// must land as two undo steps have to be further apart than that — `apart()`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { mutatePanelControlsByIdsInList } from '../src/CE_Application/stores/panelDocumentHelpers.js';
import {
  initHistory,
  flushHistory,
  resetHistoryBaseline,
  undo,
  redo,
  canUndo,
  canRedo,
} from '../src/CE_Application/stores/history.js';
import {
  createDeviceProfileHistory,
  designerOwnsUndo,
  DPD_HISTORY_KIND,
} from '../src/CE_Application/editor/dpd/dpdHistory.js';
import { registerGeneralSettingsHistory } from '../src/CE_Application/settings/generalSettingsHistory.js';
import { generalSettings, updateGeneralSettings } from '../src/CE_Application/stores/appSettings.js';

initHistory();

const apart = () => new Promise((resolve) => setTimeout(resolve, 35));

/**
 * A stand-in for the designer component: it owns a model, hands every state of
 * it to the history handle, and puts restored states back — exactly what the
 * two $effects in DeviceProfileDesignerV2.svelte do.
 */
function makeDesigner(t, id, model, { active = true, observeOnRestore = true } = {}) {
  const designer = {
    model,
    active,
    dirty: false,
    restores: 0,
  };
  designer.history = createDeviceProfileHistory({
    id,
    isActive: () => designer.active,
    applyModel: (snapshot) => {
      designer.restores += 1;
      // The component deepClones here; structuredClone is the same promise.
      designer.model = snapshot == null ? null : structuredClone(snapshot);
      // The watching effect runs again after a restore — but asynchronously,
      // which is what `observeOnRestore: false` models.
      if (observeOnRestore) designer.observe();
    },
  });
  designer.observe = () => {
    designer.dirty = designer.history.observe(
      designer.model == null ? null : structuredClone(designer.model)
    );
    return designer.dirty;
  };
  designer.edit = (mutate) => {
    mutate(designer.model);
    designer.observe();
  };
  // Always, even when an assertion throws: a designer left registered and
  // claiming to be active outranks every context in every test that follows,
  // and the cascade of failures says nothing about what actually broke.
  t.after(() => {
    designer.active = false;
    designer.history.dispose();
    resetHistoryBaseline();
  });
  return designer;
}

const profileModel = () => ({
  id: 'yamaha.an1x',
  label: 'AN1x',
  version: 3,
  scopes: { global: { parameters: [{ id: 'cutoff', name: 'Cutoff', max: 127 }] } },
});

function livePanel(tag) {
  const panel = createPanel(`dpdundo-${tag}`);
  panel.controls = [createControl('Knob', { Core: { id: `${tag}_k0` }, Transform: { x: 0, y: 5 } })];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `dpdundo-${tag}`);
  setActivePanel(live.id);
  activeEditorTab.set({ type: 'panel', id: live.id });
  return live.id;
}

const xOf = (panelId, id) => get(panels)
  .find((p) => p.id === panelId).controls
  .find((c) => c._children.Core.id === id)._children.Transform.x;

// --- the designer -----------------------------------------------------------

test('an edit in the device profile designer undoes and redoes', (t) => {
  const designer = makeDesigner(t, 'an1x-basic', profileModel());
  designer.observe();                       // the model the tab opened with
  assert.equal(canUndo(), false, 'opening a profile left an undo step behind');

  designer.edit((m) => { m.scopes.global.parameters[0].name = 'Filter Cutoff'; });
  flushHistory();
  assert.equal(canUndo(), true, 'the designer recorded no undo step');

  undo();
  assert.equal(designer.model.scopes.global.parameters[0].name, 'Cutoff');
  assert.equal(canRedo(), true);

  redo();
  assert.equal(designer.model.scopes.global.parameters[0].name, 'Filter Cutoff');
});

test('a restore is not read back as a fresh edit', (t) => {
  // The effect that watches the model runs AFTER the restore, so history's own
  // isRestoring guard has already been lifted; without dpdHistory adopting the
  // restored state first, undo pushes the state it just undid and the stack
  // never empties.
  const designer = makeDesigner(t, 'an1x-restore', profileModel());
  designer.observe();

  designer.edit((m) => { m.version = 4; });
  flushHistory();

  undo();
  flushHistory();
  assert.equal(designer.model.version, 3);
  assert.equal(designer.restores, 1);
  assert.equal(canUndo(), false, 'the restore was recorded as another edit');
});

test('a second undo before the watching effect has run still redoes in order', (t) => {
  // The effect that watches the model is asynchronous, so a restore is not
  // guaranteed to have been read back before the next command arrives. History
  // asks the context for its current state to build the redo entry — if that
  // answer is still the pre-undo state, the redo stack gets the same state twice
  // and the middle one is lost.
  const designer = makeDesigner(t, 'an1x-race', profileModel(), { observeOnRestore: false });
  designer.observe();

  designer.edit((m) => { m.version = 4; });
  flushHistory();
  designer.edit((m) => { m.version = 5; });
  flushHistory();

  undo();
  undo();
  assert.equal(designer.model.version, 3);

  redo();
  assert.equal(designer.model.version, 4, 'redo skipped the state in the middle');
  redo();
  assert.equal(designer.model.version, 5);
});

test('two unrelated field edits are two undo steps', async (t) => {
  const designer = makeDesigner(t, 'an1x-two', profileModel());
  designer.observe();

  designer.edit((m) => { m.label = 'AN1x mkII'; });
  await apart();
  designer.edit((m) => { m.version = 9; });
  flushHistory();

  undo();
  assert.equal(designer.model.version, 3, 'the second edit did not undo on its own');
  assert.equal(designer.model.label, 'AN1x mkII', 'the first edit came back with it — they merged');

  undo();
  assert.equal(designer.model.label, 'AN1x');
});

test('opening a different document is not an undoable step', (t) => {
  // The engine answering with a saved source arrives long after the bundled
  // model is on screen. Recorded as an edit, one Ctrl+Z would hand back a model
  // the user never chose.
  const designer = makeDesigner(t, 'an1x-open', profileModel());
  designer.observe();
  designer.edit((m) => { m.version = 4; });
  flushHistory();
  assert.equal(canUndo(), true);

  designer.history.startsNewDocument();
  designer.model = { ...profileModel(), id: 'saved.source', version: 11 };
  designer.observe();
  flushHistory();

  undo();
  assert.equal(designer.model.id, 'saved.source', 'undo walked back into the previous document');
  assert.equal(designer.model.version, 11);
});

test('a profile with no model at all records nothing', (t) => {
  const designer = makeDesigner(t, 'no-profile', null);
  designer.observe();
  assert.equal(canUndo(), false);

  // Adopting a discovered device is the first document, not an edit.
  designer.model = profileModel();
  designer.observe();
  flushHistory();
  assert.equal(canUndo(), false, 'adopting the first model left an undo step that would blank the tab');
});

test('the designer reports unsaved changes, and undoing back to the save clears it', (t) => {
  const designer = makeDesigner(t, 'an1x-dirty', profileModel());
  designer.observe();
  assert.equal(designer.dirty, false, 'a freshly opened profile claimed unsaved changes');

  designer.edit((m) => { m.version = 4; });
  flushHistory();
  assert.equal(designer.dirty, true);

  designer.history.noteSaved();
  assert.equal(designer.history.isDirty(), false, 'a confirmed save left the dirty mark on');

  designer.edit((m) => { m.version = 5; });
  flushHistory();
  assert.equal(designer.dirty, true);

  undo();
  assert.equal(designer.model.version, 4);
  assert.equal(designer.dirty, false, 'undoing back to the saved state left the dirty mark on');
});

test('the designer does not steal undo from the panel behind it', (t) => {
  const panelId = livePanel('behind');
  const designer = makeDesigner(t, 'an1x-split', profileModel(), { active: false });
  designer.observe();

  // The split shape: the panel tab is in front, the designer is the companion
  // pane and the user is working on the canvas.
  resetHistoryBaseline();
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, ['behind_k0'], (draft) => {
    draft._children.Transform.x = 42;
    return true;
  }));
  flushHistory();
  undo();
  assert.equal(xOf(panelId, 'behind_k0'), 0, 'the panel context stopped working');
  assert.equal(designer.model.version, 3, 'a panel undo reached into the designer');

  // The user reaches over into the designer pane.
  designer.active = true;
  resetHistoryBaseline();
  designer.edit((m) => { m.version = 7; });
  flushHistory();
  undo();
  assert.equal(designer.model.version, 3);
  assert.equal(xOf(panelId, 'behind_k0'), 0, 'a designer undo reached into the panel');
});

test('two profiles keep separate stacks', (t) => {
  const a = makeDesigner(t, 'profile-a', { ...profileModel(), id: 'a' });
  const b = makeDesigner(t, 'profile-b', { ...profileModel(), id: 'b' }, { active: false });
  a.observe();
  b.observe();

  a.edit((m) => { m.version = 20; });
  flushHistory();

  a.active = false;
  b.active = true;
  resetHistoryBaseline();
  assert.equal(canUndo(), false, 'b inherited a\'s stack');

  b.edit((m) => { m.version = 30; });
  flushHistory();
  undo();
  assert.equal(b.model.version, 3);
  assert.equal(a.model.version, 20, 'undoing in b reached into a');

  b.active = false;
  a.active = true;
  resetHistoryBaseline();
  assert.equal(canUndo(), true, 'a lost its stack while b was focused');
});

test('designerOwnsUndo: the tab shape always, the split shape only on focus', () => {
  const tab = { type: DPD_HISTORY_KIND, id: 'yamaha.an1x' };
  assert.equal(designerOwnsUndo({ activeTab: tab, profileId: 'yamaha.an1x', focusWithin: false }), true,
    'a profile tab in front must own undo whether or not anything is focused');
  assert.equal(designerOwnsUndo({ activeTab: tab, profileId: 'roland.gaia', focusWithin: true }), false,
    'a designer claimed undo for a profile that is not the one in front');

  // The split: the active tab is the PANEL, the designer is the companion pane.
  const panelTab = { type: 'panel', id: 7 };
  assert.equal(designerOwnsUndo({ activeTab: panelTab, profileId: 'yamaha.an1x', focusWithin: false }), false,
    'the companion pane stole Ctrl+Z from the canvas');
  assert.equal(designerOwnsUndo({ activeTab: panelTab, profileId: 'yamaha.an1x', focusWithin: true }), true,
    'the companion pane refused undo while the user was working in it');

  assert.equal(designerOwnsUndo(), false, 'no tab and no focus is not a reason to own undo');
});

// --- settings ---------------------------------------------------------------

/**
 * Open the General page: put the settings tab in front, set the preferences the
 * test is about, then register — mirroring the component, which registers on
 * mount and takes whatever is in the store as its baseline.
 */
function openGeneralPage(t, preferences) {
  activeEditorTab.set({ type: 'settings', id: 'settings' });
  updateGeneralSettings(preferences);
  const off = registerGeneralSettingsHistory({ isActive: () => true });
  t.after(() => { off(); resetHistoryBaseline(); });
  return off;
}

test('a general setting undoes and redoes', (t) => {
  const off = openGeneralPage(t, { defaultGridSize: 10 });

  updateGeneralSettings({ defaultGridSize: 40 });
  flushHistory();
  assert.equal(get(generalSettings).defaultGridSize, 40);
  assert.equal(canUndo(), true, 'the settings workspace recorded no undo step');

  undo();
  assert.equal(get(generalSettings).defaultGridSize, 10, 'undo did not put the preference back');

  redo();
  assert.equal(get(generalSettings).defaultGridSize, 40);
});

test('undoing a preference does not walk back past the state the page opened in', (t) => {
  openGeneralPage(t, { insertOffset: 20 });

  assert.equal(canUndo(), false, 'opening the page left an undo step behind');
  undo();
  assert.equal(get(generalSettings).insertOffset, 20);
});

test('two separate preference changes are two undo steps', async (t) => {
  openGeneralPage(t, { insertOffset: 20, duplicateOffset: 20 });

  updateGeneralSettings({ insertOffset: 33 });
  await apart();
  updateGeneralSettings({ duplicateOffset: 44 });
  flushHistory();

  undo();
  assert.equal(get(generalSettings).duplicateOffset, 20, 'the second change did not undo on its own');
  assert.equal(get(generalSettings).insertOffset, 33, 'the first change came back with it — they merged');

  undo();
  assert.equal(get(generalSettings).insertOffset, 20);
});

test('a checkbox toggle is undoable, and the page forgets its stack when it closes', (t) => {
  let off = openGeneralPage(t, { restoreUnsavedWork: true });

  updateGeneralSettings({ restoreUnsavedWork: false });
  flushHistory();
  undo();
  assert.equal(get(generalSettings).restoreUnsavedWork, true, 'an accidental toggle could not be taken back');

  // Leaving the General section unregisters it; the stack must not outlive it,
  // or reopening the page would offer undo steps for changes made in a previous
  // visit whose values have since been persisted.
  updateGeneralSettings({ restoreUnsavedWork: false });
  flushHistory();
  off();
  off = openGeneralPage(t, {});
  assert.equal(canUndo(), false, 'a closed settings page left its undo stack behind');
});

test('the settings page does not claim undo while it is not the workspace in front', (t) => {
  const panelId = livePanel('settings-off');
  const off = registerGeneralSettingsHistory({
    isActive: () => get(activeEditorTab)?.type === 'settings',
  });
  t.after(() => { off(); resetHistoryBaseline(); });
  activeEditorTab.set({ type: 'panel', id: panelId });
  setActivePanel(panelId);
  resetHistoryBaseline();

  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, ['settings-off_k0'], (draft) => {
    draft._children.Transform.x = 77;
    return true;
  }));
  flushHistory();
  undo();
  assert.equal(xOf(panelId, 'settings-off_k0'), 0, 'the settings page swallowed the panel\'s undo');
});
