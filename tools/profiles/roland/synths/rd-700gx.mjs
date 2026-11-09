// The Roland RD-700GX: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-700GX MIDI Implementation", version 1.00, Feb. 1 2008 (maps/rd-700gx.json says which
// file, with its hash; its cover block was not read, so `manual` below states it). Page numbers
// below are that document's: Bank Select p1, Identity Reply p8, the Parameter Address Map pp9-12, the
// worked examples p14.
//
// The address map (p9) is two areas, laid out with the RD-300GX's (../layouts/rd-gx.mjs):
//
//   00 00 00 00  System             common, sound control, Favorite SETUP, V-Link
//   10 00 00 00  Setup (Temporary)  common, rhythm/arpeggio, sound control, chorus, reverb; two MFX for
//                                   each of UPPER1, UPPER2, LOWER1, LOWER2 (00 10 00 - 00 1E 00); an
//                                   Internal and an External Zone for each zone; Parts 1-16 (01 00 00 -
//                                   01 0F 00), and each Part's Piano (02 00 00 - 05 60 00, step 00 20 00),
//                                   E.Piano (06 00 00 - 06 0F 00) and ToneWheel (07 00 00 - 07 0F 00)
//
// That is the whole edit buffer, and all of it is laid out but five of the eight MFX blocks, which
// the offset table elides with ":" between entries it does not number (see notes).

import {
  PARTS, effectCoverage, mfxBlock, noPull, partBlocks, presetsNote, setupBlocks, setupPresets, systemBlocks, zoneBlocks,
} from '../layouts/rd-gx.mjs';

const ZONES = ['UPPER1', 'UPPER2', 'LOWER1', 'LOWER2'];

