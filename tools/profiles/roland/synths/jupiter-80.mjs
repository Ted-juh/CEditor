// The Roland JUPITER-80: which parts of its address map make up the edit buffer, and what to call
// them.
//
// Source: "JUPITER-80 MIDI Implementation", version 1.00, June 30 2011, 26 pages (maps/jupiter-80.json
// says which file, with its hash). Page numbers below are that document's: Bank Select p1, the
// received RQ1 and DT1 p7, the Identity Reply p10, the transmitted DT1 and the Parameter Address
// Map p11-23, the worked DT1 example p25, the SuperNATURAL Acoustic tone list p26.
//
// The JUPITER-80 plays a registration of four parts: UPPER and LOWER each play a live set (four
// layered tones with four MFX and a reverb), SOLO and PERC each play one tone. Its temporary area
// (p11):
//
//   01 00 00 00  Setup                          02 00 00 00  System (common, mastering EQ, controller)
//   10 00 00 00  Temporary Live Set (UPPER)     11 00 00 00 … 11 60 00 00  UPPER Layers 1-4' tones
//   12 00 00 00  Temporary Live Set (LOWER)     13 00 00 00 … 13 60 00 00  LOWER Layers 1-4' tones
//   14 00 00 00  Temporary Registration         common, the four parts, sixteen external parts,
//                                               controller, SOLO's and PERC's sub part, tone modify
//                                               and effect, and their shared reverb
//
// Laid out: Setup and System, the registration, both live sets, and UPPER's four layer tones (each
// a SuperNATURAL Synth Tone: common and three partials). LOWER's four layer tones are the same
// blocks at 13 n0 00 00 and are left out (coverage); SOLO and PERC have no temporary tone in the
// map. The registration's Controller block is held back until the generator can request it
// (layouts/jupiter-80-50.mjs says why). The layout is shared with the JUPITER-50 there.

import {
  LAYERS, liveSetBlocks, registrationBlocks, registrationPresets, sharedCoverage, sharedNotes, synthToneBlocks, systemBlocks,
} from '../layouts/jupiter-80-50.mjs';

export default {
  id: 'roland-jupiter-80',
  name: 'Roland JUPITER-80',
  family: 'JUPITER',
  map: 'jupiter-80',
  deviceId: 0x10,
  description: 'Roland JUPITER-80 synthesizer: the temporary registration (common, the UPPER, LOWER, SOLO and PERC parts, '
    + 'SOLO\'s and PERC\'s sub part, tone modify and effect, their reverb, sixteen external parts), the UPPER and LOWER live sets '
    + '(common, four MFX, reverb, and four layers each with tone offset, tone modify and tone blender), UPPER\'s four layer tones '
    + '(SuperNATURAL Synth: common and three partials), and the setup and system blocks, from the MIDI Implementation.',

  // p10, Identity Reply: F0 7E dev 06 02 41 55 02 00 00 00 01 00 00 F7 — family code 55 02, family
  // number code 00 00, software revision 00 01 00 00. The message line and the byte table agree.
  identity: { familyCode: ['55', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ mastering: true }),
    ...registrationBlocks({
      parts: [['UPPER', 'upper'], ['LOWER', 'lower'], ['SOLO', 'solo'], ['PERC', 'perc']],
      toneParts: [['SOLO', 'solo'], ['PERC', 'perc']],
      subEffects: true,
    }),
    ...liveSetBlocks('UPPER'),
    ...liveSetBlocks('LOWER'),
    ...LAYERS.flatMap((layer) => synthToneBlocks('UPPER', layer)),
  ],

  // The manual's one worked SysEx message (p25, "Example of an Exclusive Message and Calculating a
  // Checksum"): Reverb Type of the UPPER live set, at 10 00 00 00 + 06 00 + 00 00, set to 02. The
  // text calls 02 "SRV REVERB"; the Reverb Type row it writes (p15) lists OFF, REVERB, SRV ROOM, SRV
  // HALL, SRV PLATE, GM2 REVERB, so 02 is SRV ROOM. The address and the value are the table's.
  examples: [
    {
      name: 'Setting REVERB TYPE of UPPER LIVE SET to SRV REVERB (DT1)',
      where: 'p25',
      parameter: 'upper.reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 55 12 10 00 06 00 02 68 F7',
    },
  ],

  // p1: registrations are MSB 83, LSB 0-1, programs 1-128 — [01]A-1 to [04]D-8 and [05]A-1 to
  // [08]D-8. Live Sets (UPPER/LOWER parts, 84/0-19, 0001-2560) and the SOLO/PERC parts' tones (SN
  // Synth 93/0-15; SN Acoustic per the p26 table; PERC's Drum/SFX 86/64 and Manual Perc 86/65) have
  // banks of their own, selected on the part's channel, which a registration browser does not use.
  presets: registrationPresets(['[01]A-1 - [04]D-8', '[05]A-1 - [08]D-8']),

  coverage: {
    ...sharedCoverage({ noReply: 'p7', controlChange: 'p1-5 received, p8-10 transmitted', controllerPages: 'p18-20' }),
    tones: 'UPPER\'s four layer tones only. Left out: LOWER\'s, at Temporary Tone (LOWER Layer n) 13 00 00 00, 13 20 00 00, 13 40 00 00 '
      + 'and 13 60 00 00, each with its Temporary Synth Tone at +01 00 00 (common at 13 n1 00 00, partials 1-3 at 13 n1 01 00 - 13 n1 03 00), '
      + 'laid out as UPPER\'s. SOLO and PERC play one tone each and the address map has no temporary tone area for either: what can be '
      + 'set is their Registration Sub Part, Sub Modify and Sub Effect (laid out)',
    userData: 'none in the map: the MIDI Implementation prints only the temporary area, no user registration, live set or tone memory',
  },
  notes: [
    'UPPER\'s layer tones: Temporary Tone (UPPER Layer n) at 11 00 00 00, 11 20 00 00, 11 40 00 00, 11 60 00 00; the synth tone at +01 00 00 '
      + 'in each (Layer 1: common 11 01 00 00, partials 11 01 01 00, 11 01 02 00, 11 01 03 00).',
    'The System offset table names its mastering-EQ block "System EQ" (p11); the parameter table laid there is headed "System Mastering" '
      + '(p12) and holds the Master EQ and the Song EQ. Laid out as system.mastering.',
    'Registration Sub Effect prints Low Gain and High Gain under the same names in each of its three sections, the compressor, the EQ '
      + 'and the delay (p21); the generator numbers them in that order (lowGain1 compressor, lowGain2 EQ, lowGain3 delay; highGain the same).',
    'The worked example (p25) names its value "SRV REVERB"; the Reverb Type table (p15) has no such entry and lists 02 as SRV ROOM. The '
      + 'bytes are checked as printed: they are the table\'s address and value.',
    'The transmitted DT1\'s byte table (p11) gives the device ID as 00H - 1FH, 7FH; the received messages\' (p6-7) as 10H - 1FH, 7FH.',
    ...sharedNotes,
  ],

  // Read on request, not at connect. A layer plays a synth or an acoustic tone, and the temporary
  // synth-tone area may not answer for a layer playing an acoustic one (p7); the startup read stops
  // at the first request that is not answered.
  noPull: [/^upper\.layer\d\.synthTone(\.|$)/],
};
