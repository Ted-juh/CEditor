// The RD-300GX and RD-700GX (both MIDI Implementations dated Feb. 1, 2008): the shared shape of
// their address maps (synths/rd-300gx.mjs and synths/rd-700gx.mjs say what differs).
//
// Both print the same two areas (RD-300GX p7, RD-700GX p9):
//
//   00 00 00 00  System             common, the sound control (a three-band compressor), V-Link, and
//                                   on the RD-700GX the forty Favorite SETUP slots
//   10 00 00 00  Setup (Temporary)  the SETUP being played: common, rhythm/arpeggio, chorus, reverb,
//                                   an Internal Zone (what the zone plays and which controllers reach
//                                   it) and an External Zone (what it transmits) for each keyboard
//                                   zone, sixteen sound-generator Parts (receive channel, the tone by
//                                   bank and program number, level, pan, tone offsets), and for each
//                                   Part a Piano block: the piano tone's designer settings
//
// with the same parameter tables, row for row, where both have them. The RD-700GX adds a fourth
// zone (LOWER2), a per-setup Sound Control, two MFX per zone, and two more tone-type blocks per
// Part: E.Piano and ToneWheel (organ).

const SETUP = 'Setup (Temporary)';
const two = (n) => String(n).padStart(2, '0');

export const PARTS = Array.from({ length: 16 }, (unused, i) => i + 1);

/** The manual's zone names (UPPER1 …) with an id and a label each. */
export const zone = (name) => {
  const [, word, n] = /^(UPPER|LOWER)(\d?)$/.exec(name);
  const label = `${word[0]}${word.slice(1).toLowerCase()}${n ? ` ${n}` : ''}`;
  return { name, id: `${word.toLowerCase()}${n}`, label };
};

