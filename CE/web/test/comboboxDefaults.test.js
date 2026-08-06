// comboboxDefaults.test.js — CE-BETA-005 and CE-BETA-011 from the 2026-08-06 QA pass.
//
// 005: rows Clean / Crunch / Space were configured, and the editor let the first TWO stay ticked
// as Default at once. Every reader takes the first match -- PanelPreviewSurface, interactionPreview,
// InteractiveTestSurface, interactionRuntime and exportParameters all `.find()` it -- so the second
// tick was never a second default. It was a checkbox that looked set and did nothing.
//
// 011: the edit canvas kept saying "Option 1" after the rows were renamed, while preview said the
// configured item. The canvas has no interaction runtime, so it fell through to the authored
// Text.content that component creation seeds as "Option 1" and nothing rewrites. Two answers to
// "what does this control show", and the one you design against was wrong.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDefaultValueRow,
  getDefaultValueRowLabel,
  getEnabledValueRows,
} from '../src/CE_Application/editor/canvasControlStyles.js';

/** The rows the tester configured. */
const rows = () => ([
  { id: 'r1', displayText: 'Clean', internalValue: 'clean', selectedByDefault: true },
  { id: 'r2', displayText: 'Crunch', internalValue: 'crunch' },
  { id: 'r3', displayText: 'Space', internalValue: 'space' },
]);

// --- CE-BETA-011: the canvas shows the row it will open on -----------------

test('the default row is the one the canvas should show', () => {
  assert.equal(getDefaultValueRowLabel({ rows: rows() }), 'Clean');
});

test('with no row marked default, the first enabled one speaks', () => {
  // Matches interactionRuntime's findDefaultRow, so canvas and preview cannot diverge.
  const noDefault = rows().map(({ selectedByDefault, ...row }) => row);
  assert.equal(getDefaultValueRowLabel({ rows: noDefault }), 'Clean');
});

test('a disabled row is skipped, including a disabled default', () => {
  const withDisabled = [
    { id: 'r0', displayText: 'Hidden', enabled: false, selectedByDefault: true },
    { id: 'r1', displayText: 'Crunch' },
  ];
  assert.equal(getDefaultValueRowLabel({ rows: withDisabled }), 'Crunch');
});

test('the label falls back through displayText, internalValue, id', () => {
  assert.equal(getDefaultValueRowLabel({ rows: [{ id: 'r1', internalValue: 'clean' }] }), 'clean');
  assert.equal(getDefaultValueRowLabel({ rows: [{ id: 'r1' }] }), 'r1');
});

test('no rows means no label, so the authored Text content still shows', () => {
  // The fallback has to stay reachable: a control with no rows keeps whatever the author typed.
  assert.equal(getDefaultValueRowLabel({ rows: [] }), '');
  assert.equal(getDefaultValueRowLabel({}), '');
  assert.equal(getDefaultValueRowLabel(null), '');
  assert.equal(getDefaultValueRow(null), null);
});

test('getEnabledValueRows still filters only on enabled', () => {
  const mixed = [{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c', enabled: true }];
  assert.deepEqual(getEnabledValueRows({ rows: mixed }).map((row) => row.id), ['a', 'c']);
});

// --- CE-BETA-005: one default, unless the control is multi-select ----------

/**
 * ValueEditor's rule, mirrored. The component itself needs a DOM to drive, so the rule is pinned
 * here as the pure function it is: ticking a row unticks the others unless Select = multi.
 */
function applyDefaultRule(list, index, value, selectionMode = 'single') {
  const exclusive = value === true && selectionMode !== 'multi';
  return list.map((row, rowIndex) => {
    if (rowIndex === index) return { ...row, selectedByDefault: value };
    return exclusive && row?.selectedByDefault === true
      ? { ...row, selectedByDefault: false }
      : row;
  });
}

test('ticking a second row unticks the first on a single-select control', () => {
  const next = applyDefaultRule(rows(), 1, true);
  assert.deepEqual(next.map((row) => row.selectedByDefault === true), [false, true, false]);
  // And the readers agree with the editor about which row that is.
  assert.equal(getDefaultValueRowLabel({ rows: next }), 'Crunch');
});

test('multi-select keeps several defaults, because there they mean something', () => {
  const next = applyDefaultRule(rows(), 1, true, 'multi');
  assert.deepEqual(next.map((row) => row.selectedByDefault === true), [true, true, false]);
});

test('unticking leaves none, and the first enabled row takes over', () => {
  const next = applyDefaultRule(rows(), 0, false);
  assert.equal(next.some((row) => row.selectedByDefault === true), false);
  assert.equal(getDefaultValueRowLabel({ rows: next }), 'Clean');
});
