import test from 'node:test';
import assert from 'node:assert/strict';

import { BASE_STATE_TARGET, resolveSelectedStateName } from '../src/CE_Application/utils/stateTargets.js';

const OPTIONS = [
  { id: 'hover', fullLabel: 'Hover' },
  { id: 'pressed', fullLabel: 'Pressed' },
  { id: 'checked', fullLabel: 'Checked' },
];

const OPTIONS_WITH_BASE = [
  { id: BASE_STATE_TARGET, fullLabel: 'Base' },
  ...OPTIONS,
];

test('resolveSelectedStateName follows the active state target when a valid state is targeted', () => {
  const next = resolveSelectedStateName(OPTIONS, 'hover', 'pressed');
  assert.equal(next, 'pressed');
});

test('resolveSelectedStateName keeps the current selection when editing base without a base option', () => {
  const next = resolveSelectedStateName(OPTIONS, 'checked', BASE_STATE_TARGET);
  assert.equal(next, 'checked');
});

test('resolveSelectedStateName prefers base when the base option is available', () => {
  const next = resolveSelectedStateName(OPTIONS_WITH_BASE, 'checked', BASE_STATE_TARGET);
  assert.equal(next, BASE_STATE_TARGET);
});

test('resolveSelectedStateName falls back to the first available option when needed', () => {
  const next = resolveSelectedStateName(OPTIONS, 'missing', BASE_STATE_TARGET);
  assert.equal(next, 'hover');
});

test('resolveSelectedStateName returns empty string when there are no states', () => {
  const next = resolveSelectedStateName([], 'hover', 'pressed');
  assert.equal(next, '');
});
