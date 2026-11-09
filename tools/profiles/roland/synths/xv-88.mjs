// The Roland XV-88: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the MIDI Implementation chapter of the "XV-88 Owner's Manual" (p270-296), dated February
// 15, 2000, version 1.00 at its head (p270). maps/xv-88.json says which file, with its hash; page
// numbers below are the owner's manual's.
//
// The XV-88 is the XV-3080 as an 88-key instrument: the same sixteen-part map, the XV-5080's rows
// tagged `<XV-5080>` (and some `<XV-3080/5080>`), plus what a keyboard needs — a System Keyboard
// block (transmit settings, sliders, pedals, arpeggiator, D Beam), and in the Temporary Performance a
// Keyboard block and sixteen Zones, one per transmit channel. The shared layout, and what the map as
// read leaves out, is in ../layouts/xv-series.mjs; this file is what is the XV-88's own.

import { NO_PULL, banks, chorusTypeExample, presetGroups, readXvMap, sharedNotes, xvLayout } from '../layouts/xv-series.mjs';

const XV = readXvMap('xv-88');
const layout = xvLayout(XV, { parts: 16, systemKeyboard: true, zones: true });

export default {
  id: 'roland-xv-88',
  name: 'Roland XV-88',
  family: 'XV',
  map: 'xv-88',
  deviceId: 0x10,
  description: 'Roland XV-88 88-key synthesizer: the system blocks with the keyboard settings, the temporary performance (common, effects, '
    + 'MIDI, the Part block of each of its 16 parts, the keyboard block and its zones), and Part 1\'s temporary patch and rhythm set, '
    + 'from the MIDI Implementation chapter of the owner\'s manual.',

  // p278, Identity Reply Message. The message line prints F0 7E dev 06 02 41 10 01 00 00 00 00 00 00 F7;
  // the byte table beneath it prints family code 10 01 "(XV-3080/5080/88)", family number 00 00
  // "(XV-3080/88)" and revision 01 01 00 00. Family and number agree, and are the XV-3080's and
  // XV-5080's; only the revision bytes, which profiles do not pin, differ. See notes.
  identity: { familyCode: ['10', '01'], modelNumber: ['00', '00'] },

  blocks: layout.blocks,

  // p294, "Example of an Exclusive Message and Calculating a Checksum", <Example 1>: Chorus Type of the
  // Performance Common set to DELAY (02), the XV-5080's example word for word.
  examples: [chorusTypeExample('p294')],

  // p207, the Bank Select tables for Patches (MSB 87) and Rhythm Sets (MSB 86): PR-A to PR-F (LSB 64-69),
  // 128 patches and 2 rhythm sets each, as the specifications (p298) count them (768 and 12). The MIDI
  // Implementation's table (p270) prints Preset A-B and elides the rest with ":".
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
    zones: 'the Performance Keyboard block and every Performance Zone (Channel n) the map addresses (of 1-16); the manual calls them Zone 1-16 and so do the groups',
    inboundControllers: 'not modelled: what the keyboard, sliders, pedals and D Beam transmit and what the instrument receives as Control Change (received p270-273, transmitted p276-278) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    ...layout.notes,
    'Identity: the message line (p278) ends 00 00 00 00 where the byte table beneath it gives the revision as 01 01 00 00; the family code and number, 10 01 and 00 00, '
      + 'agree in both and are what the XV-3080 (p180) and XV-5080 (p289) print, so the three are not told apart by their identity reply as printed. The byte table\'s '
      + 'labels, "Device family code (XV-3080/5080/88)" and "Device family number code (XV-3080/88)", read as though the XV-5080\'s number differed, which its own '
      + 'manual does not say. Choosing this profile for an XV-3080 or XV-5080, or theirs for an XV-88, is not flagged as a mismatch.',
    'The Temporary Performance\'s zones are printed "Performance Zone (Channel n)" (p279) and called Zone 1-16 in the manual (p57-64); they are ids zone<n>.* and '
      + 'groups "Zone n". "Performance Keyboard" (Key Mode, the arpeggiator and D Beam of the performance) is "Performance · Keyboard".',
    'The address map is the XV-5080\'s, with the XV-5080\'s rows tagged <XV-5080> and outputs the XV-88 lacks tagged <XV-3080/5080> (p279-288). Those in blocks the '
      + 'XV-88 sends are laid out, tag and all; the Part blocks and scale tunes for Parts 17-32 are not. Solo Part Select (Performance Common 00 0C) is tagged <XV-5080> '
      + 'here, though the XV-3080\'s manual prints it untagged.',
    'Presets list Patches (Bank Select MSB 87: User 00, PR-A to PR-F 64-69) and Rhythm Sets (MSB 86: User 00, PR-A to PR-F 64-69), p207, recalled on the profile\'s '
      + 'channel. Not listed: Performances (MSB 85: User 00, PR-A/PR-B 64/65, p206), PR-H\'s General MIDI 2 sounds (MSB 121/120), the card groups CD-A to CD-H '
      + '(LSB 32-39) and the expansion boards (MSB 88-93).',
    'p294, <Example 4> lists Part 1\'s temporary patch at 11 20 00 00 and rhythm set at 11 30 00 00, where the address map (p279) has 11 00 00 00 and 11 10 00 00, '
      + 'and calls keys 21 and 108 "Rhythm Tone 1" and "Rhythm Tone 4". It is an RQ1 and is not checked.',
    'Chorus Type (0-2) and Reverb Type (0-4) print no labels in the address map; the example (p294) gives DELAY as 02.',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not
  // hold is not answered ("If the conditions are not met, nothing is transmitted", p275), and the
  // startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The chapter's own date and version (p270); the map's cover metadata is the owner's manual's.
  manual: { model: 'XV-88', date: 'February 15, 2000', version: '1.00' },
};
