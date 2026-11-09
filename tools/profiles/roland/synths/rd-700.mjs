// The Roland RD-700 (2001): which parts of its address map make up the edit buffer, and what to call them.
//
// Source: the RD-700 Owner's Manual (RD-700_OM.pdf; maps/rd-700.json says which file, with its hash),
// whose MIDI Implementation chapter runs from p146 to p161 and prints "Model: RD-700 (Digital Piano),
// Date: Mar. 1, 2001, Version: 1.00" at its head (p146): Bank Select p146, Identity Reply and DT1
// p153, the Parameter Address Map pp153-157, the GS map pp157-158, the worked examples p160; the MIDI
// Implementation Chart is p162. Page numbers below are the owner's manual's.
//
// The address map (p153) is two areas, under the two-byte model ID 00 43:
//
//   00 00 00 00  System             common (with the One Touch Piano's tone and reverb level), and the
//                                   One Touch Piano's own piano settings
//   10 00 00 00  Setup (Temporary)  common, MFX, chorus, reverb; a Local Part (what each keyboard zone
//                                   plays) for Upper1, Upper2 and Lower; a MIDI Tx Part (what it sends
//                                   out) for those three and the Rhythm; sixteen Internal Parts (receive
//                                   channel, the patch by bank and program number, level, pan, MFX
//                                   switch, temperament), each with a Tone Backup (the setup's offsets
//                                   to that patch); and ten Tone Wheel Backups (harmonic bars and
//                                   percussion for the organ tones)
//
// That is the whole edit buffer, and all of it is laid out. The Setup offset table prints two-byte
// offsets (00 00 - 69 00), which add to 10 00 00 00 as usual. Nothing in it is a tone type a part
// may not hold: every Part has its Tone Backup, and the ten Tone Wheel Backups belong to the setup,
// not to a part. So nothing is kept out of the startup read.

const SETUP = 'Setup (Temporary)';
const two = (n) => String(n).padStart(2, '0');
const PARTS = Array.from({ length: 16 }, (unused, i) => i + 1);
const TONE_WHEELS = Array.from({ length: 10 }, (unused, i) => i + 1);

/** The offset table's zone names, with an id and a label. */
const ZONES = [['Upper1', 'upper1', 'Upper 1'], ['Upper2', 'upper2', 'Upper 2'], ['Lower', 'lower', 'Lower']];

