// The Roland V-Synth GT: which parts of its address map make up the edit buffer, and what to call
// them.
//
// Source: "V-Synth GT MIDI Implementation", version 1.00, April 1 2007 (maps/v-synth-gt.json says
// which file, with its hash). Page numbers below are that document's.
//
// A V-Synth GT patch plays two tones, Upper and Lower, and its address map (p7) says so:
//
//   03 00 00 00  Setup                     the current patch's bank/program, transpose, octave
//   04 00 00 00  System                    common (tune, level, MIDI, EQ) and controller assigns
//   10 00 00 00  Temporary Tone (1:UPPER)  common, common 2, T-FX, step modulator, AP-Synthesis,
//   10 01 00 00  Temporary Tone (2:LOWER)  vocal designer, and for each of 16 zones an oscillator,
//                                          an envelope block (thirteen envelopes), an LFO block
//                                          (five LFOs) and two COSM blocks
//   20 00 00 00  User Tone (001 … 896)     memory, not edit buffer
//   30 00 00 00  Temporary Patch           common, chorus, reverb, controller, the two Patch Tone
//                                          slots, and sixteen arpeggio notes
//   40 00 00 00  User Patch (001 … 512)    memory, not edit buffer
//
// A tone is one kind of thing — every V-Synth GT tone has the same blocks — so nothing here holds
// alternative tone types, and both temporary tones are laid out, every zone (but see 2 below).
//
// Two things the tools cannot do yet, and this layout is written for both and switched off until
// they can (the generator refuses what it cannot resolve, and a layout that does not build breaks
// every other synth's test run):
//
//   1. THE TEMPORARY PATCH IS NOT IN maps/v-synth-gt.json. The top table on p7 is printed with a
//      closing border after "User Tone (896)" and then carries on, below that border, with
//      "Temporary Patch" and the 512 User Patches. The parser closes a table at a border that
//      follows a table line, so the map stops at User Tone (896) and has no entry at 30 00 00 00,
//      and no path can reach the patch. Its blocks are below (`temporaryPatch`); the manual's one
//      DT1 example (p20) is in the patch and waits for it too.
//
//   2. THE OSCILLATOR BLOCKS DO NOT BUILD. Tone Oscillator (p14) has "OSC 1 Start Offset" and
//      "OSC 2 Start Offset" (00 2C and 00 60): eight nibbles, no range printed, the display line
//      "0000000h - FFFFFFFh", which the parser turns into the range 0 - 268435455. interpret.mjs
//      builds an array of every wire value of a row before it reads the display line, and for that
//      row the array is 268 million entries: make-profiles.mjs runs out of heap. So the sixteen
//      zones' oscillators are written below and left out.
//
// When the map has the patch, set TEMPORARY_PATCH_IN_MAP; when the interpreter takes the row, set
// OSCILLATOR_BUILDS. Both were checked by building with them on against a map patched in memory.

const TEMPORARY_PATCH_IN_MAP = true;
const OSCILLATOR_BUILDS = true;

const TONES = [
  ['upper', 'Temporary Tone (1:UPPER)', 'Upper'],
  ['lower', 'Temporary Tone (2:LOWER)', 'Lower'],
];
const ZONES = Array.from({ length: 16 }, (unused, i) => i + 1);

function temporaryTone([id, root, label]) {
  const block = (suffix, table, entry, group, strip) => ({
    id: `${id}.${suffix}`, table, path: [root, entry], group: `${label} · ${group}`, ...(strip ? { strip } : {}),
  });
  return [
    block('common', 'Tone Common', 'Tone Common', 'Common', /^Tone\s+/),
    block('common2', 'Tone Common 2', 'Tone Common 2', 'Common 2'),
    block('tfx', 'Tone T-FX', 'Tone T-FX', 'T-FX', /^T-FX\s+/),
    block('stepMod', 'Tone Step Modulator', 'Tone Step Modulator', 'Step Modulator'),
    block('apSynthesis', 'Tone AP-Synthesis', 'Tone AP-Synthesis', 'AP-Synthesis', /^AP-S\s+/),
    block('vocalDesigner', 'Tone Vocal Designer', 'Tone Vocal Designer', 'Vocal Designer', /^Vocoder\s+/),
    ...ZONES.flatMap((zone) => [
      ...(OSCILLATOR_BUILDS ? [block(`zone${zone}.osc`, 'Tone Oscillator', `Tone Oscillator (Zone ${zone})`, `Zone ${zone} · Oscillator`)] : []),
      block(`zone${zone}.env`, 'Tone Envelope', `Tone Envelope (Zone ${zone})`, `Zone ${zone} · Envelope`),
      block(`zone${zone}.lfo`, 'Tone LFO', `Tone LFO (Zone ${zone})`, `Zone ${zone} · LFO`),
      // COSM1 and COSM2 are the same table at two offsets; its rows are "COSM Switch", "COSM Type" …
      block(`zone${zone}.cosm1`, 'Tone COSM', `Tone COSM1 (Zone ${zone})`, `Zone ${zone} · COSM 1`, /^COSM\s+/),
      block(`zone${zone}.cosm2`, 'Tone COSM', `Tone COSM2 (Zone ${zone})`, `Zone ${zone} · COSM 2`, /^COSM\s+/),
    ]),
  ];
}

