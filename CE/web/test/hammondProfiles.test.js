/**
 * The Hammond profiles (SK1/SK2, SKX, XK-1c): generated from the MIDI INFORMATION appendix of each
 * owner's manual by tools/profiles/hammond/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, that every parameter is the NRPN
 * its row prints (or, where the NRPN and the address disagree, the one no other row has), and that
 * the manuals' own examples come out as printed.
 *
 * The reader is checked on lines made by hand, in the appendix's shape: a row's codes, its data going
 * on below, a list printed in two columns with a label that wraps, and an example under the table.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readExamples, readPlaceholders, readTables } from '../../../tools/profiles/hammond/read-hammond-tables.mjs';
import { readData, valueOf } from '../../../tools/profiles/hammond/build-hammond-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/hammond/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 3, text: t })) });
const codes = (x, ...cs) => cs.map((c, k) => [x + k * 18, c]);

test('the tables: a row\'s codes, its data going on below, a list in two columns, an example set apart', () => {
  const lines = [
    line(143, 87, [42, 'Global'], [99, 'Parameters']),
    line(143, 111, [56, 'Category'], [118, 'Parameter'], [189, 'NRPN'], [229, 'SysEx'], [249, 'Address'], [284, 'SysEx'], [345, 'Data'], [399, 'Default'], [448, 'Description']),
    line(143, 120, [179, 'LSB'], [206, 'MSB'], [234, 'MSB'], [250, 'to'], [259, 'LSB'], [282, 'Length']),
    line(143, 130, [178, '(62)'], [207, '(63)']),
    line(143, 140, [45, 'Tune'], [101, 'Transpose'], ...codes(181, '01', '00', '00', '01', '00', '01'), [310, '3A'], [320, '-'], [324, '40'], [333, '-'], [337, '46'], [398, '40'], [427, '0']),
    line(143, 149, [310, '(-6'], [324, '-'], [330, '0'], [336, '-'], [342, '6)']),
    line(143, 160, [45, 'Foot'], [62, 'Switch'], [101, 'FS'], [113, 'Tip'], [128, 'Mode'], ...codes(181, '03', '01', '00', '03', '01', '01'), [310, '00'], [318, '-'], [322, '27'], [398, '01'], [427, 'Leslie']),
    line(143, 169, [310, '00:'], [322, 'Off'], [362, '09:'], [374, 'Shock']),
    line(143, 178, [310, '01:'], [322, 'Leslie'], [343, 'Fast'], [362, '0A:'], [374, 'Delay']),
    line(143, 187, [314, '(alternate)']),
    line(143, 200, [45, 'Set'], [62, 'Transpose'], [101, 'at'], [110, '0'], [116, 'via'], [131, 'NRPN'], [150, '.......'], [181, 'Bx'], [193, '62'], [205, '01'], [217, '63'], [229, '00'], [241, '06'], [253, '40']),
    line(143, 210, [45, 'Example'], [80, '“n”'], [96, 'means'], [120, 'Zone'], [140, 'number.'], [170, '1=0,'], [190, '2=1,'], [210, '3=2']),
  ];
  const rows = readTables(lines);
  assert.deepEqual(rows.map((r) => [r.category, r.name, r.codes.join(' '), r.data, r.default]), [
    ['Tune', 'Transpose', '01 00 00 01 00 01', ['3A - 40 - 46 (-6 - 0 - 6)'], '40'],
    ['Foot Switch', 'FS Tip Mode', '03 01 00 03 01 01', ['00 - 27', '00: Off', '01: Leslie Fast (alternate)', '09: Shock', '0A: Delay'], '01'],
  ]);
  assert.deepEqual(readExamples(lines).map((e) => e.text), ['Set Transpose at 0 via NRPN … Bx 62 01 63 00 06 40']);
  assert.deepEqual(readPlaceholders(lines), { n: { name: 'Zone', values: [{ label: '1', value: 0 }, { label: '2', value: 1 }, { label: '3', value: 2 }] } });
});

test('the data: ranges, two-byte values, named pairs, lists that name every value, shown values', () => {
  assert.equal(valueOf('0338'), 440);
  assert.deepEqual(readData(['032E - 0338 - 0342 (430 - 440 - 450)']), { min: 430, max: 450, center: 440, text: '032E - 0338 - 0342 (430 - 440 - 450)', shown: { min: 430, max: 450, unit: '' } });
  assert.deepEqual(readData(['00, 01 (Slow / Fast)']).choices, [{ value: 0, label: 'Slow' }, { value: 1, label: 'Fast' }]);
  assert.deepEqual(readData(['00 - 0F (1 - 16)']).shown, { min: 1, max: 16, unit: '' });
  assert.equal(readData(['00 - 04 (6.1 - 7.25Hz)']).shown, undefined, 'not integers as wide as the range');
  assert.deepEqual(readData(['00 - 02', '00: Normal', '01: Muted', '02: Synth 1']).choices.map((c) => c.label), ['Normal', 'Muted', 'Synth 1']);
  assert.equal(readData(['00 - 25', '00: Off', '01: Glide', '02 - 25: Bass 1C - 3C']).choices, undefined, 'a list with a range in it does not name every value');
  assert.deepEqual(readData(['00 - 01', '00: Pedal (normal)', '01: Pedal (reverse)', '02: MIDI']).listedBeyond, { min: 0, max: 2 });
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/hammond/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its NRPN (or drawbar controller) at both ends, each once`, () => {
    const seen = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!seen.has(r.id), `${r.id} twice`);
      seen.add(r.id);
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const want = r.kind === 'cc' ? hex([0xb0, r.controller, wire])
          : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], ...(r.valueResolution === 14 ? [[0x06, wire >> 7], [0x26, wire & 127]] : [[0x06, wire]])].map(([c, v]) => hex([0xb0, c, v])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want, `${p.id} = ${value}`);
      }
      // An NRPN row's NRPN is its printed one or its address's last two bytes, never another's.
      if (r.kind === 'nrpn') assert.match(p.description, new RegExp(`NRPN LSB ${hex([r.parameterLsb])}, MSB ${hex([r.parameterMsb])}`));
    }
  });

  test(`${profile.id}: the manual's NRPN examples, sent as printed`, () => {
    const examples = data.examples.filter((e) => /via NRPN/.test(e.text));
    assert.ok(examples.length >= 2);
    for (const e of examples) {
      const bytes = /Bx ((?:[0-9A-F]{2} ?)+)/.exec(e.text)[1].trim().split(' ');
      const printed = new Set(Array.from({ length: bytes.length / 2 }, (u, i) => `B0 ${bytes[i * 2]} ${bytes[i * 2 + 1]}`));
      const t = profile.tests.find((x) => x.name.includes(e.text.split(' … ')[0]));
      assert.ok(t, e.text);
      const sent = lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })).split('\n');
      // Every message sent is one the example prints; what it prints besides is an LSB of 0 (`26 00`).
      for (const m of sent) assert.ok(printed.has(m), `${e.text}: ${m}`);
      for (const m of printed) assert.ok(sent.includes(m) || m === 'B0 26 00', `${e.text}: ${m} not sent`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Hammond's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Hammond');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.deepEqual([profile.identity.manufacturerId, profile.identity.familyCode], [['55'], ['00', '10']]);
    assert.equal(profile.parameters.filter((p) => p.group === 'Drawbars').length, 20);
  });
}

test('the SK1/SK2: Vibrato On Swell takes its address (the SKX prints it so), Master Tune is two 7-bit bytes', () => {
  const sk = BUILT.find((b) => b.name === 'sk1-sk2').profile;
  const swell = sk.parameters.find((p) => p.name === 'Vibrato On Swell');
  assert.match(swell.description, /NRPN LSB 09, MSB 02/);
  const skx = BUILT.find((b) => b.name === 'skx').data;
  assert.deepEqual(skx.rows.find((r) => r.name === 'Vibrato On Swell').codes.slice(0, 2), ['09', '02']);
  const tune = sk.parameters.find((p) => p.name === 'Master Tune');
  assert.deepEqual([tune.range, tune.default, tune.encoding.type], [{ min: 430, max: 450 }, 440, 'u14']);
  assert.equal(lines(localCompileParameter(sk, { parameterId: tune.id, value: 440 })), 'B0 63 02\nB0 62 01\nB0 06 03\nB0 26 38');
});
