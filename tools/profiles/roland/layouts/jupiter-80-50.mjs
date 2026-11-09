// The layout the JUPITER-80 and the JUPITER-50 share.
//
// Both are SuperNATURAL live-performance keyboards, and their MIDI Implementations print one
// address map, the JUPITER-50's a subset of the JUPITER-80's (JUPITER-80 MIDI Implementation 1.00
// p11-23; JUPITER-50 MIDI Implementation 1.00 p12-23). The temporary (edit-buffer) area is:
//
//   01 00 00 00  Setup                          which registration is selected, recorder, metronome
//   02 00 00 00  System                         common, controller; (JUPITER-80) a mastering EQ
//   10 00 00 00  Temporary Live Set (UPPER)     common, MFX 1-4, reverb, and for each of four layers
//                                               a Layer, a Tone Offset, a Tone Modify and a "Layer 2"
//                                               (the tone blender's destination settings);
//                                               (JUPITER-50) a "Common 2" with the MFX structure
//   11 00 00 00  Temporary Tone (UPPER Layer 1) … 11 20 00 00, 11 40 00 00, 11 60 00 00 (Layers 2-4)
//   12 00 00 00  Temporary Live Set (LOWER)     JUPITER-80 only: the same blocks again
//   13 00 00 00  Temporary Tone (LOWER Layer 1) JUPITER-80 only: … 13 20, 13 40, 13 60 00 00
//   14 00 00 00  Temporary Registration         common, one Part block per part, sixteen External
//                                               Parts, a Controller (held back: see
//                                               registrationControllerBlock), and for each tone
//                                               part (SOLO, PERC — the JUPITER-50's second is
//                                               PERC/LOWER) a Sub Part and a Sub Modify;
//                                               (JUPITER-80) a Sub Effect each and the Sub Reverb
//                                               they share
//
// The registration is the whole instrument's setup: which live set UPPER (and LOWER) play, which
// tone SOLO and PERC play, their levels and splits. A live set is a part's four-layer sound with
// its own effects. SOLO and PERC (and the JUPITER-50's PERC/LOWER) play a single tone, set up by
// the registration's Sub blocks; the address map gives them no temporary tone area at all.
//
// A layer's temporary tone holds one table, "Temporary Synth Tone" at +01 00 00: a SuperNATURAL
// Synth Tone, its common and three partials. A layer can also play a SuperNATURAL Acoustic Tone,
// which has no temporary area; what can be edited of it is the layer's Tone Modify block in the
// live set — a type the instrument sets from the tone (printed "read only") and 32 parameters whose
// meaning depends on it. So the tones laid out are UPPER's four synth tones, and the acoustic side
// is the four Tone Modify blocks, laid out with the live set.

const range = (from, to) => Array.from({ length: to - from + 1 }, (unused, i) => from + i);

export const LAYERS = range(1, 4);
export const EXT_PARTS = range(1, 16);

/** "Tone Modify Type (read only)", "Modify Parameter 1": the block names the first word already. */
const MODIFY = /^(?:Tone\s+)?Modify\s+|\s*\(read only\)/g;

/**
 * Setup and System. The JUPITER-80's System has a third block the JUPITER-50's does not: its offset
 * table calls it "System EQ" (p11), the parameter table laid there "System Mastering" (p12), and it
 * holds the Master EQ and the Song EQ.
 */
export function systemBlocks({ mastering }) {
  return [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    ...(mastering
      ? [{ id: 'system.mastering', table: 'System Mastering', path: ['System', 'System EQ'], group: 'System · Mastering EQ', system: true }]
      : []),
    { id: 'system.controller', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },
  ];
}

/**
 * A part's temporary live set: common (and on the JUPITER-50 its Common 2), the four MFX, the
 * reverb, then each layer's four blocks. `part` is the manual's word, UPPER or LOWER; ids use it
 * in lower case, so everything a part has — its live set, its layers, their tones, its
 * registration Part block — sits under `upper.` or `lower.`.
 */