/** The system blocks; `favorite` adds the RD-700GX's Favorite SETUP table. */
export const systemBlocks = ({ favorite = false } = {}) => [
  { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
  { id: 'system.soundControl', table: 'System Sound Control', path: ['System', 'System Sound Control'], group: 'System · Sound Control', system: true },
  // "Favorite SETUP0 (Bank A)" … "Favorite SETUP9 (Bank D)": which SETUP each favorite button calls.
  ...(favorite ? [{ id: 'system.favorites', table: 'System Favorite SETUP', path: ['System', 'System Favorite SETUP'], group: 'System · Favorite Setups', strip: /^Favorite\s+/, system: true }] : []),
  { id: 'system.vLink', table: 'System V-Link', path: ['System', 'System V-Link'], group: 'System · V-Link', system: true },
];

/**
 * The setup's own blocks. The offset table and the parameter table spell the rhythm block
 * differently on both manuals (see each synth), so the entry and the table are given apart.
 */
export const setupBlocks = ({ rhythmEntry, rhythmTable, soundControl = false }) => [
  { id: 'setup', table: 'SETUP Common', path: [SETUP, 'SETUP Common'], group: 'Setup', strip: /^SETUP\s+/ },
  { id: 'setup.rhythmArpeggio', table: rhythmTable, path: [SETUP, rhythmEntry], group: 'Setup · Rhythm/Arpeggio' },
  ...(soundControl ? [{ id: 'setup.soundControl', table: 'Setup Sound Control', path: [SETUP, 'SETUP Sound Control'], group: 'Setup · Sound Control', strip: /^SoundControl\s+/ }] : []),
  { id: 'setup.chorus', table: 'SETUP Chorus', path: [SETUP, 'SETUP Chorus'], group: 'Setup · Chorus', strip: /^Chorus\s+/ },
  { id: 'setup.reverb', table: 'SETUP Reverb', path: [SETUP, 'SETUP Reverb'], group: 'Setup · Reverb', strip: /^Reverb\s+/ },
];

/**
 * One keyboard zone's two blocks. "Transmit Program Change#" carries a number sign, not a sharp:
 * stripped, so the id reads transmitProgramChange rather than transmitProgramChangeSharp.
 */
export const zoneBlocks = (name) => {
  const z = zone(name);
  return [
    { id: `${z.id}.internal`, table: 'SETUP Internal Zone', path: [SETUP, `SETUP Internal Zone (${name})`], group: `${z.label} · Internal Zone` },
    { id: `${z.id}.external`, table: 'SETUP External Zone', path: [SETUP, `SETUP External Zone (${name})`], group: `${z.label} · External Zone`, strip: /\s*#$/ },
  ];
};

/** An MFX block at the offset-table entry that names it ("SETUP MFX (UPPER1 MFX1)"). */
export const mfxBlock = (zoneName, slot) => {
  const z = zone(zoneName);
  return {
    id: `${z.id}.mfx${slot}`,
    table: 'SETUP MFX',
    path: [SETUP, `SETUP MFX (${zoneName} MFX${slot})`],
    group: `${z.label} · MFX ${slot}`,
    strip: /^MFX\s+/,
  };
};

/**
 * One Part's blocks: the Part itself and the tone-type blocks listed in `types` ('Piano', and on
 * the RD-700GX 'E.Piano' and 'ToneWheel'), each at its own entry ("SETUP Part Piano(Part: 01)" —
 * the manual sets no space before the parenthesis). "Part Level", "Part Pan" read level, pan;
 * "Tone Program Change#" reads toneProgramChange (a number sign, not a sharp).
 */
const TYPE_TABLE = { Piano: 'Setup Piano Setting', 'E.Piano': 'Setup E.Piano Setting', ToneWheel: 'SETUP ToneWheel Setting' };
const TYPE_ID = { Piano: 'piano', 'E.Piano': 'ePiano', ToneWheel: 'toneWheel' };
export const partBlocks = (n, types) => [
  { id: `part${n}`, table: 'SETUP Part', path: [SETUP, `SETUP Part (Part: ${two(n)})`], group: `Part ${n}`, strip: /^Part\s+|\s*#$/g },
  ...types.map((type) => ({
    id: `part${n}.${TYPE_ID[type]}`,
    table: TYPE_TABLE[type],
    path: [SETUP, `SETUP Part ${type}(Part: ${two(n)})`],
    group: `Part ${n} · ${type}`,
  })),
];

/**
 * A Part plays one tone at a time — a piano, on the RD-700GX an E.Piano or a tone-wheel organ, or
 * any other tone — and the Piano, E.Piano and ToneWheel blocks are that tone type's own settings.
 * Neither manual says whether the instrument answers a request for the type a Part is not playing
 * (only that "if the conditions are not met, nothing is transmitted", RD-300GX p5, RD-700GX p5), and
 * one unanswered request ends the startup read; so they are read when asked for, not on connect.
 * (The RD-700GX's p14 <Example2> requests the whole temporary setup, these blocks included, in one
 * RQ1 — "the same as Bulk Dump Temporary" — which suggests the data is always there; a block-sized
 * request for it is not shown, so the conservative reading stands until an instrument says.)
 */
export const noPull = [/^part\d+\.(piano|ePiano|toneWheel)$/];

/** p1 (both): SETUP is Bank Select MSB 85, LSB 0, program 1 - `count`. */
export const setupPresets = (count) => ({
  banks: [
    { id: 'setup', label: `SETUP 001-${String(count).padStart(3, '0')}`, role: 'user', writable: true, startSlot: 0, slotCount: count, programBase: 0, bankMsb: 85, bankLsb: 0 },
  ],
  recall: { kind: 'bankPc' },
});

export const effectCoverage = 'type-dependent: chorus, reverb and MFX parameters are Roland\'s 4-nibble container '
  + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list';

export const presetsNote = 'Presets list the SETUPs (Bank Select MSB 85, LSB 0, p1), which are recalled on the SETUP Control '
  + 'Channel (System Common 00 05), which must match the profile\'s channel. The table\'s other rows (GM/GM2 tones and rhythm sets, '
  + 'Rhythm Set 86/64, the tone categories 87/64 and up) select a Part\'s sound, which the Part block sets by bank and program number.';
