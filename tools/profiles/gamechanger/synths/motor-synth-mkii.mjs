// Gamechanger Audio Motor Synth MKII: its NRPN map, with Pull from the sound and global parameter
// dumps its MIDI SysEx document prints. Both are linked from the web manual's MIDI page.

const PAGE = 'https://gamechangeraudio.com/msmkii-manual/midi/';
const UPLOADS = 'https://gamechangeraudio.com/wp-content/uploads/2023/04/';

export default {
  id: 'gamechanger-motor-synth-mkii',
  name: 'Gamechanger Audio Motor Synth MKII',
  family: 'Motor Synth',
  description: 'Gamechanger Audio Motor Synth MKII: every sound and global parameter of its NRPN map, with Pull from its sound and global parameter dumps.',
  documents: [
    { read: 'nrpn', title: 'Motor Synth MKII NRPN Map (last revised April 4, 2023)', file: 'MS-MKII-NRPN-MAP-_-APRIL-4-2023.pdf', url: `${UPLOADS}MS-MKII-NRPN-MAP-_-APRIL-4-2023.pdf`, linkedFrom: PAGE },
    { read: 'sysex', title: 'Motor Synth MKII MIDI SysEx (last revised April 4, 2023)', file: 'MS-MKII-MIDI-SYSEX-_-APRIL-4-2023.pdf', url: `${UPLOADS}MS-MKII-MIDI-SYSEX-_-APRIL-4-2023.pdf`, linkedFrom: PAGE },
  ],
};
