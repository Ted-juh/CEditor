// The Roland FANTOM EX 6/7/8: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "FANTOM EX 6/7/8 MIDI Implementation", version 1.00, Nov 1 2023 (eng01; maps/fantom-ex.json
// says which file, with its hash). Page numbers below are that document's: Bank Select p1, Identity
// Reply p12, the address map pp15-19, the parameter tables pp19-92, the worked DT1 example p94.
//
// The FANTOM EX is the FANTOM-6/7/8's scene of sixteen zones (analog filter and V-Piano included)
// with five more tone kinds than the FANTOM-6/7/8's map has (pp15-18):
//
//   02 00 00 00  Temporary Scene                       common, chorus, reverb, two IFX, the Zone, Zone EQ
//                                                      and Zone Control blocks of 16 zones, controllers,
//                                                      analog filter
//   02 10 00 00  Temporary Z-Core Tone (zone 1)        ... 02 1F 00 00 (zone 16)
//   02 30 00 00  Temporary Drum Kit (zone 1)           ... 02 4E 00 00 (zone 16)
//   03 00 00 00  Temporary Drum Kit Inst Set (zone 1)  ... 03 3C 00 00 (zone 16)
//   04 00 00 00  Temporary SN-A Tone (zone 1)          ... 04 0F 00 00 (zone 16)
//   04 20 00 00  Temporary V-Piano Tone                (one)
//   04 40 00 00  Temporary VTW Tone                    (one)
//   05 00 00 00  Temporary EXSN Tone (zone 1)          ... 05 0F 00 00 (zone 16)
//   05 20 00 00  Temporary Model Tone (zone 1)         ... 05 2F 00 00 (zone 16)
//   05 40 00 00  Temporary n/zyme Tone (zone 1)        ... 05 4F 00 00 (zone 16)
//   05 60 00 00  Temporary JD-800 Tone (zone 1)        ... 05 6F 00 00 (zone 16)
//
// This layout is the system, the scene and every zone's scene-level blocks, and zone 1's tone in
// each kind the map can reach (with the one V-Piano and the one VTW tone). The other fifteen zones'
// tones are the same tables at the bases above and are left out to keep the profile a size an
// editor can load. The Z-Core tone is the FANTOM-6/7/8's (layouts/fantom-tone.mjs); everything this
// map shares with the FANTOM-06/07/08 is in layouts/fantom-0-ex.mjs.

import { zCoreTone } from '../layouts/fantom-tone.mjs';
import {
  drumKit, ENV, exsnTone, modelTone, sceneBlocks, sceneLevelExample, scenePresets, sharedCoverage, snaTone, systemBlocks, vtwTone,
} from '../layouts/fantom-0-ex.mjs';

/**
 * Zone 1's drum-kit instruments (Inst Common and three envelopes, 149 parameters a key) are laid
 * out for keys 36 (C2) to 66 (F#4) — six keys fewer than the FANTOM-6/7/8 and FANTOM-06/07/08
 * profiles' 36-72, which pays for the n/zyme and JD-800 tones and keeps the profile under 12,000
 * parameters. All 88 would add 8,493.
 */
const INST_KEYS = Array.from({ length: 31 }, (unused, i) => 36 + i);

const MFX = /^MFX\s+/;
const VPIANO = 'Temporary V-Piano Tone';

/** The one V-Piano tone: as the FANTOM-6/7/8 prints it (p17), with one more Piano Designer row. */
const vPianoTone = () => [
  { id: 'vpiano.common', table: '[V-Piano Tone Common]', path: [VPIANO, 'V-Piano Tone Common'], group: 'V-Piano · Common' },
  { id: 'vpiano.mfx', table: '[MFX]', path: [VPIANO, 'V-Piano Tone MFX'], group: 'V-Piano · MFX', strip: MFX },
  { id: 'vpiano.designer', table: '[Piano Designer Basic]', path: [VPIANO, 'Piano Designer Basic'], group: 'V-Piano · Piano Designer' },
  // Per-key tables of 128 entries each; p60 prints only the first and the last row with ":" between,
  // and the map keeps just those two. Piano Designer Tuning (00 04 00, 512 bytes, the same two rows
  // of 128 on p59) is left out: see coverage.
  { id: 'vpiano.level', table: '[Piano Designer Level]', path: [VPIANO, 'Piano Designer Level'], group: 'V-Piano · Key Level' },
  { id: 'vpiano.character', table: '[Piano Designer Character]', path: [VPIANO, 'Piano Designer Character'], group: 'V-Piano · Key Character' },
];

/**
 * Zone z's n/zyme (wavetable) tone (p18): oscillator, step modulator, the voice's own parameters, EQ,
 * the P-MOD/S-MOD shape controls, MFX, and the name and category, which the map files under
 * "Model Tone Common" here too.
 */
