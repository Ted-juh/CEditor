// moogProfiles.test.js — device profiles read out of Moog's manuals.
//
// tools/profiles/moog/ reads the MIDI CC (and NRPN) tables in those PDFs from poppler's word
// positions (read-moog-pdf.mjs), commits the rows as tables/<name>.json, and builds a profile from
// them and a layout. Checked here against things that are not the builder's own arithmetic:
//
//   - the READER on a page set the way Moog sets them: headings found by their printed text, a
//     heading centred over its column, a value list wrapped under its row, the row's other cells set
//     in the middle of a tall cell, an MSB over its LSB, section labels centred on their rows;
//   - the BUILDER's rules: a knob is its MSB, 0 - 127; a value list is a choice, the first value of
//     each band sent; a list printed out of order stays a number; numbers that move with the values
//     are a scale; MIDI's own controllers are left out; an NRPN is sent as one 14-bit value;
//   - every PROFILE through the app's own engine, and the committed profiles against the generator.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { pageRows } from '../../../tools/profiles/moog/read-moog-pdf.mjs';
import { buildMoogProfile, readBands, readController, readPoints, readValues } from '../../../tools/profiles/moog/build-moog-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/moog/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

// A page in poppler's -bbox-layout form: a block a cell, a line a line of it.
const words = (x0, y0, text) => text.split(' ').map((w, i, all) => {
  const x = x0 + all.slice(0, i).join(' ').length * 5 + (i ? 5 : 0);
  return `<word xMin="${x}" yMin="${y0}" xMax="${x + w.length * 5}" yMax="${y0 + 9}">${w}</word>`;
}).join('');
const line = (x0, y0, text) => `<line xMin="${x0}" yMin="${y0}" xMax="${x0 + text.length * 5}" yMax="${y0 + 9}">${words(x0, y0, text)}</line>`;
const block = (...lines) => `<block xMin="0" yMin="0" xMax="0" yMax="0">${lines.join('')}</block>`;
const page = (...blocks) => `<page width="612.000000" height="792.000000"><flow>${blocks.join('')}</flow></page>`;

test('a table found by its printed headings: a centred heading, a wrapped value list, an MSB over its LSB', () => {
  const xml = page(
    block(line(60, 40, 'Some prose that mentions Parameter in passing.')),
    // Headings: `Values` centred over a column whose cells start well left of it.
    block(line(70, 80, 'Parameter')), block(line(200, 74, 'CC Number'), line(212, 84, '(MSB)')), block(line(400, 80, 'Values')),
    block(line(70, 110, 'Filter Cutoff')), block(line(205, 110, '19')), block(line(330, 110, 'MIN TO MAX (0 TO 16383)')),
    // A two-line value cell with the row's name and controller set in the middle of it.
    block(line(70, 136, 'VCO 2 Frequency')), block(line(205, 136, '12')), block(line(330, 130, '-7 SEMITONES TO +7 SEMITONES (0 TO'), line(330, 141, '16383 BIPOLAR; 8192 = 0 SEMITONES)')),
    block(line(70, 170, 'Glide Enable')), block(line(205, 170, '65')), block(line(330, 170, '0-63 = OFF, 64-127 = ON')),
    block(line(300, 760, '46')),
  );
  const { rows } = pageRows(xml, [['name', 'Parameter'], ['cc', 'CC Number (MSB)'], ['values', 'Values']]);
  assert.deepEqual(rows.map((r) => [r.name, r.cc, r.values]), [
    ['Filter Cutoff', '19', 'MIN TO MAX (0 TO 16383)'],
    ['VCO 2 Frequency', '12', '-7 SEMITONES TO +7 SEMITONES (0 TO 16383 BIPOLAR; 8192 = 0 SEMITONES)'],
    ['Glide Enable', '65', '0-63 = OFF, 64-127 = ON'],
  ], 'the prose mentioning `Parameter` is not the table, and the page number is not a row');

  // Rows set from the top, a value list wrapped under its own row; an MSB with its LSB below it.
  const top = page(
    block(line(80, 50, 'CONTROL/PARAMETER')), block(line(280, 50, 'MIDI CC #')), block(line(376, 50, 'CC VALUE RANGE')),
    block(line(88, 70, 'MOD 1 SOURCE')), block(line(280, 70, '71')), block(line(376, 70, '0 = TRIANGLE LFO, 21 = SQUARE LFO,'), line(376, 81, '43 = SAW LFO')),
    block(line(88, 97, 'CUTOFF')), block(line(280, 97, '19(MSB)'), line(280, 108, '51(LSB)')), block(line(376, 97, '0-127')),
  );
  const got = pageRows(top, [['name', 'CONTROL/PARAMETER'], ['cc', 'MIDI CC #'], ['values', 'CC VALUE RANGE']], { valign: 'top' }).rows;
  assert.deepEqual(got.map((r) => [r.name, r.cc, r.values]), [
    ['MOD 1 SOURCE', '71', '0 = TRIANGLE LFO, 21 = SQUARE LFO, 43 = SAW LFO'],
    ['CUTOFF', '19(MSB) 51(LSB)', '0-127'],
  ]);
});

