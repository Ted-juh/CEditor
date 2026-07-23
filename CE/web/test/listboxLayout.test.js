import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listboxRows, listboxRowHeight, listboxContentHeight, listboxMaxScroll, listboxRowIndexAtPoint,
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

test('disabled rows are excluded', () => {
  const c = control(3);
  c._children.Value.rows[1].enabled = false;
  assert.equal(listboxRows(c).length, 2);
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
