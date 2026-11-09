// The edit-buffer layout shared by the JUNO-D6/D7/D8, the XPS-10X and the XPS-60.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the
// three have in common lives here, and synths/juno-d6.mjs, xps-10x.mjs and xps-60.mjs say what is
// theirs — the identity reply, the bank table, the printed example and the page numbers.
//
// Roland's 2024-25 family. The JUNO-D answers to model ID 01 05 0A, the two XPS to 01 06 09, and
// all three print one address map (JUNO-D6/D7/D8 1.10 p15-17, XPS-10X 1.00 and XPS-60 1.02
// p15-16) with a few rows changed and, on the XPS-10X, no vocoder:
//
//   00 00 00 00  System                    common, control, chorus, reverb, EQ
//   00 10 00 00  Setup                     which scene is selected
//   01 00 00 00  Temporary Scene           common; for each of the eight parts (1-7 and R) a Part,
//                                          an EQ, an MFX, a Zone and an Arpeggio Part block; IFX,
//                                          chorus, reverb, vocoder, arpeggio common; the step
//                                          sequencer's settings and step data
//   02 00 00 00  Temporary Tone (Part 1)   … 02 06 00 00 (Part 7), one apart
//   03 00 00 00  Temporary Drum Kit        common, MFX, six comps, a partial and a partial EQ per
//                                          key from 21 to 108
//   03 30 00 00  Temporary Drum Kit Inst   a drum instrument: Inst Common (and three envelope
//                                          tables the manual names and never prints)
//
// A scene has seven tone parts and a rhythm part. The manual does not say in words which part
// plays the kit, but it says it in structure: seven Temporary Tones for Part 1-7, one Temporary
// Drum Kit, and an eighth part called R (Voice Reserve Part R, Scene Part (Part R)).
//
// A tone is ONE type: Tone Common, MFX, PMT, four partials each with pitch/filter/amp envelopes,
// an LFO block and an EQ, and the synth layer (Synth Common, Synth PMT, Synth Partial 1-4) — all at
// once, at fixed offsets, in every tone. Part 1 cannot hold a kit or another tone type, so nothing
// of part 1 needs keeping out of the startup read.
//
// What is laid out, and why not the rest:
//
//   - Setup and System, every block; the Temporary Scene's common, IFX, chorus, reverb, vocoder
//     and arpeggio common.
//   - The per-part scene blocks of Part 1, Part 2 and Part R only. The [Scene] offset table prints
//     each per-part list as "(Part 1)", "(Part 2)", ":", "(Part R)"; the parser fills a ":" run only
//     when a numbered series closes on a number, and "R" is not one, so the map has no entry for
//     parts 3-7 and the generator has no way to address a block by anything but an entry name.
//     The parser now fills them in (the run closes on Part R); ELIDED_PART_ADDRESSES records where they are.
//   - Part 1's Temporary Tone, whole. Parts 2-7's are the same blocks at their own base.
//   - The Temporary Drum Kit, whole: all eighty-eight keys fit (the three profiles stay under
//     4,300 parameters with it), and it is the only kit there is to edit.
//   - The Temporary Drum Kit Inst's Inst Common, read on request (see noPull in each synth).
//   - Not the step sequencer. Scene Sequencer is printed as one unnumbered name eight times, so no
//     path can name one of them, and Scene Sequencer Data is step data (eight blocks of 4,096
//     bytes), a pattern rather than an edit-buffer setting.

/** "[Scene Part]": the manual names its parameter tables in brackets; the entries' links do not. */
export const T = (name) => `[${name}]`;

const SCENE = 'Temporary Scene';
const TONE_ROOT = (part) => `Temporary Tone (Part ${part})`;
const KIT = 'Temporary Drum Kit';
const KIT_INST = 'Temporary Drum Kit Inst';

/**
 * All eight parts. The manual's [Scene] table prints Part 1, Part 2, ":" and Part R; the parser
 * fills Parts 3-7 in because the run closes, at the printed stride, on the lettered slot.
 */
export const PARTS = [
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: String(n), id: `part${n}`, label: `Part ${n}` })),
  { key: 'R', id: 'partR', label: 'Part R' },
];

/**
 * Where the per-part scene blocks the map cannot name are, by the arithmetic of the entries it
 * does print: Part 1 at the first address, Part R at the last, seven numbered parts and R between.
 */
