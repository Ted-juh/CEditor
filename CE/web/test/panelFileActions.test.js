// panelFileActions.test.js — an item applied from the panel file view is one undo step of its panel.
//
// The view lives on a script tab, where no panel is the active one, and switching back to the panel
// re-baselines its history: written through the store alone, an applied edit could never be undone.
// So the actions record it with history.recordEdit into the panel's own history. What has to hold:
// the edit lands in the panel it was made for; on that panel, Undo takes it back and Redo puts it
// back, under the name of what was edited; an unchanged text records nothing; and applied while the
// panel IS the active one, it is still one step, not two.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, activeEditorTab, setActiveEditorTab } from '../src/CE_Application/stores/panels.js';
import { initHistory, undo, redo, historyTimeline, undoLabel } from '../src/CE_Application/stores/history.js';
import { controlFileText, panelSettingsFileText } from '../src/CE_Application/stores/panelFileText.js';
import { applyControlFileEdit, applyPanelSettingsFileEdit } from '../src/CE_Application/stores/panelFileActions.js';

initHistory();

function livePanel(tag) {
  const panel = createPanel(`pf-${tag}`);
  panel.controls = [
    createControl('Knob', { Core: { id: `${tag}_a`, name: `${tag}A` }, Transform: { x: 10, y: 5 } }),
    createControl('Knob', { Core: { id: `${tag}_b`, name: `${tag}B` }, Transform: { x: 90, y: 5 } }),
  ];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `pf-${tag}`);
  setActivePanel(live.id);
  return live.id;
}
const panelOf = (id) => get(panels).find((p) => p.id === id);
const control = (panelId, id) => panelOf(panelId).controls.find((c) => c._children.Core.id === id);
const moved = (text, x) => { const doc = JSON.parse(text); doc._children.Transform = { ...doc._children.Transform, x }; return JSON.stringify(doc); };

test('applied on a script tab, an edit is the panel\'s next undo step, named after the control', () => {
  const panelId = livePanel('tab');
  const before = control(panelId, 'tab_a');
  setActiveEditorTab({ type: 'script', id: 'pf-doc-tab' });
  assert.equal(get(activeEditorTab).type, 'script');

  const result = applyControlFileEdit(panelId, 'tab_a', moved(controlFileText(before).text, 250));
  assert.equal(result.ok && result.changed, true);
  assert.equal(control(panelId, 'tab_a')._children.Transform.x, 250, 'it reached the panel it was made for');
  assert.equal(control(panelId, 'tab_b'), panelOf(panelId).controls[1], 'the other control untouched');
  assert.equal(panelOf(panelId).modified, true);

  setActivePanel(panelId);
  assert.equal(undoLabel(), 'Edit tabA as text');
  undo();
  assert.equal(control(panelId, 'tab_a')._children.Transform.x, 10, 'Undo takes it back');
  redo();
  assert.equal(control(panelId, 'tab_a')._children.Transform.x, 250, 'Redo puts it back');
});

test('an unchanged text records nothing; the panel settings are a step of their own', () => {
  const panelId = livePanel('same');
  setActiveEditorTab({ type: 'script', id: 'pf-doc-same' });
  const unchanged = applyControlFileEdit(panelId, 'same_a', controlFileText(control(panelId, 'same_a')).text);
  assert.deepEqual([unchanged.ok, unchanged.changed], [true, false]);

  const settings = JSON.parse(panelSettingsFileText(panelOf(panelId)).text);
  const wider = applyPanelSettingsFileEdit(panelId, JSON.stringify({ ...settings, width: 900 }));
  assert.equal(wider.ok && wider.changed, true);
  assert.equal(panelOf(panelId).width, 900);

  setActivePanel(panelId);
  assert.deepEqual(historyTimeline().steps.map((step) => step.label), ['Edit panel settings as text'], 'one step, and not for the unchanged text');
  undo();
  assert.equal(panelOf(panelId).width, 600);
});

test('applied while the panel is the active one, it is still exactly one step', async () => {
  const panelId = livePanel('active');
  const result = applyControlFileEdit(panelId, 'active_b', moved(controlFileText(control(panelId, 'active_b')).text, 5));
  assert.equal(result.changed, true);
  await new Promise((resolve) => setTimeout(resolve, 450));   // past the ordinary snapshot's debounce
  const steps = historyTimeline().steps;
  assert.equal(steps.length, 1, `steps: ${JSON.stringify(steps)}`);
  assert.equal(steps[0].label, 'Edit activeB as text');
});

test('a panel or control that is gone is said so, and nothing is written', () => {
  const panelId = livePanel('gone');
  assert.match(applyControlFileEdit(panelId, 'nope', '{}').errors[0].message, /no longer in the panel/);
  assert.match(applyControlFileEdit(-1, 'gone_a', '{}').errors[0].message, /no longer open/);
});
