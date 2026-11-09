// The Roland XV-2020: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the MIDI Implementation chapter of the "XV-2020 Owner's Manual" (p136-161), dated June 4,
// 2002 (printed 2002.6.4), version 1.00 at its head (p136). maps/xv-2020.json says which file, with
// its hash; page numbers below are the owner's manual's.
//
// The XV-2020 is the XV-5050's half-rack sibling, on the XV-5080's map with the 5080-only rows set
// `<*>` (ignored when received): sixteen parts, one MFX of 40 types, one chorus and one reverb type
// each, no System EQ. Unlike the others it has a Setup block at 01 00 00 00 (sound mode, the selected
// performance and patch, transpose) and its System at 02 00 00 00, and its parts carry their own scale
// tune in the Performance Part block. The shared layout, and what the map as read leaves out, is in
// ../layouts/xv-series.mjs; this file is what is the XV-2020's own.

import { NO_PULL, banks, presetGroups, readXvMap, sharedNotes, xvLayout } from '../layouts/xv-series.mjs';

const XV = readXvMap('xv-2020');
const layout = xvLayout(XV, { parts: 16, setup: true, systemParts: false });

export default {
  id: 'roland-xv-2020',
  name: 'Roland XV-2020',
  family: 'XV',
  map: 'xv-2020',
  deviceId: 0x10,
  description: 'Roland XV-2020 synthesizer module: the setup and system blocks, the temporary performance (common, effects, MIDI, and the '
    + 'Part block of each of its 16 parts), and Part 1\'s temporary patch and rhythm set, from the MIDI Implementation chapter of the '
    + 'owner\'s manual.',

  // p146, Identity Reply Message: F0 7E dev 06 02 41 10 01 00 03 00 00 00 00 F7 — family code 10 01,
  // family number 00 03, revision 00 00 00 00; the message line and the byte table agree. The number
  // tells it apart from the XV-5080, -3080 and -88 (00 00) and the XV-5050 (02 02).
  identity: { familyCode: ['10', '01'], modelNumber: ['00', '03'] },

  blocks: layout.blocks,

  // p159, "Example of an Exclusive Message and Calculating a Checksum", <Example1>: MFX Type of the
  // Performance Common MFX (10 00 00 00 + 02 00 + 00 00) set to OVERDRIVE, 02.
  examples: [
    {
      name: 'Setting MFX Type of Performance Common MFX to OVERDRIVE (DT1)',
      where: 'p159',
      parameter: 'performance.mfx.type',
      value: 2,
      expectedHex: 'F0 41 10 00 10 12 10 00 02 00 02 6C F7',
    },
  ],

  // p40-41, the Bank Select tables for Patches (MSB 87) and Rhythm Sets (MSB 86): PST-A to PST-D (LSB
  // 64-67) with 128 patches each, PST-A and PST-B (LSB 64-65) with 4 rhythm sets each, as the
  // specifications (p162) count them (512, and 8 in 4 x 2 banks).
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...presetGroups('patch', 87, 'PST', 'ABCD', 128, 'Patch 001-128'),
      ['user-rhythm', 'User Rhythm 1-4', 'user', 86, 0, 4],
      ...presetGroups('rhythm', 86, 'PST', 'AB', 4, 'Rhythm 1-4'),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...layout.coverage,
    inboundControllers: 'not modelled: what the instrument receives and transmits as Control Change (received p136-139, transmitted p144-145) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    ...layout.notes,
    'Identity: family code 10 01 and family number 00 03 (p146), its own among the XV series as printed: the XV-5080, XV-3080 and XV-88 print 00 00, the XV-5050 02 02.',
    'Rows the manual marks <*>, ignored when received (p146), are the XV-5080\'s that the XV-2020 lacks (Mix/Parallel, MFX Control MIDI1/2, Voice Reserve 17-32, '
      + 'MFXB and MFXC Source, Receive MIDI1/2, Patch Common Tone Type, and One Shot Mode in Patch and Rhythm Common); they are not laid out. Choice labels the manual tags <*> (outputs B-D and 3-8, MFXB and MFXC) are kept as printed.',
    'Each part\'s scale tune is in its Performance Part block (Part Scale Tune for C … B, 00 25-00 30), and the patch-mode one in System Common (Patch Scale Tune for C … B); '
      + 'there is no System Part block.',
    'Presets list Patches (Bank Select MSB 87: User 00, PST-A to PST-D 64-67) and Rhythm Sets (MSB 86: User 00, PST-A/PST-B 64/65), p40-41, recalled on the profile\'s '
      + 'channel. Not listed: Performances (MSB 85: User 00, PST-A/PST-B 64/65, p41), the General MIDI 2 sounds (MSB 121/120) and the SRX boards (MSB 92/93).',
    'Preset Rhythm sets: the MIDI Implementation\'s Bank Select table (p136) prints Preset Rhythm A and B with PROGRAM NUMBER 001-002 and NUMBER 001-004; '
      + 'the Bank Select table on p41 gives 001-004 for both and the specifications (p162) count 8 (4 x 2 banks). Four each are listed.',
    'p159, <Example3> (an RQ1 for the Temporary Performance) calls the 00 00 00 31 size "the data size of Performance Controller" (it is the Performance Part\'s) and prints '
      + 'its result as F0 41 10 6A 11 10 00 00 00 00 00 2F 31 10 F7, with 6A where the model ID 00 10 belongs. It is not checked.',
    'Chorus Type prints OFF, CHORUS and Reverb Type OFF, REVERB (p148): the XV-2020 has one of each.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not
  // hold is not answered ("If the conditions are not met, nothing is transmitted", p143), and the
  // startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The chapter's own date and version (p136, printed 2002.6.4); the map's cover metadata is the owner's manual's.
  manual: { model: 'XV-2020', date: 'June 4, 2002', version: '1.00' },
};
