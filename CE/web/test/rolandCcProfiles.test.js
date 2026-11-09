// rolandCcProfiles.test.js — device profiles for the Roland instruments whose MIDI is a Control
// Change list: the Boutiques, the AIRA and TR boxes, the grooveboxes.
//
// tools/profiles/roland/read-cc-list.mjs reads the list out of the manual (four print styles),
// import-cc-chart.mjs commits it as charts/<name>.json, and build-cc-profile.mjs lays it out from a
// per-instrument layout. Checked here against things that are not our own arithmetic:
//
//   - the READER on fixtures in each print style, including the ones that broke it: two lists side
//     by side, a list beside the chart, a chart whose Yes glyph extracts as `6`, numbers printed
//     over several lines, a decimal column checked by its hexadecimal one;
//   - every PROFILE through the app's own engine: each controller the chart names compiles to that
//     controller number on the channel the profile says, and nothing else;
//   - every profile against its chart: no controller dropped, none added that the layout does not
//     account for, and the names the manual prints;
//   - the committed profiles against the generator, so a layout edit cannot ship stale.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { expandNumbers, readCharts, readHexList, readList } from '../../../tools/profiles/roland/read-cc-list.mjs';
import { splitExplanation } from '../../../tools/profiles/roland/build-cc-profile.mjs';
import { CC_SYNTHS, buildCc } from '../../../tools/profiles/roland/make-cc-profiles.mjs';
import {
  localCompileParameter,
  localCompilePresetRecall,
  validateLocalProfileSource,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

// Written for this test in the layout pdftotext gives Roland's charts; names and numbers invented.
const CHART = `
Function...                          Transmitted                    Recognized                 Remarks
Pitch Bend                            o                             o
                                    1 o                             o                          MODULATION
                                    3 o                             o                          FILTER CUTOFF*1
                                   11 x                             o                          EXPRESSION PEDAL
Control                            14 o *2                          x                          AUTO FILL [ON]
Change                             74 o                             o                          FILTER RESONANCE*1
                                    0, 32 x                         o                          Bank select
Program                              0–63                           0–63
Change
              *1
                 The control changes of the second part are transmitted and received on the channel
Notes            one higher than the specified channel.
              *2 Transmitted when the local switch is SURFACE.
Mode 1: OMNI ON, POLY     Mode 2: OMNI ON, MONO                                                                   O : Yes
`;

test('chart: rows, both answers, footnote marks, and notes that run over two lines', () => {
  const [chart] = readCharts([CHART]);
  assert.deepEqual(chart.rows.map((r) => [r.numbers.join(','), r.tx, r.rx, r.name, r.marks.join(',')]), [
    ['1', true, true, 'MODULATION', ''],
    ['3', true, true, 'FILTER CUTOFF', '1'],
    ['11', false, true, 'EXPRESSION PEDAL', ''],
    ['14', true, false, 'AUTO FILL [ON]', '2'],
    ['74', true, true, 'FILTER RESONANCE', '1'],
    ['0,32', false, true, 'Bank select', ''],
  ]);
  assert.match(chart.notes['1'], /^The control changes of the second part .* one higher than the specified channel\.$/);
  assert.equal(chart.notes['2'], 'Transmitted when the local switch is SURFACE.');
});

test('chart: the legend decides which glyph is Yes (the VT-4 extracts its circle as 6)', () => {
  const [chart] = readCharts([`
Pitch Bend                                        6                          6                PITCH
                                                  1  ×                          6                MODULATION
                                                 49  6                          6                ROBOT (0, 127)
Program                                           6                          6
Mode 3 : OMNI OFF, POLY  Mode 4 : OMNI OFF, MONO  × : No
Mode 1 : OMNI ON, POLY  Mode 2 : OMNI ON, MONO  6 : Yes
`]);
  assert.deepEqual(chart.rows.map((r) => [r.numbers[0], r.tx, r.rx, r.name]), [[1, false, true, 'MODULATION'], [49, true, true, 'ROBOT (0, 127)']]);
});

test('chart: numbers printed as one list over several lines share the row that has the glyphs', () => {
  const [chart] = readCharts([`
Pitch Bend                                  x                        o
                                           64  x                        o      Hold pedal
                                     5, 9, 13, 16,
 Control                             17, 18, 19,
 Change
                                     20, 21, o                        o      Patch parameters (refer to next page)
                                     22, 24
Program                                     x                        o
`]);
  const block = chart.rows.find((r) => r.name.startsWith('Patch parameters'));
  assert.deepEqual(block.numbers, [5, 9, 13, 16, 17, 18, 19, 20, 21, 22, 24]);
  assert.equal(block.tx, true);
  assert.deepEqual(chart.rows.find((r) => r.name === 'Hold pedal').numbers, [64]);
});

test('chart: a span is a summary, a table beside the chart is not a remark, a page number is not a controller', () => {
  const [chart] = readCharts([`
Function...                        Transmitted     Recognized   Remarks
Pitch Bend                           x               x                                       COW BELL       56
                                 20–29 o             o                                       HIGH CONGA     62
                                    71 o             o                                       MID CONGA      63
62
Program                              x               x
`]);
  assert.deepEqual(chart.rows.map((r) => [r.numbers.length, r.name]), [[10, ''], [1, '']]);
  assert.deepEqual(chart.spanned, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  assert.ok(!chart.numbers.includes(62));
});

test('chart: one answer for the whole section (the P-6) and a lower-case Pitch bend', () => {
  const [chart] = readCharts([`
Pitch bend                          x                      x
Control change                      o                      o                             For the values, refer to "Control change
Program                             o                      o
`]);
  assert.deepEqual(chart.whole, { tx: true, rx: true });
  assert.equal(chart.rows.length, 0);
});

test('list: two lists side by side, and one beside the chart, each read by its own header', () => {
  const page = `
 Pitch Bend   x   x                    Control change list
                                       Control Change   Explanation        Control Change   Explanation
   9-113 o  o                          9                SHUFFLE (*Rx only) 103              LT DELAY
                                       12               MIX IN LEVEL       104              HT DELAY
 Control  For details, refer to “Control change list.”
                                       17               OD DRIVE
Mode 1 : OMNI ON, POLY             Mode 2 : OMNI ON, MONO
                                       20               NOT A ROW
`;
  assert.deepEqual(readList([page]).map((r) => [r.numbers[0], r.name, r.marks.join()]), [
    [9, 'SHUFFLE (*Rx only)', ''], [103, 'LT DELAY', ''], [12, 'MIX IN LEVEL', ''], [104, 'HT DELAY', ''], [17, 'OD DRIVE', ''],
  ]);
});

test('list: an icon the text layer dropped leaves a gap inside the name, not the end of it', () => {
  const rows = readList([`
Control Change Explanation
19                 OSC         LEVEL (OSCILLATOR [       ] knob)
20                 OSC SUB OSC LEVEL (OSCILLATOR [SUB] knob)
`]);
  assert.deepEqual(rows.map((r) => [r.numbers[0], r.name, r.gaps]), [
    [19, 'OSC LEVEL (OSCILLATOR [ ] knob)', true],
    [20, 'OSC SUB OSC LEVEL (OSCILLATOR [SUB] knob)', false],
  ]);
});

test('hex list: the hexadecimal checks the decimal, `–` is unused, page references are dropped', () => {
  const { rows, issues } = readHexList([`
  0             0x00 –
  12            0x0C GRANULAR Filter Type (p. 110)
  17            0x11 GRANULAR Lo-Fi (Setting and checking the Lo-Fi effect intensity (p. 13))
  20            0x15 GRANULAR Head Speed (p. 106)
`]);
  assert.deepEqual(rows.map((r) => [r.numbers[0], r.name]), [[12, 'GRANULAR Filter Type'], [17, 'GRANULAR Lo-Fi']]);
  assert.deepEqual(issues, ['p1: 20 is printed as 0x15']);
});

test('numbers and explanations', () => {
  assert.deepEqual(expandNumbers('12–15, 64, 65'), [12, 13, 14, 15, 64, 65]);
  assert.equal(expandNumbers('12, LFO'), null);
  assert.deepEqual(splitExplanation('LFO RATE (LFO [RATE] knob)'), { name: 'LFO RATE', explanation: 'LFO [RATE] knob' });
  assert.deepEqual(splitExplanation('NOISE MODE ([SHIFT] + pad [15] (MENU): Noise Mode) ([SHIFT] + [NOISE] knob)'),
    { name: 'NOISE MODE', explanation: '[SHIFT] + pad [15] (MENU): Noise Mode; [SHIFT] + [NOISE] knob' });
  assert.deepEqual(splitExplanation('VCF CUTOFF'), { name: 'VCF CUTOFF', explanation: null });
});

/* ------------------------------------------------------------------ the profiles */

const ONLY = process.env.ROLAND_SYNTH ? process.env.ROLAND_SYNTH.split(',') : null;
const BUILT = await Promise.all(CC_SYNTHS.filter((name) => !ONLY || ONLY.includes(name)).map((name) => buildCc(name)));

const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const channelOf = (profile, recipe) => (typeof recipe.channel === 'string' ? profile.variables[recipe.channel.slice(1)] : recipe.channel);

for (const { synth, chart, profile, text, out } of BUILT) {
  test(`${synth.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/roland/make-cc-profiles.mjs ${synth.chart}`);
  });

  test(`${synth.id}: the app's own validator finds nothing wrong`, () => {
    const result = validateLocalProfileSource(profile.id, text);
    const errors = (result.validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${synth.id}: every controller compiles to its own number, on its part's channel`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    for (const parameter of profile.parameters) {
      const recipe = recipes.get(parameter.messageRecipe);
      assert.equal(recipe.kind, 'cc', parameter.id);
      const channel = channelOf(profile, recipe);
      const values = parameter.type === 'choice' ? parameter.choices.map((c) => [c.id, c.value]) : [[parameter.range.min, parameter.range.min], [parameter.range.max, parameter.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: parameter.id, value });
        assert.ok(compiled.ok, `${parameter.id}: ${compiled.error}`);
        assert.equal(compiled.messages?.length ?? 1, 1, parameter.id);
        assert.equal(compiled.hex, hex([0xb0 + channel - 1, recipe.controller, wire]), `${parameter.id} = ${value}`);
      }
    }
  });

  test(`${synth.id}: every controller in the chart is a parameter, and every parameter is one in the chart`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    const inProfile = new Set(profile.parameters.map((p) => recipes.get(p.messageRecipe).controller));
    const omitted = new Set(Object.keys(synth.omit ?? {}).map(Number));
    const added = new Set((synth.extra ?? []).map((row) => row.cc));
    for (const row of chart.rows) if (!omitted.has(row.cc)) assert.ok(inProfile.has(row.cc), `CC ${row.cc} ${row.name} is missing`);
    for (const cc of inProfile) assert.ok(chart.rows.some((row) => row.cc === cc) || added.has(cc), `CC ${cc} is not in the chart`);
  });

  test(`${synth.id}: names are the manual's, and every correction says why`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    for (const [cc, fix] of Object.entries(synth.names ?? {})) assert.ok(fix.why?.length > 10, `CC ${cc} correction has no reason`);
    for (const parameter of profile.parameters) {
      const cc = recipes.get(parameter.messageRecipe).controller;
      const row = chart.rows.find((r) => r.cc === cc) ?? synth.extra.find((r) => r.cc === cc);
      const printed = splitExplanation(synth.names?.[cc]?.name ?? row.name).name;
      assert.ok(parameter.name.includes(printed), `${parameter.id}: "${parameter.name}" is not the printed "${printed}"`);
    }
  });

  test(`${synth.id}: what the instrument only sends is never sent to it`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    for (const parameter of profile.parameters) {
      const row = chart.rows.find((r) => r.cc === recipes.get(parameter.messageRecipe).controller);
      if (row?.rx === false) assert.equal(parameter.access.canWrite, false, parameter.id);
      else assert.equal(parameter.access.canWrite, true, parameter.id);
      assert.equal(parameter.access.canRead, false, `${parameter.id}: nothing in these instruments can be read back`);
    }
  });

  test(`${synth.id}: the profile's own test vectors pass`, () => {
    assert.ok(profile.tests.length >= 2);
    const byId = new Map(profile.parameters.map((p) => [p.id, p]));
    for (const vector of profile.tests) {
      // The C++ engine refuses a value outside the parameter's range; this one does not check, so
      // a vector out of range would pass here and fail there.
      const { range } = byId.get(vector.parameter);
      assert.ok(vector.value >= range.min && vector.value <= range.max, `${vector.name}: ${vector.value} is outside ${range.min} - ${range.max}`);
      const compiled = localCompileParameter(profile, { parameterId: vector.parameter, value: vector.value });
      assert.ok(compiled.ok, compiled.error);
      assert.equal(compiled.hex, vector.expectedHex, vector.name);
    }
  });

  if (profile.presets) {
    test(`${synth.id}: a preset is a Program Change on the channel`, () => {
      for (const bank of profile.presets.banks) {
        for (const slot of [bank.startSlot, bank.startSlot + bank.slotCount - 1]) {
          const recalled = localCompilePresetRecall(profile, { slot });
          assert.ok(recalled.ok, recalled.error);
          assert.equal(recalled.hex, hex([0xc0 + profile.variables.channel - 1, bank.programBase + slot - bank.startSlot]));
        }
      }
    });
  }

  test(`${synth.id}: the source is the manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.equal(profile.sources[0].type, 'manual');
    assert.match(profile.sources[0].notes, new RegExp(`sha256 ${chart.source.sha256}`));
  });
}

test('JP-08: the Lower part is the Upper part one channel up, as chart note *1 says', () => {
  const built = BUILT.find((b) => b.synth.id === 'roland-jp-08');
  if (!built) return;
  const { profile, chart } = built;
  assert.match(chart.chart.notes['1'], /Lower part .* one higher \(\+1\)/);
  const upper = localCompileParameter(profile, { parameterId: 'upper.vcf.cutoff', value: 64 });
  const lower = localCompileParameter(profile, { parameterId: 'lower.vcf.cutoff', value: 64 });
  assert.equal(upper.hex, 'B0 4A 40');
  assert.equal(lower.hex, 'B1 4A 40');
  const moved = localCompileParameter(profile, { parameterId: 'lower.vcf.cutoff', value: 64, variables: { lowerChannel: 1 } });
  assert.equal(moved.hex, 'B0 4A 40', 'channel 16 wraps the Lower part to 1: the variable is what the engine reads');
});
