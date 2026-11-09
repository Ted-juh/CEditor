// Take 5. Take 5 MIDI Implementation V2 (PDF pages 10-13): Control NRPN Data, printed name first.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-take-5',
  name: 'Sequential Take 5',
  family: 'Take',
  description: "Sequential Take 5, every parameter in its MIDI Implementation's NRPN tables.",
  document: {
    title: 'Take 5 MIDI Implementation',
    version: 'V2',
    file: 'Take-5-MIDI-Implementation_V2.pdf',
    url: 'https://sequential.com/wp-content/uploads/2025/07/Take-5-MIDI-Implementation_V2.pdf',
  },
  tables: [
    { id: 'control', header: /Name\s+NRPN\s+Range/g, fields: ['name', 'nrpn', 'range'], pages: [10, 13] },
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
  identity: { familyCode: ['35', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0-7 user banks 1-8, 8-15 factory banks 1-8; Program Change for programs 1-16 of the bank.
    banks: [
      { id: 'user-1', label: 'User 1', role: 'user', writable: false, startSlot: 0, slotCount: 16, programBase: 0, bankLsb: 0 },
      { id: 'user-2', label: 'User 2', role: 'user', writable: false, startSlot: 16, slotCount: 16, programBase: 0, bankLsb: 1 },
      { id: 'user-3', label: 'User 3', role: 'user', writable: false, startSlot: 32, slotCount: 16, programBase: 0, bankLsb: 2 },
      { id: 'user-4', label: 'User 4', role: 'user', writable: false, startSlot: 48, slotCount: 16, programBase: 0, bankLsb: 3 },
      { id: 'user-5', label: 'User 5', role: 'user', writable: false, startSlot: 64, slotCount: 16, programBase: 0, bankLsb: 4 },
      { id: 'user-6', label: 'User 6', role: 'user', writable: false, startSlot: 80, slotCount: 16, programBase: 0, bankLsb: 5 },
      { id: 'user-7', label: 'User 7', role: 'user', writable: false, startSlot: 96, slotCount: 16, programBase: 0, bankLsb: 6 },
      { id: 'user-8', label: 'User 8', role: 'user', writable: false, startSlot: 112, slotCount: 16, programBase: 0, bankLsb: 7 },
      { id: 'factory-1', label: 'Factory 1', role: 'factory', writable: false, startSlot: 128, slotCount: 16, programBase: 0, bankLsb: 8 },
      { id: 'factory-2', label: 'Factory 2', role: 'factory', writable: false, startSlot: 144, slotCount: 16, programBase: 0, bankLsb: 9 },
      { id: 'factory-3', label: 'Factory 3', role: 'factory', writable: false, startSlot: 160, slotCount: 16, programBase: 0, bankLsb: 10 },
      { id: 'factory-4', label: 'Factory 4', role: 'factory', writable: false, startSlot: 176, slotCount: 16, programBase: 0, bankLsb: 11 },
      { id: 'factory-5', label: 'Factory 5', role: 'factory', writable: false, startSlot: 192, slotCount: 16, programBase: 0, bankLsb: 12 },
      { id: 'factory-6', label: 'Factory 6', role: 'factory', writable: false, startSlot: 208, slotCount: 16, programBase: 0, bankLsb: 13 },
      { id: 'factory-7', label: 'Factory 7', role: 'factory', writable: false, startSlot: 224, slotCount: 16, programBase: 0, bankLsb: 14 },
      { id: 'factory-8', label: 'Factory 8', role: 'factory', writable: false, startSlot: 240, slotCount: 16, programBase: 0, bankLsb: 15 },
    ],
    recall: { kind: 'bankPc' },
  },
};
