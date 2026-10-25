// lcdZonesByName.test.js — an LCD's zones, addressed by the name typed in the zone table: zoneText,
// zoneLabel, zoneShow, zoneAt, zoneSource and zoneKind, and read(t, "zone…"). The owner's decision:
// docs/design/api-descriptions-handoff.md, "Zones by name". A name reaches every zone carrying it,
// on every layout, in any case, as a Pixel Display's element names do.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { lcdZonePlace, lcdZonePlaceOf, lcdZoneSourceFor } from '../src/CE_Application/scripting/lcdPositions.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';

const zone = (id, name, extra = {}) => ({
  id, name, row: 1, colStart: 1, colEnd: 8, show: 'static', sourceId: '', text: '', label: '', align: 'left', radix: 'dec', ...extra,
});

/** A 2 x 16 display with two layouts, each holding a zone called Cutoff, and one called Title on the first. */
const PAGED = {
  rows: 2, cols: 16,
  layouts: [
    { id: 'home', name: 'Home', zones: [zone('z1', 'Title', { text: 'HOME' }), zone('z2', 'Cutoff', { row: 2, colStart: 3, colEnd: 6, show: 'value' })] },
    { id: 'edit', name: 'Edit', zones: [zone('z3', 'cutoff', { row: 2, colStart: 3, colEnd: 6, show: 'value' }), zone('z4', '', { text: 'NO NAME' })] },
  ],
  pages: { defaultLayoutId: 'home' },
};

test('a place moves a zone: a row, a range of columns, or a first column keeping its width', () => {
  const at = (where, z = PAGED.layouts[0].zones[1]) => lcdZonePlace(PAGED, where).place?.(z);
  assert.deepEqual(lcdZonePlaceOf(PAGED, at({ row: 1, col: [9, 16] })), { row: 1, col: [9, 16] });
  assert.deepEqual(lcdZonePlaceOf(PAGED, at({ col: 10 })), { row: 2, col: [10, 13] }, 'four wide, from 10');
  assert.deepEqual(lcdZonePlaceOf(PAGED, at({ col: 15 })), { row: 2, col: [15, 16] }, 'up to the edge');
  assert.deepEqual(lcdZonePlaceOf(PAGED, at(1)), { row: 1, col: [3, 6] }, 'a row number alone');
  assert.deepEqual(lcdZonePlaceOf(PAGED, at({ ROW: 1.4 })), { row: 1, col: [3, 6] }, 'any case, a fraction rounded');
  assert.equal(lcdZonePlace(PAGED, { row: [1, 2] }).refusal, 'A zone is one row: give one number.');
  assert.equal(lcdZonePlace(PAGED, { layout: 2, row: 1 }).refusal, 'A zone stays on its layout: give its row and col.');
  assert.equal(lcdZonePlace(PAGED, { row: 3 }).refusal, 'There is no row 3: the rows are 1 to 2.');
  assert.equal(lcdZonePlace(PAGED, { rows: 1 }).refusal, '"rows" is not part of a place: "row" or "col".');
  assert.equal(lcdZonePlace(PAGED, { col: [10, 40] }).clamped, 'Columns 10 to 40: the display has 16, so 10 to 16 were used.');
  assert.match(lcdZonePlace(PAGED, undefined).refusal, /^No place was given/);
});

test('a source is a control by name, stored by its id, or the picker\'s @active and @edit', () => {
  const knob = createControl('Knob', { name: 'Resonance' });
  const self = createControl('LcdDisplay', { name: 'Lcd' });
  const controls = [self, knob];
  const selfId = self._children.Core.id;
  assert.deepEqual(lcdZoneSourceFor(controls, ' resonance ', selfId), { id: knob._children.Core.id, refusal: null });
  assert.deepEqual(lcdZoneSourceFor(controls, '', selfId), { id: '', refusal: null });
  assert.deepEqual(lcdZoneSourceFor(controls, '@Active#VALUE', selfId), { id: '@active#value', refusal: null });
  assert.deepEqual(lcdZoneSourceFor(controls, '@edit', selfId), { id: '@edit', refusal: null });
  assert.equal(lcdZoneSourceFor(controls, '@active#knob', selfId).refusal, '"@active#knob": after "@active#" comes "value", "switch", "choice".');
  assert.equal(lcdZoneSourceFor(controls, 'Lcd', selfId).refusal, 'A display cannot show itself in a zone.');
  assert.equal(lcdZoneSourceFor(controls, 'Reso', selfId).refusal, 'There is no control called "Reso" on this panel.');
});

