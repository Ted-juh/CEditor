/**
 * The Nord profiles: generated from the MIDI controller list of each manual by tools/profiles/nord/,
 * and checked here that what is committed is what the generator makes, that the app's validator
 * finds nothing wrong, and that every parameter is the controller or NRPN its row prints.
 *
 * The reader is checked on lines made by hand, in the shapes the manuals set their lists: three
 * lists side by side, a list starting under a paragraph, a header over two lines beside the rows of
 * another list, the number first, NRPNs, headings, a heading at a page's foot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { headerLists, readControllerList, rowOf } from '../../../tools/profiles/nord/read-nord-cc.mjs';
import { groupOfName, messagesOf, valuesInName } from '../../../tools/profiles/nord/build-nord-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/nord/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('a header: lists side by side, the number first, an extra column, two lines stacked; a sentence is not one', () => {
  const three = headerLists([line(1, 100, [47, 'Nord'], [68, 'Wave'], [92, '2'], [100, 'Parameter'], [161, 'MIDI'], [181, 'CC'], [196, '#'], [221, 'Nord'], [242, 'Wave'], [266, '2'], [274, 'Parameter'], [335, 'MIDI'], [355, 'CC'], [370, '#'])]);
  assert.deepEqual(three.map((l) => [l.name, l.number, !!l.reversed]), [[47, 161, false], [221, 335, false]], 'a number column then a name is the next list, not a list the other way round');
  const lead3 = headerLists([line(1, 80, [85, 'Nord'], [110, 'Lead'], [134, '3'], [142, 'Parameter'], [264, 'MIDI'], [291, 'Controller'], [338, '#'], [391, 'MIDI'], [418, 'Controller'], [466, 'Name'])]);
  assert.deepEqual(lead3.map((l) => [l.name, l.number, l.extra]), [[85, 264, 391]]);
  const drum = headerLists([line(1, 243, [56, 'MIDI'], [74, 'CC'], [103, 'Parameter'])]);
  assert.deepEqual(drum.map((l) => [l.name, l.number, l.reversed]), [[103, 56, true]]);
  const wave = headerLists([line(1, 50, [76, 'Nord'], [97, 'Wave'], [200, 'MIDI'], [262, 'MIDI'], [287, 'Controller']), line(1, 59, [76, 'Parameter'], [200, 'Controller'], [262, 'Name'])]);
  assert.deepEqual(wave.map((l) => [l.name, l.number, l.extra]), [[76, 200, 262]]);
  assert.deepEqual(headerLists([line(1, 20, [43, 'The'], [58, 'Nord'], [77, 'Electro'], [110, 'implements'], [169, 'MIDI'], [187, 'CC'], [201, 'messages'], [290, 'per'], [324, 'parameter,'])]), []);
});

test('a row: the number after the widest gap, `9` kept in `Organ Drawbar 9`, NRPNs and pairs, the number first', () => {
  const list = { from: 40, name: 47, number: 160 };
  const cells = (...words) => words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t }));
  assert.deepEqual(rowOf(cells([47, 'Organ'], [78, 'Drawbar'], [118, '9'], [170, '24']), list), { name: 'Organ Drawbar 9', value: '24', extra: '' });
  assert.equal(rowOf(cells([47, 'Organ'], [78, 'Model'], [165, '2:16']), list).value, '2:16');
  assert.equal(rowOf(cells([47, 'Organ'], [78, 'Preset'], [110, 'Select'], [162, '59,'], [180, '65']), list).value, '59, 65');
  assert.deepEqual(rowOf(cells([47, 'Synth'], [78, 'Waveform'], [170, '44'], [185, '(0-127)']), list), { name: 'Synth Waveform', value: '44', extra: '(0-127)' });
  assert.deepEqual(rowOf(cells([56, '14'], [103, 'Noise'], [130, 'Filter']), { from: 40, name: 103, number: 56, reversed: true }), { name: 'Noise Filter', value: '14', extra: '' });
});

test('lists: one under a paragraph, one at the top beside it; a row run on; headings, carried over a page', () => {
  const rows = readControllerList([
    line(1, 10, [40, '34'], [52, '|'], [60, 'Nord'], [90, 'Lead'], [120, 'A1']),
    line(1, 50, [312, 'Nord'], [335, 'Lead'], [359, 'A1'], [367, 'parameter'], [503, 'MIDI'], [526, 'CC']),
    line(1, 62, [44, 'These'], [80, 'are'], [100, 'the'], [312, 'Pan'], [530, '10']),
    line(1, 74, [44, 'Nord'], [70, 'Lead'], [94, 'A1'], [102, 'parameter'], [238, 'MIDI'], [261, 'CC'], [312, 'Volume'], [348, 'Pedal'], [380, '(transmits'], [530, '7']),
    line(1, 86, [44, 'Arp'], [65, 'Run'], [265, '90'], [312, 'menu)']),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.value]), [['Arp Run', '90'], ['Pan', '10'], ['Volume Pedal (transmits menu)', '7']], 'the left list first; the paragraph is not a row; `menu)` ends the row above');
  const lead3 = readControllerList([
    line(146, 80, [71, 'Nord'], [96, 'Lead'], [120, '3'], [127, 'Parameter'], [250, 'MIDI'], [277, 'Controller'], [324, '#'], [377, 'MIDI'], [404, 'Controller'], [452, 'Name']),
    line(146, 100, [71, '“Play'], [100, 'Control”'], [140, 'parameters:']),
    line(146, 120, [71, 'Octave'], [105, 'Shift'], [250, '17'], [377, 'General'], [420, 'Purpose'], [460, '#2']),
    line(146, 140, [71, 'Oscillator'], [118, '1'], [126, 'parameters:']),
    line(147, 80, [85, 'Nord'], [110, 'Lead'], [134, '3'], [142, 'Parameter'], [264, 'MIDI'], [291, 'Controller'], [338, '#'], [391, 'MIDI'], [418, 'Controller'], [466, 'Name']),
    line(147, 100, [85, 'Osc'], [103, '1'], [110, 'Waveform'], [264, '30'], [391, 'Undefined']),
  ]);
  assert.deepEqual(lead3.map((r) => [r.heading, r.name, r.value, r.extra]), [['Play Control parameters', 'Octave Shift', '17', 'General Purpose #2'], ['Oscillator 1 parameters', 'Osc 1 Waveform', '30', 'Undefined']]);
  // A column the layout places, the list run on with no header: the Drum 2's.
  const drum = readControllerList([
    line(32, 59, [231, '46'], [278, 'Tone'], [296, 'Wave']),
    line(32, 243, [56, 'MIDI'], [74, 'CC'], [103, 'Parameter']),
    line(32, 260, [56, '0'], [103, 'Bank'], [125, 'Select'], [160, 'MSB']),
  ], { lists: [{ page: 32, from: 225, name: 278, number: 231, reversed: true }] });
  assert.deepEqual(drum.map((r) => [r.name, r.value]), [['Bank Select MSB', '0'], ['Tone Wave', '46']]);
});

test('the builder\'s reading of a cell, a name\'s value list and its group', () => {
  assert.deepEqual(messagesOf('74', 'Filter Freq').messages, [{ kind: 'cc', controller: 74 }]);
  assert.deepEqual(messagesOf('2:22', 'Organ Percussion Speed').messages, [{ kind: 'nrpn', msb: 2, lsb: 22 }]);
  assert.deepEqual(messagesOf('2:32-34', 'Piano Type/Model/Variation').names, ['Piano Type', 'Piano Model', 'Piano Variation']);
  assert.match(messagesOf('2:32-34', 'Piano Select').reason, /3 NRPNs/);
  assert.match(messagesOf('59, 65', 'Organ Preset Select').reason, /two controllers/);
  assert.match(messagesOf('3:4:x:x', 'Synth Sample Cat/Sample').reason, /value bytes/);
  assert.deepEqual(valuesInName('Rotary Speaker Control (0 = Slow, 64 = Stop. 127 = Fast)'), [{ value: 0, label: 'Slow' }, { value: 64, label: 'Stop' }, { value: 127, label: 'Fast' }]);
  assert.equal(valuesInName('Glide Mode (Normal/Auto)'), null);
  assert.deepEqual(['Sample Synth Attack', 'Filt Env Decay', 'LFO1/Arp On/Off', 'Drawbar1', 'Amp/EQ Drive', 'Osx Mix', 'Slot Focus'].map(groupOfName), ['Sample Synth', 'Filter Env', 'LFO 1', 'Drawbar', 'Amp/EQ', 'Osc', 'Global']);
});

/* ------------------------------------------------------------------ every profile */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/nord/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN at both ends of its range, and every row is laid out or named`, () => {
    const ids = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      const values = p.type === 'choice' ? p.choices.map((c) => [c.id, c.value]) : [[0, 0], [127, 127]];
      for (const [value, wire] of values) {
        const want = r.kind === 'cc' ? hex([status, r.controller, wire]) : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, 0], [0x26, wire]].map(([c, v]) => hex([status, c, v])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want, `${p.id} = ${value}`);
      }
    }
    assert.ok(profile.tests.length > 0);
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    // Every row of the list is a parameter (its message, on some channel) or named in the notes.
    const sent = (m) => profile.messageRecipes.some((r) => (m.kind === 'cc' ? r.kind === 'cc' && r.controller === m.controller : r.kind === 'nrpn' && r.parameterMsb === m.msb && r.parameterLsb === m.lsb));
    for (const row of data.rows) {
      const read = messagesOf(row.value, row.name);
      const named = profile.authoringNotes.some((n) => n.includes(`${row.value} ${row.name}`) || n.includes(`${row.name} (`));
      assert.ok(named || (read.messages && read.messages.every(sent)), `${row.value} ${row.name}`);
    }
  });

  test(`${profile.id}: the source is Nord's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Nord');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const recipeOf = (profile, p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe);

