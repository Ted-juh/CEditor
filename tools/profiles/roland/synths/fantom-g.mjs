// The Roland Fantom-G6/G7/G8: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "Fantom-G MIDI Implementation" (Fantom-G_MI.pdf, 48 pages; maps/fantom-g.json says which
// file, with its hash). The manual prints no version or date on its first page; its two MIDI
// Implementation Charts (p46, p47) say "Version : 1.00" and "Date : Feb. 1, 2008", and every page's
// running head carries the FrameMaker stamp of 8 May 2008. Page numbers below are that document's:
// Bank Select p1, Identity Reply p9, DT1/RQ1 p6 and p10, the Parameter Address Map pp14-43, the
// worked example p45.
//
// The Fantom-G plays in three modes — Single, Live and Studio (Setup's Sound Mode, p15) — and its
// address map (p14) gives the two multi-part modes a temporary area each:
//
//   01 00 00 00  Setup                         (sound mode, which live set and studio set, transpose)
//   02 00 00 00  System                        (common, insert MFX, mastering, input FX, controllers)
//   10 00 00 00  Temporary Live Set            common, two ARX-expansion commons, chorus, reverb, a MIDI
//                                              block per channel, eight parts, sixteen parts for each ARX
//                                              expansion slot, sixteen external parts, controllers
//   11 00 00 00  Temporary Patch/Rhythm (Live Mode Part 1) … 12 60 00 00 (Part 8)
//   16 00 00 00  Temporary Arpeggio (Live Mode)    16 01 00 00  Temporary Chord (Live Mode)
//   18 00 00 00  Temporary Studio Set          the same, with sixteen parts, two insert MFX, mastering
//                                              and input FX of its own
//   19 00 00 00  Temporary Patch/Rhythm (Studio Mode Part 1) … 1C 60 00 00 (Part 16)
//   1E 00 00 00  Temporary Arpeggio (Studio Mode)  1E 01 00 00  Temporary Chord (Studio Mode)
//   1F 00 00 00  Temporary Arpeggio Set        1F 01 00 00  Temporary Chord Set
//
// and each part's Temporary Patch/Rhythm holds one of three kinds of sound at three offsets:
//
//   + 00 00 00   Temporary Patch       common, MFX, chorus, reverb, TMT, four tones, common 2, and a
//                                      second block per tone (its output assign and 64-step LFO)
//   + 08 00 00   Temporary Sample Set  common, MFX, chorus, reverb, sixteen sample tones
//   + 10 00 00   Temporary Rhythm      common, MFX, chorus, reverb, a tone per key from 21 to 108,
//                                      common 2, and a second block per key (its output assign)
//
// Laid out here: Setup and System, the whole Temporary Studio Set and Temporary Live Set, both modes'
// arpeggio and chord memory, the arpeggio and chord sets, and Studio Mode Part 1's temporary sound in
// all three kinds. The other parts' sounds, and most of the rhythm set's keys, are left out to keep
// the profile a size an editor can load; coverage and notes say where they are.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

const PARTS_16 = range(1, 16);
/** A live set has eight parts of its own (p14), and sixteen for each ARX slot and for external MIDI. */
const LIVE_PARTS = range(1, 8);
const EXP_SLOTS = [1, 2];

/**
 * Rhythm set keys laid out: 35 (Acoustic Bass Drum) to 59 (Ride Cymbal 2), the drum kit proper of
 * the General MIDI percussion map — kicks, snares, toms, hi-hats, crashes and rides. Each key is a
 * Rhythm Tone of 145 parameters (its 12-byte name counted as one) and a Rhythm Tone 2 of one; all 88
 * keys (21-108) would be 12,848 on their own, nearly twice the rest of the profile.
 */
