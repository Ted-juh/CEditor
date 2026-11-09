// The Roland Fantom-XR (2004), the Fantom-X's rack module: which parts of its address map make up the edit buffer.
//
// Source: the Fantom-XR Owner's Manual (FANTOM-XR_OM.pdf; maps/fantom-xr.json says which file, with
// its hash), whose MIDI Implementation chapter runs from p245 to p270: Bank Select p245, DT1 and the
// Identity Reply p251, the Parameter Address Map pp252-265, the worked example p269, the Bank Select
// and Program Change Correspondence Chart p270. The chapter prints no date or version at its head; its
// MIDI Implementation Chart (p271) says "Date : Mar. 3, 2004" and "Version : 1.00". Page numbers below
// are the owner's manual's.
//
// The Fantom-XR shares the Fantom-X's model ID (00 6B) and address map, with what a rack has no use
// for printed "(reserve)": no System Controller, no Zone blocks in the performance, no pads in the
// Performance Controller or the Rhythm Group, and one Patch-mode part, "Temporary Patch/Rhythm (Patch
// Mode)" at 1F 00 00 00, where the Fantom-X has a keyboard part and a pad part. Its own rows: a
// keyboard range and fade width in each Performance Part (00 17-00 1A), an Arpeggio and a Rhythm
// Pattern control channel in the Performance Controller (00 18, 00 23), and pattern start/stop notes
// in the Rhythm Group. The layout is ../layouts/fantom-x.mjs.

import { fantomXBlocks, NO_PULL, presetBanks, chorusTypeExample, leftOutNotes, RHYTHM_KEYS } from '../layouts/fantom-x.mjs';

export default {
  id: 'roland-fantom-xr',
  name: 'Roland Fantom-XR',
  family: 'FANTOM',
  map: 'fantom-xr',
  deviceId: 0x10,
  description: 'Roland Fantom-XR sound module (2004): the setup and system blocks, the temporary performance (common, MFX 1-3, '
    + 'chorus, reverb, and every part\'s Part and MIDI blocks), both modes\' temporary arpeggio, chord pattern and rhythm group, '
    + 'and the Patch-mode patch and rhythm set, from the temporary (edit-buffer) area of the MIDI Implementation in the owner\'s manual.',

  // p251, Identity Reply Message (Fantom-XR): F0 7E dev 06 02 41 6B 01 00 01 03 00 00 00 F7 — family code
  // 6B 01, family number code 00 01, software revision 03 00 00 00. The message line and the byte table
  // agree. The family code and number are the Fantom-X's (its manual p306, revision rr 03 00 00 with
  // rr = 00/01/02 for X6/X7/X8); only the revision tells the two apart, and a profile does not read it.
  // See notes.
  identity: { familyCode: ['6B', '01'], modelNumber: ['00', '01'] },

  blocks: fantomXBlocks({
    patchPart: 'Temporary Patch/Rhythm (Patch Mode)',
    patchLabel: 'Patch Mode',
    systemController: false,
    zones: false,
  }),

  // p269, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Performance
  // Common set to DELAY (02) — the Fantom-X's example word for word, "Model ID (Fantom-XR)" in its key.
  // The manual's only DT1 parameter write; the Scale Tune message beside it is a GS DT1 (model 42).
  examples: [chorusTypeExample('p269')],

  // p270, the Correspondence Chart, which p245's Bank Select table agrees with where it prints a row:
  // User and Card Patch 87/0-1 and 87/32-33, Preset Patch PR-A to PR-H 87/64-71 (p245 elides C-H with
  // ":"), User and Card Rhythm 86/0 and 86/32 (001-032), Preset Rhythm 86/64 (001-040).
  presets: presetBanks({ presetRhythmCount: 40 }),

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and input-effect parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    rhythmKeys: `partial: keys ${RHYTHM_KEYS[0]}-${RHYTHM_KEYS.at(-1)} of the Patch-mode rhythm set (${RHYTHM_KEYS.length} of 88); `
      + `21-${RHYTHM_KEYS[0] - 1} (1F 10 10 00-1F 10 2A 00) and ${RHYTHM_KEYS.at(-1) + 1}-108 (1F 11 0A 00-1F 11 3E 00) are not laid out`,
    performancePartTones: 'not modelled: the patches and rhythm sets of the 16 Performance Mode parts (11 00 00 00 to 14 60 00 00, step 00 20 00 00)',
    notModelled: 'Temporary Rhythm Pattern (1E 00 00 00, no table in the map); user memories, samples and patterns; the GS address map (model ID 42, p266-267), which GS sound mode answers to',
  },
  notes: [
    'Patch mode (1F 00 00 00) is the patch or rhythm set the Fantom-XR plays in Patch mode, on the Patch Receive Channel (System Common 00 0A): '
      + 'its patch at 1F 00 00 00 and its rhythm set at 1F 10 00 00, the key blocks from 1F 10 10 00 (key 21) two apart.',
    ...leftOutNotes({ patchBase: '1F 00 00 00' }),
    'Identity (p251): F0 7E dev 06 02 41 6B 01 00 01 03 00 00 00 F7, family code 6B 01, family number 00 01, software revision 03 00 00 00. '
      + 'The Fantom-X6/X7/X8 manual (p306) prints the same family code and number, with a revision of rr 03 00 00 (rr = 00, 01, 02). '
      + 'Profiles match on family and number, not revision, so roland-fantom-xr and roland-fantom-x each accept the other\'s instrument. '
      + 'Unconfirmed on hardware.',
    'Presets list the Patches and Rhythm Sets (Bank Select MSB 87 and 86) from the Correspondence Chart (p270), recalled on the profile\'s '
      + 'channel, which is the Patch Receive Channel in Patch mode. Performances (MSB 85: User 000, Card 032, Preset 064, 64 each) are selected '
      + 'on the Performance Control Channel and are not listed; nor are the GM2 (MSB 120/121) or SRX expansion (MSB 92/93) banks, whose sizes '
      + 'the manual does not print.',
    'MFX Type is printed (0 - 127) in all three MFX tables (p254, p260, p263); the effects chapter (p141) says "Value: 0 (Through)–78". '
      + 'Kept as the tables print it.',
  ],

  // Read on request, not at connect. The Patch-mode part holds a patch or a rhythm set, not both; the one it does not hold is not
  // answered, and the startup read stops at the first request that is not.
  noPull: NO_PULL,

  // The owner's manual's cover gives the map no date or version; the MIDI Implementation Chart (p271) does.
  manual: { model: 'Fantom-XR', date: 'Mar. 3, 2004', version: '1.00' },
};
