import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveExportParameters, normalizeExportParameter, choiceIndexOf, choiceValueAt,
} from '../src/CE_Application/utils/exportParameters.js';

function combobox(name, rows, { storeByValue = false } = {}) {
  return {
    _children: {
      Core: { id: name, name },
      Behavior: { family: 'select', valueType: 'enum', buttonType: 'combobox' },
      Value: { rows, storeByValue },
    },
  };
}

const ROWS = [
  { id: 'r0', internalValue: 'kick', displayText: 'Kick' },
  { id: 'r1', internalValue: 'snare', displayText: 'Snare', selectedByDefault: true },
  { id: 'h', displayText: 'SYNTHS', isHeader: true },
  { id: 'r2', internalValue: 'saw', displayText: 'Saw' },
];

test('index mode (default) exports a bare numeric parameter', () => {
  const [p] = deriveExportParameters({ controls: [combobox('preset', ROWS)] });
  assert.equal(p.id, 'preset.value');
  assert.equal(p.min, 0);
  assert.equal(p.max, 2);                 // 3 pickable rows -> 0..2 (header skipped)
  assert.equal(p.defaultValue, 1);        // Snare is selectedByDefault (index 1)
  assert.equal(p.choiceMode, undefined);  // no named-choice metadata
});

test('store-by-name mode attaches the fixed choice names + default', () => {
  const [p] = deriveExportParameters({ controls: [combobox('preset', ROWS, { storeByValue: true })] });
  assert.equal(p.choiceMode, 'value');
  assert.deepEqual(p.choiceValues, ['kick', 'snare', 'saw']); // headers dropped, order fixed
  assert.deepEqual(p.choiceLabels, ['Kick', 'Snare', 'Saw']);
  assert.equal(p.defaultChoice, 'snare');
  assert.equal(p.min, 0);
  assert.equal(p.max, 2);                 // numeric APVTS contract kept alongside
});

test('choiceIndexOf / choiceValueAt round-trip a name over the fixed list', () => {
  const [p] = deriveExportParameters({ controls: [combobox('preset', ROWS, { storeByValue: true })] });
  assert.equal(choiceIndexOf(p, 'saw'), 2);      // name -> fixed host index
  assert.equal(choiceIndexOf(p, 'kick'), 0);
  assert.equal(choiceIndexOf(p, 'missing'), null); // unknown value -> skip
  assert.equal(choiceValueAt(p, 2), 'saw');      // host index -> name
  assert.equal(choiceValueAt(p, 0), 'kick');
  assert.equal(choiceValueAt(p, 99), 'saw');     // clamped into range
  // Index params carry no choice mapping.
  const [idx] = deriveExportParameters({ controls: [combobox('p2', ROWS)] });
  assert.equal(choiceIndexOf(idx, 'saw'), null);
  assert.equal(choiceValueAt(idx, 1), null);
});

test('the fixed index is stable regardless of which rows are visible', () => {
  // The exported list is the FULL authored set, so "saw" is always index 2 even
  // when a cascading parent would hide kick/snare in the live view.
  const [p] = deriveExportParameters({ controls: [combobox('preset', ROWS, { storeByValue: true })] });
  assert.equal(choiceIndexOf(p, 'saw'), 2);
  assert.equal(choiceValueAt(p, choiceIndexOf(p, 'saw')), 'saw'); // full round-trip
});

test('normalizeExportParameter preserves author-provided choice metadata', () => {
  const n = normalizeExportParameter({
    id: 'x.value', path: 'x.value', min: 0, max: 2,
    choiceMode: 'value', choiceValues: ['a', 'b', 'c'], defaultChoice: 'b',
  });
  assert.equal(n.choiceMode, 'value');
  assert.deepEqual(n.choiceValues, ['a', 'b', 'c']);
  assert.equal(n.defaultChoice, 'b');
  // Index params get nothing extra.
  const idx = normalizeExportParameter({ id: 'y.value', path: 'y.value' });
  assert.equal(idx.choiceMode, undefined);
});
