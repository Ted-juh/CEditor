// The edit-buffer layout shared by the JUNO-G (2006), the SonicCell (2007) and the JUNO-STAGE (2008).
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so what the three
// have in common lives here, and synths/juno-g.mjs, soniccell.mjs and juno-stage.mjs say what is
// theirs — which system blocks exist, whether the performance has zones and the arpeggio area, the
// Patch-mode root, the identity reply, the bank table and the manual.
//
// All three print the Fantom-X's address map — the same tables at the same offsets, with a few rows
// and blocks changed — each in the MIDI Implementation chapter of its owner's manual, under a model
// ID of its own: the JUNO-G 00 00 15, the JUNO-STAGE and the SonicCell both 00 00 25. Its temporary
// (edit-buffer) area is:
//
//   10 00 00 00  Temporary Performance — common, MFX 1-3, chorus, reverb; a MIDI block per channel
//                and a Part block per part, 1 to 16; (JUNO-G, JUNO-STAGE) a Zone block per channel;
//                a controller block
//   11 00 00 00  Temporary Patch/Rhythm (Performance Mode Part 1) … 14 60 00 00 (Part 16)
//   1E 00 00 00  Temporary Rhythm Pattern                  (JUNO-G, JUNO-STAGE)
//   1E 01 00 00  Temporary Arpeggio (Performance Mode)     1E 11 00 00  … (Patch Mode)
//   1E 02 00 00  Temporary Chord (Performance Mode)        1E 12 00 00  … (Patch Mode)
//   1E 03 00 00  Temporary Rhythm Group (Performance Mode) 1E 13 00 00  … (Patch Mode)
//   1F 00 00 00  Temporary Patch/Rhythm (Patch Mode Part 1) and 1F 20 00 00 (Part 2): the JUNO-G's
//                and JUNO-STAGE's keyboard part ("Kbd Patch") and rhythm-pattern part ("Rhy Patch")
//   1F 00 00 00  Temporary Patch/Rhythm (Patch Mode)       the SonicCell's one Patch-mode part
//
// and each Patch/Rhythm holds a patch at +00 00 00 (common, MFX, chorus, reverb, TMT, four tones)
// and a rhythm set at +10 00 00 (common, MFX, chorus, reverb, one tone per key from 21 to 108).
//
// What is laid out, and why not the rest:
//
//   - Setup and System (system blocks), the whole Temporary Performance, and (JUNO-G, JUNO-STAGE)
//     both modes' temporary arpeggio (its common and sixteen pattern notes), chord pattern and
//     rhythm group.
//   - The Patch-mode part, both of the tone types it can hold: the patch, whole, and the rhythm set —
//     its common blocks and some of its 88 keys. One Rhythm Tone is 148 parameters (its 12-byte name
//     counted as one); all 88 would be 13,024 on their own. With the arpeggio area (1,362
//     parameters on the JUNO-G, 1,422 on the JUNO-STAGE) the two take the General MIDI percussion
//     keys, 35-81; the SonicCell, which has no arpeggio area, takes General MIDI 2's, 27-88.
//   - Not the sixteen Performance Mode parts' own patches and rhythm sets, nor Patch Mode Part 2's,
//     nor the Temporary Rhythm Pattern. coverage and notes say where each is.

import { addAddress } from '../build-profile.mjs';
import { banks, noteName } from './juno-ds-family.mjs';

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const PARTS = range(1, 16);
const NOTES = range(1, 16);

/** General MIDI's percussion map: 35 (B1, Acoustic Bass Drum) to 81 (A5, Open Triangle). */
export const GM_KEYS = range(35, 81);
/** General MIDI 2's: 27 (D#1, High Q) to 88 (E6, Applause). */
export const GM2_KEYS = range(27, 88);

// `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the MIDI messages, as (CC# n) does elsewhere.
const PART_STRIP = /^Part\s+|\s*\(MONO ON\/POLY ON\)/g;
const MFX = /^MFX\s+/;

const PERFORMANCE = 'Temporary Performance';

