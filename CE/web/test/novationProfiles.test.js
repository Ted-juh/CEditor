// novationProfiles.test.js — device profiles read out of Novation's user guides and programmer's
// references.
//
// tools/profiles/novation/ reads the MIDI parameter tables in those PDFs from poppler's word positions
// (read-novation-pdf.mjs), commits the rows as tables/<name>.json, and builds a profile from them and
// a layout. Checked here against things that are not the builder's own arithmetic:
//
//   - the READER on a page set the way Novation sets them: headings centred or not, two tables side
//     by side starting at different heights, a cell wrapped above and below its row's middle, a
//     section heading set across the table;
//   - the BUILDER's rules: a CC pair is its coarse controller; a range printed as the value shown is
//     left out; values are a choice only where they are numbered; switches can share an NRPN; a
//     table played per part goes out on each part's channel;
//   - every PROFILE through the app's own engine, and the committed profiles against the generator.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { pageBlocks, pageTables } from '../../../tools/profiles/novation/read-novation-pdf.mjs';
import { pagePhrases, pageValueTables } from '../../../tools/profiles/novation/read-novation-values.mjs';
import { buildNovationProfile, listedValues, namedValues, readRange } from '../../../tools/profiles/novation/build-novation-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/novation/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

// A page in poppler's -bbox-layout form: blocks of lines, each with its box.
const line = (x0, y0, text, width = text.length * 4) => `<line xMin="${x0}" yMin="${y0}" xMax="${x0 + width}" yMax="${y0 + 8}"><word xMin="${x0}" yMin="${y0}" xMax="${x0 + width}" yMax="${y0 + 8}">${text}</word></line>`;
const block = (...lines) => {
  const boxes = lines.map((l) => /xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/.exec(l).slice(1).map(Number));
  return `<block xMin="${Math.min(...boxes.map((b) => b[0]))}" yMin="${Math.min(...boxes.map((b) => b[1]))}" xMax="${Math.max(...boxes.map((b) => b[2]))}" yMax="${Math.max(...boxes.map((b) => b[3]))}">${lines.join('')}</block>`;
};
const PAGE = [
  // Left table, headings at 30.
  block(line(34, 30, 'Parameter')), block(line(115, 26, 'CC/'), line(115, 34, 'NRPN')), block(line(152, 26, 'Control'), line(152, 34, 'Number.')),
  block(line(192, 30, 'Range')), block(line(250, 26, 'Default'), line(250, 34, 'Value')),
  // A name over two lines, its row's middle between them.
  block(line(34, 50, 'Oscillator 2'), line(34, 58, 'Saw Density Detune')), block(line(115, 54, 'NRPN')), block(line(152, 54, '0:27')),
  block(line(192, 50, '0-127'), line(192, 58, '(0 to +127)')), block(line(250, 54, '0 (64)')),
  // A heading across the table, then a CC pair.
  block(line(170, 74, 'Mixer')),
  block(line(34, 90, 'Mixer Osc1')), block(line(115, 90, 'CC pair')), block(line(152, 90, '23,55')), block(line(192, 90, '0-255 (0 to +255)')), block(line(250, 90, '255')),
  // Right table, its headings a little lower.
  block(line(312, 46, 'Parameter')), block(line(392, 42, 'CC/'), line(392, 50, 'NRPN')), block(line(430, 42, 'Control'), line(430, 50, 'Number.')),
  block(line(469, 46, 'Range')), block(line(527, 42, 'Default'), line(527, 50, 'Value')),
  block(line(312, 70, 'Filter Frequency')), block(line(392, 70, 'CC')), block(line(430, 70, '29')), block(line(469, 70, '63-66 (-1 to +2)')), block(line(527, 70, '64 (0)')),
].join('\n');

test('a page of two tables: their columns, and each row from the cells whose middles line up', () => {
  const blocks = pageBlocks(PAGE);
  const tables = pageTables(blocks);
  assert.equal(tables.length, 2, 'two tables side by side, starting at different heights');
  assert.deepEqual(tables[0].columns.map((c) => c.kind), ['parameter', 'type', 'number', 'range', 'default']);
  assert.ok(tables[0].x1 <= 312, 'the left table ends where the right one begins');
});

