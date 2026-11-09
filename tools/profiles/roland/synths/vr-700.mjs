// The Roland VR-700 (V-Combo): which parts of its address map make up the edit buffer, and what to
// call them.
//
// Source: "VR-700 MIDI Implementation", version 1.00, January 1 2010 (maps/vr-700.json says which
// file, with its hash). Page numbers below are that document's. The cover's Model/Date/Version
// block is set as three labels above three values, and the importer read it one line off: the map
// says model null, date "Version:", version "VR-700". The cover (p1) and the Implementation Chart
// (p11) both print Model VR-700, Date Jan. 1, 2010, Version 1.00.
//
// The address map (p7) is two areas:
//
//   00 00 00 00  System                 common (channels, controllers, pedals), equalizer, V-Link, and
//                                       "System Modify": the wheel brake, crescendo, rotary speed-up
//                                       and the rhythm player's tempo, pattern and level
//   10 00 00 00  Favorite (Temporary)   the favorite being played: common (split, layer, transpose,
//                                       ensemble level/balance, D Beam), the tone-wheel organ and its
//                                       "modify" block (harmonic bars, percussion, rotary), two
//                                       Ensemble parts, the rhythm, the reverb
//
// That is the whole edit buffer, and all of it is laid out. There is no tone area: an Ensemble part
// chooses its sound by bank and program number (Tone Bank Select MSB/LSB and Tone Program Change#
// in the Favorite Ensemble block; the tone list is the Bank Select table on p1), and the tones
// themselves have no parameters in the MIDI Implementation. So there is no part that can hold
// alternative tone types, and nothing is kept out of the startup read.

/** "Favorite Ensemble (Ensemble: 01)" at 00 20 00 and "(Ensemble: 02)" at 00 21 32 (p7). */
const ENSEMBLES = [1, 2];

