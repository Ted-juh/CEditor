// Fourm. Fourm MIDI Implementation Document V1.1 (PDF pages 8-12): Program Parameter Data (NRPN,
// name, range), then Global Parameter Data and Control NRPN Data. Bank Select is printed as "1 - 2
// select user banks 1 - 2; 3 - 4 select factory banks" where the transmitted list says 0 - 9, so
// no preset recall is offered until an instrument settles which.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-fourm',
  name: 'Sequential Fourm',
  family: 'Fourm',
  description: "Sequential Fourm, every program, global and control parameter in its MIDI Implementation's NRPN tables.",
  document: {
    title: 'Fourm MIDI Implementation Document',
    version: '1.1',
    file: 'Fourm-MIDI-Implementation-Document_V1.1.pdf',
    url: 'https://sequential.com/wp-content/uploads/2025/12/Fourm-MIDI-Implementation-Document_V1.1.pdf',
  },
  tables: [
    { id: 'program', header: /NRPN#\s+Param\s+Range/g, fields: ['nrpn', 'name', 'range'], pages: [8, 10] },
    { id: 'global', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [11, 11], group: 'Global' },
    { id: 'control', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [12, 12], group: 'Control' },
  ],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['3B', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
};