const nzymeTone = (z) => {
  const root = `Temporary n/zyme Tone (zone ${z})`;
  const id = `nzyme${z}`;
  const label = `Zone ${z} n/zyme`;
  return [
    { id, table: '[n/zyme Tone Prm]', path: [root, 'n/zyme Tone Parameter'], group: label },
    { id: `${id}.osc`, table: '[n/zyme Tone OSC]', path: [root, 'n/zyme Tone OSC'], group: `${label} · OSC` },
    { id: `${id}.stepMod`, table: '[n/zyme Tone Step Mod]', path: [root, 'n/zyme Tone Step Modulator'], group: `${label} · Step Modulator`, strip: /^Step Mod\s+/ },
    { id: `${id}.eq`, table: '[n/zyme Tone EQ]', path: [root, 'n/zyme Tone EQ'], group: `${label} · EQ`, strip: /^EQ\s+/ },
    { id: `${id}.control`, table: '[n/zyme Tone Control]', path: [root, 'n/zyme Tone Control'], group: `${label} · Shape Control` },
    { id: `${id}.mfx`, table: '[MFX]', path: [root, 'n/zyme Tone MFX'], group: `${label} · MFX`, strip: MFX },
    { id: `${id}.common`, table: '[Model Tone Com]', path: [root, '[n/zyme Tone]::Model Tone Common'], group: `${label} · Common` },
  ];
};

/**
 * Zone z's JD-800 tone (p18): the tone's own parameters ("JD-800 Tone Parameter", table [JD-800 Tone
 * Com]), four partials, Group A Effect (an [MFX] block) and Group B Effect (delay, chorus, reverb),
 * and the name and category under "Model Tone Common".
 */
const jd800Tone = (z) => {
  const root = `Temporary JD-800 Tone (zone ${z})`;
  const id = `jd800_${z}`;
  const label = `Zone ${z} JD-800`;
  return [
    { id, table: '[JD-800 Tone Com]', path: [root, 'JD-800 Tone Parameter'], group: label },
    ...[1, 2, 3, 4].map((p) => ({
      id: `${id}.partial${p}`, table: '[JD-800 Tone Partial]', path: [root, `JD-800 Tone Parameter Partial ${p}`], group: `${label} · Partial ${p}`,
    })),
    { id: `${id}.groupA`, table: '[MFX]', path: [root, 'JD-800 Tone Group A Effect'], group: `${label} · Group A Effect`, strip: MFX },
    { id: `${id}.groupB`, table: '[JD-800 Tone FxB]', path: [root, 'JD-800 Tone Group B Effect'], group: `${label} · Group B Effect` },
    { id: `${id}.common`, table: '[Model Tone Com]', path: [root, '[JD-800 Tone]::Model Tone Common'], group: `${label} · Common` },
  ];
};

