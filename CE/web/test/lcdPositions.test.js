// lcdPositions.test.js — where on an LCD a script writes, clears and reads: a row number, or a table
// of layout, row and col, each optional, row and col also a range. The owner's model:
// docs/design/api-descriptions-handoff.md, "The LCD's script model".

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  lcdPosition, lcdWriteAt, lcdClearAt, lcdReadAt, lcdShownLayout, lcdLayoutIndex, lcdPositionWords,
} from '../src/CE_Application/scripting/lcdPositions.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { provideDisplayLayouts } from '../src/CE_Application/stores/displayLayouts.js';

/** A 2 x 16 display without layouts, and one with two: Home (the default) and Edit. */
const PLAIN = { rows: 2, cols: 16, lines: ['PATCH 12', 'VOL 100'] };
const PAGED = {
  rows: 2, cols: 16, lines: ['NEVER SHOWN', ''],
  layouts: [
    { id: 'home', name: 'Home', lines: ['HOME ROW ONE', 'HOME ROW TWO'], zones: [] },
    { id: 'edit', name: 'Edit', zones: [] },
  ],
  pages: { defaultLayoutId: 'home' },
};

test('a row number is a row of the layout showing, as text() always took one', () => {
  assert.deepEqual(lcdWriteAt(PLAIN, 2, 'VOL 99').patch, { lines: ['PATCH 12', 'VOL 99'] });
  assert.deepEqual(lcdWriteAt(PAGED, 1, 'HI').patch.layouts[0].lines, ['HI', 'HOME ROW TWO']);
  // The layout showing is what the runtime puts in __page, as the preview does for the renderer.
  const onEdit = { ...PAGED, __page: { activeLayoutId: 'edit' } };
  assert.equal(lcdShownLayout(onEdit), 1);
  assert.deepEqual(lcdWriteAt(onEdit, 2, 'MENU').patch.layouts[1].lines, ['', 'MENU']);
  assert.equal(lcdWriteAt(PLAIN, 3, 'X').refusal, 'There is no row 3: the rows are 1 to 2.');
  assert.equal(lcdWriteAt(PLAIN, 1.5, 'X').patch.lines[1], 'X', 'a fraction rounds');
});

test('a table names the layout, the row and the column; every part is optional', () => {
  assert.deepEqual(lcdWriteAt(PAGED, { layout: 2, row: 1 }, 'EDIT').patch.layouts[1].lines, ['EDIT', '']);
  assert.deepEqual(lcdWriteAt(PAGED, { layout: 'edit', row: 2 }, 'X').patch.layouts[1].lines, ['', 'X'], 'a name, in any case');
  assert.deepEqual(lcdWriteAt(PAGED, { LAYOUT: 'Edit', Row: 1 }, 'Y').patch.layouts[1].lines, ['Y', ''], 'the parts in any case');
  assert.deepEqual(lcdWriteAt(PAGED, { row: 2 }, 'Z').patch.layouts[0].lines, ['HOME ROW ONE', 'Z'], 'no layout: the one showing');
  assert.deepEqual(lcdWriteAt(PLAIN, { layout: 1, row: 1 }, 'ONE').patch, { lines: ['ONE', 'VOL 100'] }, 'a display without layouts has one');
  assert.equal(lcdLayoutIndex(PAGED, '2').index, 1, 'a number written as text, when no layout has that name');
});

test('a column writes from there on and keeps the rest; a range writes into it, padded or cut', () => {
  assert.equal(lcdWriteAt(PLAIN, { row: 1, col: 7 }, '99').line, 'PATCH 99');
  assert.equal(lcdWriteAt(PLAIN, { row: 2, col: 12 }, 'X').line, 'VOL 100    X', 'past the end of what was written: blanks between');
  assert.equal(lcdWriteAt(PLAIN, { row: 1, col: [1, 5] }, 'AB').line, 'AB    12');
  assert.equal(lcdWriteAt(PLAIN, { row: 1, col: { 1: 1, 2: 3 } }, 'ABCDE').line, 'ABCCH 12', 'a Lua list over wasmoon, cut at its end');
  const past = lcdWriteAt(PLAIN, { row: 1, col: [14, 40] }, 'XYZW');
  assert.equal(past.line, 'PATCH 12     XYZ');
  assert.equal(past.clamped, 'Columns 14 to 40: the display has 16, so 14 to 16 were used.');
});

