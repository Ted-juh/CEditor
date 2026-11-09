// Oberheim OB-6. OB-6 Operation Manual 1.2, Appendix C: MIDI Implementation (PDF pages 93-96):
// Global Parameter Data, Program Parameter Data and Control NRPN Data. Written by Sequential and
// laid out like the Prophet-6's appendix, from which it was made.
//
// The Program table's last column repeats the global NRPNs 1024-1044 under shorter names (Tuning
// Fine for Master Fine Tune); the Global table is read first, so its names are the ones used.

const NRPN = /NRPN\s+(?:Range|Value)\s+Description/g;
const fields = ['nrpn', 'range', 'desc'];

export default {
  id: 'oberheim-ob-6',
  name: 'Oberheim OB-6',
  manufacturer: 'Oberheim',
  family: 'OB',
  description: 'Oberheim OB-6, every program and global parameter in its Operation Manual\'s NRPN tables.',
  document: {
    title: 'OB-6 Operation Manual',
    version: '1.2',
    file: 'OB-6-Operation-Manual-1.2.pdf',
    url: 'https://oberheim.com/files/downloads/OB-6/OB-6-Operation-Manual-1.2.pdf',
  },
  tables: [
    { id: 'global', header: NRPN, fields, pages: [93, 93], group: 'Global' },
    { id: 'program', header: NRPN, fields, pages: [94, 95] },
    { id: 'control', header: NRPN, fields, pages: [96, 96], group: 'Control' },
  ],
  // The Global table's footnotes (p83).
  marks: {
    '*': { note: 'The manual marks it: controller received, but not transmitted.' },
    '†': { note: 'The manual marks it: controller transmitted, but ignored when received.', readOnly: true },
  },
  // The globals, wherever printed: the Program table repeats them, and `Seq Jack` is one.
  globalNrpns: [1024, 1044],
  skip: [
    [/^Name \d+\s*-\s*\d+$/, 'the program name, one character per NRPN (32 - 125); CEditor cannot edit text over NRPN yet'],
  ],
  // No identity. The Device Inquiry reply (p86) prints the family code as 0010 1101 (2DH), which is
  // the Prophet-6's; every other SysEx message on the same pages addresses the OB-6 as 0010 1110
  // (2EH). Taken as printed, CEditor would take a Prophet-6 for an OB-6; taken from the other
  // messages, it would be a guess. The instrument's own reply will settle it.
  notes: [
    'No identity check: the manual\'s Device Inquiry reply prints the OB-6\'s family code as 2DH (the Prophet-6\'s), where every other SysEx message on the same pages uses 2EH. Which one the instrument sends has not been checked.',
  ],
  groups: [
    ['Oscillator $1', /^VCO ([12])\s+/],
    ['Oscillators', /^Detune$/],
    ['Cross Mod', /^X ?Mod\s+/],
    ['Mixer', /^Noise Level$/],
    ['Portamento', /^Portamento\s+/],
    ['Filter Envelope', /^Filter Env\s+/],
    ['Filter', /^Filter\s+/],
    ['Amp Envelope', /^Loudness Env\s+/],
    ['LFO', /^LFO\s+/],
    ['Aftertouch', /^Pressure\s+/],
    ['Effects', /^(FX\s+|Distortion Amt$)/],
    ['Arpeggiator', /^(Arp\s+|BPM$)/],
    ['Sequencer', /^Seq\s+/],
    ['Voice', /^(Program Volume|Pan Spread|Unison On\/Off|Unison Mode|Key Mode|Pbend Range)$/],
  ],
  presets: {
    // Bank Select is CC 32: 0 - 4 the user banks, 5 - 9 the factory banks (p80); Program Change
    // 0 - 99 within the bank (p79). The transmitted Bank Select (0 - 9, p81) agrees.
    banks: [
      ...[0, 1, 2, 3, 4].map((b) => ({ id: `user-${b}`, label: `User ${b}`, role: 'user', writable: false, startSlot: b * 100, slotCount: 100, programBase: 0, bankLsb: b })),
      ...[0, 1, 2, 3, 4].map((b) => ({ id: `factory-${b}`, label: `Factory ${b}`, role: 'factory', writable: false, startSlot: 500 + b * 100, slotCount: 100, programBase: 0, bankLsb: 5 + b })),
    ],
    recall: { kind: 'bankPc' },
  },
};
