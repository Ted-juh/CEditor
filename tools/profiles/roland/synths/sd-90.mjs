// The Roland SD-90 (Studio Canvas): which parts of its address map make up the edit buffer, and
// what to call them.
//
// Source: "SD-90 MIDI Implementation", version 1.02, December 12 2001 (maps/sd-90.json says which
// file, with its hash). Page numbers below are that document's. These are the addresses of the
// SD-90's native mode (Setup, "SD-90 Native ON"); its GS mode is addressed through model 42H.
//
// A GM2 sound module addresses parts, not a program, and the SD-90's temporary area is laid out
// that way (p7):
//
//   00 00 00 00  Setup                           the native-mode switch (receive only)
//   01 00 00 00  System                          common (master tune, key shift, level, control
//                                                sources) and EQ
//   02 00 00 00  Audio                           the audio interface's mixer and its AFX
//   10 00 00 00  Temporary Multitimbre           common, chorus, reverb, three MFX, a Part block
//                                                for each of the 32 parts (ports A and B) and a
//                                                MIDI block for each of the 32 channels
//   11 00 00 00  Temporary Patch/Rhythm (Multitimbre Mode Part 1)
//   11 20 00 00  Temporary Patch/Rhythm (Multitimbre Mode Part 2)   … and so on, 00 20 00 00 apart,
//   18 60 00 00  Temporary Patch/Rhythm (Multitimbre Mode Part 32)    to part 32
//
// and each part's temporary area holds what that part is playing, one of two kinds (p7):
//
//   + 00 00 00   Temporary Patch    common, chorus, reverb, MFX, the tone mix table, four tones
//   + 10 00 00   Temporary Rhythm   common, chorus, reverb, MFX, one rhythm tone per key, 21-108
//
// So "part 1's tone" here is part 1's temporary Patch or Rhythm set — a part plays one or the
// other, chosen by its bank (p1: MSB 120 and 104-107 are drum sets, the rest instruments). Both are
// laid out for part 1, kept out of the startup read; parts 2-32 are the same two areas at their own
// base, and `coverage` says where.

const N16 = Array.from({ length: 16 }, (unused, i) => i + 1);
const N32 = Array.from({ length: 32 }, (unused, i) => i + 1);

/** Part 1 is the only temporary Patch/Rhythm laid out; see `coverage.parts`. */
const PART = 1;
const AREA = (part) => `Temporary Patch/Rhythm (Multitimbre Mode Part ${part})`;

/**
 * Rhythm tones, one per key. The map has keys 21 to 108 — eighty-eight blocks of 142 parameters,
 * 12,496 on their own. Laid out: the General MIDI percussion keys, 35 (Acoustic Bass Drum) to 81
 * (Open Triangle), forty-seven of them, as the FA-06/07/08 profile does. `coverage` says where the
 * others are.
 */
const RHYTHM_KEYS = Array.from({ length: 47 }, (unused, i) => 35 + i);

const MFX = /^MFX\s+/;
const CHORUS = /^Chorus\s+/;
const REVERB = /^Reverb\s+/;

