import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCustomNormalizedFromPoint,
  resetCustomChannelToDefault,
} from '../src/CE_Application/utils/customComponentInteraction.js';

const RECT = { left: 0, top: 0, width: 200, height: 200 };

// Drag context: grabbed at the vertical center with the value at 0.5.
function dragFromCenter(extra = {}) {
  return { startClientX: 100, startClientY: 100, startNormalized: 0.5, ...extra };
}

test('dials support relative (vertical) drag from the grab point', () => {
  const dial = { geometry: 'circular', dragMode: 'relative', dragSensitivity: 1 };
  // Drag up 50px on a 200px control => +0.25 from 0.5 => 0.75.
  const up = resolveCustomNormalizedFromPoint(dial, RECT, 100, 50, dragFromCenter());
  assert.ok(Math.abs(up - 0.75) < 1e-9, `expected 0.75, got ${up}`);
  // Drag down 50px => -0.25 => 0.25.
  const down = resolveCustomNormalizedFromPoint(dial, RECT, 100, 150, dragFromCenter());
  assert.ok(Math.abs(down - 0.25) < 1e-9, `expected 0.25, got ${down}`);
});

test('fine-drag modifier scales the movement down', () => {
  const dial = { geometry: 'circular', dragMode: 'relative', dragSensitivity: 1 };
  // Same 50px-up drag, but fine: +0.25 * 0.25 = +0.0625 => 0.5625.
  const fine = resolveCustomNormalizedFromPoint(dial, RECT, 100, 50, dragFromCenter({ fine: true }));
  assert.ok(Math.abs(fine - 0.5625) < 1e-9, `expected 0.5625, got ${fine}`);
});

test('circular absolute drag still works when no relative mode is set', () => {
  const dial = { geometry: 'circular', dragMode: 'auto' };
  // No drag context => absolute angle path; value is finite and in range.
  const value = resolveCustomNormalizedFromPoint(dial, RECT, 180, 100, null);
  assert.ok(value >= 0 && value <= 1);
});

function controlWith(channels) {
  return { _children: { ValueChannels: { _type: 'ValueChannels', _children: channels } } };
}

test('resetCustomChannelToDefault restores a channel default', () => {
  const control = controlWith({
    cutoff: { type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.3, currentValue: 0.3 },
  });
  const next = resetCustomChannelToDefault(control, 'cutoff', { cutoff: 0.9 });
  assert.equal(next.cutoff, 0.3);
});

test('resetCustomChannelToDefault handles multiple channels and ignores unknowns', () => {
  const control = controlWith({
    x: { type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5, currentValue: 0.5 },
    y: { type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.1, currentValue: 0.1 },
  });
  const next = resetCustomChannelToDefault(control, ['x', 'y', 'ghost'], { x: 1, y: 1 });
  assert.equal(next.x, 0.5);
  assert.equal(next.y, 0.1);
});
