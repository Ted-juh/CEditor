// The Roland XPS-30: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "XPS-30 MIDI Implementation", version 1.01, Feb 15 2018 (maps/xps-30.json says which
// file, with its hash). Page numbers below are that document's.
//
// The XPS-30's address map is the JUNO-DS's, table for table: the same roots, blocks, rows and
// ranges; only the page numbers differ. So its layout is the family's (../layouts/juno-ds-family.mjs),
// with the JUNO-DS's names, and what is its own is the identity reply and the bank table.

import { banks, bankRun, familyBlocks, leftOutNotes } from '../layouts/juno-ds-family.mjs';

const KIT = { id: 'drum', word: 'Drum', temporary: 'Temporary Drum', label: 'Drum Kit' };

export default {
  id: 'roland-xps-30',
  name: 'Roland XPS-30',
  family: 'XPS',
  map: 'xps-30',
  deviceId: 0x10,
  description: 'Roland XPS-30 expandable synthesizer: the temporary performance (common, effects, and every part\'s Part, '
    + 'MIDI and Zone blocks), the rhythm group, the vocal effect, and the Patch-mode patch and drum kit, from the '
    + 'temporary (edit-buffer) area of the MIDI Implementation.',

  // p16, Identity Reply. The byte table reads family code 3A 02, family number 03 00; the status
  // line above it prints 00H 00H there — the same line the JUNO-DS manual prints over its own 02 00.
  // The byte table is the part written per model, so it is the one used; see notes.
  identity: { familyCode: ['3A', '02'], modelNumber: ['03', '00'] },

  blocks: familyBlocks({
    performance: 'Temporary Performance (Pattern)',
    patchPart: 'Temporary Patch/Drum (Patch Mode Part 1)',
    kit: KIT,
    controller: true,
    vocalEffect: true,
  }),

  // p64, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the
  // Performance Common set to DELAY (02) — the manual's only DT1 parameter write, word for word the
  // JUNO-DS's. (The Scale Tune message after it is a GS DT1, model 42, outside this address map.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
      where: 'p64',
      parameter: 'performance.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 3A 12 10 00 04 00 02 6A F7',
    },
  ],

  // p1-2, the Bank Select table: Patches (MSB 87) and Drum Kits (MSB 86), which is what Patch Mode
  // Part 1 holds. The table elides Preset Patch LSB 66-74 with ":"; the numbering closes on it
  // (64 is 0001-0128, 75 is 1409-1472), so each is 128 and the last 64.
  presets: {
    banks: banks([
      ['user-patch-1', 'User Patch 0501-0628', 'user', 87, 0, 128],
      ['user-patch-2', 'User Patch 0629-0756', 'user', 87, 1, 128],
      ...bankRun('preset-patch', (i) => `Preset Patch ${String(i * 128 + 1).padStart(4, '0')}-${String(Math.min(i * 128 + 128, 1472)).padStart(4, '0')}`, 'factory', 87, 64, 75, 128, 64),
      ['user-drum', 'User Drum Kit R501-R508', 'user', 86, 0, 8],
      ['preset-drum', 'Preset Drum Kit 0001-0035', 'factory', 86, 64, 35],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    drumKitKeys: 'partial: keys 27-96 of the Patch-mode drum kit (70 of 88); 21-26 and 97-108 are not laid out',
    performancePartTones: 'not modelled: the patches and kits of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00)',
    notModelled: 'Patch Mode Part 2 (1F 20 00 00), Temporary Rhythm Pattern (1E 00 00 00), Temporary Arpeggio (1E 11 00 00), the user memories (20 00 00 00 and up)',
  },
  notes: [
    ...leftOutNotes({ kit: KIT }),
    'Presets list the Patches and Drum Kits (Bank Select MSB 87 and 86, p1-2), recalled on the profile\'s channel, which is the Kbd Patch Rx/Tx Channel in Patch mode. '
      + 'Performances (MSB 85: User 000, User Pattern 001, Preset 064, Preset Pattern 065) are selected on the Performance Control Channel instead and are not listed; '
      + 'nor are the GM (MSB 120/121) and Expansion (MSB 92/93) banks.',
    'Identity Reply (p16): the byte table gives family number code 03 00, the status line above it 00 00 — the same status line the '
      + 'JUNO-DS manual prints over its own byte table\'s 02 00, while the XPS-10 manual reads 01 00 in both places. The byte table is used here; '
      + 'if the instrument answers 00 00, the status line was right and this profile will not recognise it.',
  ],

  // Read on request, not at connect. The patch-mode part holds a patch or a drum kit, not both; the one it does not hold is not answered, and the startup read stops at the first request that is not.
  noPull: [/^(patch|drum)(\.|$)/],
};
