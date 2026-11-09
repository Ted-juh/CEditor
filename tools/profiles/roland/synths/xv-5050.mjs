// The Roland XV-5050: which parts of its address map make up the edit buffer, and what to call them.
//
// NOT YET BUILDABLE from maps/xv-5050.json as committed: every table but the top one there is
// "(unnamed)" (see ../layouts/xv-series.mjs). This file goes into synths/ once the map is read again
// with its headings; it was checked against such a reading (headings and reference marks fixed) and
// builds 8,842 parameters with the p174 example matching.
//
// Source: the MIDI Implementation chapter of the "XV-5050 Owner's Manual" (p154-176), dated October
// 4, 2001, version 1.00 at its head (p154). maps/xv-5050.json says which file, with its hash; page
// numbers below are the owner's manual's.
//
// The XV-5050 is the XV-5080's engine in a 1U rack: sixteen parts, Setup at 01 00 00 00 and System at
// 02 00 00 00 (common and a four-band System EQ), and three MFX in a performance — the Temporary
// Performance prints Performance Common MFXA, MFXB and MFXC at 00 02 00, 00 08 00 and 00 0A 00, all
// three the same MFX table. Like the XV-2020, its parts carry their scale tune in the Performance Part
// block. The shared layout, and what the map as read leaves out, is in ../layouts/xv-series.mjs.

import { NO_PULL, banks, chorusTypeExample, presetGroups, readXvMap, sharedNotes, xvLayout } from '../layouts/xv-series.mjs';

const XV = readXvMap('xv-5050');
const layout = xvLayout(XV, { parts: 16, setup: true, systemEq: true, systemParts: false, performanceMfx: ['A', 'B', 'C'] });

export default {
  id: 'roland-xv-5050',
  name: 'Roland XV-5050',
  family: 'XV',
  map: 'xv-5050',
  deviceId: 0x10,
  description: 'Roland XV-5050 synthesizer module: the setup and system blocks, the temporary performance (common, its three MFX, chorus, '
    + 'reverb, MIDI, and the Part block of each of its 16 parts), and Part 1\'s temporary patch and rhythm set, from the MIDI Implementation '
    + 'chapter of the owner\'s manual.',

  // p161, Identity Reply Message: F0 7E dev 06 02 41 10 01 02 02 03 00 00 00 F7 — family code 10 01,
  // family number 02 02, revision 03 00 00 00; the message line and the byte table agree. The number
  // tells it apart from the XV-5080, -3080 and -88 (00 00) and the XV-2020 (00 03).
  identity: { familyCode: ['10', '01'], modelNumber: ['02', '02'] },

  blocks: layout.blocks,

  // p174, "Example of an Exclusive Message and Calculating a Checksum", <Example1>: Chorus Type of the
  // Performance Common set to DELAY (02), the XV-5080's example word for word.
  examples: [chorusTypeExample('p174')],

  // p30-31, the Bank Select tables for Patches (MSB 87) and Rhythm Sets (MSB 86): PA to PH (Preset A-H,
  // LSB 64-71), 128 patches and 2 rhythm sets each, as the specifications (p177) count them (1024 and 16).
  // The MIDI Implementation's table (p154) prints Preset A-B and elides the rest with ":".
  presets: {
    banks: banks([
      ['user-patch', 'User Patch 001-128', 'user', 87, 0, 128],
      ...presetGroups('patch', 87, 'Preset', 'ABCDEFGH', 128, 'Patch 001-128'),
      ['user-rhythm', 'User Rhythm 1-4', 'user', 86, 0, 4],
      ...presetGroups('rhythm', 86, 'Preset', 'ABCDEFGH', 2, 'Rhythm 1-2'),
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...layout.coverage,
    inboundControllers: 'not modelled: what the instrument receives and transmits as Control Change (received p154-157, transmitted p160-161) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    ...layout.notes,
    'Identity: family code 10 01 and family number 02 02 (p161), its own among the XV series as printed: the XV-5080, XV-3080 and XV-88 print 00 00, the XV-2020 00 03.',
    'The performance\'s three MFX are "Performance · MFXA", "· MFXB" and "· MFXC" (ids performance.mfxA.* …), each the Performance Common MFX table (p162-163). '
      + 'Performance Common prints MFXB Source and MFXC Source <*>, ignored when received (p163), so they are not laid out; Part Output MFX Select offers MFXA-MFXC.',
    'Each part\'s scale tune is in its Performance Part block (Part Scale Tune for C … B), and the patch-mode one in System Common; there is no System Part block.',
    'Presets list Patches (Bank Select MSB 87: User 00, Preset A-H 64-71) and Rhythm Sets (MSB 86: User 00, Preset A-H 64-71), p30-31, recalled on the profile\'s '
      + 'channel. Not listed: Performances (MSB 85: User 00, Preset A/B 64/65), the General MIDI 2 sounds (MSB 121/120) and the SRX boards (MSB 92/93).',
  ],

  // Read on request, not at connect. Part 1 holds a patch or a rhythm set, not both; the one it does not
  // hold is not answered ("If the conditions are not met, nothing is transmitted", p159), and the
  // startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The chapter's own date and version (p154); the map's cover metadata is the owner's manual's.
  manual: { model: 'XV-5050', date: 'October 4, 2001', version: '1.00' },
};
