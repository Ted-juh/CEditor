// The layout the JUNO-X and the JUPITER-X/Xm share.
//
// Both are ZEN-Core instruments, and their MIDI Implementations print one address map with a few
// spellings changed (JUNO-X MIDI Implementation 1.10 p10-11; JUPITER-X/Xm MIDI Implementation 1.06
// p7-8):
//
//   00 00 00 00  System          common, control, chorus, delay, reverb, master EQ and compressor,
//                                and the panel's model-bank and button-colour presets
//   00 10 00 00  Setup           which scene is selected
//   01 00 00 00  Temporary Scene common, five parts (each with zone, EQ, MFX and arpeggio),
//                                chorus, delay, reverb, drive, arpeggio common, five user patterns
//   02 0p 00 00  Temporary Tone ZCore (0p)            part p's Z-Core tone        (p = 1..4)
//   02 1p 00 00  Temporary Tone Analog Synth Model    part p's analog model tone
//   02 20 00 00  Temporary Tone RD Piano (01)         the one RD piano tone
//   02 4p / 5p   Temporary Tone JUNO-X Model / JUPITER-X (0p)   part p's own model tone
//
// so a synth's layout is this tree with its own spellings passed in. Only part 1's tones are laid
// out (the brief, and the profile's size); the other parts' tone areas are listed in each synth's
// coverage. Everything the two maps print the same is written once, here — outside synths/,
// because make-profiles.mjs treats every file there as a synth.

export const two = (n) => String(n).padStart(2, '0');

/** "[Scene Part]" — the manual names its parameter tables in brackets; the entries' links do not. */
export const T = (name) => `[${name}]`;

/** MFX rows read "MFX Switch", "MFX Parameter 1", and the type "Type (* appendix 1)". */
const MFX_STRIP = /^MFX\s+|\s*\(\*\s*appendix\s*1\)/g;

/**
 * The scene's five parts. Scene Part (01)-(04) are parts 1-4. Scene Part (05) is the rhythm part:
 * the manual's own labels for a part number count "PART 1, PART 2, PART 3, PART 4, PART R"
 * (Arpeggio Part: Ducking Part, I-Arp Style Part) and Current Part runs 1-5. Its tone is a drum
 * kit, which the address map has no temporary area for.
 */
export const PARTS = [1, 2, 3, 4, 5].map((n) => ({ n, id: `part${n}`, label: n === 5 ? 'Part R' : `Part ${n}` }));

/** System and Setup. Model Bank Assign (01-16) and Button Color Set (01-10) are left out: see coverage. */
export function systemBlocks() {
  return [
    { id: 'setup', table: T('Setup'), path: ['Setup'], group: 'Setup', strip: /^Scene\s+/, system: true },
    { id: 'system', table: T('System Common'), path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'system.control', table: T('System Control'), path: ['System', 'System Control'], group: 'System · Control', system: true },
    // The map links System Delay, like Scene Delay, to the [Chorus] table: its rows say "Chorus".
    { id: 'system.chorus', table: T('Chorus'), path: ['System', 'System Chorus'], group: 'System · Chorus', strip: /^Chorus\s+/, system: true },
    { id: 'system.delay', table: T('Chorus'), path: ['System', 'System Delay'], group: 'System · Delay', strip: /^Chorus\s+/, system: true },
    { id: 'system.reverb', table: T('Reverb'), path: ['System', 'System Reverb'], group: 'System · Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'system.masterEq', table: T('Master EQ'), path: ['System', 'Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'system.masterComp', table: T('Master Comp'), path: ['System', 'Master Comp'], group: 'System · Master Comp', system: true },
  ];
}

const SCENE = 'Temporary Scene';

