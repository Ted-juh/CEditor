// The Roland JD-XA: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JD-XA MIDI Implementation", version 1.00, May 13 2015 (maps/jd-xa.json says which file,
// with its hash). Page numbers below are that document's.
//
// The JD-XA is the JD-Xi's big sibling: four analog parts, four SuperNATURAL digital parts, and
// eight MIDI control parts that play external gear. Its address map (p8) says so:
//
//   18 00 00 00  Temporary Program — common, reverb, delay, vocoder, two TFX, a Part and a Zone for
//                each of the sixteen parts, a Part EQ for each of the eight sound parts, the
//                controller assignments, the arpeggio (common and sixteen pattern notes), fifty MIDI
//                Controller knob assignments and sixteen Triggers
//   19 00 00 00  Analog Part 1's tone           (19 20 / 19 40 / 19 60 00 00 for parts 2-4)
//   1A 00 00 00  Digital Part 1's tone          (1A 20 / 1A 40 / 1A 60 00 00 for parts 2-4)
//
// Each part's Temporary Tone area (p8, "Temporary Tone") offers a SuperNATURAL tone at 01 00 00 and
// an analog tone at 02 00 00. An analog part plays only the analog engine and a digital part only the
// SuperNATURAL one, so each part is laid out with the tone it can hold: analog tones at 19 x2 00 00,
// SuperNATURAL tones at 1A x1 00 00 — the same arrangement as the JD-Xi's analog part (19 42 00 00).
//
// So the layout below is that tree, written as the path of names the map's offset tables use. The
// generator resolves each path and refuses a name that is missing or ambiguous.

const SN = 'SuperNATURAL Synth Tone';
const AN = 'Analog Synth Tone';

/** [block-id suffix, the manual's name for the part (as the Program table spells it), label]. */
const ANALOG = [1, 2, 3, 4].map((n) => [`analog${n}`, `Analog Part${n}`, `Analog ${n}`]);
const DIGITAL = [1, 2, 3, 4].map((n) => [`digital${n}`, `Digital Part${n}`, `Digital ${n}`]);
const MIDI = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`midi${n}`, `MIDI Control Part${n}`, `MIDI Control ${n}`]);

const analogTone = (n) => {
  const root = `Temporary Tone (Analog Part ${n})`;
  const tone = 'Temporary Analog Synth Tone';
  return [
    { id: `analog${n}.common`, table: `${AN} Common`, path: [root, tone, `${AN} Common`], group: `Analog ${n} · Tone Common`, strip: /^Tone\s+/ },
    { id: `analog${n}.partial`, table: `${AN} Partial`, path: [root, tone, `${AN} Partial`], group: `Analog ${n} · Tone Partial` },
    { id: `analog${n}.mfx`, table: `${AN} MFX`, path: [root, tone, `${AN} MFX`], group: `Analog ${n} · Tone MFX`, strip: /^MFX\s+/ },
  ];
};

const digitalTone = (n) => {
  const root = `Temporary Tone (Digital Part ${n})`;
  const tone = 'Temporary SuperNATURAL Synth Tone';
  return [
    { id: `digital${n}.common`, table: `${SN} Common`, path: [root, tone, `${SN} Common`], group: `Digital ${n} · Tone Common`, strip: /^Tone\s+/ },
    // The offset table calls this block "SuperNATURAL Synth Tone MFX"; its own heading (p14) adds "Common".
    { id: `digital${n}.mfx`, table: `${SN} Common MFX`, path: [root, tone, `${SN} MFX`], group: `Digital ${n} · Tone MFX`, strip: /^MFX\s+/ },
    ...[1, 2, 3].map((partial) => ({
      id: `digital${n}.partial${partial}`,
      table: `${SN} Partial`,
      path: [root, tone, `${SN} Partial (${partial})`],
      group: `Digital ${n} · Tone Partial ${partial}`,
    })),
    { id: `digital${n}.modify`, table: `${SN} Modify`, path: [root, tone, `${SN} Modify`], group: `Digital ${n} · Tone Modify` },
  ];
};

const N16 = Array.from({ length: 16 }, (unused, i) => i + 1);
const N50 = Array.from({ length: 50 }, (unused, i) => i + 1);

