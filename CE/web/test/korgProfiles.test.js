// korgProfiles.test.js — device profiles read out of Korg's own MIDI Implementation documents.
//
// tools/profiles/korg/ reads the plain-text MIDI Implementation Korg publishes for each instrument
// (read-korg-text.mjs), commits what a profile needs as tables/<name>.json, and builds a profile
// from that and a layout. Checked here against things that are not the builder's own arithmetic:
//
//   - the READER on fixtures in Korg's style: boxed tables, rows that continue the row above,
//     footnote marks with text that runs on, lists of values under a mark or a note;
//   - the BUILDER's rules: a controller is a choice only where the receive and transmit tables agree
//     on its values; a value list that depends on another setting stays a number; an NRPN wider
//     than 7 bits sends its low bits first on the controller the document names;
//   - every PROFILE through the app's own engine: each parameter compiles to its controller or NRPN
//     at both ends of its range, its declared vectors pass, its presets recall;
//   - the committed profiles against the generator, so a layout edit cannot ship stale.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { cells, listEntries, readFootnotes, readTables } from '../../../tools/profiles/korg/read-korg-text.mjs';
import {
  buildKorgProfile, identityFrom, parseNrpnValue, receivedLabels, splitDescription, transmittedLabels,
} from '../../../tools/profiles/korg/build-korg-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/korg/make-profiles.mjs';
import {
  localCompileDeviceRequest,
  localCompileParameter,
  localCompilePresetRecall,
  localParseDumpMessage,
  validateLocalProfileSource,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const FIXTURE = [
  '\tKORG probe Implementation         Revision 1.00 (2024.1.1)',
  '',
  '2-1 CHANNEL MESSAGES            [H]:Hex,  [D]:Decimal',
  '+--------+---------+-------------+--------------------------------------+',
  '| Status | Second  |   Third     |           Description                |',
  '| [Hex]  | [H] [D] | [H]   [D]   |                                      |',
  '+--------+---------+-------------+--------------------------------------+',
  '|   Bn   | 17 (23) | vv    (vv)  | EG TARGET (vv=0~127)      *6-01*5-2  |',
  '|   Bn   | 60 (96) | vv    (vv)  | FX SUB TYPE               *6-02*5-2  |',
  '|        |         |             | CHORUS(vv=0,64,127)                  |',
  '+--------+---------+-------------+--------------------------------------+',
  '',
  ' *6-01 : vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH',
  ' *6-02 : When FX TYPE is CHORUS :',
  '         vv:0~63,64~127 = STEREO, MONO',
  '',
  ' *3-5 (VOICE MODE)',
  '    0 : ARP',
  '    1 : POLY',
].join('\n');

test('a boxed table: its heading, its header rows, and a row that continues the one above', () => {
  const [table] = readTables(FIXTURE);
  assert.deepEqual(table.heading.id, '2-1');
  assert.equal(table.header[0][3], 'Description');
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1].more.map((c) => c.at(-1)), ['CHORUS(vv=0,64,127)']);
  assert.deepEqual(cells('| a | b |  c |'), ['a', 'b', 'c']);
});

test('footnotes: a mark whose text runs on, and a list of values under a mark', () => {
  const { marks, notes } = readFootnotes(FIXTURE);
  assert.match(marks['6-01'].text, /^vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH$/);
  assert.match(marks['6-02'].text, /When FX TYPE is CHORUS : vv:0~63,64~127 = STEREO, MONO/);
  assert.deepEqual(notes['3-5'].entries.map((e) => [e.from, e.label]), [[0, 'ARP'], [1, 'POLY']]);
  assert.deepEqual(listEntries(['0 ~ 255  : Poly', "48~57 : '0'~'9'", '[POLY]']).map((e) => [e.from, e.to]), [[0, 255], [48, 57]]);
});

/* ------------------------------------------------------------------ what a row means */

