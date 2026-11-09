// The layout the RD-800, RD-2000 and RD-2000EX share.
//
// Three Roland stage pianos with one model id (00 00 75) and one shape of address map. The RD-800
// calls its edit buffer a Live Set of four layers, UPPER 1-3 and LOWER; the RD-2000 and RD-2000EX
// call it a Program of eight zones. Otherwise the map is the same tree, at the same offsets
// (RD-800 MIDI Implementation 1.00 p9-13; RD-2000 1.01 and RD-2000EX 1.00 p9-14, which print the
// same tables word for word):
//
//   00 00 00 00  System                  common, compressor; (RD-800) V-Link, switch assign
//   10 00 00 00  <unit> (Temporary)      the edit buffer:
//     + 00 00 00   <unit> Common         name, voice reserves, tempo, pedal/switch/knob functions,
//                                        EQ, the piano's sympathetic resonance; (RD-2000) memo and
//                                        each zone's INT/EXT
//     + 00 02 00   <unit> Song/Rhythm
//     + 00 04 00   <unit> Delay
//     + 00 06 00   <unit> Reverb
//     + 00 10 00   Modulation FX and Tremolo/Amp Simulator, a pair per layer/zone 1-4, 00 04 00 apart
//     + 00 20 00   Internal Layer/Zone 1-4, 00 08 00 apart: the tone, its levels, ranges and
//                  controller switches, and the piano/e.piano/organ modify parameters (note-by-note
//                  voicing, harmonic bars; on the RD-2000 the V-Piano's too)
//     + 00 40 00   External Layer/Zone 1-4, 00 02 00 apart: what that zone transmits
//     + 00 50 00   (RD-2000) Internal Zone 5-8, and at + 00 70 00 External Zone 5-8
//
// Every block is present whatever the zones play — the piano, organ and other modify parameters
// all sit in each Internal block side by side — so nothing here is an alternative the instrument
// declines to answer for, and nothing is held back from the startup read.
//
// The Modulation FX and the Tremolo/Amp Simulator of a layer are two blocks laid out from one
// table, printed under the heading "<unit> Modulation FX, <unit> Tremolo/Amp Simulator".

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

/** RD-800 layers: the manual's names in its offset table, and the id each sits under. */
export const RD800_LAYERS = [
  { key: 'upper1', label: 'Upper 1' },
  { key: 'upper2', label: 'Upper 2' },
  { key: 'upper3', label: 'Upper 3' },
  { key: 'lower', label: 'Lower' },
];

/** RD-2000/RD-2000EX zones 1-8. Only zones 1-4 have a Modulation FX and Tremolo/Amp Simulator. */
export const RD2000_ZONES = range(1, 8).map((n) => ({ key: `zone${n}`, label: `Zone ${n}`, fx: n <= 4 }));

/** The system blocks the map prints: RD-800 four, RD-2000 two. */
export function systemBlocks({ vLink }) {
  return [
    // "Assign 1-5 Mode" (RD-800), "Assign 1-9 Mode" (RD-2000) would be assign15Mode/assign19Mode.
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /(?<=^Assign)\s+1-\d(?=\s+Mode$)/, system: true },
    { id: 'compressor', table: 'System Compressor', path: ['System', 'System Compressor'], group: 'System · Compressor', strip: /^Compressor\s+/, system: true },
    ...(vLink
      ? [
        { id: 'vLink', table: 'System V-Link', path: ['System', 'System V-Link'], group: 'System · V-Link', system: true },
        { id: 'switchAssign', table: 'System Switch Assign', path: ['System', 'System Switch Assign'], group: 'System · Switch Assign', system: true },
      ]
      : []),
  ];
}

/**
 * The temporary live set or program. `unit` is the manual's word ("Live Set" or "Program"), which
 * starts every table and entry name; `word` is what it calls a layer or zone ("Layer" or "Zone");
 * `zones` the layers/zones in printed order, with `fx: false` on those that have no effects pair.
 */