test('section labels: each set in the middle of the rows it covers', () => {
  const rows = [];
  // Six rows under MODULATION, three under MIXER: the labels sit at each run's middle.
  for (let i = 0; i < 9; i++) rows.push(block(line(100, 70 + i * 20, `ROW ${i}`)), block(line(300, 70 + i * 20, String(10 + i))));
  const xml = page(
    block(line(40, 50, 'SECTION')), block(line(100, 50, 'CONTROL')), block(line(300, 50, 'CC')),
    ...rows,
    block(line(40, 70 + 2.5 * 20, 'MODULATION')), block(line(40, 70 + 7 * 20, 'MIXER')),
  );
  const got = pageRows(xml, [['section', 'SECTION'], ['name', 'CONTROL'], ['cc', 'CC']]).rows;
  assert.deepEqual(got.map((r) => r.section), ['MODULATION', 'MODULATION', 'MODULATION', 'MODULATION', 'MODULATION', 'MODULATION', 'MIXER', 'MIXER', 'MIXER']);
});

/* ------------------------------------------------------------------ the builder */

test('reading a value cell: bands, points, a scale, a misprint, a 14-bit range', () => {
  assert.deepEqual(readBands('0-63 = OFF, 64-127 = ON'), [{ from: 0, to: 63, label: 'OFF' }, { from: 64, to: 127, label: 'ON' }]);
  assert.deepEqual(readBands('0-127 0-24: TRIANGLE 25-49: SAW').map((b) => b.label), ['TRIANGLE', 'SAW'], 'the whole range, then its bands');
  assert.deepEqual(readBands('0-63(SAW) 64-127(SQR)').map((b) => b.label), ['SAW', 'SQR']);
  assert.equal(readBands('0-127 [MSB], 0-16383[MSB,LSB]'), null, 'an MSB and its 14-bit pair are not two bands');
  assert.deepEqual(readPoints('0 = 16\', 32 = 8\', 64 = 4\', 96 = 2\'').map((p) => p.value), [0, 32, 64, 96]);
  assert.deepEqual(readPoints('42 (LO) 85 (MED) 127 (HI)'), [{ value: 42, label: 'LO' }, { value: 85, label: 'MED' }, { value: 127, label: 'HI' }]);
  assert.deepEqual(readValues('0-127 [MSB], 0-16383[MSB,LSB]'), { min: 0, max: 127 }, 'a CC carries the MSB');
  assert.deepEqual(readValues('0 – 16383', 16383), { min: 0, max: 16383 }, 'an NRPN carries all 14 bits');
  assert.equal(readValues('0-127 (64 is center)').bipolar, true);
  assert.deepEqual(readValues('0 = -12 SEMITONES, 1 = -11 SEMITONES, 12 = +0 SEMITONES, 24 = +12 SEMITONES'), { min: 0, max: 24, shown: { min: -12, max: 12 } }, 'names that move with the values are a scale');
  assert.equal(readValues('0-127 0-24: SINE 25-49: SAWTOOTH 50-74: RAMP 5-99: SQUARE 100-127: NOISE').number, true, 'the Muse\'s misprint stays a number');
  assert.match(readValues('RECEIVE ONLY: -12…+13 SEMITONES').skip, /value shown/);
  assert.deepEqual(readController('3 [MSB], 35 [LSB]'), { cc: 3, lsb: 35 });
  assert.deepEqual(readController('MSB 10 LSB 42'), { cc: 10, lsb: 42 });
  assert.deepEqual(readController('4 (coarse) 36 (fine)'), { cc: 4, lsb: null, fine: 36 }, 'a fine controller in units of its own, not an LSB');
});

