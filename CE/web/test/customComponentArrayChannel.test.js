import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  createArrayChannel,
  createCustomComponentStarterPatch,
} from '../src/CE_Application/utils/customComponentFactory.js';
import {
  arrayChannelItems,
  constrainCustomValues,
  denormalizeArrayChannelItem,
  isArrayValueChannel,
  normalizeArrayChannelItem,
  resolveCustomInteractionPatch,
  seedCustomValues,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';

function applyStarter(starterId) {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch(starterId));
  return control;
}

test('createArrayChannel builds a fixed-size items array with defaults', () => {
  const channel = createArrayChannel('steps', { size: 4, min: 0, max: 10, step: 1, defaultValue: 2, defaultItems: [9, 1] });
  assert.equal(isArrayValueChannel(channel), true);
  assert.deepEqual(channel.items, [9, 1, 2, 2]);
  assert.equal(channel.size, 4);
});

test('arrayChannelItems clamps, sizes, and prefers the live value', () => {
  const channel = createArrayChannel('steps', { size: 3, min: 0, max: 1, defaultValue: 0.5 });
  assert.deepEqual(arrayChannelItems(channel, [2, -1]), [1, 0, 0.5]); // clamped + padded from default
  assert.deepEqual(arrayChannelItems(channel), [0.5, 0.5, 0.5]);
});

test('normalize/denormalize array items respect min/max/step', () => {
  const channel = createArrayChannel('steps', { size: 2, min: 0, max: 100, step: 5 });
  assert.equal(normalizeArrayChannelItem(channel, 50), 0.5);
  assert.equal(denormalizeArrayChannelItem(channel, 0.52), 50); // snapped to step 5
  assert.equal(denormalizeArrayChannelItem(channel, 1.4), 100); // clamped
});

function arrayControl(overrides = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'c1', controlType: 'CustomComponent' },
      ValueChannels: {
        _type: 'ValueChannels',
        _children: { steps: createArrayChannel('steps', { size: 4, min: 0, max: 1, defaultValue: 0.25 }) },
      },
      Parts: { _type: 'Parts', _children: {} },
      ...overrides,
    },
  };
}

test('seed + constrain treat array channels as clamped arrays', () => {
  const control = arrayControl();
  const seeded = seedCustomValues(control);
  assert.deepEqual(seeded.steps, [0.25, 0.25, 0.25, 0.25]);
  const constrained = constrainCustomValues(control, { steps: [5, -5, 0.5] });
  assert.deepEqual(constrained.steps, [1, 0, 0.5, 0.25]);
});

test('setItemValue writes one item from the pointer position within the zone', () => {
  const control = arrayControl();
  const zoneEntry = {
    name: 'zone3',
    zone: {
      targetValueChannel: 'steps',
      action: 'setItemValue',
      payload: { type: 'stepBar', index: 2 },
    },
  };
  // Zone rect 100px tall; pointer at 25px from the top -> item = 0.75.
  const patch = resolveCustomInteractionPatch(control, { customValues: seedCustomValues(control) }, zoneEntry, {
    rect: { top: 0, left: 0, width: 20, height: 100 },
    clientX: 10,
    clientY: 25,
  });
  assert.deepEqual(patch.customValues.steps, [0.25, 0.25, 0.75, 0.25]);
});

test('setItemValue falls back to payload normalized without a pointer', () => {
  const control = arrayControl();
  const zoneEntry = {
    name: 'zone1',
    zone: {
      targetValueChannel: 'steps',
      action: 'setItemValue',
      payload: { type: 'stepBar', index: 0, normalized: 0.5 },
    },
  };
  const patch = resolveCustomInteractionPatch(control, { customValues: seedCustomValues(control) }, zoneEntry, null);
  assert.equal(patch.customValues.steps[0], 0.5);
});

test('step-bars generator materializes one bar + zone per item, sized from the items', () => {
  const control = applyStarter('starter.stepSequencer');
  const snapshot = materializedCustomComponentSnapshot(control, {});
  const parts = snapshot._children.Parts._children;
  const zones = snapshot._children.HitZones._children;

  const bars = Object.keys(parts).filter((name) => /^step_\d+$/.test(name));
  const wells = Object.keys(parts).filter((name) => name.startsWith('step_well_'));
  const stepZones = Object.keys(zones).filter((name) => name.startsWith('step_zone_'));
  assert.equal(bars.length, 16);
  assert.equal(wells.length, 16);
  assert.equal(stepZones.length, 16);

  // Bar 1 follows item 0 (0.8) and bar 2 follows item 1 (0.2).
  assert.ok(parts.step_1.meta.itemNormalized > parts.step_2.meta.itemNormalized);
  assert.equal(zones.step_zone_5.action, 'setItemValue');
  assert.equal(zones.step_zone_5.payload.index, 4);
  assert.equal(zones.step_zone_5.targetValueChannel, 'steps');
});

test('step bars re-materialize from live customValues (indexed repeats are live)', () => {
  const control = applyStarter('starter.stepSequencer');
  const low = resolveInteractiveControl(control, { customValues: { steps: Array(16).fill(0) } });
  const high = resolveInteractiveControl(control, { customValues: { steps: Array(16).fill(1) } });
  const lowBar = low.control._children.Parts._children.step_1;
  const highBar = high.control._children.Parts._children.step_1;
  assert.equal(lowBar.meta.itemNormalized, 0);
  assert.equal(highBar.meta.itemNormalized, 1);
  assert.ok(highBar._children.Layout.height > lowBar._children.Layout.height);
});

test('per-index binding sources resolve through the channel signals', () => {
  const control = arrayControl({
    Parts: {
      _type: 'Parts',
      _children: { dot: { _type: 'Part', name: 'dot', _children: { Layout: { x: 0 } } } },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      _children: {
        b: {
          _type: 'Binding',
          name: 'b',
          enabled: true,
          source: 'channel.steps.1.normalized',
          mapMode: 'range',
          target: 'Parts.dot.Layout.x',
          inputMin: 0,
          inputMax: 1,
          outputMin: 0,
          outputMax: 100,
        },
      },
    },
  });
  const resolved = resolveInteractiveControl(control, { customValues: { steps: [0, 0.6, 0, 0] } });
  assert.equal(Math.round(resolved.control._children.Parts._children.dot._children.Layout.x), 60);
});

test('step sequencer starter validates as a package', () => {
  const control = applyStarter('starter.stepSequencer');
  const validation = validateCustomComponentPackage(control);
  assert.equal(validation.ok, true, validation.issues.join(', '));
});
