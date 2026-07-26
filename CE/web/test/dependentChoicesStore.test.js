import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPanelDependentChoices } from '../src/CE_Application/stores/interactionPreview.js';

// A minimal combobox-style selector control.
function selector(id, rows, { dependsOn = '', reset } = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'Button' },
      Behavior: { buttonType: rows.dependsOn ? 'combobox' : 'combobox', family: 'select', valueType: 'enum' },
      Value: { rows, dependsOn, ...(reset === undefined ? {} : { dependsResetOnChange: reset }) },
    },
  };
}

const BANKS = [
  { id: 'b1', internalValue: 'drums', displayText: 'Drums', selectedByDefault: true },
  { id: 'b2', internalValue: 'synth', displayText: 'Synth' },
];
const PRESETS = [
  { id: 'p1', internalValue: 'kick', displayText: 'Kick', parentValue: 'drums' },
  { id: 'p2', internalValue: 'snare', displayText: 'Snare', parentValue: 'drums' },
  { id: 'p3', internalValue: 'saw', displayText: 'Saw', parentValue: 'synth' },
  { id: 'p4', internalValue: 'pad', displayText: 'Pad', parentValue: 'synth' },
];

test('child seeds to the first row of the parent default on first resolve', () => {
  const controls = [selector('bank', BANKS), selector('preset', PRESETS, { dependsOn: 'bank' })];
  const next = applyPanelDependentChoices(controls, {});
  assert.equal(next.preset.dependsParentValue, 'drums');       // parent default
  assert.equal(next.preset.valueOverride, 'kick');             // first drums preset
  assert.equal(next.preset.valueOverrideEnabled, true);
});

test('changing the parent resets the child to the new group', () => {
  const controls = [selector('bank', BANKS), selector('preset', PRESETS, { dependsOn: 'bank' })];
  // Parent now on "synth"; child still holds a drums preset + old stamp.
  const sessions = {
    bank: { valueOverrideEnabled: true, valueOverride: 'synth' },
    preset: { valueOverrideEnabled: true, valueOverride: 'kick', dependsParentValue: 'drums', listboxScrollTop: 40 },
  };
  const next = applyPanelDependentChoices(controls, sessions);
  assert.equal(next.preset.dependsParentValue, 'synth');
  assert.equal(next.preset.valueOverride, 'saw');              // first synth preset
  assert.equal(next.preset.listboxScrollTop, 0);              // scroll reset too
});

test('no reset while the parent is unchanged (child keeps its own pick)', () => {
  const controls = [selector('bank', BANKS), selector('preset', PRESETS, { dependsOn: 'bank' })];
  const sessions = {
    bank: { valueOverrideEnabled: true, valueOverride: 'drums' },
    preset: { valueOverrideEnabled: true, valueOverride: 'snare', dependsParentValue: 'drums' },
  };
  const next = applyPanelDependentChoices(controls, sessions);
  assert.equal(next, sessions);                                // unchanged reference → no churn
});

test('dependsResetOnChange=false keeps a still-valid pick across parent change', () => {
  // A "favourites" preset that is visible in both banks (global parentValue '').
  const presets = [...PRESETS, { id: 'p5', internalValue: 'fav', displayText: 'Favourite', parentValue: '' }];
  const controls = [selector('bank', BANKS), selector('preset', presets, { dependsOn: 'bank', reset: false })];
  const sessions = {
    bank: { valueOverrideEnabled: true, valueOverride: 'synth' },
    preset: { valueOverrideEnabled: true, valueOverride: 'fav', dependsParentValue: 'drums' },
  };
  const next = applyPanelDependentChoices(controls, sessions);
  assert.equal(next.preset.dependsParentValue, 'synth');
  assert.equal(next.preset.valueOverride, 'fav');             // still visible → kept
});

test('dependsResetOnChange=false still resets when the pick becomes invisible', () => {
  const controls = [selector('bank', BANKS), selector('preset', PRESETS, { dependsOn: 'bank', reset: false })];
  const sessions = {
    bank: { valueOverrideEnabled: true, valueOverride: 'synth' },
    preset: { valueOverrideEnabled: true, valueOverride: 'kick', dependsParentValue: 'drums' }, // kick is drums-only
  };
  const next = applyPanelDependentChoices(controls, sessions);
  assert.equal(next.preset.valueOverride, 'saw');            // kick invisible under synth → reset
});
