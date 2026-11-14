// Elektron Analog Heat +FX: the MIDI appendix of its user manual, OS 1.01,
// every row laid out as the controller or NRPN it prints.

export default {
  id: 'elektron-analog-heat-fx',
  name: 'Elektron Analog Heat +FX',
  family: 'Analog Heat',
  description: 'Elektron Analog Heat +FX stereo analog sound processor with effects: every parameter of its manual\'s MIDI appendix, as the controllers and NRPNs it prints, on its MIDI channel.',
  document: { title: 'Analog Heat +FX User Manual, OS 1.01', file: 'Analog_Heat_FX_User_Manual_ENG_OS1.01_240325.pdf', url: 'https://www.elektron.se/wp-content/uploads/2024/09/Analog_Heat_FX_User_Manual_ENG_OS1.01_240325.pdf' },
  // `The following parameters CC values should be sent … on the midi channel set by MIDI CH FX`: the
  // effect blocks, NRPN MSB 2.
  channels: [[(r) => r.nrpn?.[0] === 2, 'fxChannel']],
  variables: { fxChannel: 16 },
  unprinted: ['fxChannel'],
  settingOf: {
    fxChannel: 'MIDI CH FX (SETTINGS > MIDI CONFIG > CHANNELS)',
  },
};
