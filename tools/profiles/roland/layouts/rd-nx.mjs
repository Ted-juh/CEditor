// The RD-300NX and RD-700NX: the shared shape of their address maps (synths/rd-300nx.mjs and
// synths/rd-700nx.mjs say what differs).
//
// Both manuals print the same two areas (RD-300NX p9-13, RD-700NX p9-12):
//
//   00 00 00 00  System                common, compressor, favorite live sets, V-Link, switch assign
//   10 00 00 00  Live Set (Temporary)  common, song/rhythm, chorus, reverb, MFX, and for each layer
//                                      an Internal Layer (the layer's zone, levels and which controllers
//                                      and MIDI messages reach it), an External Layer (what the layer
//                                      transmits to outboard gear), a Tone (its bank/program and tone
//                                      offsets) and a Piano (the SuperNATURAL piano's designer settings)
//
// with the same parameter tables, row for row, where both have them. The RD-700NX adds a fourth
// layer, eight MFX instead of one, a Resonance block, and two more tone types for each layer: an
// E.Piano block and a ToneWheel (organ) block.
//
// That is the whole edit buffer, and all of it is laid out. Nothing else is in either map: no
// user live set memories, no tone parameters beyond the per-layer blocks above.

const LIVE = 'Live Set (Temporary)';
const two = (n) => String(n).padStart(2, '0');

/**
 * The system blocks. `vLinkEntry` is the offset table's spelling (the RD-300NX prints "System
 * V-LINK" there and "System V-Link" over the table itself).
 */
export const systemBlocks = (vLinkEntry) => [
  { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
  { id: 'system.compressor', table: 'System Compressor', path: ['System', 'System Compressor'], group: 'System · Compressor', strip: /^Compressor\s+/, system: true },
  // "Favorite1 - 24 Live Set Category" and "… Number" are the first favorite's two rows (see the
  // synth's notes for the rest of the block); the id says favorite1, the name keeps the manual's.
  { id: 'system.favorites', table: 'System Favorite Live Set', path: ['System', 'System Favorite Live Set'], group: 'System · Favorite Live Sets', strip: /\s+-\s+\d+(?=\s+Live Set)/, system: true },
  { id: 'system.vLink', table: 'System V-Link', path: ['System', vLinkEntry], group: 'System · V-Link', system: true },
  { id: 'system.switchAssign', table: 'System Switch Assign', path: ['System', 'System Switch Assign'], group: 'System · Switch Assign', system: true },
];

/** The live set's own blocks: common, song/rhythm, chorus, reverb. */
export const liveSetBlocks = () => [
  { id: 'liveSet', table: 'Live Set Common', path: [LIVE, 'Live Set Common'], group: 'Live Set', strip: /^Live Set\s+/ },
  { id: 'liveSet.songRhythm', table: 'Live Set Song/Rhythm', path: [LIVE, 'Live Set Song/Rhythm'], group: 'Live Set · Song/Rhythm' },
  { id: 'liveSet.chorus', table: 'Live Set Chorus', path: [LIVE, 'Live Set Chorus'], group: 'Live Set · Chorus', strip: /^Chorus\s+/ },
  { id: 'liveSet.reverb', table: 'Live Set Reverb', path: [LIVE, 'Live Set Reverb'], group: 'Live Set · Reverb', strip: /^Reverb\s+/ },
];

/** One MFX block (RD-300NX, entry "Live Set MFX"), or several (RD-700NX, "Live Set MFX (MFX: 0n)"). */
export const mfxBlock = (n) => ({
  id: n ? `liveSet.mfx${n}` : 'liveSet.mfx',
  table: 'Live Set MFX',
  path: [LIVE, n ? `Live Set MFX (MFX: ${two(n)})` : 'Live Set MFX'],
  group: n ? `Live Set · MFX ${n}` : 'Live Set · MFX',
  strip: /^MFX\s+/,
});

/**
 * One layer's blocks. `types` lists the tone-type blocks the instrument has beyond the piano
 * (the RD-700NX's 'E.Piano' and 'ToneWheel'); each is laid out at the layer's own entry.
 *
 * "Program Change#" and "Tone Program Change#" carry a number sign, not a sharp: stripped, so the
 * ids read programChange rather than programChangeSharp.
 */
export const layerBlocks = (n, types = []) => {
  const at = (block) => [LIVE, `${block} (Layer: ${two(n)})`];
  const group = `Live Set · Layer ${n}`;
  return [
    { id: `layer${n}.internal`, table: 'Live Set Internal Layer', path: at('Live Set Internal Layer'), group: `${group} · Internal`, strip: /^Layer\s+/ },
    { id: `layer${n}.external`, table: 'Live Set External Layer', path: at('Live Set External Layer'), group: `${group} · External`, strip: /^Layer\s+|\s*#$/g },
    { id: `layer${n}.tone`, table: 'Live Set Tone', path: at('Live Set Tone'), group: `${group} · Tone`, strip: /^Tone\s+|\s*#$/g },
    { id: `layer${n}.piano`, table: 'Live Set Piano', path: at('Live Set Piano'), group: `${group} · Piano` },
    ...types.map((type) => ({
      id: `layer${n}.${type === 'E.Piano' ? 'ePiano' : 'toneWheel'}`,
      table: `Live Set ${type}`,
      path: at(`Live Set ${type}`),
      group: `${group} · ${type}`,
    })),
  ];
};

/**
 * A layer plays one tone at a time — a SuperNATURAL piano, on the RD-700NX a SuperNATURAL
 * E.Piano or a tone-wheel organ, or another tone — and the Piano, E.Piano and ToneWheel blocks are
 * that tone type's own settings. Neither manual says whether the instrument answers a request for
 * the type a layer is not playing (only that "if the conditions are not met, nothing is
 * transmitted", RD-300NX p6, RD-700NX p5), and one unanswered request ends the startup read; so
 * they are read when asked for, not on connect.
 */
export const noPull = [/^layer\d+\.(piano|ePiano|toneWheel)$/];

export const effectCoverage = 'type-dependent: chorus, reverb and MFX parameters are Roland\'s 4-nibble container '
  + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list';

export const presetsCoverage = 'none: neither manual prints a Bank Select table for Live Sets; Program Change is received as '
  + '"prog.1 - prog.128" and Bank Select as "bank.1 - bank.16384" with no list of what they select, so no preset banks are listed';
