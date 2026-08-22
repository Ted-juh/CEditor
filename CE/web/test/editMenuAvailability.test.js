// editMenuAvailability.test.js — the Edit menu's grey-out table.
//
// Review finding D6 wants Duplicate, Delete, Group into Container, Ungroup and Arrange in the
// Edit menu; finding D3 is the same menu shipping items that looked live and were not. So the
// interesting assertions are the boundaries: Ungroup with one non-container selected, Tidy Grid
// with a single control, Select All on an empty panel.

import test from 'node:test';
import assert from 'node:assert/strict';

import { editMenuAvailability, singleSelectedContainerId } from '../src/CE_Application/utils/editMenuAvailability.js';

const button = (id) => ({ _children: { Core: { id, type: 'MomentaryButton' } } });
const container = (id, children = []) => ({
  _children: {
    Core: { id, type: 'Container' },
    Children: { _children: Object.fromEntries(children.map((c) => [c._children.Core.id, c])) },
  },
});

const panel = { controls: [button('b1'), button('b2'), container('c1', [button('b3')])] };

test('nothing selected greys out every command that acts on a selection', () => {
  const a = editMenuAvailability(panel, new Set());
  assert.equal(a.canDuplicate, false);
  assert.equal(a.canDelete, false);
  assert.equal(a.canGroup, false);
  assert.equal(a.canUngroup, false);
  assert.equal(a.canReorder, false);
  assert.equal(a.canArrangeMany, false);
  // Select All is the exception: it needs controls, not a selection.
  assert.equal(a.canSelectAll, true);
});

test('one control selected enables duplicate, delete, group and z-order', () => {
  const a = editMenuAvailability(panel, new Set(['b1']));
  assert.equal(a.canDuplicate, true);
  assert.equal(a.canDelete, true);
  assert.equal(a.canGroup, true);
  assert.equal(a.canReorder, true);
});

test('Tidy Grid and Arrange in Circle need a crowd, because below two they do nothing', () => {
  assert.equal(editMenuAvailability(panel, new Set(['b1'])).canArrangeMany, false);
  assert.equal(editMenuAvailability(panel, new Set(['b1', 'b2'])).canArrangeMany, true);
});

test('Ungroup needs exactly one selected control that is actually a container', () => {
  assert.equal(editMenuAvailability(panel, new Set(['b1'])).canUngroup, false, 'a button is not a group');
  assert.equal(editMenuAvailability(panel, new Set(['c1'])).canUngroup, true);
  assert.equal(editMenuAvailability(panel, new Set(['c1', 'b1'])).canUngroup, false, 'two selected is ambiguous');
});

test('Ungroup hands back the id it would act on, so the menu and the command cannot disagree', () => {
  assert.equal(editMenuAvailability(panel, new Set(['c1'])).ungroupTargetId, 'c1');
  assert.equal(singleSelectedContainerId(panel, ['c1']), 'c1');
  assert.equal(singleSelectedContainerId(panel, ['b3']), null);
  assert.equal(singleSelectedContainerId(null, ['c1']), null);
});

test('a container nested inside another is still ungroupable — the walk is the whole tree', () => {
  const nested = { controls: [container('outer', [container('inner', [button('b9')])])] };
  assert.equal(editMenuAvailability(nested, new Set(['inner'])).canUngroup, true);
});

test('Select All is off on an empty or absent panel', () => {
  assert.equal(editMenuAvailability({ controls: [] }, new Set()).canSelectAll, false);
  assert.equal(editMenuAvailability(null, new Set()).canSelectAll, false);
});

test('a plain array of ids works as well as a Set — call sites pass both', () => {
  assert.equal(editMenuAvailability(panel, ['b1', 'b2']).selectionCount, 2);
  assert.equal(editMenuAvailability(panel, null).selectionCount, 0);
});
