// Elektron Digitone II: the MIDI appendix of its user manual, OS 1.12,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-digitone-ii',
  name: 'Elektron Digitone II',
  family: 'Digitone',
  description: 'Elektron Digitone II FM synthesizer: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX control channels.',
  document: { title: 'Digitone II User Manual, OS 1.12', file: 'Digitone-2-User-Manual_ENG_OS1.12_261008.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Digitone-2-User-Manual_ENG_OS1.12_261008.pdf' },
  // The send effects, the mixer (compressor, external inputs) and the master overdrive: FX CONTROL CH,
  // which the manual says covers the delay, reverb, chorus and compressor pages and the master overdrive.
  // `VAL PARAMETERS`, a MIDI track's CC values: that track's channel.
  channels: [[/SEND FX|MIXER|Master Overdrive$/, 'fxChannel'], [/VAL PARAMETERS/, 'midiChannel']],
  // `Sustain Level 86`, between Decay Time 86 and Release Time 88, its NRPN (1:33) between theirs.
  // The manual titles its Euclidean sequencer table `AMP`, as it does its amp's.
  groups: { 'C.6 EUCLIDEAN SEQUENCER PARAMETERS / AMP': 'Euclidean Sequencer' },
  fix: { 'AMP Sustain Level': { cc: 87 } },
  variables: { fxChannel: 16, midiChannel: 9 },
  unprinted: ['fxChannel', 'midiChannel'],
  settingOf: {
    fxChannel: 'FX CONTROL CH (SETTINGS > MIDI CONFIG > CHANNELS)',
    midiChannel: 'MIDI track channel (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