const RHYTHM_KEYS = range(35, 59);
const RHYTHM_KEYS_LEFT_OUT = range(21, 108).filter((key) => !RHYTHM_KEYS.includes(key));

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Roland's octave numbering: middle C, note 60, is C4. */
const noteName = (key) => `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

// `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the mode messages, as (CC# n) names a CC.
const PART_STRIP = /^Part\s+|\s*\(MONO ON\/POLY ON\)/g;
const MFX = /^MFX\s+/;
const CHORUS = /^Chorus\s+/;
const REVERB = /^Reverb\s+/;

/* -------------------------------------------------------------- a live set or a studio set */

/**
 * The blocks of one temporary set. Live and Studio print the same tables with their own heading
 * ("Live Set Part", "Studio Set Part"); the studio set adds two insert MFX, mastering and input FX,
 * which in Live mode are the System's.
 *
 *   word     'Live Set' or 'Studio Set': the tables' and entries' prefix
 *   root     the top-table entry
 *   id       block-id prefix for the set's own blocks ('liveSet', 'studioSet')
 *   partId   block-id prefix for its parts ('liveSet.part', 'part')
 *   parts    which internal parts it has
 */
function setBlocks({ word, root, id, partId, expId, extId, parts, studio }) {
  const at = (entry) => [root, entry];
  return [
    { id, table: `${word} Common`, path: at(`${word} Common`), group: word, strip: new RegExp(`^${word}\\s+`) },
    // Each ARX expansion slot's sound as a whole: level, pan, sends, output.
    ...EXP_SLOTS.map((n) => ({
      id: `${id}.exp${n}`, table: `${word} Exp Common`, path: at(`${word} Exp${n} Common`), group: `${word} · Exp ${n}`,
    })),
    ...(studio ? [1, 2].map((n) => ({
      id: `${id}.mfx${n}`, table: `${word} Common Insert MFX`, path: at(`${word} Common Insert MFX${n}`), group: `${word} · Insert MFX ${n}`, strip: MFX,
    })) : []),
    { id: `${id}.chorus`, table: `${word} Common Chorus`, path: at(`${word} Common Chorus`), group: `${word} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: `${word} Common Reverb`, path: at(`${word} Common Reverb`), group: `${word} · Reverb`, strip: REVERB },
    ...(studio ? [
      { id: `${id}.mastering`, table: `${word} Mastering`, path: at(`${word} Common Mastering`), group: `${word} · Mastering` },
      { id: `${id}.inputFx`, table: `${word} Input FX`, path: at(`${word} Common Input FX`), group: `${word} · Input FX`, strip: /^Input Effect\s+/ },
    ] : []),
    ...PARTS_16.map((ch) => ({
      id: `${id}.midi${ch}`, table: `${word} MIDI`, path: at(`${word} MIDI (Channel ${ch})`), group: `${word} · MIDI Ch ${ch}`,
    })),
    ...parts.map((n) => ({
      id: `${partId}${n}`, table: `${word} Part`, path: at(`${word} Part (Part ${n})`), group: `${word} · Part ${n}`, strip: PART_STRIP,
    })),
    // Exp n Part m: part m of the ARX expansion board in slot n — not the internal part m.
    ...EXP_SLOTS.flatMap((slot) => PARTS_16.map((n) => ({
      id: `${expId(slot)}.part${n}`, table: `${word} Exp Part`, path: at(`${word} Exp${slot} Part (Part ${n})`), group: `${word} · Exp ${slot} Part ${n}`, strip: /^Part\s+/,
    }))),
    // External parts play MIDI gear on the MIDI OUT; "External Level (CC# 7)" is ext.partN.level.
    ...PARTS_16.map((n) => ({
      id: `${extId}.part${n}`, table: `${word} Ext Part`, path: at(`${word} Ext Part (Part ${n})`), group: `${word} · Ext Part ${n}`, strip: /^(?:External|Part)\s+/,
    })),
    { id: `${id}.controller`, table: `${word} Controller`, path: at(`${word} Controller`), group: `${word} · Controller` },
  ];
}

/** A mode's temporary arpeggio and chord memory (16 00 00 00 / 16 01 00 00, 1E 00 00 00 / 1E 01 00 00). */
const arpeggioAndChord = (id, mode, word) => [
  { id: `${id}.arpeggio`, table: 'Arpeggio', path: [`Temporary Arpeggio (${mode})`, 'Arpeggio'], group: `${word} · Arpeggio`, strip: /^Arpeggio\s+/ },
  // 128 note switches (Chord Note1 … 128, C-1 to G9) and the form's name.
  { id: `${id}.chord`, table: 'Chord Memory', path: [`Temporary Chord (${mode})`, 'Chord Memory'], group: `${word} · Chord Memory`, strip: /^Chord(?: Memory)?\s+/ },
];

/* -------------------------------------------------------------- Studio Mode Part 1's sound */

const TONE_PART = 1;
const PART_ROOT = (part) => `Temporary Patch/Rhythm (Studio Mode Part ${part})`;

function patch(part) {
  const at = (entry) => [PART_ROOT(part), 'Temporary Patch', entry];
  const id = `part${part}.patch`;
  const group = `Studio Part ${part} Patch`;
  return [
    { id, table: 'Patch Common', path: at('Patch Common'), group: `${group} · Common`, strip: /^Patch\s+/ },
    { id: `${id}.mfx`, table: 'Patch Common MFX', path: at('Patch Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.chorus`, table: 'Patch Common Chorus', path: at('Patch Common Chorus'), group: `${group} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: 'Patch Common Reverb', path: at('Patch Common Reverb'), group: `${group} · Reverb`, strip: REVERB },
    { id: `${id}.tmt`, table: 'Patch TMT (Tone Mix Table)', path: at('Patch TMT (Tone Mix Table)'), group: `${group} · Tone Mix Table`, strip: /^TMT\s+/ },
    ...[1, 2, 3, 4].map((n) => ({
      id: `${id}.tone${n}`, table: 'Patch Tone', path: at(`Patch Tone (Tone ${n})`), group: `${group} · Tone ${n}`, strip: /^Tone\s+/,
    })),
    // Name, memo, category, legato and bend, the effect switches: the patch's name lives here, not in
    // Patch Common, whose first twelve bytes are printed "(reserve)".
    { id: `${id}.common2`, table: 'Patch Common 2', path: at('Patch Common 2'), group: `${group} · Common 2`, strip: /^Patch\s+/ },
    // "Patch Tone 2": each tone's output assign (PFX/DRY) and its 64-step LFO.
    ...[1, 2, 3, 4].map((n) => ({
      id: `${id}.tone${n}.step`, table: 'Patch Tone 2', path: at(`Patch Tone 2 (Tone ${n})`), group: `${group} · Tone ${n} · Output & Step LFO`, strip: /^(?:Tone|LFO)\s+/,
    })),
    // Patch Controller (00 60 00) is printed as twenty "(reserve)" rows and is not laid out.
  ];
}

function sampleSet(part) {
  const at = (entry) => [PART_ROOT(part), 'Temporary Sample Set', entry];
  const id = `part${part}.sampleSet`;
  const group = `Studio Part ${part} Sample Set`;
  return [
    { id, table: 'Sample Set Common', path: at('Sample Set Common'), group: `${group} · Common`, strip: /^Sample Set\s+/ },
    { id: `${id}.mfx`, table: 'Sample Set Common MFX', path: at('Sample Set Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.chorus`, table: 'Sample Set Common Chorus', path: at('Sample Set Common Chorus'), group: `${group} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: 'Sample Set Common Reverb', path: at('Sample Set Common Reverb'), group: `${group} · Reverb`, strip: REVERB },
    ...PARTS_16.map((n) => ({
      id: `${id}.tone${n}`, table: 'Sample Set Tone', path: at(`Sample Set Tone (Tone # ${n})`), group: `${group} · Tone ${n}`, strip: /^Tone\s+/,
    })),
  ];
}

