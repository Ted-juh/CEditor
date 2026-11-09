// Oberheim TEO-5. TEO-5 MIDI Implementation Document v2 (PDF pages 8-12): Program Parameter Data
// (NRPN number first), Global Parameter Data and Control NRPN Data.
//
// The TEO-5 is the first of these instruments to answer to its own manufacturer ID: 0000 0010,
// "Oberheim ID", printed the same way in every SysEx message, where the others answer as DSI (01).

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

const NRPN = /NRPN\s+(?:Range|Value)\s+Description/g;

export default {
  id: 'oberheim-teo-5',
  name: 'Oberheim TEO-5',
  manufacturer: 'Oberheim',
  family: 'TEO',
  description: 'Oberheim TEO-5, every program and global parameter in its MIDI Implementation\'s NRPN tables.',
  document: {
    title: 'TEO-5 MIDI Implementation Document',
    version: '2',
    file: 'TEO-5-MIDI-Implementation-Document_v2.pdf',
    url: 'https://oberheim.com/wp-content/uploads/2025/07/TEO-5-MIDI-Implementation-Document_v2.pdf',
  },
  tables: [
    { id: 'global', header: NRPN, fields: ['nrpn', 'range', 'desc'], pages: [11, 11], group: 'Global' },
    { id: 'program', header: /NRPN#\s+Param\s+Range/g, fields: ['nrpn', 'name', 'range'], pages: [8, 10] },
    { id: 'control', header: NRPN, fields: ['nrpn', 'range', 'desc'], pages: [12, 12], group: 'Control' },
  ],
  // The globals, wherever a name would group them (Pressure Curve, Arp Beat Sync).
  globalNrpns: [4096, 4122],
  // The Global table's footnotes (p11).
  marks: {
    '*': { note: 'The manual marks it: controller received, but not transmitted.' },
    '†': { note: 'The manual marks it: controller transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^Filter (Cutoff|State) MSB$/, 'the high bits of Filter Cutoff (34) and Filter State (38), which those NRPNs already carry whole; the manual does not say when the halves are sent on their own'],
  ],
  identity: { manufacturerId: ['02'], familyCode: ['5A', '01'], modelNumber: ['00', '00'] },
  // No preset recall. Bank Select received is "1 - 4 select user banks 1 - 4; 5 - 8 select factory
  // banks 1 - 4; 9 - 12 select add-on banks 1 - 4" and transmitted "0 - 9" (p5); a program dump
  // request takes "Bank Number, 0 - 15" (p13). Which numbering the instrument answers to is not
  // settled by the document.
  notes: [
    'Identity as printed: manufacturer 02 ("Oberheim ID") and family 5AH 01H, the same in every SysEx message of the document. Not yet checked against the instrument.',
    'No preset recall: the document numbers banks three ways (Bank Select received 1 - 12, transmitted 0 - 9, a program dump request 0 - 15).',
    'The Program table is headed "program parameters 0-352" and prints NRPNs 1 - 187.',
  ],
  descriptions: {
    36: 'The manual prints the range as 0-265; kept as printed.',
    4096: 'Printed as 0-100, and Master Fine Tune (4097) as 0-24: the other way round from the OB-6 and Prophet-6, whose coarse tune is 0-24. Kept as printed.',
    4097: 'Printed as 0-24, and Master Coarse Tune (4096) as 0-100: the other way round from the OB-6 and Prophet-6. Kept as printed.',
  },
  groups: [
    ['Mixer', /^(Sub Osc On|Noise On|Noise Type)$/],
    ['Oscillators', /^X-Mod Amount$/],
    ['Envelopes', /^Env (Routes|Repeat)$/],
    ['Voice', /^(Pitch Bend Rng (Up|Dn)|Scale|Key Split( 2| Note)?)$/],
    ...SEQUENTIAL_GROUPS,
  ],
};