/** p1 and p5: INT:A01 - P16 and USB:A01 - P16, sixteen groups (A-P) of sixteen, 128 per LSB. */
const GROUPS = 'ABCDEFGHIJKLMNOP'.split('');
const bankRow = (memory, label, startSlot, lsbBase) => GROUPS.map((letter, i) => ({
  id: `${memory}-${letter.toLowerCase()}`,
  label: `${label} ${letter}`,
  role: 'user',
  writable: true,
  startSlot: startSlot + i * 16,
  slotCount: 16,
  programBase: (i % 8) * 16,
  bankMsb: 85,
  bankLsb: lsbBase + Math.floor(i / 8),
}));

export default {
  id: 'roland-jd-xa',
  name: 'Roland JD-XA',
  family: 'JD',
  map: 'jd-xa',
  deviceId: 0x10,
  description: 'Roland JD-XA analog/digital crossover synthesizer: four analog parts, four SuperNATURAL digital parts '
    + 'and eight MIDI control parts, with the program they sit in. Every block of the temporary (edit-buffer) area '
    + 'in the MIDI Implementation, every part\'s tone included.',

  // p6, Identity Reply: F0 7E dev 06 02 41 0F 03 00 00 00 03 00 00 F7.
  identity: { familyCode: ['0F', '03'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    { id: 'masterEq', table: 'System Master EQ', path: ['System', 'System Master EQ'], group: 'System · Master EQ', strip: /^EQ\s+/, system: true },
    { id: 'micFx', table: 'System Mic EFX', path: ['System', 'System Mic EFX'], group: 'System · Mic Effect', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    { id: 'program', table: 'Program Common', path: ['Temporary Program', 'Program Common'], group: 'Program', strip: /^Program\s+/ },
    { id: 'reverb', table: 'Program Reverb', path: ['Temporary Program', 'Program Reverb'], group: 'Program · Reverb', strip: /^Reverb\s+/ },
    { id: 'delay', table: 'Program Delay', path: ['Temporary Program', 'Program Delay'], group: 'Program · Delay', strip: /^Delay\s+/ },
    { id: 'vocoder', table: 'Program Vocoder', path: ['Temporary Program', 'Program Vocoder'], group: 'Program · Vocoder', strip: /^Vocoder\s+/ },
    ...[1, 2].map((n) => ({
      id: `tfx${n}`, table: 'Program TFX', path: ['Temporary Program', `Program TFX (${n})`], group: `Program · TFX ${n}`, strip: /^TFX\s+/,
    })),

    ...[...ANALOG, ...DIGITAL, ...MIDI].map(([id, name, label]) => ({
      id: `part.${id}`, table: 'Program Part', path: ['Temporary Program', `Program Part (${name})`], group: `${label} · Part`, strip: /^Part\s+/,
    })),
    // Only the eight sound parts have an EQ; the MIDI control parts play external gear.
    ...[...ANALOG, ...DIGITAL].map(([id, name, label]) => ({
      id: `partEq.${id}`, table: 'Program Part EQ', path: ['Temporary Program', `Program Part EQ (${name})`], group: `${label} · Part EQ`, strip: /^EQ\s+/,
    })),
    ...[...ANALOG, ...DIGITAL, ...MIDI].map(([id, name, label]) => ({
      id: `zone.${id}`, table: 'Program Zone', path: ['Temporary Program', `Program Zone (${name})`], group: `${label} · Zone`,
    })),

    { id: 'controller', table: 'Program Controller', path: ['Temporary Program', 'Program Controller'], group: 'Program · Controller' },
    { id: 'arpeggio.common', table: 'Program Arpeggio Common', path: ['Temporary Program', 'Program Arpeggio Common'], group: 'Program · Arpeggio', strip: /^Arpeggio\s+/ },
    // "Step1 Data" … "Step32 Data": arpeggio.note1.step1 … step32.
    ...N16.map((n) => ({
      id: `arpeggio.note${n}`,
      table: 'Program Arpeggio Pattern',
      path: ['Temporary Program', `Program Arpeggio Pattern (Note ${n})`],
      group: `Program · Arpeggio Note ${n}`,
      strip: /\s+Data$/,
    })),
    ...N50.map((n) => ({
      id: `midiController${n}`, table: 'Program MIDI Controller', path: ['Temporary Program', `Program MIDI Controller (${n})`], group: `Program · MIDI Controller ${n}`,
    })),
    ...N16.map((n) => ({
      id: `trigger${n}`, table: 'Program Trigger', path: ['Temporary Program', `Program Trigger (${n})`], group: `Program · Trigger ${n}`, strip: /^Trigger\s+/,
    })),

    ...[1, 2, 3, 4].flatMap(analogTone),
    ...[1, 2, 3, 4].flatMap(digitalTone),
  ],

  // None. The manual prints one worked SysEx message (p20, "Example of an Exclusive Message and
  // Calculating a Checksum"), and it contradicts the manual's own table:
  //
  //   "Setting Reverb Type of Program to Room 2 (DT1)" — Temporary Program 18 00 00 00, Reverb at
  //   02 00, "the address of Reverb Type is 00 00H": F0 41 10 00 00 00 0F 12 18 00 02 00 02 64 F7.
  //
  // The Program Reverb table (p10) puts Reverb Switch (0 - 1, OFF/ON) at 00 00 and Reverb Type
  // (0 - 6) at 00 01, so the printed message writes 2 to the reverb switch, out of its range. The
  // FA-06/07/08 MIDI Implementation prints the same example over the same table with Reverb Type at
  // 00 01H (F0 41 10 00 00 77 12 18 00 02 01 02 63 F7), so the JD-XA's text looks adapted from it
  // with the offset changed. From this layout reverb.type = 2 is F0 41 10 00 00 00 0F 12 18 00 02 01
  // 02 63 F7, which is not what p20 prints; neither reading can be written here as the manual's own
  // bytes without inventing one, so no example is claimed.
  examples: [],
  examplesUnavailable: 'The only printed DT1 example (p20, Reverb Type = Room 2) writes to 18 00 02 00, which the '
    + 'manual\'s own Program Reverb table (p10) gives to Reverb Switch; Reverb Type is at 00 01, as the FA-06/07/08 '
    + 'manual prints the same example. Contradictory, so not claimed.',

  // p1 (and p5, the same table for transmission): MSB 85, LSB 0-1 for the 256 internal programs
  // INT:A01 - P16, LSB 32-33 for the USB memory's USB:A01 - P16; program change 1-128 in each LSB.
  // The manual names no preset (ROM) bank; both are program memory.
  presets: {
    banks: [
      ...bankRow('int', 'INT', 0, 0),
      ...bankRow('usb', 'USB', 256, 32),
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: reverb, delay, vocoder, TFX and MFX parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: the front panel\'s CC and NRPN assignments are in the Parameter Guide ("CC Assignments", referred to on p2 and p5), not the MIDI Implementation',
    tones: 'all eight sound parts: analog parts 1-4 with the analog tone (common, partial, MFX), digital parts 1-4 with the SuperNATURAL tone (common, MFX, three partials, modify)',
  },
  notes: [
    'Analog parts 1-4 hold analog tones at 19 02 00 00, 19 22 00 00, 19 42 00 00 and 19 62 00 00; digital parts 1-4 hold SuperNATURAL tones at 1A 01 00 00, 1A 21 00 00, 1A 41 00 00 and 1A 61 00 00. '
      + 'The manual\'s Temporary Tone table (p8) also lists the other engine\'s offset under every part (an analog part\'s 01 00 00, a digital part\'s 02 00 00); those are not laid out.',
    'The MIDI control parts 1-8 have a Part and a Zone block each and no tone or Part EQ.',
    'Six rows are printed with a range and no name: Analog Synth Tone Common 00 11 (0-1), 00 14 (0-2) and 00 16 (0-1) (p16); Analog Synth Tone Partial 00 0A and 00 16 (0-31) (p17) and 00 53 (14-114) (p18). '
      + 'They are kept, unnamed, so that a dump fills every byte the manual describes; in each block the first is <block>.value and the others <block>.value_<last two address bytes>.',
    'The manual\'s only worked DT1 example (p20) addresses 18 00 02 00 as Reverb Type, which its own Program Reverb table (p10) calls Reverb Switch; see examples in synths/jd-xa.mjs.',
  ],
};
