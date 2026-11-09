// The Roland RD-700NX: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "RD-700NX MIDI Implementation", version 1.00, Oct. 10 2010 (maps/rd-700nx.json says which
// file, with its hash). Page numbers below are that document's.
//
// The address map (p9) is a System area and a temporary Live Set:
//
//   00 00 00 00  System                common, compressor, favorite live sets, V-Link, switch assign
//   10 00 00 00  Live Set (Temporary)  common (with the live set's EQ), song/rhythm, chorus, reverb,
//                                      eight MFX, resonance, and for each of four layers an Internal
//                                      Layer, an External Layer, a Tone, and the three tone types'
//                                      own blocks: Piano, E.Piano and ToneWheel
//
// layouts/rd-nx.mjs holds the shape it shares with the RD-300NX. All of it is laid out.

import { effectCoverage, layerBlocks, liveSetBlocks, mfxBlock, noPull, presetsCoverage, systemBlocks } from '../layouts/rd-nx.mjs';

const LAYERS = [1, 2, 3, 4];
const MFX = [1, 2, 3, 4, 5, 6, 7, 8];

export default {
  id: 'roland-rd-700nx',
  name: 'Roland RD-700NX',
  family: 'RD',
  map: 'rd-700nx',
  deviceId: 0x10,
  description: 'Roland RD-700NX SuperNATURAL stage piano: the system blocks and the whole temporary Live Set (common and EQ, '
    + 'song/rhythm, chorus, reverb, eight MFX, resonance, and each of four layers\' internal and external zone, tone, piano, '
    + 'electric piano and tone-wheel organ settings), from the MIDI Implementation.',

  // p7, Identity Reply Message. The byte table gives family code 50 02 ("Device family code
  // (RD-700NX)"), family number 00 00, revision 00 01 00 00; the message line above it prints
  // "41H, 2BH, 02H", the RD-700GX's family code (the RD-700GX MIDI Implementation prints 2B 02 in both places).
  // 50 02 is used: it is the reading that tells the RD-700NX from the RD-700GX.
  identity: { familyCode: ['50', '02'], modelNumber: ['00', '00'] },

  blocks: [
    ...systemBlocks('System V-Link'),
    ...liveSetBlocks(),
    ...MFX.map((n) => mfxBlock(n)),
    { id: 'liveSet.resonance', table: 'Live Set Resonance', path: ['Live Set (Temporary)', 'Live Set Resonance'], group: 'Live Set · Resonance', strip: /^Resonance\s+/ },
    ...LAYERS.flatMap((n) => layerBlocks(n, ['E.Piano', 'ToneWheel'])),
  ],

  noPull,

  // p13, "Example of an Exclusive Message and Calculating a Checksum", <Example1>: Chorus Type set
  // to DELAY (02), at 10 00 00 00 + 00 04 00 + 00 00. The byte diagram prints F0 41 10 00 00 50 12
  // 10 00 04 00 02 ?? F7 and the working gives the checksum as 6AH; the sentence after it repeats the
  // message as "F0 41 10 00 50 12 10 00 04 00 02 6A F7", one 00 of the model ID short. The diagram's
  // bytes are used. (<Example2> is an RQ1 for the whole Live Set: F0 41 10 00 00 50 11 10 00 00 00
  // 00 07 03 0B 5B F7.)
  examples: [
    {
      name: 'Setting CHORUS TYPE to DELAY (DT1)',
      where: 'p13',
      parameter: 'liveSet.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 50 12 10 00 04 00 02 6A F7',
    },
  ],

  coverage: {
    effectParameterMeanings: effectCoverage,
    presets: presetsCoverage,
    inboundControllers: 'not modelled: what the sliders, pedals, S1/S2 and the harmonic-bar assignment transmit as Control Change (Data Transmission, p6-7) is not mapped yet',
    notModelled: 'nothing in the address map is left out: System (00 00 00 00) and the Temporary Live Set (10 00 00 00) are laid out whole. '
      + 'Of the System Favorite Live Set block only Favorite 1\'s two rows are addressable (see notes)',
  },
  notes: [
    'Layers 1-4 are the offset table\'s "(Layer: 01)" to "(Layer: 04)": Internal Layer 10 00 30 00-10 00 33 00, External Layer '
      + '10 00 40 00-10 00 43 00, Tone 10 01 00 00-10 01 03 00, Piano 10 02 00 00/20 00/40 00/60 00, E.Piano 10 06 00 00-10 06 03 00, '
      + 'ToneWheel 10 07 00 00-10 07 03 00 (p9). Live Set Common names four zones UPPER1, UPPER2, LOWER1 and LOWER2 (Slider Assign, '
      + 'MFX Control Destination, p10); the address map does not say which layer is which zone, so the groups keep its numbers.',
    'Model ID: every byte list (p5, p8), the address map (p9) and both worked examples (p13) give 00 00 50; the prose on p5 says '
      + '"00H 00H 2BH", the RD-700GX\'s.',
    'Dates: the MIDI Implementation is headed Oct. 10, 2010, version 1.00 (p1); its Implementation Chart (p15) is dated Nov. 10, 2010.',
    'System Favorite Live Set (p9) prints one row pair, "Favorite1 - 40 Live Set Category" (00 06) and "Favorite1 - 40 Live Set Number" '
      + '(00 07, three nibbles), then ":" to a last Number at 01 23. At four bytes a favorite this closes on 40 favorites and the Total '
      + 'Size 00 00 01 26, but the map has one row per name and the run is not written out, so only Favorite 1 is laid out (as '
      + 'favorite1LiveSetCategory/Number); favorites 2-40 are at 00 0A + 4 x (n - 2) (category) and the three bytes after it (number).',
    'System Switch Assign prints "One Touch Piano Variation Number" at 00 00-00 02 and "One Touch E.Piano Variation Number" at 00 03-00 05 '
      + 'with no number (the Favorite block\'s matching rows say Piano1-3, E.Piano1-3); they are numbered 1-3 in printed order.',
    'Live Set Common prints "EQ Mid Frequency", "EQ Mid Gain" and "EQ Mid Q" twice (00 34-00 36 and 00 37-00 39): two mid bands, numbered '
      + '1 and 2 in printed order. Its EQ frequency lists print "200.250" for "200, 250" (p10), so they count 30 labels for 31 values and '
      + 'stay numbers 0-30 with the manual\'s list as their description.',
    'Internal Layer prints "Receive Modulation Switch" and "Receive Bender Switch" twice (00 0F/00 10, among the controller switches with '
      + 'Damper, FC1, FC2, the sliders and S1/S2; and 00 1A/00 19, among the received-message switches with Bank Select, Program Change, '
      + 'Volume, Pan, Hold-1 and Expression). They are numbered 1 and 2 in printed order.',
    'Eight MFX blocks are printed (MFX: 01-08, 10 00 10 00-10 00 1E 00, two apart), though the controller assignments name only MFX1 and '
      + 'MFX2 (FC/S1/S2/Slider Assign); all eight are laid out as printed.',
    'Live Set Piano MicroTune 1-128 (00 0B-04 07, four nibbles each) are 128 per-note tuning values (one per note number, it appears; the manual prints only the rows), beside Stretch Tune Type OFF/PRST/USER.',
    'Display ranges one step off their wire ranges, kept as printed: Live Set Tone\'s Cutoff, Resonance, Attack, Decay and Release Time '
      + '(00 0A-00 0E, p12) are 0-127 over "-63 - +63" (the External Layer\'s matching values print "-64 - +63"); Slider Assign (UPPER2), '
      + '(LOWER1) and (LOWER2) (Live Set Common 00 47-00 4B, p10) are (0 - 133) over "0 - 134".',
    'Labels printed once for a run: Harmonic Bar Assign (LOWER2:ON) (00 4F) carries the footage list and the seven rows after it '
      + 'carry none, so only the first is a menu; the rest are numbers 1-9. MFX Control Destination prints its last label "LOWRE2" (sic). '
      + 'Sound Focus Type is (0 - 31) over seven labels and stays a number with the list as its description.',
  ],

  // The cover's Date and Version (p1); the map's source block has neither.
  manual: { date: 'Oct. 10, 2010', version: '1.00' },
};
