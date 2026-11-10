// Yamaha S90 XS/S70 XS: the MIDI data format (p. 100), the bulk dump blocks (p. 103) and the
// parameter change tables (pp. 104-125) of its data list, laid out in full (motif-family.mjs).
import { motifLayout, numbered } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const AUDIO = { pp: { values: [0x40], labels: ['Audio Input (A/D)'] } };

export default motifLayout({
  id: 'yamaha-s90xs',
  name: 'Yamaha S90 XS/S70 XS',
  family: 'S XS',
  description: 'Yamaha S90 XS/S70 XS synthesizer: every parameter change table of its data list (System, Master, Performance, Multi, Normal Voice with its elements, Drum Voice with its keys), and Pull from the edit buffers.',
  document: { title: 'S90 XS/S70 XS Data List (C0)', file: 's90xs_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/7/335817/s90xs_en_dl_c0.pdf' },
  inModeOnly: true,
  read: { formatPages: [100], tablePages: range(22).map((i) => 104 + i), bulk: [{ page: 103, right: 300 }, { page: 103, left: 300 }] },
  zones: 4,
  // `00 6n 00`: Quick Setup 1 – 3.
  audio: { '00': AUDIO, 35: AUDIO, 39: AUDIO, '00 6n': { n: numbered(3, 'Quick Setup') } },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
});
