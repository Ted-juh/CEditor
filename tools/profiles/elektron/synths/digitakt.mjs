// Elektron Digitakt: the MIDI appendix of its user manual, OS 1.54,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-digitakt',
  name: 'Elektron Digitakt',
  family: 'Digitakt',
  description: 'Elektron Digitakt drum computer and sampler: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX control channels.',
  document: { title: 'Digitakt User Manual, OS 1.54', file: 'Digitakt-User-Manual_ENG_OS1.54_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-User-Manual_ENG_OS1.54_260930.pdf' },
  // `B.7 FX PARAMETERS` (delay, reverb, compressor, external inputs): FX CONTROL CH. The manual names
  // its delay and reverb pages; the compressor and inputs share their NRPN MSB (2) and go with them.
  // `VAL PARAMETERS`, a MIDI track's CC values: that track's channel.
  channels: [[/FX PARAMETERS/, 'fxChannel'], [/VAL PARAMETERS/, 'midiChannel']],
  variables: { fxChannel: 16, midiChannel: 9 },
  unprinted: ['fxChannel', 'midiChannel'],
  settingOf: {
    fxChannel: 'FX CONTROL CH (SETTINGS > MIDI CONFIG > CHANNELS)',
    midiChannel: 'MIDI track channel (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