function temporaryPatch(part) {
  const at = (entry) => [AREA(part), 'Temporary Patch', entry];
  const id = `part${part}.patch`;
  const group = `Part ${part} · Patch`;
  return [
    { id: `${id}.common`, table: 'Patch Common', path: at('Patch Common'), group: `${group} · Common`, strip: /^Patch\s+/ },
    { id: `${id}.chorus`, table: 'Patch Common Chorus', path: at('Patch Common Chorus'), group: `${group} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: 'Patch Common Reverb', path: at('Patch Common Reverb'), group: `${group} · Reverb`, strip: REVERB },
    { id: `${id}.mfx`, table: 'Patch Common MFX', path: at('Patch Common MFX'), group: `${group} · MFX`, strip: MFX },
    { id: `${id}.tmt`, table: 'Patch TMT (Tone Mix Table)', path: at('Patch TMT (Tone Mix Table)'), group: `${group} · Tone Mix Table` },
    ...[1, 2, 3, 4].map((tone) => ({
      id: `${id}.tone${tone}`,
      table: 'Patch Tone',
      path: at(`Patch Tone (Tone ${tone})`),
      group: `${group} · Tone ${tone}`,
      strip: /^Tone\s+/,
    })),
  ];
}

function temporaryRhythm(part) {
  const at = (entry) => [AREA(part), 'Temporary Rhythm', entry];
  const id = `part${part}.rhythm`;
  const group = `Part ${part} · Rhythm`;
  return [
    { id: `${id}.common`, table: 'Rhythm Common', path: at('Rhythm Common'), group: `${group} · Common`, strip: /^Rhythm\s+/ },
    { id: `${id}.chorus`, table: 'Rhythm Common Chorus', path: at('Rhythm Common Chorus'), group: `${group} · Chorus`, strip: CHORUS },
    { id: `${id}.reverb`, table: 'Rhythm Common Reverb', path: at('Rhythm Common Reverb'), group: `${group} · Reverb`, strip: REVERB },
    { id: `${id}.mfx`, table: 'Rhythm Common MFX', path: at('Rhythm Common MFX'), group: `${group} · MFX`, strip: MFX },
    ...RHYTHM_KEYS.map((key) => ({
      id: `${id}.key${key}`,
      table: 'Rhythm Tone',
      path: at(`Rhythm Tone (Key # ${key})`),
      group: `${group} · Key ${key}`,
      strip: /^Tone\s+/,
    })),
  ];
}

/** Bank Select table (p1): MSB and group only; each is programs 1-128 (Program Change 00H-7FH). */
const SOUND_BANKS = [
  [121, 'GM2 Instrument'],
  [120, 'GM2 Drum Set'],
  [80, 'SD Special Set 1'],
  [81, 'SD Special Set 2'],
  [96, 'Classical Set'],
  [97, 'Contemporary Set'],
  [98, 'Solo Set'],
  [99, 'Enhanced Set'],
  [104, 'Classical Drum Set'],
  [105, 'Contemporary Drum Set'],
  [106, 'Solo Drum Set'],
  [107, 'Enhanced Drum Set'],
];

// "-- Receive Only --" is a note about the parameter, printed inside its name.
const RECEIVE_ONLY = /\s*--\s*Receive Only\s*--/;

