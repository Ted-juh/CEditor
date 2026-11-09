// Trigon-6. Trigon-6 MIDI Implementation 1.1 (PDF pages 7-10): Global Parameter Data, Program
// Parameter Data and Control NRPN Data. Its identity table prints the Trigon-6 ID as "0b11 1001",
// a misprint of 0011 1001 (39H): the "b" is not a bit.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-trigon-6',
  name: 'Sequential Trigon-6',
  family: 'Trigon',
  description: "Sequential Trigon-6, every program, global and control parameter in its MIDI Implementation's NRPN tables.",
  document: {
    title: 'Trigon-6 MIDI Implementation',
    version: '1.1',
    file: 'Trigon-6-MIDI-Implementation-1.1.pdf',
    url: 'https://sequential.com/wp-content/uploads/2022/12/Trigon-6-MIDI-Implementation-1.1.pdf',
  },
  tables: [
    { id: 'global', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [7, 7], group: 'Global' },
    { id: 'program', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [8, 9] },
    { id: 'control', header: /NRPN\s+(?:Range|Value)\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [10, 10], group: 'Control' },
  ],
  marks: {
    '*': { note: 'The manual marks it: received, but not transmitted.' },
    '†': { note: 'The manual marks it: transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^(?:Program )?Name(?: Char\w*)?\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['39', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0-4 user banks 0-4, 5-9 factory banks 0-4; Program Change 0-99.
    banks: [
      { id: 'user-1', label: 'User 1', role: 'user', writable: false, startSlot: 0, slotCount: 100, programBase: 0, bankLsb: 0 },
      { id: 'user-2', label: 'User 2', role: 'user', writable: false, startSlot: 100, slotCount: 100, programBase: 0, bankLsb: 1 },
      { id: 'user-3', label: 'User 3', role: 'user', writable: false, startSlot: 200, slotCount: 100, programBase: 0, bankLsb: 2 },
      { id: 'user-4', label: 'User 4', role: 'user', writable: false, startSlot: 300, slotCount: 100, programBase: 0, bankLsb: 3 },
      { id: 'user-5', label: 'User 5', role: 'user', writable: false, startSlot: 400, slotCount: 100, programBase: 0, bankLsb: 4 },
      { id: 'factory-1', label: 'Factory 1', role: 'factory', writable: false, startSlot: 500, slotCount: 100, programBase: 0, bankLsb: 5 },
      { id: 'factory-2', label: 'Factory 2', role: 'factory', writable: false, startSlot: 600, slotCount: 100, programBase: 0, bankLsb: 6 },
      { id: 'factory-3', label: 'Factory 3', role: 'factory', writable: false, startSlot: 700, slotCount: 100, programBase: 0, bankLsb: 7 },
      { id: 'factory-4', label: 'Factory 4', role: 'factory', writable: false, startSlot: 800, slotCount: 100, programBase: 0, bankLsb: 8 },
      { id: 'factory-5', label: 'Factory 5', role: 'factory', writable: false, startSlot: 900, slotCount: 100, programBase: 0, bankLsb: 9 },
    ],
    recall: { kind: 'bankPc' },
  },
};