export default {
  id: 'roland-rd-700gx',
  name: 'Roland RD-700GX',
  family: 'RD',
  map: 'rd-700gx',
  deviceId: 0x10,
  description: 'Roland RD-700GX digital stage piano (2008): the system blocks and the temporary SETUP — common, rhythm/arpeggio, '
    + 'sound control, chorus, reverb, the MFX the map addresses, the Internal and External Zone of each of its four keyboard zones, '
    + 'and the sixteen Parts with each Part\'s Piano, E.Piano and ToneWheel settings — from the MIDI Implementation.',

  // p8, Identity Reply Message: F0 7E dev 06 02 41 2B 02 00 00 00 01 00 00 F7 — family code 2B 02,
  // family number 00 00, revision 00 01 00 00. The message line and the byte table agree. The
  // RD-300GX (2C 02) and the RD-700 (43 01) print other family codes; nothing collides.
  identity: { familyCode: ['2B', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ favorite: true }),
    // The offset table (p9) calls the block "SETUP Rhythm/Arpeggio/AudioKey"; its table heading (p11)
    // is "SETUP Rhythm/Arpeggio".
    ...setupBlocks({ rhythmEntry: 'SETUP Rhythm/Arpeggio/AudioKey', rhythmTable: 'SETUP Rhythm/Arpeggio', soundControl: true }),
    // The three MFX the offset table names (p9); the five between them are elided (notes).
    mfxBlock('UPPER1', 1),
    mfxBlock('UPPER1', 2),
    mfxBlock('LOWER2', 2),
    ...ZONES.flatMap(zoneBlocks),
    ...PARTS.flatMap((n) => partBlocks(n, ['Piano', 'E.Piano', 'ToneWheel'])),
  ],
  noPull,

  // p14, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting CHORUS TYPE
  // to DELAY (DT1)": Temporary Setup 10 00 00 00 + Chorus 04 00 + 00 00, DELAY = 02. Its byte diagram
  // prints F0 41 10 00 00 2B 12 10 00 04 00 02 ?? F7 and its sum works out 6A; the line below it, "This
  // means that F0 41 10 00 43 12 10 00 04 00 02 6A F7", carries the RD-700's two-byte model ID (00 43)
  // — the RD-700 manual's sentence, word for word (its p160). The bytes here are the diagram's, with
  // the checksum the page works out; see notes. (<Example2> is an RQ1 for the whole temporary setup,
  // 10 00 00 00 size 00 07 0F 0B: F0 41 10 00 00 2B 11 10 00 00 00 00 07 0F 0B 41 F7.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of the temporary SETUP to DELAY (DT1)',
      where: 'p14',
      parameter: 'setup.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 2B 12 10 00 04 00 02 6A F7',
    },
  ],

  // p1, the Bank Select table: SETUP 085/000, program 001-100.
  presets: setupPresets(100),

  coverage: {
    effectParameterMeanings: effectCoverage,
    mfx: 'partial: three of the eight SETUP MFX blocks — UPPER1 MFX1 (10 00 10 00), UPPER1 MFX2 (10 00 12 00) and LOWER2 MFX2 '
      + '(10 00 1E 00), the entries the offset table prints (p9). The five it elides with ":" between them, at 10 00 14 00, 10 00 16 00, '
      + '10 00 18 00, 10 00 1A 00 and 10 00 1C 00 (by the arithmetic UPPER2 MFX1/MFX2, LOWER1 MFX1/MFX2, LOWER2 MFX1), have no entry '
      + 'in the map and are not laid out',
    memories: 'none in the map: the SETUP memories (001-100, p1) have no addresses in the MIDI Implementation',
    inboundControllers: 'not modelled: what the sliders, knobs, pedals and S1/S2 transmit as CC (Data Transmission, p6-8) is not mapped yet',
  },
  notes: [
    presetsNote,
    'Not laid out: five of the eight SETUP MFX blocks. The offset table (p9) prints "00 10 00 SETUP MFX (UPPER1 MFX1)", "00 12 00 '
      + 'SETUP MFX (UPPER1 MFX2)", ":", "00 1E 00 SETUP MFX (LOWER2 MFX2)"; the run counts zones and MFX slots rather than a number, '
      + 'so the reader leaves the five between as a gap, and a layout can only name an entry the map holds.',
    'p14 <Example1> ends "This means that F0 41 10 00 43 12 10 00 04 00 02 6A F7 is the message should be sent": 00 43 is the RD-700\'s '
      + 'model ID, and the sentence is the RD-700 manual\'s. The same page\'s byte diagram, the DT1 tables (p6, p8) and the address map\'s '
      + 'heading (p9) give 00 00 2B, and the checked example is F0 41 10 00 00 2B 12 10 00 04 00 02 6A F7.',
    'System Favorite SETUP (p9) prints two rows at 00 1B: "Favorite SETUP7 (Bank C)" and "Favorite SETUP8 (Bank C)", and none at 00 1C. '
      + 'SETUP8 (Bank C) is by its place 00 1C, but the page does not say so; the first row is kept and the second left out.',
    'SETUP Common (p10) prints no rows at 00 3D - 00 5A (between Upper [RHY/GM2] and Lower [Piano] Tone Category) and 00 79 - 01 16 '
      + '(between Lower [RHY/GM2] Tone Category and FC 1 Assign) — thirty bytes each, ten three-nibble categories\' worth — nor at '
      + '01 3A, and its rows end at 01 4A against a Total Size of 00 00 01 4D; the block is requested whole.',
    'SETUP Common prints its two mid EQ bands with the same names (EQ Mid Frequency/Gain/Q at 01 25-01 27 and 01 28-01 2A, p10); they '
      + 'are numbered 1 and 2 in printed order.',
    'SETUP Common\'s EQ frequency lists print "200.250" for "200, 250" (p10), so they count 30 labels for 31 values and stay numbers '
      + '0 - 30 with the manual\'s list as their description. Harmonic Bar Assign prints its footage list under LOWER2:ON only; the other '
      + 'seven stay numbers 1 - 9.',
    'SETUP MFX (p11) starts at 00 02 (MFX Type); 00 00 - 00 01 and 00 04 - 00 0F print no rows.',
    'Printed names kept as printed: "MFX Knob1 Assgin" and "MFX Knob2 Assgin" (SETUP Common 01 19-01 1A), "Control Slider Swtch" '
      + '(SETUP Internal Zone 00 0D-00 10), "ToneBar Bell Lebel" and "HAM Noise Lelve" (Setup E.Piano Setting 00 03, 00 06). System S2 '
      + 'Assign\'s list prints "DCOUPLE+2OCT" and "STADRT/STOP" (p9), kept as labels.',
    'Arpeggio Motif (SETUP Rhythm/Arpeggio 00 09) prints a full stop for a comma ("UP(H&L).UP(_)") and "RHASE" (p11), so its list '
      + 'counts eleven labels for twelve values; it stays a number 0 - 11. Setup E.Piano Setting\'s ModelType (0 - 7) prints no labels.',
  ],

  // The MIDI Implementation's own head (p1): Model RD-700GX, Date Feb. 1, 2008, Version 1.00.
  manual: { date: 'Feb. 1, 2008', version: '1.00' },
};