/* ------------------------------------------------------------------- through the runtime */

/** A runtime over one LCD and a knob: what `fn` returns, the display after, and what the console said. */
function run(display, fn) {
  resetScriptStateForTesting();
  const control = createControl('LcdDisplay', { name: 'Lcd' });
  Object.assign(control._children.Display, structuredClone(display));
  const knob = createControl('Knob', { name: 'Resonance' });
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [control, knob], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('Lcd', 'lcd-zone-probe').ce.components.lcd);
    return {
      result, display: control._children.Display, knobId: knob._children.Core.id,
      said: get(scriptTrace).filter((t) => t.kind !== 'log').map((t) => t.message),
    };
  } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

const zonesNamed = (display, name) => display.layouts.flatMap((l) => l.zones.filter((z) => z.name.toLowerCase() === name.toLowerCase()));

test('a name reaches every zone carrying it, on every layout, in any case', () => {
  const done = run(PAGED, (lcd) => [
    lcd.zoneKind('Lcd', 'CUTOFF', 'bar'),
    lcd.zoneLabel('Lcd', 'cutoff', 'CUT'),
    lcd.zoneText('Lcd', 'Title', 'VOL'),
    lcd.zoneText('Lcd', 'Title', 12),
  ]);
  assert.deepEqual(done.result, [true, true, true, true]);
  assert.deepEqual(zonesNamed(done.display, 'cutoff').map((z) => [z.show, z.label]), [['bar', 'CUT'], ['bar', 'CUT']]);
  assert.equal(done.display.layouts[0].zones[0].text, '12', 'a number written as text');
  assert.deepEqual(done.said, []);
});

test('zoneShow toggles every zone from the first one\'s state, and true or false sets it', () => {
  const done = run(PAGED, (lcd) => [lcd.zoneShow('Lcd', 'Cutoff')]);
  assert.deepEqual(zonesNamed(done.display, 'cutoff').map((z) => z.visible), [false, false]);
  const back = run(done.display, (lcd) => [lcd.zoneShow('Lcd', 'Cutoff', true), lcd.read('Lcd', 'zoneShow', 'cutoff')]);
  assert.deepEqual(back.result, [true, true]);
  assert.deepEqual(zonesNamed(back.display, 'cutoff').map((z) => z.visible), [true, true]);
});

test('zoneAt moves every zone by the place given, and read gives a place zoneAt takes back', () => {
  const done = run(PAGED, (lcd) => [
    lcd.zoneAt('Lcd', 'Cutoff', { col: 10 }),
    lcd.read('Lcd', 'zoneAt', 'Cutoff'),
    lcd.zoneAt('Lcd', 'Cutoff', { row: 1, col: [1, 4] }),
    lcd.read('Lcd', 'zoneAt'),
    lcd.zoneAt('Lcd', 'Cutoff', { layout: 2 }),
  ]);
  assert.deepEqual(done.result.slice(0, 3), [true, { row: 2, col: [10, 13] }, true]);
  assert.deepEqual(done.result[3], { Title: { row: 1, col: [1, 8] }, Cutoff: { row: 1, col: [1, 4] }, z4: { row: 1, col: [1, 8] } },
    'every zone, under the name it answers to: an unnamed one under its id');
  assert.equal(done.result[4], false);
  assert.deepEqual(zonesNamed(done.display, 'cutoff').map((z) => [z.row, z.colStart, z.colEnd]), [[1, 1, 4], [1, 1, 4]]);
  assert.deepEqual(done.said, ['lcd Lcd: zoneAt("Cutoff", {"layout":2}) — refused, nothing changed. A zone stays on its layout: give its row and col.']);
  const past = run(PAGED, (lcd) => lcd.zoneAt('Lcd', 'Title', { col: [12, 40] }));
  assert.deepEqual(past.said, ['lcd Lcd: zoneAt("Title", {"col":[12,40]}) — Columns 12 to 40: the display has 16, so 12 to 16 were used. This is said only the first time.']);
  assert.deepEqual([past.display.layouts[0].zones[0].colStart, past.display.layouts[0].zones[0].colEnd], [12, 16]);
});

