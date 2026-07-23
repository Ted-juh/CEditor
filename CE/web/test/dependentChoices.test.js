import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dependsOnId, dependsResetOnChange, visibleChoiceRows, dependentControl, firstDependentValue,
} from '../src/CE_Application/utils/dependentChoices.js';

function child(rows, { dependsOn = 'parent1', reset } = {}) {
  return {
    _children: {
      Core: { id: 'child1', name: 'Preset' },
      Value: { rows, dependsOn, ...(reset === undefined ? {} : { dependsResetOnChange: reset }) },
    },
  };
}

const ROWS = [
  { id: 'h', displayText: 'DRUMS', isHeader: true },
  { id: 'a', internalValue: 'kick', displayText: 'Kick', parentValue: 'drums' },
  { id: 'b', internalValue: 'snare', displayText: 'Snare', parentValue: 'drums' },
  { id: 'c', internalValue: 'saw', displayText: 'Saw', parentValue: 'synth' },
  { id: 'd', internalValue: 'init', displayText: 'INIT', parentValue: '' }, // global
];

test('dependsOnId + dependsResetOnChange read the Value section', () => {
  assert.equal(dependsOnId(child(ROWS)), 'parent1');
  assert.equal(dependsOnId({ _children: { Value: {} } }), '');
  assert.equal(dependsResetOnChange(child(ROWS)), true);          // default
  assert.equal(dependsResetOnChange(child(ROWS, { reset: false })), false);
});

test('visibleChoiceRows keeps matches + globals + headers', () => {
  // No dependency → untouched.
  assert.equal(visibleChoiceRows(ROWS, 'drums', '').length, 5);
  // drums → header + Kick + Snare + INIT(global)
  const drums = visibleChoiceRows(ROWS, 'drums', 'parent1');
  assert.deepEqual(drums.map((r) => r.id), ['h', 'a', 'b', 'd']);
  // synth → header + Saw + INIT(global)
  const synth = visibleChoiceRows(ROWS, 'synth', 'parent1');
  assert.deepEqual(synth.map((r) => r.id), ['h', 'c', 'd']);
  // unknown parent value → header + only globals
  assert.deepEqual(visibleChoiceRows(ROWS, 'zzz', 'parent1').map((r) => r.id), ['h', 'd']);
});

test('dependentControl shallow-clones with filtered rows and keeps Core', () => {
  const c = child(ROWS);
  const filtered = dependentControl(c, 'synth');
  assert.equal(filtered._children.Core.id, 'child1');            // id preserved for session lookup
  assert.deepEqual(filtered._children.Value.rows.map((r) => r.id), ['h', 'c', 'd']);
  assert.notEqual(filtered, c);                                   // new object
  assert.equal(c._children.Value.rows.length, 5);                // original untouched
});

test('dependentControl returns the control unchanged when nothing is filtered', () => {
  const indep = { _children: { Core: { id: 'x' }, Value: { rows: ROWS, dependsOn: '' } } };
  assert.equal(dependentControl(indep, 'drums'), indep);          // no dependency → same ref
  const allGlobal = child([{ id: 'g', internalValue: 'g', parentValue: '' }]);
  assert.equal(dependentControl(allGlobal, 'anything'), allGlobal); // nothing removed → same ref
});

test('firstDependentValue picks the first pickable row under the parent value', () => {
  assert.equal(firstDependentValue(ROWS, 'drums', 'parent1'), 'kick'); // skips the header
  assert.equal(firstDependentValue(ROWS, 'synth', 'parent1'), 'saw');
  assert.equal(firstDependentValue(ROWS, 'zzz', 'parent1'), 'init');   // only the global remains
  const disabledFirst = [
    { id: 'x', internalValue: 'x', parentValue: 'p', enabled: false },
    { id: 'y', internalValue: 'y', parentValue: 'p' },
  ];
  assert.equal(firstDependentValue(disabledFirst, 'p', 'parent1'), 'y'); // skips disabled
});
