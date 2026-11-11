/**
 * The Groove Synthesis 3rd Wave profile: generated from the NRPN table of its MIDI CC + SysEx Spec by
 * tools/profiles/groove/, and checked here that what is committed is what the generator makes, that
 * the app's validator finds nothing wrong, and that every parameter is the NRPN its row prints.
 *
 * The reader is checked on lines made by hand, in the table's shape: a row's description set over
 * several lines around its number, the next row's title straight after the last row's values.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readNrpnTable } from '../../../tools/profiles/groove/read-groove-spec.mjs';
import { valuesIn } from '../../../tools/profiles/groove/build-groove-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/groove/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('the NRPN table: a description around its number, the next title after the values, run-ons, a range set above its row', () => {
  const rows = readNrpnTable([
    line(19, 630, [74, '37'], [122, 'Single'], [188, '0-24'], [256, 'Pitch'], [283, 'bend'], [311, 'range']),
    line(19, 648, [256, 'Velocity'], [297, 'strength']),
    line(19, 661, [256, '0:'], [268, 'off']),
    line(19, 673, [256, '1:'], [268, 'light']),
    line(19, 699, [74, '38'], [122, 'Single'], [188, '0-2'], [256, '2:'], [268, 'heavy']),
    line(19, 712, [256, '3:'], [268, 'piano']),
    line(19, 737, [256, 'Pressure'], [300, 'curve']),
    line(19, 750, [256, '0:'], [268, 'off']),
    line(19, 763, [74, '39'], [122, 'Single'], [188, '0-1'], [256, '1:'], [268, 'normal']),
    line(19, 790, [188, '0-2'], [207, '(0:'], [223, 'off,']),
    line(19, 803, [188, 'CC,'], [210, '2:']),
    line(19, 816, [74, '446'], [122, 'Global'], [188, 'NRPN)'], [256, 'MIDI'], [282, 'param'], [316, 'send']),
    line(20, 75, [74, '253'], [122, 'Mutli'], [188, '0-100'], [256, 'Osc'], [276, '#2'], [290, 'fine']),
  ], { category: 110, range: 180, description: 256 });
  assert.deepEqual(rows.map((r) => [r.nrpn, r.category, r.range, r.description]), [
    [37, 'Single', '0-24', 'Pitch bend range'],
    [38, 'Single', '0-2', 'Velocity strength | 0: off | 1: light | 2: heavy | 3: piano'],
    [39, 'Single', '0-1', 'Pressure curve | 0: off | 1: normal'],
    [446, 'Global', '0-2 (0: off, CC, 2: NRPN)', 'MIDI param send'],
    [253, 'Multi', '0-100', 'Osc #2 fine'],
  ]);
  assert.equal(rows.at(-1).printed, 'Mutli');
});

test('the values a description lists', () => {
  assert.deepEqual(valuesIn('Velocity strength | 0: velocity off | 1: light'), [{ value: 0, label: 'velocity off' }, { value: 1, label: 'light' }]);
  assert.deepEqual(valuesIn('Unison legato part 1 | 0=off | 1=on | 2=legato slide').map((v) => v.label), ['off', 'on', 'legato slide']);
  assert.deepEqual(valuesIn('Envelope shape: | 0 = exponential, | 1 = ppg style').map((v) => v.label), ['exponential', 'ppg style']);
  assert.deepEqual(valuesIn('(0: off, 1: CC, 2: NRPN)').map((v) => v.label), ['off', 'CC', 'NRPN']);
  assert.deepEqual(valuesIn('LPF envelope amount | 0 to 126 = -127 to -1 | 127 = 0'), []);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/groove/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its NRPN at both ends of its range, each once, every row laid out or named`, () => {
    const nrpns = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const n = r.parameterMsb * 128 + r.parameterLsb;
      assert.ok(!nrpns.has(n), `NRPN ${n} twice`);
      nrpns.add(n);
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => hex([0xb0, c, v])).join('\n'), `${p.id} = ${value}`);
    }
    for (const t of profile.tests.filter((x) => !x.kind)) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    const spans = profile.authoringNotes.flatMap((n) => [...n.matchAll(/NRPN (\d+) - (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    const named = (k) => profile.authoringNotes.some((n) => new RegExp(`\\b${k}\\b`).test(n)) || spans.some(([a, b]) => k >= a && k <= b);
    for (const row of data.nrpn) assert.ok(nrpns.has(row.nrpn) || named(row.nrpn), `NRPN ${row.nrpn}`);
  });

  if (profile.dumpDefinitions) {
    test(`${profile.id}: Pull asks for the edit buffer and reads its records back, part 1's for a Multi parameter`, () => {
      const request = profile.tests.find((t) => t.kind === 'request');
      const compiled = localCompileDeviceRequest(profile, { request: request.request });
      assert.ok(compiled.ok, compiled.error);
      assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, request.expectedHex);
      for (const vector of profile.tests.filter((t) => t.kind === 'dumpParse')) {
        const parsed = localParseDumpMessage(profile, vector.inputHex);
        assert.ok(parsed.ok, parsed.error);
        assert.deepEqual(Object.keys(parsed.values).sort(), Object.keys(vector.expectedValues).sort(), 'a record no parameter reads is passed over; a parameter the dump lacks stays unread');
        for (const [id, value] of Object.entries(vector.expectedValues)) assert.equal(parsed.values[id], value, `${vector.name}: ${id}`);
      }
      // Every parameter read from the dump is one the profile can also send, and every one but Edit part is read.
      const readable = profile.parameters.filter((p) => p.access.canRead).map((p) => p.id);
      assert.deepEqual(profile.dumpDefinitions[0].mappings.map((m) => m.parameter), readable);
      assert.equal(readable.length, profile.parameters.length - 1);
    });
  }

  test(`${profile.id}: the source is Groove Synthesis's spec, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Groove Synthesis');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

test('the 3rd Wave: value lists, the mod matrix\'s sources and destinations, signed ranges, 14 bits past 127', () => {
  const tw = BUILT[0].profile;
  const byName = (n) => tw.parameters.find((p) => p.name === n);
  assert.deepEqual(byName('Velocity strength').choices.map((c) => c.label), ['velocity off', 'light', 'medium', 'heavy', 'half at 84', 'piano']);
  assert.equal(byName('Mod #1 destination').choices.length, 127);
  assert.equal(byName('Mod #1 source').choices.at(-1).label, 'MIDI Breath Control');
  const amount = byName('LPF envelope amount');
  assert.deepEqual([amount.range, amount.display.min, amount.display.max, amount.default], [{ min: 0, max: 254 }, -127, 127, 127]);
  assert.equal(lines(localCompileParameter(tw, { parameterId: amount.id, value: 254 })), 'B0 63 01\nB0 62 01\nB0 06 01\nB0 26 7E');
  const tempo = byName('Tempo bpm in decimal multiplied by 10');
  assert.deepEqual(tempo.range, { min: 200, max: 2400 });
  assert.equal(byName('Edit part').choices.length, 16);
  assert.ok(byName('Sequencer quantization'), 'NRPN 460, which replaces a deprecated row, is kept');
  assert.ok(tw.authoringNotes.some((n) => /NRPN 1 - 32/.test(n)));
});
