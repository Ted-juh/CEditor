// componentIndexes.test.js — an element a component verb addresses (a pad, a lane, a grid cell, a
// zone, a slot), what the runtime says when it addresses nothing, and the Values row of its index.
//
// An index past the end refused with "refused, nothing changed" and nothing more, so a footswitch
// that addressed pad 0 read exactly like one that did nothing. The Zone Splitter logged a zone that
// is not one as though it had been set, the Phrase Sequencer said "nothing to change" for a cell
// off its grid, and the Phrase Recorder refused a slot with no take in it without saying so. And a
// number past a verb's range was used as its nearest end without a word, while the row said the
// call was out of range, as though it had been refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';

const TYPES = [['DrumPads', 'Pads'], ['Matrix', 'Mat'], ['LcdDisplay', 'Lcd'], ['PixelDisplay', 'Pix'], ['Turing', 'Tur'],
  ['Envelope', 'Env'], ['Arp', 'Arp'], ['SplitZone', 'Split'], ['Phrase', 'Phr'], ['Recorder', 'Rec']];

/** A fresh panel of one of each, a runtime over it, and what `fn` makes it say: { result, lines }. */
function run(fn) {
  resetScriptStateForTesting();
  const controls = TYPES.map(([type, name]) => createControl(type, { name }));
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls, scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('Pads', 'index-probe'), controls);
    return { result, lines: get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => t.message), controls };
  } finally { setRuntimeHost(null); }
}

/** The rows of the call the source is, read over the same controls. */
function rows(src) {
  const controls = TYPES.map(([type, name]) => createControl(type, { name }));
  return readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls }, controls }).calls[0].args;
}
const rowNamed = (src, name) => rows(src).find((a) => a.name === name);

test.after(() => resetScriptStateForTesting());

test('a generated verb says which element there is no such one of, and which there are', () => {
  const cases = [
    [(api) => api.ce.components.drumpads.note('Pads', 99, 60), 'drumpads Pads: note(99, 60) — refused, nothing changed. There is no pad 99: the pads are 1 to 16.'],
    [(api) => api.ce.components.drumpads.note('Pads', 0, 60), 'drumpads Pads: note(0, 60) — refused, nothing changed. There is no pad 0: the pads are 1 to 16.'],
    [(api) => api.ce.components.drumpads.note('Pads', 3, 'x'), 'drumpads Pads: note(3, "x") — refused, nothing changed. "x" is not a number.'],
    [(api) => api.ce.components.matrix.cell('Mat', 9, 1, 0.5), 'matrix Mat: cell(9, 1, 0.5) — refused, nothing changed. There is no row 9: the rows are 1 to 4.'],
    [(api) => api.ce.components.matrix.cell('Mat', 1, 9, 0.5), 'matrix Mat: cell(1, 9, 0.5) — refused, nothing changed. There is no column 9: the columns are 1 to 4.'],
    [(api) => api.ce.components.lcd.text('Lcd', 9, 'hi'), 'lcd Lcd: text(9, "hi") — refused, nothing changed. There is no line 9: the lines are 1 to 2.'],
    [(api) => api.ce.components.pixel.text('Pix', 'tempo', '120'), 'pixel Pix: text("tempo", "120") — refused, nothing changed. There is no element called "tempo". It has none yet.'],
    [(api) => api.ce.components.turing.step('Tur', 40, 0.5), 'turing Tur: step(40, 0.5) — refused, nothing changed. There is no step 40: the steps are 1 to 8.'],
    [(api) => api.ce.components.arp.mute('Arp', 0), 'arp Arp: mute(0) — refused, nothing changed. 0 is not a step: the steps count from 1.'],
  ];
  for (const [call, said] of cases) {
    const { result, lines } = run(call);
    assert.equal(result, false, said);
    assert.deepEqual(lines, [said]);
  }
  // An unknown word still names the words, as it did.
  assert.match(run((api) => api.ce.components.arp.pattern('Arp', 'sideways')).lines[0], /— refused, nothing changed\. One of: /);
});

test('a hand-written verb refuses an element it has no such one of, and says which there are', () => {
  const zone = run((api) => api.splitMute('Split', 9, false));
  assert.equal(zone.result, false);
  assert.deepEqual(zone.lines, ['split Split: mute {"zone":9,"enabled":false} — refused, nothing changed. There is no zone 9: '
    + 'a zone is its number counted from 0, here 0 to 1, or its name, "Bass", "Lead".']);
  assert.equal(zone.controls[7]._children.SplitZone.zones.every((z) => z.enabled !== false), true, 'nothing was written');
  assert.match(run((api) => api.splitChannel('Split', 'Bas', 3)).lines[0], /There is no zone "Bas": /);
  // A zone number counts from 0, as it always did: zone 1 is the second, "Lead".
  const lead = run((api) => api.splitMute('Split', 1, false));
  assert.deepEqual([lead.result, lead.lines], [true, []]);
  assert.deepEqual(lead.controls[7]._children.SplitZone.zones.map((z) => z.enabled !== false), [true, false]);

  const cell = run((api) => api.phraseCell('Phr', 20, 1, true));
  assert.equal(cell.result, false);
  assert.deepEqual(cell.lines, ['phrase Phr: cell {"step":20,"row":1,"on":true} — refused, nothing changed. There is no step 20: the steps are 0 to 15, counted from 0.']);
  assert.match(run((api) => api.phraseCell('Phr', 1, 8, true)).lines[0], /There is no row 8: the rows are 0 to 7, counted from 0\.$/);

  assert.deepEqual(run((api) => api.recorderLoad('Rec', 2)).lines,
    ['recorder Rec: load {"slot":2} — refused, nothing changed. There is no take in slot 2: no slot holds one yet.']);
  assert.deepEqual(run((api) => api.recorderStore('Rec', 9)).lines,
    ['recorder Rec: store {"slot":9} — refused, nothing changed. There is no slot 9: the slots are 1 to 8.']);
  assert.deepEqual(run((api) => api.recorderStore('Rec', 2)).lines, []);
});

