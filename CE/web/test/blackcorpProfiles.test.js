/**
 * The Black Corporation profiles: generated from the MIDI CC chart at the end of each instrument's
 * operation manual by tools/profiles/blackcorp/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every parameter is the
 * controller its row prints, on its block's channel, with the values the chart gives it.
 *
 * The reader is checked on lines made by hand: a range column, a layer column, a channel heading, a
 * name set a few points above its number and broken inside a word.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readChart } from '../../../tools/profiles/blackcorp/read-black-chart.mjs';
import { bareName, readRange } from '../../../tools/profiles/blackcorp/build-black-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/blackcorp/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('a chart: its rows, the range and layer cells told apart by what they hold, a channel heading, a broken name', () => {
  const rows = readChart([
    line(1, 60, [75, 'Some'], [102, 'prose'], [134, 'above']),
    line(1, 72, [72, 'MIDI'], [96, 'CC'], [112, 'CHART']),
    line(1, 124, [75, 'MIDI'], [99, 'CC'], [131, 'RANGE'], [310, 'FUNCTION']),
    line(1, 144, [75, 'CC0'], [131, '0-8'], [310, 'BANK'], [337, 'SELECT']),
    line(1, 203, [75, 'CC8'], [131, '0-64-127'], [310, 'SLIDER'], [343, 'MIX'], [362, 'I'], [366, '/'], [372, 'II']),
    line(1, 223, [75, 'CC9'], [131, '0-64'], [152, '/'], [157, '65-127'], [310, 'SUSTAIN'], [349, 'SWITCH']),
    line(1, 243, [76, 'CC5'], [152, 'SLIDER'], [185, 'PORTAMENTO'], [382, 'UPPER']),
    line(1, 270, [100, 'CHANNEL'], [140, '2']),
    line(1, 290, [86, 'CC48'], [143, 'BUTTON_OSC2_S'], [221, 'YNC']),
    line(1, 309, [143, 'BUTTON_LFO_PHASE']),
    line(1, 313, [86, 'CC46']),
  ]);
  assert.deepEqual(rows, [
    { page: 1, cc: 0, range: '0-8', name: 'BANK SELECT' },
    { page: 1, cc: 8, range: '0-64-127', name: 'SLIDER MIX I / II' },
    { page: 1, cc: 9, range: '0-64 / 65-127', name: 'SUSTAIN SWITCH' },
    { page: 1, cc: 5, name: 'SLIDER PORTAMENTO', layer: 'UPPER' },
    { page: 1, cc: 48, name: 'BUTTON_OSC2_SYNC', block: 'CHANNEL 2' },
    { page: 1, cc: 46, name: 'BUTTON_LFO_PHASE', block: 'CHANNEL 2' },
  ]);
  assert.deepEqual(bareName('SLIDER VCF HPF A'), { kind: 'SLIDER', name: 'VCF HPF A' });
  assert.deepEqual(bareName('POT_LFO2_FREQ'), { kind: 'POT', name: 'LFO2 FREQ' });
  assert.deepEqual(bareName('MOD LFO1 TO VCO1'), { kind: null, name: 'MOD LFO1 TO VCO1' });
  assert.deepEqual(readRange('0-64-127'), { lo: 0, hi: 127, centre: 64 });
  assert.deepEqual(readRange('0-64 / 65-127'), { bands: [[0, 64], [65, 127]] });
  assert.deepEqual(readRange('0-21/22-42/43-63/64-84/85-105/106-127').bands.length, 6);
  assert.deepEqual(readRange(''), {});
  assert.throws(() => readRange('0-20/22-127'));
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/blackcorp/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller on its channel, each once, every row laid out or named`, () => {
    const sent = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!sent.has(r.id), `${r.id} twice`);
      sent.add(r.id);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      const ends = p.type === 'choice' ? [[p.choices[0].id, p.choices[0].value], [p.choices.at(-1).id, p.choices.at(-1).value]] : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [v, wire] of ends) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), hex([status, r.controller, wire]), `${p.id} = ${v}`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows) {
      const { name: bare } = bareName(row.name);
      assert.ok(profile.parameters.some((p) => p.name.startsWith(bare) && p.description.startsWith(`Printed: CC${row.cc} `)) || profile.authoringNotes.some((n) => n.includes(`CC ${row.cc} ${row.name}`)), `CC ${row.cc} ${row.name}`);
    }
  });

  test(`${profile.id}: the source is Black Corporation's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Black Corporation');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

test('the Deckard\'s Dream\'s values: bands a choice, each band\'s first value; 0-64-127 centred on 64', () => {
  const dd = BUILT.find((b) => b.profile.id === 'black-corporation-deckards-dream-mk2').profile;
  const byName = (n) => dd.parameters.find((p) => p.name === n);
  assert.deepEqual(byName('FEET1').choices.map((c) => [c.label, c.value]), [["16'", 0], ["8'", 22], ["5 1/3'", 43], ["4'", 64], ["2 2/3'", 85], ["2'", 106]]);
  assert.deepEqual(byName('SQUARE A').choices.map((c) => [c.label, c.value]), [['Off', 0], ['On', 65]]);
  assert.deepEqual([byName('COARSE').default, byName('COARSE').display.min, byName('COARSE').display.max], [64, -64, 63]);
  assert.equal(byName('VCF HPF A').group, 'VCF I');
  assert.equal(byName('VCF HPF B').group, 'VCF II');
});

test('the Xerxes\'s two channels and the names printed twice', () => {
  const x = BUILT.find((b) => b.profile.id === 'black-corporation-xerxes-mk2').profile;
  const chan = (n) => x.messageRecipes.find((r) => r.id === x.parameters.find((p) => p.name === n).messageRecipe);
  assert.deepEqual([chan('LFO FREQ').channel, chan('LFO FREQ').controller], ['$channel', 40]);
  assert.deepEqual([chan('LFO SYNC').channel, chan('LFO SYNC').controller], ['$secondChannel', 40]);
  assert.ok(x.parameters.some((p) => p.name === 'LFO2 FREQ (CC 60)') && x.parameters.some((p) => p.name === 'LFO2 FREQ (CC 81)'));
  const ise = BUILT.find((b) => b.profile.id === 'black-corporation-ise-nin').profile;
  assert.deepEqual(['cc42', 'cc27'].map((id) => ise.parameters.find((p) => p.messageRecipe === id).group), ['Upper VCF', 'Lower VCF']);
});
