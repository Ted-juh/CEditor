// The edit-buffer layout shared by the Fantom-X6/X7/X8 (2004) and the Fantom-XR, its rack module.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so what the two
// have in common lives here, and synths/fantom-x.mjs and synths/fantom-xr.mjs say what is theirs —
// the Patch-mode root, which blocks exist, the identity reply, the bank table and the manual.
//
// Both answer to model ID 00 6B and print one address map with a few rows changed. Its temporary
// (edit-buffer) area is:
//
//   10 00 00 00  Temporary Performance — common, MFX 1-3, chorus, reverb; a MIDI block per channel
//                and a Part block per part, 1 to 16; (Fantom-X only) a Zone block per channel;
//                a controller block
//   11 00 00 00  Temporary Patch/Rhythm (Performance Mode Part 1) … 14 60 00 00 (Part 16)
//   1E 00 00 00  Temporary Rhythm Pattern                  (no table under it in the map)
//   1E 01 00 00  Temporary Arpeggio (Performance Mode)     1E 11 00 00  … (Patch Mode)
//   1E 02 00 00  Temporary Chord (Performance Mode)        1E 12 00 00  … (Patch Mode)
//   1E 03 00 00  Temporary Rhythm Group (Performance Mode) 1E 13 00 00  … (Patch Mode)
//   1F 00 00 00  Temporary Patch/Rhythm (Patch Mode)       the Fantom-XR's one Patch-mode part
//   1F 00 00 00  Temporary Patch/Rhythm (Patch Mode Part 1) and 1F 20 00 00 (Part 2): the
//                Fantom-X's keyboard part and pad part
//
// and each Patch/Rhythm holds a patch at +00 00 00 (common, MFX, chorus, reverb, TMT, four tones)
// and a rhythm set at +10 00 00 (common, MFX, chorus, reverb, one tone per key from 21 to 108).
// Sample-based patches are patches like any other here: a tone's Wave Group Type picks INT, SRX,
// SAMPLE or MULTISAMPLE, and the samples themselves are user memory, not edit buffer.
//
// What is laid out, and why not the rest:
//
//   - Setup and System (system blocks), the whole Temporary Performance, and both modes'
//     temporary arpeggio (its common and sixteen pattern notes), chord pattern and rhythm group.
//   - Patch mode's first part, both of the tone types it can hold: the patch, whole, and the rhythm
//     set — its common blocks and RHYTHM_KEYS of its 88 keys. One Rhythm Tone is 148 parameters (its
//     12-byte name counted as one), so all 88 keys would be 13,024 on their own.
//   - Not the sixteen Performance Mode parts' own patches and rhythm sets, nor (Fantom-X) Patch
//     Mode Part 2's: each is the Patch-mode blocks again at another base. coverage and notes say where.

import { noteName } from './juno-ds-family.mjs';

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const PARTS = range(1, 16);
const NOTES = range(1, 16);

/**
 * The rhythm-set keys laid out: 35 (B1, Acoustic Bass Drum) to 81 (A5, Open Triangle), the General
 * MIDI percussion map, which the Fantom-X's GM2 rhythm sets and its preset kits follow.
 */
export const RHYTHM_KEYS = range(35, 81);
export const RHYTHM_KEYS_LEFT_OUT = range(21, 108).filter((key) => !RHYTHM_KEYS.includes(key));

// `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the MIDI messages, as (CC# n) does elsewhere.
const PART_STRIP = /^Part\s+|\s*\(MONO ON\/POLY ON\)/g;
const MFX = /^MFX\s+/;
const CHORUS = /^Chorus\s+/;
const REVERB = /^Reverb\s+/;

const PERFORMANCE = 'Temporary Performance';

/** The effect blocks a patch, a rhythm set or the performance carries, under `prefix` ("Patch Common"). */
const chorusReverb = (id, prefix, path, label) => [
  { id: `${id}.chorus`, table: `${prefix} Chorus`, path: [...path, `${prefix} Chorus`], group: `${label} · Chorus`, strip: CHORUS },
  { id: `${id}.reverb`, table: `${prefix} Reverb`, path: [...path, `${prefix} Reverb`], group: `${label} · Reverb`, strip: REVERB },
];

/** A mode's temporary arpeggio, chord pattern and rhythm group (1E 01-03 00 00, 1E 11-13 00 00). */
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
    // 128 note switches (Chord Note1 … 128, C-1 to G9) and the form's name.
    { id: `${id}.chord`, table: 'Chord Pattern', path: [`Temporary Chord (${mode})`, 'Chord Pattern'], group: `${label} · Chord Pattern`, strip: /^Chord(?: Pattern)?\s+/ },
    { id: `${id}.rhythmGroup`, table: 'Rhythm Group', path: [`Temporary Rhythm Group (${mode})`, 'Rhythm Group'], group: `${label} · Rhythm Group`, strip: /^Rhythm Group\s+/ },
  ];
}

/**
 * The blocks, in the order the startup pull asks for them.
 *
 *   patchPart          the top-level entry of the Patch-mode part laid out
 *   patchLabel         what the groups call that part ('Patch Mode Part 1', 'Patch Mode')
 *   systemController   whether System has a System Controller block (Fantom-X)
 *   zones              whether the performance has a Zone block per channel (Fantom-X)
 */
