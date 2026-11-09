// Mopho Keyboard (and Mopho SE, whose manual prints the same tables and the Mopho Keyboard's
// identity). Mopho Keyboard Manual 1.1, MIDI Implementation (PDF pages 54-62).

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-mopho-keyboard',
  name: 'DSI Mopho Keyboard',
  family: 'Mopho',
  manufacturer: 'Dave Smith Instruments',
  description: "Dave Smith Instruments Mopho Keyboard and Mopho SE, every voice and global parameter in the manual's NRPN tables.",
  document: {
    title: 'Mopho Keyboard Manual',
    version: '1.1',
    file: 'MophoKey_Manual_v.1.1.pdf',
    url: 'https://sequential.com/downloads/mopho_keyboard/doc/MophoKey_Manual_v.1.1.pdf',
  },
  tables: [
    { id: 'all', header: /Param\s+NRPN\s+Range\s+Description/g, fields: ['param', 'nrpn', 'range', 'desc'], pages: [54, 62] },
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
  identity: { familyCode: ['27', '01'], modelNumber: ['00', '00'] },
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
