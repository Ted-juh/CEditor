// Yamaha S90 ES: the MIDI data format (pp. 57-58), the bulk dump blocks (p. 60) and the parameter
// change tables (pp. 61-77) of its data list, laid out as the MOTIF ES's (motif-es.mjs): the same
// tables at the same addresses, its Mix the Multi and its A/D Parts the Audio Input Parts.
import { esLayout } from './motif-es.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default esLayout({
  id: 'yamaha-s90-es',
  name: 'Yamaha S90 ES',
  description: 'Yamaha S90 ES synthesizer: every parameter change table of its data list (System, Master, Performance, Normal Voice with its elements, Drum Voice with its keys, Plug-in Voice, Multi), and Pull from the edit buffers.',
  document: { title: 'S90 ES Data List', file: 's90es_en2.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/0/333730/s90es_en2.pdf' },
  read: { formatPages: [57, 58], tablePages: range(17).map((i) => 61 + i), bulk: [{ page: 60, right: 310 }, { page: 60, left: 310 }] },
  input: 'Audio Input Part',
});
