// The Roland XPS-60: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "XPS-60 MIDI Implementation", version 1.02, Jan 14 2025 (maps/xps-60.json says which
// file, with its hash). Page numbers below are that document's: Bank Select p1-2, the RQ1/DT1
// tables p8-9, Identity Reply p13, the Parameter Address Map p15-112, the worked example p114.
//
// The XPS-60 shares its model ID, 01 06 09, with the XPS-10X; the Identity Reply's family number
// code is what tells them apart (01 00 here, 02 00 on the XPS-10X). Its address map is the JUNO-D's,
// vocoder and mic settings included (../layouts/juno-d6-xps-60.mjs has the shared layout); it adds
// a Scale Tune Transpose Sync to each Scene Part and has more scene categories.

import {
  banks, familyBlocks, NO_PULL, noPullReason, sceneBank, sharedCoverage, sharedNotes,
} from '../layouts/juno-d6-xps-60.mjs';

const PAGES = { scenePage: 15, instPage: 16, pmtPage: 95, rq1Page: 8 };

export default {
  id: 'roland-xps-60',
  name: 'Roland XPS-60',
  family: 'XPS',
  map: 'xps-60',
  deviceId: 0x10,
  description: 'Roland XPS-60 expandable synthesizer: the temporary scene (common, IFX, chorus, reverb, vocoder, arpeggio, and the '
    + 'Part, EQ, MFX, Zone and Arpeggio blocks of parts 1, 2 and R), part 1\'s temporary tone (four partials with envelopes, '
    + 'LFOs, EQs and the synth layer), the rhythm part\'s drum kit with all 88 keys, and the system settings.',

  // p13, Identity Reply: F0 7E dev 06 02 41 09 06 01 00 00 01 00 02 F7 — family code 09 06, family
  // number code 01 00 (the XPS-10X's reads 02 00 under the same family code). The status line and
  // the byte table agree.
  identity: { familyCode: ['09', '06'], modelNumber: ['01', '00'] },

  blocks: familyBlocks({ vocoder: true }),

  examples: [],
  examplesUnavailable: 'The only printed DT1 example (p114, "Setting scene level to 74") prints F0 41 10 01 05 0A 12 01 00 00 11 4A 24 F7: '
    + 'the JUNO-D\'s model ID 01 05 0A, where this manual\'s RQ1/DT1 byte tables (p8-9, p13-14) and its address map heading (p15) give '
    + '01 06 09, as the XPS-10X\'s example (its p112) does. The address, value and checksum agree with the map; the bytes as printed '
    + 'cannot be what this profile sends, so the example is not claimed.',

  // p1, the Bank Select table for Scenes: PR-A to PR-L 085/064-075 (128 each), PR-M 085/076 (123),
  // USER 085/000 and 085/001 (001-128, 129-256). Tones (PR-A 071/064, PR-B 071/065-066, PR-C
  // 071/067-076, PR-D 071/077-078, USER 071/024-025) and Drum Kits (PR-A 070/064, PR-B 070/065,
  // USER 070/007) are chosen per part.
  presets: {
    banks: banks([
      sceneBank('USER', 0, 128),
      sceneBank('USER', 1, 128, 129),
      ...'ABCDEFGHIJKL'.split('').map((letter, i) => sceneBank(`PR-${letter}`, 64 + i, 128)),
      sceneBank('PR-M', 76, 123),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: sharedCoverage(PAGES),
  notes: [
    ...sharedNotes(PAGES),
    'Manual: the sentence on p8 says "The model ID of the exclusive messages used by this instrument is 01H 05H 0AH" (the JUNO-D\'s), '
      + 'and so does the worked example on p114; the RQ1 and DT1 byte tables (p8-9, p13-14) and the address map heading (p15) give '
      + '01 06 09, which is used.',
    'Manual: Scene Common Category (p20) is printed on a "0000 aaaa" field (0-15) with the range 0-32 and thirty-three labels; '
      + 'kept as the range and labels print it.',
    'Manual: the Tone Bank Select table (p1) labels MSB 071 / LSB 065-066 "RR-B"; read as PR-B.',
    noPullReason(PAGES),
  ],

  noPull: NO_PULL,
};
