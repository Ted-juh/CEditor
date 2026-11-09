// Prophet-6. Prophet-6 Operation Manual 2.1, Appendix C: MIDI Implementation (PDF pages 88-91):
// Global Parameter Data, Program Parameter Data and Control NRPN Data.
//
// The Program table's last column repeats the global NRPNs 1024-1044 under shorter names (Tuning
// Fine for Master Fine Tune); the Global table is read first, so its names are the ones used.

const NRPN = /NRPN\s+(?:Range|Value)\s+Description/g;
const fields = ['nrpn', 'range', 'desc'];

export default {
  id: 'sequential-prophet-6',
  name: 'Sequential Prophet-6',
  family: 'Prophet',
  description: 'Sequential Prophet-6, every program and global parameter in its Operation Manual\'s NRPN tables.',
  document: {
    title: 'Prophet-6 Operation Manual',
    version: '2.1',
    file: 'Prophet-6-Operation-Manual-2.1.pdf',
    url: 'https://sequential.com/wp-content/uploads/2021/02/Prophet-6-Operation-Manual-2.1.pdf',
  },
  tables: [
    { id: 'global', header: NRPN, fields, pages: [88, 88], group: 'Global' },
    { id: 'program', header: NRPN, fields, pages: [89, 90] },
    { id: 'control', header: NRPN, fields, pages: [91, 91], group: 'Control' },
  ],
  // The Global table's footnotes (p77).
  marks: {
    '*': { note: 'The manual marks it: controller received, but not transmitted.' },
    '†': { note: 'The manual marks it: controller transmitted, but ignored when received.', readOnly: true },
  },
  skip: [
    [/^Name \d+\s*-\s*\d+$/, 'the program name, one character per NRPN (32 - 125); CEditor cannot edit text over NRPN yet'],
  ],
  identity: { familyCode: ['2D', '01'], modelNumber: ['00', '00'] },
  groups: [
    ['Oscillator 1', /^Osc 1\s+/],
    ['Oscillator 2', /^Osc 2\s+/],
    ['Mixer', /^(Noise Level|Slop)$/],
    ['Glide', /^Glide\s+/],
    ['Low-pass Filter', /^Low-pass\s+/],
    ['High-pass Filter', /^High-pass\s+/],
    ['VCA Envelope', /^VCA Env\s+/],
    ['Filter Envelope', /^Filter Env\s+/],
    ['LFO', /^LFO\s+/],
    ['Aftertouch', /^Pressure\s+/],
    ['Poly Mod', /^Poly ?Mod\s+/],
    ['Effects', /^(FX\s+|Distortion Amt$)/],
    ['Arpeggiator', /^(Arp\s+|BPM$)/],
    ['Sequencer', /^Seq\s+/],
    ['Voice', /^(Voice Volume|Pan Spread|Unison On\/Off|Unison Mode|Key Mode|Pbend Range)$/],
  ],
  presets: {
    // Bank Select is CC 32: 0 - 4 the user banks, 5 - 9 the factory banks (p73); Program Change
    // 0 - 99 within the bank (p72).
    banks: [
      ...[0, 1, 2, 3, 4].map((b) => ({ id: `user-${b}`, label: `User ${b}`, role: 'user', writable: false, startSlot: b * 100, slotCount: 100, programBase: 0, bankLsb: b })),
      ...[0, 1, 2, 3, 4].map((b) => ({ id: `factory-${b}`, label: `Factory ${b}`, role: 'factory', writable: false, startSlot: 500 + b * 100, slotCount: 100, programBase: 0, bankLsb: 5 + b })),
    ],
    recall: { kind: 'bankPc' },
  },
};
