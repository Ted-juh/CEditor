// Moog Sub 37: the MIDI CC table (pp. 53-55) and the NRPN chart (pp. 56-59) of its manual, v1.1,
// which prints the same tables as the Subsequent 37's.
import { CC_TABLE, NRPN_CHART, NRPN_MISPRINTS, SUB37_NOTES, groupOf } from './subsequent-37.mjs';

export default {
  id: 'moog-sub-37',
  name: 'Moog Sub 37',
  family: 'Sub',
  description: 'Moog Sub 37 paraphonic analog synthesizer: the CC table and the NRPN chart of its manual.',
  documents: [{ title: 'Sub 37 Manual v1.1', file: 'SUB_37_MANUAL_v1.1_0.pdf', url: 'https://cdn.inmusicbrands.com/Moog/BackOffice/SUB_37_MANUAL_v1.1_0.pdf' }],
  tables: [{ ...CC_TABLE, pages: [53, 54, 55] }, { ...NRPN_CHART, pages: [56, 57, 58, 59] }],
  skip: NRPN_MISPRINTS,
  groupOf,
  notes: SUB37_NOTES,
};