test('a number past a verb\'s range is used as its nearest end, and said once', () => {
  const { result, lines, controls } = run((api) => {
    api.ce.components.drumpads.note('Pads', 3, 200);
    api.ce.components.drumpads.note('Pads', 4, 300);
    return api.ce.components.drumpads.choke('Pads', 3, -2);
  });
  assert.equal(result, true);
  assert.deepEqual(lines, [
    'drumpads Pads: note(3, 200) — the note 200 is outside 0 to 127, so 127 was used. This is said only the first time.',
    'drumpads Pads: choke(3, -2) — the choke -2 is outside 0 to 8, so 0 was used. This is said only the first time.',
  ]);
  assert.equal(controls[0]._children.DrumPads.pads[2].note, 127);
});

test('the rows say what an index addresses, and the refusal in the console\'s words', () => {
  const said = (src, name, call) => {
    const row = rowNamed(src, name);
    const { lines } = run(call);
    assert.ok(row?.problem, `${src}: no problem read`);
    assert.equal(row.problem.message, lines[0].replace(/ This is said only the first time\.$/, ''), src);
    return row;
  };
  said('ce.components.drumpads.note("Pads", 99, 40)', 'index', (api) => api.ce.components.drumpads.note('Pads', 99, 40));
  said('ce.components.matrix.cell("Mat", 9, 1, 0.5)', 'row', (api) => api.ce.components.matrix.cell('Mat', 9, 1, 0.5));
  said('ce.components.matrix.cell("Mat", 1, 9, 0.5)', 'col', (api) => api.ce.components.matrix.cell('Mat', 1, 9, 0.5));
  said('ce.components.pixel.text("Pix", "tempo", "1")', 'name', (api) => api.ce.components.pixel.text('Pix', 'tempo', '1'));
  said('ce.components.arp.mute("Arp", 0)', 'index', (api) => api.ce.components.arp.mute('Arp', 0));
  said('splitMute("Split", 9, false)', 'zone', (api) => api.splitMute('Split', 9, false));
  said('phraseCell("Phr", 20, 1, true)', 'step', (api) => api.phraseCell('Phr', 20, 1, true));
  said('recorderLoad("Rec", 2)', 'slot', (api) => api.recorderLoad('Rec', 2));
  const note = said('ce.components.drumpads.note("Pads", 3, 200)', 'note', (api) => api.ce.components.drumpads.note('Pads', 3, 200));
  assert.equal(note.problem.severity, 'warning', 'used as the nearest end, not refused');

  // What a good index addresses, now.
  assert.equal(meaningLine(rowNamed('ce.components.drumpads.note("Pads", 3, 40)', 'index')), 'pad 3 of 16 · note now 38');
  assert.equal(meaningLine(rowNamed('ce.components.lcd.text("Lcd", 1, "hi")', 'row')), 'line 1 of 2 · now "PATCH:INIT VOICE"');
  assert.equal(meaningLine(rowNamed('splitMute("Split", 1, false)', 'zone')), 'zone 1 is "Lead", the 2nd zone: a zone number counts from 0');
  assert.equal(meaningLine(rowNamed('splitChannel("Split", "Bass", 3)', 'zone')), '"Bass" is zone 0, counted from 0');
  assert.equal(meaningLine(rowNamed('phraseCell("Phr", 3, 1, true)', 'step')), 'step 3: the steps are 0 to 15, counted from 0');
  assert.equal(meaningLine(rowNamed('recorderStore("Rec", 3)', 'slot')), 'slot 3 of 8 · empty');
  // A good index says nothing wrong; a phrase cell's row says nothing of its step.
  for (const [src, name] of [['ce.components.drumpads.note("Pads", 3, 40)', 'index'], ['phraseCell("Phr", 20, 1, true)', 'row'],
    ['ce.components.matrix.cell("Mat", 2, 3, 0.5)', 'col'], ['recorderStore("Rec", 8)', 'slot']]) {
    assert.equal(rowNamed(src, name).problem, null, src);
  }
  // The index is a field the row writes, and a zone named by its label a dropdown of the labels.
  assert.deepEqual([rowNamed('ce.components.drumpads.note("Pads", 3, 40)', 'index').editable, rowNamed('ce.components.drumpads.note("Pads", 3, 40)', 'index').meaning.max], ['number', 16]);
  const named = rowNamed('splitChannel("Split", "Bass", 3)', 'zone');
  assert.deepEqual([named.editable, named.meaning.choices], ['choice', ['Bass', 'Lead']]);
});