test('the Stage 4: NRPNs on CC 38 with CC 6 at 0, the piano\'s three NRPNs named, the cells it cannot send named', () => {
  const s4 = builtProfile('nord-stage-4');
  const speed = param(s4, 'Organ', 'Organ Percussion Speed');
  assert.deepEqual([recipeOf(s4, speed).parameterMsb, recipeOf(s4, speed).parameterLsb], [2, 22]);
  assert.equal(lines(localCompileParameter(s4, { parameterId: speed.id, value: 100 })), 'B0 63 02\nB0 62 16\nB0 06 00\nB0 26 64');
  assert.deepEqual(['Piano Type', 'Piano Model', 'Piano Variation'].map((n) => recipeOf(s4, param(s4, 'Piano', n)).parameterLsb), [32, 33, 34]);
  assert.equal(recipeOf(s4, param(s4, 'Synth', 'Synth Filter Freq')).controller, 59);
  assert.ok(s4.authoringNotes.some((n) => n.includes('Organ Preset (a run of controllers (16-24))') && n.includes('Synth Sample Cat/Sample')));
});

test('the Electro 7: the NRPN its list gives two rows named, the preset pair left out', () => {
  const e7 = builtProfile('nord-electro-7');
  assert.ok(e7.authoringNotes.some((n) => n.includes('NRPN 3:20: Synth FM Amount, Synth FM Spectra Env Amt')));
  assert.ok(e7.authoringNotes.some((n) => n.includes('Organ Preset Select (two controllers (59, 65)')));
});

