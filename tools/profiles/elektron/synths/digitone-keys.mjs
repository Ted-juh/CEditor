// Elektron Digitone Keys: the MIDI appendix of its user manual, OS 1.44,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-digitone-keys',
  name: 'Elektron Digitone Keys',
  family: 'Digitone',
  description: 'Elektron Digitone Keys FM synthesizer (keyboard): every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX channels.',
  document: { title: 'Digitone Keys User Manual, OS 1.44', file: 'Digitone-Keys-User-Manual_ENG_OS1.44_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Digitone-Keys-User-Manual_ENG_OS1.44_260930.pdf' },
  // `B.8 FX PARAMETERS` (chorus, delay, reverb, master): the FX CHANNEL.
  // `B.7 MIDI TRACK PARAMETERS`, a MIDI track's CC values: that track's channel (MIDI 1–4 CHANNEL).
  channels: [[/FX PARAMETERS/, 'fxChannel'], [/MIDI TRACK PARAMETERS/, 'midiChannel']],
  variables: { fxChannel: 16, midiChannel: 9 },
  unprinted: ['fxChannel', 'midiChannel'],
  settingOf: {
    fxChannel: 'FX CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS)',
    midiChannel: 'MIDI 1–4 CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS), a MIDI track\'s,'
  },
};
