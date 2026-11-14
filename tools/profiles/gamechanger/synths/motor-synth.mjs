// Gamechanger Audio Motor Synth (MKI): the NRPN map and MIDI SysEx pages of its user manual, with Pull
// from the sound and global parameter dumps they print.

export default {
  id: 'gamechanger-motor-synth',
  name: 'Gamechanger Audio Motor Synth (MKI)',
  family: 'Motor Synth',
  description: 'Gamechanger Audio Motor Synth, the first model: every sound and global parameter of its manual\'s NRPN map, with Pull from its sound and global parameter dumps.',
  documents: [
    { read: 'nrpn', title: 'Motor Synth MKI User Manual', file: 'MOTOR-SYNTH-MKI-MANUAL.pdf', url: 'https://gamechangeraudio.com/wp-content/uploads/2023/05/MOTOR-SYNTH-MKI-MANUAL.pdf', linkedFrom: 'https://gamechangeraudio.com/support/msmki/', pages: [143, 152] },
    { read: 'sysex', title: 'Motor Synth MKI User Manual', file: 'MOTOR-SYNTH-MKI-MANUAL.pdf', url: 'https://gamechangeraudio.com/wp-content/uploads/2023/05/MOTOR-SYNTH-MKI-MANUAL.pdf', linkedFrom: 'https://gamechangeraudio.com/support/msmki/', pages: [152, 155] },
  ],
};