export const ELIDED_PART_ADDRESSES = {
  'Scene Part': '01 00 03 00 - 01 00 07 00 (Part 3-7, one apart; Part R is 01 00 08 00)',
  'Scene EQ': '01 00 0B 00 - 01 00 0F 00 (Part 3-7, one apart; Part R is 01 00 10 00)',
  'Scene MFX': '01 00 15 00 - 01 00 1D 00 (Part 3-7, two apart; Part R is 01 00 1F 00)',
  'Scene Zone': '01 00 23 00 - 01 00 27 00 (Part 3-7, one apart; Part R is 01 00 28 00)',
  'Scene Arpeggio Part': '01 00 31 00 - 01 00 35 00 (Part 3-7, one apart; Part R is 01 00 36 00)',
};

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

/** Every key a kit has: 21 (A0) to 108 (C8). */
export const KIT_KEYS = range(21, 108);

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Roland's octave numbering: middle C, note 60, is C4. */
export const noteName = (key) => `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

const MFX = /^MFX\s+/;
// Every Scene Part row starts "Part" ("Part Level (CC#7)", "Part Switch"), as every Arpeggio Part
// row but one starts "Part" or "Arp" ("Part Switch", "Arp Style", "Arp Variation").
const PART = /^Part\s+/;
const ARP_PART = /^(?:Part|Arp)\s+/;

/* ------------------------------------------------------------------ system */

export function systemBlocks() {
  return [
    { id: 'setup', table: T('Setup'), path: ['Setup'], group: 'Setup', strip: /^Scene\s+/, system: true },
    { id: 'system', table: T('System Common'), path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    { id: 'system.control', table: T('System Control'), path: ['System', 'System Control'], group: 'System · Control', system: true },
    { id: 'system.chorus', table: T('Chorus'), path: ['System', 'System Chorus'], group: 'System · Chorus', strip: /^Chorus\s+/, system: true },
    { id: 'system.reverb', table: T('Reverb'), path: ['System', 'System Reverb'], group: 'System · Reverb', strip: /^Reverb\s+/, system: true },
    { id: 'system.eq', table: T('System EQ'), path: ['System', 'System EQ'], group: 'System · EQ', strip: /^EQ\s+/, system: true },
  ];
}

/* ------------------------------------------------------------------ the temporary scene */

/** `vocoder`: whether the scene has a Scene Vocoder (the JUNO-D and XPS-60 do; the XPS-10X does not). */
export function sceneBlocks({ vocoder }) {
  return [
    { id: 'scene', table: T('Scene Common'), path: [SCENE, 'Scene Common'], group: 'Scene', strip: /^Scene\s+/ },
    { id: 'scene.ifx', table: T('MFX'), path: [SCENE, 'Scene IFX'], group: 'Scene · IFX', strip: MFX },
    { id: 'scene.chorus', table: T('Chorus'), path: [SCENE, 'Scene Chorus'], group: 'Scene · Chorus', strip: /^Chorus\s+/ },
    { id: 'scene.reverb', table: T('Reverb'), path: [SCENE, 'Scene Reverb'], group: 'Scene · Reverb', strip: /^Reverb\s+/ },
    ...(vocoder ? [{ id: 'scene.vocoder', table: T('Vocoder'), path: [SCENE, 'Scene Vocoder'], group: 'Scene · Vocoder', strip: /^Vocoder\s+/ }] : []),
    { id: 'scene.arpeggio', table: T('Arpeggio Common'), path: [SCENE, 'Scene Arpeggio Common'], group: 'Scene · Arpeggio' },
    ...PARTS.flatMap(({ key, id, label }) => [
      { id, table: T('Scene Part'), path: [SCENE, `Scene Part (Part ${key})`], group: label, strip: PART },
      { id: `${id}.eq`, table: T('Scene EQ'), path: [SCENE, `Scene EQ (Part ${key})`], group: `${label} · EQ`, strip: /^EQ\s+/ },
      { id: `${id}.mfx`, table: T('MFX'), path: [SCENE, `Scene MFX (Part ${key})`], group: `${label} · MFX`, strip: MFX },
      { id: `${id}.zone`, table: T('Scene Zone'), path: [SCENE, `Scene Zone (Part ${key})`], group: `${label} · Zone` },
      // These entries are printed "Scene Arpeggio Part 1", without the brackets the others have.
      { id: `${id}.arpeggio`, table: T('Arpeggio Part'), path: [SCENE, `Scene Arpeggio Part ${key}`], group: `${label} · Arpeggio`, strip: ARP_PART },
    ]),
  ];
}

/* ------------------------------------------------------------------ part 1's temporary tone */

export function toneBlocks(part) {
  const root = TONE_ROOT(part);
  const id = `part${part}.tone`;
  const label = `Part ${part} Tone`;
  return [
    { id: `${id}.common`, table: T('Tone Common'), path: [root, 'Tone Common'], group: `${label} · Common`, strip: /^Tone\s+/ },
    { id: `${id}.mfx`, table: T('MFX'), path: [root, 'Tone MFX'], group: `${label} · MFX`, strip: MFX },
    { id: `${id}.pmt`, table: T('Tone PMT'), path: [root, 'Tone PMT'], group: `${label} · Partial Mix Table`, strip: /^PMT\s+/ },
    ...[1, 2, 3, 4].flatMap((p) => [
      { id: `${id}.partial${p}`, table: T('Tone Partial'), path: [root, `Tone Partial ${p}`], group: `${label} · Partial ${p}` },
      { id: `${id}.partial${p}.pitchEnv`, table: T('Partial Pitch Env'), path: [root, `Partial Pitch Env ${p}`], group: `${label} · Partial ${p} · Pitch Env`, strip: /^Pitch Env\s+/ },
      { id: `${id}.partial${p}.filterEnv`, table: T('Partial Filter Env'), path: [root, `Partial Filter Env ${p}`], group: `${label} · Partial ${p} · Filter Env`, strip: /^TVF Env\s+/ },
      { id: `${id}.partial${p}.ampEnv`, table: T('Partial Amp Env'), path: [root, `Partial Amp Env ${p}`], group: `${label} · Partial ${p} · Amp Env`, strip: /^TVA Env\s+/ },
      { id: `${id}.partial${p}.lfo`, table: T('Partial LFO'), path: [root, `Partial LFO ${p}`], group: `${label} · Partial ${p} · LFO` },
      { id: `${id}.partial${p}.eq`, table: T('Partial EQ'), path: [root, `Partial EQ ${p}`], group: `${label} · Partial ${p} · EQ`, strip: /^EQ\s+/ },
      { id: `${id}.partial${p}.synth`, table: T('Tone Synth Partial'), path: [root, `Synth Partial ${p}`], group: `${label} · Partial ${p} · Synth` },
    ]),
    { id: `${id}.synth`, table: T('Tone Synth Common'), path: [root, 'Synth Common'], group: `${label} · Synth Common` },
    { id: `${id}.synthPmt`, table: T('Tone Synth PMT'), path: [root, 'Synth PMT'], group: `${label} · Synth PMT` },
  ];
}

/* ------------------------------------------------------------------ the rhythm part's kit */

export function drumKitBlocks() {
  const label = 'Part R Drum Kit';
  const key = (k) => `${label} · Key ${k} (${noteName(k)})`;
  return [
    { id: 'drumKit.common', table: T('Drum Kit Common'), path: [KIT, 'Drum Kit Common'], group: `${label} · Common` },
    { id: 'drumKit.mfx', table: T('MFX'), path: [KIT, 'Drum Kit MFX'], group: `${label} · MFX`, strip: MFX },
    ...range(1, 6).map((n) => ({
      id: `drumKit.comp${n}`, table: T('Drum Kit Comp'), path: [KIT, `Drum Kit Comp ${n}`], group: `${label} · Comp ${n}`, strip: /^Comp\s+/,
    })),
    ...KIT_KEYS.flatMap((k) => [
      { id: `drumKit.key${k}`, table: T('Drum Kit Partial'), path: [KIT, `Drum Kit Partial (Key# ${k})`], group: key(k) },
      { id: `drumKit.key${k}.eq`, table: T('Partial EQ'), path: [KIT, `Drum Kit Partial EQ (Key# ${k})`], group: `${key(k)} · EQ`, strip: /^EQ\s+/ },
    ]),
    { id: 'drumKit.inst', table: T('Inst Common'), path: [KIT_INST, 'Inst Common'], group: `${label} · Inst` },
  ];
}

