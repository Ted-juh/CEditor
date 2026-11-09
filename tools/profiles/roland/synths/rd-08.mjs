// The Roland RD-08: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-08 MIDI Implementation", version 1.00, Mar. 19 2024, 24 pages (maps/rd-08.json says
// which file, with its hash). Page numbers below are that document's: Bank Select p1, Control Change
// received p1-4, the received RQ1/DT1 p6-7, Control Change transmitted p8-11, the Identity Reply and
// the transmitted DT1 p12, the Parameter Address Map p12-20, the worked DT1 example p22.
//
// The RD-88's address map with four assignable knobs instead of eight (knobs 5-8 printed "(reserve)
// <*>"), a hundred user scenes, and the knob and external-zone rows marked <**>: "Addresses and
// parameters that include an <**> are enabled after the instrument is upgraded" (p12). Those rows are
// laid out under their printed names, mark and all. ../layouts/rd-88-08.mjs has the layout the three
// share.

import {
  familyBlocks, identityNote, sceneBank, sceneLevelExample, sharedCoverage, sharedNotes, toneTableNote,
} from '../layouts/rd-88-08.mjs';

export default {
  id: 'roland-rd-08',
  name: 'Roland RD-08',
  family: 'RD',
  map: 'rd-08',
  deviceId: 0x10,
  description: 'Roland RD-08 stage piano: the temporary scene (common, the Tone, EQ, MFX and Zone blocks of each of its three zones, '
    + 'the IFX, chorus, reverb and sympathetic resonance), the setup, and the system blocks (common, controllers, system chorus and '
    + 'reverb, master EQ and comp, input reverb and EQ), from the MIDI Implementation.',

  // p12, Identity Reply: F0 7E dev 06 02 41 64 03 00 00 01 01 00 00 F7 — family code 64 03, family
  // number code 00 00, software revision 01 01 00 00; the message line and the byte table agree. The
  // family code and number are the RD-88's and RD-88EX's; only the revision differs (see notes).
  identity: { familyCode: ['64', '03'], modelNumber: ['00', '00'] },

  blocks: familyBlocks(),

  examples: [sceneLevelExample('p22')],

  // p1, the Bank Select table for Scenes, as printed: MSB 085, LSB 000 programs 001-125 (scenes
  // 001-041), LSB 001 programs 001-107 (scenes 042-082), LSB 002 programs 006-109 (scenes 076-100),
  // "For details, refer to RD-08 Sound List". Which program in each range holds which scene is in that
  // list, not in the MIDI Implementation; the slots are the printed program ranges (see notes).
  presets: {
    banks: [
      sceneBank({ id: 'scene-1', label: 'Scene 001-041 (programs 1-125)', lsb: 0, startSlot: 0, slotCount: 125 }),
      sceneBank({ id: 'scene-2', label: 'Scene 042-082 (programs 1-107)', lsb: 1, startSlot: 125, slotCount: 107 }),
      sceneBank({ id: 'scene-3', label: 'Scene 076-100 (programs 6-109)', lsb: 2, startSlot: 232, slotCount: 104, programBase: 5 }),
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: sharedCoverage({
    userScenes: 'User Scene(001)-(100) at 10 00 00 00 + (n-1) x 00 01 00 00, each the Scene layout again (by that stride scene 100 is at '
      + '10 63 00 00; the map\'s last row prints 11 0C 00 00, p12: see notes)',
    controlChange: 'received p1-4, transmitted p8-11',
  }),
  notes: [
    ...sharedNotes({ symResoPage: 18 }),
    identityNote,
    'Rows marked <**> ("enabled after the instrument is upgraded", p12) are laid out with the mark in their printed name and nothing in '
      + 'their ids: System Control Assignable Knob(1)-(4) Function (00 0A-00 0D, p13-14); Scene Common Assignable Knob(1)-(4) Function and '
      + 'Assignable Knob Source (00 20-00 23, 00 28, p14-15); and in each Scene Zone, Control Knob(1)-(4), External Control Volume Knob, Tx Mode '
      + 'and every External row (00 10-00 13, 00 18-00 42, p16-18). An RD-08 not yet upgraded may ignore writes to them.',
    'Knobs: the RD-08 prints Assignable Knob(5)-(8) as "(reserve) <*>" in Scene Common (00 24-00 27) and Control Knob(5)-(8) likewise in Scene '
      + 'Zone (00 14-00 17), and in System Control reserves knobs 5-7 (00 0E-00 10) but still prints "Assignable Knob(8) Function" at 00 11 '
      + '(p14), unmarked and unreserved, as the RD-88 does. It is laid out as printed (system.control.assignableKnob8Function); it is most likely the RD-88\'s '
      + 'row left in, for a knob the RD-08 does not have.',
    'User scenes (p12): the top table prints User Scene(001) at 10 00 00 00, (002) at 10 01 00 00, ":", and User Scene(100) at 11 0C 00 00. '
      + 'At the printed stride (00 01 00 00) scene 100 is at 10 63 00 00, and 11 0C 00 00 would be scene 141; the run does not close and the '
      + 'reader leaves it unfilled. User scenes are not edit buffer and are not laid out.',
    'Bank Select (p1), Scenes: MSB 085, LSB 000 programs 001-125 for scenes 001-041, LSB 001 programs 001-107 for scenes 042-082, LSB 002 '
      + 'programs 006-109 for scenes 076-100, and "For details, refer to RD-08 Sound List". Forty-one scenes over 125 program numbers means '
      + 'the scenes sit at scattered programs (the RD-88\'s numbering kept, by the look of it), and the last two ranges overlap at 076-082: '
      + 'forty-one, forty-one and eighteen would make a hundred, which reads as 083-100 misprinted. The presets list every program number '
      + 'in each printed range, so some slots select no scene; the Sound List says which do.',
    toneTableNote,
    'The worked example (p22) is headed "Setting program level to 74"; its text and address are Scene Common\'s Scene Level (01 00 00 10), '
      + 'and its bytes are checked as printed.',
  ],
};
