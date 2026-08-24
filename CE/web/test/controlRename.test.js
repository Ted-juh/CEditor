// controlRename.test.js — renaming a control (finding C6).
//
// Two holes, both in the same three lines of ComponentTree's `commitRename`:
//
//   if (renamingId && renameValue.trim()) updateControlProperty(renamingId, 'Core.name', ...)
//
// Clearing the field silently discarded the edit — the row snapped back to the old name with no
// explanation — and any name that survived the truthiness check was written straight through, so
// two controls could end up sharing one. `Core.name` is the SCRIPT-ADDRESSABLE handle
// (`set("cutoff.value", …)`), so a duplicate is an ambiguous script target, not a cosmetic clash.
// Add, duplicate and paste had gone through a uniquifier for a while; rename had not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addControl, renameControl, uniqueControlName } from '../src/CE_Application/stores/controls.js';
import { findControlById, flatControls } from '../src/CE_Application/utils/containment.js';

function freshPanel() {
  const panel = createPanel('Rename');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  return panel;
}

const controls = () => get(panels)[0].controls;
const nameOf = (id) => findControlById(controls(), id)?._children?.Core?.name;

test('uniqueControlName suffixes numerically, not with _copy', () => {
  const taken = new Set(['cutoff', 'cutoff_2']);
  assert.equal(uniqueControlName(taken, 'cutoff'), 'cutoff_3');
  assert.equal(uniqueControlName(taken, 'resonance'), 'resonance');
  assert.equal(uniqueControlName(taken, '   '), 'control', 'a blank with no fallback still has to be a name');
  assert.equal(uniqueControlName(taken, '', 'Knob'), 'Knob', 'a blank falls back to the type');
  assert.equal(uniqueControlName(new Set(['Knob']), '', 'Knob'), 'Knob_2', 'and the fallback is uniqued too');
});

test('a rename onto a name another control holds gets a suffix', () => {
  freshPanel();
  const a = addControl('Knob');
  const b = addControl('Knob');
  const aId = a._children.Core.id;
  const bId = b._children.Core.id;

  renameControl(aId, 'cutoff');
  assert.equal(nameOf(aId), 'cutoff');

  const result = renameControl(bId, 'cutoff');
  assert.equal(result.requested, 'cutoff');
  assert.equal(result.applied, 'cutoff_2', 'the second control must not take the first one\'s script handle');
  assert.equal(nameOf(bId), 'cutoff_2');
  assert.equal(nameOf(aId), 'cutoff', 'the original keeps its name');

  const names = flatControls(controls()).map((c) => c._children.Core.name);
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names.join(', ')}`);
});

test('renaming a control to the name it already has is not a collision with itself', () => {
  freshPanel();
  const knob = addControl('Knob');
  const id = knob._children.Core.id;
  renameControl(id, 'cutoff');

  const result = renameControl(id, 'cutoff');
  assert.equal(result.applied, 'cutoff', 'a no-op rename must not become cutoff_2');
  assert.equal(result.changed, false);
  assert.equal(nameOf(id), 'cutoff');
});

test('clearing the field is not silently discarded — it falls back to the type name', () => {
  freshPanel();
  const knob = addControl('Knob');
  const id = knob._children.Core.id;
  renameControl(id, 'cutoff');

  const result = renameControl(id, '   ');
  assert.equal(result.requested, '');
  assert.equal(result.applied, 'Knob', 'a cleared name falls back to the control type');
  assert.equal(nameOf(id), 'Knob');
  // And the caller can see that what was applied is not what was typed, which is what lets the
  // tree say so instead of correcting in silence.
  assert.notEqual(result.applied, result.requested);
});

test('the type-name fallback is uniqued too', () => {
  freshPanel();
  const first = addControl('Knob');
  const second = addControl('Knob');
  renameControl(first._children.Core.id, 'Knob');

  const result = renameControl(second._children.Core.id, '');
  assert.equal(result.applied, 'Knob_2');
  const names = flatControls(controls()).map((c) => c._children.Core.name);
  assert.equal(new Set(names).size, names.length);
});

test('renaming a control that is not there does nothing at all', () => {
  freshPanel();
  addControl('Knob');
  const before = controls();
  assert.equal(renameControl(null, 'x'), null);
  assert.equal(get(panels)[0].controls, before, 'the document must not be touched');
});
