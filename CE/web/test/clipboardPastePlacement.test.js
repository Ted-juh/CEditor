// clipboardPastePlacement.test.js — the three paste clauses of review finding E2.
//
//   "No paste-in-place; keyboard paste is always +20/+20; paste never targets the selected
//    container."
//
// The structural half of E2 (paste back into the surviving parent, unique _copy names) is covered
// by clipboardSemantics.test.js and must stay true — this file is about WHERE the copy lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { copySelection, pasteSelection, pasteInPlace } from '../src/CE_Application/stores/clipboard.js';
import { findControlById, findParentOfControl } from '../src/CE_Application/utils/containment.js';
import { viewportPanelCenter } from '../src/CE_Application/stores/editorView.js';

function openPanels(...names) {
  const list = names.map((name) => createPanel(name));
  panels.set(list);
  selectedComponentIds.set(new Set());
  viewportPanelCenter.set(null);
  activate(list[0]);
  return list;
}

function activate(panel) {
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
}

function controlsOf(panelId) {
  return get(panels).find((p) => p.id === panelId).controls;
}

/** The transform of the single control the last paste selected. */
function pastedTransform(panelId) {
  const id = [...get(selectedComponentIds)][0];
  return findControlById(controlsOf(panelId), id)?._children?.Transform;
}

function place(control, x, y) {
  const id = control._children.Core.id;
  panels.update((list) => list.map((p) => ({
    ...p,
    controls: p.controls.map((c) => (c._children.Core.id === id
      ? { ...c, _children: { ...c._children, Transform: { ...c._children.Transform, x, y } } }
      : c)),
  })));
  return id;
}

function teardown() {
  panels.set([]);
  selectedComponentIds.set(new Set());
  activeEditorTab.set({ type: 'panel', id: null });
  activePanelId.set(null);
}

// --- E2(2): the stagger --------------------------------------------------------------------

test('successive pastes stagger from the LAST paste, not from the source', () => {
  const [panel] = openPanels('Stagger');
  const knob = addControl('Knob');
  const knobId = place(knob, 100, 100);

  selectedComponentIds.set(new Set([knobId]));
  copySelection();

  pasteSelection();
  const first = pastedTransform(panel.id);
  assert.deepEqual({ x: first.x, y: first.y }, { x: 120, y: 120 });

  pasteSelection();
  const second = pastedTransform(panel.id);
  assert.deepEqual({ x: second.x, y: second.y }, { x: 140, y: 140 },
    'the second paste steps off the first, so nothing lands on top of anything');

  pasteSelection();
  const third = pastedTransform(panel.id);
  assert.deepEqual({ x: third.x, y: third.y }, { x: 160, y: 160 });

  teardown();
});

test('the first paste into a DIFFERENT panel is not offset at all', () => {
  const [source, other] = openPanels('Source', 'Other');
  const knob = addControl('Knob');
  const knobId = place(knob, 100, 100);
  selectedComponentIds.set(new Set([knobId]));
  copySelection();

  activate(other);
  pasteSelection();
  const landed = pastedTransform(other.id);
  assert.deepEqual({ x: landed.x, y: landed.y }, { x: 100, y: 100 },
    '+20 from a position this panel has never seen is an offset from nothing');

  // …and once it HAS been pasted here, a repeat staggers as usual.
  pasteSelection();
  const again = pastedTransform(other.id);
  assert.deepEqual({ x: again.x, y: again.y }, { x: 120, y: 120 });

  teardown();
});

// --- E2(1): paste in place -----------------------------------------------------------------

test('paste in place restores the original coordinates, however staggered the buffer is', () => {
  const [panel] = openPanels('In Place');
  const knob = addControl('Knob');
  const knobId = place(knob, 60, 40);
  selectedComponentIds.set(new Set([knobId]));
  copySelection();

  pasteSelection();
  pasteSelection();
  const staggered = pastedTransform(panel.id);
  assert.deepEqual({ x: staggered.x, y: staggered.y }, { x: 100, y: 80 }, 'buffer has walked twice');

  pasteInPlace();
  const inPlace = pastedTransform(panel.id);
  assert.deepEqual({ x: inPlace.x, y: inPlace.y }, { x: 60, y: 40 },
    'in place means the place it was copied from, not the place the stagger reached');

  // Twice in a row lands on the same spot — "in place" is a promise about where, not a stagger.
  pasteInPlace();
  const twice = pastedTransform(panel.id);
  assert.deepEqual({ x: twice.x, y: twice.y }, { x: 60, y: 40 });

  teardown();
});

