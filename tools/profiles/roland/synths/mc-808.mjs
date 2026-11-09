// The Roland MC-808 sampling groovebox: which parts of its address map make up the edit buffer, and
// what to call them.
//
// Source: "MC-808 MIDI Implementation", version 1.00, Dec 14 2006 (maps/mc-808.json says which
// file, with its hash). Page numbers below are that document's.
//
// The MC-808 prints the MC-909's address map with a few rows changed; the layout the two have in
// common, and what it leaves out, is in ../layouts/mc-808-909.mjs. This file is what is the
// MC-808's own: its three-byte model ID, identity, banks, printed example and the manual's slips.

import { NO_PULL, bankRun, banks, grooveboxBlocks, numberedLabel, sharedCoverage, sharedNotes } from '../layouts/mc-808-909.mjs';

const LETTERS = 'ABCDEFGH'.split('');
const lettered = (prefix) => (i) => `${prefix} ${LETTERS[i]}`;
const letteredId = (prefix) => (i) => `${prefix}-${LETTERS[i].toLowerCase()}`;
const numberedId = (prefix) => (i) => `${prefix}-${i + 1}`;

export default {
  id: 'roland-mc-808',
  name: 'Roland MC-808',
  family: 'MC',
  map: 'mc-808',
  deviceId: 0x10,
  description: 'Roland MC-808 sampling groovebox: the current pattern\'s part settings (effects, and the mixer of all sixteen parts), '
    + 'Part 1\'s temporary patch and rhythm set, the arpeggio style and the chord form, with the setup and system blocks, '
    + 'from the temporary (edit-buffer) area of the MIDI Implementation.',

  // p5, Identity Reply: F0 7E dev 06 02 41 14 02 00 00 00 03 00 00 F7 — family code 14 02, family
  // number 00 00; the message line and the byte table beneath it agree.
  identity: { familyCode: ['14', '02'], modelNumber: ['00', '00'] },

  // Part Info Common (the sixteen voice reserves, 10 00 00 00) is marked <*> row by row (p8):
  // ignored when received, so the block has nothing to lay out.
  blocks: grooveboxBlocks({ voiceReserve: false }),

  // p17, "Examples of system exclusive messages and calculating the checksum", <Example1>: Part
  // Info 10 00 00 00 + Part Info Common Reverb 00 06 00 + Reverb Type 00 00, set to SRV Room (02),
  // with the three-byte model ID 00 00 14. <Example2> on the same page is an RQ1 for all of Part
  // Info (10 00 00 00, size 00 00 2F 0C), a request across sixteen blocks that no single dump here
  // parses, so it is not a parameter write and not checked.
  examples: [
    {
      name: 'Setting the REVERB to SRV Room (DT1)',
      where: 'p17',
      parameter: 'reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 14 12 10 00 06 00 02 68 F7',
    },
  ],

  // p1, the Bank Select table: Patches (MSB 81), Rhythms (MSB 82) and Sample Patches (MSB 64 user,
  // 65 card), what a part holds. The manual lists no preset (ROM) bank. Its ":" runs are filled in
  // by LSB: User Patch A-H 0-7 and Card Patch A-H 32-39, 128 each; User Sample Patch 0-15
  // (0001-2000, the last 80) and Card Sample Patch 0-54 (0001-7000, the last 88), which close on
  // the numbers printed.
  presets: {
    banks: banks([
      ...bankRun(letteredId('user-patch'), lettered('User Patch'), 'user', 81, 0, 7, 128),
      ...bankRun(letteredId('card-patch'), lettered('Card Patch'), 'user', 81, 32, 39, 128),
      ...bankRun(letteredId('user-rhythm'), lettered('User Rhythm'), 'user', 82, 0, 1, 128),
      ...bankRun(letteredId('card-rhythm'), lettered('Card Rhythm'), 'user', 82, 32, 33, 128),
      ...bankRun(numberedId('user-sample-patch'), numberedLabel('User Sample Patch', 4, 2000), 'user', 64, 0, 15, 128, 80),
      ...bankRun(numberedId('card-sample-patch'), numberedLabel('Card Sample Patch', 4, 7000), 'user', 65, 0, 54, 128, 88),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...sharedCoverage({ rq1Page: 'p4' }),
    voiceReserve: 'not laid out: every row of Part Info Common (10 00 00 00, Voice Reserve 1-16, p8) is marked <*>, ignored when received',
    inboundControllers: 'not modelled: what the front panel transmits (Data Transmission, p4-6, and the Received/Transmitted Data List, p18) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    'Model ID 00 00 14, as the address map heading ("MC-808 (ModelID = 00H 00H 14H)", p7), the sentence and the RQ1 and DT1 byte tables (p4, p5) '
      + 'and the worked examples (p17) all print it.',
    'Part Info Common (10 00 00 00, p8): Voice Reserve 1-16 are each printed with <*>, ignored when the MC-808 receives them, so the block is not laid out. '
      + 'The MC-909 prints the same sixteen rows without the mark.',
    'Presets list Patches (Bank Select MSB 81: User A-H 0-7, Card A-H 32-39), Rhythms (MSB 82: User A-B 0-1, Card A-B 32-33) and Sample Patches '
      + '(MSB 64 User 0-15, MSB 65 Card 0-54), p1, recalled on the profile\'s channel. The table names the bank at MSB 81 LSB 39 "User Patch H"; '
      + 'it closes the Card Patch run (Card Patch A 32, B 33, …), so it is listed here as Card Patch H.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not hold is not answered (p4), and the startup read stops at the first request that is not.
  noPull: NO_PULL,
};
