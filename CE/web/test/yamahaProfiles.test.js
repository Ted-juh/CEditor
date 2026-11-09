// yamahaProfiles.test.js — device profiles read out of Yamaha's data lists.
//
// tools/profiles/yamaha/ reads the MIDI PARAMETER CHANGE TABLEs, the bulk dump block table and the
// data format of a data list from poppler's word positions (read-yamaha-pdf.mjs), commits them as
// tables/<name>.json, and builds a profile from them and a layout. Checked here against things that
// are not the builder's own arithmetic:
//
//   - the READER on a page set the way Yamaha sets them: two tables side by side, a heading over
//     two lines (`Parameter` over `Name`), a title over two (`… TABLE` over `(VOICE Common)`), a
//     description wrapped under its row, the address printed in full once and its low byte after;
//   - the BUILDER's rules: a list of names as long as the range is a choice, a range of numbers as
//     long as it is what the values show, a range in parts matched part for part, a placeholder
//     expanded over its note's values;
//   - every PROFILE through the app's own engine, and the committed profiles against the generator.
//
// What none of this checks is a real instrument (`verifiedOnHardware: false` in every profile).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { pageBulkBlocks, pageParameterTables, readByteCount, readFormat } from '../../../tools/profiles/yamaha/read-yamaha-pdf.mjs';
import { readHexRange, readPlaceholders, readShownRange, readValues, seriesNames, splitList } from '../../../tools/profiles/yamaha/build-yamaha-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/yamaha/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

// Each word a line of its own, as poppler gives a table's cells.
const word = (x0, y0, text) => `<block xMin="0" yMin="0" xMax="0" yMax="0"><line xMin="${x0}" yMin="${y0}" xMax="${x0 + text.length * 5}" yMax="${y0 + 8}"><word xMin="${x0}" yMin="${y0}" xMax="${x0 + text.length * 5}" yMax="${y0 + 8}">${text}</word></line></block>`;
const say = (x0, y0, text) => text.split(' ').map((w, i, all) => word(x0 + all.slice(0, i).join(' ').length * 5 + (i ? 5 : 0), y0, w)).join('');
const page = (...parts) => `<page width="612.000000" height="792.000000"><flow>${parts.join('')}</flow></page>`;

test('two tables side by side: titles over two lines, headings over two, rows set from the top', () => {
  const xml = page(
    // Left: the title over two lines, headings on one, `High Mid Low` under `Address`.
    say(40, 40, 'MIDI PARAMETER CHANGE TABLE'), say(40, 52, '(VOICE Common)'),
    say(45, 72, 'Address (hex)'), say(95, 76, 'Size'), say(112, 72, 'Data'), say(112, 80, 'Range'), say(155, 76, 'Parameter Name'), say(245, 76, 'Description'),
    say(42, 84, 'High Mid Low'),
    say(45, 96, '30 00 0D'), say(97, 96, '1'), say(108, 96, '00 – 02'), say(155, 96, 'Part Mode'), say(232, 96, 'poly, Mono-'), say(232, 104, 'Full, Mono-Legato'),
    say(80, 114, '0E'), say(97, 114, '1'), say(108, 114, '00 – 7F'), say(155, 114, 'Portamento'), say(155, 122, 'Time'), say(232, 114, '0 – 127'),
    say(40, 140, 'Total Size = 38'),
    // Right: `Parameter` over `Name`, and an operator placeholder in the address.
    say(320, 40, 'MIDI PARAMETER CHANGE TABLE (Operator)'), say(330, 52, 'op = operator number'), say(330, 60, '00 – 03 (hex)'), say(330, 68, 'OP1 – OP4'),
    say(325, 80, 'Address'), say(370, 84, 'Size'), say(385, 80, 'Data'), say(385, 88, 'Range'), say(430, 80, 'Parameter'), say(430, 88, 'Name'), say(530, 84, 'Description'),
    say(322, 104, '31 op 14'), say(372, 104, '1'), say(383, 104, '00 – 01'), say(430, 104, 'OP Level Feedback'), say(430, 112, 'Type (FB)'), say(520, 104, 'sawtooth, square'),
  );
  const tables = pageParameterTables(xml);
  assert.deepEqual(tables.map((t) => t.title), ['MIDI PARAMETER CHANGE TABLE (VOICE Common)', 'MIDI PARAMETER CHANGE TABLE (Operator)']);
  assert.deepEqual(tables[0].rows.map((r) => [r.address.join(' '), r.name, r.description]), [
    ['30 00 0D', 'Part Mode', 'poly, Mono- Full, Mono-Legato'],
    ['0E', 'Portamento Time', '0 – 127'],
  ], 'a description and a name wrapped under their row; the low byte alone on the second');
  assert.deepEqual(tables[1].notes, ['op = operator number', '00 – 03 (hex)', 'OP1 – OP4']);
  assert.deepEqual(tables[1].rows.map((r) => [r.address.join(' '), r.name]), [['31 op 14', 'OP Level Feedback Type (FB)']]);
  assert.deepEqual(readFormat('(3-4-1-2) IDENTITY REPLY (Transmit only)\n   F0H 7EH 7FH 06H 02H 43H 00H 41H 51H 06H 00H 00H 00H 7FH F7H\n 00000011    03H   Model ID\n 01111111  7FH  Group Number High\n 00011100 1CH Group Number Low'),
    { identityReply: ['F0', '7E', '7F', '06', '02', '43', '00', '41', '51', '06', '00', '00', '00', '7F', 'F7'], modelId: '03', group: ['7F', '1C'] });
});