test('a controller\'s description: name, values, explanation, marks', () => {
  assert.deepEqual(splitDescription('AMP EG ATTACK (vv=0~127)  *5-2*5-4'), { name: 'AMP EG ATTACK', explanation: null, values: '0~127', marks: ['5-2', '5-4'] });
  assert.deepEqual(splitDescription('Modulation1 (Joystick +Y, vv=0~127)   *5-2'), { name: 'Modulation1', explanation: 'Joystick +Y', values: '0~127', marks: ['5-2'] });
  assert.equal(splitDescription('Bank Select (LSB) vv=0~4   *5-1').values, '0~4');
  assert.equal(splitDescription('VOICE MODE DEPTH (vv=0~127) no display  *1-2').explanation, 'no display');
});

test('the receive and transmit footnotes: labelled ranges, the values sent, and a list that depends on another setting', () => {
  assert.deepEqual(receivedLabels('vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH').map((r) => [r.from, r.to, r.label]), [[0, 42, 'CUTOFF'], [43, 85, 'PITCH2'], [86, 127, 'PITCH']]);
  assert.equal(receivedLabels('When FX TYPE is CHORUS : vv:0~63,64~127 = STEREO, MONO'), null);
  assert.deepEqual(transmittedLabels('SYNC:OFF, ON = vv:0,127').map((t) => [t.value, t.label]), [[0, 'OFF'], [127, 'ON']]);
  assert.deepEqual(transmittedLabels('MOD FX TYPE:CHORUS, ENSEMBLE', [0, 127]).map((t) => t.value), [0, 127]);
});

test('an NRPN value cell: range, labels, the marks and notes it points to', () => {
  assert.deepEqual(parseNrpnValue('0,1 = Off,On').values, { list: [0, 1] });
  assert.equal(parseNrpnValue('0,1 = Off,On').shown, 'Off,On');
  assert.deepEqual(parseNrpnValue('0~4                 *3-5').marks, ['3-5']);
  assert.deepEqual(parseNrpnValue('0~3             *note P6').notes, ['P6']);
  assert.equal(parseNrpnValue('ASCII           *note P1').ascii, true);
  assert.equal(parseNrpnValue('          *note P23 *3-2').values, null);
});

const PROBE = {
  source: { title: 'probe', file: 'probe.txt', sha256: '00', url: 'https://example.invalid' },
  programChange: null,
  received: [
    { cc: 23, desc: 'EG TARGET (vv=0~127)  *6-01*5-2', more: [] },
    { cc: 80, desc: 'SYNC (vv=0~127)  *6-08*5-2', more: [] },
    { cc: 96, desc: 'FX SUB TYPE  *6-02*5-2', more: [] },
  ],
  transmitted: [
    { cc: 23, desc: 'EG TARGET (vv=0,64,127)  *2-01*1-2', more: [] },
    { cc: 80, desc: 'SYNC (vv=0,127)  *2-08*1-2', more: [] },
  ],
  nrpn: [
    { msb: '--', lsb: '10', name: 'VOICE MODE TYPE', value: '0~1  *3-5', more: [] },
    { msb: '--', lsb: '14', name: 'SHAPE', value: '0~1023  *3-1', more: [] },
    { msb: '--', lsb: '15', name: 'WIDE', value: '0~1023', more: [] },
  ],
  identity: [{ byte: '42', description: 'KORG ID ( Manufacturers ID )' }, { byte: '51', description: 'Family' }, { byte: '01', description: '' }, { byte: '00', description: '' }, { byte: '00', description: '' }],
  marks: {
    '6-01': 'vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH',
    '2-01': 'EG TARGET:CUTOFF, PITCH2, PITCH = vv:0,64,127',
    '6-08': 'vv:0~63,64~127 = SYNC:ON, OFF',
    '2-08': 'SYNC:OFF, ON = vv:0,127',
    '6-02': 'When FX TYPE is CHORUS : vv:0~63,64~127 = STEREO, MONO',
    '3-1': 'When a 10 bit value is received the lower 3 bits are first expected via a CC #63(0x3f) message (or assumed 0), then the upper 7 bits are expected via a CC #6(0x6) message.',
  },
  lists: { '3-5': { title: 'VOICE MODE', entries: [{ from: 0, to: 0, label: 'ARP' }, { from: 1, to: 1, label: 'POLY' }] } },
};