test('the organs: each row on the channels of its manuals', () => {
  const o3 = builtProfile('nord-organ-3');
  assert.deepEqual(['Upper', 'Lower'].map((m) => recipeOf(o3, param(o3, m, 'Drawbar 1')).channel), ['$channel', '$lowerChannel']);
  assert.equal(recipeOf(o3, param(o3, 'Pedal', 'Bass Pedal 16')).channel, '$pedalChannel');
  assert.equal(lines(localCompileParameter(o3, { parameterId: param(o3, 'Lower', 'Drawbar 1').id, value: 64 })), 'B1 10 40');
  const c1 = builtProfile('nord-c1');
  assert.deepEqual(['Upper', 'Lower', 'Bass'].map((m) => !!param(c1, m, 'Drawbar1')), [true, true, true]);
  assert.deepEqual(['Upper', 'Lower', 'Bass'].map((m) => !!param(c1, m, 'Drawbar3')), [true, true, false]);
  assert.equal(recipeOf(c1, param(c1, 'Bass', 'Bass Pluck')).channel, '$bassChannel');
  const c2d = builtProfile('nord-c2d');
  assert.deepEqual(['Swell', 'Great', 'Bass'].map((m) => recipeOf(c2d, param(c2d, m, 'Drawbar A1')).channel), ['$channel', '$greatChannel', '$bassChannel']);
  const rotary = c2d.parameters.find((p) => p.name === 'Rotary Speaker Control');
  assert.deepEqual(rotary.choices.map((c) => [c.label, c.value]), [['Slow', 0], ['Stop', 64], ['Fast', 127]]);
});

test('the Lead 3 under its sections, the Electro 3\'s two sets of drawbars apart, the Drum 2\'s second column', () => {
  const l3 = builtProfile('nord-lead-3');
  assert.equal(recipeOf(l3, param(l3, 'Oscillator 1', 'Osc 1 Waveform')).controller, 30);
  assert.equal(recipeOf(l3, param(l3, 'Amplifier', 'Amplifier Envelope Release')).controller, 72);
  assert.match(param(l3, 'Amplifier', 'Amplifier Envelope Release').description, /Sound Controller 3 \(Release\)/);
  const e3 = builtProfile('nord-electro-3');
  assert.equal(recipeOf(e3, e3.parameters.find((p) => p.name === 'Drawbar 1 (Preset 2/Upper)')).controller, 16);
  assert.equal(recipeOf(e3, e3.parameters.find((p) => p.name === 'Drawbar 1 (Preset 1/Lower)')).controller, 70);
  const d2 = builtProfile('nord-drum-2');
  assert.equal(recipeOf(d2, param(d2, 'Global', 'Channel Focus')).controller, 70);
  assert.equal(recipeOf(d2, param(d2, 'Tone', 'Tone Wave')).controller, 46);
});

test('the pedals, the wheel and bank select are left out everywhere; a setting named after a pedal is kept', () => {
  for (const { profile } of BUILT) assert.equal(profile.parameters.some((p) => /^(?:Bank Select|Sustain$|Mod Wheel$|Modulation Wheel$|Ctrl Pedal \(Expression\)$)/.test(p.name)), false, profile.id);
  const p6 = builtProfile('nord-piano-6');
  assert.equal(recipeOf(p6, param(p6, 'Piano', 'Piano Sustain Pedal')).controller, 36);
});
