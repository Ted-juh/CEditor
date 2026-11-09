// The edit-buffer layout shared by the JUNO-DS61/DS88, the XPS-30 and the XPS-10.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the
// three have in common lives here, and synths/juno-ds.mjs, xps-30.mjs and xps-10.mjs say what is
// theirs — the name of each root, whether the kit is a "Drum Kit" or a "Rhythm Set", which blocks
// exist, the identity reply, the bank table and the printed example.
//
// The three answer to one model ID, 00 00 3A, and print one address map with a few words changed.
// Its temporary (edit-buffer) area is:
//
//   10 00 00 00  Temporary Performance — common, MFX 1-3, chorus, reverb; a MIDI block and a Zone
//                block per channel and a Part block per part, 1 to 16; (JUNO-DS, XPS-30) controller
//   11 00 00 00  Temporary Patch/Drum (Performance Mode Part 1) … 14 60 00 00 (Part 16)
//   1E 00 00 00  Temporary Rhythm Pattern      1E 11 00 00  Temporary Arpeggio
//   1E 13 00 00  Temporary Rhythm Group        1E 15 00 00  Temporary Vocal Effect (not XPS-10)
//   1F 00 00 00  Temporary Patch/Drum (Patch Mode Part 1)   — the patch you play in Patch mode
//   1F 20 00 00  Temporary Patch/Drum (Patch Mode Part 2)   — the rhythm patterns' kit
//
// and each Patch/Drum holds a patch at +00 00 00 (common, MFX, chorus, reverb, TMT, four tones)
// and a drum kit at +10 00 00 (common, MFX, chorus, reverb, one tone per key from 21 to 108).
// The Setup table says which part is which: "Kbd Patch" (part 1) and "Rhy Patch" (part 2).
//
// What is laid out, and why not the rest:
//
//   - Setup and System (system blocks), the whole Temporary Performance, the Rhythm Group and the
//     Vocal Effect: every block of them.
//   - Patch Mode Part 1, both of the tone types it can hold: the patch, whole, and the drum kit —
//     its common blocks and KIT_KEYS of its 88 keys. One full kit is 88 × 140 = 12,320 parameters,
//     more than a profile should carry on its own; 27 to 96 is 70 keys: from the lowest key a GM2
//     drum kit assigns (27, High Q) to the top of a 61-key keyboard at octave 0 (96, C7).
//   - Not the sixteen Performance Mode parts' own patches and kits (each another patch and kit,
//     tens of thousands of parameters together), Patch Mode Part 2's patch and kit, or the
//     Temporary Rhythm Pattern and Temporary Arpeggio. The last two are 1,060 parameters between
//     them, mostly bare step values, and the map gives neither a layout of its own: its one
//     "Arpeggio (Rhythm Pattern)" offset table implies both use it, but does not say so.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const PARTS = range(1, 16);

/** The drum-kit keys laid out: GM2's lowest drum key (27) to a 61-key keyboard's top C (96). */
export const KIT_KEYS = range(27, 96);