export function fantomXBlocks({ patchPart, patchLabel, systemController, zones }) {
  const patch = [patchPart, 'Temporary Patch'];
  const rhythm = [patchPart, 'Temporary Rhythm'];
  const patchGroup = `${patchLabel} Patch`;
  const rhythmGroup = `${patchLabel} Rhythm Set`;

  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'system.mastering', table: 'System Mastering', path: ['System', 'System Mastering'], group: 'System · Mastering', strip: /^Mastering\s+/, system: true },
    // External Input: the input's sends and output, and the Input Effect on it.
    { id: 'system.externalInput', table: 'System External Input', path: ['System', 'System External Input'], group: 'System · External Input', strip: /^External\s+/, system: true },
    ...(systemController ? [{ id: 'system.controller', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true }] : []),

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
    ...modeBlocks('performance', 'Performance Mode', 'Performance'),

    ...modeBlocks('patchMode', 'Patch Mode', 'Patch Mode'),

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
    ...RHYTHM_KEYS.map((key) => ({
      id: `rhythm.key${key}`,
      table: 'Rhythm Tone',
      path: [...rhythm, `Rhythm Tone (Key # ${key})`],
      group: `${rhythmGroup} · Key ${key} (${noteName(key)})`,
      strip: /^Tone\s+/,
    })),
  ];
}

/** Read on request, not at connect: the patch-mode part holds a patch or a rhythm set, not both. */
export const NO_PULL = [/^(patch|rhythm)(\.|$)/];

/**
 * p298 / p245 "Bank Select" and p330 / p270 "Bank Select and Program Change Correspondence Chart":
 * Patches (MSB 87) and Rhythm Sets (MSB 86), which is what a Patch-mode part holds. The first table
 * elides Preset Patch LSB 66-71 with ":" after "Preset Patch B"; the correspondence chart prints them
 * all, PR-A to PR-H at LSB 64-71, 128 each. Card banks are the PC card's (writable when one is in).
 */
const bank = (id, label, role, bankMsb, bankLsb, slotCount) => ({ id, label, role, bankMsb, bankLsb, slotCount });
export function presetBanks({ presetRhythmCount }) {
  const rows = [
    bank('user-patch-1', 'User Patch 001-128', 'user', 87, 0, 128),
    bank('user-patch-2', 'User Patch 129-256', 'user', 87, 1, 128),
    bank('card-patch-1', 'Card Patch 001-128', 'user', 87, 32, 128),
    bank('card-patch-2', 'Card Patch 129-256', 'user', 87, 33, 128),
    ...'ABCDEFGH'.split('').map((letter, i) => bank(`preset-patch-${letter.toLowerCase()}`, `Preset Patch ${letter} (PR-${letter}) 001-128`, 'factory', 87, 64 + i, 128)),
    bank('user-rhythm', 'User Rhythm 001-032', 'user', 86, 0, 32),
    bank('card-rhythm', 'Card Rhythm 001-032', 'user', 86, 32, 32),
    bank('preset-rhythm', `Preset Rhythm 001-${String(presetRhythmCount).padStart(3, '0')}`, 'factory', 86, 64, presetRhythmCount),
  ];
  let startSlot = 0;
  return {
    banks: rows.map((row) => {
      const out = { id: row.id, label: row.label, role: row.role, writable: row.role === 'user', startSlot, slotCount: row.slotCount, programBase: 0, bankMsb: row.bankMsb, bankLsb: row.bankLsb };
      startSlot += row.slotCount;
      return out;
    }),
    recall: { kind: 'bankPc' },
  };
}

/** The manual's one DT1 parameter write (p329 Fantom-X, p269 Fantom-XR): word for word the same in both. */
export const chorusTypeExample = (where) => ({
  name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
  where,
  parameter: 'performance.chorus.type',
  value: 2,
  expectedHex: 'F0 41 10 00 6B 12 10 00 04 00 02 6A F7',
});

/** The temporary area the profiles leave out, in words, with its addresses. */
export function leftOutNotes({ patchBase, otherPatchParts = [] }) {
  const [msb, second] = patchBase.split(' ');
  const rhythmBase = `${msb} ${(parseInt(second, 16) + 0x10).toString(16).toUpperCase().padStart(2, '0')} 00 00`;
  const keyBase = (key) => {
    const offset = 0x10 * 128 + (key - 21) * 2 * 128; // 00 10 00 + (key - 21) x 00 02 00, in 7-bit digits
    const hi = Math.floor(offset / (128 * 128));
    const mid = Math.floor(offset / 128) % 128;
    const b2 = parseInt(rhythmBase.split(' ')[1], 16) + hi;
    return [msb, b2.toString(16), mid.toString(16), '00'].map((b) => b.toUpperCase().padStart(2, '0')).join(' ');
  };
  return [
    `Rhythm set keys ${RHYTHM_KEYS[0]} (${noteName(RHYTHM_KEYS[0])}) to ${RHYTHM_KEYS.at(-1)} (${noteName(RHYTHM_KEYS.at(-1))}), the General MIDI `
      + `percussion map, are laid out: ${RHYTHM_KEYS.length} of the 88. Keys 21-${RHYTHM_KEYS[0] - 1} (${keyBase(21)} to ${keyBase(RHYTHM_KEYS[0] - 1)}) `
      + `and ${RHYTHM_KEYS.at(-1) + 1}-108 (${keyBase(RHYTHM_KEYS.at(-1) + 1)} to ${keyBase(108)}) are not, to keep the profile under 12,000 parameters; `
      + 'each is one more Rhythm Tone block, 00 02 00 apart.',
    'Not laid out: the sixteen Performance Mode parts\' own patches and rhythm sets, at 11 00 00 00, 11 20 00 00, … 14 60 00 00 '
      + '(part n at 11 00 00 00 + (n-1) × 00 20 00 00, a patch at +00 00 00 and a rhythm set at +10 00 00). Each is the Patch-mode blocks again.',
    ...otherPatchParts,
    'Not laid out: the Temporary Rhythm Pattern (1E 00 00 00). The top table names it and the map prints no table for it.',
  ];
}

export { noteName };
