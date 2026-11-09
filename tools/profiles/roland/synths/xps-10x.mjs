// The Roland XPS-10X: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "XPS-10X MIDI Implementation", version 1.00, Aug 20 2025 (maps/xps-10x.json says which
// file, with its hash). Page numbers below are that document's: Bank Select p1-2, the RQ1/DT1
// tables p8-9, Identity Reply p13, the Parameter Address Map p15-110, the worked DT1 example p112.
//
// The XPS-10X shares its model ID, 01 06 09, with the XPS-60; the Identity Reply's family number
// code is what tells them apart (02 00 here, 01 00 on the XPS-60). Its address map is the JUNO-D's
// (../layouts/juno-d6-xps-60.mjs has the shared layout) without the Scene Vocoder and the System's
// mic settings, with sliders where the JUNO-D has knobs, and with eight Key Sw Groups in the scene.

import {
  banks, familyBlocks, NO_PULL, noPullReason, sceneBank, sharedCoverage, sharedNotes,
} from '../layouts/juno-d6-xps-60.mjs';

const PAGES = { scenePage: 15, instPage: 16, pmtPage: 94, rq1Page: 8 };

export default {
  id: 'roland-xps-10x',
  name: 'Roland XPS-10X',
  family: 'XPS',
  map: 'xps-10x',
  deviceId: 0x10,
  description: 'Roland XPS-10X expandable synthesizer: the temporary scene (common, IFX, chorus, reverb, arpeggio, and the Part, '
    + 'EQ, MFX, Zone and Arpeggio blocks of parts 1, 2 and R), part 1\'s temporary tone (four partials with envelopes, LFOs, '
    + 'EQs and the synth layer), the rhythm part\'s drum kit with all 88 keys, and the system settings.',

  // p13, Identity Reply: F0 7E dev 06 02 41 09 06 02 00 00 01 00 01 F7 — family code 09 06, family
  // number code 02 00 (the XPS-60's reads 01 00 under the same family code). The status line and the
  // byte table agree.
  identity: { familyCode: ['09', '06'], modelNumber: ['02', '00'] },

  blocks: familyBlocks({ vocoder: false }),

  // p112, "Example of an Exclusive Message and Calculating a Checksum": Scene Level of the
  // temporary scene (01 00 00 00 + 00 00 00 + 00 11) set to 74, with this manual's own model ID
  // 01 06 09. The manual's only DT1 parameter write.
  examples: [
    {
      name: 'Setting scene level to 74 (DT1)',
      where: 'p112',
      parameter: 'scene.level',
      value: 74,
      expectedHex: 'F0 41 10 01 06 09 12 01 00 00 11 4A 24 F7',
    },
  ],

  // p1, the Bank Select table for Scenes: PR-A to PR-L 085/064-075 (128 each), PR-M 085/076 (96),
  // USER 085/000 and 085/001 (001-128, 129-256). Tones (PR-B 071/065-066, PR-C 071/067-076, PR-D
  // 071/077-078, USER 071/024-025; no PR-A) and Drum Kits (PR-A 070/064, PR-B 070/065, USER
  // 070/007) are chosen per part.
  presets: {
    banks: banks([
      sceneBank('USER', 0, 128),
      sceneBank('USER', 1, 128, 129),
      ...'ABCDEFGHIJKL'.split('').map((letter, i) => sceneBank(`PR-${letter}`, 64 + i, 128)),
      sceneBank('PR-M', 76, 96),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: sharedCoverage(PAGES),
  notes: [
    ...sharedNotes(PAGES),
    'Manual: the sentence on p8 says "The model ID of the exclusive messages used by this instrument is 01H 05H 0AH" (the JUNO-D\'s); '
      + 'the RQ1 and DT1 byte tables (p8-9, p13-14), the address map heading (p15) and the p112 example give 01 06 09, which is used.',
    'Manual: Scene Common Category (p20) is printed on a "0000 aaaa" field (0-15) with the range 0-32 and thirty-three labels; '
      + 'kept as the range and labels print it.',
    'Manual: System Common (p17) runs from 00 16 (Reverb Source) to 00 28 (USB Audio Input Level), and System Control (p18) from 00 23 '
      + '(Hold Pedal Polarity) to 00 27 (Slider 1 Source), with no Reserved rows between — the JUNO-D\'s mic and control-pedal addresses. '
      + 'Those bytes are inside each block\'s request and mapped to nothing.',
    'Manual: the Tone Bank Select table (p1) labels MSB 071 / LSB 065-066 "RR-B"; read as PR-B. It has no PR-A tone bank (the XPS-60\'s has 071/064).',
    noPullReason(PAGES),
  ],

  noPull: NO_PULL,
};