/** The temporary scene: common and its effects, then each part with its zone, EQ, MFX and arpeggio. */
export function sceneBlocks() {
  return [
    { id: 'scene', table: T('Scene Common'), path: [SCENE, 'Scene Common'], group: 'Scene', strip: /^Scene\s+/ },
    { id: 'scene.chorus', table: T('Chorus'), path: [SCENE, 'Scene Chorus'], group: 'Scene · Chorus', strip: /^Chorus\s+/ },
    { id: 'scene.delay', table: T('Chorus'), path: [SCENE, 'Scene Delay'], group: 'Scene · Delay', strip: /^Chorus\s+/ },
    { id: 'scene.reverb', table: T('Reverb'), path: [SCENE, 'Scene Reverb'], group: 'Scene · Reverb', strip: /^Reverb\s+/ },
    { id: 'scene.drive', table: T('Drive'), path: [SCENE, 'Scene Drive'], group: 'Scene · Drive', strip: /^Drive\s+/ },
    { id: 'scene.arpeggio', table: T('Arpeggio Common'), path: [SCENE, 'Scene Arpeggio Common'], group: 'Scene · Arpeggio' },
    ...PARTS.flatMap(({ n, id, label }) => [
      { id, table: T('Scene Part'), path: [SCENE, `Scene Part (${two(n)})`], group: label, strip: /^Part\s+/ },
      { id: `${id}.zone`, table: T('Scene Zone'), path: [SCENE, `Scene Zone (${two(n)})`], group: `${label} · Zone` },
      { id: `${id}.eq`, table: T('Scene EQ'), path: [SCENE, `Scene EQ (${two(n)})`], group: `${label} · EQ`, strip: /^EQ\s+/ },
      { id: `${id}.mfx`, table: T('MFX'), path: [SCENE, `Scene MFX (${two(n)})`], group: `${label} · MFX`, strip: MFX_STRIP },
      { id: `${id}.arpeggio`, table: T('Arpeggio Part'), path: [SCENE, `Scene Arpeggio Part (${two(n)})`], group: `${label} · Arpeggio`, strip: /^Arp\s+/ },
    ]),
  ];
}

/**
 * Part p's Z-Core tone: common, MFX, the partial mix table (PMT), four partials each with pitch,
 * filter and amp envelopes, an LFO block (two LFOs) and an EQ, and the synth (virtual-analog)
 * layer — its common, its PMT and one block per partial.
 */
export function zcoreToneBlocks(part) {
  const root = `Temporary Tone ZCore (${two(part)})`;
  const id = `part${part}.zcore`;
  const label = `Part ${part} · Z-Core`;
  return [
    { id: `${id}.common`, table: T('Tone Common'), path: [root, 'Tone Common'], group: `${label} Common`, strip: /^Tone\s+/ },
    { id: `${id}.mfx`, table: T('MFX'), path: [root, 'Tone MFX'], group: `${label} MFX`, strip: MFX_STRIP },
    { id: `${id}.pmt`, table: T('Tone PMT'), path: [root, 'Tone PMT'], group: `${label} PMT` },
    ...[1, 2, 3, 4].flatMap((p) => [
      { id: `${id}.partial${p}`, table: T('Tone Partial'), path: [root, `Tone Partial ${p}`], group: `${label} Partial ${p}` },
      { id: `${id}.partial${p}.pitchEnv`, table: T('Partial Pitch Env'), path: [root, `Partial Pitch Env ${p}`], group: `${label} Partial ${p} · Pitch Env`, strip: /^Pitch Env\s+/ },
      { id: `${id}.partial${p}.filterEnv`, table: T('Partial Filter Env'), path: [root, `Partial Filter Env ${p}`], group: `${label} Partial ${p} · Filter Env`, strip: /^TVF Env\s+/ },
      { id: `${id}.partial${p}.ampEnv`, table: T('Partial Amp Env'), path: [root, `Partial Amp Env ${p}`], group: `${label} Partial ${p} · Amp Env`, strip: /^TVA Env\s+/ },
      { id: `${id}.partial${p}.lfo`, table: T('Partial LFO'), path: [root, `Partial LFO ${p}`], group: `${label} Partial ${p} · LFO` },
      { id: `${id}.partial${p}.eq`, table: T('Partial EQ'), path: [root, `Partial EQ ${p}`], group: `${label} Partial ${p} · EQ`, strip: /^EQ\s+/ },
      { id: `${id}.partial${p}.synth`, table: T('Tone Synth Partial'), path: [root, `Synth Partial ${p}`], group: `${label} Partial ${p} · Synth` },
    ]),
    { id: `${id}.synth`, table: T('Tone Synth Common'), path: [root, 'Synth Common'], group: `${label} Synth Common` },
    { id: `${id}.synthPmt`, table: T('Tone Synth PMT'), path: [root, 'Synth PMT'], group: `${label} Synth PMT` },
  ];
}

