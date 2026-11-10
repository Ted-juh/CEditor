// Elektron Analog Rytm MKII: the MIDI appendix of its user manual, OS 1.74,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-analog-rytm-mkii',
  name: 'Elektron Analog Rytm MKII',
  family: 'Analog Rytm',
  description: 'Elektron Analog Rytm MKII drum machine: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track, FX and performance channels, the machines\' parameters described on the synth parameters they set.',
  document: { title: 'Analog Rytm MKII User Manual, OS 1.74', file: 'Analog-Rytm-MKII-User-Manual_ENG_OS1.74_260930.pdf', url: 'https://www.elektron.se/wp-content/uploads/2026/10/Analog-Rytm-MKII-User-Manual_ENG_OS1.74_260930.pdf' },
  // The performance macros on PERF CHANNEL, the FX track's on its channel (TRACK 1–12, FX).
  channels: [[/PERFORMANCE/, 'perfChannel'], [/FX PARAMETERS/, 'fxChannel']],
  // `C.8 MACHINE PARAMETERS`: what Synth Parameter 1 - 8 (CC 16 - 23) set for each machine.
  meanings: /MACHINE PARAMETERS/,
  variables: { fxChannel: 16, perfChannel: 15 },
  unprinted: ['fxChannel', 'perfChannel'],
  settingOf: {
    fxChannel: 'FX track channel (SETTINGS > MIDI CONFIG > CHANNELS, TRACK 1–12, FX)',
    perfChannel: 'PERF CHANNEL (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
