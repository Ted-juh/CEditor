// Yamaha reface CP: its pages of the reface Data List (format p. 11-12, tables p. 13).
import { REFACE_DOC, REFACE_NOTES } from './reface-cs.mjs';

export default {
  id: 'yamaha-reface-cp',
  name: 'Yamaha reface CP',
  family: 'reface',
  description: 'Yamaha reface CP electric piano: every parameter of its data list by parameter change, and Pull from its bulk dump.',
  documents: [REFACE_DOC],
  read: { formatPages: [11, 12], tablePages: [13], bulk: { page: 13, right: 300 } },
  pullName: 'toneGenerator',
  notes: REFACE_NOTES,
};
