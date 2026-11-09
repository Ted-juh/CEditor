// The Roland JUNO-Di: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JUNO-Di MIDI Implementation", version 1.00, May 1 2009 (maps/juno-di.json says which
// file, with its hash; the importer read its cover as "JUNO-Di (Version:)", the cover is printed
// Model JUNO-Di, Date May 1, 2009, Version 1.00). Page numbers below are that document's.
//
// The JUNO-Di is where the JUNO-DS / XPS-30 / XPS-10 address map starts: the same model ID
// (00 00 3A), the same roots and the same tables, and its words are the XPS-10's — a "Rhythm Set"
// rather than a "Drum Kit", "Temporary Performance" without "(Pattern)", no Performance Controller,
// no Vocal Effect, and 0F 00 00 00 "(for editor)" with no table under it. So its layout is the
// family's (../layouts/juno-ds-family.mjs), with the XPS-10's names. What is its own:
//
//   - a Temporary Chord Memory at 1E 14 00 00 (p10): a 16-character chord name and, for each of
//     the twelve keys of the octave, eight note assignments. Laid out here, after the family.
//   - the Setup has its Chord Memory switches (Chord Switch, Chord Form, Rolled Chord, Rolled Chord
//     Type) where the XPS-10's has reserved bytes, and the System Controller its D Beam (Beam Sens,
//     Assign, Range Lower and Upper), a Keyboard Velocity Curve of 0-2 where the XPS-10's is 1-3, and
//     27 Pedal Assign targets to its 25; the three MFX tables have 80 types to the XPS-10's 79.
//
// Everything else — every row, range and offset of every other table — is the XPS-10's.

import { banks, bankRun, familyBlocks, leftOutNotes } from '../layouts/juno-ds-family.mjs';

const KIT = { id: 'rhythm', word: 'Rhythm', temporary: 'Temporary Rhythm', label: 'Rhythm Set' };

const CHORD_KEYS = Array.from({ length: 12 }, (unused, i) => i + 1);
const CHORD = 'Temporary Chord Memory';

export default {
  id: 'roland-juno-di',
  name: 'Roland JUNO-Di',
  family: 'JUNO',
  map: 'juno-di',
  deviceId: 0x10,
  description: 'Roland JUNO-Di mobile synthesizer: the temporary performance (common, effects, and every part\'s Part, '
    + 'MIDI and Zone blocks), the rhythm group, the chord memory, and the Patch-mode patch and rhythm set, from the '
    + 'temporary (edit-buffer) area of the MIDI Implementation.',

  // p9, Identity Reply Message (JUNO-Di): F0 7E dev 06 02 41 3A 02 00 00 00 03 00 00 F7 — family
  // code 3A 02, family number 00 00. The status line and the byte table agree. The family number is
  // what tells it from the instruments that share its model ID: XPS-10 01 00, JUNO-DS 02 00,
  // XPS-30 03 00 (their byte tables; the JUNO-DS's and XPS-30's status lines print this 00 00).
  identity: { familyCode: ['3A', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...familyBlocks({
      performance: 'Temporary Performance',
      patchPart: 'Temporary Patch/Rhythm (Patch Mode Part 1)',
      kit: KIT,
      controller: false,
      vocalEffect: false,
    }),
    { id: 'chordMemory', table: 'Chord Memory Common', path: [CHORD, 'Chord Memory Common'], group: 'Chord Memory', strip: /^Chord\s+/ },
    ...CHORD_KEYS.map((n) => ({
      id: `chordMemory.key${n}`,
      table: 'Chord Memory Pattern',
      path: [CHORD, `Chord Memory Pattern (key ${n})`],
      group: `Chord Memory · Key ${n}`,
      strip: /^Chord Pattern\s+/,
    })),
  ],

  // p24, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the
  // Performance Common set to DELAY (02) — the manual's only DT1 parameter write, the same message
  // the XPS-10, JUNO-DS and XPS-30 manuals print. (The Scale Tune message beside it is a GS DT1,
  // model 42, outside this address map.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
      where: 'p24',
      parameter: 'performance.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 3A 12 10 00 04 00 02 6A F7',
    },
  ],

  // p1, the Bank Select table: Patches (MSB 87) and Rhythm Sets (MSB 86), which is what Patch Mode
  // Part 1 holds. The table elides Preset Patch LSB 66-71 with ":" between LSB 65 (PROGRAM 001-128)
  // and LSB 72 (PROGRAM 001-058), so each elided bank is 128 and the last 58. Its NUMBER column
  // repeats 001-128 rather than counting on, so the preset banks are labelled by their Bank Select.
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...bankRun('preset-patch', (i) => `Preset Patch (LSB ${64 + i})`, 'factory', 87, 64, 72, 128, 58),
      ['user-rhythm', 'User Rhythm 001-008', 'user', 86, 0, 8],
      ['preset-rhythm', 'Preset Rhythm 001-020', 'factory', 86, 64, 20],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    drumKitKeys: 'partial: keys 27-96 of the Patch-mode rhythm set (70 of 88); 21-26 and 97-108 are not laid out',
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00)',
    notModelled: 'Patch Mode Part 2 (1F 20 00 00), Temporary Rhythm Pattern (1E 00 00 00), Temporary Arpeggio (1E 11 00 00), (for editor) (0F 00 00 00), '
      + 'the user memories (20 00 00 00 and up)',
  },
  notes: [
    // The family's kit-key note says the keys stop at 96 "to keep the profile under 12,000
    // parameters"; here the chord memory (97) and the Setup's and Controller's extra rows take the
    // same seventy keys to 12,004, so the note says so rather than claim what is not quite true.
    ...leftOutNotes({ kit: KIT }).map((note) => note.replace('under 12,000 parameters', 'near 12,000 parameters (12,004 here, the chord memory included)')),
    'Temporary Chord Memory (1E 14 00 00, p10, p15): the chord name, and the twelve keys\' eight note assignments each '
      + '(1E 14 10 00 to 1E 14 1B 00), are laid out; the user chord memories behind it are not edit buffer.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86, p1), recalled on the profile\'s channel, which is the Kbd Patch Rx/Tx Channel in Patch mode. '
      + 'Performances (MSB 85: User 000, Preset 064) are selected on the Performance Control Channel instead and are not listed; nor are the GM banks (MSB 000-063, 120, 121).',
    'Identity Reply (p9): family code 3A 02, family number 00 00, in the status line and the byte table alike. The JUNO-DS and XPS-30 '
      + 'manuals print this same 00 00 in their status lines over byte tables that read 02 00 and 03 00, which reads as the JUNO-Di\'s '
      + 'line carried over; 00 00 is the JUNO-Di\'s own.',
  ],

  // Read on request, not at connect. The patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not answered, and the startup read stops at the first request that is not.
  noPull: [/^(patch|rhythm)(\.|$)/],
};
