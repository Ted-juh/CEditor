// Mopho x4. Mopho x4 Operation Manual 1.0, MIDI Implementation (PDF pages 53-61).

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-mopho-x4',
  name: 'DSI Mopho x4',
  family: 'Mopho',
  manufacturer: 'Dave Smith Instruments',
  description: "Dave Smith Instruments Mopho x4, every voice and global parameter in its manual's NRPN tables.",
  document: {
    title: 'Mopho x4 Operation Manual',
    version: '1.0',
    file: 'Mopho_x4_Operation_Manual_v.1.0.pdf',
    url: 'https://sequential.com/downloads/mophox4/doc/Mopho_x4_Operation_Manual_v.1.0.pdf',
  },
  tables: [
    { id: 'all', header: /Param\s+NRPN\s+Range\s+Description/g, fields: ['param', 'nrpn', 'range', 'desc'], pages: [53, 61] },
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
  identity: { familyCode: ['29', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0-3 user banks 1-4, 4-7 factory banks 1-4; Program Change 0-127.
    banks: [
      { id: 'user-1', label: 'User 1', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0, bankLsb: 0 },
      { id: 'user-2', label: 'User 2', role: 'user', writable: false, startSlot: 128, slotCount: 128, programBase: 0, bankLsb: 1 },
      { id: 'user-3', label: 'User 3', role: 'user', writable: false, startSlot: 256, slotCount: 128, programBase: 0, bankLsb: 2 },
      { id: 'user-4', label: 'User 4', role: 'user', writable: false, startSlot: 384, slotCount: 128, programBase: 0, bankLsb: 3 },
      { id: 'factory-1', label: 'Factory 1', role: 'factory', writable: false, startSlot: 512, slotCount: 128, programBase: 0, bankLsb: 4 },
      { id: 'factory-2', label: 'Factory 2', role: 'factory', writable: false, startSlot: 640, slotCount: 128, programBase: 0, bankLsb: 5 },
      { id: 'factory-3', label: 'Factory 3', role: 'factory', writable: false, startSlot: 768, slotCount: 128, programBase: 0, bankLsb: 6 },
      { id: 'factory-4', label: 'Factory 4', role: 'factory', writable: false, startSlot: 896, slotCount: 128, programBase: 0, bankLsb: 7 },
    ],
    recall: { kind: 'bankPc' },
  },
};
