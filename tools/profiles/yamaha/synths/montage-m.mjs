// Yamaha MONTAGE M6/M7/M8x: the MIDI data format (pp. 214-215), the bulk dump blocks (pp. 220-222)
// and the parameter change tables (pp. 223-256) of its data list, laid out as the MODX M's: the
// Performance and Part 1.
import { MODX_M_BULK, MODX_M_NOTES, MODX_M_PART_1, MODX_M_PULL, MODX_M_TABLES, bulkPlaceholders } from './modx-m.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default {
  id: 'yamaha-montage-m',
  name: 'Yamaha MONTAGE M',
  family: 'MONTAGE',
  description: 'Yamaha MONTAGE M6/M7/M8x synthesizer: its data list\'s parameter change tables for the Performance and Part 1 (its elements, drum keys, FM-X operators and AN-X oscillators), and Pull from their edit buffers.',
  documents: [{ title: 'MONTAGE M6/MONTAGE M7/MONTAGE M8x Data List (H0)', file: 'MONTAGE-M_data_list_En_H0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/7/2172427/MONTAGE-M_data_list_En_H0.pdf' }],
  read: { formatPages: [214, 215], tablePages: range(34).map((i) => 223 + i), bulk: MODX_M_BULK },
  placeholders: MODX_M_PART_1,
  bulkPlaceholders,
  pull: MODX_M_PULL,
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
  tables: MODX_M_TABLES,
  notes: MODX_M_NOTES,
  coverage: { inboundControllers: 'parameter changes the instrument sends are read by address, for the parts laid out' },
};
