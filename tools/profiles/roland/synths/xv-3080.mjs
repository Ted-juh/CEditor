// The Roland XV-3080: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the MIDI Implementation chapter of the "XV-3080 Owner's Manual" (p173-195), dated December
// 18, 1999, version 1.0 at its head (p173; the Implementation Chart, p195, says 1.00). maps/xv-3080.json
// says which file, with its hash; page numbers below are the owner's manual's.
//
// The XV-3080 came first and prints the XV-5080's address map: sixteen parts, one MFX, no System EQ,
// no multi-partial patches; the rows only the XV-5080 has (Parts 17-32, MFX2 and MFX3, outputs D, 7
// and 8, the sample wave group) are tagged `<XV-5080>`. The shared layout, and what the map as read
// leaves out, is in ../layouts/xv-series.mjs; this file is what is the XV-3080's own.

import { NO_PULL, banks, chorusTypeExample, presetGroups, readXvMap, sharedNotes, xvLayout } from '../layouts/xv-series.mjs';

const XV = readXvMap('xv-3080');
const layout = xvLayout(XV, { parts: 16 });

export default {
  id: 'roland-xv-3080',
  name: 'Roland XV-3080',
  family: 'XV',
  map: 'xv-3080',
  deviceId: 0x10,
  description: 'Roland XV-3080 synthesizer module: the system blocks, the temporary performance (common, effects, MIDI, and the Part block '
    + 'of each of its 16 parts), and Part 1\'s temporary patch and rhythm set, from the MIDI Implementation chapter of the owner\'s manual.',

  // p180, Identity Reply Message: F0 7E dev 06 02 41 10 01 00 00 00 00 00 00 F7 — family code 10 01,
  // family number 00 00, revision 00 00 00 00; the message line and the byte table agree. That is the
  // XV-5080's reply (its p289) to the byte; see notes.
  identity: { familyCode: ['10', '01'], modelNumber: ['00', '00'] },

  blocks: layout.blocks,

  // p193, "Example of an Exclusive message and calculating a checksum", <Example 1>: Chorus Type of the
  // Performance Common set to DELAY (02), the XV-5080's example word for word.
  examples: [chorusTypeExample('p193')],

  // p18, the Bank Select tables for Patches (MSB 87) and Rhythm Sets (MSB 86): PR-A to PR-F (LSB 64-69),
  // 128 patches and 2 rhythm sets each, as the specifications (p196) count them (768 and 12). The MIDI
  // Implementation's table (p173) prints Preset A-B and elides the rest with ":".
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...presetGroups('patch', 87, 'PR', 'ABCDEF', 128, 'Patch 001-128'),
      ['user-rhythm', 'User Rhythm 1-4', 'user', 86, 0, 4],
      ...presetGroups('rhythm', 86, 'PR', 'ABCDEF', 2, 'Rhythm 1-2'),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...layout.coverage,
    inboundControllers: 'not modelled: what the instrument receives and transmits as Control Change (received p173-176, transmitted p179-180) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    ...layout.notes,
    'Identity: the manual (p180) prints family code 10 01 and family number 00 00, the same as the XV-5080\'s (p289) and the XV-88\'s; the three are not told '
      + 'apart by their identity reply as printed. Choosing this profile for an XV-5080 or XV-88, or theirs for an XV-3080, is not flagged as a mismatch. '
      + 'The text that points to the reply (p176) gives its page as "p.$$$".',
    'The address map is the XV-5080\'s: Performance Common\'s Voice Reserve 17-32, MFX2 Source and MFX3 Source, Performance Part\'s Receive MIDI1/2 and Output MFX Select, '
      + 'Patch Common\'s Tone Type and One Shot Mode and the like are printed tagged <XV-5080> (p181-189). They are in the blocks the XV-3080 sends and are laid out, '
      + 'tag and all; the Part blocks and scale tunes for Parts 17-32 are not.',
    'Presets list Patches (Bank Select MSB 87: User 00, PR-A to PR-F 64-69) and Rhythm Sets (MSB 86: User 00, PR-A to PR-F 64-69), p18, recalled on the profile\'s '
      + 'channel. Not listed: Performances (MSB 85: User 00, PR-A/PR-B 64/65, p19), PR-H\'s General MIDI 2 sounds (MSB 121/120), the card groups CD-A to CD-H '
      + '(LSB 32-39) and the expansion boards (MSB 88-93).',
    'Patch Common MFX and Rhythm Common MFX print MFX Type as (0 - 127) with "0 - 72" beneath it (p185, p187), which the profile shows as a 0-72 display over the 0-127 '
      + 'wire range; Performance Common MFX prints (0 - 127) alone, and the specifications (p196) count 63 MFX types. Kept as printed.',
    'p193, <Example 3> works out F0 41 10 00 10 11 10 00 00 00 00 00 2F 21 ?? F7 and then prints the result as F0 41 10 01 10 11 … 20 F7, with model ID 01 10. '
      + '<Example 4> lists Part 1\'s temporary patch at 11 20 00 00 and rhythm set at 11 30 00 00, where the address map (p181) has 11 00 00 00 and 11 10 00 00, '
      + 'and calls keys 21 and 108 "Rhythm Tone 1" and "Rhythm Tone 4". Both are RQ1s and are not checked.',
    'Chorus Type (0-2) and Reverb Type (0-4) print no labels in the address map; the example (p193) gives DELAY as 02.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not
  // hold is not answered ("If the conditions are not met, nothing is transmitted", p178), and the
  // startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The chapter's own date and version (p173); the map's cover metadata is the owner's manual's.
  manual: { model: 'XV-3080', date: 'December 18, 1999', version: '1.0' },
};