/** Everything, in the order the startup read asks for it. */
export const familyBlocks = ({ vocoder }) => [
  ...systemBlocks(),
  ...sceneBlocks({ vocoder }),
  ...toneBlocks(1),
  ...drumKitBlocks(),
];

/** Read on request, not at connect: see `noPullReason`. */
export const NO_PULL = [/^drumKit\.inst$/];

export const noPullReason = ({ instPage, rq1Page }) => 'The Temporary Drum Kit Inst (03 30 00 00) is a single drum instrument, and '
  + `the manual (p${instPage}) does not say which key's instrument it holds or when the instrument answers for it; an RQ1 it cannot `
  + `answer gets nothing back ("If the conditions are not met, nothing is transmitted", p${rq1Page}), and the startup read stops at the `
  + 'first request that is not answered. So it is read on request. Part 1 needs no such care: a tone is one type, '
  + 'and the kit is the rhythm part\'s, which always has one.';

/* ------------------------------------------------------------------ banks */

/**
 * A bank table as the manual prints it, one row per Bank Select: [id, label, role, msb, lsb, count].
 * The slots run on from one bank to the next, and a bank's programs start at 0 (PC 1).
 */
export function banks(rows) {
  let startSlot = 0;
  return rows.map(([id, label, role, bankMsb, bankLsb, slotCount]) => {
    const bank = { id, label, role, writable: role === 'user', startSlot, slotCount, programBase: 0, bankMsb, bankLsb };
    startSlot += slotCount;
    return bank;
  });
}

