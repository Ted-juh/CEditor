// The Roland JD-Xi: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JD-Xi MIDI Implementation", version 1.00, May 1 2015 (maps/jd-xi.json says which file,
// with its hash). Page numbers below are that document's.
//
// The JD-Xi is four instruments in one box, and its address map says so:
//
//   18 00 00 00  Temporary Program — common, vocal effect, two effects, delay, reverb, and a
//                Part + Zone block for each of the four parts
//   19 00 00 00  Digital Synth Part 1's tone   (SuperNATURAL: common, three partials, modify)
//   19 20 00 00  Digital Synth Part 2's tone   (the same, again)
//   19 40 00 00  Analog Synth Part's tone
//   19 60 00 00  Drums Part's kit              (common, and one partial per key, 36 to 72)
//
// so the layout below is that tree, written as the path of names the map's offset tables use. The
// generator resolves each path and refuses a name that is missing or ambiguous.

const SN = 'SuperNATURAL Synth Tone';
const digital = (part) => {
  const root = `Temporary Tone (Digital Synth Part ${part})`;
  const tone = 'Temporary SuperNATURAL Synth Tone';
  return [
    { id: `digital${part}.common`, table: `${SN} Common`, path: [root, tone, `${SN} Common`], group: `Digital ${part} · Common` },
    ...[1, 2, 3].map((partial) => ({
      id: `digital${part}.partial${partial}`,
      table: `${SN} Partial`,
      path: [root, tone, `${SN} Partial (${partial})`],
      group: `Digital ${part} · Partial ${partial}`,
    })),
    { id: `digital${part}.modify`, table: `${SN} Modify`, path: [root, tone, `${SN} Modify`], group: `Digital ${part} · Modify` },
  ];
};

const PARTS = [
  ['digital1', 'Digital Synth Part 1', 'Digital 1'],
  ['digital2', 'Digital Synth Part 2', 'Digital 2'],
  ['analog', 'Analog Synth Part', 'Analog'],
  ['drums', 'Drums Part', 'Drums'],
];

/** Drum keys 36 (C2) to 72 (C5): thirty-seven partials, each the same 195-byte block. */
const DRUM_KEYS = Array.from({ length: 37 }, (unused, i) => 36 + i);

