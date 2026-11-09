// The Roland JUPITER-50: which parts of its address map make up the edit buffer, and what to call
// them.
//
// Source: "JUPITER-50 MIDI Implementation", version 1.00, April 30 2012, 26 pages (maps/jupiter-50.json
// says which file, with its hash). Page numbers below are that document's: Bank Select p1, the
// received RQ1 and DT1 p8, the Identity Reply p11, the transmitted DT1 and the Parameter Address
// Map p12-23, the worked DT1 example p25, the SuperNATURAL Acoustic tone list p26.
//
// The JUPITER-50 is the JUPITER-80's address map with one live set: a registration of three parts,
// UPPER playing a live set (four layered tones with four MFX and a reverb), SOLO and PERC/LOWER
// each playing one tone. Its temporary area (p12):
//
//   01 00 00 00  Setup                          02 00 00 00  System (common, controller)
//   10 00 00 00  Temporary Live Set (UPPER)     11 00 00 00 … 11 60 00 00  UPPER Layers 1-4' tones
//   14 00 00 00  Temporary Registration         common, the three parts, sixteen external parts,
//                                               controller, SOLO's and PERC/LOWER's sub part and
//                                               tone modify
//
// Against the JUPITER-80's: no LOWER live set or LOWER layer tones (12 00 00 00, 13 n0 00 00), no
// mastering EQ in System, no Sub Effect or Sub Reverb in the registration, the registration's
// fourth part is PERC/LOWER at the JUPITER-80's PERC slot (00 13 00; 00 11 00 is not printed), and
// the live set has a Common 2 block (00 70 00) holding its MFX Structure.
//
// Laid out: Setup and System, the registration, the live set, and UPPER's four layer tones (each a
// SuperNATURAL Synth Tone: common and three partials). SOLO and PERC/LOWER have no temporary tone
// in the map. The registration's Controller block is held back until the generator can request it
// (layouts/jupiter-80-50.mjs says why). The layout is shared with the JUPITER-80 there.

import {
  LAYERS, liveSetBlocks, registrationBlocks, registrationPresets, sharedCoverage, sharedNotes, synthToneBlocks, systemBlocks,
} from '../layouts/jupiter-80-50.mjs';

export default {
  id: 'roland-jupiter-50',
  name: 'Roland JUPITER-50',
  family: 'JUPITER',
  map: 'jupiter-50',
  deviceId: 0x10,
  description: 'Roland JUPITER-50 synthesizer: the temporary registration (common, the UPPER, SOLO and PERC/LOWER parts, SOLO\'s and '
    + 'PERC/LOWER\'s sub part and tone modify, sixteen external parts), the UPPER live set (common, MFX structure, four MFX, reverb, '
    + 'and four layers each with tone offset, tone modify and tone blender), UPPER\'s four layer tones (SuperNATURAL Synth: common '
    + 'and three partials), and the setup and system blocks, from the MIDI Implementation.',

  // p11, Identity Reply: F0 7E dev 06 02 41 63 02 00 00 00 01 00 00 F7 — family code 63 02, family
  // number code 00 00, software revision 00 01 00 00. The message line and the byte table agree, and
  // the family code is not the JUPITER-80's (55 02).
  identity: { familyCode: ['63', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ mastering: false }),
    ...registrationBlocks({
      parts: [['UPPER', 'upper'], ['SOLO', 'solo'], ['PERC/LOWER', 'percLower']],
      toneParts: [['SOLO', 'solo'], ['PERC/LOWER', 'percLower']],
      subEffects: false,
    }),
    ...liveSetBlocks('UPPER', { common2: true }),
    ...LAYERS.flatMap((layer) => synthToneBlocks('UPPER', layer)),
  ],

  // The manual's one worked SysEx message (p25), the JUPITER-80's with this model id: Reverb Type of
  // the UPPER live set, at 10 00 00 00 + 06 00 + 00 00, set to 02. As there, the text calls 02 "SRV
  // REVERB", and the Reverb Type row (p15) lists 02 as SRV ROOM. The address and value are the table's.
  examples: [
    {
      name: 'Setting REVERB TYPE of UPPER LIVE SET to SRV REVERB (DT1)',
      where: 'p25',
      parameter: 'upper.reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 63 12 10 00 06 00 02 68 F7',
    },
  ],

  // p1: registrations are MSB 83, LSB 0, programs 1-128 — [01]1-1 to [08]4-4. Live Sets (UPPER part,
  // 84/0-19, 0001-2560) and the SOLO/PERC parts' tones (SN Synth 93/0-15; SN Acoustic per the p26
  // table; PERC's Drum/SFX 86/64 and Manual Perc 86/65) have banks of their own, selected on the
  // part's channel, which a registration browser does not use.
  presets: registrationPresets(['[01]1-1 - [08]4-4']),

  coverage: {
    ...sharedCoverage({ noReply: 'p8', controlChange: 'p1-5 received, p9-11 transmitted', controllerPages: 'p19-21' }),
    tones: 'UPPER\'s four layer tones, all there are: the JUPITER-50 has no LOWER live set. SOLO and PERC/LOWER play one tone each and the '
      + 'address map has no temporary tone area for either: what can be set is their Registration Sub Part and Sub Modify (laid out)',
    userData: 'none in the map: the MIDI Implementation prints only the temporary area, no user registration, live set or tone memory',
  },
  notes: [
    'UPPER\'s layer tones: Temporary Tone (UPPER Layer n) at 11 00 00 00, 11 20 00 00, 11 40 00 00, 11 60 00 00; the synth tone at +01 00 00 '
      + 'in each (Layer 1: common 11 01 00 00, partials 11 01 01 00, 11 01 02 00, 11 01 03 00).',
    'The registration\'s third tone part is printed "PERC/LOWER" (Registration Part 00 13 00, Sub Part 00 41 00, Sub Modify 00 51 00); its '
      + 'ids are percLower. The Bank Select table (p1) calls it the PERC part.',
    'Live Set Common 2 (10 00 70 00) holds one parameter, MFX Structure (1-5); laid out as upper.liveSet2.',
    'Voice Reserve SOLO and Voice Reserve PERC/LOWER (Registration Common 00 14, 00 15, p19) are printed (0 - 31) with "0 - 31, FULL" '
      + 'beneath: thirty-three labels for thirty-two values (the JUPITER-80 prints 0 - 64 and "0 - 63, FULL"). Kept as the printed 0-31 '
      + 'number, with the line as its description.',
    'Tone Partial FILTER Mode (p23) is printed (0 - 7) with "BYPASS, LPF1, HPF, BPF, PKG" on one line and "LPF2, LPF3, LPF4" on the next, '
      + 'no comma between PKG and LPF2, so the labels count seven for eight values and it stays a number with the line as its description.',
    'The worked example (p25) names its value "SRV REVERB"; the Reverb Type table (p15) has no such entry and lists 02 as SRV ROOM. The '
      + 'bytes are checked as printed: they are the table\'s address and value.',
    'The transmitted DT1\'s byte table (p12) gives the device ID as 00H - 1FH, 7FH; the received messages\' (p7-8) as 10H - 1FH, 7FH.',
    ...sharedNotes,
  ],

  // Read on request, not at connect. A layer plays a synth or an acoustic tone, and the temporary
  // synth-tone area may not answer for a layer playing an acoustic one (p8); the startup read stops
  // at the first request that is not answered.
  noPull: [/^upper\.layer\d\.synthTone(\.|$)/],
};
