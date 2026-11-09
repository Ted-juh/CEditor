// Yamaha MODX6/7/8: the MIDI data format (p. 188) and the parameter change tables (pp. 193-222) of
// its data list. The tables repeat for each of the 16 parts, at addresses a part apart; this
// profile lays out the Performance and Part 1, every element, drum key and FM-X operator of it.
const range = (n) => Array.from({ length: n }, (u, i) => i);
export const PART_1 = {
  // The Bulk Dump Block table's notes: [p: Part No. (0...15)], [e: Element No. (0...7)],
  // [o: Operator No. (0...7)], [kk: Key No. (0...72)], [c: Scene No. (0...7)].
  p: { values: [0], labels: ['Part 1'] },
  e: { values: range(8), labels: range(8).map((i) => `Element ${i + 1}`) },
  o: { values: range(8), labels: range(8).map((i) => `Operator ${i + 1}`) },
  kk: { values: range(73), labels: range(73).map((i) => `Key ${i}`) },
  c: { values: range(8), labels: range(8).map((i) => `Scene ${i + 1}`) },
};
export const MODX_TABLES = {
  'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
  'CURVE': { skip: 'the user curves (names and points), stored with the user data, not with a Performance' },
  'LIVE SET': { skip: 'the Live Set names, stored with the user data, not with a Performance' },
};
export const MODX_NOTES = [
  'The parameter change tables repeat for each of the 16 parts, at addresses a part apart (the part number is the low nibble of the second address byte); this profile lays out the Performance Common and Part 1 with its 8 elements, 73 drum keys and 8 FM-X operators. The other parts are the same parameters at their own addresses and are not laid out.',
  'Not read back yet: the bulk dumps are not mapped (Pull does nothing).',
];

export default {
  id: 'yamaha-modx',
  name: 'Yamaha MODX',
  family: 'MODX',
  description: 'Yamaha MODX6/7/8 synthesizer: its data list\'s parameter change tables for the Performance and Part 1 (its elements, drum keys and FM-X operators).',
  documents: [{ title: 'MODX6/MODX7/MODX8 Data List (D0)', file: 'modx_en_dl_d0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/2/1192592/modx_en_dl_d0.pdf' }],
  read: { formatPages: [188], tablePages: Array.from({ length: 30 }, (u, i) => 193 + i) },
  placeholders: PART_1,
  noIdentity: 'the data list prints the identity reply with the family and model bytes as `dd dd`',
  tables: MODX_TABLES,
  notes: [...MODX_NOTES, 'The data format prints the Model ID as 07 in hex and 00000010 in binary; the hex is taken, as the MODX+ data list prints both alike.'],
  coverage: { inboundControllers: 'parameter changes the instrument sends are read by address, for the parts laid out' },
};
