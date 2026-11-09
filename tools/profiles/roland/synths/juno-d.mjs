// The Roland JUNO-D (2004): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JUNO-D MIDI Implementation", version 1.00, April 1 2004 (maps/juno-d.json says which
// file, with its hash; the cover prints the date as "2004.4.1" and the version beneath it as 1.00,
// which the importer read as the version). Page numbers below are that document's.
//
// The 2004 JUNO-D is not the JUNO-Di's ancestor in its address map. Its model ID is two bytes,
// 00 64 — the DT1 and RQ1 byte tables (p5, p8) and the worked example (p24) all send
// F0 41 dev 00 64 … — and its map (p9) is small:
//
//   00 00 00 00  Setup                    mode, the selected performance and patch, arpeggio,
//                                         chord and D Beam settings
//   01 00 00 00  System                   one table, System Common (see notes)
//   10 00 00 00  Temporary Performance    common, MFX, chorus, reverb, and a Part block per part
//   11 00 00 00  Temporary Patch/Rhythm (Performance Mode Part 1) … 11 1E 00 00 (Part 16)
//   18 00 00 00  Temporary Patch/Rhythm (Patch Mode)
//   1A 00 00 00  Temporary Arpeggio       one Arpeggio Setup block
//   1C 00 00 00  Temporary Chord          twelve Chord Pattern blocks (see notes)
//
// and each Patch/Rhythm holds a patch at +00 00 00 (common, MFX, chorus, reverb, two tones) and a
// rhythm set at +01 00 00 (common, MFX, chorus, reverb, one five-byte tone per key from 21 to 108).
//
// Laid out: Setup and System (system blocks), the whole Temporary Performance, the Temporary
// Arpeggio, and the Patch-mode Patch/Rhythm in both tone types it can hold — the patch, and the
// rhythm set with all 88 keys (440 parameters; the JUNO-D's rhythm tones are small).

// Nothing of the JUNO-DS family's layout applies; only its generic helpers are borrowed: the bank
// table as the manual prints it, and Roland's note names.
import { banks, bankRun, noteName } from '../layouts/juno-ds-family.mjs';

const PARTS = Array.from({ length: 16 }, (unused, i) => i + 1);
const KEYS = Array.from({ length: 88 }, (unused, i) => 21 + i);

const PERFORMANCE = 'Temporary Performance';
const PATCH_MODE = 'Temporary Patch/Rhythm (Patch Mode)';
const PATCH = [PATCH_MODE, 'Temporary Patch'];
const RHYTHM = [PATCH_MODE, 'Temporary Rhythm'];

// `Solo Switch (MONO ON/POLY ON)`: the bracket names the MIDI messages, as (CC# n) does elsewhere.
const MONO_POLY = /\s*\(MONO ON\/POLY ON\)/;

const effects = (id, prefix, path, label) => [
  { id: `${id}.mfx`, table: `${prefix} MFX`, path: [...path, `${prefix} MFX`], group: `${label} · MFX`, strip: /^MFX\s+/ },
  { id: `${id}.chorus`, table: `${prefix} Chorus`, path: [...path, `${prefix} Chorus`], group: `${label} · Chorus`, strip: /^Chorus\s+/ },
  { id: `${id}.reverb`, table: `${prefix} Reverb`, path: [...path, `${prefix} Reverb`], group: `${label} · Reverb`, strip: /^Reverb\s+/ },
];

