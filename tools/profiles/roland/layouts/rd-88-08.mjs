// The edit-buffer layout shared by the RD-88, the RD-88EX and the RD-08.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the
// three stage pianos have in common lives here, and synths/rd-88.mjs, rd-88ex.mjs and rd-08.mjs say
// what is theirs — the bank table, the page numbers, and the rows the RD-08 holds back.
//
// Roland's ZEN-Core-era stage pianos. All three answer to model ID 00 00 00 64 and print one address
// map (p12-21 in each MIDI Implementation; the RD-88EX's is the RD-88's word for word, the RD-08's
// the same with four assignable knobs instead of eight, a hundred user scenes instead of four
// hundred, and the knob and external-zone rows marked <**>, "enabled after the instrument is
// upgraded"):
//
//   00 00 00 00  System            common, control (keyboard, wheels, knobs, pedals), system chorus,
//                                  system reverb, master EQ, master comp, input reverb, input EQ
//   01 00 00 00  Temporary Scene   common; for each of the three zones a Scene Tone (which tone it
//                                  plays and the part's offsets to it), a Scene EQ, an MFX and a
//                                  Scene Zone (key and velocity range, which controllers reach it,
//                                  and what it sends to external gear); the scene's IFX, chorus,
//                                  reverb and sympathetic resonance
//   02 00 00 00  Setup             which scene is selected (bank select and program change)
//   10 00 00 00  User Scene(001) … one 00 01 00 00 apart, each the Scene layout again
//
// A scene is the whole instrument: three zones layered or split over the keyboard, each playing one
// internal tone (chosen by bank and program in its Scene Tone block) and sending to external gear
// (its Scene Zone's External rows). The map has no tone area at all — no piano designer, no tone
// modify, no temporary tone — so what can be edited of a zone's sound is what the scene holds: the
// Scene Tone's offsets (cutoff, resonance, envelope, vibrato, velocity, scale tune), its EQ and MFX.
// There is therefore nothing a zone could hold instead of what is laid out, and no block is kept
// out of the startup read.
//
// The address map numbers the zones 1-3 and does not name them. The scene's Sympathetic Resonance
// "SymReso Part" row (p18 in all three) lists OFF, UPPER1, UPPER2, LOWER, and Scene Common calls the
// voice reserve "Layer(1)" to "Layer(3)"; the groups below keep the map's numbers.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const ZONES = range(1, 3);

const SCENE = 'Temporary Scene';

/** "[Scene Tone]": the manual names its parameter tables in brackets; the offset entries do not. */
const T = (name) => `[${name}]`;

