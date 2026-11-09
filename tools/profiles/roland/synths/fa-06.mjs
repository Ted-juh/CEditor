// The Roland FA-06, FA-07 and FA-08: which parts of their address map make up the edit buffer, and
// what to call them. One profile covers all three: the same sound engine, the same address map,
// the same model id; the Identity Reply tells them apart only in its software-revision bytes.
//
// Source: "FA-06/07/08 MIDI Implementation", version 1.01, June 1 2017 (maps/fa-06.json says which
// file, with its hash). Page numbers below are that document's.
//
// The address map (p12) is a Studio Set of sixteen parts, and a temporary tone for each part:
//
//   01 00 00 00  Setup                         (sound mode, which studio set, transpose)
//   02 00 00 00  System                        (common, master EQ, input effect, TFX, controllers)
//   18 00 00 00  Temporary Studio Set          — common, chorus, reverb, IFX, master comp, a phase
//                lock per MIDI channel, and for each of the sixteen parts a Part, a Part EQ, a
//                Zone and a "Part 2" (its master-keyboard transmit settings); controller, pads
//   19 00 00 00  Temporary Tone (Studio Mode Part 1)
//   19 20 00 00  Temporary Tone (Studio Mode Part 2)   … and so on, 00 20 00 00 apart, to
//   1C 60 00 00  Temporary Tone (Studio Mode Part 16)
//
// and each part's temporary tone is five tone types at five offsets, of which the part plays one:
//
//   + 00 00 00   Temporary PCM Tone           PCM Synth Tone: common, MFX, partial mix table,
//                                             four partials, common 2
//   + 01 00 00   Temporary Synth Tone         SuperNATURAL Synth Tone: common, MFX, three
//                                             partials, misc
//   + 02 00 00   Temporary SuperNATURAL Tone  SuperNATURAL Acoustic Tone: common, MFX
//   + 03 00 00   Temporary Drum Kit           SuperNATURAL Drum Kit: common, MFX, comp/EQ, one
//                                             note per key from 27 to 88
//   + 10 00 00   Temporary Rhythm Set         PCM Drum Kit: common, MFX, comp/EQ, one partial per
//                                             key from 21 to 108, common 2
//
// The manual's Temporary Tone table (p12) names those five entries and stops: it does not say which
// tone table is laid at which. The pairing above is by name and by Roland's practice — the same
// engine's INTEGRA-7 prints it outright (PCM Synth Tone, SuperNATURAL Synth Tone, SuperNATURAL
// Acoustic Tone, SuperNATURAL Drum Kit, PCM Drum Kit, at the same five offsets), and "Rhythm Set"
// is the older Roland name for a PCM drum kit. Every block fits inside its slot either way.
//
// Laid out here: Setup and System, the whole Temporary Studio Set, and Part 1's temporary tone in
// every type it can hold. Parts 2 to 16's tones are the same blocks again at their own base, and
// are left out to keep the profile to a size an editor can load (coverage and notes say where).

const TONE_ROOT = (part) => `Temporary Tone (Studio Mode Part ${part})`;
const PARTS = Array.from({ length: 16 }, (unused, i) => i + 1);

/** Part 1 is the only temporary tone laid out; see `coverage.parts`. */
const TONE_PART = 1;

/* -------------------------------------------------------------- the studio set's per-part blocks */

