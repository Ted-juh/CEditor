// The Roland FANTOM-6/7/8: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "FANTOM-6/7/8 MIDI Implementation", version 1.00, Nov 1 2020 (eng01; maps/fantom.json says
// which file, with its hash). Page numbers below are that document's: the address map is pp14-16,
// the parameter tables pp16-63.
//
// A FANTOM scene is sixteen zones, each playing a tone of one of five kinds, and its address map
// says so (p14):
//
//   01 00 00 00  Setup                         (which scene is selected; transpose, octave)
//   01 00 02 00  Vocoder                       (the vocoder setting the scene has called up)
//   02 00 00 00  Temporary Scene               common, chorus, reverb, two IFX, and a Zone, Zone EQ and
//                                              Zone Control block for each of the 16 zones
//   02 10 00 00  Temporary Z-Core Tone (zone 1)        ... 02 1F 00 00 (zone 16)
//   02 30 00 00  Temporary Drum Kit (zone 1)           ... 02 4E 00 00 (zone 16)
//   03 00 00 00  Temporary Drum Kit Inst Set (zone 1)  ... 03 3C 00 00 (zone 16)
//   04 00 00 00  Temporary SN-A Tone (zone 1)          ... 04 0F 00 00 (zone 16)
//   04 20 00 00  Temporary V-Piano Tone                (one; only one zone can play the V-Piano)
//   05 00 00 00  Temporary EXSN Tone (zone 1)          ... 05 0F 00 00 (zone 16)
//
// This layout is the scene and every zone's scene-level blocks, and zone 1's tone in each of the
// kinds the map can reach. The other fifteen zones' tones are the same tables at the bases above;
// they are left out to keep the profile a size an editor can load (one zone's drum kit alone, with
// every key's instrument, is nearly 17,000 parameters). See `coverage` and `notes` for what is out.

import { zCoreTone } from '../layouts/fantom-tone.mjs';

// The FANTOM shares its envelope tables between a tone's partials and a drum kit's instruments,
// and heads each with both names (p42-43).
const ENV = { Pitch: '[Partial Pitch Env] / [Inst Pitch Env]', Filter: '[Partial Filter Env] / [Inst Filter Env]', Amp: '[Partial Amp Env] / [Inst Amp Env]' };

const ZONES = Array.from({ length: 16 }, (unused, i) => i + 1);

/** A drum kit has a partial and a partial EQ on every key from 21 (A0) to 108 (C8), p16. */
const KIT_KEYS = Array.from({ length: 88 }, (unused, i) => 21 + i);

/**
 * Each key's instrument (Inst Common, its three envelopes: 164 parameters a key) is laid out for
 * keys 36 (C2) to 72 (C5), the range the JD-Xi profile covers. All 88 would add 14,432 parameters
 * and put the profile near 21,000, so keys 21-35 and 73-108 are left out; their bases are in notes.
 */
const INST_KEYS = Array.from({ length: 37 }, (unused, i) => 36 + i);

const scene = (entry) => ['Temporary Scene', entry];
const KIT = 'Temporary Drum Kit (zone 1)';
const INST_SET = 'Temporary Drum Kit Inst Set (zone 1)';
const VPIANO = 'Temporary V-Piano Tone';