const pad3 = (n) => String(n).padStart(3, '0');
/** A scene bank row: MSB 85, the manual's group name, its LSB and its program count. */
export const sceneBank = (group, lsb, count, first = 1) => [
  `${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${first > 1 ? `-${first}` : ''}`,
  `${group} ${pad3(first)}-${pad3(first + count - 1)}`,
  group === 'USER' ? 'user' : 'factory',
  85,
  lsb,
  count,
];

/* ------------------------------------------------------------------ what is said about it */

export const sharedCoverage = ({ scenePage, instPage }) => ({
  effectParameterMeanings: 'type-dependent: MFX, IFX, chorus, reverb and vocoder parameters are Roland\'s 4-nibble container '
    + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
  inboundControllers: 'not modelled: what the front panel transmits is in the Control Change section, not the address map',
  sceneParts: `all eight parts, 1-7 and R. The [Scene] offset table (p${scenePage}) prints each per-part list as "(Part 1)", `
    + '"(Part 2)", ":", "(Part R)"; the map fills Parts 3-7 in from the stride, since the run closes on Part R.',
  partTones: 'part 1 only: Temporary Tone (Part 2)-(Part 7) are the same [Tone] blocks at 02 01 00 00, 02 02 00 00, … 02 06 00 00',
  drumKit: 'complete: the Temporary Drum Kit (03 00 00 00), all 88 keys (21-108), each with its partial and its partial EQ',
  drumKitInst: `Inst Common only: the [Drum Kit Inst] offset table (p${instPage}) lists Inst Pitch Env (03 30 02 00), Inst Filter Env `
    + '(03 30 03 00) and Inst Amp Env (03 30 04 00) as tables of those names, which the manual never prints',
  sequencer: 'not laid out: Scene Sequencer (eight [Sequencer] blocks, 01 00 37 00 - 01 00 45 00, two apart) is printed as one unnumbered '
    + 'name eight times, so no path can name one; Scene Sequencer Data (eight [Sequencer Data] blocks of 4,096 bytes of step data, '
    + '01 00 47 00 - 01 02 27 00, 00 20 00 apart) is a pattern, not an edit-buffer setting',
});

export const sharedNotes = ({ scenePage, pmtPage }) => [
  `Scene parts: the profile has the Part, EQ, MFX, Zone and Arpeggio blocks of all eight parts, 1-7 and Part R (the rhythm part). `
    + `The manual's [Scene] table (p${scenePage}) prints only "(Part 1)", "(Part 2)", ":" and "(Part R)"; Parts 3-7 are filled in from the stride.`,
  'Part 1\'s tone is at 02 00 00 00. A tone is one type (common, MFX, PMT, four partials with envelopes, LFO and EQ, and the synth '
    + 'layer), so Part 1 has no alternative tone types to keep out of the startup read.',
  'The drum kit (03 00 00 00) is the rhythm part\'s: seven Temporary Tones for Part 1-7, one Temporary Drum Kit, and an eighth part, R. '
    + 'Key k\'s partial is at 03 00 16 00 + (k-21) x 00 01 00 and its partial EQ at 03 00 6E 00 + (k-21) x 00 01 00 (7-bit carry).',
  `[Tone PMT] (p${pmtPage}) prints partial 1's velocity range as "VeloRange Lower" and partials 2-4's as "Velocity Range Lower", so the `
    + 'generator numbers only the last three: part1.tone.pmt.velorangeLower is partial 1, velocityRangeLower1-3 are partials 2-4. '
    + 'Every other PMT row is numbered 1-4 by partial.',
  'Tone Partial\'s four matrix controls print "Source n" once and "Destination 1-4" / "Sens 1-4" under each; the generator numbers the '
    + 'repeats by matrix control, so destination12 is Matrix Control 2\'s Destination 1 (as in the JUNO-X profile).',
  'Partial LFO prints its two LFOs\' rows without an LFO number; the generator numbers each repeat in printed order, so the last digit is '
    + 'the LFO: waveform1 is LFO 1\'s Waveform, step52 is LFO 2\'s Step 5, step16Curve1 is LFO 1\'s Step 16 Curve. '
    + '"Delay Time Keyfolow" is the manual\'s spelling.',
  'Presets list the scenes (Bank Select MSB 85), recalled on the profile\'s channel, which should be the System\'s Scene Control Channel. '
    + 'Tones (MSB 71/87) and drum kits (MSB 70/86) are chosen per part and are not listed.',
];
