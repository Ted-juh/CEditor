// The Roland JUPITER-X and JUPITER-Xm: which parts of their address map make up the edit buffer,
// and what to call them.
//
// Source: "JUPITER-X/Xm MIDI Implementation", version 1.06, Apr 19 2022, 90 pages (maps/jupiter-x.json
// says which file, with its hash). Page numbers below are that document's: Bank Select p1, model
// ID pp5-7, Identity Reply p7, the Parameter Address Map pp7-16 and pp73-87, the worked DT1
// example p90. One manual, one map and one profile for both instruments: the Xm answers the same
// identity and ignores the rows marked (*), "Not used with JUPITER-Xm" (System Common, System
// Control, Button Color Set, Scene Common, Scene Zone).
//
// The model ID is 00 00 00 65: the address map's heading (p7), the sentence "The model ID of the
// exclusive messages used by this instrument is 00H 00H 00H 65H" (p5), every status line, the DT1
// transmit byte list (p7) and the worked example (p90). Two byte lists in section 1, Data
// Reception (p5: Data Request 1 and Data Set 1), print model ID #4 as 52H under a status line that
// says 65H; 00 00 00 52 is the AX-Edge's id, and the manual's own example does not use it.
//
// The JUPITER-X plays a scene: five parts, four playing a tone and the fifth (PART R) a drum kit.
// A part's tone is one of four kinds, each with a temporary area of its own (p7):
//
//   01 00 00 00  Temporary Scene                          common, five parts, effects, arpeggio
//   02 00 00 00  Temporary Tone ZCore (01)                part 1's Z-Core tone
//   02 10 00 00  Temporary Tone Analog Synth Model(01)    part 1's analog model (JUPITER-8, JX-8P, JUNO-106, SH-101)
//   02 20 00 00  Temporary Tone RD Piano(01)              the RD piano tone
//   02 50 00 00  Temporary Tone JUPITER-X(01)             part 1's JUPITER-X model tone
//
// A part plays one kind at a time; all four are here, because an editor cannot know in advance
// which one a scene will use. Parts 2-4's tones are left out — see coverage. The map's last entry,
// Editor at 7F 00 00 00, names no table and is not laid out. The layout is shared with the JUNO-X:
// layouts/juno-x-jupiter-x.mjs.

import {
  analogModelBlocks, modelToneBlocks, rdPianoBlocks, sceneBlocks, scenePresets, sharedCoverage, sharedNotes,
  systemBlocks, T, zcoreToneBlocks,
} from '../layouts/juno-x-jupiter-x.mjs';

