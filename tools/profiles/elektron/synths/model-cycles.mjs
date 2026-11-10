// Elektron Model:Cycles: the MIDI appendix of its user manual, OS 1.13,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-model-cycles',
  name: 'Elektron Model:Cycles',
  family: 'Model',
  description: 'Elektron Model:Cycles FM groovebox: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on the track and FX channels.',
  document: { title: 'Model:Cycles User Manual, OS 1.13', file: 'Model-Cycles-User-Manual_ENG_OS1.13_241030.pdf', url: 'https://www.elektron.se/wp-content/uploads/2024/10/Model-Cycles-User-Manual_ENG_OS1.13_241030.pdf' },
  // `A.4 FX PARAMETERS` (delay and reverb): FX IN, the channel the manual gives them.
  channels: [[/FX PARAMETERS/, 'fxChannel']],
  variables: { fxChannel: 16 },
  unprinted: ['fxChannel'],
  settingOf: {
    fxChannel: 'FX IN (SETTINGS > MIDI > CHANNELS)',
  },
};
