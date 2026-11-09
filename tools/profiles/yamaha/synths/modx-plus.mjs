// Yamaha MODX+ (MODX6+/7+/8+): the MIDI data format (p. 188) and the parameter change tables (pp.
// 193-222) and bulk dump blocks (p. 192) of its data list, laid out as the MODX's: the Performance and
// Part 1.
import { MODX_BULK, MODX_NOTES, MODX_PULL, MODX_TABLES, PART_1 } from './modx.mjs';

export default {
  id: 'yamaha-modx-plus',
  name: 'Yamaha MODX+',
  family: 'MODX',
  description: 'Yamaha MODX6+/7+/8+ synthesizer: its data list\'s parameter change tables for the Performance and Part 1 (its elements, drum keys and FM-X operators), and Pull from their edit buffers.',
  documents: [{ title: 'MODX6+/MODX7+/MODX8+ Data List (A0)', file: 'modx_plus_en_dl_a0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/5/1583935/modx_plus_en_dl_a0.pdf' }],
  read: { formatPages: [188], tablePages: Array.from({ length: 30 }, (u, i) => 193 + i), bulk: MODX_BULK },
  placeholders: PART_1,
  pull: MODX_PULL,
  noIdentity: 'the data list prints the identity reply with the family and model bytes as `dd dd`',
  tables: MODX_TABLES,
  notes: MODX_NOTES,
  coverage: { inboundControllers: 'parameter changes the instrument sends are read by address, for the parts laid out' },
};