export function liveSetBlocks(part, { common2 = false } = {}) {
  const root = `Temporary Live Set (${part})`;
  const id = part.toLowerCase();
  const label = `${part} Live Set`;
  return [
    { id: `${id}.liveSet`, table: 'Live Set Common', path: [root, 'Live Set Common'], group: label, strip: /^Live Set\s+/ },
    ...(common2
      ? [{ id: `${id}.liveSet2`, table: 'Live Set Common 2', path: [root, 'Live Set Common 2'], group: `${label} · Common 2` }]
      : []),
    ...[1, 2, 3, 4].map((n) => ({
      id: `${id}.mfx${n}`, table: 'Live Set MFX', path: [root, `Live Set MFX${n}`], group: `${label} · MFX ${n}`, strip: /^MFX\s+/,
    })),
    { id: `${id}.reverb`, table: 'Live Set Reverb', path: [root, 'Live Set Reverb'], group: `${label} · Reverb`, strip: /^Reverb\s+/ },
    ...LAYERS.flatMap((n) => [
      { id: `${id}.layer${n}`, table: 'Live Set Layer', path: [root, `Live Set Layer (Layer ${n})`], group: `${label} · Layer ${n}`, strip: /^Layer\s+/ },
      {
        id: `${id}.layer${n}.toneOffset`,
        table: 'Live Set Tone Offset',
        path: [root, `Live Set Tone Offset (Layer ${n})`],
        group: `${label} · Layer ${n} Tone Offset`,
        // "Layer Portamento Mode", "Pitch Env Depth Offset": the block says both already.
        strip: /^Layer\s+|\s+Offset$/g,
      },
      {
        id: `${id}.layer${n}.toneModify`,
        table: 'Live Set Tone Modify',
        path: [root, `Live Set Tone Modify (Layer ${n})`],
        group: `${label} · Layer ${n} Tone Modify`,
        strip: MODIFY,
      },
      // "Live Set Layer 2" (p16) holds only the tone blender's destination settings for the layer.
      {
        id: `${id}.layer${n}.toneBlender`,
        table: 'Live Set Layer 2',
        path: [root, `Live Set Layer 2 (Layer ${n})`],
        group: `${label} · Layer ${n} Tone Blender`,
        strip: /^Tone Blender Dest\s+/,
      },
    ]),
  ];
}

/**
 * A layer's temporary SuperNATURAL Synth Tone. The offset table names its entries "Synth Tone
 * Common" and "Synth Tone Partial (n)"; the parameter tables laid there are headed "Tone Common"
 * and "Tone Partial".
 */
export function synthToneBlocks(part, layer) {
  const at = (entry) => [`Temporary Tone (${part} Layer ${layer})`, 'Temporary Synth Tone', entry];
  const id = `${part.toLowerCase()}.layer${layer}.synthTone`;
  const label = `${part} Layer ${layer} · SN Synth Tone`;
  return [
    { id, table: 'Tone Common', path: at('Synth Tone Common'), group: label, strip: /^Tone\s+/ },
    ...[1, 2, 3].map((partial) => ({
      id: `${id}.partial${partial}`,
      table: 'Tone Partial',
      path: at(`Synth Tone Partial (${partial})`),
      group: `${label} · Partial ${partial}`,
    })),
  ];
}

/**
 * The temporary registration.
 *
 *   parts      [manual's name, id] for each Registration Part (<name>): the part's switch, which
 *              live set or tone it plays (bank select and program), level, pan, octave and which
 *              controllers reach it
 *   toneParts  [manual's name, id] for the parts that play a single tone (SOLO, PERC): each has a
 *              Sub Part (level, tuning, mono/poly, offsets, key and velocity range, receive
 *              switches) and a Sub Modify (its acoustic tone's modify parameters)
 *   subEffects (JUPITER-80) a Sub Effect per tone part — compressor, EQ, delay — and the one Sub
 *              Reverb they share
 */
export function registrationBlocks({ parts, toneParts, subEffects }) {
  const root = 'Temporary Registration';
  return [
    { id: 'registration', table: 'Registration Common', path: [root, 'Registration Common'], group: 'Registration', strip: /^Registration\s+/ },
    ...parts.map(([name, id]) => ({
      id: `${id}.part`, table: 'Registration Part', path: [root, `Registration Part (${name})`], group: `Registration · ${name} Part`, strip: /^Part\s+/,
    })),
    ...toneParts.flatMap(([name, id]) => [
      { id: `${id}.subPart`, table: 'Registration Sub Part', path: [root, `Registration Sub Part (${name})`], group: `Registration · ${name} Sub Part` },
      { id: `${id}.toneModify`, table: 'Registration Sub Modify', path: [root, `Registration Sub Modify (${name})`], group: `Registration · ${name} Tone Modify`, strip: MODIFY },
      ...(subEffects
        ? [{ id: `${id}.effect`, table: 'Registration Sub Effect', path: [root, `Registration Sub Effect (${name})`], group: `Registration · ${name} Effect` }]
        : []),
    ]),
    ...(subEffects
      ? [{ id: 'soloPerc.reverb', table: 'Registration Sub Reverb', path: [root, 'Registration Sub Reverb'], group: 'Registration · SOLO/PERC Reverb', strip: /^Reverb\s+/ }]
      : []),
    ...EXT_PARTS.map((n) => ({
      id: `registration.ext${n}`,
      table: 'Registration Ext Part',
      path: [root, `Registration Ext Part (Part ${n})`],
      group: `Registration · External Part ${n}`,
      strip: /^External\s+/,
    })),
    registrationControllerBlock,
  ];
}

/**
 * Registration Controller — transpose, octave, the LOWER and SOLO splits, harmony, the arpeggio,
 * the pedal, switch, D Beam and knob assigns, the live-set buttons, V-Link. One block of 308 bytes
 * at 14 00 30 00 (JUPITER-80 p18-20, JUPITER-50 p19-21), more than one packet, so the generator
 * requests it in two pieces: its parameters up to 01 7D, then V-Link Switch at 02 33, past 53
 * reserved bytes that neither piece asks for.
 */
