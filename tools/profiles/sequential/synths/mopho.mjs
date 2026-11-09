// Mopho (desktop). Mopho Manual 1.2, MIDI Implementation (PDF pages 40-47): Global and Program
// Parameter Data under one header, with the dump position before each NRPN. NRPNs 384 and up are
// the globals.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-mopho',
  name: 'DSI Mopho',
  family: 'Mopho',
  manufacturer: 'Dave Smith Instruments',
  description: "Dave Smith Instruments Mopho, every voice and global parameter in its manual's NRPN tables.",
  document: {
    title: 'Mopho Manual',
    version: '1.2',
    file: 'Mopho_Manual_v.1.2.pdf',
    url: 'https://sequential.com/downloads/mopho/doc/Mopho_Manual_v.1.2.pdf',
  },
  tables: [
    { id: 'all', header: /Param\s+NRPN\s+Range\s+Description/g, fields: ['param', 'nrpn', 'range', 'desc'], pages: [40, 47] },
  ],
  labels: 'bare',
  explain: /^([^:;,]{2,48})(?:[:;]|,(?=\s*\d))\s*(.*)$/,
  globalNrpns: [384, 1023],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['25', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0-2 select banks 1-3; Program Change 0-127.
    banks: [
      { id: 'bank-1', label: 'Bank 1', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0, bankLsb: 0 },
      { id: 'bank-2', label: 'Bank 2', role: 'user', writable: false, startSlot: 128, slotCount: 128, programBase: 0, bankLsb: 1 },
      { id: 'bank-3', label: 'Bank 3', role: 'user', writable: false, startSlot: 256, slotCount: 128, programBase: 0, bankLsb: 2 },
    ],
    recall: { kind: 'bankPc' },
  },
};