test('the builder: agreement makes a choice, disagreement a number, and a wide NRPN its low bits first', () => {
  const profile = buildKorgProfile(PROBE, { id: 'probe', name: 'probe', family: 'probe', document: {} });
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.deepEqual(by('EG TARGET').choices.map((c) => [c.value, c.label]), [[0, 'CUTOFF'], [64, 'PITCH2'], [127, 'PITCH']]);
  assert.equal(by('SYNC').type, 'integer', 'ON at 0~63 received, OFF at 0 transmitted: not settled');
  assert.match(by('SYNC').description, /Received: .*ON, OFF.*Transmitted: .*OFF, ON/);
  assert.equal(by('FX SUB TYPE').type, 'integer');
  assert.match(by('FX SUB TYPE').description, /When FX TYPE is CHORUS/);
  assert.deepEqual(by('VOICE MODE TYPE').choices.map((c) => c.label), ['ARP', 'POLY']);
  const shape = profile.messageRecipes.find((r) => r.id === by('SHAPE').messageRecipe);
  assert.deepEqual([shape.lowBitsController, shape.lowBits, shape.parameterMsb, shape.parameterLsb], [63, 3, 0, 0x14]);
  assert.equal(by('WIDE'), undefined, 'wider than 7 bits with no format printed: left out');
  assert.ok(profile.authoringNotes.some((n) => /NRPN -- 15H \(WIDE\)/.test(n)));
  assert.deepEqual(identityFrom(PROBE.identity), { familyCode: ['51', '01'], modelNumber: ['00', '00'] });
});

/* ------------------------------------------------------------------ the profiles */

const ONLY = process.env.KORG_SYNTH ? process.env.KORG_SYNTH.split(',') : null;
const BUILT = await Promise.all(SYNTHS.filter((name) => !ONLY || ONLY.includes(name)).map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/korg/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN, at both ends of its range`, () => {
    const recipes = new Map(profile.messageRecipes.map((r) => [r.id, r]));
    const ids = new Set();
    for (const parameter of profile.parameters) {
      assert.ok(!ids.has(parameter.id), `${parameter.id} twice`);
      ids.add(parameter.id);
      if (!parameter.access.canWrite) continue;
      const recipe = recipes.get(parameter.messageRecipe);
      const values = parameter.type === 'choice'
        ? [parameter.choices[0], parameter.choices.at(-1)].map((c) => [c.id, c.value])
        : [[parameter.range.min, parameter.range.min], [parameter.range.max, parameter.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: parameter.id, value });
        assert.ok(compiled.ok, `${parameter.id}: ${compiled.error}`);
        let bytes;
        if (recipe.kind === 'sysex') {
          // Korg's parameter change: the value 14 bits, low seven first; a choice one byte and 00.
          const value = parameter.type === 'choice' ? [wire]
            : parameter.encoding.type === 's21-lsb-msb' ? [wire & 0x7f, (wire >> 7) & 0x7f, (wire >> 14) & 0x7f]
              : [(wire & 0x3fff) & 0x7f, (wire & 0x3fff) >> 7];
          bytes = recipe.template.flatMap((t) => (t === '$deviceId' ? [0x30] : t === '$encodedValue' ? value : [Number.parseInt(t, 16)]));
        } else if (recipe.kind === 'cc') bytes = [0xb0, recipe.controller, wire];
        else if (recipe.lowBits) bytes = [0xb0, 0x63, recipe.parameterMsb, 0xb0, 0x62, recipe.parameterLsb, 0xb0, recipe.lowBitsController, wire & ((1 << recipe.lowBits) - 1), 0xb0, 0x06, wire >> recipe.lowBits];
        else bytes = [0xb0, 0x63, recipe.parameterMsb, 0xb0, 0x62, recipe.parameterLsb, 0xb0, 0x06, wire];
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
      // One line per message, as the C++ engine's tests compare them.
      // (A SysEx message is one line; a run of control changes, one line each.)
      const lines = compiled.transaction.messages.flatMap((m) => (m.bytes[0] === 0xf0
        ? [hex(m.bytes)]
        : Array.from({ length: m.bytes.length / 3 }, (unused, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))));
      assert.equal(lines.join('\n'), vector.expectedHex, vector.name);
    }
  });

  if (profile.presets) {
    test(`${profile.id}: a preset is its bank select, then Program Change`, () => {
      for (const bank of profile.presets.banks) {
        const recalled = localCompilePresetRecall(profile, { slot: bank.startSlot + bank.slotCount - 1 });
        assert.ok(recalled.ok, recalled.error);
        const select = [...(bank.bankMsb !== undefined ? [0xb0, 0, bank.bankMsb] : []), ...(bank.bankLsb !== undefined ? [0xb0, 32, bank.bankLsb] : [])];
        assert.equal(recalled.hex, hex([...select, 0xc0, bank.programBase + bank.slotCount - 1]));
      }
    });
  }

  if (profile.dumpDefinitions) {
    test(`${profile.id}: Pull asks for the current program and reads its declared dump back`, () => {
      const request = profile.tests.find((t) => t.kind === 'request');
      const compiled = localCompileDeviceRequest(profile, { request: request.request });
      assert.ok(compiled.ok, compiled.error);
      assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, request.expectedHex);
      for (const vector of profile.tests.filter((t) => t.kind === 'dumpParse')) {
        const parsed = localParseDumpMessage(profile, vector.inputHex);
        assert.ok(parsed.ok, parsed.error);
        for (const [id, value] of Object.entries(vector.expectedValues)) assert.equal(parsed.values[id], value, `${vector.name}: ${id}`);
      }
      // Every parameter read from the dump is one the profile can also send.
      const ids = new Set(profile.parameters.filter((p) => p.access.canRead).map((p) => p.id));
      for (const m of profile.dumpDefinitions[0].mappings) assert.ok(ids.has(m.parameter), m.parameter);
    });
  }

  test(`${profile.id}: the source is the document, Korg's identity, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Korg');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.match(profile.sources[0].notes, new RegExp(`sha256 ${data.source.sha256}`));
    if (profile.identity) assert.deepEqual(profile.identity.manufacturerId, ['42']);
    else assert.ok(profile.authoringNotes.some((n) => /^No identity check: /.test(n)), 'a profile without an identity says why');
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;

