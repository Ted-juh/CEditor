/**
 * The Tasty Chips GR-2 and GR-MEGA profiles: generated from the MIDI Command Table of each manual by
 * tools/profiles/tastychips/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, that every parameter is the controller or NRPN its
 * row numbers, and that the two manuals, which print the same table broken over the same pages,
 * read the same.
 *
 * The reader is checked on lines made by hand, in the table's shape: cells bottom-aligned on their
 * row's number, a row broken over a page, a page's first line that is the next row's, a section label.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readCommandTable } from '../../../tools/profiles/tastychips/read-gr-table.mjs';
import { namedValues, valuesOf } from '../../../tools/profiles/tastychips/build-tastychips-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/tastychips/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

// Words 5 points a character, set at x; the header puts Name at 86, Description at 184, Range at
// 284 and Curve at 501, as the manuals do.
const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
const HEADER = (page) => line(page, 84, [57, 'CC'], [76, '#'], [86, 'Name'], [184, 'Description'], [284, 'Range'], [321, '/'], [327, 'notes'], [501, 'Curve']);

test('the table: bottom-aligned cells, a row broken over a page, the next row\'s first line, a section', () => {
  const rows = readCommandTable([
    HEADER(133),
    // (A line of two words in each column sets how wide it is.)
    line(133, 100, [77, '1'], [86, 'MOD'], [111, 'WHEEL'], [184, 'Mod'], [204, 'wheel'], [284, '0–127.'], [320, 'Assignable'], [501, 'linear'], [520, 'x']),
    line(133, 113, [184, 'Enable'], [221, '&'], [231, 'focus']),
    line(133, 126, [77, '3'], [86, 'ENA'], [111, 'PART'], [142, 'NR'], [184, 'layer'], [284, '0:'], [296, 'disable,'], [337, '1:'], [349, 'enable']),
    line(133, 139, [501, 'see']),
    line(133, 152, [71, '35'], [86, 'SEQ'], [112, 'RATE'], [184, 'Sequencer'], [240, 'Rate'], [284, '0–22'], [312, '(rate'], [501, 'Rate']),
    HEADER(134),
    line(134, 97, [501, 'divisions']),
    line(134, 110, [71, '36'], [86, 'SEQ'], [112, 'POS'], [184, 'Sequencer'], [240, 'Pos'], [284, '0–63']),
    line(134, 123, [86, 'LARGE'], [126, 'REVERB']),
    line(134, 136, [71, '37'], [86, 'WET'], [184, 'Large'], [215, 'reverb'], [249, 'wet']),
    line(134, 149, [284, 'NRPN-only'], [335, '(>'], [350, '127)']),
    line(134, 162, [65, '128'], [86, 'REC'], [107, 'SEQ'], [184, 'Sequencer'], [235, 'record'], [284, '0,'], [296, '≥1']),
    HEADER(135),
    line(135, 97, [86, 'MOD'], [111, 'LIST'], [136, 'ROW']),
    line(135, 110, [65, '129'], [86, 'ENABLE'], [184, 'Mod'], [204, 'row'], [222, 'enable'], [284, '0:'], [296, 'OFF,'], [323, '≥1:'], [341, 'ON']),
  ], { sections: ['NRPN-only (> 127)'] });
  assert.deepEqual(rows.map((r) => [r.cc, r.name, r.description, r.range, r.curve, r.section]), [
    [1, 'MOD WHEEL', 'Mod wheel', '0–127. Assignable', 'linear x', null],
    [3, 'ENA PART NR', 'Enable & focus layer', '0: disable, 1: enable', '', null],
    [35, 'SEQ RATE', 'Sequencer Rate', '0–22 (rate', 'see Rate divisions', null],
    [36, 'SEQ POS', 'Sequencer Pos', '0–63', '', null],
    [37, 'LARGE REVERB WET', 'Large reverb wet', '', '', null],
    [128, 'REC SEQ', 'Sequencer record', '0, ≥1', '', 'NRPN-only (> 127)'],
    [129, 'MOD LIST ROW ENABLE', 'Mod row enable', '0: OFF, ≥1: ON', '', 'NRPN-only (> 127)'],
  ]);
});

test('the values a range names, bands, and the manual\'s own tables', () => {
  assert.deepEqual(namedValues('0: OFF, ≥1: ON').map((v) => [v.value, v.label]), [[0, 'OFF'], [1, 'ON']]);
  assert.deepEqual(namedValues('<64: OFF, ≥64: ON').map((v) => [v.value, v.band]), [[0, true], [64, true]]);
  const lists = { modSources: [{ index: 0, cells: ['LFO1'] }, { index: 4, cells: ['CV1'] }], modDestinations: [{ index: 0, cells: ['PITCH', 'ENGINE'] }], rateDivisions: [{ index: 0, cells: ['1/64', 'Straight'] }, { index: 1, cells: ['1/32T', 'Triplet'] }, { index: 2, cells: ['1/32', 'Straight'] }] };
  assert.deepEqual(valuesOf({ range: 'See Mod sources table, minus LFO1–4' }, lists).choices, [{ value: 4, label: 'CV1' }]);
  assert.deepEqual(valuesOf({ range: '0–1 (rate division index' }, lists).choices.map((c) => c.label), ['1/64 Straight', '1/32T Triplet']);
  assert.equal(valuesOf({ range: '0: left, 64: center, 127: right' }, lists).kind, 'printed', 'anchors on a sweep are not named values');
  assert.deepEqual(valuesOf({ range: '0–1000 ms' }, lists), { kind: 'range', min: 0, max: 1000 });
  assert.deepEqual(valuesOf({ range: '−1.0 … 0.0 … +1.0' }, lists), { kind: 'printed', min: 0, max: 127 });
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/tastychips/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its controller or NRPN at both ends, each once, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    const byNumber = new Map(profile.parameters.map((p) => [Number(/^(?:CC|NRPN) (\d+)/.exec(p.description)[1]), p]));
    assert.equal(byNumber.size, profile.parameters.length, 'a number laid out twice');
    for (const row of data.rows) {
      const p = byNumber.get(row.cc);
      if (!p) { assert.ok(notes.includes(`${row.cc} ${row.name}`), `${row.cc} ${row.name} is neither laid out nor named`); continue; }
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const want = row.cc < 128 ? hex([0xb0, row.cc, wire])
          : [[0x63, row.cc >> 7], [0x62, row.cc & 127], ...(r.valueResolution === 14 ? [[0x06, wire >> 7], [0x26, wire & 127]] : [[0x06, wire]])].map(([c, v]) => hex([0xb0, c, v])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want, `${p.id} = ${value}`);
      }
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Tasty Chips' manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Tasty Chips');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.generated, /^Generated from src\/midi\.rs enum Nrpn \(firmware 1\.8\.0\)\.$/);
  });
}

test('the two manuals print the same table: the same rows, read the same, but where they say they differ', () => {
  const [gr2, mega] = ['gr-2', 'gr-mega'].map((n) => BUILT.find((b) => b.name === n).data.rows);
  assert.deepEqual(gr2.map((r) => r.cc), mega.map((r) => r.cc));
  const differ = gr2.filter((r, k) => r.name !== mega[k].name || r.range !== mega[k].range || r.section !== mega[k].section).map((r) => r.cc);
  assert.deepEqual(differ, [], 'names, ranges and sections');
  const gr2Profile = BUILT.find((b) => b.name === 'gr-2').profile;
  assert.ok(gr2Profile.authoringNotes.some((n) => /1153 LP SLOPE, 1154 HP SLOPE/.test(n)), 'the GR-MEGA-only rows are named in the GR-2\'s');
});