test('the builder: a CC pair is its coarse half, a shown range is not the value sent, numbered names are a choice', () => {
  assert.deepEqual(readRange('0-127 (-64 to +63)'), { min: 0, max: 127, shownMin: -64, shownMax: 63 });
  assert.deepEqual(readRange('58 – 69 (-6 – 5)'), { min: 58, max: 69, shownMin: -6, shownMax: 5 });
  assert.deepEqual(namedValues('0=Mono, 1=Mono AG, 2=Poly 1'), [{ value: 0, label: 'Mono' }, { value: 1, label: 'Mono AG' }, { value: 2, label: 'Poly 1' }]);
  assert.deepEqual(listedValues('16’,8’,4’,2’ (MIDI val of 63, 64, 65, 66)').map((c) => c.value), [63, 64, 65, 66]);
  const data = {
    sources: [{ title: 'probe', file: 'probe.pdf', sha256: '00', url: 'https://example.invalid', pages: 1 }],
    rows: [
      { doc: 0, page: 1, section: '', parameter: 'Mixer Osc1', type: 'CC pair', number: '23,55', range: '0-255 (0 to +255)', default: '255', notes: '' },
      { doc: 0, page: 1, section: '', parameter: 'Mod Env depth', type: 'cc', number: '85', range: '-63 to +63*', default: '', notes: '' },
      { doc: 0, page: 1, section: '', parameter: 'osc 1 waveform', type: 'NRPN', number: '0:72', range: 'sine, tri, saw, pulse', default: '', notes: '' },
      { doc: 0, page: 1, section: 'Filter', parameter: 'FreqLink', type: 'NRPN', number: '0:122', range: '(42 - 43)', default: '', notes: '42=FreqLink Off, 43=FreqLink On' },
      { doc: 0, page: 1, section: 'Filter', parameter: 'ResLink', type: 'NRPN', number: '0:122', range: '(44 - 45)', default: '', notes: '44=Off, 45=On' },
      { doc: 0, page: 2, section: '', parameter: 'cutoff', type: 'CC', number: '74', range: '0 – 127', default: '0', notes: '' },
    ],
  };
  const profile = buildNovationProfile(data, { id: 'probe', name: 'probe', family: 'probe', documents: [], parts: [{ pages: [2], parts: [{ name: 'Synth 1', channel: 'channel', default: 1 }, { name: 'Synth 2', channel: 'synth2Channel', default: 2 }] }] });
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.deepEqual(by('Mixer Osc1').range, { min: 0, max: 127 }, 'the coarse half of 0-255');
  assert.equal(localCompileParameter(profile, { parameterId: by('Mixer Osc1').id, value: 127 }).hex, 'B0 17 7F');
  assert.equal(by('Mod Env depth'), undefined, 'printed as shown (-63 to +63): not the value sent');
  assert.equal(by('osc 1 waveform'), undefined, 'named but not numbered');
  assert.equal(by('FreqLink').messageRecipe, by('ResLink').messageRecipe, 'two switches on one NRPN');
  assert.equal(localCompileParameter(profile, { parameterId: by('ResLink').id, value: 'on' }).hex, 'B0 63 00 B0 62 7A B0 06 2D');
  assert.equal(localCompileParameter(profile, { parameterId: by('Synth 2 cutoff').id, value: 100 }).hex, 'B1 4A 64', 'Synth 2 on its own channel');
  assert.ok(profile.authoringNotes.some((n) => /value shown, not the value sent: Mod Env depth/.test(n)));
});

// Value tables as the Circuit Tracks sets them: a title, `Value` and `Type`, a sub-list heading in the
// number column, a name wrapped onto the next line, two names set a line below their numbers, and a
// second table beside the first.
const word = (x0, y0, text) => `<word xMin="${x0}" yMin="${y0}" xMax="${x0 + text.length * 4}" yMax="${y0 + 8}">${text}</word>`;
const VALUES = [
  word(41, 30, 'Filter'), word(66, 30, 'Table'), word(309, 30, 'Osc'), word(325, 30, 'Waveform'), word(363, 30, 'Table'),
  word(115, 60, 'Value'), word(156, 60, 'Type'), word(393, 60, 'Value'), word(422, 60, 'Type'),
  word(110, 70, 'Drive'), word(132, 70, 'Type'), word(387, 70, 'Waveforms'),
  word(120, 80, '0'), word(161, 80, 'diode'), word(398, 80, '0'), word(427, 80, 'sine'),
  word(120, 90, '1'), word(161, 90, 'cross-over'), word(398, 90, '1'), word(427, 90, 'triangle'),
  word(161, 100, 'reducer'),
  word(398, 100, '2'), word(398, 110, '3'), word(427, 105, 'analogue'), word(463, 105, 'pulse'), word(427, 115, 'analogue'), word(463, 115, 'sync'),
].join('\n');