export default {
  id: 'roland-jd-xi',
  name: 'Roland JD-Xi',
  family: 'JD',
  map: 'jd-xi',
  deviceId: 0x10,
  description: 'Roland JD-Xi crossover synthesizer: two SuperNATURAL digital parts, an analog part and a drum part, '
    + 'with the program they sit in. Every block of the temporary (edit-buffer) area in the MIDI Implementation.',

  // p6, Identity Reply: F0 7E dev 06 02 41 0E 03 00 00 00 03 00 00 F7.
  identity: { familyCode: ['0E', '03'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    { id: 'program', table: 'Program Common', path: ['Temporary Program', 'Program Common'], group: 'Program', strip: /^Program\s+/ },
    { id: 'vocalFx', table: 'Program Vocal Effect', path: ['Temporary Program', 'Program Vocal Effect'], group: 'Program · Vocal Effect' },
    { id: 'efx1', table: 'Program Effect 1', path: ['Temporary Program', 'Program Effect 1'], group: 'Program · Effect 1', strip: /^EFX1\s+/ },
    { id: 'efx2', table: 'Program Effect 2', path: ['Temporary Program', 'Program Effect 2'], group: 'Program · Effect 2', strip: /^EFX2\s+/ },
    { id: 'delay', table: 'Program Delay', path: ['Temporary Program', 'Program Delay'], group: 'Program · Delay', strip: /^Delay\s+/ },
    { id: 'reverb', table: 'Program Reverb', path: ['Temporary Program', 'Program Reverb'], group: 'Program · Reverb', strip: /^Reverb\s+/ },
    ...PARTS.map(([id, name, label]) => ({
      id: `part.${id}`, table: 'Program Part', path: ['Temporary Program', `Program Part (${name})`], group: `${label} · Part`, strip: /^Part\s+/,
    })),
    ...PARTS.map(([id, name, label]) => ({
      id: `zone.${id}`, table: 'Program Zone', path: ['Temporary Program', `Program Zone (${name})`], group: `${label} · Zone`, strip: /^Zone\s+/,
    })),
    { id: 'controller', table: 'Program Controller', path: ['Temporary Program', 'Program Controller'], group: 'Program · Arpeggio', strip: /^Arpeggio\s+/ },

    ...digital(1),
    ...digital(2),

    {
      id: 'analog',
      table: 'Analog Synth Tone',
      path: ['Temporary Tone (Analog Synth Part)', 'Temporary Analog Synth Tone', 'Analog Synth Tone'],
      group: 'Analog · Tone',
    },

    { id: 'drums.common', table: 'Drum Kit Common', path: ['Temporary Tone (Drums Part)', 'Temporary Drum Kit', 'Drum Kit Common'], group: 'Drums · Kit', strip: /^Kit\s+/ },
    ...DRUM_KEYS.map((key) => ({
      id: `drums.key${key}`,
      table: 'Drum Kit Partial',
      path: ['Temporary Tone (Drums Part)', 'Temporary Drum Kit', `Drum Kit Partial (Key # ${key})`],
      group: `Drums · Key ${key}`,
    })),
  ],

  // The manual's one worked SysEx message (p18, "Example of an Exclusive Message and Calculating a
  // Checksum"): Effect 1 Reverb Send Level of the program, set to 100. It exercises the 4-byte
  // model id, the Temporary Program base, a block offset and the checksum, against printed bytes.
  examples: [
    {
      name: 'Setting Effect 1 Reverb Send Level of Program to 100 (DT1)',
      where: 'p18',
      parameter: 'efx1.reverbSendLevel',
      value: 100,
      expectedHex: 'F0 41 10 00 00 00 0E 12 18 00 02 03 64 7F F7',
    },
  ],

  // p1, the Bank Select table for Programs. Tones have banks of their own (SuperNATURAL 95/64-65,
  // Analog 94/64, Drum Kits 86/64), selected per part, which a program-level browser does not use.
  presets: {
    banks: [
      { id: 'user-e', label: 'User E', role: 'user', writable: true, startSlot: 0, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 0 },
      { id: 'user-f', label: 'User F', role: 'user', writable: true, startSlot: 64, slotCount: 64, programBase: 64, bankMsb: 85, bankLsb: 0 },
      { id: 'user-g', label: 'User G', role: 'user', writable: true, startSlot: 128, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 1 },
      { id: 'user-h', label: 'User H', role: 'user', writable: true, startSlot: 192, slotCount: 64, programBase: 64, bankMsb: 85, bankLsb: 1 },
      { id: 'preset-a', label: 'Preset A', role: 'factory', writable: false, startSlot: 256, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 64 },
      { id: 'preset-b', label: 'Preset B', role: 'factory', writable: false, startSlot: 320, slotCount: 64, programBase: 64, bankMsb: 85, bankLsb: 64 },
      { id: 'preset-c', label: 'Preset C', role: 'factory', writable: false, startSlot: 384, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 65 },
      { id: 'preset-d', label: 'Preset D', role: 'factory', writable: false, startSlot: 448, slotCount: 64, programBase: 64, bankMsb: 85, bankLsb: 65 },
      ...'STUVWXYZ'.split('').map((letter, i) => ({
        id: `extra-${letter.toLowerCase()}`, label: `Extra ${letter}`, role: 'factory', writable: false,
        startSlot: 512 + i * 64, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 96 + i,
      })),
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: EFX, delay and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: the front panel\'s CC and NRPN (Control Change Message List, p14) are not mapped yet',
  },
  notes: [
    'Digital parts 1 and 2 are the same SuperNATURAL tone layout at 19 00 00 00 and 19 20 00 00; the analog part is at 19 42 00 00; the drum kit at 19 70 00 00, one partial per key from 36 to 72.',
  ],
};
