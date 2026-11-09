// The Roland Fantom-X6/X7/X8 (2004): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the Fantom-X6/X7/X8 Owner's Manual (FANTOM-X6_X7_X8_OM.pdf; maps/fantom-x.json says which
// file, with its hash), whose MIDI Implementation chapter runs from p298 to p330: Bank Select p298,
// Identity Reply p306, DT1 p306, the Parameter Address Map pp311-325, the worked example p329, the
// Bank Select and Program Change Correspondence Chart p330. The chapter prints no date or version at
// its head; its two MIDI Implementation Charts (p331, p332) say "Date : Feb. 2, 2004" and
// "Version : 1.00". Page numbers below are the owner's manual's.
//
// The Fantom-X and the Fantom-XR share model ID 00 6B and one address map with a few rows changed,
// so their layout is ../layouts/fantom-x.mjs. What is the Fantom-X's own: Patch mode has two parts —
// "Patch mode has two parts, the Pad part and the Keyboard part" (p27) — at 1F 00 00 00 (Part 1) and
// 1F 20 00 00 (Part 2); a System Controller (pedal, D Beam, knobs, switches, pads); a Zone block per
// channel in the performance (its keyboard controller section); and pads in the Performance
// Controller and the Rhythm Group.

import { fantomXBlocks, NO_PULL, presetBanks, chorusTypeExample, leftOutNotes, RHYTHM_KEYS } from '../layouts/fantom-x.mjs';