test('the minilogue xd: its SYNC and RING tables disagree, its reverb list sits under a misprinted mark', { skip: !builtProfile('korg-minilogue-xd') }, () => {
  const profile = builtProfile('korg-minilogue-xd');
  const by = (name) => profile.parameters.filter((p) => p.name === name);
  assert.deepEqual(profile.identity.familyCode, ['51', '01']);
  for (const name of ['SYNC', 'RING']) assert.equal(by(name)[0].type, 'integer', name);
  assert.equal(by('REVERB SUB TYPE')[0].choices.length, 18);
  assert.equal(by('DELAY SUB TYPE')[0].choices.length, 20);
  assert.equal(by('MOD FX SUB TYPE')[0].type, 'integer', 'it depends on MOD FX TYPE');
  assert.deepEqual(by('VOICE MODE TYPE')[0].choices.map((c) => c.label), ['ARP LATCH', 'ARP', 'CHORD', 'UNISON', 'POLY']);
  assert.equal(by('MULTI SHAPE NOISE')[0].range.max, 1023);
  assert.equal(by('MASTER VOLUME')[0].range.max, 16383);
  assert.equal(profile.presets.banks.length, 5);
});

test('the minilogue\'s program dump, placed by hand from its document, reads back as the controllers send it', { skip: !builtProfile('korg-minilogue') }, () => {
  // TABLE 2: VCO 1 PITCH's bits 2~9 at byte 20 and its bits 0~1 in byte 52's bits 0~1; VCO 1 OCTAVE in
  // byte 52's bits 4~5 (0~3 = 16', 8', 4', 2'); SYNC in byte 55's bit 0. NOTE 3: each group of seven
  // bytes goes behind one that holds their top bits, byte k's in bit k. Packed here by hand, not by
  // the code the profile was built with.
  const profile = builtProfile('korg-minilogue');
  const data = new Array(448).fill(0);
  const pitch = 725;                              // 10 bits: 1011010101
  data[20] = pitch >> 2;                          // 181, so this byte's top bit is set
  data[52] = (pitch & 3) | (3 << 4);              // pitch bits 0~1, OCTAVE 2'
  data[55] = 1;                                   // SYNC on
  const wire = [];
  for (let g = 0; g < data.length; g += 7) {
    const group = data.slice(g, g + 7);
    wire.push(group.reduce((top, byte, k) => top | ((byte >> 7) << k), 0), ...group.map((byte) => byte & 0x7f));
  }
  assert.equal(wire.length, 512, 'NOTE 1: 448 bytes become 512');
  const hexOf = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const parsed = localParseDumpMessage(profile, hexOf([0xf0, 0x42, 0x30, 0x00, 0x01, 0x2c, 0x40, ...wire, 0xf7]));
  assert.ok(parsed.ok, parsed.error);
  const id = (name) => profile.parameters.find((p) => p.name === name).id;
  assert.equal(parsed.values[id('VCO 1 PITCH')], 725 >> 3, 'the top seven of its ten bits, as CC 34 sends them');
  assert.equal(parsed.values[id('VCO 1 OCTAVE')], profile.parameters.find((p) => p.name === 'VCO 1 OCTAVE').choices.find((c) => c.label === "2'").id);
  assert.equal(parsed.values[id('SYNC')], 'on');
  assert.equal(parsed.values[id('VCO 2 PITCH')], 0);
});

