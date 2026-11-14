// Yamaha reface DX: its pages of the reface Data List (format p. 6-7, tables p. 8-9).
import { REFACE_DOC, REFACE_NOTES } from './reface-cs.mjs';

export default {
  id: 'yamaha-reface-dx',
  name: 'Yamaha reface DX',
  family: 'reface',
  description: 'Yamaha reface DX FM synthesizer: every parameter of its data list by parameter change, the four operators each, and Pull from its bulk dump.',
  documents: [REFACE_DOC],
  read: { formatPages: [6, 7], tablePages: [8, 9], bulk: { page: 8, left: 300 } },
  pullName: 'voice',
  notes: REFACE_NOTES,
};