test('the bulk dump block table: two columns, a series printed first and last, a header printed `0E mm nn`', () => {
  const xml = page(
    // Left: prose above the table, whose `“Byte Count”` is not its heading.
    say(40, 40, '“Byte Count” indicates the data size contained in each block'),
    say(68, 80, 'Parameter Block'), say(130, 80, 'Description'), say(217, 80, 'Byte Count'), say(251, 80, 'Top Address'),
    say(40, 100, 'PERFORMANCE'), say(132, 100, 'Bulk Header'), say(225, 100, '0'), say(236, 100, '00'), say(250, 100, '0E'), say(262, 100, 'mm'), say(276, 100, 'nn'),
    say(108, 110, 'PART'), say(132, 110, 'Part 1'), say(222, 110, '62'), say(236, 110, '3E'), say(250, 110, '31'), say(262, 110, '00'), say(276, 110, '00'),
    say(135, 120, ':'), say(264, 120, ':'),
    say(132, 130, 'Part 4'), say(264, 130, '03'),
    say(132, 140, 'Bulk Footer'), say(225, 140, '0'), say(236, 140, '00'), say(250, 140, '0F'), say(262, 140, 'mm'), say(276, 140, 'nn'),
    // Right: another table, read on its own.
    say(334, 40, 'Parameter Block'), say(399, 40, 'Description'), say(484, 40, 'Byte Count'), say(518, 40, 'Top Address'),
    say(399, 60, 'Key C0'), say(490, 60, '46'), say(503, 60, '2E'), say(517, 60, '47'), say(529, 60, '00'), say(543, 60, '00'),
    say(402, 70, ':'), say(531, 70, ':'), say(399, 80, 'Key C6'), say(529, 80, '48'),
  );
  assert.deepEqual(pageBulkBlocks(xml, { right: 300 }), [
    { name: 'PERFORMANCE Bulk Header', bytes: 0, address: ['0E', 'mm', 'nn'] },
    { name: 'PART Part 1', bytes: 62, address: ['31', '00', '00'], last: { name: 'Part 4', mid: '03' } },
    { name: 'Bulk Footer', bytes: 0, address: ['0F', 'mm', 'nn'] },
  ]);
  assert.deepEqual(pageBulkBlocks(xml, { left: 300 }), [{ name: 'Key C0', bytes: 46, address: ['47', '00', '00'], last: { name: 'Key C6', mid: '48' } }]);
  assert.deepEqual(seriesNames('Part 1', 'Part 4', 4), ['Part 1', 'Part 2', 'Part 3', 'Part 4']);
  assert.deepEqual(seriesNames('Key C0', 'Key C6', 73).filter((n, i) => i % 12 === 1 || i === 72), ['Key C#0', 'Key C#1', 'Key C#2', 'Key C#3', 'Key C#4', 'Key C#5', 'Key C6']);
  assert.equal(readByteCount('Byte Count shows the size of data in blocks from Model ID onward (up to but not\nincluding the checksum).'), 'fromModelId', 'the reface: four bytes more than the data');
  assert.equal(readByteCount('“Byte Count” indicates the data size contained in each block designated by bulk dump'), 'data', 'the MOXF: the data alone');
});