const studioSetPart = (part) => [
  // "Part Mono/Poly (MONO ON/POLY ON)": the bracket names the mode messages, as (CC# n) names a CC.
  { id: `part${part}`, table: 'Studio Set Part', path: ['Temporary Studio Set', `Studio Set Part (Part ${part})`], group: `Part ${part}`, strip: /^Part\s+|\s*\(MONO ON\/POLY ON\)/g },
  { id: `part${part}.eq`, table: 'Studio Set Part EQ', path: ['Temporary Studio Set', `Studio Set Part EQ (Part ${part})`], group: `Part ${part} · EQ`, strip: /^EQ\s+/ },
  // The manual numbers its zones as it numbers its parts: Zone n is Part n's keyboard zone.
  { id: `part${part}.zone`, table: 'Studio Set Zone', path: ['Temporary Studio Set', `Studio Set Zone (Zone ${part})`], group: `Part ${part} · Zone` },
  // "Studio Set Part 2" is the part's MKB (master keyboard) side: Part TX, and what it transmits.
  // Its CC numbers are printed "(CC0)", without the "#" the generator already leaves out of ids.
  { id: `part${part}.mkb`, table: 'Studio Set Part 2', path: ['Temporary Studio Set', `Studio Set Part 2 (Part ${part})`], group: `Part ${part} · MKB`, strip: /^MKB\s+|\s*\(CC\d+\)/g },
];

/* -------------------------------------------------------------- one part's temporary tone */

const MFX = /^MFX\s+/;

function pcmSynthTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary PCM Tone', entry];
  const id = `part${part}.pcmSynth`;
  const group = `Part ${part} · PCM Synth Tone`;
  return [
    // The offset table is headed "PCM Systh Tone" (sic, p12); the parameter tables "PCM Synth Tone".
    { id: `${id}.common`, table: 'PCM Synth Tone Common', path: at('PCM Systh Tone Common'), group: `${group} · Common`, strip: /^PCM Synth Tone\s+/ },
    { id: `${id}.mfx`, table: 'PCM Synth Tone Common MFX', path: at('PCM Systh Tone Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.pmt`, table: 'PCM Synth Tone PMT (Partial Mix Table)', path: at('PCM Systh Tone PMT (Partial Mix Table)'), group: `${group} · Partial Mix Table`, strip: /^PMT\s+/ },
    ...[1, 2, 3, 4].map((partial) => ({
      id: `${id}.partial${partial}`,
      table: 'PCM Synth Tone Partial',
      path: at(`PCM Systh Tone Partial (Partial ${partial})`),
      group: `${group} · Partial ${partial}`,
      strip: /^Partial\s+/,
    })),
    { id: `${id}.common2`, table: 'PCM Synth Tone Common 2', path: at('PCM Systh Tone Common 2'), group: `${group} · Common 2` },
  ];
}

function superNaturalSynthTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary Synth Tone', entry];
  const id = `part${part}.snSynth`;
  const group = `Part ${part} · SN Synth Tone`;
  return [
    { id: `${id}.common`, table: 'SuperNATURAL Synth Tone Common', path: at('SuperNATURAL Synth Tone Common'), group: `${group} · Common`, strip: /^Tone\s+/ },
    // The offset entry is "… Tone MFX"; the table it points at is headed "… Tone Common MFX".
    { id: `${id}.mfx`, table: 'SuperNATURAL Synth Tone Common MFX', path: at('SuperNATURAL Synth Tone MFX'), group: `${group} · MFX`, strip: MFX },
    ...[1, 2, 3].map((partial) => ({
      id: `${id}.partial${partial}`,
      table: 'SuperNATURAL Synth Tone Partial',
      path: at(`SuperNATURAL Synth Tone Partial (${partial})`),
      group: `${group} · Partial ${partial}`,
    })),
    { id: `${id}.misc`, table: 'SuperNATURAL Synth Tone Misc', path: at('SuperNATURAL Synth Tone Misc'), group: `${group} · Misc` },
  ];
}

function superNaturalAcousticTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary SuperNATURAL Tone', entry];
  const id = `part${part}.snAcoustic`;
  const group = `Part ${part} · SN Acoustic Tone`;
  return [
    { id: `${id}.common`, table: 'SuperNATURAL Acoustic Tone Common', path: at('SuperNATURAL Acoustic Tone Common'), group: `${group} · Common`, strip: /^Tone\s+/ },
    { id: `${id}.mfx`, table: 'SuperNATURAL Acoustic Tone MFX', path: at('SuperNATURAL Acoustic Tone MFX'), group: `${group} · MFX`, strip: MFX },
  ];
}

