import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { viewportPanelCenter } from '../src/CE_Application/stores/editorView.js';
import { findControlById, getChildControls } from '../src/CE_Application/utils/containment.js';

function freshPanel(name) {
  const panel = createPanel(name);
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  return panel;
}

test('a new control lands centred on the visible viewport, clamped to the panel', () => {
  const panel = freshPanel('Insert Panel');  // 600×400
  viewportPanelCenter.set({ x: 300, y: 200 });

  const control = addControl('Label');
  const t = control._children.Transform;
  assert.equal(t.x, Math.round(300 - t.width / 2));
  assert.equal(t.y, Math.round(200 - t.height / 2));

  // A viewport centre far outside the panel clamps inside it.
  viewportPanelCenter.set({ x: 5000, y: 5000 });
  const clamped = addControl('Label');
  const ct = clamped._children.Transform;
  assert.equal(ct.x, panel.width - ct.width);
  assert.equal(ct.y, panel.height - ct.height);
  assert.ok(ct.x >= 0 && ct.y >= 0);
});

test('repeated inserts at the same spot stagger instead of stacking', () => {
  freshPanel('Stagger Panel');
  viewportPanelCenter.set({ x: 300, y: 200 });

  const first = addControl('Label');
  selectedComponentIds.set(new Set());   // avoid container targeting
  const second = addControl('Label');
  const a = first._children.Transform;
  const b = second._children.Transform;
  assert.ok(a.x !== b.x || a.y !== b.y, 'second insert must not stack exactly on the first');
});

test('with a single container selected, the new control inserts into it', () => {
  const panel = freshPanel('Container Panel');
  viewportPanelCenter.set(null);

  const container = addControl('Container');
  const containerId = container._children.Core.id;
  selectedComponentIds.set(new Set([containerId]));

  const child = addControl('Label');
  const fresh = findControlById(get(panels)[0].controls, containerId);
  const childIds = getChildControls(fresh).map((c) => c._children.Core.id);
  assert.ok(childIds.includes(child._children.Core.id), 'label must be a child of the selected container');
  const t = child._children.Transform;
  assert.ok(t.x >= 0 && t.y >= 0, 'child position is clamped inside the container');

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
  viewportPanelCenter.set(null);
});

test('an explicit drop point centres the control there, clamped to the panel', () => {
  const panel = freshPanel('Drop Panel');  // 600×400
  viewportPanelCenter.set({ x: 300, y: 200 });  // must be ignored when `at` is given

  const dropped = addControl('Label', {}, { at: { x: 100, y: 80 } });
  const t = dropped._children.Transform;
  assert.equal(t.x, Math.round(100 - t.width / 2));
  assert.equal(t.y, Math.round(80 - t.height / 2));

  // Drop near the edge clamps inside.
  const edge = addControl('Label', {}, { at: { x: panel.width + 50, y: -50 } });
  const et = edge._children.Transform;
  assert.equal(et.x, panel.width - et.width);
  assert.equal(et.y, 0);

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
  viewportPanelCenter.set(null);
});