export default {
  id: 'roland-sd-90',
  name: 'Roland SD-90',
  family: 'SD',
  map: 'sd-90',
  deviceId: 0x10,
  description: 'Roland SD-90 Studio Canvas (GM2 sound module and audio interface), native mode: the setup, system and '
    + 'audio blocks, the whole temporary Multitimbre with its 32 parts and 32 MIDI channels, and part 1\'s temporary '
    + 'Patch (four tones) and Rhythm set, from the MIDI Implementation.',

  // p6, Identity Reply. The byte table gives family code 48 01, family number 00 00, software
  // revision 00 00 00 00. The message line above it prints F0 7E dev 06 02 41 10 01 00 00 00 00
  // 00 00 F7 — family 10 01, the device id's 10H where the table has 48H. 48 01 is the reading that
  // tells this model apart (48H is its model id, 00 48), so it is the one used here.
  identity: { familyCode: ['48', '01'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', strip: RECEIVE_ONLY, system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', strip: /^System\s+/, system: true },
    { id: 'systemEq', table: 'System EQ', path: ['System', 'System EQ'], group: 'System · EQ', strip: /^EQ[-\s]+/, system: true },
    { id: 'audio', table: 'Audio Common', path: ['Audio', 'Audio Common'], group: 'Audio', system: true },
    { id: 'audioMixerPreset', table: 'Audio Common Mixer Preset Mode', path: ['Audio', 'Audio Common Mixer Preset Mode'], group: 'Audio · Mixer Preset', system: true },
    { id: 'audioMixer', table: 'Audio Common Mixer Free Edit Mode', path: ['Audio', 'Audio Common Mixer Free Edit Mode'], group: 'Audio · Mixer (Free Edit)', system: true },
    { id: 'afx', table: 'Audio Common AFX Parameter', path: ['Audio', 'Audio Common AFX Parameter'], group: 'Audio · AFX', strip: new RegExp(`^AFX\\s+|${RECEIVE_ONLY.source}`, 'g'), system: true },

    { id: 'multitimbre', table: 'Multitimbre Common', path: ['Temporary Multitimbre', 'Multitimbre Common'], group: 'Multitimbre', strip: /^Multitimbre\s+/ },
    { id: 'chorus', table: 'Multitimbre Common Chorus', path: ['Temporary Multitimbre', 'Multitimbre Common Chorus'], group: 'Multitimbre · Chorus', strip: CHORUS },
    { id: 'reverb', table: 'Multitimbre Common Reverb', path: ['Temporary Multitimbre', 'Multitimbre Common Reverb'], group: 'Multitimbre · Reverb', strip: REVERB },
    ...[1, 2, 3].map((n) => ({
      id: `mfx${n}`,
      table: 'Multitimbre Common MFX',
      path: ['Temporary Multitimbre', `Multitimbre Common MFX${n}`],
      group: `Multitimbre · MFX ${n}`,
      strip: MFX,
    })),
    // "Part Mono/Poly (MONO ON/POLY ON)": the bracket names the mode messages, as (CC# n) names a CC.
    ...N32.map((part) => ({
      id: `part${part}`,
      table: 'Multitimbre Part',
      path: ['Temporary Multitimbre', `Multitimbre Part (Part ${part})`],
      group: `Part ${part}`,
      strip: /^Part\s+|\s*\(MONO ON\/POLY ON\)/g,
    })),
    // The per-channel receive switches, phase lock and velocity curve: ports A and B, 16 channels each.
    ...['A', 'B'].flatMap((port) => N16.map((channel) => ({
      id: `midi.${port.toLowerCase()}${channel}`,
      table: 'Multitimbre MIDI',
      path: ['Temporary Multitimbre', `Multitimbre MIDI (Port ${port}/Channel ${channel})`],
      group: `Multitimbre · MIDI Port ${port} Ch ${channel}`,
    }))),

    ...temporaryPatch(PART),
    ...temporaryRhythm(PART),
  ],

  // None that can be checked. The manual prints two DT1 messages, and neither is one parameter set
  // to one value at the address its own tables give:
  //
  //   p19, <Example 1> "Setting CHORUS TYPE of MULTITIMBRE COMMON to DELAY": F0 41 10 00 48 12
  //   10 00 04 00 02 6A F7, reasoning that "the offset address of CHORUS at MULTITIMBRE COMMON is
  //   04 00H". The Multitimbre offset table (p7) puts Multitimbre Common Chorus at 00 02 00 and
  //   Multitimbre Common Reverb at 00 04 00, so the printed bytes set Reverb Type (to SRV-ROOM), not
  //   Chorus Type; from this layout chorus.type = 2 (DELAY) is F0 41 10 00 48 12 10 00 02 00 02 6C F7.
  //   Its model id bytes (00 48) and checksum agree with the tables; the offset does not.
  //
  //   p21, "The Scale Tune Feature": F0 41 10 00 48 12 10 00 20 33 3A 6D 3E 34 0D 38 6B 3C 6F 40 36
  //   0F 24 F7, part 1's Arabian scale. It agrees with the map — Part 1's Scale Tune for C at
  //   10 00 20 33, twelve values C to B, checksum 24 — but it writes twelve parameters in one
  //   message, and an example here is one parameter and one value.
  examples: [],
  examplesUnavailable: 'The only single-parameter DT1 example (p19, Chorus Type = DELAY) writes to 10 00 04 00, which the '
    + 'manual\'s own Multitimbre offset table (p7) gives to Multitimbre Common Reverb (Reverb Type); Chorus is at 00 02 00. '
    + 'The other printed DT1 (p21, part 1 Scale Tune C-B, 12 bytes at 10 00 20 33) agrees with the map but sets twelve '
    + 'parameters in one message, which an example (one parameter, one value) cannot state.',

  // p1, the Bank Select table: MSB and sound group only, programs 1-128 by Program Change. These are
  // a part's sounds (the SD-90 has no program-level memory); recall goes to the profile's channel,
  // which is part 1's by default (Receive Channel 1, port A). The table names no LSB: LSB 0 is each
  // group's capital set, and the variations at other LSBs are in the sound list, not here. The drum
  // groups (120, 104-107) hold kits at a few program numbers only, which the table does not list.
  presets: {
    banks: SOUND_BANKS.map(([msb, label], i) => ({
      id: `msb-${msb}`,
      label,
      role: 'factory',
      writable: false,
      startSlot: i * 128,
      slotCount: 128,
      programBase: 0,
      bankMsb: msb,
      bankLsb: 0,
    })),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    parts: 'the Multitimbre Part block and the MIDI block for all 32 parts/channels; the temporary Patch and Rhythm for '
      + 'Part 1 only. Parts 2-32\'s are not laid out: Temporary Patch/Rhythm (Multitimbre Mode Part n) is at '
      + '11 00 00 00 + (n-1) x 00 20 00 00 (11 20 00 00, 11 40 00 00, 11 60 00 00, 12 00 00 00 … 18 60 00 00), with the '
      + 'Patch at +00 00 00 and the Rhythm at +10 00 00 inside it',
    rhythmKeys: 'rhythm tones for keys 35-81 (the General MIDI percussion keys) only. The map has keys 21-108: Rhythm Tone '
      + '(Key # k) is at the part\'s area + 10 00 00 + 00 10 00 + (k-21) x 00 02 00, so for Part 1 keys 21-34 are at '
      + '11 10 10 00-11 10 2A 00 and keys 82-108 at 11 11 0A 00-11 11 3E 00; all eighty-eight would be 12,496 parameters',
    toneTypes: 'a part plays a Patch or a Rhythm set, never both; Part 1\'s two areas are both laid out at their addresses, '
      + 'and both are read on request rather than at connect, since a request the SD-90 cannot answer gets no reply (p5) '
      + 'and the startup read stops at the first one that times out',
    effectParameterMeanings: 'type-dependent: MFX, AFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: the Control Change, RPN and NRPN messages (p1-4) and the GS-mode (model 42H) addresses are not mapped',
  },
  notes: [
    'Model id 00 48: two bytes, as the prose (p5), the RQ1 and DT1 byte tables (p5, p6), the address map heading (p7) and '
      + 'every printed message (p19-21) give it.',
    'Identity Reply (p6): the byte table says family code 48H 01H; the message line prints 10H 01H. 48 01 is used.',
    'The p19 DT1 example sets 10 00 04 00 and calls it Chorus Type; the offset table (p7) makes that Reverb Type. '
      + 'Its RQ1 examples disagree with the tables too: <Example 2> gives Multitimbre Part a size of 00 00 00 31H where the '
      + 'table\'s Total Size is 00 00 00 40H (p11), and <Example 3> puts part 1\'s Temporary Patch at 11 20 00 00 and its '
      + 'Rhythm at 11 30 00 00, and part 32\'s at 14 60 00 00 / 14 70 00 00, where the address map has 11 00 00 00 / '
      + '11 10 00 00 and 18 60 00 00 / 18 70 00 00, and calls the rhythm keys "Rhythm Tone 1 … 4" (p20). The scale-tune text '
      + 'beside them names the SC-8820 (p21).',
    'Two parameters are marked "-- Receive Only --" in their names: Setup 00 00 (SD-90 Native ON, 0) and Audio Common AFX '
      + 'Parameter 00 01 (AFX Time out, 1-15). They are laid out as the map prints them; a dump may not carry a meaningful value for them.',
    'Most System, Audio, Multitimbre, Part and MIDI rows print a third line, "default: (wire) shown", under their display '
      + 'line (p7-p11). The map keeps it as part of the display text, so a choice\'s last label carries it ("ON default: (1) ON", '
      + 'choice id ondefault1on) and a printed range followed by it is not read as a range (Part Pan "L64 - 63R default:( 0) '
      + 'CENTER" stays a plain 0-127 number with that text as its description). Wire values and ranges are unaffected. '
      + 'Part Legato Switch and Part Portamento Switch (0-2) print a default of (64), outside their range.',
    'Printed names kept as printed: "Syhth Mute" (Audio Mixer, 00 32), "Part Vibrate Rate/Depth/Delay" (Multitimbre Part 00 22-00 24).',
  ],

  // Read on request, not at connect. Part 1 holds a Patch or a Rhythm set; the SD-90 does not answer
  // a request it cannot fill (p5), and the startup read stops at the first request that is not.
  noPull: [/^part1\.(patch|rhythm)(\.|$)/],
};
