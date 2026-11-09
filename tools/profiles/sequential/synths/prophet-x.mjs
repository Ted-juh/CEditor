// Prophet X and XL. Prophet X User's Guide 1.3, Appendix E: MIDI Implementation (PDF pages 81-84): Global Parameter Data, Program Parameter Data and Control NRPN Data.
// The program tables are printed as two-page spreads, each with layer A and layer B NRPNs, then the
// name, then the range (under headers that read "Value" and "Description" the other way round).
// Bank Select is printed as "1 - 4 select user banks 1 - 4; 5 - 8 select factory banks" where the
// transmitted list says 0 - 9, so no preset recall is offered until an instrument settles which.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-prophet-x',
  name: 'Sequential Prophet X/XL',
  family: 'Prophet',
  description: "Sequential Prophet X and XL, layers A and B, every program and global parameter in their User's Guide's NRPN tables.",
  document: {
    title: "Prophet X User's Guide",
    version: '1.3',
    file: 'Prophet-X-Users-Guide-1.3.pdf',
    url: 'https://sequential.com/wp-content/uploads/2021/02/Prophet-X-Users-Guide-1.3.pdf',
  },
  tables: [
    { id: 'global', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [81, 81], group: 'Global' },
    { id: 'program', header: /NRPN\s+NRPN\s+Value\s+De-/g, fields: ['nrpn', 'nrpnB', 'name', 'range'], pages: [82, 83] },
    { id: 'control', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [84, 84], group: 'Control' },
  ],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['30', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
};
