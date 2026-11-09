// The edit-buffer layout shared by the MC-808 and the MC-909, Roland's sampling grooveboxes.
//
// Not a synth of its own: make-profiles.mjs treats every file in synths/ as one, so the part the
// two have in common lives here, and synths/mc-808.mjs and synths/mc-909.mjs say what is theirs —
// the model ID, the identity reply, the bank table, the printed example and what their manuals get
// wrong. The MC-808 is the MC-909's successor and prints the MC-909's address map with a handful of
// rows changed (one D Beam instead of two, no SRX wave group, a "---" where the MC-909 has DIR2, an
// SMG matrix destination): every offset table is the same in both, and every block but Setup (16
// bytes on the MC-808, 17 on the MC-909) is the same size.
//
// The address map (p7 in both manuals) is:
//
//   01 00 00 00  Setup                  — front-panel state: effect switches, octave, D Beam,
//                                         arpeggio and chord switches
//   02 00 00 00  System                 — common, mastering, a scale tune per part, controller
//   10 00 00 00  Part Info              — the current pattern's part settings: voice reserve,
//                                         MFX1, MFX2, reverb, compressor/EQ, the external input,
//                                         and the part mixer of each of the sixteen parts
//   11 00 00 00  Temporary Patch/Rhythm (Part 1) … 14 60 00 00 (Part 16), 00 20 00 00 apart
//   15 00 00 00  Temporary Arpeggio     — the arpeggio style: common, sixteen pattern notes
//   18 00 00 00  Temporary Chord        — the chord form: one on/off per note
//
// and each part's Temporary Patch/Rhythm holds a patch at +00 00 00 (common, tone mix table, four
// tones) and a rhythm set at +10 00 00 (common, and one tone per key). The Rhythm offset table
// prints keys 59 to 74 only — sixteen, as many as either instrument has pads — at 00 5C 00 …
// 00 7A 00, which is where the 88-key scheme of Roland's other synths would put them (key k at
// 00 10 00 + (k-21) × 00 02 00).
//
// Patterns, songs and sample data are not in the address map at all: they are not reachable by
// RQ1/DT1, so neither profile has them. Nor is the "Quick SysEx" map each manual prints after the
// main one, under a one-byte model ID (5D) and two-byte addresses.
//
// Laid out: Setup and System (system blocks), Part Info (on the MC-808 without its Common block,
// whose every row is marked ignored-when-received), Part 1's patch and rhythm set
// (every key the manual prints), the Temporary Arpeggio and the Temporary Chord. Parts 2-16's
// temporary patches and rhythm sets are the same blocks again at their own bases and are left out.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const PARTS = range(1, 16);

/** The rhythm-set keys the manual prints: 59 (B3) to 74 (D5). */
export const RHYTHM_KEYS = range(59, 74);

/** Part 1 is the only temporary patch/rhythm laid out; see `coverage.parts`. */
export const TONE_PART = 1;

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Roland's octave numbering: middle C, note 60, is C4. */
export const noteName = (key) => `${NOTE[key % 12]}${Math.floor(key / 12) - 1}`;

/**
 * The blocks, in the order the startup pull asks for them.
 *
 *   voiceReserve  whether Part Info Common (the sixteen voice reserves) is laid out; the MC-808
 *                 marks every row of it <*> (ignored when received), which leaves it empty
 */
export function grooveboxBlocks({ voiceReserve }) {
  const partInfo = (entry) => ['Part Info', entry];
  const tone = (part) => `Temporary Patch/Rhythm (Part ${part})`;
  const patch = (part, entry) => [tone(part), 'Temporary Patch', entry];
  const rhythm = (part, entry) => [tone(part), 'Temporary Rhythm', entry];
  const p = TONE_PART;

  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'mastering', table: 'System Mastering', path: ['System', 'System Mastering'], group: 'System · Mastering', strip: /^Mastering\s+/, system: true },
    ...PARTS.map((n) => ({
      id: `system.part${n}`, table: 'System Part', path: ['System', `System Part (Part ${n})`], group: `System · Part ${n} Scale Tune`, strip: /^Scale Tune for\s+/, system: true,
    })),
    // "D Beam 1 Asgn CC#": the # is "number" here, not a sharp — dBeam1AsgnCc, not …CcSharp.
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', strip: /#$/, system: true },

    ...(voiceReserve ? [{ id: 'partInfo', table: 'Part Info Common', path: partInfo('Part Info Common'), group: 'Part Info · Voice Reserve' }] : []),
    { id: 'mfx1', table: 'Part Info Common MFX1', path: partInfo('Part Info Common MFX1'), group: 'Part Info · MFX1', strip: /^MFX1?\s+/ },
    { id: 'mfx2', table: 'Part Info Common MFX2', path: partInfo('Part Info Common MFX2'), group: 'Part Info · MFX2', strip: /^MFX\s+/ },
    { id: 'reverb', table: 'Part Info Common Reverb', path: partInfo('Part Info Common Reverb'), group: 'Part Info · Reverb', strip: /^Reverb\s+/ },
    { id: 'compEq', table: 'Part Info Common Comp/EQ', path: partInfo('Part Info Common Comp/EQ'), group: 'Part Info · Comp/EQ', strip: /^Comp\s+/ },
    { id: 'externalInput', table: 'Part Info Common External Input', path: partInfo('Part Info Common External Input'), group: 'Part Info · External Input', strip: /^External\s+/ },
    // The part mixer: what CC 7 and CC 10 change (p1-2: "PART MIXER" in the MC-909's notes, "PART PARAM" in the MC-808's).
    ...PARTS.map((n) => ({
      id: `part${n}`, table: 'Part Info Part', path: partInfo(`Part Info Part (Part ${n})`), group: `Part ${n} · Mixer`, strip: /^Part\s+/,
    })),

    { id: 'arpeggio', table: 'Arpeggio Common', path: ['Temporary Arpeggio', 'Arpeggio Common'], group: 'Arpeggio' },
    // "Step1 Data" … "Step32 Data": arpeggio.note1.step1 … step32.
    ...PARTS.map((n) => ({
      id: `arpeggio.note${n}`, table: 'Arpeggio Pattern', path: ['Temporary Arpeggio', `Arpeggio Pattern (Note ${n})`], group: `Arpeggio · Pattern Note ${n}`, strip: /\s+Data$/,
    })),
    { id: 'chord', table: 'Chord Pattern', path: ['Temporary Chord', 'Chord Pattern'], group: 'Chord Pattern', strip: /^Chord\s+/ },

    { id: `part${p}.patch`, table: 'Patch Common', path: patch(p, 'Patch Common'), group: `Part ${p} · Patch · Common`, strip: /^Patch\s+/ },
    { id: `part${p}.patch.tmt`, table: 'Patch TMT (Tone Mix Table)', path: patch(p, 'Patch TMT (Tone Mix Table)'), group: `Part ${p} · Patch · Tone Mix Table`, strip: /^TMT\s+/ },
    ...[1, 2, 3, 4].map((n) => ({
      id: `part${p}.patch.tone${n}`, table: 'Patch Tone', path: patch(p, `Patch Tone (Tone ${n})`), group: `Part ${p} · Patch · Tone ${n}`, strip: /^Tone\s+/,
    })),

    { id: `part${p}.rhythm`, table: 'Rhythm Common', path: rhythm(p, 'Rhythm Common'), group: `Part ${p} · Rhythm · Common`, strip: /^Rhythm\s+/ },
    ...RHYTHM_KEYS.map((key) => ({
      id: `part${p}.rhythm.key${key}`,
      table: 'Rhythm Tone',
      path: rhythm(p, `Rhythm Tone (Key # ${key})`),
      group: `Part ${p} · Rhythm · Key ${key} (${noteName(key)})`,
      strip: /^Tone\s+/,
    })),
  ];
}

