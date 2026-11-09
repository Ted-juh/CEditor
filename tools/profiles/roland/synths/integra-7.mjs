// The Roland INTEGRA-7: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "INTEGRA-7 MIDI Implementation", version 1.00, September 1 2012 (maps/integra-7.json says
// which file, with its hash). Page numbers below are that document's.
//
// The INTEGRA-7 is the sound module the FA-06/07/08 was later built around: a Studio Set of sixteen
// parts, and a temporary tone for each part (address map, p9):
//
//   01 00 00 00  Setup                         (sound mode, which studio set is selected)
//   02 00 00 00  System                        (System Common: tuning, control sources, tempo, 5.1ch)
//   18 00 00 00  Temporary Studio Set          — common, chorus, reverb, Motional Surround, master
//                EQ, a phase lock per MIDI channel, and for each of the sixteen parts a Part and a
//                Part EQ
//   19 00 00 00  Temporary Tone (Part 1)
//   19 20 00 00  Temporary Tone (Part 2)       … and so on, 00 20 00 00 apart, to
//   1C 60 00 00  Temporary Tone (Part 16)
//
// and each part's temporary tone is five tone types at five offsets, of which the part plays one.
// Unlike the FA-06/07/08's map, this one names them outright (p9, "Temporary Tone"):
//
//   + 00 00 00   Temporary PCM Synth Tone              common, MFX, partial mix table, four
//                                                      partials, common 2
//   + 01 00 00   Temporary SuperNATURAL Synth Tone     common, MFX, three partials
//   + 02 00 00   Temporary SuperNATURAL Acoustic Tone  common, MFX
//   + 03 00 00   Temporary SuperNATURAL Drum Kit       common, MFX, comp/EQ, one note per key
//                                                      from 27 to 88
//   + 10 00 00   Temporary PCM Drum Kit                common, MFX, comp/EQ, one partial per key
//                                                      from 21 to 108, common 2
//
// Laid out here: Setup and System, the whole Temporary Studio Set (all sixteen parts' Part and Part
// EQ), Part 1's temporary tone in every type it can hold, and — because the INTEGRA-7 is a rack
// module whose sixteen parts are all edited — the SuperNATURAL Acoustic tone of parts 2-16 too.
//
// Why that and no more: Part 1's tone in all five types is 8,882 parameters as laid out here (6,768
// of them the PCM kit's per-key partials), and with the studio set that leaves about 1,800 under the
// size an editor can load. No other part's tone fits in all five types (2,114 even without the PCM
// kit's partials). One type for every other part does, and the SuperNATURAL Acoustic tone is the
// one chosen: it is the INTEGRA-7's signature engine, its Common block carries the per-instrument
// Modify parameters, and Common + MFX is 97 parameters a part (1,455 for fifteen).
// A part that is not playing one is not asked for it at startup (noPull). The other four types of
// parts 2-16 are left out; coverage and notes say where they are.

const TONE_ROOT = (part) => `Temporary Tone (Part ${part})`;
const PARTS = Array.from({ length: 16 }, (unused, i) => i + 1);

/** Part 1's temporary tone is laid out in all five types; see `coverage.parts`. */
const TONE_PART = 1;

/** Parts whose SuperNATURAL Acoustic tone is laid out as well (and only that type). */
const SN_ACOUSTIC_PARTS = PARTS.filter((part) => part !== TONE_PART);

/* -------------------------------------------------------------- the studio set's per-part blocks */

const studioSetPart = (part) => [
  // "Part Mono/Poly (MONO ON/POLY ON)": the bracket names the mode messages, as (CC# n) names a CC.
  { id: `part${part}`, table: 'Studio Set Part', path: ['Temporary Studio Set', `Studio Set Part (Part ${part})`], group: `Part ${part}`, strip: /^Part\s+|\s*\(MONO ON\/POLY ON\)/g },
  { id: `part${part}.eq`, table: 'Studio Set Part EQ', path: ['Temporary Studio Set', `Studio Set Part EQ (Part ${part})`], group: `Part ${part} · EQ`, strip: /^EQ\s+/ },
];

