import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  CUSTOM_COMPONENT_STARTERS,
  createCustomComponentStarterPatch,
} from '../src/CE_Application/utils/customComponentFactory.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

function applyStarter(starterId) {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch(starterId));
  return control;
}

test('display starters are registered in the catalog', () => {
  const ids = CUSTOM_COMPONENT_STARTERS.map((starter) => starter.id);
  assert.ok(ids.includes('starter.segmentLevelMeter'));
  assert.ok(ids.includes('starter.statusLamp'));
  assert.ok(ids.includes('starter.valueReadout'));
  assert.ok(CUSTOM_COMPONENT_STARTERS.filter((s) => s.group === 'Display').length >= 3);
});

test('display starters are output-only: no behaviors, no hit zones', () => {
  for (const id of ['starter.segmentLevelMeter', 'starter.statusLamp', 'starter.valueReadout']) {
    const control = applyStarter(id);
    assert.deepEqual(Object.keys(control._children.Behaviors._children), [], `${id} behaviors`);
    assert.deepEqual(Object.keys(control._children.HitZones._children), [], `${id} hit zones`);
    assert.ok(Object.keys(control._children.PublishedProperties.inputs).length >= 1, `${id} public input`);
  }
});

test('segment meter LEDs light cumulatively from the level channel', () => {
  const control = applyStarter('starter.segmentLevelMeter');
  const low = materializedCustomComponentSnapshot(control, {
    customChannels: { 'channel.level.normalized': 0.25 },
  });
  const lowActive = Object.values(low._children.Parts._children)
    .filter((part) => part?.meta?.valueSource === 'level' && part?.meta?.active === true);
  assert.equal(lowActive.length, 4); // 25% of 16 segments

  const high = materializedCustomComponentSnapshot(control, {
    customChannels: { 'channel.level.normalized': 1 },
  });
  const highActive = Object.values(high._children.Parts._children)
    .filter((part) => part?.meta?.valueSource === 'level' && part?.meta?.active === true);
  assert.equal(highActive.length, 16);
});

test('status lamp caption and colour follow the bool input via binding + rule state', () => {
  const control = applyStarter('starter.statusLamp');
  const on = resolveInteractiveControl(control, { customValues: { active: 1 } });
  assert.equal(on.control._children.Parts._children.caption._children.Text.content, 'ON');
  assert.equal(on.control._children.Parts._children.lamp._children.Background._children.Fill.colour, 'FF65E6A0');

  const off = resolveInteractiveControl(control, { customValues: { active: 0 } });
  assert.equal(off.control._children.Parts._children.caption._children.Text.content, 'OFF');
  assert.notEqual(off.control._children.Parts._children.lamp._children.Background._children.Fill.colour, 'FF65E6A0');
});

test('value readout text formats the channel value', () => {
  const control = applyStarter('starter.valueReadout');
  const resolved = resolveInteractiveControl(control, { customValues: { value: 101 } });
  assert.equal(resolved.control._children.Parts._children.readout._children.Text.content, '101');
});
