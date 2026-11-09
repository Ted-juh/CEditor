// The Roland GAIA-2: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "GAIA-2 MIDI Implementation", Model GAIA2, version 1.00, Sep. 1 2023, 102 pages
// (maps/gaia-2.json says which file, with its hash). Page numbers below are that document's:
// the Parameter Address Map is pp6-15 and pp94-100, its MFX type list (appendix 1) p101.
//
// The GAIA-2 plays one tone at a time, and a tone is two halves at two addresses (p6):
//
//   01 00 00 00  Temporary Tone Ext            what every tone has, whatever makes its sound:
//                control, common ("Tone Sub"), MFX, reverb/delay, chorus, arpeggio, step
//                sequencer, motional pad — and the sequencer's and motional pad's recorded data
//   02 10 00 00  Temporary Analog Synth Model  the sound of a Model Expansion tone (the SH-101
//                bank, MSB 97): one flat parameter block, and the tone's name
//   02 40 00 00  Temporary GAIA2 Model         the sound of a GAIA-2 tone: LFOs, the three
//                oscillators, the partial (filter, amp, envelopes, unison, modulation), the name
//
// A tone is one model or the other, so of the two model areas only one is live at a time. Both
// are here, because the map gives both and an editor cannot know in advance which a tone will be.
//
// Left out, and why:
//   - User Tone Ext (001-512) at 40 00 00 00 and User Tone Model (001-512) at 50 00 00 00: the
//     stored tones, not the edit buffer. A User Tone Model is sixteen opaque 256-byte DATABLKs
//     (p8), not the parameters the temporary model areas spell out.
//   - Tone Sequencer Data (01 01 00 00, pp15-94: 3,072 rows of step notes, velocities, gates,
//     probabilities, motion CCs) and Tone Motional Pad Data (01 01 40 00, pp10-14: 200 recorded
//     positions). Pattern and motion recordings rather than sound parameters; each is far larger
//     than the 256 bytes the GAIA-2 sends in one message (p6: "Data larger than 256 bytes will be
//     divided into packets"), and this generator reads one DT1 per block; and their rows repeat
//     one name hundreds of times with no step number. The sequencer's and pad's settings blocks
//     (Tone Sequencer, Tone Motional Pad) are in.
//
// The manual names its parameter tables in brackets ("[Tone Sub]"); the offset entries' `table`
// link carries the bare name ("Tone Sub"). `table` below must be the parameter table's own name,
// so it is the link with its brackets put back.

const T = (link) => `[${link}]`;

const TONE = 'Temporary Tone Ext';
const GAIA2 = 'Temporary GAIA2 Model';
const ANALOG = 'Temporary Analog Synth Model';