/** The Temporary Patch (30 00 00 00, p7) — not reachable through the map yet; see above. */
function temporaryPatch() {
  const at = (entry) => ['Temporary Patch', entry];
  return [
    { id: 'patch', table: 'Patch Common', path: at('Patch Common'), group: 'Patch', strip: /^Patch\s+/ },
    { id: 'chorus', table: 'Patch Chorus', path: at('Patch Chorus'), group: 'Patch · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: 'Patch Reverb', path: at('Patch Reverb'), group: 'Patch · Reverb', strip: /^Reverb\s+/ },
    { id: 'controller', table: 'Patch Controller', path: at('Patch Controller'), group: 'Patch · Controller' },
    // Which tone (bank/program) sits in each of the patch's two slots, its level, pan and key range.
    ...TONES.map(([id, unusedRoot, label], i) => ({
      id: `patchTone.${id}`, table: 'Patch Tone', path: at(`Patch Tone (${i + 1}:${label.toUpperCase()})`), group: `Patch · ${label} Tone`, strip: /^Tone\s+/,
    })),
    ...ZONES.map((note) => ({
      id: `arpeggio.note${note}`, table: 'Patch Arpeggio', path: at(`Patch Arpeggio (Note ${note})`), group: `Patch · Arpeggio Note ${note}`,
    })),
  ];
}

export default {
  id: 'roland-v-synth-gt',
  name: 'Roland V-Synth GT',
  family: 'V-Synth',
  map: 'v-synth-gt',
  deviceId: 0x10,
  description: 'Roland V-Synth GT elastic-audio synthesizer: the setup and system blocks and both temporary tones of '
    + 'the current patch (Upper and Lower: common, T-FX, step modulator, AP-Synthesis, vocal designer, and sixteen zones '
    + `of ${OSCILLATOR_BUILDS ? 'oscillator, ' : ''}envelopes, LFOs and two COSMs)${TEMPORARY_PATCH_IN_MAP ? ', and the temporary patch they sit in' : ''}, `
    + 'from the MIDI Implementation.'
    + (TEMPORARY_PATCH_IN_MAP ? '' : ' The Temporary Patch is not in the map yet.')
    + (OSCILLATOR_BUILDS ? '' : ' The zones\' oscillator blocks are left out until the generator can read them.'),

  // p6, Identity Reply: F0 7E dev 06 02 41 21 02 00 00 00 01 00 00 F7 — family code 21 02, family
  // number 00 00, software revision 00 01 00 00. The message line and the byte table agree.
  identity: { familyCode: ['21', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    ...(TEMPORARY_PATCH_IN_MAP ? temporaryPatch() : []),

    ...TONES.flatMap(temporaryTone),
  ],

  // The manual prints one DT1 write (p20, <Example 1>, "Setting CHORUS TYPE of PATCH to CHORUS 1"):
  // Temporary Patch 30 00 00 00 + Patch Chorus 00 02 00 + Chorus Type 00 00, value 01,
  // F0 41 10 00 00 21 12 30 00 02 00 01 4D F7. It agrees with the Patch Chorus table (p17), but the
  // map has no Temporary Patch to put it in (see the top of this file). Its other three examples
  // are RQ1s (p20-21); the scale-tune message on p21 is a GS-format DT1 (model 42H, address
  // 40 11 40), outside this address map.
  examples: TEMPORARY_PATCH_IN_MAP
    ? [{
      name: 'Setting Chorus Type of Patch to CHORUS 1 (DT1)',
      where: 'p20',
      parameter: 'chorus.type',
      value: 1,
      expectedHex: 'F0 41 10 00 00 21 12 30 00 02 00 01 4D F7',
    }]
    : [],
  ...(TEMPORARY_PATCH_IN_MAP ? {} : {
    examplesUnavailable: 'The only printed DT1 example (p20, Patch Chorus Type = CHORUS 1, F0 41 10 00 00 21 12 30 00 02 '
      + '00 01 4D F7) is in the Temporary Patch at 30 00 00 00, which maps/v-synth-gt.json does not contain: the p7 top '
      + 'table continues past a closing border after User Tone (896), and the parser stops there. Not checkable until '
      + 'the map has that entry; the other printed messages are RQ1s, and a GS-format (model 42H) scale-tune DT1 (p21).',
  }),

  // p1, the Bank Select table: Patches 001-512 are MSB 87, LSB 0-3, programs 1-128 in each. All 512
  // are user memory (User Patch 001-512, p7). Tones are selected per patch slot, not by bank select.
  presets: {
    banks: [0, 1, 2, 3].map((lsb) => ({
      id: `patch-${lsb + 1}`,
      label: `Patch ${String(lsb * 128 + 1).padStart(3, '0')}-${String(lsb * 128 + 128).padStart(3, '0')}`,
      role: 'user',
      writable: true,
      startSlot: lsb * 128,
      slotCount: 128,
      programBase: 0,
      bankMsb: 87,
      bankLsb: lsb,
    })),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    ...(TEMPORARY_PATCH_IN_MAP ? {} : {
      temporaryPatch: 'NOT laid out: Temporary Patch (30 00 00 00, p7) — Patch Common 30 00 00 00, Chorus 30 00 02 00, '
        + 'Reverb 30 00 04 00, Controller 30 00 06 00, Patch Tone (1:UPPER) 30 00 08 00 and (2:LOWER) 30 00 0A 00, Arpeggio '
        + 'Note 1-16 at 30 00 0C 00-30 00 1B 00 — because maps/v-synth-gt.json has no top-table entry for it (the parser '
        + 'stops the p7 table at the border after User Tone (896)). Its layout is written in synths/v-synth-gt.mjs, switched off',
    }),
    tones: OSCILLATOR_BUILDS
      ? 'both temporary tones, whole: Upper at 10 00 00 00 and Lower at 10 01 00 00, every zone'
      : 'both temporary tones (Upper at 10 00 00 00, Lower at 10 01 00 00) EXCEPT their thirty-two Tone Oscillator blocks: '
        + 'Tone Oscillator (Zone z) is at the tone\'s base + 00 10 00 + (z-1) x 00 01 00 (Upper 10 00 10 00-10 00 1F 00, Lower '
        + '10 01 10 00-10 01 1F 00), 127 bytes, 107 parameters each. They are left out because interpret.mjs runs out of '
        + 'memory on the block\'s OSC 1/2 Start Offset rows (00 2C and 00 60, range 0 - 268435455, p14); their layout is '
        + 'written in synths/v-synth-gt.mjs, switched off',
    effectParameterMeanings: 'type-dependent: T-FX, AP-Synthesis, vocoder and COSM parameters are Roland\'s 4-nibble '
      + 'container (12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI '
      + 'Implementation does not list',
    inboundControllers: 'not modelled: what the D Beam, Time Trip Pad, knobs and pedals transmit (p5-6) is not mapped yet',
  },
  notes: [
    ...(TEMPORARY_PATCH_IN_MAP ? [] : [
      'The map has no Temporary Patch (30 00 00 00): p7 prints its top table with a closing border after User Tone (896) and '
        + 'continues it below with Temporary Patch and User Patch (001-512); the parser ends the table at that border.',
    ]),
    ...(OSCILLATOR_BUILDS ? [] : [
      'Tone Oscillator is left out: its OSC 1/2 Start Offset (00 2C, 00 60; eight nibbles, printed "0000000h - FFFFFFFh" with '
        + 'no range, p14) is read as 0 - 268435455, and interpret.mjs lists every wire value of a row before reading its '
        + 'display line, which for that row is more than the heap holds.',
    ]),
    'Cover: V-Synth GT MIDI Implementation, Version 1.00, April 1, 2007 (p1); the map\'s source block has no date or version.',
    'Printed names kept as printed: "Sustine" for Sustain (Tone Envelope, every envelope), "Analog Wavefrom" (Tone '
      + 'Oscillator 00 1E and 00 52).',
    'Tone Step Modulator prints "Track Loop Switch" once per track without the track number (00 03, 00 1B, 00 33, 00 4B); '
      + 'they are numbered 1-4 in printed order (stepMod.trackLoopSwitch1 … 4).',
    'Tone Common\'s "Tone Tempo", "Chorus Switch" and "Reverb Switch" are printed "(not used)"; they are laid out as printed.',
    'p20 <Example 2> computes TONE T-FX of TONE:003 but its prose calls the block "PATCH MFX" and writes "117 (sum)" for a '
      + 'sum of 41; its message bytes (F0 41 10 00 00 21 11 20 02 02 00 00 00 01 04 57 F7) agree with the map.',
  ],

  // The manual's own date and version (the cover, which the importer did not read).
  manual: { date: 'April 1, 2007', version: '1.00' },
};