export default {
  id: 'roland-jupiter-x',
  name: 'Roland JUPITER-X/Xm',
  family: 'JUPITER',
  map: 'jupiter-x',
  deviceId: 0x10,
  description: 'Roland JUPITER-X and JUPITER-Xm ZEN-Core synthesizers: the temporary scene (common, five parts with their zones, '
    + 'EQs, MFX and arpeggios, chorus, delay, reverb, drive) and part 1\'s temporary tone in each of its four kinds — Z-Core (four '
    + 'partials with envelopes, LFOs, EQ and the synth layer), Analog Synth Model, RD Piano and the JUPITER-X model — with the system settings.',

  // p7, Identity Reply: F0 7E 7F 06 02 41 65 03 00 00 … F7 — family code 65 03, family number code
  // 00 00, for the JUPITER-X and the JUPITER-Xm alike, so this profile answers to both. (The
  // JUPITER-X's printed message ends 01 01 00 05 where its byte list says the revision is
  // 00 01 00 05; a revision is not part of the match.)
  identity: { familyCode: ['65', '03'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks(),
    ...sceneBlocks(),
    ...zcoreToneBlocks(1),
    ...analogModelBlocks(1, 'Temporary Tone Analog Synth Model(01)'),
    ...rdPianoBlocks('Temporary Tone RD Piano(01)', 'RD Piano Sympathetic Resonance'),
    ...modelToneBlocks({
      id: 'part1.jupiterX',
      label: 'Part 1 · JUPITER-X Model',
      root: 'Temporary Tone JUPITER-X(01)',
      table: T('MDLJPX'),
      entries: ['Model JUPITER-X Parameter', 'Model JUPITER-X MFX', 'Model JUPITER-X Tone Com'],
    }),
  ],

  // The manual's one worked SysEx message (p90, "Example of an Exclusive Message and Calculating a
  // Checksum"). Its words are an older manual's — "Temporary Program", "Program common", "program
  // level" — but its addresses are this map's: Temporary Scene 01 00 00 00 + Scene Common 00 00 00
  // + 00 10, which is Scene Level. Its model id is 00 00 00 65.
  examples: [
    {
      name: 'Setting program level to 74 (DT1)',
      where: 'p90',
      parameter: 'scene.level',
      value: 74,
      expectedHex: 'F0 41 10 00 00 00 65 12 01 00 00 10 4A 25 F7',
    },
  ],

  // p1: scenes are MSB 85, LSB 0-3, programs 1-128 — 512 scenes, all user memory. Tones have banks
  // of their own (User Tone 71/3-6; PR-X, RD-PIANO, VOCODER 71/67-70; PR-A..D, COMMON, XV-5080
  // 87/64-93; JUPITER-8, JUNO-106, JX-8P, SH-101 and JUPITER-X models 97/64-82; drum kits
  // 86/64-65), selected per part, which a scene browser does not use. (The PR-X row there reads
  // programs 001-015 but numbers 0001-0035; the JUNO-X's reads 001-035.)
  presets: scenePresets(4),

  coverage: {
    ...sharedCoverage,
    tones: 'part 1 only. Left out: parts 2-4\'s Z-Core tones (02 01 00 00, 02 02 00 00, 02 03 00 00), Analog Synth Model tones '
      + '(02 11 00 00, 02 12 00 00, 02 13 00 00) and JUPITER-X model tones (02 51 00 00, 02 52 00 00, 02 53 00 00), each laid out as '
      + 'part 1\'s; the RD Piano(01) at 02 20 00 00 is the only one there is',
    drumKit: 'none: part 5 (PART R) plays a drum kit (Bank Select MSB 86, p1), and the address map has no temporary drum-kit area',
    userData: 'left out: Scene Arpeggio User Pattern (01)-(05) at 01 00 5A 00, 01 00 7A 00, 01 01 1A 00, 01 01 3A 00, 01 01 5A 00 '
      + '(1,056 rows each, 2,112 bytes), User Scene (001)-(256) from 40 00 00 00 and (257)-(512) from 60 00 00 00, '
      + 'User Tone (001)-(512) from 50 00 00 00',
    systemPresets: 'left out: Model Bank (01)-(16) Assign at 00 00 07 00-00 00 16 00 and Button Color Set(01)-(10) at '
      + '00 00 17 00-00 00 20 00, the panel\'s bank-button and LED-colour settings',
    blockReadBack: 'the JUPITER-X model parameter block (part1.jupiterX, 02 50 00 00) is 269 bytes (p83); the instrument sends more '
      + 'than 256 bytes as packets of at most 256 (p7), and its dump here expects one message, so reading that block back is unproven. '
      + 'Writing its parameters is unaffected',
  },
  notes: [
    'Part 1\'s tones: Z-Core at 02 00 00 00, Analog Synth Model at 02 10 00 00, RD Piano at 02 20 00 00, JUPITER-X model at 02 50 00 00. '
      + 'A part plays one kind at a time; Scene Part Tone Bank Select / Program Change say which.',
    'Rows marked (*) are not used with the JUPITER-Xm (the manual\'s footnote); their ids leave the mark out, their names keep it.',
    'Tone Partial DelayTime (note) (p80) carries the manual\'s labels as printed: "1/64T, 1/8, 1/64, 1/32T, …, 1/16., 1/4T, …". '
      + 'The JUNO-X manual prints the same row with 1/8 tenth (after 1/16.), the order of note lengths; if that is right, values 1-9 '
      + 'here are labelled one place off.',
    ...sharedNotes,
  ],
};
