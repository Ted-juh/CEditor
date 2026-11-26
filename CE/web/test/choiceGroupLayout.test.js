// choiceGroupLayout.test.js — a choice group's options: style, choice, keys and layout
// (src/CE_Application/utils/choiceGroupLayout.js, docs/design/choice-group.md).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  choiceGroupLayout,
  choiceKeyAtPoint,
  choiceSelection,
  choiceStyleDrawsFrame,
  choiceStyleOf,
  choiceStyleOnPanel,
  isOptionState,
  measureChoiceLabel,
  selectedChoiceKeys,
  stepChoice,
} from '../src/CE_Application/utils/choiceGroupLayout.js';

const rows = (...labels) => labels.map((label) => ({ id: label.toLowerCase(), displayText: label, internalValue: label.toLowerCase(), enabled: true }));
const filters = rows('Off', 'LPF', 'BPF', 'HPF');
const widthsOf = (labels, size = 11) => labels.map((row) => measureChoiceLabel(row.displayText, { fontSize: size }));

test('a group draws in its own style, its subtype when it has none, and segmented for anything else', () => {
  assert.equal(choiceStyleOf({ visualStyle: 'led' }), 'led');
  assert.equal(choiceStyleOf({ subtype: 'radio' }), 'radio');
  assert.equal(choiceStyleOf({ visualStyle: '', subtype: 'tab' }), 'segmented', 'an empty style is a style, not an absence');
  assert.equal(choiceStyleOf({ visualStyle: 'pill' }), 'segmented');
  assert.equal(choiceStyleOf(null), 'segmented');
  assert.deepEqual(['segmented', 'buttons', 'radio', 'led', 'tab'].map(choiceStyleDrawsFrame), [true, false, false, false, false]);
  assert.deepEqual(['segmented', 'buttons', 'radio', 'led', 'tab'].map(choiceStyleOnPanel), [false, false, true, true, true]);
});

test('a state is an option\'s when its condition reads hover, pressed, focused or checked', () => {
  assert.equal(isOptionState({ when: { hover: true } }), true);
  assert.equal(isOptionState({ when: { checked: true, disabled: false } }), true);
  assert.equal(isOptionState({ when: { disabled: true } }), false);
  assert.equal(isOptionState({ rule: 'value > 1' }), false);
});

test('the chosen keys before any click: the default rows, the default value, the first row; a switched-off row is never one', () => {
  assert.deepEqual([...selectedChoiceKeys(filters, {})], ['off']);
  assert.deepEqual([...selectedChoiceKeys(filters, { defaultValue: 'bpf' })], ['bpf']);
  const marked = filters.map((row) => ({ ...row, selectedByDefault: row.id === 'lpf' || row.id === 'hpf' }));
  assert.deepEqual([...selectedChoiceKeys(marked, {})], ['lpf'], 'single: the first marked one');
  assert.deepEqual([...selectedChoiceKeys(marked, { selectionMode: 'multi' })], ['lpf', 'hpf']);
  assert.deepEqual([...selectedChoiceKeys(filters, {}, { forceRowIds: ['hpf'] })], ['hpf'], 'the Segments tab previewing the chosen look');
  assert.deepEqual([...selectedChoiceKeys([{ ...filters[0], enabled: false }, ...filters.slice(1)], {})], ['lpf']);
});