test('zoneSource links by the control\'s name and reads it back by name; "" unlinks', () => {
  const done = run(PAGED, (lcd) => [
    lcd.zoneSource('Lcd', 'Cutoff', 'resonance'),
    lcd.read('Lcd', 'zoneSource', 'Cutoff'),
    lcd.zoneSource('Lcd', 'Title', '@active#switch'),
    lcd.read('Lcd', 'zoneSource'),
    lcd.zoneSource('Lcd', 'Cutoff', 'Nothing'),
    lcd.zoneSource('Lcd', 'Cutoff'),
  ]);
  assert.deepEqual(done.result.slice(0, 3), [true, 'Resonance', true]);
  assert.deepEqual(done.result[3], { Title: '@active#switch', Cutoff: 'Resonance', z4: '' });
  assert.deepEqual(done.result.slice(4), [false, false]);
  assert.deepEqual(zonesNamed(done.display, 'cutoff').map((z) => z.sourceId), [done.knobId, done.knobId], 'stored by id');
  assert.deepEqual(done.said, [
    'lcd Lcd: zoneSource("Cutoff", "Nothing") — refused, nothing changed. There is no control called "Nothing" on this panel.',
    'lcd Lcd: zoneSource("Cutoff") — refused, nothing changed. No control was given: a control\'s name, or "" to unlink.',
  ]);
  const unlinked = run(done.display, (lcd) => lcd.zoneSource('Lcd', 'Cutoff', ''));
  assert.deepEqual(zonesNamed(unlinked.display, 'cutoff').map((z) => z.sourceId), ['', '']);
});

test('a name no zone carries is refused, with the names there are', () => {
  const done = run(PAGED, (lcd) => [lcd.zoneText('Lcd', 'Volume', 'X'), lcd.zoneKind('Lcd', 'Cutoff', 'sparkle'), lcd.zoneText('Lcd', 'Title'), lcd.read('Lcd', 'zoneText', 'Volume')]);
  assert.deepEqual(done.result, [false, false, false, undefined]);
  assert.equal(done.said[0], 'lcd Lcd: zoneText("Volume", "X") — refused, nothing changed. There is no zone called "Volume". The zones are "Title", "Cutoff", "z4".');
  assert.match(done.said[1], /^lcd Lcd: zoneKind\("Cutoff", "sparkle"\) — refused, nothing changed\./);
  assert.equal(done.said[2], 'lcd Lcd: zoneText("Title") — refused, nothing changed. No text was given.');
  assert.equal(done.said[3], 'lcd.read("zoneText", "Volume"): this display has no zone called "Volume". One of: Title, Cutoff, z4.');
  const nowhere = run(PAGED, (lcd) => lcd.zoneAt('Lcd', 'Volume', { col: [12, 40] }));
  assert.equal(nowhere.said.length, 1, 'refused, without a warning about columns it did not use');
  const none = run({ rows: 2, cols: 16, lines: ['A', 'B'] }, (lcd) => lcd.zoneText('Lcd', 'Title', 'X'));
  assert.deepEqual(none.said, ['lcd Lcd: zoneText("Title", "X") — refused, nothing changed. There is no zone called "Title". It has none yet.']);
});
