/**
 * The Gotharman profiles: generated from the Anamono manual's parameter list (every parameter by
 * NRPN) and the LD instruments' lists of parameters controllable by CC (LD3, LD Zero, Tiny LD,
 * SpazeBoard6) by tools/profiles/gotharman/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every row is its NRPN or
 * controller, on its channel, at both ends of its range.
 *
 * The readers are checked on lines made by hand, in each manual's shape.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readCcList, readParameterList } from '../../../tools/profiles/gotharman/read-gotharman-manual.mjs';
import { valuesOf } from '../../../tools/profiles/gotharman/build-gotharman-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/gotharman/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
const HEADER = (page, y) => line(page, y, [68, 'Parameter'], [177, 'Values'], [270, 'MIDI'], [303, 'ctrl'], [366, 'NRPN'], [409, '99'], [463, 'NRPN'], [507, '98']);

test('the Anamono\'s list: sections, a row on its numbers\' line, cells wrapping below, a controller\'s set, the MIDI page', () => {
  const rows = readParameterList([
    line(79, 100, [57, 'OSC'], [80, '1']), HEADER(79, 113),
    line(79, 130, [57, 'Pulsewidth'], [107, 'Source'], [154, 'Select'], [185, 'between'], [225, 'the'], [384, '00h'], [481, '05h']),
    line(79, 140, [154, '16'], [167, 'modulation']),
    line(79, 150, [154, 'sources.']),
    line(79, 160, [57, 'Pitch'], [80, 'Mod'], [100, 'Level'], [154, 'Select'], [185, 'between'], [384, '00h'], [481, '0Ah']),
    line(79, 170, [57, 'Source'], [154, '”Off”'], [180, 'and'], [200, '15']),
    line(90, 100, [57, 'MODULATOR'], [110, '1']), HEADER(90, 113),
    line(90, 130, [57, 'Step'], [80, '1'], [88, 'Will'], [154, 'Sustain,'], [193, 'Continue,'], [254, 'Secondary'], [325, '94'], [384, '09h'], [481, '05h']),
    line(90, 140, [154, 'Loop']),
    line(94, 100, [57, 'MIDI']), HEADER(94, 113),
    line(94, 130, [57, 'MIDI'], [80, 'Channel'], [154, '1'], [163, 'to'], [174, '16']),
    line(94, 140, [57, 'NRPN'], [80, 'Mode'], [154, '7'], [163, 'bit,'], [180, '14'], [193, 'bit']),
  ]);
  assert.deepEqual(rows.map((r) => [r.section, r.name, r.values, r.ctrl, r.group, r.msb, r.lsb]), [
    ['OSC 1', 'Pulsewidth Source', 'Select between the 16 modulation sources.', undefined, undefined, 0, 5],
    ['OSC 1', 'Pitch Mod Level Source', 'Select between ”Off” and 15', undefined, undefined, 0, 10],
    ['MODULATOR 1', 'Step 1 Will', 'Sustain, Continue, Loop', 94, 'secondary', 9, 5],
    ['MIDI', 'MIDI Channel', '1 to 16', undefined, undefined, undefined, undefined],
    ['MIDI', 'NRPN Mode', '7 bit, 14 bit', undefined, undefined, undefined, undefined],
  ]);
});

test('the Anamono\'s values: a range from 0, one counted from its low end, sources, names, the byte', () => {
  assert.deepEqual(valuesOf('0 to 255'), { min: 0, max: 255, how: 'range' });
  assert.deepEqual(valuesOf('-128 to +127'), { min: 0, max: 255, shown: { min: -128, max: 127 }, how: 'offset' });
  assert.deepEqual(valuesOf('1 to 256'), { min: 0, max: 255, shown: { min: 1, max: 256 }, how: 'offset' });
  assert.deepEqual(valuesOf('Select between the 16 modulation sources.'), { min: 0, max: 15, how: 'sources' });
  assert.deepEqual(valuesOf('Lpf, Bpf, Hpf').choices, ['Lpf', 'Bpf', 'Hpf']);
  assert.deepEqual(valuesOf('On/Off').choices, ['On', 'Off']);
  assert.deepEqual(valuesOf('0 to -255'), { min: 0, max: 255, how: 'byte' });
  assert.deepEqual(valuesOf('Morph from sine to triangle to sawtooth to square to noise.'), { min: 0, max: 255, how: 'byte' });
});

test('an LD list: part rows, the instrument\'s, a name going on below, a page break', () => {
  const rows = readCcList(['PARAMETER                       CC#         PART NUMBER', 'Oscillator1 Wave/Sampler        19          MIDI channel 1-8', 'Start', '                                     617', '\fPARAMETER                 CC#         PART NUMBER', 'VCF1 Reso                 56          -', 'The effects parameters are on the effects pages:'].join('\n'));
  assert.deepEqual(rows, [{ name: 'Oscillator1 Wave/Sampler Start', cc: 19, parts: 8 }, { name: 'VCF1 Reso', cc: 56, parts: 0 }]);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data, layout } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/gotharman/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its NRPN or controller, on its channel, at both ends`, () => {
    const notes = profile.authoringNotes.join('\n');
    let laidOut = 0;
    for (const row of data.rows) {
      if (layout.form === 'nrpn' && row.msb == null) { assert.ok(notes.includes(row.name), `${row.name} is neither laid out nor named`); continue; }
      const p = profile.parameters.find((x) => (layout.form === 'nrpn' ? x.description.startsWith(`NRPN ${hex([row.msb])}h ${hex([row.lsb])}h `) : x.description.startsWith(`CC ${row.cc}:`)));
      assert.ok(p, `${row.name} is not laid out`);
      laidOut++;
      const status = 0xb0 + (row.parts ? profile.variables.partChannel : profile.variables.channel) - 1;
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const want = layout.form === 'nrpn' ? [[0x63, row.msb], [0x62, row.lsb], [0x06, wire >> 7], [0x26, wire & 127]] : [[row.cc, wire]];
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want.map(([c, x]) => hex([status, c, x])).join('\n'), `${p.id} = ${value}`);
      }
      if (layout.form === 'nrpn') assert.ok(p.range ? p.range.max <= 255 : p.choices.length <= 256, `${p.id}: an 8-bit value`);
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Gotharman's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Gotharman');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/gotharman\.dk\/onewebmedia\//);
  });
}