/* -------------------------------------------------------------- one part's temporary tone */

const MFX = /^MFX\s+/;

function pcmSynthTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary PCM Synth Tone', entry];
  const id = `part${part}.pcmSynth`;
  const group = `Part ${part} · PCM Synth Tone`;
  return [
    { id: `${id}.common`, table: 'PCM Synth Tone Common', path: at('PCM Synth Tone Common'), group: `${group} · Common`, strip: /^PCM Synth Tone\s+/ },
    { id: `${id}.mfx`, table: 'PCM Synth Tone Common MFX', path: at('PCM Synth Tone Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.pmt`, table: 'PCM Synth Tone PMT (Partial Mix Table)', path: at('PCM Synth Tone PMT (Partial Mix Table)'), group: `${group} · Partial Mix Table`, strip: /^PMT\s+/ },
    ...[1, 2, 3, 4].map((partial) => ({
      id: `${id}.partial${partial}`,
      table: 'PCM Synth Tone Partial',
      path: at(`PCM Synth Tone Partial (Partial ${partial})`),
      group: `${group} · Partial ${partial}`,
      strip: /^Partial\s+/,
    })),
    { id: `${id}.common2`, table: 'PCM Synth Tone Common 2', path: at('PCM Synth Tone Common 2'), group: `${group} · Common 2` },
  ];
}

function superNaturalSynthTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary SuperNATURAL Synth Tone', entry];
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
  ];
}

function superNaturalAcousticTone(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary SuperNATURAL Acoustic Tone', entry];
  const id = `part${part}.snAcoustic`;
  const group = `Part ${part} · SN Acoustic Tone`;
  return [
    { id: `${id}.common`, table: 'SuperNATURAL Acoustic Tone Common', path: at('SuperNATURAL Acoustic Tone Common'), group: `${group} · Common`, strip: /^Tone\s+/ },
    { id: `${id}.mfx`, table: 'SuperNATURAL Acoustic Tone MFX', path: at('SuperNATURAL Acoustic Tone MFX'), group: `${group} · MFX`, strip: MFX },
  ];
}

/** SuperNATURAL drum kit notes, keys 27 to 88 (p9): sixty-two blocks of thirteen parameters. */
const SN_DRUM_KEYS = Array.from({ length: 62 }, (unused, i) => 27 + i);

