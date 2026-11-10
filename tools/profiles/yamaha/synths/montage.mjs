// Yamaha MONTAGE6/7/8 (2016): the MIDI data format (p. 192), the bulk dump blocks (p. 196) and the
// parameter change tables (pp. 197-226) of its data list, laid out as the MODX's, whose format it
// shares: the Performance and Part 1.
import { MODX_TABLES, PART_1 } from './modx.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default {
  id: 'yamaha-montage',
  name: 'Yamaha MONTAGE',
  family: 'MONTAGE',
  description: 'Yamaha MONTAGE6/7/8 synthesizer (2016): its data list\'s parameter change tables for the Performance and Part 1 (its elements, drum keys and FM-X operators), and Pull from their edit buffers.',
  documents: [{ title: 'MONTAGE6/MONTAGE7/MONTAGE8 Data List (J0)', file: 'montage_en_dl_j0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/9/1341759/montage_en_dl_j0.pdf' }],
  read: { formatPages: [192], tablePages: range(30).map((i) => 197 + i), bulk: [{ page: 196, right: 300 }, { page: 196, left: 300 }] },
  placeholders: PART_1,
  // The bulk dump table lists the whole Performance and a part, but not the Performance Common the
  // Bulk Control table names: Pull asks for the Performance Edit Buffer (0E 25 00), the common blocks
  // and every part's, and reads the Common and Part 1 from it.
  // The whole Performance's list prints this block at 34 1p 00; the part's list and the parameter
  // tables put it at 31 1p 00.
  bulkCorrections: { 'Motion Seq Part/Lane Settings 34 1p 00': ['31', '1p', '00'] },
  pull: { 'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '25', '00'] } },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model (4E 06 for the MONTAGE6, 4F 06 for the MONTAGE7)',
  tables: MODX_TABLES,
  notes: [
    'The parameter change tables repeat for each of the 16 parts, at addresses a part apart (the part number is the low nibble of the second address byte); this profile lays out the Performance Common and Part 1 with its 8 elements, 73 drum keys and 8 FM-X operators. The other parts are the same parameters at their own addresses and are not laid out.',
    'Pull asks for the Performance Edit Buffer (0E 25 00), which the bulk dump table lists, rather than its Common and a part as the MODX profile does: this data list\'s bulk dump table does not list the Performance Edit Buffer Common. The other 15 parts\' blocks are let pass, and the collection is complete at its Bulk Footer.',
  ],
  coverage: { inboundControllers: 'parameter changes the instrument sends are read by address, for the parts laid out' },
};