test('the builder: a knob is a 14-bit pair, a list is a choice, MIDI\'s own controllers are left out, an NRPN is 14 bits', () => {
  const data = {
    sources: [{ title: 'probe', file: 'probe.pdf', sha256: '00', url: 'https://example.invalid' }],
    tables: [
      { doc: 0, kind: 'cc', pages: [1], rows: [
        { doc: 0, page: 1, section: '', name: 'FILTER CUTOFF', cc: '19 [MSB], 51 [LSB]', values: '0-127 [MSB], 0-16383[MSB,LSB]' },
        { doc: 0, page: 1, section: '', name: 'GLIDE TYPE', cc: '85', values: '0 = LCR, 43 = LCT, 85 = EXP' },
        { doc: 0, page: 1, section: '', name: 'MOD 1 FILTER AMT', cc: '11 [MSB], 50 [LSB]', values: '0-127 [MSB], 0-16383[MSB,LSB]' },
        { doc: 0, page: 1, section: '', name: 'MOD 2 FILTER AMT', cc: '16 [MSB], 50 [LSB]', values: '0-127 [MSB], 0-16383[MSB,LSB]' },
        { doc: 0, page: 1, section: '', name: 'BANK SELECT', cc: '0', values: 'ALWAYS TRANSMITS 0' },
        { doc: 0, page: 1, section: '', name: 'LOCAL CONTROL ON/OFF', cc: '122', values: '0 = OFF / 127 = ON' },
        { doc: 0, page: 1, section: '', name: '<RESERVED - DATA ENTRY>', cc: '6 [MSB], 38 [LSB]', values: '' },
        { doc: 0, page: 1, section: 'LFO', name: 'SQUARE', cc: '68', values: '31' },
        { doc: 0, page: 1, section: 'LFO', name: 'SAW', cc: '68', values: '127' },
      ] },
      { doc: 0, kind: 'nrpn', pages: [2], rows: [
        { doc: 0, page: 2, section: '', name: 'F EG ATTACK', count: '16384', nrpn: '505', msb: '3', lsb: '121' },
        { doc: 0, page: 2, section: '', name: 'ARP RANGE', count: '7', nrpn: '405', msb: '3', lsb: '21' },
      ] },
    ],
  };
  const profile = buildMoogProfile(data, { id: 'probe', name: 'probe', family: 'probe', documents: [], joined: { cc68: 'LFO WAVE' } });
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.deepEqual(by('FILTER CUTOFF').range, { min: 0, max: 16383 }, 'an MSB and its LSB');
  assert.equal(localCompileParameter(profile, { parameterId: by('FILTER CUTOFF').id, value: 1000 }).hex, 'B0 13 07 B0 33 68', 'the MSB first, then the LSB');
  assert.deepEqual(by('MOD 2 FILTER AMT').range, { min: 0, max: 127 }, 'an LSB printed for two rows: the MSB alone');
  assert.equal(localCompileParameter(profile, { parameterId: by('GLIDE TYPE').id, value: 'exp' }).hex, 'B0 55 55');
  assert.equal(by('BANK SELECT'), undefined);
  assert.equal(by('LOCAL CONTROL ON/OFF'), undefined, 'a channel mode message');
  assert.deepEqual(by('LFO WAVE').choices.map((c) => [c.label, c.value]), [['SQUARE', 31], ['SAW', 127]], 'rows sharing a controller, one value each');
  assert.equal(localCompileParameter(profile, { parameterId: by('F EG ATTACK').id, value: 1000 }).hex, 'B0 63 03 B0 62 79 B0 06 07 B0 26 68', 'MSB 7, LSB 104');
  assert.deepEqual(by('ARP RANGE').range, { min: 0, max: 6 }, 'seven values');
});

/* ------------------------------------------------------------------ the profiles */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/moog/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN at both ends of its range`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    const ids = new Set();
    for (const parameter of profile.parameters) {
      assert.ok(!ids.has(parameter.id), `${parameter.id} twice`);
      ids.add(parameter.id);
      const recipe = recipes.get(parameter.messageRecipe);
      const values = parameter.type === 'choice'
        ? [parameter.choices[0], parameter.choices.at(-1)].map((c) => [c.id, c.value])
        : [[parameter.range.min, parameter.range.min], [parameter.range.max, parameter.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: parameter.id, value });
        assert.ok(compiled.ok, `${parameter.id}: ${compiled.error}`);
        if (recipe.kind === 'sysex') continue;
        const bytes = recipe.kind === 'nrpn' ? [0xb0, 0x63, recipe.parameterMsb, 0xb0, 0x62, recipe.parameterLsb, 0xb0, 0x06, wire >> 7, 0xb0, 0x26, wire & 127]
          : recipe.lsbController !== undefined ? [0xb0, recipe.controller, wire >> 7, 0xb0, recipe.lsbController, wire & 127]
          : [0xb0, recipe.controller, wire];
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
      const got = compiled.transaction.messages.map((m) => (m.bytes[0] === 0xf0 ? [hex(m.bytes)] : Array.from({ length: m.bytes.length / 3 }, (unused, i) => hex(m.bytes.slice(i * 3, i * 3 + 3))))).flat();
      assert.equal(got.join('\n'), vector.expectedHex, vector.name);
    }
  });

  if (profile.dumpDefinitions) {
    test(`${profile.id}: each request asks for its setting, and the reply reads back`, () => {
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

  test(`${profile.id}: the source is the manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Moog');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;

