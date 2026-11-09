// The Roland RD-88: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-88 MIDI Implementation", version 1.12, Jul. 22 2020, 24 pages (maps/rd-88.json says
// which file, with its hash). Page numbers below are that document's: Bank Select p1, Control Change
// received p1-4, the received RQ1/DT1 p6-7, Control Change transmitted p8-11, the Identity Reply and
// the transmitted DT1 p12, the Parameter Address Map p12-21, the worked DT1 example p23.
//
// The temporary scene, its three zones and the system blocks; ../layouts/rd-88-08.mjs has the layout
// the RD-88, RD-88EX and RD-08 share, and why nothing is kept out of the startup read.

import {
  familyBlocks, fourHundredScenes, identityNote, sceneLevelExample, sharedCoverage, sharedNotes, toneTableNote,
} from '../layouts/rd-88-08.mjs';

export default {
  id: 'roland-rd-88',
  name: 'Roland RD-88',
  family: 'RD',
  map: 'rd-88',
  deviceId: 0x10,
  description: 'Roland RD-88 stage piano: the temporary scene (common, the Tone, EQ, MFX and Zone blocks of each of its three zones, '
    + 'the IFX, chorus, reverb and sympathetic resonance), the setup, and the system blocks (common, controllers, system chorus and '
    + 'reverb, master EQ and comp, input reverb and EQ), from the MIDI Implementation.',

  // p12, Identity Reply: F0 7E dev 06 02 41 64 03 00 00 00 01 00 01 F7 — family code 64 03, family
  // number code 00 00, software revision 00 01 00 01. The message line and the byte table agree.
  // The RD-88EX's manual prints the same reply byte for byte, and the RD-08's the same family code
  // and number: see notes.
  identity: { familyCode: ['64', '03'], modelNumber: ['00', '00'] },

  blocks: familyBlocks(),

  examples: [sceneLevelExample('p23')],

  // p1, the Bank Select table for Scenes, MSB 85, LSB 0-3: 400 scenes. Tones (SN PR-A 090/065, SN
  // PR-B 089/064, RD-88 071/071, PR-A to PR-E and COMMON 087/064-093, USER 071/007, EXZ001 101/064)
  // are chosen per zone.
  presets: fourHundredScenes(),

  coverage: sharedCoverage({
    userScenes: 'User Scene(001)-(400) at 10 00 00 00 + (n-1) x 00 01 00 00, to 13 0F 00 00 (p12), each the Scene layout again',
    controlChange: 'received p1-4, transmitted p8-11',
  }),
  notes: [
    ...sharedNotes({ symResoPage: 18 }),
    identityNote,
    'Bank Select (p1): the Scene table\'s last row, LSB 003 programs 001-016, is numbered "384 - 400"; sixteen programs after scene 384 are '
      + '385-400, as laid out.',
    toneTableNote,
    'The worked example (p23) is headed "Setting program level to 74"; its text and address are Scene Common\'s Scene Level (01 00 00 10), '
      + 'and its bytes are checked as printed.',
  ],
};