/* ------------------------------------------------------------------ the builder's rules */

test('the description says what each value shows: a list of names, a range of numbers, a range in parts', () => {
  assert.deepEqual(readHexRange('00 – 0F, 7F'), [[0, 15], [127, 127]]);
  assert.deepEqual(splitList('poly (POLY), Mono-Full (MONO-FULL, all notes), Mono-Legato'), ['poly (POLY)', 'Mono-Full (MONO-FULL, all notes)', 'Mono-Legato']);
  assert.deepEqual(readValues([[0, 4]], 'OFF, AMP, FILTER, PITCH, OSC (Oscillator)').choices.map((c) => c.label), ['OFF', 'AMP', 'FILTER', 'PITCH', 'OSC (Oscillator)']);
  assert.deepEqual(readValues([[0x28, 0x58]], '-24 – +24 (semitones)'), { shown: { min: -24, max: 24 }, unit: 'semitones' });
  assert.deepEqual(readValues([[0x10, 0x70]], '-48 (-4 octave) – +48 (+4 octave)'), { shown: { min: -48, max: 48 } });
  assert.deepEqual(readShownRange('ALGO 1 – 12'), { min: 1, max: 12 });
  const channels = readValues([[0, 15], [127, 127]], '1 – 16, off').choices;
  assert.deepEqual([channels.length, channels[0], channels.at(-1)], [17, { value: 0, label: '1' }, { value: 127, label: 'off' }]);
  assert.deepEqual(readValues([[0, 127]], '0: Poly, 1 – 127: Mono with Portamento Time'), {}, 'two meanings across one range: a number');
  assert.deepEqual(readValues([[0, 4]], 'OFF, AMP, FILTER'), {}, 'three names for five values: a number');
  assert.deepEqual(readValues([[0x28, 0x58]], '-24 – +24 [semitones]'), { shown: { min: -24, max: 24 }, unit: 'semitones' }, 'the MOXF brackets its units');
  assert.deepEqual(readValues([[0x34, 0x4C]], '-12 – +12 [dB]'), { shown: { min: -12, max: 12 }, unit: 'dB' });
  assert.deepEqual(readValues([[0, 4]], '0: Voice, 1: Performance, 2: Pattern (Multi), 3: Song (Multi), 4: Master').choices.map((c) => c.label), ['Voice', 'Performance', 'Pattern (Multi)', 'Song (Multi)', 'Master'], 'the value printed before each name is left off');
  const omni = readValues([[0, 16], [127, 127]], '1 – 16, omni, off').choices;
  assert.deepEqual([omni.length, omni[15], omni[16], omni[17]], [18, { value: 15, label: '16' }, { value: 16, label: 'omni' }, { value: 127, label: 'off' }], 'counted out over the parts in turn');
  assert.deepEqual(readPlaceholders(['op = operator number', '00 – 03 (hex)', 'OP1 – OP4']), { op: { what: 'operator number', values: [0, 1, 2, 3], labels: ['OP1', 'OP2', 'OP3', 'OP4'] } });
});

