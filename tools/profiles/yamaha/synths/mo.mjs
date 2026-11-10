// Yamaha MO6/MO8: the MIDI data format (p. 60), the bulk dump blocks (p. 63) and the parameter change
// tables (pp. 64-77) of its data list, laid out in full (motif-family.mjs): four elements a voice.
import { motifLayout } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default motifLayout({
  id: 'yamaha-mo',
  name: 'Yamaha MO6/MO8',
  family: 'MO',
  description: 'Yamaha MO6/MO8 synthesizer: every parameter change table of its data list (System, Master, Performance, Multi, Normal Voice with its four elements, Drum Voice with its keys), and Pull from the edit buffers.',
  document: { title: 'MO6/MO8 Data List', file: 'mo6mo8_en_dl.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/3/334003/mo6mo8_en_dl.pdf' },
  read: { formatPages: [60], tablePages: range(14).map((i) => 64 + i), bulk: [{ page: 63, right: 300 }, { page: 63, left: 300 }] },
  zones: 4,
  elements: 4,
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model',
});
