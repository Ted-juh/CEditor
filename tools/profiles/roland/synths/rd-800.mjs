// The Roland RD-800: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-800 MIDI Implementation", version 1.00, January 1 2014, 16 pages (maps/rd-800.json
// says which file, with its hash). Page numbers below are that document's: the received RQ1/DT1
// p5, the Identity Reply and the transmitted DT1 p8, the Parameter Address Map p9-13, the worked
// examples p15.
//
// The RD-800 is a stage piano whose sound is a Live Set: four internal layers (UPPER 1, UPPER 2,
// UPPER 3, LOWER), each with an external layer beside it for what it sends out, and a Modulation FX
// and Tremolo/Amp Simulator per layer, under one delay, one reverb and a common block. Its address
// map (p9) is that and the system:
//
//   00 00 00 00  System                 common, compressor, V-Link, switch assign
//   10 00 00 00  Live Set (Temporary)   common, song/rhythm, delay, reverb; per layer a Modulation
//                                       FX, a Tremolo/Amp Simulator, an Internal Layer, an External
//                                       Layer
//
// all of which is laid out here: the whole map. The layout is shared with the RD-2000 and RD-2000EX
// in layouts/rd-2000-800.mjs.

import { RD800_LAYERS, commonResonanceNote, editBufferBlocks, sharedCoverage, systemBlocks } from '../layouts/rd-2000-800.mjs';

export default {
  id: 'roland-rd-800',
  name: 'Roland RD-800',
  family: 'RD',
  map: 'rd-800',
  deviceId: 0x10,
  description: 'Roland RD-800 stage piano: the temporary Live Set (common, song/rhythm, delay, reverb, and for each of the four '
    + 'layers UPPER 1-3 and LOWER its internal layer, external layer, Modulation FX and Tremolo/Amp Simulator) and the system '
    + 'blocks (common, compressor, V-Link, switch assign), from the MIDI Implementation.',

  // p8, Identity Reply: F0 7E dev 06 02 41 75 02 00 00 00 00 00 00 F7 — family code 75 02, family
  // number code 00 00, software revision 00 00 00 00. The message line and the byte table agree.
  // The RD-2000 and RD-2000EX share the model id and the family code; their family number is 00 01.
  identity: { familyCode: ['75', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ vLink: true }),
    ...editBufferBlocks({ unit: 'Live Set', word: 'Layer', zones: RD800_LAYERS, commonId: 'liveSet' }),
  ],

  // The manual's worked DT1 (p15, "Example of an Exclusive Message and Calculating a Checksum"):
  // Delay Type of the Live Set set to DELAY→TREMOLO (03), at Temporary Live Set 10 00 00 00 + Delay
  // 04 00 + 00 02. The byte diagram prints F0 41 10 00 00 75 12 10 00 04 02 03 ?? F7 and works the
  // checksum out beneath it as 67H; the summary line under that, "F0 41 10 00 75 12 10 00 04 02 03
  // 67 F7", drops one 00 of the model id. The bytes here are the diagram's with the page's checksum.
  examples: [
    {
      name: 'Setting DELAY TYPE to DELAY→TREMOLO (DT1)',
      where: 'p15',
      parameter: 'delay.type',
      value: 3,
      expectedHex: 'F0 41 10 00 00 75 12 10 00 04 02 03 67 F7',
    },
  ],

  coverage: {
    ...sharedCoverage,
    switchAssign: 'System Switch Assign\'s Live Set Switch C-I Variation Number (00 00 03 20 - 00 00 03 26) are not laid out: the '
      + 'manual prints A, B, ":" and J (p9-10), and an elided run is filled in only where its names are numbered; A, B and J are here',
    inboundControllers: 'not modelled: what the front panel and the external layers transmit (Control Change, p6-7) is not mapped yet',
  },
  notes: [
    'Layers are filed under the manual\'s names: upper1, upper2, upper3 and lower, each with .internal (Live Set Internal Layer), '
      + '.external (Live Set External Layer), .modFx (Live Set Modulation FX) and .tremoloAmp (Live Set Tremolo/Amp Simulator). The '
      + 'Modulation FX and the Tremolo/Amp Simulator are laid out from the one table the manual prints for both (p11).',
    commonResonanceNote('Live Set', 'liveSet', 'p11'),
    'The Internal Layer table (p12) prints "Tone Program Change" twice, at 00 1F and at 00 22, either side of Tone Bank Select MSB and '
      + 'LSB; the RD-2000\'s table has only the one at 00 22. Both are laid out, numbered in printed order (toneProgramChange1 at 00 1F, '
      + 'toneProgramChange2 at 00 22); which the instrument means by 00 1F the page does not say.',
    'The worked RQ1 (p15) prints F0 41 10 00 00 75 10 00 00 00 00 00 00 7F 71 F7 for Live Set Common: the address, size and checksum '
      + 'are this profile\'s requestLiveSet, but the 11H command byte is missing from both the diagram and the summary line.',
    'The worked examples call the Live Set\'s delay address "the address of DELAY TYPE of Setup" (p15); there is no Setup block in this map.',
  ],
};
