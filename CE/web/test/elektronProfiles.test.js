/**
 * The Elektron profiles: generated from each manual's MIDI appendix by tools/profiles/elektron/, and
 * checked here that what is committed is what the generator makes, that the app's validator finds
 * nothing wrong, and that every parameter is the controller or NRPN its row prints, on the channel
 * its table goes to.
 *
 * The reader is checked on lines made by hand, in the shapes the manuals set their tables: two side
 * by side, a values cell run onto the next line, a table carried onto a facing page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readCell, readCtrlChangeTables, readMidiAppendix, readTrackColumnTables } from '../../../tools/profiles/elektron/read-elektron-midi.mjs';
import { readValueNames } from '../../../tools/profiles/elektron/build-elektron-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/elektron/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
const header = (page, y, x, extra = []) => line(page, y, [x, 'Parameter'], [x + 150, 'CC'], [x + 165, 'MSB'], [x + 200, 'CC'], [x + 215, 'LSB'], [x + 250, 'NRPN'], [x + 275, 'MSB'], [x + 300, 'NRPN'], [x + 325, 'LSB'], ...extra);

test('the appendix: sections, titles, a cell\'s range or fine controller, a dash for none', () => {
  assert.deepEqual(readCell('94 (0–127)'), { n: 94, range: [0, 127] });
  assert.deepEqual(readCell('109 (LSB: 110)'), { n: 109, lsb: 110 });
  assert.equal(readCell('-'), null);
  const rows = readMidiAppendix([
    line(1, 10, [40, 'B.3'], [60, 'FM'], [80, 'PARAMETERS']),
    line(1, 20, [200, 'SYN1']),
    header(1, 30, 50),
    line(1, 40, [50, 'Ratio'], [80, 'B'], [200, '16'], [250, '48'], [300, '1'], [350, '75']),
    line(1, 50, [50, 'Ratio'], [80, 'C'], [80 + 30, 'Offset'], [300, '1'], [350, '95']),
    line(1, 60, [200, 'SYN2']),
    header(1, 70, 50),
    line(1, 80, [50, 'A'], [60, 'Level'], [200, '78'], [300, '1'], [350, '83']),
  ]);
  assert.deepEqual(rows.map((r) => [r.section, r.table, r.name, r.cc, r.ccLsb, r.nrpn]), [
    ['B.3 FM PARAMETERS', 'SYN1', 'Ratio B', 16, 48, [1, 75]],
    ['B.3 FM PARAMETERS', 'SYN1', 'Ratio C Offset', undefined, undefined, [1, 95]],
    ['B.3 FM PARAMETERS', 'SYN2', 'A Level', 78, undefined, [1, 83]],
  ]);
});

test('two tables side by side go on apart, and a values cell runs on', () => {
  // The Model:Cycles' two columns: the right one's next table starts while the left goes on.
  const half = (page, y, x) => line(page, y, [x, 'Parameter'], [x + 100, 'CC'], [x + 115, 'MSB']);
  const rows = readMidiAppendix([
    line(1, 10, [40, 'A.1'], [60, 'TRACK'], [90, 'PARAMETERS'], [300, 'A.3'], [320, 'LFO'], [345, 'PARAMETERS']),
    line(1, 20, [60, 'TRACK'], [90, 'PARAMETERS'], [320, 'LFO'], [345, 'PARAMETERS']),
    line(1, 30, [40, 'Parameter'], [140, 'CC'], [155, 'MSB'], [300, 'Parameter'], [400, 'CC'], [415, 'MSB']),
    line(1, 40, [40, 'Note'], [140, '3'], [300, 'Depth'], [400, '109'], [420, '(LSB:'], [445, '110)']),
    line(1, 50, [40, 'Pan'], [140, '10'], [300, 'A.4'], [320, 'FX'], [335, 'PARAMETERS']),
    line(1, 60, [40, 'Swing'], [140, '15'], [320, 'FX'], [335, 'PARAMETERS']),
    half(1, 70, 300).words.length && line(1, 70, [40, 'Chance'], [140, '14'], [300, 'Parameter'], [400, 'CC'], [415, 'MSB']),
    line(1, 80, [40, 'Machine'], [80, 'Selection'], [140, '70'], [300, 'Delay'], [330, 'Time'], [400, '85']),
  ]);
  assert.deepEqual(rows.map((r) => [r.table, r.name, r.cc, r.ccLsb]), [
    ['TRACK PARAMETERS', 'Note', 3, undefined],
    ['LFO PARAMETERS', 'Depth', 109, 110],
    ['TRACK PARAMETERS', 'Pan', 10, undefined],
    ['TRACK PARAMETERS', 'Swing', 15, undefined],
    ['TRACK PARAMETERS', 'Chance', 14, undefined],
    ['TRACK PARAMETERS', 'Machine Selection', 70, undefined],
    ['FX PARAMETERS', 'Delay Time', 85, undefined],
  ]);
  // The Analog Heat's values info, over two lines.
  const heat = readMidiAppendix([
    header(1, 30, 50, [[420, 'Specific'], [460, 'values'], [490, 'info']]),
    line(1, 40, [50, 'LFO'], [70, 'Mode'], [200, '25'], [300, '0'], [350, '25'], [420, '0=FREE,'], [460, '1=TRIG,'], [500, '2=HOLD,']),
    line(1, 50, [420, '3=ONE,'], [460, '4=HALF']),
  ]);
  assert.equal(heat[0].values, '0=FREE, 1=TRIG, 2=HOLD, 3=ONE, 4=HALF');
  assert.deepEqual(readValueNames('0=TRI, 1=SIN 2=SQR, 3=SAW').map((v) => v.label), ['TRI', 'SIN', 'SQR', 'SAW'], 'a comma missing');
});

test('a table carried onto a facing page moves with the page\'s margin', () => {
  const rows = readMidiAppendix([
    line(1, 20, [200, 'OSC'], [220, '2']),
    header(1, 30, 50),
    line(1, 40, [50, 'Pitch'], [200, '17'], [250, '49']),
    // The facing page is set 30 points further in; its first line is a row of the same table.
    line(2, 40, [80, 'Level'], [230, '78']),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.cc]), [['Pitch', 17], ['Level', 78]]);
});

test('the Octatrack\'s tables: hex and decimal, the name and its values apart, X under TRN and REC wherever the page sets them', () => {
  const rows = readCtrlChangeTables([
    line(1, 10, [60, 'C.7'], [80, 'CTRL'], [105, 'CHANGE'], [140, 'MAPPINGS']),
    line(1, 20, [64, 'HEX'], [86, 'DEC'], [115, 'CTRL'], [141, 'PARAMETER'], [301, 'TRN'], [337, 'REC']),
    line(1, 30, [64, '$07'], [86, '07'], [115, 'Track'], [140, 'level'], [344, 'X']),
    // The next page sets the table 28 points further in.
    line(2, 30, [92, '$31'], [114, '49'], [143, 'Track'], [166, 'Mute'], [187, '[0]=Unmuted,'], [240, '[1-127]=Muted'], [336, 'X'], [372, 'X']),
    line(2, 40, [60, 'C.3'], [80, 'MIDI'], [100, 'MODE'], [125, 'CTRL'], [150, 'CHANGE'], [185, 'MAPPINGS']),
  ]);
  assert.deepEqual(rows.map((r) => [r.section, r.cc, r.name, r.trn, r.rec, r.values]), [
    ['C.7 CTRL CHANGE MAPPINGS', 7, 'Track level', false, true, undefined],
    ['C.7 CTRL CHANGE MAPPINGS', 49, 'Track Mute', true, true, '[0]=Unmuted, [1-127]=Muted'],
  ]);
  assert.deepEqual(readValueNames('[0]=Unmuted, [1-127]=Muted'), [{ value: 0, label: 'Unmuted' }, { value: 1, label: 'Muted' }], 'bands, the first value of each');
  assert.equal(readValueNames('[0]=C-1, 127=G9)'), null, 'the ends of a range, not bands that cover it');
});

test('the Tonverk\'s tables: a column for each kind of track, names run on, NRPN runs', () => {
  const rows = readTrackColumnTables([
    line(1, 10, [40, 'D.1'], [60, 'CC'], [75, 'VALUES']),
    // The titles are set in from their cells.
    line(1, 20, [40, 'CC'], [100, 'Audio'], [125, 'tracks*'], [230, 'Bus'], [250, 'tracks'], [380, 'Mix'], [400, 'track']),
    line(1, 30, [40, '3'], [70, 'TRIG'], [95, 'note'], [200, 'TRIG'], [225, 'note'], [350, 'TRIG'], [375, 'note']),
    line(1, 40, [40, '48'], [70, 'FX'], [82, '1'], [90, 'Data'], [200, 'FX'], [212, '1'], [220, 'Data']),
    line(1, 50, [70, '(machine'], [110, 'dependent)'], [200, '(machine'], [240, 'dependent)']),
    line(1, 60, [40, 'D.3'], [60, 'NRPN'], [90, 'VALUES']),
    line(1, 70, [40, 'NRPN'], [70, 'MSB'], [100, 'NRPN'], [130, 'LSB'], [170, 'Audio'], [200, 'tracks'], [230, 'using'], [260, 'the']),
    line(1, 80, [170, 'Subtracks'], [215, 'SRC'], [235, 'machine']),
    line(1, 90, [40, '1–8'], [100, '107'], [170, 'VOICE'], [200, 'LFO1'], [225, 'start'], [250, 'phase'], [280, '/']),
    line(1, 100, [170, 'VOICE'], [200, 'LFO1'], [225, 'slew']),
  ]);
  assert.deepEqual(rows.map((r) => [r.table, r.name, r.cc ?? r.nrpn, r.msbRun]), [
    ['Audio tracks', 'TRIG note', 3, undefined],
    ['Bus tracks', 'TRIG note', 3, undefined],
    ['Mix track', 'TRIG note', 3, undefined],
    ['Audio tracks', 'FX 1 Data (machine dependent)', 48, undefined],
    ['Bus tracks', 'FX 1 Data (machine dependent)', 48, undefined],
    ['Audio tracks using the Subtracks SRC machine', 'VOICE LFO1 start phase / VOICE LFO1 slew', [1, 107], '1–8'],
  ]);
});

/* ------------------------------------------------------------------ every profile */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
// A compiled transaction as the vectors print it: a line a message.
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/elektron/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN on its channel, at both ends of its range`, () => {
    const ids = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        const expected = r.kind === 'nrpn'
          ? [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire]]
          : r.lsbController !== undefined ? [[r.controller, wire >> 7], [r.lsbController, wire & 127]] : [[r.controller, wire]];
        assert.equal(lines(compiled), expected.map(([cc, v]) => hex([status, cc, v])).join('\n'), `${p.id} = ${value}`);
      }
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Elektron's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Elektron');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const send = (profile, p, value, variables = {}) => lines(localCompileParameter({ ...profile, variables: { ...profile.variables, ...variables } }, { parameterId: p.id, value }));

test('the Digitone: a 14-bit pair, the FX and MIDI track channels, controllers the appendix gives twice', { skip: !builtProfile('elektron-digitone') }, () => {
  const dn = builtProfile('elektron-digitone');
  assert.equal(send(dn, param(dn, 'Filter', 'Filter Frequency'), 8192), 'B0 17 40\nB0 37 00', 'CC 23, then its LSB on 55');
  assert.equal(send(dn, param(dn, 'Chorus', 'Depth'), 100 * 128, { fxChannel: 9 }), 'B8 03 64\nB8 23 00', 'the FX CHANNEL: CC 3 (and 35) there is the chorus, not the trig note');
  assert.equal(send(dn, param(dn, 'CC Value', 'CC Val1'), 64), 'B8 46 40', 'a MIDI track\'s CC value on its own channel (9 here)');
  assert.equal(send(dn, param(dn, 'Syn1', 'Ratio C Offset'), 5), 'B0 63 01\nB0 62 5F\nB0 06 05', 'NRPN only');
  // The appendix prints CC 13 for both; both are laid out, and the notes say so.
  assert.ok(param(dn, 'Trig', 'Filter Trig') && param(dn, 'Amp', 'Delay Send'));
  assert.ok(dn.authoringNotes.some((n) => /CC 13 on the channel variable's channel: Trig Filter Trig, Amp Delay Send/.test(n)));
  assert.equal(dn.parameters.filter((p) => p.name === 'Master Overdrive').length, 1, 'printed twice, laid out once');
  assert.equal(dn.parameters.some((p) => /^(Sustain|Sostenuto)$/.test(p.name)), false);
});

test('the Digitone II and Digitakt II: tables the manual mistitles, a misprinted controller', { skip: !builtProfile('elektron-digitone-ii') }, () => {
  const dn2 = builtProfile('elektron-digitone-ii');
  assert.equal(send(dn2, param(dn2, 'Amp', 'Sustain Level'), 100), 'B0 57 64', 'printed 86, Decay Time\'s; 87 between 86 and 88');
  assert.ok(param(dn2, 'Euclidean Sequencer', 'Pulse Generator 1'), 'printed under the title AMP');
  const dt2 = builtProfile('elektron-digitakt-ii');
  assert.ok(param(dt2, 'FX', 'Bit Reduction') && param(dt2, 'Euclidean Sequencer', 'Boolean Operator'));
  assert.equal(send(dt2, param(dt2, 'Misc', 'Master Overdrive'), 1, { fxChannel: 12 }), 'BB 11 01', 'the master overdrive on FX CONTROL CH');
});

test('the Analog Four, Analog Keys and Rytm: NRPN-only rows, split tables merged, machines described', { skip: !builtProfile('elektron-analog-four-mkii') }, () => {
  const a4 = builtProfile('elektron-analog-four-mkii');
  assert.equal(send(a4, param(a4, 'Osc 1', 'Detune'), 64), 'B0 63 01\nB0 62 02\nB0 06 40', 'no CC printed: NRPN 1:2');
  assert.equal(send(a4, param(a4, 'Osc 1', 'Pitch'), 1000), 'B0 10 07\nB0 30 68');
  assert.ok(param(a4, 'FX Track LFO1', 'LFO1 Speed') && param(a4, 'CV Track LFO1', 'LFO1 Speed') && param(a4, 'Synth Track LFO1', 'LFO1 Speed'), 'one title under three sections');
  assert.equal(send(a4, param(a4, 'Performance', 'Performance Parameter A'), 10), 'BE 03 0A', 'PERF CHANNEL, 15 here');
  const keys = builtProfile('elektron-analog-keys');
  const pitch = param(keys, 'Osc 1', 'Pitch');
  assert.equal(send(keys, pitch, 1000), 'B0 10 07\nB0 30 68', 'the CC table\'s controller');
  assert.equal(send(keys, param(keys, 'Osc 1', 'Detune'), 64), 'B0 63 01\nB0 62 02\nB0 06 40', 'the NRPN table\'s number, the CC table printing none');
  const rytm = builtProfile('elektron-analog-rytm-mkii');
  const synth1 = param(rytm, 'Synth', 'Synth Parameter 1');
  assert.match(synth1.description, /BD PLASTIC: Level; BD SHARP: Level/);
  assert.match(param(rytm, 'Synth', 'Synth Parameter 8').description, /SD NATURAL: Noise HPF/);
  assert.equal(rytm.parameters.some((p) => p.name === 'VCO Click'), false, 'a machine\'s parameter is the synth parameter it sets');
});

test('the Analog Heat: the values it names are choices, its effect blocks on MIDI CH FX', { skip: !builtProfile('elektron-analog-heat-mkii') }, () => {
  const heat = builtProfile('elektron-analog-heat-mkii');
  assert.deepEqual(param(heat, 'VCF', 'VCF Mode').choices.map((c) => [c.value, c.label]), [[1, 'LP2'], [3, 'LP1'], [5, 'BP'], [7, 'HP1'], [9, 'HP2'], [11, 'BS'], [13, 'PK']]);
  assert.equal(send(heat, param(heat, 'Sound', 'Circuit Select'), 'hg'), 'B0 46 07');
  const fx = builtProfile('elektron-analog-heat-fx');
  assert.equal(send(fx, param(fx, 'Bits', 'BITS SRR'), 10), 'BF 58 0A', 'CC 88 on MIDI CH FX, 16 here');
  assert.equal(send(fx, param(fx, 'LFO3', 'LFO3 Multiplier'), 10), 'B0 58 0A', 'the same controller on MIDI CH MAIN');
});

test('the Octatrack: its audio tracks on a track channel, its MIDI mode on the auto channel, bands as choices', { skip: !builtProfile('elektron-octatrack-mkii') }, () => {
  for (const id of ['elektron-octatrack-mkii', 'elektron-octatrack']) {
    const ot = builtProfile(id);
    assert.equal(send(ot, param(ot, 'Track', 'Track Mute'), 'muted'), 'B0 31 01', `${id}: [1-127]=Muted, its first value`);
    assert.equal(send(ot, param(ot, 'MIDI Mode Track', 'MIDI Trk 1 Mute'), 'mute'), 'BF 70 01', `${id}: the MIDI mode on the auto channel, 16 here`);
    assert.equal(param(ot, 'Track', 'Note on').type, 'integer', `${id}: [0]=C-1, 127=G9 is a range`);
    assert.ok(param(ot, 'MIDI Mode Playback', 'Playback param #1 (Note)'), `${id}: the MIDI mode's table (C.3 in the MKI's manual, C.8 in the MKII's)`);
    assert.equal(ot.parameters.some((p) => /^(Pitch bend|Aftertouch)$/.test(p.name)), false);
  }
});