export default {
  id: 'roland-fantom',
  name: 'Roland FANTOM-6/7/8',
  family: 'FANTOM',
  map: 'fantom',
  deviceId: 0x10,
  description: 'Roland FANTOM-6, FANTOM-7 and FANTOM-8 workstations: the temporary scene (common, effects, and the zone, '
    + 'zone EQ and zone control blocks of all 16 zones) with zone 1\'s Z-Core tone, SN-A tone and drum kit, and the V-Piano tone. '
    + 'From the temporary (edit-buffer) area of the MIDI Implementation.',

  // p11, Identity Reply: F0 7E dev 06 02 41 5B 03 00 00 rr 03 00 00 F7. The three sizes share the
  // family code and number; only the first software-revision byte tells them apart (FANTOM-6 00,
  // FANTOM-7 01, FANTOM-8 02), and an identity match does not read the revision, so this profile
  // answers all three, which is right: they share one address map.
  identity: { familyCode: ['5B', '03'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: '[Setup]', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: '[System Common]', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    // The [System] table (p14) calls this entry "System Controller"; the table it points at is headed
    // "[System Control]" (p17).
    { id: 'systemControl', table: '[System Control]', path: ['System', 'System Controller'], group: 'System · Control', system: true },
    { id: 'masterComp', table: '[Master Comp]', path: ['System', 'Master Comp'], group: 'System · Master Comp', system: true },
    { id: 'masterEq', table: '[Master EQ]', path: ['System', 'Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    ...[1, 2].map((n) => ({
      id: `inputEq${n}`, table: '[Input EQ]', path: ['System', `Input EQ ${n}`], group: `System · Input EQ ${n}`, strip: /^EQ\s+/, system: true,
    })),
    { id: 'inputReverb', table: '[Reverb]', path: ['System', 'Input Reverb'], group: 'System · Input Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'tfx', table: '[MFX]', path: ['System', 'TFX'], group: 'System · TFX', strip: /^MFX\s+/, system: true },
    ...[1, 2].map((n) => ({
      id: `inputMfx${n}`, table: '[MFX]', path: ['System', `Input MFX ${n}`], group: `System · Input MFX ${n}`, strip: /^MFX\s+/, system: true,
    })),

    { id: 'vocoder', table: '[Vocoder]', path: ['Vocoder'], group: 'Vocoder', strip: /^Vocoder\s+/ },

    { id: 'scene', table: '[Scene Common]', path: scene('Scene Common'), group: 'Scene', strip: /^Scene\s+/ },
    { id: 'chorus', table: '[Chorus]', path: scene('Scene Chorus'), group: 'Scene · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: '[Reverb]', path: scene('Scene Reverb'), group: 'Scene · Reverb', strip: /^Reverb\s+/ },
    ...[1, 2].map((n) => ({ id: `ifx${n}`, table: '[MFX]', path: scene(`Scene IFX ${n}`), group: `Scene · IFX ${n}`, strip: /^MFX\s+/ })),
    ...ZONES.map((z) => ({ id: `zone${z}`, table: '[Scene Zone]', path: scene(`Scene Zone (Zone ${z})`), group: `Zone ${z}`, strip: /^Zone\s+/ })),
    ...ZONES.map((z) => ({ id: `zone${z}.eq`, table: '[Zone EQ]', path: scene(`Scene Zone EQ (Zone ${z})`), group: `Zone ${z} · EQ`, strip: /^EQ\s+/ })),
    // "External Mono/Poly (CC#126/127)" names two controllers, which the generator's own (CC#n) rule does not read.
    ...ZONES.map((z) => ({
      id: `zone${z}.control`, table: '[Zone Control]', path: scene(`Scene Zone Control (Zone ${z})`), group: `Zone ${z} · Control`, strip: /^Control\s+|\s*\(CC#126\/127\)/g,
    })),
    { id: 'controller', table: '[Scene Controller]', path: scene('Scene Controller'), group: 'Scene · Controllers' },
    { id: 'analogFilter', table: '[Analog Filter]', path: scene('Scene Analog Filter'), group: 'Scene · Analog Filter', strip: /^Analog Filter\s+/ },

    // Zone 1's tone, in each kind of tone a zone can play.
    ...zCoreTone({ root: 'Temporary Z-Core Tone (zone 1)', id: 'zcore1', label: 'Zone 1 Z-Core', envTable: (kind) => ENV[kind] }),

    { id: 'sna1.common', table: '[SN-A Tone Common]', path: ['Temporary SN-A Tone (zone 1)', 'SN-A Tone Common'], group: 'Zone 1 SN-A · Common' },
    { id: 'sna1.mfx', table: '[MFX]', path: ['Temporary SN-A Tone (zone 1)', 'SN-A Tone MFX'], group: 'Zone 1 SN-A · MFX', strip: /^MFX\s+/ },

    // The EXSN tone: printed below the top table's closing border on p14, which the parser now reads on through.
    { id: 'exsn1.common', table: '[EXSN Tone Common]', path: ['Temporary EXSN Tone (zone 1)', 'EXSN Tone Common'], group: 'Zone 1 EXSN · Common' },
    { id: 'exsn1.mfx', table: '[MFX]', path: ['Temporary EXSN Tone (zone 1)', 'EXSN Tone MFX'], group: 'Zone 1 EXSN · MFX', strip: /^MFX\s+/ },

    { id: 'kit1.common', table: '[Drum Kit Common]', path: [KIT, 'Drum Kit Common'], group: 'Zone 1 Kit · Common' },
    { id: 'kit1.mfx', table: '[MFX]', path: [KIT, 'Drum Kit MFX'], group: 'Zone 1 Kit · MFX', strip: /^MFX\s+/ },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `kit1.comp${n}`, table: '[Drum Kit Comp]', path: [KIT, `Drum Kit Comp ${n}`], group: `Zone 1 Kit · Comp ${n}`, strip: /^Comp\s+/ })),
    ...KIT_KEYS.map((key) => ({ id: `kit1.key${key}`, table: '[Drum Kit Partial]', path: [KIT, `Drum Kit Partial (Key# ${key})`], group: `Zone 1 Kit · Key ${key}` })),
    ...KIT_KEYS.map((key) => ({
      id: `kit1.key${key}.eq`, table: '[Partial EQ]', path: [KIT, `Drum Kit Partial EQ (Key# ${key})`], group: `Zone 1 Kit · Key ${key} · EQ`, strip: /^EQ\s+/,
    })),
    ...INST_KEYS.flatMap((key) => {
      const inst = (entry) => [INST_SET, `Drum Kit Inst (Key# ${key})`, entry];
      return [
        { id: `kit1.key${key}.inst`, table: '[Inst Common]', path: inst('Inst Common'), group: `Zone 1 Kit · Key ${key} · Inst` },
        { id: `kit1.key${key}.pitchEnv`, table: ENV.Pitch, path: inst('Inst Pitch Env'), group: `Zone 1 Kit · Key ${key} · Pitch Env`, strip: /^Pitch Env\s+/ },
        { id: `kit1.key${key}.filterEnv`, table: ENV.Filter, path: inst('Inst Filter Env'), group: `Zone 1 Kit · Key ${key} · Filter Env`, strip: /^TVF Env\s+/ },
        { id: `kit1.key${key}.ampEnv`, table: ENV.Amp, path: inst('Inst Amp Env'), group: `Zone 1 Kit · Key ${key} · Amp Env`, strip: /^TVA Env\s+/ },
      ];
    }),

    { id: 'vpiano.common', table: '[V-Piano Tone Common]', path: [VPIANO, 'V-Piano Tone Common'], group: 'V-Piano · Common' },
    { id: 'vpiano.mfx', table: '[MFX]', path: [VPIANO, 'V-Piano Tone MFX'], group: 'V-Piano · MFX', strip: /^MFX\s+/ },
    { id: 'vpiano.designer', table: '[Piano Designer Basic]', path: [VPIANO, 'Piano Designer Basic'], group: 'V-Piano · Piano Designer' },
    // Per-key tables of 128 entries each; p54 prints only the first and the last row with ":" between,
    // and the map keeps just those two. Piano Designer Tuning (00 04 00, 512 bytes) is left out: a
    // block over 256 bytes comes back as two DT1 packets (p8, p11: "Data larger than 256 bytes will be
    // divided into packets"), and a block's dump here is one message, so its request could not be read.
    { id: 'vpiano.level', table: '[Piano Designer Level]', path: [VPIANO, 'Piano Designer Level'], group: 'V-Piano · Key Level' },
    { id: 'vpiano.character', table: '[Piano Designer Character]', path: [VPIANO, 'Piano Designer Character'], group: 'V-Piano · Key Character' },
  ],

  // The manual's one worked SysEx message (p66, "Example of an Exclusive Message and Calculating a
  // Checksum"): Scene Level of the temporary scene, set to 74. It checks the 4-byte model id, the
  // Temporary Scene base, the Scene Common offset and the checksum against printed bytes.
  examples: [
    {
      name: 'Setting scene level to 74 (DT1)',
      where: 'p66',
      parameter: 'scene.level',
      value: 74,
      expectedHex: 'F0 41 10 00 00 00 5B 12 02 00 00 10 4A 24 F7',
    },
  ],

  // p1, the Bank Select table for Scenes: MSB 85, LSB 0 is A001-A128, LSB 1 is B001-B128, and then
  // the table goes on with ":" and does not say where it stops. Only the two printed banks are here.
  // The table names one group, "Scene" — tones and kits are split into User and Preset, scenes are
  // not — so they are taken as rewritable. Tones (MSB 87/89/90/93/101/105) and drum kits (MSB
  // 86/92/100) are selected per zone and are not a scene browser's banks.
  presets: {
    banks: [
      { id: 'scene-a', label: 'Scene A', role: 'user', writable: true, startSlot: 0, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 0 },
      { id: 'scene-b', label: 'Scene B', role: 'user', writable: true, startSlot: 128, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 1 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    zoneTones: 'zone 1 only: Z-Core, SN-A and drum kit tones of zones 2-16 are the same tables at '
      + 'Z-Core 02 11 00 00 - 02 1F 00 00 (step 01 00 00), Drum Kit 02 32 00 00 - 02 4E 00 00 (step 02 00 00), '
      + 'Drum Kit Inst Set 03 04 00 00 - 03 3C 00 00 (step 04 00 00) and SN-A 04 01 00 00 - 04 0F 00 00 (step 01 00 00), and are not laid out',
    drumInstruments: 'zone 1\'s drum kit has every key\'s partial and partial EQ (keys 21-108); its instruments (Inst Common and the '
      + 'three Inst envelopes) only for keys 36-72. Keys 21-35 (03 00 00 00 - 03 00 46 00) and 73-108 (03 02 04 00 - 03 03 33 00) are left out',
    exsnTone: 'zone 1\'s EXSN tone (05 00 00 00) is laid out; zones 2-16 are 05 01 00 00 - 05 0F 00 00. The manual prints these entries '
      + 'below the top table\'s closing border (p14)',
    pianoDesignerKeys: 'the V-Piano\'s per-key Level and Character tables have 128 entries each; the map holds only the first and '
      + 'the last, the two rows p54 prints. Piano Designer Tuning (04 20 04 00, 512 bytes) is not laid out: its reply is two 256-byte '
      + 'packets, which a one-message block dump cannot read',
    scenePresets: 'Scene banks A and B only: the Bank Select table (p1) continues past B with ":" and does not say how far',
    effectParameterMeanings: 'type-dependent: MFX/IFX/TFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits (CC, RPN) is not in the address map',
  },
  notes: [
    'One profile answers FANTOM-6, -7 and -8: they share the address map, the model id (00 00 00 5B) and the identity family code (5B 03); only the software revision tells them apart (p11).',
    'Scene-level blocks for all 16 zones (Zone, Zone EQ, Zone Control); tones for zone 1 only: Z-Core at 02 10 00 00, drum kit at 02 30 00 00 with its instruments at 03 00 00 00, SN-A at 04 00 00 00, and the one V-Piano tone at 04 20 00 00.',
    'Zone 1\'s drum-kit instruments cover keys 36-72; keys 21-35 and 73-108 are the same Inst blocks every 00 05 00 from 03 00 00 00 and are left out to keep the profile near 12,000 parameters.',
    'Many rows are printed without a number where they repeat: Name (16 bytes, as 16 rows), the two LFOs of a Partial LFO block, the 16 LFO steps, the four partials of a PMT, the four matrix controls of a partial, the four waves of a drum instrument. They are numbered in printed order.',
  ],

  // Read on request, not at connect. Zone 1 plays one kind of tone at a time; the instrument does not answer for the others, and the startup read stops at the first request that is not answered.
  noPull: [/^(zcore1|sna1|exsn1|kit1|vpiano)(\.|$)/],
};