test('paste in place keeps the original parent, and crosses panels at the same coordinates', () => {
  const [source, other] = openPanels('Parented', 'Elsewhere');
  const container = addControl('Container');
  const containerId = container._children.Core.id;
  selectedComponentIds.set(new Set([containerId]));
  const label = addControl('Label');           // lands INSIDE the selected container
  const labelId = label._children.Core.id;
  const local = { ...findControlById(controlsOf(source.id), labelId)._children.Transform };

  selectedComponentIds.set(new Set([labelId]));
  copySelection();
  pasteInPlace();

  const pastedId = [...get(selectedComponentIds)][0];
  assert.notEqual(pastedId, labelId);
  assert.equal(findParentOfControl(controlsOf(source.id), pastedId)?._children?.Core?.id, containerId,
    'original parent, when it is still there');
  const pasted = findControlById(controlsOf(source.id), pastedId)._children.Transform;
  assert.deepEqual({ x: pasted.x, y: pasted.y }, { x: local.x, y: local.y });

  // The container does not exist in the other panel, so it lands at top level — at the same
  // panel-space coordinates, which is the use paste-in-place exists for.
  activate(other);
  pasteInPlace();
  const crossId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(controlsOf(other.id), crossId), null);

  teardown();
});

// --- E2(3): the selected container ---------------------------------------------------------

test('paste lands in the container the user has selected', () => {
  const [panel] = openPanels('Target');
  const knob = addControl('Knob');
  const knobId = place(knob, 10, 10);
  selectedComponentIds.set(new Set([knobId]));
  copySelection();

  const container = addControl('Container');
  const containerId = place(container, 200, 100);
  selectedComponentIds.set(new Set([containerId]));

  pasteSelection();
  const pastedId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(controlsOf(panel.id), pastedId)?._children?.Core?.id, containerId,
    'a selected container is where a paste goes');

  // Its coordinates are the container's, not the panel's: a parent-relative x of 10 would put it
  // 200 units from where the copy came from.
  const t = findControlById(controlsOf(panel.id), pastedId)._children.Transform;
  assert.ok(t.x >= 0 && t.y >= 0, `clamped inside the container, got ${t.x},${t.y}`);

  teardown();
});

test('repeated paste into a container does not bury each copy in the last one', () => {
  const [panel] = openPanels('No Nesting');
  const group = addControl('Container');
  const groupId = group._children.Core.id;
  selectedComponentIds.set(new Set([groupId]));
  copySelection();
  selectedComponentIds.set(new Set([groupId]));

  // First paste: the selected container IS the thing being copied, so the copy goes beside it.
  pasteSelection();
  const firstId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(controlsOf(panel.id), firstId), null,
    'copy a group with the group selected and you expect a sibling, not a group inside itself');

  // Second paste: the selection is now the container the previous paste made. Following it would
  // bury every further paste one level deeper.
  pasteSelection();
  const secondId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(controlsOf(panel.id), secondId), null);
  assert.equal(controlsOf(panel.id).length, 3, 'three top-level groups, none inside another');

  teardown();
});

test('"Paste Here" still overrides everything and centres on the click point', () => {
  const [panel] = openPanels('Paste Here');
  const knob = addControl('Knob');
  const knobId = place(knob, 10, 10);
  const size = { ...findControlById(controlsOf(panel.id), knobId)._children.Transform };
  selectedComponentIds.set(new Set([knobId]));
  copySelection();

  const container = addControl('Container');
  selectedComponentIds.set(new Set([container._children.Core.id]));

  pasteSelection({ x: 300, y: 200 });
  const pastedId = [...get(selectedComponentIds)][0];
  assert.equal(findParentOfControl(controlsOf(panel.id), pastedId), null,
    'the click location is the intent, so it beats the selected container');
  const t = findControlById(controlsOf(panel.id), pastedId)._children.Transform;
  assert.deepEqual(
    { x: t.x + (t.width ?? 0) / 2, y: t.y + (t.height ?? 0) / 2 },
    { x: 300, y: 200 },
    `centred on the point (size ${size.width}x${size.height})`
  );

  teardown();
});
