// Prophet-5 and Prophet-10 (Rev4). Prophet-5 MIDI Implementation 1.4 (PDF pages 8-10): Control NRPN
// Data, printed name first. The document's Bank Select and Program Change lines disagree with
// each other (banks "1 - 5" and "6 - 9", programs "0-39 for Programs 0-7 within Bank 1, …"), so no
// preset recall is offered until an instrument settles it.
//
// Its Device Inquiry reply prints the family code as 33H where its other SysEx messages use 31H.
// The identity is kept as printed: 33H is nobody else's. The OB-X8's chapter, made from this one,
// prints the same two numbers, and that profile does without an identity (see ob-x8.mjs).

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-prophet-5',
  name: 'Sequential Prophet-5/10',
  family: 'Prophet',
  description: "Sequential Prophet-5 and Prophet-10 (Rev4), every parameter in their MIDI Implementation's NRPN tables.",
  document: {
    title: 'Prophet-5 MIDI Implementation',
    version: '1.4',
    file: 'Prophet-5-MIDI-Implementation-1.4.pdf',
    url: 'https://sequential.com/wp-content/uploads/2021/03/Prophet-5-MIDI-Implementation-1.4.pdf',
  },
  tables: [
    { id: 'control', header: /Name\s+NRPN\s+Range/g, fields: ['name', 'nrpn', 'range'], pages: [8, 10] },
  ],
  // One table holds the program parameters and, from NRPN 4096, the globals.
  globalNrpns: [4096, 4191],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['33', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
};
