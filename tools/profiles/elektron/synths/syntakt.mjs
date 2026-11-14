// Elektron Syntakt: the MIDI appendix of its user manual, OS 1.42,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-syntakt',
  name: 'Elektron Syntakt',
  family: 'Syntakt',
  description: 'Elektron Syntakt drum computer and synthesizer: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX control channels.',
  document: { title: 'Syntakt User Manual, OS 1.42', file: 'Syntakt-User-Manual_ENG_OS1.42_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Syntakt-User-Manual_ENG_OS1.42_260930.pdf' },
  // The delay, reverb and external inputs, and the FX track: FX CONTROL CH, which the manual says is
  // the FX track's and the DELAY and REVERB pages'.
  // `VAL PARAMETERS`, a MIDI track's CC values: that track's channel.
  channels: [[/FX PARAMETERS|FX TRACK/, 'fxChannel'], [/VAL PARAMETERS/, 'midiChannel']],
  variables: { fxChannel: 16, midiChannel: 9 },
  unprinted: ['fxChannel', 'midiChannel'],
  settingOf: {
    fxChannel: 'FX CONTROL CH (SETTINGS > MIDI CONFIG > CHANNELS)',
    midiChannel: 'MIDI track channel (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
