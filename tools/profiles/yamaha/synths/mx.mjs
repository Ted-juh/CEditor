// Yamaha MX49/MX61/MX88: the MIDI data format (p. 55), the bulk dump blocks (p. 57) and the parameter
// change tables (pp. 58-66) of its data list. Every table is laid out in full: the System, the
// Performance (the MX's multi) and its sixteen parts, the Normal Voice and its eight elements, the
// Drum Voice and its 73 keys. The data list prints each part's, element's and key's rows under its
// block's common table, untitled.
import { noteName } from '../build-yamaha-profile.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export default {
  id: 'yamaha-mx',
  name: 'Yamaha MX49/MX61/MX88',
  family: 'MX',
  description: 'Yamaha MX49/MX61/MX88 synthesizer: every parameter change table of its data list (System, the Performance and its 16 parts, Normal Voice with its elements, Drum Voice with its keys), identity, and Pull from the edit buffers.',
  documents: [{ title: 'MX49/MX61/MX88 Data List (C0)', file: 'mx49mx61mx88_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/0/892970/mx49mx61mx88_en_dl_c0.pdf' }],
  read: { formatPages: [55], tablePages: range(9).map((i) => 58 + i), bulk: [{ page: 57, left: 300 }] },
  // The bulk dump table prints each header `0E mm nn`; the Bulk Control table says which: the edit
  // buffers (the multi is the Performance on the MX).
  pull: {
    'MULTI': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '5F', '00'] },
    'VOICE (NORMAL)': { id: 'normalVoice', name: 'Normal Voice Edit Buffer', header: ['0E', '0F', '00'] },
    'VOICE (DRUM)': { id: 'drumVoice', name: 'Drum Voice Edit Buffer', header: ['0E', '2F', '00'] },
  },
  tables: {
    'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
    'PART SET CONTROL for MIX VOICE': { group: 'Part Set Control' },
    'SYSTEM': { groupOf: (at, row, block) => block?.name ?? 'System' },
    // The Parameter Base Address table: `37 pp 00 Part 1 – 16 (pp: 00 – 0F)`, `41 ee 00 Element Group 1
    // (ee: 00 – 07)`, `47 ee 00 Element Group (ee: 0 – 72)`, the keys C0 – C6 as the bulk table names them.
    'MULTI COMMON': { placeholders: { pp: numbered(16, 'Part') }, groupOf: (at, row, block) => `Performance ${block?.name ?? 'Common'}` },
    'NORMAL VOICE COMMON': { placeholders: { ee: numbered(8, 'Element') }, groupOf: (at, row, block) => (at.ee !== undefined ? `Voice Element ${at.ee + 1}` : `Voice ${block?.name ?? 'Common'}`) },
    'DRUM VOICE COMMON': { placeholders: { ee: { values: range(73), labels: range(73).map(noteName) } }, groupOf: (at, row, block) => (at.ee !== undefined ? `Drum Key ${noteName(at.ee)}` : `Drum ${block?.name ?? 'Common'}`) },
  },
  notes: [
    'The MX prints its Model ID as two bytes, 7F 17, where the MOXF prints a group number (7F 1C) and a model ID; its bulk dump carries the byte count after them, and its checksum adds up from the byte count.',
    'Parameter changes at 40-42 (Normal Voice) and 46-47 (Drum Voice) edit the voice in the Voice mode\'s edit buffer; Pull asks for each edit buffer (Normal Voice, Drum Voice, Performance), whichever mode the instrument is in.',
  ],
};
