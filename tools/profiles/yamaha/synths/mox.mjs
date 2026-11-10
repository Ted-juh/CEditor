// Yamaha MOX6/MOX8: the MIDI data format (p. 102), the bulk dump blocks (p. 105) and the parameter
// change tables (pp. 106-126) of its data list, laid out in full (motif-family.mjs), as the MOXF's.
import { motifLayout, numbered } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
// `00 4n 00`, `35 4n 00`, `39 4n 00`: the audio part, n = 0. `00 5n 00` a Quick Setup, `00 6n 00` and
// `00 7n 00` its audio and MIDI configs, six of each.
const AUDIO = { n: { values: [0], labels: ['Audio Part (A/D)'] } };
const QUICK = { 5: 'Quick Setup', 6: 'Quick Setup Audio Config', 7: 'Quick Setup MIDI Config' };

export default motifLayout({
  id: 'yamaha-mox',
  name: 'Yamaha MOX',
  family: 'MOX',
  description: 'Yamaha MOX6/MOX8 synthesizer: every parameter change table of its data list (System, Master, Performance, Song/Pattern mixing, Normal Voice with its elements, Drum Voice with its keys), and Pull from the edit buffers.',
  document: { title: 'MOX6/MOX8 Data List (C0)', file: 'mox6mox8_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/4/325084/mox6mox8_en_dl_c0.pdf' },
  read: { formatPages: [102], tablePages: range(21).map((i) => 106 + i), bulk: [{ page: 105, right: 300 }, { page: 105, left: 300 }] },
  zones: 4,
  multi: { label: 'SONG/PATTERN', group: 'Song/Pattern' },
  audio: { '00 4n': AUDIO, '35 4n': AUDIO, '39 4n': AUDIO, '00 5n': { n: numbered(6, 'Setup') }, '00 6n': { n: numbered(6, 'Config') }, '00 7n': { n: numbered(6, 'Config') } },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
  tables: {
    'SYSTEM': { groupOf: (at, row, block) => (/^[567]n$/.test(row.address[1]) ? `${QUICK[row.address[1][0]]} ${at.n + 1}` : /^4n$/.test(row.address[1]) ? 'System Audio Part (A/D)' : block?.name ?? 'System') },
  },
});
