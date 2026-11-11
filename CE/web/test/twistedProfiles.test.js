/**
 * The Twisted Electrons profiles: generated from the MIDI tables of four web manuals (TWISTfm,
 * hapiNES L, deton8, BlastBeats) and three PDF manuals (TherapSID, AY3, MEGAfm) by
 * tools/profiles/twisted/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, that every row is its controller (or TWISTfm's
 * editor parameter) at both ends of its range, and that TWISTfm's GET_ALL answer reads back whole.
 *
 * The readers are checked on markup and lines made by hand, in each form's shape.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readTables } from '../../../tools/profiles/twisted/read-twisted-page.mjs';
import { readControlRows, readParameterRows } from '../../../tools/profiles/twisted/read-twisted-pdf.mjs';
import { controllerValues } from '../../../tools/profiles/twisted/build-twisted-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/twisted/make-profiles.mjs';
import { localCollectDumpMessages, localCompileDeviceRequest, localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('a web page\'s tables, each under the heading above it, entities decoded', () => {
  const html = '<h2>MIDI</h2><div class="midi-table-wrap"><h3>Direct Performance CCs</h3><p class="table-note">Flat CCs.</p><table class="midi-table"><thead><tr><th>Group</th><th>CC</th></tr></thead><tbody><tr data-filter="x"><td>Voice &amp; pitch</td><td>2</td></tr></tbody></table></div><h2>MIDI CC Reference</h2><table class="data-table"><tr><th>Parameter</th><th>CC</th></tr><tr><td>Slide</td><td>5</td></tr></table>';
  assert.deepEqual(readTables(html), [
    { title: 'Direct Performance CCs', note: 'Flat CCs.', columns: ['Group', 'CC'], rows: [['Voice & pitch', '2']] },
    { title: 'MIDI CC Reference', columns: ['Parameter', 'CC'], rows: [['Slide', '5']] },
  ]);
});

test('a PDF\'s rows: a range with spaces, a band going on below, a note under the message; MEGAfm\'s sections', () => {
  const line = (y, ...words) => ({ page: 26, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
  const rows = readControlRows([
    line(80, [89, 'MIDI'], [118, 'Message'], [217, 'Range'], [337, 'Result'], [448, 'Direction']),
    line(100, [78, 'Control'], [120, 'CC#49'], [191, '0=off'], [230, '1=on'], [291, 'Voice1'], [329, 'Sync'], [431, 'receive/send']),
    line(120, [78, 'Control'], [120, 'CC#27'], [191, '0-127'], [291, 'Lfo1'], [320, 'Depth'], [431, 'receive/send']),
    line(130, [78, '&'], [88, 'Mod'], [108, 'Wheel']),
    line(140, [78, 'Control'], [120, 'CC#55'], [191, '0-25=LP'], [235, '26-50=BP'], [291, 'Filter'], [325, 'Mode'], [431, 'receive/send']),
    line(150, [191, '51-75=HP']),
  ], 'MIDI').rows;
  assert.deepEqual(rows, [
    ['', '49', 'Voice1 Sync', '0=off 1=on', 'receive/send'],
    ['', '27', 'Lfo1 Depth (& Mod Wheel)', '0-127', 'receive/send'],
    ['', '55', 'Filter Mode', '0-25=LP 26-50=BP 51-75=HP', 'receive/send'],
  ]);
  const mega = readParameterRows(['Parameter                     MIDI CC        Range', 'GLOBAL', 'FM Algorithm                     4               1-8', 'LFO', 'LFO1 Depth (When Active)   Velocity      0-127', 'Preset Upload/Download (SYSEX'].join('\n'), 'MIDI').rows;
  assert.deepEqual(mega, [['GLOBAL', '4', 'FM Algorithm', '1-8', ''], ['LFO', 'Velocity', 'LFO1 Depth (When Active)', '0-127', '']]);
});

test('values: bands, named values, ranges a controller can and cannot carry', () => {
  assert.deepEqual(controllerValues('0-63 Off, 64-127 On').choices.map((c) => c.value), [0, 64]);
  assert.deepEqual(controllerValues('Poly 8=0, Unison=1').choices, [{ value: 0, label: 'Poly 8' }, { value: 1, label: 'Unison' }]);
  assert.deepEqual(controllerValues('0 normal, 1 2x, 2 4x').choices.map((c) => c.label), ['normal', '2x', '4x']);
  assert.deepEqual(controllerValues('0-25=LP 26-50=BP 101-127=OFF').choices.map((c) => [c.value, c.label]), [[0, 'LP'], [26, 'BP'], [101, 'OFF']]);
  assert.deepEqual(controllerValues('0=off 1=on').choices.map((c) => c.value), [0, 1]);
  assert.deepEqual(controllerValues('0-31'), { min: 0, max: 31 });
  assert.deepEqual(controllerValues('1-500'), { tooWide: true });
  assert.deepEqual(controllerValues('16 arp choices'), { printed: true, min: 0, max: 127 });
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const sent = (compiled) => compiled.transaction.messages.map((m) => hex(m.bytes)).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/twisted/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter at both ends of its range, its controller or editor message`, () => {
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, compiled.error);
        const channel = r.channel === '$channel' ? profile.variables.channel : r.channel;
        const want = r.kind === 'cc' ? hex([0xb0 + channel - 1, r.controller, wire]) : [...r.template.slice(0, -2), hex([wire & 127]), hex([wire >> 7]), 'F7'].join(' ');
        assert.equal(sent(compiled), want, `${p.id} = ${value}`);
      }
    }
    for (const t of profile.tests.filter((x) => !x.kind)) assert.equal(sent(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    const notes = profile.authoringNotes.join('\n');
    for (const table of data.tables.filter((t) => /CC|MIDI Implementation|Reference/.test(t.title))) {
      const ccAt = table.columns.findIndex((c) => /^(?:MIDI )?CC#?$/.test(c));
      const nameAt = table.columns.findIndex((c) => /^(?:Parameter|Message)$/.test(c));
      for (const row of table.rows) {
        const cc = row[ccAt];
        const laid = profile.parameters.some((p) => p.description.includes(`CC ${/^\d+-/.test(cc) ? cc.split('-')[0] : cc}`));
        assert.ok(laid || notes.includes(row[nameAt]), `${table.title}: ${cc} ${row[nameAt]} is neither laid out nor named`);
      }
    }
  });

  test(`${profile.id}: the source is Twisted Electrons' own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Twisted Electrons');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
  });
}

test('TWISTfm: GET_ALL\'s answer, an INFO and a VALUE for each editor id in any order, reads back whole', () => {
  const tfm = BUILT.find((b) => b.name === 'twistfm').profile;
  const request = localCompileDeviceRequest(tfm, { request: 'requestEditorParameters' });
  assert.equal(request.transaction?.encodedValueHex ?? request.hex, 'F0 7D 54 57 30 01 F7');
  const editor = tfm.parameters.filter((p) => p.messageRecipe.startsWith('editor'));
  assert.equal(editor.length, 113);
  const wire = (p, k) => (p.type === 'choice' ? p.choices[k % p.choices.length].value : p.range.min + (k % (p.range.max - p.range.min + 1)));
  const messages = ['F0 7D 54 57 30 11 03 71 F7', ...[...editor].reverse().map((p, k) => { const id = Number.parseInt(p.messageRecipe.slice(6), 16); return hex([0xf0, 0x7d, 0x54, 0x57, 0x30, 0x12, id, wire(p, k) & 127, wire(p, k) >> 7, 0xf7]); })];
  const collected = localCollectDumpMessages(tfm, messages);
  assert.ok(collected.complete, collected.error);
  [...editor].reverse().forEach((p, k) => assert.equal(collected.values[p.id], p.type === 'choice' ? p.choices[k % p.choices.length].id : wire(p, k), p.id));
  // BlastBeats' tables on their targets' channels; deton8's on its stated default.
  const bb = BUILT.find((b) => b.name === 'blastbeats').profile;
  assert.deepEqual([...new Set(bb.messageRecipes.map((r) => r.channel))].sort((a, b) => a - b), [1, 2, 3, 4, 10]);
  assert.equal(BUILT.find((b) => b.name === 'deton8').profile.variables.channel, 10);
});
