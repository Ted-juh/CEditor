import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCustomBindings } from '../src/CE_Application/utils/interactionRuntime.js';

// Build a minimal CustomComponent-shaped control with one part and a Bindings
// section, so we can assert applyCustomBindings writes the mapped value to the
// target property path given live signals.
function makeControl(binding, layout = { x: 0 }) {
  return {
    _children: {
      Bindings: { enabled: true, _children: { B: binding } },
      Parts: { _children: { box: { _children: { Layout: { ...layout } } } } },
    },
  };
}

test('range binding maps a channel value into the target property', () => {
  const control = makeControl({
    enabled: true,
    source: 'channel.pos.normalized',
    target: 'Parts.box.Layout.x',
    mapMode: 'range',
    inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 100,
  });
  applyCustomBindings(control, { customChannels: { 'channel.pos.normalized': 0.5 } });
  assert.equal(control._children.Parts._children.box._children.Layout.x, 50);
});

test('range binding clamps and rounds when requested', () => {
  const control = makeControl({
    enabled: true,
    source: 'channel.pos.normalized',
    target: 'Parts.box.Layout.x',
    mapMode: 'range',
    inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 10,
    clamp: true, round: true,
  });
  applyCustomBindings(control, { customChannels: { 'channel.pos.normalized': 2 } });
  assert.equal(control._children.Parts._children.box._children.Layout.x, 10);
});

test('boolean binding picks true/false outputs', () => {
  const onControl = makeControl({
    enabled: true, source: 'state.hover', target: 'Parts.box.Layout.x',
    mapMode: 'boolean', trueValue: 1, falseValue: 0,
  });
  applyCustomBindings(onControl, { hover: true });
  assert.equal(onControl._children.Parts._children.box._children.Layout.x, 1);

  const offControl = makeControl({
    enabled: true, source: 'state.hover', target: 'Parts.box.Layout.x',
    mapMode: 'boolean', trueValue: 1, falseValue: 0,
  });
  applyCustomBindings(offControl, { hover: false });
  assert.equal(offControl._children.Parts._children.box._children.Layout.x, 0);
});

test('enum binding looks up the mapped output', () => {
  const control = makeControl({
    enabled: true, source: 'value.enum', target: 'Parts.box.Layout.x',
    mapMode: 'enum', enumMap: { a: 11, b: 22 },
  });
  applyCustomBindings(control, { valueEnum: 'b' });
  assert.equal(control._children.Parts._children.box._children.Layout.x, 22);
});

test('disabled bindings (or section) are skipped', () => {
  const control = makeControl({
    enabled: false, source: 'channel.pos.normalized', target: 'Parts.box.Layout.x',
    mapMode: 'direct',
  }, { x: 7 });
  applyCustomBindings(control, { customChannels: { 'channel.pos.normalized': 99 } });
  assert.equal(control._children.Parts._children.box._children.Layout.x, 7);

  const sectionOff = makeControl({
    enabled: true, source: 'channel.pos.normalized', target: 'Parts.box.Layout.x',
    mapMode: 'direct',
  }, { x: 7 });
  sectionOff._children.Bindings.enabled = false;
  applyCustomBindings(sectionOff, { customChannels: { 'channel.pos.normalized': 99 } });
  assert.equal(sectionOff._children.Parts._children.box._children.Layout.x, 7);
});