export const registrationControllerBlock = {
  id: 'registration.controller',
  table: 'Registration Controller',
  path: ['Temporary Registration', 'Registration Controller'],
  group: 'Registration · Controller',
};

/**
 * p1, Bank Select: registrations are MSB 83, LSB 0 upward, 128 to a bank. `labels` are the
 * manual's NUMBER column for each LSB. The manual names no preset (ROM) registration bank.
 */
export const registrationPresets = (labels) => ({
  banks: labels.map((label, lsb) => ({
    id: `registration-${lsb + 1}`,
    label: `Registrations ${label}`,
    role: 'user',
    writable: true,
    startSlot: lsb * 128,
    slotCount: 128,
    programBase: 0,
    bankMsb: 83,
    bankLsb: lsb,
  })),
  recall: { kind: 'bankPc' },
});

/**
 * What both profiles say about themselves, apart from the per-synth addresses. `noReply` is the page
 * of the manual's RQ1 section ("If the conditions are not met, nothing is transmitted"), `controlChange`
 * the pages of its Control Change sections; the two manuals' page numbers differ by about one.
 */
export const sharedCoverage = ({ noReply, controlChange, controllerPages }) => ({
  registrationController: `laid out in two requests: Registration Controller (14 00 30 00, 308 bytes, ${controllerPages}) is more than `
    + 'one packet, so it is read as its parameters up to 01 7D and then V-Link Switch at 02 33, skipping 53 reserved bytes',
  toneTypes: 'a layer plays a SuperNATURAL Synth Tone or a SuperNATURAL Acoustic Tone. The address map gives a layer\'s temporary tone '
    + 'one area, Temporary Synth Tone (+01 00 00), laid out here; an acoustic tone has none, and is edited through the layer\'s Tone '
    + 'Modify block in the live set (laid out). The manual does not say the synth-tone area answers a request while its layer plays '
    + `an acoustic tone, and a request it cannot answer gets no reply (${noReply}), so the synth tones are read on request, not at connect`,
  effectParameterMeanings: 'type-dependent: MFX and reverb parameters are Roland\'s 4-nibble container (12768-52768, shown -20000..+20000); '
    + 'what each slot does depends on the selected type, which the MIDI Implementation does not list',
  toneModifyMeanings: 'type-dependent: Modify Parameter 1-32 (a layer\'s Tone Modify, and the tone parts\' Sub Modify) mean what the '
    + 'Tone Modify Type says, and the type is set by the acoustic tone the part plays; the MIDI Implementation does not list the types',
  inboundControllers: `not modelled: what the front panel transmits and what each CC changes are in the Control Change sections (${controlChange}), `
    + 'not the address map',
});

export const sharedNotes = [
  'Ids follow the parts. Everything of UPPER (its registration Part block, its live set, its layers and their tones) begins upper.; each '
    + 'tone part\'s registration blocks (Part, Sub Part, Sub Modify, Effect) begin with that part\'s name; the registration\'s own blocks with registration.',
  'The offset table names a layer tone\'s blocks "Synth Tone Common" and "Synth Tone Partial (n)"; the parameter tables laid at them are '
    + 'headed "Tone Common" and "Tone Partial", the only tables of that shape. Laid out as <part>.layer<n>.synthTone and '
    + '<part>.layer<n>.synthTone.partial<n>.',
  '"Live Set Layer 2" holds only the tone blender\'s destination settings (Tone Blender Dest Level, Pan, sends, Cutoff …), so it is laid '
    + 'out as <part>.layer<n>.toneBlender.',
  '"Tone Modify Type (read only)" (Live Set Tone Modify, Registration Sub Modify) is printed read only; the generator lays out every '
    + 'ranged row as writable, so it is writable here, and an instrument would presumably ignore the write.',
  'Six rows are printed with a range and no name, and keep the id the generator gives a nameless row: Live Set Common 00 3E and 00 40 '
    + '(0-1 each, between MFX4 Switch and Reverb Switch and after it), Live Set MFX 00 02 (0-127, after MFX Output Level), Live Set Layer '
    + '00 27 (0-127, after Layer Output Level) and 00 2A (0-2, after Layer Output Assign), and Registration Common 00 17 (0-127, after '
    + 'Registration Level). System Common 00 08 is printed with neither a name nor a range and is not laid out.',
  'Two names are misspelt in the manual and keep its spelling: "Control Padal 1 Assign Source" and "Control Padal 2 Assign Source" '
    + '(System Controller, beside "Control Pedal 1 Assign"), and "FILTER Env Sustatin Level Offset" (Live Set Tone Offset).',
  'The registration\'s program change is received on the Registration Control Channel (System Common 00 09, 1-16 or OFF), which need '
    + 'not be the channel UPPER plays on; the preset browser sends on the profile\'s channel, so set that to the registration channel.',
];
