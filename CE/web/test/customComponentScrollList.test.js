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
      Generators: {
        _type: 'Generators',
        _children: {
          g: {
            _type: 'Generator',
            name: 'g',
            enabled: true,
            type: 'scrollable-content',
            generatedPartPrefix: 'list',
            count: 12,
            rows: 4,
            valueSource: 'scroll',
            targetValueChannel: 'preset',
            ...generator,
          },
        },
      },
    },
  };
}

const channels = () => ({
  scroll: createValueChannel('scroll', { min: 0, max: 1, step: 0.01, defaultValue: 0 }),
  preset: createValueChannel('preset', { type: 'int', min: 0, max: 11, step: 1, defaultValue: 0 }),
});

test('scroll list renders only the visible window with slot-stable names', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({}, channels()), {
    customChannels: { 'channel.scroll.normalized': 0 },
  });
  const parts = snapshot._children.Parts._children;
  const rows = Object.keys(parts).filter((name) => name.startsWith('list_row_'));
  assert.equal(rows.length, 4);
  assert.equal(parts.list_row_1.meta.itemIndex, 0);
  assert.equal(parts.list_row_1._children.Text.content, 'Item 1');
  assert.equal(parts.list_row_4.meta.itemIndex, 3);
});

test('the scroll channel moves the window', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({}, channels()), {
    customChannels: { 'channel.scroll.normalized': 1 },
  });
  const parts = snapshot._children.Parts._children;
  // count 12, 4 visible -> last window starts at 8.
  assert.equal(parts.list_row_1.meta.itemIndex, 8);
  assert.equal(parts.list_row_4.meta.itemIndex, 11);
  assert.equal(parts.list_row_4._children.Text.content, 'Item 12');
});

test('row zones carry the virtual item index and select through the target channel', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({}, channels()), {
    customChannels: { 'channel.scroll.normalized': 0.5 }, // window starts at 4
  });
  const zones = snapshot._children.HitZones._children;
  assert.equal(zones.list_rowZone_2.action, 'setValue');
  assert.equal(zones.list_rowZone_2.payload.value, 5);
  assert.equal(zones.list_rowZone_2.targetValueChannel, 'preset');
});

test('the row matching the selection channel renders active', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({}, channels()), {
    customChannels: { 'channel.scroll.normalized': 0, 'channel.preset.raw': 2 },
  });
  const parts = snapshot._children.Parts._children;
  assert.equal(parts.list_row_3.meta.active, true);
  assert.equal(parts.list_row_1.meta.active, false);
});

test('explicit labels/values win over the defaults', () => {
  const snapshot = materializedCustomComponentSnapshot(makeControl({
    count: 3, rows: 3, labels: ['Init', 'Pad', 'Lead'], values: ['init', 'pad', 'lead'],
  }, channels()), {});
  const parts = snapshot._children.Parts._children;
  const zones = snapshot._children.HitZones._children;
  assert.equal(parts.list_row_2._children.Text.content, 'Pad');
  assert.equal(zones.list_rowZone_3.payload.value, 'lead');
});