test('the minilogue xd reads a two-byte value low byte first, as the prologue\'s TEMPO settles', { skip: !builtProfile('korg-minilogue-xd') }, () => {
  const profile = builtProfile('korg-minilogue-xd');
  const mapping = profile.dumpDefinitions[0].mappings.find((m) => profile.parameters.find((p) => p.id === m.parameter).name === 'VCO 1 PITCH');
  assert.equal(mapping.offset, 24);
  assert.deepEqual(mapping.codec.parts, [{ at: 1, from: 0, bits: 8, shift: 8 }, { at: 0, from: 0, bits: 8, shift: 0 }]);
  assert.equal(mapping.codec.shiftRight, 3);
  assert.ok(profile.authoringNotes.some((n) => /TEMPO settles it \(300~6000 as H:0~7 then L:0~4\).*700Sm/.test(n)));
});

test('the prologue reads TIMBRE 1, its settings counted from the block\'s start', { skip: !builtProfile('korg-prologue') }, () => {
  // `80~205 | TIMBRE 1 PARAMETERS`, then `+12 | H:0~7 | VCO 1 PITCH`: byte 92 and 93, low byte first.
  const profile = builtProfile('korg-prologue');
  const at = (name) => profile.dumpDefinitions[0].mappings.find((m) => profile.parameters.find((p) => p.id === m.parameter).name === name);
  assert.equal(at('VCO 1 PITCH').offset, 92);
  assert.equal(at('LFO RATE').offset, 80 + 72);
  assert.equal(at('MOD EFFECT ON-OFF').offset, 71, 'a program-wide setting keeps its own offset');
  assert.ok(profile.authoringNotes.some((n) => /TIMBRE 1, taken to be the main timbre/.test(n)));
});

test('the NTS-1 mkII: the coarse half of each pair, a comma put back, its 14-bit NRPNs low bits first on CC 38', { skip: !builtProfile('korg-nts-1-mk2') }, () => {
  const profile = builtProfile('korg-nts-1-mk2');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  const recipe = (p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe);
  assert.equal(recipe(by('EG ATTACK')).controller, 16);
  assert.equal(profile.parameters.some((p) => /\((MSB|LSB)\)$/.test(p.name)), false);
  assert.ok(profile.authoringNotes.some((n) => /fine half of a pair.*CC 39, 48, 49/.test(n)));
  assert.ok(profile.authoringNotes.some((n) => /an NRPN or RPN selector.*CC 98, 99/.test(n)), 'NRPN (LSB) is plumbing, not a fine half');
  assert.equal(by('DELAY TYPE').choices.length, 13);
  assert.deepEqual([recipe(by('OSC EDIT PARAM1')).lowBitsController, recipe(by('OSC EDIT PARAM1')).lowBits], [38, 7]);
});

