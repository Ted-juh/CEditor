// The Roland AX-Edge: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "AX-Edge MIDI Implementation", version 1.01, Jul 1 2020 (eng02; the cover says "Data: Jul
// 1, 2020"; maps/ax-edge.json says which file, with its hash). Page numbers below are that document's:
// the address map is p6, the parameter tables pp7-19.
//
// An AX-Edge program is five parts, each playing a Z-Core tone, and its address map says so (p6):
//
//   00 00 00 00  System                    common, control, chorus, reverb, master EQ, master comp
//   01 00 00 00  Temporary Program         common; a Part (Program Tone), Program EQ and Program Zone
//                                          block for each of the five parts; per-part MFX; IFX,
//                                          chorus, reverb, arpeggio, vocoder
//   01 01 00 00  Temporary Tone (01)       the tone part 1 plays   ... 01 09 00 00 (05), step 02 00 00
//   02 00 00 00  Setup                     which program is selected
//
// (The User Program and User Tone areas, 10 00 00 00 and 20 00 00 00, are the stored memories.)
//
// This layout is the program, all five parts' program-level blocks, and part 1's tone. The other
// four tones are the same table at the bases above and are left out, as for every multi-part
// Roland here; see `coverage` and `notes`.

import { zCoreTone } from '../layouts/fantom-tone.mjs';

const PARTS = [1, 2, 3, 4, 5];
const two = (n) => String(n).padStart(2, '0');
const program = (entry) => ['Temporary Program', entry];

