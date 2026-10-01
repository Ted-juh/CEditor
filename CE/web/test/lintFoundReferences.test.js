// lintFoundReferences.test.js — three functions that called names their module never imported.
//
// Found 2026-10-01 by running ESLint's `no-undef` over the tree for the first time
// (docs/design/lint-and-accessibility-2026-10-01.md). None of the three had a test that reached the
// line, so each threw a ReferenceError the first time a user got there: the Snap to Grid and Snap to
// Guides buttons in the alignment panel, adding a section to a control, and the two font paths in
// appSettings that infer a MIME type from a file name. This file reaches the two it can from Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanel, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { addSection, getSection } from '../src/CE_Application/stores/controls.js';
import { snapSelectionToGrid } from '../src/CE_Application/stores/alignment.js';
import { findControlById } from '../src/CE_Application/utils/containment.js';

function panelWith(control, extra = {}) {
  const panel = { ...createPanel('Lint'), ...extra, controls: [control] };
  panels.set([panel]);
  selectedComponentIds.set(new Set([control._children.Core.id]));
  return panel;
}

test('Snap to Grid moves the selected control onto the grid instead of throwing', () => {
  const knob = createControl('Knob');
  knob._children.Transform.x = 103;
  knob._children.Transform.y = 47;
  panelWith(knob, { gridSize: 10 });

  assert.doesNotThrow(() => snapSelectionToGrid());

  const moved = findControlById(get(activePanel).controls, knob._children.Core.id);
  assert.equal(getSection(moved, 'Transform').x, 100);
  assert.equal(getSection(moved, 'Transform').y, 50);
});

test('addSection gives the control the section with its defaults instead of throwing', () => {
  const label = createControl('Image');
  panelWith(label);
  assert.equal(getSection(label, 'Grid'), null);

  assert.doesNotThrow(() => addSection(label._children.Core.id, 'Grid'));

  const after = findControlById(get(activePanel).controls, label._children.Core.id);
  const grid = getSection(after, 'Grid');
  assert.ok(grid, 'the section exists');
  assert.equal(grid._type, 'Grid');
});
