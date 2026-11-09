// The Roland MC-909 sampling groovebox: which parts of its address map make up the edit buffer, and
// what to call them.
//
// Source: "MC-909 MIDI Implementation", version 1.00, Sep 20 2002 (maps/mc-909.json says which file,
// with its hash). Page numbers below are that document's.
//
// The MC-808 prints the same address map; the layout the two have in common, and what it leaves
// out, is in ../layouts/mc-808-909.mjs. This file is what is the MC-909's own: its two-byte model
// ID, identity, banks, printed example and the manual's slips.

import { NO_PULL, bankRun, banks, grooveboxBlocks, sharedCoverage, sharedNotes } from '../layouts/mc-808-909.mjs';

const LETTERS = 'ABCDEFG'.split('');

export default {
  id: 'roland-mc-909',
  name: 'Roland MC-909',
  family: 'MC',
  map: 'mc-909',
  deviceId: 0x10,
  description: 'Roland MC-909 sampling groovebox: the current pattern\'s part settings (effects, and the mixer of all sixteen parts), '
    + 'Part 1\'s temporary patch and rhythm set, the arpeggio style and the chord form, with the setup and system blocks, '
    + 'from the temporary (edit-buffer) area of the MIDI Implementation.',

  // p5, Identity Reply: F0 7E dev 06 02 41 59 01 00 00 00 03 00 00 F7 — family code 59 01, family
  // number 00 00; the message line and the byte table beneath it agree.
  identity: { familyCode: ['59', '01'], modelNumber: ['00', '00'] },

  blocks: grooveboxBlocks({ voiceReserve: true }),

  // p16, "Examples of system exclusive messages and calculating the checksum", <Example1>: Part
  // Info 10 00 00 00 + Part Info Common Reverb 00 06 00 + Reverb Type 00 00, set to SRV Room (02).
  // Its bytes carry the two-byte model ID 00 59, as the address map's heading (p7) and the RQ1 and
  // DT1 byte tables (p3, p5) do. <Example2> on the same page is an RQ1 for all of Part Info
  // (10 00 00 00, size 00 00 2F 0C), a request across sixteen blocks that no single dump here
  // parses, so it is not a parameter write and not checked.
  examples: [
    {
      name: 'Setting the REVERB to SRV Room (DT1)',
      where: 'p16',
      parameter: 'reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 59 12 10 00 06 00 02 68 F7',
    },
  ],

  // p1, the Bank Select table for Patches (MSB 81) and Rhythms (MSB 82), what a part holds. The
  // table elides Preset Patch LSB 66-69 with ":" between B (65) and G (70, programs 1-32), so each
  // is 128. SRX boards (MSB 92 Rhythm, 93 Patch) are "to see the SRX series owner's manual" and
  // print no LSBs or counts, so they are not listed.
  presets: {
    banks: banks([
      ['user-patch-1', 'User Patch 001-128', 'user', 81, 0, 128],
      ['user-patch-2', 'User Patch 129-256', 'user', 81, 1, 128],
      ['card-patch-1', 'Card Patch 001-128', 'user', 81, 32, 128],
      ['card-patch-2', 'Card Patch 129-256', 'user', 81, 33, 128],
      ...bankRun((i) => `preset-patch-${LETTERS[i].toLowerCase()}`, (i) => `Preset Patch ${LETTERS[i]}`, 'factory', 81, 64, 70, 128, 32),
      ['user-rhythm', 'User Rhythm 001-128', 'user', 82, 0, 128],
      ['card-rhythm', 'Card Rhythm 001-128', 'user', 82, 32, 128],
      ['preset-rhythm', 'Preset Rhythm 001-072', 'factory', 82, 64, 72],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...sharedCoverage({ rq1Page: 'p3' }),
    inboundControllers: 'not modelled: what the front panel transmits (Control Change, p4-5, and the Received/Transmitted Data List, p17) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    'Model ID 00 59: two bytes, as the address map heading ("MC-909 (Model ID = 00H 59H)", p7), the sentence on p3, the RQ1 and DT1 byte tables '
      + '(p3, p5) and the worked examples (p16) all print it.',
    'Presets list Patches (Bank Select MSB 81: User 0-1, Card 32-33, Preset A-G 64-70) and Rhythms (MSB 82: User 0, Card 32, Preset 64), p1, '
      + 'recalled on the profile\'s channel; SRX patches and rhythms (MSB 93 and 92) are not, the table giving no LSBs or counts for them.',
    'MFX Type is printed (0 - 38) in Part Info Common MFX1 (p8) and (0 - 47) in MFX2 (p9), and both carry the display line "0 - 63", which '
      + 'counts out to neither; both are kept as printed. The MC-808 prints (0 - 47) for both, with no display line.',
    'System Controller (p8) prints the D Beam Solo Synth\'s Bank MSB, LSB, PC and Note Number under "D Beam 1" and its Scale and Range under "D Beam 2"; '
      + 'they keep the names printed.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not hold is not answered (p3), and the startup read stops at the first request that is not.
  noPull: NO_PULL,
};