export default {
  id: 'roland-ax-edge',
  name: 'Roland AX-Edge',
  family: 'AX',
  map: 'ax-edge',
  deviceId: 0x10,
  description: 'Roland AX-Edge keytar: the temporary program (common, effects, arpeggio, vocoder, and the part, EQ and zone blocks '
    + 'of all five parts) with part 1\'s Z-Core tone. From the temporary (edit-buffer) area of the MIDI Implementation.',

  // p6, Identity Reply: F0 7E dev 06 02 41 52 03 00 00 00 01 00 01 F7.
  identity: { familyCode: ['52', '03'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: '[Setup]', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: '[System Common]', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    { id: 'systemControl', table: '[System Control]', path: ['System', 'System Control'], group: 'System · Control', system: true },
    { id: 'systemChorus', table: '[Chorus]', path: ['System', 'System Chorus'], group: 'System · Chorus', strip: /^Chorus\s+/, system: true },
    { id: 'systemReverb', table: '[Reverb]', path: ['System', 'System Reverb'], group: 'System · Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'masterEq', table: '[Master EQ]', path: ['System', 'Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'masterComp', table: '[Master Comp]', path: ['System', 'Master Comp'], group: 'System · Master Comp', system: true },

    { id: 'program', table: '[Program Common]', path: program('Program Common'), group: 'Program', strip: /^Program\s+/ },
    ...PARTS.map((n) => ({ id: `part${n}`, table: '[Program Tone]', path: program(`Program Tone (${two(n)})`), group: `Part ${n}`, strip: /^Part\s+/ })),
    ...PARTS.map((n) => ({ id: `part${n}.eq`, table: '[Program EQ]', path: program(`Program EQ (${two(n)})`), group: `Part ${n} · EQ`, strip: /^EQ\s+/ })),
    // p6 prints Program MFX (01) at 00 30 00, (02) at 00 32 00, ":" and then "00 37 00 Program MFX (04)":
    // the stride of 02 00 puts (03) at 00 34 00, (04) at 00 36 00 and a fifth at 00 38 00, so the last
    // printed row is wrong in its address or its number, and the map (rightly) does not fill the gap.
    // Only the two rows that agree with each other are laid out.
    ...[1, 2].map((n) => ({ id: `part${n}.mfx`, table: '[MFX]', path: program(`Program MFX (${two(n)})`), group: `Part ${n} · MFX`, strip: /^MFX\s+/ })),
    ...PARTS.map((n) => ({ id: `zone${n}`, table: '[Program Zone]', path: program(`Program Zone (${two(n)})`), group: `Zone ${n}` })),
    { id: 'ifx', table: '[MFX]', path: program('Program IFX'), group: 'Program · IFX', strip: /^MFX\s+/ },
    { id: 'chorus', table: '[Chorus]', path: program('Program Chorus'), group: 'Program · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: '[Reverb]', path: program('Program Reverb'), group: 'Program · Reverb', strip: /^Reverb\s+/ },
    { id: 'arpeggio', table: '[Arpeggio]', path: program('Program Arpeggio'), group: 'Program · Arpeggio', strip: /^Arpeggio\s+/ },
    { id: 'vocoder', table: '[Vocoder]', path: program('Program Vocoder'), group: 'Program · Vocoder', strip: /^Vocoder\s+/ },

    ...zCoreTone({ root: 'Temporary Tone (01)', id: 'tone1', label: 'Tone 1' }),
  ],

  // The manual's one worked SysEx message (p21, "Example of an Exclusive Message and Calculating a
  // Checksum"): Program Level of the temporary program, set to 74. It checks the 4-byte model id
  // (printed "00H 00H 00 52H" on p6, a missing H), the Temporary Program base and the checksum.
  examples: [
    {
      name: 'Setting program level to 74 (DT1)',
      where: 'p21',
      parameter: 'program.level',
      value: 74,
      expectedHex: 'F0 41 10 00 00 00 52 12 01 00 00 10 4A 25 F7',
    },
  ],

  // p1, the Bank Select table for Programs: MSB 84, LSB 0 is programs 1-128, ":" stands for LSB 1
  // (129-256), and the last row, programs 257-320 on PC 1-64, prints its 002 in the MSB column; it is
  // read as LSB 2, which is what the arithmetic and the 320 User Program areas of p6 say. They are
  // "User Program" in the address map, so writable. Tones (MSB 87) are chosen per part and are not a
  // program browser's banks.
  presets: {
    banks: [
      { id: 'program-1', label: 'Programs 1-128', role: 'user', writable: true, startSlot: 0, slotCount: 128, programBase: 0, bankMsb: 84, bankLsb: 0 },
      { id: 'program-2', label: 'Programs 129-256', role: 'user', writable: true, startSlot: 128, slotCount: 128, programBase: 0, bankMsb: 84, bankLsb: 1 },
      { id: 'program-3', label: 'Programs 257-320', role: 'user', writable: true, startSlot: 256, slotCount: 64, programBase: 0, bankMsb: 84, bankLsb: 2 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    partTones: 'part 1 only: the tones of parts 2-5 are the same [Tone] table at 01 03 00 00, 01 05 00 00, 01 07 00 00 and 01 09 00 00, '
      + 'and are not laid out',
    programMfx: 'parts 1 and 2 only: p6 prints the Program MFX list as (01) 00 30 00, (02) 00 32 00, :, (04) 00 37 00, which does not '
      + 'add up, so (03) to (05) are left out rather than guessed',
    editor: 'not laid out: the Editor area (0F 00 00 00, [Edit]) has no table in the manual',
    effectParameterMeanings: 'type-dependent: MFX/IFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits (CC, RPN) is not in the address map',
  },
  notes: [
    'Program-level blocks for all five parts (Part, EQ, Zone); part 1\'s tone at 01 01 00 00. Parts 2-5 play tones at 01 03 00 00, 01 05 00 00, 01 07 00 00 and 01 09 00 00, the same table, not laid out.',
    'Program MFX (03)-(05) are left out: the manual\'s [Program] table (p6) prints the third row as "00 37 00 Program MFX (04)", off the 02 00 stride of the first two.',
    'The program name is printed as "NAME 1" to "NAME 16" (p8), so it is sixteen ASCII parameters here rather than one text field. A tone\'s name is printed as sixteen rows of "Name" (p14).',
    'p13-14: [Partial Filter Env] ends with a "Pitch Env Velocity Curve" row (00 2C, Total Size 2D) and [Partial Pitch Env] is 2C long; the FANTOM-6/7/8 manual has that row at the end of the pitch envelope instead. Kept as printed.',
  ],
};