/** The System blocks (00 00 00 00) and Setup (02 00 00 00): instrument-wide, not part of a scene. */
export function systemBlocks() {
  const at = (entry) => ['System', entry];
  return [
    { id: 'setup', table: T('Setup'), path: ['Setup'], group: 'Setup', system: true },
    // "System Control Source(1)", "System Tempo": the block says System already.
    { id: 'system', table: T('System Common'), path: at('System Common'), group: 'System', strip: /^System\s+/, system: true },
    { id: 'system.control', table: T('System Control'), path: at('System Control'), group: 'System · Control', system: true },
    { id: 'system.chorus', table: T('Chorus'), path: at('System Chorus'), group: 'System · Chorus', strip: /^Chorus\s+/, system: true },
    { id: 'system.reverb', table: T('Reverb'), path: at('System Reverb'), group: 'System · Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'system.masterEq', table: T('EQ'), path: at('Master EQ'), group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'system.masterComp', table: T('Comp'), path: at('Master Comp'), group: 'System · Master Comp', system: true },
    { id: 'system.inputReverb', table: T('Reverb'), path: at('Input Reverb'), group: 'System · Input Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'system.inputEq', table: T('EQ'), path: at('Input EQ'), group: 'System · Input EQ', strip: /^EQ\s+/, system: true },
  ];
}

/**
 * One zone's four scene blocks. The Scene Tone's rows are printed "Part Level (CC#7)", "Tone Bank
 * Select MSB (CC#0)", "Tone Program Change (PC)": the block names the part, so `Part` goes, and
 * `Tone` goes where it only says whose bank and program they are ("Tone Color Type" keeps it).
 */
function zoneBlocks(zone) {
  const label = `Zone ${zone}`;
  return [
    { id: `zone${zone}.tone`, table: T('Scene Tone'), path: [SCENE, `Scene Tone(${zone})`], group: `${label} · Tone`, strip: /^Part\s+|^Tone\s+(?=Bank|Program)/ },
    { id: `zone${zone}.eq`, table: T('Scene EQ'), path: [SCENE, `Scene EQ(${zone})`], group: `${label} · EQ`, strip: /^EQ\s+/ },
    { id: `zone${zone}.mfx`, table: T('MFX'), path: [SCENE, `Scene MFX(${zone})`], group: `${label} · MFX`, strip: /^MFX\s+/ },
    { id: `zone${zone}`, table: T('Scene Zone'), path: [SCENE, `Scene Zone(${zone})`], group: label },
  ];
}

/** The temporary scene, 01 00 00 00: common, the three zones, the scene's own effects. */
export function sceneBlocks() {
  return [
    { id: 'scene', table: T('Scene Common'), path: [SCENE, 'Scene Common'], group: 'Scene', strip: /^Scene\s+/ },
    ...ZONES.flatMap(zoneBlocks),
    { id: 'ifx', table: T('MFX'), path: [SCENE, 'Scene IFX'], group: 'Scene · IFX', strip: /^MFX\s+/ },
    { id: 'chorus', table: T('Chorus'), path: [SCENE, 'Scene Chorus'], group: 'Scene · Chorus', strip: /^Chorus\s+/ },
    { id: 'reverb', table: T('Reverb'), path: [SCENE, 'Scene Reverb'], group: 'Scene · Reverb', strip: /^Reverb\s+/ },
    { id: 'symReso', table: T('Sympathetic Resonance'), path: [SCENE, 'Scene Sympathetic Resonance'], group: 'Scene · Sympathetic Resonance', strip: /^SymReso\s+/ },
  ];
}

export const familyBlocks = () => [...systemBlocks(), ...sceneBlocks()];

/**
 * The manual's one worked DT1 (RD-88/RD-88EX p23, RD-08 p22, "Example of an Exclusive Message and
 * Calculating a Checksum"): Scene Level, at 01 00 00 00 + 00 00 00 + 00 10, set to 74 (4A). The
 * heading calls it "program level"; the text beneath and the address are Scene Common's Scene Level.
 */
export const sceneLevelExample = (where) => ({
  name: 'Setting Scene Level to 74 (DT1)',
  where,
  parameter: 'scene.level',
  value: 74,
  expectedHex: 'F0 41 10 00 00 00 64 12 01 00 00 10 4A 25 F7',
});

/** A Bank Select row for scenes, MSB 85. Scenes are user memory (User Scene(n) in the map). */
export const sceneBank = ({ id, label, lsb, startSlot, slotCount, programBase = 0 }) => ({
  id, label, role: 'user', writable: true, startSlot, slotCount, programBase, bankMsb: 85, bankLsb: lsb,
});

/**
 * The RD-88's and RD-88EX's Scene bank table (p1): MSB 085, LSB 000-002 programs 001-128 (scenes
 * 001-384) and LSB 003 programs 001-016 (scenes 385-400; printed "384 - 400").
 */
export const fourHundredScenes = () => ({
  banks: [
    ...[0, 1, 2].map((lsb) => sceneBank({
      id: `scene-${lsb + 1}`,
      label: `Scene ${String(lsb * 128 + 1).padStart(3, '0')}-${String(lsb * 128 + 128).padStart(3, '0')}`,
      lsb,
      startSlot: lsb * 128,
      slotCount: 128,
    })),
    sceneBank({ id: 'scene-4', label: 'Scene 385-400', lsb: 3, startSlot: 384, slotCount: 16 }),
  ],
  recall: { kind: 'bankPc' },
});

/** What the three manuals print as their Identity Reply (p12 in each), side by side. */
export const identityNote = 'Identity (p12 in each manual): the RD-88, the RD-88EX and the RD-08 all print family code 64 03 and family number '
  + 'code 00 00, the status line and the byte table agreeing. The RD-88 and RD-88EX print the same software revision as well (00 01 00 01), so '
  + 'nothing in their replies tells them apart; the RD-08 differs only in its revision bytes (01 01 00 00), which profiles do not pin (a '
  + 'firmware update is not a different instrument). The three therefore collide: choosing any of these profiles for one of the others is '
  + 'not flagged as a mismatch. They share one address map, so the profiles agree wherever they overlap.';

/** The Tone bank table, printed alike in all three (p1); tones are chosen per zone, not by a scene browser. */
export const toneTableNote = 'Bank Select (p1), the Tone table: the second PCM group is printed "RR-B" (for PR-B) and its LSB 065 row '
  + '"0128 - 0256" (for 0129 - 0256). Tones are chosen per zone in its Scene Tone block (bank select MSB/LSB and program change), which '
  + 'the scene presets do not list.';

export const sharedCoverage = ({ userScenes, controlChange }) => ({
  zones: 'all three zones\' Scene Tone, Scene EQ, MFX and Scene Zone blocks (01 00 10 00-12 00, 01 00 20 00-22 00, 01 00 30 00/32 00/34 00, '
    + '01 00 40 00-42 00)',
  tones: 'none in the map: a zone\'s tone is chosen by bank and program (Scene Tone 00 00-00 02) from the tone list in the Bank Select table '
    + '(p1), and the address map has no tone, piano-designer or tone-modify area. What a scene can change of its zones\' tones is the Scene '
    + 'Tone block\'s part offsets and the zone\'s EQ and MFX, all laid out',
  userScenes: `not edit buffer: ${userScenes}`,
  effectParameterMeanings: 'type-dependent: MFX, IFX, chorus and reverb parameters are Roland\'s 4-nibble container (12768-52768, shown '
    + '-20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list. MFX Type (0-90), '
    + 'Chorus Type (0-9) and Reverb Type (0-7) print no labels',
  inboundControllers: `not modelled: what the instrument receives and transmits as Control Change (${controlChange}) is not mapped yet`,
});

export const sharedNotes = ({ symResoPage }) => [
  'The three zones are the map\'s Scene Tone(n), Scene EQ(n), Scene MFX(n) and Scene Zone(n), n = 1-3, laid out as zone<n>.tone, zone<n>.eq, '
    + 'zone<n>.mfx and zone<n>. The map does not name them; the Sympathetic Resonance block\'s SymReso Part row lists OFF, UPPER1, UPPER2, '
    + `LOWER (p${symResoPage}), and Scene Common's Voice Reserve rows are numbered Layer(1)-(3).`,
  'Scene MFX(n) are laid at 01 00 30 00, 01 00 32 00 and 01 00 34 00, two address pages apart: the MFX block is 00 00 01 10 (144 bytes) and '
    + 'crosses into the next page. The Scene IFX at 01 00 50 00 is the same table.',
  'Setup (02 00 00 00) holds which scene is current, as a bank select and program change (Scene BS MSB, Scene BS LSB, Scene PC); it is '
    + 'marked system with the System blocks, so the startup read leaves it and them alone.',
  `Sympathetic Resonance 00 0B, "Rev HF Damp" (p${symResoPage}), is printed with a bit layout (00aa aaaa) and a label list but no range. `
    + 'The reader counts its 32 labels (16 Hz … 15000 Hz, Bypass) and lays it as 0 - 31. The row with the very same labels and bit layout, '
    + 'AtkIn LPF at 00 03, is printed (1 - 32), so the real wire values may be 1 - 32 and every label here one value low; unverified until '
    + 'an instrument answers. Its counterpart Rev LF Damp (00 0C, "Bypass, 16 … 15000") is printed (0 - 31), like AtkIn HPF.',
  'No noPull: a zone always plays one tone through the same Scene Tone, EQ, MFX and Zone blocks, and the map has no alternative tone '
    + 'areas that the instrument might not answer for.',
];
