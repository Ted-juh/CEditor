// sequentialProfiles.test.js — device profiles read out of Sequential's (and Dave Smith
// Instruments' and Oberheim's) own manuals.
//
// tools/profiles/sequential/ reads a manual's NRPN tables (read-nrpn-tables.mjs), commits them as
// tables/<name>.json, and builds a profile from them and a layout. Checked here against things that
// are not the builder's own arithmetic:
//
//   - the READER on fixtures in each print style the manuals use, including the ones that broke
//     it: headers centred over their columns, tables side by side, a two-page spread, a table that
//     runs onto the next page without its header, footnotes printed beside a row, a row printed
//     without its range, a value label that looks like a row;
//   - every PROFILE through the app's own engine: each parameter compiles to its NRPN number on
//     CC 99/98 and its value on CC 6/38, MSB first, at both ends of its range;
//   - the committed profiles against the generator, so a layout edit cannot ship stale.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readTables, rowPattern, span, splitMore } from '../../../tools/profiles/sequential/read-nrpn-tables.mjs';
import { buildNrpnProfile, interpretRow, spaced } from '../../../tools/profiles/sequential/build-nrpn-profile.mjs';
import { checkTables } from '../../../tools/profiles/sequential/import-manual.mjs';
import { SYNTHS, build } from '../../../tools/profiles/sequential/make-profiles.mjs';
import {
  localCompileParameter,
  localCompilePresetRecall,
  validateLocalProfileSource,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const NRD = /NRPN\s+(?:Range|Value)\s+Description/g;

test('two tables side by side, headers centred over their columns: each row goes to its own table', () => {
  // The Prophet-6's: the right table's header sits eight characters right of its numbers, so a
  // column cut at the header splits `109` into `10` and `9`. Columns come from where rows start.
  const page = `
      NRPN   Value   Description                NRPN   Value   Description

 0           0-60    Osc 1 Freq           68           0-127   VCA Env Decay
 1           0-1     Osc 1 Sync           109          0-254   Pressure Amt
 143         0-254   PolyMod Filter Env   110          0-1     Pressure Freq 1
                     Amt                                       Dest On/Off
 1027        0-3     MIDI Clock Mode
                     0 = Off
                     1 = Master
`;
  const rows = readTables([page], { header: NRD, fields: ['nrpn', 'range', 'desc'] });
  assert.deepEqual(rows.map((r) => [r.column, r.nrpn, r.range, r.desc, r.more.join('|')]), [
    [0, '0', '0-60', 'Osc 1 Freq', ''],
    [1, '68', '0-127', 'VCA Env Decay', ''],
    [0, '1', '0-1', 'Osc 1 Sync', ''],
    [1, '109', '0-254', 'Pressure Amt', ''],
    [0, '143', '0-254', 'PolyMod Filter Env', 'Amt'],
    [1, '110', '0-1', 'Pressure Freq 1', 'Dest On/Off'],
    [0, '1027', '0-3', 'MIDI Clock Mode', '0 = Off|1 = Master'],
  ]);
});

test('name first (Prophet-5, Take 5): a wrapped name continues; RESERVED, furniture and n/a are not rows of it', () => {
  const page = `
Name                    NRPN   Range   Name                     NRPN   Range
OSC A FREQUENCY         0      0-120   LFO FREQ PW A ON/        29     0-1
                                       OFF
FilterFreq              29     0-1023  UNISON NOTE              55-64  1-10
FilterFreqMSB           30     n/a     RESERVED 65-85
8    Prophet-5 MIDI Implementation
`;
  const rows = readTables([page], { header: /Name\s+NRPN\s+Range/g, fields: ['name', 'nrpn', 'range'] });
  assert.deepEqual(rows.map((r) => [r.name, r.nrpn, r.range, r.more.join('|')]), [
    ['OSC A FREQUENCY', '0', '0-120', ''],
    ['LFO FREQ PW A ON/', '29', '0-1', 'OFF'],
    ['FilterFreq', '29', '0-1023', ''],
    ['UNISON NOTE', '55-64', '1-10', ''],
    ['FilterFreqMSB', '30', 'n/a', ''],
  ]);
});

test('layers A and B: N/A and X for one layer, a row printed without its range, a label that is not a row', () => {
  const page = `
   NRPN             NRPN         Value Description
  Layer A          Layer B
     163             N/A         0-2     A/B Mode
     287              X          0-127   Split Point
     93              605         0-4     Unison Mode
                                         0  1 voice
     480             992                 Name Character 1
`;
  const rows = readTables([page], { header: /NRPN\s+NRPN\s+Value\s+Description/g, fields: ['nrpn', 'nrpnB', 'range', 'desc'] });
  assert.deepEqual(rows.map((r) => [r.nrpn, r.nrpnB, r.range ?? null, r.desc, r.more.join('|')]), [
    ['163', 'N/A', '0-2', 'A/B Mode', ''],
    ['287', 'X', '0-127', 'Split Point', ''],
    ['93', '605', '0-4', 'Unison Mode', '0 1 voice'],
    ['480', '992', null, 'Name Character 1', ''],
  ]);
  assert.equal(span('N/A'), null);
  assert.equal(span('X'), null);
  assert.deepEqual(span('256-319'), [256, 319]);
});

test('a table that runs onto the next page without its header carries on, and stops at prose', () => {
  const first = `
  Parm      A       B      Range     Description
    0       0      200    0 – 120   Oscillator 1 Frequency, 0 – 120 in semitones (10
                                    octave range)
`;
  const second = `
 4    4    204    0-1      Oscillator 1 Keyboard Off/On
13   11   211    0-3      Glide Mode:
                          0    fixed rate
                          1    fixed rate auto
The following tables list the values used with the program parameters to specify modulation destinations.
 99   99   299    0-1      Not a row of this table
`;
  const rows = readTables([first, second], { header: /Parm\s+A\s+B\s+Range\s+Description/g, fields: ['param', 'nrpn', 'nrpnB', 'range', 'desc'] });
  assert.deepEqual(rows.map((r) => [r.page, r.param, r.nrpn, r.nrpnB]), [[1, '0', '0', '200'], [2, '4', '4', '204'], [2, '13', '11', '211']]);
  assert.deepEqual(splitMore(rows[2].more, { labels: 'bare' }).labels, [{ value: 0, label: 'fixed rate' }, { value: 1, label: 'fixed rate auto' }]);
});

test('a footnote printed beside a row is cut off, and each mark means what its own table\'s footnote says', () => {
  const globals = `
 NRPN     Range   Description
 4109     0-2     Pot Mode              *Controller received, but not transmitted.
                  0 = Relative          † Controller transmitted, but ignored when received.
 4102     0-2     MIDI Param Receive†
`;
  const sequencer = `
 NRPN     Range   Description
 784      0-255   Track 2, Step 1 Slew/Tie†
†The first 7 bits set the slew value, 0 - 127. Set bit 8 high to turn on Tie.
`;
  const a = readTables([globals], { header: NRD, fields: ['nrpn', 'range', 'desc'] });
  assert.deepEqual(a.map((r) => [r.desc, r.more.join('|')]), [['Pot Mode', '0 = Relative'], ['MIDI Param Receive†', '']]);
  assert.match(a[1].footnotes['†'], /ignored when received/);
  const b = readTables([sequencer], { header: NRD, fields: ['nrpn', 'range', 'desc'] });
  assert.match(b[0].footnotes['†'], /slew value/);
});

test('a two-page spread: the other page\'s text, far right, is not part of this table', () => {
  const page = `
    NRPN     Value             Description                                                                Request Program Dump
 4188        0-1               Seq Play/Stop                                                              0000 0101   Request Program Transmit
                                                                                                          0000 00vv   Bank Number, 0 - 7
`;
  const rows = readTables([page], { header: NRD, fields: ['nrpn', 'range', 'desc'] });
  assert.deepEqual(rows.map((r) => [r.nrpn, r.desc, r.more.length]), [['4188', 'Seq Play/Stop', 0]]);
});

test('the table checks: a dump position printed twice, layer B off its offset, a backward range', () => {
  const rows = (list) => list.map(([param, nrpn, nrpnB, range]) => ({ param, nrpn, nrpnB, range, more: [] }));
  const issues = checkTables([{ id: 't', rows: rows([['85', '83', '283', '0-254'], ['86', '84', '284', '0-47'], ['86', '85', '285', '0-254'], ['87', '86', '300', '9-1']]) }]);
  assert.deepEqual(issues, [
    't: dump position 86 is printed for NRPN 84 and 85',
    't: layer B is A + 214 at NRPN 86, not + 200',
    't: NRPN 86 has the range 9-1',
  ]);
});

test('what a row means: choices only when the labels name every value, explanations out of the name', () => {
  const layout = { tables: [] };
  const choice = interpretRow({ nrpn: '1027', range: '0-3', desc: 'MIDI Clock Mode', more: ['0 = Off', '1 = Master', '2 = Slave', '3 = Slave Thru'] }, {}, layout);
  assert.deepEqual(choice.labels.map((l) => l.label), ['Off', 'Master', 'Slave', 'Slave Thru']);
  const wrapped = interpretRow({ nrpn: '4121', range: '0-1', desc: 'OLED Screen-', more: ['saver', '0 = Off', '1 = On'] }, {}, layout);
  assert.equal(wrapped.name, 'OLED Screensaver');
  // A dash with a space before it is punctuation, not a word split across the line (the OB-6).
  const dash = interpretRow({ nrpn: '50', range: '0-1', desc: 'Filter Normal -', more: ['Bandpass'] }, {}, layout);
  assert.equal(dash.name, 'Filter Normal - Bandpass');
  const explained = interpretRow({ nrpn: '356', range: '1-33', desc: 'Track 1 Reset', more: ['“Default” resets for 16- and 32-step sequences', 'are 17 and 33, respectively.'] }, {}, layout);
  assert.equal(explained.name, 'Track 1 Reset');
  assert.match(explained.description, /^“Default” resets/);
  const see = interpretRow({ nrpn: '96', range: '0-22', desc: 'Mod 1 Source (see table of modulation sources and values)', more: [] }, {}, layout);
  assert.equal(see.name, 'Mod 1 Source');
  const wrapRange = interpretRow({ name: 'Osc1FreqFine', nrpn: '9', range: '-700-', more: ['700'] }, {}, layout);
  assert.equal(wrapRange.ranged, false);
  assert.equal(wrapRange.range, '-700-700');
  assert.equal(spaced('EnvVCAAmt'), 'Env VCA Amt');
  assert.equal(spaced('Osc2ShapeMod'), 'Osc 2 Shape Mod');
});

test('the builder: a run named by its span, a number printed twice in one table, a skipped run', () => {
  const data = {
    source: { title: 'Fixture', version: '1', file: 'fixture.pdf', sha256: '0', url: 'https://example.invalid/fixture.pdf' },
    tables: [{
      id: 'program',
      pages: [1, 1],
      rows: [
        { page: 1, nrpn: '93', range: '0-4', desc: 'Unison Mode', more: [] },
        { page: 1, nrpn: '93', range: '0-5', desc: 'Key Assign Mode', more: [] },
        { page: 1, nrpn: '256-259', range: '12-108', desc: 'Seq Step 1-4', more: ['Note 1'] },
        { page: 1, nrpn: '236-239', range: '32-125', desc: 'Name 0-3', more: [] },
        { page: 1, nrpn: '1029', range: '0-1', desc: 'Sync', more: ['0 = Off', '1 = On'] },
      ],
    }],
  };
  const layout = {
    id: 'fixture', name: 'Fixture', family: 'Test', document: {}, tables: [{ id: 'program', group: 'Program' }],
    skip: [[/^Name\b/, 'a name']],
  };
  const profile = buildNrpnProfile(data, layout);
  assert.deepEqual(profile.parameters.map((p) => p.name), ['Unison Mode', 'Seq Step 1 Note 1', 'Seq Step 2 Note 1', 'Seq Step 3 Note 1', 'Seq Step 4 Note 1', 'Sync']);
  assert.match(profile.parameters[0].description, /also prints NRPN 93 for "Key Assign Mode"/);
  assert.equal(profile.parameters.at(-1).type, 'choice');
  assert.ok(profile.authoringNotes.some((n) => /Left out, a name: NRPN 236-239/.test(n)));
  assert.equal(rowPattern(['nrpn', 'range', 'desc']).test('   12    0-1     Osc 1 Sync'), true);
});

/* ------------------------------------------------------------------ the profiles */

const ONLY = process.env.SEQUENTIAL_SYNTH ? process.env.SEQUENTIAL_SYNTH.split(',') : null;
const BUILT = await Promise.all(SYNTHS.filter((name) => !ONLY || ONLY.includes(name)).map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/sequential/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its NRPN on 99/98 and its value on 6/38, MSB first`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    const ids = new Set();
    for (const parameter of profile.parameters) {
      assert.ok(!ids.has(parameter.id), `${parameter.id} twice`);
      ids.add(parameter.id);
      const recipe = recipes.get(parameter.messageRecipe);
      assert.equal(recipe.kind, 'nrpn');
      assert.equal(recipe.valueResolution, 14);
      const values = parameter.type === 'choice'
        ? [parameter.choices[0], parameter.choices.at(-1)].map((c) => [c.id, c.value])
        : [[parameter.range.min, parameter.range.min], [parameter.range.max, parameter.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: parameter.id, value });
        assert.ok(compiled.ok, `${parameter.id}: ${compiled.error}`);
        assert.equal(compiled.hex, hex([0xb0, 0x63, recipe.parameterMsb, 0xb0, 0x62, recipe.parameterLsb, 0xb0, 0x06, wire >> 7, 0xb0, 0x26, wire & 0x7f]), `${parameter.id} = ${value}`);
      }
    }
  });

  test(`${profile.id}: the profile's own test vectors pass, inside each parameter's range`, () => {
    const byId = new Map(profile.parameters.map((p) => [p.id, p]));
    const vectors = profile.tests.filter((t) => t.parameter);
    assert.ok(vectors.length >= 2);
    for (const vector of vectors) {
      const parameter = byId.get(vector.parameter);
      if (parameter.type === 'integer') assert.ok(vector.value >= parameter.range.min && vector.value <= parameter.range.max, vector.name);
      const compiled = localCompileParameter(profile, { parameterId: vector.parameter, value: vector.value });
      assert.ok(compiled.ok, compiled.error);
      // The vectors are written one CC per line, as the C++ engine's tests compare them.
      const bytes = compiled.transaction.messages.flatMap((m) => m.bytes);
      const lines = Array.from({ length: bytes.length / 3 }, (unused, i) => hex(bytes.slice(i * 3, i * 3 + 3)));
      assert.equal(lines.join('\n'), vector.expectedHex, vector.name);
    }
  });

  test(`${profile.id}: only what the manual says is ignored when received is read-only`, () => {
    for (const parameter of profile.parameters) {
      const ignored = /ignored when received/i.test(parameter.description ?? '');
      assert.equal(parameter.access.canWrite, !ignored, parameter.id);
      assert.equal(parameter.access.canRead, false);
    }
  });

  if (profile.presets) {
    test(`${profile.id}: a preset is Bank Select on CC 32, then Program Change`, () => {
      for (const bank of profile.presets.banks) {
        const recalled = localCompilePresetRecall(profile, { slot: bank.startSlot + bank.slotCount - 1 });
        assert.ok(recalled.ok, recalled.error);
        assert.equal(recalled.hex, hex([0xb0, 32, bank.bankLsb, 0xc0, bank.programBase + bank.slotCount - 1]));
      }
    });
  }

  test(`${profile.id}: the source is the manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.match(profile.sources[0].notes, new RegExp(`sha256 ${data.source.sha256}`));
  });

  test(`${profile.id}: it recognises the instrument, or says why it cannot`, () => {
    if (profile.identity) {
      assert.equal(profile.identity.familyCode.length, 2);
      assert.ok(profile.tests.some((t) => t.kind === 'identityRequest' && t.expectedHex === 'F0 7E 7F 06 01 F7'));
    } else {
      assert.ok(profile.authoringNotes.some((n) => /^No identity check: /.test(n)), 'a profile without an identity says why');
    }
  });
}

