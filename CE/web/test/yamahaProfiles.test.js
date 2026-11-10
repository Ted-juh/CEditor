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
import { readHexRange, readPairRange, readPlaceholders, readShownRange, readValues, seriesNames, splitList } from '../../../tools/profiles/yamaha/build-yamaha-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/yamaha/make-profiles.mjs';
import { localCollectDumpMessages, localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

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

test('the data format: the bytes before the address, a byte count among them, and what the checksum adds up', () => {
  // The MX: a model ID of two bytes where the MOXF has a group number and a model ID; its identity's
  // `dd dd` printed under it, beside another column's text.
  const mx = [
    '(3-6-1-3) IDENTITY REPLY (Transmit only)',
    '      F0H 7EH 7FH 06H 02H 43H 00H 41H ddH ddH 00H 00H 00H 7FH F7H',
    '      dd; Device Number Code',
    '(3-2) CHANNEL MODE MESSAGES          47 06',
    '      0001nnnn   1n   Device Number', '      01111111   7F   Model ID', '      00010100   17   Model ID', '      0aaaaaaa   aaaaaaa   Address High',
    '      0000nnnn   0n   Device Number', '      01111111   7F   Model ID', '      00010100   17   Model ID',
    '      0bbbbbbb   bbbbbbb   Byte Count', '      0bbbbbbb   bbbbbbb   Byte Count', '      0aaaaaaa   aaaaaaa   Address High',
    '      The Check sum is the value that results in a value of 0 for the lower 7 bits when the Byte Count, Start Address,',
  ].join('\n');
  const format = readFormat(mx);
  assert.deepEqual([format.header, format.bulkHeader, format.checksumFrom], [['7F', '17'], ['7F', '17', 'bb', 'bb'], 'byteCount']);
  assert.deepEqual(format.identityReply.slice(8, 10), ['47', '06']);
  // The MOXF: one code for each model, so no identity.
  assert.equal(readFormat('IDENTITY REPLY (Transmit only)\n F0H 7EH 7FH 06H 02H 43H 00H 41H ddH ddH mmH 00H 00H 7FH F7H\n dd: Device family number\n MOXF6: 4CH 06H\n MOXF8: 4DH 06H\n').identityReply, undefined);
});

test('the MODX M: an address of four bytes, the leading ones carried, and a value printed two bytes a line', () => {
  const xml = page(
    say(43, 40, 'MIDI PARAMETER CHANGE TABLE'), say(43, 52, '(PERFORMANCE COMMON) Group Number =7F 1C, Model ID = 0D'),
    say(104, 64, 'Data'), say(104, 70, 'Range'), say(104, 76, 'MSB/'), say(106, 82, 'LSB'), say(104, 88, '(HEX)'),
    say(56, 76, 'Address'), say(90, 76, 'Size'), say(150, 76, 'Parameter Name'), say(250, 76, 'Description'), say(330, 70, 'Default'),
    say(42, 100, '06 00 02 06'), say(94, 100, '2'), say(104, 100, '00 00 –'), say(150, 100, 'Performance Volume'), say(250, 100, '0 – 127'), say(330, 100, '00 7F'),
    say(104, 106, '00 7F'),
    say(79, 116, '08'), say(94, 116, '2'), say(104, 116, '00 01 –'), say(150, 116, 'Performance Pan'), say(250, 116, 'L63 – C – R63'), say(330, 116, '00 40'),
    say(104, 122, '00 7F'),
  );
  const [table] = pageParameterTables(xml, 4);
  assert.equal(table.title, 'MIDI PARAMETER CHANGE TABLE (PERFORMANCE COMMON)', 'the group and model ID set beside the title are not part of it');
  assert.deepEqual(table.rows.map((r) => [r.address.join(' '), r.size, r.range.join(' '), r.name, r.default]), [
    ['06 00 02 06', 2, '00 00 – 00 7F', 'Performance Volume', '00 7F'],
    ['08', 2, '00 01 – 00 7F', 'Performance Pan', '00 40'],
  ], 'the second row prints its low byte alone');
});

test('a column with no headings over it borrows the other\'s, a row printed without its address follows the one before', () => {
  // The MOTIF ES heads its left column alone (p. 77), prints `1 01 reserved` with no address between
  // EQ Q2 at 06 and EQ Gain3 at 08, and once `TOTAL = 30` for `TOTAL SIZE = 30`.
  const xml = page(
    say(40, 40, 'MIDI PARAMETER CHANGE TABLE (SYSTEM)'),
    say(45, 60, 'Address'), say(90, 60, 'Size'), say(105, 60, 'Data'), say(105, 68, 'Range'), say(150, 60, 'Parameter Name'), say(230, 60, 'Description'),
    say(42, 84, '00 20 05'), say(92, 84, '1'), say(103, 84, '0E – 36'), say(150, 84, 'EQ Frequency2'), say(230, 84, '100 – 10.0[kHz]'),
    say(77, 94, '06'), say(92, 94, '1'), say(103, 94, '01 – 78'), say(150, 94, 'EQ Q2'), say(230, 94, '0.1 – 12.0'),
    say(92, 104, '1'), say(108, 104, '01'), say(150, 104, 'reserved'),
    say(77, 114, '08'), say(92, 114, '1'), say(103, 114, '34 – 4C'), say(150, 114, 'EQ Gain3'), say(230, 114, '-12 – +12[dB]'),
    say(40, 124, 'TOTAL = 30'), say(100, 124, '1E (HEX)'),
    // The right column: the same columns 270 points across, and no headings.
    say(312, 84, '00 21 00'), say(362, 84, '1'), say(373, 84, '00 – 7F'), say(420, 84, 'Effect Type'), say(500, 84, '0 – 127'),
    say(347, 94, '01'), say(362, 94, '1'), say(373, 94, '00 – 7F'), say(420, 94, 'Effect Depth'), say(500, 94, '0 – 127'),
    say(347, 104, '02'), say(362, 104, '1'), say(373, 104, '00 – 01'), say(420, 104, 'Effect Switch'), say(500, 104, 'off, on'),
  );
  const tables = pageParameterTables(xml);
  assert.deepEqual(tables.map((t) => t.title), ['MIDI PARAMETER CHANGE TABLE (SYSTEM)', null], 'the right column runs the table on');
  assert.deepEqual(tables[0].rows.map((r) => [r.address.join(' '), r.name, r.range.join('; '), r.unprinted ?? false]), [
    ['00 20 05', 'EQ Frequency2', '0E – 36', false],
    ['06', 'EQ Q2', '01 – 78', false],
    ['07', 'reserved', '01', true],
    ['08', 'EQ Gain3', '34 – 4C', false],
  ], 'nothing under `TOTAL = 30` is a row');
  assert.deepEqual(tables[1].rows.map((r) => [r.address.join(' '), r.name, r.description]), [
    ['00 21 00', 'Effect Type', '0 – 127'],
    ['01', 'Effect Depth', '0 – 127'],
    ['02', 'Effect Switch', 'off, on'],
  ]);
});

test('the bulk dump block table: a series over a column\'s foot, and the CP5/CP50\'s order, its address first', () => {
  // The MOTIF's drum keys: `KEY C 0` and `: 73 Blocks` at the foot of the left column (the page's
  // number under it), `KEY C 6` at the head of the right.
  const motif = page(
    say(68, 40, 'Parameter Block'), say(130, 40, 'Description'), say(217, 40, 'Byte Count'), say(251, 40, 'Top Address'),
    say(40, 60, 'KEY C 0'), say(132, 60, 'Oscillator'), say(222, 60, '19'), say(236, 60, '13'), say(250, 60, '47'), say(262, 60, '00'), say(276, 60, '00'),
    say(132, 70, 'Pitch'), say(225, 70, '3'), say(236, 70, '03'), say(250, 70, '48'), say(262, 70, '00'), say(276, 70, '00'),
    say(135, 80, ':'), say(200, 80, '73 Blocks'), say(264, 80, ':'),
    say(280, 760, '47'),
    say(334, 40, 'Parameter Block'), say(399, 40, 'Description'), say(484, 40, 'Byte Count'), say(518, 40, 'Top Address'),
    say(334, 60, 'KEY C 6'), say(399, 60, 'Oscillator'), say(490, 60, '19'), say(503, 60, '13'), say(517, 60, '47'), say(529, 60, '48'), say(543, 60, '00'),
    say(399, 70, 'Pitch'), say(493, 70, '3'), say(503, 70, '03'), say(517, 70, '48'), say(529, 70, '48'), say(543, 70, '00'),
  );
  const state = { blocks: [], series: false };
  for (const span of [{ right: 300 }, { left: 300 }]) state.blocks.push(...pageBulkBlocks(motif, span, 3, state));
  assert.deepEqual(state.blocks, [
    { name: 'KEY C 0 Oscillator', bytes: 19, address: ['47', '00', '00'], last: { name: 'KEY C 6 Oscillator', mid: '48' } },
    { name: 'Pitch', bytes: 3, address: ['48', '00', '00'], last: { name: 'Pitch', mid: '48' } },
  ]);
  // The CP5/CP50: block, address, byte count in decimal and hex, description; and another table's
  // headings under it.
  const cp5 = page(
    say(40, 40, 'Parameter Block'), say(110, 40, 'Top Address'), say(170, 40, 'Byte Count'), say(230, 40, 'Description'),
    say(40, 60, 'SYSTEM'), say(110, 60, '00'), say(125, 60, '00'), say(140, 60, '00'), say(170, 60, '40'), say(190, 60, '28'), say(230, 60, 'Utility'),
    say(40, 70, 'PART'), say(110, 70, '31'), say(125, 70, 'pp'), say(140, 70, '00'), say(170, 70, '56'), say(190, 70, '38'), say(230, 70, 'Part (pp = 00 – 03)'),
    say(110, 80, '36'), say(125, 80, '01'), say(140, 80, '00'), say(170, 80, '40'), say(190, 80, '28'), say(230, 80, 'AD Insertion (CP5 only)'),
    say(40, 100, 'Bulk Header / Footer'), say(130, 100, 'Address'), say(230, 100, 'Description'),
    say(110, 110, '0F'), say(125, 110, '00'), say(140, 110, 'nn'), say(170, 110, '10'), say(190, 110, '10'), say(230, 110, 'MULTIPLE'),
  );
  assert.deepEqual(pageBulkBlocks(cp5), [
    { name: 'SYSTEM Utility', bytes: 40, address: ['00', '00', '00'] },
    { name: 'PART Part (pp = 00 – 03)', bytes: 56, address: ['31', 'pp', '00'] },
    { name: 'AD Insertion (CP5 only)', bytes: 40, address: ['36', '01', '00'] },
  ]);
  // Series named from their first and last block.
  assert.deepEqual(seriesNames('PLUG-IN PART Plug-in 1 Part', 'Plug-in 3 Part', 3), ['Plug-in 1 Part', 'Plug-in 2 Part', 'Plug-in 3 Part'], 'the first still under its label');
  assert.equal(seriesNames('Seq Remote Tr1 Message', 'Seq Remote Tr16 Message', 16)[9], 'Seq Remote Tr10 Message', 'a number set against a word inside the name');
  assert.deepEqual(seriesNames('Part1', 'Part4', 4), ['Part 1', 'Part 2', 'Part 3', 'Part 4'], 'at its end, set apart');
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
  assert.deepEqual(readValues([[0, 9]], '0 = Preset, 1 = User, 2 = Library1 – 9 = Library8').choices.map((c) => c.label).slice(1, 4), ['User', 'Library1', 'Library2']);
  assert.deepEqual(readHexRange('0 – 2'), [[0, 2]], 'the MX prints a byte with one digit');
  // The MODX M prints every value two 7-bit bytes, high first, and its minus signs as U+2212.
  assert.deepEqual(readPairRange('00 00 – 00 7F'), [[0, 127]]);
  assert.deepEqual(readPairRange('00 00 – 0F 7F'), [[0, 2047]]);
  assert.deepEqual(readPairRange('00 00 – 00 11, 00 7F'), [[0, 17], [127, 127]]);
  assert.equal(readPairRange('00 2E – 00 B6'), null, 'B6 is no 7-bit byte');
  assert.deepEqual(readValues([[0x10, 0x70]], '\u221248 – +48 semi'), { shown: { min: -48, max: 48 }, unit: 'semitones' });
  assert.deepEqual(readValues([[0, 17], [127, 127]], '0: Part 1, 1: Part 2 – 15: Part 16, 16: A/D, 17: Master, 127: Off').choices.slice(-4).map((c) => `${c.value} ${c.label}`), ['15 Part 16', '16 A/D', '17 Master', '127 Off'], 'the numbers printed are the values');
  const omni = readValues([[0, 16], [127, 127]], '1 – 16, omni, off').choices;
  assert.deepEqual([omni.length, omni[15], omni[16], omni[17]], [18, { value: 15, label: '16' }, { value: 16, label: 'omni' }, { value: 127, label: 'off' }], 'counted out over the parts in turn');
  assert.deepEqual(readPlaceholders(['op = operator number', '00 – 03 (hex)', 'OP1 – OP4']), { op: { what: 'operator number', values: [0, 1, 2, 3], labels: ['OP1', 'OP2', 'OP3', 'OP4'] } });
});

/* ------------------------------------------------------------------ the profiles */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/**
 * A dump made by hand, as the instrument would send it: each mapped parameter at its lowest value
 * (or at `values[id]`), the rest 0, and its checksum worked out. A Bulk Header or Footer carries none.
 */
function handMade(profile, d, values = {}, at = null) {
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  const data = new Array(d.payload.size).fill(0);
  for (const m of d.mappings) {
    const p = byId.get(m.parameter);
    const low = values[p.id] ?? (p.type === 'choice' ? p.choices[0].value : p.type === 'text' ? 32 : p.range.min);
    const bytes = p.type === 'text' ? new Array(p.encoding.length).fill(32) : p.encoding.type === 'u14-msb-lsb' ? [low >> 7, low & 127] : p.encoding.type === 'nibbled' ? [3, 2, 1, 0].map((k) => (low >> (k * 4)) & 15) : [low];
    bytes.forEach((b, k) => { data[m.offset + k] = b; });
  }
  const prefix = d.matcher.prefix.map((b) => parseInt(b, 16));
  if (at) prefix.splice(prefix.length - 3, 3, ...at);
  const summed = [...prefix, ...data].slice(d.checksum.fromOffset);
  return hex([...prefix, ...data, (128 - (summed.reduce((t, b) => t + b, 0) % 128)) % 128, 0xf7]);
}

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/yamaha/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is a parameter change at its address, at both ends of its range`, () => {
    const { template } = profile.messageRecipes[0];
    const head = template.slice(3, template.indexOf('$address')).join(' ');
    const ids = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      if (p.type === 'text') continue;
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        // A two-byte choice (the MODX M's) goes out as 00 and the choice.
        const bytes = p.messageRecipe === 'parameterChangeChoice' ? [0, wire] : p.encoding.type === 'u14-msb-lsb' ? [wire >> 7, wire & 127] : p.encoding.type === 'nibbled' ? [3, 2, 1, 0].map((s) => (wire >> (s * 4)) & 15) : [wire];
        assert.equal(compiled.hex, `F0 43 10 ${head} ${p.address} ${hex(bytes)} F7`, `${p.id} = ${value}`);
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

  test(`${profile.id}: each Pull's answer, every block of it made by hand, is a complete collection`, { skip: !profile.requests?.length }, () => {
    const message = (d) => handMade(profile, d);
    for (const r of profile.requests.filter((x) => x.response.kind === 'bulkDump')) {
      const members = profile.dumpDefinitions.filter((d) => d.completion.collectionId === r.response.collectionId);
      const collected = localCollectDumpMessages(profile, members.map(message));
      assert.ok(collected.complete, `${r.name}: ${collected.error} ${JSON.stringify(collected.diagnostics.slice(0, 2))}`);
      assert.equal(collected.parsedMessageCount, members.length);
    }
    for (const r of profile.requests.filter((x) => x.response.dump)) {
      const parsed = localParseDumpMessage(profile, message(profile.dumpDefinitions.find((d) => d.id === r.response.dump)));
      assert.ok(parsed.ok, `${r.name}: ${parsed.error}`);
    }
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

test('the MX: a model ID of two bytes, a byte count the checksum adds up, and its identity', { skip: !builtProfile('yamaha-mx') }, () => {
  const profile = builtProfile('yamaha-mx');
  const at = (group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
  const send = (group, name, value) => localCompileParameter(profile, { parameterId: at(group, name).id, value }).hex;
  assert.equal(send('Voice Element 2', 'Element Switch', 'on'), 'F0 43 10 7F 17 41 01 00 01 F7');
  assert.equal(send('Performance Arpeggio Common', 'Tempo', 300), 'F0 43 10 7F 17 36 30 02 02 2C F7', 'two bytes, a high and a low 7 bits: 5 – 300');
  assert.deepEqual([at('Performance Arpeggio Common', 'ARP Swing Offset').display.min, at('Performance Arpeggio Common', 'ARP Swing Offset').default], [-120, 128]);
  assert.ok(at('Performance Part 16', 'Bank Select MSB'));
  assert.equal(at('Drum Key C6', 'Element Switch').address, '47 48 00');
  assert.deepEqual([profile.identity.familyCode, profile.identity.modelNumber], [['00', '41'], ['47', '06']]);
  const common = profile.dumpDefinitions.find((d) => d.id === 'bulk400000');
  assert.equal(common.matcher.prefix.join(' '), 'F0 43 00 7F 17 00 50 40 00 00', 'no model ID after the byte count');
  assert.deepEqual([common.payload.offset, common.checksum.fromOffset, common.completion.expectedBytes], [10, 5, 92], 'the checksum adds up from the byte count');
  assert.equal(profile.requests.find((r) => r.id === 'requestPerformance').template.join(' '), 'F0 43 20 7F 17 0E 5F 00 F7');
});

test('the MODX: Pull asks for the Performance Common and Part 1, and Part 1 is complete at its footer, whatever its type sends', { skip: !builtProfile('yamaha-modx') }, () => {
  const profile = builtProfile('yamaha-modx');
  const request = (id) => profile.requests.find((r) => r.id === id).template.join(' ');
  assert.equal(request('requestPerformanceCommon'), 'F0 43 20 7F 1C 07 0E 53 00 F7');
  assert.equal(request('requestPart1'), 'F0 43 20 7F 1C 07 0E 52 00 F7', 'the Bulk Control table\'s Performance Edit Buffer Part nn, nn = 0');
  const part1 = profile.dumpDefinitions.filter((d) => d.completion.collectionId === 'part1');
  assert.ok(part1.every((d) => d.completion.endsWith === 'bulk0F5200'));
  // A Normal part: its part blocks and its eight elements twice over, no drum keys, no operators.
  const normal = part1.filter((d) => !/^(50|48|49)$/.test(d.matcher.prefix.at(-3)));
  assert.ok(normal.length < part1.length - 80);
  const element2 = profile.parameters.find((p) => p.group === 'Element 2 Part 1' && p.type === 'integer' && p.range.max > 1 && normal.some((d) => d.mappings.some((m) => m.parameter === p.id)));
  const messages = normal.map((d) => handMade(profile, d, d.mappings.some((m) => m.parameter === element2.id) ? { [element2.id]: element2.range.max } : {}));
  const begun = localCollectDumpMessages(profile, messages.slice(0, -1));
  assert.equal(begun.complete, false, 'not before the footer');
  const collected = localCollectDumpMessages(profile, messages);
  assert.ok(collected.complete, collected.error);
  assert.equal(collected.values[element2.id], element2.range.max);
  // Part 2's blocks are not this profile's: the instrument would not send them for Part 1, and a
  // stray one is no dump of it.
  const performancePart = part1.find((d) => d.matcher.prefix.slice(-3).join(' ') === '31 00 00');
  assert.equal(localParseDumpMessage(profile, handMade(profile, performancePart, {}, [0x31, 0x01, 0x00])).ok, false);
  assert.equal(profile.dumpDefinitions.find((d) => d.id === 'bulk304000').completion.collectionId, 'performanceCommon');
});

test('the MODX M and MONTAGE M: four-byte addresses, two-byte values and choices, and Part 1 read back at its footer', { skip: !builtProfile('yamaha-modx-m') }, () => {
  for (const id of ['yamaha-modx-m', 'yamaha-montage-m']) {
    const profile = builtProfile(id);
    const at = (group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
    const send = (group, name, value) => localCompileParameter(profile, { parameterId: at(group, name).id, value }).hex;
    assert.equal(send('Performance Common', 'Performance Pan', 127), 'F0 43 10 7F 1C 0D 06 00 02 08 00 7F F7', `${id}: four address bytes, then the value's two`);
    assert.equal(send('System', 'Keyboard Velocity Curve', 'wide'), 'F0 43 10 7F 1C 0D 00 00 00 14 00 05 F7', 'a two-byte choice: 00, then the choice');
    assert.deepEqual([at('Part 1 Pitch/Effect', 'Note Shift').display.min, at('Part 1 Pitch/Effect', 'Note Shift').display.max], [-48, 48], 'U+2212 is a minus');
    assert.equal(at('Part 1 Element 3', 'Element Switch').address, '20 00 02 00', 'element 3: 2p 00 ee 00, ee = 02');
    const request = (rid) => profile.requests.find((r) => r.id === rid).template.join(' ');
    assert.equal(request('requestPart1'), 'F0 43 20 7F 1C 0D 04 04 01 00 F7', 'the Bulk Control table\'s Performance Edit Buffer Part nn, nn = 0');
    assert.equal(request('requestPerformanceCommon'), 'F0 43 20 7F 1C 0D 04 04 02 00 F7');
    // An AWM2 part answers with its part blocks and its elements' (8 laid out here), no keys, no
    // FM-X or AN-X blocks; a two-byte choice is read from its low byte.
    const part1 = profile.dumpDefinitions.filter((d) => d.completion.collectionId === 'part1');
    const awm2 = part1.filter((d) => !/^(30|40|70)$/.test(d.matcher.prefix.at(-4)) && !(d.matcher.prefix.at(-4) === '20' && d.matcher.prefix.at(-3) === '10'));
    const choice = profile.parameters.find((p) => p.messageRecipe === 'parameterChangeChoice' && p.choices.length > 2 && awm2.some((d) => d.mappings.some((m) => m.parameter === p.id)));
    const element3 = at('Part 1 Element 3', 'Element Switch');
    const values = { [choice.id]: choice.choices.at(-1).value, [element3.id]: 1 };
    const collected = localCollectDumpMessages(profile, awm2.map((d) => handMade(profile, d, Object.fromEntries(Object.entries(values).filter(([k]) => d.mappings.some((m) => m.parameter === k))))));
    assert.ok(collected.complete, `${id}: ${collected.error}`);
    assert.equal(collected.values[choice.id], choice.choices.at(-1).id);
    assert.equal(collected.values[element3.id], 'on');
    assert.equal(profile.identity, undefined, 'a code for each model: no identity check');
    // The System's three blocks and the two edit buffers: a Performance block between its header and
    // footer is no request of its own (the MONTAGE M prints that header `04 ll m nn`).
    assert.equal(profile.requests.length, 5, `${id}: ${profile.requests.map((r) => r.name).join('; ')}`);
  }
});

test('the MOTIF ES, S90 ES and MOTIF-RACK ES: Plug-in Parts beside the parts, A/D Parts, four elements, and the Plug-in Voice\'s edit buffer', { skip: !builtProfile('yamaha-motif-es') }, () => {
  const profile = builtProfile('yamaha-motif-es');
  const at = (p, group, name) => p.parameters.find((x) => x.group === group && x.name === name);
  assert.equal(at(profile, 'Mix Plug-in 3 Part', 'Bank Select MSB').address, '37 62 00', '`pp = 60 – 62 Part Plug-in 1 – 3`');
  assert.equal(at(profile, 'Performance AD Part 5', 'A/D Part Volume').address, '34 44 01');
  assert.equal(at(profile, 'Voice Element 4', 'ELEMENT ASSIGN').address, '41 03 00');
  assert.equal(at(profile, 'Drum Key C6', 'Element Assign').address, '47 48 00');
  assert.equal(localCompileParameter(profile, { parameterId: at(profile, 'System', 'Basic Receive Channel').id, value: 'omni' }).hex, 'F0 43 10 7F 00 00 00 0A 10 F7', 'the native parameter change, not the XG one the data list prints first');
  const request = (p, id) => p.requests.find((r) => r.id === id).template.join(' ');
  assert.equal(request(profile, 'requestPluginVoice'), 'F0 43 20 7F 00 0E 1F 00 F7');
  // The data list prints the Mix's last Plug-in Part `37 44 00`; the series is 37 60 … 37 62.
  const plugin3 = profile.dumpDefinitions.find((d) => d.matcher.prefix.slice(-3).join(' ') === '37 62 00');
  assert.equal(plugin3.completion.collectionId, 'multi');
  assert.ok(profile.authoringNotes.some((n) => n.includes('Plug-in 3 Part printed 37 44 00')));
  const s90 = builtProfile('yamaha-s90-es');
  assert.equal(at(s90, 'Multi Plug-in 3 Part', 'Bank Select MSB').address, '37 62 00');
  assert.ok(at(s90, 'Performance Audio Input Part 1', 'A/D Part Volume'));
  // The MOTIF-RACK ES: its format from the owner's manual, two Plug-in Parts, no Master, and the
  // Plug-in Voice's Audition at 4C 06, where the data list heads it 46 06.
  const rack = builtProfile('yamaha-motif-rack-es');
  assert.deepEqual(rack.identity.modelNumber, ['19', '06']);
  assert.equal(at(rack, 'Plug-in Voice Audition', 'Audition Note Shift').address, '4C 06 02');
  assert.ok(at(rack, 'Multi Plug-in 2 Part', 'Bank Select MSB') && !at(rack, 'Multi Plug-in 3 Part', 'Bank Select MSB'));
  assert.equal(rack.requests.some((r) => r.id === 'requestMaster'), false);
});

test('the MOTIF (2001): the model ID 6B alone, and its ranges and descriptions printed with hyphens', { skip: !builtProfile('yamaha-motif') }, () => {
  const profile = builtProfile('yamaha-motif');
  const at = (group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
  assert.equal(localCompileParameter(profile, { parameterId: at('System', 'Master Volume').id, value: 127 }).hex, 'F0 43 10 6B 00 00 00 7F F7');
  assert.equal(profile.requests.find((r) => r.id === 'requestNormalVoice').template.join(' '), 'F0 43 20 6B 0E 0F 00 F7');
  // `00 - 10,` over `7F` beside `1 - 16, omni, off`: one range, counted out.
  assert.deepEqual(at('System', 'Basic Receive Channel').choices.slice(-2).map((c) => [c.value, c.label]), [[16, 'omni'], [127, 'off']]);
  assert.equal(at('Seq Remote Tr3 Message', 'Seq Remote Mode Track Select Switch Channel').address, '02 02 01', '`02 tt 01`, tt the track');
  // The drum keys' series runs over the bulk table's column break.
  assert.equal(profile.dumpDefinitions.filter((d) => d.completion.collectionId === 'drumVoice' && d.matcher.prefix.at(-3) === '47').length, 146);
});

test('the CP1, CP5 and CP50: a model ID byte and an identity each, and the CP50 without what the data list marks CP5 only', { skip: !builtProfile('yamaha-cp5') }, () => {
  const cp1 = builtProfile('yamaha-cp1');
  assert.deepEqual(cp1.identity.modelNumber, ['3B', '06']);
  assert.equal(cp1.parameters.find((p) => p.group === 'Pre-Amp Part 2' && p.name === 'Pre-Amp On/Off').address, '31 11 24', '`1p`, p the layer');
  for (const [id, model, family, parts] of [['yamaha-cp5', '10', '3F', 4], ['yamaha-cp50', '11', '40', 2]]) {
    const profile = builtProfile(id);
    assert.equal(profile.messageRecipes[0].template.slice(3, 5).join(' '), `7F ${model}`);
    assert.deepEqual(profile.identity.modelNumber, [family, '06']);
    assert.equal(profile.dumpDefinitions.filter((d) => d.matcher.prefix.at(-3) === '31').length, parts, `${id}: a Part block each part`);
    assert.equal(profile.requests.find((r) => r.id === 'requestPerformance').template.join(' '), `F0 43 20 7F ${model} 0E 4F 00 F7`);
  }
  const cp50 = builtProfile('yamaha-cp50');
  assert.equal(cp50.parameters.filter((p) => /^3[46] /.test(p.address)).length, 0, 'no Power-Amp/Insertion 2, no A/D input');
  assert.equal(cp50.dumpDefinitions.filter((d) => /^3[46]$/.test(d.matcher.prefix.at(-3))).length, 0);
  assert.ok(builtProfile('yamaha-cp5').parameters.some((p) => /^36 /.test(p.address)));
});
