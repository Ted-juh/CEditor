/**
 * The Behringer profiles: generated from the MIDI controller table each guide or manual prints, by
 * tools/profiles/behringer/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every parameter is the controller its row
 * prints.
 *
 * The reader is checked on lines made by hand, in the shapes the guides set their tables: two side
 * by side, a name set over two lines around its number, a row's value bands a line each (under it,
 * or around a number set alone), one list printed beside two rows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { headerTables, readCcTables } from '../../../tools/profiles/behringer/read-behringer-cc.mjs';
import { readBands, readRange } from '../../../tools/profiles/behringer/build-behringer-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/behringer/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { cellsOf, readLineTables } from '../../../tools/profiles/behringer/read-behringer-tables.mjs';
import { readNotes } from '../../../tools/profiles/behringer/build-behringer-nrpn-profile.mjs';

/* ------------------------------------------------------------------ the reader */

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
const roles = (tables) => tables.map((t) => t.cols.map((c) => `${c.role}:${c.title}`));

test('a header gives each table its columns, two side by side apart', () => {
  assert.deepEqual(roles(headerTables(line(1, 100, [40, 'CC'], [52, 'Number'], [100, 'Acts'], [122, 'on'], [200, 'Range'], [300, 'CC'], [312, 'Number'], [360, 'Acts'], [382, 'on'], [460, 'Range']).words)), [
    ['cc:CC Number', 'name:Acts on', 'range:Range'],
    ['cc:CC Number', 'name:Acts on', 'range:Range'],
  ]);
  // The CZ-1 Mini's small type runs its titles together; a word that begins a title begins one.
  assert.deepEqual(roles(headerTables(line(1, 100, [40, 'CC'], [52, 'NUM'], [70, 'PARAMETERS'], [124, 'VALUES']).words)), [['cc:CC NUM', 'name:PARAMETERS', 'range:VALUES']]);
  assert.deepEqual(roles(headerTables(line(1, 100, [40, 'CC'], [55, 'Num'], [80, 'Hex'], [110, 'Continuous'], [165, '-'], [172, 'Coarse'], [230, 'Stepped'], [270, 'params'], [330, 'MIDI'], [355, 'standard']).words)), [
    ['cc:CC Num', 'hex:Hex', 'name:Continuous - Coarse', 'stepped:Stepped params', 'standard:MIDI standard'],
  ]);
  assert.deepEqual(headerTables(line(1, 100, [40, '84'], [60, 'Portamento'], [120, 'CC'], [135, 'Control']).words), [], 'a row of the JN-80\'s table, not a header');
});

test('rows: a number under the CC column, a name set over two lines around it, bands under a row', () => {
  const rows = readCcTables([
    line(1, 100, [40, 'CC'], [52, 'Number'], [100, 'Acts'], [122, 'on'], [200, 'Range']),
    line(1, 110, [45, '3'], [100, 'VCF'], [120, 'ENV'], [140, 'amount'], [200, '0'], [207, '-'], [214, '99']),
    line(1, 120, [100, 'Arpeggiator'], [160, 'Internal']),
    line(1, 127, [45, '109'], [200, '20-240']),
    line(1, 134, [100, 'Clock'], [130, 'BPM']),
    // The Pro-VS Mini's FX Engine: the whole range on its own line, its bands under it.
    line(1, 145, [45, '9'], [100, 'FX'], [115, 'Engine'], [200, '0'], [207, '–'], [214, '127']),
    line(1, 152, [100, 'Chorus'], [200, '0'], [207, '–'], [214, '42']),
    line(1, 159, [100, 'Ensemble'], [200, '43'], [212, '–'], [219, '84']),
    line(1, 166, [100, 'Reverb'], [200, '85'], [212, '–'], [219, '127']),
  ]);
  assert.deepEqual(rows, [
    { page: 1, cc: 3, name: 'VCF ENV amount', range: '0 - 99' },
    { page: 1, cc: 109, name: 'Arpeggiator Internal Clock BPM', range: '20-240' },
    { page: 1, cc: 9, name: 'FX Engine', range: '0 – 127', bands: [{ name: 'Chorus', range: '0 – 42' }, { name: 'Ensemble', range: '43 – 84' }, { name: 'Reverb', range: '85 – 127' }] },
  ]);
});

