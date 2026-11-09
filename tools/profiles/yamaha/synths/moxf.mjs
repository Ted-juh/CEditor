// Yamaha MOXF6/MOXF8: the MIDI data format (p. 121), the bulk dump blocks (p. 124) and the parameter
// change tables (pp. 125-146) of its data list. Every table is laid out in full: the System and its
// Quick Setups, the Master's four zones, the Performance and its four parts, the Song/Pattern mixing
// and its sixteen parts, the Normal Voice and its eight elements, the Drum Voice and its 73 keys.
import { noteName } from '../build-yamaha-profile.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });
// The address bytes the tables print as placeholders, as the Parameter Base Address table gives them:
// `32 nn 00 Zone 1 – 4 (nn: 00 – 03)`, `31 pp 00 Part 1 – 4`, `37 pp 00 Part 1 – 16 (pp: 00 – 0F)`,
// `41 ee 00 Element Group 1 (ee: 00 – 07)`, `47 ee 00 Element Group (ee: 0 – 72)`, the keys C0 – C6 as
// the bulk dump table names them; `00 5n 00` Quick Setup, `00 6n 00` and `00 7n 00` its audio and MIDI
// configs, six of each.
const QUICK = { 5: 'Quick Setup', 6: 'Quick Setup Audio Config', 7: 'Quick Setup MIDI Config' };
const under = (prefix, fallback) => (at, row, block) => `${prefix} ${block?.name ?? fallback}`;

export default {
  id: 'yamaha-moxf',
  name: 'Yamaha MOXF',
  family: 'MOXF',
  description: 'Yamaha MOXF6/MOXF8 synthesizer: every parameter change table of its data list (System, Master, Performance, Song/Pattern mixing, Normal Voice with its elements, Drum Voice with its keys), and Pull from the edit buffers.',
  documents: [{ title: 'MOXF6/MOXF8 Data List (A0)', file: 'moxf6moxf8_en_dl_a0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/2/330242/moxf6moxf8_en_dl_a0.pdf' }],
  read: { formatPages: [121], tablePages: range(22).map((i) => 125 + i), bulk: [{ page: 124, right: 300 }, { page: 124, left: 300 }] },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd` (4C 06 for the MOXF6, 4D 06 for the MOXF8)',
  // The bulk dump table prints each header `0E mm nn`; the Bulk Control table says which: the edit buffers.
  pull: {
    'MASTER KEYBOARD': { id: 'master', name: 'Master Edit Buffer', header: ['0E', '7F', '00'] },
    'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '4F', '00'] },
    'SONG/PATTERN': { id: 'multi', name: 'Multi Edit Buffer', header: ['0E', '5F', '00'] },
    'VOICE (NORMAL)': { id: 'normalVoice', name: 'Normal Voice Edit Buffer', header: ['0E', '0F', '00'] },
    'VOICE (DRUM)': { id: 'drumVoice', name: 'Drum Voice Edit Buffer', header: ['0E', '2F', '00'] },
  },
  blockName: (name, at) => (at[0] === 0 && at[1] >= 0x50 ? `${QUICK[at[1] >> 4]} ${(at[1] & 15) + 1}` : name),
  tables: {
    'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
    'MODE CHANGE': { group: 'Mode' },
    'PART SET CONTROL for MIX VOICE': { group: 'Mode' },
    'SYSTEM': {
      placeholders: { n: numbered(6, 'Setup') },
      groupOf: (at, row, block) => (at.n !== undefined ? `${QUICK[row.address[1][0]]} ${at.n + 1}` : block?.name ?? 'System'),
    },
    'MASTER KEYBOARD': { placeholders: { nn: numbered(4, 'Zone') }, groupOf: (at) => (at.nn !== undefined ? `Master Zone ${at.nn + 1}` : 'Master Common') },
    'PERFORMANCE COMMON': { groupOf: under('Performance', 'Common') },
    'PERFORMANCE PART': { placeholders: { pp: numbered(4, 'Part') }, groupOf: under('Performance', 'Part') },
    'SONG/PATTERN COMMON': { groupOf: under('Song/Pattern', 'Common') },
    'SONG/PATTERN PART': { placeholders: { pp: numbered(16, 'Part') }, groupOf: under('Song/Pattern', 'Part') },
    'NORMAL VOICE COMMON': { groupOf: under('Voice', 'Common') },
    'NORMAL VOICE ELEMENT': { placeholders: { ee: numbered(8, 'Element') }, groupOf: (at) => `Voice Element ${at.ee + 1}` },
    'DRUM VOICE COMMON': { groupOf: under('Drum', 'Common') },
    'DRUM VOICE KEY': { placeholders: { ee: { values: range(73), labels: range(73).map(noteName) } }, groupOf: (at) => `Drum Key ${noteName(at.ee)}` },
  },
  notes: [
    'Parameter changes at 40-42 (Normal Voice) and 46-47 (Drum Voice) edit the voice in the Voice mode\'s edit buffer; Pull asks for each edit buffer (Normal Voice, Drum Voice, Performance, Multi, Master), whichever mode the instrument is in.',
  ],
};
