/**
 * The Modor profiles: generated from the MIDI chapters of three user manuals (NF-1, NF-1k, DR-2) by
 * tools/profiles/modor/, and checked here that what is committed is what the generator makes, that
 * the app's validator finds nothing wrong, and that every received row is its controller, every DR-2
 * parameter without one its NRPN, or is named.
 *
 * The reader is checked on words made by hand in the manuals' shape: a raised footnote mark beside a
 * name that ends in a digit, a remark going on below, the notes under the table.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { linesOf, readControllerList, readFormantTable, readNrpnTable } from '../../../tools/profiles/modor/read-modor-manual.mjs';
import { SYNTHS, build } from '../../../tools/profiles/modor/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

// A word 9 points high at its line's top; a raised mark 6 points high, a point and a half above it.
const word = (x, y, text, raised = false) => `<word xMin="${x}" yMin="${raised ? y - 1.5 : y}" xMax="${x + text.length * 5}" yMax="${raised ? y + 4.7 : y + 9}">${text}</word>`;
const page = (...words) => `<page width="595" height="842">${words.join('')}</page>`;

test('the controller list: a raised mark is a footnote, a name\'s own digit is not; a remark going on below', () => {
  const lines = linesOf(page(
    word(40, 100, 'Control'), word(90, 100, 'Function'), word(300, 100, 'Transmitted'), word(360, 100, 'Received'), word(420, 100, 'Remarks'),
    word(50, 112, '0'), word(90, 112, 'Bank'), word(115, 112, 'Select'), word(150, 112, '1', true), word(300, 112, 'No'), word(360, 112, 'Yes'),
    word(50, 124, '7'), word(90, 124, 'Volume'), word(300, 124, 'No'), word(360, 124, 'Yes'), word(420, 124, 'Digital'), word(460, 124, 'patch'), word(490, 124, 'vol-'),
    word(420, 136, 'ume'),
    word(50, 148, '78'), word(90, 148, 'ENV'), word(110, 148, '1'), word(120, 148, 'T1'), word(300, 148, 'Yes'), word(360, 148, 'Yes'),
    word(40, 300, '1', true), word(50, 300, 'Bank'), word(75, 300, 'Select'), word(105, 300, '0:'), word(120, 300, 'drumsets'),
    word(40, 312, 'and'), word(60, 312, 'patterns.'),
  ));
  const { rows, notes } = readControllerList(lines);
  assert.deepEqual(rows.map((r) => [r.cc, r.name, r.received, r.remarks]), [[0, 'Bank Select', true, ''], [7, 'Volume', true, 'Digital patch volume'], [78, 'ENV 1 T1', true, '']]);
  assert.deepEqual(notes, { 1: 'Bank Select 0: drumsets and patterns.' });
  assert.deepEqual(rows[0].notes, ['Bank Select 0: drumsets and patterns.']);
});

test('the formant table and the DR-2\'s NRPNs, set side by side', () => {
  const formants = readFormantTable(['                Midi CC#      A     E     O', ' Formant 1     106-110-114    49    32    35', ' Formant Vol     41-42-43     52   125    32', ''].join('\n'));
  assert.deepEqual(formants, { vowels: ['A', 'E', 'O'], rows: [{ name: 'Formant 1', controllers: [106, 110, 114], values: [49, 32, 35] }, { name: 'Formant Vol', controllers: [41, 42, 43], values: [52, 125, 32] }] });
  const nrpn = readNrpnTable(['                                  NRPN LSB      Parameter', '                                      0         Pitch ENV decay', '   NRPN MSB       Instrument', '                                     14         Y parameter', '      0                A', '      1                B'].join('\n'));
  assert.deepEqual(nrpn, { instruments: [{ msb: 0, instrument: 'A' }, { msb: 1, instrument: 'B' }], parameters: [{ lsb: 0, name: 'Pitch ENV decay' }, { lsb: 14, name: 'Y parameter' }] });
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data, layout } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/modor/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every received row is its controller, each drum parameter without one its NRPN, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    let laidOut = 0;
    for (const row of data.rows.filter((r) => r.name)) {
      const p = profile.parameters.find((x) => x.description.startsWith(`CC ${row.cc} (`));
      if (!p) { assert.ok(notes.includes(`${row.name} (CC ${row.cc})`), `CC ${row.cc} ${row.name} is neither laid out nor named`); continue; }
      assert.ok(row.received, `CC ${row.cc} is laid out but not received`);
      laidOut++;
      for (const v of [0, 127]) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), hex([0xb0, row.cc, v]), `${p.id} = ${v}`);
    }
    for (const { msb, instrument } of data.nrpn?.instruments ?? []) {
      for (const { lsb, name: parameter } of data.nrpn.parameters) {
        const p = profile.parameters.find((x) => x.description.startsWith(`NRPN ${msb}/${lsb} `));
        if (layout.alsoControllers[lsb]) { assert.equal(p, undefined); assert.ok(profile.parameters.some((x) => x.name === `Drum ${instrument} ${layout.alsoControllers[lsb]}`), `Drum ${instrument} ${layout.alsoControllers[lsb]}`); continue; }
        assert.equal(p?.name, `Drum ${instrument} ${parameter}`);
        laidOut++;
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: 127 })), [[0x63, msb], [0x62, lsb], [0x06, 127]].map(([c, x]) => hex([0xb0, c, x])).join('\n'));
      }
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Modor's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Modor');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/modormusic\.com\/downloads\//);
  });
}

test('the NF-1: the formant controllers carry the preset vowels; a footnote reaches its row', () => {
  const nf1 = BUILT.find((b) => b.name === 'nf-1').profile;
  assert.match(nf1.parameters.find((p) => p.name === 'Vowel 2 formant 3').description, /A 92, E 90, O 90, I 94/);
  assert.ok(nf1.authoringNotes.some((n) => /Sustain pedal \(CC 64\)/.test(n)));
  assert.equal(BUILT.find((b) => b.name === 'dr-2').profile.parameters.length, 72 + 1 + 6 * 23);
});