test('rows: bands set around a number alone, one list beside two rows, a cell flush under a wide title', () => {
  // The JT Mini's Voice Mode: its number alone, its bands above and below it.
  const jt = readCcTables([
    line(1, 100, [40, 'CC'], [100, 'Acts'], [122, 'on'], [200, 'Range']),
    line(1, 110, [45, '39'], [100, 'Envelope'], [145, 'Release'], [200, '0-127']),
    line(1, 125, [100, 'Voice'], [130, 'Mode'], [160, 'Poly'], [200, '0-12']),
    line(1, 132, [45, '40']),
    line(1, 139, [100, 'Voice'], [130, 'Mode'], [160, 'Unison'], [200, '13-37']),
    line(1, 150, [45, '42'], [100, 'Detune'], [200, '0-127']),
  ]);
  assert.deepEqual(jt.map((r) => [r.cc, r.name, r.bands?.map((b) => b.range)]), [[39, 'Envelope Release', undefined], [40, undefined, ['0-12', '13-37']], [42, 'Detune', undefined]]);
  // The Spice's divide-by list, printed once beside both sub-oscillators.
  const list = [0, 1, 2, 3, 4, 5, 6].map((k) => line(1, 105 + k * 7, [200, `${k * 8}-${k * 8 + 7}`], [240, `Divide`], [275, 'by'], [290, String(16 - k)]));
  const spice = readCcTables([
    line(1, 100, [40, 'CC'], [100, 'Action'], [200, 'Range']),
    ...list,
    line(1, 115, [45, '103'], [100, 'Sub'], [120, '1']),
    line(1, 135, [45, '104'], [100, 'Sub'], [120, '2']),
  ].sort((a, b) => a.y - b.y));
  assert.equal(spice.length, 2);
  assert.equal(spice[0].range, spice[1].range, 'both rows have the list');
  assert.match(spice[0].range, /^0-7 Divide by 16 .* 48-55 Divide by 10$/);
  // The PRO-800's: a cell set flush under a title far wider than it (`Glide` under `Continuous -
  // Coarse`) is that column's, nearer the hex column's centre as it is.
  const pro = readCcTables([
    line(1, 100, [40, 'CC'], [55, 'Num'], [80, 'Hex'], [110, 'Continuous'], [165, '-'], [172, 'Coarse'], [230, 'Stepped'], [270, 'params']),
    line(1, 110, [40, '30'], [80, '1E'], [110, 'Glide']),
    line(1, 120, [40, '48'], [80, '30'], [230, 'OSC'], [250, 'A'], [258, 'Saw']),
    line(1, 130, [40, '80'], [80, '50'], [110, 'OSC'], [130, 'A'], [138, 'Freq']),
  ]);
  assert.deepEqual(pro.map(({ page, ...r }) => r), [{ cc: 30, hex: '1E', name: 'Glide' }, { cc: 48, hex: '30', stepped: 'OSC A Saw' }, { cc: 80, hex: '50', name: 'OSC A Freq' }]);
});

test('values: a range, bands, named values, and what is left as printed', () => {
  assert.deepEqual(readRange('0 - 99'), { lo: 0, hi: 99 });
  assert.deepEqual(readRange('20-240'), { lo: 20, hi: 240 });
  assert.deepEqual(readRange('0-63 off; 64-127 on').choices, [{ value: 0, label: 'off' }, { value: 64, label: 'on' }]);
  assert.deepEqual(readRange('0 = Off 64 = On').choices, [{ value: 0, label: 'Off' }, { value: 64, label: 'On' }]);
  assert.deepEqual(readRange('0-64 = off 65 – 127 = on').choices, [{ value: 0, label: 'off' }, { value: 65, label: 'on' }], 'two bands, not `64 = off 65`');
  assert.deepEqual(readRange('0-25 -2, 26-51, -1, 52-76 0, 77-102, +1, 103-127 +2').choices.map((c) => c.label), ['-2', '-1', '0', '+1', '+2'], 'a label keeps its sign');
  assert.deepEqual(readRange('0-32 off, 32-63 sawtooth'), { text: '0-32 off, 32-63 sawtooth', unsure: true }, 'overlapping bands are not a choice');
  assert.deepEqual(readRange('0 off, 1 - 16'), { text: '0 off, 1 - 16' });
  assert.deepEqual(readBands([{ range: '0-12', name: 'Voice Mode – Poly' }, { range: '13-37', name: 'Voice Mode – Unison' }]), { name: 'Voice Mode', choices: [{ value: 0, label: 'Poly' }, { value: 13, label: 'Unison' }] });
  assert.equal(readBands([{ range: '0-12', name: 'Poly' }, { range: '12-37', name: 'Unison' }]), null, 'overlapping');
});

