import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isContainerControl,
  getChildControls,
  flatControls,
  findControlById,
  findParentOfControl,
  getAncestorIds,
  collectSubtreeIds,
  selectionRoots,
  mapControlsTree,
  removeControlFromTree,
  insertControlIntoTree,
  remintControlIds,
} from '../src/CE_Application/utils/containment.js';

// --- tiny tree builders -----------------------------------------------------
function ctrl(id, extra = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'Label' },
      Transform: { x: 0, y: 0, width: 10, height: 10 },
      ...extra,
    },
  };
}
function container(id, children = [], extra = {}) {
  const map = {};
  for (const c of children) map[c._children.Core.id] = c;
  return {
    _children: {
      Core: { id, name: id, controlType: 'Container' },
      Transform: { x: 0, y: 0, width: 100, height: 100 },
      Children: { _type: 'Children', layout: 'none', gap: 0, padding: 0, clip: false, _children: map },
      ...extra,
    },
  };
}

// Panel tree: [ A, C1{ B, C2{ D } } ]
function tree() {
  return [
    ctrl('A'),
    container('C1', [ctrl('B'), container('C2', [ctrl('D')])]),
  ];
}

test('isContainerControl / getChildControls', () => {
  const t = tree();
  assert.equal(isContainerControl(t[0]), false);          // A is a Label
  assert.equal(isContainerControl(t[1]), true);           // C1 has Children
  assert.deepEqual(getChildControls(t[1]).map(c => c._children.Core.id), ['B', 'C2']);
  assert.deepEqual(getChildControls(t[0]), []);           // non-container → []
});

test('flatControls walks the whole tree depth-first; a flat list is unchanged', () => {
  assert.deepEqual(flatControls(tree()).map(c => c._children.Core.id), ['A', 'C1', 'B', 'C2', 'D']);
  const flat = [ctrl('X'), ctrl('Y')];
  assert.deepEqual(flatControls(flat).map(c => c._children.Core.id), ['X', 'Y']);
});

test('findControlById / findParentOfControl / getAncestorIds reach nested nodes', () => {
  const t = tree();
  assert.equal(findControlById(t, 'D')._children.Core.id, 'D');
  assert.equal(findControlById(t, 'missing'), null);
  assert.equal(findParentOfControl(t, 'D')._children.Core.id, 'C2');
  assert.equal(findParentOfControl(t, 'A'), null);        // top-level → no parent
  assert.deepEqual(getAncestorIds(t, 'D'), ['C2', 'C1']); // nearest ancestor first
});

test('collectSubtreeIds returns the node and all descendants', () => {
  const t = tree();
  assert.deepEqual(collectSubtreeIds(findControlById(t, 'C1')).sort(), ['B', 'C1', 'C2', 'D']);
  assert.deepEqual(collectSubtreeIds(findControlById(t, 'A')), ['A']);
});

test('selectionRoots drops descendants when an ancestor is also selected', () => {
  const t = tree();
  // C1 selected together with its descendants B and D → only C1 is a root
  assert.deepEqual(selectionRoots(t, ['C1', 'B', 'D']).sort(), ['C1']);
  // A and D (different branches, neither an ancestor of the other) → both roots
  assert.deepEqual(selectionRoots(t, ['A', 'D']).sort(), ['A', 'D']);
});

test('mapControlsTree mutates a nested node clone-on-write', () => {
  const t = tree();
  const next = mapControlsTree(t, (c) => {
    if (c._children.Core.id !== 'D') return c;
    const clone = structuredClone(c);
    clone._children.Transform.x = 42;
    return clone;
  });
  assert.notEqual(next, t);                                       // array changed
  assert.equal(findControlById(next, 'D')._children.Transform.x, 42);
  assert.equal(findControlById(t, 'D')._children.Transform.x, 0); // original untouched
  assert.equal(next[0], t[0]);                                    // untouched branch (A) shared
});

test('removeControlFromTree removes a nested subtree and reports it', () => {
  const t = tree();
  const { controls, removed } = removeControlFromTree(t, 'C2');
  assert.equal(removed._children.Core.id, 'C2');
  assert.equal(findControlById(controls, 'C2'), null);
  assert.equal(findControlById(controls, 'D'), null);             // descendant gone too
  assert.equal(findControlById(controls, 'B')._children.Core.id, 'B'); // sibling kept
});

test('insertControlIntoTree places a node under a container (or top level)', () => {
  const t = tree();
  const nested = insertControlIntoTree(t, 'C1', ctrl('E'));
  assert.equal(findParentOfControl(nested, 'E')._children.Core.id, 'C1');
  const top = insertControlIntoTree(t, null, ctrl('F'));
  assert.equal(findParentOfControl(top, 'F'), null);              // top level
});

test('remintControlIds gives fresh ids to the whole subtree', () => {
  const src = findControlById(tree(), 'C1');
  const before = collectSubtreeIds(src);
  const clone = remintControlIds(src);
  const after = collectSubtreeIds(clone);
  assert.equal(after.length, before.length);
  // no id survives the remint
  assert.equal(after.some(id => before.includes(id)), false);
});