test('an activation chooses, toggles in multi-select, and clears only where deselecting is allowed; a gap chooses nothing', () => {
  const multi = { selectionMode: 'multi', allowDeselect: true };
  assert.deepEqual(choiceSelection({ behavior: multi, valueRows: filters, selectedValues: ['lpf'], requestedValue: 'hpf' }), { matched: true, value: ['lpf', 'hpf'] });
  assert.deepEqual(choiceSelection({ behavior: multi, valueRows: filters, selectedValues: ['lpf', 'hpf'], requestedValue: 'lpf' }), { matched: true, value: ['hpf'] });
  assert.deepEqual(choiceSelection({ behavior: { allowDeselect: true }, valueRows: filters, selectedValues: ['bpf'], requestedValue: 'bpf' }), { matched: true, value: '' });
  assert.deepEqual(choiceSelection({ behavior: {}, valueRows: filters, selectedValues: ['bpf'], requestedValue: 'bpf' }), { matched: true, value: 'bpf' });
  assert.deepEqual(choiceSelection({ behavior: {}, valueRows: filters, selectedValues: ['off'], requestedValue: '' }), { matched: false, value: undefined });
});

test('the arrows step to the neighbour either way the group runs and wrap; Home and End go to the ends', () => {
  assert.equal(stepChoice(filters, 'lpf', 'ArrowRight'), 'bpf');
  assert.equal(stepChoice(filters, 'lpf', 'ArrowDown'), 'bpf');
  assert.equal(stepChoice(filters, 'lpf', 'ArrowLeft'), 'off');
  assert.equal(stepChoice(filters, 'lpf', 'ArrowUp'), 'off');
  assert.equal(stepChoice(filters, 'hpf', 'ArrowRight'), 'off', 'wraps forward');
  assert.equal(stepChoice(filters, 'off', 'ArrowLeft'), 'hpf', 'wraps back');
  assert.equal(stepChoice(filters, 'bpf', 'Home'), 'off');
  assert.equal(stepChoice(filters, 'bpf', 'End'), 'hpf');
  assert.equal(stepChoice(filters, '', 'ArrowRight'), 'off', 'nothing focused: the first');
  assert.equal(stepChoice(filters, 'bpf', 'a'), null);
  assert.equal(stepChoice([], 'x', 'ArrowRight'), null);
});

test('options share a strip equally while every label fits, and in proportion once one does not', () => {
  const box = { style: 'segmented', behavior: {}, height: 30, padding: { top: 2, right: 2, bottom: 2, left: 2 } };
  const equal = choiceGroupLayout({ ...box, valueRows: filters, width: 300, labelWidths: widthsOf(filters) });
  assert.equal(new Set(equal.items.map((item) => item.width.toFixed(3))).size, 1, 'four short labels: one width');
  assert.ok(Math.abs(equal.items.at(-1).left + equal.items.at(-1).width - 298) < 1e-9, 'to the inset');

  const waves = rows('Saw', 'Square', 'Triangle with sync');
  const fitted = choiceGroupLayout({ ...box, valueRows: waves, width: 240, labelWidths: widthsOf(waves) });
  const [saw, , long] = fitted.items;
  assert.ok(long.width > saw.width * 1.8, `the long label gets the room: ${saw.width} vs ${long.width}`);
  assert.ok(Math.abs(fitted.items.reduce((sum, item) => sum + item.width, 0) - 236) < 1e-9, 'and the strip is filled');

  const forcedEqual = choiceGroupLayout({ ...box, behavior: { optionSizing: 'equal' }, valueRows: waves, width: 240, labelWidths: widthsOf(waves) });
  assert.equal(new Set(forcedEqual.items.map((item) => item.width.toFixed(3))).size, 1);
  const forcedFit = choiceGroupLayout({ ...box, behavior: { optionSizing: 'fit' }, valueRows: filters, width: 300, labelWidths: [10, 10, 10, 60] });
  assert.ok(forcedFit.items[3].width > forcedFit.items[0].width);
});

test('a two-way switch at 110 x 28 has room for both its labels, which the old layout cut to "O.."', () => {
  const offOn = rows('Off', 'On');
  for (const style of ['segmented', 'buttons', 'radio', 'led']) {
    const indicator = style === 'radio' ? 13 : style === 'led' ? 9 : 0;
    const layout = choiceGroupLayout({ style, behavior: {}, valueRows: offOn, width: 110, height: 28, padding: { top: 2, right: 2, bottom: 2, left: 2 }, gap: 4, labelWidths: widthsOf(offOn), indicator });
    for (const [index, item] of layout.items.entries()) {
      const needs = widthsOf(offOn)[index] + (indicator ? indicator + 6 : 0);
      assert.ok(item.width - 2 * item.padX >= needs, `${style}: ${item.key} needs ${needs}, has ${item.width - 2 * item.padX}`);
    }
  }
});