/** Part 1 holds a patch or a rhythm set, not both; the one it does not hold is not answered. */
export const NO_PULL = [new RegExp(`^part${TONE_PART}\\.(patch|rhythm)(\\.|$)`)];

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
export function bankRun(idFor, labelFor, role, msb, firstLsb, lastLsb, count, lastCount = count) {
  return range(firstLsb, lastLsb).map((lsb, i, all) => [
    idFor(i), labelFor(i), role, msb, lsb, i === all.length - 1 ? lastCount : count,
  ]);
}

/** Bank labels for a numbered run: "0001-0128", "0129-0256", … the last ending at `total`. */
export const numberedLabel = (prefix, width, total) => (i) => `${prefix} ${String(i * 128 + 1).padStart(width, '0')}-${String(Math.min(i * 128 + 128, total)).padStart(width, '0')}`;

/** What both profiles leave out, and where it is. `rq1Page`: where the manual says an unanswerable RQ1 gets no reply. */
export const sharedCoverage = ({ rq1Page }) => ({
  parts: 'the Part Info part mixer for all sixteen parts; the temporary patch and rhythm set for Part 1 only. Parts 2-16\'s are not laid out: '
    + 'Temporary Patch/Rhythm (Part n) is at 11 00 00 00 + (n-1) x 00 20 00 00 (11 20 00 00, 11 40 00 00, 11 60 00 00, 12 00 00 00 … 14 60 00 00), '
    + 'with its patch at +00 00 00 and its rhythm set at +10 00 00',
  toneTypes: 'a part plays a patch or a rhythm set; Part 1\'s are both laid out (patch at 11 00 00 00, rhythm set at 11 10 00 00) and neither is read at startup. '
    + `The manual says (${rq1Page}) that a request it cannot answer gets no reply, and the engine's startup read stops at the first request that is not answered`,
  rhythmKeys: 'complete as printed: the manual\'s Rhythm offset table lists keys 59-74 (16 tones), at 11 10 5C 00 … 11 10 7A 00 for Part 1',
  effectParameterMeanings: 'type-dependent: MFX and reverb parameters are Roland\'s 4-nibble container '
    + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
  notModelled: 'patterns, songs and sample data (not in the address map: no RQ1/DT1 reaches them); the "Quick SysEx" map printed after the main one '
    + '(model ID 5D, two-byte addresses and two-byte data: patch, rhythm and sequencer parameters per part), which a profile with one model ID cannot carry',
});

export const sharedNotes = [
  'Part Info (10 00 00 00) is the current pattern\'s part settings: its effects and each part\'s mixer (Patch Bank Select/Program Number, level, pan, '
    + 'tune, sends, output). Its blocks are groups "Part Info · …" and "Part n · Mixer".',
  'Part 1\'s temporary patch is at 11 00 00 00 (common, tone mix table at 11 00 10 00, tones 1-4 at 11 00 20 00 … 11 00 26 00) and its rhythm set at '
    + '11 10 00 00 (common, then key 59 at 11 10 5C 00 … key 74 at 11 10 7A 00). The Rhythm offset table prints only keys 59-74; their offsets follow '
    + 'the 88-key layout of Roland\'s other synths (key 21 would be 00 10 00); the manual prints nothing at 00 10 00 … 00 5A 00.',
  'Rows marked <*> are ignored when the instrument receives them (p7); Patch Common 00 0D, Tone Type<*>, is one, and is not laid out.',
  'The Temporary Arpeggio (15 00 00 00) and Temporary Chord (18 00 00 00) are the arpeggio style and chord form being edited; they are read at startup, last, so that if the instrument does not answer for them nothing else is lost.',
];