export default {
  id: 'roland-vr-700',
  name: 'Roland VR-700',
  family: 'VR',
  map: 'vr-700',
  deviceId: 0x10,
  description: 'Roland VR-700 V-Combo organ/keyboard: the system blocks and the whole temporary Favorite (common, '
    + 'tone-wheel organ and harmonic bars, two Ensemble parts, rhythm and reverb), from the MIDI Implementation.',

  // p6, Identity Reply: F0 7E dev 06 02 41 42 02 00 00 00 01 00 00 F7 — family code 42 02, family
  // number 00 00, software revision 00 01 00 00. The message line and the byte table agree.
  identity: { familyCode: ['42', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemEq', table: 'System Equalizer', path: ['System', 'System Equalizer'], group: 'System · Equalizer', strip: /^EQ\s+/, system: true },
    { id: 'vLink', table: 'System V-Link', path: ['System', 'System V-Link'], group: 'System · V-Link', system: true },
    // Wheel Brake, Crescendo and Speed Up are performance controls, but the manual files them under
    // System, at 00 00 06 00, outside the Favorite; so they are system here too.
    { id: 'systemModify', table: 'System Modify', path: ['System', 'System Modify'], group: 'System · Modify', system: true },

    { id: 'favorite', table: 'Favorite Common', path: ['Favorite (Temporary)', 'Favorite Common'], group: 'Favorite' },
    // The tone-wheel organ: type, click, percussion levels, vibrato/chorus, amp, rotary, EQ.
    { id: 'toneWheel', table: 'Favorite ToneWheel', path: ['Favorite (Temporary)', 'Favorite ToneWheel'], group: 'Favorite · ToneWheel', strip: /^ToneWheel\s+/ },
    // Its "modify" block: the harmonic bars of the three manuals, the percussion switches, rotary
    // speed and brake, ring modulator frequency.
    { id: 'toneWheelModify', table: 'Favorite ToneWheel Modify', path: ['Favorite (Temporary)', 'Favorite ToneWheel Modify'], group: 'Favorite · ToneWheel Modify' },
    // "Tone Program Change#" is a number sign, not a sharp: the id would otherwise read
    // toneProgramChangeSharp. "Part Switch/Level/Pan" are the Ensemble part's own, as the group says.
    ...ENSEMBLES.map((n) => ({
      id: `ensemble${n}`,
      table: 'Favorite Ensemble',
      path: ['Favorite (Temporary)', `Favorite Ensemble (Ensemble: 0${n})`],
      group: `Favorite · Ensemble ${n}`,
      strip: /^Part\s+|\s*#$/g,
    })),
    { id: 'rhythm', table: 'Favorite Rhythm', path: ['Favorite (Temporary)', 'Favorite Rhythm'], group: 'Favorite · Rhythm', strip: /^Rhythm\s+/ },
    { id: 'reverb', table: 'Favorite Reverb', path: ['Favorite (Temporary)', 'Favorite Reverb'], group: 'Favorite · Reverb', strip: /^Reverb\s+/ },
  ],

  // The manual's one worked DT1 (p10, "Example of an Exclusive Message and Calculating a Checksum",
  // <Example 1>): Percussion Switch of the temporary Favorite's ToneWheel Modify set to ON, at
  // 10 00 00 00 + 00 12 00 + 00 14. (Its <Example 2> is an RQ1 for the whole temporary Favorite,
  // 10 00 00 00 size 00 00 42 53, F0 41 10 00 00 42 11 10 00 00 00 00 00 42 53 5B F7.)
  examples: [
    {
      name: 'Setting the Percussion Switch of Favorite ToneWheel Modify to ON (DT1)',
      where: 'p10',
      parameter: 'toneWheelModify.percussionSwitch',
      value: 1,
      expectedHex: 'F0 41 10 00 00 42 12 10 00 12 14 01 49 F7',
    },
  ],

  // p1, the Bank Select table: Favorites are MSB 85, LSB 0, programs 1-64. The other rows (GM, GM2,
  // Rhythm Set 86/64, the Ensemble tones 87/64-73) select a part's sound, not a favorite. A favorite
  // is recalled on the Control Channel (System Common 00 0C), which must match the profile's channel.
  presets: {
    banks: [
      { id: 'favorite', label: 'Favorite 01-64', role: 'user', writable: true, startSlot: 0, slotCount: 64, programBase: 0, bankMsb: 85, bankLsb: 0 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    tones: 'none in the map: the two Ensemble parts select their tones by bank and program number (Tone Bank Select '
      + 'MSB/LSB, Tone Program Change# in each Favorite Ensemble block; the tone list is p1); the tones have no parameters '
      + 'in the MIDI Implementation, and the organ is the ToneWheel and ToneWheel Modify blocks',
    effectParameterMeanings: 'type-dependent: the Ensemble MFX parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on MFX Type, which the MIDI Implementation does not list. '
      + 'The reverb\'s 4-nibble slots are all printed "(reserved)" and are not laid out',
    inboundControllers: 'not modelled: the harmonic bars (CC 70-78), rotary speed/brake and wheel brake (CC 80-82) and '
      + 'the other Control Changes (p1-3, p5-6) are not mapped yet',
  },
  notes: [
    'Cover metadata: the map\'s source block reads model null, date "Version:", version "VR-700" (the importer took the '
      + 'cover\'s label column for its value column). The document is VR-700 MIDI Implementation version 1.00, dated '
      + 'Jan. 1, 2010 (cover, p1; Implementation Chart, p11).',
    'Favorite Ensemble (Ensemble: 01) is at 10 00 20 00 and (Ensemble: 02) at 10 00 21 32: the second follows the first '
      + 'at its Total Size (00 00 01 32), not on a 00 01 00 boundary (p7). The offset table also prints a bare '
      + '"Favorite Ensemble" at 00 20 00, the same address as Ensemble 01; it is not laid out a second time.',
    'Keyboard Transpose (Favorite Common 00 04, 58-69), Rotary Network Freq, Rotary Com Filter and EQ Bass/Middle/Treble '
      + 'Gain (Favorite ToneWheel 00 26-00 2C, 59-69) are printed with a 4-bit layout (0000 aaaa) that cannot carry their '
      + 'own ranges; they are sent as the full byte their range needs.',
    'System Equalizer\'s frequency lists print "200.250" for "200, 250" (p8), so they count 30 labels for 31 values and '
      + 'stay numbers 0-30 with the manual\'s list as their description.',
    'The two Mid bands of the System Equalizer are printed with the same names (EQ Mid Frequency/Gain/Q at 00 06-00 08 '
      + 'and 00 09-00 0B); they are numbered 1 and 2 in printed order.',
  ],

  // The manual's own date and version (p1 and the chart on p11; the cover's labels came out where its values belong).
  manual: { date: 'Jan. 1, 2010', version: '1.00' },
};