/* ------------------------------------------------------------------ Oberheim */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const nrpnOf = (profile, parameter) => {
  const recipe = profile.messageRecipes.find((r) => r.id === parameter.messageRecipe);
  return recipe.parameterMsb * 128 + recipe.parameterLsb;
};
const atNrpn = (profile, n) => profile.parameters.filter((p) => nrpnOf(profile, p) === n);

test('the OB-6: a Prophet-6 layout, its globals in Global, no identity because its manual prints the Prophet-6\'s', { skip: !builtProfile('oberheim-ob-6') }, () => {
  const profile = builtProfile('oberheim-ob-6');
  assert.equal(profile.manufacturer, 'Oberheim');
  assert.equal(profile.identity, undefined);
  assert.ok(profile.authoringNotes.some((n) => /2DH \(the Prophet-6's\).*2EH/.test(n)));
  assert.equal(atNrpn(profile, 1039)[0].group, 'Global', 'Seq Jack is a global');
  assert.equal(atNrpn(profile, 1024)[0].name, 'Master Fine Tune', 'the Global table names the globals');
  assert.equal(atNrpn(profile, 50)[0].name, 'Filter Normal - Bandpass');
  assert.equal(atNrpn(profile, 143)[0].group, 'Cross Mod');
  assert.equal(profile.parameters.filter((p) => /^Seq Step \d+ (Note|Vel) \d$/.test(p.name)).length, 768);
  assert.equal(profile.presets.banks.length, 10);
});

test('the OB-X8: names as printed, with the manual\'s slips said where they are', { skip: !builtProfile('oberheim-ob-x8') }, () => {
  const profile = builtProfile('oberheim-ob-x8');
  assert.equal(profile.identity, undefined);
  assert.equal(profile.presets, undefined);
  assert.equal(profile.parameters.length, 113);
  assert.equal(atNrpn(profile, 86)[0].name, 'ARP NUMBER OF TRANSPOSE INTERVALS');
  for (const n of [56, 57]) assert.match(atNrpn(profile, n)[0].description, /same name for NRPN 56 and 57/);
  assert.equal(atNrpn(profile, 94)[0].range.max, 1207, 'kept as printed');
  assert.match(atNrpn(profile, 1122)[0].description, /1090/);
  assert.deepEqual(atNrpn(profile, 1090), [], 'the second split number is not offered');
  assert.ok(profile.authoringNotes.some((n) => /NRPN 102, .*121\.$/.test(n)), 'the program name is left out');
});

test('the TEO-5: Oberheim\'s own manufacturer ID, globals from 4096, the cutoff\'s MSB half left out', { skip: !builtProfile('oberheim-teo-5') }, () => {
  const profile = builtProfile('oberheim-teo-5');
  assert.deepEqual([profile.identity.manufacturerId, profile.identity.familyCode], [['02'], ['5A', '01']]);
  for (const n of [4096, 4118, 4122]) assert.equal(atNrpn(profile, n)[0].group, 'Global', `NRPN ${n}`);
  assert.deepEqual([...atNrpn(profile, 35), ...atNrpn(profile, 39)], []);
  assert.equal(atNrpn(profile, 34)[0].range.max, 1024);
  assert.equal(profile.presets, undefined);
});