/** The keys of the 88 (21-108) that KIT_KEYS leaves out, for the notes. */
export const KIT_KEYS_LEFT_OUT = range(21, 108).filter((key) => !KIT_KEYS.includes(key));

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Roland's octave numbering: middle C, note 60, is C4. */
export const noteName = (key) => `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

// `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the MIDI messages, as (CC# n) does elsewhere.
const PART_STRIP = /^Part\s+|\s*\(MONO ON\/POLY ON\)/g;

/**
 * The blocks, in the order the startup pull asks for them.
 *
 *   performance  the top-level entry of the Temporary Performance
 *   patchPart    the top-level entry of Patch Mode Part 1
 *   kit          { id, word, temporary, label }: the drum kit as this manual names it —
 *                'Drum' / 'Temporary Drum' / 'Drum Kit', or 'Rhythm' / 'Temporary Rhythm' / 'Rhythm Set'
 *   controller   whether the performance has a Performance Controller block
 *   vocalEffect  whether the instrument has a Vocal Effect
 */
export function familyBlocks({ performance, patchPart, kit, controller, vocalEffect }) {
  const effects = (id, prefix, path, label) => [
    { id: `${id}.chorus`, table: `${prefix} Chorus`, path: [...path, `${prefix} Chorus`], group: `${label} · Chorus`, strip: /^Chorus\s+/ },
    { id: `${id}.reverb`, table: `${prefix} Reverb`, path: [...path, `${prefix} Reverb`], group: `${label} · Reverb`, strip: /^Reverb\s+/ },
  ];
  const patch = [patchPart, 'Temporary Patch'];
  const drum = [patchPart, kit.temporary];

  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    { id: 'performance', table: 'Performance Common', path: [performance, 'Performance Common'], group: 'Performance · Common' },
    ...[1, 2, 3].map((n) => ({
      id: `performance.mfx${n}`, table: 'Performance Common MFX', path: [performance, `Performance Common MFX${n}`], group: `Performance · MFX ${n}`, strip: /^MFX\s+/,
    })),
    ...effects('performance', 'Performance Common', [performance], 'Performance'),
    ...PARTS.map((n) => ({
      id: `performance.part${n}`, table: 'Performance Part', path: [performance, `Performance Part (Part ${n})`], group: `Performance · Part ${n}`, strip: PART_STRIP,
    })),
    ...PARTS.map((n) => ({
      id: `performance.midi${n}`, table: 'Performance MIDI', path: [performance, `Performance MIDI (Channel ${n})`], group: `Performance · MIDI Ch ${n}`,
    })),
    ...PARTS.map((n) => ({
      id: `performance.zone${n}`, table: 'Performance Zone', path: [performance, `Performance Zone (Channel ${n})`], group: `Performance · Zone ${n}`, strip: /^Zone\s+/,
    })),
    ...(controller ? [{ id: 'performance.controller', table: 'Performance Controller', path: [performance, 'Performance Controller'], group: 'Performance · Controller' }] : []),

    { id: 'rhythmGroup', table: 'Rhythm Group', path: ['Temporary Rhythm Group', 'Rhythm Group'], group: 'Rhythm Group' },
    ...(vocalEffect ? [{ id: 'vocalEffect', table: 'Vocal Effect', path: ['Temporary Vocal Effect', 'Vocal Effect'], group: 'Vocal Effect', strip: /^Vocal Effect\s+/ }] : []),

    { id: 'patch', table: 'Patch Common', path: [...patch, 'Patch Common'], group: 'Patch · Common', strip: /^Patch\s+/ },
    { id: 'patch.mfx', table: 'Patch Common MFX', path: [...patch, 'Patch Common MFX'], group: 'Patch · MFX', strip: /^MFX\s+/ },
    ...effects('patch', 'Patch Common', patch, 'Patch'),
    { id: 'patch.tmt', table: 'Patch TMT (Tone Mix Table)', path: [...patch, 'Patch TMT (Tone Mix Table)'], group: 'Patch · Tone Mix Table', strip: /^TMT\s+/ },
    ...[1, 2, 3, 4].map((n) => ({
      id: `patch.tone${n}`, table: 'Patch Tone', path: [...patch, `Patch Tone (Tone ${n})`], group: `Patch · Tone ${n}`, strip: /^Tone\s+/,
    })),

    { id: kit.id, table: `${kit.word} Common`, path: [...drum, `${kit.word} Common`], group: `${kit.label} · Common`, strip: new RegExp(`^${kit.word}\\s+`) },
    { id: `${kit.id}.mfx`, table: `${kit.word} Common MFX`, path: [...drum, `${kit.word} Common MFX`], group: `${kit.label} · MFX`, strip: /^MFX\s+/ },
    ...effects(kit.id, `${kit.word} Common`, drum, kit.label),
    ...KIT_KEYS.map((key) => ({
      id: `${kit.id}.key${key}`,
      table: `${kit.word} Tone`,
      path: [...drum, `${kit.word} Tone (Key # ${key})`],
      group: `${kit.label} · Key ${key} (${noteName(key)})`,
      strip: /^Tone\s+/,
    })),
  ];
}

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

/** The manual's ":" between two Bank Select rows, filled in: one row per LSB, each `count` long but the last. */
export function bankRun(idPrefix, labelFor, role, msb, firstLsb, lastLsb, count, lastCount) {
  return range(firstLsb, lastLsb).map((lsb, i, all) => [
    `${idPrefix}-${i + 1}`, labelFor(i), role, msb, lsb, i === all.length - 1 ? lastCount : count,
  ]);
}

/** The temporary area the profiles leave out, in words, with its addresses: shared by all three. */
export function leftOutNotes({ kit }) {
  const kitBase = (part) => `${part} + 10 00 00`;
  return [
    `Patch Mode Part 1 (1F 00 00 00) is the patch or ${kit.label.toLowerCase()} played in Patch mode; its patch is at 1F 00 00 00 and its `
      + `${kit.label.toLowerCase()} at ${kitBase('1F 00 00 00')} = 1F 10 00 00, the key blocks from 1F 10 10 00 (key 21) two apart.`,
    `${kit.label} keys ${KIT_KEYS[0]} (${noteName(KIT_KEYS[0])}) to ${KIT_KEYS.at(-1)} (${noteName(KIT_KEYS.at(-1))}) are laid out, `
      + `${KIT_KEYS.length} of the 88; keys 21-${KIT_KEYS[0] - 1} (1F 10 10 00 to 1F 10 1A 00) and ${KIT_KEYS.at(-1) + 1}-108 `
      + '(1F 11 28 00 to 1F 11 3E 00) are not, to keep the profile under 12,000 parameters. Each is one more block of the same table.',
    'Not modelled: the sixteen Performance Mode parts\' own patches and kits, at 11 00 00 00, 11 20 00 00, … 14 60 00 00 '
      + '(part n at 11 00 00 00 + (n-1) × 00 20 00 00, a patch at +00 00 00 and a kit at +10 00 00).',
    'Not modelled: Patch Mode Part 2 (1F 20 00 00: patch at 1F 20 00 00, kit at 1F 30 00 00), the part the rhythm patterns play ("Rhy Patch" in Setup).',
    'Not modelled: the Temporary Rhythm Pattern (1E 00 00 00) and Temporary Arpeggio (1E 11 00 00). The map\'s one '
      + '"Arpeggio (Rhythm Pattern)" offset table (Arpeggio Common, then Arpeggio Pattern Note 1-16 of 32 steps each) implies both, '
      + 'but no row says so, and their 1,060 parameters would cost the kit keys above.',
  ];
}