/** The chorus and reverb a performance, a patch or a rhythm set carries, under `prefix` ("Patch Common"). */
const chorusReverb = (id, prefix, path, label) => [
  { id: `${id}.chorus`, table: `${prefix} Chorus`, path: [...path, `${prefix} Chorus`], group: `${label} · Chorus`, strip: /^Chorus\s+/ },
  { id: `${id}.reverb`, table: `${prefix} Reverb`, path: [...path, `${prefix} Reverb`], group: `${label} · Reverb`, strip: /^Reverb\s+/ },
];

/**
 * Setup and System. Every one of the three has System Common; the rest varies:
 *   mastering, externalInput   System Mastering (00 02 00), System External Input (00 03 00): JUNO-G, SonicCell
 *   controller                 System Controller (00 40 00): JUNO-G, JUNO-STAGE
 */
export function systemBlocks({ mastering, externalInput, controller }) {
  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    ...(mastering ? [{ id: 'system.mastering', table: 'System Mastering', path: ['System', 'System Mastering'], group: 'System · Mastering', strip: /^Mastering\s+/, system: true }] : []),
    // External Input: the input's sends and output, and the Input Effect on it.
    ...(externalInput ? [{ id: 'system.externalInput', table: 'System External Input', path: ['System', 'System External Input'], group: 'System · External Input', strip: /^External\s+/, system: true }] : []),
    ...(controller ? [{ id: 'system.controller', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true }] : []),
  ];
}

/** The Temporary Performance, 10 00 00 00. `zones`: whether it has a Zone block per channel. */
export function performanceBlocks({ zones }) {
  return [
    { id: 'performance', table: 'Performance Common', path: [PERFORMANCE, 'Performance Common'], group: 'Performance · Common', strip: /^Performance\s+/ },
    // The offset table names MFX1-3 (00 02 00, 00 08 00, 00 0A 00); the one table under them is "Performance Common MFX".
    ...[1, 2, 3].map((n) => ({
      id: `performance.mfx${n}`, table: 'Performance Common MFX', path: [PERFORMANCE, `Performance Common MFX${n}`], group: `Performance · MFX ${n}`, strip: MFX,
    })),
    ...chorusReverb('performance', 'Performance Common', [PERFORMANCE], 'Performance'),
    ...PARTS.map((n) => ({
      id: `performance.part${n}`, table: 'Performance Part', path: [PERFORMANCE, `Performance Part (Part ${n})`], group: `Performance · Part ${n}`, strip: PART_STRIP,
    })),
    ...PARTS.map((n) => ({
      id: `performance.midi${n}`, table: 'Performance MIDI', path: [PERFORMANCE, `Performance MIDI (Channel ${n})`], group: `Performance · MIDI Ch ${n}`,
    })),
    ...(zones ? PARTS.map((n) => ({
      id: `performance.zone${n}`, table: 'Performance Zone', path: [PERFORMANCE, `Performance Zone (Channel ${n})`], group: `Performance · Zone ${n}`, strip: /^Zone\s+/,
    })) : []),
    { id: 'performance.controller', table: 'Performance Controller', path: [PERFORMANCE, 'Performance Controller'], group: 'Performance · Controller' },
  ];
}

/** One mode's temporary arpeggio, chord pattern and rhythm group (1E 01-03 00 00, 1E 11-13 00 00). */
function modeBlocks(id, mode, label) {
  return [
    { id: `${id}.arpeggio`, table: 'Arpeggio Common', path: [`Temporary Arpeggio (${mode})`, 'Arpeggio Common'], group: `${label} · Arpeggio`, strip: /^Arpeggio\s+/ },
    // Each pattern note: the note it plays (Original Note) and its 32 steps.
    ...NOTES.map((n) => ({
      id: `${id}.arpeggio.note${n}`,
      table: 'Arpeggio Pattern',
      path: [`Temporary Arpeggio (${mode})`, `Arpeggio Pattern (Note ${n})`],
      group: `${label} · Arpeggio · Note ${n}`,
    })),
    // 128 note switches (Chord Note1 … 128) and the form's name.
    { id: `${id}.chord`, table: 'Chord Pattern', path: [`Temporary Chord (${mode})`, 'Chord Pattern'], group: `${label} · Chord Pattern`, strip: /^Chord(?: Pattern)?\s+/ },
    { id: `${id}.rhythmGroup`, table: 'Rhythm Group', path: [`Temporary Rhythm Group (${mode})`, 'Rhythm Group'], group: `${label} · Rhythm Group`, strip: /^Rhythm Group\s+/ },
  ];
}

