// The Roland RD-2000: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-2000 MIDI Implementation", version 1.01, January 1 2018, 17 pages (maps/rd-2000.json
// says which file, with its hash). Page numbers below are that document's: the received RQ1/DT1
// p5, the Identity Reply and the transmitted DT1 p8, the Parameter Address Map p9-14, the worked
// examples p16.
//
// The RD-2000 is a stage piano whose sound is a Program of eight zones, each an internal zone (a
// tone, with the piano's, e.piano's and organ's modify parameters beside it) and an external zone
// (what it sends out), zones 1-4 with a Modulation FX and a Tremolo/Amp Simulator, under one delay,
// one reverb and a common block. Its address map (p9):
//
//   00 00 00 00  System                common, compressor
//   10 00 00 00  Program (Temporary)   common, song/rhythm, delay, reverb; per zone 1-4 a Modulation
//                                      FX and a Tremolo/Amp Simulator; per zone 1-8 an Internal Zone
//                                      and an External Zone
//
// all of which is laid out here: the whole map. The layout is shared with the RD-2000EX (whose
// manual prints the same tables) and the RD-800 in layouts/rd-2000-800.mjs.

import {
  RD2000_ZONES, commonResonanceNote, editBufferBlocks, rd2000Notes, sharedCoverage, systemBlocks,
} from '../layouts/rd-2000-800.mjs';

export default {
  id: 'roland-rd-2000',
  name: 'Roland RD-2000',
  family: 'RD',
  map: 'rd-2000',
  deviceId: 0x10,
  description: 'Roland RD-2000 stage piano: the temporary Program (common, song/rhythm, delay, reverb, an internal and an external '
    + 'zone for each of zones 1-8, and a Modulation FX and Tremolo/Amp Simulator for zones 1-4) and the system blocks (common, '
    + 'compressor), from the MIDI Implementation.',

  // p8, Identity Reply: F0 7E dev 06 02 41 75 02 00 01 00 01 00 00 F7 — family code 75 02, family
  // number code 00 01, software revision 00 01 00 00. The message line and the byte table agree.
  // The RD-2000EX's reply (its manual, p8) differs only in the revision (01 01 00 00), which
  // profiles do not pin, so the two answer alike; the RD-800's family number is 00 00.
  identity: { familyCode: ['75', '02'], modelNumber: ['00', '01'] },

  blocks: [
    ...systemBlocks({ vLink: false }),
    ...editBufferBlocks({ unit: 'Program', word: 'Zone', zones: RD2000_ZONES, commonId: 'program' }),
  ],

  // The manual's worked DT1 (p16, "Example of an Exclusive Message and Calculating a Checksum"):
  // Delay Type of the Program set to DELAY→TREMOLO (03; the arrow prints as "0"), at Temporary
  // Program 10 00 00 00 + Delay 04 00 + 00 02. The byte diagram prints F0 41 10 00 00 75 12 10 00 04
  // 02 03 ?? F7 and works the checksum out beneath it as 67H; the summary line under that, "F0 41 10
  // 00 75 12 10 00 04 02 03 67 F7", drops one 00 of the model id. The bytes here are the diagram's
  // with the page's checksum.
  examples: [
    {
      name: 'Setting DELAY TYPE to DELAY→TREMOLO (DT1)',
      where: 'p16',
      parameter: 'delay.type',
      value: 3,
      expectedHex: 'F0 41 10 00 00 75 12 10 00 04 02 03 67 F7',
    },
  ],

  coverage: {
    ...sharedCoverage,
    inboundControllers: 'not modelled: what the front panel and the external zones transmit (Control Change, p6-7) is not mapped yet',
  },
  notes: [
    'One identity for the RD-2000 and the RD-2000EX: both reply family 75 02, number 00 01 (p8 of each manual), the RD-2000 with '
      + 'revision 00 01 00 00 and the RD-2000EX with 01 01 00 00. Profiles do not pin the revision, so choosing either profile for the '
      + 'other is not flagged; the two maps are the same.',
    ...rd2000Notes,
    commonResonanceNote('Program', 'program', 'p10-11'),
  ],
};
