// The Roland JUNO-D6, JUNO-D7 and JUNO-D8: which parts of their address map make up the edit
// buffer, and what to call them. One profile covers all three: one manual, one address map, one
// model ID, and one Identity Reply but for its software-revision bytes.
//
// Source: "JUNO-D6/D7/D8 MIDI Implementation" (Model: JUNO-D), version 1.10, Sep 24 2024
// (maps/juno-d6.json says which file, with its hash). Page numbers below are that document's:
// Bank Select p1-2, the RQ1/DT1 tables p9-10, Identity Reply p14-15, the Parameter Address Map
// p15-122, the worked DT1 example p124-125.
//
// The layout is the family's (../layouts/juno-d6-xps-60.mjs, with the XPS-10X and XPS-60): the
// temporary scene, part 1's tone, the rhythm part's drum kit, and the system blocks.

import {
  banks, familyBlocks, NO_PULL, noPullReason, sceneBank, sharedCoverage, sharedNotes,
} from '../layouts/juno-d6-xps-60.mjs';

const PAGES = { scenePage: 16, instPage: 17, pmtPage: 104, rq1Page: 9 };

export default {
  id: 'roland-juno-d6',
  name: 'Roland JUNO-D6/D7/D8',
  family: 'JUNO',
  map: 'juno-d6',
  deviceId: 0x10,
  description: 'Roland JUNO-D6, JUNO-D7 and JUNO-D8 synthesizers (one address map): the temporary scene (common, IFX, chorus, '
    + 'reverb, vocoder, arpeggio, and the Part, EQ, MFX, Zone and Arpeggio blocks of parts 1, 2 and R), part 1\'s temporary '
    + 'tone (four partials with envelopes, LFOs, EQs and the synth layer), the rhythm part\'s drum kit with all 88 keys, '
    + 'and the system settings.',

  // p14-15, Identity Reply, printed once per model: F0 7E dev 06 02 41 0A 05 00 00 dd 03 00 00 F7,
  // dd = 00 (JUNO-D6), 01 (JUNO-D7), 02 (JUNO-D8). Family code 0A 05, family number code 00 00 for
  // all three; the status line and the byte table agree on each. The model is told apart only in
  // the software-revision bytes, so one profile answers to all three.
  identity: { familyCode: ['0A', '05'], modelNumber: ['00', '00'] },

  blocks: familyBlocks({ vocoder: true }),

  // p124-125, "Example of an Exclusive Message and Calculating a Checksum": Scene Level of the
  // temporary scene (01 00 00 00 + 00 00 00 + 00 11) set to 74. The manual's only DT1 parameter
  // write; it exercises the 3-byte model id 01 05 0A, the Temporary Scene base and the checksum.
  examples: [
    {
      name: 'Setting scene level to 74 (DT1)',
      where: 'p124-125',
      parameter: 'scene.level',
      value: 74,
      expectedHex: 'F0 41 10 01 05 0A 12 01 00 00 11 4A 24 F7',
    },
  ],

  // p1, the Bank Select table for Scenes: PR-A 085/064, PR-B 085/065 (128 each), PR-C 085/066
  // (73), USER 085/000 (128). Tones (PR-A 071/109-112, PR-B to PR-E and COMMON 087/064-091, USER
  // 071/024) and Drum Kits (PR-A 070/074, COMMON 086/065, USER 070/007) are chosen per part.
  presets: {
    banks: banks([
      sceneBank('USER', 0, 128),
      sceneBank('PR-A', 64, 128),
      sceneBank('PR-B', 65, 128),
      sceneBank('PR-C', 66, 73),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: sharedCoverage(PAGES),
  notes: [
    'One profile for the JUNO-D6, JUNO-D7 and JUNO-D8: the Identity Reply (p14-15) is family 0A 05 / 00 00 for all three, and only '
      + 'its first software-revision byte says which (00 JUNO-D6, 01 JUNO-D7, 02 JUNO-D8).',
    ...sharedNotes(PAGES),
    'Manual: the transmitted DT1 on p15 prints 01H 05H 0AH in its status line and 00H 00H 00H as Model ID #1-3 in the byte table '
      + 'beneath; every other table, the address map heading and the p125 example give 01 05 0A, which is used.',
    'Manual: the Tone Bank Select table (p1) labels MSB 087 / LSB 064-067 "RR-B"; read as PR-B (PR-A, PR-C, PR-D and PR-E surround it).',
    noPullReason(PAGES),
  ],

  noPull: NO_PULL,
};
