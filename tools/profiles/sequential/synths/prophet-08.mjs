// Prophet '08. Prophet '08 Manual 1.3, MIDI Implementation (PDF pages 49-57): Global Parameter Data
// (dump position, NRPN, an `x` where a global has none), and the voice parameters with layer A and
// layer B side by side. The identity reply's family MS byte is 00 here, where every later
// instrument's is 01; the Special Edition answers 24H in place of 23H.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-prophet-08',
  name: "DSI Prophet '08",
  family: 'Prophet',
  manufacturer: 'Dave Smith Instruments',
  description: "Dave Smith Instruments Prophet '08, layers A and B, every voice and global parameter in its manual's NRPN tables.",
  document: {
    title: "Prophet '08 Manual",
    version: '1.3',
    file: 'Prophet_08_Manual_v1.3.pdf',
    url: 'https://sequential.com/downloads/prophet_keyboard/doc/Prophet_08_Manual_v1.3.pdf',
  },
  tables: [
    { id: 'global', header: /Parm\s+NRPN\s+Range\s+Description/g, fields: ['param', 'nrpn', 'range', 'desc'], pages: [49, 50], group: 'Global' },
    { id: 'program', header: /^\s*A\s+B\s+Range\s+Description/gm, fields: ['nrpn', 'nrpnB', 'range', 'desc'], pages: [51, 57] },
  ],
  labels: 'bare',
  explain: /^([^:;,]{2,48})(?:[:;]|,(?=\s*\d))\s*(.*)$/,
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['23', '00'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0 and 1 select banks 1 and 2; Program Change 0-127.
    banks: [
      { id: 'bank-1', label: 'Bank 1', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0, bankLsb: 0 },
      { id: 'bank-2', label: 'Bank 2', role: 'user', writable: false, startSlot: 128, slotCount: 128, programBase: 0, bankLsb: 1 },
    ],
    recall: { kind: 'bankPc' },
  },
};
