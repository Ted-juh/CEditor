import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findExclusiveSelectGroupControls,
  normalizeExclusiveSelectDefaults,
} from '../src/CE_Application/utils/selectGroupUtils.js';

function makeControl(id, behavior = {}) {
  return {
    _children: {
      Core: { id, name: id },
      Transform: { x: 0, y: 0, width: 100, height: 40 },
      Behavior: {
        family: 'trigger',
        role: 'button',
        valueType: 'none',
        defaultValue: false,
        groupId: '',
        ...behavior,
      },
    },
  };
}

test('findExclusiveSelectGroupControls returns only exclusive select siblings in the same group', () => {
  const controls = [
    makeControl('off', { family: 'select', role: 'radio', valueType: 'bool', groupId: 'filter', defaultValue: true }),
    makeControl('lpf', { family: 'select', role: 'segmented', valueType: 'bool', groupId: 'filter' }),
    makeControl('bpf', { family: 'select', role: 'radio', valueType: 'bool', groupId: 'other' }),
    makeControl('toggle', { family: 'select', role: 'toggle', valueType: 'bool', groupId: 'filter' }),
  ];

  const group = findExclusiveSelectGroupControls(controls, 'lpf');

  assert.deepEqual(group.map((control) => control._children.Core.id), ['off', 'lpf']);
});

test('normalizeExclusiveSelectDefaults keeps only one checked default per exclusive group', () => {
  const controls = [
    makeControl('off', { family: 'select', role: 'radio', valueType: 'bool', groupId: 'filter', defaultValue: true }),
    makeControl('lpf', { family: 'select', role: 'radio', valueType: 'bool', groupId: 'filter', defaultValue: true }),
    makeControl('bpf', { family: 'select', role: 'radio', valueType: 'bool', groupId: 'filter', defaultValue: true }),
    makeControl('freeToggle', { family: 'select', role: 'toggle', valueType: 'bool', defaultValue: true }),
  ];

  const next = normalizeExclusiveSelectDefaults(controls, ['bpf']);

  assert.notEqual(next, controls);
  assert.equal(next[0]._children.Behavior.defaultValue, false);
  assert.equal(next[1]._children.Behavior.defaultValue, false);
  assert.equal(next[2]._children.Behavior.defaultValue, true);
  assert.equal(next[3]._children.Behavior.defaultValue, true);

  // The source array stays untouched so callers can use the helper purely.
  assert.equal(controls[0]._children.Behavior.defaultValue, true);
  assert.equal(controls[1]._children.Behavior.defaultValue, true);
});

test('normalizeExclusiveSelectDefaults leaves non-exclusive controls unchanged', () => {
  const controls = [
    makeControl('radioWithoutGroup', { family: 'select', role: 'radio', valueType: 'bool', defaultValue: true }),
    makeControl('checkbox', { family: 'select', role: 'checkbox', valueType: 'bool', groupId: 'filter', defaultValue: true }),
  ];

  const next = normalizeExclusiveSelectDefaults(controls, ['radioWithoutGroup']);

  assert.equal(next, controls);
});