export default {
  id: 'roland-juno-d',
  name: 'Roland JUNO-D',
  family: 'JUNO',
  map: 'juno-d',
  deviceId: 0x10,
  description: 'Roland JUNO-D (2004) synthesizer: the temporary performance (common, effects, and every part\'s Part block), '
    + 'the temporary arpeggio, and the Patch-mode patch and rhythm set, from the temporary (edit-buffer) area of the MIDI Implementation.',

  // p8, Identity Reply Message: F0 7E dev 06 02 41 64 01 01 00 00 01 00 01 F7 — family code 64 01,
  // family number 01 00. The status line and the byte table agree.
  identity: { familyCode: ['64', '01'], modelNumber: ['01', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    // The top table names "System" at 01 00 00 00 and the manual prints a "System Common" table
    // (p10, Total Size 00 00 00 24) but no offset table between them; System Common is laid at
    // System + 00 00 00, as every other Roland map of its time has it. See notes.
    { id: 'system', table: 'System Common', path: ['System'], group: 'System', system: true },

    { id: 'performance', table: 'Performance Common', path: [PERFORMANCE, 'Performance Common'], group: 'Performance · Common', strip: /^Performance\s+/ },
    ...effects('performance', 'Performance', [PERFORMANCE], 'Performance'),
    ...PARTS.map((n) => ({
      id: `performance.part${n}`, table: 'Performance Part', path: [PERFORMANCE, `Performance Part (Part ${n})`], group: `Performance · Part ${n}`, strip: /^Part\s+/,
    })),

    { id: 'arpeggio', table: 'Arpeggio Setup', path: ['Temporary Arpeggio', 'Arpeggio Setup'], group: 'Arpeggio', strip: /^Arpeggio\s+/ },

    { id: 'patch', table: 'Patch Common', path: [...PATCH, 'Patch Common'], group: 'Patch · Common', strip: new RegExp(`^Patch\\s+|${MONO_POLY.source}`, 'g') },
    ...effects('patch', 'Patch', PATCH, 'Patch'),
    ...[1, 2].map((n) => ({
      id: `patch.tone${n}`, table: 'Patch Tone', path: [...PATCH, `Patch Tone (${n})`], group: `Patch · Tone ${n}`, strip: /^Tone\s+/,
    })),

    { id: 'rhythm', table: 'Rhythm Common', path: [...RHYTHM, 'Rhythm Common'], group: 'Rhythm Set · Common', strip: /^Rhythm\s+/ },
    ...effects('rhythm', 'Rhythm', RHYTHM, 'Rhythm Set'),
    ...KEYS.map((key) => ({
      id: `rhythm.key${key}`,
      table: 'Rhythm Tone',
      path: [...RHYTHM, `Rhythm Tone (Key # ${key})`],
      group: `Rhythm Set · Key ${key} (${noteName(key)})`,
      strip: /^Rhythm Tone\s+/,
    })),
  ],

  // p24, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the
  // Performance Common set to SHORT DELAY (06) — the manual's only DT1 parameter write. It confirms
  // the two-byte model ID (00 64). Its worked sum prints "02H" for the data byte but adds 6, and the
  // message it arrives at carries 06; see notes. (The Scale Tune message beside it is a GS DT1,
  // model 42, outside this address map.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to SHORT DELAY (DT1)',
      where: 'p24',
      parameter: 'performance.chorus.type',
      value: 6,
      expectedHex: 'F0 41 10 00 64 12 10 00 04 00 06 66 F7',
    },
  ],

  // p1, the Bank Select table: Patches (MSB 87) and Rhythm Sets (MSB 86), which is what the Patch
  // mode holds. The table elides Preset Patch LSB 65-67 with ":" between two rows that each read
  // PROGRAM 001-128, so each is 128 programs; its NUMBER column repeats 001-128 rather than
  // counting on, so the preset banks are labelled by their Bank Select.
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...bankRun('preset-patch', (i) => `Preset Patch (LSB ${64 + i})`, 'factory', 87, 64, 68, 128, 128),
      ['user-rhythm', 'User Rhythm 001-002', 'user', 86, 0, 2],
      ['preset-rhythm', 'Preset Rhythm 001-020', 'factory', 86, 64, 20],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX parameters are Roland\'s 4-nibble container (12768-52768, shown -20000..+20000); '
      + 'what each slot does depends on the MFX type, which the MIDI Implementation does not list. Chorus and reverb have named parameters.',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 11 1E 00 00)',
    notModelled: 'Temporary Chord (1C 00 00 00): its twelve Chord Pattern blocks share one name in the map and cannot be addressed by path; '
      + 'the user memories (20 00 00 00 and up)',
  },
  notes: [
    'Patch mode (18 00 00 00) is the patch or rhythm set played from the keyboard in Patch mode: its patch at 18 00 00 00 and its '
      + 'rhythm set at 18 01 00 00, the key blocks from 18 01 10 00 (key 21) to 18 01 67 00 (key 108), all 88 laid out.',
    'Not modelled: the sixteen Performance Mode parts\' own patches and rhythm sets, at 11 00 00 00, 11 02 00 00, … 11 1E 00 00 '
      + '(part n at 11 00 00 00 + (n-1) × 00 02 00 00, a patch at +00 00 00 and a rhythm set at +01 00 00). Each is the Patch-mode blocks again.',
    'Not modelled: the Temporary Chord (1C 00 00 00). Its offset table (p10) prints "Chord Pattern" at 00 00 00, 00 01 00, ":" and 00 0B 00 '
      + 'with no number, so the twelve entries (eight Chord Pattern Assign notes each, 00 00 00 08) share one name; the generator addresses a '
      + 'block by a unique entry name and refuses an ambiguous one, and the parser does not fill an unnumbered ":" run.',
    'System (p9-10): the top table names "System" at 01 00 00 00 and the manual prints a "System Common" table, Total Size 00 00 00 24, '
      + 'with no "System" offset table between them. System Common is laid at 01 00 00 00, System + 00 00 00.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86, p1), recalled on the profile\'s channel, which is the Patch Receive Channel in Patch mode. '
      + 'Performances (MSB 85: User 000, 8; Preset 064, 32) are selected on the Performance Control Channel instead and are not listed; nor are the GM banks (MSB 120/121).',
    'The p24 example\'s checksum arithmetic prints "10H + 00H + 04H + 00H + 02H = 16 + 0 + 4 + 0 + 6 = 26": the data byte is printed 02H '
      + 'but added as 6, and the message it gives, F0 41 10 00 64 12 10 00 04 00 06 66 F7, carries 06 (SHORT DELAY). The message is the one checked.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not answered, and the startup read stops at the first request that is not.
  noPull: [/^(patch|rhythm)(\.|$)/],

  // The manual's own date and version (the cover prints the date as 2004.4.1).
  manual: { date: 'April 1, 2004', version: '1.00' },
};
