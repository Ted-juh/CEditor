// Elektron Analog Four: the MIDI appendix of its user manual, OS 1.56,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-analog-four',
  name: 'Elektron Analog Four',
  family: 'Analog Four',
  description: 'Elektron Analog Four four-voice analog synthesizer (MKI): every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the synth, FX, CV and performance channels.',
  document: { title: 'Analog Four User Manual, OS 1.56', file: 'Analog-Four-User-Manual_ENG_OS1.56_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Analog-Four-User-Manual_ENG_OS1.56_260930.pdf' },
  // The performance macros on PERF CHANNEL; the FX and CV tracks' parameters on those tracks' channels.
  channels: [[/PERFORMANCE/, 'perfChannel'], [/FX TRACK/, 'fxChannel'], [/CV TRACK/, 'cvChannel']],
  // The manual titles its track table `PERFORMANCE`, as it does the performance macros'.
  groups: { 'TRACK PARAMETERS / PERFORMANCE': 'Track' },
  variables: { fxChannel: 16, cvChannel: 14, perfChannel: 15 },
  unprinted: ['fxChannel', 'cvChannel', 'perfChannel'],
  settingOf: {
    fxChannel: 'FX track channel (GLOBAL SETTINGS > MIDI CONFIG > CHANNELS)',
    cvChannel: 'CV track channel (GLOBAL SETTINGS > MIDI CONFIG > CHANNELS)',
    perfChannel: 'PERF CHANNEL (GLOBAL SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
