// The edit-buffer layout shared by Roland's XV series: the XV-3080 (1999), XV-88 (2000), XV-5080
// (2000) and XV-2020 (2002). The XV-5050 (2001) belongs here too and has no layout yet; see below.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the XVs
// have in common lives here, and synths/xv-*.mjs say what is theirs — identity, banks, the printed
// example, the manual's date and slips, and which of the blocks below the model has.
//
// The JV-1080's successors share model ID 00 10 and one address map, the XV-5080's. The XV-3080's and
// XV-88's manuals print it whole and tag what only the XV-5080 has `<XV-5080>` (Parts 17-32, MFX2 and
// MFX3, outputs C and D); the XV-2020's sets those rows `<*>`, ignored when received:
//
//   00 00 00 00  System                    common; EQ (XV-5080); a scale tune per part (XV-5080, -3080,
//                                          -88); keyboard (XV-88). The XV-2020 has Setup at 01 00 00 00
//                                          and its System at 02 00 00 00, common only.
//   10 00 00 00  Temporary Performance     common, MFX, chorus, reverb, a MIDI block per channel (16),
//                                          a Part block per part (32 on the XV-5080, 16 on the others);
//                                          on the XV-88 also a keyboard block and a zone per channel
//   11 00 00 00  Temporary Patch/Rhythm (Performance Mode Part 1) … 00 20 00 00 apart, one per part
//   1F 00 00 00  Temporary Patch/Rhythm (Patch Mode)
//   20, 30, 40   User Performances, Patches and Rhythm Sets (not edit buffer)
//
// and each Temporary Patch/Rhythm holds a patch at +00 00 00 (common, MFX, chorus, reverb, tone mix
// table, four tones; on the XV-5080 also a split key per key, 21 to 108, for multi-partial patches)
// and a rhythm set at +10 00 00 (common, MFX, chorus, reverb, one tone per key from 21 to 108).
//
// Laid out: the system blocks, the whole Temporary Performance, and Part 1's temporary patch and
// rhythm set. Parts 2-32's and the Patch-mode patch and rhythm set are the same blocks at their own
// bases and are left out (coverage says where); so are rhythm keys outside 35-81 (the General MIDI
// percussion keys), to keep each profile near ten thousand parameters.
//
// ---- What this file reads from the map, and why
//
// The XV manuals end each offset-table entry with the reference mark of the table it points to —
// `Temporary Performance *1-2`, `Rhythm Tone (Key # 21) *1-3-2-5`; the XV-88 prints the mark without
// its asterisk, `System 1-1` — and the reader keeps the mark as part of the entry's name. Two things
// follow, and neither is something a layout may fix in the map:
//
//   - a path must spell the mark. Names are therefore looked up here from the map, with or without
//     it, so a path reads as the manual's names and keeps resolving if the reader learns to drop it;
//   - the reader fills a `:` run only when the entries either side carry the same name with a number
//     in it, and the mark's last digit is the number it finds (`… (Key # 21) *1-3-2-5` ends in 5), so
//     every run whose first entry carries a mark stays a gap: Rhythm Tone keys 23-107, Patch Split Key
//     23-107, Performance MIDI channels 3-15, System Part 3-31 (3-15), on the XV-3080, XV-2020 and
//     XV-88 Performance Part 3-15, and the XV-88's Performance Zone 3-15. The map addresses only the
//     entries the manual prints.
//
// So every per-part, per-channel and per-key run below is the numbers the layout wants, kept where
// the map addresses them; what is missing is said, with addresses, in the profile's notes — computed,
// so that a map read again with the runs filled in builds the whole layout with no edit here.
//
// The XV-5050 cannot be laid out from its map as read: every table but the top one is "(unnamed)"
// (its headings, p162-170, are set as `1-2-1 System Common` with no asterisk and do not start with a
// capital, which neither of the reader's heading rules takes), and the generator finds a block's
// parameter table by name.

import { readFileSync } from 'node:fs';

import { flat } from '../parse-address-map.mjs';
import { resolvePath } from '../build-profile.mjs';
import { noteName } from './juno-ds-family.mjs';

export const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

