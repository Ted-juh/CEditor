// The edit-buffer layout shared by the V-Synth (2003) and the V-Synth XT (2005, its rack version).
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the
// two have in common lives here, and synths/v-synth.mjs and synths/v-synth-xt.mjs say what is
// theirs — the manual, its pages, the printed example and what each manual gets wrong. (The
// V-Synth GT, synths/v-synth-gt.mjs, is a different map: two tones per patch, model ID 00 00 21.)
//
// Both manuals print the same address map (the V-Synth's owner's manual p159, the XT's MIDI
// Implementation p7), under the same heading, "V-Synth (ModelID = 00H 53H)":
//
//   01 00 00 00  Setup                      the bank and program of each of the 16 parts,
//                                           transpose, octave, palette
//   02 00 00 00  System                     common (tune, MIDI, each part's receive channel, EQ)
//                                           and controller (velocity, D Beam, pads, pedals); the
//                                           XT adds System Controller 2 (XT), its knob sets
//   10 00 00 00  Temporary Patch (Part 1)   … 10 0F 00 00 (Part 16), 00 01 00 00 apart
//   20 00 00 00  User Patch (001 … 512)     memory, not edit buffer
//
// and every Temporary Patch is the same tree: common, MFX, chorus, reverb, controller (the XT adds
// Patch Controller 2 (XT) and a Step Modulator), then for each of sixteen zones an oscillator, an
// envelope block (thirteen envelopes), an LFO block (five LFOs) and two COSM blocks, and sixteen
// arpeggio notes. A V-Synth patch is one kind of thing, so nothing holds alternative tone types.
//
// The V-Synth is sixteen-part multitimbral (owner's manual p16: "From the keyboard you can play
// only the patch that is assigned to part 1"); there are no part or mixer blocks beyond the Setup's
// bank/program per part and System Common's receive switch and channel per part, both laid out.
// Laid out: Setup and System (system blocks), and Part 1's Temporary Patch, whole. Parts 2-16's
// temporary patches are the same blocks again at their own bases and are left out (`coverage`).
//
// Where the two maps differ, the tables differ and not the tree: the XT's Patch Common has Patch
// Category where the V-Synth has a reserved byte (00 0C), its Patch Oscillator adds a detune and a
// sub-oscillator per OSC (00 79 - 00 7E), and its ranges grow (matrix destinations, analog
// waveforms, COSM types). The generator reads each from its own map.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const ZONES = range(1, 16);

const PATCH = 'Temporary Patch (Part 1)';
const at = (entry) => [PATCH, entry];

/**
 * The blocks, in the order the startup pull asks for them.
 *
 *   xt   whether the map has the XT's three blocks: System Controller 2 (XT), Patch Controller 2 (XT)
 *        and Patch Step Modulator
 */
export function vSynthBlocks({ xt }) {
  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },
    // The XT's eight knobs: eight user knob sets of eight parameter assigns, and each knob's CC.
    ...(xt ? [{ id: 'systemController2', table: 'System Controller 2 (XT)', path: ['System', 'System Controller 2 (XT)'], group: 'System · Knob Sets', system: true }] : []),

    { id: 'patch', table: 'Patch Common', path: at('Patch Common'), group: 'Patch · Common', strip: /^Patch\s+/ },
    { id: 'mfx', table: 'Patch MFX', path: at('Patch MFX'), group: 'Patch · MFX', strip: /^MFX\s+/ },
    { id: 'chorus', table: 'Patch Chorus', path: at('Patch Chorus'), group: 'Patch · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: 'Patch Reverb', path: at('Patch Reverb'), group: 'Patch · Reverb', strip: /^Reverb\s+/ },
    // D Beam, pad and arpeggiator settings of the patch.
    { id: 'controller', table: 'Patch Controller', path: at('Patch Controller'), group: 'Patch · Controller' },
    ...(xt ? [
      // Which knob set (preset 1-8, user 1-8) each zone uses.
      { id: 'controller2', table: 'Patch Controller 2 (XT)', path: at('Patch Controller 2 (XT)'), group: 'Patch · Zone Knob Sets' },
      { id: 'stepMod', table: 'Patch Step Modulator', path: at('Patch Step Modulator'), group: 'Patch · Step Modulator' },
    ] : []),

    ...ZONES.flatMap((zone) => [
      { id: `zone${zone}.osc`, table: 'Patch Oscillator', path: at(`Patch Oscillator (Zone ${zone})`), group: `Patch · Zone ${zone} · Oscillators` },
      { id: `zone${zone}.env`, table: 'Patch Envelope', path: at(`Patch Envelope (Zone ${zone})`), group: `Patch · Zone ${zone} · Envelopes` },
      { id: `zone${zone}.lfo`, table: 'Patch LFO', path: at(`Patch LFO (Zone ${zone})`), group: `Patch · Zone ${zone} · LFOs` },
      // COSM1 and COSM2 are the same table at two offsets; its rows are "COSM Switch", "COSM Type" …
      { id: `zone${zone}.cosm1`, table: 'Patch COSM', path: at(`Patch COSM1 (Zone ${zone})`), group: `Patch · Zone ${zone} · COSM 1`, strip: /^COSM\s+/ },
      { id: `zone${zone}.cosm2`, table: 'Patch COSM', path: at(`Patch COSM2 (Zone ${zone})`), group: `Patch · Zone ${zone} · COSM 2`, strip: /^COSM\s+/ },
    ]),

    ...ZONES.map((note) => ({
      id: `arpeggio.note${note}`, table: 'Patch Arpeggio', path: at(`Patch Arpeggio (Note ${note})`), group: `Patch · Arpeggio Note ${note}`,
    })),
  ];
}

/**
 * The Bank Select table both manuals print (the V-Synth's p153, the XT's p1): Patches 001-512 are
 * MSB 87, LSB 0-3, programs 1-128 in each. All 512 are user memory (User Patch 001-512 in the
 * address map), recalled on the profile's channel.
 */
export const presets = {
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
};

/** What both profiles leave out, and where it is. */
export const sharedCoverage = {
  parts: 'Part 1\'s Temporary Patch (10 00 00 00), whole: every zone, every arpeggio note. Parts 2-16\'s are not laid out: Temporary '
    + 'Patch (Part n) is at 10 00 00 00 + (n-1) x 00 01 00 00 (10 01 00 00 … 10 0F 00 00), each the same blocks at the same offsets. '
    + 'Each part\'s bank and program (Setup) and receive switch and channel (System Common) are laid out',
  memories: 'not laid out: User Patch 001-512 (20 00 00 00 - 23 7F 00 00), memory rather than edit buffer',
  effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and COSM parameters are Roland\'s 4-nibble container (12768-52768, shown '
    + '-20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
};

export const sharedNotes = [
  'Part 1 is the patch played from the keyboard; in multitimbral use parts 2-16 each hold a temporary patch of their own (10 01 00 00 - '
    + '10 0F 00 00), not laid out.',
  'Printed names kept as printed: "Sustine" for Sustain (Patch Envelope, all thirteen envelopes: zone1.env.env1Sustine …).',
  'The scale-tune message the manual prints after the examples (address 40 1x 40) is a GS-format DT1 (model ID 42H), outside this address map.',
];
