import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listboxRows, listboxRowHeight, listboxContentHeight, listboxMaxScroll, listboxRowIndexAtPoint,
  isSelectableRow, listboxRowStride,
} from '../src/CE_Application/utils/listboxLayout.js';

function control(rowCount, { fontSize = 12, padTop = 6 } = {}) {
  return {
    _children: {
      Text: { _children: { Font: { size: fontSize } } },
      ContentLayout: { paddingTop: padTop },
      Value: { rows: Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, internalValue: `v${i}`, displayText: `Row ${i}` })) },
    },
  };
}

test('row height derives from font size with a floor', () => {
  assert.equal(listboxRowHeight(control(3, { fontSize: 12 })), 22);
  assert.equal(listboxRowHeight(control(3, { fontSize: 4 })), 18); // floor
});

test('rows include headers/disabled (indices align); isSelectableRow filters', () => {
  const c = control(3);
  c._children.Value.rows[1].enabled = false;
  c._children.Value.rows[2].isHeader = true;
  assert.equal(listboxRows(c).length, 3); // all rendered
  assert.equal(isSelectableRow(c._children.Value.rows[0]), true);
  assert.equal(isSelectableRow(c._children.Value.rows[1]), false); // disabled
  assert.equal(isSelectableRow(c._children.Value.rows[2]), false); // header
});

test('row height honors explicit rowHeight, density and two-line', () => {
  const c = control(3, { fontSize: 12 });
  assert.equal(listboxRowHeight(c), 22); // auto (comfortable)
  c._children.Listbox = { density: 'compact' };
  assert.equal(listboxRowHeight(c), 18); // 12 + 6
  c._children.Listbox = { rowHeight: 40 };
  assert.equal(listboxRowHeight(c), 40); // explicit
  c._children.Listbox = { twoLine: true };
  assert.equal(listboxRowHeight(c), 22 + Math.round(12 * 0.9) + 2); // + subtitle line
});

test('card rows add a gap to the stride', () => {
  const c = control(3);
  assert.equal(listboxRowStride(c), 22); // no cards
  c._children.Listbox = { cardRows: true };
  assert.equal(listboxRowStride(c), 26); // + 4 gap
});

test('hit-test maps a local point to the right row, honoring scroll', () => {
  const c = control(5); // rowH 22, padTop 6
  assert.equal(listboxRowIndexAtPoint(c, 6, 0), 0);      // top of row 0
  assert.equal(listboxRowIndexAtPoint(c, 6 + 22, 0), 1); // row 1
  assert.equal(listboxRowIndexAtPoint(c, 0, 0), -1);     // above first row
  assert.equal(listboxRowIndexAtPoint(c, 6 + 22 * 5, 0), -1); // below last row
  // scrolled down by one row: a click at row-0 position now lands on row 1
  assert.equal(listboxRowIndexAtPoint(c, 6, 22), 1);
});

test('content height + max scroll', () => {
  const c = control(10); // 10*22 + 6*2 = 232
  assert.equal(listboxContentHeight(c), 232);
  assert.equal(listboxMaxScroll(c, 100), 132);
  assert.equal(listboxMaxScroll(c, 300), 0); // everything fits
});

test('selectableIndices + listboxStep skip headers/disabled', async () => {
  const { selectableIndices, listboxStep, listboxIndexOfValue } = await import('../src/CE_Application/utils/listboxLayout.js');
  const c = { _children: { Text: { _children: { Font: { size: 12 } } }, ContentLayout: {}, Value: { rows: [
    { id: 'h', isHeader: true, displayText: 'H' },
    { id: 'a', internalValue: 'a', displayText: 'A' },
    { id: 'b', internalValue: 'b', displayText: 'B', enabled: false },
    { id: 'c', internalValue: 'c', displayText: 'C' },
  ] } } };
  assert.deepEqual(selectableIndices(c), [1, 3]); // skips header(0) + disabled(2)
  assert.equal(listboxIndexOfValue(c, 'a'), 1);
  assert.equal(listboxStep(c, 1, 1), 3);   // A -> C (skips disabled B)
  assert.equal(listboxStep(c, 3, -1), 1);  // C -> A
  assert.equal(listboxStep(c, 3, 1), 3);   // clamped at last
});

test('listboxScrollIntoView nudges the minimum needed', async () => {
  const { listboxScrollIntoView } = await import('../src/CE_Application/utils/listboxLayout.js');
  // 10 rows, rowH 22, padTop 6 -> content 232; viewport 100.
  const c = { _children: { Text: { _children: { Font: { size: 12 } } }, ContentLayout: { paddingTop: 6 },
    Value: { rows: Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, internalValue: 'v' + i })) } } };
  assert.equal(listboxScrollIntoView(c, 0, 100, 0), 0);      // already visible
  const s8 = listboxScrollIntoView(c, 8, 100, 0);            // row 8 below the fold -> scroll down
  assert.ok(s8 > 0 && s8 <= 132);
  assert.equal(listboxScrollIntoView(c, 0, 100, 50), 6);     // scrolled past row 0 -> back to its top (padTop)
});