test('value tables: a list per heading, a wrapped name, names a line below their numbers, a table beside another', () => {
  const tables = pageValueTables(pagePhrases(VALUES));
  assert.deepEqual(tables.map((t) => t.title), ['Filter Table', 'Osc Waveform Table']);
  assert.deepEqual(tables[0].lists, [{ name: 'Drive Type', entries: [{ value: 0, label: 'diode' }, { value: 1, label: 'cross-over reducer' }] }]);
  assert.deepEqual(tables[1].lists[0].entries.map((e) => e.label), ['sine', 'triangle', 'analogue pulse', 'analogue sync']);
});

/* ------------------------------------------------------------------ the profiles */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/novation/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN, on its channel, at both ends of its range`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    const ids = new Set();
    for (const parameter of profile.parameters) {
      assert.ok(!ids.has(parameter.id), `${parameter.id} twice`);
      ids.add(parameter.id);
      const recipe = recipes.get(parameter.messageRecipe);
      const status = 0xb0 + profile.variables[recipe.channel.replace(/^\$/, '')] - 1;
      const values = parameter.type === 'choice'
        ? [parameter.choices[0], parameter.choices.at(-1)].map((c) => [c.id, c.value])
        : [[parameter.range.min, parameter.range.min], [parameter.range.max, parameter.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: parameter.id, value });
        assert.ok(compiled.ok, `${parameter.id}: ${compiled.error}`);
        const bytes = recipe.kind === 'cc' ? [status, recipe.controller, wire] : [status, 0x63, recipe.parameterMsb, status, 0x62, recipe.parameterLsb, status, 0x06, wire];
        assert.equal(compiled.hex, hex(bytes), `${parameter.id} = ${value}`);
      }
    }
  });

  test(`${profile.id}: the profile's own test vectors pass`, () => {
    const vectors = profile.tests.filter((t) => t.parameter);
    assert.ok(vectors.length >= 2);
    for (const vector of vectors) {
      const compiled = localCompileParameter(profile, { parameterId: vector.parameter, value: vector.value });
      assert.ok(compiled.ok, compiled.error);
      const lines = compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (unused, i) => hex(m.bytes.slice(i * 3, i * 3 + 3))));
      assert.equal(lines.join('\n'), vector.expectedHex, vector.name);
    }
  });

  if (profile.dumpDefinitions) {
    test(`${profile.id}: Pull asks each synth for its current patch and reads its declared dumps back`, () => {
      for (const request of profile.tests.filter((t) => t.kind === 'request')) {
        const compiled = localCompileDeviceRequest(profile, { request: request.request });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, request.expectedHex);
      }
      for (const vector of profile.tests.filter((t) => t.kind === 'dumpParse')) {
        const parsed = localParseDumpMessage(profile, vector.inputHex);
        assert.ok(parsed.ok, parsed.error);
        for (const [id, value] of Object.entries(vector.expectedValues)) assert.equal(parsed.values[id], value, `${vector.name}: ${id}`);
      }
      const ids = new Set(profile.parameters.filter((p) => p.access.canRead).map((p) => p.id));
      for (const d of profile.dumpDefinitions) for (const m of d.mappings) assert.ok(ids.has(m.parameter), m.parameter);
    });
  }

  test(`${profile.id}: the source is the guide, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Novation');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;

test('the Peak: NRPNs, a range shown offset, and the 2.1 addendum\'s parameters', { skip: !builtProfile('novation-peak') }, () => {
  const profile = builtProfile('novation-peak');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.equal(localCompileParameter(profile, { parameterId: by('Oscillator 2 Saw Density Detune').id, value: 64 }).hex, 'B0 63 00 B0 62 1B B0 06 40');
  assert.deepEqual([by('Oscillator 1 Range').range, by('Oscillator 1 Range').display.min, by('Oscillator 1 Range').display.max], [{ min: 63, max: 66 }, -1, 2]);
  assert.ok(by('LFO3Phase'), 'from the addendum');
  assert.ok(profile.authoringNotes.some((n) => /printed with the range 0-0/.test(n)), 'Noise HPF, printed 0-0, is left out and said');
});

test('the Circuit Tracks: each synth on its own channel, the drums on 10 and the project on 16', { skip: !builtProfile('novation-circuit-tracks') }, () => {
  const profile = builtProfile('novation-circuit-tracks');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.deepEqual(profile.variables, { channel: 1, synth2Channel: 2, drumChannel: 10, projectChannel: 16 });
  assert.equal(localCompileParameter(profile, { parameterId: by('Synth 2 Polyphony Mode').id, value: 2 }).hex, 'B1 03 02');
  assert.equal(localCompileParameter(profile, { parameterId: by('Drums drum 1 level').id, value: 100 }).hex, 'B9 0C 64');
  assert.ok(profile.authoringNotes.some((n) => /audio table on p\. 9, for which the guide prints no channel/.test(n)));
});

test('choices from the value tables the rows point to, and none where a table does not number the whole range', () => {
  const tracks = builtProfile('novation-circuit-tracks');
  const mono = builtProfile('novation-circuit-mono-station');
  const mini = builtProfile('novation-mininova');
  const by = (profile, name) => profile.parameters.find((p) => p.name === name);
  // `See Osc Waveform Table`: its Waveforms (0-13) and Wavetables (14-29) together.
  assert.deepEqual([by(tracks, 'Synth 1 osc 1 wave').choices.length, by(tracks, 'Synth 1 osc 1 wave').choices[15].label], [30, 'analogue pulse']);
  assert.equal(by(tracks, 'Synth 1 drive type').choices[6].label, 'rate reducer', 'the Filter Table\'s Drive Type list');
  // The Mod Matrix Table prints no sources 1 - 3: a number, and said.
  assert.equal(by(tracks, 'Synth 1 Mod matrix 1 source 1').type, 'integer');
  assert.ok(tracks.authoringNotes.some((n) => /Mod Matrix Table \(Source\) numbers 0, 4, 5/.test(n)));
  // `(see table)`: the table titled for the parameter.
  assert.deepEqual(by(mono, 'LFO Sync Rate').choices.slice(0, 2).map((c) => c.label), ['64 beats', '48 beats']);
  assert.equal(by(mono, 'Filter Slope').type, 'integer', 'its table reprints the shape table\'s three names for 0 - 1');
  assert.deepEqual([by(mini, 'Osc1 Wave').choices.length, by(mini, 'Osc1 Wave').choices[71].label], [72, 'AudioInR']);
});

test('the Circuit Tracks\' patch dump, placed by hand from its patch format, reads back into Synth 2', { skip: !builtProfile('novation-circuit-tracks') }, () => {
  // Replace Current Patch: F0 00 20 29 01 64 00, location 01 (Synth 2), 00, 340 bytes, F7. Each byte
  // at its default from the format's own column, then: 33 Voice_PortamentoRate 90; 32
  // Voice_PolyphonyMode 2; 91 holding LFO1_KeySync (bit 1) on and LFO1_FadeMode (bits 4-5) 1.
  const { profile, data } = BUILT.find((b) => b.profile.id === 'novation-circuit-tracks');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  const payload = new Array(340).fill(0);
  for (const row of data.patch.format) payload[row.address] = row.default;
  payload[33] = 90;
  payload[32] = 2;
  payload[91] = (1 << 1) | (1 << 4);
  const hexOf = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const parsed = localParseDumpMessage(profile, hexOf([0xf0, 0x00, 0x20, 0x29, 0x01, 0x64, 0x00, 0x01, 0x00, ...payload, 0xf7]));
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.values[by('Synth 2 Portamento Rate').id], 90);
  assert.equal(parsed.values[by('Synth 2 Polyphony Mode').id], by('Synth 2 Polyphony Mode').choices.find((c) => c.value === 2).id);
  assert.equal(parsed.values[by('Synth 2 lfo 1 key sync').id], by('Synth 2 lfo 1 key sync').choices[1].id, 'bit 1 set: the second of its two values');
  assert.equal(parsed.values[by('Synth 2 Lfo 1 fade mode').id], by('Synth 2 Lfo 1 fade mode').choices[1].id, 'bits 4-5 = 1');
  assert.equal(parsed.values[by('Synth 1 Portamento Rate').id], undefined, 'location 01 is Synth 2\'s');
  assert.equal(localCompileDeviceRequest(profile, { request: 'requestPatchSynth2' }).hex ?? localCompileDeviceRequest(profile, { request: 'requestPatchSynth2' }).transaction?.encodedValueHex, 'F0 00 20 29 01 64 40 01 F7');
});
