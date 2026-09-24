import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceValueAt } from '../src/CE_Application/utils/exportParameters.js';
import { choiceParameterForControl, controlParamValue, hostValuePatch, hostParameterLeaf } from '../src/CE_Application/utils/playerParameterSession.js';

test('host automation wins over a slider drag that left its role-specific override set', () => {
  const session = {
    currentValueOverrideEnabled: true,
    currentValueOverride: 18,
    valueOverrideEnabled: true,
    valueOverride: 73,
  };
  assert.equal(controlParamValue(session, 'value'), 73);
});

test('index-mode host choices round-trip non-numeric row values', () => {
  const control = { _children: { Value: { rows: [
    { internalValue: 'sine' },
    { isHeader: true, displayText: 'Waves' },
    { internalValue: 'square' },
  ] } } };
  const param = choiceParameterForControl({ valueKind: 'choice', choiceMode: 'index' }, control);
  assert.equal(controlParamValue({ valueOverrideEnabled: true, valueOverride: 'square' }, 'value', param), 1);
  assert.equal(choiceValueAt(param, 0), 'sine');
  assert.equal(choiceValueAt(param, 1), 'square');
  const legacyNamed = { choiceMode: 'value', choiceValues: ['a', 'b'] };
  assert.equal(choiceParameterForControl(legacyNamed, control), legacyNamed);
});

test('a boolean host parameter reads the toggle state', () => {
  assert.deepEqual(hostValuePatch({ valueKind: 'bool', leaf: 'value' }, 1, 1, {}),
    { checked: true, mixed: false, valueOverrideEnabled: false });
  assert.equal(controlParamValue({ checked: true, valueOverrideEnabled: false }, 'value'), 1);
  assert.equal(controlParamValue({ checked: false, valueOverrideEnabled: false }, 'value'), 0);
});

test('an export parameter addresses its control\'s value even when the control name has dots', () => {
  // Every generated GAIA control is named like this. Splitting at the first dot addressed
  // "filter.cutoff.value", so the host and the control never met.
  assert.equal(hostParameterLeaf({ controlName: 'tone1.filter.cutoff', path: 'tone1.filter.cutoff.value' }), 'value');
  assert.equal(hostParameterLeaf({ controlName: 'arp', path: 'arp.rate' }), 'rate');
  assert.equal(hostParameterLeaf({ controlName: 'pad.x', path: 'pad.x.position.x' }), 'position.x');
  assert.equal(hostParameterLeaf({ path: 'cutoff.value' }), 'value', 'no control name: the old reading');
  assert.equal(hostParameterLeaf({ controlName: 'knob', path: 'knob' }), 'value');
});