test('the Tonverk: each kind of track on its channel, its NRPN-only parameters, subtrack 1, a misprint', { skip: !builtProfile('elektron-tonverk') }, () => {
  const tv = builtProfile('elektron-tonverk');
  assert.equal(send(tv, param(tv, 'Bus TRIG', 'TRIG note'), 60), 'BC 03 3C', 'the bus channel, 13 here');
  assert.equal(send(tv, param(tv, 'Mix Input A', 'In A level'), 100), 'BF 10 64', 'CC 16 on the mix channel is an input level, not SRC 1\'s knob A');
  assert.equal(send(tv, param(tv, 'Audio SRC 1', 'SRC 1 Data entry knob A (machine dependent)'), 100), 'B0 10 64');
  assert.equal(send(tv, param(tv, 'Audio VOICE LFO1', 'VOICE LFO1 waveform'), 3), 'B0 63 00\nB0 62 05\nB0 06 03', 'no CC printed: NRPN 0:5');
  assert.equal(send(tv, param(tv, 'Audio VOICE LFO1', 'VOICE LFO1 speed'), 64), 'B0 66 40', 'a CC and an NRPN printed: the CC');
  assert.equal(send(tv, param(tv, 'Subtrack 1 FLTR', 'FLTR frequency'), 64), 'B0 63 01\nB0 62 4A\nB0 06 40', 'subtrack 1, NRPN MSB 1');
  assert.ok(param(tv, 'Audio SRC 2', 'SRC 2 Data entry knob H (machine dependent)'), 'CC 31, printed as SRC 1\'s');
});
