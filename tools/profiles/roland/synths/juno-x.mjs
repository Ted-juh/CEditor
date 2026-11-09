// The Roland JUNO-X: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JUNO-X MIDI Implementation", version 1.10, April 26 2022, 92 pages (maps/juno-x.json says
// which file, with its hash). Page numbers below are that document's: Bank Select p1, Identity
// Reply p10, the Parameter Address Map pp10-17 and pp76-89, the MFX type list (appendix 1) p92,
// the worked DT1 example p91.
//
// The model ID is FIVE bytes, 00 00 00 00 12 (p6, p7, p10, and the example on p91). That is
// the manual's, not a misreading.
//
// The JUNO-X plays a scene: five parts, four of them playing a tone and the fifth (PART R) a drum
// kit. A part's tone is one of four kinds, each with a temporary area of its own (p10):
//
//   01 00 00 00  Temporary Scene                      common, five parts, effects, arpeggio
//   02 00 00 00  Temporary Tone ZCore (01)            part 1's Z-Core tone
//   02 10 00 00  Temporary Tone Analog Synth Model (01)   part 1's analog model (JUNO-106, JUNO-60)
//   02 20 00 00  Temporary Tone RD Piano (01)         the RD piano tone
//   02 40 00 00  Temporary Tone JUNO-X Model (01)     part 1's JUNO-X model tone
//
// A part plays one kind at a time; all four are here, because an editor cannot know in advance
// which one a scene will use. Parts 2-4's tones are left out — see coverage. The layout is shared
// with the JUPITER-X/Xm: layouts/juno-x-jupiter-x.mjs.

import {
  analogModelBlocks, modelToneBlocks, rdPianoBlocks, sceneBlocks, scenePresets, sharedCoverage, sharedNotes,
  systemBlocks, T, zcoreToneBlocks,
} from '../layouts/juno-x-jupiter-x.mjs';

export default {
  id: 'roland-juno-x',
  name: 'Roland JUNO-X',
  family: 'JUNO',
  map: 'juno-x',
  deviceId: 0x10,
  description: 'Roland JUNO-X ZEN-Core synthesizer: the temporary scene (common, five parts with their zones, EQs, MFX and '
    + 'arpeggios, chorus, delay, reverb, drive) and part 1\'s temporary tone in each of its four kinds — Z-Core (four partials '
    + 'with envelopes, LFOs, EQ and the synth layer), Analog Synth Model, RD Piano and the JUNO-X model — with the system settings.',

  // p10, Identity Reply: F0 7E 7F 06 02 41 12 04 00 00 00 01 00 01 F7 — family code 12 04, family
  // number code 00 00.
  identity: { familyCode: ['12', '04'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks(),
    ...sceneBlocks(),
    ...zcoreToneBlocks(1),
    ...analogModelBlocks(1, 'Temporary Tone Analog Synth Model (01)'),
    ...rdPianoBlocks('Temporary Tone RD Piano (01)', 'RD Piano Sympathetic Resonan'),
    ...modelToneBlocks({
      id: 'part1.junoX',
      label: 'Part 1 · JUNO-X Model',
      root: 'Temporary Tone JUNO-X Model (01)',
      table: T('MDLJUNOX'),
      entries: ['JUNO-X Model Parameter', 'JUNO-X Model MFX', 'JUNO-X Model Tone Com'],
    }),
  ],

  // The manual's one worked SysEx message (p91, "Example of an Exclusive Message and Calculating a
  // Checksum"). Its words are an older manual's — "Temporary Program", "Program common", "program
  // level" — but its addresses are this map's: Temporary Scene 01 00 00 00 + Scene Common 00 00 00
  // + 00 10, which is Scene Level. It exercises the five-byte model id and the checksum.
  examples: [
    {
      name: 'Setting program level to 74 (DT1)',
      where: 'p91',
      parameter: 'scene.level',
      value: 74,
      expectedHex: 'F0 41 10 00 00 00 00 12 12 01 00 00 10 4A 25 F7',
    },
  ],

  // p1: scenes are MSB 85, LSB 0-1, programs 1-128 — 256 scenes, all user memory. Tones have banks
  // of their own (User Tone 71/3-4; PR-X, RD-PIANO, VOCODER 71/67-70; PR-A..D, COMMON, XV-5080 87/64-93; JUNO-106,
  // JUNO-60 and JUNO-X models 97/66-77, drum kits 86/64-65), selected per part, which a scene
  // browser does not use.
  presets: scenePresets(2),

  coverage: {
    ...sharedCoverage,
    tones: 'part 1 only. Left out: parts 2-4\'s Z-Core tones (02 01 00 00, 02 02 00 00, 02 03 00 00), Analog Synth Model tones '
      + '(02 11 00 00, 02 12 00 00, 02 13 00 00) and JUNO-X Model tones (02 41 00 00, 02 42 00 00, 02 43 00 00), each laid out as '
      + 'part 1\'s; the RD Piano (01) at 02 20 00 00 is the only one there is',
    drumKit: 'none: part 5 (PART R) plays a drum kit (Bank Select MSB 86, p1), and the address map has no temporary drum-kit area',
    userData: 'left out: Scene Arpeggio User Pattern (01)-(05) at 01 00 5A 00, 01 00 7A 00, 01 01 1A 00, 01 01 3A 00, 01 01 5A 00 '
      + '(1,056 rows each, 2,112 bytes), User Scene (001)-(256) from 40 00 00 00, User Tone (001)-(256) from 50 00 00 00',
    systemPresets: 'left out: Model Bank (01)-(16) Assign at 00 00 07 00-00 00 16 00 and Button Color Set (01)-(10) at '
      + '00 00 17 00-00 00 20 00, the panel\'s bank-button and LED-colour settings',
  },
  notes: [
    'Part 1\'s tones: Z-Core at 02 00 00 00, Analog Synth Model at 02 10 00 00, RD Piano at 02 20 00 00, JUNO-X Model at 02 40 00 00. '
      + 'A part plays one kind at a time; Scene Part Tone Bank Select / Program Change say which.',
    ...sharedNotes,
  ],
};
