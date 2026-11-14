// Yamaha MOTIF-RACK XS: the MIDI data format (p. 60), the bulk dump blocks (p. 63) and the parameter
// change tables (pp. 64-75) of its data list, laid out in full (motif-family.mjs). A tone generator:
// no Master or Performance mode.
import { motifLayout } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const AUDIO = { pp: { values: [0x41], labels: ['Audio Input (mLAN)'] } };

export default motifLayout({
  id: 'yamaha-motif-rack-xs',
  name: 'Yamaha MOTIF-RACK XS',
  description: 'Yamaha MOTIF-RACK XS tone generator: every parameter change table of its data list (System, Multi, Normal Voice with its elements, Drum Voice with its keys), identity, and Pull from the edit buffers.',
  document: { title: 'MOTIF-RACK XS Data List (C0)', file: 'motifrackxs_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/2/336012/motifrackxs_en_dl_c0.pdf' },
  inModeOnly: true,
  read: { formatPages: [60], tablePages: range(12).map((i) => 64 + i), bulk: [{ page: 63, right: 300 }, { page: 63, left: 300 }] },
  audio: { '00': AUDIO, 39: AUDIO },
  noPull: ['MASTER KEYBOARD', 'PERFORMANCE'],
});
