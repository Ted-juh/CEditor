// Yamaha MOTIF6/MOTIF7/MOTIF8 (2001): the MIDI data format (pp. 45-46), the bulk dump blocks (p. 47)
// and the parameter change tables (pp. 47-59) of its data list, laid out as the MOTIF ES's
// (motif-es.mjs), its successor: the same tables at the same addresses, without the A/D Parts, and
// with the System's Sequencer Remote settings at 01 and 02 (a track each, tt 00-0F). Its messages carry
// the model ID 6B alone, where its successors carry 7F 00.
import { esLayout } from './motif-es.mjs';
import { numbered } from '../motif-family.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);

export default esLayout({
  id: 'yamaha-motif',
  name: 'Yamaha MOTIF',
  description: 'Yamaha MOTIF6/MOTIF7/MOTIF8 workstation (2001): every parameter change table of its data list (System with the Sequencer Remote, Master, Performance, Normal Voice with its elements, Drum Voice with its keys, Plug-in Voice, Mix), and Pull from the edit buffers.',
  document: { title: 'MOTIF6/MOTIF7/MOTIF8 Data List', file: 'MOTIFE2.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/7/318157/MOTIFE2.pdf' },
  read: { formatPages: [45, 46], tablePages: range(13).map((i) => 47 + i), bulk: [{ page: 47, right: 400 }, { page: 47, left: 400 }] },
  multi: { label: 'MIX', group: 'Mix' },
  placeholdersAt: { '02': { tt: numbered(16, 'Track') } },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model (7C 04 for the MOTIF6, 7D 04 for the MOTIF7, 7E 04 for the MOTIF8)',
});