/** The General MIDI percussion keys, 35 (Acoustic Bass Drum) to 81 (Open Triangle). */
export const RHYTHM_KEYS = range(35, 81);

/** Every key of a rhythm set or a multi-partial patch: 21 (A0) to 108 (C8). */
export const ALL_KEYS = range(21, 108);

/** A reference mark after an offset entry: `*1-3-2-5`, or `1-3-2-5` on the XV-88. */
const MARK = /\s+\*?\s*\d+(?:-\d+)+$/;
/** The section number before a table's heading: `1-3-1-6 Patch Tone`. */
const NUMBERING = /^\*?\s*\d+(?:-\d+)*\s+/;
/** What only some models have: `<XV-5080>`, `<XV-3080/5080>`, the XV-2020's `<*>`. Kept in names, left out of ids. */
const TAG = /\s*<(?:XV-[\d/]+|\*)>/;

/** A block's `strip`: the leading words its ids leave out, and the model tags. */
const strip = (...words) => new RegExp([...words.map((w) => w.source), TAG.source].join('|'), 'g');

const toAddress = (n) => Array.from({ length: 4 }, (unused, i) => Math.floor(n / 128 ** (3 - i)) % 128)
  .map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/** Numbers as runs: [3, 4, 5, 9] -> "3-5, 9". */
const runs = (numbers) => numbers.reduce((out, n) => {
  const last = out.at(-1);
  if (last && n === last[1] + 1) last[1] = n;
  else out.push([n, n]);
  return out;
}, []).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');

/** The map (maps/<name>.json unless one is given), and its names with or without the manual's reference marks. */
export function readXvMap(name, map = JSON.parse(readFileSync(new URL(`../maps/${name}.json`, import.meta.url), 'utf8'))) {
  const entries = new Map();
  for (const t of map.tables.filter((t) => t.kind === 'offsets')) {
    for (const e of t.entries) {
      if (e.gap) continue;
      const bare = e.name.replace(MARK, '');
      entries.set(bare, [...(entries.get(bare) ?? []), e.name]);
    }
  }
  const tables = new Map();
  for (const t of map.tables.filter((t) => t.kind === 'parameters' && t.totalSize)) {
    const bare = t.name.replace(NUMBERING, '');
    tables.set(bare, [...(tables.get(bare) ?? []), t.name]);
  }
  const one = (found, what, wanted) => {
    if (found?.length !== 1) throw new Error(`${name}: ${found?.length ?? 0} ${what}s are called "${wanted}"; the layout needs exactly one`);
    return found[0];
  };
  return {
    name,
    map,
    has: (bare) => entries.has(bare),
    entry: (bare) => one(entries.get(bare), 'offset entry', bare),
    table: (bare) => one(tables.get(bare), 'parameter table', bare),
  };
}

/**
 * The blocks, in the order the startup pull asks for them, with the notes and coverage that depend
 * on what the map addresses.
 *
 *   parts           how many parts the Temporary Performance has (32 on the XV-5080, 16 on the others)
 *   setup           the XV-2020's Setup block (01 00 00 00); its System (02 00 00 00) is common only
 *   systemEq        the XV-5080's System EQ
 *   systemParts     System Part (Part n), a scale tune per part (all but the XV-2020, whose parts
 *                   carry their scale tune in the Performance Part block)
 *   systemKeyboard  the XV-88's System Keyboard
 *   zones           the XV-88's Performance Keyboard and sixteen Performance Zones
 *   splitKeys       the XV-5080's Patch Split Key blocks (one per key, for multi-partial patches)
 *   performanceMfx  the suffixes of the performance's MFX entries: [''] for `Performance Common MFX`,
 *                   ['A', 'B', 'C'] for the XV-5050's `Performance Common MFXA` … `MFXC`
 */