test('padding shrinks before a label is cut, but never below three px', () => {
  const layout = choiceGroupLayout({ style: 'segmented', behavior: {}, valueRows: rows('One', 'Two'), width: 60, height: 24, labelWidths: [24, 24] });
  assert.ok(layout.items[0].padX < 10 && layout.items[0].padX >= 3, `padX ${layout.items[0].padX}`);
  const tight = choiceGroupLayout({ style: 'segmented', behavior: {}, valueRows: rows('One', 'Two'), width: 20, height: 24, labelWidths: [24, 24] });
  assert.equal(tight.items[0].padX, 3);
});

test('a strip and a tab row touch; keys, rings and lamps are spaced by the gap', () => {
  const at = (style) => choiceGroupLayout({ style, behavior: {}, valueRows: filters, width: 300, height: 30, gap: 6, labelWidths: [20, 20, 20, 20] }).items;
  for (const style of ['segmented', 'tab']) {
    const items = at(style);
    assert.equal(items[1].left, items[0].left + items[0].width, `${style} touches`);
  }
  for (const style of ['buttons', 'radio', 'led']) {
    const items = at(style);
    assert.ok(Math.abs(items[1].left - (items[0].left + items[0].width) - 6) < 1e-9, `${style} keeps the gap`);
  }
});

test('vertical groups stack; a column count makes a grid; dividers part neighbours in a strip only', () => {
  const vertical = choiceGroupLayout({ style: 'led', behavior: { orientation: 'vertical' }, valueRows: filters, width: 100, height: 100, gap: 0, labelWidths: [20, 20, 20, 20] });
  assert.equal(vertical.columns, 1);
  assert.deepEqual(vertical.items.map((item) => item.top), [0, 25, 50, 75]);

  const grid = choiceGroupLayout({ style: 'segmented', behavior: { itemColumns: 2 }, valueRows: filters, width: 200, height: 60, labelWidths: [20, 20, 20, 20] });
  assert.deepEqual([grid.columns, grid.rowCount], [2, 2]);
  assert.deepEqual(grid.items.map((item) => [item.column, item.line]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(grid.dividers.map((divider) => divider.between.join('|')).sort(), ['bpf|hpf', 'lpf|hpf', 'off|bpf', 'off|lpf'].sort());

  const strip = choiceGroupLayout({ style: 'segmented', behavior: {}, valueRows: filters, width: 200, height: 30, labelWidths: [20, 20, 20, 20] });
  assert.equal(strip.dividers.length, 3);
  assert.equal(strip.dividers[0].x1, strip.items[0].left + strip.items[0].width);
  assert.equal(choiceGroupLayout({ style: 'buttons', behavior: {}, valueRows: filters, width: 200, height: 30, labelWidths: [20, 20, 20, 20] }).dividers.length, 0);
});

test('a click finds the drawn option under it by the options\' own layout boxes', () => {
  const option = (key, left, width) => ({ offsetLeft: left, offsetTop: 2, offsetWidth: width, offsetHeight: 26, dataset: { choiceKey: key } });
  const element = { querySelectorAll: () => [option('off', 2, 50), option('on', 52, 50)] };
  assert.equal(choiceKeyAtPoint(element, 10, 10), 'off');
  assert.equal(choiceKeyAtPoint(element, 60, 10), 'on');
  assert.equal(choiceKeyAtPoint(element, 120, 10), '', 'off the options');
  assert.equal(choiceKeyAtPoint(null, 10, 10), '');
});
