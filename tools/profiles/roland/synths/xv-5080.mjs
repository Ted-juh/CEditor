// The Roland XV-5080: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the MIDI Implementation chapter of the "XV-5080 Owner's Manual" (p282-305), dated May 20,
// 2000, version 1.00 at its head (p282). maps/xv-5080.json says which file, with its hash; page
// numbers below are the owner's manual's.
//
// The XV-5080 is the series' flagship and the map the others print: 32 parts, three MFX in a
// performance, a System EQ, and multi-partial patches (a sample per key, set in a Patch Split Key
// block for each key from 21 to 108). The layout the series shares, and what the map as read leaves
// out, is in ../layouts/xv-series.mjs; this file is what is the XV-5080's own.

import { NO_PULL, banks, chorusTypeExample, presetGroups, readXvMap, sharedNotes, xvLayout } from '../layouts/xv-series.mjs';

const XV = readXvMap('xv-5080');
const layout = xvLayout(XV, { parts: 32, systemEq: true, splitKeys: true });

export default {
  id: 'roland-xv-5080',
  name: 'Roland XV-5080',
  family: 'XV',
  map: 'xv-5080',
  deviceId: 0x10,
  description: 'Roland XV-5080 synthesizer module: the system blocks, the temporary performance (common, effects, MIDI, and the Part block '
    + 'of each of its 32 parts), and Part 1\'s temporary patch (with its multi-partial split keys) and rhythm set, from the MIDI '
    + 'Implementation chapter of the owner\'s manual.',

  // p289, Identity Reply Message: F0 7E dev 06 02 41 10 01 00 00 00 00 00 00 F7 — family code 10 01,
  // family number 00 00, revision 00 00 00 00; the message line and the byte table agree. The XV-3080's
  // (p180) and XV-88's (p278) manuals print the same family code and number, so the three are not told
  // apart by their identity reply; see notes.
  identity: { familyCode: ['10', '01'], modelNumber: ['00', '00'] },

  blocks: layout.blocks,

  // p303, "Example of an Exclusive message and calculating a checksum", <Example 1>: Chorus Type of
  // the Performance Common (10 00 00 00 + 04 00 + 00 00) set to DELAY, 02. The page's other examples
  // are RQ1s for whole areas.
  examples: [chorusTypeExample('p303')],

  // p21-22, the Bank Select tables for Patches (MSB 87) and Rhythm Sets (MSB 86), what a part holds.
  // The MIDI Implementation's own table (p282) prints User, Card A-B and Preset A-B and elides the rest
  // with ":"; chapter 1 prints every group: PR-A to PR-G (LSB 64-70) with 128 patches and 2 rhythm sets
  // each, as the specifications (p306) count them (896 patches, 14 rhythm sets).
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...presetGroups('patch', 87, 'PR', 'ABCDEFG', 128, 'Patch 001-128'),
      ['user-rhythm', 'User Rhythm 1-4', 'user', 86, 0, 4],
      ...presetGroups('rhythm', 86, 'PR', 'ABCDEFG', 2, 'Rhythm 1-2'),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...layout.coverage,
    splitKeys: 'every key\'s Patch Split Key block (21-108) that the map addresses, for Part 1\'s patch; they apply to a multi-partial patch '
      + '(Patch Common Tone Type MULTI-PARTIAL) and are read with the patch, on request',
    inboundControllers: 'not modelled: what the instrument receives and transmits as Control Change (received p282-286, transmitted p288-289) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    ...layout.notes,
    'Identity: the XV-5080\'s manual (p289) prints family code 10 01 and family number 00 00, the XV-3080\'s (p180) the same, and the XV-88\'s byte table '
      + '(p278) labels them "Device family code (XV-3080/5080/88)" and "Device family number code (XV-3080/88)" — which reads as though the XV-5080\'s number differed, '
      + 'though its own manual prints 00 00. As printed, the three answer alike (the XV-88 differs only in its revision bytes), and the XV-5050 (10 01 / 02 02) and '
      + 'XV-2020 (10 01 / 00 03) are told apart. Choosing this profile for an XV-3080 or XV-88, or theirs for an XV-5080, is not flagged as a mismatch.',
    'Presets list Patches (Bank Select MSB 87: User 00, PR-A to PR-G 64-70) and Rhythm Sets (MSB 86: User 00, PR-A to PR-G 64-70), p21-22, recalled on the '
      + 'profile\'s channel. Not listed: Performances (MSB 85: User 00, PR-A/PR-B 64/65, selected on the Performance Control Channel), PR-H\'s General MIDI 2 '
      + 'sounds (MSB 121/120), the memory card groups CD-A to CD-H (LSB 32-39, present only with a card), and the SR-JV80 and SRX expansion boards (MSB 88-93).',
    'The address map marks "Performance MIDI (Channel 16)" with *1-2-6, the reference to the Performance Part table, and "Performance Part (Part 1)" with nothing (p291); '
      + 'the mark belongs on Part 1. Every other XV manual prints it there.',
    'p303, <Example 4> ("Getting data (RQ1) at once") lists Part 1\'s temporary patch at 11 20 00 00 and rhythm set at 11 30 00 00, and stops at Part 16 '
      + '(14 60 00 00, 14 70 00 00); the address map (p290) puts Part 1 at 11 00 00 00 with its rhythm set at 11 10 00 00, and the XV-5080 has 32 parts. It also labels '
      + 'the rhythm set\'s first and last tones, keys 21 and 108, "Rhythm Tone 1" and "Rhythm Tone 4". It is an RQ1 and is not checked; the address map is what is laid out.',
    'Chorus Type (0-2) and Reverb Type (0-4) print no labels in the address map; the example (p303) gives DELAY as 02.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not
  // hold is not answered ("If the conditions are not met, nothing is transmitted", p288), and the
  // startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The chapter's own date and version (p282); the map's cover metadata is the owner's manual's.
  manual: { model: 'XV-5080', date: 'May 20, 2000', version: '1.00' },
};