export function xvLayout(xv, {
  parts, setup = false, systemEq = false, systemParts = true, systemKeyboard = false, zones = false, splitKeys = false, performanceMfx = [''],
}) {
  const { entry, has, table } = xv;
  const block = (id, tableName, path, group, extra = {}) => ({ id, table: table(tableName), path: path.map(entry), group, ...extra });
  const missing = [];
  /**
   * The numbers wanted, kept where the map addresses `nameOf(n)`. The rest are noted with their
   * addresses, worked out from two entries the map does address in the whole run (`domain`).
   */
  const kept = (what, numbers, nameOf, pathTo, domain = numbers) => {
    const absent = numbers.filter((n) => !has(nameOf(n)));
    if (absent.length) {
      const printed = domain.filter((n) => has(nameOf(n)));
      const at = (n) => flat(resolvePath(xv.map, pathTo(n).map(entry)));
      const [a, b] = printed;
      const stride = b !== undefined ? (at(b) - at(a)) / (b - a) : null;
      const where = (n) => toAddress(at(a) + (n - a) * stride);
      missing.push(`${what} ${runs(absent)}: the map addresses only ${runs(printed)} of ${runs(domain)}`
        + (stride ? `; n is at ${where(a)} + (n-${a}) x ${toAddress(stride)}, so ${absent[0]} is at ${where(absent[0])} and ${absent.at(-1)} at ${where(absent.at(-1))}` : ''));
    }
    return numbers.filter((n) => has(nameOf(n)));
  };

  const PARTS = range(1, parts);
  const CHANNELS = range(1, 16);
  const systemRoot = 'System';
  const performance = 'Temporary Performance';
  const tone = 'Temporary Patch/Rhythm (Performance Mode Part 1)';
  const patch = (name) => [tone, 'Temporary Patch', name];
  const rhythm = (name) => [tone, 'Temporary Rhythm', name];

  const systemBlocks = [
    ...(setup ? [block('setup', 'Setup', ['Setup'], 'Setup', { system: true })] : []),
    block('system', 'System Common', [systemRoot, 'System Common'], 'System', { system: true, strip: strip(/^System\s+/) }),
    ...(systemEq ? [block('systemEq', 'System EQ', [systemRoot, 'System EQ'], 'System · EQ', { system: true, strip: strip(/^EQ\s+/) })] : []),
    ...(systemParts ? kept('System Part (a scale tune per part), parts', PARTS, (n) => `System Part (Part ${n})`, (n) => [systemRoot, `System Part (Part ${n})`]).map((n) => block(
      `system.part${n}`, 'System Part', [systemRoot, `System Part (Part ${n})`], `System · Part ${n} Scale Tune`, { system: true, strip: strip(/^Scale Tune for\s+/) },
    )) : []),
    ...(systemKeyboard ? [block('systemKeyboard', 'System Keyboard', [systemRoot, 'System Keyboard'], 'System · Keyboard', { system: true, strip: strip() })] : []),
  ];

  const effects = (id, prefix, at, group, mfx = ['']) => [
    ...mfx.map((x) => block(`${id}.mfx${x}`, `${prefix} Common MFX`, at(`${prefix} Common MFX${x}`), `${group} · MFX${x}`, { strip: strip(/^MFX\s+/) })),
    block(`${id}.chorus`, `${prefix} Common Chorus`, at(`${prefix} Common Chorus`), `${group} · Chorus`, { strip: strip(/^Chorus\s+/) }),
    block(`${id}.reverb`, `${prefix} Common Reverb`, at(`${prefix} Common Reverb`), `${group} · Reverb`, { strip: strip(/^Reverb\s+/) }),
  ];
  const inPerformance = (name) => [performance, name];

  const performanceBlocks = [
    block('performance', 'Performance Common', inPerformance('Performance Common'), 'Performance · Common', { strip: strip(/^Performance\s+/) }),
    ...effects('performance', 'Performance', inPerformance, 'Performance', performanceMfx),
    ...kept('Performance MIDI channels', CHANNELS, (n) => `Performance MIDI (Channel ${n})`, (n) => inPerformance(`Performance MIDI (Channel ${n})`)).map((n) => block(
      `performance.channel${n}`, 'Performance MIDI', inPerformance(`Performance MIDI (Channel ${n})`), `Performance · MIDI Ch ${n}`, { strip: strip() },
    )),
    // `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the mode messages, as (CC# n) names a CC.
    ...kept('Performance Parts', PARTS, (n) => `Performance Part (Part ${n})`, (n) => inPerformance(`Performance Part (Part ${n})`)).map((n) => block(
      `part${n}`, 'Performance Part', inPerformance(`Performance Part (Part ${n})`), `Part ${n}`, { strip: strip(/^Part\s+/, /\s*\(MONO ON\/POLY ON\)/) },
    )),
    ...(zones ? [
      block('performance.keyboard', 'Performance Keyboard', inPerformance('Performance Keyboard'), 'Performance · Keyboard', { strip: strip(/^Keyboard\s+/) }),
      // The map numbers the zones by channel, `Performance Zone (Channel n)`; the manual calls them Zone 1-16.
      ...kept('Performance Zones', CHANNELS, (n) => `Performance Zone (Channel ${n})`, (n) => inPerformance(`Performance Zone (Channel ${n})`)).map((n) => block(
        `zone${n}`, 'Performance Zone', inPerformance(`Performance Zone (Channel ${n})`), `Zone ${n}`, { strip: strip() },
      )),
    ] : []),
  ];

  const patchBlocks = [
    block('part1.patch', 'Patch Common', patch('Patch Common'), 'Part 1 · Patch · Common', { strip: strip(/^Patch\s+/) }),
    ...effects('part1.patch', 'Patch', patch, 'Part 1 · Patch'),
    block('part1.patch.tmt', 'Patch TMT (Tone Mix Table)', patch('Patch TMT (Tone Mix Table)'), 'Part 1 · Patch · Tone Mix Table', { strip: strip(/^TMT\s+/) }),
    ...[1, 2, 3, 4].map((n) => block(
      `part1.patch.tone${n}`, 'Patch Tone', patch(`Patch Tone (Tone ${n})`), `Part 1 · Patch · Tone ${n}`, { strip: strip(/^Tone\s+/) },
    )),
    ...(splitKeys ? kept('Part 1 Patch Split Keys', ALL_KEYS, (k) => `Patch Split Key (Key # ${k})`, (k) => patch(`Patch Split Key (Key # ${k})`)).map((k) => block(
      `part1.patch.splitKey${k}`, 'Patch Split Key', patch(`Patch Split Key (Key # ${k})`), `Part 1 · Patch · Split Key ${k} (${noteName(k)})`, { strip: strip(/^Split\s+/) },
    )) : []),
  ];

  const rhythmBlocks = [
    block('part1.rhythm', 'Rhythm Common', rhythm('Rhythm Common'), 'Part 1 · Rhythm Set · Common', { strip: strip(/^Rhythm\s+/) }),
    ...effects('part1.rhythm', 'Rhythm', rhythm, 'Part 1 · Rhythm Set'),
    ...kept('Part 1 Rhythm Set keys', RHYTHM_KEYS, (k) => `Rhythm Tone (Key # ${k})`, (k) => rhythm(`Rhythm Tone (Key # ${k})`), ALL_KEYS).map((k) => block(
      `part1.rhythm.key${k}`, 'Rhythm Tone', rhythm(`Rhythm Tone (Key # ${k})`), `Part 1 · Rhythm Set · Key ${k} (${noteName(k)})`, { strip: strip(/^Tone\s+/) },
    )),
  ];

  const toneBase = resolvePath(xv.map, [entry(tone)]);
  const partStride = flat(resolvePath(xv.map, [entry('Temporary Patch/Rhythm (Performance Mode Part 2)')])) - flat(toneBase);
  const lastPart = toAddress(flat(toneBase) + (parts - 1) * partStride);
  const patchMode = resolvePath(xv.map, [entry('Temporary Patch/Rhythm (Patch Mode)')]);

  return {
    blocks: [...systemBlocks, ...performanceBlocks, ...patchBlocks, ...rhythmBlocks],
    coverage: {
      parts: `the Temporary Performance's Part block for every part the map addresses (of 1-${parts}); the temporary patch and rhythm set of Part 1 only. `
        + `Parts 2-${parts}'s are not laid out: Temporary Patch/Rhythm (Performance Mode Part n) is at ${toneBase} + (n-1) x ${toAddress(partStride)} `
        + `(… ${lastPart} for Part ${parts}), its patch at +00 00 00 and its rhythm set at +10 00 00, the same blocks as Part 1's`,
      patchMode: `not laid out: Temporary Patch/Rhythm (Patch Mode), the patch or rhythm set played in Patch mode, at ${patchMode} (patch) and `
        + `${toAddress(flat(patchMode) + flat('00 10 00 00'))} (rhythm set): the same blocks as Part 1's at another base`,
      toneTypes: 'Part 1 plays a patch or a rhythm set; both are laid out (patch at 11 00 00 00, rhythm set at 11 10 00 00) and neither is read at startup, '
        + 'since a request the instrument cannot answer gets no reply and the engine\'s startup read stops at the first request that is not answered',
      rhythmKeys: `rhythm tones for keys 35-81 (the General MIDI percussion keys) that the map addresses; Rhythm Tone (Key # k) is at the rhythm set's base `
        + '+ 00 10 00 + (k-21) x 00 02 00, so for Part 1 keys 21-34 are at 11 10 10 00-11 10 2A 00 and keys 82-108 at 11 11 0A 00-11 11 3E 00; '
        + 'all eighty-eight would be over twelve thousand parameters on their own',
      effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container (12768-52768, shown -20000..+20000); '
        + 'what each slot does depends on the selected type, which the MIDI Implementation does not list',
      notModelled: 'User Performances (20 00 00 00), User Patches (30 00 00 00) and User Rhythm Sets (40 00 00 00): memories, not the edit buffer',
      ...(missing.length ? { notAddressedByTheMap: missing.join('; ') } : {}),
    },
    notes: [
      ...(missing.length ? [
        'The manual ends each offset-table entry with a reference mark (`Rhythm Tone (Key # 21) *1-3-2-5`), which the reader keeps in the name and which stops it '
          + 'filling in the ":" run after a marked entry; the map then addresses only the entries the manual prints. Left out for that reason, with their addresses: '
          + `${missing.join('; ')}.`,
      ] : []),
    ],
  };
}