/** Both modes' arpeggio, chord and rhythm group: the JUNO-G's and JUNO-STAGE's, not the SonicCell's. */
export const arpeggioBlocks = () => [
  ...modeBlocks('performance', 'Performance Mode', 'Performance'),
  ...modeBlocks('patchMode', 'Patch Mode', 'Patch Mode'),
];

/**
 * The Patch-mode part's patch and rhythm set.
 *   root    the top-level entry ('Temporary Patch/Rhythm (Patch Mode Part 1)', '… (Patch Mode)')
 *   label   what the groups call that part ('Patch Mode Part 1', 'Patch Mode')
 *   keys    the rhythm-set keys laid out
 */
export function patchModeBlocks({ root, label, keys }) {
  const patch = [root, 'Temporary Patch'];
  const rhythm = [root, 'Temporary Rhythm'];
  const patchGroup = `${label} · Patch`;
  const rhythmGroup = `${label} · Rhythm Set`;
  return [
    { id: 'patch', table: 'Patch Common', path: [...patch, 'Patch Common'], group: `${patchGroup} · Common`, strip: /^Patch\s+/ },
    { id: 'patch.mfx', table: 'Patch Common MFX', path: [...patch, 'Patch Common MFX'], group: `${patchGroup} · MFX`, strip: MFX },
    ...chorusReverb('patch', 'Patch Common', patch, patchGroup),
    { id: 'patch.tmt', table: 'Patch TMT (Tone Mix Table)', path: [...patch, 'Patch TMT (Tone Mix Table)'], group: `${patchGroup} · Tone Mix Table`, strip: /^TMT\s+/ },
    ...[1, 2, 3, 4].map((n) => ({
      id: `patch.tone${n}`, table: 'Patch Tone', path: [...patch, `Patch Tone (Tone ${n})`], group: `${patchGroup} · Tone ${n}`, strip: /^Tone\s+/,
    })),

    { id: 'rhythm', table: 'Rhythm Common', path: [...rhythm, 'Rhythm Common'], group: `${rhythmGroup} · Common`, strip: /^Rhythm\s+/ },
    { id: 'rhythm.mfx', table: 'Rhythm Common MFX', path: [...rhythm, 'Rhythm Common MFX'], group: `${rhythmGroup} · MFX`, strip: MFX },
    ...chorusReverb('rhythm', 'Rhythm Common', rhythm, rhythmGroup),
    ...keys.map((key) => ({
      id: `rhythm.key${key}`,
      table: 'Rhythm Tone',
      path: [...rhythm, `Rhythm Tone (Key # ${key})`],
      group: `${rhythmGroup} · Key ${key} (${noteName(key)})`,
      strip: /^Tone\s+/,
    })),
  ];
}

/** Read on request, not at connect: the Patch-mode part holds a patch or a rhythm set, not both. */
export const NO_PULL = [/^(patch|rhythm)(\.|$)/];

/**
 * The Patches (MSB 87) and Rhythm Sets (MSB 86) a Patch-mode part holds. Each manual's Bank Select
 * table elides the preset patch banks after "Preset Patch B" (LSB 65) with ":"; the count of them is
 * the owner's manual's own (its correspondence chart or patch list, and its specifications).
 *   card            whether the instrument has PC-card banks (the JUNO-G: LSB 32-33 and 32)
 *   presetPatches   { banks, last }: how many preset patch banks (PR-A, PR-B, … at LSB 64, 65, …), and
 *                   how many patches the last of them holds (the others hold 128)
 *   presetRhythms   the preset rhythm sets at 86/64
 */