/** SuperNATURAL drum kit notes, keys 27 to 88 (p12): sixty-two blocks of thirteen parameters. */
const SN_DRUM_KEYS = Array.from({ length: 62 }, (unused, i) => 27 + i);

function superNaturalDrumKit(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary Drum Kit', entry];
  const id = `part${part}.snDrums`;
  const group = `Part ${part} · SN Drum Kit`;
  return [
    { id: `${id}.common`, table: 'SuperNATURAL Drum Kit Common', path: at('SuperNATURAL Drum Kit Common'), group: `${group} · Common`, strip: /^Kit\s+/ },
    { id: `${id}.mfx`, table: 'SuperNATURAL Drum Kit MFX', path: at('SuperNATURAL Drum Kit MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.compEq`, table: 'SuperNATURAL Drum Kit Common Comp/EQ', path: at('SuperNATURAL Drum Kit Common Comp/EQ'), group: `${group} · Comp/EQ` },
    ...SN_DRUM_KEYS.map((key) => ({
      id: `${id}.key${key}`,
      table: 'SuperNATURAL Drum Kit Note',
      path: at(`SuperNATURAL Drum Kit Note (Key # ${key})`),
      group: `${group} · Key ${key}`,
    })),
  ];
}

/**
 * PCM drum kit partials. The map has one for every key from 21 to 108 — eighty-eight blocks of 144
 * parameters each, 12,672 on their own, more than the rest of this profile three times over. Laid
 * out: the General MIDI percussion keys, 35 (Acoustic Bass Drum) to 81 (Open Triangle), forty-seven
 * of them. Keys 21-34 and 82-108 are the same block at the same stride; `coverage` says where.
 */
const PCM_DRUM_KEYS = Array.from({ length: 47 }, (unused, i) => 35 + i);

function pcmDrumKit(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary Rhythm Set', entry];
  const id = `part${part}.pcmDrums`;
  const group = `Part ${part} · PCM Drum Kit`;
  return [
    { id: `${id}.common`, table: 'PCM Drum Kit Common', path: at('PCM Drum Kit Common'), group: `${group} · Common`, strip: /^Kit\s+/ },
    { id: `${id}.mfx`, table: 'PCM Drum Kit Common MFX', path: at('PCM Drum Kit Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.compEq`, table: 'PCM Drum Kit Common Comp/EQ', path: at('PCM Drum Kit Common Comp/EQ'), group: `${group} · Comp/EQ` },
    ...PCM_DRUM_KEYS.map((key) => ({
      id: `${id}.key${key}`,
      table: 'PCM Drum Kit Partial',
      path: at(`PCM Drum Kit Partial (Key # ${key})`),
      group: `${group} · Key ${key}`,
      strip: /^Partial\s+/,
    })),
    { id: `${id}.common2`, table: 'PCM Drum Kit Common 2', path: at('PCM Drum Kit Common 2'), group: `${group} · Common 2` },
  ];
}

export default {
  id: 'roland-fa-06',
  name: 'Roland FA-06/07/08',
  family: 'FA',
  map: 'fa-06',
  deviceId: 0x10,
  description: 'Roland FA-06, FA-07 and FA-08 music workstations (one sound engine, one address map): the setup, '
    + 'the system blocks, the whole temporary Studio Set with its sixteen parts, and Part 1\'s temporary tone in each of '
    + 'the five tone types it can hold, from the MIDI Implementation.',

  // p9, Identity Reply: F0 7E dev 06 02 41 77 02 00 00 dd 00 ll 00 F7, where dd is the model
  // (00 FA-06, 01 FA-08, 02 FA-07) and ll the firmware (00 up to 1.03, 01 from 2.00). Family code
  // 77 02, family number 00 00 for all three, so the one profile answers to each of them.
  identity: { familyCode: ['77', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemEq', table: 'System Master EQ', path: ['System', 'System Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'inputFx', table: 'System Input EFX', path: ['System', 'System Input EFX'], group: 'System · Input Effect', strip: /^Input\s+/, system: true },
    // TFX ("total effect") is a system block whose parameters the manual names "MFX Parameter n".
    { id: 'tfx', table: 'TFX', path: ['System', 'TFX'], group: 'System · TFX', strip: /^(?:TFX|MFX)\s+/, system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    { id: 'studioSet', table: 'Studio Set Common', path: ['Temporary Studio Set', 'Studio Set Common'], group: 'Studio Set' },
    { id: 'chorus', table: 'Studio Set Chorus', path: ['Temporary Studio Set', 'Studio Set Chorus'], group: 'Studio Set · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: 'Studio Set Reverb', path: ['Temporary Studio Set', 'Studio Set Reverb'], group: 'Studio Set · Reverb', strip: /^Reverb\s+/ },
    { id: 'ifx', table: 'IFX', path: ['Temporary Studio Set', 'IFX'], group: 'Studio Set · IFX', strip: /^IFX\s+/ },
    { id: 'masterComp', table: 'Studio Set Master Comp', path: ['Temporary Studio Set', 'Studio Set Master Comp'], group: 'Studio Set · Master Comp', strip: /^Master Comp\s+/ },
    ...PARTS.map((channel) => ({
      id: `midi.ch${channel}`,
      table: 'Studio Set MIDI',
      path: ['Temporary Studio Set', `Studio Set MIDI (Channel ${channel})`],
      group: `Studio Set · MIDI Ch ${channel}`,
    })),
    ...PARTS.flatMap(studioSetPart),
    { id: 'controller', table: 'Studio Set Controller', path: ['Temporary Studio Set', 'Studio Set Controller'], group: 'Studio Set · Controller' },
    { id: 'pads', table: 'Studio Set Pad Common', path: ['Temporary Studio Set', 'Studio Set Pad Common'], group: 'Studio Set · Pads', strip: /^Pad\s+/ },
    ...PARTS.map((pad) => ({
      id: `pad${pad}`,
      table: 'Studio Set Pad',
      path: ['Temporary Studio Set', `Studio Set Pad (Pad ${pad})`],
      group: `Studio Set · Pad ${pad}`,
    })),

    ...pcmSynthTone(TONE_PART),
    ...superNaturalSynthTone(TONE_PART),
    ...superNaturalAcousticTone(TONE_PART),
    ...superNaturalDrumKit(TONE_PART),
    ...pcmDrumKit(TONE_PART),
  ],

  // The manual's one worked SysEx message (p36, "Example of an Exclusive Message and Calculating a
  // Checksum"): the studio set's Reverb Type set to Room 2 (value 02), at 18 00 00 00 + 02 00 +
  // 00 01. Its bytes carry the model id 00 00 77, as the address map's heading does (p12) — not the
  // 00 00 64 that the prose on p6 states.
  examples: [
    {
      name: 'Setting Reverb Type of Studio Set to Room 2 (DT1)',
      where: 'p36',
      parameter: 'reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 77 12 18 00 02 01 02 63 F7',
    },
  ],

  // p1, the Bank Select table for Studio Sets: User 085/000-003, programs 1-128 in each (512), and
  // Preset 085/064, programs 1-69. Tones have banks of their own (SN Acoustic 89, SN Synth 95,
  // SN Drum Kit 88, PCM Synth Tone 87, PCM Drum Kit 86, GM2 121/120), selected per part, which a
  // studio-set browser does not use.
  presets: {
    banks: [
      ...[0, 1, 2, 3].map((lsb) => ({
        id: `user-${lsb + 1}`,
        label: `User ${String(lsb * 128 + 1).padStart(3, '0')}-${String(lsb * 128 + 128).padStart(3, '0')}`,
        role: 'user',
        writable: true,
        startSlot: lsb * 128,
        slotCount: 128,
        programBase: 0,
        bankMsb: 85,
        bankLsb: lsb,
      })),
      { id: 'preset', label: 'Preset 01-69', role: 'factory', writable: false, startSlot: 512, slotCount: 69, programBase: 0, bankMsb: 85, bankLsb: 64 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    parts: 'the Studio Set\'s Part, Part EQ, Zone and Part 2 (MKB) blocks for all sixteen parts; the temporary TONE for Part 1 only, '
      + 'in all five types. Parts 2-16\'s temporary tones are not laid out: Temporary Tone (Studio Mode Part n) is at '
      + '19 00 00 00 + (n-1) x 00 20 00 00 (19 20 00 00, 19 40 00 00, 19 60 00 00, 1A 00 00 00 … 1C 60 00 00), with the same '
      + 'five tone types at the same offsets inside it',
    pcmDrumKitKeys: 'PCM drum kit partials for keys 35-81 (the General MIDI percussion keys) only. The map has keys 21-108: '
      + 'partial (Key # k) is at the part\'s tone base + 10 00 00 + 00 10 00 + (k-21) x 00 02 00, so for Part 1 keys 21-34 are at '
      + '19 10 10 00-19 10 2A 00 and keys 82-108 at 19 11 0A 00-19 11 3E 00; all eighty-eight would be 12,672 parameters',
    toneTypes: 'a part plays one tone type at a time; the blocks of the other four types are laid out at their addresses, '
      + 'but the manual does not say what the instrument does with a write or a request to a type the part is not playing. '
      + 'It does say (p6) that a request it cannot answer gets no reply, and the startup pull asks for all five types in turn, '
      + 'so on hardware the pull may stop at the first tone type Part 1 is not playing',
    effectParameterMeanings: 'type-dependent: MFX, IFX, TFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits (Control Change, p7-9) is not mapped yet',
  },
  notes: [
    'One profile for the FA-06, FA-07 and FA-08: the Identity Reply (p9) is the same family 77 02 / 00 00 for all three, '
      + 'and only its software-revision bytes say which (dd = 00 FA-06, 01 FA-08, 02 FA-07).',
    'Model id 00 00 77, as the address map heading (p12), the DT1/RQ1 byte tables (p6, p9) and the worked example (p36) give it. '
      + 'The sentence on p6 ("The model ID … is 00H 00H 64H") and the transmitted DT1\'s status line on p9 say 64H, which is the '
      + 'INTEGRA-7\'s model id; the byte tables directly beneath both say 77H.',
    'The Temporary Tone table (p12) names its entries Temporary PCM Tone, Synth Tone, SuperNATURAL Tone, Drum Kit and Rhythm Set '
      + 'without saying which tone table each holds; they are read as PCM Synth Tone (+00 00 00), SuperNATURAL Synth Tone (+01 00 00), '
      + 'SuperNATURAL Acoustic Tone (+02 00 00), SuperNATURAL Drum Kit (+03 00 00) and PCM Drum Kit (+10 00 00), the INTEGRA-7\'s printed layout.',
    'Zone n (Studio Set Zone) is filed under Part n: the manual numbers the sixteen zones as it numbers the sixteen parts.',
    'Seven rows are printed with a range and no name, and keep the id the generator gives a nameless row: System Common 00 06 (0-1, '
      + 'system.value), TFX 00 02-00 05 (0-127 each, tfx.value and tfx.value_<address>), Studio Set Common 00 34 (0-15, studioSet.value) '
      + 'and Studio Set Controller 00 18 (0-15, controller.value).',
  ],

  // Read on request, not at connect. Part 1 holds one of five tone types; the other four are not answered (p6), and the startup read stops at the first request that is not.
  noPull: [/^part1\.(pcmSynth|snSynth|snAcoustic|snDrums|pcmDrums)(\.|$)/],
};