/**
 * A model tone: one flat parameter block, its MFX, and "Tone Com" (name and category). `entries`
 * are the three offset-entry names, which each map spells its own way.
 */
export function modelToneBlocks({ id, label, root, table, entries: [parameter, mfx, common] }) {
  return [
    { id, table, path: [root, parameter], group: label },
    { id: `${id}.mfx`, table: T('MFX'), path: [root, mfx], group: `${label} MFX`, strip: MFX_STRIP },
    { id: `${id}.common`, table: T('ToneCom'), path: [root, common], group: `${label} Common` },
  ];
}

/** Part p's Analog Synth Model tone; `root` is the map's spelling of its top-level entry. */
export const analogModelBlocks = (part, root) => modelToneBlocks({
  id: `part${part}.analog`,
  label: `Part ${part} · Analog Model`,
  root,
  table: T('MDLSYN0'),
  entries: ['Analog Synth Model Parameter', 'Analog Synth Model MFX', 'Analog Synth Model Tone Com'],
});

/**
 * The RD piano tone. The map has one, "(01)", and does not say which part it serves, so its ids
 * carry no part number.
 */
export const rdPianoBlocks = (root, resonance) => [
  { id: 'rdPiano', table: T('ToneName'), path: [root, 'RD Tone Name'], group: 'RD Piano · Name' },
  { id: 'rdPiano.resonance', table: T('Sympathetic Resonance'), path: [root, resonance], group: 'RD Piano · Resonance' },
];

/** p1, Bank Select: scenes are MSB 85, LSB 0 upward, 128 to a bank, all of them user memory. */
export const scenePresets = (banks) => ({
  banks: Array.from({ length: banks }, (unused, i) => ({
    id: `scene-${i + 1}`,
    label: `Scenes ${i * 128 + 1}-${(i + 1) * 128}`,
    role: 'user',
    writable: true,
    startSlot: i * 128,
    slotCount: 128,
    programBase: 0,
    bankMsb: 85,
    bankLsb: i,
  })),
  recall: { kind: 'bankPc' },
});

/** What both profiles say about themselves, apart from the per-synth addresses. */
export const sharedCoverage = {
  effectParameterMeanings: 'type-dependent: MFX, chorus, delay and reverb parameters are Roland\'s 4-nibble container '
    + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
  inboundControllers: 'not modelled: the front panel\'s CCs are in the Control Change section, not the address map',
  names: 'not text: the manual prints each name byte as its own row ("Name" sixteen times in a tone, "NAME 1"-"NAME 16" '
    + 'in the scene), which the generator\'s name reader does not join, so a name is sixteen 32-127 (ASCII) parameters',
};

export const sharedNotes = [
  'Rows the manual prints more than once in a block under one unnumbered name (the two LFOs and their sixteen Steps and Step Curves in '
    + 'Partial LFO, the four partials\' rows in the PMTs, the four Matrix Control sets in Tone Partial, MFX CtrlAsgn, a tone\'s Name bytes) '
    + 'keep the manual\'s name; the generator tells them apart by address, as <id>_<last two address bytes>.',
  'Scene Delay and System Delay are laid out with the [Chorus] table, which is what the map links them to (there is no [Delay] table), '
    + 'so their rows are named "Chorus …"; the ids drop the word.',
  'Part 5 is the rhythm part (PART R in the manual\'s own labels). Its tone is a drum kit (Bank Select MSB 86), and the address map has '
    + 'no temporary drum-kit area, so nothing of a kit is here.',
  'Grid Offset, Offset Velocity and Probability Grid Offset (Arpeggio Part), Mic Noise Suppressor Threshold (System Common) and AMP MOD '
    + '(Analog Synth Model) are two-nibble values whose printed wire range starts below zero; the engine cannot send a negative value, '
    + 'and how the instrument encodes one (two\'s complement, presumably) is not printed.',
];
