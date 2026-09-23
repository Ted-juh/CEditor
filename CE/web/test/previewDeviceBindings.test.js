import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePreviewTriggerBindingValue,
  shouldPulseTriggerOnRelease,
} from '../src/CE_Application/utils/previewDeviceBindings.js';

test('onPressStart trigger bindings fire once on the owned press edge', () => {
  const behavior = { family: 'trigger', buttonType: 'momentary', fireOn: 'onPressStart' };
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: true }, previousPressed: false }), true);
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: true }, previousPressed: true }), undefined);
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: false, executed: true }, previousPressed: true }), undefined);
  assert.equal(shouldPulseTriggerOnRelease(behavior, true), false);
});

test('press-to-talk triggers on press while its momentary parameter reports both held edges', () => {
  const behavior = {
    family: 'trigger',
    buttonType: 'momentary',
    subtype: 'press_to_talk',
    activeWhileHeld: true,
    fireOn: 'onPressStart',
  };
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: true }, previousPressed: false }), true);
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, parameterType: 'momentary', patch: { pressed: true }, previousPressed: false }), true);
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, parameterType: 'momentary', patch: { pressed: false }, previousPressed: true }), false);
  assert.equal(shouldPulseTriggerOnRelease(behavior, true), false);
});

test('onRelease momentary triggers keep their release pulse', () => {
  const behavior = { family: 'trigger', buttonType: 'momentary', fireOn: 'onRelease' };
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: true }, previousPressed: false }), undefined);
  assert.equal(resolvePreviewTriggerBindingValue({ behavior, patch: { pressed: false, executed: true }, previousPressed: true }), true);
  assert.equal(shouldPulseTriggerOnRelease(behavior, true), true);
  assert.equal(shouldPulseTriggerOnRelease(behavior, false), false);
});
