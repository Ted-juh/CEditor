import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  activeEditorTab, activePanelId, clearSelection, closeActiveEditorTab, keyObjectId, panelSelectionPick, panels,
  pickPanelSelection, selectComponent, selectedComponentIds, setActiveEditorTab, setActivePanel,
} from '../src/CE_Application/stores/panels.js';
import { createScriptWorkspaceDocument, scriptDocuments } from '../src/CE_Application/stores/scriptWorkspace.js';
import { activateColorTarget, clearColorTarget, colorTarget } from '../src/CE_Application/stores/colorTarget.js';

test('switching panel tabs clears selection and key object from the previous document', () => {
  const first = createPanel('First');
  const second = createPanel('Second');
  panels.set([first, second]);
  try {
    setActivePanel(first.id);
    selectComponent('same-control-id');
    setActivePanel(first.id);
    assert.deepEqual([...get(selectedComponentIds)], ['same-control-id']);

    setActivePanel(second.id);
    assert.deepEqual([...get(selectedComponentIds)], []);
    assert.equal(get(keyObjectId), null);
  } finally {
    clearSelection();
    panels.set([]);
    activePanelId.set(null);
    activeEditorTab.set({ type: 'panel', id: null });
  }
});

/* ------------------------------------------------------- a control picked in a script tab */
// The script editor's Values tab picks a control to be its panel's selection. The script tab shows no
// canvas and every tab switch clears the selection, so the pick is held and selected once the panel's
// tab is in front again; nothing about the selection changes before that, so an edit the display
// panel has open for the script stays open.

/** Two panels, the first with two controls, and a script tab in front of the first. */
function scriptTabOver() {
  const first = createPanel('First');
  const knob = createControl('Knob', { name: 'Cutoff' });
  const label = createControl('Label', { name: 'Title' });
  first.controls = [knob, label];
  const second = createPanel('Second');
  panels.set([first, second]);
  setActivePanel(first.id);
  selectComponent(label._children.Core.id);
  const doc = createScriptWorkspaceDocument({ name: 'First · Scripts', panelId: first.id });
  setActiveEditorTab({ type: 'script', id: doc.id });
  return { first, second, doc, knob: knob._children.Core.id, label: label._children.Core.id };
}

function tidy() {
  clearColorTarget();
  panelSelectionPick.set(null);
  clearSelection();
  scriptDocuments.set([]);
  panels.set([]);
  activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null });
}

test('a control picked in a script tab is the panel\'s selection when the panel is back in front', () => {
  try {
    const { first, doc, knob } = scriptTabOver();
    assert.deepEqual([...get(selectedComponentIds)], [], 'the script tab took the selection away, as every tab switch does');
    pickPanelSelection(first.id, knob);
    assert.deepEqual([...get(selectedComponentIds)], [], 'nothing is selected while the script tab is in front');
    assert.deepEqual(get(panelSelectionPick), { panelId: first.id, id: knob });
    setActiveEditorTab({ id: first.id, tabType: 'panel' });   // as the tab bar does
    assert.deepEqual([...get(selectedComponentIds)], [knob]);
    assert.equal(get(keyObjectId), knob);
    assert.equal(get(panelSelectionPick), null, 'used up');
    // Going away and back again is a plain tab switch once more.
    setActiveEditorTab({ type: 'script', id: doc.id });
    setActivePanel(first.id);
    assert.deepEqual([...get(selectedComponentIds)], []);
  } finally { tidy(); }
});

test('a pick waits for its own panel, a newer one replaces it, it can be taken back, and closing the script tab selects it', () => {
  try {
    const { first, second, doc, knob, label } = scriptTabOver();
    pickPanelSelection(first.id, knob);
    pickPanelSelection(first.id, label);
    setActivePanel(second.id);
    assert.deepEqual([...get(selectedComponentIds)], [], 'another panel is not the one picked for');
    assert.deepEqual(get(panelSelectionPick), { panelId: first.id, id: label }, 'the newer pick, still waiting');
    setActiveEditorTab({ type: 'script', id: doc.id });
    pickPanelSelection(second.id, null);
    assert.notEqual(get(panelSelectionPick), null, 'taking back a pick for another panel leaves this one');
    pickPanelSelection(first.id, null);
    assert.equal(get(panelSelectionPick), null);
    setActivePanel(first.id);
    assert.deepEqual([...get(selectedComponentIds)], [], 'taken back: a plain tab switch');
    // Closing the script tab shows its panel another way, and the pick is selected there too.
    setActiveEditorTab({ type: 'script', id: doc.id });
    pickPanelSelection(first.id, knob);
    closeActiveEditorTab();
    assert.deepEqual([get(activeEditorTab).type, [...get(selectedComponentIds)]], ['panel', [knob]]);
  } finally { tidy(); }
});

test('a pick of a control the panel no longer has selects nothing', () => {
  try {
    const { first, knob } = scriptTabOver();
    pickPanelSelection(first.id, knob);
    panels.update((list) => list.map((p) => (p.id === first.id
      ? { ...p, controls: p.controls.filter((c) => c._children.Core.id !== knob) } : p)));
    setActivePanel(first.id);
    assert.deepEqual([...get(selectedComponentIds)], []);
  } finally { tidy(); }
});

test('picking leaves an edit the display panel has open for the script open', () => {
  try {
    const { first, knob } = scriptTabOver();
    // A colour the Values tab is editing: a callback target, which a change of selection lets go of.
    const target = { type: 'callback', label: 'Script · Title text colour, line 3', apply: () => {} };
    activateColorTarget(target, 'FF4682B4');
    pickPanelSelection(first.id, knob);
    assert.equal(get(colorTarget)?.apply, target.apply, 'the colour target is still the script\'s');
    // A selection made as the canvas makes one does let go of it, which is why a pick is not one.
    selectComponent(knob);
    assert.equal(get(colorTarget), null);
  } finally { tidy(); }
});
