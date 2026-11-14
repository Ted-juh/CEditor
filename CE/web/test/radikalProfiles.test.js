/**
 * The Radikal Technologies Delta CEP A / A2 profile: generated from its manual's MIDI controller table
 * by tools/profiles/radikal/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every row is its controller at both ends of
 * its range (the tune's MSB and LSB one 14-bit value).
 *
 * The reader is checked on text made by hand in the table's shape: its header moving between pages,
 * a row without a range, the page's number, a ligature the text layer loses.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readControllerTable } from '../../../tools/profiles/radikal/read-radikal-manual.mjs';
import { namedValues } from '../../../tools/profiles/radikal/build-radikal-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/radikal/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('the table: the header moving between pages, a row without a range, the page number, a lost ligature', () => {
  const rows = readControllerTable([
    '     CC        Bereich          Neutral   Parameter',
    '     29        0-127                      LFO Speed',
    '     30        0-127            64        LFO Modulation Depth',
    '     3         0-127                      VCF Cuto',
    '                                                                                              54 of 71',
    'ff',
    '\f     CC      Bereich        Neutral    Parameter',
    '     90                                Delay Time LSB (lower 3 Bits, send before coarse value)',
    '     27      0-2            0          Paraphonic OFF/ON1/ON2',
    '           8.1.      MIDI program changes',
    '     64 and 103 call up ROM memories',
  ].join('\n'), { ligatures: { Cuto: 'Cutoff' }, firstPage: 54 });
  // Each row with its PDF page: 54, and 55 after the form feed that ends it.
  assert.deepEqual(rows, [
    { cc: 29, range: '0-127', neutral: null, parameter: 'LFO Speed', page: 54 },
    { cc: 30, range: '0-127', neutral: 64, parameter: 'LFO Modulation Depth', page: 54 },
    { cc: 3, range: '0-127', neutral: null, parameter: 'VCF Cutoff', page: 54 },
    { cc: 90, range: null, neutral: null, parameter: 'Delay Time LSB (lower 3 Bits, send before coarse value)', page: 55 },
    { cc: 27, range: '0-2', neutral: 0, parameter: 'Paraphonic OFF/ON1/ON2', page: 55 },
  ]);
  assert.deepEqual(namedValues('FX Type (0:TapeDly, 1:TapDly)', { min: 0, max: 1 }), { name: 'FX Type', values: [{ value: 0, label: 'TapeDly' }, { value: 1, label: 'TapDly' }] });
  assert.equal(namedValues('VCF Filter Band (Bit[0]=LP, Bit[1]=BP, Bit[2]=HP)', { min: 0, max: 7 }), null);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/radikal/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its controller at both ends of its range, the tune one 14-bit value`, () => {
    let laidOut = 0;
    for (const row of data.rows) {
      const p = profile.parameters.find((x) => x.description.startsWith(`CC ${row.cc}:`) || x.description.startsWith(`CC ${row.cc} (MSB)`));
      if (!p) { assert.ok(profile.parameters.some((x) => x.description.includes(`and CC ${row.cc} (LSB)`)), `CC ${row.cc} is not laid out`); continue; }
      laidOut++;
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const want = r.lsbController != null ? [[row.cc, wire >> 7], [r.lsbController, wire & 127]] : [[row.cc, wire]];
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want.map(([c, x]) => hex([0xb0, c, x])).join('\n'), `${p.id} = ${value}`);
      }
      if (row.range && r.lsbController == null) assert.equal(`${p.type === 'choice' ? p.choices[0].value : p.range.min}-${p.type === 'choice' ? p.choices.at(-1).value : p.range.max}`, row.range, p.id);
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Radikal's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Radikal Technologies');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/www\.radikaltechnologies\.com\//);
  });
}
