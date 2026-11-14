// Yamaha reface YC: its pages of the reface Data List (format p. 15-16, tables p. 17-18).
import { REFACE_DOC, REFACE_NOTES } from './reface-cs.mjs';

export default {
  id: 'yamaha-reface-yc',
  name: 'Yamaha reface YC',
  family: 'reface',
  description: 'Yamaha reface YC combo organ: every parameter of its data list by parameter change, and Pull from its bulk dump.',
  documents: [REFACE_DOC],
  read: { formatPages: [15, 16], tablePages: [17, 18], bulk: { page: 17, left: 300 } },
  pullName: 'toneGenerator',
  notes: REFACE_NOTES,
};