test('what a position cannot mean is refused with why', () => {
  const why = (where, text = 'X') => lcdWriteAt(PAGED, where, text).refusal;
  assert.equal(why({ pg: 2, row: 1 }), '"pg" is not part of a position: one of "layout", "row" or "col".');
  assert.equal(why({ row: 1, col: 5, 1: 10 }), '10 is in the position without a name: a range is written col = {5, 10}.');
  assert.equal(why({ row: 1, col: [5] }), 'A range is two numbers, the first column and the last: col = {5, 10}.');
  assert.equal(why({ row: 1, col: [10, 5] }), 'Columns 10 to 5 run backwards: write {5, 10}.');
  assert.equal(why({ row: 1, col: [0, 5] }), 'There is no column 0: the columns are 1 to 16.');
  assert.equal(why({ row: 1, col: 17 }), 'There is no column 17: the columns are 1 to 16.');
  assert.equal(why({ layout: 3, row: 1 }), 'There is no layout 3: the layouts are 1 to 2.');
  assert.equal(why({ layout: 'Edt', row: 1 }), 'There is no layout "Edt". One of: "Home", "Edit".');
  assert.equal(lcdWriteAt(PLAIN, { layout: 2, row: 1 }, 'X').refusal, 'There is no layout 2: this display has one, its lines.');
  assert.equal(why({ row: 1, row_: 2 }), '"row_" is not part of a position: one of "layout", "row" or "col".');
  assert.equal(why({ row: 1, ROW: 2 }), '"row" is given twice.');
  assert.equal(why({ layout: 2 }), 'A row is needed: text writes one row.');
  assert.equal(why({ row: [1, 2] }), 'text writes one row, not rows 1 to 2.');
  assert.equal(why([1, 2]), 'A position names its parts: {row = 2, col = 5}.');
  assert.equal(lcdWriteAt(PAGED, 1, undefined).refusal, 'No text was given.');
  assert.equal(lcdPosition(PAGED, undefined).refusal, null, 'nothing is the whole of the layout showing');
});

test('clear blanks the layout showing, a row, rows, columns or one character', () => {
  assert.deepEqual(lcdClearAt(PLAIN).patch, { lines: ['', ''] });
  assert.deepEqual(lcdClearAt(PLAIN, 2).patch, { lines: ['PATCH 12', ''] });
  assert.deepEqual(lcdClearAt(PAGED, { layout: 1, row: [1, 2] }).patch.layouts[0].lines, ['', '']);
  assert.deepEqual(lcdClearAt(PLAIN, { row: 1, col: 7 }).patch, { lines: ['PATCH  2', 'VOL 100'] });
  assert.deepEqual(lcdClearAt(PLAIN, { col: [1, 3] }).patch, { lines: ['   CH 12', '    100'] }, 'columns of every row');
  assert.deepEqual(lcdClearAt(PLAIN, { row: 2, col: 12 }).patch, {}, 'nothing written there: already blank');
  assert.deepEqual(lcdClearAt({ ...PLAIN, lines: ['', ''] }).patch, {}, 'already blank');
  assert.equal(lcdClearAt(PLAIN, 5).refusal, 'There is no row 5: the rows are 1 to 2.');
});

