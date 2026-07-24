import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matrixRows, matrixCols, matrixAmounts, matrixAmountAt, matrixSetAmount,
  matrixGeometry, matrixCellRect, matrixCellAtPoint, matrixAmountFromDrag,
  matrixCellPortId, parseMatrixCellPort, matrixPorts, matrixPortValues,
} from '../src/CE_Application/utils/matrixLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function mtx(matrix) { return { _children: { Core: { controlType: 'Matrix' }, Matrix: matrix } }; }

const M = mtx({
  rows: ['LFO1', 'ENV'], cols: ['Pitch', 'Cutoff', 'Amp'],
  amounts: [0.5, -0.25, 0, 0, 1, -1], bipolar: true,
});

test('rows/cols + amounts default and clamp', () => {
  assert.deepEqual(matrixRows(M), ['LFO1', 'ENV']);
  assert.deepEqual(matrixCols(M), ['Pitch', 'Cutoff', 'Amp']);
  assert.equal(matrixAmounts(M).length, 6);
  assert.equal(matrixAmountAt(M, 0, 0), 0.5);
  assert.equal(matrixAmountAt(M, 1, 2), -1);
  // Missing/short arrays fill with 0.
  assert.deepEqual(matrixAmounts(mtx({ rows: ['a'], cols: ['x', 'y'] })), [0, 0]);
});

test('setAmount clamps to the polarity', () => {
  assert.equal(matrixSetAmount(M, 0, 1, 2)[1], 1);      // clamp +1
  assert.equal(matrixSetAmount(M, 0, 1, -3)[1], -1);    // bipolar clamp -1
  const uni = mtx({ rows: ['a'], cols: ['x'], bipolar: false });
  assert.equal(matrixSetAmount(uni, 0, 0, -0.5)[0], 0); // unipolar floor 0
});

test('geometry reserves label headers + tiles cells evenly', () => {
  const g = matrixGeometry(200, 100, mtx({ rows: ['a', 'b'], cols: ['x', 'y'], rowHeaderW: 40, colHeaderH: 20 }));
  assert.equal(g.headerW, 40);
  assert.equal(g.headerH, 20);
  assert.ok(near(g.cellW, (200 - 40) / 2));
  assert.ok(near(g.cellH, (100 - 20) / 2));
  const rect = matrixCellRect(1, 1, g);
  assert.ok(near(rect.x, 40 + g.cellW) && near(rect.y, 20 + g.cellH));
});

test('cell hit-test ignores headers + out-of-range', () => {
  const g = matrixGeometry(200, 100, mtx({ rows: ['a', 'b'], cols: ['x', 'y'], rowHeaderW: 40, colHeaderH: 20 }));
  assert.deepEqual(matrixCellAtPoint(g, 41, 21), { r: 0, c: 0 });
  assert.deepEqual(matrixCellAtPoint(g, 199, 99), { r: 1, c: 1 });
  assert.equal(matrixCellAtPoint(g, 10, 50), null);  // in the row-label header
  assert.equal(matrixCellAtPoint(g, 100, 5), null);  // in the col-label header
});

test('drag up increases, snaps, clamps by polarity', () => {
  const cellH = 40;
  // Drag up 10px (dy = -10): 0 - (-10/40)*2 = +0.5 (bipolar range 2, per = 40).
  assert.ok(near(matrixAmountFromDrag(0, -10, cellH, M), 0.5));
  assert.equal(matrixAmountFromDrag(0.9, -100, cellH, M), 1);   // clamp +1
  assert.equal(matrixAmountFromDrag(-0.9, 100, cellH, M), -1);  // clamp -1
  const snapped = matrixAmountFromDrag(0, -18, cellH, mtx({ rows: ['a'], cols: ['x'], step: 0.25 }));
  assert.ok(near(snapped % 0.25, 0)); // snapped to the step grid
});

test('cell ports: id scheme + parse + dynamic port list + fan-out values', () => {
  assert.equal(matrixCellPortId(1, 2), 'cell_1_2');
  assert.deepEqual(parseMatrixCellPort('cell_1_2'), { r: 1, c: 2 });
  assert.equal(parseMatrixCellPort('nope'), null);
  const ports = matrixPorts(M);
  assert.equal(ports.length, 6);                       // 2 rows × 3 cols
  assert.equal(ports[0].id, 'cell_0_0');
  assert.equal(ports[0].label, 'LFO1 → Pitch');
  const vals = matrixPortValues(M);
  assert.equal(vals.cell_0_0, 0.5);
  assert.equal(vals.cell_1_2, -1);
  assert.equal(Object.keys(vals).length, 6);
});
