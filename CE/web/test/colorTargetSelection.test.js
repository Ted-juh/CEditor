// colorTargetSelection.test.js — a colour picked from the inspector goes on every selected control.
//
// The inspector's typed fields always changed the whole selection; a colour picked through the
// dock changed only the control whose swatch was clicked. The SH-201 tutorial gives 22 black
// sections a thin grey border: the thickness reached all 22, the colour reached one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  activateInspectorColorTarget, applyColorToTarget, clearColorTarget, colorTarget, restoreColorTargetSelection,
} from '../src/CE_Application/stores/colorTarget.js';
import { activePanelId, panels, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { findControlById } from '../src/CE_Application/utils/containment.js';

const PATH = 'Background.Border.colour';
const section = (id, colour) => createControl('Group', {
  Core: { id, name: id },
  Background: { _children: { Border: { enabled: true, thickness: 1, colour } } },
});
const borderOf = (id) => findControlById(get(panels)[0].controls, id)._children.Background._children.Border.colour;

function setUp(selected) {
  panels.set([{ id: 'panel', controls: [section('a', 'FF111111'), section('b', 'FF222222'), section('c', 'FF333333')] }]);
  activePanelId.set('panel');
  selectedComponentIds.set(new Set(selected));
}
test.afterEach(() => {
  clearColorTarget();
  selectedComponentIds.set(new Set());
  panels.set([]);
});

test('a border colour picked with two selected goes on both, and not on the third', () => {
  setUp(['a', 'b']);
  activateInspectorColorTarget({ type: 'control', controlId: 'a', path: PATH }, 'FF111111');
  applyColorToTarget('FF45484C');
  assert.deepEqual(['a', 'b', 'c'].map(borderOf), ['FF45484C', 'FF45484C', 'FF333333']);
});

test('Cancel gives each selected control its own colour back', () => {
  setUp(['a', 'b']);
  activateInspectorColorTarget({ type: 'control', controlId: 'a', path: PATH }, 'FF111111');
  applyColorToTarget('FF45484C');
  assert.equal(restoreColorTargetSelection(get(colorTarget), true), true);
  assert.deepEqual(['a', 'b', 'c'].map(borderOf), ['FF111111', 'FF222222', 'FF333333']);
});

test('with one control selected it is that control\'s colour, as before', () => {
  setUp(['a']);
  activateInspectorColorTarget({ type: 'control', controlId: 'a', path: PATH }, 'FF111111');
  applyColorToTarget('FF45484C');
  assert.deepEqual(['a', 'b', 'c'].map(borderOf), ['FF45484C', 'FF222222', 'FF333333']);
  assert.equal(restoreColorTargetSelection(get(colorTarget), true), false, 'Cancel restores it the old way');
});
