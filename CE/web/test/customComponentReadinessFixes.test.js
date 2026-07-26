import test from 'node:test';
import assert from 'node:assert/strict';

import { readinessAutoFix } from '../src/CE_Application/utils/customComponentReadinessFixes.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';

function bareControl(children = {}) {
  return { _children: { Core: { id: 'c1', name: 'Test' }, ...children } };
}

test('visuals fix scaffolds a background part only when there are no parts', () => {
  const empty = bareControl({ Parts: { _type: 'Parts', _children: {} } });
  const fix = readinessAutoFix(empty, 'visuals');
  assert.ok(fix);
  const part = fix.patch['Parts.background'];
  assert.equal(part._type, 'Part');
  assert.equal(part._children.Layout.mode, 'fill');

  const withPart = bareControl({ Parts: { _type: 'Parts', _children: { existing: { _type: 'Part' } } } });
  assert.equal(readinessAutoFix(withPart, 'visuals'), null);
});

test('values fix adds a default channel only when none exist', () => {
  const fix = readinessAutoFix(bareControl(), 'values');
  assert.ok(fix.patch['ValueChannels.value']);
  assert.equal(fix.patch['ValueChannels.value']._type, 'ValueChannel');

  const withChannel = bareControl({
    ValueChannels: { _type: 'ValueChannels', _children: { cutoff: createValueChannel('cutoff') } },
  });
  assert.equal(readinessAutoFix(withChannel, 'values'), null);
});

test('interaction fix wires behavior + face zone to the first channel', () => {
  const control = bareControl({
    ValueChannels: { _type: 'ValueChannels', _children: { cutoff: createValueChannel('cutoff') } },
  });
  const fix = readinessAutoFix(control, 'interaction');
  assert.ok(fix);
  const behavior = fix.patch['Behaviors.mainDrag'];
  const zone = fix.patch['HitZones.dragArea'];
  assert.equal(behavior.valueChannel, 'cutoff');
  assert.equal(zone.targetBehavior, 'mainDrag');
  assert.equal(zone.targetValueChannel, 'cutoff');
  assert.equal(zone.source, 'face');
  // No channel added when one already exists.
  assert.equal(fix.patch['ValueChannels.value'], undefined);
});

test('interaction fix creates a channel when none exists', () => {
  const fix = readinessAutoFix(bareControl(), 'interaction');
  assert.ok(fix.patch['ValueChannels.value']);
  assert.equal(fix.patch['Behaviors.mainDrag'].valueChannel, 'value');
});

test('publicApi fix publishes the first channel as input + output', () => {
  const control = bareControl({
    ValueChannels: { _type: 'ValueChannels', _children: { cutoff: createValueChannel('cutoff', { label: 'Cutoff' }) } },
  });
  const fix = readinessAutoFix(control, 'publicApi');
  assert.ok(fix);
  const section = fix.patch.PublishedProperties;
  assert.equal(section.inputs.cutoff.channel, 'cutoff');
  assert.equal(section.outputs.cutoff.label, 'Cutoff');
});

test('publicApi fix patches only the missing side of an existing section', () => {
  const control = bareControl({
    ValueChannels: { _type: 'ValueChannels', _children: { cutoff: createValueChannel('cutoff') } },
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: { cutoff: { channel: 'cutoff', enabled: true } },
      outputs: {},
      editableProperties: {},
    },
  });
  const fix = readinessAutoFix(control, 'publicApi');
  assert.equal(fix.patch['PublishedProperties.inputs.cutoff'], undefined);
  assert.ok(fix.patch['PublishedProperties.outputs.cutoff']);
});

test('publicApi fix is unavailable without channels', () => {
  assert.equal(readinessAutoFix(bareControl(), 'publicApi'), null);
});

test('properties fix exposes a text part when one exists', () => {
  const control = bareControl({
    Parts: {
      _type: 'Parts',
      _children: { title: { _type: 'Part', _children: { Text: { content: 'Hi' } } } },
    },
  });
  const fix = readinessAutoFix(control, 'properties');
  assert.equal(fix.patch.PublishedProperties.editableProperties.label.path, 'Parts.title.Text.content');

  const noText = bareControl({ Parts: { _type: 'Parts', _children: { box: { _type: 'Part', _children: {} } } } });
  assert.equal(readinessAutoFix(noText, 'properties'), null);
});

test('design-intent steps have no auto-fix', () => {
  assert.equal(readinessAutoFix(bareControl(), 'motion'), null);
  assert.equal(readinessAutoFix(bareControl(), 'assets'), null);
  assert.equal(readinessAutoFix(bareControl(), 'validPackage'), null);
});
