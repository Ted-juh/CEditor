// Yamaha MOTIF XF6/XF7/XF8: the MIDI data format (p. 125), the bulk dump blocks (p. 128) and the
// parameter change tables (pp. 129-146) of its data list, laid out in full (motif-family.mjs).
import { motifLayout, numbered } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
// The audio inputs: `00 pp 00`, `35 pp 00`, `39 pp 00`, pp = 40 (A/D) and 41 (FW).
const AUDIO = { pp: { values: [0x40, 0x41], labels: ['Audio Input (A/D)', 'Audio Input (FW)'] } };

export default motifLayout({
  id: 'yamaha-motif-xf',
  name: 'Yamaha MOTIF XF',
  description: 'Yamaha MOTIF XF6/XF7/XF8 workstation: every parameter change table of its data list (System, Master, Performance, Mixing, Normal Voice with its elements, Drum Voice with its keys), and Pull from the edit buffers.',
  document: { title: 'MOTIF XF6/MOTIF XF7/MOTIF XF8 Data List (C0)', file: 'motifxf_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/3/325083/motifxf_en_dl_c0.pdf' },
  inModeOnly: true,
  read: { formatPages: [125], tablePages: range(18).map((i) => 129 + i), bulk: [{ page: 128, right: 300 }, { page: 128, left: 300 }] },
  zones: 8,
  audio: { '00': AUDIO, 35: AUDIO, 39: AUDIO },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
  tables: {
    // The data list heads the Multi's Insertion B table `46 04 00` and the Drum Voice's Insertion L
    // table `40 05 00`; its base address table puts them at 36 04 00 and 46 05 00.
    'MULTI COMMON for Pattern, Song': { readdress: { '46 04': ['36', '04'] } },
    'DRUM VOICE COMMON': { readdress: { '40 05': ['46', '05'] } },
  },
});
