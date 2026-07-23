import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAMETER_TYPES,
  getBindableComponentPorts,
  getBindingCompatibility,
  getComponentPorts,
} from '../src/CE_Application/models/componentPorts.js';

function makeCustomComponent() {
  return {
    _children: {
      Core: { id: 'custom_1', controlType: 'CustomComponent', name: 'Macro Pad' },
      PublishedProperties: {
        inputs: {
          cutoff: { channel: 'cutoff', label: 'Cutoff', type: 'float', enabled: true },
          mode: { channel: 'mode', label: 'Mode', type: 'enum', enabled: true },
          hidden: { channel: 'hidden', label: 'Hidden', type: 'float', enabled: false },
        },
        outputs: {
          cutoff: { channel: 'cutoff', label: 'Cutoff', type: 'float', enabled: true },
        },
      },
    },
  };
}

test('custom component ports are derived from published inputs and outputs', () => {
  const ports = getComponentPorts(makeCustomComponent());
  assert.deepEqual(
    ports.map((port) => [port.id, port.label, port.direction]),
    [
      ['cutoff', 'Cutoff', 'input'],
      ['mode', 'Mode', 'input'],
      ['out:cutoff', 'Cutoff Out', 'output'],
    ],
  );
});

test('custom component device binding compatibility uses published input ports', () => {
  const control = makeCustomComponent();
  const bindablePorts = getBindableComponentPorts(control);
  assert.deepEqual(bindablePorts.map((port) => port.id), ['cutoff', 'mode']);

  const numeric = getBindingCompatibility(control, { type: PARAMETER_TYPES.FLOAT });
  assert.equal(numeric.status, 'compatible');
  assert.equal(numeric.port.id, 'cutoff');

  const choice = getBindingCompatibility(control, { type: PARAMETER_TYPES.CHOICE });
  assert.equal(choice.status, 'compatible');
  assert.equal(choice.port.id, 'mode');
});


test('display components expose text/brightness/backlight binding ports', () => {
  const lcd = getComponentPorts({ _children: { Core: { controlType: 'LcdDisplay' } } });
  const lcdIds = lcd.map((p) => p.id);
  assert.deepEqual(lcdIds, ['text', 'value', 'brightness', 'backlight']);

  const pixel = getComponentPorts({ _children: { Core: { controlType: 'PixelDisplay' } } });
  const pixelIds = pixel.map((p) => p.id);
  assert.deepEqual(pixelIds, ['value', 'text', 'brightness', 'backlight']);

  // Backlight accepts a boolean-ish device parameter on both.
  for (const control of [
    { _children: { Core: { controlType: 'LcdDisplay' } } },
    { _children: { Core: { controlType: 'PixelDisplay' } } },
  ]) {
    const compat = getBindingCompatibility(control, { type: PARAMETER_TYPES.BOOLEAN });
    assert.equal(compat.status, 'compatible', 'boolean binds to a display port');
  }
});
