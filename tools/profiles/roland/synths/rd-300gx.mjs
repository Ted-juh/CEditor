// The Roland RD-300GX: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-300GX MIDI Implementation", version 1.00, Feb. 1 2008 (maps/rd-300gx.json says which
// file, with its hash; its cover block was not read, so `manual` below states it). Page numbers
// below are that document's: Bank Select p1, Identity Reply p6, the Parameter Address Map pp7-10, the
// worked examples p11.
//
// The address map (p7) is two areas, laid out with the RD-700GX's (../layouts/rd-gx.mjs):
//
//   00 00 00 00  System             common, sound control, V-Link
//   10 00 00 00  Setup (Temporary)  common, rhythm/arpeggio, chorus, reverb; an Internal and an External
//                                   Zone for UPPER1, UPPER2 and LOWER; Parts 1-16 (00 50 00 - 00 5F 00)
//                                   and each Part's Piano block (01 00 00 - 01 0F 00)
//
// That is the whole edit buffer the offset tables address, and all of it is laid out — but for the
// MFX: the map prints a SETUP MFX table (p9) that no offset table places (see notes).

import {
  PARTS, effectCoverage, noPull, partBlocks, presetsNote, setupBlocks, setupPresets, systemBlocks, zoneBlocks,
} from '../layouts/rd-gx.mjs';

const ZONES = ['UPPER1', 'UPPER2', 'LOWER'];

export default {
  id: 'roland-rd-300gx',
  name: 'Roland RD-300GX',
  family: 'RD',
  map: 'rd-300gx',
  deviceId: 0x10,
  description: 'Roland RD-300GX digital stage piano (2008): the system blocks and the temporary SETUP — common, rhythm/arpeggio, '
    + 'chorus, reverb, the Internal and External Zone of each of its three keyboard zones, and the sixteen Parts with each Part\'s '
    + 'piano settings — from the MIDI Implementation.',

  // p6, Identity Reply Message: F0 7E dev 06 02 41 2C 02 00 00 00 01 00 00 F7 — family code 2C 02,
  // family number 00 00, revision 00 01 00 00. The message line and the byte table agree. The
  // RD-700GX (2B 02) and the RD-700 (43 01) print other family codes; nothing collides.
  identity: { familyCode: ['2C', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks(),
    // The offset table (p7) calls the block "SETUP Rhythm/AudioKey"; its table heading (p9) is
    // "SETUP Rhythm/Arpeggio/AudioKey", and holds rhythm and arpeggio rows only.
    ...setupBlocks({ rhythmEntry: 'SETUP Rhythm/AudioKey', rhythmTable: 'SETUP Rhythm/Arpeggio/AudioKey' }),
    ...ZONES.flatMap(zoneBlocks),
    ...PARTS.flatMap((n) => partBlocks(n, ['Piano'])),
  ],
  noPull,

  // p11, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting reverb Level
  // to 100 (DT1)". The page prints the address three ways: its prose says "10 00 08 01H", its byte
  // diagram F0 41 10 00 00 2C 12 10 00 06 01 64 ?? F7, its sum "10H + 00H + 06H + 01H + 64H = 16 + 0 +
  // 8 + 1 + 100 = 123" (the hex terms say 06, the decimal term 8, the total 123 is 06's) and checksum
  // 05, and its last line "F0 41 10 00 00 2C 12 10 00 08 01 64 05 F7" — 08 with 06's checksum (08
  // would give 03). The address map puts SETUP Reverb at 00 06 00 (p7) and Reverb Level at 00 01 (p9):
  // 10 00 06 01. The bytes here are the diagram's with the checksum the page works out; see notes.
  // (<Example2>, an RQ1 for SETUP Common, F0 41 10 00 00 2C 11 10 00 00 00 00 00 00 7A 76 F7, is
  // byte for byte the profile's requestSetup.)
  examples: [
    {
      name: 'Setting Reverb Level of the temporary SETUP to 100 (DT1)',
      where: 'p11',
      parameter: 'setup.reverb.level',
      value: 100,
      expectedHex: 'F0 41 10 00 00 2C 12 10 00 06 01 64 05 F7',
    },
  ],

  // p1, the Bank Select table: SETUP 085/000, program 001-032.
  presets: setupPresets(32),

  coverage: {
    effectParameterMeanings: effectCoverage,
    mfx: 'not laid out: the map prints a SETUP MFX table (p9: MFX Type at 00 02, MFX Parameter 1-32 at 00 10 - 01 0C, Total Size '
      + '00 00 01 10), but neither the SETUP offset table (p7) nor any other gives it an address. Each Part\'s MFX1 Switch and MFX1 '
      + 'Type (SETUP Part 00 15-00 16) and SETUP Common\'s MFX Source (00 75) are laid out',
    memories: 'none in the map: the SETUP memories (001-032, p1) have no addresses in the MIDI Implementation',
    inboundControllers: 'not modelled: what the sliders, pedals and S1/S2 transmit as CC (Data Transmission, p6) is not mapped yet',
  },
  notes: [
    presetsNote,
    'Not laid out: the SETUP MFX table (p9). The SETUP offset table (p7) lists Common 00 00 00, Rhythm/AudioKey 00 02 00, Chorus '
      + '00 04 00, Reverb 00 06 00, the zones 00 30 00 - 00 42 00, the Parts 00 50 00 - 00 5F 00 and their Piano blocks 01 00 00 - '
      + '01 0F 00, and no MFX. Its table is the RD-700GX\'s, row for row (MFX Type 0 - 255), where the RD-700GX places eight at '
      + '00 10 00 - 00 1E 00; nothing on the RD-300GX\'s pages says it lives there too.',
    'p11 <Example1> prints Reverb Level\'s address as 10 00 08 01 in its prose and its last line, and 10 00 06 01 in its byte '
      + 'diagram and its sum; the checksum it works out (05) is 06\'s. The address map gives 10 00 06 01, and the checked example '
      + 'is F0 41 10 00 00 2C 12 10 00 06 01 64 05 F7.',
    'SETUP Common (p8) prints no rows at 00 37 - 00 4E (between Upper [RHY/GM2] Tone Category and Lower [Piano] Tone Category), '
      + '00 72 and 00 76, and its rows end at 00 78 against a Total Size of 00 00 00 7A; the block is requested whole. SETUP External '
      + 'Zone (p9) prints no row at 00 11.',
    'Setup Piano Setting\'s Hammer Noise Level (00 04, 62 - 66) prints its display as "-2 - 2OFF, 1 - 10" (p10), two lines run '
      + 'together; it stays a number 62 - 66 with the manual\'s line as its description.',
    'Arpeggio Motif (SETUP Rhythm/Arpeggio/AudioKey 00 0B) prints a full stop for a comma ("UP(H&L).UP(_)") and "RHASE" (p9), so '
      + 'its list counts eleven labels for twelve values; it stays a number 0 - 11.',
  ],

  // The MIDI Implementation's own head (p1): Model RD-300GX, Date Feb. 1, 2008, Version 1.00.
  manual: { date: 'Feb. 1, 2008', version: '1.00' },
};
