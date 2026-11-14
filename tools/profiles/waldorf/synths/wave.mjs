// Waldorf Wave: its System Exclusive Description for operating system 1.400, laid out in full. Every
// byte of the Soundprogram (SBPR) with values is a parameter, sent as a Sound Parameter dump (SBPRPAR,
// `F0 3E 03 DEV 09 <instrument> <offset, two nibbles> <value> <CHK> F7`) to instrument 1; Pull asks for
// instrument 1's sound (RQBPR).

export default {
  id: 'waldorf-wave',
  name: 'Waldorf Wave',
  family: 'Wave',
  description: 'Waldorf Wave wavetable synthesizer, operating system 1.400: every sound parameter of its System Exclusive Description, sent to instrument 1\'s sound, with Pull of that sound.',
  document: { title: 'Waldorf Wave System Exclusive Description, operating system version 1.400 (21 September 1993)', file: 'Sysex Doc.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/ytFDr27HtKRYBia/download (Documentation EN/Sysex Doc.pdf in the zip)' },
  // `Format of Soundprogram`, to the modifier table, and that.
  read: { text: { table: { start: 'Format of Soundprogram', end: '^\\s*Modifier table:' }, lists: { modifiers: { start: '^\\s*Modifier table:', end: '^3\\.b\\)' } } } },
  messages: {
    equipment: '03',
    edit: '09',
    instrument: 0,
    dataFrom: 0,
    // LOCATION: instrument, bank, sound number.
    dump: { idm: '00', name: 'Soundprogram Dump (SBPR)', location: 3, size: 256 },
    request: { idm: '40', name: 'Soundprogram Dump Request (RQBPR), instrument 1', location: ['00'] },
  },
  rows: {
    // Printed `0: Amp, 1:Filter, 2: Wave, 1: Free`: the fourth envelope is 3.
    94: { values: '0: Amp, 1: Filter, 2: Wave, 3: Free' },
  },
  // Printed `Control mixer source 2` and `amount 2` twice: the second pair is the third.
  names: { 205: 'Control mixer source 3', 206: 'Control mixer amount 3' },
  groups: [
    [/^Oscillator (\d)/, 'Oscillator $1'],
    [/^Wavetable/, 'Waves'],
    [/^(?:Wave \d|Noise) volume/, 'Mixer'],
    [/^Wave envelope/, 'Wave Envelope'],
    [/^Wave (\d)/, 'Wave $1'],
    [/^Amplifier envelope/, 'Amplifier Envelope'],
    [/^Amplifier/, 'Amplifier'],
    [/^Filter envelope/, 'Filter Envelope'],
    [/^(Filter|Lowpass|Dual mode|Bandpass)/, 'Filter'],
    [/^Free envelope/, 'Free Envelope'],
    [/^Lfo (\d)/, 'LFO $1'],
    [/^Panning/, 'Panning'],
    [/^Control ramp/, 'Control Ramp'],
    [/^Control comparator/, 'Comparator'],
    [/^Control mixer/, 'Control Mixer'],
    [/^Control delay/, 'Control Delay'],
    [/^Control shaper/, 'Control Shaper'],
    [/^Sample & hold/, 'Sample & Hold'],
    [/^Aux/, 'Aux'],
    [/^Glide/, 'Glide'],
    [/^Name/, 'Sound'],
  ],
  notes: [
    'Parameters go to instrument 1\'s sound (instrument 0), and Pull reads that instrument\'s sound; the Wave\'s other seven instruments are not laid out.',
    'The Wave sends the same Sound Parameter dump (SBPRPAR) when a sound parameter is edited on its panel; CEditor reads those by byte.',
  ],
};