test('read gives every row, one row, the columns of one, or one character', () => {
  assert.deepEqual(lcdReadAt(PLAIN).value, ['PATCH 12', 'VOL 100']);
  assert.equal(lcdReadAt(PLAIN, 2).value, 'VOL 100');
  assert.equal(lcdReadAt(PLAIN, { row: 1, col: [1, 5] }).value, 'PATCH');
  assert.equal(lcdReadAt(PLAIN, { row: 1, col: 7 }).value, '1');
  assert.equal(lcdReadAt(PLAIN, { row: 1, col: 16 }).value, ' ', 'a blank cell reads as the blank drawn');
  assert.deepEqual(lcdReadAt(PAGED, { layout: 'Edit' }).value, ['', '']);
  assert.equal(lcdReadAt(PAGED, { layout: 9 }).refusal, 'There is no layout 9: the layouts are 1 to 2.');
  assert.equal(lcdPositionWords(PAGED, { layout: 2, row: 1, col: [5, 10] }), 'layout 2 (Edit), row 1, columns 5 to 10');
});

/* ------------------------------------------------------------------- through the runtime */

function lcd(display) {
  const control = createControl('LcdDisplay', { name: 'Lcd' });
  Object.assign(control._children.Display, structuredClone(display));
  return control;
}

/** A runtime over one LCD: what `fn` returns, the display after, and what the console said. */
function run(display, fn) {
  resetScriptStateForTesting();
  const control = lcd(display);
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [control], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('Lcd', 'lcd-probe').ce.components.lcd);
    return { result, display: control._children.Display, said: get(scriptTrace).filter((t) => t.kind !== 'log').map((t) => t.message) };
  } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

test('text, clear, read, size and fill act on the layout showing, as the preview says it', () => {
  const withdraw = provideDisplayLayouts({ showing: () => 'edit', show: () => {} });
  try {
    const done = run(PAGED, (lcdApi) => [lcdApi.text('Lcd', 1, 'ON EDIT'), lcdApi.read('Lcd', 'text', 1), lcdApi.size('Lcd', 'text')]);
    assert.deepEqual(done.result, [true, 'ON EDIT', 2]);
    assert.deepEqual(done.display.layouts[1].lines, ['ON EDIT', '']);
    assert.deepEqual(done.display.layouts[0].lines, ['HOME ROW ONE', 'HOME ROW TWO'], 'the other layout untouched');
    const filled = run(PAGED, (lcdApi) => lcdApi.fill('Lcd', 'text', ['A', 'B']));
    assert.deepEqual(filled.display.layouts[1].lines, ['A', 'B']);
  } finally { withdraw(); }
});

test('a position table works through the runtime, and a refusal says why', () => {
  const done = run(PAGED, (lcdApi) => [
    lcdApi.text('Lcd', { layout: 'Edit', row: 2, col: [1, 4] }, 'MENU'),
    lcdApi.clear('Lcd', { layout: 1, row: 1, col: 1 }),
    lcdApi.read('Lcd', 'text', { layout: 1, row: 1 }),
    lcdApi.text('Lcd', { row: 1, colum: 2 }, 'X'),
  ]);
  assert.deepEqual(done.result, [true, true, ' OME ROW ONE', false]);
  assert.deepEqual(done.display.layouts[1].lines, ['', 'MENU']);
  assert.deepEqual(done.said, ['lcd Lcd: text({"row":1,"colum":2}, "X") — refused, nothing changed. "colum" is not part of a position: one of "layout", "row" or "col".']);
  const past = run(PLAIN, (lcdApi) => lcdApi.clear('Lcd', { row: 1, col: [5, 99] }));
  assert.deepEqual(past.said, ['lcd Lcd: clear({"row":1,"col":[5,99]}) — Columns 5 to 99: the display has 16, so 5 to 16 were used. This is said only the first time.']);
  assert.equal(past.display.lines[0], 'PATC    ');
  const read = run(PLAIN, (lcdApi) => lcdApi.read('Lcd', 'text', { row: 3 }));
  assert.deepEqual(read.said, ['lcd.read("text", {"row":3}): There is no row 3: the rows are 1 to 2.']);
});
