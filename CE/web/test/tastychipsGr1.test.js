/**
 * The Tasty Chips GR-1 profile: generated from the MIDI Command table of its user manual by
 * tools/profiles/tastychips/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every CC row is its control change, or its
 * NRPN above 127, at both ends of its range, or is named.
 *
 * The reader is checked on lines made by hand, in the table's shape: a header over three lines,
 * cells set vertically centred on their row, a row with `-` for a number, a run of numbers, a page
 * number, and the page after the table.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readGr1Table } from '../../../tools/profiles/tastychips/read-gr1-table.mjs';
import { namedValues, spanOf } from '../../../tools/profiles/tastychips/build-gr1-profile.mjs';
import { build } from '../../../tools/profiles/tastychips/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 4, text: t })) });

test('the table: a header over three lines, centred cells, `-` for a number, a run, a page number', () => {
  const rows = readGr1Table([
    line(89, 84, [58, 'MIDI'], [202, 'Comman'], [499, 'Control']),
    line(89, 92, [99, 'GR-1'], [121, 'parameter'], [242, 'Value'], [288, 'Range/description']),
    line(89, 99, [58, 'msg.'], [202, 'd'], [210, '/'], [216, 'CC'], [499, 'curve']),
    line(89, 122, [58, 'Pitch'], [99, 'Pitch'], [121, 'bend'], [219, '-'], [244, '0'], [251, '–'], [258, '16383'], [499, '2^n']),
    line(89, 129, [58, 'bend']),
    line(89, 610, [499, 'cubic']),
    line(89, 617, [58, 'CC'], [99, 'Attack'], [126, 'time'], [216, '23'], [250, '0'], [257, '-'], [262, '127'], [288, '0'], [295, 'ms']),
    line(89, 624, [499, '(special)']),
    line(89, 700, [300, '89']),
    line(92, 100, [58, 'CC'], [99, 'Scan'], [121, 'part'], [140, '1..4'], [206, '140-143'], [250, '0-127'], [288, '-2.0'], [305, '..'], [312, '+2.0'], [499, 'linear']),
    line(93, 120, [99, 'MOD'], [120, 'TIMBRE']),
    line(93, 126, [58, 'CC'], [216, '203'], [250, '0-127'], [499, 'Linear']),
    line(93, 132, [99, '-PANSPRAY']),
    line(93, 300, [58, 'Precision'], [100, 'MIDI:']),
    line(93, 320, [58, 'CC'], [216, '999']),
  ]);
  assert.deepEqual(rows.map((r) => [r.msg, r.name, r.cc, r.value, r.curve]), [
    ['Pitch bend', 'Pitch bend', '-', '0 – 16383', '2^n'],
    ['CC', 'Attack time', '23', '0 - 127', 'cubic (special)'],
    ['CC', 'Scan part 1..4', '140-143', '0-127', 'linear'],
    ['CC', 'MOD TIMBRE -PANSPRAY', '203', '0-127', 'Linear'],
  ]);
});

test('named values, bands, a list that stops short; ranges', () => {
  assert.deepEqual(namedValues('0:SINE, 1:RAND, 2:SAW, 3:SQR').map((n) => n.label), ['SINE', 'RAND', 'SAW', 'SQR']);
  assert.deepEqual(namedValues('0:OFF, >0:ON').map((n) => [n.value, n.band]), [[0, false], [1, true]]);
  assert.deepEqual(namedValues('0: OFF, >=1: ON').map((n) => n.value), [0, 1]);
  assert.equal(namedValues('0:TUNE, 1:POS, 2:SPRAY, 3:SIZE, 4:DENS, 5:CUTOFF, ..'), null);
  assert.deepEqual([spanOf('0 - 127'), spanOf('0–3'), spanOf('0..31'), spanOf('0-1(+)'), spanOf('-')], [{ min: 0, max: 127 }, { min: 0, max: 3 }, { min: 0, max: 31 }, { min: 0, max: 1 }, null]);
});

const { profile, text, out, data } = await build('gr-1');
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

test('tasty-chips-gr-1: the committed profile is what the generator makes', () => {
  assert.equal(readText(out), text, 'stale — run: node tools/profiles/tastychips/make-profiles.mjs gr-1');
});

test('tasty-chips-gr-1: the app\'s own validator finds nothing wrong', () => {
  const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
  assert.deepEqual(errors, []);
});

test('tasty-chips-gr-1: every CC row is its controller, or its NRPN above 127, at both ends, each once, or named', () => {
  const notes = profile.authoringNotes.join('\n');
  const byNumber = new Map(profile.parameters.map((p) => [Number(/^(?:CC|NRPN) (\d+)/.exec(p.description)[1]), p]));
  assert.equal(byNumber.size, profile.parameters.length, 'a number laid out twice');
  let rows = 0;
  for (const row of data.rows) {
    const run = /^(\d+)-(\d+)$/.exec(row.cc);
    const numbers = run ? Array.from({ length: Number(run[2]) - Number(run[1]) + 1 }, (u, k) => Number(run[1]) + k) : [Number(row.cc)];
    for (const cc of numbers) {
      rows++;
      const p = byNumber.get(cc);
      if (!p || row.msg !== 'CC') { assert.ok(notes.includes(`${row.name}${Number.isNaN(cc) ? '' : ` (${cc})`}`), `${row.cc} ${row.name} is neither laid out nor named`); continue; }
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const want = cc < 128 ? hex([0xb0, cc, wire]) : [[0x63, cc >> 7], [0x62, cc & 127], [0x06, wire]].map(([c, v]) => hex([0xb0, c, v])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want, `${p.id} = ${value}`);
      }
    }
  }
  assert.equal(rows, 187);                                     // 178 rows, three of them a run of four
  for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
});

test('tasty-chips-gr-1: a destination list that stops short is a number; a value one less is shown one up', () => {
  const lfo = profile.parameters.find((p) => p.name === 'LFO1 destination');
  assert.deepEqual([lfo.type, lfo.range.max], ['integer', 10]);
  const mul = profile.parameters.find((p) => p.name === 'LFO1MUL');
  assert.deepEqual([mul.range.min, mul.range.max, mul.display.min, mul.display.max], [0, 9, 1, 10]);
});

test('tasty-chips-gr-1: the source is Tasty Chips\' manual, and nobody has tried it on an instrument', () => {
  assert.equal(profile.manufacturer, 'Tasty Chips');
  assert.equal(profile.coverage.verifiedOnHardware, false);
  assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
  assert.equal(data.source.url, 'https://www.tastychips.nl/downloads/GR-1/UserManual/User-manual-GR-1-v3.4.c.pdf');
});
