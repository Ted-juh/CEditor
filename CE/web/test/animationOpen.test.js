// animationOpen.test.js — a ce.anim.play row's Open: the Values tab goes to the panel, the control
// selected and the Animation tab armed on the animation the row names. The Animation tab edits the
// panel, and a script tab has none in front, so a tab armed there finds no control and is let go of
// on the way back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  activeEditorTab, activePanel, activePanelId, clearSelection, panelSelectionPick, panels, selectComponent,
  selectedComponentIds, setActiveEditorTab, setActivePanel,
} from '../src/CE_Application/stores/panels.js';
import { createScriptWorkspaceDocument, scriptDocuments } from '../src/CE_Application/stores/scriptWorkspace.js';
import {
  activateEditorTarget, activateEditorTargetOnPanel, clearEditorTarget, editorTarget, takeEditorTargetFocus,
} from '../src/CE_Application/stores/editorTarget.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';

/** A panel whose knob has a keyframe animation and a transition, and a script tab in front of it. */
function scriptTabOver() {
  const panel = createPanel('First');
  const knob = createControl('Knob', { name: 'Cutoff' });
  knob._children.Animations = {
    _type: 'Animations',
    _children: { Pulse: { name: 'Pulse', kind: 'keyframes' }, Hover: { name: 'Hover', kind: 'transition' } },
  };
  const label = createControl('Label', { name: 'Title' });
  panel.controls = [knob, label];
  panels.set([panel]);
  setActivePanel(panel.id);
  selectComponent(label._children.Core.id);
  const doc = createScriptWorkspaceDocument({ name: 'First · Scripts', panelId: panel.id });
  setActiveEditorTab({ type: 'script', id: doc.id });
  return { panel, knob: knob._children.Core.id };
}

function tidy() {
  clearEditorTarget();
  panelSelectionPick.set(null);
  clearSelection();
  scriptDocuments.set([]);
  panels.set([]);
  activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null });
}

const animationArg = (src, panel) => readStatement(src, 'lua', 1, { panel }).calls[0].args.find((a) => a.name === 'animation');

test('a ce.anim.play row knows the control and the animation\'s own name, for Open', () => {
  const { panel, knob } = scriptTabOver();
  try {
    // Written in another case, the animation is still the one the runtime plays.
    const pulse = animationArg('ce.anim.play("Cutoff", "pulse")', panel);
    assert.deepEqual([pulse.meaning.controlId, pulse.meaning.key, pulse.meaning.found], [knob, 'Pulse', true]);
    // A transition opens on itself, for its trigger; a name the control has not opens on the control.
    assert.deepEqual([animationArg('ce.anim.play("Cutoff", "Hover")', panel).meaning.key], ['Hover']);
    const none = animationArg('ce.anim.play("Cutoff", "Pluse")', panel);
    assert.deepEqual([none.meaning.controlId, none.meaning.key], [knob, null]);
    // No control of that name: nothing to open.
    assert.equal(animationArg('ce.anim.play("Cutof", "Pulse")', panel).meaning.controlId, undefined);
  } finally {
    tidy();
  }
});

test('Open goes to the panel with the control selected and the Animation tab armed on the animation', () => {
  const { panel, knob } = scriptTabOver();
  try {
    assert.equal(get(activePanel), null, 'a script tab has no panel in front');
    const target = activateEditorTargetOnPanel(panel.id, 'animation', knob, { focus: 'Pulse' });
    assert.deepEqual(get(activeEditorTab), { type: 'panel', id: panel.id });
    assert.deepEqual([...get(selectedComponentIds)], [knob], 'the control is selected, not the one before');
    assert.equal(get(panelSelectionPick), null);
    assert.deepEqual(get(editorTarget), target);
    assert.deepEqual([target.kind, target.controlId, target.focus], ['animation', knob, 'Pulse']);
    // The tab takes the name once and keeps the control: coming back to it keeps what was picked since.
    assert.equal(takeEditorTargetFocus(), 'Pulse');
    assert.deepEqual(get(editorTarget), { kind: 'animation', type: 'control', controlId: knob, domain: null });
    assert.equal(takeEditorTargetFocus(), null);
  } finally {
    tidy();
  }
});

test('a tab armed in the script tab itself is let go of on the way back, which is why Open goes first', () => {
  const { panel, knob } = scriptTabOver();
  try {
    activateEditorTarget('animation', knob, null, 'Pulse');
    setActivePanel(panel.id);
    assert.equal(get(editorTarget), null, 'a change of panel clears what was armed');
    // Nor is anything armed for a panel or a control that is not given.
    assert.equal(activateEditorTargetOnPanel(null, 'animation', knob), null);
    assert.equal(activateEditorTargetOnPanel(panel.id, 'animation', ''), null);
    assert.equal(activateEditorTargetOnPanel(panel.id, 'nope', knob), null);
  } finally {
    tidy();
  }
});
