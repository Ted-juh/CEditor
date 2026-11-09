// The Roland JUNO-STAGE (2008): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the JUNO-STAGE Owner's Manual (JUNO-STAGE_OM.pdf; maps/juno-stage.json says which file, with
// its hash), whose MIDI Implementation chapter runs from p217 to p243 and prints "Model: JUNO-STAGE,
// Date: May 1, 2008, Version: 1.00" at its head (p217): Bank Select p217, Identity Reply and DT1 p225,
// the Parameter Address Map pp226-239, the worked example p242, the Bank Select and Program Change
// Correspondence Chart p243. Page numbers below are the owner's manual's.
//
// The JUNO-STAGE is the JUNO-G's map two years on, under model ID 00 00 25 — the SonicCell's — and
// laid out with it (../layouts/juno-g-stage-soniccell.mjs). What is its own: the System has only
// Common and Controller (no Mastering, no External Input), and 0F 00 00 00 is "(for editor)" with no
// table under it; the performance has a Zone block per channel, and its zones and controller carry two
// panel switches; Patch mode has the keyboard part ("Kbd Patch") at 1F 00 00 00 and the rhythm
// pattern's ("Rhy Patch") at 1F 20 00 00; the Rhythm Group has sixteen pads; no PC-card banks.

import {
  GM_KEYS, NO_PULL, arpeggioBlocks, chorusTypeExample, keysLeftOut, leftOutNotes, patchModeBlocks, performanceBlocks, presetBanks, systemBlocks,
} from '../layouts/juno-g-stage-soniccell.mjs';

const KEYS = GM_KEYS;

export default {
  id: 'roland-juno-stage',
  name: 'Roland JUNO-STAGE',
  family: 'JUNO',
  map: 'juno-stage',
  deviceId: 0x10,
  description: 'Roland JUNO-STAGE 76-key performance synthesizer (2008): the setup and system blocks, the temporary performance '
    + '(common, MFX 1-3, chorus, reverb, and every part\'s Part, MIDI and Zone blocks), both modes\' temporary arpeggio, chord '
    + 'pattern and rhythm group, and Patch Mode Part 1\'s patch and rhythm set, from the temporary (edit-buffer) area of the '
    + 'MIDI Implementation in the owner\'s manual.',

  // p225, Identity Reply Message (JUNO-STAGE): F0 7E dev 06 02 41 25 02 00 01 00 03 00 00 F7 — family
  // code 25 02, family number code 00 01. The message line and the byte table agree. The SonicCell,
  // which shares the model ID 00 00 25, replies 25 02 / 00 00 (its manual p256): the number tells
  // them apart.
  identity: { familyCode: ['25', '02'], modelNumber: ['00', '01'] },

  blocks: [
    ...systemBlocks({ mastering: false, externalInput: false, controller: true }),
    ...performanceBlocks({ zones: true }),
    ...arpeggioBlocks(),
    ...patchModeBlocks({ root: 'Temporary Patch/Rhythm (Patch Mode Part 1)', label: 'Patch Mode Part 1', keys: KEYS }),
  ],

  // p242, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Performance
  // Common set to DELAY (02), at Temporary Performance 10 00 00 00 + Chorus 04 00 + 00 00 — the
  // manual's only DT1 parameter write. (The Scale Tune message beside it is a GS DT1, model 42,
  // outside this address map.)
  examples: [chorusTypeExample('p242', '00 00 25')],

  // p243, the Correspondence Chart: User Patch 87/0-1, Preset Patch PR-A to PR-I 87/64-72 (PR-I 001-003),
  // User Rhythm 86/0 (001-032), Preset Rhythm 86/64. p217's Bank Select table elides Preset Patch C-I
  // with ":". On the preset rhythm sets the manual disagrees with itself; thirty-two are listed (notes).
  presets: presetBanks({ card: false, presetPatches: { banks: 9, last: 3 }, presetRhythms: 32 }),

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    rhythmKeys: `partial: keys ${KEYS[0]}-${KEYS.at(-1)} of Patch Mode Part 1's rhythm set (${KEYS.length} of 88); `
      + `${keysLeftOut('1F 10 00 00', KEYS)} are not laid out`,
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00, step 00 20 00 00)',
    notModelled: 'Patch Mode Part 2, the rhythm pattern\'s part (1F 20 00 00: patch at 1F 20 00 00, rhythm set at 1F 30 00 00); '
      + 'Temporary Rhythm Pattern (1E 00 00 00); (for editor) (0F 00 00 00, no table in the map); the user memories (20 00 00 00 and up)',
  },
  notes: [
    'Patch Mode Part 1 (1F 00 00 00) is laid out as the keyboard part: the map does not name the two Patch-mode parts, and the Setup '
      + '(Kbd Patch at 00 04-00 06, then Rhy Patch at 00 07-00 09) and System Common (Kbd Patch Rx/Tx Channel, "the Keyboard part in '
      + 'Patch mode", p150) put the keyboard first.',
    ...leftOutNotes({ patchBase: '1F 00 00 00', rhythmBase: '1F 10 00 00', keys: KEYS, keysWhy: 'the General MIDI percussion map' }),
    'Not laid out: Patch Mode Part 2 (1F 20 00 00), the part the rhythm patterns play ("Rhy Patch" in Setup): a patch at 1F 20 00 00 '
      + 'and a rhythm set at 1F 30 00 00, the same blocks as Part 1\'s.',
    'Not laid out: the Temporary Rhythm Pattern (1E 00 00 00). The map\'s one offset table for the arpeggio area is headed '
      + '"Arpeggio (Rhythm Pattern)" (p227) — Arpeggio Common, Arpeggio Pattern (Note 1-16) — which implies the rhythm pattern has '
      + 'the arpeggio\'s layout, but does not say so; it is laid out at the two Temporary Arpeggios only, which the top table names. '
      + 'The JUNO-DS\'s map has the same heading, and its profile leaves the rhythm pattern out for the same reason. It would be 530 more '
      + 'parameters.',
    'Not laid out: 0F 00 00 00, "(for editor)" in the top table (p226), which prints no table for it.',
    'Identity (p225): F0 7E dev 06 02 41 25 02 00 01 00 03 00 00 F7, family code 25 02 and family number 00 01. The SonicCell answers '
      + 'to the same model ID (00 00 25) and family code, with family number 00 00 (its manual p256); the number tells the two apart.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86) from the Correspondence Chart (p243), recalled on the profile\'s '
      + 'channel, which is the Kbd Patch Rx/Tx Channel (System Common 00 0A) in Patch mode. Performances (MSB 85: User 000, Preset 064, '
      + '64 each) are selected on the Performance Control Channel and are not listed; nor are the GM2 (MSB 120/121) or SRX expansion '
      + '(MSB 92/93) banks, whose sizes the manual does not print.',
    'Preset rhythm sets: p217\'s Bank Select table prints Preset Rhythm 86/64 as "001 - 036", and the Correspondence Chart (p243) as '
      + 'Number 001-032 with Program Number 1-36; the Rhythm Set List (pp200-206) ends at PRST 032 and the specifications (p245) say '
      + '"Rhythm Sets: 32 + 9 (GM2)". Thirty-two are listed; the 36 reads as the JUNO-G\'s (its manual p210 and p240), whose preset '
      + 'group has thirty-six.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not
  // answered, and the startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The map's cover metadata is the owner's manual's; the MIDI Implementation chapter's head (p217) prints these.
  manual: { model: 'JUNO-STAGE', date: 'May 1, 2008', version: '1.00' },
};