test('the Sub 37: its CCs and its NRPN chart, the chart\'s misprinted rows left out', { skip: !builtProfile('moog-sub-37') }, () => {
  const profile = builtProfile('moog-sub-37');
  const by = (name, nrpn) => profile.parameters.find((p) => p.name === name && p.group.endsWith('(NRPN)') === nrpn);
  assert.equal(localCompileParameter(profile, { parameterId: by('FILTER CUTOFF', false).id, value: 12800 }).hex, 'B0 13 64 B0 33 00', 'CC 19 and its LSB, CC 51');
  assert.equal(localCompileParameter(profile, { parameterId: by('FILTER CUTOFF', true).id, value: 16383 }).hex, 'B0 63 03 B0 62 73 B0 06 7F B0 26 7F', 'NRPN 499');
  assert.equal(by('OSC 1 ON', true), undefined, 'printed with 21 values');
  assert.ok(profile.authoringNotes.some((n) => /out of step/.test(n)));
});

test('the Matriarch: a global setting by SysEx to any unit, and read back from its reply', { skip: !builtProfile('moog-matriarch') }, () => {
  const profile = builtProfile('moog-matriarch');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  const swing = by('Arp/Seq Swing');
  assert.equal(localCompileParameter(profile, { parameterId: swing.id, value: 8192 }).hex, 'F0 04 17 23 17 40 00 00 00 00 00 00 00 00 00 7F F7', 'parameter 23, MSB 64 then LSB 0, Unit ID 7F');
  assert.equal(localCompileParameter(profile, { parameterId: by('Paraphony Mode').id, value: 'quad' }).hex, 'F0 04 17 23 37 00 02 00 00 00 00 00 00 00 00 7F F7');
  const parsed = localParseDumpMessage(profile, 'F0 04 17 23 17 40 00 00 00 00 00 00 00 00 01 00 F7');
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.values[swing.id], 8192, 'the reply, marked with 1 before the Unit ID');
  assert.equal(by('Unit ID'), undefined);
});

test('the Minitaur: two value lists as its v2.1 addendum corrects them', { skip: !builtProfile('moog-minitaur') }, () => {
  const profile = builtProfile('moog-minitaur');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.deepEqual(by('TRIGGER MODE').choices.map((c) => c.value), [0, 43, 86]);
  assert.deepEqual(by('KEY PRIORITY').choices.map((c) => c.value), [0, 43, 86]);
  assert.deepEqual(by('BEND DOWN AMOUNT').choices.map((c) => c.value), by('BEND UP AMOUNT').choices.map((c) => c.value), 'one list printed across both rows');
});

test('the Claravox: 14-bit settings on their NRPNs, the rest on their CCs, ♯ and ♭ restored', { skip: !builtProfile('moog-claravox-centennial') }, () => {
  const profile = builtProfile('moog-claravox-centennial');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.equal(localCompileParameter(profile, { parameterId: by('Delay Time').id, value: 16383 }).hex, 'B0 63 03 B0 62 24 B0 06 7F B0 26 7F', 'NRPN 420');
  assert.equal(localCompileParameter(profile, { parameterId: by('Register').id, value: by('Register').choices.at(-1).id }).hex, 'B0 4B 60', 'CC 75');
  assert.equal(by('Quantize (ROOT)').choices[1].label, 'C♯ (D♭)');
  assert.equal(by('Volume Response').type, 'bipolar');
});

test('the Grandmother: values from the tables its rows point to', { skip: !builtProfile('moog-grandmother') }, () => {
  const profile = builtProfile('moog-grandmother');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.equal(by('ARP/SEQ CLOCK DIVISION').choices.length, 24, 'the clock divisions, over two columns');
  assert.deepEqual(by('PITCH BEND UP AMT').choices.at(-1), { id: '24twooctaves', label: '24 (TWO OCTAVES)', value: 123 });
});
