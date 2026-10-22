// lcdLines.test.js — what an LCD shows of a line a script writes to it: what the runtime says of
// what it cannot show (a line past its width, a character it has no shape for, a display that shows
// its layouts instead), once, and the Values row that draws the line as the display shows it and
// says the same.
//
// ce.components.lcd.text stored the line whole and logged "text → lines": a 48-character line on a
// 16-character display showed 16 of them, a "%" on a segment display was a blank cell, and on a
// display with layouts the line was never shown, all without a word.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { lcdLine } from '../src/CE_Application/scripting/lcdLines.js';

const ONCE = ' This is said only the first time.';
const LONG = 'THIS LINE IS MUCH LONGER THAN SIXTEEN CHARACTERS';

/** An LCD named Lcd, its Display section patched with `display`. */
function lcd(display = {}) {
  const control = createControl('LcdDisplay', { name: 'Lcd' });
  Object.assign(control._children.Display, display);
  return control;
}

/** A runtime over one LCD, and the warnings `fn` makes it say. */
function run(display, fn) {
  resetScriptStateForTesting();
  const control = lcd(display);
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [control], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    fn(scriptApiForTesting('Lcd', 'lcd-probe'));
    return { control, lines: get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error').map((t) => t.message) };
  } finally { setRuntimeHost(null); }
}

/** The `text` row of an lcd.text call, over an LCD set as `display`. */
const textRow = (src, display = {}) => readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls: [lcd(display)] } })
  .calls[0].args.find((a) => a.name === 'text');

test.after(() => resetScriptStateForTesting());

test('a line past the display\'s width is said once per line, and stored whole', () => {
  const { control, lines } = run({}, (api) => {
    api.ce.components.lcd.text('Lcd', 1, LONG);
    api.ce.components.lcd.text('Lcd', 1, `${LONG}!`);
    api.ce.components.lcd.text('Lcd', 2, 'FITS');
  });
  assert.deepEqual(lines, [
    `lcd Lcd: text(1, "${LONG}") — the display is 16 characters wide and does not scroll, so only "THIS LINE IS MUC" shows.${ONCE}`,
  ]);
  assert.equal(control._children.Display.lines[0], `${LONG}!`, 'the line is stored as written; only what shows of it is cut');
  // A display that scrolls shows all of it in turn, and says nothing.
  assert.deepEqual(run({ scroll: 'left', scrollSpeed: 4 }, (api) => api.ce.components.lcd.text('Lcd', 1, LONG)).lines, []);
  // …unless its speed is 0, when it does not move.
  assert.equal(run({ scroll: 'left', scrollSpeed: 0 }, (api) => api.ce.components.lcd.text('Lcd', 1, LONG)).lines.length, 1);
  // A line with the renderer's tokens is as long as they expand to, which is not known here.
  assert.deepEqual(run({}, (api) => api.ce.components.lcd.text('Lcd', 1, 'CUTOFF {value} OF {bar:12}')).lines, []);
});

test('a character a segment or graphic display cannot draw is said, and a character display draws all', () => {
  assert.deepEqual(run({ panelType: 'segment', segmentType: '7' }, (api) => api.ce.components.lcd.text('Lcd', 1, 'VOL 99% <A>')).lines, [
    `lcd Lcd: text(1, "VOL 99% <A>") — the display's 7-segment cells have no shape for "%", "<", ">", so those cells stay blank.${ONCE}`,
  ]);
  assert.deepEqual(run({ panelType: 'graphic' }, (api) => api.ce.components.lcd.text('Lcd', 1, 'CAFÉ & BAR')).lines, [
    `lcd Lcd: text(1, "CAFÉ & BAR") — the display's pixel font has no glyph for "É", "&", so those cells stay blank.${ONCE}`,
  ]);
  assert.deepEqual(run({ panelType: 'graphic' }, (api) => api.ce.components.lcd.text('Lcd', 1, 'A&B')).lines, [
    `lcd Lcd: text(1, "A&B") — the display's pixel font has no glyph for "&", so that cell stays blank.${ONCE}`,
  ]);
  assert.deepEqual(run({}, (api) => api.ce.components.lcd.text('Lcd', 1, '100% & €')).lines, []);
  // A character past the width is never drawn, so it is not said; both are said when both happen.
  assert.deepEqual(run({ panelType: 'segment', segmentType: '16' }, (api) => api.ce.components.lcd.text('Lcd', 1, 'ABCDEFGHIJKLMNOP%')).lines.length, 1);
  assert.equal(run({ panelType: 'segment', segmentType: '16' }, (api) => api.ce.components.lcd.text('Lcd', 1, `%${LONG}`)).lines.length, 2);
});

test('a display with layouts shows their zones, and a line written to it is said not to show', () => {
  const layouts = [{ id: 'main', name: 'Main', zones: [{ id: 'z', show: 'static', text: 'HELLO', row: 1, colStart: 1, colEnd: 16 }] }];
  assert.deepEqual(run({ layouts }, (api) => api.ce.components.lcd.text('Lcd', 1, `%${LONG}`)).lines, [
    `lcd Lcd: text(1, "%${LONG}") — the display shows the zones of its layouts, not its lines, so this line is not shown.${ONCE}`,
  ], 'nothing else about a line that is not shown');
});

test('the line\'s row draws it as the display shows it, and says what the runtime says', () => {
  const said = run({}, (api) => api.ce.components.lcd.text('Lcd', 1, LONG)).lines[0];
  const row = textRow(`ce.components.lcd.text("Lcd", 1, "${LONG}")`);
  assert.equal(row.kind, 'lcdLine');
  assert.deepEqual(row.problem, { severity: 'warning', message: said.slice(0, -ONCE.length) });
  assert.equal(meaningLine(row), '16 of 48 characters show');
  assert.equal(row.meaning.lcd.cells.map((c) => c.ch).join(''), 'THIS LINE IS MUC');
  assert.equal(row.meaning.lcd.past.length, 32);

  const seg = textRow('ce.components.lcd.text("Lcd", 1, "99%")', { panelType: 'segment', segmentType: '7' });
  assert.deepEqual(seg.meaning.lcd.cells.slice(0, 3).map((c) => c.draws), [true, true, false]);
  assert.match(seg.problem.message, /7-segment cells have no shape for "%", so that cell stays blank\.$/);
  assert.equal(meaningLine(seg), '3 of 16 cells');
  assert.equal(meaningLine(textRow(`ce.components.lcd.text("Lcd", 1, "${LONG}")`, { scroll: 'right' })), 'scrolls through 16 cells');
  assert.equal(meaningLine(textRow('ce.components.lcd.text("Lcd", 1, "{value} dB")')), 'its {tokens} are filled in when it is drawn');
  assert.equal(textRow('ce.components.lcd.text("Lcd", 1, "OK")').problem, null);
  // Written from parts, the line is not known until it runs: nothing is claimed.
  assert.equal(textRow('ce.components.lcd.text("Lcd", 1, "VOL " .. v)').kind, 'computed');
});

test('a line is read as the renderer reads its display', () => {
  assert.equal(lcdLine({ cols: 8 }, 'ABCDEFGHIJ').cut, 'IJ');
  assert.equal(lcdLine({ cols: null }, 'AB').cols, 1, 'a null width is 0, and the display is at least one cell wide, as drawn');
  assert.equal(lcdLine({}, 'AB').cols, 16);
  assert.equal(lcdLine({ panelType: 'segment', segmentType: 'nonsense' }, 'A').segmentType, '16', 'an unknown segment type draws as 16 segments');
});