function superNaturalDrumKit(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary SuperNATURAL Drum Kit', entry];
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
 * parameters each (159 rows: the twelve name bytes are one text parameter, each wave number one
 * four-nibble value), 12,672 on their own, more than the whole profile may hold. Laid out: the General MIDI percussion keys, 35 (Acoustic Bass
 * Drum) to 81 (Open Triangle), forty-seven of them, as the FA-06/07/08 profile does. Keys 21-34 and
 * 82-108 are the same block at the same stride; `coverage` says where.
 */
const PCM_DRUM_KEYS = Array.from({ length: 47 }, (unused, i) => 35 + i);

function pcmDrumKit(part) {
  const at = (entry) => [TONE_ROOT(part), 'Temporary PCM Drum Kit', entry];
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
  id: 'roland-integra-7',
  name: 'Roland INTEGRA-7',
  family: 'INTEGRA',
  map: 'integra-7',
  deviceId: 0x10,
  description: 'Roland INTEGRA-7 SuperNATURAL sound module: the setup, the system block, the whole temporary Studio Set '
    + 'with its sixteen parts, Motional Surround and effects, Part 1\'s temporary tone in each of the five tone types '
    + 'it can hold, and the SuperNATURAL Acoustic tone of parts 2-16, from the MIDI Implementation.',

  // p8, Identity Reply: F0 7E dev 06 02 41 64 02 00 00 00 00 00 00 F7. Device family code 64 02,
  // family number code 00 00; the message line and the byte table beneath it agree.
  identity: { familyCode: ['64', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    // "System Control 1 Source", "System Tempo", "System Clock Source": the block says System already.
    // "5.1CH Center Speaker Switch", "5.1CH Sub Woofer Switch" and "2CH Output Mode" would make ids
    // that begin with a digit; the names keep the channel counts.
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /^System\s+|^(?:5\.1|2)CH\s+/g, system: true },

    { id: 'studioSet', table: 'Studio Set Common', path: ['Temporary Studio Set', 'Studio Set Common'], group: 'Studio Set', strip: /^Studio Set\s+/ },
    { id: 'chorus', table: 'Studio Set Common Chorus', path: ['Temporary Studio Set', 'Studio Set Common Chorus'], group: 'Studio Set · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: 'Studio Set Common Reverb', path: ['Temporary Studio Set', 'Studio Set Common Reverb'], group: 'Studio Set · Reverb', strip: /^Reverb\s+/ },
    {
      id: 'motionalSurround',
      table: 'Studio Set Common Motional Surround',
      path: ['Temporary Studio Set', 'Studio Set Common Motional Surround'],
      group: 'Studio Set · Motional Surround',
      strip: /^Motional Surround\s+/,
    },
    { id: 'masterEq', table: 'Studio Set Master EQ', path: ['Temporary Studio Set', 'Studio Set Master EQ'], group: 'Studio Set · Master EQ', strip: /^EQ\s+/ },
    ...PARTS.map((channel) => ({
      id: `midi.ch${channel}`,
      table: 'Studio Set MIDI',
      path: ['Temporary Studio Set', `Studio Set MIDI (Channel ${channel})`],
      group: `Studio Set · MIDI Ch ${channel}`,
    })),
    ...PARTS.flatMap(studioSetPart),

    ...pcmSynthTone(TONE_PART),
    ...superNaturalSynthTone(TONE_PART),
    ...superNaturalAcousticTone(TONE_PART),
    ...superNaturalDrumKit(TONE_PART),
    ...pcmDrumKit(TONE_PART),
    ...SN_ACOUSTIC_PARTS.flatMap(superNaturalAcousticTone),
  ],

  // The manual's one worked SysEx message (p29, "Example of an Exclusive Message and Calculating a
  // Checksum"): the studio set's Reverb Type set to Room 2 (value 02), at 18 00 00 00 + 06 00 +
  // 00 00, with device ID 10H ("Device ID (17)", as the front panel counts it).
  examples: [
    {
      name: 'Setting Reverb Type of Studio Set to Room 2 (DT1)',
      where: 'p29',
      parameter: 'reverb.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 64 12 18 00 06 00 02 60 F7',
    },
  ],

  // p1, the Bank Select table for Studio Sets: 085/000, programs 1-64, "Studio Set 01 - 64" — one
  // bank of sixty-four, and the only studio-set group the table lists (the FA-06/07/08's has a
  // preset bank beside its user banks; this one has none).
  // Tones have banks of their own (SN Acoustic 89, SN Synth 95, SN Drum Kit 88, PCM Synth Tone 87,
  // PCM Drum Kit 86, GM2 121/120, expansions 92/93/96/97 and 89/88 at LSB 96-101), selected per
  // part through Studio Set Part's Tone Bank Select and Tone Program Number, which a studio-set
  // browser does not use.
  presets: {
    banks: [
      { id: 'studio-set', label: 'Studio Set 01-64', role: 'user', writable: true, startSlot: 0, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 0 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    parts: 'the Studio Set\'s Part and Part EQ blocks for all sixteen parts; the temporary TONE for Part 1 in all five types; '
      + 'for parts 2-16, the SuperNATURAL Acoustic tone only (Common and MFX). Temporary Tone (Part n) is at 19 00 00 00 + (n-1) x '
      + '00 20 00 00 (19 20 00 00, 19 40 00 00, 19 60 00 00, 1A 00 00 00 … 1C 60 00 00), with the five tone types at the same '
      + 'offsets inside it; for parts 2-16 these are not laid out: PCM Synth Tone (+00 00 00), SuperNATURAL Synth Tone (+01 00 00), '
      + 'SuperNATURAL Drum Kit (+03 00 00) and PCM Drum Kit (+10 00 00). One more part\'s tone in all five types would be 8,882 '
      + 'parameters as laid out here (2,114 without the PCM kit\'s per-key partials); the profile had room for about 1,800, '
      + 'which the fifteen SuperNATURAL Acoustic tones (1,455) use',
    pcmDrumKitKeys: 'PCM drum kit partials for keys 35-81 (the General MIDI percussion keys) only. The map has keys 21-108: '
      + 'partial (Key # k) is at the part\'s tone base + 10 00 00 + 00 10 00 + (k-21) x 00 02 00, so for Part 1 keys 21-34 are at '
      + '19 10 10 00-19 10 2A 00 and keys 82-108 at 19 11 0A 00-19 11 3E 00; all eighty-eight would be 12,672 parameters',
    toneTypes: 'a part plays one tone type at a time; the blocks of the types it is not playing are laid out at their addresses, '
      + 'but the manual does not say what the instrument does with a write to them. It does say (p7) that a request it cannot answer '
      + 'gets no reply, so no part\'s tone is in the startup read (noPull): Part 1\'s five types and parts 2-16\'s SuperNATURAL '
      + 'Acoustic tones are read when asked for',
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'nothing to model: the INTEGRA-7 has no keyboard or controllers to transmit, and sends only Active Sensing '
      + 'and System Exclusive (Identity Reply, DT1) — "Data Transmission", p8',
  },
  notes: [
    'Model id 00 00 64 throughout: the prose (p7), the RQ1 and DT1 byte tables (p7, p8), the address map heading (p9) and the worked example (p29) agree.',
    'The default device ID is 10H: the manual\'s example (p29) sends 10 and calls it "Device ID (17)", the front panel\'s count.',
    'Studio sets are recalled by Bank Select 85/0 and Program Change 1-64 (p1), on the profile\'s channel. On a part\'s receive '
      + 'channel the same messages select that part\'s tone (Studio Set Part: Tone Bank Select MSB/LSB, Tone Program Number), so for '
      + 'recall to change the studio set the profile\'s channel must be the Studio Set Control Channel (system.studioSetControlChannel, '
      + 'System Common 00 11). Setup holds the selected studio set\'s numbers as Studio Set BS MSB/LSB/PC (01 00 00 04-06).',
    'Each request asks for one whole block at its own start address and Total Size, which is what the manual requires ("data requests '
      + 'must be made with a fixed starting address and size", p7). No block of this map is bigger than one 256-byte packet, so none is split.',
    'One row is printed with a range and no name and keeps the id the generator gives a nameless row: PCM Synth Tone Common 2 '
      + '00 11 (0-255 on two nibbles, part1.pcmSynth.common2.offset0011). PCM Drum Kit Common prints three rows with neither a name '
      + 'nor a range (00 0D, 00 0E-00 0F as a two-nibble value, 00 10); with nothing to say what they hold they are not laid out.',
    'Every Control Source row prints one label fewer than its range: System Control 1-4 Source and Tone Control 1-4 Source '
      + '(0 - 97; OFF, CC01 - CC31, CC33 - CC95, BEND, AFT is 97 labels), MFX Control 1-4 Source (0 - 101; the same plus SYS1 - SYS4 '
      + 'is 101) and the PCM Synth Tone\'s Matrix Control 1-4 Source (0 - 109; 109 labels). The manual does not say which value is '
      + 'unlabelled, so these stay numbers carrying the printed list as their description.',
    'Studio Set Part prints Velocity Range Upper as (0 - 127) beside Velocity Range Lower\'s (1 - 127) and the partial mix table\'s '
      + 'and drum partials\' Velocity Range Upper (1 - 127); the range is kept as printed.',
  ],

  // Read on request, not at connect. Each part holds one of five tone types; the instrument sends nothing for a request it
  // cannot answer (p7), and the startup read stops at the first request that is not answered.
  noPull: [/^part\d+\.(pcmSynth|snSynth|snAcoustic|snDrums|pcmDrums)(\.|$)/],
};
