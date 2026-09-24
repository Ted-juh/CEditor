// selectionScope.test.js — which containers the canvas selection is "inside".
//
// Drilling to a knob and clicking the knob beside it used to select nothing: the sibling was not a
// pointer target, so the click fell through to the canvas. A container holding a selected control
// now opens its children to clicks; this is the rule that decides which containers those are.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openScopeIds } from '../src/CE_Application/stores/selectionScope.js';

function node(id, children = []) {
  return {
    _children: {
      Core: { id },
      ...(children.length ? { Children: { _children: Object.fromEntries(children.map((c) => [c._children.Core.id, c])) } } : {}),
    },
  };
}

const tree = [
  node('tone1', [node('lfo', [node('rate'), node('depth')]), node('osc', [node('pitch')])]),
  node('tone2', [node('lfo2', [node('rate2')])]),
  node('plate'),
];

test('a selected control opens every container above it, and nothing else', () => {
  assert.deepEqual([...openScopeIds(tree, new Set(['rate']))].sort(), ['lfo', 'tone1']);
});

test('a selected container opens its ancestors, not itself', () => {
  // Selecting a section must not make its knobs clickable — that is what the double-click is for.
  assert.deepEqual([...openScopeIds(tree, new Set(['lfo']))], ['tone1']);
});

test('a top-level selection opens nothing', () => {
  assert.equal(openScopeIds(tree, new Set(['plate'])).size, 0);
  assert.equal(openScopeIds(tree, new Set()).size, 0);
});

test('several selections open the union of their chains', () => {
  assert.deepEqual([...openScopeIds(tree, new Set(['rate', 'pitch', 'rate2']))].sort(), ['lfo', 'lfo2', 'osc', 'tone1', 'tone2']);
});
