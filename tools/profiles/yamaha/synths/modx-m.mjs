// Yamaha MODX M6/M7/M8: the MIDI data format (pp. 214-215), the bulk dump blocks (pp. 220-222) and
// the parameter change tables (pp. 223-256) of its data list. Its addresses are four bytes and every
// value of a 2-byte table is two 7-bit bytes; the tables repeat for each of the 16 parts, and this
// profile lays out the Performance and Part 1, as the MODX's does.
import { noteName } from '../build-yamaha-profile.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

// The Parameter Base Address table's notes: [p: Part No. (0…15)], [ee: Element No. (0…127)],
// [kk: Key No. (0…72)], [c: Scene No. (0…7)], [k: Knob No. (0…7)], [bb: Controller Box No.
// (0…31)], [o: Operator No. (0…7)] on an FM-X part, [o: Oscillator No. (0…2)] and [f: Filter No.
// (0…1)] on an AN-X part. Part 1, and its first 8 elements of 128.
export const MODX_M_PART_1 = {
  p: { values: [0], labels: ['Part 1'] },
  ee: numbered(8, 'Element'),
  kk: { values: range(73), labels: range(73).map(noteName) },
  c: numbered(8, 'Scene'),
  k: numbered(8, 'Knob'),
  bb: numbered(32, 'Box'),
};
const FM_X = { o: numbered(8, 'Operator') };
const AN_X = { o: numbered(3, 'Oscillator'), f: numbered(2, 'Filter') };
// A bulk block's `o` is an FM-X operator at 3p, an AN-X oscillator at 4p.
export const bulkPlaceholders = (address) => (/^3/.test(address[0]) ? FM_X : /^4/.test(address[0]) ? AN_X : {});
// A group is what its rows stand for: a scene, a knob, a controller box, or the block they are in,
// named without the bytes they take (`Performance Common 1byte param` is the Performance Common).
const tidy = (name, ...lead) => String(name ?? '').replace(new RegExp(`^(${lead.join('|')})\\s*`, 'i'), '').replace(/\b[12]byte\b|\bparam\b/g, '').replace(/\s+Part$/, '').replace(/\s+/g, ' ').trim();
const each = (prefix, at) => (at.c !== undefined ? `${prefix} Scene ${at.c + 1}` : at.k !== undefined ? `${prefix} Knob ${at.k + 1}` : at.bb !== undefined ? `${prefix} Controller Box ${at.bb + 1}` : null);
const performance = (at, row, block) => each('Performance', at) ?? `Performance ${tidy(block?.base ?? block?.name, 'PERFORMANCE', 'Performance') || 'Common'}`;
const part1 = (at, row, block) => each('Part 1', at) ?? `Part 1 ${tidy(block?.base ?? block?.name, 'PERFORMANCE Performance Part', 'Performance Part')}`.trim();

export const MODX_M_TABLES = {
  'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
  'CURVE': { skip: 'the user curves (names and points), stored with the user data, not with a Performance' },
  'LIVE SET': { skip: 'the Live Sets, stored with the user data, not with a Performance' },
  'SYSTEM': { groupOf: (at, row, block) => block?.name ?? 'System' },
  'PERFORMANCE COMMON': { groupOf: performance },
  'PERFORMANCE PART': { groupOf: part1 },
  'NORMAL PART ELEMENT': { groupOf: (at) => `Part 1 Element ${at.ee + 1}` },
  'DRUM VOICE KEY': { groupOf: (at) => `Part 1 Key ${noteName(at.kk)}` },
  'FM-X PART COMMON': { placeholders: FM_X, groupOf: (at) => (at.o !== undefined ? `Part 1 FM-X Operator ${at.o + 1}` : 'Part 1 FM-X') },
  'AN-X PART': { placeholders: AN_X, groupOf: (at) => (at.o !== undefined ? `Part 1 AN-X Oscillator ${at.o + 1}` : at.f !== undefined ? `Part 1 AN-X Filter ${at.f + 1}` : 'Part 1 AN-X') },
};
// The bulk dump table prints each header `04 ll mm nn`; the Bulk Control table says which.
export const MODX_M_PULL = {
  '04 04 01 nn': { id: 'part1', name: 'Performance Edit Buffer Part 1', header: ['04', '04', '01', '00'] },
  '04 04 02 00': { id: 'performanceCommon', name: 'Performance Edit Buffer Common' },
};
export const MODX_M_BULK = [220, 221].flatMap((page) => [{ page, right: 300 }, { page, left: 300 }]).concat([{ page: 222 }]);
export const MODX_M_NOTES = [
  'The parameter change tables repeat for each of the 16 parts, at addresses a part apart (the part number is the low nibble of the first address byte); this profile lays out the Performance Common and Part 1: its first 8 elements of an AWM2 part\'s 128, its 73 drum keys, its 8 FM-X operators, and its AN-X oscillators and filters. The other parts and elements are the same parameters at their own addresses and are not laid out.',
  'A 2-byte table sends every value as two 7-bit bytes, high first; a choice of such a table goes out as 00 and the choice, and is read back from the second byte.',
  'Pull asks for the Performance Edit Buffer Common (04 04 02 00) and the Performance Edit Buffer Part 1 (04 04 01 00) from the Bulk Control table, the two halves this profile lays out. Part 1 answers with the blocks of its type, so its collection is complete at its Bulk Footer; the blocks of elements 9 to 128 are let pass.',
];

export default {
  id: 'yamaha-modx-m',
  name: 'Yamaha MODX M',
  family: 'MODX',
  description: 'Yamaha MODX M6/M7/M8 synthesizer: its data list\'s parameter change tables for the Performance and Part 1 (its elements, drum keys, FM-X operators and AN-X oscillators), and Pull from their edit buffers.',
  documents: [{ title: 'MODX M6/MODX M7/MODX M8 Data List (B0)', file: 'MODX-M_data_list_En_B0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/9/2574209/MODX-M_data_list_En_B0.pdf' }],
  read: { formatPages: [214, 215], tablePages: range(34).map((i) => 223 + i), bulk: MODX_M_BULK },
  placeholders: MODX_M_PART_1,
  bulkPlaceholders,
  pull: MODX_M_PULL,
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model (6E 06 for the MODX M6, 6F 06 for the M7, 70 06 for the M8)',
  tables: MODX_M_TABLES,
  notes: MODX_M_NOTES,
  coverage: { inboundControllers: 'parameter changes the instrument sends are read by address, for the parts laid out' },
};
