// The Roland SonicCell (2007): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the SonicCell Owner's Manual (SonicCell_OM.pdf; maps/soniccell.json says which file, with its
// hash), whose MIDI Implementation chapter runs from p246 to p276 and prints "Model: SonicCell, Date:
// 2007.6.15, Version: 1.00" at its head (p246): Bank Select p246, Identity Reply and DT1 p256, the
// Parameter Address Map pp257-271, the worked example p275. Page numbers below are the owner's manual's.
//
// The SonicCell, a desktop sound module with an audio interface, prints the JUNO-G's address map with
// less in it, under model ID 00 00 25 — which the JUNO-STAGE uses too — and is laid out with both
// (../layouts/juno-g-stage-soniccell.mjs). What is its own is mostly what it does not have: no System
// Controller, no Zone blocks, no arpeggio, chord or rhythm-group area, and a Performance Controller
// with one parameter (Recommended Tempo) in its 88 bytes. Patch mode has one part, "Temporary
// Patch/Rhythm (Patch Mode)" at 1F 00 00 00, received on the Patch Receive Channel. Each Performance
// Part carries its own keyboard range and fade widths (00 17-00 1A), which the keyboards keep in their
// zones; and the System External Input carries the audio interface's routing (USB Audio Assign,
// Input Assign, To Computer, MFX3 Location).
//
// Without the arpeggio area (1,362 parameters on the JUNO-G, 1,422 on the JUNO-STAGE) the rhythm set
// takes General MIDI 2's keys, 27-88, rather than General MIDI's 35-81; the SonicCell "Conforms to
// General MIDI 2 System" (p278).

import {
  GM2_KEYS, NO_PULL, chorusTypeExample, keysLeftOut, leftOutNotes, patchModeBlocks, performanceBlocks, presetBanks, systemBlocks,
} from '../layouts/juno-g-stage-soniccell.mjs';

const KEYS = GM2_KEYS;

export default {
  id: 'roland-soniccell',
  name: 'Roland SonicCell',
  family: 'SonicCell',
  map: 'soniccell',
  deviceId: 0x10,
  description: 'Roland SonicCell sound module with audio interface (2007): the setup and system blocks, the temporary performance '
    + '(common, MFX 1-3, chorus, reverb, and every part\'s Part and MIDI blocks), and the Patch-mode patch and rhythm set, from the '
    + 'temporary (edit-buffer) area of the MIDI Implementation in the owner\'s manual.',

  // p256, Identity Reply Message (SonicCell): F0 7E dev 06 02 41 25 02 00 00 00 00 00 00 F7 — family code
  // 25 02, family number code 00 00. The message line and the byte table agree. The JUNO-STAGE, which
  // shares the model ID 00 00 25, replies 25 02 / 00 01 (its manual p225): the number tells them apart.
  identity: { familyCode: ['25', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks({ mastering: true, externalInput: true, controller: false }),
    ...performanceBlocks({ zones: false }),
    ...patchModeBlocks({ root: 'Temporary Patch/Rhythm (Patch Mode)', label: 'Patch Mode', keys: KEYS }),
  ],

  // p275, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Performance
  // Common set to DELAY (02), at Temporary Performance 10 00 00 00 + Chorus 04 00 + 00 00 — the
  // manual's only DT1 parameter write. (The Scale Tune message after it is a GS DT1, model 42,
  // outside this address map.)
  examples: [chorusTypeExample('p275', '00 00 25')],

  // p246, the Bank Select table: User Patch 87/0-1, Preset Patch A and B 87/64-65 and then ":", User and
  // Preset Rhythm 86/0 and 86/64 (001-032). The Patch List (pp224-230) fills the ":" in: PR-A to PR-G at
  // CC#32 64 to 70, 128 each, as the specifications (p278: "Patches: 896 + 256 (GM2)") count.
  presets: presetBanks({ card: false, presetPatches: { banks: 7, last: 128 }, presetRhythms: 32 }),

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and input-effect parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what is received as CC is not mapped yet',
    rhythmKeys: `partial: keys ${KEYS[0]}-${KEYS.at(-1)} of the Patch-mode rhythm set (${KEYS.length} of 88); `
      + `${keysLeftOut('1F 10 00 00', KEYS)} are not laid out`,
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00, step 00 20 00 00)',
    notModelled: 'the user memories (User Performance 20 00 00 00, User Patch 30 00 00 00, User Rhythm Set 40 00 00 00 and on)',
  },
  notes: [
    ...leftOutNotes({ patchBase: '1F 00 00 00', rhythmBase: '1F 10 00 00', keys: KEYS, keysWhy: 'every key a General MIDI 2 drum set uses' }),
    'Identity (p256): F0 7E dev 06 02 41 25 02 00 00 00 00 00 00 F7, family code 25 02 and family number 00 00. The JUNO-STAGE answers '
      + 'to the same model ID (00 00 25) and family code, with family number 00 01 (its manual p225); the number tells the two apart.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86), recalled on the profile\'s channel, which is the Patch Receive '
      + 'Channel (System Common 00 0A) in Patch mode. Performances (MSB 85: User 000, Preset 064, 64 each) are selected on the Performance '
      + 'Control Channel and are not listed; nor are the GM2 (MSB 120/121) or SRX expansion (MSB 92/93) banks, whose sizes the manual does not print.',
    'Performance Part (p262) prints "Part Attack Offset", "Part Release Offset" and "Part Decay Offset", and Patch Common (p263) "Attack '
      + 'Offset" and "Release Offset", where the JUNO-G\'s and JUNO-STAGE\'s print "… Time Offset" at the same addresses; the ids follow '
      + 'the manual (performance.partN.attackOffset, patch.attackOffset), so they differ from theirs.',
    'Performance Controller (p263) is 88 bytes (Total Size 00 00 00 58) of which one parameter is printed, Recommended Tempo at 00 54; '
      + 'the rest is reserved, where the JUNO-G\'s and JUNO-STAGE\'s carry their D Beam, arpeggio, rhythm-pattern and chord settings.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not
  // answered, and the startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The map's cover metadata is the owner's manual's; the MIDI Implementation chapter's head (p246) prints these.
  manual: { model: 'SonicCell', date: '2007.6.15', version: '1.00' },
};
