// Yamaha MOTIF-RACK ES: the bulk dump blocks (p. 58) and the parameter change tables (pp. 59-73) of
// its data list, laid out as the MOTIF ES's (motif-es.mjs), and the MIDI data format from its owner's
// manual (pp. 96-98), which the data list does not print. A tone generator: no Master, two Plug-in
// Parts (pp 60-61), no A/D Parts.
import { esLayout } from './motif-es.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default esLayout({
  id: 'yamaha-motif-rack-es',
  name: 'Yamaha MOTIF-RACK ES',
  description: 'Yamaha MOTIF-RACK ES tone generator: every parameter change table of its data list (System, Performance, Normal Voice with its elements, Drum Voice with its keys, Plug-in Voice, Multi), and Pull from the edit buffers.',
  documents: [
    { title: 'MOTIF-RACK ES Owner’s Manual', file: 'motifrackes_en_om_b0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/6/334856/motifrackes_en_om_b0.pdf' },
    { title: 'MOTIF-RACK ES Data List', file: 'motifrackes_en2.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/3/333703/motifrackes_en2.pdf' },
  ],
  read: { doc: 1, formatDoc: 0, formatPages: [96, 97, 98], tablePages: range(15).map((i) => 59 + i), bulk: [{ page: 58, right: 310 }, { page: 58, left: 310 }] },
  zones: 0,
  plugins: 2,
  noPull: ['MASTER KEYBOARD'],
  tables: {
    // The data list heads the Plug-in Voice's Audition `46 06 00`, the Drum Voice's; its bulk dump
    // block table puts it at 4C 06 00.
    'PLUG-IN VOICE': { readdress: { '46 06': ['4C', '06'] } },
  },
});
