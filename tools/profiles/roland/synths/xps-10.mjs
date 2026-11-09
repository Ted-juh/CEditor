// The Roland XPS-10: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "XPS-10 MIDI Implementation", version 1.00, April 1 2014 (maps/xps-10.json says which
// file, with its hash). Page numbers below are that document's.
//
// The XPS-10 is the JUNO-DS's address map four years earlier (../layouts/juno-ds-family.mjs has the
// shared layout), with its own words and a little less in it:
//
//   - the drum kit is a "Rhythm Set": Temporary Patch/Rhythm, Temporary Rhythm, Rhythm Common,
//     Rhythm Tone (Key # 21-108) — the same tables under another name;
//   - the root is "Temporary Performance", without "(Pattern)", and has no Performance Controller;
//   - there is no Vocal Effect, and the Rhythm Group has sixteen pads where the JUNO-DS has eight;
//   - 0F 00 00 00 is "(for editor)", with no table under it, and is not laid out.

import { banks, bankRun, familyBlocks, leftOutNotes } from '../layouts/juno-ds-family.mjs';

const KIT = { id: 'rhythm', word: 'Rhythm', temporary: 'Temporary Rhythm', label: 'Rhythm Set' };

export default {
  id: 'roland-xps-10',
  name: 'Roland XPS-10',
  family: 'XPS',
  map: 'xps-10',
  deviceId: 0x10,
  description: 'Roland XPS-10 expandable synthesizer: the temporary performance (common, effects, and every part\'s Part, '
    + 'MIDI and Zone blocks), the rhythm group, and the Patch-mode patch and rhythm set, from the temporary '
    + '(edit-buffer) area of the MIDI Implementation.',

  // p10, Identity Reply: F0 7E dev 06 02 41 3A 02 01 00 00 01 00 00 F7 — family code 3A 02, family
  // number 01 00. The status line and the byte table agree here (they do not in the JUNO-DS's and
  // XPS-30's manuals, which print 00 00 in the line and 02 00 / 03 00 in the table).
  identity: { familyCode: ['3A', '02'], modelNumber: ['01', '00'] },

  blocks: familyBlocks({
    performance: 'Temporary Performance',
    patchPart: 'Temporary Patch/Rhythm (Patch Mode Part 1)',
    kit: KIT,
    controller: false,
    vocalEffect: false,
  }),

  // p27, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the
  // Performance Common set to DELAY (02) — the manual's only DT1 parameter write, the same message
  // the JUNO-DS and XPS-30 manuals print. (The Scale Tune message after it is a GS DT1, model 42,
  // outside this address map.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
      where: 'p27',
      parameter: 'performance.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 3A 12 10 00 04 00 02 6A F7',
    },
  ],

  // p1, the Bank Select table: Patches (MSB 87) and Rhythm Sets (MSB 86), which is what Patch Mode
  // Part 1 holds. The table elides Preset Patch LSB 65-72 with ":" between two rows that each read
  // PROGRAM 001-128, so each is 128 programs. Its NUMBER column is printed for LSB 64 only
  // (001-128), so the preset banks are labelled by their Bank Select, not by a patch number.
  presets: {
    banks: banks([
      ['user-patch-1', 'User Patch 001-128', 'user', 87, 0, 128],
      ['user-patch-2', 'User Patch 129-256', 'user', 87, 1, 128],
      ...bankRun('preset-patch', (i) => `Preset Patch (LSB ${64 + i})`, 'factory', 87, 64, 73, 128, 128),
      ['user-rhythm', 'User Rhythm 001-008', 'user', 86, 0, 8],
      ['preset-rhythm', 'Preset Rhythm 001-028', 'factory', 86, 64, 28],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    drumKitKeys: 'partial: keys 27-96 of the Patch-mode rhythm set (70 of 88); 21-26 and 97-108 are not laid out',
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00)',
    notModelled: 'Patch Mode Part 2 (1F 20 00 00), Temporary Rhythm Pattern (1E 00 00 00), Temporary Arpeggio (1E 11 00 00), (for editor) (0F 00 00 00), the user memories (20 00 00 00 and up)',
  },
  notes: [
    ...leftOutNotes({ kit: KIT }),
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86, p1), recalled on the profile\'s channel, which is the Kbd Patch Rx/Tx Channel in Patch mode. '
      + 'Performances (MSB 85: User 000, Preset 064) are selected on the Performance Control Channel instead and are not listed; nor are the GM banks (MSB 120/121).',
  ],
};
