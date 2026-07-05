import test from 'node:test';
import assert from 'node:assert/strict';

import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';

function makeControl(generator, channels = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'c1', controlType: 'CustomComponent' },
      ValueChannels: { _type: 'ValueChannels', _children: channels },
      Parts: { _type: 'Parts', _children: {} },
      HitZones: { _type: 'HitZones', _children: {} },
      Generators: { _type: 'Generators', _children: { g: { _type: 'Generator', name: 'g', enabled: true, generatedPartPrefix: 'gen', ...generator } } },
    },
  };
}

test('labels generator emits numeric labels interpolated min..max', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({
    type: 'labels', count: 3, min: 0, max: 100, suffix: '%',
  }));
  const parts = snapshot._children.Parts._children;
  const names = Object.keys(parts).filter((name) => name.startsWith('gen_label_'));
  assert.equal(names.length, 3);
  assert.equal(parts.gen_label_1._children.Text.content, '0%');
  assert.equal(parts.gen_label_2._children.Text.content, '50%');
  assert.equal(parts.gen_label_3._children.Text.content, '100%');
  assert.equal(parts.gen_label_1.generated, true);
});

test('labels generator prefers explicit label strings', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({
    type: 'labels', count: 3, labels: ['LOW', 'MID', 'HI'],
  }));
  const parts = snapshot._children.Parts._children;
  assert.equal(parts.gen_label_2._children.Text.content, 'MID');
});

test('repeated-buttons emits one part + setValue zone per button with value payloads', () => {
  const control = makeControl(
    {
      type: 'repeated-buttons',
      count: 3,
      labels: ['A', 'B', 'C'],
      values: ['a', 'b', 'c'],
      targetValueChannel: 'mode',
    },
    { mode: createValueChannel('mode', { type: 'enum', defaultValue: 'a' }) }
  );
  const snapshot = materializedCustomComponentSnapshot(control, {});
  const parts = snapshot._children.Parts._children;
  const zones = snapshot._children.HitZones._children;

  assert.equal(Object.keys(parts).filter((name) => /^gen_\d+$/.test(name)).length, 3);
  assert.equal(Object.keys(zones).filter((name) => name.startsWith('gen_zone_')).length, 3);
  assert.equal(zones.gen_zone_2.action, 'setValue');
  assert.equal(zones.gen_zone_2.payload.value, 'b');
  assert.equal(zones.gen_zone_2.payload.index, 1);
  assert.equal(zones.gen_zone_2.targetValueChannel, 'mode');
  assert.equal(parts.gen_2._children.Text.content, 'B');
});

test('the button matching the channel value renders active', () => {
  const control = makeControl(
    { type: 'repeated-buttons', count: 3, values: ['a', 'b', 'c'], targetValueChannel: 'mode', activeColour: 'FF00FF00' },
    { mode: createValueChannel('mode', { type: 'enum', defaultValue: 'a' }) }
  );
  const snapshot = materializedCustomComponentSnapshot(control, {
    customChannels: { 'channel.mode.raw': 'b' },
  });
  const parts = snapshot._children.Parts._children;
  assert.equal(parts.gen_2.meta.active, true);
  assert.equal(parts.gen_1.meta.active, false);
  assert.equal(parts.gen_2._children.Background._children.Fill.colour, 'FF00FF00');
});

test('repeated-buttons defaults values to indices and can skip zones', () => {
  const control = makeControl(
    { type: 'repeated-buttons', count: 2, targetValueChannel: 'step', generatedHitZones: false },
    { step: createValueChannel('step', { type: 'int', min: 0, max: 1, step: 1 }) }
  );
  const snapshot = materializedCustomComponentSnapshot(control, {});
  assert.equal(Object.keys(snapshot._children.HitZones._children).length, 0);
  assert.equal(snapshot._children.Parts._children.gen_2.meta.value, 1);
});
