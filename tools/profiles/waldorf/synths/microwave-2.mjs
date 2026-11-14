// Waldorf Microwave II, XT and XTk: the Microwave 2 System Exclusive Specifications, software release
// 2.16, laid out in full: every sound parameter (index 1 - 255, its offset in the sound dump) sent as a
// Sound Parameter Change to the Sound mode edit buffer, and Pull from that edit buffer. The Blofeld's
// specification is this one's descendant, and is read the same way (blofeld.mjs).

export default {
  id: 'waldorf-microwave-2',
  name: 'Waldorf Microwave II/XT',
  family: 'Microwave',
  description: 'Waldorf Microwave II, Microwave XT and XTk wavetable synthesizers: every sound parameter of their SysEx specification, sent to the Sound mode edit buffer, with Pull from that edit buffer.',
  document: { title: 'Microwave 2 System Exclusive Specifications, software release 2.16', file: 'mw2_XT_sysex.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/2BLZXbKrMw3x26N/download (Documentation EN/mw2_XT_sysex.pdf in the zip)' },
  // The value lists follow the sound data table, `3.11 Play Parameters` to `3.15 Filter 1 Types`.
  read: { lists: ['^3\\.11\\s', '^3\\.2\\s'] },
  // The specification names 188 - 190 `Modifier 3` again; they are the fourth modifier's, as the
  // rows' place after Modifier 3 (184 - 186) and the four modifiers of the Blofeld's table say.
  names: {
    188: 'Modifier 4 Source 1', 189: 'Modifier 4 Source 2', 190: 'Modifier 4 Type', 191: 'Modifier 4 Parameter',
    1: 'Osc 1 Octave', 12: 'Osc 2 Octave',
  },
  // `16-112 -4...+4 Osc 1 Octave in Steps of 12`: nine octaves, 16 to 112 by 12.
  choices: Object.fromEntries([1, 12].map((i) => [i, ['-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4'].map((label, k) => ({ value: 16 + 12 * k, label }))])),
  // `3.11 Play Parameters` prints `Value Index Parameter`: the label is the parameter, its index left off.
  listLabels: { '3.11': (label) => label.replace(/^\d+\s+/, '') },
  // A row the reader cannot split: the tab between value and name collapsed to a space.
  rows: { 84: { value: 'left 64-center-right 63', name: 'Panning' } },
  leaveOut: { 0: 'the sound format version (`currently 1`), not a setting' },
  noIdentity: 'its member code is a bitmask of the hardware fitted (00 00 a Microwave 2, 01 00 one with the XT mainboard, 03 00 a Microwave XT, more with expansions), and a profile takes one',
  groups: [
    [/^Osc (\d)/i, 'Oscillator $1'],
    [/^Mix /, 'Mixer'],
    [/^Glide/, 'Glide'],
    [/^Wave Key/, 'Wave Envelope'],
    [/^Panning/, 'Amplifier'],
    [/^(Aliasing|Time Quantization|Clipping|Accuracy|Allocation|Assignment|Detune|De-Pan)/, 'Common'],
    [/^Wave (\d)/, 'Wave $1'],
    [/^Wavetable/, 'Wavetable'],
    [/^Mixer/, 'Mixer'],
    [/^Filter (\d)/, 'Filter $1'],
    [/^(Amplifier|Amp )/, 'Amplifier'],
    [/^(Chorus|Delay|Effect|FX)/, 'Effect'],
    [/^LFO (\d)/, 'LFO $1'],
    [/^(Filter Env|FE )/, 'Filter Envelope'],
    [/^(Amp Env|AE )/, 'Amplifier Envelope'],
    [/^(Wave Env|WE )/, 'Wave Envelope'],
    [/^(Free Env|FrE )/, 'Free Envelope'],
    [/^Modifier (\d)/, 'Modifier $1'],
    [/^Modifier/, 'Modifiers'],
    [/^Mod (\d+)/, 'Modulation $1'],
    [/^(Arp|Arpeggiator)/, 'Arpeggiator'],
    [/^Play Parameter/, 'Play Parameters'],
    [/^(Name|Sound Name|Category)/, 'Sound'],
  ],
  // The spec's dump tables print the checksum as (BB+NN+SDATA)&7Fh, its general section says the IDs
  // are not counted, and Waldorf's own factory sounds settle it: of 2,017 sound dumps in the Microwave
  // II/XT downloads (fact9712, fact9806, fact2000-08 and the user sets), 2,000 carry the data's sum
  // alone and none (BB+NN+SDATA) where the two differ; the 7 edit buffer dumps among them, BB 20h, too
  // (tools/profiles/check-factory-banks.mjs; docs/device-profile-factory-banks.md).
  checksum: {
    over: ['SDATA'],
    request: '7F',
    because: 'The dump\'s checksum is the sound data\'s sum alone. The spec\'s dump tables print (BB+NN+SDATA)&7Fh, but its general section says the IDs are not counted, and Waldorf\'s own factory sounds have the data\'s sum: 2,000 of 2,017 sound dumps in the Microwave II/XT downloads, the edit buffer dumps among them, and none with the location counted where the two differ. The request sends 7F, which the spec says is always accepted, rather than choose between its (BB+NN) and the 00h its general section gives for a request with no data.',
  },
  notes: [
    'In Multi mode the same parameter change reaches instrument 1\'s sound (location 00); the other instruments (01 - 07) are not laid out.',
    'The multi, wave, wavetable, global and display messages are not laid out.',
    'Read through this profile, the sound sets Waldorf publishes for the Microwave II/XT (2,024 sound dumps: factory sets 9712, 9806 and 2000-08, and the user sets beside them) all match the sound dump and pass its checksum. Some hold values the spec does not list, presumably from later system software: modulation destinations 34 and 35 (525 times; the list stops at 33, Mod #4 Amount), Arpeggiator Tempo 0 (469; printed 1 - 127, extern and 50 - 300 BpM), oscillator octaves between the listed steps (136), filter types 10 - 12 (71) and chorus 2 and 3 (48). A Pull of such a sound shows the number.',
  ],
};
