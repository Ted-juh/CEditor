// The Roland SH-32 (2001), a four-part virtual-analog synthesizer module: which parts of its address
// map make up the edit buffer, and what to call them.
//
// Source: "SH-32 MIDI Implementation", version 1.00, Dec. 12 2001 (maps/sh-32.json says which file,
// with its hash; the importer read the version and not the date). Page numbers below are that
// document's. Its model ID is two bytes, 00 4A (the address map heading, p6, and the RQ1 and DT1
// byte tables, p4 and p6).
//
// The SH-32 plays a Performance (four parts, the fourth a patch or a rhythm set) or, in Patch mode,
// one patch or rhythm set, and its address map (p6) holds a temporary area for each mode:
//
//   00 00 00 00  System                                       one block, System Common
//   10 00 00 00  Temporary Performance                        common, and a Part block per part
//   11 00 00 00  Temporary Patch (Performance Mode Part 1)    11 20 00 00 Part 2, 11 40 00 00 Part 3
//   11 60 00 00  Temporary Patch/Rhythm (Performance Mode Part 4)
//   14 00 00 00  Temporary Patch/Rhythm (Patch Mode)          a patch at +00 00 00, a rhythm set at +10 00 00
//   15 00 00 00  Temporary Arpeggio Style (Performance Mode)  common, sixteen notes of 32 grid steps
//   16 00 00 00  Temporary Rhythm Style (Performance Mode)    the same table
//   17 00 00 00  Temporary Arpeggio/Rhythm Style (Patch Mode) the same table
//   18 00 00 00  Temporary Chord Form (Performance Mode)      one on/off per note
//   19 00 00 00  Temporary Chord Form (Patch Mode)
//   20 00 00 00 and up: user Performances, Patches, Rhythm Sets, styles and chord forms (memory)
//
// A patch is common, INS-FX, REV/DELAY and two oscillators; a rhythm set is common, INS-FX,
// REV/DELAY and one tone per key, 21 to 108.
//
// Laid out: System (a system block); the whole Temporary Performance; Part 1's patch (Part 1 holds a
// patch only); the Performance-mode arpeggio style, rhythm style and chord form; and the Patch mode
// whole — its patch and its rhythm set with all 88 keys, its style and its chord form. Parts 2-4's
// temporary patches (and Part 4's rhythm set) are the same blocks again and are left out.

const PERFORMANCE = 'Temporary Performance';
const PART1 = 'Temporary Patch (Performance Mode Part 1)';
const PATCH_MODE = 'Temporary Patch/Rhythm (Patch Mode)';
const PATCH = [PATCH_MODE, 'Temporary Patch'];
const RHYTHM = [PATCH_MODE, 'Temporary Rhythm Set'];

const NOTES = Array.from({ length: 16 }, (unused, i) => i + 1);
const KEYS = Array.from({ length: 88 }, (unused, i) => 21 + i);