test('the miniKORG 700Sm prints its two-byte values L first, and reads them low byte first like the rest', { skip: !builtProfile('korg-minikorg-700sm') }, () => {
  const profile = builtProfile('korg-minikorg-700sm');
  const reverb = profile.dumpDefinitions[0].mappings.find((m) => profile.parameters.find((p) => p.id === m.parameter).name === 'REVERB');
  assert.equal(reverb.offset, 32);
  assert.deepEqual(reverb.codec.parts, [{ at: 1, from: 0, bits: 8, shift: 8 }, { at: 0, from: 0, bits: 8, shift: 0 }]);
  assert.equal(reverb.codec.shiftRight, 7, '0~16383 read as its top seven bits');
});

test('the microKORG S: every setting by parameter change, a signed value as two\'s complement', { skip: !builtProfile('korg-microkorg-s') }, () => {
  // NOTE 5: F0 42 3g 00 01 40 41 pp PP vv VV F7. TABLE 2: Tune `64+/-50=0+/-50[cent]`, Param ID 00:45
  // for timbre 1; Cutoff 00:55 and 01:65; OSC 2 Wave `0~2=Saw,Squ,Tri` at 00:4D.
  const profile = builtProfile('korg-microkorg-s');
  const send = (name, value) => localCompileParameter(profile, { parameterId: profile.parameters.find((p) => p.name === name).id, value });
  assert.equal(send('Timbre 1: PITCH Tune', -50).hex, 'F0 42 30 00 01 40 41 45 00 4E 7F F7');
  assert.equal(send('Timbre 1: PITCH Tune', 50).hex, 'F0 42 30 00 01 40 41 45 00 32 00 F7');
  assert.equal(send('Timbre 2: FILTER Cutoff', 127).hex, 'F0 42 30 00 01 40 41 65 01 7F 00 F7');
  assert.equal(send('Timbre 1: OSC 2 Wave', 'tri').hex, 'F0 42 30 00 01 40 41 4D 00 02 00 F7');
  assert.deepEqual(profile.parameters.find((p) => p.name === 'Timbre 1: OSC 1 Wave').choices.map((c) => c.label),
    ['Saw', 'Pulse', 'Tri', 'Sin(Cross)', 'Vox Wave', 'DWGS', 'Noise', 'Audio In'], '*T-2, printed in two columns');
  assert.ok(profile.authoringNotes.some((n) => /signed value.*NOTE 5/.test(n)));
});

test('the KingKORG: an ID and a sub-ID through nested blocks, a 21-bit signed value', { skip: !builtProfile('korg-kingkorg') }, () => {
  // NOTE 4: F0 42 3g 00 01 18 41 pp PP qq QQ vvl vvm vvh F7. TABLE 1 puts TIMBRE A at 02:00~ and
  // TIMBRE B at 04:00~; TABLE 2: Transpose `-48~0~48[note]` at +0:04, OSC 2 DATA (TABLE 7) at
  // +0:11~15, Cutoff at +0:1F; TABLE 7: Semitone at +0:+1, so Timbre A's OSC 2 Semitone is 02:12.
  const profile = builtProfile('korg-kingkorg');
  const send = (name, value) => localCompileParameter(profile, { parameterId: profile.parameters.find((p) => p.name === name).id, value });
  assert.equal(send('Timbre A: Pitch Transpose', -48).hex, 'F0 42 30 00 01 18 41 02 00 04 00 50 7F 7F F7');
  assert.equal(send('Timbre A: OSC 2 Semitone', 24).hex, 'F0 42 30 00 01 18 41 02 00 12 00 18 00 00 F7');
  assert.equal(send('Timbre B: Filter Cutoff', 127).hex, 'F0 42 30 00 01 18 41 04 00 1F 00 7F 00 00 F7');
  assert.equal(send('Effect: PreFX Type', 'tone').hex, 'F0 42 30 00 01 18 41 06 00 00 00 05 00 00 F7');
  assert.ok(profile.parameters.some((p) => p.name === 'Timbre B V.Patch: V.Patch 6 Patch Intensity'), 'a block reached through `same as V.PATCH 1`');
});