export default {
  id: 'roland-rd-700',
  name: 'Roland RD-700',
  family: 'RD',
  map: 'rd-700',
  deviceId: 0x10,
  description: 'Roland RD-700 digital stage piano (2001): the system blocks and the temporary Setup — common, MFX, chorus, reverb, '
    + 'the Local and MIDI Tx Part of each keyboard zone, the sixteen Internal Parts with their tone settings, and the ten tone-wheel '
    + 'organ settings — from the MIDI Implementation chapter of the owner\'s manual.',

  // p153, Identity Reply Message: F0 7E dev 06 02 41 43 01 00 00 00 01 00 00 F7 — family code 43 01,
  // family number 00 00, revision 00 01 00 00. The message line and the byte table agree. The
  // RD-700GX (2B 02) and RD-300GX (2C 02) print other family codes; nothing collides.
  identity: { familyCode: ['43', '01'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    // The One Touch Piano's piano: stereo width, nuance, ambience, a one-band EQ.
    {
      id: 'system.oneTouchPiano',
      table: 'System Onetouch Piano Tone Backup',
      path: ['System', 'System Onetouch Piano Tone Backup'],
      group: 'System · One Touch Piano',
      strip: /^Piano\s+/,
      system: true,
    },

    { id: 'setup', table: 'Setup Common', path: [SETUP, 'Setup Common'], group: 'Setup', strip: /^Setup\s+/i },
    { id: 'setup.mfx', table: 'Setup Common MFX', path: [SETUP, 'Setup Common MFX'], group: 'Setup · MFX', strip: /^MFX\s+/ },
    { id: 'setup.chorus', table: 'Setup Common Chorus', path: [SETUP, 'Setup Common Chorus'], group: 'Setup · Chorus', strip: /^Chorus\s+/ },
    { id: 'setup.reverb', table: 'Setup Common Reverb', path: [SETUP, 'Setup Common Reverb'], group: 'Setup · Reverb', strip: /^Reverb\s+/ },

    // "Local Part Assign" reads partAssign.
    ...ZONES.map(([name, id, label]) => ({
      id: `${id}.local`, table: 'Setup Local Part', path: [SETUP, `Setup Local Part (${name})`], group: `${label} · Local Part`, strip: /^Local\s+/,
    })),
    // "Transmit Program Change#" carries a number sign, not a sharp: it reads transmitProgramChange.
    ...[...ZONES, ['Rhythm', 'rhythm', 'Rhythm']].map(([name, id, label]) => ({
      id: `${id}.midiTx`, table: 'Setup MIDI Tx Part', path: [SETUP, `Setup MIDI Tx Part (${name})`], group: `${label} · MIDI Tx Part`, strip: /\s*#$/,
    })),

    // "Part Level", "Part Pan", "Part MFX Switch" read level, pan, mfxSwitch; "Patch Program Change#"
    // reads patchProgramChange.
    ...PARTS.flatMap((n) => [
      { id: `part${n}`, table: 'Setup Internal Part', path: [SETUP, `Setup Internal Part (Part: ${two(n)})`], group: `Part ${n}`, strip: /^Part\s+|\s*#$/g },
      { id: `part${n}.tone`, table: 'Setup Tone Backup', path: [SETUP, `Setup Internal Part ${n} Tone Backup`], group: `Part ${n} · Tone` },
    ]),

    ...TONE_WHEELS.map((n) => ({
      id: `toneWheel${n}`, table: 'Setup VK Tone Backup', path: [SETUP, `Setup Tone Wheel ${n} Backup`], group: `Setup · Tone Wheel ${n}`,
    })),
  ],

  // p160, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting CHORUS TYPE
  // to DELAY (DT1)": Temporary Setup 10 00 00 00 + Chorus 04 00 + 00 00, DELAY = 02, checksum 6A —
  // "F0 41 10 00 43 12 10 00 04 00 02 6A F7". The diagram, the sum and the line agree with each other
  // and with the map. (Chorus Type prints no labels, 0 - 2; DELAY's 02 is the example's.) <Example2>
  // is an RQ1 for the whole temporary setup, 10 00 00 00 size 00 00 69 0B: F0 41 10 00 43 11 10 00 00
  // 00 00 00 69 0B 7C (its F7 is not printed).
  examples: [
    {
      name: 'Setting CHORUS TYPE of the temporary Setup to DELAY (DT1)',
      where: 'p160',
      parameter: 'setup.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 43 12 10 00 04 00 02 6A F7',
    },
  ],

  // p146, the Bank Select table: SETUP 085/000, program 001-100, and the One Touch Piano SETUP 085/064,
  // program 001. The other rows (GM patches 000-032, Rhythm Set 086/064, the tone categories 087/064-072,
  // SRX 092-093, GM2 120-121) select a Part's patch, which the Internal Part block sets by bank and
  // program number. Setups are recalled on the Setup Control Channel (System Common 00 05), which must
  // match the profile's channel.
  presets: {
    banks: [
      { id: 'setup', label: 'SETUP 001-100', role: 'user', writable: true, startSlot: 0, slotCount: 100, programBase: 0, bankMsb: 85, bankLsb: 0 },
      { id: 'one-touch-piano', label: 'One Touch Piano SETUP', role: 'factory', writable: false, startSlot: 100, slotCount: 1, programBase: 0, bankMsb: 85, bankLsb: 64 },
    ],
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    memories: 'not laid out: the Bulk Dump parameters\' Setup 001-100 (10 01 00 00 - 10 64 00 00, 00 00 05 6C each, p157), which are '
      + 'memory rather than edit buffer, and the SETUP Write command (F0 41 dev 00 43 12 7F 7F 7E ss nn sum F7, p157) that stores them',
    gs: 'not laid out: the GS address map (model ID 42H, pp157-158: System, Common, Part and Drum Setup parameters at 40 xx xx and '
      + '41 xx xx), which a GS DT1 reaches only while GM mode is on (p151); it is a second model ID, not this one',
    inboundControllers: 'not modelled: what the controllers, pedals and the Control Source transmit as CC (Data Transmission, p151-152) is not mapped yet',
  },
  notes: [
    'The map\'s cover metadata is empty (model, date, version null): the address map was read from the whole owner\'s manual. The MIDI '
      + 'Implementation chapter prints Model RD-700, Date Mar. 1, 2001, Version 1.00 at its head (p146) and on its chart (p162).',
    'The Setup offset table (p153) prints two-byte offsets (00 00 - 69 00) under Setup (Temporary) 10 00 00 00: Setup Common is '
      + '10 00 00 00, Setup Internal Part (Part: 01) 10 00 20 00, Setup Tone Wheel 10 Backup 10 00 69 00 — as p160 <Example2> confirms.',
    'Setup Tone Wheel 1-10 Backup (60 00 - 69 00, the "Setup VK Tone Backup" table) are ten organ settings that belong to the setup, '
      + 'not to a part; the manual does not say which ten tones they serve.',
    'The map also holds tables after the address map — the Bulk Dump parameters (Setup 001-100), the GS map\'s System, Common, Part and '
      + 'Drum Setup Parameter tables, and a decimal/hex table read as rows — none of which is this model ID\'s edit buffer.',
    'Setup Common prints <Reserved> at 00 50, 00 52, 00 55-00 57, 00 66-00 67 (p154); Setup Common MFX at 00 01-00 03; Setup MIDI Tx '
      + 'Part at 00 1A-00 1B (p156); System Common at 00 11 (p153). None is laid out.',
    'Printed names kept as printed: "Control Assgin" (Setup Common 00 3F), "Harmonic Bar 5-1/3" without its foot mark (Setup VK Tone '
      + 'Backup 00 03). Harmonic Bar Assign\'s footage list (Setup Common 00 6B-00 72) prints "16,5-1/3\',8\',4\',2-2/3\',|\'" with stray '
      + 'table rules and "16" and "1-3/5" without their foot marks; the labels are kept as the interpreter reads them. Its last row, UPPER1:OFF (00 72), prints the '
      + 'first line of the list only, so it stays a number 1 - 9.',
    'Chorus Type (0 - 2) and Reverb Type (0 - 4) print no labels (p155); p160 names Chorus Type 02 DELAY.',
  ],

  // The chapter's own head (p146): Model RD-700, Date Mar. 1, 2001, Version 1.00.
  manual: { model: 'RD-700', date: 'Mar. 1, 2001', version: '1.00' },
};
