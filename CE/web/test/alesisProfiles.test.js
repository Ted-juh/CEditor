/**
 * The Alesis A6 Andromeda profile: generated from the SYSEX AND NRPN PARAMETER CHART of its MIDI
 * Sysex Specification by tools/profiles/alesis/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every parameter is the
 * MIDI Editing message its row prints, its value worked out here from the specification's own words
 * (`0xxx xyyy` … `bits 7-13` … `bits 0-6`), not from the engine.
 *
 * The reader is checked on lines made by hand, in the chart's shapes: a row with a range, `any`, no
 * range, `Depends on effect config`, `(not used)`, and the page footer between them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { block, readChart } from '../../../tools/profiles/alesis/read-a6-chart.mjs';
import { nameOf, rangeOf, spans } from '../../../tools/profiles/alesis/build-alesis-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/alesis/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const CHART = [
  'SYSEX AND NRPN PARAMETER CHART',
  '',
  'These values are to be used with Sysex opcode 0x0E Midi Editing or MIDI NRPNs.',
  '                                         07/12/2001',
  '                                                       Parent   Child          Sysex Only Fields',
  '  Index   Parameter Name                               (MSB)    (LSB)   NRPN     Default   Range',
  '    0     CLOCK TEMPO POT                                5        0      ON        250     60 to 65335',
  '    2     CLOCK CLOCK_TAB SWITCH                         5        2      OFF        0      any',
  '',
  'A6 MIDI Sysex Specification _________________Page 18',
  '\f   332   OSC_1 PWMMODDEST POT                          15   52   ON      0',
  '   139   (not used)',
  '   975    DIGFX OUTPUT_ONE POT                         28   22   ON     0     Depends on effect config',
  '   1032   TUNEPAGE MASTERTUNE_POT POT                  37   1    ON    0   -2048 to 2048',
].join('\n');

test('the chart: a row with a range, any, none, an effect\'s, an unused index, across a page', () => {
  const chart = readChart(CHART);
  assert.equal(chart.date, '07/12/2001');
  assert.deepEqual(chart.unread, []);
  assert.deepEqual(chart.pages, [1, 2]);
  assert.deepEqual(chart.rows, [
    { index: 0, page: 1, name: 'CLOCK TEMPO POT', parent: 5, child: 0, nrpn: true, default: 250, range: '60 to 65335' },
    { index: 2, page: 1, name: 'CLOCK CLOCK_TAB SWITCH', parent: 5, child: 2, nrpn: false, default: 0, range: 'any' },
    { index: 332, page: 2, name: 'OSC_1 PWMMODDEST POT', parent: 15, child: 52, nrpn: true, default: 0 },
    { index: 139, page: 2, notUsed: true },
    { index: 975, page: 2, name: 'DIGFX OUTPUT_ONE POT', parent: 28, child: 22, nrpn: true, default: 0, range: 'Depends on effect config' },
    { index: 1032, page: 2, name: 'TUNEPAGE MASTERTUNE_POT POT', parent: 37, child: 1, nrpn: true, default: 0, range: '-2048 to 2048' },
  ]);
});

test('an opcode\'s block, to the next, without the page footer', () => {
  const text = ['      0D - MIDI Mode Select           F0 00 00 0E 1D 0D <mode> F7', '', '       <mode>      = 0 = Program mode; 1 = Mix mode', '', 'A6 MIDI Sysex Specification _________________Page 4', '\f      0E - MIDI Editing'].join('\n');
  assert.deepEqual(block(text, /0D - MIDI Mode Select/, /0E - MIDI Editing/), { pages: [1, 1], lines: ['0D - MIDI Mode Select           F0 00 00 0E 1D 0D <mode> F7', '', ' <mode>      = 0 = Program mode; 1 = Mix mode'] });
});

test('names, ranges and spans as the builder reads them', () => {
  assert.deepEqual(nameOf('OSC_1 TUNESEMITONE POT'), { group: 'OSC 1', name: 'TUNESEMITONE', kind: 'POT' });
  assert.deepEqual(nameOf('KBD_MODE UNISONX_POT POT'), { group: 'KBD MODE', name: 'UNISONX POT', kind: 'POT' });
  assert.deepEqual(rangeOf('-65534 to 65534'), [-65534, 65534]);
  assert.equal(rangeOf('any'), null);
  assert.equal(spans([5, 1, 2, 3, 9, 8]), '1 - 3, 5, 8 - 9');
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
// The specification's words: <data2> `0xxx xyyy`, xxxx the mix channel (0 here) and yyy bits 14-16;
// <data1> bits 7-13; <data0> bits 0-6; `a 17-bit number 2's complement signed number`.
const editing = (parent, child, value) => {
  const bits = value < 0 ? value + 2 ** 17 : value;
  return ['F0', '00', '00', '0E', '1D', '0E', hex(parent), hex(child), hex(Math.floor(bits / 2 ** 14)), hex(Math.floor(bits / 128) % 128), hex(bits % 128), 'F7'].join(' ');
};

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/alesis/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every chart row with a range is its MIDI Editing message at both ends of it, each once; every other row named`, () => {
    const byRecipe = new Map(profile.parameters.map((p) => [p.messageRecipe, p]));
    const laidOut = new Set();
    for (const row of data.chart.rows) {
      const range = rangeOf(row.range);
      if (!range) continue;
      const p = byRecipe.get(`edit${hex(row.parent)}${hex(row.child)}`);
      assert.ok(p, `index ${row.index} ${row.name}`);
      assert.ok(!laidOut.has(p.id), `${p.id} twice`);
      laidOut.add(p.id);
      assert.deepEqual([p.range.min, p.range.max], range, p.id);
      for (const value of range) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.transaction.hex, editing(row.parent, row.child, value), `${p.id} = ${value}`);
      }
    }
    assert.equal(laidOut.size, profile.parameters.length - 1, 'every parameter but Mode is a chart row');
    // Every row not laid out is in a note, by its index or a span holding it.
    const notes = profile.authoringNotes.join('\n');
    const held = [...notes.matchAll(/(\d+) - (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const named = (k) => new RegExp(`(?:^|[^\\d.-])${k}(?![\\d.]| to )`).test(notes) || held.some(([a, b]) => k >= a && k <= b);
    for (const row of data.chart.rows.filter((r) => !rangeOf(r.range))) assert.ok(named(row.index), `index ${row.index} is neither laid out nor named`);
  });

  test(`${profile.id}: the vectors it carries, the specification's own example first`, () => {
    assert.match(profile.tests[0].name, /The specification's example: Set Filter 2 Offset/);
    assert.equal(profile.tests[0].expectedHex, 'F0 00 00 0E 1D 0E 13 08 07 7F 70 F7');
    for (const t of profile.tests) {
      const compiled = localCompileParameter(profile, { parameterId: t.parameter, value: t.value });
      assert.ok(compiled.ok, compiled.error);
      assert.equal(compiled.transaction.hex, t.expectedHex, t.name);
    }
  });

  test(`${profile.id}: the source is Alesis's specification, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Alesis');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.deepEqual([profile.identity.manufacturerId, profile.identity.familyCode, profile.identity.modelNumber], [['00', '00', '0E'], ['1D', '00'], ['00', '00']]);
  });
}

test('the A6: Mode by opcode 0D, a signed knob, the chart\'s misprinted top kept as printed', () => {
  const a6 = BUILT[0].profile;
  const mode = a6.parameters.find((p) => p.id === 'system.mode');
  assert.deepEqual(mode.choices.map((c) => [c.label, c.value]), [['Program', 0], ['Mix', 1]]);
  assert.equal(localCompileParameter(a6, { parameterId: mode.id, value: 'program' }).transaction.hex, 'F0 00 00 0E 1D 0D 00 F7');
  const semitone = a6.parameters.find((p) => p.description.includes('OSC_1 TUNESEMITONE POT'));
  assert.deepEqual([semitone.group, semitone.name, semitone.range], ['OSC 1', 'TUNESEMITONE', { min: -60, max: 60 }]);
  assert.equal(localCompileParameter(a6, { parameterId: semitone.id, value: -60 }).transaction.hex, 'F0 00 00 0E 1D 0E 0F 00 07 7F 44 F7');
  assert.deepEqual(a6.parameters.find((p) => p.id === 'clock.tempo').range, { min: 60, max: 65335 });
  assert.ok(a6.authoringNotes.some((n) => /60 to 65335/.test(n)));
});
