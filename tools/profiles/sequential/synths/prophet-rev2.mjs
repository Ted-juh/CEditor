// Prophet Rev2. Prophet Rev2 User's Guide 1.2.4, Appendix E: MIDI Implementation (PDF pages
// 98-104): Global Parameter Data, and Program Parameter Data with layer A and layer B side by side.
//
// Two ranges in the Global table disagree with the labels printed under them: Sustain Polarity
// is printed 0-1 with four labels (0-3), MIDI Out Select 0-2 with four. Both keep the printed range,
// and their labels stay in the description. Bank Select is printed as "1 - 4 select user banks
// 1 - 4; 5 - 8 select factory banks" where the transmitted list says 0 - 9, so no preset recall
// is offered until an instrument settles which.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-prophet-rev2',
  name: 'Sequential Prophet Rev2',
  family: 'Prophet',
  description: "Sequential Prophet Rev2 (DSI), layers A and B, every program and global parameter in its User's Guide's NRPN tables.",
  document: {
    title: "Prophet Rev2 User's Guide",
    version: '1.2.4',
    file: 'Prophet-Rev2-Users-Guide-1.2.4.pdf',
    url: 'https://sequential.com/wp-content/uploads/2021/02/Prophet-Rev2-Users-Guide-1.2.4.pdf',
  },
  tables: [
    { id: 'global', header: /NRPN\s+Range\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [98, 98], group: 'Global' },
    { id: 'program', header: /NRPN\s+Layer\s+NRPN\s+Layer\s+Value\s+Description/g, fields: ['nrpn', 'nrpnB', 'range', 'desc'], pages: [99, 104] },
  ],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['2F', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
};