export function presetBanks({ card, presetPatches, presetRhythms }) {
  const letter = (i) => String.fromCharCode(65 + i);
  const pad = (n) => String(n).padStart(3, '0');
  const preset = range(0, presetPatches.banks - 1).map((i) => {
    const count = i === presetPatches.banks - 1 ? presetPatches.last : 128;
    return [`preset-patch-${letter(i).toLowerCase()}`, `Preset Patch ${letter(i)} (PR-${letter(i)}) 001-${pad(count)}`, 'factory', 87, 64 + i, count];
  });
  return {
    banks: banks([
      ['user-patch-1', 'User Patch 001-128', 'user', 87, 0, 128],
      ['user-patch-2', 'User Patch 129-256', 'user', 87, 1, 128],
      ...(card ? [['card-patch-1', 'Card Patch 001-128', 'user', 87, 32, 128], ['card-patch-2', 'Card Patch 129-256', 'user', 87, 33, 128]] : []),
      ...preset,
      ['user-rhythm', 'User Rhythm 001-032', 'user', 86, 0, 32],
      ...(card ? [['card-rhythm', 'Card Rhythm 001-032', 'user', 86, 32, 32]] : []),
      ['preset-rhythm', `Preset Rhythm 001-${pad(presetRhythms)}`, 'factory', 86, 64, presetRhythms],
    ]),
    recall: { kind: 'bankPc' },
  };
}

/** The one DT1 parameter write each manual prints, word for word the same in all three but for the model ID. */
export const chorusTypeExample = (where, modelId) => ({
  name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
  where,
  parameter: 'performance.chorus.type',
  value: 2,
  expectedHex: `F0 41 10 ${modelId} 12 10 00 04 00 02 6A F7`,
});

/** Where Rhythm Tone (Key # key) of the rhythm set at `rhythmBase` is: + 00 10 00 + (key - 21) x 00 02 00. */
export const keyAddress = (rhythmBase, key) => addAddress(rhythmBase, '00 10 00', ...Array(key - 21).fill('00 02 00'));

/** The rhythm keys left out, as text with their addresses. */
export function keysLeftOut(rhythmBase, keys) {
  const low = keys[0] > 21 ? [`21-${keys[0] - 1} (${keyAddress(rhythmBase, 21)} to ${keyAddress(rhythmBase, keys[0] - 1)})`] : [];
  const high = keys.at(-1) < 108 ? [`${keys.at(-1) + 1}-108 (${keyAddress(rhythmBase, keys.at(-1) + 1)} to ${keyAddress(rhythmBase, 108)})`] : [];
  return [...low, ...high].join(' and ');
}

/** The temporary area the profiles leave out, in words, with its addresses: shared by all three. */
export function leftOutNotes({ patchBase, rhythmBase, keys, keysWhy }) {
  return [
    `The Patch-mode part's patch is at ${patchBase} and its rhythm set at ${rhythmBase}, the key blocks from ${keyAddress(rhythmBase, 21)} (key 21) `
      + `00 02 00 apart. Rhythm set keys ${keys[0]} (${noteName(keys[0])}) to ${keys.at(-1)} (${noteName(keys.at(-1))}) are laid out, ${keysWhy}: `
      + `${keys.length} of the 88. Keys ${keysLeftOut(rhythmBase, keys)} are not, to keep the profile under 12,000 parameters; each is one more `
      + 'Rhythm Tone block of 148 parameters.',
    'Not laid out: the sixteen Performance Mode parts\' own patches and rhythm sets, at 11 00 00 00, 11 20 00 00, … 14 60 00 00 '
      + '(part n at 11 00 00 00 + (n-1) × 00 20 00 00, a patch at +00 00 00 and a rhythm set at +10 00 00). Each is the Patch-mode blocks again.',
  ];
}
