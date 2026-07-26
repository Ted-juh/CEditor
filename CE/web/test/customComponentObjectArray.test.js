import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createArpPatternChannel,
  createArrayChannel,
  createValueChannel,
} from '../src/CE_Application/utils/customComponentFactory.js';
import {
  arrayChannelItems,
  isObjectArrayChannel,
  seedCustomValues,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from '../src/CE_Application/utils/customComponentArpeggiator.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

test('object-item array channels clamp per field and pass extra keys through', () => {
  const channel = createArrayChannel('points', {
    itemFields: {
      x: { min: 0, max: 100, step: 1, default: 0 },
      y: { min: 0, max: 1, default: 0.5 },
    },
    size: 8,
  });
  assert.equal(isObjectArrayChannel(channel), true);
  const items = arrayChannelItems(channel, [
    { id: 'p1', x: 150, y: -2 },
    { x: 33.4 },
  ]);
  assert.equal(items.length, 2); // variable length, not padded
  assert.deepEqual(items[0], { x: 100, y: 0, id: 'p1' });
  assert.equal(items[1].x, 33); // stepped to 1
  assert.equal(items[1].y, 0.5); // field default
});

test('object arrays cap at size instead of padding', () => {
  const channel = createArrayChannel('points', { itemFields: { v: { min: 0, max: 1 } }, size: 2 });
  const items = arrayChannelItems(channel, [{ v: 0 }, { v: 1 }, { v: 0.5 }]);
  assert.equal(items.length, 2);
});

function arpControl() {
  return {
    _children: {
      Core: { _type: 'Core', id: 'c1', controlType: 'CustomComponent' },
      ValueChannels: {
        _type: 'ValueChannels',
        _children: {
          arpCurrentStep: createValueChannel('arpCurrentStep', { type: 'int', min: 0, max: 31, step: 1, defaultValue: 0 }),
          arpNote: createValueChannel('arpNote', { type: 'int', min: 0, max: 127, step: 1, defaultValue: 60 }),
          arpVelocity: createValueChannel('arpVelocity', { type: 'int', min: 0, max: 127, step: 1, defaultValue: 0 }),
          arpGate: createValueChannel('arpGate', { type: 'bool', defaultValue: false }),
          arpPattern: createArpPatternChannel(),
        },
      },
      Parts: { _type: 'Parts', _children: {} },
      Designer: {
        _type: 'Designer',
        arpeggiator: {
          enabled: true,
          stepCount: 32,
          viewNote: 60,
          blocks: [
            { id: 'b1', note: 64, step: 0, length: 2, velocity: 100 },
            { id: 'b2', note: 67, step: 4, length: 1, velocity: 80 },
          ],
        },
      },
    },
  };
}

test('the arp pattern publishes through the arpPattern channel on sync', () => {
  const control = arpControl();
  const values = syncCustomArpeggiatorValues(control, seedCustomValues(control));
  assert.equal(Array.isArray(values.arpPattern), true);
  assert.equal(values.arpPattern.length, 2);
  assert.deepEqual(values.arpPattern[0], { id: 'b1', note: 64, step: 0, length: 2, velocity: 100 });
  // Scalar derivations still work alongside.
  assert.equal(values.arpNote, 64);
  assert.equal(values.arpGate, true);
});

test('channel signals expose the pattern items and count', () => {
  const control = arpControl();
  const resolved = resolveInteractiveControl(control, { customValues: {} });
  const signals = resolved.runtime.signals;
  assert.equal(signals.customChannels['channel.arpPattern.count'], 2);
  assert.equal(signals.customChannels['channel.arpPattern.items'][1].note, 67);
  // Object items get raw per-index signals but no bogus scalar normalization.
  assert.equal(signals.customChannels['channel.arpPattern.1.raw'].note, 67);
  assert.equal('channel.arpPattern.1.normalized' in signals.customChannels, false);
});

test('the arpPattern channel is output-only by design (write side deferred)', () => {
  const channel = createArpPatternChannel();
  assert.equal(channel.publicInput, false);
  assert.equal(channel.publicOutput, true);
  assert.deepEqual(Object.keys(channel.itemFields), ['note', 'step', 'length', 'velocity']);
});