export function editBufferBlocks({ unit, word, zones, commonId }) {
  const root = `${unit} (Temporary)`;
  const fxTable = `${unit} Modulation FX, ${unit} Tremolo/Amp Simulator`;
  const at = (entry) => [root, entry];
  return [
    { id: commonId, table: `${unit} Common`, path: at(`${unit} Common`), group: unit, strip: new RegExp(`^${unit}\\s+`) },
    { id: 'songRhythm', table: `${unit} Song/Rhythm`, path: at(`${unit} Song/Rhythm`), group: `${unit} · Song/Rhythm`, strip: /^Rhythm\s+/ },
    { id: 'delay', table: `${unit} Delay`, path: at(`${unit} Delay`), group: `${unit} · Delay`, strip: /^Delay\s+/ },
    { id: 'reverb', table: `${unit} Reverb`, path: at(`${unit} Reverb`), group: `${unit} · Reverb`, strip: /^Reverb\s+/ },
    ...zones.flatMap(({ key, label, fx = true }) => [
      // "Layer Transpose", "Zone Switch": the block already says which layer or zone.
      {
        id: `${key}.internal`, table: `${unit} Internal ${word}`, path: at(`${unit} Internal ${word} (${label})`),
        group: `${label} · Internal`, strip: new RegExp(`^${word}\\s+`),
      },
      // The external side's values carry the CC each one sends, "(CC7)", "(CC65)", and those stay in
      // the ids: "Portamento Switch" (send it or not) and "Portamento Switch (CC65)" (what to send)
      // are two rows. Only "Mono (CC126) / Poly (CC127)" is shortened, to monoPoly.
      {
        id: `${key}.external`, table: `${unit} External ${word}`, path: at(`${unit} External ${word} (${label})`),
        group: `${label} · External`, strip: new RegExp(`^${word}\\s+|\\s*\\(CC12[67]\\)`, 'g'),
      },
      ...(fx
        ? [
          { id: `${key}.modFx`, table: fxTable, path: at(`${unit} Modulation FX (${label})`), group: `${label} · Modulation FX` },
          { id: `${key}.tremoloAmp`, table: fxTable, path: at(`${unit} Tremolo/Amp Simulator (${label})`), group: `${label} · Tremolo/Amp Simulator` },
        ]
        : []),
    ]),
  ];
}

/**
 * What the RD-2000 and RD-2000EX manuals share beyond the tables: they print the same address map
 * word for word (p9-14), the same worked examples (p16), and identity replies that differ only in
 * the software revision.
 */
export const rd2000Notes = [
  'Zones are filed as zone1 … zone8, each with .internal (Program Internal Zone) and .external (Program External Zone); zones 1-4 '
    + 'also have .modFx (Program Modulation FX) and .tremoloAmp (Program Tremolo/Amp Simulator), laid out from the one table the '
    + 'manual prints for both (p12). The map gives zones 5-8 no effects pair.',
  'The Internal Zone table (p12-13) prints Hammer Noise, Damper Noise, String Resonance and Key Off Resonance twice: once in the '
    + 'group from Nuance to Hum Noise (00 32-00 3A) and again in the group from Instruments Number to Key Off Noise (06 66-06 70); '
    + 'Hammer Noise is 62-66 both times, the other three 0-127 the first time and 0-10 the second. They are numbered in printed order '
    + '(hammerNoise1 at 00 33, hammerNoise2 at 06 6A, and so on); the manual heads neither group.',
  'Program Common\'s Tone Color, Modulation FX and Tremolo/Amp Control Destination (00 5E-00 60, p10) are printed with the labels '
    + 'UPPER1, UPPER2, UPPER3, LOWER, which are the RD-800\'s layer names; this map\'s parts are Zones 1-8. The labels are kept as printed.',
  'The worked RQ1 (p16) prints F0 41 10 00 00 75 10 00 00 00 00 00 01 44 2B F7 for Program Common: the address, size and checksum '
    + 'are this profile\'s requestProgram, but the 11H command byte is missing from both the diagram and the summary line.',
  'The worked examples call the Program\'s delay address "the address of DELAY TYPE of Setup" (p16); there is no Setup block in this map.',
];

/** Said of all three: the common block's piano-resonance group keeps the manual's bare names. */
export const commonResonanceNote = (unit, id, pages) => `${unit} Common 00 63-00 7E (${pages}) is a group the manual opens with a rule and `
  + `Sympathetic Resonance Switch and does not otherwise head: Depth, Damper, Pre LPF … Level, Damper Offset … Damper Min Pkg. Their `
  + `ids are the printed names (${id}.depth, ${id}.damper, ${id}.level), which in this block mean the resonance's, not the ${unit.toLowerCase()}'s.`;

export const sharedCoverage = {
  effectParameterMeanings: 'type-dependent: Delay, Reverb, Modulation FX and Tremolo/Amp Simulator parameters are Roland\'s 4-nibble '
    + 'container (12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation '
    + 'does not list',
  presets: 'none: the MIDI Implementation prints no Bank Select table for live sets or programs, only the generic Bank Select and '
    + 'Program Change messages ("1. Receive data", p1-3), so no bank list is claimed',
  memories: 'not in the map: the MIDI Implementation prints only the system and the temporary area; stored live sets/programs '
    + 'have no addresses there',
};