export default {
  id: 'roland-fantom-x',
  name: 'Roland Fantom-X6/X7/X8',
  family: 'FANTOM',
  map: 'fantom-x',
  deviceId: 0x10,
  description: 'Roland Fantom-X6, Fantom-X7 and Fantom-X8 workstations (2004; one sound engine, one address map): the setup and '
    + 'system blocks, the temporary performance (common, MFX 1-3, chorus, reverb, and every part\'s Part, MIDI and Zone blocks), '
    + 'both modes\' temporary arpeggio, chord pattern and rhythm group, and Patch Mode Part 1\'s patch and rhythm set, from the '
    + 'temporary (edit-buffer) area of the MIDI Implementation in the owner\'s manual.',

  // p306, Identity Reply Message (Fantom-X6, -X7, -X8): F0 7E dev 06 02 41 6B 01 00 01 rr 03 00 00 F7,
  // rr = 00 (X6), 01 (X7), 02 (X8) — family code 6B 01, family number code 00 01. The message lines and
  // the byte tables agree. The Fantom-XR's (its manual p251) has the same family code and number and a
  // software revision of 03 00 00 00; only the revision tells the two apart, and a profile does not
  // read it. See notes.
  identity: { familyCode: ['6B', '01'], modelNumber: ['00', '01'] },

  blocks: fantomXBlocks({
    patchPart: 'Temporary Patch/Rhythm (Patch Mode Part 1)',
    patchLabel: 'Patch Mode Part 1',
    systemController: true,
    zones: true,
  }),

  // p329, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Performance
  // Common set to DELAY (02), at Temporary Performance 10 00 00 00 + Chorus 04 00 + 00 00 — the
  // manual's only DT1 parameter write. (The Scale Tune message beside it is a GS DT1, model 42,
  // outside this address map.)
  examples: [chorusTypeExample('p329')],

  // p330, the Correspondence Chart: User and Card Patch 87/0-1 and 87/32-33, Preset Patch PR-A to PR-H
  // 87/64-71, User and Card Rhythm 86/0 and 86/32 (001-032), Preset Rhythm 86/64 (001-040). p298's Bank
  // Select table prints Preset Rhythm 001-032; see notes.
  presets: presetBanks({ presetRhythmCount: 40 }),

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and input-effect parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    rhythmKeys: `partial: keys ${RHYTHM_KEYS[0]}-${RHYTHM_KEYS.at(-1)} of Patch Mode Part 1's rhythm set (${RHYTHM_KEYS.length} of 88); `
      + `21-${RHYTHM_KEYS[0] - 1} (1F 10 10 00-1F 10 2A 00) and ${RHYTHM_KEYS.at(-1) + 1}-108 (1F 11 0A 00-1F 11 3E 00) are not laid out`,
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00, step 00 20 00 00)',
    notModelled: 'Patch Mode Part 2, the pad part (1F 20 00 00: patch at 1F 20 00 00, rhythm set at 1F 30 00 00); Temporary Rhythm Pattern '
      + '(1E 00 00 00, no table in the map); user memories, samples and patterns; the GS address map (model ID 42, p326-327), which GS sound mode answers to',
  },
  notes: [
    'Patch Mode Part 1 (1F 00 00 00) is laid out as the keyboard part: the map does not name the two Patch-mode parts, and the Setup '
      + '(Kbd Patch at 00 04-00 06, then Pad Patch at 00 07-00 09) and System Common (Kbd Patch Rx/Tx Channel 00 0A, then Pad Patch 00 0B) '
      + 'put the keyboard first. Its patch is at 1F 00 00 00 and its rhythm set at 1F 10 00 00, the key blocks from 1F 10 10 00 (key 21) two apart.',
    ...leftOutNotes({
      patchBase: '1F 00 00 00',
      otherPatchParts: ['Not laid out: Patch Mode Part 2 (1F 20 00 00), the pad part: a patch at 1F 20 00 00 and a rhythm set at 1F 30 00 00, '
        + 'the same blocks as Part 1\'s.'],
    }),
    'Identity (p306): the three sizes reply F0 7E dev 06 02 41 6B 01 00 01 rr 03 00 00 F7 with rr = 00 (X6), 01 (X7), 02 (X8): family code '
      + '6B 01, family number 00 01 for all three, so one profile answers each. The Fantom-XR\'s manual (p251) prints the same family code '
      + 'and number, with a software revision of 03 00 00 00 against the Fantom-X\'s rr 03 00 00. Profiles match on family and number, not '
      + 'revision, so roland-fantom-x and roland-fantom-xr each accept the other\'s instrument. Unconfirmed on hardware.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86) from the Correspondence Chart (p330), recalled on the profile\'s '
      + 'channel, which is the Kbd Patch Rx/Tx Channel (System Common 00 0A) in Patch mode. p298\'s Bank Select table prints Preset Rhythm '
      + '"001 - 032" at 86/64 and elides Preset Patch C-H with ":"; the chart (PRST 001-040) and the specifications ("Rhythm Sets: 40 + 9 (GM2)", '
      + 'p333) agree on forty, so forty are listed. Performances (MSB 85: User 000, Card 032, Preset 064, 64 each) are selected on the Performance '
      + 'Control Channel and are not listed; nor are the GM2 (MSB 120/121) or SRX expansion (MSB 92/93) banks, whose sizes the manual does not print.',
    'Performance Common MFX (p314) prints MFX Type as (0 - 78) with "0 - 127" on its display line; Patch Common MFX (p320) and Rhythm Common '
      + 'MFX (p323) print (0 - 127). The effects chapter (p211) says "Value: 0 (Through)–78". Each is kept as its table prints it.',
    'Setup Sound Mode (p311) prints its values as "PATCH, PERFORM, GM1, GM2, GS, PIANO<*>": the last label carries the "<*>" mark the map uses '
      + 'for values ignored on receipt, and is kept as printed.',
    'Beam Trigger Pad is (0 - 15) in both places it is printed, with the display line "1 - 16" in the System Controller (p313) and "1 - 15" '
      + 'in the Performance Controller (p316); sixteen values are 1-16. Each is kept as printed.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not
  // answered, and the startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The owner's manual's cover gives the map no date or version; the MIDI Implementation Charts (p331, p332) do.
  manual: { model: 'Fantom-X6/X7/X8', date: 'Feb. 2, 2004', version: '1.00' },
};
