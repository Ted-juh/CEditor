// The Roland FANTOM-06/07/08: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "FANTOM-06/07/08 MIDI Implementation", version 1.00, Feb 1 2022 (eng01; maps/fantom-0.json
// says which file, with its hash). Page numbers below are that document's: Bank Select p1, Identity
// Reply p11, the address map pp14-16, the parameter tables pp16-69, the worked DT1 example p71.
//
// The FANTOM-0 is the FANTOM-6/7/8's scene of sixteen zones without the analog filter and the
// V-Piano, and with three tone kinds the FANTOM-6/7/8's map does not have (p14):
//
//   02 00 00 00  Temporary Scene                       common, chorus, reverb, two IFX, the Zone, Zone EQ
//                                                      and Zone Control blocks of 16 zones, controllers
//   02 10 00 00  Temporary Z-Core Tone (zone 1)        ... 02 1F 00 00 (zone 16)
//   02 30 00 00  Temporary Drum Kit (zone 1)           ... 02 4E 00 00 (zone 16)
//   03 00 00 00  Temporary Drum Kit Inst Set (zone 1)  ... 03 3C 00 00 (zone 16)
//   04 00 00 00  Temporary SN-A Tone (zone 1)          ... 04 0F 00 00 (zone 16)
//   04 40 00 00  Temporary VTW Tone                    (one)
//   05 00 00 00  Temporary EXSN Tone (zone 1)          ... 05 0F 00 00 (zone 16)
//   05 20 00 00  Temporary Model Tone (zone 1)         ... 05 2F 00 00 (zone 16)
//
// This layout is the system, the scene and every zone's scene-level blocks, and zone 1's tone in
// each kind the map can reach (with the one VTW tone). The other fifteen zones' tones are the same
// tables at the bases above and are left out to keep the profile a size an editor can load. The
// Z-Core tone is the FANTOM-6/7/8's (layouts/fantom-tone.mjs); everything this map shares with the
// FANTOM EX is in layouts/fantom-0-ex.mjs.

import { zCoreTone } from '../layouts/fantom-tone.mjs';
import {
  drumKit, ENV, exsnTone, modelTone, sceneBlocks, sceneLevelExample, scenePresets, sharedCoverage, snaTone, systemBlocks, vtwTone,
} from '../layouts/fantom-0-ex.mjs';

/**
 * Zone 1's drum-kit instruments (Inst Common and three envelopes, 149 parameters a key) are laid
 * out for keys 36 (C2) to 72 (C5), as the FANTOM-6/7/8 and JD-Xi profiles have them. All 88 would
 * add 7,599 parameters and put the profile near 19,500.
 */
const INST_KEYS = Array.from({ length: 37 }, (unused, i) => 36 + i);

export default {
  id: 'roland-fantom-0',
  name: 'Roland FANTOM-06/07/08',
  family: 'FANTOM',
  map: 'fantom-0',
  deviceId: 0x10,
  description: 'Roland FANTOM-06, FANTOM-07 and FANTOM-08 workstations: the temporary scene (common, effects, and the zone, '
    + 'zone EQ and zone control blocks of all 16 zones) with zone 1\'s Z-Core, SN-A, EXSN and Model tones and drum kit, the VTW '
    + 'organ tone, and the system settings. From the temporary (edit-buffer) area of the MIDI Implementation.',

  // p11, Identity Reply: F0 7E dev 06 02 41 5B 03 00 01 rr 03 00 00 F7 — family code 5B 03, family
  // number code 00 01, software revision rr 03 00 00 with rr = 00 (FANTOM-06), 01 (-07), 02 (-08).
  // The message lines and the byte tables agree. The family code is the FANTOM-6/7/8's (5B 03); the
  // family NUMBER is not (theirs is 00 00), so the two profiles do not answer each other's instruments.
  identity: { familyCode: ['5B', '03'], modelNumber: ['00', '01'] },

  blocks: [
    ...systemBlocks({ inputs: [''] }),
    ...sceneBlocks({ analogFilter: false }),

    // Zone 1's tone, in each kind of tone a zone can play.
    ...zCoreTone({ root: 'Temporary Z-Core Tone (zone 1)', id: 'zcore1', label: 'Zone 1 Z-Core', envTable: (kind) => ENV[kind] }),
    ...snaTone(1),
    ...exsnTone(1),
    ...modelTone(1),
    ...vtwTone(),
    ...drumKit(1, { instKeys: INST_KEYS }),
  ],

  // p71, "Example of an Exclusive Message and Calculating a Checksum": Scene Level of the temporary
  // scene, set to 74. It checks the 4-byte model id, the Temporary Scene base, the Scene Common
  // offset and the checksum against printed bytes.
  examples: [sceneLevelExample('p71')],

  presets: scenePresets,

  coverage: {
    ...sharedCoverage,
    zoneTones: 'zone 1 only: the tones of zones 2-16 are the same tables at Z-Core 02 11 00 00 - 02 1F 00 00 (step 01 00 00), '
      + 'Drum Kit 02 32 00 00 - 02 4E 00 00 (step 02 00 00), Drum Kit Inst Set 03 04 00 00 - 03 3C 00 00 (step 04 00 00), '
      + 'SN-A 04 01 00 00 - 04 0F 00 00, EXSN 05 01 00 00 - 05 0F 00 00 and Model 05 21 00 00 - 05 2F 00 00 (step 01 00 00), '
      + 'and are not laid out. The one VTW tone (04 40 00 00) is',
    drumInstruments: 'zone 1\'s drum kit has every key\'s partial and partial EQ (keys 21-108); its instruments (Inst Common and the '
      + 'three Inst envelopes) only for keys 36-72. Keys 21-35 (03 00 00 00 - 03 00 46 00) and 73-108 (03 02 04 00 - 03 03 33 00) are left out',
  },
  notes: [
    'One profile answers FANTOM-06, -07 and -08: they share the address map, the model id (00 00 00 5B) and the identity family code and number (5B 03, 00 01); only the first software-revision byte tells them apart (p11).',
    'The model id 00 00 00 5B is the FANTOM-6/7/8\'s and the FANTOM EX\'s too; the identity reply\'s family number (00 01) is what is this instrument\'s own.',
    'Scene-level blocks for all 16 zones (Zone, Zone EQ, Zone Control); tones for zone 1 only: Z-Core at 02 10 00 00, drum kit at 02 30 00 00 with its instruments at 03 00 00 00, SN-A at 04 00 00 00, EXSN at 05 00 00 00, Model at 05 20 00 00, and the one VTW tone at 04 40 00 00.',
    'Zone 1\'s drum-kit instruments cover keys 36-72; keys 21-35 and 73-108 are the same Inst blocks every 00 05 00 from 03 00 00 00 and are left out to keep the profile near 12,000 parameters.',
    'Many rows are printed without a number where they repeat: Name (16 bytes, as 16 rows), the two LFOs of a Partial LFO block, the 16 LFO steps, the four partials of a PMT, the four matrix controls of a partial, the four waves of a drum instrument. The generator numbers them in printed order.',
  ],

  // Read on request, not at connect. Zone 1 plays one kind of tone at a time; the instrument does not
  // answer a request for the others ("If the conditions are not met, nothing is transmitted", p7), and
  // the startup read stops at the first request that is not answered. The VTW tone belongs to whichever
  // zone plays it, which may be none.
  noPull: [/^(zcore1|sna1|exsn1|model1|vtw|kit1)(\.|$)/],
};