/** Part 1 holds a patch or a rhythm set, not both; the one it does not hold is not answered. */
export const NO_PULL = [/^part1\.(patch|rhythm)(\.|$)/];

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

/** Preset groups lettered from A, one LSB each from 64: [id, label, 'factory', msb, lsb, count]. */
export const presetGroups = (kind, msb, prefix, letters, count, unit) => letters.split('').map((letter, i) => [
  `${prefix.toLowerCase()}-${letter.toLowerCase()}-${kind}`, `${prefix}-${letter} ${unit}`, 'factory', msb, 64 + i, count,
]);

/** The DT1 every XV manual but the XV-2020's works through: Chorus Type of the Performance Common set to DELAY (02). */
export const chorusTypeExample = (where) => ({
  name: 'Setting CHORUS TYPE of PERFORMANCE COMMON to DELAY (DT1)',
  where,
  parameter: 'performance.chorus.type',
  value: 2,
  expectedHex: 'F0 41 10 00 10 12 10 00 04 00 02 6A F7',
});

export const sharedNotes = [
  'Performance parts are filed as "Part n" (id part<n>.*), Part 1\'s patch as "Part 1 · Patch · …" (part1.patch.*) and its rhythm set as '
    + '"Part 1 · Rhythm Set · …" (part1.rhythm.*); the performance\'s own blocks as "Performance · …" and its MIDI blocks by channel.',
  'LFO1 Wave Form and LFO2 Wave Form (0-10) print their labels as "SIN, TRI, SAW-UP, SAW-DW, SQR, RND, BEND-UP, BEND-DW, TRP, S&H" with "CHS" alone on the next '
    + 'line and no comma before it (the XV-5080\'s p297; every XV manual sets it so): ten labels for eleven values, so both stay numbers with the manual\'s line '
    + 'as their description rather than labels that would be off by one.',
  'Rows the manual tags for other models (`<XV-5080>`, `<XV-3080/5080>`, the XV-2020\'s `<*>`) keep the tag in their name and choice labels, where a reader sees it, '
    + 'and lose it in their ids.',
];
