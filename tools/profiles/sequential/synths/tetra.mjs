// Tetra. Tetra Manual 1.3, MIDI Implementation (PDF pages 57-63): Global Parameter Data, and the
// voice parameters with their dump position, layer A and layer B NRPNs side by side. Values are
// labelled bare (`0 Off`), and names explain themselves after a comma and a number.

import { SEQUENTIAL_GROUPS } from '../groups.mjs';

export default {
  id: 'sequential-tetra',
  name: 'DSI Tetra',
  family: 'Tetra',
  manufacturer: 'Dave Smith Instruments',
  description: "Dave Smith Instruments Tetra, layers A and B, every voice and global parameter in its manual's NRPN tables.",
  document: {
    title: 'Tetra Manual',
    version: '1.3',
    file: 'Tetra_Manual_v.1.3.pdf',
    url: 'https://sequential.com/downloads/tetra/doc/Tetra_Manual_v.1.3.pdf',
  },
  tables: [
    { id: 'global', header: /NRPN\s+Range\s+Description/g, fields: ['nrpn', 'range', 'desc'], pages: [57, 58], group: 'Global' },
    { id: 'program', header: /Parm\s+A\s+B\s+Range\s+Description/g, fields: ['param', 'nrpn', 'nrpnB', 'range', 'desc'], pages: [58, 63] },
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
  identity: { familyCode: ['26', '01'], modelNumber: ['00', '00'] },
  groups: SEQUENTIAL_GROUPS,
  presets: {
    // Bank Select on CC 32: 0-3 select banks 1-4; Program Change 0-127.
    banks: [
      { id: 'bank-1', label: 'Bank 1', role: 'user', writable: false, startSlot: 0, slotCount: 128, programBase: 0, bankLsb: 0 },
      { id: 'bank-2', label: 'Bank 2', role: 'user', writable: false, startSlot: 128, slotCount: 128, programBase: 0, bankLsb: 1 },
      { id: 'bank-3', label: 'Bank 3', role: 'user', writable: false, startSlot: 256, slotCount: 128, programBase: 0, bankLsb: 2 },
      { id: 'bank-4', label: 'Bank 4', role: 'user', writable: false, startSlot: 384, slotCount: 128, programBase: 0, bankLsb: 3 },
    ],
    recall: { kind: 'bankPc' },
  },
};
