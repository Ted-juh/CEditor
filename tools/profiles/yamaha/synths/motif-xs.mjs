// Yamaha MOTIF XS6/XS7/XS8: the MIDI data format (p. 54), the bulk dump blocks (p. 57) and the
// parameter change tables (pp. 58-73) of its data list, laid out in full (motif-family.mjs).
import { motifLayout } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
// The audio inputs: `00 pp 00`, `35 pp 00`, `39 pp 00`, pp = 40 (A/D) and 41 (mLAN).
const AUDIO = { pp: { values: [0x40, 0x41], labels: ['Audio Input (A/D)', 'Audio Input (mLAN)'] } };

export default motifLayout({
  id: 'yamaha-motif-xs',
  name: 'Yamaha MOTIF XS',
  description: 'Yamaha MOTIF XS6/XS7/XS8 workstation: every parameter change table of its data list (System, Master, Performance, Mixing, Normal Voice with its elements, Drum Voice with its keys), and Pull from the edit buffers.',
  document: { title: 'MOTIF XS6/MOTIF XS7/MOTIF XS8 Data List (C0)', file: 'motifxs_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/4/335014/motifxs_en_dl_c0.pdf' },
  inModeOnly: true,
  read: { formatPages: [54], tablePages: range(16).map((i) => 58 + i), bulk: [{ page: 57, right: 300 }, { page: 57, left: 300 }] },
  zones: 8,
  audio: { '00': AUDIO, 35: AUDIO, 39: AUDIO },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
  tables: {
    // The data list heads the Drum Voice's Insertion L table `40 05 00`; it is 46 05 00.
    'DRUM VOICE COMMON': { readdress: { '40 05': ['46', '05'] } },
  },
});
