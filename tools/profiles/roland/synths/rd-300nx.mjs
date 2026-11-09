// The Roland RD-300NX: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-300NX MIDI Implementation", version 1.00, Dec. 10 2010 (maps/rd-300nx.json says which
// file, with its hash). Page numbers below are that document's.
//
// The address map (p9) is a System area and a temporary Live Set:
//
//   00 00 00 00  System                common, compressor, favorite live sets, V-LINK, switch assign
//   10 00 00 00  Live Set (Temporary)  common, song/rhythm, chorus, reverb, one MFX, and for each of
//                                      three layers an Internal Layer, an External Layer, a Tone and a
//                                      Piano block
//
// layouts/rd-nx.mjs holds the shape it shares with the RD-700NX. All of it is laid out.

import { effectCoverage, layerBlocks, liveSetBlocks, mfxBlock, noPull, presetsCoverage, systemBlocks } from '../layouts/rd-nx.mjs';

const LAYERS = [1, 2, 3];

export default {
  id: 'roland-rd-300nx',
  name: 'Roland RD-300NX',
  family: 'RD',
  map: 'rd-300nx',
  deviceId: 0x10,
  description: 'Roland RD-300NX SuperNATURAL stage piano: the system blocks and the whole temporary Live Set (common, '
    + 'song/rhythm, chorus, reverb, MFX, and each of three layers\' internal and external zone, tone and piano settings), '
    + 'from the MIDI Implementation.',

  // p9, Identity Reply Message: F0 7E dev 06 02 41 51 02 00 00 00 01 00 00 F7 — family code 51 02,
  // family number 00 00, software revision 00 01 00 00. The message line and the byte table agree.
  identity: { familyCode: ['51', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks('System V-LINK'),
    ...liveSetBlocks(),
    mfxBlock(),
    ...LAYERS.flatMap((n) => layerBlocks(n)),
  ],

  noPull,

  // p14, "Example of an Exclusive Message and Calculating a Checksum", <Example1>: Chorus Type of
  // the Live Set set to DELAY (02), at 10 00 00 00 + 00 04 00 + 00 00. Printed with the model ID
  // 00 00 51, as the address map's heading (p9) and both DT1/RQ1 byte lists for transmission give it.
  // (<Example2>, p14-15, is an RQ1 for the whole Live Set: F0 41 10 00 00 51 11 10 00 00 00
  // 00 02 44 0B 1F F7.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of LIVE SET COMMON to DELAY (DT1)',
      where: 'p14',
      parameter: 'liveSet.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 51 12 10 00 04 00 02 6A F7',
    },
  ],

  coverage: {
    effectParameterMeanings: effectCoverage,
    presets: presetsCoverage,
    inboundControllers: 'not modelled: what the sliders, pedals and S1/S2 transmit as Control Change (Data Transmission, p7-8) is not mapped yet',
    notModelled: 'nothing in the address map is left out: System (00 00 00 00) and the Temporary Live Set (10 00 00 00) are laid out whole. '
      + 'Of the System Favorite Live Set block only Favorite 1\'s two rows are addressable (see notes)',
  },
  notes: [
    'Layers 1-3 are the offset table\'s "(Layer: 01)" to "(Layer: 03)": Internal Layer 10 00 30 00-10 00 32 00, External Layer '
      + '10 00 40 00-10 00 42 00, Tone 10 01 00 00-10 01 02 00, Piano 10 02 00 00/10 02 20 00/10 02 40 00 (p9). Live Set Common names '
      + 'three keyboard zones UPPER1, UPPER2 and LOWER (Slider Assign, p11) and Internal Layer three Control Slider Switches for them; the '
      + 'address map does not say which layer is which zone, so the groups keep its numbers.',
    'Model ID: the address map (p9), the RQ1 byte list (p6), the transmitted DT1 byte list (p9) and both worked examples (p14-15) give '
      + '00 00 51. The received DT1 byte list (p6) prints 00 00 50, the RD-700NX\'s, and the prose above it (p6) "00H 00H 2BH", the '
      + 'RD-700GX\'s. The profile uses 00 00 51.',
    'System Favorite Live Set (p10) prints one row pair, "Favorite1 - 24 Live Set Category" (00 06) and "Favorite1 - 24 Live Set Number" '
      + '(00 07, three nibbles), then ":" to a last Number at 01 13. Only that first pair is laid out (as favorite1LiveSetCategory/Number). '
      + 'At four bytes a favorite the last Number at 01 13 and the Total Size 00 00 01 16 make 36 favorites, not 24 (24 would end at '
      + '00 66); the manual does not say which is right, so favorites 2 onward are not addressed.',
    'Internal Layer prints "Modulation Switch" and "Bender Switch" twice (00 0F/00 10, among the controller switches with Damper, FC1, '
      + 'FC2, the sliders and S1/S2; and 00 1A/00 19, among the received-message switches with Bank Select, Program Change, Volume, Pan, '
      + 'Hold-1 and Expression). They are numbered 1 and 2 in printed order.',
    'Live Set Piano MicroTune 1-128 (00 0B-04 07, four nibbles each) are 128 per-note tuning values (one per note number, it appears; the manual prints only the rows), beside Stretch Tune Type OFF/PRST/USER.',
    'Display ranges one step off their wire ranges, kept as printed: Live Set Tone\'s Cutoff, Resonance, Attack, Decay and Release Time '
      + '(00 0A-00 0E, p13) are 0-127 over "-63 - +63" (the External Layer\'s matching values print "-64 - +63"); Slider Assign (UPPER2) '
      + 'and (LOWER) (Live Set Common 00 47, 00 49, p11) are (0 - 133) over "0 - 134".',
    'Value lists that do not count out stay numbers with the manual\'s line as their description: System V-Link Mode prints '
      + '"BANK/PC.NOTE" for two values (p10); Live Set Common\'s Sound Focus Assign is (0 - 31) over seven labels (p11); the FC, '
      + 'System FC and Slider Assign lists elide their CC numbers.',
  ],
};
