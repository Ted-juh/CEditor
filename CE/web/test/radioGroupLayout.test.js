import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../src/CE_Application/utils/radioGroupLayout.js';

const valueRows = [
  { id: 'off', displayText: 'Off', internalValue: 'off', enabled: true },
  { id: 'lpf', displayText: 'LPF', internalValue: 'lpf', enabled: true },
  { id: 'bpf', displayText: 'BPF', internalValue: 'bpf', enabled: true },
  { id: 'hpf', displayText: 'HPF', internalValue: 'hpf', enabled: true },
];

test('resolveRadioGroupLayout stacks items vertically when orientation is vertical', () => {
  const layout = resolveRadioGroupLayout({
    behavior: { buttonType: 'radio', orientation: 'vertical' },
    valueRows,
    width: 200,
    height: 240,
    gap: 8,
  });

  assert.equal(layout.columns, 1);
  assert.equal(layout.rowCount, 4);
});

test('resolveRadioGroupLayout honors explicit column counts for grid layouts', () => {
  const layout = resolveRadioGroupLayout({
    behavior: { buttonType: 'radio', orientation: 'horizontal', itemColumns: 2 },
    valueRows,
    width: 300,
    height: 120,
    gap: 10,
  });

  assert.equal(layout.columns, 2);
  assert.equal(layout.rowCount, 2);
  assert.equal(layout.items[2]?.rowIndex, 1);
  assert.equal(layout.items[2]?.columnIndex, 0);
});

test('resolveRadioGroupValueAtPoint returns the clicked option key', () => {
  const layout = resolveRadioGroupLayout({
    behavior: { buttonType: 'radio', orientation: 'horizontal', itemColumns: 2 },
    valueRows,
    width: 240,
    height: 100,
    gap: 8,
  });

  const thirdItem = layout.items[2];
  const selectedValue = resolveRadioGroupValueAtPoint(
    layout,
    thirdItem.left + (thirdItem.width / 2),
    thirdItem.top + (thirdItem.height / 2),
  );

  assert.equal(selectedValue, 'bpf');
});
