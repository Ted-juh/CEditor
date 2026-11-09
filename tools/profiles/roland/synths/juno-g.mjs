// The Roland JUNO-G (2006): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the JUNO-G Owner's Manual (JUNO-G_OM.pdf; maps/juno-g.json says which file, with its hash),
// whose MIDI Implementation chapter runs from p210 to p240 and prints "Model: JUNO-G, Date: Feb. 1,
// 2006, Version: 1.00" at its head (p210): Bank Select p210, Identity Reply and DT1 p218, the
// Parameter Address Map pp222-235, the worked example p239, the Bank Select and Program Change
// Correspondence Chart p240. Page numbers below are the owner's manual's.
//
// The JUNO-G is the Fantom-X's engine in a 61-key synthesizer, and prints its address map under its
// own model ID, 00 00 15 (../layouts/juno-g-stage-soniccell.mjs has the layout it shares with the
// SonicCell and the JUNO-STAGE). What is its own: the System has all four blocks (Common, Mastering,
// External Input, Controller); the performance has a Zone block per channel; Patch mode has two
// parts, the keyboard part ("Kbd Patch") at 1F 00 00 00 and the rhythm pattern's ("Rhy Patch") at
// 1F 20 00 00; the Rhythm Group has six pads; and there are PC-card banks.

import {
  GM_KEYS, NO_PULL, arpeggioBlocks, chorusTypeExample, keysLeftOut, leftOutNotes, patchModeBlocks, performanceBlocks, presetBanks, systemBlocks,
} from '../layouts/juno-g-stage-soniccell.mjs';

const KEYS = GM_KEYS;

export default {
  id: 'roland-juno-g',
  name: 'Roland JUNO-G',
  family: 'JUNO',
  map: 'juno-g',
  deviceId: 0x10,
  description: 'Roland JUNO-G workstation (2006): the setup and system blocks, the temporary performance (common, MFX 1-3, '
    + 'chorus, reverb, and every part\'s Part, MIDI and Zone blocks), both modes\' temporary arpeggio, chord pattern and rhythm '
    + 'group, and Patch Mode Part 1\'s patch and rhythm set, from the temporary (edit-buffer) area of the MIDI Implementation '
    + 'in the owner\'s manual.',

  // p218, Identity Reply Message (JUNO-G): F0 7E dev 06 02 41 6B 01 02 01 04 03 00 00 F7 — family code
  // 6B 01, family number code 02 01. The message line and the byte table agree. The family code is the
  // Fantom-X's (its manual p306: 6B 01 / 00 01); the number tells the two apart.
  identity: { familyCode: ['6B', '01'], modelNumber: ['02', '01'] },

  blocks: [
    ...systemBlocks({ mastering: true, externalInput: true, controller: true }),
    ...performanceBlocks({ zones: true }),
    ...arpeggioBlocks(),
    ...patchModeBlocks({ root: 'Temporary Patch/Rhythm (Patch Mode Part 1)', label: 'Patch Mode Part 1', keys: KEYS }),
  ],

  // p239, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Performance
  // Common set to DELAY (02), at Temporary Performance 10 00 00 00 + Chorus 04 00 + 00 00 — the
  // manual's only DT1 parameter write. (The Scale Tune message on p240 is a GS DT1, model 42, outside
  // this address map.)
  examples: [chorusTypeExample('p239', '00 00 15')],

  // p240, the Correspondence Chart: User Patch 87/0-1, Card Patch 87/32-33, Preset Patch PR-A to PR-F
  // 87/64-69, User and Card Rhythm 86/0 and 86/32 (001-032), Preset Rhythm 86/64 (001-036). p210's Bank
  // Select table agrees, eliding Preset Patch C-F with ":"; the specifications (p243: "Patches: 768 +
  // 256 (GM2)", "Rhythm Sets: 36 + 9 (GM2)") count six preset patch banks and thirty-six rhythm sets.
  presets: presetBanks({ card: true, presetPatches: { banks: 6, last: 128 }, presetRhythms: 36 }),

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and input-effect parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    rhythmKeys: `partial: keys ${KEYS[0]}-${KEYS.at(-1)} of Patch Mode Part 1's rhythm set (${KEYS.length} of 88); `
      + `${keysLeftOut('1F 10 00 00', KEYS)} are not laid out`,
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00, step 00 20 00 00)',
    notModelled: 'Patch Mode Part 2, the rhythm pattern\'s part (1F 20 00 00: patch at 1F 20 00 00, rhythm set at 1F 30 00 00); '
      + 'Temporary Rhythm Pattern (1E 00 00 00, no table in the map); user memories, samples and songs',
  },
  notes: [
    'Patch Mode Part 1 (1F 00 00 00) is laid out as the keyboard part: the map does not name the two Patch-mode parts, and the Setup '
      + '(Kbd Patch at 00 04-00 06, then Rhy Patch at 00 07-00 09) and System Common (Kbd Patch Rx/Tx Channel, "the Keyboard part in '
      + 'Patch mode", p160) put the keyboard first.',
    ...leftOutNotes({ patchBase: '1F 00 00 00', rhythmBase: '1F 10 00 00', keys: KEYS, keysWhy: 'the General MIDI percussion map' }),
    'Not laid out: Patch Mode Part 2 (1F 20 00 00), the part the rhythm patterns play ("Rhy Patch" in Setup): a patch at 1F 20 00 00 '
      + 'and a rhythm set at 1F 30 00 00, the same blocks as Part 1\'s.',
    'Not laid out: the Temporary Rhythm Pattern (1E 00 00 00). The top table names it and the map prints no table for it; its one '
      + '"Arpeggio" offset table (p222) is laid out at the two Temporary Arpeggios. The JUNO-STAGE\'s manual heads the same table '
      + '"Arpeggio (Rhythm Pattern)".',
    'Identity (p218): F0 7E dev 06 02 41 6B 01 02 01 04 03 00 00 F7, family code 6B 01 and family number 02 01. The Fantom-X6/X7/X8 '
      + 'reply with the same family code and number 00 01 (its manual p306), so the two are told apart by the number.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86) from the Correspondence Chart (p240), recalled on the profile\'s '
      + 'channel, which is the Kbd Patch Rx/Tx Channel (System Common 00 0A) in Patch mode. Card banks are the PC card\'s. Performances '
      + '(MSB 85: User 000, Card 032, Preset 064, 64 each) are selected on the Performance Control Channel and are not listed; nor are the '
      + 'GM2 (MSB 120/121) or SRX expansion (MSB 92/93) banks, whose sizes the manual does not print.',
    'Performance Common MFX (p225) prints MFX Type as (0 - 78) with "0 - 127" as its display line; Patch Common MFX (p230) and Rhythm '
      + 'Common MFX (p233) print (0 - 127). The effect parameters (p126) and the specifications (p243) count 78 types, "0-78". Each table '
      + 'is kept as it prints it.',
    'Setup Sound Mode (p223) prints its values as "PATCH, PERFORM, GM1, GM2, GS, PIANO<*>": the last label carries the "<*>" mark the map '
      + 'uses for values ignored on receipt, and is kept as printed.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not
  // answered, and the startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The map's cover metadata is the owner's manual's; the MIDI Implementation chapter's head (p210) prints these.
  manual: { model: 'JUNO-G', date: 'Feb. 1, 2006', version: '1.00' },
};