function rhythm(part) {
  const at = (entry) => [PART_ROOT(part), 'Temporary Rhythm', entry];
  const id = `part${part}.rhythm`;
  const group = `Studio Part ${part} Rhythm`;
  return [
    { id, table: 'Rhythm Common', path: at('Rhythm Common'), group: `${group} · Common`, strip: /^Rhythm\s+/ },
    { id: `${id}.mfx`, table: 'Rhythm Common MFX', path: at('Rhythm Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.chorus`, table: 'Rhythm Common Chorus', path: at('Rhythm Common Chorus'), group: `${group} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: 'Rhythm Common Reverb', path: at('Rhythm Common Reverb'), group: `${group} · Reverb`, strip: REVERB },
    // Name, memo and the effect switches: Rhythm Common's first twelve bytes are "(reserve)".
    { id: `${id}.common2`, table: 'Rhythm Common 2', path: at('Rhythm Common 2'), group: `${group} · Common 2`, strip: /^Rhythm\s+/ },
    ...RHYTHM_KEYS.map((key) => ({
      id: `${id}.key${key}`, table: 'Rhythm Tone', path: at(`Rhythm Tone (Key # ${key})`), group: `${group} · Key ${key} (${noteName(key)})`, strip: /^Tone\s+/,
    })),
    // "Rhythm Tone 2": one live row per key, Tone Output Assign (PFX/DRY); the other seven are reserve.
    ...RHYTHM_KEYS.map((key) => ({
      id: `${id}.key${key}.output`, table: 'Rhythm Tone 2', path: at(`Rhythm Tone 2 (Key # ${key})`), group: `${group} · Key ${key} (${noteName(key)}) · Output`, strip: /^Tone Output\s+/,
    })),
    // Rhythm Controller (03 60 00) is printed as twenty "(reserve)" rows and is not laid out.
  ];
}

/* -------------------------------------------------------------- the profile */

export default {
  id: 'roland-fantom-g',
  name: 'Roland Fantom-G6/G7/G8',
  family: 'FANTOM',
  map: 'fantom-g',
  deviceId: 0x10,
  description: 'Roland Fantom-G6, Fantom-G7 and Fantom-G8 workstations (one sound engine, one address map): the setup and '
    + 'system blocks, the temporary Studio Set (common, insert MFX, chorus, reverb, mastering, input FX, and every internal, '
    + 'ARX-expansion and external part) and the temporary Live Set likewise, both modes\' arpeggio and chord memory, and '
    + 'Studio Mode Part 1\'s temporary patch, sample set and rhythm set, from the MIDI Implementation.',

  // p9, Identity Reply: F0 7E dev 06 02 41 27 02 00 00 rr 03 00 00 F7, where rr is the model (00
  // Fantom-G6, 01 Fantom-G7, 02 Fantom-G8). Each of the three messages and its byte table agree: family
  // code 27 02, family number 00 00 for all three, so the one profile answers to each of them.
  identity: { familyCode: ['27', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'system.mfx', table: 'System Insert MFX', path: ['System', 'System Insert MFX'], group: 'System · Insert MFX', strip: MFX, system: true },
    { id: 'system.mastering', table: 'System Mastering', path: ['System', 'System Mastering'], group: 'System · Mastering', system: true },
    { id: 'system.inputFx', table: 'System Input FX', path: ['System', 'System Input FX'], group: 'System · Input FX', strip: /^Input Effect\s+/, system: true },
    { id: 'system.controller', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    ...setBlocks({
      word: 'Studio Set', root: 'Temporary Studio Set', id: 'studioSet', partId: 'part', expId: (slot) => `exp${slot}`, extId: 'ext', parts: PARTS_16, studio: true,
    }),
    ...arpeggioAndChord('studioSet', 'Studio Mode', 'Studio Set'),

    ...setBlocks({
      word: 'Live Set', root: 'Temporary Live Set', id: 'liveSet', partId: 'liveSet.part', expId: (slot) => `liveSet.exp${slot}`, extId: 'liveSet.ext', parts: LIVE_PARTS, studio: false,
    }),
    ...arpeggioAndChord('liveSet', 'Live Mode', 'Live Set'),

    { id: 'arpeggioSet', table: 'Arpeggio Set', path: ['Temporary Arpeggio Set', 'Arpeggio Set'], group: 'Arpeggio Set', strip: /^Arpeggio Set\s+/ },
    { id: 'chordSet', table: 'Chord Set', path: ['Temporary Chord Set', 'Chord Set'], group: 'Chord Set', strip: /^Chord Set\s+/ },

    ...patch(TONE_PART),
    ...sampleSet(TONE_PART),
    ...rhythm(TONE_PART),
  ],

  // The manual's one worked SysEx message (p45, "Example of an Exclusive Message and Calculating a
  // Checksum"): Chorus Type of the Live Set set to DELAY (02), at Temporary Live Set 10 00 00 00 +
  // Chorus 06 00 + 00 00. Its byte diagram prints the model id as "00 0027" — three bytes, 00 00 27,
  // as the DT1/RQ1 byte tables (p6, p10) and the address map's heading (p14) give it — and the line
  // below it, "This means that F0 41 10 00 27 12 10 00 06 00 02 68 F7", drops one 00. The bytes here
  // are the diagram's, with the checksum (68) the page works out beneath it; see notes.
  examples: [
    {
      name: 'Setting CHORUS TYPE of LIVE SET to DELAY (DT1)',
      where: 'p45',
      parameter: 'liveSet.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 27 12 10 00 06 00 02 68 F7',
    },
  ],

  // p1, the Bank Select table. Studio Sets: User 085/000 (001-128), Preset 085/064 (001-008). Live
  // Sets: User 084/000-003 (001-512), Preset 084/064 (001-128), and then the table goes on with ":"
  // and does not say how many more preset LSBs there are, so only the printed one is here. Patches
  // (087), rhythm sets (086) and GM (000-063, 120, 121) are selected per part, not by a set browser;
  // the note on p1 names Sample Sets too, but the table gives them no row.
  presets: {
    banks: [
      { id: 'user-studio', label: 'User Studio Set 001-128', role: 'user', writable: true, startSlot: 0, slotCount: 128, programBase: 0, bankMsb: 85, bankLsb: 0 },
      { id: 'preset-studio', label: 'Preset Studio Set 001-008', role: 'factory', writable: false, startSlot: 128, slotCount: 8, programBase: 0, bankMsb: 85, bankLsb: 64 },
      ...[0, 1, 2, 3].map((lsb) => ({
        id: `user-live-${lsb + 1}`,
        label: `User Live Set ${String(lsb * 128 + 1).padStart(3, '0')}-${String(lsb * 128 + 128).padStart(3, '0')}`,
        role: 'user',
        writable: true,
        startSlot: 136 + lsb * 128,
        slotCount: 128,
        programBase: 0,
        bankMsb: 84,
        bankLsb: lsb,
      })),
      { id: 'preset-live', label: 'Preset Live Set 001-128', role: 'factory', writable: false, startSlot: 648, slotCount: 128, programBase: 0, bankMsb: 84, bankLsb: 64 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    parts: 'the Studio Set\'s 16 parts and the Live Set\'s 8, with every ARX-expansion part (Exp1/Exp2, 16 each) and external part '
      + '(16) of both; the temporary sound of Studio Mode Part 1 only, in all three kinds (patch, sample set, rhythm set). '
      + 'Studio Mode Parts 2-16 are at 19 00 00 00 + (n-1) x 00 20 00 00 (19 20 00 00, 19 40 00 00, … 1C 60 00 00) and Live Mode '
      + 'Parts 1-8 at 11 00 00 00 + (n-1) x 00 20 00 00 (11 00 00 00 … 12 60 00 00), each with a patch at +00 00 00, a sample set at '
      + '+08 00 00 and a rhythm set at +10 00 00; they are not laid out',
    rhythmKeys: `Studio Mode Part 1's rhythm set for keys ${RHYTHM_KEYS[0]}-${RHYTHM_KEYS.at(-1)} only (Rhythm Tone and Rhythm Tone 2). `
      + 'The map has keys 21-108: Rhythm Tone (Key # k) is at 19 10 10 00 + (k-21) x 00 02 00 and Rhythm Tone 2 (Key # k) at '
      + '19 12 10 00 + (k-21) x 00 02 00, so keys 21-34 are at 19 10 10 00-19 10 2A 00 / 19 12 10 00-19 12 2A 00 and keys 60-108 at '
      + '19 10 5E 00-19 11 3E 00 / 19 12 5E 00-19 13 3E 00; all eighty-eight would be 12,848 parameters',
    toneTypes: 'a part plays a patch, a sample set or a rhythm set; the blocks of all three are laid out at their addresses, and the manual '
      + 'says (p6) that a request it cannot answer gets no reply, so none of them is read at startup (noPull); each is read when asked for',
    reserveOnlyBlocks: 'Patch Controller (+00 60 00) and Rhythm Controller (+03 60 00) are printed entirely as "(reserve)" and are not laid out',
    effectParameterMeanings: 'type-dependent: MFX, chorus, reverb and input-effect parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    arx: 'the ARX expansion boards\' own sound parameters are not in this manual (p1 refers to the ARX owner\'s manuals); only the '
      + 'Exp1/Exp2 common and part mixing blocks of each set are laid out',
    presets: 'Studio Set banks (MSB 85) and Live Set banks (MSB 84) as printed on p1; the Preset Live Set rows after LSB 064 are elided with ":" '
      + 'and are not listed. They are recalled on the profile\'s channel, which must be the Studio Set Control Channel (System Common 00 0B) '
      + 'for a studio set and the Live Set Control Channel (00 0A) for a live set',
    inboundControllers: 'not modelled: what the front panel transmits (Control Change, pp7-8) is not in the address map',
  },
  notes: [
    'One profile for the Fantom-G6, G7 and G8: the Identity Reply (p9) is the same family 27 02 / 00 00 for all three, and only the first '
      + 'software-revision byte says which (00 G6, 01 G7, 02 G8).',
    'The manual prints no version or date on its first page. Its MIDI Implementation Charts (p46, p47) say Version 1.00, Feb. 1, 2008; '
      + 'every page\'s FrameMaker running head is stamped 8 May 2008.',
    'Model id 00 00 27, as the address map\'s heading (p14), the DT1 and RQ1 byte tables (p6, p10) and the worked example\'s byte diagram (p45) '
      + 'give it. The prose on p6 ("The model ID of the exclusive messages used by this instrument is 00H 27H"), the RQ1/DT1 status lines on p6 and '
      + 'p10 ("41H, dev, 00H, 27H, 12H") and the example\'s closing line on p45 ("F0 41 10 00 27 12 10 00 06 00 02 68 F7") print two bytes, 00 27, '
      + 'which is the Fantom-X\'s pattern (00 6B). The checksum (68) is the same either way, since it covers only the address and the data.',
    'The worked example on p45 is introduced as "CHORUS TYPE of LIVE SET" and then calls the address that of "CHORUS TYPE of PERFORMANCE COMMON", '
      + 'an older manual\'s words; the address, 10 00 06 00, is the Live Set\'s.',
    `Studio Mode Part 1's rhythm set: keys ${RHYTHM_KEYS[0]} (${noteName(RHYTHM_KEYS[0])}) to ${RHYTHM_KEYS.at(-1)} (${noteName(RHYTHM_KEYS.at(-1))}) are laid out, `
      + `${RHYTHM_KEYS.length} of the 88, to keep the profile near 12,000 parameters; keys ${RHYTHM_KEYS_LEFT_OUT[0]}-${RHYTHM_KEYS[0] - 1} and `
      + `${RHYTHM_KEYS.at(-1) + 1}-${RHYTHM_KEYS_LEFT_OUT.at(-1)} are the same two blocks again, two apart (00 02 00), from 19 10 10 00 and 19 12 10 00.`,
    'Not laid out: the temporary sounds of Studio Mode Parts 2-16 (19 20 00 00 … 1C 60 00 00) and of Live Mode Parts 1-8 (11 00 00 00 … 12 60 00 00), '
      + 'each a patch (+00 00 00), sample set (+08 00 00) and rhythm set (+10 00 00) like Part 1\'s.',
    'Exp n Part m is part m of the ARX expansion board in slot n (its own sixteen parts), not internal Part m; the Exp n Common blocks are that board\'s '
      + 'level, pan, sends and output in the set.',
    'The Live Set has eight internal parts (Live Set Part, 00 20 00 - 00 27 00, p14) but sixteen MIDI channels, sixteen parts per ARX slot and sixteen '
      + 'external parts; its insert MFX, mastering and input FX are the System\'s (02 00 02 00, 02 00 0E 00, 02 00 0F 00).',
    'Studio Set Controller 00 25 is printed "Arpeggio Swich" (p27; the Live Set Controller prints "Arpeggio Switch"), so its id is studioSet.controller.arpeggioSwich.',
    'Rhythm Common Reverb\'s Reverb Output Assign is printed (0 - 3) with the labels A, B (p38); the other four Reverb Output Assign rows print (0 - 1). '
      + 'It is kept as the manual prints it, a number 0-3.',
    'p14 says "<*>" marked rows are ignored "when the Fantom-G6/X7/X8 received them": X7 and X8 are the Fantom-X\'s model names. The "<*>" (reserve) rows are not laid out.',
  ],

  // Read on request, not at connect. Part 1 holds a patch, a sample set or a rhythm set; the instrument does not answer for the two it is not playing (p6), and the startup read stops at the first request that is not answered.
  noPull: [/^part1\.(patch|sampleSet|rhythm)(\.|$)/],
};
