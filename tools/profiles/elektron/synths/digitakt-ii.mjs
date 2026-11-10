// Elektron Digitakt II: the MIDI appendix of its user manual, OS 1.17,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-digitakt-ii',
  name: 'Elektron Digitakt II',
  family: 'Digitakt',
  description: 'Elektron Digitakt II drum computer and sampler: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX control channels.',
  document: { title: 'Digitakt II User Manual, OS 1.17', file: 'Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf' },
  // The send effects, the mixer (compressor, external inputs) and the master overdrive: FX CONTROL CH,
  // which the manual says covers the delay, reverb, chorus and compressor pages and the master overdrive.
  // `VAL PARAMETERS`, a MIDI track's CC values: that track's channel.
  channels: [[/SEND FX|MIXER|Master Overdrive$/, 'fxChannel'], [/VAL PARAMETERS/, 'midiChannel']],
  // The manual titles its Euclidean sequencer and FX tables `AMP`, as it does its amp's.
  groups: { 'B.6 EUCLIDEAN SEQUENCER PARAMETERS / AMP': 'Euclidean Sequencer', 'B.7 FX PARAMETERS / AMP': 'FX' },
  variables: { fxChannel: 16, midiChannel: 9 },
  unprinted: ['fxChannel', 'midiChannel'],
  settingOf: {
    fxChannel: 'FX CONTROL CH (SETTINGS > MIDI CONFIG > CHANNELS)',
    midiChannel: 'MIDI track channel (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
