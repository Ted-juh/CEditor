// Groove Synthesis 3rd Wave: the NRPN parameters of its MIDI CC + SysEx Spec v2.0.

export default {
  id: 'groove-synthesis-3rd-wave',
  name: 'Groove Synthesis 3rd Wave',
  family: '3rd Wave',
  description: 'Groove Synthesis 3rd Wave wavetable synthesizer (24K keyboard, 24M and 8M desktop modules): every settable parameter of its MIDI spec\'s NRPN table, with its ranges and value lists.',
  document: { title: '3rd Wave MIDI CC + SysEx Spec v2.0 (v2a)', file: '3rdWave_MIDI_SPEC_v2a.pdf', url: 'https://groovesynthesis.com/support/ (3rd Wave MIDI SPEC, download resource 3321)' },
  pages: [18, 46],
  // NRPN 0's title is a sentence (`Sets the part you are editing for multi-part NRPN settings`).
  names: { 0: 'Edit part' },
  read: {
    table: { pages: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], header: /^NRPN Category Range Description/, columns: { category: 110, range: 180, description: 256 } },
    lists: { pages: [39, 40, 41, 42, 43, 44, 45, 46], headings: ['Mod Source values', 'Mod destination values', 'Analog waveform index values'] },
  },
};