// Roland's octave numbering, as the Chord Pattern table prints it: note 60 is C4.
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const noteName = (key) => `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

// "CC#1 LFO1 Pitch Mod Sens": the # is "number", not a sharp — cc1Lfo1PitchModSens, not ccSharp1….
const CC_NUMBER = /(?<=CC)#/;

// "REV/DELAY Type" is revDelay.type; "L-R SHIFT/MOD DEPTH" is lrShiftModDepth, not lRShift….
const REV_DELAY = /^REV\/DELAY\s+|(?<=L)-(?=R)/g;

/** A patch: common, INS-FX, REV/DELAY, two oscillators. `path` leads to the patch's base. */
const patch = (id, path, label) => [
  { id, table: 'Patch Common', path: [...path, 'Patch Common'], group: `${label} · Common`, strip: new RegExp(`^Patch\\s+|${CC_NUMBER.source}`, 'g') },
  { id: `${id}.insFx`, table: 'Patch INS-FX', path: [...path, 'Patch INS-FX'], group: `${label} · INS-FX`, strip: /^INS-FX\s+/ },
  { id: `${id}.revDelay`, table: 'Patch REV/DELAY', path: [...path, 'Patch REV/DELAY'], group: `${label} · REV/DELAY`, strip: REV_DELAY },
  ...[1, 2].map((n) => ({
    id: `${id}.osc${n}`, table: 'Patch Oscillator 1 (2)', path: [...path, `Patch Oscillator ${n}`], group: `${label} · Oscillator ${n}`,
  })),
];

/** An arpeggio or rhythm style: Style Length, then sixteen notes of an original note and 32 grid steps. */
const style = (id, root, label) => [
  { id, table: 'Arpeggio Common', path: [root, 'Arpeggio Common'], group: label },
  ...NOTES.map((n) => ({
    id: `${id}.note${n}`, table: 'Arpeggio Style (Rhythm Style)', path: [root, `Arpeggio Style (Note ${n})`], group: `${label} · Note ${n}`,
  })),
];

/** A chord form: "Chord Note 60 (C4)" is chordForm.note60; the name keeps the note. */
const chordForm = (id, root, label) => ({
  id, table: 'Chord Pattern', path: [root, 'Chord Form'], group: label, strip: /^Chord\s+|\s*\([^)]*\)$/g,
});

export default {
  id: 'roland-sh-32',
  name: 'Roland SH-32',
  family: 'SH',
  map: 'sh-32',
  deviceId: 0x10,
  description: 'Roland SH-32 virtual-analog synthesizer module: the temporary performance (common and all four parts) with '
    + 'Part 1\'s patch, and the Patch-mode patch and rhythm set, with the arpeggio and rhythm styles and chord forms of both modes, '
    + 'from the temporary (edit-buffer) area of the MIDI Implementation.',

  // p6, Identity Reply Message: F0 7E dev 06 02 41 4A 01 00 00 00 00 00 00 F7 — family code 4A 01,
  // family number 00 00, software revision 00 00 00 00. The message line and the byte table agree.
  identity: { familyCode: ['4A', '01'], modelNumber: ['00', '00'] },

  blocks: [
    {
      id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true,
      strip: /\s*\(0\.0 = 440\.0 Hz\)/,
    },

    { id: 'performance', table: 'Performance Common', path: [PERFORMANCE, 'Performance Common'], group: 'Performance · Common', strip: /^Performance\s+/ },
    ...['1', '2', '3', '4/R'].map((n) => ({
      id: `performance.part${n[0]}`, table: 'Performance Part', path: [PERFORMANCE, `Performance Part ${n}`], group: `Performance · Part ${n}`, strip: /^Part\s+/,
    })),
    ...patch('part1.patch', [PART1], 'Part 1 · Patch'),
    ...style('arpeggioStyle', 'Temporary Arpeggio Style (Performance Mode)', 'Performance · Arpeggio Style'),
    ...style('rhythmStyle', 'Temporary Rhythm Style (Performance Mode)', 'Performance · Rhythm Style'),
    chordForm('chordForm', 'Temporary Chord Form (Performance Mode)', 'Performance · Chord Form'),

    ...patch('patch', PATCH, 'Patch Mode · Patch'),
    {
      id: 'rhythm', table: 'Rhythm Set Common', path: [...RHYTHM, 'Rhythm Set Common'], group: 'Patch Mode · Rhythm Set · Common', strip: /^Rhythm Set\s+/,
    },
    { id: 'rhythm.insFx', table: 'Rhythm Set INS-FX', path: [...RHYTHM, 'Rhythm Set INS-FX'], group: 'Patch Mode · Rhythm Set · INS-FX', strip: /^INS-FX\s+/ },
    { id: 'rhythm.revDelay', table: 'Rhythm Set REV/DELAY', path: [...RHYTHM, 'Rhythm Set REV/DELAY'], group: 'Patch Mode · Rhythm Set · REV/DELAY', strip: REV_DELAY },
    ...KEYS.map((key) => ({
      id: `rhythm.key${key}`,
      table: 'Rhythm Tone',
      path: [...RHYTHM, `Rhythm Tone (Key # ${key})`],
      group: `Patch Mode · Rhythm Set · Key ${key} (${noteName(key)})`,
      strip: /^Rhythm Tone\s+/,
    })),
    ...style('patchStyle', 'Temporary Arpeggio/Rhythm Style (Patch Mode)', 'Patch Mode · Arpeggio/Rhythm Style'),
    chordForm('patchChordForm', 'Temporary Chord Form (Patch Mode)', 'Patch Mode · Chord Form'),
  ],

  // Read on request, not at connect. The Patch-mode Patch/Rhythm holds a patch or a rhythm set, not
  // both; the one it does not hold is not answered, and the startup read stops at the first request
  // that is not.
  noPull: [/^(patch|rhythm)(\.|$)/],

  // p12, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting FILTER TYPE
  // of Temporary Patch Data to BPF (DT1)": Temporary Patch/Rhythm (Patch Mode) 14 00 00 00 + Patch
  // Common 00 00 00 + Filter Type 00 24, BPF = 02. The manual's only DT1; <Example2> and <Example3>
  // (p12) are RQ1s.
  examples: [
    {
      name: 'Setting FILTER TYPE of Temporary Patch Data to BPF (DT1)',
      where: 'p12',
      parameter: 'patch.filterType',
      value: 2,
      expectedHex: 'F0 41 10 00 4A 12 14 00 00 24 02 46 F7',
    },
  ],

  // p1, the Bank Select table, which prints MSB and LSB only (85/0 Performance, 86/0 User Rhythm,
  // 86/64 Preset Rhythm, 87/0 User Patch, 87/64 Preset Patch); the counts are the address map's (p6):
  // Patch 001-128 (A11-B88) in user memory and c11-d88 read-only, Rhythm Sets r1U and r2U in user
  // memory. Listed: what the Patch mode holds, recalled on the profile's channel. See notes for the
  // two left out.
  presets: {
    banks: [
      { id: 'user-patch', label: 'User Patch A11-B88', role: 'user', writable: true, startSlot: 0, slotCount: 128, programBase: 0, bankMsb: 87, bankLsb: 0 },
      { id: 'preset-patch', label: 'Preset Patch c11-d88', role: 'factory', writable: false, startSlot: 128, slotCount: 128, programBase: 0, bankMsb: 87, bankLsb: 64 },
      { id: 'user-rhythm', label: 'User Rhythm r1U-r2U', role: 'user', writable: true, startSlot: 256, slotCount: 2, programBase: 0, bankMsb: 86, bankLsb: 0 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    parts: 'the Temporary Performance (10 00 00 00) whole, and Part 1\'s temporary patch (11 00 00 00). Not laid out: Part 2\'s and Part 3\'s '
      + 'patches (11 20 00 00, 11 40 00 00) and Part 4\'s patch or rhythm set (11 60 00 00: the patch at +00 00 00, the rhythm set at '
      + '+10 00 00, i.e. 11 70 00 00), each the same blocks as the Patch-mode patch and rhythm set laid out here',
    memories: 'not laid out: Performances 01-64 (20 00 00 00), Patches 001-128 (30 00 00 00), Rhythm Sets (40 00 00 00, 40 10 00 00), '
      + 'Arpeggio and Rhythm Styles (50 00 00 00 - 50 7F 00 00), Chord Forms (60 00 00 00 - 60 00 7E 00): memory rather than edit buffer',
    effectParameterMeanings: 'named: INS-FX (Intensity, Color, Rate, Level) and REV/DELAY (E.Level, Time, FBK, …) are four named '
      + 'parameters each, as printed (p8-9); what they do depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the knobs and the front panel transmit as CC (Data Transmission, p4-6) is not mapped yet',
  },
  notes: [
    'Patch mode (14 00 00 00) holds a patch at 14 00 00 00 or a rhythm set at 14 10 00 00, the key blocks from 14 10 10 00 (key 21) to '
      + '14 11 3E 00 (key 108), all 88 laid out; both are read on request, not at connect.',
    'Presets list the Patches and the user Rhythm Sets (p1). Performances (MSB 85, LSB 0; 64, 20 00 00 00 - 20 3F 00 00) are selected on '
      + 'the Performance Control Channel instead and are not listed. The preset Rhythm Sets (MSB 86, LSB 64: r3P and r4P, p6) are not '
      + 'listed either: the bank table prints no program numbers, and whether they are programs 1-2 or 3-4 of their bank is not said.',
    'p12 <Example2> gives Patch "A11" a start address of 30 08 00 00 and requests F0 41 10 00 4A 11 30 08 00 00 00 00 12 0D 29 F7; the '
      + 'address map (p6) puts Patch (001 :A11) at 30 00 00 00 (30 08 00 00 is Patch 009, A21). It also introduces the patch\'s offsets '
      + 'as "the offset address of Rhythm".',
    'p12 <Example3> names the rhythm set\'s blocks "Temporary Rhythm", "Rhythm Common", "Rhythm INS-FX", "Rhythm REV/DELAY" and "Rhythm '
      + 'Wave (Key # n)", and Part 1 "Temporary Patch/Rhythm (Performance Mode Part 1)"; the map (p6-7) prints Temporary Rhythm Set, '
      + 'Rhythm Set Common, Rhythm Set INS-FX, Rhythm Set REV/DELAY, Rhythm Tone (Key # n), and "Temporary Patch (Performance Mode Part 1)". '
      + 'Its message, F0 41 10 00 4A 11 10 00 00 00 01 71 3E 1E 22 F7, is consistent with the map.',
    'The top table (p6) labels the second Rhythm Set "002 :r1U" (r2U) and the second Rhythm Style "067 :12.r" at 50 41 00 00 (066).',
    'Performance Common Chord Form Select (00 19, p7) prints its range as "11.r - 88.r", the rhythm styles\' names; Patch Common\'s '
      + 'Chord Form prints "11.c - 88.c". Both are kept as printed.',
    'Arpeggio Style (Rhythm Style) (p9) prints the fourth grid step "Step4 Data" between "Grid 3 Data" and "Grid 5 Data"; it is kept as '
      + 'printed (arpeggioStyle.note1.step4Data).',
    'Printed names kept as printed: "CC#1 Filter Cutcoff Sens" (Patch Common 00 17), "RETRIGER" (Legato Switch), "Pluse Wave Number" '
      + '(Patch Oscillator 00 07), "HF DUMP/MOD RATE" (REV/DELAY 00 12). "CC#1 …" ids read cc1… (the # is "number").',
    'The MIDI Implementation is dated Dec. 12, 2001 at its head (p1); the MIDI Implementation Chart that ends it (p13) is dated Oct. 30, 2001.',
  ],

  // The manual's own date and version (its head, p1), which the importer read only half of.
  manual: { date: 'Dec. 12, 2001', version: '1.00' },
};