export default {
  id: 'roland-gaia-2',
  name: 'Roland GAIA-2',
  family: 'GAIA',
  map: 'gaia-2',
  deviceId: 0x10,
  description: 'Roland GAIA-2 wavetable/virtual-analog synthesizer: the temporary tone — its control, common, '
    + 'MFX, reverb/delay, chorus, arpeggio, step-sequencer and motional-pad settings, the GAIA-2 model '
    + '(LFOs, three oscillators, partial) and the Analog Synth Model used by SH-101 tones. Every '
    + 'edit-buffer block of the MIDI Implementation except the sequencer and motional-pad recordings.',

  // p5, Identity Reply. The manual disagrees with itself here: the message it prints reads
  //   F0 7E 7F 06 02 41 06 05 00 00 00 03 00 01 F7
  // (family code 06 05, family number 00 00), while the byte-by-byte explanation beneath it says
  // the family code is 65H 03H — which is the JUPITER-X's (JUPITER-X/Xm MIDI Implementation, its
  // Identity Reply), on a page laid out exactly like that manual's. The printed message is taken:
  // its 06 05 is the GAIA-2's model id 01 05 06 read the way Roland's other family codes follow
  // theirs (JUPITER-X 00 00 00 65 -> 65 03, AX-Edge 00 00 00 52 -> 52 03, JUNO-X ... 12 -> 12 04),
  // and 65 03 would claim every JUPITER-X as a GAIA-2. A capture from a real GAIA-2 settles it.
  identity: { familyCode: ['06', '05'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: T('Setup'), path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: T('System Common'), path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    { id: 'systemControl', table: T('System Control'), path: ['System', 'System Control'], group: 'System · Control', system: true },
    { id: 'masterEq', table: T('Master EQ'), path: ['System', 'Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'masterComp', table: T('Master Comp'), path: ['System', 'Master Comp'], group: 'System · Master Comp', system: true },

    // The tone's own half, at 01 00 00 00 (p6, [ToneExt]).
    { id: 'control', table: T('Tone Control'), path: [TONE, 'Tone Control'], group: 'Tone · Control', strip: /^Tone\s+/ },
    // "Tone Sub" is what the panel calls SOUND: COMMON — the manual's own example (p102) sets
    // "SOUND/COMMON/Level" at Tone Sub's offset.
    { id: 'common', table: T('Tone Sub'), path: [TONE, 'Tone Sub'], group: 'Tone · Common' },
    { id: 'mfx', table: T('Tone MFX'), path: [TONE, 'Tone MFX'], group: 'Tone · MFX', strip: /^MFX\s+|\s*\(\*\s*appendix\s*1\)/g },
    { id: 'reverb', table: T('Tone Reverb/Delay'), path: [TONE, 'Tone Reverb/Delay'], group: 'Tone · Reverb/Delay', strip: /^REV\s+/ },
    { id: 'chorus', table: T('Tone Chorus'), path: [TONE, 'Tone Chorus'], group: 'Tone · Chorus' },
    { id: 'arpeggio', table: T('Tone Arpeggio'), path: [TONE, 'Tone Arpeggio'], group: 'Tone · Arpeggio' },
    { id: 'sequencer', table: T('Tone Sequencer'), path: [TONE, 'Tone Sequencer'], group: 'Tone · Sequencer' },
    { id: 'motionalPad', table: T('Tone Motional Pad'), path: [TONE, 'Tone Motional Pad'], group: 'Tone · Motional Pad' },

    // A GAIA-2 tone's sound, at 02 40 00 00 (p6, [GAIA2Mdl]; tables pp95-98).
    { id: 'lfo', table: T('GAIA2_LFO'), path: [GAIA2, 'GAIA2 Model LFO Parameter'], group: 'GAIA-2 · LFO' },
    { id: 'osc', table: T('GAIA2_OSC'), path: [GAIA2, 'GAIA2 Model OSC Parameter'], group: 'GAIA-2 · Oscillators' },
    { id: 'partial', table: T('GAIA2_PTL'), path: [GAIA2, 'GAIA2 Model Partial Parameter'], group: 'GAIA-2 · Partial' },
    { id: 'gaia2Tone', table: T('ToneCom'), path: [GAIA2, 'GAIA2 Model Tone Com'], group: 'GAIA-2 · Name' },

    // A Model Expansion (SH-101) tone's sound, at 02 10 00 00 (p6, [SynMdl]; table pp94-95).
    { id: 'analog', table: T('MDLSYN0'), path: [ANALOG, 'Analog Synth Model Parameter'], group: 'Analog Model' },
    { id: 'analogTone', table: T('ToneCom'), path: [ANALOG, 'Analog Synth Model Tone Com'], group: 'Analog Model · Name' },
  ],

  // The manual's one worked SysEx message (p102, "Example of an Exclusive Message and Calculating
  // a Checksum"): SOUND/COMMON/Level set to 74. It exercises the three-byte model id, the
  // Temporary Tone Ext base, the Tone Sub offset and the checksum, against printed bytes.
  examples: [
    {
      name: 'Setting SOUND/COMMON/Level to 74 (DT1)',
      where: 'p102',
      parameter: 'common.level',
      value: 74,
      expectedHex: 'F0 41 10 01 05 06 12 01 00 10 00 4A 25 F7',
    },
  ],

  // p1, the Bank Select table: User tones MSB 85 / LSB 0-3 (A1-1 to H8-8, 128 to an LSB), the
  // GAIA2 presets MSB 85 / LSB 64-65 (A1-1 to D8-8), and the SH-101 Model Expansion MSB 97 /
  // LSB 70, programs 1-97 (A1-1 to B5-1).
  presets: {
    banks: [
      ...['A1-1 – B8-8', 'C1-1 – D8-8', 'E1-1 – F8-8', 'G1-1 – H8-8'].map((range, i) => ({
        id: `user-${i + 1}`, label: `User ${range}`, role: 'user', writable: true,
        startSlot: i * 128, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: i,
      })),
      ...['A1-1 – B8-8', 'C1-1 – D8-8'].map((range, i) => ({
        id: `preset-${i + 1}`, label: `GAIA2 ${range}`, role: 'factory', writable: false,
        startSlot: 512 + i * 128, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 64 + i,
      })),
      { id: 'sh-101', label: 'SH-101 A1-1 – B5-1', role: 'factory', writable: false, startSlot: 768, slotCount: 97, programBase: 0, bankMsb: 97, bankLsb: 70 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX and reverb/delay parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list. '
      + 'MFX Type and REV Type are plain numbers: the MFX type names are a separate, non-contiguous table (appendix 1, p101), and no REV type names are printed',
    inboundControllers: 'not modelled: the CC Map (OFF / TONE CC / PANEL CC, System Common) is not listed in the MIDI Implementation',
    sequencerData: 'not included: Tone Sequencer Data (3,072 step values, pp15-94) and Tone Motional Pad Data (200 positions, pp10-14)',
  },
  notes: [
    'A tone is Temporary Tone Ext (01 00 00 00) plus one model: the GAIA2 Model (02 40 00 00) for GAIA-2 tones, or the Analog Synth Model (02 10 00 00) for SH-101 Model Expansion tones. Only the model the current tone uses is live.',
    'Identity: the manual\'s printed Identity Reply (p5) has family code 06 05; its explanation table says 65 03, the JUPITER-X\'s. 06 05 is used; unconfirmed on hardware.',
    'Tone Sequencer Data and Tone Motional Pad Data are left out: recordings, not sound parameters, and larger than one 256-byte message.',
    'The tone name (ToneCom, p8) is printed as sixteen rows all called "Name", so it comes out as sixteen one-character parameters (gaia2Tone.name, gaia2Tone.name_0801 … _080F) rather than one text field.',
    'Analog Model AMP MOD (p95) is printed with a wire range of (-100 - 100) on a two-nibble value; every neighbouring ±100 parameter is (28 - 228). Transcribed as printed, so analog.ampMod defaults to -100 and the engine refuses to send anything below 0.',
  ],

  // Read on request, not at connect. A tone is either a GAIA-2 model or an Analog Synth model; the idle model area may not answer, and the startup read stops at the first request that is not.
  noPull: [/^(lfo|osc|partial|gaia2Tone|analog|analogTone)$/],
};