/* ------------------------------------------------------------------ the profiles */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/yamaha/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is a parameter change at its address, at both ends of its range`, () => {
    const model = profile.messageRecipes[0].template[5];
    const ids = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      if (p.type === 'text') continue;
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        const bytes = p.encoding.type === 'u14-msb-lsb' ? [wire >> 7, wire & 127] : p.encoding.type === 'nibbled' ? [3, 2, 1, 0].map((s) => (wire >> (s * 4)) & 15) : [wire];
        assert.equal(compiled.hex, `F0 43 10 7F 1C ${model} ${p.address} ${hex(bytes)} F7`, `${p.id} = ${value}`);
      }
    }
  });

  test(`${profile.id}: the profile's own test vectors, its requests and its dump read back`, () => {
    for (const t of profile.tests) {
      if (t.parameter) {
        const compiled = localCompileParameter(profile, { parameterId: t.parameter, value: t.value });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.hex, t.expectedHex, t.name);
      } else if (t.kind === 'request') {
        const compiled = localCompileDeviceRequest(profile, { request: t.request });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, t.expectedHex, t.name);
      } else if (t.kind === 'dumpParse') {
        const parsed = localParseDumpMessage(profile, t.inputHex);
        assert.ok(parsed.ok, parsed.error);
        for (const [id, value] of Object.entries(t.expectedValues)) assert.equal(parsed.values[id], value, `${t.name}: ${id}`);
      }
    }
    const readable = new Set(profile.parameters.filter((p) => p.access.canRead).map((p) => p.id));
    for (const d of profile.dumpDefinitions ?? []) for (const m of d.mappings) assert.ok(readable.has(m.parameter), m.parameter);
  });

  test(`${profile.id}: the source is the data list, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Yamaha');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;

test('the reface DX: four operators, each at its own address, and its voice read back in one collection', { skip: !builtProfile('yamaha-reface-dx') }, () => {
  const profile = builtProfile('yamaha-reface-dx');
  const by = (name) => profile.parameters.find((p) => p.name === name);
  assert.equal(localCompileParameter(profile, { parameterId: by('OP3 Level Output Level (LEVEL)').id, value: 99 }).hex, 'F0 43 10 7F 1C 05 31 02 12 63 F7');
  assert.equal(localCompileParameter(profile, { parameterId: by('Algorithm (ALGO)').id, value: 11 }).hex, 'F0 43 10 7F 1C 05 30 00 10 0B F7');
  assert.deepEqual([by('Algorithm (ALGO)').display.min, by('Algorithm (ALGO)').display.max], [1, 12]);
  assert.equal(by('Voice Name').access.canWrite, false, 'one character a parameter change: read, not written');
  const voice = profile.dumpDefinitions.filter((d) => d.completion.collectionId === 'voice');
  assert.equal(voice.length, 7, 'header, common, four operators, footer');
  assert.ok(voice.every((d) => d.completion.expectedMessages === 7));
  assert.deepEqual(profile.identity.modelNumber, ['53', '06']);
});

test('the MOXF: every part, element and drum key at its own address, and each edit buffer read back as one collection', { skip: !builtProfile('yamaha-moxf') }, () => {
  const profile = builtProfile('yamaha-moxf');
  const at = (group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
  const send = (group, name, value) => localCompileParameter(profile, { parameterId: at(group, name).id, value }).hex;
  assert.equal(send('Voice Element 3', 'Element Switch', 'on'), 'F0 43 10 7F 1C 00 41 02 00 01 F7', 'element 3: 41 ee 00, ee = 02');
  assert.equal(at('Drum Key C#1', 'Element Switch').address, '47 0D 00', 'C#1 is key 13 from C0');
  assert.equal(at('Performance Part 4', 'Part Switch').address, '31 03 00');
  assert.ok(at('Song/Pattern Part 16', 'Bank Select MSB'), 'the mixing\'s sixteen parts');
  assert.equal(at('System', 'Basic Receive Channel').choices.at(-2).label, 'omni');
  assert.equal(at('Mode', 'Mode Change').choices.at(-1).label, 'Master');
  // The Normal Voice edit buffer: header, eight common blocks, eight elements twice over, footer.
  const voice = profile.dumpDefinitions.filter((d) => d.completion.collectionId === 'normalVoice');
  assert.equal(voice.length, 26);
  assert.ok(voice.every((d) => d.completion.expectedMessages === 26));
  assert.equal(hex(voice[0].matcher.prefix.map((b) => parseInt(b, 16))), 'F0 43 00 7F 1C 00 00 00 0E 0F 00', 'the header carries no data: byte count 0, at the edit buffer\'s address');
  assert.equal(hex(voice[1].matcher.prefix.map((b) => parseInt(b, 16))), 'F0 43 00 7F 1C 00 50 00 40 00 00', 'Common: the byte count is its 80 bytes of data');
  assert.equal(voice[1].completion.expectedBytes, 93);
  assert.equal(voice.at(-1).matcher.prefix.slice(-3).join(' '), '0F 0F 00');
  const request = (id) => profile.requests.find((r) => r.id === id).template.join(' ');
  assert.equal(request('requestNormalVoice'), 'F0 43 20 7F 1C 00 0E 0F 00 F7');
  assert.equal(request('requestDrumVoice'), 'F0 43 20 7F 1C 00 0E 2F 00 F7');
  assert.equal(request('requestPerformance'), 'F0 43 20 7F 1C 00 0E 4F 00 F7');
  assert.equal(profile.identity, undefined, 'the data list prints the family as dd dd: no identity check');
});