export default {
  id: 'roland-fantom-ex',
  name: 'Roland FANTOM EX 6/7/8',
  family: 'FANTOM',
  map: 'fantom-ex',
  deviceId: 0x10,
  description: 'Roland FANTOM EX 6, FANTOM EX 7 and FANTOM EX 8 workstations: the temporary scene (common, effects, analog filter, '
    + 'and the zone, zone EQ and zone control blocks of all 16 zones) with zone 1\'s Z-Core, SN-A, EXSN, Model, n/zyme and JD-800 '
    + 'tones and drum kit, the V-Piano and VTW organ tones, and the system settings. From the temporary (edit-buffer) area of the '
    + 'MIDI Implementation.',

  // p12, Identity Reply: F0 7E dev 06 02 41 5B 03 00 00 rr 03 00 01 F7 — family code 5B 03, family
  // number code 00 00, software revision rr 03 00 01 with rr = 00 (EX 6), 01 (EX 7), 02 (EX 8). The
  // message lines and the byte tables agree.
  //
  // THIS IS THE FANTOM-6/7/8's FAMILY CODE AND FAMILY NUMBER (5B 03, 00 00; its manual p11). The two
  // replies differ only in the last software-revision byte (00 01 here, 00 00 there), and an identity
  // match does not read the revision, so this profile and roland-fantom each accept the other's
  // instrument. Nothing the generator can say tells them apart; see notes.
  identity: { familyCode: ['5B', '03'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ inputs: [1, 2] }),
    ...sceneBlocks({ analogFilter: true }),

    // Zone 1's tone, in each kind of tone a zone can play.
    ...zCoreTone({ root: 'Temporary Z-Core Tone (zone 1)', id: 'zcore1', label: 'Zone 1 Z-Core', envTable: (kind) => ENV[kind] }),
    ...snaTone(1),
    ...exsnTone(1),
    ...modelTone(1),
    ...nzymeTone(1),
    ...jd800Tone(1),
    ...vPianoTone(),
    ...vtwTone(),
    ...drumKit(1, { instKeys: INST_KEYS }),
  ],

  // p94 (the section opens at the foot of p93), "Example of an Exclusive Message and Calculating a
  // Checksum": Scene Level of the temporary scene, set to 74 — word for word the FANTOM-6/7/8's.
  examples: [sceneLevelExample('p94')],

  presets: scenePresets,

  coverage: {
    ...sharedCoverage,
    zoneTones: 'zone 1 only: the tones of zones 2-16 are the same tables at Z-Core 02 11 00 00 - 02 1F 00 00 (step 01 00 00), '
      + 'Drum Kit 02 32 00 00 - 02 4E 00 00 (step 02 00 00), Drum Kit Inst Set 03 04 00 00 - 03 3C 00 00 (step 04 00 00), '
      + 'SN-A 04 01 00 00 - 04 0F 00 00, EXSN 05 01 00 00 - 05 0F 00 00, Model 05 21 00 00 - 05 2F 00 00, '
      + 'n/zyme 05 41 00 00 - 05 4F 00 00 and JD-800 05 61 00 00 - 05 6F 00 00 (step 01 00 00), and are not laid out. '
      + 'The one V-Piano (04 20 00 00) and the one VTW tone (04 40 00 00) are',
    drumInstruments: 'zone 1\'s drum kit has every key\'s partial and partial EQ (keys 21-108); its instruments (Inst Common and the '
      + 'three Inst envelopes) only for keys 36-66. Keys 21-35 (03 00 00 00 - 03 00 46 00) and 67-108 (03 01 66 00 - 03 03 33 00) are left out',
    pianoDesignerKeys: 'the V-Piano\'s per-key Level and Character tables have 128 entries each; the map holds only the first and '
      + 'the last, the two rows p60 prints. Piano Designer Tuning (04 20 04 00, 512 bytes, 128 four-nibble entries of which p59 prints '
      + 'the first and the last) is not laid out: with only those two rows mapped, 508 bytes apart, the generator cuts its request '
      + 'between them and the first piece (508 bytes) is bigger than one 256-byte packet',
  },
  notes: [
    'Identity: the FANTOM EX\'s Identity Reply (p12) has the FANTOM-6/7/8\'s family code and family number (5B 03, 00 00); only the '
      + 'last software-revision byte differs (rr 03 00 01 against rr 03 00 00). Profiles match on family and number, not revision, so '
      + 'roland-fantom-ex and roland-fantom each recognise the other\'s instrument. Unconfirmed on hardware.',
    'One profile answers FANTOM EX 6, 7 and 8: they share the address map and model id (00 00 00 5B); only the first software-revision byte tells them apart (p12).',
    'Scene-level blocks for all 16 zones (Zone, Zone EQ, Zone Control); tones for zone 1 only: Z-Core at 02 10 00 00, drum kit at 02 30 00 00 with its instruments at 03 00 00 00, SN-A at 04 00 00 00, EXSN at 05 00 00 00, Model at 05 20 00 00, n/zyme at 05 40 00 00, JD-800 at 05 60 00 00, and the one V-Piano (04 20 00 00) and VTW (04 40 00 00) tones.',
    'Zone 1\'s drum-kit instruments cover keys 36-66, six fewer than the FANTOM-6/7/8 profile\'s 36-72, to make room for the n/zyme and JD-800 tones; keys 21-35 and 67-108 are the same Inst blocks every 00 05 00 from 03 00 00 00 and are left out to keep the profile under 12,000 parameters.',
    'The n/zyme and JD-800 tones keep their name and category in a block the map calls "Model Tone Common" (n/zyme 00 0A 00, JD-800 00 08 00), the Model tone\'s table.',
    'Many rows are printed without a number where they repeat: Name (16 bytes, as 16 rows), the two LFOs of a Partial LFO block, the 16 LFO steps, the four partials of a PMT, the n/zyme\'s 32 Wave Data and 16-step depths, curves and switches. The generator numbers them in printed order.',
  ],

  // Read on request, not at connect. Zone 1 plays one kind of tone at a time; the instrument does not
  // answer a request for the others ("If the conditions are not met, nothing is transmitted", p8), and
  // the startup read stops at the first request that is not answered. The V-Piano and VTW tones belong
  // to whichever zone plays them, which may be none.
  noPull: [/^(zcore1|sna1|exsn1|model1|nzyme1|jd800_1|vpiano|vtw|kit1)(\.|$)/],
};