/* ------------------------------------------------------------------ every profile */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
// A compiled transaction as the vectors print it: a line a message.
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/behringer/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN, at both ends of its range`, () => {
    const ids = new Set();
    const messages = new Map();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      if (!p.access.canWrite) { assert.ok(profile.dumpDefinitions?.[0].mappings.some((m) => m.parameter === p.id), `${p.id}: read-only and not in the dump`); continue; }
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      // One parameter a message, but for the Wave's groups A and B, which the instrument tells apart
      // by Group Select.
      const other = messages.get(r.id);
      assert.ok(!other || (/^[AB] /.test(other.group) && other.group.slice(2) === p.group.slice(2) && other.name === p.name), `${r.id}: ${other?.id} and ${p.id}`);
      messages.set(r.id, p);
      const status = 0xb0 + profile.variables.channel - 1;
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        const expected = r.kind === 'nrpn' ? [[0x63, r.parameterMsb], [0x62, r.parameterLsb], ...(r.valueResolution === 14 ? [[0x06, wire >> 7], [0x26, wire & 127]] : [[0x06, wire]])]
          : r.lsbController !== undefined ? [[r.controller, wire >> 7], [r.lsbController, wire & 127]] : [[r.controller, wire]];
        assert.equal(lines(compiled), expected.map(([cc, v]) => hex([status, cc, v])).join('\n'), `${p.id} = ${value}`);
      }
    }
    assert.ok(profile.tests.length > 0);
    for (const t of profile.tests.filter((x) => x.parameter)) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Behringer's guide, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Behringer');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const send = (profile, p, value) => lines(localCompileParameter(profile, { parameterId: p.id, value }));
const values = (p) => p.choices.map((c) => [c.value, c.label]);

test('the UB-1 Micro: bands as choices, two printed wrongly, the MIDI channels left alone', () => {
  const ub = builtProfile('behringer-ub-1-micro');
  assert.deepEqual(values(param(ub, 'Octave', 'Octave')), [[0, '-2'], [26, '-1'], [52, '0'], [77, '+1'], [103, '+2']]);
  assert.equal(send(ub, param(ub, 'Octave', 'Octave'), 'plus1'), 'B0 72 4D');
  assert.deepEqual(values(param(ub, 'OSC 2', 'OSC2 Wave')).map(([v]) => v), [0, 32, 64, 96], 'printed 0-32 off, 32-63 sawtooth');
  assert.equal(param(ub, 'Arpeggiator', 'Arpeggiator Scale').choices.at(-1).value, 107, 'printed 87-127 after 86-106');
  assert.ok(ub.authoringNotes.some((n) => /CC 25 \(printed 0-32 off/.test(n) && /CC 106/.test(n)));
  const bpm = param(ub, 'Arpeggiator', 'Arpeggiator Internal Clock BPM');
  assert.deepEqual([bpm.range, bpm.description], [{ min: 0, max: 127 }, 'Printed: 20-240.'], 'more than a controller holds');
  assert.deepEqual(param(ub, 'Arpeggiator', 'Arpeggiator Swing').range, { min: 50, max: 75 });
  assert.equal(ub.parameters.some((p) => /MIDI (Tx|Rx) Channel/.test(p.name)), false);
  assert.ok(param(ub, 'OSC 1', 'Osc 1 Fine Tune'), '`OSC1` and `Osc 1` are one group');
});

test('the Spice: 14-bit pairs the guide names, one list for two sub-oscillators', () => {
  const spice = builtProfile('behringer-spice');
  const vco1 = param(spice, 'VCO 1', 'VCO 1 Frequency');
  assert.equal(send(spice, vco1, 1000), 'B0 04 07\nB0 24 68', 'the MSB on CC 4, the LSB on CC 36');
  assert.equal(spice.parameters.some((p) => /LSB/.test(p.name)), false);
  const sub1 = param(spice, 'VCO 1', 'VCO 1 Sub 1 Frequency');
  assert.deepEqual(values(sub1).slice(0, 2), [[0, 'Divide by 16'], [8, 'Divide by 15']]);
  assert.deepEqual(values(sub1).at(-1), [120, 'Unison']);
  assert.deepEqual(values(param(spice, 'VCO 1', 'VCO 1 Sub 2 Frequency')), values(sub1));
});

test('the JT Mini, D Mini and AKS Mini: Voice Mode\'s bands, a line each', () => {
  const jt = builtProfile('behringer-jt-mini');
  assert.deepEqual(values(param(jt, 'Voice', 'Voice Mode')), [[0, 'Poly'], [13, 'Unison'], [38, 'ARP Up'], [63, 'ARP Down'], [88, 'ARP Up and Down'], [113, 'ARP Random']]);
  assert.equal(send(jt, param(jt, 'Voice', 'Voice Mode'), 'arpdown'), 'B0 28 3F');
  const d = builtProfile('behringer-d-mini');
  assert.deepEqual(values(param(d, 'Voice', 'Voice Mode')).at(-1), [113, 'Poly Ring Modulation'], 'printed 112-127 after 88-112');
  assert.deepEqual(values(param(d, 'Octave', 'Octave')).map(([v]) => v), [0, 22, 44, 66, 88, 110]);
  const aks = builtProfile('behringer-aks-mini');
  assert.deepEqual(values(param(aks, 'Voice', 'Voice Mode')), [[0, 'Poly'], [13, 'Unison'], [38, 'Octave']], 'its own line the first band');
});

test('the PRO-800: coarse, fine and stepped columns, misprints, the MIDI standard\'s rows left out', () => {
  const pro = builtProfile('behringer-pro-800');
  assert.ok(param(pro, 'OSC', 'OSC A Freq') && param(pro, 'OSC', 'OSC A Freq Fine'));
  assert.equal(send(pro, param(pro, 'OSC', 'OSC A Freq Fine'), 64), 'B0 50 40', 'the fine column: its own controller, 80');
  assert.equal(send(pro, param(pro, 'OSC', 'OSC A Tri'), 127), 'B0 31 7F', 'printed OSC A Saw, as 48 is');
  assert.ok(param(pro, 'OSC', 'OSC B Tri') && param(pro, 'OSC', 'OSC B Square'), 'printed OSB');
  assert.ok(pro.authoringNotes.some((n) => n.includes('CC 79 printed AF')));
  assert.equal(pro.parameters.some((p) => /^(Main volume|Sustain pedal|Mod Wheel)$/.test(p.name)), false);
});

test('the JT-4000 Micro, PRO-VS Mini, CZ-1 Mini and JN-80: values in a name, a repeated row, a prefix, standard-only rows', () => {
  const jt4 = builtProfile('behringer-jt-4000-micro');
  assert.deepEqual(values(param(jt4, 'Ring', 'Ring Modulation on/off')), [[0, 'off'], [65, 'on']], 'printed in the name: (0-64 = off / 65 – 127 = on)');
  const vs = builtProfile('behringer-pro-vs-mini');
  assert.deepEqual(values(param(vs, 'FX', 'FX Engine')), [[0, 'Chorus'], [43, 'Ensemble'], [85, 'Reverb']]);
  assert.equal(send(vs, param(vs, 'Voice', 'Voice D Coarse Tuning'), 99), 'B0 76 63', 'CC 118, printed Voice C as 117 is');
  assert.deepEqual(param(vs, 'Filter', 'Filter Cutoff').range, { min: 0, max: 99 });
  const cz = builtProfile('behringer-cz-1-mini');
  assert.equal(cz.parameters.some((p) => /^Param /.test(p.name)), false);
  assert.equal(send(cz, param(cz, 'DCO 1', 'DCO 1 WF2'), 5), 'B0 0E 05');
  assert.ok(param(cz, 'FILTER', 'FILTER_Cutoff'));
  const jn = builtProfile('behringer-jn-80');
  assert.equal(jn.parameters.length, 63);
  assert.equal(jn.parameters.some((p) => /^(Volume|Expression|Undefined)$/.test(p.name)), false);
  assert.ok(jn.authoringNotes.some((n) => /only have their MIDI standard meaning here: CC 0 Bank Select/.test(n)));
});

test('the line tables: cells split at gaps, columns where the rows\' cells line up, a blank cell', () => {
  assert.deepEqual(cellsOf(line(1, 10, [56, '0'], [125, '13'], [202, 'SW'], [299, '0-6'], [344, 'Sub'], [361, 'Osc'], [380, 'Mode']).words).map((c) => c.text), ['0', '13', 'SW', '0-6', 'Sub Osc Mode']);
  const rows = readLineTables([
    line(36, 470, [67, 'Byte'], [123, 'Group'], [172, 'Menu'], [242, 'Parameter'], [274, 'Name'], [331, 'Range'], [448, 'Notes']),
    line(36, 487, [66, '16'], [183, 'PROGRAM'], [243, 'WAVETB'], [350, '0-127'], [391, 'Wavetable']),
    line(36, 533, [66, '19'], [141, 'A'], [186, 'TUNING'], [243, 'DETU'], [350, '0-9'], [391, 'Sub'], [408, 'Osc'], [427, 'Detuning']),
    line(36, 548, [66, '20'], [141, 'A'], [186, 'TUNING'], [243, 'MO'], [350, '0-1'], [391, 'Mod']),
    line(36, 600, [48, 'Notes:']),
  ], [{ kind: 'preset', header: ['Byte', 'Group', 'Menu'], columns: ['byte', 'group', 'menu', 'name', 'range', 'notes'] }]);
  assert.deepEqual(rows.map((r) => [r.byte, r.group, r.menu, r.name, r.range, r.notes]), [
    ['16', undefined, 'PROGRAM', 'WAVETB', '0-127', 'Wavetable'],
    ['19', 'A', 'TUNING', 'DETU', '0-9', 'Sub Osc Detuning'],
    ['20', 'A', 'TUNING', 'MO', '0-1', 'Mod'],
  ]);
});

test('the WAVE: Pull from the edit buffer, both groups on one set of controllers, misprints corrected', () => {
  const wave = builtProfile('behringer-wave');
  assert.equal(localCompileDeviceRequest(wave, { request: 'requestEditBuffer' }).transaction?.encodedValueHex ?? localCompileDeviceRequest(wave, { request: 'requestEditBuffer' }).hex, 'F0 00 20 32 00 01 39 00 74 07 F7');
  const t = wave.tests.find((x) => x.kind === 'dumpParse');
  assert.equal(t.inputHex.split(' ').length, 134, '10 bytes of header, the version, 121 bytes, the checksum, F7');
  const parsed = localParseDumpMessage(wave, t.inputHex);
  assert.ok(parsed.ok, parsed.error);
  for (const [id, value] of Object.entries(t.expectedValues)) assert.equal(parsed.values[id], value, id);
  const bytes = t.inputHex.split(' ');
  bytes[132] = bytes[132] === '7E' ? '7D' : '7E';
  assert.equal(localParseDumpMessage(wave, bytes.join(' ')).ok, false, 'a wrong checksum');
  const a = param(wave, 'A Analog', 'Filter Frequency');
  const b = param(wave, 'B Analog', 'Filter Frequency');
  assert.equal(send(wave, a, 64), 'B0 4A 40');
  assert.equal(send(wave, b, 64), 'B0 4A 40', 'the same controller: Group Select chooses');
  assert.deepEqual(wave.dumpDefinitions[0].mappings.filter((m) => [a.id, b.id].includes(m.parameter)).map((m) => m.offset), [39, 90]);
  assert.equal(send(wave, param(wave, 'A Digital', 'Sub Osc Mode'), 6), 'B0 63 00\nB0 62 0D\nB0 06 06', 'NRPN 0:13, its value on CC 6');
  assert.deepEqual(param(wave, 'A Tuning', 'Env3 -> Main Osc Pitch').range, { min: 0, max: 9 }, 'printed 0-1');
  assert.equal(param(wave, 'B Digital', 'Sub Osc Mode').range.max, 6, 'printed 0-3');
  assert.equal(wave.dumpDefinitions[0].mappings.find((m) => m.parameter === param(wave, 'A Tuning', 'Voice 8 - Semi Offset').id).offset, 31);
  assert.equal(send(wave, param(wave, 'A Tuning', 'Voice 8 - Semi Offset'), 10), 'B0 63 00\nB0 62 28\nB0 06 0A', 'NRPN 0:40, printed SEMIT V7');
  assert.deepEqual(param(wave, 'Global', 'Group Select').choices.map((c) => c.label), ['A', 'B', 'A+B']);
  assert.equal(param(wave, 'A Analog', 'Mod Wheel Position').access.canWrite, false);
  assert.equal(wave.parameters.some((p) => /Speed/.test(p.name)), false, 'BPM, 40 - 240, left out');
  assert.deepEqual(wave.startup.sync, [{ request: 'requestEditBuffer' }]);
});

test('the DeepMind\'s notes: a list covering the range, a scale, a span', () => {
  assert.deepEqual(readNotes('Off (0), On (1)', 0, 1).choices.map((c) => c.label), ['Off', 'On']);
  assert.deepEqual(readNotes('0 ( OSC1+2), 1 (OSC 1 Only)', 0, 1).choices.map((c) => c.label), ['OSC1+2', 'OSC 1 Only'], 'value first');
  assert.equal(readNotes('Poly (0), Unison 2 (1), Mono 3 (2). Mono 4 (3)', 0, 3).choices.at(-1).label, 'Mono 4', 'a full stop between two');
  assert.deepEqual(readNotes('-128 (0) to +127 (255)', 0, 255).display, { min: -128, max: 127 });
  assert.deepEqual(readNotes('Bipolar step value -127 (1) to +127 (255). A value of 0 is "skip step".', 0, 255).display, { min: -128, max: 127 });
  assert.deepEqual(readNotes('-48 (80) ... 0 ( 128) ... 176 (+48 )', 80, 176).display, { min: -48, max: 48 });
  assert.deepEqual(readNotes('1 to 6 Octaves', 0, 5).display, { min: 1, max: 6 });
  assert.deepEqual(readNotes('See FX Type list', 0, 33), {});
  assert.equal(readNotes('Off (0), On (1)', 0, 2).choices, undefined, 'a list that does not cover the range');
});

test('the DeepMind 12: 14-bit NRPNs, its lists, Pull from the edit buffer packed seven bytes in eight', () => {
  const dm = builtProfile('behringer-deepmind-12');
  assert.equal(send(dm, param(dm, 'VCF', 'VCF Frequency'), 200), 'B0 63 00\nB0 62 27\nB0 06 01\nB0 26 48');
  assert.equal(send(dm, param(dm, 'Arp', 'Arp Mode'), 'chord'), 'B0 63 01\nB0 62 1C\nB0 06 00\nB0 26 0A', 'NRPN 1:28, the 14-bit number 156');
  assert.equal(param(dm, 'LFO 2', 'LFO 2 Mono Mode').choices.find((c) => c.value === 255).label, 'Spread-254');
  assert.deepEqual([param(dm, 'Program', 'Program Transpose').display.min, param(dm, 'Program', 'Program Transpose').display.max], [-48, 48]);
  assert.ok(param(dm, 'FX', 'FX 4 Param 12'), 'FX 4 Params, NRPN 1:78 - 89');
  assert.equal(send(dm, param(dm, 'FX', 'FX 4 Param 12'), 1), 'B0 63 01\nB0 62 59\nB0 06 00\nB0 26 01');
  assert.ok(param(dm, 'Mod Envelope', 'Mod Envelope Release Curve'), 'printed Attack Curve a second time');
  assert.deepEqual(param(dm, 'FX', 'FX 2 Output Gain').range, { min: 0, max: 150 }, 'printed —');
  assert.equal(localCompileDeviceRequest({ ...dm, variables: { ...dm.variables, deviceId: 3 } }, { request: 'requestEditBuffer' }).transaction?.encodedValueHex ?? localCompileDeviceRequest({ ...dm, variables: { ...dm.variables, deviceId: 3 } }, { request: 'requestEditBuffer' }).hex, 'F0 00 20 32 20 03 03 F7');
  const t = dm.tests.find((x) => x.kind === 'dumpParse');
  assert.equal(t.inputHex.split(' ').length, 287, '8 bytes of header, 278 packed, F7');
  const parsed = localParseDumpMessage(dm, t.inputHex);
  assert.ok(parsed.ok, parsed.error);
  for (const [id, value] of Object.entries(t.expectedValues)) assert.equal(parsed.values[id], value, id);
  assert.equal(parsed.values[param(dm, 'VCF', 'VCF Frequency').id], 130 + 39, 'a value above 127: its top bit from the packed byte');
  assert.ok(dm.dumpDefinitions[0].mappings.every((m) => m.offset < 243));
  assert.equal(dm.parameters.filter((p) => p.access.canWrite).length, 225);
});
